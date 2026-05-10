/**
 * Seed Smart Categories from JSON to Database
 * يملأ قاعدة البيانات بالتصنيفات الذكية من ملف JSON
 */

import { db } from "../db";
import { categories } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";

interface SmartCategory {
  name_ar: string;
  name_en?: string;
  slug: string;
  type: "core" | "dynamic" | "seasonal" | "smart";
  icon?: string;
  description?: string;
  status: "active" | "inactive";
  autoActivate?: boolean;
  updateInterval?: number;
  seasonalRules?: {
    hijriMonth?: string;
    hijriYear?: string | "auto";
    gregorianMonth?: number;
    dateRange?: {
      start: string;
      end: string;
    };
    activateDaysBefore?: number;
    deactivateDaysAfter?: number;
  };
  features?: {
    [key: string]: boolean;
  };
  aiConfig?: {
    [key: string]: any;
  };
  order?: number;
}

async function seedSmartCategories() {
  try {
    console.log("[Seed] 🌱 Starting Smart Categories seeding...");

    // Read JSON file (using absolute path from project root)
    const projectRoot = path.resolve(process.cwd(), "../..");
    const jsonPath = path.join(projectRoot, "attached_assets", "smart-categories-structure.json");
    console.log(`[Seed] 📁 Reading from: ${jsonPath}`);
    const jsonContent = await fs.readFile(jsonPath, "utf-8");
    const data = JSON.parse(jsonContent);

    if (!data.categories || !Array.isArray(data.categories)) {
      throw new Error("Invalid JSON structure: missing 'categories' array");
    }

    const categoriesToSeed: SmartCategory[] = data.categories;
    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const category of categoriesToSeed) {
      try {
        // Check if category exists
        const existing = await db
          .select()
          .from(categories)
          .where(eq(categories.slug, category.slug))
          .limit(1);

        if (existing.length > 0) {
          // Update existing category
          const updateData: any = {
            nameAr: category.name_ar,
            type: category.type,
            status: category.status,
            displayOrder: category.order || Math.floor(Date.now() / 1000),
            updatedAt: sql`now()`,
          };

          if (category.name_en) updateData.nameEn = category.name_en;
          if (category.icon) updateData.icon = category.icon;
          if (category.description) updateData.description = category.description;
          if (category.autoActivate !== undefined) updateData.autoActivate = category.autoActivate;
          if (category.updateInterval) updateData.updateInterval = category.updateInterval;
          if (category.seasonalRules) updateData.seasonalRules = category.seasonalRules;
          if (category.features) updateData.features = category.features;
          if (category.aiConfig) updateData.aiConfig = category.aiConfig;

          await db
            .update(categories)
            .set(updateData)
            .where(eq(categories.slug, category.slug));

          updated++;
          console.log(`[Seed] ✅ Updated: ${category.name_ar} (${category.slug})`);
        } else {
          // Insert new category
          const insertData: any = {
            nameAr: category.name_ar,
            slug: category.slug,
            type: category.type,
            status: category.status,
            displayOrder: category.order || Math.floor(Date.now() / 1000),
          };

          if (category.name_en) insertData.nameEn = category.name_en;
          if (category.icon) insertData.icon = category.icon;
          if (category.description) insertData.description = category.description;
          if (category.autoActivate !== undefined) insertData.autoActivate = category.autoActivate;
          if (category.updateInterval) insertData.updateInterval = category.updateInterval;
          if (category.seasonalRules) insertData.seasonalRules = category.seasonalRules;
          if (category.features) insertData.features = category.features;
          if (category.aiConfig) insertData.aiConfig = category.aiConfig;

          await db
            .insert(categories)
            .values(insertData);

          inserted++;
          console.log(`[Seed] ✨ Inserted: ${category.name_ar} (${category.slug})`);
        }
      } catch (error) {
        console.error(`[Seed] ❌ Error processing ${category.name_ar}:`, error);
        skipped++;
      }
    }

    console.log("\n[Seed] 🎉 Seeding completed!");
    console.log(`[Seed] ✨ Inserted: ${inserted} categories`);
    console.log(`[Seed] ✅ Updated: ${updated} categories`);
    console.log(`[Seed] ⏭️  Skipped: ${skipped} categories`);

    return {
      inserted,
      updated,
      skipped,
      total: categoriesToSeed.length,
    };
  } catch (error) {
    console.error("[Seed] ❌ Fatal error during seeding:", error);
    throw error;
  }
}

// Run if executed directly (ES module check)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  seedSmartCategories()
    .then(() => {
      console.log("[Seed] ✅ Seeding script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("[Seed] ❌ Seeding script failed:", error);
      process.exit(1);
    });
}

export { seedSmartCategories };
