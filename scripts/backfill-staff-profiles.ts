// ----------------------------------------------------------------------------
// ترحيل المنسوبين الحاليين إلى ملف المنسوب الموحّد (staff_profiles)
//
// يُنشئ ملفاً لكل مستخدم دوره (القديم أو RBAC) ضمن أدوار المنسوبين،
// بترقيم SBQ-0001 تسلسلياً حسب أقدمية إنشاء الحساب، وينسخ حقول
// البطاقة الصحفية والترخيص من users. idempotent — من له ملف يُتخطى.
//
// التشغيل:  npx tsx scripts/backfill-staff-profiles.ts
// يحترم DB_DRIVER مثل بقية سكربتات seed (neon الافتراضي | pg).
// ----------------------------------------------------------------------------

// اتباع عرف المشروع: .env.local يتقدم على .env (dotenv/config لا يقرأه)
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { staffProfiles, users, userRoles, roles } from "../shared/schema";
import { STAFF_ROLE_NAMES } from "../server/services/staffProfileService";

const EMPLOYMENT_BY_ROLE: Record<string, string> = {
  reporter: "field_reporter",
  opinion_author: "opinion_writer",
  angle_writer: "opinion_writer",
};

async function main() {
  console.log("🔎 جمع المنسوبين الحاليين…");

  const rbacStaff = await db
    .select({ userId: userRoles.userId, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(roles.name, STAFF_ROLE_NAMES));
  const rbacRoleByUser = new Map<string, string>();
  for (const row of rbacStaff) {
    if (!rbacRoleByUser.has(row.userId)) rbacRoleByUser.set(row.userId, row.roleName);
  }

  const candidates = await db
    .select()
    .from(users)
    .orderBy(asc(users.createdAt));

  const staffUsers = candidates.filter(
    (u) => !u.deletedAt && (STAFF_ROLE_NAMES.includes(u.role) || rbacRoleByUser.has(u.id)),
  );
  console.log(`👥 ${staffUsers.length} منسوباً مرشحاً`);

  const existing = await db.select({ userId: staffProfiles.userId, employeeNumber: staffProfiles.employeeNumber }).from(staffProfiles);
  const existingByUser = new Set(existing.map((e) => e.userId));
  let nextNumber = existing.reduce((max, e) => {
    const n = e.employeeNumber ? parseInt(e.employeeNumber.replace(/\D/g, ""), 10) : 0;
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  let created = 0;
  for (const user of staffUsers) {
    if (existingByUser.has(user.id)) continue;
    nextNumber += 1;
    const roleName = rbacRoleByUser.get(user.id) ?? user.role;
    await db.insert(staffProfiles).values({
      userId: user.id,
      employeeNumber: `SBQ-${String(nextNumber).padStart(4, "0")}`,
      employmentType: EMPLOYMENT_BY_ROLE[roleName] ?? "employee",
      pressIdNumber: user.pressIdNumber,
      pressCardValidUntil: user.cardValidUntil,
      mediaLicenseNumber: user.mediaLicenseNumber,
      mediaLicenseExpiresAt: user.mediaLicenseExpiresAt,
      mediaLicenseFileKey: user.mediaLicenseFileKey,
      bioAr: user.bio,
      officialPhone: user.phoneNumber,
      officialEmail: user.email,
    }).onConflictDoNothing();
    created += 1;
    console.log(`  ✅ SBQ-${String(nextNumber).padStart(4, "0")} ← ${user.firstName ?? ""} ${user.lastName ?? ""} (${roleName})`);
  }

  console.log(`\n🏁 اكتمل الترحيل: ${created} ملفاً جديداً، ${staffUsers.length - created} كان موجوداً.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ فشل الترحيل:", err);
  process.exit(1);
});
