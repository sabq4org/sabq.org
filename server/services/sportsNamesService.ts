/**
 * طبقة الأسماء الرياضية الموحّدة — تعريب أي كيان رياضي مرة واحدة ثم كاش للأبد.
 *
 * تعميم نمط worldCupNameTranslator على كل أنواع الكيانات (فريق/بطولة/ملعب/
 * مدينة/مدرب/حكم/مصدر صحفي/لاعب). طبقات الحلّ بالترتيب:
 *   1) قاموس ثابت اختياري يمرّره النادي (القواميس القائمة تبقى المرجع الأول)
 *   2) كاش الذاكرة (هذه العملية)
 *   3) جدول sports_name_translations — الاعتماد التحريري (verified) يتقدّم،
 *      والصفوف pending تعود بالإنجليزية حتى يلتقطها الكرون/الملء بالخلفية
 *   4) جدول wc_player_names القديم (للاعبين فقط — قراءة تراثية)
 *   5) الـAI (gpt-4o-mini) دفعة واحدة للجديد فقط، ثم يُحفظ في (2)+(3)
 *
 * skipAi: يُرجع فورًا بالمتاح ويسجّل الناقص pending — للمسارات الحساسة للزمن
 * (لوحات مباشرة)؛ النداء الكامل بالخلفية يملأ الجدول فيظهر العربي في التحديث
 * التالي (نفس نمط مركز الانتقالات).
 *
 * كل الطبقات «أفضل جهد»: غياب OPENAI_API_KEY أو الجدول = الاسم كما هو بلا عطل.
 */
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db";
import { isEnglishSports } from "./sportsLang";
import { aiGateway } from "../ai/gateway";
import { sportsNameTranslations, wcPlayerNames } from "@shared/schema";
import { correctSportsPlayerName } from "./sportsPlayerNameFixes";

export type SportsNameType =
  | "team"
  | "league"
  | "venue"
  | "city"
  | "coach"
  | "referee"
  | "source"
  | "player";

export const SPORTS_NAME_TYPES: SportsNameType[] = [
  "team", "league", "venue", "city", "coach", "referee", "source", "player",
];

export type NameLookup = (name: string | null | undefined) => string;

// كاش ذاكرة مشترك للعملية — المفتاح `${type}:${source}`
const memory = new Map<string, string>();
// أسماء فشل الـAI فيها مؤخرًا — لا نعيد المحاولة داخل الطلبات (الكرون يعيدها)
const recentFailures = new Set<string>();

// Cooldown مفصّل لكل (نوع كيان + مزوّد)، مفصول بين القراءة والكتابة.
// سابقًا كان قيمة واحدة شاملة: خطأ واحد على city/apifootball كان يوقف كل
// الأنواع والمزوّدات (venue, team, sportmonks, ...) لكل القراءات والكتابات
// لمدة 60 ثانية، مما يسبب retry storm عند نقص الجدول أو انقطاع لحظي. الآن
// كل (type,provider) يُبردوحده، وبمدة أقصر، وتُطفأ بعضوية الجدول الناقص فقط.
const READ_COOLDOWN_MS = 15_000; // كان 60s — أقصر لتخفيف الـ retry storm
const WRITE_COOLDOWN_MS = 30_000; // الكتابة أثقل (INSERT/UPDATE) فنمنحها نافذة أطول
const readCooldownUntil = new Map<string, number>(); // key: `${type}:${provider}`
const writeCooldownUntil = new Map<string, number>();
// قيد واحد لكل مفتاح لتجنب تكرار log الرسالة نفسها خلال نافذة الـ cooldown
const readCooldownLogged = new Set<string>();

const cooldownKey = (type: SportsNameType, provider: string) => `${type}:${provider}`;

const memKey = (type: SportsNameType, source: string) => `${type}:${source}`;

// بوابة AI Hub تتكفّل بالfailover (OpenAI ← Anthropic) — يكفي أي مفتاح منهما
const hasAiConfigured = () =>
  Boolean((process.env.OPENAI_API_KEY || "").trim() || (process.env.ANTHROPIC_API_KEY || "").trim());

