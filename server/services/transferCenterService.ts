/**
 * مركز الانتقالات المتكامل — الطبقة الخدمية.
 *
 * مصدران يكمل أحدهما الآخر ولا يحلّ محلّه:
 *   1) API-Football (عبر saudiLeagueService): الصفقات المؤكّدة لدوري روشن —
 *      الموجود في /api/sports/transfers يبقى كما هو، وهذه الخدمة تقرأه فقط
 *      لتركيب «نبض السوق» والإحصائيات.
 *   2) SportMonks Transfer Rumours (إضافة مفعّلة بالاشتراك): الإشاعات بدرجة
 *      احتمال (LOW/MEDIUM/HIGH/IMMINENT) ومصدر مُلزَم (رومانو/الغارديان/…)
 *      ومبلغ متداول، + فيد /transfers للمؤكّد العالمي.
 *
 * فخاخ SportMonks المُثبَتة بالفحص (2026-07-04):
 *   - بارامتر filters= يُتجاهَل صامتًا → كل الفلترة (سعودي/عالمي، النوع) هنا
 *     في الكود، أو عبر مسار الفريق /transfer-rumours/teams/{id}.
 *   - التغطية السعودية في الفيد العام نحيفة (~12 من آخر 500) → نجمع القسم
 *     السعودي بمسارات فرق روشن الـ18 مباشرة، لا نعتمد على الفيد العام.
 *   - status_id (90319-90323) دلالته مجهولة (لا يُفكّ عبر core/types) → نتجاهله.
 *
 * كل شيء «أفضل جهد»: غياب أي مفتاح يرجّع { configured:false } بلا عطل.
 */
import { withSWR } from "../memoryCache";
import { resolveNames } from "./worldCupNameTranslator";
import { apiFootballGet } from "./apiFootballClient";
import { getLeagueTransfers } from "./saudiLeagueService";

const SM_BASE = "https://api.sportmonks.com/v3/football";

/** دوري روشن عند SportMonks (اسمه هناك «Pro League») */
export const SM_SAUDI_LEAGUE_ID = 944;

// إيقاعات الكاش حسب طبيعة البيانات: الإشاعات تتحرك بالساعات، المؤكّد أبطأ.
const RUMOURS_TTL = 30 * 60 * 1000; // إشاعات: 30 دقيقة
const CONFIRMED_TTL = 60 * 60 * 1000; // مؤكّد عالمي: ساعة
const TEAMS_TTL = 12 * 60 * 60 * 1000; // قائمة فرق روشن عند SportMonks: نصف يوم
const PL_SPEND_TTL = 12 * 60 * 60 * 1000; // إنفاق البريميرليغ (مقارنة الميركاتو)

// ---------- نوافذ الانتقالات (ثوابت قابلة للتحرير كل موسم) ----------
// صيف 2026: روشن 22 يوليو → 12 أكتوبر (نافذة ممدّدة بعد المونديال)،
// أوروبا فتحت 15 يونيو وتقفل مطلع سبتمبر. حدّثها مع كل نافذة جديدة.
export interface TransferWindow {
  label: string;
  opensAt: string; // ISO UTC
  closesAt: string; // ISO UTC
}
export const TRANSFER_WINDOWS: { saudi: TransferWindow; europe: TransferWindow } = {
  saudi: { label: "نافذة روشن الصيفية", opensAt: "2026-07-22T00:00:00Z", closesAt: "2026-10-12T20:59:00Z" },
  europe: { label: "النافذة الأوروبية الصيفية", opensAt: "2026-06-15T00:00:00Z", closesAt: "2026-09-01T22:00:00Z" },
};
/** بداية «هذا الميركاتو» لأغراض جمع الإنفاق — مطلع يونيو يغطي الصفقات المبكرة. */
const MERCATO_START = "2026-06-01";

// ---------- تعريب الدوريات (معرّفات SportMonks) ----------
const LEAGUE_AR: Record<number, string> = {
  8: "الدوري الإنجليزي الممتاز",
  9: "تشامبيونشيب",
  12: "ليغ وان الإنجليزي",
  82: "الدوري الألماني",
  301: "الدوري الفرنسي",
  384: "الدوري الإيطالي",
  462: "الدوري البرتغالي",
  501: "الدوري الاسكتلندي",
  564: "الدوري الإسباني",
  600: "الدوري التركي",
  944: "دوري روشن السعودي",
};
/** الخمسة الكبار — تُستخدم كرقائق فلترة في تبويب «عالمية» */
export const BIG_FIVE_LEAGUES = [
  { id: 8, name: "البريميرليغ" },
  { id: 564, name: "لا ليغا" },
  { id: 384, name: "سيري آ" },
  { id: 82, name: "البوندسليغا" },
  { id: 301, name: "ليغ 1" },
];

// ---------- تعريب المراكز (position_id عند SportMonks) ----------
const POSITION_AR: Record<number, string> = {
  24: "حارس مرمى",
  25: "مدافع",
  26: "لاعب وسط",
  27: "مهاجم",
};

