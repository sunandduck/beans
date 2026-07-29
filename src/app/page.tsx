"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Sparkles,
  Download,
  Palette,
  Loader2,
  Image as ImageIcon,
  Wand2,
  X,
  Zap,
  FileInput,
} from "lucide-react";
import {
  processImage,
  renderPattern,
  generatePatternImage,
  downloadPatternImage,
  MARD_221_PALETTE,
  type PerlerPattern,
  type MardColor,
} from "@/lib/perler-engine-simple";
import PerlerEditor from "@/components/PerlerEditor";
import BeadMode from "@/components/BeadMode";
import { extractMetadata, validateMetadata, type PerlerMetadata } from "@/lib/png-metadata";

// 自动生成 5 种尺寸（长边格数）
const SIZE_OPTIONS = [40, 60, 100, 130, 150] as const;
const SIZE_LABELS: Record<number, string> = { 40: "标准 40", 60: "精细 60", 100: "超精细 100", 130: "极精细 130", 150: "超极精细 150" };

/* Pixel bead decoration component */
function PixelBeads() {
  const colors = ["#E8734A", "#7BC8B0", "#6BA3D6", "#F5C84C", "#E85D75"];
  return (
    <div className="flex gap-1">
      {colors.map((c, i) => (
        <div
          key={i}
          className="w-3 h-3"
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export default function Home() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<{ size: number; pattern: PerlerPattern }[]>([]);
  const [selectedPatternIdx, setSelectedPatternIdx] = useState(0);
  const [subjectDesc, setSubjectDesc] = useState("");
  const [useAI, setUseAI] = useState(false); // 默认直接像素化
  const [useDithering, setUseDithering] = useState(true); // 默认开启精细模式
  const [isGenerating, setIsGenerating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0); // 0-100
  const [progressMessage, setProgressMessage] = useState(""); // 当前步骤文字
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "settings" | "result">("upload");
  const [previewImage, setPreviewImage] = useState<string | null>(null); // 图纸预览弹窗
  const [isEditing, setIsEditing] = useState(false); // 编辑模式
  const [editedPatterns, setEditedPatterns] = useState<{ [key: number]: PerlerPattern }>({}); // 编辑后的图纸
  const [isBeadMode, setIsBeadMode] = useState(false); // 拼豆模式
  const [beadModeMetadata, setBeadModeMetadata] = useState<PerlerMetadata | null>(null); // 拼豆模式元数据
  const [beadModeImage, setBeadModeImage] = useState<string | null>(null); // 拼豆模式图片

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null); // 导入图纸文件输入
  const patternInputRef = useRef<HTMLInputElement>(null); // 拼豆模式文件输入

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("图片大小不能超过10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setOriginalImage(e.target?.result as string);
      setGeneratedImage(null);
      setPatterns([]);
      setSelectedPatternIdx(0);
      setError(null);
      setStep("settings");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = async () => {
    if (!originalImage) return;

    setIsGenerating(true);
    setError(null);

    try {
      // 固定网格尺寸 40x40
      setProgress(10);
      setProgressMessage("准备处理...");

      if (useAI) {
        // AI 重构模式：调用 API（约 40-45 秒）
        setProgress(20);
        setProgressMessage("AI 正在重构图片...");
        
        // 模拟进度：从 20% 缓慢增长到 55%，模拟 45 秒的 AI 处理时间
        const progressInterval = setInterval(() => {
          setProgress((prev: number) => {
            if (prev >= 55) {
              clearInterval(progressInterval);
              return 55;
            }
            return prev + 1;
          });
        }, 1300); // 每 1.3 秒 +1%，35 秒从 20% 到 55%

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: originalImage,
            subjectDesc: subjectDesc || undefined,
          }),
          signal: controller.signal,
        });

        clearInterval(progressInterval);
        clearTimeout(timeoutId);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "生成失败");
        }

        const cartoonImageUrl = data.imageUrl;
        setGeneratedImage(cartoonImageUrl);
        setStep("result");
        setProgress(60);
        setProgressMessage("AI 重构完成，正在生成拼豆图纸...");

        // AI 重构后，需要处理成拼豆图纸
        setTimeout(async () => {
          await handleProcessPattern(cartoonImageUrl);
        }, 100);
      } else {
        // 直接像素化模式：跳过 AI，直接处理原图
        setProgress(30);
        setProgressMessage("正在生成拼豆图纸...");
        setGeneratedImage(originalImage);
        setStep("result");

        setTimeout(async () => {
          await handleProcessPattern(originalImage);
        }, 100);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("生成超时，请重试或换一张较小的图片");
      } else if (err instanceof TypeError && err.message.includes("fetch")) {
        setError("网络连接失败，请检查网络后重试");
      } else {
        setError(err instanceof Error ? err.message : "生成失败，请重试");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleProcessPattern = async (imageUrl: string) => {
    setIsProcessing(true);
    setPatterns([]);
    setEditedPatterns({}); // 清空编辑记录
    
    try {
      const results: { size: number; pattern: PerlerPattern }[] = [];
      for (let i = 0; i < SIZE_OPTIONS.length; i++) {
        const gridSize = SIZE_OPTIONS[i];
        setProgress(70 + Math.floor((i / SIZE_OPTIONS.length) * 25));
        setProgressMessage(`正在生成 ${SIZE_LABELS[gridSize]} 图纸...`);
        const result = await processImage(imageUrl, {
          preserveTransparency: true,
          gridSize,
          useDithering: !useAI && useDithering, // 仅在直接像素化模式下启用抖动
        });
        results.push({ size: gridSize, pattern: result });
      }
      setPatterns(results);
      setSelectedPatternIdx(0);
      setProgress(100);
      setProgressMessage("完成！");
    } catch (err) {
      console.error("Pattern processing error:", err);
      setError("图纸处理失败，请重试");
    } finally {
      setIsProcessing(false);
      setTimeout(() => {
        setProgress(0);
        setProgressMessage("");
      }, 3000);
    }
  };

  // 保存编辑后的图纸
  const handleSaveEdit = useCallback((size: number, modifiedPattern: PerlerPattern) => {
    setEditedPatterns((prev: { [key: number]: PerlerPattern }) => ({ ...prev, [size]: modifiedPattern }));
    setIsEditing(false);
  }, []);

  // 导入图纸
  const handleImportPattern = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请上传图片文件");
      return;
    }

    try {
      // 读取文件为 Data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;

        // 提取元数据
        const metadata = await extractMetadata(dataUrl);
        console.log("[Import] 提取的元数据:", metadata);

        if (!metadata) {
          console.log("[Import] 元数据为空，不是本工具生成的图纸");
          setError("非本工具生成的图纸或图纸被其他工具修改，请在本工具下载图纸并原封不动的导入");
          return;
        }

        // 验证元数据
        const isValid = validateMetadata(metadata);
        if (!isValid) {
          setError("图纸数据已损坏，无法导入");
          return;
        }

        setBeadModeImage(dataUrl);
        setBeadModeMetadata(metadata);
        setIsBeadMode(true);
        setError(null);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Import error:", err);
      setError("导入失败，请重试");
    }
  }, []);

  // 退出拼豆模式
  const handleExitBeadMode = useCallback(() => {
    setIsBeadMode(false);
    setBeadModeMetadata(null);
    setBeadModeImage(null);
  }, []);

  // 点击导入图纸按钮
  const handleImportClick = useCallback(() => {
    patternInputRef.current?.click();
  }, []);

  // 获取当前显示的图纸（优先使用编辑后的）
  const currentPattern = patterns[selectedPatternIdx]?.pattern;
  const currentSize = patterns[selectedPatternIdx]?.size;
  const displayPattern = editedPatterns[currentSize] || currentPattern;

  useEffect(() => {
    const current = displayPattern ?? null;
    console.log('[Page] Pattern 变化:', current ? `${current.width}x${current.height}` : 'null');
    
    const renderCanvas = () => {
      if (current && previewCanvasRef.current) {
        console.log('[Page] 开始渲染 canvas');
        const container = previewCanvasRef.current.parentElement;
        const availableWidth = container
          ? container.clientWidth
          : window.innerWidth - 40;
        const labelPadding = 30;
        const maxBeadSize = Math.floor(
          (availableWidth - labelPadding) / current.width
        );
        const beadSize = Math.max(4, Math.min(16, maxBeadSize));

        renderPattern(current, previewCanvasRef.current, {
          cellSize: beadSize,
          showGrid: beadSize >= 8,
          showColorCode: beadSize >= 10,
        });
        console.log('[Page] Canvas 渲染完成');
      } else {
        console.log('[Page] 无法渲染:', { pattern: !!current, canvas: !!previewCanvasRef.current });
      }
    };

    renderCanvas();
    window.addEventListener("resize", renderCanvas);
    return () => window.removeEventListener("resize", renderCanvas);
  }, [patterns, selectedPatternIdx, displayPattern]);

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      {/* Header */}
      <header className="bg-white border-b-3 border-[#E8E4DF] sticky top-0 z-10" style={{ borderBottomWidth: 3 }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#E8734A] flex items-center justify-center" style={{ boxShadow: "3px 3px 0 #2D2A26" }}>
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-pixel text-sm text-[#2D2A26] leading-relaxed">
                拼豆图纸生成器
              </h1>
              <p className="text-xs text-[#7A756E] mt-0.5">
                AI智能识别 · 一键生成图纸
              </p>
            </div>
          </div>
          <PixelBeads />
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-3 border-red-300 text-red-700 text-sm" style={{ border: "3px solid #fca5a5" }}>
            <span className="font-pixel text-xs">错误：</span>
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-6">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="pixel-card bg-white p-12 text-center cursor-pointer hover:border-[#E8734A] group"
              style={{ borderStyle: "dashed", borderWidth: 3, borderColor: "#E8E4DF" }}
            >
              <div className="w-16 h-16 mx-auto mb-4 bg-[#E8734A]/10 flex items-center justify-center group-hover:bg-[#E8734A]/20 pixel-transition" style={{ boxShadow: "4px 4px 0 rgba(232,115,74,0.2)" }}>
                <Upload className="w-8 h-8 text-[#E8734A]" />
              </div>
              <p className="font-pixel text-xs text-[#2D2A26] mb-2">
                点击上传照片
              </p>
              <p className="text-sm text-[#7A756E]">
                支持 JPG、PNG 格式，最大 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
                className="hidden"
              />
            </div>

            {/* Import pattern button */}
            <div className="text-center">
              <button
                onClick={() => patternInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#7BC8B0] text-white font-pixel text-xs pixel-transition hover:bg-[#6ab8a0]"
                style={{ boxShadow: "3px 3px 0 #5a9e8a" }}
              >
                <FileInput className="w-4 h-4" />
                导入拼豆图纸（进入拼豆模式）
              </button>
              <input
                ref={patternInputRef}
                type="file"
                accept=".png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportPattern(file);
                }}
                className="hidden"
              />
              <p className="text-xs text-[#7A756E] mt-2">
                仅支持本工具生成的拼豆图纸
              </p>
            </div>

            {/* How it works */}
            <div className="pixel-card bg-white p-6">
              <h2 className="font-pixel text-xs text-[#2D2A26] mb-5">使用说明</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: ImageIcon, color: "#E8734A", bg: "#E8734A", title: "上传照片", desc: "上传包含人物或物体的照片" },
                  { icon: Wand2, color: "#7BC8B0", bg: "#7BC8B0", title: "AI重构", desc: "AI识别主体并重新设计成像素画" },
                  { icon: Palette, color: "#6BA3D6", bg: "#6BA3D6", title: "生成图纸", desc: "转换为拼豆图纸，含色号说明" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${item.bg}20`, boxShadow: `3px 3px 0 ${item.bg}40` }}
                    >
                      <item.icon className="w-5 h-5" style={{ color: item.color }} />
                    </div>
                    <div>
                      <p className="font-pixel text-[10px] text-[#2D2A26] mb-1">
                        第{i + 1}步
                      </p>
                      <p className="text-sm font-medium text-[#2D2A26]">{item.title}</p>
                      <p className="text-xs text-[#7A756E]">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Settings */}
        {step === "settings" && (
          <div className="space-y-6">
            {/* Original image preview */}
            <div className="pixel-card bg-white p-4">
              <p className="font-pixel text-[14px] text-[#7A756E] mb-3">原图预览</p>
              <div className="flex justify-center">
                <img
                  src={originalImage || undefined}
                  alt="Original"
                  className="max-h-64 object-contain"
                  style={{ imageRendering: "auto", border: "3px solid #E8E4DF" }}
                />
              </div>
            </div>

            {/* AI mode selection */}
            <div className="pixel-card bg-white p-6">
              <h2 className="font-pixel text-xs text-[#2D2A26] mb-3">生成模式</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setUseAI(true)}
                  className={`p-4 border-3 text-center pixel-transition ${
                    useAI ? "border-[#E8734A] bg-orange-50" : "border-[#E8E4DF] hover:border-[#E8734A]/50"
                  }`}
                  style={{
                    borderWidth: 3,
                    boxShadow: useAI ? "4px 4px 0 #E8734A" : "3px 3px 0 rgba(0,0,0,0.06)",
                  }}
                >
                  <p className="font-cute text-lg text-[#2D2A26] mb-1">使用 AI</p>
                  <p className="text-xs text-[#7A756E]">智能重构主体</p>
                </button>
                <button
                  onClick={() => setUseAI(false)}
                  className={`p-4 border-3 text-center pixel-transition ${
                    !useAI ? "border-[#E8734A] bg-orange-50" : "border-[#E8E4DF] hover:border-[#E8734A]/50"
                  }`}
                  style={{
                    borderWidth: 3,
                    boxShadow: !useAI ? "4px 4px 0 #E8734A" : "3px 3px 0 rgba(0,0,0,0.06)",
                  }}
                >
                  <p className="font-cute text-lg text-[#2D2A26] mb-1">直接像素化</p>
                  <p className="text-xs text-[#7A756E]">原图直接转换</p>
                </button>
              </div>

              {/* 抖动模式开关（仅直接像素化模式） */}
              {!useAI && (
                <div className="mt-4 p-4 bg-[#FAF8F5] border-3 border-[#E8E4DF]" style={{ borderWidth: 3 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#E8734A]" />
                      <div>
                        <p className="font-pixel text-xs text-[#2D2A26]">精细模式</p>
                        <p className="text-xs text-[#7A756E]">Floyd-Steinberg 抖动 + 自动合并相似色</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setUseDithering(!useDithering)}
                      className={`relative w-12 h-6 pixel-transition ${
                        useDithering ? "bg-[#E8734A]" : "bg-[#E8E4DF]"
                      }`}
                      style={{ borderWidth: 2, borderColor: "#2D2A26" }}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 bg-white pixel-transition ${
                          useDithering ? "left-6" : "left-0.5"
                        }`}
                        style={{ borderWidth: 2, borderColor: "#2D2A26" }}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Subject description (only for AI mode) */}
            {useAI && (
              <div className="pixel-card bg-white p-6">
                <h2 className="font-pixel text-xs text-[#2D2A26] mb-3">主体描述（可选）</h2>
                <textarea
                  value={subjectDesc}
                  onChange={(e) => setSubjectDesc(e.target.value)}
                  placeholder="例如：一只橘猫、一个戴帽子的女孩..."
                  className="w-full p-3 border-3 border-[#E8E4DF] bg-[#FAF8F5] text-[#2D2A26] placeholder-[#B8B3AD] focus:border-[#E8734A] focus:outline-none"
                  style={{ borderWidth: 3 }}
                  rows={3}
                />
                <p className="text-xs text-[#7A756E] mt-2">
                  帮助 AI 更准确地识别和重构主体
                </p>
              </div>
            )}

            {/* Time estimate */}
            <div className="pixel-card bg-[#FFF8F0] p-4 border-3 border-[#E8734A]/30">
              <p className="text-sm text-[#7A756E]">
                <span className="font-bold text-[#E8734A]">预计时间：</span>
                {useAI ? "AI 重构约 40-45 秒 + 图纸生成约 5-10 秒" : "图纸生成约 5-10 秒"}
              </p>
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-4 font-pixel text-sm text-white pixel-button bg-[#E8734A] hover:bg-[#D4623B] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderWidth: 3,
                borderColor: "#2D2A26",
                boxShadow: "4px 4px 0 #2D2A26",
              }}
            >
              {isGenerating ? "生成中..." : "开始生成"}
            </button>

            {/* Error message */}
            {error && (
              <div className="pixel-card bg-red-50 p-4 border-3 border-red-300">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Progress */}
            {isGenerating && (
              <div className="pixel-card bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-pixel text-xs text-[#2D2A26]">{progressMessage}</p>
                  <p className="font-pixel text-xs text-[#E8734A]">{progress}%</p>
                </div>
                <div className="w-full bg-[#E8E4DF] h-3">
                  <div
                    className="h-full bg-[#E8734A] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Result */}
        {step === "result" && (
          <div className="space-y-6">
            {/* Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="pixel-card bg-white p-4">
                <p className="font-pixel text-[14px] text-[#7A756E] mb-3">原图</p>
                <div className="flex justify-center">
                  <img
                    src={originalImage!}
                    alt="Original"
                    className="max-h-48 object-contain"
                    style={{ border: "3px solid #E8E4DF" }}
                  />
                </div>
              </div>
              <div className="pixel-card bg-white p-4">
                <p className="font-pixel text-[14px] text-[#7A756E] mb-3">AI重构</p>
                <div className="flex justify-center">
                  {generatedImage ? (
                    <img
                      src={generatedImage}
                      alt="Generated"
                      className="max-h-48 object-contain"
                      style={{ border: "3px solid #E8734A" }}
                    />
                  ) : (
                    <div className="w-48 h-48 bg-gray-100 flex items-center justify-center" style={{ border: "3px dashed #E8E4DF" }}>
                      <Loader2 className="w-8 h-8 animate-spin text-[#E8734A] pixel-loading" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 3-size pattern previews */}
            {patterns.length > 0 && (
              <div className="space-y-4">
                {/* Size tabs */}
                <div className="flex gap-3 justify-center">
                  {patterns.map((item: { size: number; pattern: PerlerPattern }, idx: number) => (
                    <button
                      key={item.size}
                      onClick={() => setSelectedPatternIdx(idx)}
                      className={`px-4 py-2 border-3 font-pixel text-[10px] pixel-transition ${
                        selectedPatternIdx === idx
                          ? "border-[#E8734A] bg-orange-50 text-[#E8734A]"
                          : "border-[#E8E4DF] text-[#7A756E] hover:border-[#E8734A]/50"
                      }`}
                      style={{
                        borderWidth: 3,
                        boxShadow: selectedPatternIdx === idx ? "3px 3px 0 #E8734A" : "2px 2px 0 rgba(0,0,0,0.06)",
                      }}
                    >
                      {SIZE_LABELS[item.size]} · {item.pattern.width}×{item.pattern.height}
                    </button>
                  ))}
                </div>

                {/* Pattern preview */}
                <div className="pixel-card bg-white p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-pixel text-[14px] text-[#2D2A26]">拼豆图纸</h2>
                    <span className="font-pixel text-[10px] text-[#7A756E]">
                      {patterns[selectedPatternIdx].pattern.width}×{patterns[selectedPatternIdx].pattern.height} · {Object.values(patterns[selectedPatternIdx].pattern.colorStats).reduce((s: number, c: number) => s + c, 0)} 颗拼豆
                    </span>
                  </div>
                  <div className="flex justify-center overflow-auto pb-2">
                    <canvas
                      ref={previewCanvasRef}
                      style={{ border: "3px solid #E8E4DF", imageRendering: "pixelated" }}
                    />
                  </div>
                </div>

                {/* Color stats */}
                {(() => {
                  const p = displayPattern;
                  if (!p.colorStats || Object.keys(p.colorStats).length === 0) return null;
                  return (
                    <div className="pixel-card bg-white p-6">
                      <h2 className="font-pixel text-[14px] text-[#2D2A26] mb-4">色号清单</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {Object.entries(p.colorStats).map(([colorCode, count]) => {
                          const color = MARD_221_PALETTE.find((c: MardColor) => c.code === colorCode);
                          if (!color) return null;
                          return (
                            <div
                              key={color.code}
                              className="flex items-center gap-2 p-2 bg-[#FAF8F5] border-2 border-[#E8E4DF]"
                            >
                              <div
                                className="w-6 h-6 flex-shrink-0"
                                style={{ backgroundColor: color.hex, border: "2px solid #E8E4DF" }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-pixel text-[8px] text-[#2D2A26]">{color.code}</p>
                                <p className="text-[10px] text-[#7A756E] truncate">{color.name}</p>
                              </div>
                              <span className="font-pixel text-[10px] text-[#E8734A]">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 pt-3 border-t-2 border-[#E8E4DF]">
                        <p className="font-pixel text-[10px] text-[#7A756E]">
                          总计：{Object.values(p.colorStats).reduce((sum: number, count: number) => sum + count, 0)} 颗拼豆
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Download buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="pixel-btn w-full py-3 bg-[#6BA3D6] hover:bg-[#5A92C5] text-white font-bold flex items-center justify-center gap-2"
                    style={{ borderWidth: 3, borderColor: "#2D2A26", boxShadow: "4px 4px 0 #2D2A26" }}
                  >
                    <Palette className="w-5 h-5" />
                    <span className="font-cute text-lg">编辑图纸</span>
                  </button>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={async () => {
                      await downloadPatternImage(displayPattern);
                    }}
                    className="pixel-btn w-full py-3 bg-[#E8734A] hover:bg-[#D4623B] text-white font-bold flex items-center justify-center gap-2"
                    style={{ borderWidth: 3, borderColor: "#2D2A26", boxShadow: "4px 4px 0 #2D2A26" }}
                  >
                    <Download className="w-5 h-5" />
                    <span className="font-cute text-lg">下载图纸</span>
                  </button>
                </div>
              </div>
            )}

            {/* 图纸预览弹窗 */}
            {previewImage && (
              <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4">
                {/* 关闭按钮 */}
                <button
                  onClick={() => setPreviewImage(null)}
                  className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                  style={{ border: "2px solid rgba(255,255,255,0.3)" }}
                >
                  <X className="w-6 h-6" />
                </button>

                {/* 提示文字 */}
                <div className="text-center mb-4">
                  <p className="text-white text-lg font-bold mb-1">长按图片保存</p>
                  <p className="text-white/60 text-sm">手机用户请长按下方图片保存到相册</p>
                </div>

                {/* 图片预览 */}
                <div className="max-w-full max-h-[70vh] overflow-auto bg-white p-2" style={{ border: "3px solid #2D2A26" }}>
                  <img
                    src={previewImage}
                    alt="拼豆图纸"
                    className="max-w-full max-h-[65vh] object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                </div>

                {/* 桌面端下载按钮 */}
                <button
                  onClick={async () => {
                    const pattern = patterns[selectedPatternIdx].pattern;
                    const filename = `perler-pattern-${pattern.width}x${pattern.height}.png`;
                    
                    // 1. 检测内嵌浏览器
                    const userAgent = navigator.userAgent;
                    const isWeChat = /MicroMessenger/i.test(userAgent);
                    const isTelegram = /Telegram/i.test(userAgent);
                    
                    if (isWeChat || isTelegram) {
                      alert("请点击右上角「···」，选择「在浏览器中打开」后下载");
                      return;
                    }
                    
                    // 2. 优先尝试 Web Share API（移动端最可靠）
                    if (navigator.share && navigator.canShare) {
                      try {
                        const response = await fetch(previewImage);
                        const blob = await response.blob();
                        const file = new File([blob], filename, { type: "image/png" });
                        
                        if (navigator.canShare({ files: [file] })) {
                          await navigator.share({ files: [file], title: "拼豆图纸" });
                          return;
                        }
                      } catch (err) {
                        // 分享失败，继续尝试下载
                        console.log("Share failed, trying download:", err);
                      }
                    }
                    
                    // 3. 降级方案：使用 data URL + window.open（用户长按保存）
                    try {
                      window.open(previewImage, "_blank");
                    } catch (err) {
                      console.error("Download failed:", err);
                      alert("保存失败，请长按图片手动保存");
                    }
                  }}
                  className="mt-4 px-6 py-3 bg-[#E8734A] hover:bg-[#D4623B] text-white font-bold flex items-center gap-2 transition-colors"
                  style={{ border: "3px solid #2D2A26", boxShadow: "4px 4px 0 #2D2A26" }}
                >
                  <Download className="w-5 h-5" />
                  <span>保存到本地</span>
                </button>
              </div>
            )}

            {/* Processing indicator */}
            {isProcessing && (
              <div className="pixel-card bg-white p-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 text-[#7A756E]">
                    <Loader2 className="w-4 h-4 animate-spin pixel-loading" />
                    <span className="font-pixel text-[10px]">{progressMessage || "处理中..."}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-[#E8734A] transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-center font-pixel text-[10px] text-[#7A756E]">{progress}%</div>
                </div>
              </div>
            )}

            {/* Start over */}
            <button
              onClick={() => {
                setOriginalImage(null);
                setGeneratedImage(null);
                setPatterns([]);
                setSelectedPatternIdx(0);
                setStep("upload");
              }}
              className="pixel-btn w-full py-3 bg-white border-[#E8E4DF] text-[#7A756E] font-medium flex items-center justify-center"
              style={{ borderWidth: 3, borderColor: "#2D2A26", boxShadow: "4px 4px 0 #2D2A26" }}
            >
              <span className="font-cute text-lg">重新开始</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer decoration */}
      <footer className="py-6 flex justify-center">
        <PixelBeads />
      </footer>

      {/* Editor Modal */}
      {isEditing && currentPattern && (
        <PerlerEditor
          pattern={currentPattern}
          onClose={() => setIsEditing(false)}
          onSave={(modifiedPattern) => {
            if (currentSize) {
              handleSaveEdit(currentSize, modifiedPattern);
            }
          }}
        />
      )}

      {/* Bead Mode */}
      {isBeadMode && beadModeMetadata && beadModeImage && (
        <BeadMode
          metadata={beadModeMetadata}
          onClose={handleExitBeadMode}
        />
      )}
    </div>
  );
}