function isLatin(name: string): boolean {
  return /[A-Za-z]/.test(name);
}

// حارس الخلط اللغوي: «جابرييل كارvalho» أسوأ من الاسم اللاتيني كاملًا — نرفضه.
const MIXED_SCRIPT_TOKEN = /[؀-ۿ][^\s]*[A-Za-z]|[A-Za-z][^\s]*[؀-ۿ]/;
const HAS_ARABIC = /[؀-ۿ]/;

// تصحيحات تعريب منهجية لأسماء عربية الأصل يشوّهها التقليب اللاتيني↔العربي (مثال:
// "Marwan" من فيد لاتيني يُترجَم أحيانًا "ماروان" بألفٍ زائدة). تُطبَّق على المخرَج
// النهائي، فتُصحّح حتى القيم المخزّنة سابقًا عند القراءة (بلا إعادة ترجمة). أضِف
// فقط ما لا لبس فيه — بديلًا خاطئًا لا يصحّ اسمًا أبدًا. المطابقة بالكلمة الكاملة.
const SYSTEMATIC_AR_FIXES: Record<string, string> = {
  "ماروان": "مروان",
};

function applyArabicFixes(value: string): string {
  if (!value || !HAS_ARABIC.test(value)) return value;
  return value
    .split(/(\s+)/)
    .map((tok) => SYSTEMATIC_AR_FIXES[tok] ?? tok)
    .join("");
}

function isAcceptableArabic(candidate: string, source: string): boolean {
  const c = candidate.trim();
  if (!c || c.length > 120) return false;
  if (!HAS_ARABIC.test(c)) return false;
  if (MIXED_SCRIPT_TOKEN.test(c)) return false;
  if (c === source.trim()) return false;
  return true;
}

// توجيه الـAI حسب نوع الكيان — صيغ التغطية الرياضية العربية المتعارف عليها.
const TYPE_HINT: Record<SportsNameType, string> = {
  team: "أندية ومنتخبات كرة قدم (مثل: Al-Nassr → النصر، Real Madrid → ريال مدريد، Bayer Leverkusen → باير ليفركوزن)",
  league:
    "بطولات ودوريات كرة قدم — استخدم الصيغ الإعلامية العربية الشائعة، وإن ورد اسم الدولة بين قوسين فادمجه في التسمية " +
    "(مثل: Premier League (England) → الدوري الإنجليزي الممتاز، Premier League (Russia) → الدوري الروسي الممتاز، Serie A (Brazil) → الدوري البرازيلي)",
  venue: "ملاعب واستادات كرة قدم (مثل: King Abdullah Sports City → مدينة الملك عبدالله الرياضية، Old Trafford → أولد ترافورد)",
  city: "مدن (مثل: Riyadh → الرياض، Manchester → مانشستر)",
  coach: "مدربو كرة قدم (انقل النطق: Jorge Jesus → جورجي جيزوس)",
  referee: "حكّام كرة قدم (انقل النطق بالصيغة الصحفية)",
  source: "صحفيون ووسائل إعلام رياضية (مثل: Fabrizio Romano → فابريتسيو رومانو، Sky Sports → سكاي سبورتس، The Athletic → ذا أثلتيك)",
  player:
    "لاعبو كرة قدم (مثل: Mbappé → كيليان مبابي، Di María → أنخيل دي ماريا). " +
    "التزم بنطق اللقب اللاتيني ولا تستبدل لقبًا بآخر أشهر — خصوصًا الأسماء السعودية المتشابهة " +
    "(Al-Dwehe/Al-Dhuwayhi → عبدالعزيز الضويحي، ليس عبدالعزيز البيشي)",
};

export interface SportsNameItem {
  /** معرّف المزوّد إن توفّر — يُخزَّن للوحة والتتبّع، والمفتاح الفعلي هو الاسم */
  id?: number | string | null;
  name: string | null | undefined;
}

export interface ResolveOpts {
  skipAi?: boolean;
  provider?: string; // apifootball (افتراضي) | sportmonks | thesports
  /** قاموس ثابت بالاسم يمرّره النادي (مثل WC_PLAYER_AR) — الطبقة الأولى */
  staticDict?: Record<string, string>;
  /** قراءة تراثية من wc_player_names (للاعبين فقط) */
  legacyPlayerTable?: boolean;
}

