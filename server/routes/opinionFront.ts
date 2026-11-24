// صفحة الرأي للقارئ: GET /api/opinion-front (علني).
// ADR-001: الاستعلامات في opinionFrontService.
import { Router, type Request, type Response } from "express";
import { getOpinionFront } from "../services/opinionFrontService";

const router = Router();

router.get("/api/opinion-front", async (_req: Request, res: Response) => {
  try {
    const payload = await getOpinionFront();
    res.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
    res.json(payload);
  } catch (error) {
    console.error("[OpinionFront] failed:", error);
    res.status(500).json({ message: "تعذر تحميل صفحة الرأي" });
  }
});

export default router;
