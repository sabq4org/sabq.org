import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/contexts/LanguageContext";
import NewsletterPage from "@/pages/NewsletterPage";
import { NewsletterEditorialPanel } from "@/components/newsletter/NewsletterEditorialPanel";
import "@/index.css";
const editorial = new URLSearchParams(window.location.search).has("editorial");
const route = memoryLocation({ path: "/newsletter" });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <LanguageProvider><ThemeProvider defaultTheme="light">
      <Router hook={route.hook}>{editorial ? <div className="mx-auto max-w-6xl p-5"><NewsletterEditorialPanel /></div> : <NewsletterPage />}</Router>
    </ThemeProvider></LanguageProvider>
  </QueryClientProvider>,
);
