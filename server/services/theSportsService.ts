// TheSports — مصدر نتيجة لحظية فائق السرعة لمباريات المونديال والبطولات المربوطة.
//
// لماذا: مزوّدونا الحاليون (API-Football للأسماء/التشكيلات، SportMonks للنتيجة
// الحيّة) يتأخّران على النتيجة، فتتأخّر المتابعة الحيّة وقفل الشاشة.
// TheSports يحدّث النتيجة فورًا عبر:
//   1) MQTT/WebSocket (topic thesports/football/match/v1) — المسار الأسرع
//   2) REST match/detail_live — احتياطي/بذرة كل ~2ث
// الاشتراك الحالي يشمل BASIC INFO + BASIC DATA + ADVANCED DATA.
//
// الجسر (لا نحتاج أسماء TheSports إطلاقًا):
//   1) بطولة المونديال ثابتة في TheSports: competition_id = WC_COMPETITION_ID
//      (تحقّق مباشر: طابقنا نيوزيلندا 1–3 مصر + الأرجنتين×النمسا + فرنسا×العراق
//       بوقت البداية والنتيجة بالضبط — 2026-06-22).
//   2) لمباراتنا (WcFixture لها timestamp = وقت البداية) نبحث diary لذلك اليوم،
//      نُرشّح competition==WC، ونطابق match_time == fx.timestamp. مباريات المونديال
//      متباعدة ~3 ساعات داخل البطولة فلا تصادم على الدقيقة → ربط أحادي مؤكّد.
//   3) detail_live / MQTT → نقرأ النتيجة بمعرّف مباراة TheSports المربوط.
//
// أفضل جهد بالكامل: أي فشل (IP غير مُدرَج في الإنتاج، نقطة محجوبة، شبكة) يرجع
// null فيتراجع overlayLiveScore بهدوء إلى SportMonks ثم API-Football.
//
// تفعيل الإنتاج يتطلّب: ضبط THESPORTS_USER + THESPORTS_SECRET، وإدراج عنوان
// خروج Railway في قائمة TheSports المسموح بها (هذه القائمة هي ما يحجب «URL not
// authorized»). بدون أيٍّ منهما يبقى المزوّد خاملًا والسلوك الحالي كما هو.

import https from "node:https";
import { withSWR } from "../memoryCache";
import { looksLikeSaudiClubTeamName } from "./saudiLeagueNames";

const TS_BASE = "https://api.thesports.com/v1/football";

// مُعرّف بطولة كأس العالم في TheSports (مُتحقَّق منه بمطابقة الجدول والنتيجة).
export const WC_COMPETITION_ID = "kp3glrw7hwqdyjv";

// خريطة منسّقة: slug البطولة لدينا (saudiLeagueService) → competition_id في TheSports.
// المعرّفات زوّدنا بها فريق TheSports رسميًا (2026‑06‑23) وهي ثابتة لا تتغيّر.
// تُستعمل لتعميم الطبقة اللحظية خارج المونديال (المرحلة 1): نقيّد diary على هذه
// المعرّفات ثم نطابق مبارياتنا زمنيًا كما في جسر المونديال.
export const TS_COMPETITION_IDS: Record<string, string> = {
  "world-cup": WC_COMPETITION_ID,
  "pro-league": "j1l4rjnh66nm7vx",          // دوري روشن السعودي
  "afc-champions-league": "9dn1m1ghjpmoepl", // دوري أبطال آسيا للنخبة
  "premier-league": "jednm9whz0ryox8",       // الدوري الإنجليزي الممتاز
  "la-liga": "vl7oqdehlyr510j",              // الدوري الإسباني
  "serie-a": "4zp5rzghp5q82w1",             // الدوري الإيطالي
  "bundesliga": "gy0or5jhg6qwzv3",          // الدوري الألماني
  "ligue-1": "yl5ergphnzr8k0o",             // الدوري الفرنسي
  // من دعم TheSports (2026-07-03) — ضمن الاشتراك:
  "asian-cup": "z318q66hegqo9jd",           // كأس آسيا (موسم 2027: 9vjxm8ghzkor6od)
  "gulf-cup": "gpxwrxlhkgryk0j",            // كأس الخليج «خليجي» (لا موسم 26/27 لدى المزوّد بعد)
  // متحقَّق حيًّا من competition/additional/list (2026-07-04) — لا يُخلط مع
  // معرّف النخبة الآسيوية القريب شكلًا (9dn1m1ghjpmoepl):
  "kings-cup": "9dn1m1gh44wmoep",           // كأس خادم الحرمين الشريفين (كأس الملك)
};

// حالات TheSports: 1=لم تبدأ، 2=ش1، 3=استراحة، 4=ش2، 5/6=وقت إضافي، 7=ركلات،
// 8=انتهت، 9=تأجيل، ...
const TS_LIVE_STATUS = new Set([2, 3, 4, 5, 6, 7]);
const TS_FINISHED_STATUS = 8;

// إيقاعات الكاش: detail_live هو مصدر اللحظية الأسرع، فنُبقيه قصيرًا جدًا حتى
// تتطابق النتيجة بين الموقع والتطبيق والـLive Activity خلال ثوانٍ قليلة.
const LIVE_TTL = 2 * 1000;
const LIVE_SWR = 4 * 1000;
const BRIDGE_TTL = 6 * 60 * 60 * 1000; // المعرّف لا يتغيّر؛ نُعيد الحلّ مرتين/يوم احتياطًا

// ربط إيجابي فقط: معرّف مباراتنا (API-Football) → معرّف مباراة TheSports.
const matchIdBridge = new Map<number, string>();

// قاطع دائرة: عند أي فشل (IP غير مُدرَج/شبكة/نقطة محجوبة) نُجمّد كل نداءات
// TheSports لفترة تهدئة، فلا يتكرّر النداء البطيء في كل طلب ويُبطئ نقاطَ المستخدم
// (overview/fixtures). السبب: withSWR لا يخزّن الأخطاء — فبلا القاطع يُعاد النداء
// الفاشل كل مرّة قبل التراجع لـ SportMonks. يتعافى ذاتيًّا بعد انتهاء التهدئة.
const TS_FAIL_COOLDOWN_MS = 60 * 1000;
let tsCooldownUntil = 0;

// تتبّع آخر فشل للتشخيص: قبل هذا كان الـ cooldown يُفعَّل صامتًا بلا أثر في السجلات،
// فلا يمكن تمييز «المزوّد خامل» عن «IP Railway غير مُدرج» عن «يعمل طبيعيًّا».
// هذان المتغيّران يُقرآن عبر getTheSportsStatus() في /health فقط (لا يكشفان أسرارًا).
let tsLastError: string | null = null;
let tsLastErrorAt: number | null = null;

/**
 * يُفعّل الـcooldown ويسجّل سبب الفشل (رسالة TheSports الخام). يُستدعى من كل
 * نقطة دخول عند فشل النداء. مركزيّ لتجنّب تكرار منطق التهدئة وضمان وجود أثر
 * واحد قابل للتشخيص في السجلات.
 */
function armCooldown(reason: unknown): void {
  const msg = reason instanceof Error ? reason.message : String(reason);
  tsCooldownUntil = Date.now() + TS_FAIL_COOLDOWN_MS;
  tsLastError = msg;
  tsLastErrorAt = Date.now();
  // تحذير واحد لكل فشل (لا نداء) — رسائل TheSports مثل «URL not authorized»
  // أو «IP not authorized» تُظهر فورًا هل المشكلة إدراج IP أم لا.
  console.warn(`[TheSports] cooldown armed (${TS_FAIL_COOLDOWN_MS}ms): ${msg}`);
}

/** حالة مستهلك MQTT (يحدّثها theSportsMqttClient) — للتشخيص في /health. */
export type TsMqttStatus = {
  enabled: boolean;
  connected: boolean;
  lastMessageAt: number | null;
  lastError: string | null;
  messagesReceived: number;
  matchesTracked: number;
};

let mqttStatus: TsMqttStatus = {
  enabled: false,
  connected: false,
  lastMessageAt: null,
  lastError: null,
  messagesReceived: 0,
  matchesTracked: 0,
};

export function setTheSportsMqttStatus(patch: Partial<TsMqttStatus>): void {
  mqttStatus = { ...mqttStatus, ...patch, matchesTracked: mqttLiveById.size };
}

/**
 * لقطة تشخيصية لحالة مزوّد TheSports — تُستهلك من /health فقط. تكشف ما يلي:
 *   - configured: هل ضُبطت THESPORTS_USER/SECRET؟
 *   - inCooldown: هل نحن داخل فترة التهدئة (أي فشل حديث)؟
 *   - cooldownRemainingMs: كم بقي على انتهاء التهدئة (0 لو لسنا فيها).
 *   - lastError / lastErrorAt: آخر رسالة خطأ خام وزمنها (أداة التشخيص الرئيسية).
 *   - mqtt: حالة تغذية WebSocket/MQTT اللحظية (إن وُجدت).
 * لا تكشف أسرارًا (لا user/secret).
 */
export function getTheSportsStatus(): {
  configured: boolean;
  inCooldown: boolean;
  cooldownRemainingMs: number;
  lastError: string | null;
  lastErrorAt: number | null;
  mqtt: TsMqttStatus;
} {
  const now = Date.now();
  const inCooldown = now < tsCooldownUntil;
  return {
    configured: isTheSportsConfigured(),
    inCooldown,
    cooldownRemainingMs: inCooldown ? tsCooldownUntil - now : 0,
    lastError: tsLastError,
    lastErrorAt: tsLastErrorAt,
    mqtt: { ...mqttStatus, matchesTracked: mqttLiveById.size },
  };
}

// ───────────────────── تغذية MQTT (WebSocket) فوق detail_live ─────────────────────
// TheSports يدفع score/stats/incidents/tlive تزايديًا عبر
// topic `thesports/football/match/v1`. ندمجها فوق لقطة REST فتفوز الرسالة
// اللحظية دون انتظار دورة الاستطلاع (~2ث).

const MQTT_ENTRY_TTL_MS = 20 * 60 * 1000;
type MqttLiveSlot = { entry: Record<string, any>; updatedAt: number };
const mqttLiveById = new Map<string, MqttLiveSlot>();

function pruneMqttLive(now = Date.now()): void {
  for (const [id, slot] of mqttLiveById) {
    if (now - slot.updatedAt > MQTT_ENTRY_TTL_MS) mqttLiveById.delete(id);
  }
}

