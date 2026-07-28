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
  const [isModified, setIsModified] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false); // Space 键按下状态
  const [editMode, setEditMode] = useState<"draw" | "move">("move"); // 编辑模式：绘制/移动
  const [showSaveConfirm, setShowSaveConfirm] = useState(false); // 保存确认对话框
  const [isPanning, setIsPanning] = useState(false); // 是否正在拖拽画布
  const panStart = useRef<{ x: number; y: number } | null>(null); // 拖拽起始位置

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
        // 移动模式：开始拖拽画布
        setIsDrawing(false);
        setIsPanning(true);
        panStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
      } else if (e.button === 0) {
        // 绘制模式：开始绘制
        setIsDrawing(true);
        modifyPixel(e.clientX, e.clientY);
      }
    },
    [selectedColor, modifyPixel, isSpacePressed, offset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const isMoveMode = isSpacePressed || !selectedColor;
      
      if (isPanning && panStart.current) {
        // 拖拽画布
        setOffset({
          x: e.clientX - panStart.current.x,
          y: e.clientY - panStart.current.y
        });
      } else if (isDrawing && !isMoveMode) {
        // 绘制模式：绘制像素
        modifyPixel(e.clientX, e.clientY);
      }
    },
    [isDrawing, isPanning, selectedColor, modifyPixel, isSpacePressed]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      finishDrawing();
    }
    setIsPanning(false);
    panStart.current = null;
  }, [isDrawing, finishDrawing]);

  // 触摸事件（移动端）- 单指绘制，双指缩放 + 拖动（合并逻辑）
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);

  // 同步 ref 值
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // 双指：同时支持缩放和拖动
        e.preventDefault();
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        lastTouchDistance.current = distance;
        
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const currentOffset = offsetRef.current;
        lastTouchCenter.current = { x: centerX - currentOffset.x, y: centerY - currentOffset.y };
      } else if (e.touches.length === 1) {
        // 单指：只用于绘制，禁止移动画布
        const touch = e.touches[0];
        touchStartPos.current = { x: touch.clientX, y: touch.clientY };

        if (selectedColor) {
          // 选中颜色：开始绘制
          setIsDrawing(true);
          modifyPixel(touch.clientX, touch.clientY);
        }
        // 未选中颜色：不做任何操作（禁止单指移动）
      }
    },
    [selectedColor, modifyPixel]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && lastTouchDistance.current !== null && lastTouchCenter.current !== null) {
        // 双指：同时处理缩放和拖动
        e.preventDefault();
        
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const currentZoom = zoomRef.current;
        const scale = distance / lastTouchDistance.current;
        
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        
        // 缩放
        const newZoom = Math.max(0.5, Math.min(3, currentZoom * scale));
        const zoomRatio = newZoom / currentZoom;
        
        // 拖动 + 缩放补偿
        const currentCenter = lastTouchCenter.current;
        const newOffset = {
          x: centerX - currentCenter.x * zoomRatio,
          y: centerY - currentCenter.y * zoomRatio,
        };
        
        setOffset(newOffset);
        setZoom(newZoom);
        
        // 更新 ref
        zoomRef.current = newZoom;
        offsetRef.current = newOffset;
        
        lastTouchDistance.current = distance;
        lastTouchCenter.current = { x: centerX - newOffset.x, y: centerY - newOffset.y };
      } else if (e.touches.length === 1 && isDrawing) {
        // 单指 + 绘制中：批量修改颜色
        e.preventDefault();
        const touch = e.touches[0];
        modifyPixel(touch.clientX, touch.clientY);
      }
    },
    [isDrawing, modifyPixel]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 0) {
        lastTouchDistance.current = null;
        lastTouchCenter.current = null;
        if (isDrawing) {
          finishDrawing();
        }
      }
      touchStartPos.current = null;
    },
    [isDrawing, finishDrawing]
  );

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

      {/* 主内容区 — 桌面端左右布局，移动端上下布局 */}
      <div className="flex flex-1 overflow-hidden md:flex-row flex-col">
        {/* 色号选择器 — 桌面端左侧边栏 */}
        <aside className="hidden md:block md:w-64 bg-white border-r-2 border-[#E8E4DF] flex-shrink-0 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>
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
        </aside>

        {/* 右侧内容区 — 包含操作区和图纸区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 操作区 — 固定不缩放 */}
          <div className="flex-shrink-0 bg-white border-b-2 border-[#E8E4DF] px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!containerRef.current) return
                  const rect = containerRef.current.getBoundingClientRect()
                  const centerX = rect.width / 2
                  const centerY = rect.height / 2
                  const paperX = (centerX - offset.x) / zoom
                  const paperY = (centerY - offset.y) / zoom
                  const newZoom = Math.max(0.5, zoom - 0.1)
                  setZoom(newZoom)
                  setOffset({
                    x: centerX - paperX * newZoom,
                    y: centerY - paperY * newZoom,
                  })
                }}
                className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-[#E8734A]"
                style={{ borderWidth: 2 }}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="font-pixel text-xs text-[#2D2A26] w-14 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => {
                  if (!containerRef.current) return
                  const rect = containerRef.current.getBoundingClientRect()
                  const centerX = rect.width / 2
                  const centerY = rect.height / 2
                  const paperX = (centerX - offset.x) / zoom
                  const paperY = (centerY - offset.y) / zoom
                  const newZoom = Math.min(3, zoom + 0.1)
                  setZoom(newZoom)
                  setOffset({
                    x: centerX - paperX * newZoom,
                    y: centerY - paperY * newZoom,
                  })
                }}
                className="w-8 h-8 flex items-center justify-center bg-[#FAF8F5] border-2 border-[#E8E4DF] hover:border-[#E8734A]"
                style={{ borderWidth: 2 }}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <span className="text-[10px] text-[#7A756E] ml-2">
                💡 移动端双指操作拖动图纸，选中颜色单指拖动可批量修改色块
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSaveConfirm(true)}
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
              cursor: selectedColor ? "crosshair" : "grab",
              touchAction: "none"
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
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                style={{
                  border: "3px solid #E8E4DF",
                  imageRendering: "pixelated",
                  backgroundColor: "#FAF8F5",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 移动端底部色号选择器 */}
      <aside className="md:hidden bg-white border-t-2 border-[#E8E4DF] flex-shrink-0">
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
      </aside>

      {/* 保存确认对话框 */}
      {showSaveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-4 border-[#E8734A] p-6 max-w-sm w-full" style={{ boxShadow: "4px 4px 0 #2D2A26" }}>
            <h3 className="font-pixel text-sm text-[#2D2A26] mb-4">确认保存</h3>
            <p className="text-sm text-[#2D2A26] mb-6">
              保存之后原图纸<strong className="text-red-600 font-bold">不可恢复</strong>，是否确定要保存？
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-4 py-2 bg-[#FAF8F5] hover:bg-[#E8E4DF] text-[#2D2A26] font-pixel text-[10px] border-2 border-[#E8E4DF]"
                style={{ borderWidth: 2 }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  handleSave();
                  setShowSaveConfirm(false);
                }}
                className="px-4 py-2 bg-[#E8734A] hover:bg-[#D4623B] text-white font-pixel text-[10px] border-2 border-[#2D2A26]"
                style={{ borderWidth: 2, boxShadow: "2px 2px 0 #2D2A26" }}
              >
                确定保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
