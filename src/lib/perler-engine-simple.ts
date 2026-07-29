// 拼豆图纸生成引擎 - 简化版
// 直接采样 AI 生成的像素图，不做复杂算法

import { MardColor, MARD_221_PALETTE, findNearestColor as findNearestColorFromPalette } from "./perler-engine";
import { floydSteinbergDither, autoMergeSimilarColors, filterNoiseColors } from "./perler-engine-dither";
import {
  createPerlerMetadata,
  embedMetadataToPNG,
  extractMetadataFromPNG,
  type PerlerMetadata,
} from "./png-metadata";

// 重新导出 MARD_221_PALETTE 和 MardColor 供页面使用
export { MARD_221_PALETTE };
export type { MardColor };

export interface ProcessOptions {
  gridSize?: number; // 长边目标格数，默认 50
  preserveTransparency?: boolean;
  useDithering?: boolean; // 是否使用抖动模式（精细模式）
}

export interface PerlerBead {
  row: number;
  col: number;
  color: MardColor;
  isEmpty: boolean;
}

export interface PerlerPattern {
  width: number;
  height: number;
  beads: PerlerBead[];
  colorStats: Record<string, number>; // 色号 -> 数量，用普通对象而非 Map
}

export interface RenderOptions {
  cellSize?: number;
  showGrid?: boolean;
  showColorCode?: boolean;
}

// 加载图片
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// 使用导入的 findNearestColor

// 颜色量化：将 RGB 值四舍五入到最近的量化级别
// 这样相近的颜色会被归为同一类，方便统计众数
function quantizeColor(r: number, g: number, b: number, levels: number = 8): string {
  const step = 256 / levels;
  const qr = Math.round(r / step) * step;
  const qg = Math.round(g / step) * step;
  const qb = Math.round(b / step) * step;
  return `${qr},${qg},${qb}`;
}

// 解析量化颜色字符串回 RGB
function parseQuantizedColor(quantized: string): [number, number, number] {
  const parts = quantized.split(",").map(Number);
  return [parts[0], parts[1], parts[2]];
}

// 主色池化：从指定区块中找出出现次数最多的颜色
// 支持非正方形区块（blockW × blockH）
// 支持 backgroundMap 来跳过背景像素
function getDominantColorFromBlock(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number,
  blockX: number,
  blockY: number,
  _blockSize: number,
  blockW?: number,
  blockH?: number,
  backgroundMap?: boolean[]
): { r: number; g: number; b: number; a: number; isEmpty: boolean } {
  const bw = blockW ?? _blockSize;
  const bh = blockH ?? _blockSize;

  // 统计量化颜色的出现次数
  const colorCounts = new Map<string, number>();
  let bgCount = 0;
  let totalPixels = 0;

  for (let dy = 0; dy < bh; dy++) {
    for (let dx = 0; dx < bw; dx++) {
      const px = blockX + dx;
      const py = blockY + dy;
      // 边界保护
      if (px >= imgWidth || py >= imgHeight) continue;
      const idx = py * imgWidth + px;
      const i = idx * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      totalPixels++;

      // 透明像素 = 背景
      if (a < 128) {
        bgCount++;
        continue;
      }

      // 使用 Flood Fill 背景图标记背景像素
      if (backgroundMap && backgroundMap[idx]) {
        bgCount++;
        continue;
      }

      // 量化颜色并统计
      const key = quantizeColor(r, g, b);
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }

  // 如果超过一半是背景，这个格子就是空的
  if (bgCount > totalPixels / 2) {
    return { r: 255, g: 255, b: 255, a: 0, isEmpty: true };
  }

  // 找到出现次数最多的颜色
  let maxCount = 0;
  let dominantKey = "";
  for (const [key, count] of colorCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantKey = key;
    }
  }

  if (!dominantKey) {
    return { r: 255, g: 255, b: 255, a: 0, isEmpty: true };
  }

  const [r, g, b] = parseQuantizedColor(dominantKey);
  return { r, g, b, a: 255, isEmpty: false };
}

