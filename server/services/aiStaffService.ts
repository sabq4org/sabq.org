/**
 * فريق سبق الذكي — خدمة القسم (ADR-001: كل Drizzle هنا، لا db في المسارات).
 *
 * المبدأ: لا محرك جديدًا ولا ازدواج بيانات — الهوية من ai_staff (أو السجل
 * الافتراضي في shared/aiStaffRoster.ts إن لم يُزرع الجدول بعد)، وكل رقم
 * مشتق من جداول قائمة: ai_usage_logs (اليوم)، ai_usage_daily (الشهر)،
 * ai_feature_configs (الحالة والعقل). قاعدة المصداقية: لا أرقام وهمية —
 * موظف بلا مفاتيح بوابة يظهر «قيد الربط» لا أصفارًا كاذبة.
 */
import { desc, gte, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  aiFeatureConfigs,
  aiModels,
  aiStaff,
  aiUsageDaily,
  aiUsageLogs,
} from "@shared/schema";
import {
  AI_STAFF_DEPARTMENTS,
  AI_STAFF_ROSTER,
  staffOwnsFeatureKey,
  type AiStaffDepartmentKey,
  type AiStaffMember,
} from "@shared/aiStaffRoster";
import { getDefaultFeatureConfig } from "../ai/gateway/defaults";
import { memoryCache } from "../memoryCache";

// ── الأنواع المعادة للواجهة ──

export interface AiStaffKpis {
  todayOps: number;
  todaySuccessRate: number | null; // null = لا عمليات اليوم
  monthOps: number;
  monthCostUsd: number;
  monthP95LatencyMs: number | null;
}

export interface AiStaffListEntry extends AiStaffMember {
  status: "active" | "paused";
  kpis: AiStaffKpis | null; // null = metricsSource "pending"
}

export interface AiStaffTeamPayload {
  generatedAt: string;
  departments: { key: AiStaffDepartmentKey; labelAr: string; noteAr: string }[];
  staff: AiStaffListEntry[];
  totals: {
    todayOps: number;
    todaySuccessRate: number | null;
    monthCostUsd: number;
    activeCount: number;
    totalCount: number;
  };
}

export interface AiStaffToolInfo {
  featureKey: string;
  displayName: string;
  primaryModel: string;
  fallbackCount: number;
  isEnabled: boolean;
}

export interface AiStaffWorkItem {
  createdAt: string;
  featureKey: string;
  featureName: string;
  operation: string;
  status: string;
  latencyMs: number;
  costUsd: number;
  taskType: string | null;
}

export interface AiStaffProfilePayload {
  member: AiStaffListEntry;
  managerName: string | null;
  tools: AiStaffToolInfo[];
  recentWork: AiStaffWorkItem[];
}

const TEAM_CACHE_KEY = "ai-staff:team";
const TEAM_CACHE_TTL_MS = 30 * 1000;
const PUBLIC_CACHE_KEY = "ai-staff:public";
const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** بداية اليوم بتوقيت الرياض (UTC+3 ثابت) — نفس أسلوب aiPublicStatsService. */
const riyadhDayStartUtc = sql`(date_trunc('day', now() + interval '3 hours') - interval '3 hours')`;
/** أول الشهر الحالي بتوقيت الرياض كتاريخ (لعمود date في الملخص اليومي). */
const riyadhMonthStart = sql`(date_trunc('month', now() + interval '3 hours'))::date`;

/**
 * السجل الفعّال: صفوف ai_staff إن زُرعت، وإلا السجل الافتراضي — نفس
 * فلسفة gateway/defaults.ts (الثوابت أساس والقاعدة تتقدم).
 */
