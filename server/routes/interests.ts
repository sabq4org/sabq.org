import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { categories, userInterests } from "@shared/schema";

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

    await db.delete(userInterests).where(eq(userInterests.userId, userId));

    const interestsToInsert = interestIds.map(categoryId => ({
      userId,
      categoryId,
    }));

    await db.insert(userInterests).values(interestsToInsert);

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

    res.json({ success: true, user });
  } catch (error) {
    console.error("Error completing profile:", error);
    res.status(500).json({ message: "Failed to complete profile" });
  }
});

export default router;
