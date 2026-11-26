// «محادثة المناوب»: رسائل ثنائية بين المسؤول ومديري المحتوى داخل لوحة التحكم.
// التخزين: duty_chat_messages + duty_chat_presence (migrations/20261126_duty_chat.sql).
// البث اللحظي: EventEmitter محلي + Redis Pub/Sub بين النسخ (نفس نمط الاجتماعات).
// قبل تنفيذ SQL: كل دالة ترمي DutyChatNotReadyError فتعيد المسارات 503 ويختفي الشريط.
import crypto from "crypto";
import { EventEmitter } from "events";
import Redis from "ioredis";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { withCache } from "../../memoryCache";
import { dutyChatMessages, dutyChatPresence, users } from "@shared/schema";
import {
  DUTY_CHAT_PAGE_SIZE,
  initialOf,
  isOnline,
  messagePreview,
  type DutyChatConversation,
  type DutyChatEvent,
  type DutyChatInboxResponse,
  type DutyChatKind,
  type DutyChatMessage,
  type DutyChatPeer,
  type DutyChatThreadResponse,
} from "@shared/dutyChat";
import { STAFF_APP_BUNDLE_ID } from "@shared/staffApp";
import { ObjectStorageService } from "../../objectStorage";
import { sendPushToUserApp } from "../userAppPushService";
import { displayName } from "./dutyRosterStore";
import { resolveDutyViewer, rosteredIdsNow } from "./dutyMetricsService";

export class DutyChatNotReadyError extends Error {
  readonly code = "DUTY_CHAT_NOT_READY";
  constructor() {
    super("Duty chat tables are not installed");
    this.name = "DutyChatNotReadyError";
  }
}

export class DutyChatAccessError extends Error {
  readonly code = "DUTY_CHAT_FORBIDDEN";
}

export class DutyChatInputError extends Error {
  readonly code = "DUTY_CHAT_INVALID";
}

function rethrow(error: unknown): never {
  const e = error as { code?: string; cause?: { code?: string } };
  const code = e?.code ?? e?.cause?.code;
  if (code === "42P01" || code === "42501") throw new DutyChatNotReadyError();
  throw error;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DutyChatAccessError || error instanceof DutyChatInputError) throw error;
    rethrow(error);
  }
}

// ---------- الأهلية ----------

/** المحادثة للمسؤول ولمديري المحتوى ولأصحاب الورديات. */
export async function canUseDutyChat(userId: string): Promise<boolean> {
  return withCache(`duty-chat:eligible:${userId}`, 60_000, async () => {
    const viewer = await resolveDutyViewer(userId, await rosteredIdsNow());
    return viewer?.access === "lead" || viewer?.access === "manager";
  });
}

async function assertPair(me: string, peerId: string): Promise<void> {
  if (!peerId || peerId === me) throw new DutyChatInputError("لا يمكن مراسلة نفسك");
  const [a, b] = await Promise.all([canUseDutyChat(me), canUseDutyChat(peerId)]);
  if (!a || !b) throw new DutyChatAccessError("المحادثة متاحة بين المسؤول ومديري المحتوى المناوبين فقط");
}

// ---------- الحضور ----------

const lastTouched = new Map<string, number>();

/** يسجّل آخر ظهور (مرة كل 20 ثانية لكل مستخدم في هذه النسخة على الأكثر). */
export async function touchPresence(userId: string, now = Date.now()): Promise<void> {
  const prev = lastTouched.get(userId) ?? 0;
  if (now - prev < 20_000) return;
  lastTouched.set(userId, now);
  try {
    await db.insert(dutyChatPresence)
      .values({ userId, lastSeenAt: new Date(now) })
      .onConflictDoUpdate({ target: dutyChatPresence.userId, set: { lastSeenAt: new Date(now) } });
  } catch (error) {
    lastTouched.delete(userId);
    rethrow(error);
  }
}

async function loadPeers(ids: readonly string[]): Promise<Map<string, DutyChatPeer>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<string, DutyChatPeer>();
  if (unique.length === 0) return out;
  const [people, seen] = await Promise.all([
    db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(users).where(inArray(users.id, unique)),
    db.select().from(dutyChatPresence).where(inArray(dutyChatPresence.userId, unique)),
  ]);
  const seenMap = new Map(seen.map((s) => [s.userId, s.lastSeenAt]));
  for (const p of people) {
    const name = displayName(p);
    const last = seenMap.get(p.id) ?? null;
    out.set(p.id, {
      id: p.id,
      name,
      initial: initialOf(name),
      online: isOnline(last),
      lastSeenAt: last ? new Date(last).toISOString() : null,
    });
  }
  return out;
}

// ---------- تحويل الصفوف ----------