export async function getEffectiveRoster(): Promise<(AiStaffMember & { status: "active" | "paused" })[]> {
  let rows: (typeof aiStaff.$inferSelect)[] = [];
  try {
    rows = await db.select().from(aiStaff);
  } catch {
    // الجدول غير موجود بعد (قبل db:push) — السجل الافتراضي يغطي
    rows = [];
  }
  if (rows.length === 0) {
    return AI_STAFF_ROSTER.map((m) => ({ ...m, status: "active" as const }));
  }
  return rows
    .map((r) => ({
      slug: r.slug,
      employeeCode: r.employeeCode,
      nameAr: r.nameAr,
      titleAr: r.titleAr,
      bioAr: r.bioAr,
      departmentKey: r.departmentKey as AiStaffDepartmentKey,
      managerSlug: r.managerSlug,
      avatarUrl: r.avatarUrl,
      featureKeys: Array.isArray(r.featureKeys) ? r.featureKeys : [],
      featureKeyPrefixes: Array.isArray(r.featureKeyPrefixes) ? r.featureKeyPrefixes : [],
      systems: Array.isArray(r.systems) ? r.systems : [],
      triggerMode: r.triggerMode as AiStaffMember["triggerMode"],
      scheduleNoteAr: r.scheduleNoteAr,
      metricsSource: r.metricsSource as AiStaffMember["metricsSource"],
      sortOrder: r.sortOrder,
      status: r.status === "paused" ? ("paused" as const) : ("active" as const),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** شرط SQL: سجل الاستخدام يخص أحد أفراد الفريق (مفاتيح تامة + بادئات). */
function teamFeaturePredicate(roster: AiStaffMember[]): SQL | undefined {
  const exactKeys = [...new Set(roster.flatMap((m) => m.featureKeys))];
  const prefixes = [...new Set(roster.flatMap((m) => m.featureKeyPrefixes))];
  const conds: SQL[] = [];
  if (exactKeys.length > 0) conds.push(inArray(aiUsageLogs.featureKey, exactKeys));
  for (const p of prefixes) conds.push(like(aiUsageLogs.featureKey, `${p}%`));
  return conds.length > 0 ? or(...conds) : undefined;
}

async function computeTeam(): Promise<AiStaffTeamPayload> {
  const roster = await getEffectiveRoster();

  // اليوم: من السجل الخام (مفهرس feature_key,created_at)
  const todayRows = await db
    .select({
      featureKey: aiUsageLogs.featureKey,
      requests: sql<number>`count(*)`,
      successes: sql<number>`count(*) filter (where ${aiUsageLogs.status} in ('success','fallback'))`,
    })
    .from(aiUsageLogs)
    .where(gte(aiUsageLogs.createdAt, sql`${riyadhDayStartUtc}`))
    .groupBy(aiUsageLogs.featureKey);

  // الشهر: من الملخص اليومي (لا نلمس الخام لنطاق شهر كامل)
  const monthRows = await db
    .select({
      featureKey: aiUsageDaily.featureKey,
      requests: sql<number>`sum(${aiUsageDaily.requests})`,
      costUsd: sql<number>`sum(${aiUsageDaily.estimatedCostUsd})`,
      p95: sql<number>`avg(${aiUsageDaily.p95LatencyMs}) filter (where ${aiUsageDaily.p95LatencyMs} > 0)`,
    })
    .from(aiUsageDaily)
    .where(gte(aiUsageDaily.date, sql`${riyadhMonthStart}`))
    .groupBy(aiUsageDaily.featureKey);

  // حالة الميزات من البوابة (الإيقاف يمر من هناك بسجل تدقيق — لا مسار موازٍ)
  const configRows = await db
    .select({ featureKey: aiFeatureConfigs.featureKey, isEnabled: aiFeatureConfigs.isEnabled })
    .from(aiFeatureConfigs);
  const enabledByKey = new Map(configRows.map((c) => [c.featureKey, c.isEnabled]));

  const staffEntries: AiStaffListEntry[] = roster.map((member) => {
    let todayOps = 0;
    let todaySuccess = 0;
    let monthOps = 0;
    let monthCost = 0;
    const p95Values: number[] = [];
    for (const row of todayRows) {
      if (!staffOwnsFeatureKey(member, row.featureKey)) continue;
      todayOps += num(row.requests);
      todaySuccess += num(row.successes);
    }
    for (const row of monthRows) {
      if (!staffOwnsFeatureKey(member, row.featureKey)) continue;
      monthOps += num(row.requests);
      monthCost += num(row.costUsd);
      if (num(row.p95) > 0) p95Values.push(num(row.p95));
    }

    // موقوف إذا أوقفه المشرف يدويًا، أو كانت كل مفاتيحه التامة مطفأة في البوابة
    const knownStates = member.featureKeys
      .map((k) => enabledByKey.get(k))
      .filter((v): v is boolean => typeof v === "boolean");
    const gatewayPaused = knownStates.length > 0 && knownStates.every((v) => v === false);
    const status: "active" | "paused" = member.status === "paused" || gatewayPaused ? "paused" : "active";

    const kpis: AiStaffKpis | null =
      member.metricsSource === "gateway"
        ? {
            todayOps,
            todaySuccessRate: todayOps > 0 ? Math.round((todaySuccess / todayOps) * 1000) / 10 : null,
            monthOps,
            monthCostUsd: Math.round(monthCost * 100) / 100,
            monthP95LatencyMs:
              p95Values.length > 0
                ? Math.round(p95Values.reduce((a, b) => a + b, 0) / p95Values.length)
                : null,
          }
        : null;

    return { ...member, status, kpis };
  });

  const withKpis = staffEntries.filter((s) => s.kpis);
  const totalToday = withKpis.reduce((a, s) => a + (s.kpis?.todayOps ?? 0), 0);
  const totalTodaySuccess = withKpis.reduce(
    (a, s) => a + ((s.kpis?.todayOps ?? 0) * (s.kpis?.todaySuccessRate ?? 0)) / 100,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    departments: (Object.keys(AI_STAFF_DEPARTMENTS) as AiStaffDepartmentKey[])
      .sort((a, b) => AI_STAFF_DEPARTMENTS[a].sortOrder - AI_STAFF_DEPARTMENTS[b].sortOrder)
      .map((key) => ({ key, labelAr: AI_STAFF_DEPARTMENTS[key].labelAr, noteAr: AI_STAFF_DEPARTMENTS[key].noteAr })),
    staff: staffEntries,
    totals: {
      todayOps: totalToday,
      todaySuccessRate: totalToday > 0 ? Math.round((totalTodaySuccess / totalToday) * 1000) / 10 : null,
      monthCostUsd: Math.round(withKpis.reduce((a, s) => a + (s.kpis?.monthCostUsd ?? 0), 0) * 100) / 100,
      activeCount: staffEntries.filter((s) => s.status === "active").length,
      totalCount: staffEntries.length,
    },
  };
}

export async function getAiStaffTeam(): Promise<AiStaffTeamPayload> {
  const cached = memoryCache.get<AiStaffTeamPayload>(TEAM_CACHE_KEY);
  if (cached) return cached;
  const payload = await computeTeam();
  memoryCache.set(TEAM_CACHE_KEY, payload, TEAM_CACHE_TTL_MS);
  return payload;
}

export async function getAiStaffProfile(slug: string): Promise<AiStaffProfilePayload | null> {
  const team = await getAiStaffTeam();
  const member = team.staff.find((s) => s.slug === slug);
  if (!member) return null;

  const manager = member.managerSlug ? team.staff.find((s) => s.slug === member.managerSlug) : null;

  // «العقل»: أدوات الموظف — إعداد القاعدة يتقدم على الافتراضي (نمط البوابة)
  const configs = member.featureKeys.length
    ? await db
        .select({
          featureKey: aiFeatureConfigs.featureKey,
          isEnabled: aiFeatureConfigs.isEnabled,
          primaryModelId: aiFeatureConfigs.primaryModelId,
          fallbackChain: aiFeatureConfigs.fallbackChain,
          modelId: aiModels.modelId,
        })
        .from(aiFeatureConfigs)
        .leftJoin(aiModels, sql`${aiModels.id} = ${aiFeatureConfigs.primaryModelId}`)
        .where(inArray(aiFeatureConfigs.featureKey, member.featureKeys))
    : [];
  const configByKey = new Map(configs.map((c) => [c.featureKey, c]));

  const tools: AiStaffToolInfo[] = member.featureKeys.map((key) => {
    const dbConfig = configByKey.get(key);
    const fallback = getDefaultFeatureConfig(key);
    return {
      featureKey: key,
      displayName: fallback.displayName,
      primaryModel: dbConfig?.modelId ?? fallback.primary?.modelId ?? "—",
      fallbackCount: (dbConfig?.fallbackChain ?? fallback.fallbackChain).length,
      isEnabled: dbConfig?.isEnabled ?? true,
    };
  });

  // سجل الأعمال: آخر عمليات حقيقية من ai_usage_logs — لا نص توليدي
  const predicate = teamFeaturePredicate([member]);
  const recentRows = predicate
    ? await db
        .select({
          createdAt: aiUsageLogs.createdAt,
          featureKey: aiUsageLogs.featureKey,
          operation: aiUsageLogs.operation,
          status: aiUsageLogs.status,
          latencyMs: aiUsageLogs.latencyMs,
          costUsd: aiUsageLogs.estimatedCostUsd,
          taskType: aiUsageLogs.taskType,
        })
        .from(aiUsageLogs)
        .where(predicate)
        .orderBy(desc(aiUsageLogs.createdAt))
        .limit(15)
    : [];

  return {
    member,
    managerName: manager?.nameAr ?? null,
    tools,
    recentWork: recentRows.map((r) => ({
      createdAt: r.createdAt.toISOString(),
      featureKey: r.featureKey,
      featureName: getDefaultFeatureConfig(r.featureKey).displayName,
      operation: r.operation,
      status: r.status,
      latencyMs: num(r.latencyMs),
      costUsd: num(r.costUsd),
      taskType: r.taskType ?? null,
    })),
  };
}

// ── النسخة العلنية (شريحة «عقل سبق») — مجاميع منقّاة فقط ──

export interface AiTeamPublicPayload {
  generatedAt: string;
  team: { slug: string; nameAr: string; titleAr: string; departmentAr: string; avatarUrl: string }[];
  counters: { monthOps: number; teamCount: number };
}

export async function getAiTeamPublic(): Promise<AiTeamPublicPayload> {
  const cached = memoryCache.get<AiTeamPublicPayload>(PUBLIC_CACHE_KEY);
  if (cached) return cached;

  const roster = await getEffectiveRoster();
  const active = roster.filter((m) => m.status === "active");

  // مجموع أعمال الشهر لكل الفريق من الملخص اليومي — رقم حقيقي واحد
  const exactKeys = [...new Set(active.flatMap((m) => m.featureKeys))];
  const prefixes = [...new Set(active.flatMap((m) => m.featureKeyPrefixes))];
  const conds: SQL[] = [];
  if (exactKeys.length > 0) conds.push(inArray(aiUsageDaily.featureKey, exactKeys));
  for (const p of prefixes) conds.push(like(aiUsageDaily.featureKey, `${p}%`));
  let monthOps = 0;
  if (conds.length > 0) {
    const [row] = await db
      .select({ requests: sql<number>`coalesce(sum(${aiUsageDaily.requests}), 0)` })
      .from(aiUsageDaily)
      .where(sql`${gte(aiUsageDaily.date, sql`${riyadhMonthStart}`)} AND (${or(...conds)})`);
    monthOps = num(row?.requests);
  }

  const payload: AiTeamPublicPayload = {
    generatedAt: new Date().toISOString(),
    team: active.map((m) => ({
      slug: m.slug,
      nameAr: m.nameAr,
      titleAr: m.titleAr,
      departmentAr: AI_STAFF_DEPARTMENTS[m.departmentKey].labelAr,
      avatarUrl: m.avatarUrl,
    })),
    counters: { monthOps, teamCount: active.length },
  };
  memoryCache.set(PUBLIC_CACHE_KEY, payload, PUBLIC_CACHE_TTL_MS);
  return payload;
}
