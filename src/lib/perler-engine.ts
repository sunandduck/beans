// MARD Perler Bead Color Palette
export interface MardColor {
  code: string;
  name: string;
  hex: string;
}

/**
 * 智能尺寸推荐算法
 * 分析图片复杂度，推荐最佳拼豆尺寸
 * 
 * 算法思路：
 * 1. 计算图片的边缘密度（细节丰富度）
 * 2. 计算颜色多样性
 * 3. 根据复杂度推荐尺寸（细节多→大尺寸，细节少→小尺寸）
 * 4. 确保关键特征（如眼睛）至少占用 3-5 个像素
 */
export async function recommendGridSize(imageUrl: string): Promise<number> {
  const img = await loadImage(imageUrl);
  
  // 创建 canvas 获取像素数据
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const data = imageData.data;
  
  // 1. 计算边缘密度（使用简单的梯度检测）
  let edgeCount = 0;
  const totalPixels = img.width * img.height;
  const sampleStep = 4; // 每 4 个像素采样一次，提高性能
  
  for (let y = 1; y < img.height - 1; y += sampleStep) {
    for (let x = 1; x < img.width - 1; x += sampleStep) {
      const idx = (y * img.width + x) * 4;
      const rightIdx = (y * img.width + (x + 1)) * 4;
      const bottomIdx = ((y + 1) * img.width + x) * 4;
      
      // 计算水平梯度
      const dx = Math.abs(data[idx] - data[rightIdx]) + 
                 Math.abs(data[idx + 1] - data[rightIdx + 1]) + 
                 Math.abs(data[idx + 2] - data[rightIdx + 2]);
      
      // 计算垂直梯度
      const dy = Math.abs(data[idx] - data[bottomIdx]) + 
                 Math.abs(data[idx + 1] - data[bottomIdx + 1]) + 
                 Math.abs(data[idx + 2] - data[bottomIdx + 2]);
      
      // 如果梯度超过阈值，认为是边缘
      if (dx + dy > 100) {
        edgeCount++;
      }
    }
  }
  
  const edgeDensity = edgeCount / (totalPixels / (sampleStep * sampleStep));
  
  // 2. 计算颜色多样性（采样区域的颜色数量）
  const colorBuckets = new Set<string>();
  const colorSampleStep = 8;
  
  for (let y = 0; y < img.height; y += colorSampleStep) {
    for (let x = 0; x < img.width; x += colorSampleStep) {
      const idx = (y * img.width + x) * 4;
      // 量化颜色到 32 级
      const bucket = `${Math.round(data[idx] / 32)},${Math.round(data[idx + 1] / 32)},${Math.round(data[idx + 2] / 32)}`;
      colorBuckets.add(bucket);
    }
  }
  
  const colorDiversity = colorBuckets.size;
  
  // 3. 根据复杂度计算推荐尺寸
  // 基础尺寸：40（低像素输入的基础尺寸）
  // 边缘密度贡献：0-10 尺寸加成
  // 颜色多样性贡献：0-10 尺寸加成
  let recommendedSize = 40;
  
  // 边缘密度通常在 0-0.5 之间
  recommendedSize += Math.min(10, edgeDensity * 20);
  
  // 颜色多样性通常在 10-100 之间
  recommendedSize += Math.min(10, (colorDiversity - 10) * 0.125);
  
  // 如果输入是低像素图（<=256x256），推荐更小的尺寸
  const isLowPixelInput = img.width <= 256 && img.height <= 256;
  if (isLowPixelInput) {
    recommendedSize = Math.min(recommendedSize, 50);
  }
  
  // 限制在合理范围内（最小 30，最大 60）
  // 30 是最小可拼尺寸，60 是最大推荐尺寸
  recommendedSize = Math.max(30, Math.min(60, Math.round(recommendedSize)));
  
  console.log('[PerlerEngine] 智能尺寸推荐:', {
    edgeDensity: edgeDensity.toFixed(3),
    colorDiversity,
    recommendedSize,
    imageSize: `${img.width}x${img.height}`,
  });
  
  return recommendedSize;
}

/**
 * CIE76 色差公式（简化版）
 * 计算两个 RGB 颜色的视觉色差
 */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  // 使用加权欧氏距离，模拟人眼感知
  // 人眼对绿色最敏感，红色次之，蓝色最不敏感
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

/**
 * 判断是否是皮肤颜色
 * 皮肤颜色特征：R > G > B（红色调），R 在 150-255 之间
 */
function isSkinColor(r: number, g: number, b: number): boolean {
  return (
    r > 150 && r <= 255 &&
    g > 100 && g <= 220 &&
    b > 80 && b <= 200 &&
    r > g && g >= b &&
    (r - b) > 20
  );
}

/**
 * 千岛拼豆算法：层次聚类 + 频率阈值筛选
 * 
 * @param colorStats 颜色统计 { color: {r,g,b}, count: number }[]
 * @param palette 拼豆色卡
 * @param deltaEThreshold 色差阈值（默认 30，约等于 CIE76 的 4.0）
 * @param frequencyThreshold 频率阈值（默认 0.05，即 5%）
 * @returns 颜色映射表 { [originalColorKey]: MardColor }
 */
