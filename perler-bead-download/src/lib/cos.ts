import COS from 'cos-nodejs-sdk-v5';
import path from 'path';
import fs from 'fs';

/**
 * 腾讯云 COS 工具类
 */

const cos = new COS({
  SecretId: process.env.COS_SECRET_ID || process.env.TENCENTCLOUD_SECRET_ID || '',
  SecretKey: process.env.COS_SECRET_KEY || process.env.TENCENTCLOUD_SECRET_KEY || ''
});

const bucket = process.env.COS_BUCKET || 'coze-1452232211';
const region = process.env.COS_REGION || 'ap-guangzhou';

/**
 * 上传文件到 COS
 */
export async function uploadToCOS(filePath: string, fileName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const key = `perler-bead/${Date.now()}-${fileName}`;
    
    cos.putObject({
      Bucket: bucket,
      Region: region,
      Key: key,
      Body: fs.readFileSync(filePath)
    }, (err, data) => {
      if (err) {
        console.error('[COS] 上传失败:', err);
        reject(err);
      } else {
        const url = `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
        console.log('[COS] 上传成功:', url);
        resolve(url);
      }
    });
  });
}

/**
 * 删除 COS 文件
 */
export async function deleteFromCOS(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    cos.deleteObject({
      Bucket: bucket,
      Region: region,
      Key: key
    }, (err, data) => {
      if (err) {
        console.error('[COS] 删除失败:', err);
        reject(err);
      } else {
        console.log('[COS] 删除成功:', key);
        resolve();
      }
    });
  });
}

/**
 * 获取 COS 文件 URL
 */
export function getCOSUrl(key: string): string {
  return `https://${bucket}.cos.${region}.myqcloud.com/${key}`;
}
