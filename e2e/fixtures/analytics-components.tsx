import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchDialog } from "@/components/SearchDialog";
import { SocialShareBar } from "@/components/SocialShareBar";
import { AuthAnalyticsMarker } from "@/components/AuthAnalyticsMarker";
import { ToastProvider, ToastViewport } from "@/components/ui/toast";
import { getQueryFn } from "@/lib/queryClient";
import "@/index.css";

// Chromium does not expose Web Share. The fixture supplies a cancelled native
// share implementation so the real component's cancellation branch is tested.
if (!("share" in navigator)) {
  Object.defineProperty(navigator, "share", {
    configurable: true,
    value: () => Promise.reject(new DOMException("cancelled", "AbortError")),
  });
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { queryFn: getQueryFn({ on401: "returnNull" }), retry: false, staleTime: 0 } },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthAnalyticsMarker />
        <main>
          <h1>اختبار تحليلات محلي</h1>
          <SearchDialog />
          <SocialShareBar
            title="خبر اختباري"
            url="/article/analytics-test"
            articleId="article-test-1"
            showLabels
          />
        </main>
        <ToastViewport />
      </ToastProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