function mergeMqttLiveEntry(
  prev: Record<string, any> | undefined,
  patch: Record<string, any>,
): Record<string, any> {
  const next: Record<string, any> = { ...(prev ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    next[k] = v;
  }
  if (!next.id && patch.id) next.id = patch.id;
  return next;
}

function upsertMqttLive(id: string, patch: Record<string, any>): void {
  if (!id) return;
  const prev = mqttLiveById.get(id)?.entry;
  const entry = mergeMqttLiveEntry(prev, { ...patch, id });
  mqttLiveById.set(id, { entry, updatedAt: Date.now() });
}

/** يستخرج معرّف المباراة من عنصر score (الخانة 0) أو من حقل id. */
function mqttMatchIdFromRow(row: any): string | null {
  if (row == null) return null;
  if (typeof row === "string" || typeof row === "number") return String(row);
  if (Array.isArray(row) && row.length > 0 && (typeof row[0] === "string" || typeof row[0] === "number")) {
    return String(row[0]);
  }
  if (typeof row === "object") {
    const id = row.id ?? row.match_id ?? row.matchId;
    if (id != null && id !== "") return String(id);
  }
  return null;
}

/**
 * يطبّق حمولة MQTT الخام على خريطة اللحظي. مرن لأشكال TheSports الشائعة:
 * `{ score: [...], stats: [...], incidents: [...], tlive: [...] }` حيث كل حقل
 * مصفوفة صفوف (صف النتيجة = مصفوفة تبدأ بـmatch id؛ وبقية الحقول كائن بـid).
 * تُرجع عدد المباريات التي لمسها التحديث.
 */
export function applyTheSportsMqttPayload(raw: unknown): number {
  if (raw == null) return 0;
  let data: any = raw;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(raw)) {
    try {
      data = JSON.parse(raw.toString("utf8"));
    } catch {
      return 0;
    }
  } else if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return 0;
    }
  }
  if (typeof data !== "object" || data == null) return 0;

  // بعض البوابات تلفّ الحمولة في { data } / { results }.
  if (data.data && typeof data.data === "object" && !Array.isArray(data.data)
      && (data.data.score != null || data.data.stats != null || data.data.incidents != null)) {
    data = data.data;
  }
  if (Array.isArray(data.results) && data.score == null && data.id == null) {
    let n = 0;
    for (const row of data.results) n += applyTheSportsMqttPayload(row);
    return n;
  }

  const touched = new Set<string>();

  const touchScoreRow = (row: any) => {
    const id = mqttMatchIdFromRow(row);
    if (!id || !Array.isArray(row)) return;
    upsertMqttLive(id, { score: row });
    touched.add(id);
  };

  const touchStatsRow = (row: any) => {
    const id = mqttMatchIdFromRow(row);
    if (!id) return;
    if (row && typeof row === "object" && !Array.isArray(row) && Array.isArray(row.stats)) {
      upsertMqttLive(id, { stats: row.stats });
    } else if (Array.isArray(row)) {
      upsertMqttLive(id, { stats: row.slice(1) });
    } else if (Array.isArray(row?.stats)) {
      upsertMqttLive(id, { stats: row.stats });
    }
    touched.add(id);
  };

  const touchIncidentsRow = (row: any) => {
    const id = mqttMatchIdFromRow(row);
    if (!id) return;
    if (row && typeof row === "object" && !Array.isArray(row)) {
      if (Array.isArray(row.incidents)) {
        upsertMqttLive(id, { incidents: row.incidents });
      } else if (row.type != null) {
        const prev = mqttLiveById.get(id)?.entry?.incidents;
        const list = Array.isArray(prev) ? prev.slice() : [];
        list.push(row);
        upsertMqttLive(id, { incidents: list });
      }
    } else if (Array.isArray(row)) {
      upsertMqttLive(id, { incidents: row.slice(1) });
    }
    touched.add(id);
  };

  const touchTliveRow = (row: any) => {
    const id = mqttMatchIdFromRow(row);
    if (!id) return;
    if (row && typeof row === "object" && !Array.isArray(row)) {
      if (Array.isArray(row.tlive)) upsertMqttLive(id, { tlive: row.tlive });
      else if (row.data != null && !Array.isArray(row.tlive)) {
        // عنصر تعليق مفرد — نُلحقه.
        const prev = mqttLiveById.get(id)?.entry?.tlive;
        const list = Array.isArray(prev) ? prev.slice() : [];
        list.push(row);
        upsertMqttLive(id, { tlive: list });
      }
    } else if (Array.isArray(row)) {
      upsertMqttLive(id, { tlive: row.slice(1) });
    }
    touched.add(id);
  };

  // مباراة كاملة بشكل detail_live: { id, score, stats?, incidents?, tlive? }
  // حيث score لمباراة واحدة يبدأ بالمعرّف وليس بمصفوفة مباريات.
  const selfId = typeof data.id === "string" || typeof data.id === "number" ? String(data.id) : null;
  if (selfId && Array.isArray(data.score) && !Array.isArray(data.score[0])) {
    upsertMqttLive(selfId, {
      score: data.score,
      ...(data.stats != null ? { stats: data.stats } : {}),
      ...(data.incidents != null ? { incidents: data.incidents } : {}),
      ...(data.tlive != null ? { tlive: data.tlive } : {}),
      ...(data.competition_id != null ? { competition_id: data.competition_id } : {}),
      ...(data.home_team_id != null ? { home_team_id: data.home_team_id } : {}),
      ...(data.away_team_id != null ? { away_team_id: data.away_team_id } : {}),
      ...(data.match_time != null ? { match_time: data.match_time } : {}),
    });
    touched.add(selfId);
  }

  // الشكل القياسي للوثائق: حقول متوازية كمصفوفات صفوف.
  if (Array.isArray(data.score)) {
    if (Array.isArray(data.score[0])) {
      for (const row of data.score) touchScoreRow(row);
    } else if (data.score.length >= 4 && (typeof data.score[0] === "string" || typeof data.score[0] === "number") && !selfId) {
      touchScoreRow(data.score);
    }
  }
  if (Array.isArray(data.stats)) for (const row of data.stats) touchStatsRow(row);
  if (Array.isArray(data.incidents)) for (const row of data.incidents) touchIncidentsRow(row);
  if (Array.isArray(data.tlive)) for (const row of data.tlive) touchTliveRow(row);

  pruneMqttLive();
  return touched.size;
}

/** للاختبارات والتشخيص — عدد المباريات في طبقة MQTT. */
export function getTheSportsMqttMatchCount(): number {
  pruneMqttLive();
  return mqttLiveById.size;
}

export function clearTheSportsMqttLiveForTests(): void {
  mqttLiveById.clear();
}

// مهلة قصيرة: نتيجة لحظية لا قيمة لها إن تأخّرت، والأهم ألّا تُبطئ صفحة المستخدم.
const TS_HTTP_TIMEOUT_MS = 4000;

// اتصال IPv4 مُعاد الاستخدام (keep-alive) — يلغي مصافحة TLS جديدة لكل نداء،
// فيقارب أداء fetch المجمّع. family:4 على الوكيل يضمن IPv4 (قائمة TheSports IPv4).
const tsAgent = new https.Agent({ keepAlive: true, family: 4, maxSockets: 8 });

export function isTheSportsConfigured(): boolean {
  return Boolean(
    (process.env.THESPORTS_USER || "").trim() && (process.env.THESPORTS_SECRET || "").trim()
  );
}

// معرّف بطولة TheSports المقابل لـslug بطولة لدينا — أو null لو لم تُربط بعد.
// الطبقة اللحظية العامة لا تعمل إلا للبطولات المُدرَجة في الخريطة المنسّقة.
export function getTsCompetitionId(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return TS_COMPETITION_IDS[slug] ?? null;
}

// نُجبر IPv4 صراحةً (family: 4). قائمة TheSports المسموح بها مبنيّة على IPv4 فقط،
// و`fetch` العام في Node (undici) يفضّل IPv6 عند توفّره فيخرج بعنوان غير مُدرَج
// ويرجع «IP not authorized» — فتُعطَّل الميزة بصمت رغم صحّة المفتاح وإدراج IPv4.
// node:https يمرّر family إلى مقبس الاتصال فيُحلّ الاسم ويتصل عبر IPv4 حصرًا.
function httpsGetJson(url: URL, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: tsAgent, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 400) {
        res.resume();
        reject(new Error(`[TheSports] HTTP ${status}`));
        return;
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("[TheSports] رد غير صالح (JSON)"));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("[TheSports] انتهت المهلة")));
    req.on("error", reject);
  });
}