// 检测背景色（从四个角采样）
// Flood Fill 背景检测
// 从四角开始填充，所有与角落颜色相连的相似像素 = 背景
// 不相连的像素 = 主体（即使颜色相同，如白色猫的白色身体）
function detectBackgroundByFloodFill(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number
): boolean[] {
  const totalPixels = imgWidth * imgHeight;
  const isBackground = new Uint8Array(totalPixels); // 0 = 未访问, 1 = 背景

  const getPixelColor = (x: number, y: number) => {
    const i = (y * imgWidth + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };

  const colorsSimilar = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
    return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) < 30;
  };

  const floodFill = (startX: number, startY: number) => {
    const startColor = getPixelColor(startX, startY);
    if (startColor.a < 128) return; // 透明角落，跳过

    const stack: [number, number][] = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const idx = y * imgWidth + x;

      if (isBackground[idx]) continue;

      const color = getPixelColor(x, y);

      // 透明像素 = 背景
      if (color.a < 128) {
        isBackground[idx] = 1;
        continue;
      }

      // 颜色不相似，不是背景
      if (!colorsSimilar(color.r, color.g, color.b, startColor.r, startColor.g, startColor.b)) {
        continue;
      }

      // 标记为背景
      isBackground[idx] = 1;

      // 添加相邻像素
      if (x > 0) stack.push([x - 1, y]);
      if (x < imgWidth - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < imgHeight - 1) stack.push([x, y + 1]);
    }
  };

  // 从 4 个角落开始 Flood Fill
  floodFill(0, 0);
  floodFill(imgWidth - 1, 0);
  floodFill(0, imgHeight - 1);
  floodFill(imgWidth - 1, imgHeight - 1);

  return Array.from(isBackground).map(v => v === 1);
}

// 检测主体的边界框（bounding box）
// 使用 Flood Fill 标记背景，然后找非背景像素的边界
function detectSubjectBounds(
  data: Uint8ClampedArray,
  imgWidth: number,
  imgHeight: number
): { minX: number; minY: number; maxX: number; maxY: number; bgColor: { r: number; g: number; b: number } | null; backgroundMap: boolean[] } {
  const backgroundMap = detectBackgroundByFloodFill(data, imgWidth, imgHeight);

  // 获取背景色（从左上角）
  let bgColor: { r: number; g: number; b: number } | null = null;
  if (backgroundMap[0] && data[3] >= 128) {
    bgColor = { r: data[0], g: data[1], b: data[2] };
  }

  let minX = imgWidth;
  let minY = imgHeight;
  let maxX = 0;
  let maxY = 0;
  let foundAny = false;

  for (let y = 0; y < imgHeight; y++) {
    for (let x = 0; x < imgWidth; x++) {
      const idx = y * imgWidth + x;
      if (!backgroundMap[idx]) {
        // 非背景像素 = 主体
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        foundAny = true;
      }
    }
  }

  if (!foundAny) {
    return { minX: 0, minY: 0, maxX: imgWidth - 1, maxY: imgHeight - 1, bgColor, backgroundMap };
  }

  return { minX, minY, maxX, maxY, bgColor, backgroundMap };
}

