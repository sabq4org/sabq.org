// قوالب بريد تسجيل الناشرين: استلام الطلب، القبول مع بيانات الدخول، الرفض،
// وتنبيه صندوق إدارة الناشرين. كل قيمة من المتقدم تُهرَّب قبل وضعها في HTML.
import { sendEmailNotification } from "./email";
import { publisherAdminEmail } from "./publisherRenewalService";
import { publisherApplicationRef } from "@shared/publisherApplications";
import type { PublisherApplication } from "@shared/schema";

export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function frontendUrl(): string {
  return (process.env.FRONTEND_URL || "https://sabq.org").replace(/\/+$/, "");
}

const FONT = "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif";

function layout(bodyHtml: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:${FONT};color:#1B2B3A;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FB;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;">
<tr><td style="padding:28px 28px 8px;text-align:right;">
<img src="${frontendUrl()}/branding/sabq-logo.png" alt="سبق" height="36" style="height:36px;border:0;" />
</td></tr>
<tr><td style="padding:8px 28px 28px;text-align:right;font-size:15px;line-height:1.9;">${bodyHtml}</td></tr>
</table>
<p style="font-size:12px;color:#617183;margin:16px 0 0;">© ${year} صحيفة سبق الإلكترونية</p>
</td></tr></table></body></html>`;
}

const box = (inner: string, bg = "#F4F7FB") =>
  `<div style="background:${bg};border-radius:14px;padding:12px 16px;margin:14px 0;font-size:14px;">${inner}</div>`;
const button = (href: string, label: string) =>
  `<p style="margin:20px 0;"><a href="${href}" style="display:inline-block;background:#1E9BE6;color:#FFFFFF;text-decoration:none;border-radius:999px;padding:12px 26px;font-weight:600;">${label}</a></p>`;
const muted = (t: string) => `<p style="margin:8px 0;font-size:13px;color:#55667A;">${t}</p>`;
const ltr = (t: string) => `<span dir="ltr">${escapeHtml(t)}</span>`;

export function buildReceivedEmail(app: PublisherApplication) {
  const name = escapeHtml(app.contactPerson);
  const agency = escapeHtml(app.agencyName);
  const ref = publisherApplicationRef(app.id);
  return {
    subject: `استلمنا طلب تسجيل ${app.agencyName} في سبق`,
    html: layout(
      `<p style="margin:0 0 8px;">مرحبًا ${name}،</p>
<p style="margin:0;">شكرًا لتسجيل <b>${agency}</b> ناشرًا في سبق. وصلنا طلبك وشعار الوكالة، ويراجعه فريقنا الآن.</p>
${box(`رقم الطلب: <b dir="ltr">${ref}</b><br/>بريد الدخول بعد الموافقة: ${ltr(app.loginEmail)}`)}
${muted("لا ترد على هذه الرسالة. سنراسلك بالنتيجة على هذا البريد.")}`,
    ),
    text: `مرحبًا ${app.contactPerson}،\nشكرًا لتسجيل ${app.agencyName} ناشرًا في سبق. وصلنا طلبك ويراجعه فريقنا الآن.\nرقم الطلب: ${ref}\nبريد الدخول بعد الموافقة: ${app.loginEmail}`,
  };
}

export function buildApprovedEmail(app: PublisherApplication, temporaryPassword: string) {
  const loginUrl = `${frontendUrl()}/login`;
  return {
    subject: `تم قبول ${app.agencyName} ناشرًا في سبق: بيانات الدخول`,
    html: layout(
      `<p style="margin:0 0 8px;">مرحبًا ${escapeHtml(app.loginFirstName)}،</p>
<p style="margin:0;">يسعدنا قبول <b>${escapeHtml(app.agencyName)}</b> ناشرًا في سبق. حسابك جاهز:</p>
${box(`البريد: ${ltr(app.loginEmail)}<br/>كلمة المرور المؤقتة: <b dir="ltr" style="letter-spacing:1px;">${escapeHtml(temporaryPassword)}</b>`, "#E6F4FD")}
${muted("ستُطلب منك كلمة مرور جديدة عند أول دخول.")}
${button(loginUrl, "الدخول إلى لوحة الوكالة")}
${muted("دليل الناشر داخل اللوحة يشرح إضافة الأخبار والمراجعة.")}`,
    ),
    text: `مرحبًا ${app.loginFirstName}،\nتم قبول ${app.agencyName} ناشرًا في سبق.\nالبريد: ${app.loginEmail}\nكلمة المرور المؤقتة: ${temporaryPassword}\nستُطلب منك كلمة مرور جديدة عند أول دخول.\nالدخول: ${loginUrl}`,
  };
}

export function buildRejectedEmail(app: PublisherApplication, reason: string) {
  return {
    subject: `بخصوص طلب تسجيل ${app.agencyName} في سبق`,
    html: layout(
      `<p style="margin:0 0 8px;">مرحبًا ${escapeHtml(app.contactPerson)}،</p>
<p style="margin:0;">شكرًا لاهتمامك بالنشر في سبق. راجعنا طلب <b>${escapeHtml(app.agencyName)}</b> ولم نتمكن من قبوله حاليًا.</p>
${box(`<span style="color:#55667A;">السبب:</span> ${escapeHtml(reason)}`)}
${muted("يمكنك التقديم من جديد بعد تصحيح البيانات.")}`,
    ),
    text: `مرحبًا ${app.contactPerson}،\nراجعنا طلب ${app.agencyName} ولم نتمكن من قبوله حاليًا.\nالسبب: ${reason}\nيمكنك التقديم من جديد بعد تصحيح البيانات.`,
  };
}

export function buildAdminNoticeEmail(app: PublisherApplication) {
  const reviewUrl = `${frontendUrl()}/dashboard/admin/publisher-applications`;
  return {
    subject: `طلب ناشر جديد: ${app.agencyName}`,
    html: layout(
      `<p style="margin:0 0 8px;"><b>${escapeHtml(app.agencyName)}</b></p>
<p style="margin:0;font-size:14px;color:#55667A;">${escapeHtml(app.contactPerson)} · ${ltr(app.phoneNumber)}</p>
<p style="margin:12px 0 0;">وصل طلب تسجيل ناشر جديد ينتظر المراجعة.</p>
${button(reviewUrl, "مراجعة الطلب")}
${muted("لا يحمل هذا البريد أي بيانات دخول.")}`,
    ),
    text: `طلب ناشر جديد: ${app.agencyName}\n${app.contactPerson} · ${app.phoneNumber}\nالمراجعة: ${reviewUrl}`,
  };
}

async function send(to: string, mail: { subject: string; html: string; text: string }, label: string) {
  const result = await sendEmailNotification({ to, ...mail });
  if (!result.success) console.error(`[Publisher Applications] ${label} email failed:`, result.error);
  return result;
}

export const sendPublisherApplicationReceived = (app: PublisherApplication) =>
  send(app.email, buildReceivedEmail(app), "received");
export const sendPublisherApplicationAdminNotice = (app: PublisherApplication) =>
  send(publisherAdminEmail(), buildAdminNoticeEmail(app), "admin notice");
export const sendPublisherApplicationApproved = (app: PublisherApplication, temporaryPassword: string) =>
  send(app.loginEmail, buildApprovedEmail(app, temporaryPassword), "approved");
export const sendPublisherApplicationRejected = (app: PublisherApplication, reason: string) =>
  send(app.email, buildRejectedEmail(app, reason), "rejected");