// ---------- تعريب الأندية (جدول قابل للتوسعة، fallback للاسم الإنجليزي) ----------
// أسماء SportMonks الإنجليزية كما ترد حرفيًّا → عربي سبق. الأندية غير المدرجة
// تُعرض بالإنجليزية بدل تعريب آلي خاطئ (قرار مُثبَت من بطاقة لاعب المونديال).
const CLUB_AR: Record<string, string> = {
  // — روشن (أسماء SportMonks لموسم 2025/2026) —
  "Al Hilal": "الهلال",
  "Al Nassr": "النصر",
  "Al Ahli": "الأهلي",
  "Al Ittihad": "الاتحاد",
  "Al Shabab": "الشباب",
  "Al Ettifaq": "الاتفاق",
  "Al Taawoun": "التعاون",
  "Al Fateh": "الفتح",
  "Al Khaleej": "الخليج",
  "Al-Fayha": "الفيحاء",
  "Al Riyadh": "الرياض",
  "Al Hazm": "الحزم",
  "Al Okhdoud": "الأخدود",
  "Al-Qadsiah": "القادسية",
  "Al Kholood": "الخلود",
  "Al Najma": "النجمة",
  "Damac FC": "ضمك",
  "NEOM SC": "نيوم",
  // — إنجلترا —
  "Liverpool": "ليفربول",
  "Manchester City": "مانشستر سيتي",
  "Manchester United": "مانشستر يونايتد",
  "Arsenal": "آرسنال",
  "Chelsea": "تشيلسي",
  "Tottenham Hotspur": "توتنهام",
  "Newcastle United": "نيوكاسل يونايتد",
  "Aston Villa": "أستون فيلا",
  "West Ham United": "وست هام",
  "Brighton & Hove Albion": "برايتون",
  "Nottingham Forest": "نوتينغهام فورست",
  "Everton": "إيفرتون",
  "Crystal Palace": "كريستال بالاس",
  "Fulham": "فولهام",
  "Brentford": "برينتفورد",
  "Wolverhampton Wanderers": "وولفرهامبتون",
  "Bournemouth": "بورنموث",
  "AFC Bournemouth": "بورنموث",
  "Leeds United": "ليدز يونايتد",
  "Leicester City": "ليستر سيتي",
  "Sunderland": "سندرلاند",
  "Burnley": "بيرنلي",
  "Hull City": "هال سيتي",
  "Coventry City": "كوفنتري سيتي",
  "West Bromwich Albion": "وست بروميتش",
  "Sheffield United": "شيفيلد يونايتد",
  "Ipswich Town": "إيبسويتش تاون",
  "Southampton": "ساوثهامبتون",
  // — إسبانيا —
  "Real Madrid": "ريال مدريد",
  "FC Barcelona": "برشلونة",
  "Barcelona": "برشلونة",
  "Atlético de Madrid": "أتلتيكو مدريد",
  "Atletico Madrid": "أتلتيكو مدريد",
  "Athletic Club": "أتلتيك بلباو",
  "Real Sociedad": "ريال سوسيداد",
  "Real Betis": "ريال بيتيس",
  "Sevilla": "إشبيلية",
  "Villarreal": "فياريال",
  "Valencia": "فالنسيا",
  "Girona": "جيرونا",
  "Osasuna": "أوساسونا",
  "CA Osasuna": "أوساسونا",
  "Celta de Vigo": "سلتا فيغو",
  "Mallorca": "مايوركا",
  "RCD Mallorca": "مايوركا",
  "Rayo Vallecano": "رايو فاييكانو",
  "Getafe": "خيتافي",
  "Espanyol": "إسبانيول",
  "Deportivo Alavés": "ألافيس",
  "Alavés": "ألافيس",
  "Levante": "ليفانتي",
  "Real Oviedo": "ريال أوفييدو",
  "Elche": "إلتشي",
  // — إيطاليا —
  "Juventus": "يوفنتوس",
  "Inter": "إنتر ميلان",
  "Internazionale": "إنتر ميلان",
  "AC Milan": "ميلان",
  "Milan": "ميلان",
  "Napoli": "نابولي",
  "AS Roma": "روما",
  "Roma": "روما",
  "Lazio": "لاتسيو",
  "Atalanta": "أتالانتا",
  "Fiorentina": "فيورنتينا",
  "Bologna": "بولونيا",
  "Como": "كومو",
  // — ألمانيا —
  "Bayern München": "بايرن ميونخ",
  "FC Bayern München": "بايرن ميونخ",
  "Bayern Munich": "بايرن ميونخ",
  "Borussia Dortmund": "بوروسيا دورتموند",
  "Bayer Leverkusen": "باير ليفركوزن",
  "Bayer 04 Leverkusen": "باير ليفركوزن",
  "RB Leipzig": "لايبزيغ",
  "Eintracht Frankfurt": "آينتراخت فرانكفورت",
  "VfB Stuttgart": "شتوتغارت",
  "VfL Wolfsburg": "فولفسبورغ",
  "Borussia Mönchengladbach": "بوروسيا مونشنغلادباخ",
  "SC Freiburg": "فرايبورغ",
  "TSG Hoffenheim": "هوفنهايم",
  "Werder Bremen": "فيردر بريمن",
  "Hamburger SV": "هامبورغ",
  "1. FC Köln": "كولن",
  "Hertha BSC": "هيرتا برلين",
  "Union Berlin": "يونيون برلين",
  "1. FC Union Berlin": "يونيون برلين",
  "Mainz 05": "ماينتس",
  "1. FSV Mainz 05": "ماينتس",
  "FC Augsburg": "أوغسبورغ",
  // — فرنسا —
  "Paris Saint-Germain": "باريس سان جيرمان",
  "Paris Saint Germain": "باريس سان جيرمان",
  "Olympique Marseille": "مارسيليا",
  "Marseille": "مارسيليا",
  "Olympique Lyonnais": "ليون",
  "Lyon": "ليون",
  "AS Monaco": "موناكو",
  "Monaco": "موناكو",
  "LOSC Lille": "ليل",
  "Lille": "ليل",
  "OGC Nice": "نيس",
  // — البرتغال وهولندا وتركيا —
  "Benfica": "بنفيكا",
  "FC Porto": "بورتو",
  "Porto": "بورتو",
  "Sporting CP": "سبورتينغ لشبونة",
  "Ajax": "أياكس",
  "PSV": "آيندهوفن",
  "PSV Eindhoven": "آيندهوفن",
  "Feyenoord": "فينورد",
  "Galatasaray": "غلطة سراي",
  "Fenerbahçe": "فنربخشة",
  "Fenerbahce": "فنربخشة",
  "Besiktas": "بشكتاش",
  "Beşiktaş": "بشكتاش",
  // — فرنسا (تكملة) وإيطاليا (تكملة) وأخرى —
  "Stade Rennais": "رين",
  "Rennes": "رين",
  "RC Lens": "لانس",
  "Lens": "لانس",
  "Nantes": "نانت",
  "FC Nantes": "نانت",
  "Strasbourg": "ستراسبورغ",
  "RC Strasbourg Alsace": "ستراسبورغ",
  "Brest": "بريست",
  "Stade Brestois 29": "بريست",
  "Torino": "تورينو",
  "Genoa": "جنوى",
  "Udinese": "أودينيزي",
  "Cagliari": "كالياري",
  "Hellas Verona": "هيلاس فيرونا",
  "Parma": "بارما",
  "Lecce": "ليتشي",
  "Sassuolo": "ساسولو",
  "Saint-Étienne": "سانت إتيان",
  "AS Saint-Étienne": "سانت إتيان",
  "FC København": "كوبنهاغن",
  "Olympiacos F.C.": "أولمبياكوس",
  "Olympiacos": "أولمبياكوس",
  "Celtic": "سلتيك",
  "Rangers": "رينجرز",
  "Grêmio": "غريميو",
  "New York City": "نيويورك سيتي",
  "Inter Miami CF": "إنتر ميامي",
  "Al Ahly": "الأهلي المصري",
  "Zamalek": "الزمالك",
  "Al Sadd": "السد",
  "Al-Duhail": "الدحيل",
  "Al Duhail": "الدحيل",
  "Al Ain": "العين",
  "Anderlecht": "أندرلخت",
  "Deportivo La Coruña": "ديبورتيفو لاكورونيا",
  "Free Agents": "بدون نادٍ",
  "Free agent": "بدون نادٍ",
};

