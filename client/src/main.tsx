import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./mobile.css";
import { cacheBustReload, canCacheBust, markCacheBust, resetCacheBustState } from "@/lib/cacheBust";

declare const __SABQ_BUILD_ID__: string;
console.log('[sabq build]', __SABQ_BUILD_ID__);

const CHUNK_RELOAD_KEY = 'sabq_chunk_error_reload';
const CHUNK_RELOAD_TIMEOUT = 60000;

function isChunkLoadError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('importing binding name') ||
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('loading css chunk') ||
    msg.includes('is not found') ||
    msg.includes('chunkloaderror') ||
    msg.includes('unable to preload css') ||
    msg.includes('importing a module script failed')
  );
}

function handleChunkError(): void {
  const lastReload = sessionStorage.getItem(CHUNK_RELOAD_KEY);
  const now = Date.now();

  if (!lastReload || (now - parseInt(lastReload, 10)) > CHUNK_RELOAD_TIMEOUT) {
    if (canCacheBust()) {
      console.log('[ChunkErrorHandler] Detected stale chunk, cache-bust reloading...');
      sessionStorage.setItem(CHUNK_RELOAD_KEY, now.toString());
      markCacheBust();
      cacheBustReload();
    }
  }
}

window.addEventListener('error', (event) => {
  const message = event.message || '';
  
  if (isChunkLoadError(message)) {
    event.preventDefault();
    handleChunkError();
    return false;
  }
  
  const src = event.filename || '';
  const isThirdParty = src.includes('googletagmanager') || 
                       src.includes('googlesyndication') ||
                       src.includes('doubleclick') ||
                       src.includes('dms') ||
                       src.includes('novatiq') ||
                       !src.includes(window.location.origin);
  
  if (isThirdParty) {
    event.preventDefault();
    console.warn('[Third-party script error suppressed]', event.message);
    return false;
  }
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = reason?.message || reason?.toString() || '';
  
  if (isChunkLoadError(message)) {
    event.preventDefault();
    handleChunkError();
    return;
  }
  
  if (reason && typeof reason === 'object' && !reason.stack) {
    event.preventDefault();
    console.warn('[Third-party promise rejection suppressed]');
    return false;
  }
});

// One-time cleanup: unregister any legacy Service Worker that may have been
// installed by older builds and clear its caches. The app no longer ships a SW.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length === 0) return;
    console.log(`[SW Cleanup] Unregistering ${regs.length} legacy service worker(s)`);
    regs.forEach((reg) => reg.unregister().catch(() => {}));
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => caches.delete(k).catch(() => {}));
      }).catch(() => {});
    }
  }).catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);

// Stable-boot budget reset.
// 30s after mount, if React has actually painted real children into #root
// (not the static instant-loader skeleton), wipe every chunk-recovery
// counter — inline safety net + cacheBust budget + main.tsx own counter.
// Without this, a user who hit one bad deploy cycle and burned through the
// 3-5 reload budget gets "تعذر تحميل الصفحة" on the NEXT minor blip for
// the rest of their session, even though the current HTML+chunks are fine.
setTimeout(() => {
  const root = document.getElementById("root");
  if (!root || root.childElementCount === 0) return;
  const first = root.firstElementChild;
  if (first && first.classList && first.classList.contains("instant-loader")) return;
  resetCacheBustState();
}, 30_000);

import { Capacitor } from '@capacitor/core';
if (import.meta.env.PROD && Capacitor.isNativePlatform()) {
  Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/keyboard'),
    import('@capacitor/app'),
  ]).then(([{ StatusBar, Style }, { SplashScreen }, { Keyboard }, { App: CapacitorApp }]) => {
    StatusBar.setStyle({ style: Style.Light }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#1a73e8' }).catch(() => {});
    SplashScreen.hide().catch(() => {});
    Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => {});
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      console.log('App state changed. Is active?', isActive);
    }).catch(() => {});
  }).catch(() => {});
}
