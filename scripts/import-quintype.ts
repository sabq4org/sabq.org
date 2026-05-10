import { db } from "../server/db";
import { articles, categories, users, legacyRedirects } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import { cloudflareImagesService } from "../server/services/cloudflareImagesService";

const DATA_DIR = "/home/runner/workspace/.quintype-data";
const AWS_ACCESS_KEY_ID = process.env.AWS_API_KEY || "";
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_KEY || "";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_IMAGES_BUCKET = process.env.S3_IMAGES_BUCKET || "prod-qt-images";

const BATCH_SIZE = 100;
const DEFAULT_AUTHOR_NAME = "صحيفة سبق";
const DEFAULT_AUTHOR_ID = "sabq-newspaper";

let authorCache: Map<string, string> = new Map();

const SECTION_MAP: Record<string, string> = {
  saudia: "محليات",
  regions: "مناطق",
  sports: "رياضة",
  world: "العالم",
  community: "مجتمع",
  stations: "محطات",
  business: "أعمال",
  technology: "تقنية",
  mylife: "حياتنا",
  tourism: "سياحة",
  culture: "ثقافة",
  cars: "سيارات",
  articles: "مقالات",
  dialogue: "حوارات",
  pure: "ناصع",
  careers: "وظائف",
};

const SECTION_EN_MAP: Record<string, string> = {
  saudia: "Local",
  regions: "Regions",
  sports: "Sports",
  world: "World",
  community: "Community",
  stations: "Stations",
  business: "Business",
  technology: "Technology",
  mylife: "My Life",
  tourism: "Tourism",
  culture: "Culture",
  cars: "Cars",
  articles: "Articles",
  dialogue: "Dialogue",
  pure: "Pure",
  careers: "Careers",
};

interface QuintypeStory {
  headline: string;
  subheadline?: string;
  slug: string;
  "custom-slug"?: string;
  "story-content-id": string;
  "external-id"?: string;
  status: string;
  "story-template": string;
  "published-at": number;
  "first-published-at": number;
  "last-published-at": number;
  "content-created-at"?: number;
  "author-name"?: string;
  authors?: Array<{ name: string; id?: number; slug?: string; bio?: string; email?: string }>;
  sections?: Array<{ name: string; slug: string; id: number }>;
  tags?: Array<{ name: string; slug?: string }>;
  "hero-image-s3-key"?: string;
  "hero-image-caption"?: string;
  "hero-image-metadata"?: any;
  summary?: string;
  cards?: Array<{
    "story-elements"?: Array<{
      type: string;
      subtype?: string;
      text?: string;
      "image-s3-key"?: string;
      "image-metadata"?: any;
      url?: string;
      "embed-js"?: string;
    }>;
  }>;
  seo?: {
    "meta-title"?: string;
    "meta-description"?: string;
  };
  "word-count"?: number;
  metadata?: any;
}

let categoryCache: Map<string, string> = new Map();
let existingSlugs: Set<string> = new Set();
let importedCount = 0;
let skippedCount = 0;
let errorCount = 0;
let imageSuccessCount = 0;
let imageFailCount = 0;

async function generateUniqueSlug(baseSlug: string): Promise<string> {
  const slug = nanoid(7);
  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.slug, slug))
    .limit(1);
  if (existing.length === 0) return slug;
  return nanoid(10);
}

async function generateUniqueEnglishSlug(): Promise<string> {
  let attempts = 0;
  while (attempts < 100) {
    const slug = nanoid(7);
    const existing = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.englishSlug, slug))
      .limit(1);
    if (existing.length === 0) return slug;
    attempts++;
  }
  return nanoid(10);
}

async function loadCategories(): Promise<void> {
  const cats = await db.select({ id: categories.id, nameAr: categories.nameAr }).from(categories);
  cats.forEach((c) => categoryCache.set(c.nameAr, c.id));
  console.log(`[INIT] Loaded ${categoryCache.size} categories`);
}

async function loadExistingSlugs(): Promise<void> {
  const rows = await db.select({ legacySlug: articles.legacySlug }).from(articles).where(sql`legacy_slug IS NOT NULL`);
  rows.forEach((r) => { if (r.legacySlug) existingSlugs.add(r.legacySlug); });
  console.log(`[INIT] Loaded ${existingSlugs.size} existing legacy slugs`);
}

const FALLBACK_CATEGORY_AR = "مناطق";

