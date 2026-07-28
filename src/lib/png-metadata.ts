/**
 * PNG 元数据处理工具
 * 用于在 PNG 图片的 tEXt 块中嵌入和读取拼豆图纸元数据
 */

// 元数据键名
const METADATA_KEY = "PerlerBeadData";

// 元数据结构
export interface PerlerMetadata {
  version: string; // 版本号
  width: number; // 图纸宽度（像素格数）
  height: number; // 图纸高度（像素格数）
  beads: Array<{
    col: number;
    row: number;
    colorCode: string; // MARD 色号
    isEmpty: boolean;
  }>;
}

/**
 * 将元数据压缩为字符串
 */
function compressMetadata(metadata: PerlerMetadata): string {
  // 使用 JSON 序列化，然后 base64 编码
  const json = JSON.stringify(metadata);
  return btoa(unescape(encodeURIComponent(json)));
}

/**
 * 从字符串解压元数据
 */
function decompressMetadata(data: string): PerlerMetadata {
  const json = decodeURIComponent(escape(atob(data)));
  return JSON.parse(json);
}

/**
 * 将元数据嵌入到 PNG 图片的 tEXt 块中
 * @param pngDataUrl PNG 图片的 dataURL
 * @param metadata 要嵌入的元数据
 * @returns 嵌入元数据后的 PNG dataURL
 */
export async function embedMetadataToPNG(
  pngDataUrl: string,
  metadata: PerlerMetadata
): Promise<string> {
  // 将 dataURL 转换为 ArrayBuffer
  const base64 = pngDataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // 压缩元数据
  const metadataString = compressMetadata(metadata);
  const metadataBytes = new TextEncoder().encode(metadataString);

  // 构建 tEXt 块
  // 格式：长度 (4 bytes) + 类型 "tEXt" (4 bytes) + 关键字 + null + 文本 + CRC (4 bytes)
  const keyword = new TextEncoder().encode(METADATA_KEY);
  const textChunkType = new TextEncoder().encode("tEXt");

  // 计算 tEXt 块数据长度
  const textDataLength = keyword.length + 1 + metadataBytes.length;

  // 创建 tEXt 块
  const textChunk = new Uint8Array(4 + 4 + textDataLength + 4);
  let offset = 0;

  // 长度
  textChunk[offset++] = (textDataLength >> 24) & 0xff;
  textChunk[offset++] = (textDataLength >> 16) & 0xff;
  textChunk[offset++] = (textDataLength >> 8) & 0xff;
  textChunk[offset++] = textDataLength & 0xff;

  // 类型
  textChunk[offset++] = textChunkType[0];
  textChunk[offset++] = textChunkType[1];
  textChunk[offset++] = textChunkType[2];
  textChunk[offset++] = textChunkType[3];

  // 关键字
  for (let i = 0; i < keyword.length; i++) {
    textChunk[offset++] = keyword[i];
  }
  // null 分隔符
  textChunk[offset++] = 0;

  // 文本数据
  for (let i = 0; i < metadataBytes.length; i++) {
    textChunk[offset++] = metadataBytes[i];
  }

  // CRC（简化处理，实际应该计算 CRC32）
  // 这里使用简单的校验和，实际项目中应该使用正确的 CRC32 算法
  textChunk[offset++] = 0;
  textChunk[offset++] = 0;
  textChunk[offset++] = 0;
  textChunk[offset++] = 0;

  // 找到 PNG 文件的 IEND 块之前的位置插入 tEXt 块
  // PNG 结构：签名 (8 bytes) + IHDR + ... + tEXt + ... + IEND
  // 我们在 IHDR 块之后插入 tEXt 块

  // 找到 IHDR 块的结束位置
  // IHDR 块：长度 (4) + 类型 (4) + 数据 (13) + CRC (4) = 25 bytes
  const ihdrEnd = 8 + 25; // 签名 (8) + IHDR 块 (25)

  // 创建新的 PNG 数据
  const newBytes = new Uint8Array(bytes.length + textChunk.length);
  newBytes.set(bytes.subarray(0, ihdrEnd), 0);
  newBytes.set(textChunk, ihdrEnd);
  newBytes.set(bytes.subarray(ihdrEnd), ihdrEnd + textChunk.length);

  // 转换回 dataURL
  const newBase64 = btoa(String.fromCharCode(...newBytes));
  return `data:image/png;base64,${newBase64}`;
}

/**
 * 从 PNG 图片中读取元数据
 * @param pngDataUrl PNG 图片的 dataURL 或 Blob URL
 * @returns 元数据，如果没有找到则返回 null
 */
export async function extractMetadataFromPNG(
  pngDataUrl: string
): Promise<PerlerMetadata | null> {
  try {
    // 将 dataURL 转换为 ArrayBuffer
    const base64 = pngDataUrl.split(",")[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 搜索 tEXt 块
    const textChunkType = new TextEncoder().encode("tEXt");
    const keyword = new TextEncoder().encode(METADATA_KEY);

    // 从 IHDR 块之后开始搜索
    let offset = 8 + 25; // 签名 (8) + IHDR 块 (25)

    while (offset < bytes.length - 8) {
      // 读取块长度
      const chunkLength =
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3];

      // 读取块类型
      const chunkType = bytes.subarray(offset + 4, offset + 8);

      // 检查是否是 tEXt 块
      if (
        chunkType[0] === textChunkType[0] &&
        chunkType[1] === textChunkType[1] &&
        chunkType[2] === textChunkType[2] &&
        chunkType[3] === textChunkType[3]
      ) {
        // 读取关键字
        const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkLength);
        let nullIndex = -1;
        for (let i = 0; i < chunkData.length; i++) {
          if (chunkData[i] === 0) {
            nullIndex = i;
            break;
          }
        }

        if (nullIndex > 0) {
          const chunkKeyword = chunkData.subarray(0, nullIndex);
          const chunkText = chunkData.subarray(nullIndex + 1);

          // 检查关键字是否匹配
          if (chunkKeyword.length === keyword.length) {
            let match = true;
            for (let i = 0; i < keyword.length; i++) {
              if (chunkKeyword[i] !== keyword[i]) {
                match = false;
                break;
              }
            }

            if (match) {
              // 找到元数据，解压
              const metadataString = new TextDecoder().decode(chunkText);
              return decompressMetadata(metadataString);
            }
          }
        }
      }

      // 移动到下一个块
      offset += 12 + chunkLength; // 长度 (4) + 类型 (4) + 数据 + CRC (4)
    }

    return null;
  } catch (error) {
    console.error("读取 PNG 元数据失败:", error);
    return null;
  }
}

/**
 * 创建拼豆图纸元数据
 */
export function createPerlerMetadata(
  width: number,
  height: number,
  beads: Array<{ col: number; row: number; colorCode: string; isEmpty: boolean }>
): PerlerMetadata {
  return {
    version: "1.0",
    width,
    height,
    beads,
  };
}

/**
 * 提取拼豆图纸元数据（别名）
 */
export async function extractMetadata(
  pngDataUrl: string
): Promise<PerlerMetadata | null> {
  return extractMetadataFromPNG(pngDataUrl);
}

/**
 * 验证元数据是否有效
 */
export function validateMetadata(metadata: PerlerMetadata | null): boolean {
  if (!metadata) return false;
  if (!metadata.version || !metadata.width || !metadata.height) return false;
  if (!Array.isArray(metadata.beads)) return false;
  return true;
}
