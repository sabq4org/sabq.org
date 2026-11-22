import { z } from "zod";
import { botDeskOpinionEditSchema, botDeskOpinionImageSchema } from "@shared/botDesk";
import { staffOpinionBoardQuerySchema, staffOpinionPrepareSchema, staffOpinionReturnSchema, staffOpinionScheduleSchema, staffOpinionSlotCheckQuerySchema, withDefaultOpinionScheduleMode } from "@shared/staffApp";
import type { NashrEditorCapability } from "@shared/botEditorCapabilities";
import { BotDraftError, resolveBotAuthorId } from "./botDraftsService";
import { assertEditorCapability, assertNotProtected } from "./botEditorCapabilityGuard";
import { recordBotEditorOperation } from "./botEditorOperationsAudit";
import {
  StaffOpinionDeskError, checkOpinionSlotClashes, hasWeeklyGapConflict, getOpinionDraftContent, getStaffOpinionBoard, getStaffOpinionItem,
  publishOpinionFromDesk, returnOpinionToWriterFromDesk, scheduleOpinionFromDesk,
} from "./staffOpinionDeskService";
import { getOpinionPrepJob, startOpinionPrep } from "./staffOpinionPrepareService";
import { getOpinionImageJob, startOpinionImage } from "./staffOpinionImageService";
import { editOpinionDraftFromDesk } from "./staffOpinionContentService";

/**
 * مقالات الرأي لنشر سبق: نفس دوال مكتب الرأي التي يستدعيها تطبيق الديسك وbot-desk
 * (staffOpinionDeskService وخدمات التجهيز والصورة والمحتوى)، بلا منطق موازٍ. الفاعل هو حساب إسناد البوت.
 * الأرشفة والاستعادة وسحب النشر تمر بـ transitionBotArticle (botEditorWrites) بالحرّاس نفسها.
 */

const CODE: Record<string, BotDraftError["code"]> = {
  not_found: "not_found", validation_error: "validation_error", conflict: "draft_changed", forbidden: "forbidden_action",
  rate_limited: "rate_limited", publish_failed: "generation_failed",
};

function mapError(error: unknown): never {
  if (error instanceof StaffOpinionDeskError) throw new BotDraftError(error.status, CODE[error.code] ?? "server_error", error.message);
  throw error;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input ?? {});
  if (!result.success) throw new BotDraftError(400, "validation_error", result.error.issues[0]?.message ?? "بيانات الطلب غير صالحة", { issues: result.error.issues });
  return result.data;
}

async function run<T>(capability: NashrEditorCapability, articleId: string | null, action: () => Promise<T>): Promise<T> {
  assertEditorCapability(capability);
  // القراءة مسموحة على المواد المحمية؛ الكتابة لا.
  if (articleId && capability !== "opinion.read") assertNotProtected(articleId);
  try { return await action(); } catch (error) { mapError(error); }
}

async function audit(operation: string, articleId: string, metadata: Record<string, string | number | boolean | null> = {}) {
  await recordBotEditorOperation({ actorId: null, operation, outcome: "succeeded", metadata: { language: "ar", articleId, ...metadata } }).catch(() => undefined);
}

const flatten = (board: Awaited<ReturnType<typeof getStaffOpinionBoard>>) => {
  const order: Record<string, number> = { new_draft: 0, in_prep: 1, scheduled: 2, published: 3 };
  return [...board.slots, ...board.unslotted].filter((item) => item.article).sort((a, b) => {
    const byStatus = (order[a.article!.status] ?? 9) - (order[b.article!.status] ?? 9);
    return byStatus !== 0 ? byStatus : (a.slotAt ?? "9999").localeCompare(b.slotAt ?? "9999");
  });
};

async function detail(articleId: string) {
  const { item, nextSlot } = await getStaffOpinionItem(articleId);
  const [draft, prep] = await Promise.all([getOpinionDraftContent(articleId), getOpinionPrepJob(articleId)]);
  const pending = item.article?.status === "new_draft" || item.article?.status === "in_prep";
  const warnings = pending && item.slotAt ? await checkOpinionSlotClashes(articleId, new Date(item.slotAt)) : [];
  return { item, nextSlot, draft, warnings, prep };
}

