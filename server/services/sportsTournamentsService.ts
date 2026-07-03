/**
 * خدمة سجلّ البطولات الموحّد (Sabq Sports 2.0).
 *
 * مصدر الحقيقة لظهور البطولات في هَب الرياضة الجديد (/sports22) وتطبيقات
 * الجوال معًا — يُدار من الداشبورد ويسري خلال دقيقة بدون deploy.
 *
 * مبادئ:
 *  - ADR-001: كل وصول قاعدة البيانات هنا؛ الراوترات لا تستورد db.
 *  - تدهور رشيق: لو الجدول غير موجود بعد (db:push لم يُنفَّذ) تعمل القائمة من
 *    seed في الذاكرة — لا ينكسر أي شيء قائم، وenv flags الحالية تبقى fallback.
 *  - القراءة العامة خلف withSWR (30 ثانية) — تغيير الداشبورد يظهر خلال دقيقة،
 *    ويُبطل الكاش فورًا على نفس العملية عند أي تعديل.
 */
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  sportsTournamentAudit,
  sportsTournaments,
  type InsertSportsTournament,
  type SportsTournament,
} from "@shared/schema";
import { swrCache, withSWR } from "../memoryCache";

const PUBLIC_TTL = 30 * 1000;
const CACHE_PREFIX = "sports:tournaments";

export type TournamentKind = "anchor" | "seasonal";
export type TournamentStatus = "hidden" | "upcoming" | "active" | "finished";
export type TournamentSurface = "web" | "app";

const KINDS: TournamentKind[] = ["anchor", "seasonal"];
const STATUSES: TournamentStatus[] = ["hidden", "upcoming", "active", "finished"];

/**
 * Seed أوّلي بالحالات الصحيحة الحالية (يوليو 2026):
 *  - روشن: الأساس الدائم (anchor/active) — يظهر دائمًا أولًا.
 *  - المونديال: جارٍ الآن (صيف 2026) — يبقى على صفحته المخصّصة (entryPath)
 *    وممنوع لمس تغطيته حتى النهائي.
 *  - كأس الملك والسوبر: موسم 2026/27 — upcoming ومخفية حتى تفعيلها من الداشبورد.
 *  - كأس آسيا وخليجي 27: جزر قائمة — entryPath لصفحاتها الحالية حتى الترحيل.
 */