function clusterColors(
  colorStats: { color: { r: number; g: number; b: number }; count: number }[],
  palette: MardColor[],
  deltaEThreshold: number = 30,
  frequencyThreshold: number = 0.05,
  maxColors: number = 12
): Map<string, MardColor> {
  const totalPixels = colorStats.reduce((sum, s) => sum + s.count, 0);
  
  // 步骤 1：初始化聚类（每个颜色一个聚类，深色加权）
  interface Cluster {
    colors: { r: number; g: number; b: number; count: number }[];
    totalFrequency: number;
    center: { r: number; g: number; b: number };
    isDark: boolean; // 是否是深色（轮廓、眼睛等关键特征）
  }
  
  // 计算亮度
  const getBrightness = (r: number, g: number, b: number) => {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  
  const clusters: Cluster[] = colorStats.map(stat => {
    const brightness = getBrightness(stat.color.r, stat.color.g, stat.color.b);
    const isDark = brightness < 100; // 深色（轮廓、眼睛等）
    // 深色权重提高 3 倍（76/24 原则）
    const weightedCount = isDark ? stat.count * 3 : stat.count;
    return {
      colors: [{ ...stat.color, count: stat.count }],
      totalFrequency: weightedCount / totalPixels,
      center: { ...stat.color },
      isDark,
    };
  });
  
  // 步骤 2：层次聚类（合并相似颜色）
  let merged = true;
  while (merged) {
    merged = false;
    let minDist = Infinity;
    let mergeI = -1, mergeJ = -1;
    
    // 找到距离最近的两个聚类
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        let dist = colorDistance(
          clusters[i].center.r, clusters[i].center.g, clusters[i].center.b,
          clusters[j].center.r, clusters[j].center.g, clusters[j].center.b
        );
        
        // 皮肤颜色特殊处理：如果两个都是皮肤颜色，降低距离（更容易合并）
        const isSkinI = isSkinColor(clusters[i].center.r, clusters[i].center.g, clusters[i].center.b);
        const isSkinJ = isSkinColor(clusters[j].center.r, clusters[j].center.g, clusters[j].center.b);
        if (isSkinI && isSkinJ) {
          dist *= 0.5; // 皮肤颜色距离减半，更容易合并
        }
        
        if (dist < minDist) {
          minDist = dist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }
    
    // 如果距离小于阈值或聚类数量超过限制，合并
    // 深色聚类（关键特征）需要更小的距离才合并，保护细节
    let effectiveThreshold = deltaEThreshold;
    if (clusters[mergeI].isDark && clusters[mergeJ].isDark) {
      effectiveThreshold = deltaEThreshold * 0.6; // 深色之间需要更相似才合并
    }
    
    const shouldMerge = minDist < effectiveThreshold || clusters.length > maxColors;
    if (shouldMerge && mergeI >= 0) {
      const clusterI = clusters[mergeI];
      const clusterJ = clusters[mergeJ];
      
      // 合并颜色列表
      clusterI.colors.push(...clusterJ.colors);
      clusterI.totalFrequency += clusterJ.totalFrequency;
      
      // 重新计算中心（频率加权平均）
      let totalWeight = 0;
      let centerR = 0, centerG = 0, centerB = 0;
      for (const c of clusterI.colors) {
        centerR += c.r * c.count;
        centerG += c.g * c.count;
        centerB += c.b * c.count;
        totalWeight += c.count;
      }
      clusterI.center = {
        r: Math.round(centerR / totalWeight),
        g: Math.round(centerG / totalWeight),
        b: Math.round(centerB / totalWeight),
      };
      
      // 更新 isDark 属性：如果任一聚类是深色，合并后仍标记为深色
      clusterI.isDark = clusterI.isDark || clusterJ.isDark;
      
      // 删除被合并的聚类
      clusters.splice(mergeJ, 1);
      merged = true;
    }
  }
  
  // 步骤 3：频率阈值筛选（过滤低频杂色）
  // 保护关键颜色：黑色（边框）、白色（眼白）、深色（眼睛、鼻子等关键特征）
  const isKeyColor = (color: { r: number, g: number, b: number }) => {
    // 黑色（边框）- 必须保护
    if (color.r < 50 && color.g < 50 && color.b < 50) return true;
    // 白色（眼白、高光）- 必须保护
    if (color.r > 230 && color.g > 230 && color.b > 230) return true;
    // 深色（眼睛、鼻子、耳朵等关键特征）- 即使面积小也保留
    const brightness = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    if (brightness < 100) return true;
    return false;
  };
  
  const importantClusters = clusters.filter(c => 
    c.totalFrequency >= frequencyThreshold || 
    isKeyColor(c.center) || // 关键颜色即使频率低也保留
    c.isDark // 深色（关键特征）即使频率低也保留
  );
  const unimportantClusters = clusters.filter(c => 
    c.totalFrequency < frequencyThreshold && 
    !isKeyColor(c.center) &&
    !c.isDark
  );
  
  // 步骤 4：将不重要聚类合并到最近的重要聚类
  for (const cluster of unimportantClusters) {
    let minDist = Infinity;
    let nearestCluster = importantClusters[0];
    
    for (const impCluster of importantClusters) {
      const dist = colorDistance(
        cluster.center.r, cluster.center.g, cluster.center.b,
        impCluster.center.r, impCluster.center.g, impCluster.center.b
      );
      if (dist < minDist) {
        minDist = dist;
        nearestCluster = impCluster;
      }
    }
    
    // 合并到最近的重要聚类
    nearestCluster.colors.push(...cluster.colors);
    nearestCluster.totalFrequency += cluster.totalFrequency;
  }
  
  // 步骤 5：映射到拼豆色号
  const colorMap = new Map<string, MardColor>();
  
  for (const cluster of importantClusters) {
    // 找到与聚类中心最近的拼豆色号
    const nearestPaletteColor = findNearestColor(
      cluster.center.r, cluster.center.g, cluster.center.b,
      palette
    );
    
    // 将聚类中所有颜色映射到这个拼豆色号
    for (const c of cluster.colors) {
      const key = `${c.r},${c.g},${c.b}`;
      colorMap.set(key, nearestPaletteColor);
    }
  }
  
  console.log('[PerlerEngine] 颜色聚类完成:', {
    '原始颜色数': colorStats.length,
    '聚类数': clusters.length,
    '重要聚类数': importantClusters.length,
    '最终颜色数': colorMap.size,
  });
  
  return colorMap;
}

// MARD 221 Standard Palette (most common colors)
export const MARD_221_PALETTE: MardColor[] = [
  // 黄色系 A1-A26
  { code: "A1", name: "浅黄", hex: "#FAF4C8" },
  { code: "A2", name: "奶黄", hex: "#FFFFD5" },
  { code: "A3", name: "柠檬黄", hex: "#FEFF8B" },
  { code: "A4", name: "中黄", hex: "#FBED56" },
  { code: "A5", name: "金黄", hex: "#F4D738" },
  { code: "A6", name: "橙黄", hex: "#FEAC4C" },
  { code: "A7", name: "橘黄", hex: "#FE8B4C" },
  { code: "A8", name: "亮黄", hex: "#FFDA45" },
  { code: "A9", name: "浅橘", hex: "#FF995B" },
  { code: "A10", name: "橙色", hex: "#F77C31" },
  { code: "A11", name: "浅杏", hex: "#FFDD99" },
  { code: "A12", name: "杏色", hex: "#FE9F72" },
  { code: "A13", name: "浅金", hex: "#FFC365" },
  { code: "A14", name: "红橙", hex: "#FD543D" },
  { code: "A15", name: "荧光黄", hex: "#FFF365" },
  { code: "A16", name: "淡黄", hex: "#FFFF9F" },
  { code: "A17", name: "鹅黄", hex: "#FFE36E" },
  { code: "A18", name: "浅橙", hex: "#FEBE7D" },
  { code: "A19", name: "珊瑚橙", hex: "#FD7C72" },
  { code: "A20", name: "金橙", hex: "#FFD568" },
  { code: "A21", name: "米黄", hex: "#FFE395" },
  { code: "A22", name: "黄绿", hex: "#F4F57D" },
  { code: "A23", name: "浅棕黄", hex: "#E6C9B7" },
  { code: "A24", name: "浅柠檬", hex: "#F7F8A2" },
  { code: "A25", name: "金橘", hex: "#FFD67D" },
  { code: "A26", name: "深金", hex: "#FFC830" },
  // 绿色系 B1-B32
  { code: "B1", name: "荧光绿", hex: "#E6EE31" },
  { code: "B2", name: "亮绿", hex: "#63F347" },
  { code: "B3", name: "浅绿", hex: "#9EF780" },
  { code: "B4", name: "草绿", hex: "#5DE035" },
  { code: "B5", name: "翠绿", hex: "#35E352" },
  { code: "B6", name: "薄荷绿", hex: "#65E2A6" },
  { code: "B7", name: "中绿", hex: "#3DAF80" },
  { code: "B8", name: "深绿", hex: "#1C9C4F" },
  { code: "B9", name: "墨绿", hex: "#27523A" },
  { code: "B10", name: "浅薄荷", hex: "#95D3C2" },
  { code: "B11", name: "橄榄绿", hex: "#5D722A" },
  { code: "B12", name: "森林绿", hex: "#166F41" },
  { code: "B13", name: "浅草绿", hex: "#CAEB7B" },
  { code: "B14", name: "嫩绿", hex: "#ADE946" },
  { code: "B15", name: "深橄榄", hex: "#2E5132" },
  { code: "B16", name: "淡绿", hex: "#C5ED9C" },
  { code: "B17", name: "黄绿", hex: "#9BB13A" },
  { code: "B18", name: "亮黄绿", hex: "#E6EE49" },
  { code: "B19", name: "青绿", hex: "#24B88C" },
  { code: "B20", name: "浅青绿", hex: "#C2F0CC" },
  { code: "B21", name: "深青", hex: "#156A6B" },
  { code: "B22", name: "墨青", hex: "#0B3C43" },
  { code: "B23", name: "深褐绿", hex: "#303A21" },
  { code: "B24", name: "荧光黄绿", hex: "#EEFCA5" },
  { code: "B25", name: "灰绿", hex: "#4E846D" },
  { code: "B26", name: "褐绿", hex: "#8D7A35" },
  { code: "B27", name: "浅灰绿", hex: "#CCE1AF" },
  { code: "B28", name: "薄荷", hex: "#9EE5B9" },
  { code: "B29", name: "中黄绿", hex: "#C5E254" },
  { code: "B30", name: "淡黄绿", hex: "#E2FCB1" },
  { code: "B31", name: "浅翠", hex: "#B0E792" },
  { code: "B32", name: "灰黄绿", hex: "#9CAB5A" },
  // 蓝色系 C1-C29
  { code: "C1", name: "极浅蓝", hex: "#E8FFE7" },
  { code: "C2", name: "浅天蓝", hex: "#A9F9FC" },
  { code: "C3", name: "天蓝", hex: "#A0E2FB" },
  { code: "C4", name: "亮蓝", hex: "#41CCFF" },
  { code: "C5", name: "中蓝", hex: "#01ACEB" },
  { code: "C6", name: "湖蓝", hex: "#50AAF0" },
  { code: "C7", name: "宝蓝", hex: "#3677D2" },
  { code: "C8", name: "深蓝", hex: "#0F54C0" },
  { code: "C9", name: "蓝", hex: "#324BCA" },
  { code: "C10", name: "浅湖蓝", hex: "#3EBCE2" },
  { code: "C11", name: "青蓝", hex: "#28DDDE" },
  { code: "C12", name: "墨蓝", hex: "#1C334D" },
  { code: "C13", name: "淡蓝", hex: "#CDE8FF" },
  { code: "C14", name: "极浅青", hex: "#D5FDFF" },
  { code: "C15", name: "中青", hex: "#22C4C6" },
  { code: "C16", name: "海蓝", hex: "#1557A8" },
  { code: "C17", name: "亮青", hex: "#04D1F6" },
  { code: "C18", name: "深墨蓝", hex: "#1D3344" },
  { code: "C19", name: "青灰蓝", hex: "#1887A2" },
  { code: "C20", name: "中深蓝", hex: "#176DAF" },
  { code: "C21", name: "浅蓝灰", hex: "#BEDDFF" },
  { code: "C22", name: "灰蓝", hex: "#67B4BE" },
  { code: "C23", name: "极浅蓝灰", hex: "#C8E2FF" },
  { code: "C24", name: "浅亮蓝", hex: "#7CC4FF" },
  { code: "C25", name: "浅青灰", hex: "#A9E5E5" },
  { code: "C26", name: "中湖蓝", hex: "#3CAED8" },
  { code: "C27", name: "淡紫蓝", hex: "#D3DFFA" },
  { code: "C28", name: "灰紫蓝", hex: "#BBCFED" },
  { code: "C29", name: "深紫蓝", hex: "#34488E" },
  // 紫色系 D1-D26
  { code: "D1", name: "浅紫", hex: "#AEB4F2" },
  { code: "D2", name: "中紫", hex: "#858EDD" },
  { code: "D3", name: "深紫", hex: "#2F54AF" },
  { code: "D4", name: "墨紫", hex: "#182A84" },
  { code: "D5", name: "紫红", hex: "#B843C5" },
  { code: "D6", name: "浅紫红", hex: "#AC7BDE" },
  { code: "D7", name: "中紫红", hex: "#8854B3" },
  { code: "D8", name: "极浅紫", hex: "#E2D3FF" },
  { code: "D9", name: "淡紫", hex: "#D5B9F8" },
  { code: "D10", name: "深墨紫", hex: "#361851" },
  { code: "D11", name: "灰紫", hex: "#B9BAE1" },
  { code: "D12", name: "粉紫", hex: "#DE9AD4" },
  { code: "D13", name: "亮紫红", hex: "#B90095" },
  { code: "D14", name: "深紫红", hex: "#8B279B" },
  { code: "D15", name: "紫", hex: "#2F1F90" },
  { code: "D16", name: "极浅灰紫", hex: "#E3E1EE" },
  { code: "D17", name: "浅蓝紫", hex: "#C4D4F6" },
  { code: "D18", name: "中紫罗兰", hex: "#A45EC7" },
  { code: "D19", name: "灰紫粉", hex: "#D8C3D7" },
  { code: "D20", name: "紫罗兰", hex: "#9C32B2" },
  { code: "D21", name: "深紫罗兰", hex: "#9A009B" },
  { code: "D22", name: "深靛紫", hex: "#333A95" },
  { code: "D23", name: "极淡紫", hex: "#EBDAFC" },
  { code: "D24", name: "亮紫蓝", hex: "#7786E5" },
  { code: "D25", name: "中靛紫", hex: "#494FC7" },
  { code: "D26", name: "浅紫罗兰", hex: "#DFC2F8" },
  // 粉色系 E1-E24
  { code: "E1", name: "浅粉", hex: "#FDD3CC" },
  { code: "E2", name: "粉红", hex: "#FEC0DF" },
  { code: "E3", name: "亮粉", hex: "#FFB7E7" },
  { code: "E4", name: "玫红", hex: "#E8649E" },
  { code: "E5", name: "荧光粉", hex: "#F551A2" },
  { code: "E6", name: "桃红", hex: "#F13D74" },
  { code: "E7", name: "深玫红", hex: "#C63478" },
  { code: "E8", name: "极浅粉", hex: "#FFDBE9" },
  { code: "E9", name: "紫粉", hex: "#E970CC" },
  { code: "E10", name: "深粉", hex: "#D33793" },
  { code: "E11", name: "浅肉粉", hex: "#FCDDD2" },
  { code: "E12", name: "中粉", hex: "#F78FC3" },
  { code: "E13", name: "深玫", hex: "#B5006D" },
  { code: "E14", name: "浅桃", hex: "#FFD1BA" },
  { code: "E15", name: "肉粉", hex: "#F8C7C9" },
  { code: "E16", name: "极浅肉粉", hex: "#FFF3EB" },
  { code: "E17", name: "淡粉", hex: "#FFE2EA" },
  { code: "E18", name: "浅玫粉", hex: "#FFC7DB" },
  { code: "E19", name: "中玫粉", hex: "#FEBAD5" },
  { code: "E20", name: "灰粉", hex: "#D8C7D1" },
  { code: "E21", name: "灰玫", hex: "#BD9DA1" },
  { code: "E22", name: "深灰粉", hex: "#B785A1" },
  { code: "E23", name: "深灰玫", hex: "#937A8D" },
  { code: "E24", name: "浅紫粉", hex: "#E1BCE8" },
  // 红色系 F1-F25
  { code: "F1", name: "浅红", hex: "#FD957B" },
  { code: "F2", name: "亮红", hex: "#FC3D46" },
  { code: "F3", name: "红", hex: "#F74941" },
  { code: "F4", name: "鲜红", hex: "#FC283C" },
  { code: "F5", name: "深红", hex: "#E7002F" },
  { code: "F6", name: "褐红", hex: "#943630" },
  { code: "F7", name: "酒红", hex: "#971937" },
  { code: "F8", name: "正红", hex: "#BC0028" },
  { code: "F9", name: "浅玫红", hex: "#E2677A" },
  { code: "F10", name: "深褐红", hex: "#8A4526" },
  { code: "F11", name: "墨红", hex: "#5A2121" },
  { code: "F12", name: "亮玫红", hex: "#FD4E6A" },
  { code: "F13", name: "橘红", hex: "#F35744" },
  { code: "F14", name: "浅粉红", hex: "#FFA9AD" },
  { code: "F15", name: "暗红", hex: "#D30022" },
  { code: "F16", name: "浅橘红", hex: "#FEC2A6" },
  { code: "F17", name: "浅褐红", hex: "#E69C79" },
  { code: "F18", name: "中褐红", hex: "#D37C46" },
  { code: "F19", name: "深褐", hex: "#C1444A" },
  { code: "F20", name: "灰红", hex: "#CD9391" },
  { code: "F21", name: "浅玫", hex: "#F7B4C6" },
  { code: "F22", name: "淡玫红", hex: "#FDC0D0" },
  { code: "F23", name: "中橘红", hex: "#F67E66" },
  { code: "F24", name: "灰玫红", hex: "#E698AA" },
  { code: "F25", name: "中红", hex: "#E54B4F" },
  // 棕色系 G1-G21
  { code: "G1", name: "浅肤色", hex: "#FFE2CE" },
  { code: "G2", name: "肤色", hex: "#FFC4AA" },
  { code: "G3", name: "浅棕", hex: "#F4C3A5" },
  { code: "G4", name: "中棕", hex: "#E1B383" },
  { code: "G5", name: "金棕", hex: "#EDB045" },
  { code: "G6", name: "橙棕", hex: "#E99C17" },
  { code: "G7", name: "深棕", hex: "#9D5B3E" },
  { code: "G8", name: "墨棕", hex: "#753832" },
  { code: "G9", name: "浅卡其", hex: "#E6B483" },
  { code: "G10", name: "中卡其", hex: "#D98C39" },
  { code: "G11", name: "浅米棕", hex: "#E0C593" },
  { code: "G12", name: "浅杏棕", hex: "#FFC890" },
  { code: "G13", name: "中深棕", hex: "#B7714A" },
  { code: "G14", name: "深卡其", hex: "#8D614C" },
  { code: "G15", name: "极浅米", hex: "#FCF9E0" },
  { code: "G16", name: "浅米", hex: "#F2D9BA" },
  { code: "G17", name: "深褐", hex: "#78524B" },
  { code: "G18", name: "极浅肤色", hex: "#FFE4CC" },
  { code: "G19", name: "橘棕", hex: "#E07935" },
  { code: "G20", name: "深橘棕", hex: "#A94023" },
  { code: "G21", name: "中棕褐", hex: "#B88558" },
  // 黑白灰系 H1-H23
  { code: "H1", name: "透明", hex: "#FDFBFF" },
  { code: "H2", name: "白色", hex: "#FEFFFF" },
  { code: "H3", name: "浅灰紫", hex: "#B6B1BA" },
  { code: "H4", name: "中灰", hex: "#89858C" },
  { code: "H5", name: "深灰", hex: "#48464E" },
  { code: "H6", name: "墨灰", hex: "#2F2B2F" },
  { code: "H7", name: "黑色", hex: "#000000" },
  { code: "H8", name: "浅粉灰", hex: "#E7D6DB" },
  { code: "H9", name: "浅灰", hex: "#EDEDED" },
  { code: "H10", name: "灰白", hex: "#EEE9EA" },
  { code: "H11", name: "中灰紫", hex: "#CECDD5" },
  { code: "H12", name: "极浅米白", hex: "#FFF5ED" },
  { code: "H13", name: "浅米黄", hex: "#F5ECD2" },
  { code: "H14", name: "浅灰绿", hex: "#CFD7D3" },
  { code: "H15", name: "灰蓝", hex: "#98A6A8" },
  { code: "H16", name: "深墨", hex: "#1D1414" },
  { code: "H17", name: "极浅灰", hex: "#F1EDED" },
  { code: "H18", name: "奶白", hex: "#FFFDF0" },
  { code: "H19", name: "米白", hex: "#F6EFE2" },
  { code: "H20", name: "中灰蓝", hex: "#949FA3" },
  { code: "H21", name: "极浅黄", hex: "#FFFBE1" },
  { code: "H22", name: "中灰紫白", hex: "#CACAD4" },
  { code: "H23", name: "灰绿", hex: "#9A9D94" },
  // 多彩系 M1-M15
  { code: "M1", name: "浅灰绿", hex: "#BCC6B8" },
  { code: "M2", name: "中灰绿", hex: "#8AA386" },
  { code: "M3", name: "深灰蓝", hex: "#697D80" },
  { code: "M4", name: "浅米", hex: "#E3D2BC" },
  { code: "M5", name: "浅卡其", hex: "#D0CCAA" },
  { code: "M6", name: "中卡其", hex: "#B0A782" },
  { code: "M7", name: "灰棕", hex: "#B4A497" },
  { code: "M8", name: "灰玫棕", hex: "#B38281" },
  { code: "M9", name: "深灰棕", hex: "#A58767" },
  { code: "M10", name: "灰紫", hex: "#C5B2BC" },
  { code: "M11", name: "深灰紫", hex: "#9F7594" },
  { code: "M12", name: "墨棕", hex: "#644749" },
  { code: "M13", name: "浅棕", hex: "#D19066" },
  { code: "M14", name: "中棕", hex: "#C77362" },
  { code: "M15", name: "灰绿", hex: "#757D78" },
];

// Convert hex to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

// Find nearest color in palette using weighted perceptual distance
export function findNearestColor(
  r: number,
  g: number,
  b: number,
  palette: MardColor[]
): MardColor {
  let minDistance = Infinity;
  let nearest = palette[0];

  for (const color of palette) {
    const rgb = hexToRgb(color.hex);
    // Weighted Euclidean distance (human perception weighted)
    const dr = r - rgb.r;
    const dg = g - rgb.g;
    const db = b - rgb.b;
    const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;

    if (distance < minDistance) {
      minDistance = distance;
      nearest = color;
    }
  }

  return nearest;
}

export interface PerlerBead {
  row: number;
  col: number;
  color: MardColor;
  isEmpty: boolean;
}

export interface PerlerPattern {
  beads: PerlerBead[];
  width: number;
  height: number;
  colorStats: { color: MardColor; count: number }[];
}

export interface ProcessOptions {
  gridSize: number;
  preserveTransparency?: boolean;
  rawMode?: boolean; // 原始模式：只采样颜色，不做颜色匹配
  faceEnhance?: boolean; // 面部增强：对称化处理面部区域
  useClustering?: boolean; // 使用千岛聚类算法（默认 true）
  redrawFeatures?: boolean; // 智能重绘面部特征（默认 true）
  outlineEnhance?: boolean; // 轮廓强化：确保黑色边框连贯（默认 true）
}

/**
 * 智能重绘面部特征
 * 可拼性 > 还原度：用简洁但有层次的几何形状重绘
 * - 眼睛：黑色边框 + 绿色瞳孔（单层，不要三层）
 * - 鼻子：粉色小三角形（3-5 像素）
 * - 腮部：对称的粉色色块（2x2 或 3x3）
 */
function redrawFacialFeatures(
  beads: PerlerBead[],
  width: number,
  height: number
): void {
  // 创建二维数组方便访问
  const grid: (PerlerBead | null)[][] = Array(height).fill(null).map(() => Array(width).fill(null));
  for (const bead of beads) {
    if (bead.row < height && bead.col < width) {
      grid[bead.row][bead.col] = bead;
    }
  }

  // 获取关键颜色
  const black = MARD_221_PALETTE.find(c => c.code === 'H7'); // 黑色
  const green = MARD_221_PALETTE.find(c => c.code === 'B12'); // 绿色（瞳孔）
  const pink = MARD_221_PALETTE.find(c => c.code === 'E15'); // 粉色（鼻子、腮部）
  const white = MARD_221_PALETTE.find(c => c.code === 'H2'); // 白色（高光）

  if (!black || !green || !pink) return;

  // 检测面部区域（图像上半部分中心 60%）
  const faceTop = Math.floor(height * 0.15);
  const faceBottom = Math.floor(height * 0.55);
  const faceLeft = Math.floor(width * 0.2);
  const faceRight = Math.floor(width * 0.8);
  const faceCenterX = Math.floor(width / 2);

  // 查找眼睛位置（黑色或深色区域）
  const darkBeads: { row: number; col: number }[] = [];
  for (let y = faceTop; y < faceBottom; y++) {
    for (let x = faceLeft; x < faceRight; x++) {
      const bead = grid[y][x];
      if (bead && !bead.isEmpty && bead.color) {
        // 从 hex 解析 RGB
        const hex = bead.color.hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const brightness = (r + g + b) / 3;
        if (brightness < 100) {
          darkBeads.push({ row: y, col: x });
        }
      }
    }
  }

  if (darkBeads.length < 4) return;

  // 按行分组
  const rowGroups = new Map<number, typeof darkBeads>();
  for (const bead of darkBeads) {
    if (!rowGroups.has(bead.row)) {
      rowGroups.set(bead.row, []);
    }
    rowGroups.get(bead.row)!.push(bead);
  }

  // 找到深色像素最多的行（眼睛所在行）
  const sortedRows = Array.from(rowGroups.entries())
    .sort((a, b) => b[1].length - a[1].length);

  if (sortedRows.length === 0) return;

  // 取前 2-3 行作为眼睛区域
  const eyeRows = sortedRows.slice(0, Math.min(3, sortedRows.length));
  const eyeCenterRow = Math.round(eyeRows.reduce((sum, [row]) => sum + row, 0) / eyeRows.length);

  // 找到左右眼中心
  const allEyeBeads = eyeRows.flatMap(([, beads]) => beads);
  const leftEyeBeads = allEyeBeads.filter(b => b.col < faceCenterX);
  const rightEyeBeads = allEyeBeads.filter(b => b.col >= faceCenterX);

  if (leftEyeBeads.length === 0 || rightEyeBeads.length === 0) return;

  const leftEyeCenter = Math.round(leftEyeBeads.reduce((sum, b) => sum + b.col, 0) / leftEyeBeads.length);
  const rightEyeCenter = width - 1 - leftEyeCenter; // 强制对称

  // 眼睛大小（根据网格尺寸调整）
  const eyeSize = width >= 64 ? 3 : 2;
  const halfEye = Math.floor(eyeSize / 2);

  // 重绘眼睛：黑色边框 + 绿色瞳孔
  for (let dy = -halfEye; dy <= halfEye; dy++) {
    for (let dx = -halfEye; dx <= halfEye; dx++) {
      const isBorder = Math.abs(dy) === halfEye || Math.abs(dx) === halfEye;
      const color = isBorder ? black : green;

      // 左眼
      const leftY = eyeCenterRow + dy;
      const leftX = leftEyeCenter + dx;
      if (leftY >= 0 && leftY < height && leftX >= 0 && leftX < width) {
        const bead = grid[leftY][leftX];
        if (bead) {
          bead.color = color;
          bead.isEmpty = false;
        }
      }

      // 右眼（对称）
      const rightY = eyeCenterRow + dy;
      const rightX = rightEyeCenter + dx;
      if (rightY >= 0 && rightY < height && rightX >= 0 && rightX < width) {
        const bead = grid[rightY][rightX];
        if (bead) {
          bead.color = color;
          bead.isEmpty = false;
        }
      }
    }
  }

  // 重绘鼻子：粉色小三角形（眼睛下方 2-3 行）
  const noseRow = eyeCenterRow + halfEye + 2;
  const noseCol = faceCenterX;
  if (noseRow >= 0 && noseRow < height) {
    // 三角形：上 1 个，下 2 个
    const nosePositions = [
      { row: noseRow, col: noseCol },
      { row: noseRow + 1, col: noseCol - 1 },
      { row: noseRow + 1, col: noseCol + 1 },
    ];
    for (const pos of nosePositions) {
      if (pos.row >= 0 && pos.row < height && pos.col >= 0 && pos.col < width) {
        const bead = grid[pos.row][pos.col];
        if (bead) {
          bead.color = pink;
          bead.isEmpty = false;
        }
      }
    }
  }

  // 重绘腮部：对称的粉色色块（眼睛下方 3-4 行，左右各一个）
  const cheekRow = eyeCenterRow + halfEye + 3;
  const cheekOffset = Math.floor(width * 0.15); // 距离中心的偏移
  const cheekSize = width >= 64 ? 2 : 1;

  for (let side = -1; side <= 1; side += 2) {
    const cheekCenterX = faceCenterX + side * cheekOffset;
    for (let dy = 0; dy < cheekSize; dy++) {
      for (let dx = 0; dx < cheekSize; dx++) {
        const y = cheekRow + dy;
        const x = cheekCenterX + dx;
        if (y >= 0 && y < height && x >= 0 && x < width) {
          const bead = grid[y][x];
          if (bead) {
            bead.color = pink;
            bead.isEmpty = false;
          }
        }
      }
    }
  }
}

/**
 * 轮廓强化：确保黑色边框连贯（可拼性 > 还原度）
 * 检测非黑色像素周围是否有黑色像素，如果有，则将其也变为黑色
 * 这样可以填补轮廓中的小缺口，使边框更连贯
 */
function enhanceOutline(
  beads: PerlerBead[],
  width: number,
  height: number
): void {
  // 获取黑色
  const black = MARD_221_PALETTE.find(c => c.code === 'H7');
  if (!black) return;

  // 创建网格便于访问
  const grid: (PerlerBead | null)[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = null;
    }
  }
  for (const bead of beads) {
    if (bead.row >= 0 && bead.row < height && bead.col >= 0 && bead.col < width) {
      grid[bead.row][bead.col] = bead;
    }
  }

  // 形态学膨胀算法：多次迭代，逐步强化轮廓
  // 原理：如果非黑色像素周围有黑色像素，就将其变为黑色
  // 多次迭代可以填补较大的缺口，使轮廓更连贯

  const iterations = 2; // 迭代次数（2 次可以填补 2 像素的缺口）
  let reinforcedPixels = 0;

  for (let iter = 0; iter < iterations; iter++) {
    const toBlack: { row: number; col: number }[] = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bead = grid[y][x];
        if (!bead || bead.isEmpty || !bead.color) continue;

        // 如果是黑色，跳过
        if (bead.color.code === 'H7') continue;

        // 检查周围 8 个方向是否有黑色像素
        let blackNeighborCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dy === 0 && dx === 0) continue;
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
              const neighbor = grid[ny][nx];
              if (neighbor && !neighbor.isEmpty && neighbor.color && neighbor.color.code === 'H7') {
                blackNeighborCount++;
              }
            }
          }
        }

        // 如果周围有黑色像素（1 个或以上），就变为黑色
        // 降低阈值从 2 到 1，更积极地强化轮廓
        if (blackNeighborCount >= 1) {
          toBlack.push({ row: y, col: x });
        }
      }
    }

    // 应用黑色
    for (const pos of toBlack) {
      const bead = grid[pos.row][pos.col];
      if (bead) {
        bead.color = black;
        bead.isEmpty = false;
      }
    }

    reinforcedPixels += toBlack.length;
  }

  console.log('[PerlerEngine] 轮廓强化完成:', { reinforcedPixels, iterations });
}

