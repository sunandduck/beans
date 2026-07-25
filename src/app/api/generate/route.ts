import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// 火山方舟 API 配置（多模态图像理解）
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const ARK_MODEL = "doubao-seed-2-1-turbo-260628";

// 火山引擎即梦 AI API 配置（文生图）
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

// 步骤 1：调用火山方舟多模态模型分析图片
async function analyzeImage(imageUrl: string): Promise<{ success: boolean; description?: string; error?: string }> {
  if (!ARK_API_KEY) {
    return { success: false, error: "未配置 ARK_API_KEY 环境变量" };
  }

  try {
    const response = await fetch(ARK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "请详细描述这张图片的内容，包括：人物外貌特征（脸型、发型、发色）、服装颜色和款式、表情、姿势、背景环境、主要颜色等。描述要简洁清晰，适合用于生成 Q 版卡通形象。"
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `方舟 API 调用失败：${response.status} - ${errorText}` };
    }

    const result = await response.json();
    const description = result.choices?.[0]?.message?.content;
    
    if (!description) {
      return { success: false, error: "未获取到图片描述" };
    }

    return { success: true, description };
  } catch (error) {
    return { success: false, error: `方舟 API 调用异常：${error}` };
  }
}

// 步骤 2：调用即梦文生图模型生成 Q 版卡通
async function generateCartoon(description: string, style: string, accessKey: string, secretKey: string): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const crypto = require("crypto");
  
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  
  // 构建 prompt：Q 版卡通风格 + 图片描述
  const prompt = `Q 版卡通风格，大头小身体，纯色块，简洁线条，可爱风格，${description}`;
  
  const body = JSON.stringify({
    req_key: "jimeng_t2i_v30",
    prompt: prompt,
    width: 512,
    height: 512,
    seed: -1,
  });

  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  
  const canonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-content-sha256:${bodyHash}\nx-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
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
        "X-Content-Sha256": bodyHash,
        "X-Date": amzDate,
        "Authorization": authorization,
      },
      body,
    }
  );

  const result = await response.json();
  
  if (result.code !== 10000) {
    return { success: false, error: `提交任务失败：${result.message}` };
  }

  return { success: true, taskId: result.data?.task_id };
}

async function pollJimengResult(taskId: string, accessKey: string, secretKey: string, maxAttempts = 60): Promise<string | null> {
  const crypto = require("crypto");
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
    const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    
    const body = JSON.stringify({
      req_key: "jimeng_t2i_v30",
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
    
    if (result.code === 10000 && result.data?.images?.[0]?.url) {
      return result.data.images[0].url;
    }
    
    if (result.data?.status === "failed") {
      return null;
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrl, style } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "缺少图片 URL" },
        { status: 400 }
      );
    }

    // 步骤 1：分析图片，生成文字描述
    const analysisResult = await analyzeImage(imageUrl);
    
    if (!analysisResult.success) {
      return NextResponse.json(
        { error: analysisResult.error || "图片分析失败" },
        { status: 500 }
      );
    }

    const description = analysisResult.description;

    // 步骤 2：根据描述生成 Q 版卡通图
    const accessKey = process.env.JIMENG_ACCESS_KEY;
    const secretKey = process.env.JIMENG_SECRET_KEY;

    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { error: "未配置火山引擎 API 密钥" },
        { status: 500 }
      );
    }

    const submitResult = await generateCartoon(description, style, accessKey, secretKey);
    
    if (!submitResult.success || !submitResult.taskId) {
      return NextResponse.json(
        { error: submitResult.error || "提交任务失败" },
        { status: 500 }
      );
    }

    // 轮询获取结果
    const resultUrl = await pollJimengResult(submitResult.taskId, accessKey, secretKey);
    
    if (!resultUrl) {
      return NextResponse.json(
        { error: "生成超时或失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: resultUrl,
      description: description,
    });
  } catch (error) {
    console.error("AI 生成错误:", error);
    return NextResponse.json(
      { error: "AI 生成失败" },
      { status: 500 }
    );
  }
}