const SEED_TOURNAMENTS: InsertSportsTournament[] = [
  {
    slug: "pro-league",
    apiFootballLeagueId: 307,
    name: "دوري روشن السعودي",
    shortName: "روشن",
    kind: "anchor",
    status: "active",
    visibleWeb: true,
    visibleApp: true,
    featured: true,
    sortOrder: 0,
    features: { standings: true, scorers: true, predictions: true, teams: true, news: true },
  },
  {
    slug: "world-cup",
    apiFootballLeagueId: 1,
    name: "كأس العالم 2026",
    shortName: "المونديال",
    kind: "seasonal",
    status: "active",
    visibleWeb: true,
    visibleApp: true,
    featured: true,
    sortOrder: 10,
    season: 2026,
    features: { bracket: true, scorers: true, predictions: true, teams: true, news: true, entryPath: "/world-cup" },
  },
  {
    slug: "kings-cup",
    apiFootballLeagueId: 504,
    name: "كأس خادم الحرمين الشريفين",
    shortName: "كأس الملك",
    kind: "seasonal",
    status: "upcoming",
    visibleWeb: false,
    visibleApp: false,
    sortOrder: 20,
    season: 2026,
    features: { bracket: true, scorers: true, predictions: true, teams: true, news: true, entryPath: "/kings-cup" },
  },
  {
    slug: "super-cup",
    apiFootballLeagueId: 826,
    name: "كأس السوبر السعودي",
    shortName: "السوبر",
    kind: "seasonal",
    status: "upcoming",
    visibleWeb: false,
    visibleApp: false,
    sortOrder: 30,
    season: 2026,
    features: { bracket: true, scorers: true, teams: true, news: true },
  },
  {
    slug: "afc-champions-league",
    apiFootballLeagueId: 17,
    name: "دوري أبطال آسيا للنخبة",
    shortName: "أبطال آسيا",
    kind: "seasonal",
    status: "upcoming",
    visibleWeb: false,
    visibleApp: false,
    sortOrder: 40,
    features: { bracket: true, scorers: true, teams: true, news: true },
  },
  {
    slug: "asian-cup",
    // نفس معرّف asianCupService (كان null خطأً — تناقض السجل مع الخدمة)
    apiFootballLeagueId: 7,
    name: "كأس آسيا",
    shortName: "كأس آسيا",
    kind: "seasonal",
    status: "hidden",
    visibleWeb: false,
    visibleApp: false,
    sortOrder: 50,
    season: 2027,
    features: { bracket: true, scorers: true, predictions: true, teams: true, news: true, entryPath: "/asian-cup" },
  },
  {
    slug: "gulf-cup",
    apiFootballLeagueId: 25,
    name: "كأس الخليج العربي (خليجي 27)",
    shortName: "خليجي 27",
    kind: "seasonal",
    status: "upcoming",
    visibleWeb: false,
    visibleApp: false,
    sortOrder: 60,
    season: 2026,
    features: { bracket: true, scorers: true, predictions: true, teams: true, news: true, entryPath: "/gulf-cup" },
  },
  {
    slug: "division-1",
    apiFootballLeagueId: 308,
    name: "دوري يلو لأندية الدرجة الأولى",
    shortName: "يلو",
    kind: "seasonal",
    status: "active",
    visibleWeb: false,
    visibleApp: false,
    sortOrder: 70,
    features: { standings: true, scorers: true, teams: true },
  },
  {
    slug: "club-world-cup",
    apiFootballLeagueId: 15,
    name: "كأس العالم للأندية",
    shortName: "مونديال الأندية",
    kind: "seasonal",
    status: "finished",
    visibleWeb: false,
    visibleApp: false,
    sortOrder: 80,
    features: { bracket: true, scorers: true, teams: true },
  },
];

/** آخر خطأ وصول للجدول — لتمييز «الجدول غير موجود بعد» في لوج واحد لا عاصفة. */
let tableUnavailableLoggedAt = 0;
function logTableUnavailable(err: unknown) {
  const now = Date.now();
  if (now - tableUnavailableLoggedAt > 10 * 60 * 1000) {
    tableUnavailableLoggedAt = now;
    console.warn(
      "[SportsTournaments] الجدول sports_tournaments غير متاح (هل نُفِّذ db:push؟) — أعمل من seed الذاكرة:",
      (err as Error)?.message ?? err,
    );
  }
}

let seedChecked = false;
/** يزرع الجدول عند أول استخدام إن كان فارغًا (idempotent، آمن على الإنتاج). */
async function ensureSeeded(): Promise<void> {
  if (seedChecked) return;
  const existing = await db
    .select({ id: sportsTournaments.id })
    .from(sportsTournaments)
    .limit(1);
  if (existing.length === 0) {
    await db.insert(sportsTournaments).values(SEED_TOURNAMENTS).onConflictDoNothing();
    console.log(`[SportsTournaments] زُرع سجل البطولات (${SEED_TOURNAMENTS.length} بطولة)`);
  }
  seedChecked = true;
}

/** seed الذاكرة كصفوف كاملة الشكل — fallback عندما يكون الجدول غير متاح. */
function seedAsRows(): SportsTournament[] {
  const now = new Date();
  return SEED_TOURNAMENTS.map((s, i) => ({
    id: `seed-${s.slug}`,
    slug: s.slug,
    apiFootballLeagueId: s.apiFootballLeagueId ?? null,
    name: s.name,
    shortName: s.shortName ?? null,
    logo: s.logo ?? null,
    kind: s.kind ?? "seasonal",
    status: s.status ?? "hidden",
    visibleWeb: s.visibleWeb ?? false,
    visibleApp: s.visibleApp ?? false,
    featured: s.featured ?? false,
    sortOrder: s.sortOrder ?? i * 10,
    season: s.season ?? null,
    startDate: null,
    endDate: null,
    theme: (s.theme as SportsTournament["theme"]) ?? null,
    features: (s.features as SportsTournament["features"]) ?? null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  }));
}

