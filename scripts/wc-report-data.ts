/**
 * مولّد حزمة بيانات تقرير كأس العالم الاستقصائي.
 *
 * يسحب البيانات المعرّبة الجاهزة من API الإنتاج (api.sabq.org) — نتائج المباريات،
 * أحداث كل مباراة (أهداف/بطاقات)، إحصائيات الفرق، الهدّافين، تصنيف FIFA — ثم يحسب
 * المجاميع (معدلات التهديف بحسب الأدوار، أكبر فوز، أسرع هدف، الريمونتادات،
 * الشباك النظيفة، الانضباط، مقارنة منتخبات دور الثمانية) ويكتب ملفًا واحدًا
 * يضمّ البرومبت التحريري + البيانات، جاهزًا للإلصاق في أي نموذج ذكاء اصطناعي.
 *
 * التشغيل:  npx tsx scripts/wc-report-data.ts
 * الخرج:    outputs/wc-report-prompt.md
 * لا يحتاج مفاتيح ولا قاعدة بيانات — fetch فقط، ويُعاد تشغيله بعد كل مباراة
 * فيضمّ تلقائيًّا كل ما انتهى حتى لحظة التشغيل.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API_BASE = process.env.WC_API_BASE || "https://api.sabq.org";
const OUT_PATH = join(process.cwd(), "outputs", "wc-report-prompt.md");
const CONCURRENCY = 6;

// ---------- أنواع مطابقة لِما يعيده /api/world-cup ----------

interface Team { id: number; name: string; fifaRank?: number | null }
interface Fixture {
  id: number;
  date: string;
  timestamp: number;
  status: { code: string; finished: boolean };
  round: string;
  roundEn: string;
  venue: { name: string; city: string };
  home: Team;
  away: Team;
  goals: { home: number | null; away: number | null };
  penalties: { home: number | null; away: number | null } | null;
}
interface MatchEvent {
  minute: number;
  extraMinute: number | null;
  teamId: number;
  type: string;
  detail: string;
  player: string;
  assist: string | null;
}
interface Statistic { key: string; label: string; home: string; away: string }
interface Rating { name: string; teamId: number; rating: number; minutes: number; goals: number; assists: number }
interface MatchDetail { fixture: Fixture; events: MatchEvent[]; statistics: Statistic[]; ratings: Rating[] }
interface Scorer { rank: number; name: string; team: Team; goals: number; assists: number; penalties: number; matches: number }

async function getJson<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return (await res.json()) as T;
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((r) => setTimeout(r, 1_500 * (attempt + 1)));
    }
  }
}

/** تنفيذ متوازٍ بسقف ثابت — يكفي لأن الإنتاج يكاش الردود أصلًا. */
async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i]);
      }
    }),
  );
  return out;
}

// ---------- تصنيف الأدوار ----------

type Stage = "group" | "r32" | "r16" | "qf" | "later";
function stageOf(roundEn: string): Stage {
  if (roundEn.startsWith("Group Stage")) return "group";
  if (roundEn === "Round of 32") return "r32";
  if (roundEn === "Round of 16") return "r16";
  if (roundEn === "Quarter-finals") return "qf";
  return "later";
}
const STAGE_AR: Record<Stage, string> = {
  group: "دور المجموعات",
  r32: "دور الـ32",
  r16: "دور الـ16",
  qf: "ربع النهائي",
  later: "أدوار لاحقة",
};

// ---------- أدوات مساعدة ----------

const fmtDate = (iso: string) => iso.slice(0, 10);
const minuteLabel = (e: MatchEvent) => (e.extraMinute ? `${e.minute}+${e.extraMinute}'` : `${e.minute}'`);
const num = (s: string) => Number.parseFloat(String(s).replace("%", "")) || 0;

/** بعض أسماء TheSports تأتي بصيغة «اللقب, الاسم» — نعيدها إلى الترتيب الطبيعي. */
const fixName = (name: string) =>
  name.includes(",") ? name.split(",").map((p) => p.trim()).reverse().join(" ") : name;

