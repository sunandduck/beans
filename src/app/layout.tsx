import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "拼豆图纸生成器 - AI智能转换",
  description: "将照片转化为拼豆图纸，AI智能识别主体并重新设计",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
