import { useEffect, useRef, type RefObject } from "react";
import { getAnalyticsPageContext } from "@/lib/analytics-privacy";

export type AnalyticsReadingEvent = { name: "scroll_depth" | "reading_time"; params: { article_id: string; percent_scrolled?: 25 | 50 | 75 | 90; reading_time_seconds?: number; page_location: string; page_title?: string; page_referrer?: string } };
interface UseAnalyticsReadingEngagementOptions { articleId: string; contentRef: RefObject<HTMLElement | null>; enabled?: boolean; onEvent?: (event: AnalyticsReadingEvent) => void; minimumReadingSeconds?: number; }
export interface AnalyticsReadingEnvironment { document: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">; window: Pick<Window, "innerHeight" | "location" | "addEventListener" | "removeEventListener">; now?: () => number; }
interface ReadingInstallOptions { pageContext?: { page_title?: string; page_referrer?: string }; articleId: string; getContentElement: () => { getBoundingClientRect: () => { top: number; bottom: number; height: number } } | null; enabled?: boolean; onEvent?: (event: AnalyticsReadingEvent) => void; minimumReadingSeconds?: number; }
const DEPTH_THRESHOLDS = [25, 50, 75, 90] as const;
const browserEnvironment = (): AnalyticsReadingEnvironment => ({ document, window, now: () => Date.now() });

export function installAnalyticsReadingEngagement(options: ReadingInstallOptions, environment: AnalyticsReadingEnvironment = browserEnvironment()): () => void {
  const { articleId, getContentElement, enabled = true, onEvent, minimumReadingSeconds = 10 } = options;
  if (!enabled || !articleId) return () => undefined;
  const sentDepths = new Set<number>();
  const now = environment.now ?? (() => Date.now());
  let active = environment.document.visibilityState === "visible";
  let activeSince = active ? now() : null;
  let foregroundMs = 0;
  let readingSent = false;
  let stopped = false;
  const pageLocation = environment.window.location.href;
  const emit = (event: AnalyticsReadingEvent) => { if (!stopped) onEvent?.(event); };
  const accumulate = (timestamp: number) => { if (active && activeSince !== null) { foregroundMs += Math.max(0, timestamp - activeSince); activeSince = timestamp; } };
  const measureDepth = () => {
    if (!active || environment.document.visibilityState !== "visible") return;
    const element = getContentElement(); if (!element) return;
    const rect = element.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, ((Math.min(environment.window.innerHeight, rect.bottom) - rect.top) / Math.max(1, rect.height)) * 100));
    for (const threshold of DEPTH_THRESHOLDS) if (percent >= threshold && !sentDepths.has(threshold)) { sentDepths.add(threshold); emit({ name: "scroll_depth", params: { ...options.pageContext, article_id: articleId, percent_scrolled: threshold, page_location: pageLocation } }); }
  };
  const flush = () => { if (readingSent) return; accumulate(now()); const seconds = Math.floor(foregroundMs / 1000); if (seconds < minimumReadingSeconds) return; readingSent = true; emit({ name: "reading_time", params: { ...options.pageContext, article_id: articleId, reading_time_seconds: seconds, page_location: pageLocation } }); };
  const visibility = () => { const timestamp = now(); if (environment.document.visibilityState === "hidden") { accumulate(timestamp); active = false; activeSince = null; } else if (!active) { active = true; activeSince = timestamp; } };
  const pagehide = (event: Event & { persisted?: boolean }) => { accumulate(now()); active = false; activeSince = null; if (!event.persisted) flush(); };
  const pageshow = (event: Event & { persisted?: boolean }) => { if (event.persisted && !readingSent) { active = environment.document.visibilityState === "visible"; activeSince = active ? now() : null; } };
  environment.document.addEventListener("visibilitychange", visibility);
  environment.window.addEventListener("pagehide", pagehide); environment.window.addEventListener("pageshow", pageshow); environment.window.addEventListener("scroll", measureDepth, { passive: true }); measureDepth();
  return () => { if (stopped) return; flush(); stopped = true; environment.document.removeEventListener("visibilitychange", visibility); environment.window.removeEventListener("pagehide", pagehide); environment.window.removeEventListener("pageshow", pageshow); environment.window.removeEventListener("scroll", measureDepth); };
}

export function useAnalyticsReadingEngagement({ articleId, contentRef, enabled = true, onEvent, minimumReadingSeconds = 10 }: UseAnalyticsReadingEngagementOptions) {
  const callbackRef = useRef(onEvent); callbackRef.current = onEvent;
  useEffect(() => installAnalyticsReadingEngagement({ pageContext: getAnalyticsPageContext(), articleId, getContentElement: () => contentRef.current, enabled, onEvent: (event) => callbackRef.current?.(event), minimumReadingSeconds }), [articleId, contentRef, enabled, minimumReadingSeconds]);
}
