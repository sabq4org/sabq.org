/**
 * نقل مكتبة الشعارات (salogos) إلى R2 + Neon.
 *
 * - البيانات الوصفية تُكتب أولًا لكل السجلات (upsert على id) فلا يضيع سجل حتى لو فشلت صوره.
 * - كل رابط صورة فريد يُنزَّل ويُرفع مرة واحدة إلى مفتاح ثابت: logos/{id}/{variant}.{ext}
 * - حالة كل ملف في logo_assets؛ إعادة التشغيل تتخطى ما حالته uploaded وتكمل الباقي.
 * - الفاشل يُسجَّل بسببه ولا يوقف السكربت؛ يُعاد تجريبه بـ --retry-failed.
 *
 * التشغيل والتفاصيل: scripts/import-logos/README.md
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { buildLogoSearchText } from "../../shared/logoSearch";

// ---------- الإعدادات ----------

type Args = {
  file: string;
  out: string;
  dryRun: boolean;
  retryFailed: boolean;
  migrate: boolean;
  verifyOnly: boolean;
  concurrency: number;
  limit: number | null;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const file = get("--file");
  if (!file) {
    console.error("الاستخدام: tsx scripts/import-logos/import.ts --file <path.json> [--migrate] [--dry-run] [--retry-failed] [--verify-only] [--concurrency 6] [--limit N] [--out dir]");
    process.exit(2);
  }
  return {
    file: resolve(file),
    out: resolve(get("--out") ?? "logo-import-output"),
    dryRun: argv.includes("--dry-run"),
    retryFailed: argv.includes("--retry-failed"),
    migrate: argv.includes("--migrate"),
    verifyOnly: argv.includes("--verify-only"),
    concurrency: Number(get("--concurrency") ?? 6),
    limit: get("--limit") ? Number(get("--limit")) : null,
  };
}

const REQUIRED_ENV = [
  "LOGOS_DATABASE_URL",
  "NEWS_IMAGES_R2_ACCOUNT_ID",
  "NEWS_IMAGES_R2_ACCESS_KEY_ID",
  "NEWS_IMAGES_R2_SECRET_ACCESS_KEY",
  "NEWS_IMAGES_R2_BUCKET_NAME",
  "NEWS_IMAGES_R2_PUBLIC_URL",
] as const;

function requireEnv(): Record<(typeof REQUIRED_ENV)[number], string> {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`متغيرات بيئة ناقصة: ${missing.join(", ")}`);
    process.exit(2);
  }
  return Object.fromEntries(REQUIRED_ENV.map((k) => [k, process.env[k]!])) as any;
}

/** نفس سياسة كاش صور الأخبار في sabq-news-images (يومان) — راجع docs/R2_NEWS_IMAGES_ROLLOUT.md */
const CACHE_CONTROL = "public, max-age=172800, s-maxage=172800, stale-while-revalidate=7200";
const KEY_PREFIX = "logos";
const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
const MAX_BYTES = 25 * 1024 * 1024;

// ---------- قراءة الملف ----------

type SourceRecord = {
  id: string;
  title: string;
  category_id: string | null;
  image_url: string | null;
  svg_url: string | null;
  png_url: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  website_url: string | null;
  download_count: number | null;
  tags: string[] | null;
  slug: string | null;
  display_id: number;
  owner_id: string | null;
};

type RecordFailure = { id: string | null; displayId: number | null; title: string | null; stage: string; reason: string; url?: string };

function loadRecords(file: string, failures: RecordFailure[]): SourceRecord[] {
  const raw = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(raw)) throw new Error("الملف ليس مصفوفة JSON");
  const valid: SourceRecord[] = [];
  const seenIds = new Set<string>();
  const seenDisplay = new Set<number>();
  for (const r of raw) {
    const base = { id: r?.id ?? null, displayId: r?.display_id ?? null, title: r?.title ?? null, stage: "validate" };
    if (!r || typeof r.id !== "string" || !r.id) { failures.push({ ...base, reason: "id مفقود" }); continue; }
    if (typeof r.title !== "string" || !r.title.trim()) { failures.push({ ...base, reason: "title مفقود" }); continue; }
    if (!Number.isInteger(r.display_id)) { failures.push({ ...base, reason: "display_id مفقود أو غير صحيح" }); continue; }
    if (seenIds.has(r.id)) { failures.push({ ...base, reason: "id مكرر في الملف" }); continue; }
    if (seenDisplay.has(r.display_id)) { failures.push({ ...base, reason: "display_id مكرر في الملف" }); continue; }
    seenIds.add(r.id);
    seenDisplay.add(r.display_id);
    valid.push({ ...r, tags: Array.isArray(r.tags) ? r.tags.filter((t: unknown) => typeof t === "string") : [] });
  }
  return valid;
}