type Row = typeof dutyChatMessages.$inferSelect;

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function toMessage(r: Row, viewerId: string): DutyChatMessage {
  const mime = r.attachmentMime ?? "";
  return {
    id: r.id,
    senderId: r.senderId,
    recipientId: r.recipientId,
    mine: r.senderId === viewerId,
    body: r.body,
    kind: r.kind === "alert" ? "alert" : "normal",
    attachment: r.attachmentKey
      ? {
          name: r.attachmentName ?? "مرفق",
          mime,
          size: r.attachmentSize ?? 0,
          isImage: mime.startsWith("image/"),
          url: `/api/duty-chat/attachments/${r.id}`,
        }
      : null,
    createdAt: iso(r.createdAt)!,
    deliveredAt: iso(r.deliveredAt),
    readAt: iso(r.readAt),
    ackedAt: iso(r.ackedAt),
  };
}

// ---------- القراءة ----------

export async function getInbox(me: string): Promise<DutyChatInboxResponse> {
  return guard(async () => {
    // آخر رسالة لكل طرف أولًا (DISTINCT ON)، ثم الحد: فلا تسقط محادثة قديمة لكثرة رسائل محادثة أخرى.
    const latestIds = await db.execute(sql`
      SELECT id FROM (
        SELECT DISTINCT ON (peer) id, created_at
        FROM (
          SELECT id, created_at, CASE WHEN sender_id = ${me} THEN recipient_id ELSE sender_id END AS peer
          FROM duty_chat_messages
          WHERE sender_id = ${me} OR recipient_id = ${me}
        ) mine
        ORDER BY peer, created_at DESC, id DESC
      ) t
      ORDER BY created_at DESC
      LIMIT 200
    `);
    const ids = (latestIds.rows as { id: string }[]).map((r) => r.id);
    const recent = ids.length
      ? await db.select().from(dutyChatMessages).where(inArray(dutyChatMessages.id, ids)).orderBy(desc(dutyChatMessages.createdAt))
      : [];
    const pending = await db.select({
      senderId: dutyChatMessages.senderId,
      readAt: dutyChatMessages.readAt,
      kind: dutyChatMessages.kind,
      ackedAt: dutyChatMessages.ackedAt,
    }).from(dutyChatMessages)
      .where(and(
        eq(dutyChatMessages.recipientId, me),
        or(isNull(dutyChatMessages.readAt), and(eq(dutyChatMessages.kind, "alert"), isNull(dutyChatMessages.ackedAt))),
      ))
      .limit(1000);

    const latest = new Map<string, Row>();
    for (const r of recent) {
      const peer = r.senderId === me ? r.recipientId : r.senderId;
      if (!latest.has(peer)) latest.set(peer, r);
    }
    const counts = new Map<string, { unread: number; acks: number }>();
    for (const p of pending) {
      const c = counts.get(p.senderId) ?? { unread: 0, acks: 0 };
      if (!p.readAt) c.unread++;
      if (p.kind === "alert" && !p.ackedAt) c.acks++;
      counts.set(p.senderId, c);
    }
    const peers = await loadPeers(Array.from(latest.keys()));
    const conversations: DutyChatConversation[] = [];
    for (const [peerId, row] of latest) {
      const peer = peers.get(peerId);
      if (!peer) continue;
      const c = counts.get(peerId);
      conversations.push({ peer, last: toMessage(row, me), unread: c?.unread ?? 0, pendingAcks: c?.acks ?? 0 });
    }
    return {
      me,
      conversations,
      unreadTotal: conversations.reduce((n, c) => n + c.unread, 0),
    };
  });
}

export async function getThread(me: string, peerId: string, before: string | null): Promise<DutyChatThreadResponse> {
  await assertPair(me, peerId);
  return guard(async () => {
    const pair = or(
      and(eq(dutyChatMessages.senderId, me), eq(dutyChatMessages.recipientId, peerId)),
      and(eq(dutyChatMessages.senderId, peerId), eq(dutyChatMessages.recipientId, me)),
    );
    const beforeDate = before ? new Date(before) : null;
    const where = beforeDate && Number.isFinite(beforeDate.getTime())
      ? and(pair, lt(dutyChatMessages.createdAt, beforeDate))
      : pair;
    const rows = await db.select().from(dutyChatMessages)
      .where(where)
      .orderBy(desc(dutyChatMessages.createdAt))
      .limit(DUTY_CHAT_PAGE_SIZE + 1);
    const hasMore = rows.length > DUTY_CHAT_PAGE_SIZE;
    const page = rows.slice(0, DUTY_CHAT_PAGE_SIZE).reverse();
    const peers = await loadPeers([peerId]);
    const peer = peers.get(peerId);
    if (!peer) throw new DutyChatInputError("المستخدم غير موجود");
    return { peer, messages: page.map((r) => toMessage(r, me)), hasMore };
  });
}

// ---------- الكتابة ----------

