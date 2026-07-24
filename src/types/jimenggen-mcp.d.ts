declare module 'jimenggen-mcp' {
  interface ImageToImageOptions {
    prompt: string;
    image: string;
    width?: number;
    height?: number;
    strength?: number;
    guidance_scale?: number;
    num_inference_steps?: number;
  }

  interface ImageToImageResult {
    images: string[];
  }

  export function imageToImage(options: ImageToImageOptions): Promise<ImageToImageResult>;
}
