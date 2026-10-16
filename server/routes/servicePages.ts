/**
 * صفحات الخدمة — JSON وبطاقة المشاركة وملف التقويم.
 * التواريخ من مواعيدك فقط. المسار لا يستورد db.
 */
import { Router } from "express";
import { serviceRegion, servicePageById } from "@shared/servicePages/catalog";
import { buildServiceCalendar } from "@shared/servicePages/calendar";
import { presentServicePage, type ServicePageModel } from "@shared/servicePages/present";
import { getPublicPage } from "../services/mawaeedService";
import { renderServiceOgPng } from "../services/servicePageOgImage";

const router = Router();
const PUBLIC_CACHE = "public, max-age=30, s-maxage=60";

function queryRegion(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function loadModel(id: string, rawRegion: string | null): Promise<ServicePageModel | null> {
  const spec = servicePageById(id);
  if (!spec || spec.source.type !== "mawaeed") return null;
  const view = await getPublicPage(spec.source.seriesSlug, serviceRegion(spec.id, rawRegion));
  if (!view) return null;
  return presentServicePage(spec.id, view);
}

router.get("/api/service-pages/:id/og.png", async (req, res) => {
  try {
    const model = await loadModel(req.params.id, queryRegion(req.query.region));
    if (!model) return res.redirect(302, "/branding/sabq-og-image.png");
    const png = await renderServiceOgPng({
      h1: model.h1,
      gregorianLabel: model.next?.gregorianLabel ?? null,
      hijriLabel: model.next?.hijriLabel ?? null,
      certaintyLabel: model.next?.certaintyLabel ?? null,
      path: model.path,
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
    res.send(png);
  } catch (error) {
    console.error("[service-pages] og", error);
    res.redirect(302, "/branding/sabq-og-image.png");
  }
});

router.get("/api/service-pages/:id/calendar.ics", async (req, res) => {
  try {
    const model = await loadModel(req.params.id, queryRegion(req.query.region));
    const ics = model ? buildServiceCalendar(model) : null;
    if (!model || !ics) return res.status(404).type("text/plain").send("لا توجد مواعيد قادمة");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${model.id}${model.region === "riyadh" ? "" : `-${model.region}`}.ics"`);
    res.setHeader("Cache-Control", PUBLIC_CACHE);
    res.send(ics);
  } catch (error) {
    console.error("[service-pages] ics", error);
    res.status(500).type("text/plain").send("تعذر تنفيذ الطلب");
  }
});

router.get("/api/service-pages/:id", async (req, res) => {
  try {
    const model = await loadModel(req.params.id, queryRegion(req.query.region));
    if (!model) return res.status(404).json({ message: "الصفحة غير موجودة" });
    res.setHeader("Cache-Control", PUBLIC_CACHE);
    res.json(model);
  } catch (error) {
    console.error("[service-pages]", error);
    res.status(500).json({ message: "تعذر تنفيذ الطلب" });
  }
});

export default router;