/** أحداث الأهداف الحقيقية: يقصّ ركلات الترجيح التي يخلطها المزوّد أحيانًا كأهداف د120. */
function realGoalEvents(fx: Fixture, events: MatchEvent[]): MatchEvent[] {
  const goals = events
    .filter((e) => e.type === "goal" && e.detail !== "Missed Penalty")
    .sort((a, b) => a.minute + (a.extraMinute ?? 0) / 100 - (b.minute + (b.extraMinute ?? 0) / 100));
  const official = (fx.goals.home ?? 0) + (fx.goals.away ?? 0);
  while (goals.length > official && goals[goals.length - 1].minute >= 120) goals.pop();
  return goals;
}

/** لمن يُحسب الهدف (منطق creditedWcGoalCounts في worldCupService). */
function creditsHome(fx: Fixture, e: MatchEvent): boolean {
  const scoredByHome = e.teamId === fx.home.id;
  return e.detail === "Own Goal" ? !scoredByHome : scoredByHome;
}

function winnerOf(fx: Fixture): Team | null {
  const h = fx.goals.home ?? 0;
  const a = fx.goals.away ?? 0;
  if (h > a) return fx.home;
  if (a > h) return fx.away;
  if (fx.penalties) return (fx.penalties.home ?? 0) > (fx.penalties.away ?? 0) ? fx.home : fx.away;
  return null;
}

// ---------- التنفيذ ----------