async function tsGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const user = (process.env.THESPORTS_USER || "").trim();
  const secret = (process.env.THESPORTS_SECRET || "").trim();
  if (!user || !secret) throw new Error("THESPORTS_USER / THESPORTS_SECRET غير مضبوطين");

  const url = new URL(`${TS_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("user", user);
  url.searchParams.set("secret", secret);

  let json: any;
  try {
    json = await httpsGetJson(url, TS_HTTP_TIMEOUT_MS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // المهلة = المزود بطيء؛ إعادة المحاولة تضاعف انتظار المستخدم (~8ث) بلا فائدة.
    // نعيد المحاولة فقط لأعطال شبكة عابرة (hang up / reset).
    if (msg.includes("انتهت المهلة") || /timeout/i.test(msg)) throw err;
    await new Promise((r) => setTimeout(r, 150));
    json = await httpsGetJson(url, Math.min(TS_HTTP_TIMEOUT_MS, 2500));
  }
  // الأخطاء تأتي 200 بجسم {err:"..."} (نقطة محجوبة / IP غير مُدرَج)
  if (json && typeof json === "object" && "err" in json) {
    throw new Error(`[TheSports] ${json.err}`);
  }
  return json;
}

// ───────────────────── أسماء المزوّد متعدّدة اللغات (language/list) ─────────────────────
// TheSports تُتيح أسماء الكيانات بلغات عدّة عبر نقطة `language/list`: ترجّع لكل id
// حقولًا مثل `name_ar` (الأسماء الموجودة فقط). نطلب بالـuuid المستهدف فقط (لاعبو
// المباراة الحاليّون) بدل تحميل القاموس الكامل (مئات الآلاف). أفضل جهد تامّ: أي
// تعذّر → نُرجع null فيتراجع المستدعي للتعريب المحلي (worldCupNameTranslator).
//
// type: 1-category · 2-country · 3-competition · 4-team · 5-player · 6-injury
export const TS_I18N_TYPE = { category: 1, country: 2, competition: 3, team: 4, player: 5, injury: 6 } as const;

const I18N_TTL = 24 * 60 * 60 * 1000; // الأسماء شبه ثابتة
const i18nCache = new Map<string, string>(); // `${type}:${id}` → الاسم العربي (name_aa)
const i18nMissing = new Set<string>(); // معرّفات بلا ترجمة (لا نكرّر طلبها)

// العربية في TheSports هي الحقل `name_aa` (لا `name_ar`) — تحقّق حيّ 2026‑06‑23.
// عند غياب العربية نأخذ `name_en` بدل عرض المعرّف الخام.
const I18N_NAME_FIELD = "name_aa";
const I18N_NAME_EN_FIELD = "name_en";
// `language/list` **لا يدعم uuid متعدّدًا** (تحقّق حيّ): النداء بـuuid واحد فقط.
// فنطلب واحدًا تلو الآخر بتزامن محدود، ونحدّ العدد لكل استدعاء حمايةً للحصة.
const I18N_MAX_LOOKUPS = 80;
const I18N_CONCURRENCY = 6;

/** معرّفات TheSports القصيرة (مثل 23xmvkh4dzdqg8n) — ليست أسماء للعرض. */
function looksLikeTsUuid(s: string): boolean {
  const t = s.trim();
  return t.length >= 10 && t.length <= 24 && /^[a-z0-9]+$/i.test(t);
}

export function isTsLanguageEnabled(): boolean {
  // لم تعد تتطلّب THESPORTS_LANG — الأسماء العربية (name_aa) تُجلب متى توفّر الاشتراك.
  return isTheSportsConfigured();
}

/**
 * يحلّ الأسماء العربية (`name_aa`) لمجموعة معرّفات كيان من نوع واحد، ثم يعيد دالة
 * بحث متزامنة. أفضل جهد: يجلب غير المُكاش (uuid واحد/نداء، تزامن محدود) ويتجاهل أي
 * فشل. ملاحظة (PR #450): الحقل `name_aa` لا `name_ar`، والنداء مفرد لا متعدّد.
 */
export async function resolveTsNames(
  type: number,
  ids: (string | null | undefined)[],
): Promise<(id: string | null | undefined) => string | null> {
  const lookup = (id: string | null | undefined): string | null =>
    id ? i18nCache.get(`${type}:${id}`) ?? null : null;
  if (!isTheSportsConfigured() || Date.now() < tsCooldownUntil) return lookup;

  const want = Array.from(
    new Set(ids.filter((x): x is string => !!x && x.trim().length > 0).map((x) => x.trim())),
  )
    .filter((id) => !i18nCache.has(`${type}:${id}`) && !i18nMissing.has(`${type}:${id}`))
    .slice(0, I18N_MAX_LOOKUPS);
  if (want.length === 0) return lookup;

  for (let i = 0; i < want.length; i += I18N_CONCURRENCY) {
    const slice = want.slice(i, i + I18N_CONCURRENCY);
    await Promise.all(
      slice.map(async (id) => {
        try {
          const data = await withSWR(`ts:lang:${type}:${id}`, I18N_TTL, I18N_TTL, () =>
            tsGet("language/list", { type: String(type), uuid: id }),
          );
          const row = Array.isArray(data?.results) ? data.results[0] : null;
          const ar = typeof row?.[I18N_NAME_FIELD] === "string" ? row[I18N_NAME_FIELD].trim() : "";
          const en = typeof row?.[I18N_NAME_EN_FIELD] === "string" ? row[I18N_NAME_EN_FIELD].trim() : "";
          const name = ar || en;
          if (name) i18nCache.set(`${type}:${id}`, name);
          else i18nMissing.add(`${type}:${id}`); // موجود بلا اسم — لا نكرّر
        } catch {
          // مهلة/تهدئة عابرة — لا نُعلّم missing؛ المستدعي يتراجع بهدوء.
        }
      }),
    );
  }
  return lookup;
}

// مفتاح يوم diary (YYYYMMDD). مهم: TheSports يفهرس الـdiary بتوقيت بكين (UTC+8)
// لا UTC — فمباراة 17:00 UTC تقع تحت اليوم التالي. نحسب المفتاح بإزاحة ساعات.
function dateKeyAt(timestampSec: number, offsetHours: number): string {
  const d = new Date((timestampSec + offsetHours * 3600) * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

// مفاتيح أيام مرشّحة للجسر: يوم بكين (الصحيح) + UTC + جواره ليومٍ احتياطًا ضد أي
// التباس توقيت. مكرّرات تُزال. الحلّ يحدث مرّةً ثم يُكاش المعرّف، فلا تكرار.
function candidateDateKeys(timestampSec: number): string[] {
  const keys = [
    dateKeyAt(timestampSec, 8), // بكين (UTC+8) — ما يستخدمه diary فعليًا
    dateKeyAt(timestampSec, 0), // UTC
    dateKeyAt(timestampSec, 32), // اليوم التالي بتوقيت بكين
    dateKeyAt(timestampSec, -16), // اليوم السابق بتوقيت بكين
  ];
  return [...new Set(keys)];
}

// جدول يوم كامل (كل البطولات: مُعرّفات + أوقات + نتائج) — يُكاش طويلًا ويُشارَك
// بين كل البطولات (نداء diary واحد لليوم يخدم المونديال والدوري السعودي وغيرها).
async function getDiaryRaw(dateKey: string): Promise<any[]> {
  const data = await withSWR(
    `ts:diary:${dateKey}`,
    BRIDGE_TTL,
    BRIDGE_TTL * 2,
    () => tsGet("match/diary", { date: dateKey })
  );
  return Array.isArray(data?.results) ? data.results : [];
}

// حلّ معرّف مباراة TheSports لمباراتنا عبر الجسر (بطولة + وقت بداية).
//
// التعميم خارج المونديال: نفلتر diary على competitionId ثم نطابق وقت البداية
// بسماحية دقيقتين. **شرط الأمان: تطابق فريد** — إن وُجدت أكثر من مباراة في نفس
// البطولة بنفس التوقيت (جولة دوري بمواعيد متزامنة، أو الجولة الأخيرة لمجموعات
// المونديال) نمتنع عن الربط ونرجع null، فلا نخاطر بربط خاطئ يعطي نتيجة مباراة
// أخرى. يتراجع المستدعي بهدوء لـSportMonks/API-Football. (الأسماء محجوبة في
// diary، فلا يمكن فضّ الالتباس بالأسماء بعد — يأتي لاحقًا عبر results_extra.)
export async function resolveTsMatchId(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string
): Promise<string | null> {
  const cached = matchIdBridge.get(fixtureId);
  if (cached) return cached;
  if (!kickoffTs || !competitionId) return null;

  for (const dateKey of candidateDateKeys(kickoffTs)) {
    const day = await getDiaryRaw(dateKey);
    const candidates = day.filter(
      (m) =>
        m.competition_id === competitionId &&
        Math.abs((m.match_time ?? 0) - kickoffTs) <= 120
    );
    // التباس (مباريات متزامنة في نفس البطولة) → لا نخمّن.
    if (candidates.length > 1) return null;
    if (candidates.length === 1 && candidates[0]?.id) {
      matchIdBridge.set(fixtureId, candidates[0].id);
      return candidates[0].id;
    }
  }
  return null;
}

// كل المباريات الجارية الآن (نداء واحد يخدم جميع المباريات) — يُكاش بالثواني.
// يرجع كل عنصر بحقوله الكاملة: score + stats + incidents + tlive — فنقرأ النتيجة
// والأحداث والإحصاءات والتعليق من النداء نفسه بلا تكلفة شبكة إضافية.
// طبقة MQTT تُدمَج فوق REST بعد الكاش: أي دفعة WebSocket تفوز فورًا دون انتظار
// دورة الاستطلاع، وحتى أثناء تهدئة REST إن بقيت لقطات MQTT حيّة.
async function getLiveMap(): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (!(Date.now() < tsCooldownUntil)) {
    try {
      const data = await withSWR(
        "ts:detail_live",
        LIVE_TTL,
        LIVE_SWR,
        () => tsGet("match/detail_live")
      );
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      for (const m of results) if (m?.id) map.set(String(m.id), m);
    } catch (e) {
      // لا نرمي هنا — قد تكفي طبقة MQTT. المستدعي الأعلى يلتقط الفشل عبر
      // getLiveEntry/getTheSports* عند فراغ الخريطة.
      armCooldown(e);
    }
  }

  pruneMqttLive();
  for (const [id, slot] of mqttLiveById) {
    const merged = mergeMqttLiveEntry(
      map.get(id) && typeof map.get(id) === "object" ? map.get(id) : undefined,
      slot.entry,
    );
    map.set(id, merged);
  }
  return map;
}

// عنصر detail_live الخام لمباراتنا (بعد حلّ الجسر) — مصدر مشترك للنتيجة والأحداث.
async function getLiveEntry(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string
): Promise<any | null> {
  const tsMatchId = await resolveTsMatchId(fixtureId, kickoffTs, competitionId);
  if (!tsMatchId) return null;
  const liveMap = await getLiveMap();
  return liveMap.get(String(tsMatchId)) ?? null;
}

export interface TsFastScore {
  home: number;
  away: number;
  penHome: number | null;
  penAway: number | null;
  statusId: number;
  live: boolean;
  finished: boolean;
  /** دقيقة المباراة المحسوبة من طابع بداية المرحلة لدى TheSports. */
  elapsed: number | null;
  /** بدل الضائع ضمن المرحلة الحالية. */
  extra: number | null;
  /** مرساة Unix لساعة المباراة كاملة، وليست ساعة الشوط فقط. */
  clockStartEpoch: number | null;
}

// score: [matchId, statusId, [home: reg,ht,red,yel,corner,ot,pen], [away...], ts, ""]
// خانات النتيجة (موثّقة من TheSports): 0=وقت أصلي 1=شوط أول 2=حمراء 3=صفراء
// 4=ركنيات 5=وقت إضافي 6=ركلات ترجيح. خوارزمية المجموع الرسمية: إن كان الوقت
// الإضافي ≠ 0 فالنتيجة المعروضة هي مجموع الوقت الإضافي (يتضمّن الـ90د)، وإلا
// فهي الوقت الأصلي؛ والركلات تُعرَض منفصلةً. هذا يصحّح أدوار خروج المغلوب —
// دور المجموعات بلا إضافي/ركلات فالخانة [0] تكفي تلقائيًا.
function decodeScore(
  scoreArr: any
): {
  home: number;
  away: number;
  penHome: number | null;
  penAway: number | null;
  statusId: number;
  periodStartTs: number;
} | null {
  if (!Array.isArray(scoreArr) || scoreArr.length < 4) return null;
  const statusId = Number(scoreArr[1]);
  const homeArr = scoreArr[2];
  const awayArr = scoreArr[3];
  if (!Array.isArray(homeArr) || !Array.isArray(awayArr)) return null;
  // score[4] عند TheSports = طابع انطلاق «المرحلة الجارية» (يتحدّث لبداية الشوط
  // الثاني/الإضافي) — أساس حساب الدقيقة الصحيح لكل شوط. 0 إن غاب.
  const periodStartTs = scoreArr.length > 4 ? Number(scoreArr[4]) || 0 : 0;

  const reg = (a: any[]) => Number(a[0]) || 0;
  const ot = (a: any[]) => Number(a[5]) || 0;
  const pen = (a: any[]) => Number(a[6]) || 0;

  const otHome = ot(homeArr);
  const otAway = ot(awayArr);
  const useOvertime = otHome !== 0 || otAway !== 0;
  const penHomeVal = pen(homeArr);
  const penAwayVal = pen(awayArr);
  const hasPenalties = penHomeVal !== 0 || penAwayVal !== 0;

  return {
    home: useOvertime ? otHome : reg(homeArr),
    away: useOvertime ? otAway : reg(awayArr),
    penHome: hasPenalties ? penHomeVal : null,
    penAway: hasPenalties ? penAwayVal : null,
    statusId,
    periodStartTs,
  };
}

/**
 * دقيقة اللوحة العالمية محسوبة لكل شوط — بدل الفرق الساذج عن ضربة البداية الذي
 * كان يحسب استراحة الشوطين لعبًا (يعرض ~78' واللعب فعليًّا عند ~63').
 * الأساس: طابع بداية المرحلة الجارية `periodStartTs` (score[4])، وعند غيابه
 * تقدير من موعد المباراة بإزاحة المرحلة. الصيغة على اصطلاح المزوّدين:
 * elapsed حتى سقف الشوط، والفائض بدل ضائع في `extra` (45+x / 90+x).
 */
function tsBoardMinute(
  statusId: number,
  periodStartTs: number,
  matchTime: number,
  nowSec: number,
): { elapsed: number | null; extra: number | null } {
  const minutesSince = (start: number): number =>
    start > 0 ? Math.floor((nowSec - start) / 60) + 1 : 0;
  const phase = (
    base: number,
    cap: number,
    fallbackOffsetMin: number,
  ): { elapsed: number | null; extra: number | null } => {
    const start = periodStartTs > 0 ? periodStartTs : matchTime > 0 ? matchTime + fallbackOffsetMin * 60 : 0;
    const within = minutesSince(start);
    if (within <= 0) return { elapsed: Math.min(base + 1, cap), extra: null };
    const m = base + within;
    if (m <= cap) return { elapsed: Math.max(base + 1, m), extra: null };
    // بدل الضائع — بسقف أمان كي لا يتضخّم إن علِق المزوّد على حالة قديمة.
    return { elapsed: cap, extra: Math.min(m - cap, 15) };
  };
  switch (statusId) {
    case 2: return phase(0, 45, 0);        // الشوط الأول
    case 3: return { elapsed: 45, extra: null }; // استراحة
    case 4: return phase(45, 90, 60);      // الشوط الثاني (تقدير البداية: البداية+60د)
    case 5: return phase(90, 105, 110);    // الإضافي الأول
    case 6: return phase(105, 120, 130);   // الإضافي الثاني
    case 7: return { elapsed: null, extra: null }; // ركلات الترجيح — لا عدّاد
    default: return { elapsed: null, extra: null };
  }
}

// ───────────────────────── أحداث المباراة (incidents) ─────────────────────────
// خريطة أكواد TheSports وفق التعداد الرسمي (Status code → Technical statistics):
//   1 هدف · 8 هدف ركلة جزاء · 17 هدف عكسي · 3 صفراء · 4 حمراء · 15 صفراوان→حمراء ·
//   9 تبديل · 16 ركلة جزاء مهدرة · 19 وقت بدل ضائع · 28 VAR (يحمل var_reason/var_result).
//   أكواد دورية لا تعنينا: 10 بداية · 11 استراحة · 12 نهاية · 13 نتيجة الشوط → "other".
// تصويب (2026-07-02): الخريطة القديمة صنّفت 17 (هدف عكسي) و28 معًا «فار»، و11/12
// (استراحة/نهاية) «جزاء/جزاء مهدر» — فأطلقت إشعار «مراجعة الفار» زائفًا مع كل هدف
// عكسي وأخفت الجزاء المهدر الحقيقي (16). لا تُعِد القديمة دون الرجوع للتعداد الرسمي.
// position: 1=صاحب الأرض، 2=الضيف، 0=محايد.
export type TsEventType =
  | "goal"
  | "penalty_goal"
  | "own_goal"
  | "yellow"
  | "red"
  | "yellow_red"
  | "sub"
  | "penalty_missed"
  | "var"
  | "injury_time"
  | "other";

const INCIDENT_TYPE: Record<number, TsEventType> = {
  1: "goal",
  8: "penalty_goal",
  17: "own_goal",
  3: "yellow",
  4: "red",
  15: "yellow_red",
  9: "sub",
  16: "penalty_missed",
  28: "var",
  19: "injury_time",
};

// نتائج مراجعة الفار (var_result) معرّبة وفق التعداد الرسمي. تُستخدم لتسمية الحدث
// في مركز المباراة ولترشيح الإشعارات: المزوّد يرسل حادثة VAR أيضًا للفحص الروتيني
// الذي يلي كل هدف تقريبًا (تأكيد الهدف = 1) وللمراجعات غير المحسومة بعد (0) —
// وهذه لا تستحق إشعارًا دفعيًّا.
export const TS_VAR_RESULT_AR: Record<number, string> = {
  1: "تأكيد الهدف بعد مراجعة الفار",
  2: "إلغاء الهدف بعد مراجعة الفار",
  3: "احتساب ركلة جزاء بعد مراجعة الفار",
  4: "إلغاء ركلة الجزاء بعد مراجعة الفار",
  5: "تأكيد البطاقة الحمراء بعد مراجعة الفار",
  6: "إلغاء البطاقة الحمراء بعد مراجعة الفار",
  7: "ترقية البطاقة بعد مراجعة الفار",
  8: "إلغاء ترقية البطاقة بعد مراجعة الفار",
  9: "بقاء القرار بعد مراجعة الفار",
  10: "تغيير القرار بعد مراجعة الفار",
};

// النتائج التي تستحق إشعارًا دفعيًّا: قرار غيّر شيئًا (إلغاء/احتساب/تغيير). التأكيدات
// (1، 5، 7، 9) تلي أحداثًا أُشعِر بها أصلًا (هدف/بطاقة) أو لا تغيّر شيئًا — تجاهلها
// هو ما يمنع إشعار «مراجعة الفار» المتكرر بلا مراجعة فعلية.
export const TS_VAR_DECISIVE_RESULTS = new Set([2, 3, 4, 6, 8, 10]);

export interface TsEvent {
  rawType: number;
  type: TsEventType;
  team: "home" | "away" | null;
  minute: number;
  second: number | null;
  player: string | null;
  playerId: string | null;
  assist: string | null;
  inPlayer: string | null;
  outPlayer: string | null;
  homeScore: number | null;
  awayScore: number | null;
  varReason: number | null;
  varResult: number | null;
}

function teamFromPosition(p: any): "home" | "away" | null {
  const n = Number(p);
  return n === 1 ? "home" : n === 2 ? "away" : null;
}

function decodeEvents(incidents: any): TsEvent[] {
  if (!Array.isArray(incidents)) return [];
  return incidents
    .map((inc): TsEvent => ({
      rawType: Number(inc?.type) || 0,
      type: INCIDENT_TYPE[Number(inc?.type)] ?? "other",
      team: teamFromPosition(inc?.position),
      minute: Number(inc?.time) || 0,
      second: inc?.second != null ? Number(inc.second) : null,
      player: inc?.player_name ?? null,
      playerId: inc?.player_id ?? null,
      assist: inc?.assist1_name ?? null,
      inPlayer: inc?.in_player_name ?? null,
      outPlayer: inc?.out_player_name ?? null,
      homeScore: inc?.home_score != null ? Number(inc.home_score) : null,
      awayScore: inc?.away_score != null ? Number(inc.away_score) : null,
      varReason: inc?.var_reason != null ? Number(inc.var_reason) : null,
      varResult: inc?.var_result != null ? Number(inc.var_result) : null,
    }))
    .sort((a, b) => (a.second ?? a.minute * 60) - (b.second ?? b.minute * 60));
}

// ───────────────────────── إحصاءات حيّة (stats) ─────────────────────────
// أكواد TheSports: 25 استحواذ% · 21 تسديد على المرمى · 22 خارج المرمى ·
//   23 هجمات · 24 هجمات خطرة · 2 ركنيات · 3 بطاقات صفراء · 4 بطاقات حمراء.
export interface TsLiveStats {
  possession?: [number, number];
  shotsOnTarget?: [number, number];
  shotsOffTarget?: [number, number];
  attacks?: [number, number];
  dangerousAttacks?: [number, number];
  corners?: [number, number];
  yellow?: [number, number];
  red?: [number, number];
}

const STAT_TYPE: Record<number, keyof TsLiveStats> = {
  25: "possession",
  21: "shotsOnTarget",
  22: "shotsOffTarget",
  23: "attacks",
  24: "dangerousAttacks",
  2: "corners",
  3: "yellow",
  4: "red",
};

function decodeStats(stats: any): TsLiveStats | null {
  if (!Array.isArray(stats) || stats.length === 0) return null;
  const out: TsLiveStats = {};
  for (const s of stats) {
    const key = STAT_TYPE[Number(s?.type)];
    if (key) out[key] = [Number(s?.home) || 0, Number(s?.away) || 0];
  }
  return Object.keys(out).length ? out : null;
}

// ───────────────────────── تعليق نصّي مباشر (tlive) ─────────────────────────
export interface TsCommentaryItem {
  minute: string;
  text: string;
  position: number;
}

function decodeCommentary(tlive: any): TsCommentaryItem[] {
  if (!Array.isArray(tlive)) return [];
  return tlive
    .filter((t) => t && t.data)
    .map((t) => ({
      minute: String(t.time ?? ""),
      text: String(t.data),
      position: Number(t.position) || 0,
    }));
}

export interface TsMatchLive extends TsFastScore {
  events: TsEvent[];
  stats: TsLiveStats | null;
  commentary: TsCommentaryItem[];
}

function buildFastScore(
  decoded: NonNullable<ReturnType<typeof decodeScore>>,
  matchTime = 0,
): TsFastScore {
  const nowSec = Math.floor(Date.now() / 1000);
  const { elapsed, extra } = tsBoardMinute(
    decoded.statusId,
    decoded.periodStartTs,
    matchTime,
    nowSec,
  );
  const phaseBase: Record<number, number> = { 2: 0, 4: 45, 5: 90, 6: 105 };
  const base = phaseBase[decoded.statusId];
  const played = (elapsed ?? 0) + (extra ?? 0);
  const clockStartEpoch = base != null && played > 0
    ? decoded.periodStartTs > 0
      ? decoded.periodStartTs - base * 60
      : nowSec - (played - 1) * 60
    : null;
  return {
    home: decoded.home,
    away: decoded.away,
    penHome: decoded.penHome,
    penAway: decoded.penAway,
    statusId: decoded.statusId,
    live: TS_LIVE_STATUS.has(decoded.statusId),
    finished: decoded.statusId === TS_FINISHED_STATUS,
    elapsed,
    extra,
    clockStartEpoch,
  };
}

/**
 * النتيجة اللحظية الفائقة لمباراة — أفضل جهد.
 * @param fixtureId معرّف مباراتنا (API-Football)
 * @param kickoffTs وقت البداية (ثوانٍ، UTC) — مفتاح الجسر
 * @param competitionId معرّف بطولة TheSports (افتراضيًا المونديال للتوافق الخلفي)
 * @returns النتيجة الحيّة من TheSports أو null للتراجع للمصدر الحالي
 */
export async function getTheSportsFastScore(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string = WC_COMPETITION_ID
): Promise<TsFastScore | null> {
  if (!isTheSportsConfigured()) return null;
  // لا نقطع عند التهدئة إن وُجدت طبقة MQTT — التهدئة تخص REST فقط.
  try {
    const live = await getLiveEntry(fixtureId, kickoffTs, competitionId);
    if (!live) return null; // ليست جارية الآن (منتهية/لم تبدأ) → اترك المصدر الحالي
    const decoded = decodeScore(live.score);
    if (!decoded) return null;
    return buildFastScore(decoded, kickoffTs);
  } catch (e) {
    // فشل جسر/شبكة — إن كان MQTT يحمل المباراة سيُغطّيها getLiveMap؛ هنا فشل كامل.
    armCooldown(e);
    return null;
  }
}

/**
 * لقطة حيّة كاملة لمباراة مونديال: النتيجة + الأحداث + الإحصاءات + التعليق —
 * كلّها من نداء detail_live المكاش نفسه (بلا تكلفة شبكة إضافية فوق fast score).
 * أفضل جهد: ترجع null عند أي فشل/تهدئة فيتراجع المستدعي لمصدره الحالي.
 */
export async function getTheSportsMatchLive(
  fixtureId: number,
  kickoffTs: number,
  competitionId: string = WC_COMPETITION_ID
): Promise<TsMatchLive | null> {
  if (!isTheSportsConfigured()) return null;
  try {
    const live = await getLiveEntry(fixtureId, kickoffTs, competitionId);
    if (!live) return null;
    const decoded = decodeScore(live.score);
    if (!decoded) return null;
    return {
      ...buildFastScore(decoded, kickoffTs),
      events: decodeEvents(live.incidents),
      stats: decodeStats(live.stats),
      commentary: decodeCommentary(live.tlive),
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

/**
 * لقطة حيّة كاملة لمباراة عبر معرّف TheSports الخام (uuid) مباشرةً — بلا جسر
 * diary. تُستخدم لمباريات «عالمية» القادمة من لوحة detail_live (لا مقابل لها في
 * API-Football)، حيث نملك uuid المباراة أصلًا. أفضل جهد: null عند أي فشل/تهدئة.
 */
export async function getTheSportsMatchLiveByUuid(
  matchUuid: string
): Promise<TsMatchLive | null> {
  if (!isTheSportsConfigured()) return null;
  try {
    const live = (await getLiveMap()).get(String(matchUuid));
    if (!live) return null;
    const decoded = decodeScore(live.score);
    if (!decoded) return null;
    return {
      ...buildFastScore(decoded),
      events: decodeEvents(live.incidents),
      stats: decodeStats(live.stats),
      commentary: decodeCommentary(live.tlive),
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// ───────────────────── بيانات إثرائية شبه ثابتة (additional/list, market) ─────────────────────
// نقاط مُفعَّلة في الباقة (متحقَّق منها 2026‑06‑23): team/additional/list (uuid مفرد)،
// competition/additional/list، player/market/list (uuid مفرد)، match/recent/list.
// كلّها أفضل جهد: أي فشل/تهدئة/IP غير مُدرَج → null فيتراجع المستدعي بهدوء.
const EXTRA_TTL = 24 * 60 * 60 * 1000; // بيانات شبه ثابتة (قيمة سوقية/تأسيس/حامل لقب)

export interface TsTeamExtra {
  id: string;
  name: string;
  logo: string;
  marketValue: number | null;
  marketValueCurrency: string;
  foundation: number | null;
  totalPlayers: number | null;
  coachId: string | null;
  venueId: string | null;
}

export async function getTsTeamExtra(uuid: string): Promise<TsTeamExtra | null> {
  if (!uuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:team:extra:${uuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("team/additional/list", { uuid }),
    );
    const r = Array.isArray(data?.results) ? data.results[0] : null;
    if (!r?.id) return null;
    return {
      id: String(r.id),
      name: typeof r.name === "string" ? r.name : "",
      logo: typeof r.logo === "string" ? r.logo : "",
      marketValue: typeof r.market_value === "number" && r.market_value > 0 ? r.market_value : null,
      marketValueCurrency: typeof r.market_value_currency === "string" ? r.market_value_currency : "€",
      foundation: typeof r.foundation_time === "number" && r.foundation_time > 0 ? r.foundation_time : null,
      totalPlayers: typeof r.total_players === "number" && r.total_players > 0 ? r.total_players : null,
      coachId: r.coach_id ? String(r.coach_id) : null,
      venueId: r.venue_id ? String(r.venue_id) : null,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// المدرّب والملعب — معلومات أساسية (BASIC INFO). متحقَّق حيًّا (2026‑06‑24): كلاهما
// عبر `?uuid=<id>` المفرد (دلالة الـuuid = معرّف الكيان نفسه؛ round‑trip صحيح). معرّفا
// المدرّب/الملعب لمنتخبٍ يأتيان من `team/additional/list` (coach_id/venue_id)، ولمباراة
// من `match/lineup/detail` (coach_id) و`match` (venue_id/referee_id). أفضل جهد كالعادة.

export interface TsCoach {
  id: string;
  name: string;
  /** صورة المدرّب (قد تكون فارغة) */
  logo: string;
  /** الخطة المفضّلة مثل "4-3-3" — null إن غابت */
  preferredFormation: string | null;
  age: number | null;
  /** معرّف جنسية المدرّب (country_id) — يُحلّ لاسم عربي عبر i18n type 2 */
  countryId: string | null;
}

export async function getTsCoach(coachId: string): Promise<TsCoach | null> {
  if (!coachId || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:coach:${coachId}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("coach/list", { uuid: coachId }),
    );
    const r = Array.isArray(data?.results) ? data.results[0] : null;
    if (!r?.id || !r?.name) return null;
    return {
      id: String(r.id),
      name: String(r.name),
      logo: typeof r.logo === "string" ? r.logo : "",
      preferredFormation:
        typeof r.preferred_formation === "string" && r.preferred_formation.trim()
          ? r.preferred_formation.trim()
          : null,
      age: typeof r.age === "number" && r.age > 0 ? r.age : null,
      countryId: r.country_id ? String(r.country_id) : null,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

export interface TsVenue {
  id: string;
  name: string;
  capacity: number | null;
  city: string;
  /** اسم الدولة (إنجليزي كما يرده المزوّد) — null إن غاب */
  country: string | null;
  countryId: string | null;
}

export async function getTsVenue(venueId: string): Promise<TsVenue | null> {
  if (!venueId || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:venue:${venueId}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("venue/list", { uuid: venueId }),
    );
    const r = Array.isArray(data?.results) ? data.results[0] : null;
    if (!r?.id || !r?.name) return null;
    return {
      id: String(r.id),
      name: String(r.name),
      capacity: typeof r.capacity === "number" && r.capacity > 0 ? r.capacity : null,
      city: typeof r.city === "string" ? r.city : "",
      country: typeof r.country === "string" && r.country.trim() ? r.country.trim() : null,
      countryId: r.country_id ? String(r.country_id) : null,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

export interface TsCompetitionExtra {
  id: string;
  name: string;
  logo: string;
  curSeasonId: string | null;
  titleHolderTeamId: string | null;
  titleHolderCount: number | null;
  mostTitlesTeamIds: string[];
  mostTitlesCount: number | null;
  host: string | null;
}

export async function getTsCompetitionExtra(uuid: string): Promise<TsCompetitionExtra | null> {
  if (!uuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:comp:extra:${uuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("competition/additional/list", { uuid }),
    );
    const r = Array.isArray(data?.results) ? data.results[0] : null;
    if (!r?.id) return null;
    // title_holder: [team_id, titles] · most_titles: [[team_id,...], titles]
    const th = Array.isArray(r.title_holder) ? r.title_holder : [];
    const mt = Array.isArray(r.most_titles) ? r.most_titles : [];
    return {
      id: String(r.id),
      name: typeof r.name === "string" ? r.name : "",
      logo: typeof r.logo === "string" ? r.logo : "",
      curSeasonId: r.cur_season_id ? String(r.cur_season_id) : null,
      titleHolderTeamId: th[0] ? String(th[0]) : null,
      titleHolderCount: typeof th[1] === "number" ? th[1] : null,
      mostTitlesTeamIds: Array.isArray(mt[0]) ? mt[0].map((x: any) => String(x)) : [],
      mostTitlesCount: typeof mt[1] === "number" ? mt[1] : null,
      host: r.host?.country ? String(r.host.country) : null,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// أزواج فرق مباريات بطولة في موسم معيّن (للجسر عبر مطابقة وقت البداية) — من
// match/recent/list (يُرجع كل مباريات البطولة بأوقاتها ومعرّفات فريقيها ومعرّف
// المباراة `id`). نُضمّن `id` ليخدم جسر معرّف المباراة (قنوات البثّ/الإحصاء).
export interface TsMatchPair {
  id: string; // معرّف مباراة TheSports (uuid) — لجسر المباراة
  home: string;
  away: string;
  time: number;
}

export async function getTsCompetitionMatchPairs(
  competitionId: string,
  seasonId: string | null,
): Promise<TsMatchPair[]> {
  if (!competitionId || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(
      `ts:recent:${competitionId}`,
      6 * 60 * 60 * 1000,
      12 * 60 * 60 * 1000,
      () => tsGet("match/recent/list", { competition_id: competitionId }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    // المزوّد يتجاهل معامل competition_id فعليًا (متحقَّق 2026-07-04: يرجع صفحة
    // عامة لكل البطولات) — الفلترة المحلية عليه إلزامية وليست احتياطًا.
    return rows
      .filter((m) => m.competition_id === competitionId && (!seasonId || m.season_id === seasonId) && m.home_team_id && m.away_team_id && m.match_time)
      .map((m) => ({
        id: m.id != null ? String(m.id) : "",
        home: String(m.home_team_id),
        away: String(m.away_team_id),
        time: Number(m.match_time),
      }));
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── قنوات بثّ المباراة (match/tv/list) ─────────────────────
// نقطة مؤكَّدة من الدعم (2026‑06‑23): تُرجع قنوات بثّ مباراة بمعرّفها (uuid).
// أفضل جهد: أي فشل → [] فلا قسم بثّ. كاش 6س (القنوات شبه ثابتة قبل المباراة).
//
// ⚠️ أسماء الحقول غير متحقَّقة حيًّا — تحليل دفاعي: اسم القناة، الدولة، الرابط، الشعار.
export interface TsTvChannel {
  name: string;
  country: string | null;
  url: string | null;
  logo: string | null;
}

export async function getTsMatchTv(matchUuid: string): Promise<TsTvChannel[]> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:tv:${matchUuid}`, 6 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, () =>
      tsGet("match/tv/list", { uuid: matchUuid }),
    );
    // الشكل المتحقَّق (2026‑06‑23): results[0].tv = [{ country_id, names: [..] }]
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const entries: any[] = Array.isArray(results[0]?.tv) ? results[0].tv : [];
    const out: TsTvChannel[] = [];
    const seen = new Set<string>();
    for (const e of entries) {
      const names: any[] = Array.isArray(e?.names) ? e.names : [];
      for (const nm of names) {
        if (typeof nm !== "string" || !nm.trim()) continue;
        const key = nm.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: nm.trim(), country: null, url: null, logo: null });
      }
    }
    // نُبرز beIN (صاحب حقوق المونديال في الخليج/الشرق الأوسط) أولًا، ثم نحدّ الضجيج
    out.sort((a, b) => (/bein/i.test(b.name) ? 1 : 0) - (/bein/i.test(a.name) ? 1 : 0));
    return out.slice(0, 6);
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── إحصاء المباراة المفصّل (match/team_stats/detail) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑23)**: `results` مصفوفة من كائنين (فريق لكل
// كائن)، كلٌّ مسطّح بحقول **مسمّاة**: `team_id` + `ball_possession, shots,
// shots_on_target, passes, passes_accuracy, corner_kicks, fouls, offsides,
// yellow_cards, red_cards, tackles, interceptions, ...`. نُرجع جانبَي الفريقين
// خامًّا (teamId + القيم)؛ التسمية والإقران (مضيف/ضيف) في worldCupService.
// أفضل جهد: أي فشل → [].
export interface TsTeamStatSide {
  teamId: string;
  values: Record<string, number>;
}

export async function getTsMatchTeamStats(matchUuid: string): Promise<TsTeamStatSide[]> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:teamstats:${matchUuid}`, 2 * 60 * 1000, 30 * 60 * 1000, () =>
      tsGet("match/team_stats/detail", { uuid: matchUuid }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    return rows
      .filter((r) => r?.team_id)
      .map((r) => {
        const values: Record<string, number> = {};
        for (const [k, v] of Object.entries(r)) {
          if (k === "team_id") continue;
          const n = Number(v);
          if (Number.isFinite(n)) values[k] = n;
        }
        return { teamId: String(r.team_id), values };
      });
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── تصنيف فيفا للمنتخبات (ranking/fifa/men) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑23)**: `results` كائن فيه `items[]`، وكل عنصر:
// `{ team:{id,name,logo}, region_id, ranking, points, previous_points, position_changed }`.
// `team.id` يطابق جسرنا مباشرة (لا مطابقة أسماء). تُحدَّث ~شهريًّا فنُكاشها طويلًا.
// أفضل جهد: أي فشل → خريطة فارغة فلا إثراء (لا عطل).
export interface TsFifaRank {
  teamId: string;       // معرّف فريق TheSports (uuid) — يطابق الجسر
  rank: number;         // ترتيب المنتخب عالميًّا
  points: number | null;
  change: number | null; // عدد المراكز المتغيّرة (position_changed: موجب = صعد ▲، سالب = نزل ▼)
}

function pickNum(...vals: any[]): number | null {
  for (const v of vals) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function getTsFifaRanking(): Promise<Map<string, TsFifaRank>> {
  if (!isTheSportsConfigured() || Date.now() < tsCooldownUntil) return new Map();
  try {
    const data = await withSWR("ts:fifa:men", EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("ranking/fifa/men"),
    );
    // الاستجابة المتحقَّقة: results = { pub_time, pub_times, items: [...] }
    const r0 = Array.isArray(data?.results) ? data.results[0] : data?.results;
    const rows: any[] = Array.isArray(r0?.items) ? r0.items : [];
    const map = new Map<string, TsFifaRank>();
    for (const r of rows) {
      const teamId = r?.team?.id != null ? String(r.team.id) : "";
      const rank = pickNum(r?.ranking, r?.rank) ?? 0;
      if (!teamId || !rank) continue;
      const points = pickNum(r?.points);
      // التغيّر المتحقَّق: position_changed (موجب=صعد ▲، سالب=نزل ▼).
      const change = pickNum(r?.position_changed);
      map.set(teamId, { teamId, rank, points, change });
    }
    return map;
  } catch (e) {
    armCooldown(e);
    return new Map();
  }
}

// ───────────────────── إصابات/غيابات الفريق (team/injury/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑23)**: `results[0].injury` مصفوفة عناصر:
// `{ player_id, competition_id, type, injury_id, reason, start_time, end_time, missed_matches }`.
// **لا اسم لاعب في الرد** (يُحلّ بالاسم العربي عبر language/list type 5)، و`reason`
// نصّ إنجليزي ("Calf Injury") يُعرَّب في worldCupService. أفضل جهد: أي فشل → [].
export interface TsInjury {
  playerId: string | null;
  reason: string | null;    // نصّ إنجليزي — يُعرَّب لاحقًا
  injuryId: string | null;  // معرّف نوع الإصابة
  startTime: number | null;
  endTime: number | null;
  missedMatches: number | null;
}

export async function getTsTeamInjuries(uuid: string): Promise<TsInjury[]> {
  if (!uuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:injury:${uuid}`, 6 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, () =>
      tsGet("team/injury/list", { uuid }),
    );
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    const injuries: any[] = Array.isArray(results[0]?.injury) ? results[0].injury : [];
    return injuries.map((r) => ({
      playerId: r?.player_id != null ? String(r.player_id) : null,
      reason: typeof r?.reason === "string" && r.reason.trim() ? r.reason.trim() : null,
      injuryId: r?.injury_id != null ? String(r.injury_id) : null,
      startTime: pickNum(r?.start_time),
      endTime: pickNum(r?.end_time),
      missedMatches: pickNum(r?.missed_matches),
    }));
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── زخم/ضغط المباراة (match/trend/detail) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results = { count, per, data:[[...],[...]] }`.
// `data` مصفوفة أشواط (count شوطًا، per دقيقة لكل شوط)، كل قيمة −100..100 = صافي
// الزخم اللحظي لتلك الدقيقة (موجب = هجمة المضيف، سالب = هجمة الضيف). نسطّح الأشواط
// إلى سلسلة دقيقة‑بدقيقة. أفضل جهد: أي فشل → null فيتراجع المستدعي لـSportMonks.
export interface TsTrend {
  perMinutes: number; // دقائق لكل شوط (عادة 45)
  values: { minute: number; value: number }[]; // مسطّحة عبر الأشواط (value: −100..100)
}

export async function getTsMatchTrend(matchUuid: string): Promise<TsTrend | null> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:trend:${matchUuid}`, LIVE_TTL, LIVE_SWR, () =>
      tsGet("match/trend/detail", { uuid: matchUuid }),
    );
    const r = data?.results;
    const per = pickNum(r?.per) ?? 45;
    const halves: any[] = Array.isArray(r?.data) ? r.data : [];
    const values: { minute: number; value: number }[] = [];
    halves.forEach((half, h) => {
      if (!Array.isArray(half)) return;
      half.forEach((v: any, i: number) => {
        const n = Number(v);
        if (Number.isFinite(n)) values.push({ minute: h * per + i + 1, value: n });
      });
    });
    if (values.length === 0) return null;
    return { perMinutes: per, values };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// ───────────────────── التشكيلات والخطط (match/lineup/detail) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results = { confirmed, home_formation,
