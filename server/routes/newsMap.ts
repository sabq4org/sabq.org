import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { cacheControl, CACHE_DURATIONS } from "../cacheMiddleware";
import { memoryCache } from "../memoryCache";

const router: Router = Router();

router.get("/api/news-map", cacheControl({ maxAge: CACHE_DURATIONS.MEDIUM }), async (req, res) => {
  try {
    const cacheKey = 'news-map-data';
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    const result = await db.execute(sql`
      SELECT id, title, slug, image_url, published_at, geo_locations
      FROM articles 
      WHERE status = 'published' 
        AND geo_locations IS NOT NULL 
        AND jsonb_array_length(geo_locations) > 0
      ORDER BY published_at DESC 
      LIMIT 200
    `);

    const rows = result.rows || result;
    const locationMap = new Map<string, {
      key: string;
      name: string;
      nameEn: string;
      country: string;
      lat: number;
      lng: number;
      count: number;
      articles: Array<{ id: string; title: string; slug: string; imageUrl: string | null; publishedAt: string | null }>;
    }>();

    const sportsTeams = new Set(['الهلال','الاتحاد','النصر','الأهلي','التعاون','العروبة','الشباب','الفيصلي','الباطن','ضمك','الخليج','الفتح','الرائد','الطائي','الوحدة','الحزم','الأخدود','الخلود']);

    for (const row of rows as any[]) {
      let geoLocations: any[] = [];
      try {
        geoLocations = typeof row.geo_locations === 'string'
          ? JSON.parse(row.geo_locations)
          : row.geo_locations;
      } catch {
        continue;
      }

      if (!Array.isArray(geoLocations)) continue;
      for (const loc of geoLocations) {
        if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') continue;
        if (sportsTeams.has(loc.name)) continue;
        if (loc.lat === 0 && loc.lng === 0) continue;

        const lat = loc.lat;
        const lng = loc.lng;
        const key = `${lat.toFixed(1)}_${lng.toFixed(1)}`;

        if (!locationMap.has(key)) {
          locationMap.set(key, {
            key,
            name: loc.name || loc.nameAr || '',
            nameEn: loc.nameEn || loc.name_en || '',
            country: loc.country || loc.countryCode || '',
            lat,
            lng,
            count: 0,
            articles: [],
          });
        }

        const entry = locationMap.get(key)!;
        entry.count++;
        if (entry.articles.length < 5 && !entry.articles.some(a => a.id === row.id)) {
          entry.articles.push({
            id: row.id,
            title: row.title,
            slug: row.slug,
            imageUrl: row.image_url,
            publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
          });
        }
      }
    }

    const responseData = {
      locations: Array.from(locationMap.values()),
    };

    memoryCache.set(cacheKey, responseData, 600000);
    res.json(responseData);
  } catch (error) {
    console.error('[NewsMap] Error:', error);
    res.status(500).json({ error: 'Failed to fetch news map data' });
  }
});

export default router;
