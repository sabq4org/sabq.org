import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { categories, userInterests } from "@shared/schema";
import { toPublicUser } from "../utils/publicUser";

const router: Router = Router();

// Get user interests (categories they're interested in)
router.get("/api/interests", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const userInterestsList = await db
      .select({
        id: categories.id,
        categoryId: categories.id,
        nameAr: categories.nameAr,
        nameEn: categories.nameEn,
        slug: categories.slug,
        heroImageUrl: categories.heroImageUrl,
      })
      .from(userInterests)
      .innerJoin(categories, eq(userInterests.categoryId, categories.id))
      .where(eq(userInterests.userId, userId));

    res.json(userInterestsList);
  } catch (error) {
    console.error("Error fetching user interests:", error);
    res.status(500).json({ message: "Failed to fetch interests" });
  }
});

// Save user interests
router.post("/api/interests", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { interestIds } = req.body;

    if (!Array.isArray(interestIds) || interestIds.length === 0) {
      return res.status(400).json({ message: "يجب اختيار اهتمام واحد على الأقل" });
    }

    // Dedupe + keep only strings (F-12). Previously duplicates and bad IDs
    // flowed straight to the insert.
    const requested = Array.from(
      new Set(interestIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
    );

    // Validate against the real category catalog — an unknown ID used to throw
    // a FK violation AFTER the delete had already run, wiping the user's
    // interests (F-12). Intersect with existing categories instead.
    const validRows = requested.length
      ? await db
          .select({ id: categories.id })
          .from(categories)
          .where(inArray(categories.id, requested))
      : [];
    const validIds = validRows.map((r) => r.id);

    if (validIds.length === 0) {
      return res.status(400).json({ message: "لا توجد اهتمامات صالحة للحفظ" });
    }

    // Replace-all inside a transaction so a failure can't leave the user with
    // zero interests (F-12).
    await db.transaction(async (tx) => {
      await tx.delete(userInterests).where(eq(userInterests.userId, userId));
      await tx.insert(userInterests).values(
        validIds.map((categoryId) => ({ userId, categoryId })),
      );
    });

    res.json({ success: true, message: "تم حفظ الاهتمامات بنجاح" });
  } catch (error) {
    console.error("Error saving interests:", error);
    res.status(500).json({ message: "Failed to save interests" });
  }
});

// Complete profile (mark onboarding as done)
router.post("/api/auth/complete-profile", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const user = await storage.updateUser(userId, {
      isProfileComplete: true,
    });

    // storage.updateUser returns the raw row — strip credentials.
    res.json({ success: true, user: toPublicUser(user) });
  } catch (error) {
    console.error("Error completing profile:", error);
    res.status(500).json({ message: "Failed to complete profile" });
  }
});

export default router;
