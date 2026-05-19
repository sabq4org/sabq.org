// One-off press-card data fixer.
//
// Why this exists: the Apple Wallet press card is rendered from three
// independent DB columns (users.role, users.jobTitle,
// users.cardValidUntil) plus the boolean hasPressCard / press ID.
// When those drift out of sync you get visual artefacts on the
// rendered card — the most common being "role says X, jobTitle says
// Y" or "expiry date silently missing because cardValidUntil is null".
//
// Usage (DRY-RUN by default):
//   DATABASE_URL=postgres://... \
//   USER_EMAIL=ali@example.com \
//   ROLE=chief_editor \
//   JOB_TITLE="رئيس التحرير" \
//   DEPARTMENT="الإدارة العليا" \
//   PRESS_ID=SBQ-2026-0001 \
//   VALID_UNTIL=2028-12-31 \
//   tsx scripts/update-press-card.ts
//
// Add APPLY=1 to actually write. Without it the script only reports
// the diff and exits.
//
// Dual-driver to match server/db.ts — Neon (default, Replit) or
// node-postgres (DB_DRIVER=pg, Railway).

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();
const APPLY = process.env.APPLY === "1" || process.env.APPLY === "true";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const databaseUrl = need("DATABASE_URL");
  const userEmail = need("USER_EMAIL");

  // All other fields are optional — only fields that are passed get
  // written. This lets you fix one column at a time without
  // accidentally wiping the rest.
  const role = process.env.ROLE || undefined;
  const jobTitle = process.env.JOB_TITLE || undefined;
  const department = process.env.DEPARTMENT || undefined;
  const pressId = process.env.PRESS_ID || undefined;
  const validUntilStr = process.env.VALID_UNTIL || undefined;
  const hasPressCardEnv = process.env.HAS_PRESS_CARD;

  let validUntil: Date | undefined;
  if (validUntilStr) {
    const parsed = new Date(validUntilStr);
    if (isNaN(parsed.getTime())) {
      console.error(`❌ VALID_UNTIL is not a valid date: ${validUntilStr}`);
      process.exit(1);
    }
    validUntil = parsed;
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
    const [user] = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        role: schema.users.role,
        hasPressCard: schema.users.hasPressCard,
        jobTitle: schema.users.jobTitle,
        department: schema.users.department,
        pressIdNumber: schema.users.pressIdNumber,
        cardValidUntil: schema.users.cardValidUntil,
      })
      .from(schema.users)
      .where(eq(schema.users.email, userEmail))
      .limit(1);

    if (!user) {
      console.error(`❌ No user found with email: ${userEmail}`);
      process.exit(1);
    }

    console.log(`\n👤 Found user: ${user.firstName ?? ""} ${user.lastName ?? ""} <${user.email}>`);
    console.log(`   id:             ${user.id}`);
    console.log(`   role:           ${user.role}`);
    console.log(`   hasPressCard:   ${user.hasPressCard}`);
    console.log(`   jobTitle:       ${user.jobTitle ?? "(null)"}`);
    console.log(`   department:     ${user.department ?? "(null)"}`);
    console.log(`   pressIdNumber:  ${user.pressIdNumber ?? "(null)"}`);
    console.log(`   cardValidUntil: ${user.cardValidUntil ?? "(null)"}`);

    const updates: Record<string, any> = {};
    if (role !== undefined && role !== user.role) updates.role = role;
    if (jobTitle !== undefined && jobTitle !== user.jobTitle) updates.jobTitle = jobTitle;
    if (department !== undefined && department !== user.department) updates.department = department;
    if (pressId !== undefined && pressId !== user.pressIdNumber) updates.pressIdNumber = pressId;
    if (validUntil !== undefined) {
      const currentISO = user.cardValidUntil ? new Date(user.cardValidUntil).toISOString() : null;
      const nextISO = validUntil.toISOString();
      if (currentISO !== nextISO) updates.cardValidUntil = validUntil;
    }
    if (hasPressCardEnv !== undefined) {
      const v = hasPressCardEnv === "1" || hasPressCardEnv === "true";
      if (v !== user.hasPressCard) updates.hasPressCard = v;
    }

    if (Object.keys(updates).length === 0) {
      console.log(`\n✅ Nothing to change. All requested fields already match.`);
      return;
    }

    console.log(`\n📝 Planned changes:`);
    for (const [k, v] of Object.entries(updates)) {
      const before = (user as any)[k];
      console.log(`   ${k}: ${before ?? "(null)"}  →  ${v instanceof Date ? v.toISOString() : v}`);
    }

    if (!APPLY) {
      console.log(`\n🟡 DRY-RUN. Set APPLY=1 to write these changes.`);
      return;
    }

    const [updated] = await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, user.id))
      .returning();

    console.log(`\n✅ User updated. New press-card-relevant state:`);
    console.log(`   role:           ${updated.role}`);
    console.log(`   hasPressCard:   ${updated.hasPressCard}`);
    console.log(`   jobTitle:       ${updated.jobTitle ?? "(null)"}`);
    console.log(`   department:     ${updated.department ?? "(null)"}`);
    console.log(`   pressIdNumber:  ${updated.pressIdNumber ?? "(null)"}`);
    console.log(`   cardValidUntil: ${updated.cardValidUntil ?? "(null)"}`);
    console.log(`\n🎉 Done. Re-issue the pass from the iOS app to see it.`);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
