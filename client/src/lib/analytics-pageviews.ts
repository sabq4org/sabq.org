import { ensureAnalyticsReady, sanitizeAnalyticsUrl } from "./analytics-privacy";

export type AnalyticsPage = { location: string; referrer: string; title: string };

/** A visit, rather than a headline, is the unit of deduplication. */
export function createPageViewCoordinator(emit: (page: AnalyticsPage) => boolean) {
  let current: { location: string; referrer: string; title: string | null; sent: boolean } | undefined;
  return {
    navigate(location: string, initialReferrer = "") {
      if (current?.location === location) return;
      current = { location, referrer: current?.location ?? initialReferrer, title: null, sent: false };
    },
    ready(location: string, title: string) {
      if (!current || current.location !== location || !title.trim()) return;
      current.title = title;
    },
    flush() {
      if (!current || current.sent || current.title === null) return;
      current.sent = emit({ location: current.location, referrer: current.referrer, title: current.title });
    },
  };
}

const coordinator = createPageViewCoordinator(({ location, referrer, title }) => {
  if (!ensureAnalyticsReady()) return false;
  window.gtag("set", { page_location: location, page_referrer: referrer, page_title: title });
  window.gtag("event", "page_view", {
    send_to: "G-EEB5593GY7",
    page_path: new URL(location).pathname + new URL(location).search,
    page_location: location,
    page_referrer: referrer,
    page_title: title,
  });
  return true;
});

export function analyticsLocationKey(href: string): string {
  return sanitizeAnalyticsUrl(href);
}

export function synchronizeAnalyticsNavigation() {
  window.dispatchEvent(new CustomEvent("sabq:analytics-route"));
  coordinator.navigate(
    analyticsLocationKey(window.location.href),
    document.referrer ? analyticsLocationKey(document.referrer) : "",
  );
  coordinator.flush();
}

/** The page that owns the data explicitly commits its final metadata. */
export function signalAnalyticsPageReady(href: string, title: string) {
  // Only the Router layout effect may start a visit. On popstate an outgoing
  // page can render with the new browser URL before Switch replaces it; allowing
  // its metadata effect to navigate here would claim the incoming page's visit.
  const location = analyticsLocationKey(href);
  if (location !== analyticsLocationKey(window.location.href)) return;
  coordinator.ready(location, title);
  coordinator.flush();
}

export function hasExplicitAnalyticsMetadata(path: string): boolean {
  path = path.replace(/\/+$/, "") || "/";
  return /^(?:\/(?:ar|en|ur)?|\/(?:(?:en|ur)\/)?(?:article|opinion|category)\/[^/]+|\/(?:en\/)?keyword\/[^/]+|\/(?:en|ur)\/news|\/(?:moment-by-moment|live|sports\/live))$/.test(path);
}