// ---------- خطة الملفات ----------

type PlannedAsset = { logoId: string; displayId: number; title: string; variant: string; sourceUrl: string };

function variantFromUrl(url: string): string {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith(".svg")) return "svg";
  if (path.endsWith(".png")) return "png";
  return "original";
}

/** يحدد النسخ الفريدة لكل سجل بترتيب ثابت (svg_url ثم png_url ثم image_url) فيكون اسم النسخة حتميًا بين التشغيلات. */
function planAssets(records: SourceRecord[], failures: RecordFailure[]): PlannedAsset[] {
  const plan: PlannedAsset[] = [];
  const seenUrls = new Set<string>();
  for (const r of records) {
    const used = new Set<string>();
    for (const field of ["svg_url", "png_url", "image_url"] as const) {
      const url = r[field]?.trim();
      if (!url) continue;
      try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
      } catch {
        failures.push({ id: r.id, displayId: r.display_id, title: r.title, stage: "plan", reason: `رابط غير صالح في ${field}`, url });
        continue;
      }
      if (seenUrls.has(url)) continue; // image_url غالبًا يساوي svg_url
      seenUrls.add(url);
      let variant = variantFromUrl(url);
      if (used.has(variant)) variant = "original";
      let n = 2;
      while (used.has(variant)) variant = `original-${n++}`;
      used.add(variant);
      plan.push({ logoId: r.id, displayId: r.display_id, title: r.title, variant, sourceUrl: url });
    }
    if (used.size === 0) {
      failures.push({ id: r.id, displayId: r.display_id, title: r.title, stage: "plan", reason: "لا يوجد أي رابط صورة صالح" });
    }
  }
  return plan;
}

// ---------- التنزيل والفحص ----------

class PermanentError extends Error {}

function sniffContentType(buf: Buffer): { contentType: string; ext: string } | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { contentType: "image/png", ext: "png" };
  if (buf.length >= 4 && buf.subarray(0, 4).toString("latin1") === "%PDF") return { contentType: "application/pdf", ext: "pdf" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { contentType: "image/webp", ext: "webp" };
  if (buf.length >= 6 && buf.subarray(0, 3).toString("latin1") === "GIF") return { contentType: "image/gif", ext: "gif" };
  const head = buf.subarray(0, 4096).toString("utf8").replace(/^﻿/, "").trimStart();
  if (head.startsWith("<")) {
    const svgAt = head.search(/<svg[\s>]/i);
    const htmlAt = head.search(/<html[\s>]/i);
    if (svgAt >= 0 && (htmlAt < 0 || svgAt < htmlAt)) return { contentType: "image/svg+xml", ext: "svg" };
  }
  return null;
}

