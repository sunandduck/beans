// 拼豆图纸生成引擎 - 抖动模式
// 使用 Floyd-Steinberg 误差扩散抖动 + MARD 色卡约束

import { MardColor, MARD_221_PALETTE, findNearestColor } from "./perler-engine";

// 像素数据结构
interface Pixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Floyd-Steinberg 抖动矩阵
// 当前像素误差分配：
//        [当前]  7/16
//  3/16  5/16  1/16
const FS_MATRIX = [
  { dx: 1, dy: 0, factor: 7 / 16 },
  { dx: -1, dy: 1, factor: 3 / 16 },
  { dx: 0, dy: 1, factor: 5 / 16 },
  { dx: 1, dy: 1, factor: 1 / 16 },
];

/**
 * 从 hex 解析 RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

/**
 * 计算两个颜色的欧氏距离平方
 */
function colorDistance(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Floyd-Steinberg 误差扩散抖动
 * 在 MARD 色卡约束下进行，确保每个像素都是真实的 MARD 色号
 */
export function floydSteinbergDither(
  pixels: Pixel[],
  width: number,
  height: number,
  palette: MardColor[],
  backgroundMap?: boolean[]
): Pixel[] {
  // 创建浮点缓冲区用于误差扩散
  const buffer: { r: number; g: number; b: number; a: number }[] = pixels.map(p => ({
    r: p.r,
    g: p.g,
    b: p.b,
    a: p.a,
  }));

  const result: Pixel[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // 如果是背景，保持透明
      if (backgroundMap && backgroundMap[idx]) {
        result[idx] = { r: 255, g: 255, b: 255, a: 0 };
        continue;
      }

      const pixel = buffer[idx];

      // 透明像素 = 背景
      if (pixel.a < 128) {
        result[idx] = { r: 255, g: 255, b: 255, a: 0 };
        continue;
      }

      // 钳制颜色值到 0-255
      const clampedR = Math.max(0, Math.min(255, Math.round(pixel.r)));
      const clampedG = Math.max(0, Math.min(255, Math.round(pixel.g)));
      const clampedB = Math.max(0, Math.min(255, Math.round(pixel.b)));

      // 找到最近的 MARD 色
      const nearest = findNearestColor(clampedR, clampedG, clampedB, palette);
      const nearestRgb = hexToRgb(nearest.hex);

      // 计算误差
      const errorR = clampedR - nearestRgb.r;
      const errorG = clampedG - nearestRgb.g;
      const errorB = clampedB - nearestRgb.b;

      // 保存结果
      result[idx] = { r: nearestRgb.r, g: nearestRgb.g, b: nearestRgb.b, a: 255 };

      // 扩散误差到相邻像素
      for (const { dx, dy, factor } of FS_MATRIX) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          buffer[nIdx].r += errorR * factor;
          buffer[nIdx].g += errorG * factor;
          buffer[nIdx].b += errorB * factor;
        }
      }
    }
  }

  return result;
}

/**
 * 统计颜色使用量
 */
export function countColorUsage(
  pixels: Pixel[],
  palette: MardColor[]
): Map<string, { color: MardColor; count: number }> {
  const usage = new Map<string, { color: MardColor; count: number }>();

  // 初始化所有色号
  for (const color of palette) {
    usage.set(color.code, { color, count: 0 });
  }

  // 统计
  for (const pixel of pixels) {
    if (pixel.a < 128) continue; // 跳过透明

    const nearest = findNearestColor(pixel.r, pixel.g, pixel.b, palette);
    const entry = usage.get(nearest.code);
    if (entry) {
      entry.count++;
    }
  }

  return usage;
}

/**
 * 自动合并相似色
 * 如果两个 MARD 色号色差 < 阈值，把用量少的合并到用量多的
 */
export function autoMergeSimilarColors(
  pixels: Pixel[],
  palette: MardColor[],
  threshold: number = 25
): Pixel[] {
  const usage = countColorUsage(pixels, palette);

  // 获取有使用量的色号
  const usedColors = Array.from(usage.values())
    .filter(entry => entry.count > 0)
    .sort((a, b) => b.count - a.count); // 按用量降序

  // 构建合并映射：被合并的色号 → 目标色号
  const mergeMap = new Map<string, MardColor>();
  const mergedCodes = new Set<string>();

  for (let i = 0; i < usedColors.length; i++) {
    const colorA = usedColors[i].color;
    if (mergedCodes.has(colorA.code)) continue;

    const rgbA = hexToRgb(colorA.hex);

    for (let j = i + 1; j < usedColors.length; j++) {
      const colorB = usedColors[j].color;
      if (mergedCodes.has(colorB.code)) continue;

      const rgbB = hexToRgb(colorB.hex);
      const distance = colorDistance(rgbA, rgbB);

      if (distance < threshold * threshold) {
        // 用量少的合并到用量多的
        mergeMap.set(colorB.code, colorA);
        mergedCodes.add(colorB.code);
      }
    }
  }

  // 应用合并
  if (mergeMap.size === 0) return pixels;

  return pixels.map(pixel => {
    if (pixel.a < 128) return pixel;

    const nearest = findNearestColor(pixel.r, pixel.g, pixel.b, palette);
    const merged = mergeMap.get(nearest.code);

    if (merged) {
      const mergedRgb = hexToRgb(merged.hex);
      return { r: mergedRgb.r, g: mergedRgb.g, b: mergedRgb.b, a: 255 };
    }

    return pixel;
  });
}

/**
 * 杂色过滤
 * 用量 ≤ threshold 的极少量颜色，合并到最近的用量更多主色
 */
export function filterNoiseColors(
  pixels: Pixel[],
  palette: MardColor[],
  threshold: number = 3
): Pixel[] {
  const usage = countColorUsage(pixels, palette);

  // 找出用量 ≤ threshold 的色号
  const noiseCodes = new Set<string>();
  for (const [code, entry] of usage) {
    if (entry.count > 0 && entry.count <= threshold) {
      noiseCodes.add(code);
    }
  }

  if (noiseCodes.size === 0) return pixels;

  // 找出主色（用量 > threshold）
  const mainColors = Array.from(usage.values())
    .filter(entry => entry.count > threshold)
    .map(entry => entry.color);

  if (mainColors.length === 0) return pixels;

  // 应用过滤
  return pixels.map(pixel => {
    if (pixel.a < 128) return pixel;

    const nearest = findNearestColor(pixel.r, pixel.g, pixel.b, palette);

    if (noiseCodes.has(nearest.code)) {
      // 找到最近的主色
      const nearestRgb = hexToRgb(nearest.hex);
      const nearestMain = findNearestColor(nearestRgb.r, nearestRgb.g, nearestRgb.b, mainColors);
      const mainRgb = hexToRgb(nearestMain.hex);
      return { r: mainRgb.r, g: mainRgb.g, b: mainRgb.b, a: 255 };
    }

    return pixel;
  });
}