export interface SendInput {
  body: string;
  kind: DutyChatKind;
  file?: { buffer: Buffer; mime: string; name: string } | null;
}

export async function sendMessage(me: string, peerId: string, input: SendInput): Promise<DutyChatMessage> {
  await assertPair(me, peerId);
  if (!input.body && !input.file) throw new DutyChatInputError("اكتب رسالة أو أرفق ملفًا");
  return guard(async () => {
    let attachment: { key: string; name: string; mime: string; size: number } | null = null;
    if (input.file) {
      const ext = input.file.mime === "application/pdf" ? "pdf" : input.file.mime.split("/")[1] || "bin";
      const key = `duty-chat/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
      const stored = await new ObjectStorageService().uploadPrivateDocument(key, input.file.buffer, input.file.mime);
      attachment = { key: stored.path || key, name: input.file.name, mime: input.file.mime, size: input.file.buffer.length };
    }
    const [row] = await db.insert(dutyChatMessages).values({
      senderId: me,
      recipientId: peerId,
      body: input.body,
      kind: input.kind,
      attachmentKey: attachment?.key ?? null,
      attachmentName: attachment?.name ?? null,
      attachmentMime: attachment?.mime ?? null,
      attachmentSize: attachment?.size ?? null,
    }).returning();
    const message = toMessage(row, me);
    publishDutyChatEvent([me, peerId], { type: "message", message });
    void pushIfOffline(me, peerId, message);
    return message;
  });
}

async function stampAndPublish(
  rows: Array<{ id: string; senderId: string }>,
  field: "deliveredAt" | "readAt" | "ackedAt",
  me: string,
  at: Date,
): Promise<number> {
  const bySender = new Map<string, string[]>();
  for (const r of rows) bySender.set(r.senderId, [...(bySender.get(r.senderId) ?? []), r.id]);
  for (const [senderId, ids] of bySender) {
    publishDutyChatEvent([senderId, me], { type: "status", peerId: me, ids, field, at: at.toISOString() });
  }
  return rows.length;
}

/** كل ما وصلني ولم يُختم بالتسليم: وصل الآن إلى جهازي. */
export async function markDelivered(me: string): Promise<number> {
  return guard(async () => {
    const at = new Date();
    const rows = await db.update(dutyChatMessages)
      .set({ deliveredAt: at })
      .where(and(eq(dutyChatMessages.recipientId, me), isNull(dutyChatMessages.deliveredAt)))
      .returning({ id: dutyChatMessages.id, senderId: dutyChatMessages.senderId });
    return stampAndPublish(rows, "deliveredAt", me, at);
  });
}

/** فتحتُ المحادثة مع peer: كل رسائله إليّ مقروءة. */
export async function markRead(me: string, peerId: string): Promise<number> {
  await assertPair(me, peerId);
  return guard(async () => {
    const at = new Date();
    const rows = await db.update(dutyChatMessages)
      .set({ readAt: at, deliveredAt: sql`coalesce(${dutyChatMessages.deliveredAt}, ${at})` })
      .where(and(
        eq(dutyChatMessages.recipientId, me),
        eq(dutyChatMessages.senderId, peerId),
        isNull(dutyChatMessages.readAt),
      ))
      .returning({ id: dutyChatMessages.id, senderId: dutyChatMessages.senderId });
    return stampAndPublish(rows, "readAt", me, at);
  });
}

/** «استلمت» على تنبيه وصلني. */
export async function ackMessage(me: string, messageId: string): Promise<DutyChatMessage> {
  return guard(async () => {
    const at = new Date();
    const [row] = await db.update(dutyChatMessages)
      .set({
        ackedAt: at,
        readAt: sql`coalesce(${dutyChatMessages.readAt}, ${at})`,
        deliveredAt: sql`coalesce(${dutyChatMessages.deliveredAt}, ${at})`,
      })
      .where(and(
        eq(dutyChatMessages.id, messageId),
        eq(dutyChatMessages.recipientId, me),
        eq(dutyChatMessages.kind, "alert"),
      ))
      .returning();
    if (!row) throw new DutyChatInputError("التنبيه غير موجود");
    await stampAndPublish([{ id: row.id, senderId: row.senderId }], "ackedAt", me, row.ackedAt ?? at);
    return toMessage(row, me);
  });
}

export async function sendTyping(me: string, peerId: string): Promise<void> {
  await assertPair(me, peerId);
  publishDutyChatEvent([peerId], { type: "typing", peerId: me });
}

/** المرفق لطرفي المحادثة فقط: رابط موقّع قصير العمر. */
export async function getAttachment(me: string, messageId: string): Promise<{ signedUrl: string; name: string; mime: string } | null> {
  return guard(async () => {
    const [row] = await db.select().from(dutyChatMessages).where(eq(dutyChatMessages.id, messageId)).limit(1);
    if (!row || !row.attachmentKey) return null;
    if (row.senderId !== me && row.recipientId !== me) return null;
    const signedUrl = await new ObjectStorageService().getPrivateFileDownloadURL(row.attachmentKey, 300);
    return { signedUrl, name: row.attachmentName ?? "مرفق", mime: row.attachmentMime ?? "application/octet-stream" };
  });
}

// ---------- إشعار «مكتب سبق» لمن ليس متصلًا ----------

async function pushIfOffline(me: string, peerId: string, message: DutyChatMessage): Promise<void> {
  try {
    const peers = await loadPeers([me, peerId]);
    if (peers.get(peerId)?.online) return;
    await sendDeskPush(peerId, me, peers.get(me)?.name ?? "مدير المحتوى", message);
  } catch (error) {
    console.error("[DutyChat] desk push failed:", (error as Error).message);
  }
}

async function sendDeskPush(recipientId: string, senderId: string, sender: string, message: Pick<DutyChatMessage, "id" | "body" | "kind" | "attachment">) {
  const text = messagePreview(message);
  await sendPushToUserApp(recipientId, STAFF_APP_BUNDLE_ID, {
    title: message.kind === "alert" ? `تنبيه من ${sender}` : `رسالة من ${sender}`,
    body: text.length > 180 ? `${text.slice(0, 179)}…` : text,
    type: "duty_chat_message",
    deeplink: "/dashboard",
    collapseId: `duty-chat-${senderId}`,
    interruptionLevel: message.kind === "alert" ? "time-sensitive" : "active",
    data: { senderId, messageId: message.id },
  });
}

const fallbackSent = new Set<string>();
const FALLBACK_WINDOW_MS = 15 * 60_000;

/**
 * المستلم متصل باللوحة لكن في صفحة بلا شريط، والمتصفح لا يسمح بالإشعار:
 * يطلب جهازه إشعار «مكتب سبق» بدلًا منه. مرة واحدة لكل رسالة، ولرسالة حديثة لم تُقرأ.
 */
export async function pushFallback(me: string, messageId: string): Promise<boolean> {
  return guard(async () => {
    if (!messageId || fallbackSent.has(messageId)) return false;
    const [row] = await db.select().from(dutyChatMessages)
      .where(and(eq(dutyChatMessages.id, messageId), eq(dutyChatMessages.recipientId, me), isNull(dutyChatMessages.readAt)))
      .limit(1);
    if (!row || Date.now() - new Date(row.createdAt).getTime() > FALLBACK_WINDOW_MS) return false;
    fallbackSent.add(messageId);
    if (fallbackSent.size > 5000) fallbackSent.clear();
    const peers = await loadPeers([row.senderId]);
    try {
      await sendDeskPush(me, row.senderId, peers.get(row.senderId)?.name ?? "مدير المحتوى", toMessage(row, me));
    } catch (error) {
      console.error("[DutyChat] fallback push failed:", (error as Error).message);
      return false;
    }
    return true;
  });
}

// ---------- ناقل الأحداث ----------

interface BusEnvelope { podId: string; to: string[]; event: DutyChatEvent }

const POD_ID = `${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const CHANNEL = "duty-chat:events";
const bus = new EventEmitter();
bus.setMaxListeners(1000);
let pub: Redis | null = null;
let sub: Redis | null = null;
let busInit = false;

function initBus(): void {
  if (busInit || !process.env.REDIS_URL) return;
  busInit = true;
  try {
    pub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    sub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    pub.on("error", (e) => console.error("[DutyChat] redis pub error:", e.message));
    sub.on("error", (e) => console.error("[DutyChat] redis sub error:", e.message));
    sub.subscribe(CHANNEL, (err) => {
      if (err) console.error("[DutyChat] subscribe failed:", err.message);
    });
    sub.on("message", (_ch, raw) => {
      try {
        const env = JSON.parse(raw) as BusEnvelope;
        if (env.podId === POD_ID) return;
        for (const uid of env.to) bus.emit(`u:${uid}`, env.event);
      } catch {
        /* رسالة مشوهة */
      }
    });
  } catch (error) {
    console.error("[DutyChat] redis bus init failed:", (error as Error).message);
  }
}

export function publishDutyChatEvent(to: readonly string[], event: DutyChatEvent): void {
  const targets = Array.from(new Set(to));
  for (const uid of targets) bus.emit(`u:${uid}`, event);
  initBus();
  pub?.publish(CHANNEL, JSON.stringify({ podId: POD_ID, to: targets, event } satisfies BusEnvelope)).catch(() => {});
}

export function subscribeDutyChat(userId: string, listener: (event: DutyChatEvent) => void): () => void {
  initBus();
  const ch = `u:${userId}`;
  bus.on(ch, listener);
  return () => bus.off(ch, listener);
}
