import { NextRequest, NextResponse } from 'next/server';
import { ImageGenerationClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl, prompt: userPrompt, subjectDesc } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    // Extract forward headers for proper request tracing
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ImageGenerationClient(config, customHeaders);

    // Build a comprehensive prompt for low-pixel cartoon style
    // 目标：生成 Q 版大头小身体风格，专为拼豆图纸优化（可拼性 > 还原度）
    // 每个拼豆格子对应 4×4 像素，所以 AI 的每个色块至少 4×4 像素
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
      ? `${basePrompt}\n\nSubject description: ${subjectDesc}`
      : basePrompt;

    const response = await client.generate({
      prompt: fullPrompt,
      image: imageUrl,
      responseFormat: 'b64_json',
      size: '256x256',
    });

    const helper = client.getResponseHelper(response);

    if (!helper.success) {
      console.error('Image generation error:', helper.errorMessages);
      return NextResponse.json({ 
        error: helper.errorMessages[0] || 'Generation failed' 
      }, { status: 500 });
    }

    if (helper.imageB64List.length === 0) {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    const resultImageUrl = `data:image/png;base64,${helper.imageB64List[0]}`;

    return NextResponse.json({ 
      success: true, 
      imageUrl: resultImageUrl,
      prompt: fullPrompt 
    });
  } catch (error) {
    console.error('Generate API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
