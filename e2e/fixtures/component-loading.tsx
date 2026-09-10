import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { queryClient } from "@/lib/queryClient";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { LiveRegionProvider } from "@/contexts/LiveRegionContext";
import { VoiceAssistantProvider } from "@/contexts/VoiceAssistantContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import ArticleDetail from "@/pages/ArticleDetail";
import KingsCupHomeSection from "@/components/kingscup/KingsCupHomeSection";
import SportsPortalStrip from "@/components/sports/SportsPortalStrip";
import "@/index.css";
const route = memoryLocation({ path: "/article/loading-test" });
const sports = window.location.hash === "#sports";
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><LanguageProvider><ThemeProvider defaultTheme="light"><AccessibilityProvider><LiveRegionProvider><VoiceAssistantProvider><TooltipProvider>
    <Router hook={route.hook}>
      <button onClick={() => route.navigate("/article/second-test")}>خبر آخر للاختبار</button>
      <button onClick={() => { queryClient.setQueryData(["/api/auth/user"], { id: "second-user" }); }}>تبديل حساب الاختبار</button>
      <button onClick={() => { void queryClient.invalidateQueries({ queryKey: ["/api/kings-cup/overview"] }); void queryClient.invalidateQueries({ queryKey: ["/api/sports/today"] }); }}>تحديث الرياضة للاختبار</button>
      {sports ? <><SportsPortalStrip /><KingsCupHomeSection /></> : <Route path="/article/:slug"><ArticleDetail /></Route>}
    </Router>
  </TooltipProvider></VoiceAssistantProvider></LiveRegionProvider></AccessibilityProvider></ThemeProvider></LanguageProvider></QueryClientProvider>,
);