// 主处理函数：主体裁剪 + 自适应网格 + 主色池化/抖动
export async function processImage(
  imageUrl: string,
  options: ProcessOptions = {}
): Promise<PerlerPattern> {
  const { preserveTransparency = true, gridSize = 50, useDithering = false } = options;

  // 加载图片
  const img = await loadImage(imageUrl);

  // 第一步：在完整分辨率下获取像素数据（保持原始宽高比）
  const MAX_SRC_SIZE = 256;
  const scale = Math.min(MAX_SRC_SIZE / img.width, MAX_SRC_SIZE / img.height);
  const srcWidth = Math.round(img.width * scale);
  const srcHeight = Math.round(img.height * scale);
  
  const canvas = document.createElement("canvas");
  canvas.width = srcWidth;
  canvas.height = srcHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, srcWidth, srcHeight);
  const fullImageData = ctx.getImageData(0, 0, srcWidth, srcHeight);
  const data = fullImageData.data;

  // 第二步：根据模式决定是否检测主体
  let cropMinX = 0;
  let cropMinY = 0;
  let cropWidth = srcWidth;
  let cropHeight = srcHeight;
  let backgroundMap: boolean[] = new Array(srcWidth * srcHeight).fill(false);

  if (!useDithering) {
    // 标准模式：检测主体边界框和背景色
    const bounds = detectSubjectBounds(data, srcWidth, srcHeight);
    backgroundMap = bounds.backgroundMap;
    const subjectWidth = bounds.maxX - bounds.minX + 1;
    const subjectHeight = bounds.maxY - bounds.minY + 1;

    // 添加少量边距（主体的 5%，让轮廓不被裁切）
    const padding = Math.max(2, Math.round(Math.max(subjectWidth, subjectHeight) * 0.05));
    cropMinX = Math.max(0, bounds.minX - padding);
    cropMinY = Math.max(0, bounds.minY - padding);
    const cropMaxX = Math.min(srcWidth - 1, bounds.maxX + padding);
    const cropMaxY = Math.min(srcHeight - 1, bounds.maxY + padding);
    cropWidth = cropMaxX - cropMinX + 1;
    cropHeight = cropMaxY - cropMinY + 1;

    console.log('[PerlerEngine] 主体检测:', {
      bounds: { minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: bounds.maxY },
      subjectSize: `${subjectWidth}×${subjectHeight}`,
      cropSize: `${cropWidth}×${cropHeight}`,
    });
  } else {
    // 抖动模式（直接像素化）：使用整张图片，不做主体检测
    console.log('[PerlerEngine] 直接像素化模式，使用整张图片:', {
      imageSize: `${srcWidth}×${srcHeight}`,
    });
  }

  // 第三步：根据裁剪后尺寸计算网格
  // 长边格数由 gridSize 参数控制（默认 50）
  const MAX_BEADS_LONG_SIDE = gridSize;
  const longSide = Math.max(cropWidth, cropHeight);
  const shortSide = Math.min(cropWidth, cropHeight);
  const gridScale = MAX_BEADS_LONG_SIDE / longSide;

  // 网格尺寸（按宽高比，长边 gridSize 格，短边按比例）
  let gridWidth: number;
  let gridHeight: number;
  if (cropWidth >= cropHeight) {
    gridWidth = MAX_BEADS_LONG_SIDE;
    gridHeight = Math.max(1, Math.round(shortSide * gridScale));
  } else {
    gridHeight = MAX_BEADS_LONG_SIDE;
    gridWidth = Math.max(1, Math.round(shortSide * gridScale));
  }

  console.log('[PerlerEngine] 网格尺寸:', {
    gridSize: `${gridWidth}×${gridHeight}`,
    mode: useDithering ? '抖动模式（直接像素化）' : '标准模式（主体裁剪）',
  });

  // 第四步：根据模式处理
  if (useDithering) {
    // 抖动模式：缩小到网格尺寸 → Floyd-Steinberg 抖动 → 后处理
    return processWithDithering(
      data, srcWidth, srcHeight,
      cropMinX, cropMinY, cropWidth, cropHeight,
      gridWidth, gridHeight,
      backgroundMap, preserveTransparency
    );
  } else {
    // 标准模式：逐区块采样，使用主色池化
    return processWithPooling(
      data, srcWidth, srcHeight,
      cropMinX, cropMinY, cropWidth, cropHeight,
      gridWidth, gridHeight,
      backgroundMap, preserveTransparency
    );
  }
}

// 标准模式：主色池化
function processWithPooling(
  data: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  cropMinX: number,
  cropMinY: number,
  cropWidth: number,
  cropHeight: number,
  gridWidth: number,
  gridHeight: number,
  backgroundMap: boolean[],
  preserveTransparency: boolean
): PerlerPattern {
  const blockSizeX = cropWidth / gridWidth;
  const blockSizeY = cropHeight / gridHeight;

  const beads: PerlerBead[] = [];
  const colorStats: Record<string, number> = {};

  for (let py = 0; py < gridHeight; py++) {
    for (let px = 0; px < gridWidth; px++) {
      // 计算当前格子在裁剪区域内的像素范围
      const blockStartX = cropMinX + Math.floor(px * blockSizeX);
      const blockStartY = cropMinY + Math.floor(py * blockSizeY);
      const blockEndX = cropMinX + Math.floor((px + 1) * blockSizeX);
      const blockEndY = cropMinY + Math.floor((py + 1) * blockSizeY);
      const bw = blockEndX - blockStartX;
      const bh = blockEndY - blockStartY;

      const dominant = getDominantColorFromBlock(
        data, srcWidth, srcHeight, blockStartX, blockStartY, Math.max(bw, bh),
        bw, bh, backgroundMap
      );

      if (dominant.isEmpty || (preserveTransparency && dominant.a < 128)) {
        beads.push({ row: py, col: px, color: MARD_221_PALETTE[0], isEmpty: true });
        continue;
      }

      // 匹配到最近的 MARD 色
      const color = findNearestColorFromPalette(dominant.r, dominant.g, dominant.b, MARD_221_PALETTE);
      beads.push({ row: py, col: px, color, isEmpty: false });

      const code = color.code;
      colorStats[code] = (colorStats[code] || 0) + 1;
    }
  }

  console.log('[PerlerEngine] 处理完成 (标准模式):', {
    gridSize: `${gridWidth}×${gridHeight}`,
    beadCount: beads.filter(b => !b.isEmpty).length,
    colorCount: Object.keys(colorStats).length,
  });

  return {
    width: gridWidth,
    height: gridHeight,
    beads,
    colorStats,
  };
}

