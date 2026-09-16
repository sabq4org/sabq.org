/**
 * GET /api/authors/by-name?name=… — صفحة كاتب عامة للويب
 * (موازية لـ /api/v1/authors/by-name للموبايل؛ بدون auth).
 */
import { Router } from "express";
import { getAuthorPageByName } from "../services/authorProfileService";
import { paginationOrReject } from "../utils/pagination";

const router = Router();

router.get("/api/authors/by-name", async (req, res) => {
  try {
    const rawName = typeof req.query.name === "string" ? req.query.name : "";
    if (!rawName.trim()) {
      return res.status(400).json({ message: "اسم الكاتب مطلوب" });
    }
    const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 12, maxLimit: 50, allowPage: true, defaultPage: 1 });
    if (!pg) return;
    const page = pg.page;
    const limit = pg.limit;

    const result = await getAuthorPageByName(rawName, { page, limit });
    if (!result) {
      return res.status(404).json({ message: "لم يتم العثور على الكاتب" });
    }

    res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    res.json(result);
  } catch (error) {
    console.error("[Authors] by-name error:", error);
    res.status(500).json({ message: "تعذر جلب بيانات الكاتب" });
  }
});

export default router;
