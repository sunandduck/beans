'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface BeadModeProps {
  metadata: {
    version: string;
    width: number;
    height: number;
    colorMap?: string[];
    beads: string[] | number[];
  };
  onClose: () => void;
}

export default function BeadMode({ metadata, onClose }: BeadModeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [colorStats, setColorStats] = useState<Map<string, number>>(new Map());

  const { width, height } = metadata;

  // 将数字索引的 beads 转换为字符串数组
  const beads: string[] = (() => {
    if (typeof metadata.beads[0] === "number") {
      // 新格式：数字索引 + colorMap
      const colorMap = metadata.colorMap || [];
      return (metadata.beads as number[]).map((index) => {
        if (index < 0 || index >= colorMap.length) return "";
        return colorMap[index];
      });
    }
    // 旧格式：直接是字符串数组
    return metadata.beads as string[];
  })();

  // 计算色号统计
  useEffect(() => {
    const stats = new Map<string, number>();
    beads.forEach((colorCode) => {
      stats.set(colorCode, (stats.get(colorCode) || 0) + 1);
    });
    setColorStats(stats);
  }, [beads]);

  // 获取色号颜色
  const getColorByCode = (code: string): string => {
    const colorMap: Record<string, string> = {
      'H2': '#FFFFFF',
      'H7': '#1a1a1a',
      'H16': '#000000',
      'A1': '#F5D5C8',
      'E12': '#F4C2C2',
      'E15': '#FFB6C1',
      'F1': '#FF6B6B',
      'F4': '#FF4444',
      'F7': '#FF8C00',
      'F8': '#FFA500',
      'F15': '#FFD700',
      'F16': '#FFFF00',
      'F17': '#FFDAB9',
      'F20': '#FFE4B5',
      'F22': '#FFC0CB',
      'F24': '#FFB6C1',
      'F27': '#FF69B4',
      'F28': '#FF1493',
      'G3': '#90EE90',
      'G4': '#98FB98',
      'G8': '#00FA9A',
      'G13': '#20B2AA',
      'G14': '#48D1CC',
      'G16': '#00CED1',
      'G17': '#4682B4',
      'H3': '#808080',
      'H4': '#696969',
      'H5': '#A9A9A9',
      'H6': '#C0C0C0',
      'H8': '#D3D3D3',
      'H9': '#DCDCDC',
      'H15': '#B0C4DE',
      'H22': '#ADD8E6',
      'M8': '#DDA0DD',
      'M9': '#DA70D6',
      'M13': '#BA55D3',
      'M14': '#9370DB',
      'M15': '#8A2BE2',
    };
    return colorMap[code] || '#CCCCCC';
  };

  // 绘制画布
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cellSize = 30 * scale;
    const canvasWidth = width * cellSize;
    const canvasHeight = height * cellSize;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 清空画布
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 绘制像素格
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const idx = row * width + col;
        const colorCode = beads[idx] || 'A1';
        const color = getColorByCode(colorCode);

        const x = col * cellSize;
        const y = row * cellSize;

        // 如果有选中的颜色，非选中色号显示浅灰色背景
        if (selectedColor && colorCode !== selectedColor) {
          ctx.fillStyle = '#F0F0F0';
          ctx.fillRect(x, y, cellSize, cellSize);
        } else {
          // 填充颜色
          ctx.fillStyle = color;
          ctx.fillRect(x, y, cellSize, cellSize);
        }

        // 绘制边框
        ctx.strokeStyle = '#E0E0E0';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);

        // 绘制色号文字（仅在格子足够大且是选中色号时显示）
        if (cellSize > 20 && (!selectedColor || colorCode === selectedColor)) {
          ctx.fillStyle = color === '#FFFFFF' ? '#000000' : '#FFFFFF';
          ctx.font = `${Math.max(10, cellSize * 0.3)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(colorCode, x + cellSize / 2, y + cellSize / 2);
        }
      }
    }
  }, [width, height, beads, scale, selectedColor]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // 缩放控制
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

  // 计算当前视图中可见的格子范围
  const getVisibleRange = () => {
    const container = containerRef.current;
    if (!container) return { startCol: 0, endCol: width, startRow: 0, endRow: height };

    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const cellSize = 30 * scale;

    // 计算可见范围（考虑 offset）
    const startCol = Math.max(0, Math.floor(-offset.x / cellSize));
    const endCol = Math.min(width, Math.ceil((containerWidth - offset.x) / cellSize));
    const startRow = Math.max(0, Math.floor(-offset.y / cellSize));
    const endRow = Math.min(height, Math.ceil((containerHeight - offset.y) / cellSize));

    return { startCol, endCol, startRow, endRow };
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">拼豆模式</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleZoomOut}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <span className="px-3 py-1 text-sm font-medium min-w-[60px] text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={handleReset}
              className="p-2 hover:bg-gray-100 rounded transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 画布区域 - 使用 CSS Grid 实现冻结坐标轴 */}
        <div className="flex-1 overflow-hidden relative">
          {/* 左上角空白区域 */}
          <div
            className="absolute top-0 left-0 bg-gray-100 z-20 border-r border-b border-gray-300"
            style={{ width: '40px', height: '30px' }}
          />

          {/* 顶部列号坐标轴 - 固定在顶部 */}
          <div
            className="absolute top-0 left-[40px] right-0 bg-gray-100 z-10 border-b border-gray-300 overflow-hidden"
            style={{ height: '30px' }}
          >
            <div
              className="relative h-full"
              style={{
                transform: `translateX(${offset.x}px)`,
                width: `${width * 30 * scale}px`,
              }}
            >
              {Array.from({ length: width }, (_, col) => {
                // 每 5 列显示一个数字
                if ((col + 1) % 5 === 0 || col === 0) {
                  return (
                    <div
                      key={col}
                      className="absolute top-0 h-full flex items-center justify-center text-xs text-gray-600 font-mono"
                      style={{
                        left: `${col * 30 * scale}px`,
                        width: `${30 * scale}px`,
                      }}
                    >
                      {col + 1}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>

          {/* 左侧行号坐标轴 - 固定在左侧 */}
          <div
            className="absolute top-[30px] left-0 bottom-0 bg-gray-100 z-10 border-r border-gray-300 overflow-hidden"
            style={{ width: '40px' }}
          >
            <div
              className="relative w-full"
              style={{
                transform: `translateY(${offset.y}px)`,
                height: `${height * 30 * scale}px`,
              }}
            >
              {Array.from({ length: height }, (_, row) => {
                // 每 5 行显示一个数字
                if ((row + 1) % 5 === 0 || row === 0) {
                  return (
                    <div
                      key={row}
                      className="absolute left-0 w-full flex items-center justify-center text-xs text-gray-600 font-mono"
                      style={{
                        top: `${row * 30 * scale}px`,
                        height: `${30 * scale}px`,
                      }}
                    >
                      {row + 1}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>

          {/* 画布容器 - 可拖动 */}
          <div
            ref={containerRef}
            className="absolute top-[30px] left-[40px] right-0 bottom-0 overflow-hidden cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px)`,
                transformOrigin: '0 0',
              }}
            >
              <canvas
                ref={canvasRef}
                className="block"
              />
            </div>
          </div>
        </div>

        {/* 底部色号清单 */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <h3 className="text-sm font-medium mb-3">
            色号清单 ({colorStats.size} 色 / {beads.length} 格)
          </h3>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
            {Array.from(colorStats.entries()).map(([colorCode, count]) => (
              <button
                key={colorCode}
                onClick={() => setSelectedColor(colorCode === selectedColor ? null : colorCode)}
                className={`flex flex-col items-center p-2 border-2 rounded transition-all ${
                  selectedColor === colorCode
                    ? 'border-yellow-400 bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div
                  className="w-8 h-8 border border-gray-300"
                  style={{ backgroundColor: getColorByCode(colorCode) }}
                />
                <span className="text-xs mt-1 font-medium">{colorCode}</span>
                <span className="text-xs text-gray-500">{count} 颗</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
