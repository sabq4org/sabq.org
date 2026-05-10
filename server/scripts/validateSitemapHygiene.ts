import { db } from "../db";
import { articles, enArticles, urArticles, categories, users, worldDays, tags, articleTags, deepAnalyses } from "@shared/schema";
import { and, eq, or } from "drizzle-orm";

const BASE = process.env.SITEMAP_VALIDATE_BASE || "http://localhost:5000";

type Issue = { url: string; reason: string };

function rebaseUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const base = new URL(BASE);
    u.protocol = base.protocol;
    u.host = base.host;
    u.port = base.port;
    return u.toString();
  } catch {
    return rawUrl;
  }
}

async function fetchSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const res = await fetch(rebaseUrl(sitemapUrl));
  if (!res.ok) {
    throw new Error(`Failed to fetch ${sitemapUrl}: ${res.status}`);
  }
  const xml = await res.text();
  const matches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g));
  return matches.map(m => rebaseUrl(m[1].trim()));
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function checkPath(pathname: string): Promise<Issue | null> {
  const article = pathname.match(/^\/article\/([^/]+)$/);
  if (article) {
    const slug = decodeURIComponent(article[1]);
    const [row] = await db
      .select({ status: articles.status })
      .from(articles)
      .where(or(eq(articles.slug, slug), eq(articles.englishSlug, slug)))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 article not found" };
    if (row.status === "deleted") return { url: pathname, reason: "410 article deleted" };
    return null;
  }
  const enArticle = pathname.match(/^\/en\/article\/([^/]+)$/);
  if (enArticle) {
    const slug = decodeURIComponent(enArticle[1]);
    const [row] = await db
      .select({ id: enArticles.id })
      .from(enArticles)
      .where(or(eq(enArticles.slug, slug), eq(enArticles.englishSlug, slug)))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 en article not found" };
    return null;
  }
  const urArticle = pathname.match(/^\/ur\/article\/([^/]+)$/);
  if (urArticle) {
    const slug = decodeURIComponent(urArticle[1]);
    const [row] = await db
      .select({ id: urArticles.id })
      .from(urArticles)
      .where(or(eq(urArticles.slug, slug), eq(urArticles.englishSlug, slug)))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 ur article not found" };
    return null;
  }
  const opinion = pathname.match(/^\/opinion\/([^/]+)$/);
  if (opinion) {
    const slug = decodeURIComponent(opinion[1]);
    const [row] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(or(eq(articles.slug, slug), eq(articles.englishSlug, slug)))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 opinion not found" };
    return null;
  }
  const omq = pathname.match(/^\/omq\/([^/]+)$/);
  if (omq) {
    const id = decodeURIComponent(omq[1]);
    const [row] = await db
      .select({ id: deepAnalyses.id })
      .from(deepAnalyses)
      .where(eq(deepAnalyses.id, id))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 omq not found" };
    return null;
  }
  const category = pathname.match(/^\/category\/([^/]+)$/);
  if (category) {
    const slug = decodeURIComponent(category[1]);
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 category not found" };
    return null;
  }
  const reporter = pathname.match(/^\/(?:reporter|writer)\/([^/]+)$/);
  if (reporter) {
    const id = decodeURIComponent(reporter[1]);
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 reporter/writer not found" };
    return null;
  }
  const muqtarab = pathname.match(/^\/muqtarab\/([^/]+)$/);
  if (muqtarab) {
    const id = decodeURIComponent(muqtarab[1]);
    const [row] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!row || row.role !== "opinion_writer") return { url: pathname, reason: "404 muqtarab not found" };
    return null;
  }
  const worldDay = pathname.match(/^\/world-day\/([^/]+)$/);
  if (worldDay) {
    const id = decodeURIComponent(worldDay[1]);
    const [row] = await db
      .select({ id: worldDays.id, isActive: worldDays.isActive })
      .from(worldDays)
      .where(eq(worldDays.id, id))
      .limit(1);
    if (!row || !row.isActive) return { url: pathname, reason: "404 world-day not found" };
    return null;
  }
  const keyword = pathname.match(/^\/(?:en\/)?keyword\/([^/]+)$/);
  if (keyword) {
    const slug = decodeURIComponent(keyword[1]);
    const [row] = await db
      .select({ id: articles.id })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .innerJoin(articles, eq(articles.id, articleTags.articleId))
      .where(and(eq(tags.slug, slug), eq(articles.status, "published")))
      .limit(1);
    if (!row) return { url: pathname, reason: "404 keyword has no published articles" };
    return null;
  }
  return null;
}

async function main() {
  const sitemaps = [
    `${BASE}/sitemap.xml`,
    `${BASE}/sitemap-news.xml`,
  ];

  let allUrls: string[] = [];
  const childSitemaps: string[] = [];

  for (const sm of sitemaps) {
    try {
      const urls = await fetchSitemapUrls(sm);
      for (const u of urls) {
        if (u.endsWith(".xml")) childSitemaps.push(u);
        else allUrls.push(u);
      }
    } catch (e: any) {
      console.error(`[Sitemap] Failed to fetch ${sm}: ${e.message}`);
    }
  }

  for (const cs of childSitemaps) {
    try {
      const urls = await fetchSitemapUrls(cs);
      allUrls.push(...urls);
    } catch (e: any) {
      console.error(`[Sitemap] Failed to fetch ${cs}: ${e.message}`);
    }
  }

  const unique = Array.from(new Set(allUrls));
  console.log(`[Sitemap] Discovered ${unique.length} unique URLs across ${sitemaps.length + childSitemaps.length} sitemap(s)`);

  const issues: Issue[] = [];
  let checked = 0;
  for (const url of unique) {
    const issue = await checkPath(pathnameOf(url));
    if (issue) issues.push(issue);
    checked += 1;
    if (checked % 500 === 0) console.log(`[Sitemap] Progress: ${checked}/${unique.length}`);
  }

  console.log(`\n[Sitemap] Checked ${checked} URLs. Issues: ${issues.length}`);
  if (issues.length > 0) {
    console.log("\nFirst 50 issues:");
    for (const it of issues.slice(0, 50)) {
      console.log(`  ${it.reason}: ${it.url}`);
    }
    process.exitCode = 1;
  } else {
    console.log("[Sitemap] OK — no sitemap entry resolves to a 404/410 from contentExistenceMiddleware logic.");
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
