import { readFile } from "fs/promises";
import { join } from "path";
import { eq } from "drizzle-orm";
import type { Pool } from "@neondatabase/serverless";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "../../shared/schema.js";
import { seedRBAC } from "../seedRBAC.js";
import { bootstrapAdmin } from "./bootstrapAdmin.js";

export async function setupProductionDatabase(
  pool: Pool,
  db: NeonDatabase<typeof schema>
) {
  console.log("🚀 Starting production database setup...");

  try {
    // Step 1: Apply schema (create tables) - Skip if tables exist
    console.log("\n📋 Step 1: Checking database schema...");
    try {
      const migrationSQL = await readFile(
        join(process.cwd(), "migrations", "0000_lazy_jocasta.sql"),
        "utf-8"
      );
      
      await pool.query(migrationSQL);
      console.log("✅ Database schema applied successfully");
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        console.log("⏭️  Tables already exist, skipping schema creation");
      } else {
        throw error;
      }
    }

    // Step 2: Seed RBAC (Roles & Permissions)
    console.log("\n👥 Step 2: Seeding RBAC (Roles & Permissions)...");
    const { allRoles, allPermissions } = await seedRBAC();
    console.log(`✅ Created ${allRoles.length} roles and ${allPermissions.length} permissions`);

    // Step 3: Seed Categories
    console.log("\n📁 Step 3: Seeding categories...");
    const categoriesData = [
      { nameAr: "سياسة", nameEn: "Politics", slug: "politics", color: "#e74c3c", icon: "⚖️", displayOrder: 1 },
      { nameAr: "اقتصاد", nameEn: "Economy", slug: "economy", color: "#3498db", icon: "💼", displayOrder: 2 },
      { nameAr: "رياضة", nameEn: "Sports", slug: "sports", color: "#2ecc71", icon: "⚽", displayOrder: 3 },
      { nameAr: "تقنية", nameEn: "Technology", slug: "technology", color: "#9b59b6", icon: "💻", displayOrder: 4 },
      { nameAr: "صحة", nameEn: "Health", slug: "health", color: "#1abc9c", icon: "🏥", displayOrder: 5 },
      { nameAr: "ثقافة", nameEn: "Culture", slug: "culture", color: "#f39c12", icon: "🎭", displayOrder: 6 },
    ];

    for (const cat of categoriesData) {
      await db
        .insert(schema.categories)
        .values({
          nameAr: cat.nameAr,
          nameEn: cat.nameEn,
          slug: cat.slug,
          color: cat.color,
          icon: cat.icon,
          displayOrder: cat.displayOrder,
        })
        .onConflictDoNothing();
    }
    console.log(`✅ Created ${categoriesData.length} categories`);

    // Step 4: Create admin user
    console.log("\n👤 Step 4: Creating admin user...");
    const adminResult = await bootstrapAdmin(db);
    console.log(`✅ Admin user created: ${adminResult.email}`);

    console.log("\n🎉 Production database setup completed successfully!");
    return {
      success: true,
      message: "Database setup completed",
      credentials: {
        email: adminResult.email,
        password: adminResult.password,
      },
    };
  } catch (error) {
    console.error("❌ Production setup error:", error);
    throw error;
  }
}
