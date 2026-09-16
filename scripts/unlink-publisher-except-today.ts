/**
 * يفصل أرشيف الناشر عن الوكالة ما عدا أخبار اليوم (توقيت الرياض).
 *
 * Usage:
 *   npx tsx scripts/unlink-publisher-except-today.ts
 *   PUBLISHER_EMAIL=slaam911@gmail.com npx tsx scripts/unlink-publisher-except-today.ts
 */
import { config } from "dotenv";
// لا نستبدل DATABASE_URL القادم من Railway/الـ shell
if (!process.env.DATABASE_URL && !process.env.NEON_DATABASE_URL) {
  config({ path: ".env.local" });
}

const EMAIL = (process.env.PUBLISHER_EMAIL || "slaam911@gmail.com").toLowerCase();

async function main() {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "";
  try {
    const host = new URL(url.replace(/^postgres(ql)?:/, "http:")).host;
    console.log("DB host:", host);
  } catch {
    console.log("DB host: (unparsed)");
  }

  const { db } = await import("../server/db");
  const { sql } = await import("drizzle-orm");

  const pubRes = await db.execute(sql`
    SELECT p.id AS publisher_id, p.agency_name, p.user_id, u.email
    FROM publishers p
    JOIN users u ON u.id = p.user_id
    WHERE lower(u.email) = ${EMAIL} OR lower(p.email) = ${EMAIL}
    LIMIT 1
  `);
  const pub = pubRes.rows[0] as
    | { publisher_id: string; agency_name: string; user_id: string; email: string }
    | undefined;
  if (!pub) {
    console.error("Publisher not found for", EMAIL);
    process.exit(1);
  }
  console.log("Publisher:", pub);

  const todayRes = await db.execute(sql`
    SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date::text AS today
  `);
  const today = (todayRes.rows[0] as { today: string }).today;
  console.log("Today (Riyadh):", today);

  // امسح ختم الوكالة عن كل منشور قبل اليوم
  const cleared = await db.execute(sql`
    UPDATE articles
    SET
      publisher_id = NULL,
      is_publisher_news = false,
      updated_at = now()
    WHERE status = 'published'
      AND publisher_id = ${pub.publisher_id}
      AND (coalesce(published_at, created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Riyadh')::date
          < ${today}::date
    RETURNING id
  `);
  console.log("Cleared publisher stamp (older):", cleared.rows.length);

  // اختم أخبار اليوم التي كتبها/أرسلها مالك الوكالة إن لم تُختم
  const stamped = await db.execute(sql`
    UPDATE articles
    SET
      publisher_id = ${pub.publisher_id},
      is_publisher_news = true,
      updated_at = now()
    WHERE status = 'published'
      AND (author_id = ${pub.user_id} OR submitter_id = ${pub.user_id})
      AND (coalesce(published_at, created_at) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Riyadh')::date
          = ${today}::date
    RETURNING id, left(title, 60) AS title
  `);
  console.log("Stamped today:", stamped.rows);

  const remaining = await db.execute(sql`
    SELECT count(*)::int AS n
    FROM articles
    WHERE status = 'published' AND publisher_id = ${pub.publisher_id}
  `);
  console.log("Published still under publisher:", remaining.rows[0]);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