// 抖动模式：Floyd-Steinberg + 后处理
function processWithDithering(
  data: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  cropMinX: number,
  cropMinY: number,
  cropWidth: number,
  cropHeight: number,
  gridWidth: number,
  gridHeight: number,
  backgroundMap: boolean[],
  preserveTransparency: boolean
): PerlerPattern {
  // 1. 缩小到网格尺寸（最近邻插值）+ 同步采样背景映射
  const pixels: Array<{ r: number; g: number; b: number; a: number }> = [];
  const gridBackgroundMap: boolean[] = [];
  const blockSizeX = cropWidth / gridWidth;
  const blockSizeY = cropHeight / gridHeight;

  for (let py = 0; py < gridHeight; py++) {
    for (let px = 0; px < gridWidth; px++) {
      const sampleX = cropMinX + Math.floor(px * blockSizeX + blockSizeX / 2);
      const sampleY = cropMinY + Math.floor(py * blockSizeY + blockSizeY / 2);

      // 边界保护
      const clampedX = Math.max(0, Math.min(srcWidth - 1, sampleX));
      const clampedY = Math.max(0, Math.min(srcHeight - 1, sampleY));

      const idx = clampedY * srcWidth + clampedX;
      const i = idx * 4;
      pixels.push({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3],
      });
      // 同步采样背景映射
      gridBackgroundMap.push(backgroundMap[idx]);
    }
  }

  // 2. Floyd-Steinberg 抖动（MARD 色卡约束）
  const ditheredPixels = floydSteinbergDither(pixels, gridWidth, gridHeight, MARD_221_PALETTE, gridBackgroundMap);

  // 3. 杂色过滤（用量 ≤ 3 的合并到主色）
  const filteredPixels = filterNoiseColors(ditheredPixels, MARD_221_PALETTE, 3);

  // 4. 自动合并相似色（色差 < 25 的合并）
  const mergedPixels = autoMergeSimilarColors(filteredPixels, MARD_221_PALETTE, 25);

  // 5. 转换为 PerlerBead 格式
  const beads: PerlerBead[] = [];
  const colorStats: Record<string, number> = {};

  for (let py = 0; py < gridHeight; py++) {
    for (let px = 0; px < gridWidth; px++) {
      const idx = py * gridWidth + px;
      const pixel = mergedPixels[idx];

      if (pixel.a < 128 || (preserveTransparency && pixel.a < 128)) {
        beads.push({ row: py, col: px, color: MARD_221_PALETTE[0], isEmpty: true });
        continue;
      }

      const color = findNearestColorFromPalette(pixel.r, pixel.g, pixel.b, MARD_221_PALETTE);
      beads.push({ row: py, col: px, color, isEmpty: false });

      const code = color.code;
      colorStats[code] = (colorStats[code] || 0) + 1;
    }
  }

  console.log('[PerlerEngine] 处理完成 (抖动模式):', {
    gridSize: `${gridWidth}×${gridHeight}`,
    beadCount: beads.filter(b => !b.isEmpty).length,
    colorCount: Object.keys(colorStats).length,
  });

  return {
    width: gridWidth,
    height: gridHeight,
    beads,
    colorStats,
  };
}

