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
import { DashboardLayout } from "@/components/DashboardLayout";
import "@/index.css";
const route = memoryLocation({ path: "/dashboard/articles" });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}><LanguageProvider><ThemeProvider defaultTheme="light"><AccessibilityProvider><LiveRegionProvider><VoiceAssistantProvider><TooltipProvider>
    <Router hook={route.hook}>
      <DashboardLayout>
        <p>محتوى لوحة محمي للاختبار</p>
        <button onClick={() => { void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] }); }}>تحديث الجلسة للاختبار</button>
      </DashboardLayout>
    </Router>
  </TooltipProvider></VoiceAssistantProvider></LiveRegionProvider></AccessibilityProvider></ThemeProvider></LanguageProvider></QueryClientProvider>,
);
