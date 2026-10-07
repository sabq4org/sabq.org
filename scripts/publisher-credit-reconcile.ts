/**
 * تقرير مطابقة دفتر رصيد الوكالات — قراءة فقط، لا يكتب أي شيء.
 *
 * لكل وكالة: المنشور، المقيّد في الدفتر، والفرق. ثم لكل باقة: العدّاد
 * المخزّن، قيود الخصم، والمنشور في مدتها. ثم الأخبار المنشورة بلا قيد خصم
 * مصنفة بسبب مرجّح (نشر مجدول / بلا باقة نشطة وقت النشر / باقة نفدت أو مسار آخر).
 * التصنيف تقريبي: الرصيد المتبقي وقت النشر غير محفوظ تاريخيًا.
 *
 * Usage:
 *   npx tsx scripts/publisher-credit-reconcile.ts
 *   RECONCILE_LIST=1 npx tsx scripts/publisher-credit-reconcile.ts   # + article ids
 */
import { config } from "dotenv";
// لا نستبدل DATABASE_URL القادم من Railway/الـ shell
if (!process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
  config({ path: ".env.local" });
}

const LIST = process.env.RECONCILE_LIST === "1";

async function main() {
  const { db } = await import("../server/db");
  const { sql } = await import("drizzle-orm");

  // كل الاستعلامات أدناه SELECT فقط
  const perPublisher = await db.execute(sql`
    SELECT p.id, p.agency_name, p.is_active,
      count(a.id) FILTER (WHERE a.status = 'published') AS published,
      count(a.id) FILTER (WHERE a.status = 'published' AND EXISTS (
        SELECT 1 FROM publisher_credit_logs l
        WHERE l.article_id = a.id AND l.action_type = 'credit_used')) AS charged
    FROM publishers p
    LEFT JOIN articles a ON a.publisher_id = p.id
    GROUP BY p.id ORDER BY published DESC
  `);
  console.log("\n== الوكالات ==");
  console.table(perPublisher.rows.map((r: any) => ({
    agency: r.agency_name,
    active: r.is_active,
    published: Number(r.published),
    charged: Number(r.charged),
    missing: Number(r.published) - Number(r.charged),
  })));

  const perPackage = await db.execute(sql`
    SELECT c.id, p.agency_name, c.package_name, c.is_unlimited, c.is_active,
      c.start_date::date AS start_date, c.expiry_date::date AS expiry_date,
      c.total_credits, c.used_credits, c.remaining_credits,
      (SELECT count(*) FROM publisher_credit_logs l
        WHERE l.credit_package_id = c.id AND l.action_type = 'credit_used') AS logged,
      (SELECT count(*) FROM articles a
        WHERE a.publisher_id = c.publisher_id AND a.status = 'published'
          AND a.published_at >= c.start_date
          AND (c.expiry_date IS NULL OR a.published_at < c.expiry_date + interval '1 day')) AS published_in_window
    FROM publisher_credits c JOIN publishers p ON p.id = c.publisher_id
    ORDER BY p.agency_name, c.start_date
  `);
  console.log("\n== الباقات (العدّاد مقابل الدفتر مقابل المنشور) ==");
  console.table(perPackage.rows.map((r: any) => ({
    agency: r.agency_name,
    package: r.package_name,
    unlimited: r.is_unlimited,
    active: r.is_active,
    from: r.start_date,
    to: r.expiry_date,
    counter: Number(r.used_credits),
    logged: Number(r.logged),
    publishedInWindow: Number(r.published_in_window),
  })));

  // سبب مرجّح لكل خبر بلا قيد: هل كانت هناك باقة صالحة وقت النشر؟
  const missing = await db.execute(sql`
    SELECT a.id, p.agency_name, a.published_at,
      (a.scheduled_at IS NOT NULL) AS was_scheduled,
      EXISTS (
        SELECT 1 FROM publisher_credits c
        WHERE c.publisher_id = a.publisher_id
          AND c.is_active
          AND c.start_date <= a.published_at
          AND (c.expiry_date IS NULL OR c.expiry_date >= a.published_at)
      ) AS had_active_package_window
    FROM articles a JOIN publishers p ON p.id = a.publisher_id
    WHERE a.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM publisher_credit_logs l
        WHERE l.article_id = a.id AND l.action_type = 'credit_used')
    ORDER BY a.published_at
  `);
  const reason = (r: any) =>
    r.was_scheduled ? "scheduled_publish" : r.had_active_package_window ? "other_path_or_package_drained" : "no_active_package_window";
  const buckets = new Map<string, number>();
  for (const r of missing.rows as any[]) {
    const key = `${r.agency_name} · ${reason(r)} · ${String(r.published_at).slice(0, 7)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  console.log(`\n== أخبار منشورة بلا قيد خصم: ${missing.rows.length} ==`);
  console.table([...buckets].map(([key, count]) => ({ group: key, count })));
  if (LIST) {
    console.table((missing.rows as any[]).map((r) => ({
      id: r.id,
      agency: r.agency_name,
      publishedAt: r.published_at,
      reason: reason(r),
    })));
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
