/**
 * PNG 元数据处理工具
 * 用于在 PNG 图片的 tEXt 块中嵌入和读取拼豆图纸元数据
 * 使用 base64 编码存储元数据
 */

// 元数据键名
const METADATA_KEY = "PerlerBeadData";

// CRC32 查找表
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc;
  }
  return table;
})();

// 计算 CRC32
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// 元数据结构
export interface PerlerMetadata {
  version: string; // 版本号
  width: number; // 图纸宽度（像素格数）
  height: number; // 图纸高度（像素格数）
  beads: string[]; // 色号序列（按行优先顺序，长度 = width * height）
}

/**
 * 将元数据压缩为字符串
 * 使用 base64 编码
 */
function compressMetadata(metadata: PerlerMetadata): string {
  const json = JSON.stringify(metadata);
  // 使用 base64 编码
  return btoa(unescape(encodeURIComponent(json)));
}

/**
 * 从字符串解压元数据
 */
function decompressMetadata(data: string): PerlerMetadata {
  try {
    const json = decodeURIComponent(escape(atob(data)));
    return JSON.parse(json);
  } catch {
    throw new Error("元数据解析失败，请确认图纸是由本工具生成的");
  }
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
  console.log("[Embed] 元数据字符串长度:", metadataString.length);
  console.log("[Embed] 元数据前 100 字符:", metadataString.substring(0, 100));
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

  // CRC32（计算类型 + 数据的 CRC）
  const crcData = new Uint8Array(4 + textDataLength);
  crcData.set(textChunkType, 0);
  crcData.set(textChunk.subarray(8, 8 + textDataLength), 4);
  const crc = crc32(crcData);
  textChunk[offset++] = (crc >> 24) & 0xff;
  textChunk[offset++] = (crc >> 16) & 0xff;
  textChunk[offset++] = (crc >> 8) & 0xff;
  textChunk[offset++] = crc & 0xff;

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

  // 转换回 dataURL（分块处理避免栈溢出）
  let newBase64 = "";
  const chunkSize = 8192;
  for (let i = 0; i < newBytes.length; i += chunkSize) {
    const chunk = newBytes.subarray(i, Math.min(i + chunkSize, newBytes.length));
    newBase64 += String.fromCharCode(...chunk);
  }
  newBase64 = btoa(newBase64);
  const result = `data:image/png;base64,${newBase64}`;
  console.log("[Embed] 嵌入完成，新 PNG 大小:", result.length);
  return result;
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
    console.log("[Extract] 图片大小:", bytes.length, "bytes");
    console.log("[Extract] 搜索关键字:", METADATA_KEY);

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
        console.log("[Extract] 找到 tEXt 块，长度:", chunkLength);
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
          console.log("[Extract] 块关键字长度:", chunkKeyword.length, "期望:", keyword.length);
          if (chunkKeyword.length === keyword.length) {
            let match = true;
            for (let i = 0; i < keyword.length; i++) {
              if (chunkKeyword[i] !== keyword[i]) {
                match = false;
                break;
              }
            }
            console.log("[Extract] 关键字匹配:", match);

            if (match) {
              // 找到元数据，解压
              const metadataString = new TextDecoder().decode(chunkText);
              console.log("[Extract] 解压前字符串长度:", metadataString.length);
              const result = decompressMetadata(metadataString);
              console.log("[Extract] 解压结果:", result);
              return result;
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
  beads: string[]
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
