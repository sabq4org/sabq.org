/**
 * Seed (or repair) the `angle_writer` Muqtarab role + its 4 permissions.
 *
 * The role is normally seeded automatically on server boot via seedRBAC()
 * (server/seedRBAC.ts). This script is the manual, idempotent equivalent —
 * useful when bringing a fresh environment online without booting the full
 * server, or to repair a DB whose angle_writer mappings drifted.
 *
 * It is the minimal subset of seedRBAC() for this one role:
 *   - upserts the 4 `muqtarab.own.*` permissions  (permissions.code is unique)
 *   - upserts the `angle_writer` role             (roles.name is unique)
 *   - links role↔permission, inserting only the mappings that are missing
 *     (role_permissions has NO unique constraint on (role_id, permission_id),
 *      so we diff existing rows instead of relying on onConflictDoNothing)
 *
 * Idempotent: safe to run repeatedly. Honors DB_DRIVER like the other seeds.
 *
 * Usage:
 *   DB_DRIVER=pg \
 *   DATABASE_URL='postgresql://...' \
 *   tsx scripts/seed-angle-writer.ts
 */

import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { eq, inArray } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema.js";

neonConfig.webSocketConstructor = ws;

const DB_DRIVER = (process.env.DB_DRIVER || "neon").toLowerCase();

// Mirror of the angle_writer definition in server/seedRBAC.ts — keep in sync.
const ANGLE_WRITER_ROLE = {
  name: "angle_writer",
  nameAr: "كاتب زاوية",
  description:
    "Muqtarab angle owner: manages own angle and submits topics for admin review",
  isSystem: false,
};

const ANGLE_WRITER_PERMISSIONS = [
  { code: "muqtarab.own.view", label: "View Own Angle", labelAr: "عرض زاويتي في مُقترب", module: "muqtarab" },
  { code: "muqtarab.own.topic.create", label: "Create Own Angle Topic", labelAr: "إضافة موضوع في زاويتي", module: "muqtarab" },
  { code: "muqtarab.own.topic.edit", label: "Edit Own Angle Topic", labelAr: "تعديل مواضيع زاويتي", module: "muqtarab" },
  { code: "muqtarab.own.topic.submit", label: "Submit Own Angle Topic For Review", labelAr: "إرسال موضوع لمراجعة الإدارة", module: "muqtarab" },
];

function maskUrl(url: string): string {
  return url.replace(/:[^@/]+@/, ":***@");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Seed: angle_writer role + muqtarab.own.* permissions");
  console.log("=".repeat(60));
  console.log(`  DB:     ${maskUrl(databaseUrl)}`);
  console.log(`  Driver: ${DB_DRIVER}`);
  console.log("");

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
    // 1. Upsert the permissions (code is unique → onConflictDoNothing is safe).
    await db
      .insert(schema.permissions)
      .values(ANGLE_WRITER_PERMISSIONS)
      .onConflictDoNothing({ target: schema.permissions.code });

    const codes = ANGLE_WRITER_PERMISSIONS.map((p) => p.code);
    const perms = await db
      .select()
      .from(schema.permissions)
      .where(inArray(schema.permissions.code, codes));
    console.log(`✅ Permissions present: ${perms.length}/${codes.length}`);

    // 2. Upsert the role (name is unique → onConflictDoNothing is safe).
    await db
      .insert(schema.roles)
      .values(ANGLE_WRITER_ROLE)
      .onConflictDoNothing({ target: schema.roles.name });

    const [role] = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.name, ANGLE_WRITER_ROLE.name))
      .limit(1);
    if (!role) throw new Error("angle_writer role missing after upsert");
    console.log(`✅ Role ready: ${role.name} (id=${role.id})`);

    // 3. Link role↔permission. role_permissions has no (role_id, permission_id)
    //    unique constraint, so we diff against existing rows to stay idempotent.
    const existing = await db
      .select({ permissionId: schema.rolePermissions.permissionId })
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, role.id));
    const existingPermIds = new Set(existing.map((r: any) => r.permissionId));

    const toInsert = perms
      .filter((p: any) => !existingPermIds.has(p.id))
      .map((p: any) => ({ roleId: role.id, permissionId: p.id }));

    if (toInsert.length > 0) {
      await db.insert(schema.rolePermissions).values(toInsert);
      console.log(`✅ Added ${toInsert.length} role-permission mapping(s)`);
    } else {
      console.log("✅ All role-permission mappings already present (no-op)");
    }

    console.log("");
    console.log("🎉 angle_writer seed complete.");
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
