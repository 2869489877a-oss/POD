"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PrintArea } from "@/lib/mockups/scenes";

type SceneEditorProps = {
  backgroundUrl: string;
  outputHeight: number;
  outputWidth: number;
  printArea: PrintArea;
  onPrintAreaChange: (area: PrintArea) => void;
};

type DragMode =
  | "move"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w"
  | null;

const MIN_SIZE = 20;

export function SceneEditor({
  backgroundUrl,
  outputHeight,
  outputWidth,
  printArea,
  onPrintAreaChange,
}: SceneEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [imgError, setImgError] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, area: printArea });

  useEffect(() => { setImgError(false); }, [backgroundUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scale = containerSize.width > 0 ? containerSize.width / outputWidth : 1;
  const displayHeight = Math.min(outputHeight * scale, 220);

  const toDisplay = useCallback(
    (area: PrintArea) => ({
      x: area.x * scale,
      y: area.y * scale,
      width: area.width * scale,
      height: area.height * scale,
    }),
    [scale],
  );

  const clampArea = useCallback(
    (area: PrintArea): PrintArea => ({
      x: Math.max(0, Math.min(area.x, outputWidth - MIN_SIZE)),
      y: Math.max(0, Math.min(area.y, outputHeight - MIN_SIZE)),
      width: Math.max(MIN_SIZE, Math.min(area.width, outputWidth - area.x)),
      height: Math.max(MIN_SIZE, Math.min(area.height, outputHeight - area.y)),
    }),
    [outputWidth, outputHeight],
  );

  const handleMouseDown = useCallback(
    (mode: DragMode, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragMode(mode);
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        area: { ...printArea },
      };
    },
    [printArea],
  );

  useEffect(() => {
    if (!dragMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragStart.current.mouseX) / scale;
      const dy = (e.clientY - dragStart.current.mouseY) / scale;
      const orig = dragStart.current.area;
      let next: PrintArea;

      switch (dragMode) {
        case "move":
          next = { ...orig, x: orig.x + dx, y: orig.y + dy };
          break;
        case "se":
          next = { ...orig, width: orig.width + dx, height: orig.height + dy };
          break;
        case "sw":
          next = { ...orig, x: orig.x + dx, width: orig.width - dx, height: orig.height + dy };
          break;
        case "ne":
          next = { ...orig, y: orig.y + dy, width: orig.width + dx, height: orig.height - dy };
          break;
        case "nw":
          next = { ...orig, x: orig.x + dx, y: orig.y + dy, width: orig.width - dx, height: orig.height - dy };
          break;
        case "n":
          next = { ...orig, y: orig.y + dy, height: orig.height - dy };
          break;
        case "s":
          next = { ...orig, height: orig.height + dy };
          break;
        case "e":
          next = { ...orig, width: orig.width + dx };
          break;
        case "w":
          next = { ...orig, x: orig.x + dx, width: orig.width - dx };
          break;
        default:
          return;
      }

      onPrintAreaChange(clampArea({
        x: Math.round(next.x),
        y: Math.round(next.y),
        width: Math.round(next.width),
        height: Math.round(next.height),
      }));
    };

    const handleMouseUp = () => setDragMode(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragMode, scale, clampArea, onPrintAreaChange]);

  const display = toDisplay(printArea);

  const handles: { cursor: string; mode: DragMode; style: React.CSSProperties }[] = [
    { mode: "nw", cursor: "nwse-resize", style: { top: -4, left: -4 } },
    { mode: "ne", cursor: "nesw-resize", style: { top: -4, right: -4 } },
    { mode: "sw", cursor: "nesw-resize", style: { bottom: -4, left: -4 } },
    { mode: "se", cursor: "nwse-resize", style: { bottom: -4, right: -4 } },
    { mode: "n", cursor: "ns-resize", style: { top: -4, left: "50%", transform: "translateX(-50%)" } },
    { mode: "s", cursor: "ns-resize", style: { bottom: -4, left: "50%", transform: "translateX(-50%)" } },
    { mode: "e", cursor: "ew-resize", style: { top: "50%", right: -4, transform: "translateY(-50%)" } },
    { mode: "w", cursor: "ew-resize", style: { top: "50%", left: -4, transform: "translateY(-50%)" } },
  ];

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-md border border-zinc-300 bg-zinc-100"
      style={{ height: displayHeight || 300 }}
    >
      {backgroundUrl && !imgError && (
        <img
          src={backgroundUrl}
          alt="场景底图"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          onError={() => setImgError(true)}
        />
      )}
      {backgroundUrl && imgError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="rounded bg-amber-100 px-3 py-1.5 text-xs text-amber-700">底图加载失败，请检查 URL 是否有效</p>
        </div>
      )}
      <div
        className="absolute border-2 border-dashed border-blue-500 bg-blue-500/20"
        style={{
          left: display.x,
          top: display.y,
          width: display.width,
          height: display.height,
          cursor: dragMode === "move" ? "grabbing" : "grab",
        }}
        onMouseDown={(e) => handleMouseDown("move", e)}
      >
        <span className="absolute left-1 top-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white select-none">
          印花区域
        </span>
        {handles.map((h) => (
          <div
            key={h.mode}
            className="absolute h-3 w-3 rounded-sm border border-white bg-blue-600"
            style={{ ...h.style, cursor: h.cursor }}
            onMouseDown={(e) => handleMouseDown(h.mode, e)}
          />
        ))}
      </div>
      <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white select-none">
        x:{printArea.x} y:{printArea.y} w:{printArea.width} h:{printArea.height}
      </div>
    </div>
  );
}
