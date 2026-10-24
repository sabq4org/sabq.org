/**
 * إشعار مسؤول/مدير النظام عند استفسار أو رسالة من المساهم (لا المحرر).
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
  message: string;
  senderId: string;
}): Promise<void> {
  const notice = buildOpinionTicketStaffNotice(input);
  const recipients = await listOpinionDeskRecipients(input.senderId);
  if (recipients.length === 0) return;

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
    }),
  );

  const origin = (process.env.FRONTEND_URL || "https://sabq.org").replace(/\/$/, "");
  const link = `${origin}${notice.deeplink}`;
  const text = `${notice.body}\n\nافتح الاستفسار: ${link}`;
  for (const recipient of recipients) {
    const email = recipient.email?.trim();
    if (!email) continue;
    void sendEmailNotification({
      to: email,
      subject: notice.title,
      text,
    }).catch((err) => {
      console.error("[opinion-tickets] email notify failed", err);
    });
  }
}
