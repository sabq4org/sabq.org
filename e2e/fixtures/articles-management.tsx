import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { queryClient } from "@/lib/queryClient";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { LiveRegionProvider } from "@/contexts/LiveRegionContext";
import { VoiceAssistantProvider } from "@/contexts/VoiceAssistantContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import ArticlesManagement from "@/pages/ArticlesManagement";
import "@/index.css";
const route = memoryLocation({ path: "/dashboard/articles" });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><LanguageProvider><ThemeProvider defaultTheme="light"><AccessibilityProvider><LiveRegionProvider><VoiceAssistantProvider><TooltipProvider>
    <Router hook={route.hook}>
      <div className="fixed left-2 top-2 z-[100] flex gap-2 bg-background p-2" data-testid="fixture-controls">
      <button onClick={() => { queryClient.setQueryData(["/api/auth/user"], { id: "second-user", role: "admin", permissions: ["*"] }); }}>تبديل حساب الاختبار</button>
      <button onClick={() => { void queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] }); }}>تحديث قائمة الاختبار</button>
      </div>
      <ArticlesManagement />
    </Router>
  </TooltipProvider></VoiceAssistantProvider></LiveRegionProvider></AccessibilityProvider></ThemeProvider></LanguageProvider></QueryClientProvider>,
);
