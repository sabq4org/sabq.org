import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Link, Router, Route, Switch, useLocation } from "wouter";
import { useAnalytics, useAnalyticsPageMetadata, AnalyticsRouteCommit } from "@/hooks/use-analytics";

history.replaceState(history.state, "", "/");
let cachedArticleReady = false;
function Home() {
  useLocation();
  useAnalyticsPageMetadata("الرئيسية | سبق");
  return <section><h1>الرئيسية</h1><Link href="/article/same">article</Link><Link href="/category/news">category</Link></section>;
}
function Article() {
  useLocation();
  const [ready, setReady] = useState(cachedArticleReady);
  useAnalyticsPageMetadata(ready ? "عنوان نهائي | سبق" : null);
  return <section><h1>الخبر</h1><button onClick={() => { cachedArticleReady = true; setReady(true); }}>ready</button><Link href="/category/news">category</Link></section>;
}
function Category() {
  useLocation();
  useAnalyticsPageMetadata("تصنيف الأخبار | سبق");
  return <section><h1>التصنيف</h1><Link href="/">home</Link><Link href="/category/news?page=2">page two</Link><button onClick={() => undefined}>ready</button></section>;
}
function App() {
  useAnalytics();
  return <main><Switch>
    <Route path="/article/:slug">{() => <><Article /><AnalyticsRouteCommit /></>}</Route>
    <Route path="/category/:slug">{() => <><Category /><AnalyticsRouteCommit /></>}</Route>
    <Route>{() => <><Home /><AnalyticsRouteCommit /></>}</Route>
  </Switch></main>;
}
createRoot(document.getElementById("root")!).render(<Router><App /></Router>);
