import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./mobile.css";
import "./styles/public-design.css";
import "./styles/public-opinion-card.css";
import { installDeployRecovery } from "./lib/deployRecovery";
import { startBuildVersionPolling } from "./lib/buildVersion";
import { ensureAnalyticsReady } from "./lib/analytics-privacy";
import { installEarlyErrorBuffer } from "./lib/earlyErrorBuffer";

// GA4 is loaded only after the current host/route passes the privacy boundary.
// Route-level event helpers call this again so SPA transitions are dynamic.
ensureAnalyticsReady();

// Sentry يُحمَّل بعد ظهور الصفحة (خطة LCP 2026-09-25، بقرار المالك
// 2026-09-26): التهيئة كاملة في lib/sentryInit.ts، وأخطاء ما قبل التحميل
// يحفظها earlyErrorBuffer ثم تُرسل عبر الفلاتر نفسها.
if (import.meta.env.PROD) {
  installEarlyErrorBuffer();
  const loadSentry = () => {
    import("./lib/sentryInit").then((m) => m.initSentry()).catch(() => {});
  };
  const whenIdle = () => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(loadSentry, { timeout: 3000 });
    else setTimeout(loadSentry, 1500);
  };
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}

// Recover from "white page after deploy": if a lazily-loaded chunk 404s
// because the edge-cached shell points at a rotated build, hard-reload once
// (cache-busted) to fetch the current deploy. This is what makes edge-caching
// the SPA shell in functions/_middleware.js safe. Production only — Vite's HMR
// handles chunk rotation in dev.
//
// REACTIVE layer: deployRecovery listens for `vite:preloadError` / lazy-import
// failures and reloads once with a cache buster.
// PROACTIVE layer: buildVersion polls /build-info.json so an open tab reloads
// to the current deploy BEFORE it tries to load a deleted chunk — turning the
// post-deploy "white page" into a transparent refresh. Combined with the clean
// 404 for missing /assets/* in functions/_middleware.js, this closes the loop.
if (import.meta.env.PROD) {
  installDeployRecovery();
  startBuildVersionPolling();
}

// Suppress noisy errors from third-party ad scripts. They reach
// `window.onerror` because of cross-origin script tags; nothing we can
// fix from this side, but we don't want them surfacing in error
// trackers or polluting the console for the editorial team.
// Also swallow the known DMS/GTM injector that assumes ≥4
// `card-article-grid-*` nodes exist — on /opinion (and any sparse grid)
// it throws TypeError and Replit's runtime-error overlay hijacks the page.
const isKnownAdDomNoise = (message: string) =>
  /card-article-grid/.test(message) ||
  (/parentNode/.test(message) && /undefined is not an object|Cannot read propert/i.test(message));

window.addEventListener("error", (event) => {
  const message = event.message || "";
  if (isKnownAdDomNoise(message)) {
    event.preventDefault();
    console.warn("[Third-party ad DOM noise suppressed]", message);
    return false;
  }
  const src = event.filename || "";
  if (!src) return;
  const isThirdParty =
    src.includes("googletagmanager") ||
    src.includes("googlesyndication") ||
    src.includes("doubleclick") ||
    src.includes("dms") ||
    src.includes("novatiq") ||
    !src.includes(window.location.origin);
  if (isThirdParty) {
    event.preventDefault();
    console.warn("[Third-party script error suppressed]", message);
    return false;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (reason && typeof reason === "object" && !reason.stack) {
    event.preventDefault();
    console.warn("[Third-party promise rejection suppressed]");
    return false;
  }
});

createRoot(document.getElementById("root")!).render(<App />);

import { Capacitor } from "@capacitor/core";
if (import.meta.env.PROD && Capacitor.isNativePlatform()) {
  // Dismiss the native splash as early as possible: fire hide() the
  // moment the splash-screen plugin chunk resolves, instead of waiting
  // on the other three plugin imports (status-bar/keyboard/app). On a
  // cold network those extra chunks can lag, and bundling their wait
  // into the hide() chain kept the splash up longer than needed. The
  // 2.5s launchAutoHide in capacitor.config stays as the safety net.
  import("@capacitor/splash-screen")
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch(() => {});

  Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/keyboard"),
    import("@capacitor/app"),
  ]).then(([{ StatusBar, Style }, { Keyboard }, { App: CapacitorApp }]) => {
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#1a73e8" }).catch(() => {});
    Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      console.warn("App state changed. Is active?", isActive);
    }).catch(() => {});
  }).catch(() => {});
}
