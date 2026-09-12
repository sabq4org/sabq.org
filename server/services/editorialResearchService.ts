import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import DOMPurify from "isomorphic-dompurify";
import { db } from "../db";
import { editorialResearchJobs as jobs } from "@shared/schema";
import { ACTIVE_RESEARCH_STATUSES, type ResearchCapabilities, type ResearchJob, type ResearchRequest, type ResearchStatus, type ResearchResult } from "@shared/editorialResearch";
import { runEditorialTask } from "./editorialAiService";
import { ResearchError, agentsRequest, createResearchSession, findResearchSession, retrieveResearchSession, listResearchTurns, listResearchItems, extractResearch, cancelResearchSession, normalizeSourceUrl } from "./editorialResearchProvider";

export const RESEARCH_DAILY_LIMIT = 5;
export const RESEARCH_GLOBAL_LIMIT = 2;
export const RESEARCH_MAX_MS = 5 * 60_000;
const MAX_RECORDED_TOKENS = 100_000; // Best-effort, observed on polling; not a hard billing cap.
type Row = typeof jobs.$inferSelect;
const active = inArray(jobs.status, ACTIVE_RESEARCH_STATUSES);
const safeHtml = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "h2", "h3", "blockquote"], ALLOWED_ATTR: [] });
export function researchCapabilities(): ResearchCapabilities {
  const enabled = process.env.EDITORIAL_RESEARCH_ENABLED === "true" && process.env.EDITORIAL_RESEARCH_WORKER_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY);
  return { enabled, historyAvailable: process.env.EDITORIAL_RESEARCH_WORKER_ENABLED === "true", reason: enabled ? null : "مساعد البحث التجريبي غير مفعّل حاليًا.", dailyLimit: RESEARCH_DAILY_LIMIT, maxMinutes: RESEARCH_MAX_MS / 60000 };
}
function publicJob(row: Row): ResearchJob {
  return { id: row.id, topic: row.topic, status: row.status as ResearchStatus, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), research: row.research, result: row.status === "completed" ? row.result : null, usage: row.usage, error: row.error };
}
export async function listResearchJobs(userId: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.userId, userId)).orderBy(desc(jobs.createdAt)).limit(20);
  return rows.map(publicJob);
}
export async function getResearchJob(userId: string, id: string) {
  const [row] = await db.select().from(jobs).where(and(eq(jobs.id, id), eq(jobs.userId, userId)));
  return row ? publicJob(row) : null;
}
export async function createResearchJob(userId: string, input: ResearchRequest) {
  if (!researchCapabilities().enabled) throw new ResearchError(503, "disabled", "مساعد البحث التجريبي غير مفعّل حاليًا.");
  return db.transaction(async tx => {
    // One global admission lock keeps both global and owner quotas atomic across replicas.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('editorial-research-admission', 0))`);
    const [existing] = await tx.select().from(jobs).where(eq(jobs.id, input.requestId));
    if (existing) {
      if (existing.userId !== userId || existing.topic !== input.topic) throw new ResearchError(409, "request_conflict", "معرّف الطلب مستخدم. ابدأ طلبًا جديدًا.");
      return publicJob(existing);
    }
    const current = await tx.select({ userId: jobs.userId }).from(jobs).where(active).limit(RESEARCH_GLOBAL_LIMIT);
    if (current.some(r => r.userId === userId)) throw new ResearchError(409, "active_job", "لديك بحث قيد العمل. افتحه من مهامك السابقة.");
    if (current.length >= RESEARCH_GLOBAL_LIMIT) throw new ResearchError(429, "capacity", "البحث مشغول حاليًا. حاول بعد اكتمال المهام الجارية.");
    // Rolling 24 hours avoids timezone/reset races and includes failed/ambiguous starts.
    const recent = await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.userId, userId), gte(jobs.createdAt, sql`now() - interval '24 hours'`))).limit(RESEARCH_DAILY_LIMIT);
    if (recent.length >= RESEARCH_DAILY_LIMIT) throw new ResearchError(429, "daily_limit", "بلغت حد التجربة: 5 مهام خلال 24 ساعة.");
    const [row] = await tx.insert(jobs).values({ id: input.requestId, userId, topic: input.topic }).returning();
    return publicJob(row);
  });
}
export async function requestResearchCancellation(userId: string, id: string) {
  const [row] = await db.update(jobs).set({ status: sql`case when ${jobs.status} = 'queued' then 'cancelled' else 'cancelling' end`, updatedAt: new Date() }).where(and(eq(jobs.userId, userId), eq(jobs.id, id), active)).returning();
  return row ? publicJob(row) : getResearchJob(userId, id);
}
async function save(id: string, values: Partial<Row>, expected?: string[]) {
  const [row] = await db.update(jobs).set({ ...values, updatedAt: new Date() }).where(and(eq(jobs.id, id), expected ? inArray(jobs.status, expected) : undefined)).returning();
  return row;
}
async function closeRemote(row: Row) {
  if (!row.sessionId || row.remoteClosedAt) return;
  await agentsRequest(`sessions/${encodeURIComponent(row.sessionId)}`, "DELETE");
  await save(row.id, { remoteClosedAt: new Date() });
}
async function processClaimedJob(row: Row) {
  const age = Date.now() - row.createdAt.getTime();
  if (!ACTIVE_RESEARCH_STATUSES.includes(row.status as ResearchStatus)) { await closeRemote(row); return; }
  if (row.status === "queued") {
    if (age > RESEARCH_MAX_MS) { await save(row.id, { status: "failed", error: "انتهت مهلة انتظار البحث قبل تشغيله." }, ["queued"]); return; }
    const claimed = await save(row.id, { status: "starting" }, ["queued"]);
    if (!claimed) return;
    const session = await createResearchSession(row.id, row.topic);
    // Save the ID even if the editor requested cancellation while creation was in flight.
    await save(row.id, { sessionId: session.id, usage: session.usage ?? null });
    await save(row.id, { status: "researching" }, ["starting"]);
    return;
  }
  if (!row.sessionId) {
    // Creation has no idempotency contract. Never repeat a paid POST after a crash/timeout.
    const recovered = await findResearchSession(row.id, row.createdAt);
    if (recovered) {
      await save(row.id, { sessionId: recovered.id, usage: recovered.usage ?? null });
      await save(row.id, { status: "researching", error: null }, ["starting"]);
    } else if (row.status === "cancelling" && age < 2000) {
      // A queued cancellation is handled only when no creator owns the lease.
      await save(row.id, { status: "cancelled", error: null }, ["cancelling"]);
    } else if (age > RESEARCH_MAX_MS) {
      await save(row.id, { status: row.status === "cancelling" ? "cancelled" : "failed", error: "لم يُعثر على جلسة لهذا الطلب بعد مراجعة المزوّد. لم تُكرر محاولة الإنشاء تلقائيًا." });
    }
    return;
  }
  if (row.status === "editing") {
    // An editing lease surviving a crash is not rerun: preserve research without a second paid call.
    if (Date.now() - row.updatedAt.getTime() > 10 * 60_000) await save(row.id, { status: "failed", error: "توقف إعداد التقرير قبل اكتماله. ملف البحث محفوظ للمراجعة." }, ["editing"]);
    return;
  }
  const session = await retrieveResearchSession(row.sessionId);
  const turns = await listResearchTurns(row.sessionId);
  const turn = turns.find(t => t.subagent_id === null);
  const usage = session.usage ?? turn?.usage ?? row.usage;
  await db.update(jobs).set({ usage }).where(eq(jobs.id, row.id));
  if (row.status === "cancelling") {
    if (session.status === "failed" || (turn && ["completed", "failed", "cancelled"].includes(turn.status))) {
      await save(row.id, { status: "cancelled", error: row.error }, ["cancelling"]);
    } else { await cancelResearchSession(row.sessionId); }
    return;
  }
  if (turn?.status !== "completed" && (age > RESEARCH_MAX_MS || (usage?.total_tokens ?? 0) > MAX_RECORDED_TOKENS || session.status === "requires_action")) {
    await save(row.id, { status: "cancelling", error: session.status === "requires_action" ? "تطلب البحث إجراءً خارج نطاق التجربة وتم طلب إيقافه." : "تجاوز البحث حدود التجربة وتم طلب إيقافه." }, ["researching"]);
    await cancelResearchSession(row.sessionId);
    return;
  }
  if (session.status === "failed" || turn?.status === "failed" || turn?.status === "cancelled") {
    await save(row.id, { status: "failed", error: "لم يكتمل البحث لدى المزوّد. يمكنك مراجعة المهمة أو المحاولة لاحقًا." }, ["researching"]); return;
  }
  if (turn?.status !== "completed") return; // idle is explicitly NOT success.
  const research = extractResearch(await listResearchItems(row.sessionId), turn.id);
  const editing = await save(row.id, { status: "editing", research, error: null, leaseUntil: new Date(Date.now() + 15 * 60_000) }, ["researching"]);
  if (!editing) return;
  const result = await runEditorialTask({ type: "report", material: row.topic, verificationContext: JSON.stringify(research), userId: row.userId, instructions: "اكتب التقرير اعتمادًا على ملف البحث فقط. أدرج نقاط عدم اليقين ضمن ملاحظات التحرير. لا تضف مصادر أو وقائع من الذاكرة. لا تدرج روابط في المتن؛ تعرض المصادر للمحرر منفصلة." });
  if (!result.headline.trim() || !result.body.trim()) throw new ResearchError(502, "empty_report", "لم ينتج البحث تقريرًا مكتملًا.");
  const allowed = new Set(research.sources.map(s => normalizeSourceUrl(s.url)));
  if (result.sources.some(s => !allowed.has(normalizeSourceUrl(s.url)))) throw new ResearchError(502, "unknown_report_source", "احتوى التقرير على مصدر خارج ملف البحث؛ لم تُعتمد النتيجة.");
  const body = safeHtml(result.body);
  if (!body.replace(/<[^>]*>/g, "").trim()) throw new ResearchError(502, "empty_report", "لم ينتج البحث متنًا قابلًا للمراجعة.");
  const clean: ResearchResult = {
    headline: result.headline, altHeadlines: result.altHeadlines, body,
    editorNotes: [...result.editorNotes, ...research.openQuestions.map(q => `يحتاج تحققًا: ${q}`)],
    sources: research.sources.map(({ title, url }) => ({ title, url })), riskFlags: result.riskFlags,
    enVersion: null, pushText: null, meta: { ...result.meta, task: "report", verificationRecommended: false },
  };
  await save(row.id, { status: "completed", result: clean }, ["editing"]);
}
export async function processResearchJobs() {
  const candidates = await db.select().from(jobs).where(and(
    or(active, and(isNull(jobs.remoteClosedAt), sql`${jobs.sessionId} is not null`)),
    or(isNull(jobs.leaseUntil), lt(jobs.leaseUntil, sql`now()`)),
  )).orderBy(desc(sql`${active}`), jobs.createdAt).limit(4);
  await Promise.all(candidates.map(async candidate => {
    const [row] = await db.update(jobs).set({ leaseUntil: new Date(Date.now() + 180_000) }).where(and(eq(jobs.id, candidate.id), or(isNull(jobs.leaseUntil), lt(jobs.leaseUntil, sql`now()`)))).returning();
    if (!row) return;
    try { await processClaimedJob(row); }
    catch (error) {
      const safe = error instanceof ResearchError ? error : new ResearchError(502, "research_failed", "تعذر إعداد نتيجة موثقة. ملف البحث المتاح محفوظ للمراجعة.");
      console.warn("[editorial-research] job check failed", { jobId: row.id, code: safe.code });
      if (["missing_output", "invalid_output", "unopened_source", "history_limit", "empty_report", "unknown_report_source", "research_failed"].includes(safe.code)) {
        await save(row.id, { status: "failed", error: safe.message }, ["researching", "editing"]);
      } else {
        // Transport/auth failures keep active jobs recoverable and admission slots occupied.
        await db.update(jobs).set({ error: safe.message }).where(and(eq(jobs.id, row.id), active));
      }
    } finally { await db.update(jobs).set({ leaseUntil: null }).where(eq(jobs.id, row.id)); }
  }));
}