// 检测像素艺术图像的块大小（pixel block size）
// 通过分析颜色变化频率来估算每个"像素块"占多少实际像素
function detectPixelBlockSize(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number {
  // 取中心水平线，统计颜色变化次数
  const midY = Math.floor(height / 2);
  let changes = 0;
  const threshold = 30; // 颜色差异阈值

  for (let x = 1; x < width; x++) {
    const idx1 = (midY * width + x - 1) * 4;
    const idx2 = (midY * width + x) * 4;
    const diff =
      Math.abs(data[idx1] - data[idx2]) +
      Math.abs(data[idx1 + 1] - data[idx2 + 1]) +
      Math.abs(data[idx1 + 2] - data[idx2 + 2]);
    if (diff > threshold) changes++;
  }

  // 也取中心垂直线
  const midX = Math.floor(width / 2);
  let vChanges = 0;
  for (let y = 1; y < height; y++) {
    const idx1 = ((y - 1) * width + midX) * 4;
    const idx2 = (y * width + midX) * 4;
    const diff =
      Math.abs(data[idx1] - data[idx2]) +
      Math.abs(data[idx1 + 1] - data[idx2 + 1]) +
      Math.abs(data[idx1 + 2] - data[idx2 + 2]);
    if (diff > threshold) vChanges++;
  }

  // 平均变化次数 → 像素块数量 → 块大小
  const avgChanges = (changes + vChanges) / 2;
  const avgDim = (width + height) / 2;
  // 像素块数量 = 变化次数 + 1（n 个块有 n-1 个边界）
  const blockCount = Math.max(1, avgChanges + 1);
  const blockSize = avgDim / blockCount;

  console.log('[PerlerEngine] 像素块检测:', {
    hChanges: changes,
    vChanges,
    avgChanges,
    blockSize: Math.round(blockSize * 10) / 10,
    estimatedGrid: Math.round(blockCount),
  });

  return Math.round(blockSize);
}

// Process image into perler bead pattern
export async function processImage(
  imageUrl: string,
  options: ProcessOptions
): Promise<PerlerPattern> {
  const { gridSize, preserveTransparency = true, faceEnhance = true, useClustering = true } = options;

  // Load image
  const img = await loadImage(imageUrl);
  
  // 检测是否为低像素输入（AI 生成的像素风格图）
  const isLowPixelInput = img.width <= 256 && img.height <= 256;
  let effectiveGridSize = gridSize;
  
  if (isLowPixelInput) {
    // 先缩放到目标尺寸，检测像素块大小
    const tempCanvas = document.createElement("canvas");
    const tempMaxDim = Math.min(img.width, img.height);
    let tempW: number, tempH: number;
    if (img.width > img.height) {
      tempW = tempMaxDim;
      tempH = Math.round((img.height / img.width) * tempMaxDim);
    } else {
      tempH = tempMaxDim;
      tempW = Math.round((img.width / img.height) * tempMaxDim);
    }
    tempCanvas.width = tempW;
    tempCanvas.height = tempH;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(img, 0, 0, tempW, tempH);
    const tempData = tempCtx.getImageData(0, 0, tempW, tempH).data;
    
    const blockSize = detectPixelBlockSize(tempData, tempW, tempH);
    // 像素块数量 = 图像尺寸 / 块大小
    const pixelBlockGrid = Math.round(tempMaxDim / blockSize);
    
    // 限制网格尺寸不超过像素块数量（避免 1 个 AI 像素被放大成多个拼豆格子）
    effectiveGridSize = Math.min(gridSize, pixelBlockGrid);
    
    console.log('[PerlerEngine] 低像素输入检测:', {
      imgSize: `${img.width}x${img.height}`,
      blockSize,
      pixelBlockGrid,
      requestedGrid: gridSize,
      effectiveGrid: effectiveGridSize,
    });
  }
  
  // Calculate dimensions maintaining aspect ratio
  const maxDim = effectiveGridSize;
  let width: number, height: number;
  
  if (img.width > img.height) {
    width = maxDim;
    height = Math.round((img.height / img.width) * maxDim);
  } else {
    height = maxDim;
    width = Math.round((img.width / img.height) * maxDim);
  }

  // Draw to canvas and get pixel data
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  
  // 关闭图像平滑，保持像素清晰（最近邻插值）
  ctx.imageSmoothingEnabled = false;
  
  // Fill white background if not preserving transparency
  if (!preserveTransparency) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
  }
  
  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 面部区域增强：对中心区域（通常是面部）进行对称化处理
  if (faceEnhance) {
    // 猫/人物面部通常在上半部分，调整检测区域
    const faceZoneTop = Math.floor(height * 0.15);
    const faceZoneBottom = Math.floor(height * 0.55);
    const faceZoneLeft = Math.floor(width * 0.15);
    const faceZoneRight = Math.floor(width * 0.85);
    const centerX = Math.floor((faceZoneLeft + faceZoneRight) / 2);
    
    // 强制镜像策略：以左半边为基准，镜像到右半边
    // 这样确保左右完全对称
    for (let y = faceZoneTop; y < faceZoneBottom; y++) {
      for (let x = faceZoneLeft; x < centerX; x++) {
        // 计算镜像位置（关于 centerX 对称）
        const mirrorX = faceZoneLeft + faceZoneRight - x;
        
        // 确保镜像点在面部区域内
        if (mirrorX > faceZoneRight || mirrorX <= centerX) continue;
        
        const leftIdx = (y * width + x) * 4;
        const rightIdx = (y * width + mirrorX) * 4;
        
        // 检查左边是否是非透明像素
        if (data[leftIdx + 3] > 128) {
          // 直接复制左边到右边（强制对称）
          data[rightIdx] = data[leftIdx];
          data[rightIdx + 1] = data[leftIdx + 1];
          data[rightIdx + 2] = data[leftIdx + 2];
          data[rightIdx + 3] = data[leftIdx + 3];
        }
      }
    }
    
    // 将处理后的数据写回 canvas
    ctx.putImageData(imageData, 0, 0);
  }

  // 第一步：颜色匹配（卡通模式 - 使用区域主导色）
  const beads: PerlerBead[] = [];
  
  // 计算每个格子对应的原图区域大小
  const cellWidth = img.width / width;
  const cellHeight = img.height / height;
  
  // 获取原始图片的 imageData（不缩放）
  const originalCanvas = document.createElement("canvas");
  originalCanvas.width = img.width;
  originalCanvas.height = img.height;
  const originalCtx = originalCanvas.getContext("2d")!;
  originalCtx.drawImage(img, 0, 0);
  const originalImageData = originalCtx.getImageData(0, 0, img.width, img.height);
  const originalData = originalImageData.data;
  
  // 低像素输入：直接缩放 + 逐像素采样，不做区域平均
  if (isLowPixelInput) {
    console.log('[PerlerEngine] 检测到低像素输入，使用直接采样模式');
    
    // 直接缩放到目标网格尺寸（最近邻插值）
    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = width;
    scaledCanvas.height = height;
    const scaledCtx = scaledCanvas.getContext("2d")!;
    scaledCtx.imageSmoothingEnabled = false; // 关键：关闭平滑，保持像素块
    scaledCtx.drawImage(img, 0, 0, width, height);
    const scaledData = scaledCtx.getImageData(0, 0, width, height).data;
    
    // 逐像素采样，直接匹配 MARD 色
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const i = (py * width + px) * 4;
        const r = scaledData[i];
        const g = scaledData[i + 1];
        const b = scaledData[i + 2];
        const a = scaledData[i + 3];
        
        // 检查是否透明
        if (preserveTransparency && a < 128) {
          beads.push({ row: py, col: px, color: MARD_221_PALETTE[0], isEmpty: true });
          continue;
        }
        
        // 直接匹配到最近的 MARD 色（不做颜色量化聚类）
        const color = findNearestColor(r, g, b, MARD_221_PALETTE);
        beads.push({ row: py, col: px, color, isEmpty: false });
      }
    }
  } else if (options.rawMode) {
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // 计算这个格子在原图中的中心位置
        const centerX = Math.floor((px + 0.5) * cellWidth);
        const centerY = Math.floor((py + 0.5) * cellHeight);
        const i = (centerY * img.width + centerX) * 4;
        const r = originalData[i];
        const g = originalData[i + 1];
        const b = originalData[i + 2];
        const a = originalData[i + 3];
        
        // 检查是否透明
        if (preserveTransparency && a < 128) {
          beads.push({ row: py, col: px, color: MARD_221_PALETTE[0], isEmpty: true });
          continue;
        }
        
        // 直接匹配到最近的 MARD 色（不做颜色量化）
        const color = findNearestColor(r, g, b, MARD_221_PALETTE);
        beads.push({ row: py, col: px, color, isEmpty: false });
      }
    }
  } else if (useClustering && !isLowPixelInput) {
    // 卡通模式：使用千岛算法（层次聚类 + 频率阈值筛选）
    
    // 第一步：统计每个格子的主导色
    const gridColors: { color: { r: number; g: number; b: number }; count: number }[] = [];
    const colorFreqMap = new Map<string, { r: number; g: number; b: number; count: number }>();
    
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // 计算这个格子在原图中的区域
        const startX = Math.floor(px * cellWidth);
        const startY = Math.floor(py * cellHeight);
        const endX = Math.floor((px + 1) * cellWidth);
        const endY = Math.floor((py + 1) * cellHeight);
        
        // 统计这个区域内所有像素的颜色
        const colorCount = new Map<string, { r: number; g: number; b: number; count: number }>();
        let pixelCount = 0;
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const i = (y * img.width + x) * 4;
            const r = originalData[i];
            const g = originalData[i + 1];
            const b = originalData[i + 2];
            const a = originalData[i + 3];
            
            // 跳过透明像素
            if (a < 128) continue;
            
            pixelCount++;
            
            // 将颜色量化到 32 级，减少颜色数量
            const quantized = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`;
            const existing = colorCount.get(quantized);
            if (existing) {
              existing.count++;
              existing.r = (existing.r * (existing.count - 1) + r) / existing.count;
              existing.g = (existing.g * (existing.count - 1) + g) / existing.count;
              existing.b = (existing.b * (existing.count - 1) + b) / existing.count;
            } else {
              colorCount.set(quantized, { r, g, b, count: 1 });
            }
          }
        }
        
        // 找到出现最多的颜色（主导色）
        let maxCount = 0;
        let dominantColor = { r: 0, g: 0, b: 0 };
        for (const bucket of colorCount.values()) {
          if (bucket.count > maxCount) {
            maxCount = bucket.count;
            dominantColor = { r: Math.round(bucket.r), g: Math.round(bucket.g), b: Math.round(bucket.b) };
          }
        }
        
        if (pixelCount > 0) {
          const key = `${dominantColor.r},${dominantColor.g},${dominantColor.b}`;
          const existing = colorFreqMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            colorFreqMap.set(key, { ...dominantColor, count: 1 });
          }
        }
      }
    }
    
    // 第二步：使用聚类算法限制颜色数量到 12-15 种
    const colorStatsArray = Array.from(colorFreqMap.entries()).map(([key, val]) => ({
      color: { r: val.r, g: val.g, b: val.b },
      count: val.count,
    }));
    const colorMap = clusterColors(colorStatsArray, MARD_221_PALETTE, 25, 0.01, 15);
    
    // 第三步：应用颜色映射，生成 beads（使用聚类结果）
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        // 计算这个格子在原图中的区域
        const startX = Math.floor(px * cellWidth);
        const startY = Math.floor(py * cellHeight);
        const endX = Math.floor((px + 1) * cellWidth);
        const endY = Math.floor((py + 1) * cellHeight);
        
        // 统计这个区域内所有像素的颜色
        const colorCount = new Map<string, { r: number; g: number; b: number; count: number }>();
        let pixelCount = 0;
        
        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const i = (y * img.width + x) * 4;
            const r = originalData[i];
            const g = originalData[i + 1];
            const b = originalData[i + 2];
            const a = originalData[i + 3];
            
            // 跳过透明像素
            if (a < 128) continue;
            
            pixelCount++;
            
            // 将颜色量化到 32 级
            const quantized = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`;
            const existing = colorCount.get(quantized);
            if (existing) {
              existing.count++;
              existing.r = (existing.r * (existing.count - 1) + r) / existing.count;
              existing.g = (existing.g * (existing.count - 1) + g) / existing.count;
              existing.b = (existing.b * (existing.count - 1) + b) / existing.count;
            } else {
              colorCount.set(quantized, { r, g, b, count: 1 });
            }
          }
        }
        
        // 找到主导色
        let maxCount = 0;
        let dominantColor = { r: 0, g: 0, b: 0 };
        for (const bucket of colorCount.values()) {
          if (bucket.count > maxCount) {
            maxCount = bucket.count;
            dominantColor = { r: Math.round(bucket.r), g: Math.round(bucket.g), b: Math.round(bucket.b) };
          }
        }
        
        if (pixelCount === 0) {
          beads.push({ row: py, col: px, color: MARD_221_PALETTE[0], isEmpty: true });
          continue;
        }
        
        // 使用聚类后的颜色映射
        const colorKey = `${dominantColor.r},${dominantColor.g},${dominantColor.b}`;
        const mardColor = colorMap.get(colorKey);
        
        if (mardColor) {
          beads.push({ row: py, col: px, color: mardColor, isEmpty: false });
        } else {
          // 如果没有映射，使用最近的 MARD 色
          const color = findNearestColor(dominantColor.r, dominantColor.g, dominantColor.b, MARD_221_PALETTE);
          beads.push({ row: py, col: px, color, isEmpty: false });
        }
      }
    }
  } else {
    // 简单模式：直接颜色匹配（不使用聚类）
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const centerX = Math.floor((px + 0.5) * cellWidth);
        const centerY = Math.floor((py + 0.5) * cellHeight);
        const i = (centerY * img.width + centerX) * 4;
        const r = originalData[i];
        const g = originalData[i + 1];
        const b = originalData[i + 2];
        const a = originalData[i + 3];
        
        if (preserveTransparency && a < 128) {
          beads.push({ row: py, col: px, color: MARD_221_PALETTE[0], isEmpty: true });
          continue;
        }
        
        const color = findNearestColor(r, g, b, MARD_221_PALETTE);
        beads.push({ row: py, col: px, color, isEmpty: false });
      }
    }
  }

  console.log('[PerlerEngine] 处理完成:', { width, height, beadCount: beads.length });

  // 智能重绘：对面部特征进行重新设计（可拼性 > 还原度）
  if (options.redrawFeatures !== false) {
    redrawFacialFeatures(beads, width, height);
  }

  // 轮廓强化：确保黑色边框连贯（可拼性 > 还原度）
  if (options.outlineEnhance !== false) {
    enhanceOutline(beads, width, height);
  }

  // ===== 背景检测（加固版）=====
  // 策略：形态学闭运算修补轮廓缺口 + Flood Fill 连通性检测 + 面积保护兜底

  // Step 1: 计算背景色（从四个角采样）
  const cornerColors: { r: number; g: number; b: number }[] = [];
  const sampleSize = Math.max(1, Math.floor(width * 0.05));
  const cornerRegions = [
    { sy: 0, sx: 0 },                          // 左上
    { sy: 0, sx: width - sampleSize },          // 右上
    { sy: height - sampleSize, sx: 0 },         // 左下
    { sy: height - sampleSize, sx: width - sampleSize }, // 右下
  ];
  for (const region of cornerRegions) {
    for (let py = region.sy; py < region.sy + sampleSize; py++) {
      for (let px = region.sx; px < region.sx + sampleSize; px++) {
        const bead = beads[py * width + px];
        if (bead && !bead.isEmpty && bead.color) {
          const hex = bead.color.hex;
          cornerColors.push({
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16),
          });
        }
      }
    }
  }

  const bgColor = cornerColors.length > 0
    ? {
        r: Math.round(cornerColors.reduce((s, c) => s + c.r, 0) / cornerColors.length),
        g: Math.round(cornerColors.reduce((s, c) => s + c.g, 0) / cornerColors.length),
        b: Math.round(cornerColors.reduce((s, c) => s + c.b, 0) / cornerColors.length),
      }
    : { r: 255, g: 255, b: 255 };
  const bgThreshold = 30;

  // Step 2: 建立二值掩码 —— 每个像素是否"像背景色"
  const isBgLike = new Uint8Array(width * height);
  for (let i = 0; i < beads.length; i++) {
    const bead = beads[i];
    if (!bead || bead.isEmpty || !bead.color) { isBgLike[i] = 1; continue; }
    const hex = bead.color.hex;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const dist = Math.sqrt((r - bgColor.r) ** 2 + (g - bgColor.g) ** 2 + (b - bgColor.b) ** 2);
    isBgLike[i] = dist < bgThreshold ? 1 : 0;
  }

  // Step 3: 形态学闭运算（膨胀 → 腐蚀）修补轮廓缺口
  // 膨胀：非背景像素向外扩展 1 格，填补 1 像素宽的缺口
  const dilated = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!isBgLike[idx]) { dilated[idx] = 1; continue; }
      // 检查 4 邻居是否有非背景像素
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ];
      let hasNonBg = false;
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (!isBgLike[ny * width + nx]) { hasNonBg = true; break; }
        }
      }
      dilated[idx] = hasNonBg ? 1 : 0;
    }
  }
  // 腐蚀：恢复膨胀导致的膨胀区域，保留被填补的缺口
  const closed = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (dilated[idx]) {
        // 检查 4 邻居是否全部为非背景
        const neighbors = [
          [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        ];
        let allNonBg = true;
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) { allNonBg = false; break; }
          if (!dilated[ny * width + nx]) { allNonBg = false; break; }
        }
        closed[idx] = allNonBg ? 1 : 0;
      }
    }
  }
  // closed[i] === 1 表示"内部"（非背景），closed[i] === 0 表示"外部或轮廓"
  // 闭运算后，1 像素的轮廓缺口已被填补

  // Step 4: Flood Fill —— 在闭运算后的掩码上从四角填充背景
  const visited = new Uint8Array(width * height);
  const isBgArea = new Uint8Array(width * height);

  const floodFill = (startX: number, startY: number) => {
    const stack: [number, number][] = [[startX, startY]];
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const idx = y * width + x;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[idx]) continue;
      // 在闭运算掩码上：0 = 背景/轮廓，1 = 内部
      // Flood Fill 只能填充 0 的区域（背景侧），无法穿透到 1 的区域（内部）
      if (closed[idx] !== 0) continue;
      visited[idx] = 1;
      isBgArea[idx] = 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  };

  const corners: [number, number][] = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ];
  for (const [cx, cy] of corners) {
    floodFill(cx, cy);
  }

  // Step 5: 面积保护 —— 如果背景面积超过 70%，说明轮廓有严重缺口导致渗透，回退不检测
  let bgPixelCount = 0;
  for (let i = 0; i < isBgArea.length; i++) {
    if (isBgArea[i]) bgPixelCount++;
  }
  const bgRatio = bgPixelCount / (width * height);
  const MAX_BG_RATIO = 0.7;

  if (bgRatio > MAX_BG_RATIO) {
    // 渗透检测触发，回退：不清除任何背景
    console.log('[PerlerEngine] 背景检测回退: 背景面积占比过高', { bgRatio: bgRatio.toFixed(2), threshold: MAX_BG_RATIO });
    isBgArea.fill(0);
    bgPixelCount = 0;
  } else {
    // 正常应用背景标记
    for (let i = 0; i < beads.length; i++) {
      if (isBgArea[i]) {
        beads[i].isEmpty = true;
      }
    }
    console.log('[PerlerEngine] 背景检测完成 (Flood Fill + 形态学闭运算):', {
      bgColor,
      bgPixelCount,
      bgRatio: bgRatio.toFixed(2),
      threshold: bgThreshold,
    });
  }

  // 统计颜色
  const colorCount = new Map<string, number>();
  for (const bead of beads) {
    if (!bead.isEmpty && bead.color) {
      colorCount.set(bead.color.code, (colorCount.get(bead.color.code) || 0) + 1);
    }
  }

  // Generate color statistics
  const colorStats = Array.from(colorCount.entries())
    .map(([code, count]) => ({
      color: MARD_221_PALETTE.find(c => c.code === code)!,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  return { beads, width, height, colorStats };
}

/**
 * 边缘检测 - Sobel 算子
 * 检测图像中的边缘，用于后续轮廓强化
 */
// Load image from URL or dataURL
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Render pattern to canvas (千岛风格 - 专业图纸)
export function renderPattern(
  pattern: PerlerPattern,
  canvas: HTMLCanvasElement,
  options: {
    beadSize?: number;
    showGrid?: boolean;
    showLabels?: boolean;
    showColorCodes?: boolean; // 是否显示色号代号
  } = {}
) {
  const { beadSize = 20, showGrid = true, showLabels = true, showColorCodes = true } = options;
  const { beads, width, height, colorStats } = pattern;

  // 计算画布尺寸（包含坐标标签和底部色号清单）
  const labelSize = 30; // 坐标标签区域
  const topMargin = 40; // 顶部标题区域
  
  // 动态计算色号清单所需高度
  const sampleSize = 20;
  const sampleGap = 10;
  const itemsPerRow = Math.floor((width * beadSize + labelSize - 100) / (sampleSize + 60));
  const colorRows = Math.ceil(colorStats.length / Math.max(1, itemsPerRow));
  const colorListHeight = 30 + colorRows * (sampleSize + 10) + 10; // 标题 + 色号行 + 边距
  
  canvas.width = width * beadSize + labelSize;
  canvas.height = height * beadSize + labelSize + colorListHeight + topMargin;

  const ctx = canvas.getContext("2d")!;
  
  // 背景白色
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 标题信息
  ctx.fillStyle = "#2D2A26";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const totalBeads = colorStats.reduce((sum, s) => sum + s.count, 0);
  ctx.fillText(`拼豆图纸  ${width}x${height}  ${totalBeads}颗豆子`, 10, 10);

  // 绘制网格和色块
  for (const bead of beads) {
    const x = bead.col * beadSize + labelSize;
    const y = bead.row * beadSize + labelSize + topMargin;

    if (bead.isEmpty || !bead.color) {
      // 空格子
      ctx.fillStyle = "#F5F5F5";
      ctx.fillRect(x, y, beadSize, beadSize);
    } else {
      // 色块
      ctx.fillStyle = bead.color.hex;
      ctx.fillRect(x, y, beadSize, beadSize);
      
      // 显示色号代号
      if (showColorCodes && beadSize >= 15) {
        // 根据背景色深浅决定文字颜色
        const hex = bead.color.hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        
        ctx.fillStyle = brightness > 128 ? "#000000" : "#FFFFFF";
        ctx.font = `bold ${Math.max(8, beadSize * 0.35)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(bead.color.code, x + beadSize / 2, y + beadSize / 2);
      }
    }

    // 绘制网格线
    if (showGrid) {
      // 每 5 格一条粗线
      const isMajorRow = (bead.row + 1) % 5 === 0;
      const isMajorCol = (bead.col + 1) % 5 === 0;
      
      ctx.strokeStyle = isMajorRow || isMajorCol ? "#999999" : "#E0E0E0";
      ctx.lineWidth = isMajorRow || isMajorCol ? 1.5 : 0.5;
      ctx.strokeRect(x, y, beadSize, beadSize);
    }
  }

  // 绘制坐标标签（顶部和左侧）
  if (showLabels) {
    ctx.fillStyle = "#666666";
    ctx.font = "10px monospace";
    
    // 顶部坐标（列号）
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    for (let x = 0; x < width; x++) {
      // 每 5 格显示一个数字
      if ((x + 1) % 5 === 0 || x === 0) {
        ctx.fillText(String(x + 1), x * beadSize + labelSize + beadSize / 2, labelSize + topMargin - 5);
      }
    }

    // 左侧坐标（行号）
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = 0; y < height; y++) {
      // 每 5 格显示一个数字
      if ((y + 1) % 5 === 0 || y === 0) {
        ctx.fillText(String(y + 1), labelSize - 5, y * beadSize + labelSize + topMargin + beadSize / 2);
      }
    }
  }

  // 绘制底部色号清单
  const colorListY = height * beadSize + labelSize + topMargin + 20;
  ctx.fillStyle = "#2D2A26";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("色号清单:", 10, colorListY);

  // 绘制色号样本和数量
  let currentX = 10;
  let currentY = colorListY + 25;

  for (const stat of colorStats) {
    if (!stat.color) continue;
    
    // 色号样本
    ctx.fillStyle = stat.color.hex;
    ctx.fillRect(currentX, currentY, sampleSize, sampleSize);
    ctx.strokeStyle = "#CCCCCC";
    ctx.lineWidth = 1;
    ctx.strokeRect(currentX, currentY, sampleSize, sampleSize);
    
    // 色号代号和数量
    ctx.fillStyle = "#2D2A26";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${stat.color.code} x${stat.count}`, currentX + sampleSize + 5, currentY + sampleSize / 2);
    
    currentX += sampleSize + 60;
    
    // 换行
    if (currentX > canvas.width - 100) {
      currentX = 10;
      currentY += sampleSize + 10;
    }
  }
}

// Download pattern as PNG
export function downloadPatternImage(
  pattern: PerlerPattern,
  filename: string = "perler-pattern.png"
) {
  const canvas = document.createElement("canvas");
  renderPattern(pattern, canvas, { beadSize: 24, showGrid: true, showLabels: true });

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// Download color list as text
export function downloadColorList(
  pattern: PerlerPattern,
  filename: string = "color-list.txt"
) {
  const lines = ["拼豆色号清单", "============", ""];
  
  for (const stat of pattern.colorStats) {
    if (stat.color) {
      lines.push(`${stat.color.code} - ${stat.color.name}: ${stat.count}颗`);
    }
  }
  
  lines.push("");
  lines.push(`总计: ${pattern.colorStats.reduce((sum, s) => sum + s.count, 0)}颗`);
  lines.push(`图纸尺寸: ${pattern.width} x ${pattern.height}`);

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// 导出所有函数
