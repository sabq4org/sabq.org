import "leaflet/dist/leaflet.css";
import { lazy, Suspense, useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { getHudhudBrowserStyleUrl } from "@/lib/hudhudMap";
import {
  newsMapCountryColor,
  newsMapMarkerRadius,
  type NewsMapLocation,
} from "@/lib/newsMapMarkers";

const NewsMapHudhud = lazy(() => import("@/components/NewsMapHudhud"));

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface NewsMapData {
  locations: NewsMapLocation[];
}

function OsmNewsMap({ locations }: { locations: NewsMapLocation[] }) {
  return (
    <MapContainer
      center={[24.7, 44.0]}
      zoom={5}
      scrollWheelZoom={true}
      style={{ height: "100%", width: "100%" }}
      attributionControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.de/{z}/{x}/{y}.png"
      />
      {locations.map((location) => {
        const color = newsMapCountryColor(location.country);
        const radius = newsMapMarkerRadius(location.count);
        return (
          <CircleMarker
            key={location.key}
            center={[location.lat, location.lng]}
            radius={radius}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.6,
              weight: 2,
              opacity: 0.8,
            }}
            data-testid={`marker-location-${location.key}`}
          >
            <Popup>
              <div
                className="min-w-[200px] max-w-[280px]"
                dir="rtl"
                style={{ fontFamily: "inherit" }}
                data-testid={`popup-location-${location.key}`}
              >
                <div className="font-bold text-sm mb-2 pb-1 border-b border-border">
                  {location.name || location.nameEn}
                  <span className="text-muted-foreground font-normal text-xs mr-2">
                    ({location.count} {location.count === 1 ? "خبر" : "أخبار"})
                  </span>
                </div>
                <div className="space-y-2">
                  {location?.articles?.map((article, index) => (
                    <a
                      key={`${article.id}-${index}`}
                      href={`/article/${article.englishSlug || article.slug}`}
                      className="flex gap-2 items-start group"
                      data-testid={`link-article-${article.id}`}
                    >
                      {article.imageUrl && (
                        <img
                          src={article.imageUrl}
                          alt=""
                          className="w-12 h-9 rounded object-cover flex-shrink-0"
                          loading="lazy"
                        />
                      )}
                      <span className="text-xs leading-relaxed line-clamp-2 group-hover:text-primary transition-colors">
                        {article.title}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export default function NewsMap() {
  const { data, isLoading } = useQuery<NewsMapData>({
    queryKey: ["/api/news-map"],
  });
  const [hudhudFailed, setHudhudFailed] = useState(false);
  const onHudhudError = useCallback(() => setHudhudFailed(true), []);
  const useHudhud = Boolean(getHudhudBrowserStyleUrl()) && !hudhudFailed;

  if (isLoading) {
    return (
      <section className="space-y-4" dir="rtl" data-testid="section-news-map-loading">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold">خريطة الأخبار</h2>
        </div>
        <Card className="overflow-hidden">
          <Skeleton className="w-full h-[300px] md:h-[400px]" />
        </Card>
      </section>
    );
  }

  const locations = data?.locations || [];

  if (locations.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4" dir="rtl" data-testid="section-news-map">
      <div className="flex items-center gap-2">
        <MapPin className="h-6 w-6 text-primary" />
        <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-news-map">
          خريطة الأخبار
        </h2>
      </div>
      <Card className="overflow-hidden">
        <div className="w-full h-[300px] md:h-[400px]" data-testid="container-news-map">
          {useHudhud ? (
            <Suspense fallback={<Skeleton className="w-full h-full" />}>
              <NewsMapHudhud locations={locations} onError={onHudhudError} />
            </Suspense>
          ) : (
            <OsmNewsMap locations={locations} />
          )}
        </div>
      </Card>
    </section>
  );
}