/**
 * يضمن تعريب كل الأسماء المطلوبة (بالمتاح فورًا أو بالـAI) ويرجّع دالة بحث
 * متزامنة. الأسماء غير المحلولة تعود كما هي.
 */
export async function resolveSportsNames(
  type: SportsNameType,
  items: SportsNameItem[],
  opts?: ResolveOpts,
): Promise<NameLookup> {
  // الوضع الإنجليزي: لا تعريب — أعِد اسم المزوّد الأصلي كما هو.
  if (isEnglishSports()) return (name) => (name ?? "").toString();
  const provider = opts?.provider ?? "apifootball";
  // اسم → معرّف مزوّد (أول ظهور) لتخزينه مع الصف الجديد
  const idBySource = new Map<string, string>();
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const name = (item?.name ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
    if (item.id != null && !idBySource.has(name)) idBySource.set(name, String(item.id));
  }

  // (1) القاموس الثابت + الأسماء العربية أصلًا → الذاكرة
  const unresolved: string[] = [];
  for (const name of names) {
    if (memory.has(memKey(type, name))) continue;
    const fromDict = opts?.staticDict?.[name];
    if (fromDict) {
      memory.set(memKey(type, name), fromDict);
      continue;
    }
    if (!isLatin(name)) {
      memory.set(memKey(type, name), name);
      continue;
    }
    unresolved.push(name);
  }

  // (3) جدول الأسماء الموحّد
  let still = unresolved;
  if (still.length > 0) {
    const now = Date.now();
    const ck = cooldownKey(type, provider);
    const cooldownEnd = readCooldownUntil.get(ck) ?? 0;
    if (now < cooldownEnd) {
      if (!readCooldownLogged.has(ck)) {
        console.warn(`[SportsNames] DB read temporarily skipped (${type}/${provider}) — cooling down until ${new Date(cooldownEnd).toISOString()}`);
        readCooldownLogged.add(ck);
      }
    } else try {
      readCooldownLogged.delete(ck);
      const rows = await db
        .select({
          source: sportsNameTranslations.source,
          arabic: sportsNameTranslations.arabic,
          status: sportsNameTranslations.status,
        })
        .from(sportsNameTranslations)
        .where(
          and(
            eq(sportsNameTranslations.entityType, type),
            eq(sportsNameTranslations.provider, provider),
            inArray(sportsNameTranslations.source, still),
          ),
        );
      const found: string[] = [];
      for (const row of rows) {
        found.push(row.source);
        // pending = لم يُترجم بعد؛ لا يدخل الذاكرة كي تلتقطه محاولة لاحقة
        if (row.status !== "pending" && isAcceptableArabic(row.arabic, row.source)) {
          memory.set(memKey(type, row.source), row.arabic);
        }
      }
      // عدّاد الظهور — يرتّب طابور المراجعة التحريرية بالأهمية (مرة لكل عملية)
      if (found.length > 0) {
        void db
          .update(sportsNameTranslations)
          .set({ hits: sql`${sportsNameTranslations.hits} + 1` })
          .where(
            and(
              eq(sportsNameTranslations.entityType, type),
              eq(sportsNameTranslations.provider, provider),
              inArray(sportsNameTranslations.source, found),
            ),
          )
          .catch(() => {});
      }
      still = still.filter((n) => !memory.has(memKey(type, n)));
      // الموجود pending لا يُعاد إدراجه ولا يُرسَل للـAI داخل الطلب — الكرون يتكفّل
      if (opts?.skipAi) {
        const foundSet = new Set(found);
        still = still.filter((n) => !foundSet.has(n));
      }
    } catch (error) {
      // cooldown مفصّل لكل (type,provider) بدلglobal شامل؛ مدة أقصر لتخفيف
      // retry storm. رسالة الخطأ تُختصر لتجنب طبع كامل الـ SQL في كل دورة.
      readCooldownUntil.set(ck, Date.now() + READ_COOLDOWN_MS);
      const errMsg = (error as Error)?.message ?? String(error);
      const brief = errMsg.includes("relation")
        ? errMsg.split("\n")[0].slice(0, 140)
        : errMsg.slice(0, 140);
      console.warn(`[SportsNames] DB read skipped (${type}/${provider}) — cooling down ${READ_COOLDOWN_MS}ms:`, brief);
    }
  }

  // (4) القراءة التراثية من wc_player_names (لاعبون فقط)
  if (still.length > 0 && opts?.legacyPlayerTable && type === "player") {
    try {
      const rows = await db
        .select({ source: wcPlayerNames.source, arabic: wcPlayerNames.arabic })
        .from(wcPlayerNames)
        .where(inArray(wcPlayerNames.source, still));
      for (const row of rows) memory.set(memKey(type, row.source), row.arabic);
      still = still.filter((n) => !memory.has(memKey(type, n)));
    } catch (error) {
      console.warn("[SportsNames] legacy read skipped:", (error as Error)?.message);
    }
  }

  still = still.filter((n) => !recentFailures.has(memKey(type, n)));

  if (still.length > 0) {
    if (opts?.skipAi || !hasAiConfigured()) {
      // نسجّل الناقص pending كي يلتقطه الملء بالخلفية أو الكرون الليلي
      await persistRows(
        type,
        provider,
        still.map((source) => ({ source, arabic: source, status: "pending" as const })),
        idBySource,
      );
    } else {
      // (5) الـAI دفعة واحدة — ثم الحفظ الدائم
      try {
        const translated = await aiArabize(type, still);
        const ok: { source: string; arabic: string; status: "auto" }[] = [];
        const bad: string[] = [];
        for (const source of still) {
          const ar = (translated[source] ?? "").trim();
          if (ar && isAcceptableArabic(ar, source)) {
            memory.set(memKey(type, source), ar);
            ok.push({ source, arabic: ar, status: "auto" });
          } else {
            bad.push(source);
            recentFailures.add(memKey(type, source));
          }
        }
        await persistRows(type, provider, ok, idBySource);
        if (bad.length > 0) {
          await persistRows(
            type,
            provider,
            bad.map((source) => ({ source, arabic: source, status: "pending" as const })),
            idBySource,
          );
        }
      } catch (error) {
        console.warn("[SportsNames] AI batch failed:", (error as Error)?.message);
        for (const n of still) recentFailures.add(memKey(type, n));
        await persistRows(
          type,
          provider,
          still.map((source) => ({ source, arabic: source, status: "pending" as const })),
          idBySource,
        );
      }
    }
  }

  return (name: string | null | undefined): string => {
    if (!name) return "";
    const trimmed = name.trim();
    const resolved = applyArabicFixes(memory.get(memKey(type, trimmed)) ?? trimmed);
    return type === "player" ? correctSportsPlayerName(trimmed, resolved) : resolved;
  };
}