function arClubName(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  return CLUB_AR[s] ?? s;
}

// ---------- مؤشر موثوقية المصدر ----------
// رومانو ≠ صحيفة إثارة: تصنيف تحريري ثابت قابل للتوسعة. الافتراضي «متوسطة»
// حتى لا نتّهم مصدرًا لا نعرفه ولا نمنحه ثقة لا يستحقها.
const SOURCE_HIGH = [
  "fabrizio romano", "david ornstein", "the athletic", "the guardian", "bbc",
  "sky sports", "sky sport", "l'équipe", "l'equipe", "lequipe", "marca",
  "mundo deportivo", "gazzetta dello sport", "kicker", "rmc sport", "espn",
  "the times", "relevo", "di marzio",
];
const SOURCE_LOW = [
  "the sun", "daily star", "mirror", "express", "footyinsider", "fichajes",
  "todofichajes", "el nacional", "sport bild", "caughtoffside", "teamtalk",
  "football insider", "tribal football", "fotomac", "takvim", "asensi",
];
export type SourceTier = "high" | "medium" | "low";
function sourceTier(name: string | null | undefined): SourceTier {
  const s = (name ?? "").trim().toLowerCase();
  if (!s) return "low";
  if (SOURCE_HIGH.some((k) => s.includes(k))) return "high";
  if (SOURCE_LOW.some((k) => s.includes(k))) return "low";
  return "medium";
}

// ---------- أنواع DTO المُعرَّبة ----------
export type TcProbability = "LOW" | "MEDIUM" | "HIGH" | "IMMINENT";
export type TcRumourKind = "transfer" | "loan" | "extension";

