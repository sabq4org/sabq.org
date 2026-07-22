/**
 * يضبط مشاهدات عشوائية (4967–24987) لكل مقال منشور لمؤلف أحمد بديوي
 * (abedawe@bernaysmedia.com).
 *
 * افتراضيًا: معاينة فقط (dry-run). للتنفيذ أضف --apply
 *
 *   # معاينة (يقرأ .env.local ثم .env)
 *   npx tsx scripts/randomize-bedawe-article-views.ts
 *
 *   # أو صراحةً:
 *   DATABASE_URL='…' DB_DRIVER=pg npx tsx scripts/randomize-bedawe-article-views.ts --apply
 *
 * تحذير: لا تشغّل --apply ضد الإنتاج إلا عن قصد وبـ URL صحيح.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { and, eq, sql } from "drizzle-orm";
import { articles, users } from "../shared/schema";

const AUTHOR_EMAIL = "abedawe@bernaysmedia.com";
const VIEWS_MIN = 4967;
const VIEWS_MAX = 24987;

const apply = process.argv.includes("--apply");

function randomViews(): number {
  return Math.floor(Math.random() * (VIEWS_MAX - VIEWS_MIN + 1)) + VIEWS_MIN;
}

function describeDbUrl(dbUrl: string): { host: string; dbName: string } {
  try {
    const u = new URL(dbUrl);
    return { host: u.hostname, dbName: (u.pathname || "/").replace(/^\//, "") || "?" };
  } catch {
    return { host: "?", dbName: "?" };
  }
}

async function main() {
  const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
  if (!dbUrl) {
    console.error(`
[bedawe-views] لا يوجد DATABASE_URL أو NEON_DATABASE_URL.

ضع الرابط في .env.local مثلاً:
  DATABASE_URL=postgresql://...
  DB_DRIVER=pg

أو شغّل:
  DATABASE_URL='postgresql://…' DB_DRIVER=pg npx tsx scripts/randomize-bedawe-article-views.ts
`);
    process.exit(1);
  }

  // استيراد متأخر بعد تحميل dotenv حتى لا يرمي server/db قبل وجود الـ URL
  const { db } = await import("../server/db");

  const { host, dbName } = describeDbUrl(dbUrl);
  console.log(`[bedawe-views] mode=${apply ? "APPLY" : "DRY-RUN (لن يُكتب شيء)"}`);
  console.log(`[bedawe-views] DB host=${host}  database=${dbName}  driver=${process.env.DB_DRIVER || "neon"}`);
  console.log(`[bedawe-views] تأكد أن هذا نفس Neon/PG المستخدم في Railway للإنتاج قبل --apply`);
  console.log(`[bedawe-views] email=${AUTHOR_EMAIL}  range=${VIEWS_MIN}..${VIEWS_MAX}`);

  const [author] = await db
    .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(sql`lower(${users.email}) = ${AUTHOR_EMAIL.toLowerCase()}`)
    .limit(1);

  if (!author) {
    console.error(`[bedawe-views] لم يُعثر على مستخدم بالبريد ${AUTHOR_EMAIL}`);
    process.exit(1);
  }

  console.log(
    `[bedawe-views] author id=${author.id} name=${[author.firstName, author.lastName].filter(Boolean).join(" ") || "—"}`,
  );

  const rows = await db
    .select({
      id: articles.id,
      title: articles.title,
      status: articles.status,
      views: articles.views,
      publishedAt: articles.publishedAt,
      englishSlug: articles.englishSlug,
    })
    .from(articles)
    .where(and(eq(articles.authorId, author.id), eq(articles.status, "published")))
    .orderBy(sql`${articles.publishedAt} DESC NULLS LAST`);

  console.log(`[bedawe-views] مقالات منشورة: ${rows.length}`);

  if (rows.length === 0) {
    console.log("[bedawe-views] لا شيء للتحديث.");
    process.exit(0);
  }

  const plan = rows.map((row) => ({
    id: row.id,
    title: (row.title || "").slice(0, 60),
    slug: row.englishSlug,
    oldViews: row.views,
    newViews: randomViews(),
  }));

  console.table(
    plan.slice(0, 15).map((p) => ({
      id: p.id.slice(0, 8) + "…",
      title: p.title,
      old: p.oldViews,
      new: p.newViews,
    })),
  );
  if (plan.length > 15) {
    console.log(`[bedawe-views] … و${plan.length - 15} مقالاً إضافياً`);
  }

  if (!apply) {
    console.log("\n[bedawe-views] DRY-RUN — لم يُكتب شيء. أعد التشغيل مع --apply للتنفيذ.");
    process.exit(0);
  }

  let updated = 0;
  for (const item of plan) {
    await db.update(articles).set({ views: item.newViews }).where(eq(articles.id, item.id));
    updated += 1;
    if (updated % 25 === 0) {
      console.log(`[bedawe-views] تقدّم ${updated}/${plan.length}`);
    }
  }

  // تحقق فوري من القاعدة بعد الكتابة
  const sampleIds = plan.slice(0, 5).map((p) => p.id);
  const verify = await db
    .select({ id: articles.id, title: articles.title, views: articles.views })
    .from(articles)
    .where(sql`${articles.id} IN (${sql.join(sampleIds.map((id) => sql`${id}`), sql`, `)})`);

  console.log(`[bedawe-views] تم تحديث ${updated} مقالاً منشوراً.`);
  console.log("[bedawe-views] عيّنة بعد الكتابة:");
  console.table(
    verify.map((v) => ({
      id: v.id.slice(0, 8) + "…",
      title: (v.title || "").slice(0, 50),
      views: v.views,
    })),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("[bedawe-views] failed:", err);
  process.exit(1);
});
