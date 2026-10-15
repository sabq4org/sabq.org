/**
 * إشعار هيئة التحرير عند استفسار أو رسالة من المساهم.
 * الصندوق الداخلي عبر notifications_inbox (نفس جرس اللوحة)، والبريد عبر
 * sendEmailNotification إن كان مزود البريد مهيأً. فشل الإشعار لا يُفشل حفظ التذكرة.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { roles, userRoles, users } from "@shared/schema";
import { SUPERUSER_ROLE_NAMES } from "@shared/rbac-constants";
import { storage } from "../storage";
import { sendEmailNotification } from "./email";
import {
  buildOpinionTicketStaffNotice,
  type OpinionTicketNoticeKind,
} from "./opinionTicketNotice";

const DESK_ROLE_NAMES = [...SUPERUSER_ROLE_NAMES, "editor"] as string[];

export async function listOpinionDeskRecipients(
  excludeUserId?: string | null,
): Promise<Array<{ id: string; email: string | null }>> {
  const [legacy, rbac] = await Promise.all([
    db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(inArray(users.role, DESK_ROLE_NAMES), eq(users.status, "active"))),
    db
      .select({ id: users.id, email: users.email })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(inArray(roles.name, DESK_ROLE_NAMES), eq(users.status, "active"))),
  ]);

  const byId = new Map<string, { id: string; email: string | null }>();
  for (const row of [...legacy, ...rbac]) {
    if (!row.id || row.id === excludeUserId) continue;
    byId.set(row.id, { id: row.id, email: row.email ?? null });
  }
  return [...byId.values()];
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
