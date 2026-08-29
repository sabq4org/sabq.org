/**
 * دورة رصد ساما — يستدعيها samaWatchJob كل دقيقة على القائد فقط.
 * لكل مصدر: هل حان وقته (watchCadence)؟ → اسحب → قارن بآخر مشاهدة → عند التغيّر:
 * سجّل، أبطل الكاش، ابثّ SSE، وافتح مهمة في غرفة العمليات للمؤشرات الخبرية.
 */
import { fetchIndicatorSnapshots, INDICATOR_DEFS, type EconomyIndicatorKey } from "../sama/samaIndicators";
import { fetchFxToday } from "../sama/samaFx";
import { fetchSamaNews } from "../sama/samaNews";
import { listReportFiles, REPORT_INDEX, type ReportKind } from "../sama/samaReports";
import { samaGetBuffer, isSamaEnabled } from "../sama/samaClient";
import { parsePosReport } from "../sama/parsers/posReport";
import { parseMoneySupplyReport } from "../sama/parsers/moneySupplyReport";
import { parseMonthlyBulletin } from "../sama/parsers/monthlyBulletin";
import { buildMonthlyStory } from "./monthlyStory";
import { buildWeeklySpendingStory, type WeeklySpendingStory } from "./weeklyStory";
import { createWeeklySpendingDraft, isEconomyAutoDraftsEnabled } from "./economyNewsGenerator";
import { insertReport, observe, reportExists } from "./economyStore";
import { publishEconomyUpdate } from "./economyStream";
import { isDue, WATCH_SOURCES, type WatchSource } from "./watchCadence";

const lastRun = new Map<WatchSource, Date>();
const lastError = new Map<WatchSource, string>();

export interface WatchCycleResult {
  ran: WatchSource[];
  changes: number;
  errors: Record<string, string>;
}

/** ما يُذكر في غرفة العمليات عند التغيّر. */
async function notifyOpsRoom(title: string, description: string, priority: "critical" | "high" | "normal", taskType: "breaking" | "standard" = "standard"): Promise<void> {
  try {
    const { createOpsTask } = await import("../opsRoom");
    await createOpsTask(
      { title, description, taskType, priority, origin: "system", input: { source: "sama" } },
      { id: "system:sama-watch", name: "رصد ساما" },
    );
  } catch (e) {
    console.warn("[SAMA Watch] ops room notify skipped:", (e as Error).message);
  }
}

async function watchIndicators(): Promise<number> {
  const snaps = await fetchIndicatorSnapshots();
  let changes = 0;
  for (const s of snaps) {
    const r = await observe({
      source: "sama_indicator",
      key: s.key,
      value: s.value,
      valueText: s.valueText,
      asOf: s.asOf,
      payload: { samaTitle: s.samaTitle, quarter: s.quarter, year: s.year, sourceId: s.sourceId },
    });
    if (!r.changed) continue;
    changes++;
    const prev = r.previous?.value ?? null;
    publishEconomyUpdate({ kind: "indicator", key: s.key, value: s.value, valueText: s.valueText, previous: prev, asOf: s.asOf, at: new Date().toISOString() });
    const def = INDICATOR_DEFS[s.key as EconomyIndicatorKey];
    const isRate = s.key === "repo" || s.key === "reverseRepo";
    const dir = prev !== null ? (s.value > prev ? "رفع" : s.value < prev ? "خفض" : "تثبيت") : "تحديث";
    await notifyOpsRoom(
      isRate ? `عاجل: ساما ${dir} ${def.shortAr} إلى ${s.valueText}` : `ساما تحدّث ${def.shortAr}: ${s.valueText}`,
      `${def.titleAr}: ${prev !== null ? `${prev}% → ` : ""}${s.valueText} (بيان ${s.asOf ?? "—"}). ${s.samaTitle}`,
      isRate ? "critical" : "high",
      isRate ? "breaking" : "standard",
    );
    console.log(`[SAMA Watch] ${s.key} ${prev} → ${s.value}`);
  }
  return changes;
}

async function watchFx(): Promise<number> {
  const rates = await fetchFxToday();
  let changes = 0;
  for (const f of rates) {
    if (f.code === "SAR") continue;
    const r = await observe({
      source: "sama_fx",
      key: `fx:${f.code}`,
      value: f.rate,
      valueText: String(f.rate),
      asOf: f.date,
      payload: { nameAr: f.nameAr, prevRate: f.prevRate, prevDate: f.prevDate, changePct: f.changePct, isGcc: f.isGcc },
    });
    if (r.changed) changes++;
  }
  if (changes) publishEconomyUpdate({ kind: "fx", key: "fx", asOf: rates[0]?.date ?? null, at: new Date().toISOString() });
  return changes;
}

async function watchNews(): Promise<number> {
  const items = await fetchSamaNews();
  let changes = 0;
  for (const n of items.slice(0, 10)) {
    const r = await observe({ source: "sama_news", key: `news:${n.id}`, value: n.id, valueText: n.title, asOf: n.publishedAt, payload: { ...n } });
    if (r.first) changes++;
  }
  if (changes) publishEconomyUpdate({ kind: "news", key: "news", at: new Date().toISOString() });
  return changes;
}

