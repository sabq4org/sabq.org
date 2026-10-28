import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { LiveRegionProvider } from "@/contexts/LiveRegionContext";
import { VoiceAssistantProvider } from "@/contexts/VoiceAssistantContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import NewsPage from "@/pages/NewsPage";
import { categories, datasets } from "./news-skills-data";
import "@/index.css";
import "@/styles/public-design.css";

type Mode = keyof typeof datasets | "error";
const modes: Mode[] = ["demo", "worst", "empty", "one", "huge", "error"];
const params = new URLSearchParams(location.search);
let mode: Mode = modes.includes(params.get("data") as Mode) ? params.get("data") as Mode : "demo";
let queryClient = makeQueryClient();
const route = memoryLocation({ path: "/news" });

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "returnNull" }), retry: false, staleTime: Infinity } } });
}

// All API reads resolve to local synthetic data. Any non-GET network request is blocked.
const localFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  if (method.toUpperCase() !== "GET") return new Response("Fixture blocks writes", { status: 418 });
  const path = url.pathname;
  let payload: unknown = [];
  if (path === "/api/auth/user") payload = null;
  else if (path === "/api/categories") payload = categories;
  else if (path === "/api/articles") {
    if (mode === "error") return new Response(JSON.stringify({ message: "Fixture API failure" }), { status: 503, headers: { "Content-Type": "application/json" } });
    const search = url.searchParams.get("search")?.toLocaleLowerCase("ar");
    const category = url.searchParams.get("category");
    payload = (datasets[mode as keyof typeof datasets] as typeof datasets.demo).filter(a => (!search || a.title.toLocaleLowerCase("ar").includes(search)) && (!category || a.categoryId === category));
  } else if (path === "/api/news/stats") payload = { totalNews: 1284, todayNews: 24, topViewedThisWeek: { article: { title: "خبر تجريبي" }, views: 987654321 }, averageViews: 142000 };
  else if (path === "/api/news/analytics") payload = { period: { today: 24, week: 120, month: 480 }, growth: { percentage: 18, trend: "up", previousMonth: 400 }, topCategory: { name: "محليات", count: 24 }, topAuthor: { name: "محرر تجريبي", count: 12 }, totalViews: 987654321, totalInteractions: 1284 };
  else if (path === "/api/homepage-lite") payload = { forYou: [] };
  else if (path === "/api/kings-cup/overview") payload = { blockHidden: true };
  else if (path.startsWith("/api/")) payload = {};
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
};
window.fetch = localFetch as typeof window.fetch;
if (navigator.sendBeacon) navigator.sendBeacon = (() => true) as typeof navigator.sendBeacon;

const root = createRoot(document.getElementById("root")!);
function render() {
  root.render(
    <QueryClientProvider client={queryClient}><LanguageProvider><ThemeProvider defaultTheme="light"><AccessibilityProvider><LiveRegionProvider><VoiceAssistantProvider><TooltipProvider>
      <Router hook={route.hook}>
        <div data-testid="news-fixture-toolbar" style={{ position: "fixed", zIndex: 9999, insetInline: "0", bottom: 0, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 4, padding: 8, background: "#e5e7eb", color: "#111827", font: "12px system-ui" }}>
          <strong>Fixture محلية:</strong>
          {modes.map(item => <button key={item} aria-pressed={mode === item} onClick={() => { mode = item; const u = new URL(location.href); u.searchParams.set("data", item); history.replaceState({}, "", u); queryClient.clear(); queryClient = makeQueryClient(); render(); }} style={{ minHeight: 36, padding: "4px 9px", border: 0, borderRadius: 6, background: mode === item ? "white" : "transparent" }}>{item === "demo" ? "Demo" : item === "worst" ? "Worst" : item === "empty" ? "Empty" : item === "one" ? "One" : item === "huge" ? "1,000" : "Error"}</button>)}
          <button onClick={() => document.documentElement.classList.toggle("dark")} style={{ minHeight: 36 }}>Dark</button>
        </div>
        <NewsPage key={mode} />
      </Router>
    </TooltipProvider></VoiceAssistantProvider></LiveRegionProvider></AccessibilityProvider></ThemeProvider></LanguageProvider></QueryClientProvider>,
  );
}
render();
