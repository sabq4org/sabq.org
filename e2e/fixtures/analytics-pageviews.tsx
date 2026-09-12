import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Router, useLocation } from "wouter";
import { useAnalytics, useAnalyticsPageMetadata, AnalyticsRouteCommit } from "@/hooks/use-analytics";

function Metadata({ title }: { title: string | null }) {
  useAnalyticsPageMetadata(title);
  return null;
}

function App() {
  const [path, navigate] = useLocation();
  const [title, setTitle] = useState<string | null>(path.includes("article") ? null : "الرئيسية | سبق");
  useAnalytics();
  return <main>
    <Metadata title={title} />
    <AnalyticsRouteCommit />
    <p data-testid="route">{path}</p>
    <button onClick={() => { navigate("/article/same"); setTitle(null); }}>article</button>
    <button onClick={() => { navigate("/category/news"); setTitle(null); }}>category</button>
    <button onClick={() => setTitle("عنوان نهائي | سبق")}>ready</button>
    <button onClick={() => navigate("/category/news?page=2")}>page two</button>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Router><App /></Router>);
