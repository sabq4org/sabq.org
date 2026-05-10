import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from "ws";
import { neonConfig } from '@neondatabase/serverless';
import * as schema from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

async function createNationalDayTheme() {
  // Use DATABASE_URL from environment (works for both dev and prod)
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found in environment variables");
    process.exit(1);
  }

  console.log("🔗 Connecting to database...");
  const pool = new Pool({ 
    connectionString: databaseUrl,
    max: 1
  });
  const db = drizzle({ client: pool, schema });

  try {
    const themeSlug = "saudi-national-day-94";

    console.log(`\n📝 Creating Saudi National Day theme: ${themeSlug}`);

    // Check if theme already exists
    const existingThemes = await db
      .select()
      .from(schema.themes)
      .where(eq(schema.themes.slug, themeSlug))
      .limit(1);

    if (existingThemes.length > 0) {
      console.log("⚠️  Theme already exists, skipping creation");
      console.log(`✅ Theme ID: ${existingThemes[0].id}`);
      return;
    }

    // Get first admin user
    const adminUsers = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, "admin"))
      .limit(1);

    if (adminUsers.length === 0) {
      console.error("❌ No admin user found. Please create an admin user first.");
      process.exit(1);
    }

    const adminUser = adminUsers[0];
    console.log(`👤 Using admin user: ${adminUser.email} (${adminUser.id})`);

    // Create the theme
    const [theme] = await db
      .insert(schema.themes)
      .values({
        name: "اليوم الوطني السعودي 94",
        slug: themeSlug,
        status: "draft",
        priority: 10,
        startAt: new Date("2025-09-20T00:00:00Z"),
        endAt: new Date("2025-09-23T23:59:59Z"),
        applyTo: ["site_full"],
        tokens: {
          colors: {
            "primary": "150 100% 22%",
            "primary-foreground": "0 0% 100%",
            "secondary": "0 0% 100%",
            "secondary-foreground": "150 100% 22%",
            "background": "60 11% 97%",
            "foreground": "150 20% 15%",
            "accent": "150 85% 95%",
            "accent-foreground": "150 85% 25%"
          }
        },
        assets: {
          logoLight: undefined,
          logoDark: undefined,
          favicon: undefined,
          banner: undefined,
          ogImage: undefined
        },
        createdBy: adminUser.id,
      })
      .returning();

    console.log(`✅ Saudi National Day theme created successfully!`);
    console.log(`   Theme ID: ${theme.id}`);
    console.log(`   Name: ${theme.name}`);
    console.log(`   Slug: ${theme.slug}`);
    console.log(`   Status: ${theme.status}`);
    console.log(`   Priority: ${theme.priority}`);
    console.log(`   Start Date: ${theme.startAt?.toISOString()}`);
    console.log(`   End Date: ${theme.endAt?.toISOString()}`);
    console.log(`   Apply To: ${theme.applyTo.join(", ")}`);
    console.log(`\n🎉 Theme setup complete!`);
    console.log(`\n📌 Next steps:`);
    console.log(`   1. Update theme status to "published" when ready`);
    console.log(`   2. Add custom logos and assets if needed`);
    console.log(`   3. The theme will automatically activate during Sept 20-23, 2025`);

  } catch (error) {
    console.error("❌ Error creating Saudi National Day theme:", error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log("\n🔌 Database connection closed");
  }
}

createNationalDayTheme();