async function main() {
  console.log(`⏳ سحب البيانات من ${API_BASE} ...`);
  const [{ fixtures }, { scorers }, { teams }] = await Promise.all([
    getJson<{ fixtures: Fixture[] }>("/api/world-cup/fixtures"),
    getJson<{ scorers: Scorer[] }>("/api/world-cup/scorers"),
    getJson<{ teams: Team[] }>("/api/world-cup/teams"),
  ]);

  const finished = fixtures
    .filter((f) => f.status.finished && stageOf(f.roundEn) !== "later")
    .sort((a, b) => a.timestamp - b.timestamp);
  console.log(`✔ ${finished.length} مباراة منتهية حتى الآن — سحب تفاصيلها...`);

  let done = 0;
  const details = await pool(finished, async (f) => {
    const d = await getJson<MatchDetail>(`/api/world-cup/match/${f.id}`);
    done++;
    if (done % 20 === 0) console.log(`  ... ${done}/${finished.length}`);
    return d;
  });
  const detailById = new Map(details.map((d) => [d.fixture.id, d]));

  // ---------- المجاميع ----------

  const stages: Stage[] = ["group", "r32", "r16", "qf"];
  const perStage = stages.map((s) => {
    const ms = finished.filter((f) => stageOf(f.roundEn) === s);
    const goals = ms.reduce((sum, f) => sum + (f.goals.home ?? 0) + (f.goals.away ?? 0), 0);
    return { stage: s, matches: ms.length, goals, avg: ms.length ? goals / ms.length : 0 };
  });
  const totalGoals = perStage.reduce((s, r) => s + r.goals, 0);

  let yellow = 0, red = 0, pensScored = 0, ownGoals = 0;
  const teamYellow = new Map<number, number>();
  const teamRed = new Map<number, number>();
  const redList: string[] = [];
  interface GoalRow { fx: Fixture; e: MatchEvent }
  const allGoals: GoalRow[] = [];

  for (const f of finished) {
    const d = detailById.get(f.id);
    if (!d) continue;
    for (const e of realGoalEvents(f, d.events)) {
      allGoals.push({ fx: f, e });
      if (e.detail === "Penalty") pensScored++;
      if (e.detail === "Own Goal") ownGoals++;
    }
    for (const e of d.events) {
      if (e.type === "yellow-card") {
        yellow++;
        teamYellow.set(e.teamId, (teamYellow.get(e.teamId) ?? 0) + 1);
      } else if (e.type === "red-card") {
        red++;
        teamRed.set(e.teamId, (teamRed.get(e.teamId) ?? 0) + 1);
        const side = e.teamId === f.home.id ? f.home.name : f.away.name;
        redList.push(`${fixName(e.player)} (${side}) — ${minuteLabel(e)} في ${f.home.name} × ${f.away.name} (${f.round})`);
      }
    }
  }

  const etMatches = finished.filter((f) => f.status.code === "AET" || f.status.code === "PEN");
  const penMatches = finished.filter((f) => f.status.code === "PEN");

  // توزيع الأهداف على فترات المباراة. المزوّد يطوي بدل الضائع في الدقيقة 90
  // نفسها (لا 90+X)، فالشوط الثاني هنا يشمل بدل ضائعه، ونضيف مؤشر «أهداف
  // قاتلة» لما سُجّل من د90 فصاعدًا في الوقت الأصلي.
  const periods = { first: 0, second: 0, extra: 0, late: 0 };
  for (const { fx, e } of allGoals) {
    const wentToExtra = fx.status.code === "AET" || fx.status.code === "PEN";
    if (e.minute > 90 && wentToExtra) periods.extra++;
    else if (e.minute <= 45) periods.first++;
    else periods.second++;
    if (e.minute >= 90 && (e.minute === 90 || !wentToExtra)) periods.late++;
  }

  // أسرع هدف / أكبر فوز / أغزر مباراة
  const fastest = [...allGoals].sort((a, b) => a.e.minute - b.e.minute || (a.e.extraMinute ?? 0) - (b.e.extraMinute ?? 0))[0];
  const byDiff = [...finished].sort(
    (a, b) => Math.abs((b.goals.home ?? 0) - (b.goals.away ?? 0)) - Math.abs((a.goals.home ?? 0) - (a.goals.away ?? 0)),
  )[0];
  const byTotal = [...finished].sort(
    (a, b) => (b.goals.home ?? 0) + (b.goals.away ?? 0) - ((a.goals.home ?? 0) + (a.goals.away ?? 0)),
  )[0];

  // الريمونتادات: الفائز (في الوقت الأصلي/الإضافي) كان متأخرًا في لحظة ما
  const comebacks: string[] = [];
  for (const f of finished) {
    const d = detailById.get(f.id);
    const w = winnerOf(f);
    if (!d || !w) continue;
    let h = 0, a = 0, trailed = false;
    for (const e of realGoalEvents(f, d.events)) {
      creditsHome(f, e) ? h++ : a++;
      if ((w.id === f.home.id && h < a) || (w.id === f.away.id && a < h)) trailed = true;
    }
    if (trailed) {
      const pen = f.penalties ? ` (ركلات الترجيح ${f.penalties.home}-${f.penalties.away})` : "";
      comebacks.push(`${w.name} عاد من التأخر وفاز: ${f.home.name} ${f.goals.home}-${f.goals.away} ${f.away.name}${pen} — ${f.round}`);
    }
  }

  // الشباك النظيفة والأهداف المستقبلة لكل منتخب
  const cleanSheets = new Map<number, number>();
  const conceded = new Map<number, number>();
  const scored = new Map<number, number>();
  const played = new Map<number, number>();
  const teamName = new Map<number, string>();
  for (const f of finished) {
    for (const [side, other] of [[f.home, f.away], [f.away, f.home]] as const) {
      teamName.set(side.id, side.name);
      played.set(side.id, (played.get(side.id) ?? 0) + 1);
      const against = (side.id === f.home.id ? f.goals.away : f.goals.home) ?? 0;
      const forGoals = (side.id === f.home.id ? f.goals.home : f.goals.away) ?? 0;
      conceded.set(side.id, (conceded.get(side.id) ?? 0) + against);
      scored.set(side.id, (scored.get(side.id) ?? 0) + forGoals);
      if (against === 0) cleanSheets.set(side.id, (cleanSheets.get(side.id) ?? 0) + 1);
      void other;
    }
  }

  // منتخبات دور الثمانية: من شارك في مباريات ربع النهائي (منتهية أو مجدولة)
  const qfTeams = new Map<number, Team>();
  for (const f of fixtures.filter((x) => stageOf(x.roundEn) === "qf")) {
    for (const t of [f.home, f.away]) if (t.id > 0 && t.name && !t.name.startsWith("W")) qfTeams.set(t.id, t);
  }
  const fifaRank = new Map(teams.filter((t) => t.fifaRank != null).map((t) => [t.id, t.fifaRank as number]));

  // تجميع إحصائيات المباريات لكل منتخب ثُمني
  interface Agg { poss: number[]; shotsOn: number; shots: number; corners: number; passPct: number[] }
  const agg = new Map<number, Agg>();
  const statOf = (stats: Statistic[], key: string, side: "home" | "away") =>
    stats.find((s) => s.key === key)?.[side];
  for (const f of finished) {
    const d = detailById.get(f.id);
    if (!d?.statistics?.length) continue;
    for (const side of ["home", "away"] as const) {
      const t = f[side];
      if (!qfTeams.has(t.id)) continue;
      const a = agg.get(t.id) ?? { poss: [], shotsOn: 0, shots: 0, corners: 0, passPct: [] };
      const poss = statOf(d.statistics, "Ball Possession", side);
      const pass = statOf(d.statistics, "Passes %", side);
      if (poss) a.poss.push(num(poss));
      if (pass) a.passPct.push(num(pass));
      a.shotsOn += num(statOf(d.statistics, "Shots on Goal", side) ?? "0");
      a.shots += num(statOf(d.statistics, "Total Shots", side) ?? "0");
      a.corners += num(statOf(d.statistics, "Corner Kicks", side) ?? "0");
      agg.set(t.id, a);
    }
  }
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : "—");

  // نجوم الأرجنتين وسويسرا من تقييمات المباريات
  const focusNames = ["الأرجنتين", "سويسرا"];
  const focusTeams = [...qfTeams.values()].filter((t) => focusNames.includes(t.name));
  interface StarAgg { name: string; team: string; ratings: number[]; goals: number; assists: number; minutes: number }
  const stars = new Map<string, StarAgg>();
  for (const f of finished) {
    const d = detailById.get(f.id);
    if (!d?.ratings?.length) continue;
    for (const r of d.ratings) {
      const t = focusTeams.find((x) => x.id === r.teamId);
      if (!t || !r.rating) continue;
      const s = stars.get(`${t.id}:${r.name}`) ?? { name: fixName(r.name), team: t.name, ratings: [], goals: 0, assists: 0, minutes: 0 };
      s.ratings.push(r.rating);
      s.goals += r.goals;
      s.assists += r.assists;
      s.minutes += r.minutes;
      stars.set(`${t.id}:${r.name}`, s);
    }
  }
  const topStars = [...stars.values()]
    .filter((s) => s.minutes >= 90)
    .sort((a, b) => b.ratings.reduce((x, y) => x + y, 0) / b.ratings.length - a.ratings.reduce((x, y) => x + y, 0) / a.ratings.length)
    .slice(0, 12);

  // ---------- بناء الملف ----------

  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);

  push(PROMPT.trim(), "", "---", "", "# البيانات المرفقة", "");
  push(`> مصدر البيانات: اشتراكا سبق (API-Football + TheSports) عبر منصة سبق الرياضية. لُحظة السحب: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. المباريات المنتهية: ${finished.length}.`, "");

  // (أ) المجاميع المحسوبة
  push("## أ) لوحة المجاميع المحسوبة (أرقام مدقّقة آليًّا)", "");
  push(`- المباريات المكتملة: **${finished.length}** | إجمالي الأهداف: **${totalGoals}** | المعدل العام: **${(totalGoals / finished.length).toFixed(2)}** هدف/مباراة`);
  for (const r of perStage.filter((x) => x.matches > 0)) {
    push(`- ${STAGE_AR[r.stage]}: ${r.matches} مباراة، ${r.goals} هدفًا (معدل ${r.avg.toFixed(2)})`);
  }
  push(
    `- أهداف الجزاء (خلال اللعب): ${pensScored} | الأهداف العكسية: ${ownGoals}`,
    `- توزيع الأهداف: الشوط الأول ${periods.first} | الشوط الثاني (مع بدل ضائعه) ${periods.second} | الأشواط الإضافية ${periods.extra}`,
    `- أهداف قاتلة (من الدقيقة 90 فصاعدًا في الوقت الأصلي): ${periods.late}`,
    `- البطاقات: ${yellow} صفراء، ${red} حمراء`,
    `- مباريات حُسمت بعد وقت إضافي: ${etMatches.length} (منها ${penMatches.length} بركلات الترجيح)`,
  );
  if (fastest) {
    push(`- أسرع هدف: ${fixName(fastest.e.player)} (${fastest.e.teamId === fastest.fx.home.id ? fastest.fx.home.name : fastest.fx.away.name}) — الدقيقة ${minuteLabel(fastest.e)} في ${fastest.fx.home.name} × ${fastest.fx.away.name}`);
  }
  push(
    `- أكبر فوز: ${byDiff.home.name} ${byDiff.goals.home}-${byDiff.goals.away} ${byDiff.away.name} (${byDiff.round})`,
    `- أغزر مباراة تهديفًا: ${byTotal.home.name} ${byTotal.goals.home}-${byTotal.goals.away} ${byTotal.away.name} (${byTotal.round})`,
    "",
  );

  push("### الريمونتادات (فوز بعد تأخر في النتيجة)", "");
  push(...(comebacks.length ? comebacks.map((c) => `- ${c}`) : ["- لا توجد."]), "");

  push("### الطرد (البطاقات الحمراء)", "");
  push(...(redList.length ? redList.map((c) => `- ${c}`) : ["- لا توجد."]), "");

  // (ب) النتائج دورًا دورًا
  push("## ب) نتائج المباريات كاملة", "");
  for (const s of stages) {
    const ms = finished.filter((f) => stageOf(f.roundEn) === s);
    if (!ms.length) continue;
    push(`### ${STAGE_AR[s]}`, "", "| التاريخ | المباراة | النتيجة | ملاحظة | الملعب |", "|---|---|---|---|---|");
    for (const f of ms) {
      const pen = f.penalties ? `ترجيح ${f.penalties.home}-${f.penalties.away}` : f.status.code === "AET" ? "بعد وقت إضافي" : "";
      push(`| ${fmtDate(f.date)} | ${f.home.name} × ${f.away.name} | ${f.goals.home}-${f.goals.away} | ${pen} | ${f.venue.name} — ${f.venue.city} |`);
    }
    push("");
  }

  // (ج) سجل الأهداف مباراة بمباراة
  push("## ج) سجل الأهداف التفصيلي (الهدّاف، الدقيقة، الصناعة، النوع)", "");
  for (const f of finished) {
    const d = detailById.get(f.id);
    if (!d) continue;
    const goals = realGoalEvents(f, d.events);
    if (!goals.length) continue;
    const pen = f.penalties ? ` (ترجيح ${f.penalties.home}-${f.penalties.away})` : "";
    push(`**${f.home.name} ${f.goals.home}-${f.goals.away} ${f.away.name}${pen}** — ${f.round}، ${fmtDate(f.date)}:`);
    for (const e of goals) {
      const forTeam = creditsHome(f, e) ? f.home.name : f.away.name;
      const kind = e.detail === "Penalty" ? " (ركلة جزاء)" : e.detail === "Own Goal" ? " (هدف عكسي)" : "";
      const assist = e.assist ? `، صناعة: ${fixName(e.assist)}` : "";
      push(`- د${minuteLabel(e)} — ${fixName(e.player)}${kind} لمصلحة ${forTeam}${assist}`);
    }
    push("");
  }

  // (د) الهدّافون
  push("## د) ترتيب الهدّافين (المصدر الرسمي)", "", "| # | اللاعب | المنتخب | أهداف | صناعة | من جزاء | مباريات |", "|---|---|---|---|---|---|---|");
  for (const s of scorers.slice(0, 15)) {
    push(`| ${s.rank} | ${s.name} | ${s.team.name} | ${s.goals} | ${s.assists} | ${s.penalties} | ${s.matches} |`);
  }
  push("");

  // (هـ) دفاعات وهجوم كل المنتخبات
  push("## هـ) هجوم ودفاع المنتخبات (كل المشاركين)", "", "| المنتخب | لعب | سجّل | استقبل | شباك نظيفة |", "|---|---|---|---|---|");
  const teamRows = [...played.keys()].sort((a, b) => (scored.get(b) ?? 0) - (scored.get(a) ?? 0));
  for (const id of teamRows) {
    push(`| ${teamName.get(id)} | ${played.get(id)} | ${scored.get(id) ?? 0} | ${conceded.get(id) ?? 0} | ${cleanSheets.get(id) ?? 0} |`);
  }
  push("");

  // (و) مقارنة منتخبات دور الثمانية
  push("## و) مقارنة منتخبات دور الثمانية (مجمّعة من إحصائيات مبارياتهم)", "", "| المنتخب | تصنيف FIFA | استحواذ متوسط | دقة تمرير | تسديد على المرمى | تسديدات | ركنيات | بطاقات (ص/ح) |", "|---|---|---|---|---|---|---|---|");
  for (const t of [...qfTeams.values()].sort((a, b) => (fifaRank.get(a.id) ?? 999) - (fifaRank.get(b.id) ?? 999))) {
    const a = agg.get(t.id);
    push(`| ${t.name} | ${fifaRank.get(t.id) ?? "—"} | ${a ? avg(a.poss) + "%" : "—"} | ${a ? avg(a.passPct) + "%" : "—"} | ${a?.shotsOn ?? "—"} | ${a?.shots ?? "—"} | ${a?.corners ?? "—"} | ${teamYellow.get(t.id) ?? 0}/${teamRed.get(t.id) ?? 0} |`);
  }
  push("");

  // (ز) تصنيف FIFA للمودّعين البارزين — يترك للنموذج تحليل المفاجآت
  push("## ز) تصنيف FIFA لكل المنتخبات المشاركة", "");
  const ranked = teams.filter((t) => t.fifaRank != null).sort((a, b) => (a.fifaRank ?? 0) - (b.fifaRank ?? 0));
  push(ranked.map((t) => `${t.name} (${t.fifaRank})`).join("، "), "");

  // (ح) ملف الأرجنتين وسويسرا
  push("## ح) ملف موقعة ربع النهائي: الأرجنتين × سويسرا", "");
  for (const t of focusTeams) {
    push(`### مشوار ${t.name}`, "");
    for (const f of finished.filter((x) => x.home.id === t.id || x.away.id === t.id)) {
      const pen = f.penalties ? ` (ترجيح ${f.penalties.home}-${f.penalties.away})` : "";
      push(`- ${f.round}: ${f.home.name} ${f.goals.home}-${f.goals.away} ${f.away.name}${pen}`);
    }
    push("");
  }
  if (topStars.length) {
    push("### أبرز اللاعبين تقييمًا في المنتخبين (متوسط تقييم المباريات)", "", "| اللاعب | المنتخب | متوسط التقييم | أهداف | صناعة | دقائق |", "|---|---|---|---|---|---|");
    for (const s of topStars) {
      const mean = (s.ratings.reduce((x, y) => x + y, 0) / s.ratings.length).toFixed(2);
      push(`| ${s.name} | ${s.team} | ${mean} | ${s.goals} | ${s.assists} | ${s.minutes} |`);
    }
    push("");
  }

  mkdirSync(join(process.cwd(), "outputs"), { recursive: true });
  writeFileSync(OUT_PATH, L.join("\n"), "utf8");
  console.log(`✅ الملف جاهز للإلصاق: ${OUT_PATH} (${(L.join("\n").length / 1024).toFixed(0)} KB)`);
}

