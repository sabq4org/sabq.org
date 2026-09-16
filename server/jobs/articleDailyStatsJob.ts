import cron from "node-cron";
import { withStatementTimeout } from "../db";
import { sql } from "drizzle-orm";
import { isLeader } from "../leaderElection";

/**
 * تجميع إحصاءات المقالات اليومية — أُعيدت كتابته بالكامل (تدقيق 2026-07-25).
 *
 * النسخة السابقة كانت معطوبة من ثلاث جهات:
 *  1. أداء: 4 استعلامات لكل مقال منشور (~940 ألف مقال × 4 ≈ 1.5 مليون استعلام
 *     كل ليلة) — كانت تنهار غالب الليالي، وماتت نهائيًا منذ 2026-07-18 حين
 *     ثُبّت statement_timeout=15s على دور القاعدة (استعلامها الافتتاحي يُقتل).
 *  2. دلالة: كانت تعدّ تفاعل "اليوم" وهي تعمل الساعة 00:05 — أي نافذة خمس
 *     دقائق فقط (مجموع اللايكات المسجل ليوم كامل عبر 940 ألف صف كان 6).
 *  3. نمو: صف لكل مقال أرشيفي كل ليلة — الجدول بلغ 4.9GB في 50 يومًا.
 *
 * التصميم الحالي:
 *  - صف اليوم يُكتب عن "أمس" كاملًا (00:00 → 24:00) بعمليات set-based
 *    (4 دفعات ببصمة hashtext) بدل مليون استعلام.
 *  - `views` تبقى لقطة تراكمية وقت التشغيل (~00:20 ≈ نهاية أمس) حفاظًا على
 *    توافق المستهلكين الحاليين في لوحات الكتّاب والموبايل.
 *  - النطاق محدود: مقالات نُشرت خلال آخر 400 يوم، أو أي مقال سجّل تفاعلًا
 *    فعليًا ذلك اليوم (لايك/تعليق/حفظ) مهما كان عمره — يقلّص الكتابة الليلية
 *    من ~940 ألف صف إلى ~63 ألفًا دون فقدان أي تفاعل حقيقي.
 */

let isRunning = false;

const BUCKETS = 4;

export async function aggregateArticleDailyStats(
  targetDate?: string,
): Promise<{ upserted: number } | null> {
  if (isRunning) {
    console.log("[ArticleDailyStats] ⏭️ Skipping - already running");
    return null;
  }

  isRunning = true;
  try {
    // أمس (UTC) ما لم يُمرَّر يوم صريح (يخدم الاسترجاع اليدوي أيضًا).
    const day =
      targetDate ??
      new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    console.log(`[ArticleDailyStats] 🔄 Aggregating full-day stats for ${day}...`);

    let upserted = 0;
    for (let bucket = 0; bucket < BUCKETS; bucket++) {
      const result = await withStatementTimeout(120_000, (tx) =>
        tx.execute(sql`
          INSERT INTO article_daily_stats (article_id, date, views, likes, comments, bookmarks)
          SELECT a.id,
                 ${day}::date,
                 COALESCE(a.views, 0),
                 COALESCE(r.c, 0),
                 COALESCE(c.c, 0),
                 COALESCE(b.c, 0)
          FROM articles a
          LEFT JOIN (
            SELECT article_id, count(*)::int AS c FROM reactions
            WHERE created_at >= ${day}::date AND created_at < ${day}::date + 1
            GROUP BY article_id
          ) r ON r.article_id = a.id
          LEFT JOIN (
            SELECT article_id, count(*)::int AS c FROM comments
            WHERE created_at >= ${day}::date AND created_at < ${day}::date + 1
            GROUP BY article_id
          ) c ON c.article_id = a.id
          LEFT JOIN (
            SELECT article_id, count(*)::int AS c FROM bookmarks
            WHERE created_at >= ${day}::date AND created_at < ${day}::date + 1
            GROUP BY article_id
          ) b ON b.article_id = a.id
          WHERE a.status = 'published'
            AND abs(hashtext(a.id::text)) % ${sql.raw(String(BUCKETS))} = ${sql.raw(String(bucket))}
            AND (
              a.published_at >= now() - interval '400 days'
              OR r.c IS NOT NULL OR c.c IS NOT NULL OR b.c IS NOT NULL
            )
          ON CONFLICT (article_id, date) DO UPDATE SET
            views = EXCLUDED.views,
            likes = EXCLUDED.likes,
            comments = EXCLUDED.comments,
            bookmarks = EXCLUDED.bookmarks
        `),
      );
      upserted += Number((result as { rowCount?: number }).rowCount ?? 0);
    }

    console.log(`[ArticleDailyStats] ✅ Upserted ${upserted} rows for ${day}`);
    return { upserted };
  } catch (error) {
    console.error("[ArticleDailyStats] ❌ Error:", error);
    return null;
  } finally {
    isRunning = false;
  }
}

export function startArticleDailyStatsJob() {
  // 00:20: بعد منتصف الليل بما يكفي لاكتمال يوم أمس، وبعيدًا عن ذروة
  // كرونات 00:00-00:05 الأخرى.
  const job = cron.schedule("20 0 * * *", async () => {
    if (!isLeader()) return;
    await aggregateArticleDailyStats();
  });

  console.log("[ArticleDailyStats] ⏰ Job scheduled (daily at 00:20, leader only)");
  return job;
}
