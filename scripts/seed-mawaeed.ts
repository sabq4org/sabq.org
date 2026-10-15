/**
 * بذرة مواعيدك من data/mawaeed/2026-09-27-mawaeed-dates.csv
 *
 * الصف «يحتاج تحقق» يُحفظ مسودة غير منشورة.
 * الصف الذي تحمل ملاحظته «محسوب» ويُعلَّم مؤكدًا يُنشر بشارة «متوقع».
 * إعادة التشغيل لا تمس موعدًا عدّله محرر (سجل mawaeed_changes بمستخدم).
 *
 * Usage:
 *   DB_DRIVER=pg DATABASE_URL=postgresql://sabq:sabq_password@localhost:5432/sabq_db \
 *     npx tsx scripts/seed-mawaeed.ts
 *
 * يرفض مضيف Neon أو رابطًا يبدو إنتاجيًا إلا مع --i-understand.
 */
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { mawaeedChanges, mawaeedOccurrences, mawaeedSeries } from "../shared/schema";
import { SERIES_CATALOG, SEEDED_CONTENT_UPDATED_AT, publicSnapshot } from "../shared/mawaeed/model";
import { parseSeedCsv } from "../shared/mawaeed/seed";

const CSV_PATH = path.resolve(process.cwd(), "data/mawaeed/2026-09-27-mawaeed-dates.csv");
const understand = process.argv.includes("--i-understand");

function assertSafeDatabase(url: string) {
  const host = url.toLowerCase();
  const risky = host.includes("neon.tech") || host.includes("prod") || host.includes("production");
  if (risky && !understand) {
    console.error("رفض التشغيل على قاعدة تبدو إنتاجية أو Neon. أعد المحاولة مع --i-understand إن كان ذلك مقصودًا.");
    process.exit(1);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL مفقود");
    process.exit(1);
  }
  assertSafeDatabase(databaseUrl);
  const text = fs.readFileSync(CSV_PATH, "utf8");
  const rows = parseSeedCsv(text);
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const db = drizzle(pool);
  const seededAt = new Date(SEEDED_CONTENT_UPDATED_AT);
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  try {
    for (const copy of SERIES_CATALOG) {
      const [existing] = await db.select().from(mawaeedSeries).where(eq(mawaeedSeries.slug, copy.slug)).limit(1);
      if (!existing) {
        await db.insert(mawaeedSeries).values({
          slug: copy.slug,
          kind: copy.kind,
          titleAr: copy.titleAr,
          summaryAr: copy.summaryAr,
          sortOrder: copy.sortOrder,
          published: true,
          contentUpdatedAt: seededAt,
        });
      }
    }
    const series = await db.select().from(mawaeedSeries);
    const seriesId = new Map(series.map((item) => [item.slug, item.id]));

    for (const [index, row] of rows.entries()) {
      const parent = seriesId.get(row.section);
      if (!parent) throw new Error(`قسم غير معروف في البذرة: ${row.section}`);
      const [existing] = await db.select().from(mawaeedOccurrences).where(eq(mawaeedOccurrences.seedKey, row.seedKey)).limit(1);
      const values = {
        seriesId: parent,
        seedKey: row.seedKey,
        titleAr: row.eventNameAr,
        startsOn: row.dateGregorian,
        sourceUrl: row.officialSourceUrl,
        sourceTitle: row.officialSourceName,
        certainty: row.certainty,
        status: "scheduled" as const,
        published: row.published,
        regionGroup: row.regionGroup,
        hijriLabel: null,
        publicNote: null,
        ruleNote: row.ruleOrNote,
        sortOrder: index,
      };
      if (!existing) {
        const [created] = await db.insert(mawaeedOccurrences).values(values).returning({ id: mawaeedOccurrences.id });
        await db.insert(mawaeedChanges).values({
          seriesId: parent,
          occurrenceId: created.id,
          action: "seed",
          beforeJson: null,
          afterJson: publicSnapshot({
            id: created.id,
            seriesId: parent,
            titleAr: values.titleAr,
            startsOn: values.startsOn,
            endsOn: null,
            sourceUrl: values.sourceUrl,
            sourceTitle: values.sourceTitle,
            certainty: values.certainty,
            status: "scheduled",
            published: values.published,
            regionGroup: values.regionGroup,
            hijriLabel: null,
            publicNote: null,
            ruleNote: values.ruleNote,
          }),
        });
        inserted += 1;
        continue;
      }
      const [human] = await db.select({ id: mawaeedChanges.id }).from(mawaeedChanges).where(and(
        eq(mawaeedChanges.occurrenceId, existing.id),
        isNotNull(mawaeedChanges.actorUserId),
      )).limit(1);
      if (human) {
        skipped += 1;
        continue;
      }
      await db.update(mawaeedOccurrences).set({ ...values, updatedAt: new Date() }).where(eq(mawaeedOccurrences.id, existing.id));
      updated += 1;
    }
    console.log(`مواعيدك: أُضيف ${inserted}، حُدّث ${updated}، تُرك ${skipped} بعد تعديل محرر. الصفوف ${rows.length}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
