/**
 * Create one test reporter user. Mirrors create-admin.ts but for the
 * reporter role.
 *
 * Run AFTER seed-rbac.ts so the 'reporter' role exists in the roles table
 * (otherwise the user_roles assignment is skipped with a warning, but the
 * users.role text column is still set so the user can log in).
 *
 * Usage:
 *   DB_DRIVER=pg \
 *   DATABASE_URL='postgresql://...' \
 *   REPORTER_EMAIL='reporter@sabq.sa' \
 *   REPORTER_PASSWORD='<strong>' \
 *   tsx scripts/create-reporter.ts
 */

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import ws from "ws";
import * as schema from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.REPORTER_EMAIL || "reporter@sabq.sa";
  const password = process.env.REPORTER_PASSWORD;
  const userId = process.env.REPORTER_ID || "reporter-test-1";
  const firstName = process.env.REPORTER_FIRST_NAME || "مراسل";
  const lastName = process.env.REPORTER_LAST_NAME || "تجريبي";

  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }
  if (!password) {
    console.error("❌ REPORTER_PASSWORD environment variable is required");
    process.exit(1);
  }

  console.log(`🔗 Connecting to database (driver=${DB_DRIVER})...`);
  let pool: any;
  let db: any;
  if (DB_DRIVER === "pg") {
    pool = new PgPool({ connectionString: databaseUrl, max: 1 });
    db = drizzlePg(pool, { schema });
  } else {
    pool = new NeonPool({ connectionString: databaseUrl, max: 1 });
    db = drizzleNeon({ client: pool, schema });
  }

  try {
    console.log(`📝 Upserting reporter user: ${email}`);
    const passwordHash = await bcrypt.hash(password, 12);

    const [user] = await db
      .insert(schema.users)
      .values({
        id: userId,
        email,
        passwordHash,
        firstName,
        lastName,
        status: "active",
        isProfileComplete: true,
        emailVerified: true,
        role: "reporter",
        authProvider: "local",
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          email,
          passwordHash,
          firstName,
          lastName,
          status: "active",
          isProfileComplete: true,
          emailVerified: true,
          role: "reporter",
        },
      })
      .returning();

    console.log(`✅ User ready: ${user.email} (id=${user.id})`);

    // Try to assign the reporter role from RBAC table.
    const reporterRole = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, "reporter"))
      .limit(1);

    if (reporterRole.length > 0) {
      await db
        .insert(schema.userRoles)
        .values({ userId: user.id, roleId: reporterRole[0].id })
        .onConflictDoNothing();
      console.log(`✅ user_roles entry created (role_id=${reporterRole[0].id})`);
    } else {
      console.log(
        `⚠️  'reporter' role not found in roles table — run scripts/seed-rbac.ts first.`
      );
      console.log(
        `   The user.role text column is still set to 'reporter', so login + dashboard access work.`
      );
    }

    console.log("");
    console.log("🎉 Reporter ready");
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   ⚠️  Change the password after first login.`);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
