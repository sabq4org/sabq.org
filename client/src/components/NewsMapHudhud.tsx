import { useEffect, useRef } from "react";
import { useTheme } from "@/components/ThemeProvider";
import { getHudhudBrowserStyleUrl } from "@/lib/hudhudMap";
import { ensureMapLibreRtl, loadMapLibre, type MapLibreMap } from "@/lib/loadMapLibre";
import {
  newsMapCountryColor,
  newsMapMarkerRadius,
  newsMapPopupHtml,
  type NewsMapLocation,
} from "@/lib/newsMapMarkers";

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
  const mapRef = useRef<MapLibreMap | null>(null);
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

    let cancelled = false;
    void loadMapLibre()
      .then((maplibregl) => {
        if (cancelled || !containerRef.current) return;
        ensureMapLibreRtl(maplibregl);
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          center: [44.0, 24.7],
          zoom: 5,
        });
        mapRef.current = map;

        const fail = () => {
          if (!cancelled) onError();
        };

        map.on("error", (event: { error?: { message?: string } }) => {
          const msg = String(event?.error?.message ?? "");
          if (/style|401|403|404|503|failed to fetch|unavailable/i.test(msg)) fail();
        });

        const paintLocations = () => {
          if (cancelled || !map.isStyleLoaded()) return;
          const data = toGeoJson(locationsRef.current);
          const existing = map.getSource("news-locations");
          if (existing?.setData) {
            existing.setData(data);
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
          map.on("click", "news-location-circles", (e: {
            features?: Array<{ geometry?: { type?: string; coordinates?: [number, number] }; properties?: { popup?: string } }>;
          }) => {
            const feature = e.features?.[0];
            if (!feature || feature.geometry?.type !== "Point" || !feature.geometry.coordinates) return;
            new maplibregl.Popup({ maxWidth: "300px" })
              .setLngLat(feature.geometry.coordinates)
              .setHTML(String(feature.properties?.popup ?? ""))
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
      })
      .catch(() => {
        if (!cancelled) onError();
      });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [variant, onError]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("news-locations");
    if (!map?.isStyleLoaded() || !source?.setData) return;
    source.setData(toGeoJson(locations));
  }, [locations]);

  return <div ref={containerRef} className="h-full w-full" data-testid="container-news-map-hudhud" />;
}
