"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, ZoomIn, ZoomOut, Undo2, Redo2, Download, RotateCcw, Check, Move, Paintbrush } from "lucide-react";
import {
  type PerlerPattern,
  type PerlerBead,
  type MardColor,
  MARD_221_PALETTE,
  renderPattern,
  generatePatternImage,
} from "@/lib/perler-engine-simple";

interface PerlerEditorProps {
  pattern: PerlerPattern;
  onClose: () => void;
  onSave: (modifiedPattern: PerlerPattern) => void;
}

interface EditorState {
  beads: PerlerBead[];
  history: PerlerBead[][];
  historyIndex: number;
}

export default function PerlerEditor({ pattern, onClose, onSave }: PerlerEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 编辑器状态
  const [beads, setBeads] = useState<PerlerBead[]>(pattern.beads);
  const [history, setHistory] = useState<PerlerBead[][]>([pattern.beads]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [selectedColor, setSelectedColor] = useState<MardColor | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isModified, setIsModified] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false); // Space 键按下状态
  const [editMode, setEditMode] = useState<"draw" | "move">("move"); // 编辑模式：绘制/移动

  // 获取当前图纸使用的色号
  const usedColors = Object.keys(pattern.colorStats)
    .map((code) => MARD_221_PALETTE.find((c) => c.code === code))
    .filter((c): c is MardColor => c !== undefined);

  // 保存历史状态
  const saveHistory = useCallback(
    (newBeads: PerlerBead[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newBeads);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setIsModified(true);
    },
    [history, historyIndex]
  );

  // Space 键监听（按住临时切换为移动模式）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault(); // 防止页面滚动
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 撤销
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setBeads(history[newIndex]);
    }
  }, [historyIndex, history]);

  // 重做
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setBeads(history[newIndex]);
    }
  }, [historyIndex, history]);

  // 清空修改（还原）
  const handleReset = useCallback(() => {
    setBeads(pattern.beads);
    setHistory([pattern.beads]);
    setHistoryIndex(0);
    setIsModified(false);
  }, [pattern.beads]);

  // 保存并下载
  const handleSave = useCallback(() => {
    const modifiedPattern: PerlerPattern = {
      ...pattern,
      beads,
      colorStats: beads.reduce((stats: Record<string, number>, bead: PerlerBead) => {
        if (!bead.isEmpty) {
          stats[bead.color.code] = (stats[bead.color.code] || 0) + 1;
        }
        return stats;
      }, {} as Record<string, number>),
    };
    onSave(modifiedPattern);
  }, [pattern, beads, onSave]);

  // 下载修改后的图纸
  const handleDownload = useCallback(() => {
    const modifiedPattern: PerlerPattern = {
      ...pattern,
      beads,
      colorStats: beads.reduce((stats: Record<string, number>, bead: PerlerBead) => {
        if (!bead.isEmpty) {
          stats[bead.color.code] = (stats[bead.color.code] || 0) + 1;
        }
        return stats;
      }, {} as Record<string, number>),
    };
    const dataURL = generatePatternImage(modifiedPattern);
    const link = document.createElement("a");
    link.download = `perler-pattern-edited-${modifiedPattern.width}x${modifiedPattern.height}.png`;
    link.href = dataURL;
    link.click();
  }, [pattern, beads]);

  // 点击像素块修改颜色
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!selectedColor || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      // 计算相对于画布左上角的坐标（考虑 CSS transform 缩放）
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 计算基础格子大小（与渲染时一致）
      const baseCellSize = Math.max(4, Math.min(20, Math.floor(400 / pattern.width)));
      
      // 计算缩放比例（rect 是缩放后的实际显示尺寸）
      const originalWidth = pattern.width * baseCellSize;
      const scale = rect.width / originalWidth;
      
      // 计算点击的格子坐标（需要除以缩放比例）
      const col = Math.floor(x / (baseCellSize * scale));
      const row = Math.floor(y / (baseCellSize * scale));

      if (row >= 0 && row < pattern.height && col >= 0 && col < pattern.width) {
        const newBeads = [...beads];
        const index = row * pattern.width + col;
        newBeads[index] = {
          ...newBeads[index],
          color: selectedColor,
          isEmpty: false,
        };
        setBeads(newBeads);
        saveHistory(newBeads);
      }
    },
    [selectedColor, beads, pattern, saveHistory]
  );

  // 修改指定位置的像素块颜色（用于拖动绘制）
  const modifyPixel = useCallback(
    (clientX: number, clientY: number) => {
      if (!selectedColor || !canvasRef.current) return;

      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const baseCellSize = Math.max(4, Math.min(20, Math.floor(400 / pattern.width)));
      const originalWidth = pattern.width * baseCellSize;
      const scale = rect.width / originalWidth;
      
      const col = Math.floor(x / (baseCellSize * scale));
      const row = Math.floor(y / (baseCellSize * scale));

      if (row >= 0 && row < pattern.height && col >= 0 && col < pattern.width) {
        const index = row * pattern.width + col;
        const currentBead = beads[index];
        
        // 只有当颜色不同时才修改
        if (currentBead.color.code !== selectedColor.code || currentBead.isEmpty) {
          const newBeads = [...beads];
          newBeads[index] = {
            ...newBeads[index],
            color: selectedColor,
            isEmpty: false,
          };
          setBeads(newBeads);
        }
      }
    },
    [selectedColor, beads, pattern]
  );

  // 结束绘制时保存历史
  const finishDrawing = useCallback(() => {
    if (isDrawing) {
      saveHistory(beads);
      setIsDrawing(false);
    }
  }, [isDrawing, beads, saveHistory]);

  // 渲染画布
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const cellSize = Math.max(4, Math.min(20, Math.floor(400 / pattern.width) * zoom));
    canvas.width = pattern.width * cellSize;
    canvas.height = pattern.height * cellSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 清空画布
    ctx.fillStyle = "#FAF8F5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制网格
    ctx.strokeStyle = "#E8E4DF";
    ctx.lineWidth = 0.5;

    for (let row = 0; row < pattern.height; row++) {
      for (let col = 0; col < pattern.width; col++) {
        const bead = beads[row * pattern.width + col];
        const x = col * cellSize;
        const y = row * cellSize;

        // 绘制格子
        if (!bead.isEmpty) {
          ctx.fillStyle = bead.color.hex;
          ctx.fillRect(x, y, cellSize, cellSize);
        }

        // 绘制网格线
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }
  }, [beads, pattern, zoom]);

  // 鼠标拖拽事件（未选中颜色时拖拽画布，选中颜色时绘制）
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 按住 Space 键时临时切换为移动模式
      const isMoveMode = isSpacePressed || !selectedColor;
      
      if (isMoveMode) {
        // 移动模式：拖拽画布
        setIsDragging(true);
        setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      } else if (e.button === 0) {
        // 绘制模式：开始绘制
        setIsDrawing(true);
        modifyPixel(e.clientX, e.clientY);
      }
    },
    [selectedColor, offset, modifyPixel, isSpacePressed]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const isMoveMode = isSpacePressed || !selectedColor;
      
      if (isDragging && isMoveMode) {
        // 移动模式：拖拽画布
        setOffset({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y,
        });
      } else if (isDrawing && !isMoveMode) {
        // 绘制模式：绘制像素
        modifyPixel(e.clientX, e.clientY);
      }
    },
    [isDragging, dragStart, isDrawing, selectedColor, modifyPixel, isSpacePressed]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      finishDrawing();
    } else {
      setIsDragging(false);
    }
  }, [isDrawing, finishDrawing]);

  // 触摸事件（移动端）- 未选中颜色时拖拽画布，选中颜色时绘制
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // 双指：移动画布
        setIsDragging(true);
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        setDragStart({ x: midX - offset.x, y: midY - offset.y });
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };

        // 单指：根据是否选中颜色决定是绘制还是移动
        const isMoveMode = !selectedColor;
        
        if (isMoveMode) {
          // 移动模式：准备拖拽画布
          setIsDragging(true);
          setDragStart({
            x: touch.clientX - offset.x,
            y: touch.clientY - offset.y,
          });
        } else {
          // 绘制模式：开始绘制
          setIsDrawing(true);
          modifyPixel(touch.clientX, touch.clientY);
        }
      }
    },
    [selectedColor, offset, modifyPixel]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // 双指：移动画布
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        setOffset({
          x: midX - dragStart.x,
          y: midY - dragStart.y,
        });
      } else if (e.touches.length === 1) {
        const touch = e.touches[0];
        const isMoveMode = !selectedColor;

        if (isDragging && isMoveMode) {
          // 移动模式：拖拽画布
          setOffset({
            x: touch.clientX - dragStart.x,
            y: touch.clientY - dragStart.y,
          });
        } else if (isDrawing && !isMoveMode) {
          // 绘制模式：绘制像素（批量修改）
          modifyPixel(touch.clientX, touch.clientY);
        } else if (touchStartPos.current && isMoveMode) {
          // 检测是否移动超过阈值（用于区分点击和拖拽）
          const dx = Math.abs(touch.clientX - touchStartPos.current.x);
          const dy = Math.abs(touch.clientY - touchStartPos.current.y);
          if (dx > 10 || dy > 10) {
            touchStartPos.current = null;
          }
        }
      }
    },
    [isDragging, dragStart, isDrawing, selectedColor, modifyPixel]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (isDrawing) {
        finishDrawing();
      } else {
        setIsDragging(false);
      }

      // 如果是点击（没有明显移动），且没有选择颜色，则不处理
      // 选择颜色时的点击已在 handleTouchStart 中处理
      touchStartPos.current = null;
    },
    [isDrawing, finishDrawing]
  );

  // 双指缩放
  const lastTouchDistance = useRef<number | null>(null);

  const handleTouchStartZoom = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouchDistance.current = distance;
    }
  }, []);

  const handleTouchMoveZoom = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance.current !== null) {
      const distance = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = distance / lastTouchDistance.current;
      setZoom((prev) => Math.max(0.5, Math.min(3, prev * scale)));
      lastTouchDistance.current = distance;
    }
  }, []);

  const handleTouchEndZoom = useCallback(() => {
    lastTouchDistance.current = null;
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#FAF8F5] flex flex-col">
      {/* 顶部工具栏 */}
      <header className="bg-white border-b-3 border-[#E8E4DF] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-pixel text-sm text-[#2D2A26]">编辑图纸</h2>
          {isModified && <span className="text-xs text-[#E8734A]">● 已修改</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* 模式切换按钮 */}
          <button
            onClick={() => {
              if (selectedColor !== null) {
                setSelectedColor(null);
              } else {
                // 如果没有选中颜色，提示用户先选择颜色
                alert('请先在底部选择一个颜色，然后才能切换到绘制模式');
              }
            }}
            className={`w-8 h-8 flex items-center justify-center border-2 ${
              selectedColor === null
                ? 'bg-[#E8734A] border-[#E8734A] text-white'
                : 'bg-[#FAF8F5] border-[#E8E4DF] hover:border-[#E8734A]'
            }`}
            style={{ borderWidth: 2 }}
            title={selectedColor === null ? '移动模式' : '绘制模式（点击已选中的颜色可切换）'}
          >
            <Move className="w-4 h-4" />
          </button>
          <button
            onClick={handleUndo}
            disabled={historyIndex === 0}
            className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-[#E8734A] disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderWidth: 2 }}
            title="撤销"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-[#E8734A] disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderWidth: 2 }}
            title="重做"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            disabled={!isModified}
            className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-[#E8734A] disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ borderWidth: 2 }}
            title="还原"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-red-400"
            style={{ borderWidth: 2 }}
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 主内容区 — 操作区和图纸区分开 */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* 操作区 — 固定不缩放 */}
        <div className="flex-shrink-0 bg-white border-b-2 border-[#E8E4DF] px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoom((prev: number) => Math.max(0.5, prev - 0.1))}
              className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-[#E8734A]"
              style={{ borderWidth: 2 }}
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-pixel text-xs text-[#2D2A26] w-14 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((prev: number) => Math.min(3, prev + 0.1))}
              className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-[#E8734A]"
              style={{ borderWidth: 2 }}
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[#7BC8B0] hover:bg-[#6AB8A0] text-white font-pixel text-[10px] flex items-center gap-1"
              style={{ borderWidth: 2, borderColor: "#2D2A26", boxShadow: "2px 2px 0 #2D2A26" }}
            >
              <Download className="w-3 h-3" />
              下载
            </button>
            <button
              onClick={handleSave}
              disabled={!isModified}
              className="px-3 py-1.5 bg-[#E8734A] hover:bg-[#D4623B] text-white font-pixel text-[10px] flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderWidth: 2, borderColor: "#2D2A26", boxShadow: "2px 2px 0 #2D2A26" }}
            >
              <Check className="w-3 h-3" />
              保存
            </button>
          </div>
        </div>

        {/* 图纸区 — 独立缩放，可滚动 */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-[#FAF8F5] p-2 md:p-4"
          style={{ 
            cursor: isDrawing ? "crosshair" : isDragging ? "grabbing" : "grab",
            touchAction: "manipulation"
          }}
        >
            <div
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={(e) => {
                  handleTouchStart(e);
                  handleTouchStartZoom(e);
                }}
                onTouchMove={(e) => {
                  handleTouchMove(e);
                  handleTouchMoveZoom(e);
                }}
                onTouchEnd={(e) => {
                  handleTouchEnd(e);
                  handleTouchEndZoom();
                }}
                style={{
                  border: "3px solid #E8E4DF",
                  imageRendering: "pixelated",
                  backgroundColor: "#FAF8F5",
                }}
              />
            </div>
          </div>

        {/* 色号选择器 — 移动端底部横条，桌面端左侧边栏 */}
        <aside className="order-2 md:order-1 md:w-64 bg-white md:border-r-2 border-t-2 md:border-t-0 border-[#E8E4DF] flex-shrink-0">
          {/* 移动端：横向滚动色号条 */}
          <div className="md:hidden">
            <div className="px-3 py-2 border-b border-[#E8E4DF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-pixel text-[10px] text-[#2D2A26]">选择颜色</h3>
                <span className="text-[9px] text-[#7A756E]">← 左右滑动 →</span>
              </div>
              {selectedColor && (
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5"
                    style={{ backgroundColor: selectedColor.hex, border: "2px solid #E8E4DF" }}
                  />
                  <span className="font-pixel text-[8px] text-[#7A756E]">{selectedColor.code}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto p-3" style={{ scrollbarWidth: "thin" }}>
              {usedColors.map((color) => (
                <button
                  key={color.code}
                  onClick={() => setSelectedColor(selectedColor?.code === color.code ? null : color)}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 border-2 transition-all min-w-[56px] ${
                    selectedColor?.code === color.code
                      ? "border-[#E8734A] bg-orange-50"
                      : "border-[#E8E4DF] hover:border-[#E8734A]/50"
                  }`}
                  style={{ borderWidth: 2 }}
                >
                  <div
                    className="w-8 h-8"
                    style={{ backgroundColor: color.hex, border: "2px solid #E8E4DF" }}
                  />
                  <span className="font-pixel text-[7px] text-[#2D2A26]">{color.code}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 桌面端：纵向侧边栏 */}
          <div className="hidden md:block overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
            <div className="p-4">
              <h3 className="font-pixel text-xs text-[#2D2A26] mb-3">选择颜色</h3>
              <div className="space-y-2">
                {usedColors.map((color) => (
                  <button
                    key={color.code}
                    onClick={() => setSelectedColor(selectedColor?.code === color.code ? null : color)}
                    className={`w-full flex items-center gap-2 p-2 border-2 transition-all ${
                      selectedColor?.code === color.code
                        ? "border-[#E8734A] bg-orange-50"
                        : "border-[#E8E4DF] hover:border-[#E8734A]/50"
                    }`}
                    style={{ borderWidth: 2 }}
                  >
                    <div
                      className="w-8 h-8 flex-shrink-0"
                      style={{ backgroundColor: color.hex, border: "2px solid #E8E4DF" }}
                    />
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-pixel text-[8px] text-[#2D2A26]">{color.code}</p>
                      <p className="text-[10px] text-[#7A756E] truncate">{color.name}</p>
                    </div>
                    {selectedColor?.code === color.code && (
                      <Check className="w-4 h-4 text-[#E8734A]" />
                    )}
                  </button>
                ))}
              </div>

              {selectedColor && (
                <div className="mt-4 p-3 bg-[#FAF8F5] border-2 border-[#E8E4DF]">
                  <p className="font-pixel text-[8px] text-[#7A756E] mb-1">当前选中</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-10 h-10"
                      style={{ backgroundColor: selectedColor.hex, border: "2px solid #E8E4DF" }}
                    />
                    <div>
                      <p className="font-pixel text-[10px] text-[#2D2A26]">{selectedColor.code}</p>
                      <p className="text-xs text-[#7A756E]">{selectedColor.name}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 p-3 bg-blue-50 border-2 border-blue-200">
                <p className="text-xs text-blue-700">
                  <strong>提示：</strong>
                  <br />
                  1. 选择颜色
                  <br />
                  2. 点击格子修改
                  <br />
                  3. 拖拽移动画布
                  <br />
                  4. 双指缩放（移动端）
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
