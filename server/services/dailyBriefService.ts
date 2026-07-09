import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "../db";
import { articles, categories, userInterests } from "@shared/schema";

const BRIEF_SIZE = 5;
const GENERAL_ITEM_COUNT = 3;
const CANDIDATE_LIMIT = 40;
const MAX_SUMMARY_LENGTH = 260;
const MAX_BULLET_LENGTH = 180;

export type DailyBriefEdition = "morning" | "midday" | "evening" | "night";

export interface DailyBriefItem {
  id: string;
  position: number;
  title: string;
  slug: string;
  articleUrl: string;
  summary: string;
  bullets: string[];
  category: {
    id: string | null;
    name: string;
    slug: string | null;
    color: string | null;
  };
  imageUrl: string | null;
  imageFocalPoint: { x: number; y: number } | null;
  isAiGeneratedImage: boolean;
  aiImageModel: string | null;
  publishedAt: string | null;
  updatedAt: string;
  isBreaking: boolean;
  isPersonalized: boolean;
}

export interface DailyBriefPayload {
  id: string;
  edition: DailyBriefEdition;
  editionLabel: string;
  headline: string;
  generatedAt: string;
  updatedAt: string;
  estimatedReadingSeconds: number;
  itemCount: number;
  items: DailyBriefItem[];
  personalization: {
    isPersonalized: boolean;
    personalizedItemCount: number;
  };
}

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number];

function plainText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const sliced = value.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace > maxLength * 0.7 ? sliced.slice(0, lastSpace) : sliced;
  return `${safe.trim()}…`;
}

function summaryFor(candidate: Candidate): string {
  const source =
    plainText(candidate.aiSummary) ||
    plainText(candidate.excerpt) ||
    plainText(candidate.subtitle) ||
    "اقرأ التفاصيل الكاملة للخبر في سبق.";
  return truncateAtWord(source, MAX_SUMMARY_LENGTH);
}

function bulletsFor(candidate: Candidate, summary: string): string[] {
  const approvedBullets = Array.isArray(candidate.aiBullets)
    ? candidate.aiBullets
        .map((bullet) => truncateAtWord(plainText(bullet), MAX_BULLET_LENGTH))
        .filter(Boolean)
        .slice(0, 2)
    : [];

  if (approvedBullets.length > 0) return approvedBullets;

  const sentences = summary
    .split(/(?<=[.!؟])\s+/u)
    .map((sentence) => truncateAtWord(sentence.trim(), MAX_BULLET_LENGTH))
    .filter(Boolean);
  return sentences.length > 1 ? sentences.slice(0, 2) : [];
}

function riyadhEdition(now: Date): {
  idDate: string;
  edition: DailyBriefEdition;
  editionLabel: string;
} {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const hour = Number(values.hour ?? 0);
  const idDate = `${values.year}-${values.month}-${values.day}`;
  if (hour >= 5 && hour < 12) {
    return { idDate, edition: "morning", editionLabel: "نسخة الصباح" };
  }
  if (hour >= 12 && hour < 17) {
    return { idDate, edition: "midday", editionLabel: "تحديث الظهيرة" };
  }
  if (hour >= 17 && hour < 22) {
    return { idDate, edition: "evening", editionLabel: "نسخة المساء" };
  }
  return { idDate, edition: "night", editionLabel: "تحديث الليل" };
}

function candidateScore(candidate: Candidate, now: Date): number {
  const publishedAt = candidate.publishedAt ?? candidate.updatedAt;
  const ageHours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000);
  const freshness = Math.max(0, 48 - ageHours) * 10;
  const importance = candidate.newsType === "breaking"
    ? 300
    : candidate.isFeatured
      ? 150
      : 0;
  const popularity = Math.min(100, Math.log10(Math.max(1, candidate.views + 1)) * 25);
  return freshness + importance + popularity;
}

function selectGeneralItems(candidates: Candidate[]): Candidate[] {
  const selected: Candidate[] = [];
  const selectedCategories = new Set<string>();

  for (const candidate of candidates) {
    if (selected.length >= GENERAL_ITEM_COUNT) break;
    const categoryKey = candidate.categoryId ?? `uncategorized-${candidate.id}`;
    if (selected.length > 0 && selectedCategories.has(categoryKey)) continue;
    selected.push(candidate);
    selectedCategories.add(categoryKey);
  }

  for (const candidate of candidates) {
    if (selected.length >= GENERAL_ITEM_COUNT) break;
    if (!selected.some((item) => item.id === candidate.id)) selected.push(candidate);
  }

  return selected;
}

function toItem(candidate: Candidate, position: number, isPersonalized: boolean): DailyBriefItem {
  const summary = summaryFor(candidate);
  return {
    id: candidate.id,
    position,
    title: plainText(candidate.title),
    slug: candidate.slug,
    articleUrl: `https://sabq.org/article/${candidate.slug}`,
    summary,
    bullets: bulletsFor(candidate, summary),
    category: {
      id: candidate.categoryId,
      name: candidate.categoryName ?? "عام",
      slug: candidate.categorySlug,
      color: candidate.categoryColor,
    },
    imageUrl: candidate.imageUrl ?? candidate.thumbnailUrl,
    imageFocalPoint: candidate.imageFocalPoint,
    isAiGeneratedImage:
      candidate.isAiGeneratedImage ||
      (candidate.imageUrl == null && candidate.isAiGeneratedThumbnail),
    aiImageModel: candidate.aiImageModel,
    publishedAt: candidate.publishedAt?.toISOString() ?? null,
    updatedAt: candidate.updatedAt.toISOString(),
    isBreaking: candidate.newsType === "breaking",
    isPersonalized,
  };
}