// away_formation, coach_id:{home,away}, lineup:{home:[],away:[]}, injury:[] }`. كل
// لاعب: `{ id, first(1=أساسي), captain, name, logo, shirt_number, position, x, y, rating }`.
// الأسماء إنجليزية → نُعرّبها عبر resolveTsNames(type player). أفضل جهد: أي فشل → null.
export interface TsLineupPlayer {
  id: string;
  name: string;        // خام (إنجليزي) — للمطابقة
  nameAr: string | null; // معرَّب (name_aa) إن توفّر
  starter: boolean;
  captain: boolean;
  shirtNumber: number | null;
  position: string | null;
  x: number | null;    // 0..100 (عمق الملعب) — قد يكون 0 لبعض المباريات
  y: number | null;    // 0..100 (عرض الملعب)
  rating: number | null;
  photo: string | null;
}
export interface TsLineup {
  confirmed: boolean;
  homeFormation: string | null;
  awayFormation: string | null;
  home: TsLineupPlayer[];
  away: TsLineupPlayer[];
}

export async function getTsLineup(matchUuid: string): Promise<TsLineup | null> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return null;
  try {
    const data = await withSWR(`ts:lineup:${matchUuid}`, 60 * 1000, 5 * 60 * 1000, () =>
      tsGet("match/lineup/detail", { uuid: matchUuid }),
    );
    const r = data?.results;
    if (!r) return null;
    const lp = r.lineup ?? {};
    const mapSide = (arr: any): TsLineupPlayer[] =>
      (Array.isArray(arr) ? arr : []).map((p: any): TsLineupPlayer => {
        const rt = Number(p?.rating);
        return {
          id: p?.id != null ? String(p.id) : "",
          name: typeof p?.name === "string" ? p.name : "",
          nameAr: null,
          starter: Number(p?.first) === 1,
          captain: Number(p?.captain) === 1,
          shirtNumber: pickNum(p?.shirt_number),
          position: typeof p?.position === "string" && p.position ? p.position : null,
          x: pickNum(p?.x),
          y: pickNum(p?.y),
          rating: Number.isFinite(rt) && rt > 0 ? rt : null,
          photo: typeof p?.logo === "string" && p.logo ? p.logo : null,
        };
      });
    const home = mapSide(lp.home);
    const away = mapSide(lp.away);
    if (home.length === 0 && away.length === 0) return null;
    // تعريب أسماء اللاعبين (name_aa) دفعةً واحدة
    const lookup = await resolveTsNames(
      TS_I18N_TYPE.player,
      [...home, ...away].map((p) => p.id),
    );
    for (const p of [...home, ...away]) p.nameAr = lookup(p.id);
    return {
      confirmed: Number(r?.confirmed) === 1,
      homeFormation: typeof r?.home_formation === "string" && r.home_formation ? r.home_formation : null,
      awayFormation: typeof r?.away_formation === "string" && r.away_formation ? r.away_formation : null,
      home,
      away,
    };
  } catch (e) {
    armCooldown(e);
    return null;
  }
}