async function ensureCategory(nameAr: string, sectionSlug: string): Promise<string> {
  if (categoryCache.has(nameAr)) return categoryCache.get(nameAr)!;

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.nameAr, nameAr))
    .limit(1);

  if (existing) {
    categoryCache.set(nameAr, existing.id);
    return existing.id;
  }

  if (categoryCache.has(FALLBACK_CATEGORY_AR)) {
    console.log(`[CAT] "${nameAr}" not found → using "${FALLBACK_CATEGORY_AR}"`);
    return categoryCache.get(FALLBACK_CATEGORY_AR)!;
  }

  throw new Error(`Fallback category "${FALLBACK_CATEGORY_AR}" not found`);
}

async function loadAuthors(): Promise<void> {
  const allUsers = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users);
  allUsers.forEach((u) => {
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.trim();
    if (fullName) authorCache.set(fullName, u.id);
  });

  if (!authorCache.has(DEFAULT_AUTHOR_NAME)) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, DEFAULT_AUTHOR_ID))
      .limit(1);
    if (!existing) {
      await db.execute(sql`
        INSERT INTO users (id, email, first_name, last_name, role, status)
        VALUES (${DEFAULT_AUTHOR_ID}, 'newspaper@sabq.org', 'صحيفة', 'سبق', 'reporter', 'active')
        ON CONFLICT (id) DO NOTHING
      `);
      console.log(`[AUTHOR] Created default author: ${DEFAULT_AUTHOR_NAME}`);
    }
    authorCache.set(DEFAULT_AUTHOR_NAME, DEFAULT_AUTHOR_ID);
  }
  console.log(`[INIT] Loaded ${authorCache.size} authors`);
}

function resolveAuthorId(story: QuintypeStory): string {
  const authorName = story.authors?.[0]?.name?.trim() || "";
  if (!authorName || authorName === "migrator" || authorName === "سبق" || authorName === "واس") {
    return authorCache.get(DEFAULT_AUTHOR_NAME) || DEFAULT_AUTHOR_ID;
  }

  if (authorCache.has(authorName)) {
    return authorCache.get(authorName)!;
  }

  for (const [cachedName, cachedId] of authorCache) {
    const nameA = authorName.split(" ");
    const nameB = cachedName.split(" ");
    if (nameA.length >= 2 && nameB.length >= 2 &&
        nameA[0] === nameB[0] && nameA[nameA.length - 1] === nameB[nameB.length - 1]) {
      return cachedId;
    }
  }

  return authorCache.get(DEFAULT_AUTHOR_NAME) || DEFAULT_AUTHOR_ID;
}

async function convertContent(story: QuintypeStory): Promise<string> {
  const parts: string[] = [];
  for (const card of story.cards || []) {
    for (const el of card["story-elements"] || []) {
      if (el.type === "text" && el.text) {
        parts.push(el.text);
      } else if (el.type === "image" && el["image-s3-key"]) {
        const s3Key = normalizeS3Key(el["image-s3-key"]);
        let imgUrl = `https://images.assettype.com/${s3Key}`;
        if (!globalSkipImages) {
          try {
            const buffer = await downloadImageFromS3(s3Key);
            if (buffer) {
              const ext = path.extname(s3Key) || ".jpg";
              const filename = `${nanoid(12)}${ext}`;
              const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
              const uploaded = await uploadImageToStorage(buffer, filename, contentType);
              if (uploaded) {
                imgUrl = uploaded;
                imageSuccessCount++;
              } else {
                imageFailCount++;
              }
            } else {
              imageFailCount++;
            }
          } catch {
            imageFailCount++;
          }
        }
        parts.push(`<figure><img src="${imgUrl}" alt="" loading="lazy" />${el.text ? `<figcaption>${el.text}</figcaption>` : ""}</figure>`);
      } else if (el.type === "youtube-video" && el.url) {
        const videoId = el.url.match(/(?:youtu\.be\/|v=)([^&\s]+)/)?.[1];
        if (videoId) {
          parts.push(`<div class="video-embed"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`);
        }
      } else if (el.type === "jsembed" && el["embed-js"]) {
        parts.push(`<div class="embed-block">${el["embed-js"]}</div>`);
      }
    }
  }
  return parts.join("\n") || "<p></p>";
}

function getExcerpt(story: QuintypeStory): string {
  const summary = story.summary || "";
  if (summary) return summary.substring(0, 500);
  const firstText = story.cards?.[0]?.["story-elements"]?.find((e) => e.type === "text")?.text || "";
  return firstText.replace(/<[^>]+>/g, "").substring(0, 500);
}

