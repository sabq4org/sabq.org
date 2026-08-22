import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme } from "@/components/ThemeProvider";
import { getHudhudBrowserStyleUrl } from "@/lib/hudhudMap";
import {
  newsMapCountryColor,
  newsMapMarkerRadius,
  newsMapPopupHtml,
  type NewsMapLocation,
} from "@/lib/newsMapMarkers";

const RTL_PLUGIN =
  "https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js";

let rtlPluginStarted = false;

function ensureRtlPlugin() {
  if (rtlPluginStarted) return;
  rtlPluginStarted = true;
  void maplibregl.setRTLTextPlugin(RTL_PLUGIN, true).catch(() => {});
}

function toGeoJson(locations: NewsMapLocation[]) {
  return {
    type: "FeatureCollection" as const,
    features: locations.map((location) => ({
      type: "Feature" as const,
      properties: {
        key: location.key,
        color: newsMapCountryColor(location.country),
        radius: newsMapMarkerRadius(location.count),
        popup: newsMapPopupHtml(location),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [location.lng, location.lat],
      },
    })),
  };
}

export default function NewsMapHudhud({
  locations,
  onError,
}: {
  locations: NewsMapLocation[];
  onError: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  const { theme } = useTheme();
  const variant = theme === "dark" ? "dark" : "light";

  useEffect(() => {
    const el = containerRef.current;
    const styleUrl = getHudhudBrowserStyleUrl({ variant, lang: "ar" });
    if (!el || !styleUrl) {
      onError();
      return;
    }

    ensureRtlPlugin();
    let cancelled = false;
    const map = new maplibregl.Map({
      container: el,
      style: styleUrl,
      center: [44.0, 24.7],
      zoom: 5,
      attributionControl: true,
    });
    mapRef.current = map;

    const fail = () => {
      if (!cancelled) onError();
    };

    map.on("error", (event) => {
      const msg = String((event as { error?: { message?: string } }).error?.message ?? "");
      if (/style|401|403|404|503|failed to fetch|unavailable/i.test(msg)) fail();
    });

    const paintLocations = () => {
      if (cancelled || !map.isStyleLoaded()) return;
      const data = toGeoJson(locationsRef.current);
      if (map.getSource("news-locations")) {
        (map.getSource("news-locations") as maplibregl.GeoJSONSource).setData(data);
        return;
      }
      map.addSource("news-locations", { type: "geojson", data });
      map.addLayer({
        id: "news-location-circles",
        type: "circle",
        source: "news-locations",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.6,
          "circle-stroke-width": 2,
          "circle-stroke-color": ["get", "color"],
        },
      });
      map.on("click", "news-location-circles", (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const html = String(feature.properties?.popup ?? "");
        new maplibregl.Popup({ maxWidth: "300px" })
          .setLngLat(feature.geometry.coordinates as [number, number])
          .setHTML(html)
          .addTo(map);
      });
      map.on("mouseenter", "news-location-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "news-location-circles", () => {
        map.getCanvas().style.cursor = "";
      });
    };

    map.on("load", paintLocations);
    map.on("style.load", paintLocations);

    return () => {
      cancelled = true;
      map.remove();
      mapRef.current = null;
    };
  }, [variant, onError]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getSource("news-locations")) return;
    (map.getSource("news-locations") as maplibregl.GeoJSONSource).setData(toGeoJson(locations));
  }, [locations]);

  return <div ref={containerRef} className="h-full w-full" data-testid="container-news-map-hudhud" />;
}