export const opinionBoard = (query: unknown) => run("opinion.read", null, async () => {
  const parsed = parse(staffOpinionBoardQuerySchema, query);
  const board = await getStaffOpinionBoard({ weekStart: parsed.weekStart });
  return { ...board, items: flatten(board) };
});
export const opinionDetail = (id: string) => run("opinion.read", id, () => detail(id));
export const opinionPrepareStatus = (id: string) => run("opinion.read", id, async () => {
  const job = await getOpinionPrepJob(id);
  if (!job) throw new BotDraftError(404, "not_found", "لا يوجد تجهيز لهذا المقال");
  return { job };
});
export const opinionImageStatus = (id: string) => run("opinion.read", id, async () => {
  const job = await getOpinionImageJob(id);
  if (!job) throw new BotDraftError(404, "not_found", "لا يوجد توليد صورة لهذا المقال");
  return { job };
});
export const opinionSlotCheck = (id: string, query: unknown) => run("opinion.read", id, async () => {
  const parsed = parse(staffOpinionSlotCheckQuerySchema, query);
  const scheduledAt = new Date(parsed.scheduledAt);
  const warnings = await checkOpinionSlotClashes(id, scheduledAt);
  return { scheduledAt: scheduledAt.toISOString(), warnings, weeklyGapConflict: hasWeeklyGapConflict(warnings) };
});

export const editOpinion = (id: string, body: unknown) => run("opinion.edit", id, async () => {
  const input = parse(botDeskOpinionEditSchema, body);
  const actorId = await resolveBotAuthorId();
  const result = await editOpinionDraftFromDesk({ articleId: id, actorId, title: input.title, content: input.content, contentFormat: input.contentFormat });
  if (result.changed) await audit("opinion_edit", id, { fields: result.changedFields.join(","), status: result.article.status });
  return { ...(await detail(result.article.id)), changed: result.changed, changedFields: result.changedFields };
});

export const prepareOpinion = (id: string, body: unknown) => run("opinion.lifecycle", id, async () => {
  const input = parse(staffOpinionPrepareSchema, body);
  const actorId = await resolveBotAuthorId();
  const { job, created } = await startOpinionPrep({ articleId: id, actorId, scheduledAt: input.scheduledAt });
  if (created) await audit("opinion_prepare_start", id, { scheduledAt: input.scheduledAt ?? "fixed_slot" });
  return { job, created };
});

export const imageOpinion = (id: string, body: unknown) => run("opinion.image", id, async () => {
  const input = parse(botDeskOpinionImageSchema, body);
  const actorId = await resolveBotAuthorId();
  const result = await startOpinionImage({ articleId: id, actorId, force: input.force });
  if (result.outcome === "image_exists") return { __httpStatus: 200, body: { job: result.job, created: false, skipped: "image_exists", imageUrl: result.imageUrl } };
  if (result.outcome === "started") await audit("opinion_image_start", id, { force: input.force === true, hadImage: Boolean(result.imageUrl) });
  return { __httpStatus: 202, body: { job: result.job, created: result.outcome === "started" } };
});

export const scheduleOpinion = (id: string, body: unknown) => run("opinion.lifecycle", id, async () => {
  const input = parse(staffOpinionScheduleSchema, withDefaultOpinionScheduleMode(body));
  const actorId = await resolveBotAuthorId();
  const result = await scheduleOpinionFromDesk({ articleId: id, actorId, request: input });
  await audit("opinion_schedule", id, { mode: "mode" in input ? input.mode : "custom", scheduledAt: result.scheduledAt, overrodeWeeklyGap: result.overrodeWeeklyGap });
  return { article: result.article, scheduledAt: result.scheduledAt, warnings: result.warnings, overrodeWeeklyGap: result.overrodeWeeklyGap };
});

export const publishOpinion = (id: string, body: unknown) => run("opinion.lifecycle", id, async () => {
  parse(z.object({}).strict(), body);
  const actorId = await resolveBotAuthorId();
  const result = await publishOpinionFromDesk({ articleId: id, actorId });
  await audit("opinion_publish", id, { status: result.article.status });
  return { article: result.article };
});

export const returnOpinion = (id: string, body: unknown) => run("opinion.lifecycle", id, async () => {
  const input = parse(staffOpinionReturnSchema, body);
  const actorId = await resolveBotAuthorId();
  const result = await returnOpinionToWriterFromDesk({ articleId: id, actorId, note: input.note });
  await audit("opinion_return_to_writer", id, { noteLength: input.note.length });
  return { article: result.article };
});
