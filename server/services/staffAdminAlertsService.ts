// تنبيهات الإدارة لتطبيق الديسك — GET /api/v1/staff/alerts
// مصادر: تغريدات فشل نشرها (72 ساعة)، وكالات رصيدها منخفض، أخبار عاجلة
// توشك على الانتهاء أو انتهت، حوادث الذكاء الاصطناعي، والميزانيات ≥ 80%.
// كل مصدر مستقل: فشل أحدها لا يُسقط البقية.
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "../db";
import {
  articles,
  enArticles,
  socialPostAttempts,
  socialPosts,
  urArticles,
} from "@shared/schema";
import { BREAKING_NEWS_MAX_AGE_MS, BREAKING_NEWS_TYPE } from "./breakingNewsService";
import { clipDeskAlertExcerpt } from "./deskBotAlerts";
import { listPublishersWithLowBalance } from "./publisherPortalService";
import { listRecentChainExhaustedIncidents } from "./staffAiAlertPush";
import { readBreakingExpiredLog } from "./staffBreakingExpiryLog";
import { listStaffHealthBudgets, listStaffHealthModels } from "./staffSystemHealthService";

export type StaffAlertKind =
  | "social_failed"
  | "agency_balance_low"
  | "breaking_expiring"
  | "breaking_expired"
  | "ai_incident"
  | "ai_budget";

export type StaffAlertSeverity = "urgent" | "info";

export type StaffAlertAction =
  | { type: "retry_social"; postId: string }
  | { type: "open_system" }
  | null;

export interface StaffAlertItem {
  id: string;
  kind: StaffAlertKind;
  severity: StaffAlertSeverity;
  title: string;
  body: string;
  occurredAt: string;
  deeplink: string | null;
  action: StaffAlertAction;
}

export interface StaffAlertsResponse {
  generatedAt: string;
  counts: { urgent: number; info: number };
  items: StaffAlertItem[];
}

export const STAFF_ALERTS_MAX_ITEMS = 50;
const SOCIAL_FAILED_WINDOW_MS = 72 * 60 * 60 * 1000;
const BREAKING_EXPIRING_WINDOW_MS = 2 * 60 * 60 * 1000;
const SYSTEM_DEEPLINK = "sabqdesk://system";

function iso(value: Date | string | null | undefined, fallback: Date): string {
  if (!value) return fallback.toISOString();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? fallback.toISOString() : d.toISOString();
}

/** العاجل أولاً ثم الأحدث، بحد أقصى 50. */
export function sortStaffAlerts(items: StaffAlertItem[], max = STAFF_ALERTS_MAX_ITEMS): StaffAlertItem[] {
  return [...items]
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "urgent" ? -1 : 1;
      const diff = (Date.parse(b.occurredAt) || 0) - (Date.parse(a.occurredAt) || 0);
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    })
    .slice(0, max);
}

export function buildStaffAlertsResponse(items: StaffAlertItem[], now: Date = new Date()): StaffAlertsResponse {
  const sorted = sortStaffAlerts(items);
  return {
    generatedAt: now.toISOString(),
    counts: {
      urgent: sorted.filter((i) => i.severity === "urgent").length,
      info: sorted.filter((i) => i.severity === "info").length,
    },
    items: sorted,
  };
}

// ── المصادر ─────────────────────────────────────────────────────────