// 渲染图纸到 canvas
export function renderPattern(
  pattern: PerlerPattern,
  canvas: HTMLCanvasElement,
  options: RenderOptions = {}
): void {
  const { cellSize = 12, showGrid = true, showColorCode = false } = options;

  const padding = 20;
  const topPadding = 40;
  const leftPadding = 40;

  canvas.width = pattern.width * cellSize + leftPadding + padding;
  canvas.height = pattern.height * cellSize + topPadding + padding;

  const ctx = canvas.getContext("2d")!;

  // 白色背景
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 绘制拼豆格子
  for (const bead of pattern.beads) {
    const x = leftPadding + bead.col * cellSize;
    const y = topPadding + bead.row * cellSize;

    if (bead.isEmpty) {
      ctx.fillStyle = "#F5F5F5";
      ctx.fillRect(x, y, cellSize, cellSize);
    } else {
      ctx.fillStyle = bead.color.hex;
      ctx.fillRect(x, y, cellSize, cellSize);

      // 绘制色号
      if (showColorCode && cellSize >= 10) {
        // 根据背景色亮度选择文字颜色（解析 hex）
        const hex = bead.color.hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        ctx.fillStyle = brightness > 128 ? "#000000" : "#FFFFFF";
        ctx.font = `bold ${Math.max(7, Math.floor(cellSize * 0.35))}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          bead.color.code,
          x + cellSize / 2,
          y + cellSize / 2
        );
      }
    }

    // 格子边框
    if (showGrid) {
      ctx.strokeStyle = "#E0E0E0";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cellSize, cellSize);
    }
  }

  // 每 5 格加粗线
  if (showGrid) {
    ctx.strokeStyle = "#999999";
    ctx.lineWidth = 1;
    for (let x = 0; x <= pattern.width; x += 5) {
      ctx.beginPath();
      ctx.moveTo(leftPadding + x * cellSize, topPadding);
      ctx.lineTo(leftPadding + x * cellSize, topPadding + pattern.height * cellSize);
      ctx.stroke();
    }
    for (let y = 0; y <= pattern.height; y += 5) {
      ctx.beginPath();
      ctx.moveTo(leftPadding, topPadding + y * cellSize);
      ctx.lineTo(leftPadding + pattern.width * cellSize, topPadding + y * cellSize);
      ctx.stroke();
    }
  }

  // 顶部坐标
  ctx.fillStyle = "#7A756E";
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  for (let x = 0; x < pattern.width; x++) {
    if ((x + 1) % 5 === 0 || x === 0) {
      ctx.fillText(
        String(x + 1),
        leftPadding + x * cellSize + cellSize / 2,
        topPadding - 8
      );
    }
  }

  // 左侧坐标
  ctx.textAlign = "right";
  for (let y = 0; y < pattern.height; y++) {
    if ((y + 1) % 5 === 0 || y === 0) {
      ctx.fillText(
        String(y + 1),
        leftPadding - 8,
        topPadding + y * cellSize + cellSize / 2 + 3
      );
    }
  }
}

// 生成图纸图片（返回 dataURL）
export function generatePatternImage(
  pattern: PerlerPattern,
  cellSize: number = 20,
  showColorCode: boolean = true
): string {
  const canvas = document.createElement("canvas");
  const padding = 40;
  const topPadding = 60;
  const leftPadding = 60;

  // 计算色号清单所需高度和宽度
  const colorCount = Object.keys(pattern.colorStats).length;
  const legendMaxPerRow = 8;
  const colorRows = Math.ceil(colorCount / legendMaxPerRow);
  const colorListHeight = colorRows > 0 ? 30 + colorRows * 40 + 20 : 0;
  const colorListWidth = legendMaxPerRow * 100; // 每行最多 8 个，每个 100px

  canvas.width = Math.max(pattern.width * cellSize + leftPadding + padding, colorListWidth + leftPadding + padding);
  canvas.height = pattern.height * cellSize + topPadding + padding + colorListHeight;

  const ctx = canvas.getContext("2d")!;

  // 白色背景
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 标题
  ctx.fillStyle = "#2D2A26";
  ctx.font = "bold 16px 'Press Start 2P', monospace";
  ctx.textAlign = "center";
  ctx.fillText(
    `拼豆图纸 ${pattern.width}×${pattern.height}`,
    canvas.width / 2,
    30
  );

  // 绘制网格坐标
  ctx.fillStyle = "#7A756E";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";

  for (let x = 0; x < pattern.width; x++) {
    if ((x + 1) % 5 === 0 || x === 0) {
      ctx.fillText(
        String(x + 1),
        leftPadding + x * cellSize + cellSize / 2,
        topPadding - 10
      );
    }
  }

  ctx.textAlign = "right";
  for (let y = 0; y < pattern.height; y++) {
    if ((y + 1) % 5 === 0 || y === 0) {
      ctx.fillText(
        String(y + 1),
        leftPadding - 10,
        topPadding + y * cellSize + cellSize / 2 + 4
      );
    }
  }

  // 绘制拼豆格子
  for (const bead of pattern.beads) {
    const x = leftPadding + bead.col * cellSize;
    const y = topPadding + bead.row * cellSize;

    if (bead.isEmpty) {
      ctx.fillStyle = "#F5F5F5";
      ctx.fillRect(x, y, cellSize, cellSize);
    } else {
      ctx.fillStyle = bead.color.hex;
      ctx.fillRect(x, y, cellSize, cellSize);

      // 绘制色号
      if (showColorCode && cellSize >= 16) {
        // 根据背景色亮度选择文字颜色
        const hex = bead.color.hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        ctx.fillStyle = brightness > 128 ? "#000000" : "#FFFFFF";
        ctx.font = `bold ${Math.max(8, Math.floor(cellSize * 0.4))}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          bead.color.code,
          x + cellSize / 2,
          y + cellSize / 2
        );
      }
    }

    ctx.strokeStyle = "#E0E0E0";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x, y, cellSize, cellSize);
  }

  // 每 5 格加粗线
  ctx.strokeStyle = "#999999";
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= pattern.width; x += 5) {
    ctx.beginPath();
    ctx.moveTo(leftPadding + x * cellSize, topPadding);
    ctx.lineTo(leftPadding + x * cellSize, topPadding + pattern.height * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= pattern.height; y += 5) {
    ctx.beginPath();
    ctx.moveTo(leftPadding, topPadding + y * cellSize);
    ctx.lineTo(leftPadding + pattern.width * cellSize, topPadding + y * cellSize);
    ctx.stroke();
  }

  // 底部色号清单
  const sortedColors = Object.entries(pattern.colorStats)
    .sort((a, b) => b[1] - a[1]);

  const legendY = topPadding + pattern.height * cellSize + 30;
  ctx.fillStyle = "#2D2A26";
  ctx.font = "bold 14px 'Press Start 2P', monospace";
  ctx.textAlign = "left";
  ctx.fillText("色号清单:", leftPadding, legendY);

  let legendX = leftPadding;
  let legendRow = 0;
  const maxPerRow = 8;
  const sampleSize = 24;

  for (const [code, count] of sortedColors) {
    const color = MARD_221_PALETTE.find((c) => c.code === code);
    if (!color) continue;

    const col = legendRow % maxPerRow;
    const row = Math.floor(legendRow / maxPerRow);

    const x = leftPadding + col * 100;
    const y = legendY + 20 + row * 40;

    ctx.fillStyle = color.hex;
    ctx.fillRect(x, y, sampleSize, sampleSize);
    ctx.strokeStyle = "#CCCCCC";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, sampleSize, sampleSize);

    ctx.fillStyle = "#2D2A26";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`${code} ×${count}`, x + sampleSize + 4, y + 16);

    legendRow++;
  }

  // 返回 dataURL
  return canvas.toDataURL("image/png");
}

