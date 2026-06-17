/**
 * Export all published articles mentioning "جامعة الأمير سلطان"
 * (Prince Sultan University) for 2025–2026 into a markdown file.
 *
 * STRICTLY READ-ONLY: a single SELECT.
 *
 * USAGE
 *   SKIP_DB_MAINTENANCE=true DB_DRIVER=neon \
 *     railway run npx tsx scripts/export-psu-news.ts /path/to/output.md
 */

import { writeFileSync } from "fs";
import { pool } from "../server/db";

const outPath = process.argv[2] || "psu-news-2025-2026.md";

async function main() {
  const { rows } = await pool.query(
    `SELECT id, title, slug, english_slug, published_at,
            (title ILIKE '%جامعة الأمير سلطان%' OR title ILIKE '%جامعة الامير سلطان%') AS in_title
       FROM articles
      WHERE status = 'published'
        AND published_at >= '2025-01-01'
        AND published_at < '2027-01-01'
        AND (
              title   ILIKE '%جامعة الأمير سلطان%' OR title   ILIKE '%جامعة الامير سلطان%'
           OR excerpt ILIKE '%جامعة الأمير سلطان%' OR excerpt ILIKE '%جامعة الامير سلطان%'
           OR content ILIKE '%جامعة الأمير سلطان%' OR content ILIKE '%جامعة الامير سلطان%'
        )
      ORDER BY published_at DESC`
  );

  const url = (r: any) =>
    `https://sabq.org/article/${r.english_slug || r.slug}`;
  const fmtDate = (d: Date) =>
    new Date(d).toISOString().slice(0, 10);

  // Merge duplicate rows (same title published twice with different slugs)
  const merged: any[] = [];
  const byTitle = new Map<string, any>();
  for (const r of rows) {
    const key = `${r.title.trim()}|${fmtDate(r.published_at)}`;
    const existing = byTitle.get(key);
    if (existing) {
      existing.altUrls.push(url(r));
    } else {
      const m = { ...r, altUrls: [] as string[] };
      byTitle.set(key, m);
      merged.push(m);
    }
  }

  const by2026 = merged.filter((r) => new Date(r.published_at).getFullYear() === 2026);
  const by2025 = merged.filter((r) => new Date(r.published_at).getFullYear() === 2025);

  const section = (year: number, list: any[]) => {
    const lines = [`## ${year} (${list.length} خبر)`, ""];
    for (const r of list) {
      const note = r.in_title ? "" : " — _(ذُكرت في نص الخبر)_";
      const alts = r.altUrls.length
        ? ` — [نسخة مكررة](${r.altUrls[0]})`
        : "";
      lines.push(`- **${fmtDate(r.published_at)}** — [${r.title}](${url(r)})${note}${alts}`);
    }
    lines.push("");
    return lines.join("\n");
  };

  const md = [
    `# أخبار جامعة الأمير سلطان في صحيفة سبق (2025–2026)`,
    "",
    `> المصدر: قاعدة بيانات sabq.org — الأخبار المنشورة التي ورد فيها اسم "جامعة الأمير سلطان" في العنوان أو النص.`,
    `> تاريخ الاستخراج: 2026-06-11 — إجمالي الأخبار: ${merged.length} (بعد دمج ${rows.length - merged.length} نسخة مكررة)`,
    "",
    section(2026, by2026),
    section(2025, by2025),
  ].join("\n");

  writeFileSync(outPath, md, "utf8");
  console.log(`WROTE ${merged.length} unique articles (${by2026.length} in 2026, ${by2025.length} in 2025; ${rows.length - merged.length} duplicates merged) -> ${outPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