function normalizeS3Key(key: string): string {
  const parts = key.split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== "." && part !== "") resolved.push(part);
  }
  return resolved.join("/");
}

async function downloadImageFromS3(s3Key: string): Promise<Buffer | null> {
  if (!s3Key || s3Key.includes("default-cover-photo") || s3Key.endsWith("/")) return null;

  try {
    const normalizedKey = normalizeS3Key(s3Key);
    const tmpFile = `/tmp/qt-img-${nanoid(8)}`;
    const s3Path = `s3://${S3_IMAGES_BUCKET}/${normalizedKey}`;

    const { execSync } = await import("child_process");
    execSync(
      `/tmp/aws-bin/aws s3 cp "${s3Path}" "${tmpFile}" --quiet`,
      {
        timeout: 30000,
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY,
          AWS_DEFAULT_REGION: AWS_REGION,
        },
      }
    );

    if (fs.existsSync(tmpFile)) {
      const buffer = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      return buffer;
    }
    return null;
  } catch {
    return null;
  }
}

async function uploadImageToStorage(
  buffer: Buffer,
  filename: string,
  contentType: string = "image/jpeg"
): Promise<string | null> {
  try {
    const result = await cloudflareImagesService.uploadToCloudflare(
      buffer,
      filename,
      { source: "quintype-import" },
      contentType
    );
    if (result.success && result.deliveryUrl) {
      return result.deliveryUrl;
    }
    console.error(`[IMG-UPLOAD] Cloudflare failed: ${result.error}`);
    return null;
  } catch (err: any) {
    console.error(`[IMG-UPLOAD] Failed: ${filename} - ${err.message}`);
    return null;
  }
}

async function processHeroImage(story: QuintypeStory): Promise<string | null> {
  const s3Key = story["hero-image-s3-key"];
  if (!s3Key || s3Key.includes("default-cover-photo") || !s3Key.trim()) {
    return null;
  }
  if (globalSkipImages) {
    return `https://images.assettype.com/${normalizeS3Key(s3Key)}`;
  }

  const buffer = await downloadImageFromS3(s3Key);
  if (!buffer) {
    imageFailCount++;
    return `https://images.assettype.com/${s3Key}`;
  }

  const ext = path.extname(s3Key) || ".jpg";
  const filename = `${nanoid(12)}${ext}`;
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  const uploadedUrl = await uploadImageToStorage(buffer, filename, contentType);
  if (uploadedUrl) {
    imageSuccessCount++;
    return uploadedUrl;
  }

  imageFailCount++;
  return `https://images.assettype.com/${s3Key}`;
}

const SKIP_SECTIONS = new Set(["articles"]);
let skippedSectionCount = 0;

let globalMaxStories = 0;
let globalSkipImages = false;

async function processFile(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  console.log(`\n[FILE] Processing: ${fileName}`);

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNum = 0;
  let batch: QuintypeStory[] = [];

  for await (const line of rl) {
    if (globalMaxStories > 0 && importedCount >= globalMaxStories) break;
    lineNum++;
    try {
      const story: QuintypeStory = JSON.parse(line);
      if (story.status !== "published") continue;
      batch.push(story);

      if (batch.length >= BATCH_SIZE) {
        await processBatch(batch);
        batch = [];
        console.log(`  [${fileName}] line ${lineNum} | imported: ${importedCount} | skipped: ${skippedCount} | opinion: ${skippedSectionCount} | errors: ${errorCount}`);
      }
    } catch (err: any) {
      errorCount++;
    }
  }

  if (batch.length > 0) {
    await processBatch(batch);
  }

  console.log(`\n  [${fileName}] Complete: line ${lineNum}`);
}

