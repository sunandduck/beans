import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// 火山方舟 API 配置（多模态图像理解）
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const ARK_MODEL = "doubao-seed-2-1-turbo-260628";

// 火山引擎即梦 AI API 配置（文生图）
const JIMENG_ACCESS_KEY = process.env.JIMENG_ACCESS_KEY;
const JIMENG_SECRET_KEY = process.env.JIMENG_SECRET_KEY;
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
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.7
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

    console.log("图片描述:", description);
    return { success: true, description };
  } catch (error) {
    return { success: false, error: `方舟 API 调用异常：${error}` };
  }
}

// 步骤 2：调用智能绘图图生图模型生成 Q 版卡通
async function generateCartoon(imageUrl: string, description: string, style: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
    return { success: false, error: "未配置火山引擎密钥" };
  }

  const crypto = require("crypto");
  
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  
  // 构建 prompt：Q 版卡通风格 + 图片描述
  const prompt = `Q 版卡通风格，大头小身体，纯色块，简洁线条，可爱风格，${description}`;
  
  const body = JSON.stringify({
    req_key: "jimeng_t2i_v40",
    image_urls: [imageUrl],
    prompt: prompt,
    seed: -1,
    scale: 7.0,
    ddim_steps: 20,
    return_url: true,
    force_single: true,
  });

  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  
  const canonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-content-sha256:${bodyHash}\nx-date:${amzDate}`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = `POST\n/\nAction=CVSync2AsyncSubmitTask&Version=2022-08-31\n${canonicalHeaders}\n\n${signedHeaders}\n${bodyHash}`;
  
  const credentialScope = `${dateStamp}/${JIMENG_REGION}/${JIMENG_SERVICE}/request`;
  const stringToSign = `HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
  
  const signingKey = getSignatureKey(JIMENG_SECRET_KEY, dateStamp, JIMENG_REGION, JIMENG_SERVICE);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  
  const authorization = `HMAC-SHA256 Credential=${JIMENG_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
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
    console.log("提交任务结果:", result);
    
    if (result.code !== 10000) {
      return { success: false, error: `提交任务失败：${result.message}` };
    }

    const taskId = result.data?.task_id;
    if (!taskId) {
      return { success: false, error: "未获取到任务 ID" };
    }

    // 轮询结果
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const now2 = new Date();
      const dateStamp2 = now2.toISOString().slice(0, 10).replace(/-/g, "");
      const amzDate2 = now2.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      
      const pollBody = JSON.stringify({
        req_key: "high_aes_general_v20_L",
        task_id: taskId,
      });

      const pollBodyHash = crypto.createHash("sha256").update(pollBody).digest("hex");
      
      const pollCanonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-date:${amzDate2}`;
      const pollSignedHeaders = "content-type;host;x-date";
      const pollCanonicalRequest = `POST\n/\nAction=CVSync2AsyncGetResult&Version=2022-08-31\n${pollCanonicalHeaders}\n\n${pollSignedHeaders}\n${pollBodyHash}`;
      
      const pollCredentialScope = `${dateStamp2}/${JIMENG_REGION}/${JIMENG_SERVICE}/request`;
      const pollStringToSign = `HMAC-SHA256\n${amzDate2}\n${pollCredentialScope}\n${crypto.createHash("sha256").update(pollCanonicalRequest).digest("hex")}`;
      
      const pollSigningKey = getSignatureKey(JIMENG_SECRET_KEY, dateStamp2, JIMENG_REGION, JIMENG_SERVICE);
      const pollSignature = crypto.createHmac("sha256", pollSigningKey).update(pollStringToSign).digest("hex");
      
      const pollAuthorization = `HMAC-SHA256 Credential=${JIMENG_ACCESS_KEY}/${pollCredentialScope}, SignedHeaders=${pollSignedHeaders}, Signature=${pollSignature}`;

      const pollResponse = await fetch(
        `${JIMENG_ENDPOINT}/?Action=CVSync2AsyncGetResult&Version=2022-08-31`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Host": "visual.volcengineapi.com",
            "X-Date": amzDate2,
            "Authorization": pollAuthorization,
          },
          body: pollBody,
        }
      );

      const pollResult = await pollResponse.json();

      if (pollResult.code === 10000 && pollResult.data?.status === "done") {
        // 优先使用 image_urls，如果没有则使用 binary_data_base64
        const imageUrl = pollResult.data?.image_urls?.[0];
        if (imageUrl) {
          return { success: true, imageUrl };
        }
        
        // 处理 base64 图片
        const base64Data = pollResult.data?.binary_data_base64?.[0];
        if (base64Data) {
          // 将 base64 转换为 data URL
          const dataUrl = `data:image/jpeg;base64,${base64Data}`;
          return { success: true, imageUrl: dataUrl };
        }
      } else if (pollResult.code !== 10000 && pollResult.data?.status !== "in_queue" && pollResult.data?.status !== "processing" && pollResult.data?.status !== "generating") {
        // 任务失败
        return { success: false, error: `获取结果失败：${pollResult.message || pollResult.data?.status}` };
      }
    }

    return { success: false, error: "任务超时" };
  } catch (error) {
    console.error("生成卡通异常:", error);
    return { success: false, error: `生成卡通异常：${error}` };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, style } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "缺少图片 URL" },
        { status: 400 }
      );
    }

    console.log("[GenerateAPI] 开始 AI 卡通化:", { imageUrl, style });

    // 步骤 1：分析图片
    const analyzeResult = await analyzeImage(imageUrl);
    if (!analyzeResult.success) {
      console.error("[GenerateAPI] 分析图片失败:", analyzeResult.error);
      return NextResponse.json(
        { error: analyzeResult.error },
        { status: 500 }
      );
    }

    console.log("[GenerateAPI] 图片描述:", analyzeResult.description);

    // 步骤 2：生成卡通
    const generateResult = await generateCartoon(imageUrl, analyzeResult.description!, style);
    if (!generateResult.success) {
      console.error("[GenerateAPI] 生成卡通失败:", generateResult.error);
      return NextResponse.json(
        { error: generateResult.error },
        { status: 500 }
      );
    }

    console.log("[GenerateAPI] 卡通图片 URL:", generateResult.imageUrl);

    return NextResponse.json({
      success: true,
      imageUrl: generateResult.imageUrl,
    });
  } catch (error) {
    console.error("[GenerateAPI] 处理失败:", error);
    return NextResponse.json(
      { error: "处理失败，请稍后重试" },
      { status: 500 }
    );
  }
}