async function downloadOnce(url: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "sabq-logo-import/1.0" } });
    if (res.status === 404 || res.status === 410 || res.status === 403) throw new PermanentError(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new PermanentError(`الملف أكبر من ${MAX_BYTES} بايت (${len})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new PermanentError("ملف فارغ");
    if (buf.length > MAX_BYTES) throw new PermanentError(`الملف أكبر من ${MAX_BYTES} بايت`);
    return buf;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error(`مهلة التنزيل ${FETCH_TIMEOUT_MS / 1000}ث`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, onAttempt: () => void): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onAttempt();
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e instanceof PermanentError || attempt === MAX_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }
  throw lastErr;
}

// ---------- التشغيل ----------

async function pool<T>(items: T[], size: number, worker: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    }),
  );
}

async function upsertMetadata(db: pg.Pool, records: SourceRecord[]) {
  const CHUNK = 200;
  for (let i = 0; i < records.length; i += CHUNK) {
    const rows = records.slice(i, i + CHUNK).map((r) => ({
      id: r.id,
      display_id: r.display_id,
      title: r.title,
      category_id: r.category_id,
      status: r.status,
      source_created_at: r.created_at,
      source_updated_at: r.updated_at,
      website_url: r.website_url,
      download_count: r.download_count ?? 0,
      tags: r.tags ?? [],
      slug: r.slug,
      owner_id: r.owner_id,
      source_image_url: r.image_url,
      source_svg_url: r.svg_url,
      source_png_url: r.png_url,
      search_text: buildLogoSearchText(r.title, r.tags ?? []),
    }));
    await db.query(
      `INSERT INTO logos (id, display_id, title, category_id, status, source_created_at, source_updated_at,
                          website_url, download_count, tags, slug, owner_id,
                          source_image_url, source_svg_url, source_png_url, search_text)
       SELECT x.id, x.display_id, x.title, x.category_id, x.status, x.source_created_at, x.source_updated_at,
              x.website_url, x.download_count, ARRAY(SELECT jsonb_array_elements_text(x.tags)), x.slug, x.owner_id,
              x.source_image_url, x.source_svg_url, x.source_png_url, x.search_text
       FROM jsonb_to_recordset($1::jsonb) AS x(
         id varchar, display_id integer, title text, category_id varchar, status varchar,
         source_created_at timestamptz, source_updated_at timestamptz, website_url text,
         download_count integer, tags jsonb, slug text, owner_id varchar,
         source_image_url text, source_svg_url text, source_png_url text, search_text text)
       ON CONFLICT (id) DO UPDATE SET
         display_id = EXCLUDED.display_id, title = EXCLUDED.title, category_id = EXCLUDED.category_id,
         status = EXCLUDED.status, source_created_at = EXCLUDED.source_created_at,
         source_updated_at = EXCLUDED.source_updated_at, website_url = EXCLUDED.website_url,
         download_count = EXCLUDED.download_count, tags = EXCLUDED.tags, slug = EXCLUDED.slug,
         owner_id = EXCLUDED.owner_id, source_image_url = EXCLUDED.source_image_url,
         source_svg_url = EXCLUDED.source_svg_url, source_png_url = EXCLUDED.source_png_url,
         search_text = EXCLUDED.search_text, updated_at = now()`,
      [JSON.stringify(rows)],
    );
  }
}

/** يحدّث روابط الشعار من نسخه المرفوعة: svg_url ثم png_url، والمعتمد SVG إن وُجد وإلا PNG. */
async function linkLogoUrls(db: pg.Pool) {
  await db.query(`
    UPDATE logos l SET
      svg_url = s.svg_url, png_url = s.png_url, primary_url = COALESCE(s.svg_url, s.png_url), updated_at = now()
    FROM (
      SELECT lg.id,
        (SELECT a.public_url FROM logo_assets a WHERE a.logo_id = lg.id AND a.status = 'uploaded'
           AND a.content_type = 'image/svg+xml' ORDER BY (a.variant = 'svg') DESC, a.variant LIMIT 1) AS svg_url,
        (SELECT a.public_url FROM logo_assets a WHERE a.logo_id = lg.id AND a.status = 'uploaded'
           AND a.content_type = 'image/png' ORDER BY (a.variant = 'png') DESC, a.variant LIMIT 1) AS png_url
      FROM logos lg
    ) s
    WHERE l.id = s.id
      AND (l.svg_url IS DISTINCT FROM s.svg_url OR l.png_url IS DISTINCT FROM s.png_url
           OR l.primary_url IS DISTINCT FROM COALESCE(s.svg_url, s.png_url))`);
}

async function verify(db: pg.Pool, expected: number, concurrency: number) {
  const { rows: [counts] } = await db.query(`
    SELECT (SELECT count(*)::int FROM logos) AS logos,
           (SELECT count(*)::int FROM logos WHERE primary_url IS NULL) AS without_primary,
           (SELECT count(*)::int FROM logo_assets WHERE status = 'uploaded') AS uploaded,
           (SELECT count(*)::int FROM logo_assets WHERE status = 'failed') AS failed`);
  const { rows: assets } = await db.query(
    `SELECT a.public_url, a.content_type, a.bytes, l.display_id FROM logo_assets a JOIN logos l ON l.id = a.logo_id WHERE a.status = 'uploaded'`,
  );
  const broken: { displayId: number; url: string; reason: string }[] = [];
  await pool(assets, concurrency * 2, async (a) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(a.public_url, { method: "HEAD", headers: { "User-Agent": "sabq-logo-import/1.0" } });
        const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
        const len = Number(res.headers.get("content-length") ?? -1);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        if (ct !== a.content_type) throw new Error(`نوع المحتوى ${ct} بدل ${a.content_type}`);
        if (len >= 0 && len !== a.bytes) throw new Error(`الحجم ${len} بدل ${a.bytes}`);
        return;
      } catch (e: any) {
        if (attempt === 3) broken.push({ displayId: a.display_id, url: a.public_url, reason: e.message });
        else await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  });
  return { ...counts, expected, countMatches: counts.logos === expected, checkedUrls: assets.length, brokenUrls: broken };
}

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = requireEnv();
  mkdirSync(args.out, { recursive: true });
  const publicBase = env.NEWS_IMAGES_R2_PUBLIC_URL.replace(/\/+$/, "");

  const fileFailures: RecordFailure[] = [];
  let records = loadRecords(args.file, fileFailures);
  if (args.limit) records = records.slice(0, args.limit);
  const plan = planAssets(records, fileFailures);
  console.log(`السجلات الصالحة: ${records.length} | الملفات الفريدة: ${plan.length} | مرفوضة عند القراءة: ${fileFailures.length}`);

  const db = new pg.Pool({ connectionString: env.LOGOS_DATABASE_URL, max: 4 });
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.NEWS_IMAGES_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.NEWS_IMAGES_R2_ACCESS_KEY_ID, secretAccessKey: env.NEWS_IMAGES_R2_SECRET_ACCESS_KEY },
  });

  try {
    if (args.migrate && !args.dryRun) {
      const sql = readFileSync(fileURLToPath(new URL("../../migrations/20261007_logo_library.sql", import.meta.url)), "utf8");
      await db.query(sql);
      console.log("الجداول جاهزة (logos, logo_assets)");
    }

    if (!args.verifyOnly) {
      if (!args.dryRun) {
        await upsertMetadata(db, records);
        console.log(`البيانات الوصفية محفوظة: ${records.length}`);
      }

      const { rows: existing } = args.dryRun
        ? { rows: [] as { source_url: string; status: string }[] }
        : await db.query<{ source_url: string; status: string }>(`SELECT source_url, status FROM logo_assets`);
      const state = new Map(existing.map((r) => [r.source_url, r.status]));
      const todo = plan.filter((p) => {
        const s = state.get(p.sourceUrl);
        if (s === "uploaded") return false;
        if (s === "failed" && !args.retryFailed) return false;
        return true;
      });
      const skippedUploaded = plan.filter((p) => state.get(p.sourceUrl) === "uploaded").length;
      const skippedFailed = args.retryFailed ? 0 : plan.filter((p) => state.get(p.sourceUrl) === "failed").length;
      console.log(`للمعالجة: ${todo.length} | متخطى (مرفوع سابقًا): ${skippedUploaded} | متخطى (فاشل سابقًا، استخدم --retry-failed): ${skippedFailed}`);

      let done = 0, ok = 0, bad = 0;
      await pool(todo, args.concurrency, async (p) => {
        let attempts = 0;
        try {
          const buf = await withRetry(() => downloadOnce(p.sourceUrl), () => attempts++);
          const sniff = sniffContentType(buf);
          if (!sniff) throw new PermanentError("المحتوى ليس صورة معروفة (SVG/PNG/PDF/JPEG/WEBP/GIF)");
          const sha256 = createHash("sha256").update(buf).digest("hex");
          const key = `${KEY_PREFIX}/${p.logoId}/${p.variant}.${sniff.ext}`;
          const publicUrl = `${publicBase}/${key}`;
          if (!args.dryRun) {
            await withRetry(
              () => s3.send(new PutObjectCommand({
                Bucket: env.NEWS_IMAGES_R2_BUCKET_NAME,
                Key: key,
                Body: buf,
                ContentType: sniff.contentType,
                CacheControl: CACHE_CONTROL,
                Metadata: { "source-url": encodeURIComponent(p.sourceUrl), "logo-id": p.logoId, sha256 },
              })),
              () => {},
            );
            await db.query(
              `INSERT INTO logo_assets (logo_id, variant, source_url, r2_key, public_url, content_type, bytes, sha256, status, error, attempts, uploaded_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'uploaded',NULL,$9,now(),now())
               ON CONFLICT (source_url) DO UPDATE SET
                 logo_id = EXCLUDED.logo_id, variant = EXCLUDED.variant, r2_key = EXCLUDED.r2_key, public_url = EXCLUDED.public_url,
                 content_type = EXCLUDED.content_type, bytes = EXCLUDED.bytes, sha256 = EXCLUDED.sha256,
                 status = 'uploaded', error = NULL, attempts = logo_assets.attempts + EXCLUDED.attempts,
                 uploaded_at = now(), updated_at = now()`,
              [p.logoId, p.variant, p.sourceUrl, key, publicUrl, sniff.contentType, buf.length, sha256, attempts],
            );
          }
          ok++;
        } catch (e: any) {
          bad++;
          const reason = String(e?.message ?? e).slice(0, 500);
          if (args.dryRun) {
            fileFailures.push({ id: p.logoId, displayId: p.displayId, title: p.title, stage: "download", reason, url: p.sourceUrl });
          } else {
            await db.query(
              `INSERT INTO logo_assets (logo_id, variant, source_url, status, error, attempts, updated_at)
               VALUES ($1,$2,$3,'failed',$4,$5,now())
               ON CONFLICT (source_url) DO UPDATE SET status = 'failed', error = EXCLUDED.error,
                 attempts = logo_assets.attempts + EXCLUDED.attempts, updated_at = now()
               WHERE logo_assets.status <> 'uploaded'`,
              [p.logoId, p.variant, p.sourceUrl, reason, attempts],
            );
          }
        } finally {
          done++;
          if (done % 50 === 0 || done === todo.length) console.log(`  ${done}/${todo.length} (نجح ${ok}، فشل ${bad})`);
        }
      });

      if (!args.dryRun) await linkLogoUrls(db);
    }

    // ---------- التقرير ----------
    if (args.dryRun) {
      writeFileSync(join(args.out, "dry-run-failures.json"), JSON.stringify(fileFailures, null, 2));
      console.log(`تشغيل تجريبي: الفاشل ${fileFailures.length} — ${join(args.out, "dry-run-failures.json")}`);
      return;
    }

    const verification = await verify(db, records.length, args.concurrency);
    const { rows: dbFailures } = await db.query(`
      SELECT l.id, l.display_id, l.title, 'upload' AS stage, a.error AS reason, a.source_url AS url
      FROM logo_assets a JOIN logos l ON l.id = a.logo_id WHERE a.status = 'failed'
      UNION ALL
      SELECT l.id, l.display_id, l.title, 'link', 'لا توجد نسخة SVG أو PNG مرفوعة لهذا الشعار', NULL
      FROM logos l WHERE l.primary_url IS NULL
      ORDER BY 2`);
    const allFailures: RecordFailure[] = [
      ...fileFailures,
      ...dbFailures.map((r) => ({ id: r.id, displayId: r.display_id, title: r.title, stage: r.stage, reason: r.reason, url: r.url ?? undefined })),
      ...verification.brokenUrls.map((b) => ({ id: null, displayId: b.displayId, title: null, stage: "verify", reason: b.reason, url: b.url })),
    ];
    const report = { finishedAt: new Date().toISOString(), file: args.file, ...verification, failures: allFailures };
    writeFileSync(join(args.out, "report.json"), JSON.stringify(report, null, 2));
    writeFileSync(
      join(args.out, "failures.csv"),
      "﻿" + ["display_id,id,title,stage,reason,url", ...allFailures.map((f) => [f.displayId, f.id, f.title, f.stage, f.reason, f.url].map(csvCell).join(","))].join("\n"),
    );
    console.log("\n===== التقرير =====");
    console.log(`السجلات في الملف: ${records.length} | في Neon: ${verification.logos} | التطابق: ${verification.countMatches ? "نعم" : "لا"}`);
    console.log(`الملفات المرفوعة: ${verification.uploaded} | الفاشلة: ${verification.failed} | شعارات بلا رابط معتمد: ${verification.without_primary}`);
    console.log(`روابط مفحوصة: ${verification.checkedUrls} | لا تفتح: ${verification.brokenUrls.length}`);
    console.log(`السجلات الفاشلة: ${allFailures.length} — ${join(args.out, "failures.csv")}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error("فشل غير متوقع:", e);
  process.exit(1);
});
