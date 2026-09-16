/** تحميل MapLibre من CDN عند الحاجة — لا يُضمَّن في حزمة Vite (تجنّب نفاد ذاكرة البناء). */

const MAPLIBRE_VERSION = "5.9.0";
const CSS_HREF = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const JS_HREF = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const RTL_PLUGIN =
  "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js";

export type MapLibreLike = {
  Map: new (opts: Record<string, unknown>) => MapLibreMap;
  Popup: new (opts?: Record<string, unknown>) => MapLibrePopup;
  setRTLTextPlugin: (url: string, lazy: boolean) => Promise<void>;
};

export type MapLibreMap = {
  addSource: (id: string, src: Record<string, unknown>) => void;
  addLayer: (layer: Record<string, unknown>) => void;
  getSource: (id: string) => { setData?: (data: unknown) => void } | undefined;
  getCanvas: () => HTMLCanvasElement;
  isStyleLoaded: () => boolean;
  on: (event: string, ...args: unknown[]) => void;
  remove: () => void;
};

export type MapLibrePopup = {
  setLngLat: (lngLat: [number, number]) => MapLibrePopup;
  setHTML: (html: string) => MapLibrePopup;
  addTo: (map: MapLibreMap) => MapLibrePopup;
};

declare global {
  interface Window {
    maplibregl?: MapLibreLike;
  }
}

let loadPromise: Promise<MapLibreLike> | null = null;
let rtlStarted = false;

function ensureStylesheet() {
  if (document.querySelector(`link[href="${CSS_HREF}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = CSS_HREF;
  document.head.appendChild(link);
}

export function loadMapLibre(): Promise<MapLibreLike> {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (loadPromise) return loadPromise;
  const pending = new Promise<MapLibreLike>((resolve, reject) => {
    ensureStylesheet();
    const existing = document.querySelector(`script[src="${JS_HREF}"]`) as HTMLScriptElement | null;
    const done = () => {
      if (!window.maplibregl) {
        reject(new Error("maplibre-gl failed to attach"));
        return;
      }
      resolve(window.maplibregl);
    };
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => reject(new Error("maplibre-gl script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = JS_HREF;
    script.async = true;
    script.onload = done;
    script.onerror = () => reject(new Error("maplibre-gl script failed"));
    document.head.appendChild(script);
  }).catch((err) => {
    loadPromise = null;
    throw err;
  });
  loadPromise = pending;
  return pending;
}

export function ensureMapLibreRtl(maplibregl: MapLibreLike) {
  if (rtlStarted) return;
  rtlStarted = true;
  void maplibregl.setRTLTextPlugin(RTL_PLUGIN, true).catch(() => {});
}
