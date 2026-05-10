// Dual-driver: matches server/db.ts so this script works against both
// Neon (Replit production) and standard PG (Railway). Set DB_DRIVER=pg
// when targeting a non-Neon backend.
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import { Pool as PgPool } from 'pg';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import bcrypt from "bcrypt";
import ws from "ws";
import * as schema from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || 'neon').toLowerCase();

async function createAdminUser() {
  // Use DATABASE_URL from environment (works for both dev and prod)
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not found in environment variables");
    process.exit(1);
  }

  console.log(`🔗 Connecting to database (driver=${DB_DRIVER})...`);
  let pool: any;
  let db: any;
  if (DB_DRIVER === 'pg') {
    pool = new PgPool({ connectionString: databaseUrl, max: 1 });
    db = drizzlePg(pool, { schema });
  } else {
    pool = new NeonPool({ connectionString: databaseUrl, max: 1 });
    db = drizzleNeon({ client: pool, schema });
  }

  try {
    const adminEmail = process.env.ADMIN_EMAIL || "admin@sabq.sa";
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminUserId = "admin-sabq";

    if (!adminPassword) {
      console.error("❌ ADMIN_PASSWORD environment variable is required for security");
      console.error("   Set it using: ADMIN_PASSWORD=your_secure_password");
      process.exit(1);
    }

    console.log(`\n📝 Creating admin user: ${adminEmail}`);

    // Check if user already exists
    const existingUsers = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, adminEmail))
      .limit(1);

    if (existingUsers.length > 0) {
      console.log("⚠️  User already exists, updating...");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    // Create or update admin user
    const [adminUser] = await db
      .insert(schema.users)
      .values({
        id: adminUserId,
        email: adminEmail,
        passwordHash: passwordHash,
        firstName: "مسؤول",
        lastName: "النظام",
        status: "active",
        isProfileComplete: true,
        role: "admin",
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          email: adminEmail,
          passwordHash: passwordHash,
          firstName: "مسؤول",
          lastName: "النظام",
          status: "active",
          isProfileComplete: true,
          role: "admin",
        },
      })
      .returning();

    console.log(`✅ Admin user created/updated: ${adminUser.email}`);
    console.log(`   Password: ${adminPassword}`);

    // Get all roles
    const allRoles = await db.select().from(schema.roles);
    console.log(`\n📋 Found ${allRoles.length} roles`);

    // Assign system_admin role
    const systemAdminRole = allRoles.find(r => r.name === "system_admin");
    if (systemAdminRole) {
      await db
        .insert(schema.userRoles)
        .values({
          userId: adminUserId,
          roleId: systemAdminRole.id,
        })
        .onConflictDoNothing();
      console.log(`✅ Assigned system_admin role`);
    } else {
      console.log(`⚠️  system_admin role not found`);
    }

    // Assign admin role
    const adminRole = allRoles.find(r => r.name === "admin");
    if (adminRole) {
      await db
        .insert(schema.userRoles)
        .values({
          userId: adminUserId,
          roleId: adminRole.id,
        })
        .onConflictDoNothing();
      console.log(`✅ Assigned admin role`);
    } else {
      console.log(`⚠️  admin role not found`);
    }

    console.log(`\n🎉 Admin user setup complete!`);
    console.log(`\n📌 Login credentials:`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`\n⚠️  Please change this password after first login!`);

  } catch (error) {
    console.error("❌ Error creating admin user:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

createAdminUser();