/** حفظ دفعة صفوف: الجديد يُدرَج، وpending القائم يترقّى إلى auto عند نجاح الترجمة. */
async function persistRows(
  type: SportsNameType,
  provider: string,
  rows: { source: string; arabic: string; status: "auto" | "pending" }[],
  idBySource: Map<string, string>,
): Promise<void> {
  if (rows.length === 0) return;
  const ck = cooldownKey(type, provider);
  if (Date.now() < (writeCooldownUntil.get(ck) ?? 0)) return;
  try {
    await db
      .insert(sportsNameTranslations)
      .values(
        rows.map((row) => ({
          entityType: type,
          provider,
          providerId: idBySource.get(row.source) ?? null,
          source: row.source,
          arabic: row.arabic,
          status: row.status,
          origin: "ai",
        })),
      )
      .onConflictDoNothing();
    // ترقية الصفوف المعلّقة المسجّلة سابقًا — verified/auto القائمة لا تُمسّ
    for (const row of rows) {
      if (row.status !== "auto") continue;
      await db
        .update(sportsNameTranslations)
        .set({ arabic: row.arabic, status: "auto", updatedAt: sql`now()` })
        .where(
          and(
            eq(sportsNameTranslations.entityType, type),
            eq(sportsNameTranslations.provider, provider),
            eq(sportsNameTranslations.source, row.source),
            eq(sportsNameTranslations.status, "pending"),
          ),
        );
    }
  } catch (error) {
    // write-cooldown مفصول عن read-cooldown (سابقًا كانا نفس القيمة الشاملة).
    writeCooldownUntil.set(ck, Date.now() + WRITE_COOLDOWN_MS);
    const errMsg = (error as Error)?.message ?? String(error);
    const brief = errMsg.split("\n")[0].slice(0, 140);
    console.warn(`[SportsNames] persist skipped (${type}/${provider}):`, brief);
  }
}

