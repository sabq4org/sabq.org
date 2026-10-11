import { Router, type Request } from "express";
import { requireAuth, requirePermission, requireAnyPermission } from "../rbac";
import { registerLogoAsMedia, searchLogos, suggestLogosForArticle } from "../services/logoLibraryService";
import { parseLimit } from "../utils/pagination";

const router: Router = Router();

const WRITER_GATE = requireAnyPermission("articles.create", "articles.edit_own", "articles.edit_any", "media.view");

// GET /api/logos/search?q=&limit=&offset= - تبويب «الشعارات» في منتقي الوسائط.
// بلا q يعرض الأكثر تنزيلًا. Gated like /api/media/suggest-for-article.
router.get("/api/logos/search", requireAuth, WRITER_GATE, async (req: Request, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 120) : "";
    const limit = parseLimit(req.query.limit, 30, 60);
    const offset = Math.max(0, Math.min(5000, Number(req.query.offset) || 0));
    res.json(await searchLogos(q, limit, offset));
  } catch (error) {
    console.error("Error searching logos:", error);
    res.status(500).json({ message: "فشل في البحث عن الشعارات" });
  }
});

// POST /api/logos/suggest-for-article {title, content} - شعارات الجهات المذكورة في الخبر.
// POST لأن المتن كاملًا لا يتسع في رابط GET.
router.post("/api/logos/suggest-for-article", requireAuth, WRITER_GATE, async (req: Request, res) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.slice(0, 500) : "";
    const content = typeof req.body?.content === "string" ? req.body.content.slice(0, 60_000) : null;
    if (!title.trim() && !content?.trim()) return res.json({ logos: [] });
    const limit = parseLimit(req.body?.limit, 12, 30);
    res.json({ logos: await suggestLogosForArticle(title, content, limit) });
  } catch (error) {
    console.error("Error suggesting logos:", error);
    res.status(500).json({ message: "فشل في اقتراح الشعارات" });
  }
});

// POST /api/logos/:id/use - يسجّل نسخة PNG في مكتبة الوسائط ويعيد سجل media_files
// (مثل /api/media/save-existing، وبنفس صلاحيتها media.view).
router.post("/api/logos/:id/use", requireAuth, requirePermission("media.view"), async (req: Request, res) => {
  try {
    const userId = (req.user as { id: string } | undefined)?.id;
    if (!userId) return res.status(401).json({ message: "يجب تسجيل الدخول" });
    const media = await registerLogoAsMedia(String(req.params.id), userId);
    if (!media) return res.status(404).json({ message: "الشعار غير موجود" });
    res.json(media);
  } catch (error) {
    console.error("Error using logo:", error);
    res.status(500).json({ message: "فشل في استخدام الشعار" });
  }
});

export default router;
