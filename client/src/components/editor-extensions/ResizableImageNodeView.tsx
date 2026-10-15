import React, { useState, useRef, useCallback, useEffect } from "react";
import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";
import {
  AlignRight,
  AlignCenter,
  AlignLeft,
  Trash2,
  FileText,
  Check,
  X,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Alignment = "right" | "left" | "center";

const WIDTH_PRESETS = [
  { label: "25%", value: "25%" },
  { label: "33%", value: "33%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "100%", value: "100%" },
];

export function ResizableImageNodeView({
  node,
  updateAttributes,
  selected,
  deleteNode,
  editor,
}: NodeViewProps) {
  const { src, alt, caption, align = "center", width = "100%" } = node.attrs;

  const [isResizing, setIsResizing] = useState(false);
  const [resizingWidthPercent, setResizingWidthPercent] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [captionPopoverOpen, setCaptionPopoverOpen] = useState(false);
  const [draftAlt, setDraftAlt] = useState(alt || "");
  const [draftCaption, setDraftCaption] = useState(caption || "");

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    startX: number;
    startWidthPx: number;
    editorWidthPx: number;
    handle: string;
  } | null>(null);

  // Sync draft state when node attributes change
  useEffect(() => {
    setDraftAlt(alt || "");
    setDraftCaption(caption || "");
  }, [alt, caption]);

  const currentAlign: Alignment =
    align === "right" || align === "left" || align === "center" ? align : "center";

  // Parse current width as display percent
  const currentWidthPercent = resizingWidthPercent !== null
    ? resizingWidthPercent
    : parseInt(width, 10) || 100;

  const displayWidth = resizingWidthPercent !== null
    ? `${resizingWidthPercent}%`
    : width || "100%";

  // Handler for alignment change
  const setAlignment = useCallback(
    (newAlign: Alignment) => {
      updateAttributes({ align: newAlign });
    },
    [updateAttributes]
  );

  // Handler for quick width preset
  const setWidthPreset = useCallback(
    (newWidth: string) => {
      updateAttributes({ width: newWidth });
    },
    [updateAttributes]
  );

  // Save caption & alt
  const handleSaveCaption = useCallback(() => {
    updateAttributes({
      alt: draftAlt.trim(),
      caption: draftCaption.trim(),
    });
    setCaptionPopoverOpen(false);
  }, [draftAlt, draftCaption, updateAttributes]);

  // Pointer drag resizing
  const handleResizeStart = useCallback(
    (e: React.PointerEvent, handle: string) => {
      e.preventDefault();
      e.stopPropagation();

      const imageContainer = containerRef.current;
      if (!imageContainer) return;

      const editorElement = editor.view.dom as HTMLElement;
      const editorWidth = editorElement.clientWidth || 800;
      const rect = imageContainer.getBoundingClientRect();

      dragStartRef.current = {
        startX: e.clientX,
        startWidthPx: rect.width,
        editorWidthPx: editorWidth,
        handle,
      };

      setIsResizing(true);
      setResizingWidthPercent(Math.round((rect.width / editorWidth) * 100));

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!dragStartRef.current) return;
        const { startX, startWidthPx, editorWidthPx, handle: activeHandle } =
          dragStartRef.current;

        const deltaX = moveEvent.clientX - startX;

        // In Arabic RTL, dragging left handle outwards increases size on left
        let calculatedWidthPx = startWidthPx;
        if (activeHandle.includes("left")) {
          calculatedWidthPx = startWidthPx - deltaX;
        } else if (activeHandle.includes("right")) {
          calculatedWidthPx = startWidthPx + deltaX;
        } else {
          calculatedWidthPx = startWidthPx + deltaX;
        }

        // Clamp width between 15% and 100%
        const minPx = editorWidthPx * 0.15;
        const maxPx = editorWidthPx;
        const clampedPx = Math.max(minPx, Math.min(maxPx, calculatedWidthPx));
        const newPercent = Math.round((clampedPx / editorWidthPx) * 100);

        setResizingWidthPercent(newPercent);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);

        setResizingWidthPercent((prev) => {
          if (prev !== null) {
            updateAttributes({ width: `${prev}%` });
          }
          return null;
        });
        setIsResizing(false);
        dragStartRef.current = null;
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [editor, updateAttributes]
  );

  // Compute CSS styles based on alignment
  let wrapperStyle: React.CSSProperties = {
    position: "relative",
    display: "block",
    maxWidth: "100%",
    width: displayWidth,
    transition: isResizing ? "none" : "width 0.15s ease-out",
  };

  if (currentAlign === "right") {
    wrapperStyle = {
      ...wrapperStyle,
      float: "right",
      marginInlineStart: "0",
      marginInlineEnd: "1.5rem",
      marginBlockStart: "0.5rem",
      marginBlockEnd: "1rem",
      clear: "none",
    };
  } else if (currentAlign === "left") {
    wrapperStyle = {
      ...wrapperStyle,
      float: "left",
      marginInlineStart: "1.5rem",
      marginInlineEnd: "0",
      marginBlockStart: "0.5rem",
      marginBlockEnd: "1rem",
      clear: "none",
    };
  } else {
    wrapperStyle = {
      ...wrapperStyle,
      float: "none",
      margin: "1.5rem auto",
      clear: "both",
    };
  }

  const showControls = selected || isHovered || captionPopoverOpen;

  return (
    <NodeViewWrapper
      as="div"
      className="sabq-editor-image-wrapper not-prose select-none group/nodeview relative"
      style={wrapperStyle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-align={currentAlign}
      data-width={displayWidth}
    >
      <div
        ref={containerRef}
        className={`relative rounded-lg overflow-visible transition-shadow ${
          selected
            ? "ring-2 ring-primary ring-offset-2 shadow-md"
            : isHovered
            ? "ring-1 ring-primary/60 shadow-sm"
            : ""
        }`}
      >
        {/* Floating Toolbar */}
        {showControls && (
          <div
            className="absolute -top-12 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 bg-popover/95 text-popover-foreground backdrop-blur-md border shadow-lg rounded-lg px-1.5 py-1 text-xs animate-in fade-in zoom-in-95 duration-100 whitespace-nowrap"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Alignment Buttons */}
            <div className="flex items-center gap-0.5 pl-1 border-l">
              <Button
                type="button"
                variant={currentAlign === "right" ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setAlignment("right")}
                title="محاذاة لليمين والتفاف النص"
              >
                <AlignRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant={currentAlign === "center" ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setAlignment("center")}
                title="توسيط بدون التفاف"
              >
                <AlignCenter className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant={currentAlign === "left" ? "default" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setAlignment("left")}
                title="محاذاة لليسار والتفاف النص"
              >
                <AlignLeft className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Quick Width Presets */}
            <div className="flex items-center gap-0.5 px-1 border-l">
              {WIDTH_PRESETS.map((preset) => {
                const isActive = width === preset.value;
                return (
                  <Button
                    key={preset.value}
                    type="button"
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className={`h-7 px-1.5 text-[11px] font-mono ${
                      isActive ? "bg-primary/15 text-primary font-semibold" : ""
                    }`}
                    onClick={() => setWidthPreset(preset.value)}
                    title={`عرض ${preset.label}`}
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>

            {/* Caption & Alt Popover */}
            <Popover
              open={captionPopoverOpen}
              onOpenChange={setCaptionPopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={caption || alt ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  title="تعديل الوصف والبديل"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">وصف</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-80 p-3 space-y-3 z-40"
                align="center"
                side="top"
                dir="rtl"
              >
                <div className="space-y-1">
                  <Label htmlFor="img-alt" className="text-xs">
                    النص البديل (Alt Text - لمحركات البحث وإمكانية الوصول)
                  </Label>
                  <Input
                    id="img-alt"
                    value={draftAlt}
                    onChange={(e) => setDraftAlt(e.target.value)}
                    placeholder="وصف مختصر لمحتوى الصورة..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="img-caption" className="text-xs">
                    التعليق التوضيحي (يظهر أسفل الصورة)
                  </Label>
                  <Input
                    id="img-caption"
                    value={draftCaption}
                    onChange={(e) => setDraftCaption(e.target.value)}
                    placeholder="تعليق أو مصدر الصورة..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setCaptionPopoverOpen(false)}
                  >
                    <X className="h-3 w-3 ml-1" />
                    إلغاء
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSaveCaption}
                  >
                    <Check className="h-3 w-3 ml-1" />
                    حفظ
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Delete Button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
              onClick={deleteNode}
              title="حذف الصورة"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        {/* Live Resizing Tooltip Badge */}
        {isResizing && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] rounded-lg flex items-center justify-center z-20 pointer-events-none">
            <div className="bg-popover/90 text-popover-foreground px-3 py-1.5 rounded-full shadow-lg border text-xs font-mono font-bold flex items-center gap-1.5">
              <Maximize2 className="h-3.5 w-3.5 text-primary animate-pulse" />
              <span>{currentWidthPercent}%</span>
            </div>
          </div>
        )}

        {/* The Image Element */}
        <img
          src={src}
          alt={alt || ""}
          className="w-full h-auto rounded-lg object-cover block cursor-pointer transition-all"
          loading="lazy"
          draggable={false}
        />

        {/* Caption Display if Present */}
        {caption && (
          <p className="text-xs text-muted-foreground mt-1.5 px-1 text-center italic">
            {caption}
          </p>
        )}

        {/* Resize Handles (Visible when selected or hovered) */}
        {(selected || isHovered) && (
          <>
            {/* Corner Handles */}
            <div
              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-primary border-2 border-white dark:border-zinc-900 rounded-full shadow-md cursor-nesw-resize hover:scale-125 transition-transform z-20"
              onPointerDown={(e) => handleResizeStart(e, "top-right")}
              title="سحب للتحجيم"
            />
            <div
              className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-primary border-2 border-white dark:border-zinc-900 rounded-full shadow-md cursor-nwse-resize hover:scale-125 transition-transform z-20"
              onPointerDown={(e) => handleResizeStart(e, "top-left")}
              title="سحب للتحجيم"
            />
            <div
              className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-primary border-2 border-white dark:border-zinc-900 rounded-full shadow-md cursor-nwse-resize hover:scale-125 transition-transform z-20"
              onPointerDown={(e) => handleResizeStart(e, "bottom-right")}
              title="سحب للتحجيم"
            />
            <div
              className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-primary border-2 border-white dark:border-zinc-900 rounded-full shadow-md cursor-nesw-resize hover:scale-125 transition-transform z-20"
              onPointerDown={(e) => handleResizeStart(e, "bottom-left")}
              title="سحب للتحجيم"
            />

            {/* Side Handles */}
            <div
              className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-6 bg-primary/90 border border-white dark:border-zinc-900 rounded-sm shadow-sm cursor-ew-resize hover:scale-110 transition-transform z-20"
              onPointerDown={(e) => handleResizeStart(e, "right")}
              title="سحب للتحجيم"
            />
            <div
              className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-6 bg-primary/90 border border-white dark:border-zinc-900 rounded-sm shadow-sm cursor-ew-resize hover:scale-110 transition-transform z-20"
              onPointerDown={(e) => handleResizeStart(e, "left")}
              title="سحب للتحجيم"
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