// ───────────────────── قائمة المنتخب (team/squad/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results[0] = { id, team, squad:[
// { player:{id,name}, position, shirt_number } ] }`. تُستخدم كجسر لربط لاعبي
// API-Football (بالاسم/الرقم) بمعرّفات TheSports (للقيمة السوقية وتاريخها).
export interface TsSquadPlayer {
  id: string;
  name: string; // إنجليزي
  position: string | null;
  shirtNumber: number | null;
}

export async function getTsTeamSquad(teamUuid: string): Promise<TsSquadPlayer[]> {
  if (!teamUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:squad:${teamUuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("team/squad/list", { uuid: teamUuid }),
    );
    const r0 = Array.isArray(data?.results) ? data.results[0] : null;
    const sq: any[] = Array.isArray(r0?.squad) ? r0.squad : [];
    return sq
      .map((s: any): TsSquadPlayer => ({
        id: s?.player?.id != null ? String(s.player.id) : "",
        name: typeof s?.player?.name === "string" ? s.player.name : "",
        position: typeof s?.position === "string" && s.position ? s.position : null,
        shirtNumber: pickNum(s?.shirt_number),
      }))
      .filter((p) => p.id);
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── القيمة السوقية للاعبين (player/with_stat/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: لكل لاعب `{ id, market_value,
// market_value_currency, ability, ... }`. نطلب على مستوى البطولة (نداء واحد مكاش
// طويلًا) ونعيد خريطة uuid → القيمة السوقية. أفضل جهد: أي فشل → خريطة فارغة.
export interface TsPlayerMarket {
  marketValue: number | null;
  currency: string;
}

export async function getTsCompetitionPlayerMarket(
  competitionId: string,
): Promise<Map<string, TsPlayerMarket>> {
  if (!competitionId || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return new Map();
  try {
    const data = await withSWR(`ts:pstat:${competitionId}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("player/with_stat/list", { competition_id: competitionId }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    const map = new Map<string, TsPlayerMarket>();
    for (const r of rows) {
      const id = r?.id != null ? String(r.id) : "";
      if (!id) continue;
      const mv = pickNum(r?.market_value);
      map.set(id, {
        marketValue: mv != null && mv > 0 ? mv : null,
        currency: typeof r?.market_value_currency === "string" && r.market_value_currency ? r.market_value_currency : "€",
      });
    }
    return map;
  } catch (e) {
    armCooldown(e);
    return new Map();
  }
}

// ───────────────────── تاريخ القيمة السوقية للاعب (player/market/list) ─────────────────────
// نقطة + بنية **متحقَّقة حيًّا (2026‑06‑24)**: `results[0] = { id, history:[
// { market_time, market_value, market_value_currency, team_id, age } ] }`. أفضل جهد: [].
export interface TsMarketPoint {
  time: number; // ثوانٍ (epoch)
  value: number;
  currency: string;
  age: number | null;
}

export async function getTsPlayerMarketHistory(playerUuid: string): Promise<TsMarketPoint[]> {
  if (!playerUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(`ts:market:${playerUuid}`, EXTRA_TTL, EXTRA_TTL * 2, () =>
      tsGet("player/market/list", { uuid: playerUuid }),
    );
    const r0 = Array.isArray(data?.results) ? data.results[0] : null;
    const hist: any[] = Array.isArray(r0?.history) ? r0.history : [];
    return hist
      .map((h: any): TsMarketPoint => ({
        time: pickNum(h?.market_time) ?? 0,
        value: pickNum(h?.market_value) ?? 0,
        currency: typeof h?.market_value_currency === "string" && h.market_value_currency ? h.market_value_currency : "€",
        age: pickNum(h?.age),
      }))
      .filter((h) => h.time > 0 && h.value > 0)
      .sort((a, b) => a.time - b.time);
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── إحصاء الفريق للموسم (season/recent/team/stat) ─────────────────────
// نقطة ADVANCED DATA (Season team statistics/newest season) — مؤكَّدة من الدعم
// 2026‑06‑24. بنية متحقَّقة حيًّا: `results` مصفوفة (منتخب لكل عنصر):
// `{ team:{id,name,logo}, matches, goals, goals_against, ball_possession, shots,
//    shots_on_target, passes, passes_accuracy(عدد مكتمل لا نسبة), key_passes,
//    big_chance_created, corner_kicks, tackles, interceptions, duels, duels_won,
//    fouls, yellow_cards, red_cards, … }`. نُرجع لكل فريق teamId+name+logo+القيم
// الخام المسمّاة. أفضل جهد: أي فشل → [].
export interface TsSeasonTeamStat {
  teamId: string;
  name: string;
  logo: string;
  values: Record<string, number>;
}

export async function getTsSeasonTeamStats(seasonUuid: string): Promise<TsSeasonTeamStat[]> {
  if (!seasonUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(
      `ts:seasonteamstat:${seasonUuid}`,
      30 * 60 * 1000,
      60 * 60 * 1000,
      () => tsGet("season/recent/team/stat", { uuid: seasonUuid }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    return rows
      .filter((r) => r?.team?.id)
      .map((r) => {
        const values: Record<string, number> = {};
        for (const [k, v] of Object.entries(r)) {
          if (k === "team") continue;
          const n = Number(v);
          if (Number.isFinite(n)) values[k] = n;
        }
        return {
          teamId: String(r.team.id),
          name: typeof r.team.name === "string" ? r.team.name : "",
          logo: typeof r.team.logo === "string" ? r.team.logo : "",
          values,
        };
      });
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

// ───────────────────── إحصاء اللاعب لكل مباراة (match/player_stats/detail) ─────────────────────
// نقطة BASIC DATA (Player statistics/historical matches) — مؤكَّدة من الدعم 2026‑06‑24.
// بنية متحقَّقة حيًّا: `results` مصفوفة (≈52 صفًّا)، كلٌّ مسطّح بحقول مسمّاة:
// `{ player_id, team_id, first(1=أساسي), minutes_played, rating, goals, penalty,
//    assists, shots, shots_on_target, passes, passes_accuracy, key_passes,
//    dribble(_succ), tackles, interceptions, clearances, duels(_won), fouls,
//    was_fouled, offsides, dispossessed, saves, … }`. أسماء اللاعبين تُحلّ بالعربية
// عبر language/list type5 (`name_aa`) في worldCupService. أفضل جهد: أي فشل → [].
export interface TsPlayerMatchStat {
  playerId: string;
  teamId: string;
  starter: boolean;     // first === 1
  minutes: number;      // minutes_played
  rating: number | null;
  values: Record<string, number>;
}

// ───────────────────── لوحة المباريات الجارية (لقسم «عالمية») ─────────────────────
// detail_live يعطي النتيجة فقط؛ diary لنفس اليوم يزوّد competition/home/away/match_time.
// الأسماء عبر language/list. أفضل جهد: أي فشل/تهدئة → [].

const TS_BOARD_NOISE_RE = /friendl|reserve|amateur|ودّي|ودي|احتياط|هواة/i;
const TS_BOARD_FRIENDLY_RE = /friendl|ودّي|ودي/i;

const TS_STATUS_META: Record<number, { code: string; label: string }> = {
  2: { code: "1H", label: "الشوط الأول" },
  3: { code: "HT", label: "استراحة" },
  4: { code: "2H", label: "الشوط الثاني" },
  5: { code: "ET", label: "وقت إضافي" },
  6: { code: "ET", label: "وقت إضافي" },
  7: { code: "PEN", label: "ركلات ترجيح" },
};

export interface TsLiveBoardItem {
  matchId: string;
  competitionId: string;
  competitionName: string;
  competitionLogo: string | null;
  country: string;
  homeTeamId: string;
  awayTeamId: string;
  homeName: string;
  awayName: string;
  homeLogo: string;
  awayLogo: string;
  goalsHome: number;
  goalsAway: number;
  penHome: number | null;
  penAway: number | null;
  statusId: number;
  live: boolean;
  finished: boolean;
  matchTime: number;
  statusCode: string;
  statusLabel: string;
  elapsed: number | null;
  /** دقائق بدل الضائع المحتسبة (45+x ⇒ elapsed=45, extra=x) — null إن لا بدل. */
  extra: number | null;
}

type TsBoardBuildMode = "world" | "saudi-friendlies";

/** كاش لوحة TheSports — بلاه كان كل نبض /live يعيد بناء إثراء كل مباريات العالم. */
const TS_LIVE_BOARD_TTL = 8 * 1000;
const TS_LIVE_BOARD_SWR = 20 * 1000;

/**
 * كل المباريات الجارية من TheSports مع أسماء البطولة/الفريق — مصدر احتياطي
 * لقائمة «عالمية» عندما يكون API-Football فارغًا أو فقيرًا.
 */
export async function getTheSportsLiveBoard(): Promise<TsLiveBoardItem[]> {
  if (!isTheSportsConfigured()) return [];
  return withSWR("ts:live_board:world", TS_LIVE_BOARD_TTL, TS_LIVE_BOARD_SWR, () =>
    buildTheSportsLiveBoard("world"),
  );
}

/**
 * ودّيات أندية سعودية فقط — مسار خفيف للوحات today/live.
 * لا يُثري أسماء/شعارات كل مباريات العالم (ذلك كان سبب البطء بعد تفعيل الودّيات).
 */
export async function getTheSportsSaudiFriendlyLiveBoard(): Promise<TsLiveBoardItem[]> {
  if (!isTheSportsConfigured()) return [];
  return withSWR("ts:live_board:saudi-friendlies", TS_LIVE_BOARD_TTL, TS_LIVE_BOARD_SWR, () =>
    buildTheSportsLiveBoard("saudi-friendlies"),
  );
}

async function buildTheSportsLiveBoard(mode: TsBoardBuildMode): Promise<TsLiveBoardItem[]> {
  try {
    const liveMap = await getLiveMap();
    if (liveMap.size === 0) return [];

    const liveRows: { id: string; decoded: NonNullable<ReturnType<typeof decodeScore>>; raw: any }[] = [];
    for (const [id, raw] of liveMap) {
      const decoded = decodeScore(raw?.score);
      if (!decoded || !TS_LIVE_STATUS.has(decoded.statusId)) continue;
      liveRows.push({ id: String(id), decoded, raw });
    }
    if (liveRows.length === 0) return [];

    // فهرس diary لليوم (بكين + جوار) — بالتوازي لا تسلسليًا.
    const nowSec = Math.floor(Date.now() / 1000);
    const diaryById = new Map<string, any>();
    const diaryDays = await Promise.all(candidateDateKeys(nowSec).map((key) => getDiaryRaw(key)));
    for (const day of diaryDays) {
      for (const m of day) {
        if (m?.id == null) continue;
        const mid = String(m.id);
        if (!diaryById.has(mid)) diaryById.set(mid, m);
      }
    }

    type Enriched = {
      id: string;
      decoded: NonNullable<ReturnType<typeof decodeScore>>;
      competitionId: string;
      homeTeamId: string;
      awayTeamId: string;
      matchTime: number;
    };
    const enriched: Enriched[] = [];
    for (const row of liveRows) {
      const d = diaryById.get(row.id);
      const competitionId = String(d?.competition_id ?? row.raw?.competition_id ?? "").trim();
      const homeTeamId = String(d?.home_team_id ?? row.raw?.home_team_id ?? "").trim();
      const awayTeamId = String(d?.away_team_id ?? row.raw?.away_team_id ?? "").trim();
      const matchTime = Number(d?.match_time ?? row.raw?.match_time ?? 0) || 0;
      if (!competitionId || !homeTeamId || !awayTeamId) continue;
      enriched.push({
        id: row.id,
        decoded: row.decoded,
        competitionId,
        homeTeamId,
        awayTeamId,
        matchTime,
      });
    }
    if (enriched.length === 0) return [];

    // 1) أسماء البطولات أولًا — لفرز الودّيات قبل إثراء مئات الفرق.
    const uniqueComps = [...new Set(enriched.map((e) => e.competitionId))];
    const extras = new Map<string, TsCompetitionExtra>();
    const compTr = await resolveTsNames(TS_I18N_TYPE.competition, uniqueComps);
    await Promise.all(
      uniqueComps.slice(0, 40).map(async (cid) => {
        const ex = await getTsCompetitionExtra(cid);
        if (ex) extras.set(cid, ex);
      }),
    );

    const competitionNameOf = (competitionId: string): string => {
      const ex = extras.get(competitionId);
      let competitionName =
        compTr(competitionId) || (ex?.name?.trim() ? ex.name.trim() : "") || "";
      if (!competitionName || looksLikeTsUuid(competitionName)) {
        competitionName = ex?.name?.trim() && !looksLikeTsUuid(ex.name) ? ex.name.trim() : "بطولة";
      }
      return competitionName;
    };

    const isFriendlyComp = (competitionId: string, competitionName: string): boolean => {
      const ex = extras.get(competitionId);
      return (
        TS_BOARD_FRIENDLY_RE.test(competitionName) ||
        (ex?.name ? TS_BOARD_FRIENDLY_RE.test(ex.name) : false)
      );
    };

    let candidates = enriched;
    if (mode === "saudi-friendlies") {
      candidates = enriched.filter((e) => isFriendlyComp(e.competitionId, competitionNameOf(e.competitionId)));
      if (candidates.length === 0) return [];
    }

    const teamIds = [...new Set(candidates.flatMap((e) => [e.homeTeamId, e.awayTeamId]))];
    const teamTr = await resolveTsNames(TS_I18N_TYPE.team, teamIds);

    const teamExtraNames = new Map<string, string>();
    const teamExtraLogos = new Map<string, string>();
    for (let i = 0; i < teamIds.length; i += I18N_CONCURRENCY) {
      const slice = teamIds.slice(i, i + I18N_CONCURRENCY);
      await Promise.all(
        slice.map(async (tid) => {
          const ex = await getTsTeamExtra(tid);
          if (!ex) return;
          const name = ex.name?.trim() ?? "";
          if (name && !looksLikeTsUuid(name)) teamExtraNames.set(tid, name);
          if (ex.logo?.trim()) teamExtraLogos.set(tid, ex.logo.trim());
        }),
      );
    }

    const resolveTeamName = (id: string): string | null => {
      const arOrEn = teamTr(id);
      if (arOrEn && !looksLikeTsUuid(arOrEn)) return arOrEn;
      const fromExtra = teamExtraNames.get(id);
      if (fromExtra) return fromExtra;
      return null;
    };

    const out: TsLiveBoardItem[] = [];
    for (const e of candidates) {
      const ex = extras.get(e.competitionId);
      const competitionName = competitionNameOf(e.competitionId);
      const homeName = resolveTeamName(e.homeTeamId);
      const awayName = resolveTeamName(e.awayTeamId);
      if (!homeName || !awayName) continue;

      const friendly =
        isFriendlyComp(e.competitionId, competitionName) ||
        (ex?.name ? TS_BOARD_FRIENDLY_RE.test(ex.name) : false);
      const saudiClub =
        looksLikeSaudiClubTeamName(homeName) || looksLikeSaudiClubTeamName(awayName);

      if (mode === "saudi-friendlies") {
        if (!friendly || !saudiClub) continue;
      } else {
        // عالمية: ودّيات/احتياط/هواة = ضجيج — استثناء ودّية فيها نادٍ سعودي.
        const noisy =
          TS_BOARD_NOISE_RE.test(competitionName) ||
          (ex?.name ? TS_BOARD_NOISE_RE.test(ex.name) : false);
        if (noisy && !(friendly && saudiClub)) continue;
      }

      const meta = TS_STATUS_META[e.decoded.statusId] ?? { code: "LIVE", label: "مباشر" };
      const { elapsed, extra } = tsBoardMinute(
        e.decoded.statusId,
        e.decoded.periodStartTs,
        e.matchTime,
        nowSec,
      );

      out.push({
        matchId: e.id,
        competitionId: e.competitionId,
        competitionName,
        competitionLogo: ex?.logo?.trim() ? ex.logo : null,
        country: ex?.host?.trim() ? ex.host.trim() : "",
        homeTeamId: e.homeTeamId,
        awayTeamId: e.awayTeamId,
        homeName,
        awayName,
        homeLogo: teamExtraLogos.get(e.homeTeamId) ?? "",
        awayLogo: teamExtraLogos.get(e.awayTeamId) ?? "",
        goalsHome: e.decoded.home,
        goalsAway: e.decoded.away,
        penHome: e.decoded.penHome,
        penAway: e.decoded.penAway,
        statusId: e.decoded.statusId,
        live: true,
        finished: false,
        matchTime: e.matchTime,
        statusCode: meta.code,
        statusLabel: meta.label,
        elapsed,
        extra,
      });
    }
    return out;
  } catch (e) {
    armCooldown(e);
    return [];
  }
}

export async function getTsMatchPlayerStats(matchUuid: string): Promise<TsPlayerMatchStat[]> {
  if (!matchUuid || !isTheSportsConfigured() || Date.now() < tsCooldownUntil) return [];
  try {
    const data = await withSWR(
      `ts:playerstats:${matchUuid}`,
      2 * 60 * 1000,
      30 * 60 * 1000,
      () => tsGet("match/player_stats/detail", { uuid: matchUuid }),
    );
    const rows: any[] = Array.isArray(data?.results) ? data.results : [];
    return rows
      .filter((r) => r?.player_id)
      .map((r) => {
        const values: Record<string, number> = {};
        for (const [k, v] of Object.entries(r)) {
          if (k === "player_id" || k === "team_id") continue;
          const n = Number(v);
          if (Number.isFinite(n)) values[k] = n;
        }
        return {
          playerId: String(r.player_id),
          teamId: r?.team_id != null ? String(r.team_id) : "",
          starter: Number(r?.first) === 1,
          minutes: pickNum(r?.minutes_played) ?? 0,
          rating: pickNum(r?.rating),
          values,
        };
      });
  } catch (e) {
    armCooldown(e);
    return [];
  }
}