async function processBatch(stories: QuintypeStory[]): Promise<void> {
  const articleValues: any[] = [];
  const redirectValues: any[] = [];

  for (const story of stories) {
    try {
      const legacySlug = story.slug;
      const sectionSlug = story.sections?.[0]?.slug || "saudia";

      if (SKIP_SECTIONS.has(sectionSlug)) {
        skippedSectionCount++;
        continue;
      }
      if (existingSlugs.has(legacySlug)) {
        skippedCount++;
        continue;
      }

      const sectionNameAr = story.sections?.[0]?.name || SECTION_MAP[sectionSlug] || "محليات";
      const categoryId = await ensureCategory(sectionNameAr, sectionSlug);
      const slug = await generateUniqueSlug(legacySlug);
      const englishSlug = slug;
      const content = await convertContent(story);
      const excerpt = story.summary || story.headline;
      const imageUrl = await processHeroImage(story);

      const pubTs = story["published-at"] && story["published-at"] > 0
        ? story["published-at"]
        : story["first-published-at"] && story["first-published-at"] > 0
          ? story["first-published-at"]
          : story["content-created-at"] && story["content-created-at"] > 0
            ? story["content-created-at"]
            : null;
      const publishedAt = pubTs ? new Date(pubTs) : null;
      const isPublished = story.status === "published" || !!publishedAt;

      articleValues.push({
        title: story.headline,
        subtitle: story.subheadline || null,
        slug,
        englishSlug,
        legacySlug,
        content,
        excerpt,
        imageUrl,
        categoryId,
        authorId: resolveAuthorId(story),
        articleType: "news",
        newsType: "regular",
        status: isPublished ? "published" : "draft",
        publishedAt,
        hideFromHomepage: true,
        source: "manual",
      });

      redirectValues.push({
        oldPath: `/${sectionSlug}/${legacySlug}`,
        newPath: `/article/${englishSlug}`,
        redirectType: 301,
        isActive: true,
        createdBy: DEFAULT_AUTHOR_ID,
      });

      existingSlugs.add(legacySlug);
    } catch (err: any) {
      errorCount++;
      if (!err.message?.includes("unique constraint")) {
        console.error(`\n[ERR] ${story.headline?.substring(0, 40)}: ${err.message}`);
      }
    }
  }

  if (articleValues.length > 0) {
    try {
      await db.insert(articles).values(articleValues).onConflictDoNothing();
      importedCount += articleValues.length;
    } catch (err: any) {
      for (const val of articleValues) {
        try {
          await db.insert(articles).values(val).onConflictDoNothing();
          importedCount++;
        } catch { errorCount++; }
      }
    }
  }

  if (redirectValues.length > 0) {
    try {
      await db.insert(legacyRedirects).values(redirectValues).onConflictDoNothing();
    } catch {
      for (const val of redirectValues) {
        try {
          await db.insert(legacyRedirects).values(val).onConflictDoNothing();
        } catch {}
      }
    }
  }
}

async function main() {
  console.log("=== Quintype → Sabq Import ===\n");

  const args = process.argv.slice(2);
  const startFile = parseInt(args.find((a) => a.startsWith("--start="))?.split("=")[1] || "1");
  const endFile = parseInt(args.find((a) => a.startsWith("--end="))?.split("=")[1] || "66");
  const skipImages = args.includes("--skip-images");
  const dryRun = args.includes("--dry-run");
  const customFile = args.find((a) => a.startsWith("--file="))?.split("=")[1];
  const maxStories = parseInt(args.find((a) => a.startsWith("--max="))?.split("=")[1] || "0");

  globalMaxStories = maxStories;
  globalSkipImages = skipImages;
  console.log(`Config: files ${startFile}-${endFile} | max=${maxStories || 'all'} | skipImages=${skipImages} | dryRun=${dryRun}`);

  await loadAuthors();
  await loadCategories();
  await loadExistingSlugs();

  const files: string[] = [];
  if (customFile) {
    if (fs.existsSync(customFile)) {
      files.push(customFile);
    } else {
      console.error(`[ERR] Custom file not found: ${customFile}`);
      process.exit(1);
    }
  } else {
    for (let i = startFile; i <= endFile; i++) {
      const fp = path.join(DATA_DIR, `stories-sabq-${i}.txt`);
      if (fs.existsSync(fp)) {
        files.push(fp);
      } else {
        console.warn(`[WARN] File not found: stories-sabq-${i}.txt`);
      }
    }
  }

  console.log(`\nFound ${files.length} files to process\n`);

  for (const file of files) {
    await processFile(file);
  }

  console.log("\n\n=== Import Summary ===");
  console.log(`Imported: ${importedCount}`);
  console.log(`Skipped (already exists): ${skippedCount}`);
  console.log(`Skipped (opinion/articles): ${skippedSectionCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Images uploaded: ${imageSuccessCount}`);
  console.log(`Images failed/fallback: ${imageFailCount}`);
  console.log("======================\n");

  process.exit(0);
}

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err.message);
});
process.on("unhandledRejection", (err: any) => {
  console.error("UNHANDLED:", err?.message || err);
});

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
