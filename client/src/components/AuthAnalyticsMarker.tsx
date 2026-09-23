import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { enqueueConversion, flushConversionQueue, clearConversionQueue } from "@/lib/analytics-conversion-queue";
import { trackLogin, trackSignUp } from "@/lib/analytics";

const CONSUMED_PREFIX = "sabq:auth-analytics:";

export type AuthAnalyticsMarkerData = { event: "login" | "sign_up"; method: "google" | "apple"; nonce: string };

export function parseAuthAnalyticsMarker(search: string): AuthAnalyticsMarkerData | null {
  const params = new URLSearchParams(search);
  const event = params.get("sabq_auth_event");
  const method = params.get("method");
  const nonce = params.get("nonce");
  if (
    (event !== "login" && event !== "sign_up") ||
    (method !== "google" && method !== "apple") ||
    !nonce ||
    !/^[0-9a-f-]{20,80}$/i.test(nonce)
  ) return null;
  return { event, method, nonce };
}

/**
 * Consumes the server-issued OAuth success marker only after the session is
 * confirmed. The marker is deliberately short-lived in the URL and contains
 * no identity data; sessionStorage makes browser reload/back idempotent.
 */
export function AuthAnalyticsMarker() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading, isError } = useAuth();
  const pendingMarkerRef = useRef<AuthAnalyticsMarkerData | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!pendingMarkerRef.current) {
      const url = new URL(window.location.href);
      const marker = parseAuthAnalyticsMarker(url.search);
      if (marker) {
        pendingMarkerRef.current = marker;
        url.searchParams.delete("sabq_auth_event");
        url.searchParams.delete("method");
        url.searchParams.delete("nonce");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      }
    }
    if (!isLoading && !isError && !isAuthenticated) {
      clearConversionQueue();
      pendingMarkerRef.current = null;
      return;
    }
    if (isLoading || !isAuthenticated || !user) return;

    const marker = pendingMarkerRef.current;
    if (!marker) {
      flushConversionQueue((event, method) => event === "sign_up" ? trackSignUp(method) : trackLogin(method));
      return;
    }
    const { event, method, nonce } = marker;

    const storageKey = `${CONSUMED_PREFIX}${nonce}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) {
        pendingMarkerRef.current = null;
        return;
      }
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // If storage is blocked, still consume the URL marker for this mount;
      // a subsequent reload may be untracked rather than double-counted.
    }

    const confirmedMarker = { event, method, nonce } as AuthAnalyticsMarkerData;
    enqueueConversion(confirmedMarker.event, confirmedMarker.method, confirmedMarker.nonce);
    pendingMarkerRef.current = null;
    flushConversionQueue((queuedEvent, queuedMethod) => queuedEvent === "sign_up" ? trackSignUp(queuedMethod) : trackLogin(queuedMethod));
  }, [isAuthenticated, isLoading, isError, location, user]);

  return null;
}
