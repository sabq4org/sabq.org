// GA4 event helpers for the web. Names and parameter shapes mirror iOS
// (sabq app ios/sabq/Services/SabqAnalytics.swift) so events from both
// platforms unify cleanly in GA4 → Engagement → Events.
//
// gtag.js (loaded by analytics-privacy.ts) handles session_id, engagement
// time and client_id automatically — we only pass event-specific
// params here.

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

import {
  ensureAnalyticsReady,
  isAnalyticsAllowed,
  sanitizeAnalyticsParams,
} from "./analytics-privacy";

const truncate = (s: string, max: number): string =>
  s.length <= max ? s : s.slice(0, max);

const gtagEvent = (name: string, params: Record<string, unknown>) => {
  if (!ensureAnalyticsReady() || !isAnalyticsAllowed() || typeof window.gtag !== "function") return;
  window.gtag("event", name, sanitizeAnalyticsParams(params));
};

// ---------- Content views ----------

export const trackArticleView = (
  articleId: string,
  title: string,
  category?: string,
) => {
  const params: Record<string, unknown> = {
    article_id: articleId,
    article_title: truncate(title, 100),
    content_type: "news",
  };
  if (category) params.category = category;
  gtagEvent("article_view", params);
};

export const trackOpinionView = (
  articleId: string,
  title: string,
  authorName: string,
) => {
  gtagEvent("opinion_view", {
    article_id: articleId,
    article_title: truncate(title, 100),
    author: truncate(authorName, 80),
    content_type: "opinion",
  });
};

// ---------- Interactions ----------

export const trackArticleLike = (articleId: string, liked: boolean = true) => {
  gtagEvent("article_like", { article_id: articleId, liked });
};

export const trackArticleComment = (slug: string, parentId?: string | null) => {
  const params: Record<string, unknown> = { article_slug: truncate(slug, 100) };
  if (parentId) params.parent_comment_id = parentId;
  gtagEvent("article_comment", params);
};

export const trackBookmarkToggle = (articleId: string, isBookmarked: boolean) => {
  gtagEvent("bookmark_toggle", {
    article_id: articleId,
    bookmarked: isBookmarked,
  });
};

export const trackShare = (platform: string, articleId: string) => {
  gtagEvent("share", { article_id: articleId, method: platform });
};

export const trackSearch = (query: string) => {
  gtagEvent("search", { search_term: truncate(query, 100) });
};

export const trackLoginStart = (method: string) => {
  gtagEvent("login_start", { method });
};

export const trackLogin = (method: string) => {
  gtagEvent("login", { method });
};

export const trackSignUp = (method: string) => {
  gtagEvent("sign_up", { method });
};

// ---------- Legacy helpers (kept for backwards compat) ----------

export const trackEvent = (
  action: string,
  category?: string,
  label?: string,
  value?: number,
) => {
  gtagEvent(action, {
    event_category: category,
    event_label: label,
    value,
  });
};

export const trackScrollDepth = (depth: number, articleId?: string) => {
  trackEvent("scroll_depth", "engagement", articleId, depth);
};

export const trackReadingTime = (seconds: number, articleId: string) => {
  trackEvent("reading_time", "engagement", articleId, seconds);
};

export const trackReadingEngagement = (
  name: "scroll_depth" | "reading_time",
  params: {
    article_id: string;
    percent_scrolled?: number;
    reading_time_seconds?: number;
    page_location: string;
    page_title?: string;
    page_referrer?: string;
  },
) => {
  gtagEvent(name, params);
};
