import { useEffect, useLayoutEffect } from "react";
import { useLocation, useSearch } from "wouter";
import {
  hasExplicitAnalyticsMetadata,
  signalAnalyticsPageReady,
  synchronizeAnalyticsNavigation,
} from "@/lib/analytics-pageviews";

/** One coordinator handles initial load, query changes, Back and Forward. */
export function useAnalytics() {
  const [path] = useLocation();
  const search = useSearch();
  useLayoutEffect(() => {
    // Clear the previous route's title before child metadata effects run. Pages
    // without their own metadata use the publication title, never another story.
    document.title = path.startsWith("/en") ? "Sabq News" : path.startsWith("/ur") ? "سبق اردو" : "سبق";
    synchronizeAnalyticsNavigation();
  }, [path, search]);
}

/** null means metadata is pending; failed queries supply an explicit error title. */
export function useAnalyticsPageMetadata(title: string | null) {
  const [path] = useLocation();
  const search = useSearch();
  const href = typeof window === "undefined" ? "" : window.location.href;
  useEffect(() => {
    if (title === null) return;
    document.title = title;
    signalAnalyticsPageReady(href, title);
  }, [path, search, href, title]);
}

/** Mounted inside Suspense, after the actual route's child effects. */
export function AnalyticsRouteCommit() {
  const [path] = useLocation();
  const search = useSearch();
  const href = typeof window === "undefined" ? "" : window.location.href;
  useEffect(() => {
    if (!hasExplicitAnalyticsMetadata(path)) signalAnalyticsPageReady(href, document.title);
  }, [path, search, href]);
  return null;
}
