import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// Single source of truth for GA4 pageviews. The matching `gtag('config')`
// call in client/index.html ships with `send_page_view: false` so this
// hook owns every event — no double-counting on the initial load, and
// every wouter route change (article ↔ article ↔ search ↔ category)
// fires its own pageview.
//
// Without this, the SPA was registering a single pageview per session
// regardless of how many articles the reader opened — which collapsed
// the GA totals after launch traffic shifted from "direct article URL"
// (one full-document load per article) to "homepage → drill in" (one
// load, many wouter navigations).
const GA_MEASUREMENT_ID = "G-EEB5593GY7";

export const useAnalytics = () => {
  const [location] = useLocation();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (location === lastTracked.current) return;
    lastTracked.current = location;

    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    if (typeof gtag !== "function") return;

    gtag("event", "page_view", {
      send_to: GA_MEASUREMENT_ID,
      page_path: location,
      page_title: document.title,
      page_location: window.location.href,
    });
  }, [location]);
};
