import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';
import crypto from 'crypto';

export const maxDuration = 300;

// Generate unique ID
function generateId(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Initialize S3 storage
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: '',
  secretKey: '',
  bucketName: process.env.COZE_BUCKET_NAME,
  region: 'cn-beijing',
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageUrl } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: 'Missing imageUrl' }, { status: 400 });
    }

    // Convert data URL to buffer if needed
    let imageBuffer: Buffer;
    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1];
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      // Fetch from URL
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    // Upload to COS
    const fileName = `temp/${generateId()}.png`;
    const fileKey = await storage.uploadFile({
      fileContent: imageBuffer,
      fileName,
      contentType: 'image/png',
    });

    // Get the signed URL for the uploaded image
    const signedUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600, // 1 hour
    });

    // Call Tencent Cloud CI AIPicMatting API
    const secretId = process.env.TENCENTCLOUD_SECRET_ID;
    const secretKey = process.env.TENCENTCLOUD_SECRET_KEY;
    const bucket = process.env.COS_BUCKET || 'coze-1452232211';
    const region = process.env.COS_REGION || 'ap-guangzhou';

    if (!secretId || !secretKey) {
      return NextResponse.json({ error: 'Missing Tencent Cloud credentials' }, { status: 500 });
    }

    // Construct the CI API URL
    const ciHost = `${bucket}.ci.${region}.myqcloud.com`;
    const apiUrl = `https://${ciHost}/ai/matting`;

    // Sign the request using Tencent Cloud TC3-HMAC-SHA256
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().split('T')[0];
    const service = 'ci';

    // Create canonical request
    const httpRequestMethod = 'POST';
    const canonicalUri = '/ai/matting';
    const canonicalQueryString = '';
    const canonicalHeaders = `content-type:application/json\nhost:${ciHost}\nx-tc-action:aimatting\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const hashedRequestPayload = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // SHA256 of empty string
    const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

    // Create string to sign
    const algorithm = 'TC3-HMAC-SHA256';
    const hashedCanonicalRequest = await hashSHA256(canonicalRequest);
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

    // Sign the string
    const secretDate = await hmacSHA256(`TC3${secretKey}`, date);
    const secretService = await hmacSHA256(secretDate, service);
    const secretSigning = await hmacSHA256(secretService, 'tc3_request');
    const signature = await hmacSHA256Hex(secretSigning, stringToSign);

    // Create authorization header
    const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Make the API call
    const ciResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authorization,
        'Host': ciHost,
        'X-TC-Action': 'AIPicMatting',
      },
      body: JSON.stringify({
        Input: {
          Url: signedUrl,
        },
      }),
    });

    if (!ciResponse.ok) {
      const errorText = await ciResponse.text();
      console.error('CI API error:', errorText);
      return NextResponse.json({ error: 'Background removal failed' }, { status: 500 });
    }

    const ciData = await ciResponse.json();
    
    if (!ciData.Output || !ciData.Output.Image) {
      console.error('CI API response:', ciData);
      return NextResponse.json({ error: 'No image in response' }, { status: 500 });
    }

    // Clean up the temporary file
    await storage.deleteFile({ fileKey });

    // Return the base64 encoded image
    const resultImage = `data:image/png;base64,${ciData.Output.Image}`;
    return NextResponse.json({ success: true, imageUrl: resultImage });
  } catch (error) {
    console.error('Remove background error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper functions for signing
async function hashSHA256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSHA256(key: string | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const keyBuffer = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const msgBuffer = new TextEncoder().encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  return await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
}

async function hmacSHA256Hex(key: ArrayBuffer, message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgBuffer);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
