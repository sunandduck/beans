import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// 火山方舟 API 配置（多模态图像理解）
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
const ARK_MODEL = "doubao-seed-2-1-turbo-260628";

// 火山引擎即梦 AI API 配置（文生图）
const JIMENG_ACCESS_KEY = process.env.JIMENG_ACCESS_KEY;
const JIMENG_SECRET_KEY = process.env.JIMENG_SECRET_KEY;

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

// 步骤 2：调用即梦文生图模型生成 Q 版卡通
async function generateCartoon(description: string, style: string): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  if (!JIMENG_ACCESS_KEY || !JIMENG_SECRET_KEY) {
    return { success: false, error: "未配置火山引擎密钥" };
  }

  try {
    // 使用火山引擎官方 SDK
    const { Service } = await import('@volcengine/openapi');
    
    const service = new Service({
      host: 'visual.volcengineapi.com',
      region: 'cn-north-1',
      service: 'cv',
    });

    service.setAccessKeyId(JIMENG_ACCESS_KEY);
    service.setSecretKey(JIMENG_SECRET_KEY);

    // 构建 prompt：Q 版卡通风格 + 图片描述
    const prompt = `Q 版卡通风格，大头小身体，纯色块，简洁线条，可爱风格，${description}`;

    // 提交任务
    const submitResult = await service.fetch('CVSync2AsyncSubmitTask', {
      req_key: 'jimeng_t2i_v30',
      prompt: prompt,
      width: 512,
      height: 512,
      seed: -1,
    }, '2022-08-31', 'POST');

    console.log("提交任务结果:", submitResult);

    if (submitResult.code !== 10000) {
      return { success: false, error: `提交任务失败：${submitResult.message}` };
    }

    const taskId = submitResult.data?.task_id;
    if (!taskId) {
      return { success: false, error: "未获取到任务 ID" };
    }

    // 轮询结果
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pollResult = await service.fetch('CVSync2AsyncGetResult', {
        req_key: 'jimeng_t2i_v30',
        task_id: taskId,
      }, '2022-08-31', 'POST');

      console.log(`轮询 ${i + 1}:`, pollResult.code);

      if (pollResult.code === 10000) {
        const imageUrl = pollResult.data?.resp_data?.image_urls?.[0];
        if (imageUrl) {
          return { success: true, imageUrl };
        }
      } else if (pollResult.code !== 10002) {
        // 10002 表示任务进行中
        return { success: false, error: `获取结果失败：${pollResult.message}` };
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
    const generateResult = await generateCartoon(analyzeResult.description!, style);
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
