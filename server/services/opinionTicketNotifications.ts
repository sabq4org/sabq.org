/**
 * إشعار مسؤول/مدير النظام وبوت الديسك عند استفسار أو رسالة من المساهم (لا المحرر).
 * الصندوق الداخلي عبر notifications_inbox (نفس جرس اللوحة)، والبريد عبر
 * sendEmailNotification إن كان مزود البريد مهيأً. فشل الإشعار لا يُفشل حفظ التذكرة.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "../db";
import { roles, userRoles, users } from "@shared/schema";
import { storage } from "../storage";
import { sendEmailNotification } from "./email";
import {
  OPINION_TICKET_NOTIFY_ROLE_NAMES,
  buildOpinionTicketStaffNotice,
  isOpinionTicketNotifyRecipient,
  type OpinionTicketNoticeKind,
} from "./opinionTicketNotice";
import {
  buildDeskTicketAlertEmail,
  getDeskBotAlertRecipients,
} from "./deskBotAlerts";
import { SABQ_DESK_BUNDLE_ID, sendPushToUserApp } from "./userAppPushService";

const NOTIFY_ROLE_NAMES = [...OPINION_TICKET_NOTIFY_ROLE_NAMES];

export async function listOpinionDeskRecipients(
  excludeUserId?: string | null,
): Promise<Array<{ id: string; email: string | null }>> {
  const rbacDeskUserIds = db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(roles.name, NOTIFY_ROLE_NAMES));

  const candidates = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        or(inArray(users.role, NOTIFY_ROLE_NAMES), inArray(users.id, rbacDeskUserIds)),
      ),
    );
  if (candidates.length === 0) return [];

  const rbacRows = await db
    .select({ userId: userRoles.userId, roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, candidates.map((c) => c.id)));
  const rbacByUser = new Map<string, string[]>();
  for (const row of rbacRows) {
    const list = rbacByUser.get(row.userId) ?? [];
    list.push(row.roleName);
    rbacByUser.set(row.userId, list);
  }

  const recipients: Array<{ id: string; email: string | null }> = [];
  for (const row of candidates) {
    if (!row.id || row.id === excludeUserId) continue;
    if (!isOpinionTicketNotifyRecipient(row.role, rbacByUser.get(row.id) ?? [])) continue;
    recipients.push({ id: row.id, email: row.email ?? null });
  }
  return recipients;
}

export async function notifyDeskOfWriterInquiry(input: {
  kind: OpinionTicketNoticeKind;
  ticketId: string;
  title: string;
  writerName?: string | null;
  writerRole?: string | null;
  message: string;
  senderId: string;
  occurredAt?: Date;
}): Promise<void> {
  const notice = buildOpinionTicketStaffNotice(input);
  let recipients: Array<{ id: string; email: string | null }> = [];
  try {
    recipients = await listOpinionDeskRecipients(input.senderId);
  } catch (err) {
    console.error("[opinion-tickets] list recipients failed", err);
  }

  if (recipients.length > 0) {
    await Promise.all(
      recipients.map(async (recipient) => {
        try {
          await storage.createNotification({
            userId: recipient.id,
            type: notice.type,
            title: notice.title,
            body: notice.body,
            deeplink: notice.deeplink,
            metadata: notice.metadata,
          });
        } catch (err) {
          console.error("[opinion-tickets] inbox notify failed", err);
        }

        try {
          await sendPushToUserApp(recipient.id, SABQ_DESK_BUNDLE_ID, {
            title: notice.title,
            body: notice.body,
            type: notice.type,
            deeplink: `sabqdesk://ticket/${input.ticketId}`,
            data: {
              ticketId: input.ticketId,
              kind: input.kind,
            },
            collapseId: `desk-ticket-${input.ticketId}`,
          });
        } catch (pushErr) {
          console.error("[opinion-tickets] staff app push failed", pushErr);
        }
      }),
    );
  }

  const emailRecipients = await getDeskBotAlertRecipients({
    extraEmails: recipients.map((r) => r.email),
  });
  if (emailRecipients.length === 0) return;

  const origin = (process.env.FRONTEND_URL || "https://sabq.org").replace(/\/$/, "");
  const deeplinkUrl = `${origin}${notice.deeplink}`;
  const emailPayload = buildDeskTicketAlertEmail({
    ticketId: input.ticketId,
    kind: input.kind,
    title: input.title,
    senderName: input.writerName,
    senderRole: input.writerRole || "writer",
    message: input.message,
    deeplinkUrl,
    occurredAt: input.occurredAt,
  });

  for (const to of emailRecipients) {
    void sendEmailNotification({
      to,
      subject: emailPayload.subject,
      text: emailPayload.text,
      html: emailPayload.html,
    }).catch((err) => {
      console.error("[opinion-tickets] email notify failed", err);
    });
  }
}
