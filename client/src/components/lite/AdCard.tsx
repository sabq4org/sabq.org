import { useCallback, useRef, useEffect } from "react";
import { ExternalLink } from "lucide-react";

interface AdData {
  id: string;
  imageUrl: string;
  title: string;
  description?: string;
  ctaText?: string;
  linkUrl?: string;
  advertiser?: string;
  impressionId?: string;
}

interface AdCardProps {
  ad: AdData;
  position: 'current' | 'next' | 'previous';
  dragOffset: number;
  onDragStart: () => void;
  onDragMove: (offset: number) => void;
  onDragEnd: (velocity: number) => void;
}

export function AdCard({ 
  ad, 
  position, 
  dragOffset,
  onDragStart,
  onDragMove,
  onDragEnd 
}: AdCardProps) {
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isDraggingRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (position !== 'current') return;
    startYRef.current = e.touches[0].clientY;
    lastYRef.current = e.touches[0].clientY;
    lastTimeRef.current = Date.now();
    isDraggingRef.current = true;
    onDragStart();
  }, [position, onDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || position !== 'current') return;
    const currentY = e.touches[0].clientY;
    const offset = currentY - startYRef.current;
    lastYRef.current = currentY;
    lastTimeRef.current = Date.now();
    onDragMove(offset);
  }, [position, onDragMove]);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current || position !== 'current') return;
    isDraggingRef.current = false;
    onDragEnd(0);
  }, [position, onDragEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (position !== 'current') return;
    startYRef.current = e.clientY;
    lastYRef.current = e.clientY;
    lastTimeRef.current = Date.now();
    isDraggingRef.current = true;
    onDragStart();
  }, [position, onDragStart]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || position !== 'current') return;
      const currentY = e.clientY;
      const offset = currentY - startYRef.current;
      lastYRef.current = currentY;
      lastTimeRef.current = Date.now();
      onDragMove(offset);
    };

    const handleMouseUp = () => {
      if (!isDraggingRef.current || position !== 'current') return;
      isDraggingRef.current = false;
      onDragEnd(0);
    };

    if (position === 'current') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position, onDragMove, onDragEnd]);

  const getTransformY = () => {
    const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    
    if (position === 'current') {
      return dragOffset;
    } else if (position === 'next') {
      const baseOffset = screenHeight;
      const movement = Math.min(0, dragOffset);
      return baseOffset + movement;
    } else if (position === 'previous') {
      const baseOffset = -screenHeight;
      const movement = Math.max(0, dragOffset);
      return baseOffset + movement;
    }
    return 0;
  };

  const transformY = getTransformY();

  const handleAdClick = async () => {
    // Track click if impressionId exists
    if (ad.impressionId) {
      try {
        await fetch(`/api/ads/track/click/${ad.impressionId}`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (error) {
        console.error('[AdCard] Failed to track click:', error);
      }
    }
    
    if (ad.linkUrl) {
      window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="absolute inset-0 select-none"
      style={{ 
        transform: `translateY(${transformY}px)`,
        zIndex: position === 'current' ? 10 : 5,
        touchAction: 'none',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      data-testid={`ad-card-${ad.id}`}
    >
      <div className="h-full w-full overflow-hidden bg-black relative flex items-start justify-center pt-24">
        <div className="relative w-[85%] max-w-[340px]" style={{ aspectRatio: '9/16' }}>
          <img
            src={ad.imageUrl}
            alt={ad.title}
            className="w-full h-full object-cover rounded-2xl"
            draggable={false}
          />
          
          <div className="absolute top-3 right-3 z-20">
            <span className="px-2 py-1 bg-black/40 backdrop-blur-sm rounded text-white/90 text-[10px] font-medium">
              إعلان
            </span>
          </div>

          {ad.linkUrl && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <ExternalLink className="h-4 w-4 text-white" />
              </div>
              <button
                onClick={handleAdClick}
                className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white font-medium rounded-full px-4 py-1.5 text-xs transition-colors"
                data-testid="button-ad-cta"
              >
                {ad.ctaText || "الموقع الرسمي"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
