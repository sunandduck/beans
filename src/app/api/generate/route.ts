import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// 火山方舟配置（Seedream 5.0 Lite）
const ARK_API_KEY = process.env.ARK_API_KEY;
const ARK_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/images/generations";

// 拼豆图纸设计原则（与 87daa45 版本一致）
const BASE_PROMPT = `【强制要求】生成像素风格图像，专为拼豆手工制作设计：

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

// 生成卡通图（Seedream 5.0 Lite 图生图）
async function generateCartoon(imageBase64: string, prompt: string): Promise<string> {
  if (!ARK_API_KEY) {
    throw new Error('未配置 ARK_API_KEY');
  }

  const requestBody = {
    model: "doubao-seedream-5-0-260128",
    prompt: prompt,
    image: imageBase64,  // 传入原图作为参考（支持 data: URL 或 Base64）
    response_format: "b64_json",
    size: "1024x1024",
  };

  console.log('调用 Seedream 5.0 Lite 图生图 API...');
  
  const response = await fetch(ARK_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  const result = await response.json();
  
  if (result.error) {
    throw new Error(`生成失败: ${result.error.message || JSON.stringify(result.error)}`);
  }

  // 返回 base64 图片数据
  if (result.data?.[0]?.b64_json) {
    return result.data[0].b64_json;
  } else if (result.data?.[0]?.url) {
    // 如果是 URL，需要下载并转换为 base64
    const imageResponse = await fetch(result.data[0].url);
    const imageBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(imageBuffer).toString('base64');
  } else {
    throw new Error('未获取到生成的图片');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, prompt: userPrompt, subjectDesc } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    // 构建提示词
    const basePrompt = userPrompt || BASE_PROMPT;
    
    const fullPrompt = subjectDesc 
      ? `${basePrompt}\n\nSubject description: ${subjectDesc}`
      : basePrompt;

    console.log('生成卡通图...');
    const imageBase64 = await generateCartoon(imageUrl, fullPrompt);
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