export interface TcParty {
  id: number;
  name: string;
  image: string | null;
  leagueId: number | null;
  leagueName: string | null;
  saudi: boolean;
}

export interface TcPlayer {
  id: number; // معرّف SportMonks (لا يُربط بصفحات /sports/player — فضاء معرّفات مختلف)
  name: string;
  image: string | null;
  position: string | null;
  birthdate: string | null;
}

export interface TcRumour {
  id: number;
  date: string; // ISO yyyy-mm-dd
  probability: TcProbability;
  kind: TcRumourKind;
  amount: number | null;
  currency: string | null;
  source: { name: string; url: string | null; tier: SourceTier };
  /** صفقة وشيكة: IMMINENT، أو HIGH من رومانو — تستحق تصميم «Here we go!» */
  hereWeGo: boolean;
  player: TcPlayer;
  from: TcParty;
  to: TcParty;
  saudi: boolean;
}

export interface TcConfirmed {
  id: number;
  date: string;
  kind: "transfer" | "loan" | "free";
  amount: number | null;
  currency: string | null;
  player: TcPlayer;
  from: TcParty;
  to: TcParty;
  saudi: boolean;
  /** نادٍ معروف (في قاموس التعريب) أو مبلغ معلن — لتصفية ضجيج الدوريات الصغرى */
  major: boolean;
}

// ---------- نداء SportMonks خام ----------
function smToken(): string {
  return (process.env.SPORTMONKS_API_TOKEN || "").trim();
}
export function isTransferRumoursConfigured(): boolean {
  return Boolean(smToken());
}