async function socialFailedAlerts(now: Date, canRetry: boolean): Promise<StaffAlertItem[]> {
  const since = new Date(now.getTime() - SOCIAL_FAILED_WINDOW_MS);
  const posts = await db
    .select({
      id: socialPosts.id,
      text: socialPosts.text,
      lastError: socialPosts.lastError,
      updatedAt: socialPosts.updatedAt,
    })
    .from(socialPosts)
    .where(and(eq(socialPosts.status, "failed"), gte(socialPosts.updatedAt, since)))
    .orderBy(desc(socialPosts.updatedAt))
    .limit(STAFF_ALERTS_MAX_ITEMS);
  if (posts.length === 0) return [];

  const attempts = await db
    .select({
      postId: socialPostAttempts.postId,
      errorCode: socialPostAttempts.errorCode,
      errorMessage: socialPostAttempts.errorMessage,
    })
    .from(socialPostAttempts)
    .where(
      and(
        inArray(socialPostAttempts.postId, posts.map((p) => p.id)),
        eq(socialPostAttempts.outcome, "error"),
      ),
    )
    .orderBy(desc(socialPostAttempts.createdAt));
  const latestError = new Map<string, string>();
  for (const a of attempts) {
    if (latestError.has(a.postId)) continue;
    const msg = a.errorMessage || a.errorCode;
    if (msg) latestError.set(a.postId, msg);
  }

  return posts.map((p) => {
    const reason = clipDeskAlertExcerpt(latestError.get(p.id) || p.lastError || "سبب غير معروف", 140);
    const excerpt = clipDeskAlertExcerpt(p.text || "", 80);
    return {
      id: `social_failed:${p.id}`,
      kind: "social_failed" as const,
      severity: "urgent" as const,
      title: "فشل نشر تغريدة",
      body: excerpt ? `«${excerpt}» — ${reason}` : reason,
      occurredAt: iso(p.updatedAt, now),
      deeplink: `sabqdesk://social/${p.id}`,
      action: canRetry ? { type: "retry_social" as const, postId: p.id } : null,
    };
  });
}

async function agencyBalanceAlerts(now: Date): Promise<StaffAlertItem[]> {
  const list = await listPublishersWithLowBalance(now);
  return list.map((p) => ({
    id: `agency_balance_low:${p.creditId}`,
    kind: "agency_balance_low" as const,
    severity: "info" as const,
    title: p.level === "exhausted" ? `نفد رصيد ${p.agencyName}` : `رصيد ${p.agencyName} منخفض`,
    body: `تبقى ${p.remainingCredits} من ${p.totalCredits} في باقة «${p.packageName}»`,
    occurredAt: iso(p.updatedAt, now),
    deeplink: null,
    action: null,
  }));
}

const BREAKING_TABLES = { ar: articles, en: enArticles, ur: urArticles } as const;
type BreakingLang = keyof typeof BREAKING_TABLES;

async function breakingAlerts(now: Date): Promise<StaffAlertItem[]> {
  const out: StaffAlertItem[] = [];

  // توشك على الانتهاء: عاجل منشور سينتهي خلال ساعتين.
  const expiresBefore = new Date(now.getTime() - BREAKING_NEWS_MAX_AGE_MS + BREAKING_EXPIRING_WINDOW_MS);
  const expiresAfter = new Date(now.getTime() - BREAKING_NEWS_MAX_AGE_MS);
  for (const lang of Object.keys(BREAKING_TABLES) as BreakingLang[]) {
    const t = BREAKING_TABLES[lang];
    const rows = await db
      .select({ id: t.id, title: t.title, publishedAt: t.publishedAt })
      .from(t)
      .where(
        and(
          eq(t.status, "published"),
          inArray(t.hideFromHomepage, [false, true]),
          eq(t.newsType, BREAKING_NEWS_TYPE),
          gte(t.publishedAt, expiresAfter),
          lt(t.publishedAt, expiresBefore),
        ),
      )
      .limit(10);
    for (const r of rows) {
      const expiresAt = new Date(new Date(r.publishedAt ?? now).getTime() + BREAKING_NEWS_MAX_AGE_MS);
      const minutes = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / 60_000));
      out.push({
        id: `breaking_expiring:${lang}:${r.id}`,
        kind: "breaking_expiring",
        severity: "info",
        title: "خبر عاجل يوشك على الانتهاء",
        body: `«${clipDeskAlertExcerpt(r.title ?? "", 100)}» — ينتهي خلال ${minutes} دقيقة`,
        occurredAt: iso(r.publishedAt, now),
        deeplink: null,
        action: null,
      });
    }
  }

  // انتهت آخر 24 ساعة: من سجل وظيفة الانتهاء (المقال صار regular).
  const expired = await readBreakingExpiredLog(now);
  if (expired.length > 0) {
    const titles = new Map<string, string>();
    for (const lang of Object.keys(BREAKING_TABLES) as BreakingLang[]) {
      const ids = expired.filter((e) => e.lang === lang).map((e) => e.id);
      if (ids.length === 0) continue;
      const t = BREAKING_TABLES[lang];
      const rows = await db.select({ id: t.id, title: t.title }).from(t).where(inArray(t.id, ids));
      for (const r of rows) titles.set(`${lang}:${r.id}`, r.title ?? "");
    }
    for (const e of expired) {
      const title = titles.get(`${e.lang}:${e.id}`);
      out.push({
        id: `breaking_expired:${e.lang}:${e.id}`,
        kind: "breaking_expired",
        severity: "info",
        title: "انتهى خبر عاجل",
        body: title ? `«${clipDeskAlertExcerpt(title, 100)}» عاد خبراً عادياً` : "عاد خبراً عادياً بعد 3 ساعات",
        occurredAt: iso(e.expiredAt, now),
        deeplink: null,
        action: null,
      });
    }
  }
  return out;
}