async function watchReport(kind: ReportKind): Promise<number> {
  const files = await listReportFiles(kind);
  const latest = files[0];
  if (!latest || (await reportExists(latest.fileName))) return 0;

  const buf = await samaGetBuffer(latest.url);
  let parsed: Record<string, unknown>;
  let periodStart: string | null = null, periodEnd: string | null = null;
  try {
    if (kind === "pos_weekly") {
      const report = await parsePosReport(buf);
      const story = buildWeeklySpendingStory(report);
      periodStart = story.periodStart; periodEnd = story.periodEnd;
      parsed = { report, story };
    } else if (kind === "money_supply_weekly") {
      const report = await parseMoneySupplyReport(buf);
      periodEnd = report.asOf;
      parsed = { report };
    } else if (kind === "monthly_bulletin") {
      // النشرة ضخمة (100 ورقة) — نخزّن السلاسل المستخرجة لا الملف
      const bulletin = parseMonthlyBulletin(buf);
      const story = buildMonthlyStory(bulletin);
      periodStart = `${bulletin.latestMonth}-01`;
      periodEnd = `${bulletin.latestMonth}-28`;
      parsed = { bulletin, story };
    } else {
      // الأصول الاحتياطية (Excel) — تُحفظ خامًا في هذه المرحلة، والتحليل في مرحلة لاحقة
      parsed = { rawSize: buf.length };
    }
  } catch (e) {
    await insertReport({ kind, fileName: latest.fileName, fileUrl: latest.url, publishedAt: latest.publishedAt, parsed: {}, status: "failed", error: (e as Error).message });
    await notifyOpsRoom(`تعذّر تحليل ${REPORT_INDEX[kind].titleAr}`, `الملف ${latest.fileName}: ${(e as Error).message}`, "high");
    throw e;
  }
  const row = await insertReport({ kind, fileName: latest.fileName, fileUrl: latest.url, publishedAt: latest.publishedAt, periodStart, periodEnd, parsed });
  publishEconomyUpdate({ kind: "report", key: kind, asOf: periodEnd, at: new Date().toISOString() });
  const story = (parsed as { story?: WeeklySpendingStory }).story;
  let draftNote = "القسم الحي تحدّث تلقائيًا.";
  if (story && kind === "pos_weekly" && isEconomyAutoDraftsEnabled()) {
    try {
      const draft = await createWeeklySpendingDraft(story, row.id);
      draftNote = draft ? `مسودة الخبر جاهزة للاعتماد: «${draft.title}» (${draft.articleId}).` : "رفض حارس الأرقام مسودة الخبر مرتين — يلزم تحرير يدوي من أرقام الأسبوع.";
    } catch (e) {
      draftNote = `تعذّر توليد مسودة الخبر: ${(e as Error).message}`;
    }
  }
  await notifyOpsRoom(
    story ? `تقرير جديد: ${story.lead.headline}` : `صدر ${REPORT_INDEX[kind].titleAr} (${latest.fileName})`,
    `حُلّل الملف وحُفظ (${row.id}). ${draftNote}`,
    "high",
  );
  console.log(`[SAMA Watch] new ${kind}: ${latest.fileName}`);
  return 1;
}

const RUNNERS: Record<WatchSource, () => Promise<number>> = {
  indicators: watchIndicators,
  fx: watchFx,
  news: watchNews,
  pos_weekly: () => watchReport("pos_weekly"),
  money_supply_weekly: () => watchReport("money_supply_weekly"),
  reserve_assets_monthly: () => watchReport("reserve_assets_monthly"),
  monthly_bulletin: () => watchReport("monthly_bulletin"),
};

export async function runSamaWatchCycle(now = new Date(), force: WatchSource[] = []): Promise<WatchCycleResult> {
  const result: WatchCycleResult = { ran: [], changes: 0, errors: {} };
  if (!isSamaEnabled()) return result;
  for (const source of WATCH_SOURCES) {
    if (!force.includes(source) && !isDue(source, now, lastRun.get(source) ?? null)) continue;
    lastRun.set(source, now);
    try {
      result.changes += await RUNNERS[source]();
      result.ran.push(source);
      lastError.delete(source);
    } catch (e) {
      const msg = (e as Error).message;
      result.errors[source] = msg;
      if (lastError.get(source) !== msg) console.error(`[SAMA Watch] ${source}: ${msg}`);
      lastError.set(source, msg);
    }
  }
  return result;
}

export function getSamaWatchStatus(): Record<string, { lastRun: string | null; lastError: string | null }> {
  const out: Record<string, { lastRun: string | null; lastError: string | null }> = {};
  for (const s of WATCH_SOURCES) out[s] = { lastRun: lastRun.get(s)?.toISOString() ?? null, lastError: lastError.get(s) ?? null };
  return out;
}
