import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "isomorphic-dompurify";

interface AdSlotProps {
  slotId: string;
  className?: string;
  reservedSize?: "mpu" | "leaderboard";
}

interface AdData {
  creative: {
    id: string;
    name: string;
    type: "image" | "video" | "html";
    content: string;
    size: string;
    destinationUrl: string;
  };
  campaign: {
    id: string;
    name: string;
  };
  impressionId?: string;
}

interface ActiveSlotsResponse {
  slotIds: string[] | null;
  generatedAt: string;
}

function getDeviceType(): "desktop" | "mobile" | "tablet" {
  if (typeof window === "undefined") return "desktop";
  
  const width = window.innerWidth;
  
  if (width < 768) {
    return "mobile";
  } else if (width < 1024) {
    return "tablet";
  } else {
    return "desktop";
  }
}

export function AdSlot({ slotId, className = "", reservedSize = "mpu" }: AdSlotProps) {
  const deviceType = useMemo(() => getDeviceType(), []);
  const reservedMinHeight = reservedSize === "leaderboard" ? 90 : 250;
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Per-slot fill-rate signal: shared across every <AdSlot> on the page so
  // we hit the network once and reuse the result. Slots that the server
  // says have no inventory (and no recent impressions) get skipped entirely
  // — no reserved box, no /api/ads/slot/... request.
  const {
    data: activeSlots,
    isLoading: isLoadingActiveSlots,
    isError: activeSlotsError,
  } = useQuery<ActiveSlotsResponse>({
    queryKey: ["/api/ads/slots/active"],
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Decide whether this slot should even be requested.
  //   - while loading: undefined → keep reserving the box, defer the fetch
  //   - error / null payload: fall back to current behavior (always request)
  //   - otherwise: only request if our slotId is in the returned set
  const shouldServeSlot: boolean | undefined = useMemo(() => {
    if (isLoadingActiveSlots) return undefined;
    if (activeSlotsError) return true;
    const ids = activeSlots?.slotIds;
    if (!ids) return true;
    return ids.includes(slotId);
  }, [activeSlots, activeSlotsError, isLoadingActiveSlots, slotId]);

  const { data: ad, isLoading, error } = useQuery<AdData>({
    queryKey: ["/api/ads/slot", slotId, deviceType],
    queryFn: async () => {
      const response = await fetch(`/api/ads/slot/${slotId}?deviceType=${deviceType}`, {
        credentials: "include",
      });
      
      if (response.status === 204) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error("Failed to fetch ad");
      }
      
      return response.json();
    },
    enabled: !!slotId && shouldServeSlot === true,
    refetchInterval: 60000,
    retry: false,
  });

  useEffect(() => {
    if (ad?.impressionId) {
      fetch(`/api/ads/track/impression/${ad.impressionId}`, {
        method: "POST",
        credentials: "include",
      }).catch(console.error);
    }
  }, [ad?.impressionId]);

  useEffect(() => {
    if (isLoading || ad) {
      setCollapsed(false);
      return;
    }
    // API resolved with no ad. Collapsing the reserved 250px box shifts
    // everything beneath it — a direct CLS hit (measured 0.4 "Poor" on
    // mobile category pages) whenever the slot sits at or above the
    // current viewport. So only collapse when the slot is entirely BELOW
    // the fold: there the upward shift happens off-screen and doesn't
    // count toward CLS. Otherwise keep the reservation — the box has no
    // background, so an unfilled in-view slot is invisible to readers
    // anyway, and the layout stays perfectly stable.
    if (typeof window === "undefined") {
      setCollapsed(true);
      return;
    }
    const el = containerRef.current;
    if (!el) {
      setCollapsed(false);
      return;
    }
    const rect = el.getBoundingClientRect();
    const belowFold = rect.top >= (window.innerHeight || 0);
    setCollapsed(belowFold);
  }, [isLoading, ad]);

  const handleClick = () => {
    if (ad?.impressionId) {
      fetch(`/api/ads/track/click/${ad.impressionId}`, {
        method: "POST",
        credentials: "include",
      }).catch(console.error);
    }

    if (ad?.creative?.destinationUrl) {
      window.open(ad.creative.destinationUrl, "_blank", "noopener,noreferrer");
    }
  };

  // Server says this slot has no chance of filling — render nothing at all.
  // No reserved box (no layout gap on legacy/no-inventory pages) and no
  // request to /api/ads/slot/...
  if (shouldServeSlot === false) {
    return null;
  }

  if (isLoading || shouldServeSlot === undefined || (!ad && !collapsed)) {
    return (
      <div
        ref={containerRef}
        className={`ad-slot ${className}`}
        style={{ minHeight: `${reservedMinHeight}px`, width: '100%' }}
        data-testid={`ad-slot-${slotId}`}
        data-ad-state={isLoading || shouldServeSlot === undefined ? "loading" : "pending"}
        aria-hidden="true"
      />
    );
  }

  if (!ad) {
    return (
      <div
        ref={containerRef}
        className={`ad-slot ${className}`}
        style={{ minHeight: 0, height: 0, overflow: 'hidden' }}
        data-testid={`ad-slot-${slotId}`}
        data-ad-state="empty"
        aria-hidden="true"
      />
    );
  }

  const { creative } = ad;
  const parsedSize = creative.size?.split('x')?.map(Number) ?? [728, 90];
  const width = isNaN(parsedSize[0]) ? 728 : parsedSize[0];
  const height = isNaN(parsedSize[1]) ? 90 : parsedSize[1];

  return (
    <div 
      className={`ad-slot ${className}`} 
      data-testid={`ad-slot-${slotId}`}
      data-campaign-id={ad.campaign.id}
      data-creative-id={creative.id}
    >
      {creative.type === "image" && (
        <a
          href={creative.destinationUrl}
          onClick={(e) => {
            e.preventDefault();
            handleClick();
          }}
          className="block cursor-pointer mx-auto rounded-md overflow-hidden border border-border/50 bg-card/30 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow"
          style={{ maxWidth: `${width}px` }}
          data-testid={`ad-link-${creative.id}`}
          rel="noopener noreferrer sponsored"
          target="_blank"
        >
          <img
            src={creative.content}
            alt={creative.name}
            width={width}
            height={height}
            className="w-full h-auto"
            loading="lazy"
            data-testid={`ad-image-${creative.id}`}
          />
        </a>
      )}

      {creative.type === "video" && (
        <div 
          onClick={handleClick} 
          className="cursor-pointer mx-auto" 
          style={{ maxWidth: `${width}px` }}
          data-testid={`ad-video-${creative.id}`}
        >
          <video
            src={creative.content}
            width={width}
            height={height}
            className="w-full h-auto"
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      )}

      {creative.type === "html" && (
        <div
          onClick={handleClick}
          className="cursor-pointer mx-auto"
          style={{ maxWidth: `${width}px` }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(creative.content || '') }}
          data-testid={`ad-html-${creative.id}`}
        />
      )}
    </div>
  );
}
