"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
} from "lucide-react";
import { MARD_221_PALETTE, type MardColor } from "@/lib/perler-engine";
import type { PerlerMetadata } from "@/lib/png-metadata";

interface BeadModeProps {
  metadata: PerlerMetadata;
  onClose: () => void;
}

export default function BeadMode({ metadata, onClose }: BeadModeProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [usedColors, setUsedColors] = useState<Array<{ code: string; count: number }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 统计使用的颜色
  useEffect(() => {
    const colorCount: Record<string, number> = {};
    metadata.beads.forEach((colorCode) => {
      if (colorCode) {
        colorCount[colorCode] = (colorCount[colorCode] || 0) + 1;
      }
    });
    const colors = Object.entries(colorCount)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
    setUsedColors(colors);
  }, [metadata]);

  // 获取指定色号的数量
  const getColorCount = (colorCode: string) => {
    return metadata.beads.filter(b => b === colorCode).length;
  };

  // 绘制图纸
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, beads } = metadata;
    const cellSize = Math.max(8, Math.floor(20 * scale));
    const axisSize = cellSize * 1.5; // 坐标轴宽度

    // 设置画布大小（包含坐标轴）
    canvas.width = width * cellSize + axisSize;
    canvas.height = height * cellSize + axisSize;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 绘制背景
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制坐标轴背景
    ctx.fillStyle = "#F8F8F8";
    ctx.fillRect(0, 0, axisSize, canvas.height); // 左侧坐标轴
    ctx.fillRect(0, 0, canvas.width, axisSize); // 顶部坐标轴

    // 绘制像素格（偏移坐标轴空间）
    metadata.beads.forEach((colorCode, index) => {
      const col = index % width;
      const row = Math.floor(index / width);
      const x = axisSize + col * cellSize;
      const y = axisSize + row * cellSize;

      if (!colorCode) {
        // 空白格
        ctx.fillStyle = "#F5F5F5";
        ctx.fillRect(x, y, cellSize, cellSize);
      } else {
        const color = MARD_221_PALETTE.find((c: MardColor) => c.code === colorCode);
        if (color) {
          if (selectedColor) {
            // 高亮模式
            if (colorCode === selectedColor) {
              // 高亮显示
              ctx.fillStyle = color.hex;
              ctx.fillRect(x, y, cellSize, cellSize);
              // 添加高亮边框
              ctx.strokeStyle = "#FFD700";
              ctx.lineWidth = 2;
              ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            } else {
              // 其余变暗
              ctx.fillStyle = "#E0E0E0";
              ctx.fillRect(x, y, cellSize, cellSize);
              // 绘制暗色色号
              ctx.fillStyle = "#999999";
              ctx.font = `${Math.max(8, cellSize / 3)}px monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(colorCode, x + cellSize / 2, y + cellSize / 2);
            }
          } else {
            // 正常显示
            ctx.fillStyle = color.hex;
            ctx.fillRect(x, y, cellSize, cellSize);
            // 绘制网格线
            ctx.strokeStyle = "#E0E0E0";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x, y, cellSize, cellSize);
          }
        }
      }
    });

    // 绘制坐标轴数字
    ctx.fillStyle = "#666666";
    ctx.font = `${Math.max(8, cellSize / 2.5)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 顶部坐标轴（列号）
    for (let col = 0; col < width; col++) {
      const x = axisSize + col * cellSize + cellSize / 2;
      ctx.fillText(String(col + 1), x, axisSize / 2);
    }

    // 左侧坐标轴（行号）
    ctx.textAlign = "right";
    for (let row = 0; row < height; row++) {
      const y = axisSize + row * cellSize + cellSize / 2;
      ctx.fillText(String(row + 1), axisSize / 2, y);
    }

    // 绘制网格线
    if (!selectedColor) {
      ctx.strokeStyle = "#D0D0D0";
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= width; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, height * cellSize);
        ctx.stroke();
      }
      for (let j = 0; j <= height; j++) {
        ctx.beginPath();
        ctx.moveTo(0, j * cellSize);
        ctx.lineTo(width * cellSize, j * cellSize);
        ctx.stroke();
      }
    }
  }, [metadata, selectedColor, scale]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // 处理颜色选择
  const handleColorSelect = (code: string) => {
    setSelectedColor(selectedColor === code ? null : code);
  };

  // 处理缩放（以视图中心为基准点）
  const handleZoomIn = () => {
    setScale((prev) => {
      const newScale = Math.min(prev * 1.2, 5);
      // 调整 offset 以保持视图中心不变
      setOffset((prevOffset) => {
        const scaleRatio = newScale / prev;
        return {
          x: prevOffset.x * scaleRatio,
          y: prevOffset.y * scaleRatio,
        };
      });
      return newScale;
    });
  };

  const handleZoomOut = () => {
    setScale((prev) => {
      const newScale = Math.max(prev / 1.2, 0.3);
      // 调整 offset 以保持视图中心不变
      setOffset((prevOffset) => {
        const scaleRatio = newScale / prev;
        return {
          x: prevOffset.x * scaleRatio,
          y: prevOffset.y * scaleRatio,
        };
      });
      return newScale;
    });
  };

  const handleReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // 处理拖动
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 处理触摸
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && e.touches.length === 1) {
      setOffset({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // 获取颜色信息
  const getColorInfo = (code: string): MardColor | undefined => {
    return MARD_221_PALETTE.find((c: MardColor) => c.code === code);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FAF8F5] flex flex-col">
      {/* 顶部导航栏 */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b-2 border-[#E8E4DF]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-[#2D2A26] text-white hover:bg-[#1a1815] transition-colors"
            style={{ boxShadow: "2px 2px 0 #000" }}
          >
            <X size={16} />
          </button>
          <h1
            className="text-sm font-bold text-[#2D2A26]"
            style={{ fontFamily: "'Press Start 2P', monospace" }}
          >
            拼豆模式
          </h1>
        </div>

        {/* 缩放控制 */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 flex items-center justify-center bg-white border-2 border-[#2D2A26] text-[#2D2A26] hover:bg-[#F5F5F5]"
            style={{ boxShadow: "2px 2px 0 #2D2A26" }}
          >
            <ZoomOut size={14} />
          </button>
          <span
            className="text-xs font-bold text-[#2D2A26] min-w-[50px] text-center"
            style={{ fontFamily: "monospace" }}
          >
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 flex items-center justify-center bg-white border-2 border-[#2D2A26] text-[#2D2A26] hover:bg-[#F5F5F5]"
            style={{ boxShadow: "2px 2px 0 #2D2A26" }}
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={handleReset}
            className="w-8 h-8 flex items-center justify-center bg-white border-2 border-[#2D2A26] text-[#2D2A26] hover:bg-[#F5F5F5]"
            style={{ boxShadow: "2px 2px 0 #2D2A26" }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 画布区域 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden bg-[#F5F5F5] relative cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="absolute"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "0 0",
            }}
          >
            <canvas
              ref={canvasRef}
              className="block"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          {/* 提示信息 */}
          {selectedColor && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#2D2A26] text-white px-4 py-2 text-xs font-bold"
              style={{ fontFamily: "'Press Start 2P', monospace", boxShadow: "4px 4px 0 #000" }}>
              高亮：{getColorInfo(selectedColor)?.code} {getColorInfo(selectedColor)?.name}
              <span className="ml-2 text-[#FFD700]">({getColorCount(selectedColor)} 格)</span>
            </div>
          )}
        </div>

        {/* 底部色号清单 */}
        <div className="bg-white border-t-2 border-[#E8E4DF] p-3">
          <div className="flex items-center gap-2 mb-2">
            <h2
              className="text-xs font-bold text-[#2D2A26]"
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              色号清单
            </h2>
            <span className="text-xs text-[#7A756E]">
              ({usedColors.length} 色 / {metadata.beads.filter(b => !b.isEmpty).length} 格)
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {usedColors.map(({ code, count }) => {
              const color = getColorInfo(code);
              const isSelected = selectedColor === code;
              return (
                <button
                  key={code}
                  onClick={() => handleColorSelect(code)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 border-2 transition-all ${
                    isSelected
                      ? "border-[#FFD700] bg-[#FFF9E6]"
                      : "border-[#E8E4DF] bg-white hover:border-[#2D2A26]"
                  }`}
                  style={{
                    boxShadow: isSelected ? "2px 2px 0 #FFD700" : "2px 2px 0 #2D2A26",
                  }}
                >
                  <div
                    className="w-8 h-8 border border-[#2D2A26]"
                    style={{ backgroundColor: color?.hex || "#FFFFFF" }}
                  />
                  <span
                    className="text-[10px] font-bold text-[#2D2A26]"
                    style={{ fontFamily: "monospace" }}
                  >
                    {code}
                  </span>
                  <span className="text-[10px] text-[#7A756E]">{count}颗</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
