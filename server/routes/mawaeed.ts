/**
 * مواعيدك — JSON عام للصفحة الخفيفة، وتحرير خلف mawaeed.edit.
 * الأدمن يمر لأن userHasPermission يختصر حسابات المسؤول.
 */
import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { requirePermission } from "../rbac";
import { purgeContentSurfaces } from "../services/cloudflarePurge";
import {
  MawaeedError,
  confirmOccurrence,
  createOccurrence,
  getAdminBundle,
  getPublicPage,
  listSitemapEntries,
  updateOccurrence,
} from "../services/mawaeedService";
import { occurrenceWriteSchema } from "@shared/mawaeed/validate";
import { SERIES_CATALOG } from "@shared/mawaeed/model";

const router = Router();
const PUBLIC_CACHE = "public, max-age=30, s-maxage=60";

function actorId(req: Request): string | null {
  const id = (req.user as { id?: string } | undefined)?.id;
  return id || null;
}

function sendError(res: Response, error: unknown) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: "بيانات غير صالحة", errors: error.issues.map((issue) => issue.message) });
  }
  if (error instanceof MawaeedError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error("[mawaeed]", error);
  return res.status(500).json({ message: "تعذر تنفيذ الطلب" });
}

async function purgeMawaeed() {
  const paths = ["/mawaeed", ...SERIES_CATALOG.map((item) => `/mawaeed/${item.slug}`)];
  const regions = ["riyadh", "makkah", "madinah", "jeddah", "taif"];
  const urls = paths.flatMap((path) => [path, ...regions.map((region) => `${path}?region=${region}`)]);
  urls.push("/sitemap-mawaeed.xml");
  try {
    await purgeContentSurfaces(urls, { immediate: true });
  } catch (error) {
    console.error("[mawaeed] purge failed", error);
  }
}

router.get("/api/mawaeed", async (req, res) => {
  try {
    const view = await getPublicPage(null, typeof req.query.region === "string" ? req.query.region : null);
    if (!view) return res.status(404).json({ message: "الصفحة غير موجودة" });
    res.setHeader("Cache-Control", PUBLIC_CACHE);
    res.json(view);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/api/mawaeed/admin", requirePermission("mawaeed.edit"), async (_req, res) => {
  try {
    res.setHeader("Cache-Control", "private, no-store");
    res.json(await getAdminBundle());
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/api/mawaeed/admin/occurrences", requirePermission("mawaeed.edit"), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const write = occurrenceWriteSchema.parse(req.body);
    const created = await createOccurrence(userId, write);
    await purgeMawaeed();
    res.status(201).json(created);
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/api/mawaeed/admin/occurrences/:id", requirePermission("mawaeed.edit"), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const write = occurrenceWriteSchema.parse(req.body);
    const updated = await updateOccurrence(userId, req.params.id, write);
    await purgeMawaeed();
    res.json(updated);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/api/mawaeed/admin/occurrences/:id/confirm", requirePermission("mawaeed.edit"), async (req, res) => {
  try {
    const userId = actorId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const updated = await confirmOccurrence(userId, req.params.id, req.body);
    await purgeMawaeed();
    res.json(updated);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/api/mawaeed/:slug", async (req, res) => {
  try {
    const view = await getPublicPage(req.params.slug, typeof req.query.region === "string" ? req.query.region : null);
    if (!view) return res.status(404).json({ message: "القسم غير موجود" });
    res.setHeader("Cache-Control", PUBLIC_CACHE);
    res.json(view);
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/sitemap-mawaeed.xml", async (_req, res) => {
  try {
    const entries = await listSitemapEntries();
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    for (const entry of entries) {
      xml += `  <url><loc>${entry.loc}</loc><lastmod>${entry.lastmod}</lastmod><changefreq>daily</changefreq><priority>0.7</priority></url>\n`;
    }
    xml += "</urlset>";
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=1800");
    res.send(xml);
  } catch (error) {
    console.error("[mawaeed] sitemap", error);
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
