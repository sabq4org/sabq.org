import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { LiveRegionProvider } from "@/contexts/LiveRegionContext";
import { VoiceAssistantProvider } from "@/contexts/VoiceAssistantContext";
import { queryClient } from "@/lib/queryClient";
import PublisherTokensPage from "@/pages/dashboard/PublisherTokensPage";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <LanguageProvider><ThemeProvider defaultTheme="light"><AccessibilityProvider><LiveRegionProvider><VoiceAssistantProvider><TooltipProvider>
      <PublisherTokensPage />
    </TooltipProvider></VoiceAssistantProvider></LiveRegionProvider></AccessibilityProvider></ThemeProvider></LanguageProvider>
  </QueryClientProvider>,
);