async function aiArabize(type: SportsNameType, names: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // دفعات 80 اسمًا — ضمن حدود maxTokens وبلا مهلات طويلة. عبر بوابة AI Hub
  // (failover + تتبّع تكلفة)؛ ميزة sports-names أساسها gpt-4o-mini.
  for (let i = 0; i < names.length; i += 80) {
    const batch = names.slice(i, i + 80);
    const res = await aiGateway.complete({
      feature: "sports-names",
      messages: [
        {
          role: "system",
          content:
            `أنت خبير تعريب أسماء في التغطية الرياضية العربية. ستصلك قائمة أسماء باللاتينية من فئة: ${TYPE_HINT[type]}. ` +
            "عرّب كل اسم إلى الصيغة الشائعة في الصحافة الرياضية العربية — انقل النطق أو الصيغة المتعارف عليها ولا تترجم معنى الاسم. " +
            "مهمّ جدًّا: إن ورد الاسم مختصرًا بحرفٍ أوّل ونقطة (مثل \"M. Salah\" أو \"H. Hassan\") فأبقِ الاختصار كما هو " +
            "(\"م. صلاح\"، \"هـ. حسن\") ولا تخترع اسمًا أوّل كاملًا مطلقًا — تخمين الاسم الأول يُنسب الحدث للاعبٍ خطأ. " +
            'أعد JSON فقط بالشكل: {"names":[{"src":"<الاسم كما ورد>","ar":"<العربي>"}]}',
        },
        { role: "user", content: JSON.stringify(batch) },
      ],
      options: {
        jsonMode: true,
        temperature: 0.2,
        maxTokens: Math.min(4000, 80 + batch.length * 40),
      },
    });
    if (!res.content) continue;
    const parsed = JSON.parse(res.content) as { names?: { src?: string; ar?: string }[] };
    // مطابقة بالمفتاح الحرفي ثم بالمسافات المطبَّعة — أسماء المزوّد قد تحمل
    // مسافات مزدوجة/تابات فيعيدها الـAI منظّفةً ولا تنطبق حرفيًا
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    const byNormalized = new Map(batch.map((n) => [normalize(n), n]));
    for (const item of parsed.names ?? []) {
      if (!item.src || !item.ar) continue;
      const original = batch.includes(item.src) ? item.src : byNormalized.get(normalize(item.src));
      if (original) out[original] = item.ar;
    }
  }
  return out;
}

// ---------- واجهة لوحة الاعتماد التحريري ----------

export interface ListNamesParams {
  type?: string;
  status?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export async function listSportsNames(params: ListNamesParams) {
  const conds = [];
  if (params.type && SPORTS_NAME_TYPES.includes(params.type as SportsNameType)) {
    conds.push(eq(sportsNameTranslations.entityType, params.type));
  }
  if (params.status && ["pending", "auto", "verified"].includes(params.status)) {
    conds.push(eq(sportsNameTranslations.status, params.status));
  }
  if (params.q?.trim()) {
    const q = `%${params.q.trim()}%`;
    conds.push(or(ilike(sportsNameTranslations.source, q), ilike(sportsNameTranslations.arabic, q)));
  }
  const where = conds.length > 0 ? and(...conds) : undefined;
  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(sportsNameTranslations)
      .where(where)
      .orderBy(desc(sportsNameTranslations.hits), desc(sportsNameTranslations.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ total: count() }).from(sportsNameTranslations).where(where),
  ]);
  return { rows, total: totalRow[0]?.total ?? 0 };
}