async function listAllRaw(): Promise<SportsTournament[]> {
  try {
    await ensureSeeded();
    return await db
      .select()
      .from(sportsTournaments)
      .orderBy(asc(sportsTournaments.sortOrder), asc(sportsTournaments.createdAt));
  } catch (err) {
    logTableUnavailable(err);
    return seedAsRows();
  }
}

/** ترتيب العرض: روشن (anchor) دائمًا أولًا، ثم الموسمية حسب sortOrder. */
function displaySort(rows: SportsTournament[]): SportsTournament[] {
  return [...rows].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "anchor" ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

export interface PublicTournament {
  slug: string;
  name: string;
  shortName: string | null;
  logo: string | null;
  kind: string;
  status: string;
  featured: boolean;
  sortOrder: number;
  season: number | null;
  startDate: string | null;
  endDate: string | null;
  theme: SportsTournament["theme"];
  features: SportsTournament["features"];
  apiFootballLeagueId: number | null;
}

function toPublic(t: SportsTournament): PublicTournament {
  return {
    slug: t.slug,
    name: t.name,
    shortName: t.shortName,
    logo: t.logo,
    kind: t.kind,
    status: t.status,
    featured: t.featured,
    sortOrder: t.sortOrder,
    season: t.season,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    endDate: t.endDate ? t.endDate.toISOString() : null,
    theme: t.theme,
    features: t.features,
    apiFootballLeagueId: t.apiFootballLeagueId,
  };
}

/**
 * البطولات المرئية لسطحٍ ما (ويب/تطبيق) — النقطة العامة الوحيدة.
 * مخفية = status:hidden أو مفتاح الظهور مطفأ لذلك السطح.
 */
export async function listVisibleTournaments(surface: TournamentSurface): Promise<PublicTournament[]> {
  return withSWR(`${CACHE_PREFIX}:pub:${surface}`, PUBLIC_TTL, PUBLIC_TTL * 2, async () => {
    const rows = await listAllRaw();
    return displaySort(rows)
      .filter((t) => t.status !== "hidden")
      .filter((t) => (surface === "web" ? t.visibleWeb : t.visibleApp))
      .map(toPublic);
  });
}

/** بطولة مفردة بالـ slug (للتحقق من الظهور في صفحات البطولة). */
export async function getTournamentBySlug(slug: string): Promise<SportsTournament | null> {
  const rows = await withSWR(`${CACHE_PREFIX}:all`, PUBLIC_TTL, PUBLIC_TTL * 2, listAllRaw);
  return rows.find((t) => t.slug === slug) ?? null;
}

// ---------- الإدارة (الداشبورد) ----------

/** كل البطولات بلا فلترة — لصفحة الإدارة (بدون كاش حتى يرى المدير أثر تعديله فورًا). */
export async function listAllTournaments(): Promise<SportsTournament[]> {
  return displaySort(await listAllRaw());
}

const EDITABLE_FIELDS = [
  "name",
  "shortName",
  "logo",
  "kind",
  "status",
  "visibleWeb",
  "visibleApp",
  "featured",
  "sortOrder",
  "season",
  "startDate",
  "endDate",
  "theme",
  "features",
] as const;

export type TournamentPatch = Partial<Pick<SportsTournament, (typeof EDITABLE_FIELDS)[number]>>;

function invalidatePublicCache() {
  swrCache.invalidateByPrefix(CACHE_PREFIX);
}

/** تحقّق وتطبيع حقول التعديل القادمة من الداشبورد — يتجاهل أي حقل غير معروف. */
export function sanitizePatch(body: Record<string, unknown>): TournamentPatch {
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    const v = body[field];
    switch (field) {
      case "kind":
        if (KINDS.includes(v as TournamentKind)) patch[field] = v;
        break;
      case "status":
        if (STATUSES.includes(v as TournamentStatus)) patch[field] = v;
        break;
      case "visibleWeb":
      case "visibleApp":
      case "featured":
        patch[field] = Boolean(v);
        break;
      case "sortOrder":
        if (Number.isFinite(Number(v))) patch[field] = Math.trunc(Number(v));
        break;
      case "season": {
        if (v == null) { patch[field] = null; break; }
        const n = Number(v);
        if (Number.isInteger(n) && n >= 2000 && n <= 2100) patch[field] = n;
        break;
      }
      case "startDate":
      case "endDate": {
        if (v == null) { patch[field] = null; break; }
        const d = new Date(String(v));
        if (Number.isFinite(d.getTime())) patch[field] = d;
        break;
      }
      case "theme":
      case "features":
        if (v == null || (typeof v === "object" && !Array.isArray(v))) patch[field] = v ?? null;
        break;
      default:
        if (typeof v === "string" && v.trim()) patch[field] = String(v).trim();
        else if (v === null && (field === "shortName" || field === "logo")) patch[field] = null;
    }
  }
  return patch as TournamentPatch;
}

