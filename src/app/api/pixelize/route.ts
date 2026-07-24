import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/pixelize - 使用即梦 AI 4.0 将卡通图转化为拼豆图纸
 * 
 * 使用火山引擎即梦 AI 4.0 模型（jimeng_i2i_v40）
 * 将 AI 重构的卡通图转化为像素风格的拼豆图纸
 * 
 * 请求参数:
 * - imageUrl: 卡通图 URL
 * - style: 像素化风格（默认 "pixel_art"）
 * 
 * 返回:
 * - pixelizedUrl: 像素化后的图片 URL
 * 
 * 注意：需要配置 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY 环境变量
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, style: _style = "pixel_art" } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "缺少 imageUrl 参数" },
        { status: 400 }
      );
    }

    const accessKey = process.env.JIMENG_ACCESS_KEY;
    const secretKey = process.env.JIMENG_SECRET_KEY;

    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { error: "即梦 AI 服务未配置，请联系管理员设置 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY" },
        { status: 503 }
      );
    }

    console.log("[PixelizeAPI] 开始像素化:", { imageUrl });

    // 即梦 AI 4.0 图生图 - 提交任务
    const submitResponse = await submitJimengTask(imageUrl, accessKey, secretKey);
    
    if (!submitResponse.success) {
      throw new Error(submitResponse.error || "提交任务失败");
    }

    const taskId = submitResponse.taskId;
    if (!taskId) {
      throw new Error("提交任务失败：未获取到 task_id");
    }
    console.log("[PixelizeAPI] 任务已提交:", taskId);

    // 轮询获取结果
    const resultUrl = await pollJimengResult(taskId, accessKey, secretKey);
    
    if (!resultUrl) {
      throw new Error("即梦 AI 像素化失败：未获取到结果");
    }

    console.log("[PixelizeAPI] 像素化完成:", resultUrl);

    return NextResponse.json({
      pixelizedUrl: resultUrl,
    });
  } catch (error) {
    console.error("[PixelizeAPI] 像素化失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "像素化失败" },
      { status: 500 }
    );
  }
}

// 即梦 AI API 配置
const JIMENG_ENDPOINT = "https://visual.volcengineapi.com";
const JIMENG_REGION = "cn-north-1";
const JIMENG_SERVICE = "cv";

// 火山引擎签名生成
function sign(key: string | Buffer, msg: string): Buffer {
  const crypto = require("crypto");
  return crypto.createHmac("sha256", key).update(msg).digest();
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = sign(secretKey, dateStamp);
  const kRegion = sign(kDate, region);
  const kService = sign(kRegion, service);
  const kSigning = sign(kService, "request");
  return kSigning;
}

async function submitJimengTask(imageUrl: string, accessKey: string, secretKey: string): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const crypto = require("crypto");
  
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  
  const body = JSON.stringify({
    req_key: "jimeng_i2i_v30",
    image_urls: [imageUrl],
    prompt: "Chibi 风格，白色背景，像素艺术，16-bit 复古游戏美学，高对比度，清晰线条，细节丰富的像素艺术，减少颜色数量，简化形状。关键细节：眼睛要有眼白、瞳孔、高光三层结构，嘴巴连贯，边缘黑色连续勾勒，纯色块填充，有限色板（8-12 种颜色），扁平化设计，无渐变",
    width: 512,
    height: 512,
  });

  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  
  const canonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-date";
  const canonicalRequest = `POST\n/\nAction=CVSync2AsyncSubmitTask&Version=2022-08-31\n${canonicalHeaders}\n${signedHeaders}\n${bodyHash}`;
  
  const credentialScope = `${dateStamp}/${JIMENG_REGION}/${JIMENG_SERVICE}/request`;
  const stringToSign = `HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
  
  const signingKey = getSignatureKey(secretKey, dateStamp, JIMENG_REGION, JIMENG_SERVICE);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  
  const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(
    `${JIMENG_ENDPOINT}/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Host": "visual.volcengineapi.com",
        "X-Date": amzDate,
        "Authorization": authorization,
      },
      body,
    }
  );

  const result = await response.json();
  
  if (result.code !== 10000) {
    return { success: false, error: `提交任务失败: ${result.message}` };
  }

  return { success: true, taskId: result.data?.task_id };
}

async function pollJimengResult(taskId: string, accessKey: string, secretKey: string, maxAttempts = 30): Promise<string | null> {
  const crypto = require("crypto");
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待 2 秒
    
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    
    const body = JSON.stringify({
      req_key: "jimeng_i2i_v30",
      task_id: taskId,
    });

    const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
    
    const canonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-date:${amzDate}\n`;
    const signedHeaders = "content-type;host;x-date";
    const canonicalRequest = `POST\n/\nAction=CVSync2AsyncGetResult&Version=2022-08-31\n${canonicalHeaders}\n${signedHeaders}\n${bodyHash}`;
    
    const credentialScope = `${dateStamp}/${JIMENG_REGION}/${JIMENG_SERVICE}/request`;
    const stringToSign = `HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
    
    const signingKey = getSignatureKey(secretKey, dateStamp, JIMENG_REGION, JIMENG_SERVICE);
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    
    const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(
      `${JIMENG_ENDPOINT}/?Action=CVSync2AsyncGetResult&Version=2022-08-31`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Host": "visual.volcengineapi.com",
          "X-Date": amzDate,
          "Authorization": authorization,
        },
        body,
      }
    );

    const result = await response.json();
    
    if (result.code === 10000 && result.data?.status === "done") {
      return result.data?.image_urls?.[0] || null;
    }
    
    if (result.code === 10000 && result.data?.status === "failed") {
      console.error("[PixelizeAPI] 任务失败:", result);
      return null;
    }
  }
  
  return null;
}
