import { Router, type Request } from "express";
import { requireAuth, userHasAnyRole } from "../rbac";
import { listReporterArticles } from "../services/reporterArticleListService";

const router = Router();

router.get("/api/reporter/my-articles", requireAuth, async (req: Request, res) => {
  const userId = (req.user as { id: string } | undefined)?.id;
  if (!userId) return res.status(401).json({ message: "يجب تسجيل الدخول" });
  try {
    if (!(await userHasAnyRole(userId, ["reporter"]))) {
      return res.status(403).json({ message: "هذه الصفحة خاصة بالمراسلين" });
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ articles: await listReporterArticles(userId) });
  } catch (error) {
    console.error("[Reporter my-articles] failed:", error);
    res.status(500).json({ message: "تعذّر تحميل أخبارك" });
  }
});

export default router;