// 准备图纸图片（嵌入元数据）
// 返回图片 data URL，由调用方决定如何展示（预览/下载/分享）
export async function preparePatternImage(
  pattern: PerlerPattern,
  cellSize: number = 20,
  showColorCode: boolean = true
): Promise<string> {
  const dataURL = generatePatternImage(pattern, cellSize, showColorCode);

  // 创建元数据（只存储色号序列）
  const beads: string[] = [];
  for (let row = 0; row < pattern.height; row++) {
    for (let col = 0; col < pattern.width; col++) {
      const bead = pattern.beads.find(b => b.row === row && b.col === col);
      const colorCode = bead?.color?.code || "";
      beads.push(colorCode);
    }
  }

  const metadata = createPerlerMetadata(pattern.width, pattern.height, beads);

  // 嵌入元数据到 PNG
  const pngWithMetadata = await embedMetadataToPNG(dataURL, metadata);

  return pngWithMetadata;
}

// 导出色号清单 CSV
export function downloadColorList(pattern: PerlerPattern): void {
  const sortedColors = Object.entries(pattern.colorStats)
    .sort((a, b) => b[1] - a[1]);

  let csv = "色号，颜色名称，HEX,数量\n";
  for (const [code, count] of sortedColors) {
    const color = MARD_221_PALETTE.find((c) => c.code === code);
    if (color) {
      csv += `${color.code},${color.name},${color.hex},${count}\n`;
    }
  }

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.download = `perler-colors-${pattern.width}x${pattern.height}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
}

// 智能推荐网格尺寸（简化版）
export function recommendGridSize(imageUrl: string): Promise<number> {
  return loadImage(imageUrl).then((img) => {
    // 固定返回 40，适合 AI 生成的像素图
    return 40;
  });
}