async function aiAlerts(now: Date): Promise<StaffAlertItem[]> {
  const out: StaffAlertItem[] = [];
  const [models, budgets] = await Promise.all([listStaffHealthModels(), listStaffHealthBudgets()]);

  for (const m of models) {
    if (m.status === "up") continue;
    const urgent = m.status === "down";
    const title =
      m.rawStatus === "quota_exceeded"
        ? `نفد رصيد ${m.providerLabel}`
        : urgent
          ? `توقّف ${m.providerLabel}`
          : `تدهور أداء ${m.providerLabel}`;
    out.push({
      id: `ai_incident:${m.provider}:${m.modelId}`,
      kind: "ai_incident",
      severity: urgent ? "urgent" : "info",
      title,
      body: [m.modelId, m.lastError?.code, m.lastError?.message].filter(Boolean).join(" — "),
      occurredAt: m.since ?? m.lastCheckAt ?? now.toISOString(),
      deeplink: SYSTEM_DEEPLINK,
      action: { type: "open_system" },
    });
  }

  for (const inc of listRecentChainExhaustedIncidents(now)) {
    out.push({
      id: `ai_incident:chain_exhausted:${inc.featureKey}:${inc.occurredAt}`,
      kind: "ai_incident",
      severity: "urgent",
      title: "تعذّر تنفيذ مهمة ذكاء اصطناعي",
      body: [`فشلت كل النماذج البديلة لميزة ${inc.featureKey}`, inc.errorCode, inc.message]
        .filter(Boolean)
        .join(" — "),
      occurredAt: inc.occurredAt,
      deeplink: SYSTEM_DEEPLINK,
      action: { type: "open_system" },
    });
  }

  for (const b of budgets) {
    if (b.percent < 80) continue;
    out.push({
      id: `ai_budget:${b.id}`,
      kind: "ai_budget",
      severity: b.percent >= 100 ? "urgent" : "info",
      title: b.percent >= 100 ? `تجاوز ميزانية ${b.label}` : `اقتراب من حد ميزانية ${b.label}`,
      body: `${b.percent}% — $${b.spentUsd.toFixed(2)} من $${b.limitUsd.toFixed(0)} هذا الشهر`,
      occurredAt: now.toISOString(),
      deeplink: SYSTEM_DEEPLINK,
      action: { type: "open_system" },
    });
  }
  return out;
}

export async function getStaffAdminAlerts(options: {
  canRetrySocial: boolean;
  now?: Date;
}): Promise<StaffAlertsResponse> {
  const now = options.now ?? new Date();
  const sources: Array<[string, () => Promise<StaffAlertItem[]>]> = [
    ["social_failed", () => socialFailedAlerts(now, options.canRetrySocial)],
    ["agency_balance_low", () => agencyBalanceAlerts(now)],
    ["breaking", () => breakingAlerts(now)],
    ["ai", () => aiAlerts(now)],
  ];
  const results = await Promise.all(
    sources.map(async ([name, fn]) => {
      try {
        return await fn();
      } catch (err) {
        console.error(`[StaffAlerts] source ${name} failed:`, err);
        return [];
      }
    }),
  );
  return buildStaffAlertsResponse(results.flat(), now);
}