async function smGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const token = smToken();
  if (!token) throw new Error("SPORTMONKS_API_TOKEN is not set");
  const url = new URL(`${SM_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_token", token);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`[TransferCenter] SportMonks HTTP ${response.status} for ${url.pathname}`);
  return response.json();
}

// ---------- فرق روشن عند SportMonks ----------
// نجلبها ديناميكيًّا من مواسم الدوري 944 (الموسم الحالي قد يكون فارغًا قبل
// اكتمال الربط، فنرجع للموسم الأسبق)، مع قائمة ثابتة كضمانة أخيرة.
const ROSHN_SM_FALLBACK: [number, string][] = [
  [7011, "Al Hilal"], [2506, "Al Nassr"], [9908, "Al Ahli"], [476, "Al Ittihad"],
  [16184, "Al Shabab"], [10010, "Al Ettifaq"], [2392, "Al Taawoun"], [5891, "Al Fateh"],
  [12216, "Al Khaleej"], [17724, "Al-Fayha"], [17705, "Al Riyadh"], [17694, "Al Hazm"],
  [232738, "Al Okhdoud"], [13092, "Al-Qadsiah"], [232744, "Al Kholood"], [12312, "Al Najma"],
  [17712, "Damac FC"], [17730, "NEOM SC"],
];

interface RoshnSmTeams {
  ids: number[];
  byId: Map<number, string>;
}

async function getRoshnSmTeams(): Promise<RoshnSmTeams> {
  const fallback: RoshnSmTeams = {
    ids: ROSHN_SM_FALLBACK.map(([id]) => id),
    byId: new Map(ROSHN_SM_FALLBACK),
  };
  try {
    return await withSWR(`tc:roshn-teams`, TEAMS_TTL, TEAMS_TTL * 2, async () => {
      const league = await smGet(`leagues/${SM_SAUDI_LEAGUE_ID}`, { include: "seasons" });
      const seasons: any[] = league?.data?.seasons ?? [];
      // الأحدث أولًا (أسماء المواسم "2026/2027" تُرتّب أبجديًّا بشكل صحيح)
      const ordered = seasons
        .filter((s) => typeof s?.name === "string")
        .sort((a, b) => String(b.name).localeCompare(String(a.name)));
      for (const season of ordered.slice(0, 3)) {
        const res = await smGet(`teams/seasons/${season.id}`, { per_page: "50" });
        const teams: any[] = res?.data ?? [];
        if (teams.length > 0) {
          return {
            ids: teams.map((t) => t.id),
            byId: new Map(teams.map((t) => [t.id, String(t.name ?? "")])),
          };
        }
      }
      return fallback;
    });
  } catch {
    return fallback;
  }
}

// ---------- التطبيع المشترك ----------
const RUMOUR_KIND_BY_TYPE: Record<number, TcRumourKind> = {
  219: "transfer",
  83609: "loan",
  78370: "extension",
};
const CONFIRMED_KIND_BY_TYPE: Record<number, TcConfirmed["kind"]> = {
  219: "transfer",
  218: "loan",
  220: "free",
};

function normalizeParty(team: any, leagueId: number | null, roshnIds: Set<number>): TcParty {
  const id = team?.id ?? 0;
  const saudi = leagueId === SM_SAUDI_LEAGUE_ID || roshnIds.has(id);
  return {
    id,
    name: arClubName(team?.name),
    image: team?.image_path ?? null,
    leagueId,
    leagueName: leagueId != null ? (LEAGUE_AR[leagueId] ?? null) : saudi ? LEAGUE_AR[SM_SAUDI_LEAGUE_ID] : null,
    saudi,
  };
}

function normalizePlayer(p: any, arName: (n: string | null | undefined) => string): TcPlayer {
  return {
    id: p?.id ?? 0,
    name: arName(p?.display_name || p?.name),
    image: p?.image_path ?? null,
    position: POSITION_AR[p?.position_id] ?? null,
    birthdate: p?.date_of_birth ?? null,
  };
}

function normalizeRumour(r: any, roshnIds: Set<number>, arName: (n: string | null | undefined) => string): TcRumour {
  const probability: TcProbability = ["LOW", "MEDIUM", "HIGH", "IMMINENT"].includes(r?.probability)
    ? r.probability
    : "LOW";
  const from = normalizeParty(r?.fromteam, r?.from_league_id ?? null, roshnIds);
  const to = normalizeParty(r?.toteam, r?.to_league_id ?? null, roshnIds);
  const srcName = String(r?.source_name ?? "").trim();
  const tier = sourceTier(srcName);
  // المزوّد يضع إشاعة التجديد أحيانًا بنوع «انتقال» بنفس الناديين — صنّفها تجديدًا.
  const rawKind = RUMOUR_KIND_BY_TYPE[r?.type_id] ?? "transfer";
  const kind: TcRumourKind = rawKind === "transfer" && from.id !== 0 && from.id === to.id ? "extension" : rawKind;
  return {
    id: r?.id ?? 0,
    date: r?.date ?? "",
    probability,
    kind,
    amount: typeof r?.amount === "number" ? r.amount : null,
    currency: r?.currency ?? null,
    source: { name: srcName || "غير معروف", url: r?.source_url ?? null, tier },
    hereWeGo: probability === "IMMINENT" || (probability === "HIGH" && /romano/i.test(srcName)),
    player: normalizePlayer(r?.player, arName),
    from,
    to,
    saudi: from.saudi || to.saudi,
  };
}

const RUMOUR_INCLUDE = "player;fromTeam;toTeam";

// ---------- 1) موجز الإشاعات (سعودي مُجمَّع بالفرق + عالمي من الفيد) ----------
export interface TcRumoursFeed {
  rumours: TcRumour[];
  leagues: typeof BIG_FIVE_LEAGUES;
}

export async function getTransferRumours(): Promise<TcRumoursFeed> {
  return withSWR(`tc:rumours`, RUMOURS_TTL, RUMOURS_TTL * 2, async () => {
    const roshn = await getRoshnSmTeams();
    const roshnIds = new Set(roshn.ids);

    // الفيد العام (أحدث 200) + مسارات فرق روشن الـ18 بالتوازي.
    // فشل أي نداء لا يُسقط الباقي — «أفضل جهد».
    const generalPages = [1, 2, 3, 4].map((page) =>
      smGet("transfer-rumours", {
        order: "desc",
        per_page: "50",
        page: String(page),
        include: RUMOUR_INCLUDE,
      }).catch(() => null),
    );
    const teamCalls = roshn.ids.map((id) =>
      smGet(`transfer-rumours/teams/${id}`, { per_page: "50", include: RUMOUR_INCLUDE }).catch(() => null),
    );
    const responses = await Promise.all([...generalPages, ...teamCalls]);

    const rawById = new Map<number, any>();
    for (const res of responses) {
      for (const row of res?.data ?? []) {
        if (row?.id != null && !rawById.has(row.id)) rawById.set(row.id, row);
      }
    }
    const raw = [...rawById.values()];

    // تعريب أسماء اللاعبين: فوري بالمتاح (قاموس + كاش DB)، والناقص يُترجم
    // بالخلفية ليظهر معرَّبًا في التحديث التالي — نفس نمط انتقالات روشن.
    const names = raw.map((r) => r?.player?.display_name || r?.player?.name);
    const arName = await resolveNames(names, { skipAi: true });
    void resolveNames(names).catch(() => {});

    const rumours = raw
      .map((r) => normalizeRumour(r, roshnIds, arName))
      .filter((r) => r.id && r.date && r.player.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

    return { rumours, leagues: BIG_FIVE_LEAGUES };
  });
}

// ---------- 2) المؤكّد العالمي (فيد SportMonks /transfers) ----------
export async function getGlobalConfirmed(): Promise<TcConfirmed[]> {
  return withSWR(`tc:global-confirmed`, CONFIRMED_TTL, CONFIRMED_TTL * 2, async () => {
    const roshn = await getRoshnSmTeams();
    const roshnIds = new Set(roshn.ids);

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        smGet("transfers", {
          order: "desc",
          per_page: "50",
          page: String(page),
          include: RUMOUR_INCLUDE,
        }).catch(() => null),
      ),
    );
    const raw: any[] = [];
    const seen = new Set<number>();
    for (const res of pages) {
      for (const row of res?.data ?? []) {
        if (row?.id != null && !seen.has(row.id) && row?.completed !== false && row?.career_ended !== true) {
          seen.add(row.id);
          raw.push(row);
        }
      }
    }

    const names = raw.map((r) => r?.player?.display_name || r?.player?.name);
    const arName = await resolveNames(names, { skipAi: true });
    void resolveNames(names).catch(() => {});

    return raw
      .map((r): TcConfirmed => {
        const from = normalizeParty(r?.fromteam, null, roshnIds);
        const to = normalizeParty(r?.toteam, null, roshnIds);
        const fromKnown = Boolean(CLUB_AR[String(r?.fromteam?.name ?? "").trim()]);
        const toKnown = Boolean(CLUB_AR[String(r?.toteam?.name ?? "").trim()]);
        const amount = typeof r?.amount === "number" ? r.amount : null;
        return {
          id: r?.id ?? 0,
          date: r?.date ?? "",
          kind: CONFIRMED_KIND_BY_TYPE[r?.type_id] ?? "transfer",
          amount,
          currency: r?.currency ?? (amount != null ? "EUR" : null),
          player: normalizePlayer(r?.player, arName),
          from,
          to,
          saudi: from.saudi || to.saudi,
          major: fromKnown || toKnown || amount != null,
        };
      })
      .filter((t) => t.id && t.date && t.player.id)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  });
}

// ---------- 3) قصة انتقال لاعب (كل الإشاعات مرتّبة زمنيًّا) ----------
export interface TcStory {
  found: boolean;
  player: TcPlayer | null;
  /** التسلسل الزمني تصاعديًّا — لعرض تطوّر درجة الاحتمال */
  timeline: TcRumour[];
}

export async function getRumourStory(playerId: number): Promise<TcStory> {
  return withSWR(`tc:story:${playerId}`, RUMOURS_TTL, RUMOURS_TTL * 2, async () => {
    const roshn = await getRoshnSmTeams();
    const roshnIds = new Set(roshn.ids);
    const res = await smGet(`transfer-rumours/players/${playerId}`, {
      per_page: "50",
      include: RUMOUR_INCLUDE,
    }).catch(() => null);
    const raw: any[] = res?.data ?? [];
    if (!raw.length) return { found: false, player: null, timeline: [] };

    const names = raw.map((r) => r?.player?.display_name || r?.player?.name);
    const arName = await resolveNames(names, { skipAi: true });
    void resolveNames(names).catch(() => {});

    const timeline = raw
      .map((r) => normalizeRumour(r, roshnIds, arName))
      .filter((r) => r.id && r.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

    return { found: true, player: timeline[timeline.length - 1]?.player ?? null, timeline };
  });
}

// ---------- 4) مقارنة الميركاتو: إنفاق روشن vs البريميرليغ ----------
// روشن من سجل API-Football المؤكّد (نفس مصدر /api/sports/transfers)،
// والبريميرليغ بـ20 نداء فريق خلف كاش نصف يوم — عبء مقبول على البوابة المشتركة.
const PL_API_FOOTBALL_LEAGUE = 39;
const PL_SEASON = 2026;

function parseFeeText(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!/[€$£]/.test(s)) return null;
  const m = s.match(/([\d.]+)\s*([MmKk]?)/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!Number.isFinite(num)) return null;
  const mult = m[2].toLowerCase() === "m" ? 1_000_000 : m[2].toLowerCase() === "k" ? 1_000 : 1;
  return num * mult;
}

async function getPremierLeagueSpending(): Promise<{ total: number; deals: number } | null> {
  try {
    return await withSWR(`tc:pl-spending`, PL_SPEND_TTL, PL_SPEND_TTL * 2, async () => {
      const teams = await apiFootballGet("TransferCenter", "teams", {
        league: PL_API_FOOTBALL_LEAGUE,
        season: PL_SEASON,
      });
      const ids = teams.map((t: any) => t?.team?.id).filter(Boolean);
      if (!ids.length) return { total: 0, deals: 0 };
      const perTeam = await Promise.all(
        ids.map((id: number) =>
          apiFootballGet("TransferCenter", "transfers", { team: id }).catch(() => [] as any[]),
        ),
      );
      let total = 0;
      let deals = 0;
      const counted = new Set<string>();
      const idSet = new Set(ids);
      for (const rows of perTeam) {
        for (const it of rows) {
          for (const t of it.transfers ?? []) {
            const date = t?.date ?? "";
            const inId = t?.teams?.in?.id ?? 0;
            if (date < MERCATO_START || !idSet.has(inId)) continue;
            const fee = parseFeeText(t?.type);
            if (fee == null) continue;
            const key = `${it.player?.id}|${date}|${inId}`;
            if (counted.has(key)) continue;
            counted.add(key);
            total += fee;
            deals += 1;
          }
        }
      }
      return { total, deals };
    });
  } catch {
    return null;
  }
}

// ---------- 5) نظرة السوق (ودجت البوابة + إحصائيات المركز) ----------
export interface TcPulseItem {
  type: "confirmed" | "rumour";
  playerId: number;
  player: string;
  playerImage: string | null;
  from: string;
  to: string;
  fromLogo: string | null;
  toLogo: string | null;
  amount: number | null;
  currency: string | null;
  probability: TcProbability | null;
  hereWeGo: boolean;
  date: string;
  saudi: boolean;
}

export interface TcOverview {
  rumoursConfigured: boolean;
  /** آخر 10 حركات (مؤكّد + إشاعات ساخنة) لشريط «نبض السوق» */
  pulse: TcPulseItem[];
  /** صفقة اليوم: الأوزن بصريًّا في الودجت والمركز */
  dealOfDay: TcPulseItem | null;
  /** أضخم 3 صفقات جارية (إشاعات موزونة بالاحتمال × المبلغ) للـHero */
  hero: TcRumour[];
  windows: typeof TRANSFER_WINDOWS;
  /**
   * مقارنة الميركاتو الحالي (يورو). basis:
   *   - confirmed: من الصفقات المؤكّدة المُسعَّرة (API-Football)
   *   - rumoured: قيم متداولة في الإشاعات — بديل صادق موسوم قبل أن يفتح
   *     المزوّد بيانات النافذة (سجل صيف 2026 يتأخر لديه)
   */
  comparison: {
    basis: "confirmed" | "rumoured";
    roshn: { total: number; deals: number };
    premierLeague: { total: number; deals: number };
  } | null;
  /** ميزان الصرف/الدخل لأندية روشن هذا الميركاتو (من المؤكّد المُسعَّر فقط) */
  clubBalance: { clubId: number; club: string; logo: string; spent: number; earned: number }[];
}

const PROBABILITY_WEIGHT: Record<TcProbability, number> = { IMMINENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

function rumourToPulse(r: TcRumour): TcPulseItem {
  return {
    type: "rumour",
    playerId: r.player.id,
    player: r.player.name,
    playerImage: r.player.image,
    from: r.from.name,
    to: r.to.name,
    fromLogo: r.from.image,
    toLogo: r.to.image,
    amount: r.amount,
    currency: r.currency,
    probability: r.probability,
    hereWeGo: r.hereWeGo,
    date: r.date,
    saudi: r.saudi,
  };
}

function confirmedToPulse(t: TcConfirmed): TcPulseItem {
  return {
    type: "confirmed",
    playerId: t.player.id,
    player: t.player.name,
    playerImage: t.player.image,
    from: t.from.name,
    to: t.to.name,
    fromLogo: t.from.image,
    toLogo: t.to.image,
    amount: t.amount,
    currency: t.currency,
    probability: null,
    hereWeGo: false,
    date: t.date,
    saudi: t.saudi,
  };
}

export async function getMarketOverview(): Promise<TcOverview> {
  const rumoursConfigured = isTransferRumoursConfigured();

  // المصادر الأربعة بالتوازي — فشل أيّها يترك مكانه فارغًا بلا عطل.
  const [rumoursFeed, saudiConfirmed, globalConfirmed, plSpending] = await Promise.all([
    rumoursConfigured ? getTransferRumours().catch(() => null) : Promise.resolve(null),
    getLeagueTransfers().catch(() => null),
    rumoursConfigured ? getGlobalConfirmed().catch(() => [] as TcConfirmed[]) : Promise.resolve([] as TcConfirmed[]),
    getPremierLeagueSpending(),
  ]);

  const rumours = rumoursFeed?.rumours ?? [];

  // «نبض السوق»: آخر الحركات فعلًا — أحدث المؤكّد السعودي + أبرز المؤكّد
  // العالمي + إشاعات ساخنة حديثة (آخر أسبوعين، Here-we-go أولًا)، بالتاريخ.
  const pulse: TcPulseItem[] = [];
  for (const t of (saudiConfirmed?.transfers ?? []).slice(0, 3)) {
    pulse.push({
      type: "confirmed",
      playerId: 0, // معرّف API-Football — لا يصلح لصفحة القصة (فضاء SportMonks)
      player: t.player.name,
      playerImage: null,
      from: t.from.name,
      to: t.to.name,
      fromLogo: t.from.logo || null,
      toLogo: t.to.logo || null,
      amount: t.feeValue,
      currency: t.feeValue != null ? "EUR" : null,
      probability: null,
      hereWeGo: false,
      date: t.date,
      saudi: true,
    });
  }
  for (const t of globalConfirmed.filter((g) => g.major).slice(0, 3)) pulse.push(confirmedToPulse(t));
  const fortnight = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const moves = rumours.filter((r) => r.kind !== "extension"); // النبض حركة بين ناديين
  const recentRumours = moves.filter((r) => r.date >= fortnight);
  const hotPool = recentRumours.length >= 3 ? recentRumours : moves;
  const hotRumours = [...hotPool]
    .sort(
      (a, b) =>
        Number(b.hereWeGo) - Number(a.hereWeGo) ||
        b.date.localeCompare(a.date) ||
        PROBABILITY_WEIGHT[b.probability] - PROBABILITY_WEIGHT[a.probability] ||
        (b.amount ?? 0) - (a.amount ?? 0),
    )
    .slice(0, 5);
  for (const r of hotRumours) pulse.push(rumourToPulse(r));
  pulse.sort((a, b) => b.date.localeCompare(a.date));
  const pulseTop = pulse.slice(0, 10);

  // «صفقة اليوم»: أسخن إشاعة خلال آخر 72 ساعة (وزن الاحتمال ثم المبلغ)،
  // وإلا أحدث صفقة سعودية مؤكّدة بمبلغ.
  const cutoff = new Date(Date.now() - 72 * 3600 * 1000).toISOString().slice(0, 10);
  const fresh = rumours.filter((r) => r.date >= cutoff && r.kind !== "extension");
  const bestFresh = fresh.sort(
    (a, b) =>
      PROBABILITY_WEIGHT[b.probability] - PROBABILITY_WEIGHT[a.probability] ||
      (b.amount ?? 0) - (a.amount ?? 0),
  )[0];
  let dealOfDay: TcPulseItem | null = bestFresh ? rumourToPulse(bestFresh) : null;
  if (!dealOfDay) {
    const confirmed = pulseTop.find((p) => p.type === "confirmed" && p.amount != null);
    dealOfDay = confirmed ?? pulseTop[0] ?? null;
  }

  // Hero: أضخم 3 قصص جارية خلال آخر 30 يومًا.
  const heroCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const hero = rumours
    .filter((r) => r.date >= heroCutoff && r.kind !== "extension")
    .sort(
      (a, b) =>
        (b.amount ?? 0) * PROBABILITY_WEIGHT[b.probability] - (a.amount ?? 0) * PROBABILITY_WEIGHT[a.probability] ||
        PROBABILITY_WEIGHT[b.probability] - PROBABILITY_WEIGHT[a.probability],
    )
    .slice(0, 3);

  // ميزان الصرف/الدخل لأندية روشن (المؤكّد المُسعَّر هذا الميركاتو فقط).
  const balance = new Map<number, { clubId: number; club: string; logo: string; spent: number; earned: number }>();
  if (saudiConfirmed) {
    const clubMeta = new Map(saudiConfirmed.clubs.map((c) => [c.id, c]));
    for (const t of saudiConfirmed.transfers) {
      if (t.feeValue == null || t.date < MERCATO_START) continue;
      if (t.inClubId != null) {
        const meta = clubMeta.get(t.inClubId);
        const row = balance.get(t.inClubId) ?? {
          clubId: t.inClubId, club: meta?.name ?? t.to.name, logo: meta?.logo ?? t.to.logo, spent: 0, earned: 0,
        };
        row.spent += t.feeValue;
        balance.set(t.inClubId, row);
      }
      if (t.outClubId != null) {
        const meta = clubMeta.get(t.outClubId);
        const row = balance.get(t.outClubId) ?? {
          clubId: t.outClubId, club: meta?.name ?? t.from.name, logo: meta?.logo ?? t.from.logo, spent: 0, earned: 0,
        };
        row.earned += t.feeValue;
        balance.set(t.outClubId, row);
      }
    }
  }
  const clubBalance = [...balance.values()].sort((a, b) => b.spent - a.spent).slice(0, 10);

  // مقارنة الميركاتو: إنفاق روشن (مؤكّد مُسعَّر منذ مطلع يونيو) vs البريميرليغ.
  let comparison: TcOverview["comparison"] = null;
  if (plSpending && saudiConfirmed) {
    let roshnTotal = 0;
    let roshnDeals = 0;
    for (const t of saudiConfirmed.transfers) {
      if (t.inClubId != null && t.feeValue != null && t.date >= MERCATO_START) {
        roshnTotal += t.feeValue;
        roshnDeals += 1;
      }
    }
    comparison = {
      basis: "confirmed",
      roshn: { total: roshnTotal, deals: roshnDeals },
      premierLeague: { total: plSpending.total, deals: plSpending.deals },
    };
  }
  // سجل API-Football لصيف 2026 يتأخر (يتجدد ~10 يوليو) — قبل توفّره نقارن
  // بالقيم المتداولة في الإشاعات، موسومةً «rumoured» بصراحة (لا رقم مختلق).
  if (!comparison || (comparison.roshn.total === 0 && comparison.premierLeague.total === 0)) {
    const sumRumoured = (match: (r: TcRumour) => boolean) => {
      let total = 0;
      let deals = 0;
      for (const r of rumours) {
        if (r.date >= MERCATO_START && r.amount != null && r.kind !== "extension" && match(r)) {
          total += r.amount;
          deals += 1;
        }
      }
      return { total, deals };
    };
    const roshnR = sumRumoured((r) => r.to.saudi);
    const plR = sumRumoured((r) => r.to.leagueId === 8);
    if (roshnR.total > 0 || plR.total > 0) {
      comparison = { basis: "rumoured", roshn: roshnR, premierLeague: plR };
    }
  }

  return {
    rumoursConfigured,
    pulse: pulseTop,
    dealOfDay,
    hero,
    windows: TRANSFER_WINDOWS,
    comparison,
    clubBalance,
  };
}
