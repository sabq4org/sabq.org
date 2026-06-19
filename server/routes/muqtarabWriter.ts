/**
 * Public Muqtarab writer profile — صفحة كاتب الزاوية.
 *
 *   GET /api/muqtarab/writers/:id   writer bio + their angles + published topics
 *
 * Drizzle queries live in muqtarabWriterService per ADR-001; this module is
 * HTTP-only. 404 when the user isn't a public Muqtarab writer.
 */
import { Router } from "express";
import { getMuqtarabWriterProfile } from "../services/muqtarabWriterService";

const router = Router();

router.get("/api/muqtarab/writers/:id", async (req, res) => {
  try {
    const profile = await getMuqtarabWriterProfile(req.params.id);
    if (!profile) {
      return res.status(404).json({ message: "Writer not found" });
    }
    res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    res.json(profile);
  } catch (error) {
    console.error("Error fetching Muqtarab writer profile:", error);
    res.status(500).json({ message: "Failed to fetch writer profile" });
  }
});

export default router;
