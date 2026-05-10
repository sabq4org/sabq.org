import { useCallback } from "react";
import { trackBeacon } from "@/lib/queryClient";

export type BehaviorEventType = 
  | "article_view"
  | "article_read"
  | "comment_create"
  | "bookmark_add"
  | "bookmark_remove"
  | "reaction_add"
  | "search"
  | "category_filter"
  | "interest_update"
  | "social_share"
  | "focus_mode_enter"
  | "focus_mode_exit"
  | "focus_session_share"
  | "weekly_report_view";

interface BehaviorMetadata {
  articleId?: string;
  categoryId?: string;
  searchQuery?: string;
  readTime?: number;
  scrollDepth?: number;
  [key: string]: any;
}

export function useBehaviorTracking() {
  const logBehavior = useCallback(async (
    eventType: BehaviorEventType,
    metadata?: BehaviorMetadata
  ) => {
    // Use sendBeacon (with keepalive-fetch fallback) so the event survives
    // page navigation / unload. Always silent — telemetry must never toast.
    try {
      trackBeacon("/api/behavior/log", { eventType, metadata });
    } catch (error) {
      console.debug("Behavior tracking failed (silent):", error);
    }
  }, []);

  return { logBehavior };
}
