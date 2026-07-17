// تفعيل/إيقاف بطولة في المنصة المركزية للتوقعات — أداة تشغيلية للإنتاج.
//
//   railway run npx tsx scripts/set-prediction-competition-status.ts                 # عرض الحالة
//   railway run npx tsx scripts/set-prediction-competition-status.ts gulf-cup-27 active
//   railway run npx tsx scripts/set-prediction-competition-status.ts rsl-2026 paused
//
// الحالات المسموحة: draft | active | paused | completed.
// active = تظهر للمستخدمين ويبدأ المحوّل بإنشاء مسابقاتها من جدول المباريات.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { eq } from "drizzle-orm";
import { predictionCompetitions } from "../shared/schema";
import { COMPETITION_STATUSES } from "../shared/predictions";
const { db } = await import("../server/db");

async function main(): Promise<void> {
  const [slug, status] = process.argv.slice(2);

  if (!slug) {
    const rows = await db
      .select({
        slug: predictionCompetitions.slug,
        nameAr: predictionCompetitions.nameAr,
        status: predictionCompetitions.status,
      })
      .from(predictionCompetitions);
    console.log("\n🏆 بطولات المنصة المركزية:\n");
    for (const row of rows) console.log(`  ${row.status.padEnd(10)} ${row.slug.padEnd(18)} ${row.nameAr}`);
    console.log("\nللتغيير: tsx scripts/set-prediction-competition-status.ts <slug> <status>");
    process.exit(0);
  }

  if (!status || !(COMPETITION_STATUSES as readonly string[]).includes(status)) {
    console.error(`❌ حالة غير صالحة. المسموح: ${COMPETITION_STATUSES.join(" | ")}`);
    process.exit(1);
  }

  const [updated] = await db
    .update(predictionCompetitions)
    .set({ status, updatedAt: new Date() })
    .where(eq(predictionCompetitions.slug, slug))
    .returning({ slug: predictionCompetitions.slug, status: predictionCompetitions.status });

  if (!updated) {
    console.error(`❌ لا بطولة بالرمز ${slug} — شغّل دون معاملات لعرض القائمة`);
    process.exit(1);
  }
  console.log(`✅ ${updated.slug} → ${updated.status}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("❌", error);
  process.exit(1);
});
