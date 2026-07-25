import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// 火山引擎即梦 AI API 配置
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

async function submitJimengTask(imageUrl: string, prompt: string, accessKey: string, secretKey: string): Promise<{ success: boolean; taskId?: string; error?: string }> {
  const crypto = require("crypto");
  
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  
  const body = JSON.stringify({
    req_key: "jimeng_i2i_v40",
    image_urls: [imageUrl],
    prompt: prompt,
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
      req_key: "jimeng_i2i_v40",
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
      console.error("[GenerateAPI] 任务失败:", result);
      return null;
    }
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, prompt: userPrompt, subjectDesc } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    const accessKey = process.env.JIMENG_ACCESS_KEY;
    const secretKey = process.env.JIMENG_SECRET_KEY;

    if (!accessKey || !secretKey) {
      return NextResponse.json(
        { error: "AI 服务未配置，请联系管理员设置 JIMENG_ACCESS_KEY 和 JIMENG_SECRET_KEY" },
        { status: 503 }
      );
    }

    // Build a comprehensive prompt for low-pixel cartoon style
    const basePrompt = userPrompt || 
      `【强制要求】生成像素风格图像，专为拼豆手工制作设计：
      
      核心风格：Q 版大头小身体（chibi 风格），专为拼豆图纸设计
      
      设计原则（拼豆可拼性 > 还原度）：
      - 只抓核心要素：脸型轮廓、发型、眼睛、嘴巴、主要服装色块
      - 忽略细节：不要毛孔、皱纹、衣物纹理、配饰细节
      - 每个特征用 1-2 个纯色块表示，不要渐变
      
      构图要求：
      - 大头小身体：头部占画面 50-60%，身体占 20-30%
      - 头部简化为圆形或椭圆形，不要复杂脸型
      - 眼睛：大而简单，2 个黑色圆点或椭圆，占头部 1/4
      - 嘴巴：一条简单弧线或省略
      - 发型：用 1-2 个大色块概括，不要发丝细节
      - 服装：用 1-2 个纯色块，不要图案和纹理
      
      技术要求：
      - 透明背景（alpha 通道为 0），不要任何背景色
      - 粗黑色轮廓线（2-3 像素宽）勾勒主体
      - 绝对纯色块，无渐变、无抗锯齿、无阴影
      - 颜色数量限制在 4-8 种（越少越好）
      - 主体居中，占画面 70-80%
      - 每个色块至少 8×8 像素，不要有小于 8×8 的细节
      - 整体效果应该像一个 32×32 的像素画
      
      禁止事项：
      - 禁止写实风格、照片质感
      - 禁止小细节（小于 8 像素的元素）
      - 禁止渐变、模糊、抗锯齿、阴影
      - 禁止复杂纹理、图案、装饰
      - 禁止超过 8 种颜色
      - 禁止复杂背景
      
      参考风格：Q 版表情包、chibi 贴纸、简单像素头像`;

    const fullPrompt = subjectDesc 
      ? `${basePrompt}\n\nSubject description: ${subjectDesc}`
      : basePrompt;

    console.log("[GenerateAPI] 开始 AI 重构:", { imageUrl });

    // 提交任务
    const submitResult = await submitJimengTask(imageUrl, fullPrompt, accessKey, secretKey);
    
    if (!submitResult.success) {
      throw new Error(submitResult.error || "提交任务失败");
    }

    const taskId = submitResult.taskId;
    if (!taskId) {
      throw new Error("提交任务失败：未获取到 task_id");
    }
    console.log("[GenerateAPI] 任务已提交:", taskId);

    // 轮询获取结果
    const resultImageUrl = await pollJimengResult(taskId, accessKey, secretKey);
    
    if (!resultImageUrl) {
      throw new Error("AI 重构失败：未获取到结果");
    }

    console.log("[GenerateAPI] AI 重构完成:", resultImageUrl);

    return NextResponse.json({ 
      success: true, 
      imageUrl: resultImageUrl,
      prompt: fullPrompt 
    });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 });
  }
}