/** تعديل/اعتماد صف — يحدّث ذاكرة العملية فورًا فيسري على الطلبات الجديدة. */
export async function updateSportsName(
  id: number,
  patch: { arabic?: string; status?: "auto" | "verified" | "pending" },
) {
  const set: Record<string, unknown> = { updatedAt: sql`now()` };
  if (patch.arabic != null) {
    set.arabic = patch.arabic.trim();
    set.origin = "manual";
    // تعديل النص التحريري = اعتماد ضمني ما لم يُحدَّد غيره
    set.status = patch.status ?? "verified";
  } else if (patch.status) {
    set.status = patch.status;
  }
  const [row] = await db
    .update(sportsNameTranslations)
    .set(set)
    .where(eq(sportsNameTranslations.id, id))
    .returning();
  if (row) {
    const key = memKey(row.entityType as SportsNameType, row.source);
    if (row.status === "pending") memory.delete(key);
    else memory.set(key, row.arabic);
    recentFailures.delete(key);
  }
  return row ?? null;
}

/** حذف صف خاطئ — يُزال من الذاكرة فيُعاد حلّه (AI/يدوي) عند أول ظهور تالٍ. */
export async function deleteSportsName(id: number) {
  const [row] = await db
    .delete(sportsNameTranslations)
    .where(eq(sportsNameTranslations.id, id))
    .returning();
  if (row) {
    const key = memKey(row.entityType as SportsNameType, row.source);
    memory.delete(key);
    recentFailures.delete(key);
  }
  return row ?? null;
}

/** إحصاءات التغطية للوحة: عدّ لكل (نوع، حالة). */
export async function sportsNamesStats() {
  const rows = await db
    .select({
      entityType: sportsNameTranslations.entityType,
      status: sportsNameTranslations.status,
      total: count(),
    })
    .from(sportsNameTranslations)
    .groupBy(sportsNameTranslations.entityType, sportsNameTranslations.status);
  return rows;
}

/**
 * معالجة الصفوف المعلّقة (pending) بالـAI — يستدعيها الكرون الليلي والملء
 * بالخلفية. ترجع عدد ما تُرجم. آمنة للتكرار — الفاشل يبقى pending للدورة التالية.
 */
export async function processPendingSportsNames(limit = 300): Promise<{ translated: number; remaining: number }> {
  if (!hasAiConfigured()) return { translated: 0, remaining: 0 };
  const pending = await db
    .select()
    .from(sportsNameTranslations)
    .where(eq(sportsNameTranslations.status, "pending"))
    .orderBy(desc(sportsNameTranslations.hits), desc(sportsNameTranslations.id))
    .limit(limit);
  if (pending.length === 0) return { translated: 0, remaining: 0 };

  let translated = 0;
  // نجمع حسب النوع كي يحصل كل نوع على توجيهه الصحيح
  const byType = new Map<string, typeof pending>();
  for (const row of pending) {
    const list = byType.get(row.entityType) ?? [];
    list.push(row);
    byType.set(row.entityType, list);
  }
  for (const [type, rows] of byType) {
    try {
      const result = await aiArabize(type as SportsNameType, rows.map((r) => r.source));
      for (const row of rows) {
        const ar = (result[row.source] ?? "").trim();
        if (!ar || !isAcceptableArabic(ar, row.source)) continue;
        await db
          .update(sportsNameTranslations)
          .set({ arabic: ar, status: "auto", origin: "ai", updatedAt: sql`now()` })
          .where(and(eq(sportsNameTranslations.id, row.id), eq(sportsNameTranslations.status, "pending")));
        memory.set(memKey(row.entityType as SportsNameType, row.source), ar);
        recentFailures.delete(memKey(row.entityType as SportsNameType, row.source));
        translated += 1;
      }
    } catch (error) {
      console.warn(`[SportsNames] pending batch (${type}) failed:`, (error as Error)?.message);
    }
  }
  const [remainingRow] = await db
    .select({ total: count() })
    .from(sportsNameTranslations)
    .where(eq(sportsNameTranslations.status, "pending"));
  return { translated, remaining: remainingRow?.total ?? 0 };
}
