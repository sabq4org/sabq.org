import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SummaryAudioAttribution } from "@/components/SummaryAudioAttribution";

/** The same readable summary and controls for news and opinion details. */
export function ArticleSummary({ text, loading = false, audioProvider, isLoadingAudio, isPlaying, onPlayAudio }: {
  text: string;
  loading?: boolean;
  audioProvider: string | null;
  isLoadingAudio: boolean;
  isPlaying: boolean;
  onPlayAudio: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const contentId = useId();
  // Stored list markers are presentation, not part of the prose. Keep every
  // sentence and paragraph, including numbers that are not list prefixes.
  const summary = text.split(/\r?\n/)
    .map(line => line.replace(/^\s*(?:[-•*–·]\s+|[1-9١-٩][.)]\s+)/, "").trim())
    .join("\n").trim();

  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    let disposed = false;
    const measure = () => {
      if (!disposed) setCanExpand(element.scrollHeight > parseFloat(getComputedStyle(element).lineHeight) * 3 + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); };
  }, [summary, loading]);

  return <section dir="rtl" className="article-detail-summary" data-testid="block-ai-summary">
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-base font-bold" data-testid="text-ai-summary-title">الموجز</h3>
          <div className="flex items-center gap-2">
            <SummaryAudioAttribution provider={audioProvider} />
            <Button variant={isPlaying ? "default" : "ghost"} size="sm" className="article-summary-audio gap-1.5 px-2.5"
              onClick={onPlayAudio} disabled={isLoadingAudio} data-testid="button-listen-summary"
              aria-label={isPlaying ? "إيقاف الاستماع" : "استماع للموجز"}>
              {isLoadingAudio ? <Loader2 className="h-3 w-3 animate-spin" /> : isPlaying ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              <span className="text-xs">{isPlaying ? "إيقاف" : "استمع"}</span>
            </Button>
          </div>
        </div>
        {loading ? <div className="space-y-2" role="status" aria-label="جارٍ تحميل الموجز">
          <Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-10/12" /><Skeleton className="h-3 w-9/12" />
        </div> : <p ref={paragraph} id={contentId} data-testid="text-smart-summary"
          className={`whitespace-pre-line text-sm sm:text-base leading-relaxed text-foreground ${expanded ? "" : "line-clamp-3"}`}>
          {summary}
        </p>}
        {!loading && canExpand && <Button variant="ghost" size="sm"
          className="h-7 px-0 mt-2 gap-1 text-xs text-primary hover:text-primary/80"
          onClick={() => setExpanded(value => !value)} data-testid="button-toggle-summary"
          aria-expanded={expanded} aria-controls={contentId} aria-label={expanded ? "طي الموجز" : "عرض المزيد من الموجز"}>
          {expanded ? "طيّ" : "عرض المزيد"}
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
        </Button>}
      </div>
    </div>
  </section>;
}
