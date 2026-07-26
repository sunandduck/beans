import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// 火山引擎配置
const JIMENG_ACCESS_KEY = process.env.JIMENG_ACCESS_KEY;
const JIMENG_SECRET_KEY = process.env.JIMENG_SECRET_KEY;
const ARK_API_KEY = process.env.ARK_API_KEY;
const JIMENG_ENDPOINT = "https://visual.volcengineapi.com";
const JIMENG_REGION = "cn-north-1";
const JIMENG_SERVICE = "cv";

// 火山引擎签名
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

// 步骤1：用多模态模型理解图片，生成描述
async function understandImage(imageUrl: string): Promise<string> {
  if (!ARK_API_KEY) {
    throw new Error('未配置 ARK_API_KEY');
  }

  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'doubao-seed-2-1-turbo-260628',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请描述这张图片中的核心主体（人物或物体），只描述核心要素：脸型轮廓、发型、眼睛、嘴巴、主要服装色块。不要描述背景、环境、家具等。用简洁的中文描述。'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 500,
    }),
  });

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`图像理解失败: ${result.error.message}`);
  }

  return result.choices?.[0]?.message?.content || '一个可爱的卡通形象';
}

// 步骤2：用文生图 API 生成卡通图
async function generateCartoon(prompt: string): Promise<string> {
  if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
    throw new Error('未配置火山引擎密钥');
  }

  const crypto = require("crypto");
  const reqKey = "high_aes_general_v20_L";
  
  const requestBody = JSON.stringify({
    req_key: reqKey,
    prompt: prompt,
    seed: -1,
    scale: 7.0,
    ddim_steps: 20,
    width: 256,
    height: 256,
    return_url: true,
    force_single: true,
  });

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  
  const bodyHash = crypto.createHash("sha256").update(requestBody).digest("hex");
  const canonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-content-sha256:${bodyHash}\nx-date:${amzDate}`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = `POST\n/\nAction=CVSync2AsyncSubmitTask&Version=2022-08-31\n${canonicalHeaders}\n\n${signedHeaders}\n${bodyHash}`;
  
  const credentialScope = `${dateStamp}/${JIMENG_REGION}/${JIMENG_SERVICE}/request`;
  const stringToSign = `HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
  
  const signingKey = getSignatureKey(JIMENG_SECRET_KEY, dateStamp, JIMENG_REGION, JIMENG_SERVICE);
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `HMAC-SHA256 Credential=${JIMENG_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // 提交任务
  const submitResponse = await fetch(
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
      body: requestBody,
    }
  );

  const submitResult = await submitResponse.json();
  
  if (submitResult.code !== 10000) {
    throw new Error(`任务提交失败: ${submitResult.message}`);
  }

  const taskId = submitResult.data?.task_id;
  if (!taskId) {
    throw new Error('未获取到任务 ID');
  }

  // 轮询获取结果
  const maxPolls = 60;
  const pollInterval = 2000;
  
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const pollBody = JSON.stringify({
      req_key: reqKey,
      task_id: taskId,
    });
    
    const pollBodyHash = crypto.createHash("sha256").update(pollBody).digest("hex");
    const pollAmzDate = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    
    const pollCanonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-content-sha256:${pollBodyHash}\nx-date:${pollAmzDate}`;
    const pollCanonicalRequest = `POST\n/\nAction=CVSync2AsyncGetResult&Version=2022-08-31\n${pollCanonicalHeaders}\n\n${signedHeaders}\n${pollBodyHash}`;
    const pollStringToSign = `HMAC-SHA256\n${pollAmzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(pollCanonicalRequest).digest("hex")}`;
    const pollSignature = crypto.createHmac("sha256", signingKey).update(pollStringToSign).digest("hex");
    const pollAuthorization = `HMAC-SHA256 Credential=${JIMENG_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${pollSignature}`;

    const pollResponse = await fetch(
      `${JIMENG_ENDPOINT}/?Action=CVSync2AsyncGetResult&Version=2022-08-31`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Host": "visual.volcengineapi.com",
          "X-Content-Sha256": pollBodyHash,
          "X-Date": pollAmzDate,
          "Authorization": pollAuthorization,
        },
        body: pollBody,
      }
    );

    const pollResult = await pollResponse.json();
    console.log(`轮询 ${i + 1}: code=${pollResult.code}, status=${pollResult.data?.status}`);
    
    const taskStatus = pollResult.data?.status;
    
    if (taskStatus === 'done') {
      // 图片可能在 image_urls 或 binary_data_base64 中
      const imageUrl = pollResult.data?.image_urls?.[0];
      const imageBase64 = pollResult.data?.binary_data_base64?.[0];
      
      if (imageUrl) {
        // 下载图片并转换为 base64
        const imageResponse = await fetch(imageUrl);
        const imageBuffer = await imageResponse.arrayBuffer();
        return Buffer.from(imageBuffer).toString('base64');
      } else if (imageBase64) {
        // 已经是 base64
        return imageBase64;
      } else {
        throw new Error('未获取到生成的图片');
      }
    } else if (taskStatus === 'failed') {
      throw new Error(`任务执行失败: ${pollResult.data?.resp_data || '未知错误'}`);
    }
    // status === 'in_queue' 或 'generating': 继续轮询
  }

  throw new Error('任务超时');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, prompt: userPrompt, subjectDesc } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    // 步骤1：理解图片
    console.log('步骤1：理解图片...');
    const imageDescription = await understandImage(imageUrl);
    console.log('图片描述:', imageDescription);

    // 步骤2：构建完整的提示词
    const basePrompt = userPrompt || 
      `【强制要求】生成像素风格图像，专为拼豆手工制作设计：
      
      核心风格：Q版大头小身体（chibi 风格），专为拼豆图纸设计
      
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
      
      参考风格：Q版表情包、chibi 贴纸、简单像素头像`;

    const fullPrompt = subjectDesc 
      ? `${basePrompt}\n\nSubject description: ${imageDescription}\n${subjectDesc}`
      : `${basePrompt}\n\nSubject description: ${imageDescription}`;

    // 步骤3：生成卡通图
    console.log('步骤2：生成卡通图...');
    const imageBase64 = await generateCartoon(fullPrompt);
    console.log('卡通图生成完成');

    const resultImageUrl = `data:image/png;base64,${imageBase64}`;

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
