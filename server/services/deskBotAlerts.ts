import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { sendEmailNotification } from "./email";

export const AGENCY_SOCIAL_DEFAULT_ALERT_EMAIL = "aalhazmi@sabq.org";

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function parseDeskAlertEmailList(raw?: string | readonly string[] | null): string[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : String(raw).split(/[,;\s]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const normalized = item.trim().toLowerCase();
    if (!normalized || !SIMPLE_EMAIL_RE.test(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function resolveDeskBotAlertRecipients(options?: {
  env?: string | null;
  settingEmails?: string | readonly string[] | null;
  extraEmails?: readonly (string | null | undefined)[];
}): string[] {
  const envVal = options?.env !== undefined ? options.env : process.env.DESK_BOT_ALERT_EMAILS;
  const fromEnv = parseDeskAlertEmailList(envVal);
  const fromSettings = parseDeskAlertEmailList(options?.settingEmails);
  const fromExtra = parseDeskAlertEmailList(
    (options?.extraEmails ?? []).filter((e): e is string => typeof e === "string"),
  );
  return parseDeskAlertEmailList([...fromExtra, ...fromSettings, ...fromEnv]);
}

export function resolveAgencySocialAlertRecipients(options?: {
  env?: string | null;
  settingEmails?: string | readonly string[] | null;
  defaultEmail?: string;
}): string[] {
  const fallback = options?.defaultEmail ?? AGENCY_SOCIAL_DEFAULT_ALERT_EMAIL;
  return resolveDeskBotAlertRecipients({
    env: options?.env,
    settingEmails: options?.settingEmails,
    extraEmails: [fallback],
  });
}

export async function loadDeskBotSettingEmails(): Promise<string[]> {
  try {
    const queryApi = (db as unknown as { query?: { systemSettings?: { findFirst?: Function } } })?.query
      ?.systemSettings;
    if (queryApi && typeof queryApi.findFirst === "function") {
      const row = await queryApi.findFirst({
        where: eq(systemSettings.key, "editor_alerts"),
      });
      const val = (row?.value ?? null) as { deskBotAlertEmails?: string[] | string } | null;
      return parseDeskAlertEmailList(val?.deskBotAlertEmails);
    }
  } catch {
    // Database or mock not available in isolated unit tests; fall back to env only.
  }
  return [];
}

export async function getDeskBotAlertRecipients(options?: {
  extraEmails?: readonly (string | null | undefined)[];
}): Promise<string[]> {
  const settingEmails = await loadDeskBotSettingEmails();
  return resolveDeskBotAlertRecipients({
    settingEmails,
    extraEmails: options?.extraEmails,
  });
}

export async function getAgencySocialAlertRecipients(): Promise<string[]> {
  const settingEmails = await loadDeskBotSettingEmails();
  return resolveAgencySocialAlertRecipients({ settingEmails });
}

export type DeskAlertType = "ticket" | "social_proposal" | "opinion_draft";

export function buildDeskAlertHeader(input: {
  type: DeskAlertType;
  id: string;
}): string {
  return `[sabq-desk] type=${input.type} id=${input.id}`;
}

export function formatDeskAlertRiyadhTime(date: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return `${formatted} Asia/Riyadh`;
}

export function clipDeskAlertExcerpt(value: string, max = 220): string {
  const flat = (value || "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1)}…`;
}

export function isMeaningfulProposalTextChange(
  previousText: string | null | undefined,
  nextText: string,
): boolean {
  if (previousText === null || previousText === undefined) return true;
  const normPrev = previousText.replace(/\s+/g, " ").trim();
  const normNext = nextText.replace(/\s+/g, " ").trim();
  return normPrev !== normNext;
}

export interface DeskTicketAlertEmailInput {
  ticketId: string;
  kind: "new_ticket" | "writer_message";
  title: string;
  senderName?: string | null;
  senderRole?: string | null;
  message: string;
  deeplinkUrl: string;
  occurredAt?: Date;
}

export function buildDeskTicketAlertEmail(input: DeskTicketAlertEmailInput): {
  header: string;
  subject: string;
  text: string;
  html: string;
} {
  const header = buildDeskAlertHeader({ type: "ticket", id: input.ticketId });
  const senderName = input.senderName?.trim() || "مساهم";
  const senderRole = input.senderRole?.trim() || "writer";
  const timeRiyadh = formatDeskAlertRiyadhTime(input.occurredAt ?? new Date());
  const subjectTitle = clipDeskAlertExcerpt(input.title || "استفسار", 80);
  const excerpt = clipDeskAlertExcerpt(input.message || "", 220);
  const headline =
    input.kind === "new_ticket"
      ? `استفسار جديد من ${senderName}`
      : `رسالة جديدة من ${senderName}`;

  const subject = `${headline} — «${subjectTitle}» | ${header}`;
  const text = [
    header,
    `kind: ${input.kind}`,
    `sender: ${senderName}`,
    `role: ${senderRole}`,
    `time: ${timeRiyadh}`,
    `title: ${subjectTitle}`,
    `excerpt: ${excerpt}`,
    "",
    `${headline}`,
    `العنوان: «${subjectTitle}»`,
    `المرسل: ${senderName} (${senderRole})`,
    `الوقت (Asia/Riyadh): ${timeRiyadh}`,
    `المقتطف: ${excerpt}`,
    "",
    `افتح الاستفسار: ${input.deeplinkUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Tajawal',Arial,sans-serif;direction:rtl;text-align:right;background:#f8fafc;padding:20px;color:#0f172a">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
    <pre dir="ltr" style="background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:12px;color:#334155;overflow-x:auto">${escapeHtml(header)}</pre>
    <h3 style="margin:12px 0 8px;color:#0f172a">${escapeHtml(headline)}</h3>
    <p style="margin:4px 0"><strong>العنوان:</strong> «${escapeHtml(subjectTitle)}»</p>
    <p style="margin:4px 0"><strong>المرسل:</strong> ${escapeHtml(senderName)} (${escapeHtml(senderRole)})</p>
    <p style="margin:4px 0"><strong>الوقت (Asia/Riyadh):</strong> <span dir="ltr">${escapeHtml(timeRiyadh)}</span></p>
    <div style="white-space:pre-wrap;background:#f8fafc;border-right:4px solid #0ea5e9;border-radius:6px;padding:12px;margin:12px 0">${escapeHtml(excerpt)}</div>
    <p style="margin-top:16px"><a href="${escapeHtml(input.deeplinkUrl)}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">فتح الاستفسار في اللوحة</a></p>
  </div>
</body>
</html>`;

  return { header, subject, text, html };
}

export interface DeskSocialProposalAlertEmailInput {
  postId: string;
  proposalKind: "author" | "agency";
  senderName: string;
  senderRole: string;
  text: string;
  articleTitle?: string | null;
  articleUrl?: string | null;
  dashboardUrl?: string;
  headline?: string;
  isUpdate?: boolean;
  occurredAt?: Date;
}

export function buildDeskSocialProposalAlertEmail(input: DeskSocialProposalAlertEmailInput): {
  header: string;
  subject: string;
  text: string;
  html: string;
} {
  const header = buildDeskAlertHeader({ type: "social_proposal", id: input.postId });
  const senderName = input.senderName?.trim() || (input.proposalKind === "agency" ? "وكالة" : "كاتب رأي");
  const senderRole = input.senderRole?.trim() || (input.proposalKind === "agency" ? "agency" : "opinion_author");
  const timeRiyadh = formatDeskAlertRiyadhTime(input.occurredAt ?? new Date());
  const excerpt = clipDeskAlertExcerpt(input.text || "", 220);
  const articleTitle = input.articleTitle ? clipDeskAlertExcerpt(input.articleTitle, 120) : null;
  const origin = (process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || "https://sabq.org").replace(/\/$/, "");
  const dashboardUrl =
    input.dashboardUrl ||
    (input.proposalKind === "agency"
      ? `${origin}/dashboard/social-publishing?filter=agency`
      : `${origin}/dashboard/social-publishing`);

  const defaultHeadline =
    input.proposalKind === "agency"
      ? input.isUpdate
        ? `تحديث مقترح تغريدة من وكالة: ${senderName}`
        : `طلب تغريدة جديد من وكالة: ${senderName}`
      : input.isUpdate
        ? `تحديث مقترح تغريدة من كاتب رأي: ${senderName}`
        : `مقترح تغريدة جديد من كاتب رأي: ${senderName}`;
  const headline = input.headline?.trim() || defaultHeadline;

  const subject = `سبق | ${headline} | ${header}`;
  const textLines = [
    header,
    `proposal_kind: ${input.proposalKind}`,
    `sender: ${senderName}`,
    `role: ${senderRole}`,
    `time: ${timeRiyadh}`,
    ...(articleTitle ? [`article_title: ${articleTitle}`] : []),
    ...(input.articleUrl ? [`article_url: ${input.articleUrl}`] : []),
    `excerpt: ${excerpt}`,
    "",
    headline,
    `المرسل: ${senderName} (${senderRole})`,
    `الوقت (Asia/Riyadh): ${timeRiyadh}`,
    ...(articleTitle ? [`المقال/الخبر: ${articleTitle}`] : []),
    ...(input.articleUrl ? [`رابط المادة: ${input.articleUrl}`] : []),
    `نص التغريدة المقترح: ${excerpt}`,
    "",
    `لوحة النشر الاجتماعي: ${dashboardUrl}`,
  ];

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Tajawal',Arial,sans-serif;direction:rtl;text-align:right;background:#f8fafc;padding:20px;color:#0f172a">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
    <pre dir="ltr" style="background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:12px;color:#334155;overflow-x:auto">${escapeHtml(header)}</pre>
    <h3 style="margin:12px 0 8px;color:#0f172a">${escapeHtml(headline)}</h3>
    <p style="margin:4px 0"><strong>المرسل:</strong> ${escapeHtml(senderName)} (${escapeHtml(senderRole)})</p>
    <p style="margin:4px 0"><strong>الوقت (Asia/Riyadh):</strong> <span dir="ltr">${escapeHtml(timeRiyadh)}</span></p>
    ${articleTitle ? `<p style="margin:4px 0"><strong>المادة:</strong> ${escapeHtml(articleTitle)}</p>` : ""}
    ${input.articleUrl ? `<p style="margin:4px 0"><strong>رابط المادة:</strong> <a href="${escapeHtml(input.articleUrl)}">${escapeHtml(input.articleUrl)}</a></p>` : ""}
    <div style="white-space:pre-wrap;background:#f1f5f9;border-right:4px solid #0ea5e9;border-radius:8px;padding:12px;margin:12px 0">${escapeHtml(input.text)}</div>
    <p style="margin-top:16px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">مراجعة المقترح في اللوحة</a></p>
  </div>
</body>
</html>`;

  return { header, subject, text: textLines.join("\n"), html };
}

export interface DeskOpinionDraftAlertEmailInput {
  articleId: string;
  articleTitle: string;
  authorName: string;
  /** سطر الموعد الجاهز: «موعده الثابت: …» أو «بلا موعد ثابت». */
  slotLine: string;
  /** الموعد الثابت القادم (ISO) إن وُجد. */
  nextSlotIso?: string | null;
  excerpt?: string | null;
  dashboardUrl?: string;
  occurredAt?: Date;
}

/** بريد «مقال رأي جديد» لبوت الديسك: `[sabq-desk] type=opinion_draft id=<articleId>`. */
export function buildDeskOpinionDraftAlertEmail(input: DeskOpinionDraftAlertEmailInput): {
  header: string;
  subject: string;
  text: string;
  html: string;
} {
  const header = buildDeskAlertHeader({ type: "opinion_draft", id: input.articleId });
  const authorName = input.authorName?.trim() || "كاتب رأي";
  const timeRiyadh = formatDeskAlertRiyadhTime(input.occurredAt ?? new Date());
  const articleTitle = clipDeskAlertExcerpt(input.articleTitle || "مقال رأي", 120);
  const excerpt = input.excerpt ? clipDeskAlertExcerpt(input.excerpt, 220) : "";
  const origin = (process.env.FRONTEND_URL || process.env.PUBLIC_SITE_URL || "https://sabq.org").replace(/\/$/, "");
  const dashboardUrl =
    input.dashboardUrl || `${origin}/dashboard/articles?status=draft&id=${encodeURIComponent(input.articleId)}`;
  const headline = `مقال رأي جديد: ${authorName}`;

  const subject = `سبق | ${headline} — «${clipDeskAlertExcerpt(articleTitle, 80)}» | ${header}`;
  const textLines = [
    header,
    `author: ${authorName}`,
    `time: ${timeRiyadh}`,
    `title: ${articleTitle}`,
    `next_slot: ${input.nextSlotIso || "none"}`,
    ...(excerpt ? [`excerpt: ${excerpt}`] : []),
    "",
    headline,
    `العنوان: «${articleTitle}»`,
    input.slotLine,
    `وقت الإرسال (Asia/Riyadh): ${timeRiyadh}`,
    ...(excerpt ? [`المقتطف: ${excerpt}`] : []),
    "",
    `افتح المسودة: ${dashboardUrl}`,
  ];

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Tajawal',Arial,sans-serif;direction:rtl;text-align:right;background:#f8fafc;padding:20px;color:#0f172a">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">
    <pre dir="ltr" style="background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:12px;color:#334155;overflow-x:auto">${escapeHtml(header)}</pre>
    <h3 style="margin:12px 0 8px;color:#0f172a">${escapeHtml(headline)}</h3>
    <p style="margin:4px 0"><strong>العنوان:</strong> «${escapeHtml(articleTitle)}»</p>
    <p style="margin:4px 0">${escapeHtml(input.slotLine)}</p>
    <p style="margin:4px 0"><strong>وقت الإرسال (Asia/Riyadh):</strong> <span dir="ltr">${escapeHtml(timeRiyadh)}</span></p>
    ${excerpt ? `<div style="white-space:pre-wrap;background:#f8fafc;border-right:4px solid #0ea5e9;border-radius:6px;padding:12px;margin:12px 0">${escapeHtml(excerpt)}</div>` : ""}
    <p style="margin-top:16px"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">فتح المسودة في اللوحة</a></p>
  </div>
</body>
</html>`;

  return { header, subject, text: textLines.join("\n"), html };
}

export async function sendDeskAlertEmails(
  recipients: readonly string[],
  payload: { subject: string; text: string; html: string },
  logPrefix = "[DeskBotAlerts]",
): Promise<void> {
  const unique = parseDeskAlertEmailList(recipients);
  await Promise.all(
    unique.map(async (to) => {
      try {
        await sendEmailNotification({
          to,
          subject: payload.subject,
          text: payload.text,
          html: payload.html,
        });
      } catch (err) {
        console.error(`${logPrefix} email notify failed for ${to}:`, err);
      }
    }),
  );
}