async function loadCandidates() {
  return db
    .select({
      id: articles.id,
      title: articles.title,
      subtitle: articles.subtitle,
      slug: articles.slug,
      excerpt: articles.excerpt,
      aiSummary: articles.aiSummary,
      aiBullets: articles.aiBullets,
      imageUrl: articles.imageUrl,
      thumbnailUrl: articles.thumbnailUrl,
      imageFocalPoint: articles.imageFocalPoint,
      isAiGeneratedImage: articles.isAiGeneratedImage,
      isAiGeneratedThumbnail: articles.isAiGeneratedThumbnail,
      aiImageModel: articles.aiImageModel,
      categoryId: articles.categoryId,
      categoryName: categories.nameAr,
      categorySlug: categories.slug,
      categoryColor: categories.color,
      newsType: articles.newsType,
      isFeatured: articles.isFeatured,
      views: articles.views,
      publishedAt: articles.publishedAt,
      updatedAt: articles.updatedAt,
    })
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .where(and(
      eq(articles.status, "published"),
      eq(articles.hideFromHomepage, false),
      or(isNull(articles.articleType), ne(articles.articleType, "opinion")),
      or(isNull(articles.source), ne(articles.source, "ai")),
    ))
    .orderBy(desc(articles.publishedAt))
    .limit(CANDIDATE_LIMIT);
}

async function loadInterestWeights(userId: string | null): Promise<Map<string, number>> {
  if (!userId) return new Map();

  const rows = await db
    .select({
      categoryId: userInterests.categoryId,
      weight: userInterests.weight,
    })
    .from(userInterests)
    .where(eq(userInterests.userId, userId));

  return new Map(rows.map((row) => [row.categoryId, row.weight]));
}

export async function buildDailyBrief(userId: string | null = null): Promise<DailyBriefPayload> {
  const now = new Date();
  const edition = riyadhEdition(now);
  const [candidateRows, interestWeights] = await Promise.all([
    loadCandidates(),
    loadInterestWeights(userId),
  ]);

  const ranked = [...candidateRows].sort(
    (a, b) => candidateScore(b, now) - candidateScore(a, now),
  );
  const generalItems = selectGeneralItems(ranked);
  const selectedIds = new Set(generalItems.map((item) => item.id));

  const personalizedCandidates = interestWeights.size > 0
    ? ranked
        .filter((candidate) =>
          candidate.categoryId != null &&
          interestWeights.has(candidate.categoryId) &&
          !selectedIds.has(candidate.id),
        )
        .sort((a, b) => {
          const aWeight = a.categoryId ? interestWeights.get(a.categoryId) ?? 0 : 0;
          const bWeight = b.categoryId ? interestWeights.get(b.categoryId) ?? 0 : 0;
          return (candidateScore(b, now) + bWeight * 40) -
            (candidateScore(a, now) + aWeight * 40);
        })
        .slice(0, BRIEF_SIZE - generalItems.length)
    : [];

  personalizedCandidates.forEach((item) => selectedIds.add(item.id));
  const fallbackItems = ranked
    .filter((candidate) => !selectedIds.has(candidate.id))
    .slice(0, BRIEF_SIZE - generalItems.length - personalizedCandidates.length);

  const selected = [
    ...generalItems.map((candidate) => ({ candidate, personalized: false })),
    ...personalizedCandidates.map((candidate) => ({ candidate, personalized: true })),
    ...fallbackItems.map((candidate) => ({ candidate, personalized: false })),
  ].slice(0, BRIEF_SIZE);

  const items = selected.map(({ candidate, personalized }, index) =>
    toItem(candidate, index + 1, personalized),
  );
  const wordCount = items.reduce(
    (total, item) => total + item.summary.split(/\s+/).filter(Boolean).length,
    0,
  );
  const estimatedReadingSeconds = items.length === 0
    ? 0
    : Math.max(60, Math.ceil((wordCount / 180) * 60));
  const updatedAt = items
    .map((item) => new Date(item.updatedAt).getTime())
    .reduce((latest, timestamp) => Math.max(latest, timestamp), now.getTime());
  const personalizedItemCount = items.filter((item) => item.isPersonalized).length;

  return {
    id: `${edition.idDate}-${edition.edition}`,
    edition: edition.edition,
    editionLabel: edition.editionLabel,
    headline: `أهم ${items.length} أخبار تحتاج معرفتها الآن`,
    generatedAt: now.toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    estimatedReadingSeconds,
    itemCount: items.length,
    items,
    personalization: {
      isPersonalized: personalizedItemCount > 0,
      personalizedItemCount,
    },
  };
}
