import { useState, useEffect, useRef, useCallback } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Download,
  Move
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InfographicViewerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  onDownload: () => void;
}

const ZOOM_LEVELS = [1, 1.5, 2, 3] as const;

export function InfographicViewerDialog({
  isOpen,
  onClose,
  imageUrl,
  title,
  onDownload,
}: InfographicViewerDialogProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel as typeof ZOOM_LEVELS[number]);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    } else if (currentIndex === -1) {
      const nextLevel = ZOOM_LEVELS.find(level => level > zoomLevel);
      if (nextLevel) setZoomLevel(nextLevel);
    }
  }, [zoomLevel]);

  const zoomOut = useCallback(() => {
    const currentIndex = ZOOM_LEVELS.indexOf(zoomLevel as typeof ZOOM_LEVELS[number]);
    if (currentIndex > 0) {
      setZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
      if (ZOOM_LEVELS[currentIndex - 1] === 1) {
        setPosition({ x: 0, y: 0 });
      }
    } else if (currentIndex === -1) {
      const prevLevel = [...ZOOM_LEVELS].reverse().find(level => level < zoomLevel);
      if (prevLevel) {
        setZoomLevel(prevLevel);
        if (prevLevel === 1) setPosition({ x: 0, y: 0 });
      }
    }
  }, [zoomLevel]);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "+":
        case "=":
          e.preventDefault();
          zoomIn();
          break;
        case "-":
        case "_":
          e.preventDefault();
          zoomOut();
          break;
        case "0":
          e.preventDefault();
          resetZoom();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, zoomIn, zoomOut, resetZoom]);

  useEffect(() => {
    if (!isOpen) {
      setZoomLevel(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoomLevel === 1) {
      setZoomLevel(2);
    } else {
      resetZoom();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoomLevel > 1 && e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && zoomLevel > 1 && e.touches.length === 1) {
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AnimatePresence>
        {isOpen && (
          <DialogPrimitive.Portal forceMount>
            {/* Backdrop with blur */}
            <DialogPrimitive.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="fixed inset-0 z-50 bg-black/90 dark:bg-black/95 backdrop-blur-md"
                data-testid="overlay-infographic-viewer"
              />
            </DialogPrimitive.Overlay>

            {/* Dialog Content - CRITICAL: inset-4 md:inset-8 for margin requirement */}
            <DialogPrimitive.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={cn(
                  "fixed inset-4 md:inset-8 z-50",
                  "flex flex-col",
                  "bg-black/80 dark:bg-black/90",
                  "rounded-2xl overflow-hidden",
                  "border border-white/10 dark:border-white/5",
                  "shadow-2xl"
                )}
                dir="rtl"
                data-testid="dialog-infographic-viewer"
              >
                {/* Accessibility: Hidden title for screen readers */}
                <DialogPrimitive.Title className="sr-only">
                  عرض الإنفوجرافيك: {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  اضغط مرتين للتكبير، استخدم + و - للتكبير والتصغير، ESC للإغلاق
                </DialogPrimitive.Description>

                {/* Header with title and close button */}
                <motion.div
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                  className="flex items-center justify-between gap-4 p-4 border-b border-white/10"
                >
                  <h2 className="text-white text-base sm:text-lg font-bold line-clamp-1 flex-1">
                    {title}
                  </h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex-shrink-0"
                    data-testid="button-viewer-close"
                  >
                    <X className="h-5 w-5" />
                    <span className="sr-only">إغلاق</span>
                  </Button>
                </motion.div>

                {/* Image Container - Main content area */}
                <div
                  ref={containerRef}
                  className={cn(
                    "flex-1 relative overflow-hidden",
                    "flex items-center justify-center",
                    imageUrl && zoomLevel > 1 ? "cursor-grab" : imageUrl ? "cursor-zoom-in" : "cursor-default",
                    isDragging && "cursor-grabbing"
                  )}
                  onMouseDown={imageUrl ? handleMouseDown : undefined}
                  onMouseMove={imageUrl ? handleMouseMove : undefined}
                  onMouseUp={imageUrl ? handleMouseUp : undefined}
                  onMouseLeave={imageUrl ? handleMouseUp : undefined}
                  onTouchStart={imageUrl ? handleTouchStart : undefined}
                  onTouchMove={imageUrl ? handleTouchMove : undefined}
                  onTouchEnd={imageUrl ? handleTouchEnd : undefined}
                  onDoubleClick={imageUrl ? handleDoubleClick : undefined}
                  data-testid="container-image-viewer"
                >
                  {/* Fallback when no image is available */}
                  {!imageUrl ? (
                    <div className="flex flex-col items-center justify-center gap-4 text-white/60">
                      <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center">
                        <X className="h-12 w-12" />
                      </div>
                      <p className="text-lg">لا توجد صورة</p>
                      <Button
                        variant="outline"
                        onClick={onClose}
                        className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                        data-testid="button-no-image-close"
                      >
                        إغلاق
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Zoom indicator when panning is available */}
                      {zoomLevel > 1 && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white/80 text-xs"
                        >
                          <Move className="h-3 w-3" />
                          اسحب للتنقل
                        </motion.div>
                      )}

                      <motion.img
                        src={imageUrl}
                        alt={title}
                        className="max-w-full max-h-full object-contain select-none"
                        style={{
                          transform: `scale(${zoomLevel}) translate(${position.x / zoomLevel}px, ${position.y / zoomLevel}px)`,
                          transition: isDragging ? "none" : "transform 0.3s ease-out",
                        }}
                        draggable={false}
                        data-testid="image-viewer-main"
                      />
                    </>
                  )}
                </div>

                {/* Control Bar at Bottom */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.3 }}
                  className="flex items-center justify-center gap-2 sm:gap-3 p-4 border-t border-white/10 bg-black/50 backdrop-blur-sm"
                >
                  {/* Zoom Out Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={zoomOut}
                    disabled={zoomLevel <= 1}
                    className={cn(
                      "h-10 w-10 sm:h-11 sm:w-11 rounded-full",
                      "bg-white/10 hover:bg-white/20 text-white",
                      "disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                    data-testid="button-viewer-zoom-out"
                  >
                    <ZoomOut className="h-5 w-5" />
                    <span className="sr-only">تصغير</span>
                  </Button>

                  {/* Zoom Level Indicator */}
                  <div className="flex items-center gap-1 px-3 py-2 rounded-full bg-white/10 text-white min-w-[80px] justify-center">
                    <span className="text-sm font-medium" data-testid="text-zoom-level">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                  </div>

                  {/* Zoom In Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={zoomIn}
                    disabled={zoomLevel >= 3}
                    className={cn(
                      "h-10 w-10 sm:h-11 sm:w-11 rounded-full",
                      "bg-white/10 hover:bg-white/20 text-white",
                      "disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                    data-testid="button-viewer-zoom-in"
                  >
                    <ZoomIn className="h-5 w-5" />
                    <span className="sr-only">تكبير</span>
                  </Button>

                  {/* Separator */}
                  <div className="w-px h-6 bg-white/20 mx-1 hidden sm:block" />

                  {/* Reset Zoom Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={resetZoom}
                    disabled={zoomLevel === 1 && position.x === 0 && position.y === 0}
                    className={cn(
                      "h-10 w-10 sm:h-11 sm:w-11 rounded-full",
                      "bg-white/10 hover:bg-white/20 text-white",
                      "disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                    data-testid="button-viewer-reset"
                  >
                    <RotateCcw className="h-5 w-5" />
                    <span className="sr-only">إعادة ضبط</span>
                  </Button>

                  {/* Separator */}
                  <div className="w-px h-6 bg-white/20 mx-1 hidden sm:block" />

                  {/* Download Button */}
                  <Button
                    variant="ghost"
                    onClick={onDownload}
                    className={cn(
                      "h-10 sm:h-11 px-4 rounded-full gap-2",
                      "bg-gradient-to-r from-indigo-600 to-violet-600",
                      "hover:from-indigo-700 hover:to-violet-700",
                      "text-white shadow-lg"
                    )}
                    data-testid="button-viewer-download"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">تحميل</span>
                  </Button>
                </motion.div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

export default InfographicViewerDialog;
