import COS from 'cos-nodejs-sdk-v5';

const cos = new COS({
  SecretId: process.env.TENCENTCLOUD_SECRET_ID || '',
  SecretKey: process.env.TENCENTCLOUD_SECRET_KEY || ''
});

const bucket = process.env.COS_BUCKET || 'coze-1452232211';
const region = process.env.COS_REGION || 'ap-guangzhou';

export { cos, bucket, region };
