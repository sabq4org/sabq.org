import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./mobile.css";
import { installDeployRecovery } from "./lib/deployRecovery";

// Recover from "white page after deploy": if a lazily-loaded chunk 404s
// because the edge-cached shell points at a rotated build, hard-reload once
// (cache-busted) to fetch the current deploy. This is what makes edge-caching
// the SPA shell in functions/_middleware.js safe. Production only — Vite's HMR
// handles chunk rotation in dev.
if (import.meta.env.PROD) {
  installDeployRecovery();
}

// Suppress noisy errors from third-party ad scripts. They reach
// `window.onerror` because of cross-origin script tags; nothing we can
// fix from this side, but we don't want them surfacing in error
// trackers or polluting the console for the editorial team.
window.addEventListener("error", (event) => {
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
    console.warn("[Third-party script error suppressed]", event.message);
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
      console.log("App state changed. Is active?", isActive);
    }).catch(() => {});
  }).catch(() => {});
}
