import { Router } from "express";

const router = Router();

export function retiredAudioNewsletterPayload() {
  return {
    newsletters: [],
    total: 0,
    categories: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    retired: true,
  };
}

// Audio newsletters were intentionally retired in PR #1216. Old cached web
// clients still call these public list endpoints; answer with the historical
// response shape so they stop surfacing/retrying a noisy 404.
router.get(["/api/audio-newsletters", "/api/audio-newsletters/public"], (_req, res) => {
  res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.json(retiredAudioNewsletterPayload());
});

// A bookmarked legacy episode is permanently gone, not temporarily missing.
router.get(["/api/audio-newsletters/public/:id", "/api/audio-newsletters/:slug"], (_req, res) => {
  res.set("Cache-Control", "public, max-age=300, s-maxage=3600");
  res.status(410).json({ message: "تم إيقاف النشرات الصوتية", retired: true });
});

export default router;