/** تعديل بطولة + تسجيل التغييرات (من/إلى) في سجل التدقيق. */
export async function updateTournament(
  id: string,
  patch: TournamentPatch,
  userId: string | null,
): Promise<SportsTournament | null> {
  const [before] = await db.select().from(sportsTournaments).where(eq(sportsTournaments.id, id));
  if (!before) return null;

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(patch)) {
    const prev = (before as Record<string, unknown>)[k];
    if (JSON.stringify(prev) !== JSON.stringify(v)) changes[k] = { from: prev, to: v };
  }
  if (Object.keys(changes).length === 0) return before;

  const [updated] = await db
    .update(sportsTournaments)
    .set({ ...patch, updatedBy: userId, updatedAt: new Date() })
    .where(eq(sportsTournaments.id, id))
    .returning();

  try {
    await db.insert(sportsTournamentAudit).values({
      tournamentId: id,
      userId,
      action: "update",
      changes,
    });
  } catch (err) {
    console.error("[SportsTournaments] فشل تسجيل التدقيق:", err);
  }

  invalidatePublicCache();
  return updated ?? null;
}

/** إعادة ترتيب البطولات دفعة واحدة (سحب وإفلات في الداشبورد). */
export async function reorderTournaments(ids: string[], userId: string | null): Promise<void> {
  const rows = await db
    .select({ id: sportsTournaments.id })
    .from(sportsTournaments)
    .where(inArray(sportsTournaments.id, ids));
  const known = new Set(rows.map((r) => r.id));

  for (let i = 0; i < ids.length; i++) {
    if (!known.has(ids[i])) continue;
    await db
      .update(sportsTournaments)
      .set({ sortOrder: i * 10, updatedBy: userId, updatedAt: new Date() })
      .where(eq(sportsTournaments.id, ids[i]));
  }

  try {
    await db.insert(sportsTournamentAudit).values({
      tournamentId: ids[0],
      userId,
      action: "reorder",
      changes: { order: { from: null, to: ids } },
    });
  } catch {
    /* السجل أفضل جهد */
  }

  invalidatePublicCache();
}

export interface AuditEntry {
  id: string;
  tournamentId: string;
  tournamentName: string | null;
  userId: string | null;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

/** آخر تغييرات الإعدادات — لعرض «من غيّر ماذا ومتى» في صفحة الإدارة. */
export async function listAudit(limit = 50): Promise<AuditEntry[]> {
  try {
    const rows = await db
      .select({
        id: sportsTournamentAudit.id,
        tournamentId: sportsTournamentAudit.tournamentId,
        tournamentName: sportsTournaments.name,
        userId: sportsTournamentAudit.userId,
        action: sportsTournamentAudit.action,
        changes: sportsTournamentAudit.changes,
        createdAt: sportsTournamentAudit.createdAt,
      })
      .from(sportsTournamentAudit)
      .leftJoin(sportsTournaments, eq(sportsTournamentAudit.tournamentId, sportsTournaments.id))
      .orderBy(desc(sportsTournamentAudit.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r,
      changes: r.changes ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch (err) {
    logTableUnavailable(err);
    return [];
  }
}