// ---------- البرومبت التحريري ----------

const PROMPT = `
أنت محرر بيانات رياضية أول في صحيفة سبق الإلكترونية، متخصص في التقارير الاستقصائية الرقمية.

## المهمة
اكتب تقريرًا استقصائيًّا بيانيًّا شاملًا عن بطولة كأس العالم، يغطي المسيرة الكاملة من المباراة الافتتاحية حتى آخر مباريات دور الثمانية (الأرجنتين × سويسرا)، اعتمادًا حصريًّا على البيانات المرفقة أدناه — لا تستخدم أي معلومة من ذاكرتك.

## القاعدة الذهبية
كل رقم في التقرير يجب أن يكون مأخوذًا من البيانات المرفقة فقط. إذا لم يتوفر رقم لمحور معيّن، تجاهل المحور ولا تقدّر أو تخمّن. ممنوع اختراع أي إحصائية أو نتيجة أو اسم لاعب.

## محاور التقرير المطلوبة (بهذا الترتيب)

1. **البطولة بالأرقام — لوحة سريعة**: عدد المباريات المكتملة، إجمالي الأهداف، معدل التهديف للمباراة، عدد البطاقات، عدد ركلات الجزاء، مباريات الأشواط الإضافية وركلات الترجيح.

2. **رحلة الأهداف**: مقارنة معدل التهديف بين دور المجموعات والأدوار الإقصائية، أكبر نتيجة في البطولة، أسرع هدف، المباريات التي شهدت "ريمونتادا" (انقلاب النتيجة)، توزيع الأهداف على أشواط المباراة (شوط أول / ثانٍ / إضافي).

3. **سباق الهدّافين**: ترتيب الهدّافين حتى الآن مع تفصيل (أهداف من جزاء / من اللعب المفتوح)، وصنّاع الأهداف، ومن يملك فرصة اللحاق بالصدارة في نصف النهائي.

4. **قراءة استقصائية في الأداء**: قارن بين المنتخبات الثمانية في دور الثمانية عبر مؤشرات: الاستحواذ، التسديدات على المرمى، دقة التمرير، الفرص المصنوعة — وأبرز أي فجوة بين "الأداء والنتيجة" (منتخب سيطر وخسر، أو منتخب انتظر وتأهل).

5. **المفاجآت والضحايا الكبار**: المنتخبات المصنّفة عالميًّا (حسب تصنيف FIFA المرفق) التي ودّعت مبكرًا، والمنتخبات التي تجاوزت توقعات تصنيفها، مع الأرقام التي تفسّر كل حالة.

6. **الحرّاس وخط الدفاع**: الشباك النظيفة، والمنتخب الأقل استقبالًا للأهداف.

7. **الانضباط**: البطاقات الصفراء والحمراء بحسب المنتخبات والأدوار، وأكثر مباراة سخونة تحكيميًّا.

8. **قبل موقعة الأرجنتين وسويسرا**: مقارنة رقمية مباشرة بين المنتخبين في هذه البطولة (مشوار كل منهما مباراة بمباراة، الأهداف، الأداء، أبرز نجم لكل منتخب بالأرقام)، وماذا تقول الأرقام عن ملامح المواجهة — دون جزم بالنتيجة.

## الأسلوب والصياغة
- عربية صحفية فصيحة بسيطة بأسلوب "سبق": جُمل قصيرة، لغة مباشرة، بلا حشو ولا مبالغات إنشائية.
- ابدأ بمقدمة سردية جذابة (60-80 كلمة) تلخّص "حكاية البطولة حتى الآن" بأبرز رقمين أو ثلاثة.
- كل محور بعنوان فرعي جذاب يتضمن رقمًا حيث أمكن (مثال: "47 هدفًا في 8 أيام").
- ادمج الأرقام داخل السرد ولا تسردها كقوائم جافة، مع جدول واحد على الأكثر لكل محور عند الحاجة.
- الأرقام بالأرقام الغربية (1، 2، 3)، وأسماء اللاعبين والمنتخبات كما وردت في البيانات المرفقة.
- الطول الإجمالي: 900 إلى 1200 كلمة.

## المخرجات
- عنوان رئيسي (لا يتجاوز 70 حرفًا) + عنوان تمهيدي (سطر واحد).
- موجز تنفيذي من 3 نقاط لأبرز الأرقام.
- نص التقرير بالمحاور أعلاه.
- خاتمة تربط الأرقام بما ينتظر الجماهير في نصف النهائي.
`;

main().catch((err) => {
  console.error("❌ فشل التوليد:", err);
  process.exit(1);
});
