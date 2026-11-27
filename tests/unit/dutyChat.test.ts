import { describe, expect, it } from "vitest";
import {
  messagePreview,
  appendMessage,
  applyStatusEvent,
  isAllowedAttachmentMime,
  isOnline,
  mergeMessages,
  normalizeBody,
  pickStripConversation,
  pickStripConversations,
  stripItemFor,
  safeFileName,
  tickFor,
  type DutyChatConversation,
  type DutyChatMessage,
} from "@shared/dutyChat";

const msg = (over: Partial<DutyChatMessage> = {}): DutyChatMessage => ({
  id: "m1",
  senderId: "a",
  recipientId: "b",
  mine: true,
  body: "مرحبا",
  kind: "normal",
  attachment: null,
  createdAt: "2026-11-26T10:00:00.000Z",
  deliveredAt: null,
  readAt: null,
  ackedAt: null,
  ...over,
});

const NOW = Date.parse("2026-11-26T19:00:00Z");

const conv = (peerId: string, createdAt: string, over: Partial<DutyChatConversation> = {}): DutyChatConversation => ({
  peer: { id: peerId, name: peerId, initial: peerId[0], online: false, lastSeenAt: null },
  last: msg({ id: `${peerId}-last`, createdAt }),
  unread: 0,
  pendingAcks: 0,
  ...over,
});

describe("duty chat ticks", () => {
  it("one grey tick until delivered, two grey after delivery, two blue after reading", () => {
    expect(tickFor(msg())).toBe("sent");
    expect(tickFor(msg({ deliveredAt: "2026-11-26T10:00:01Z" }))).toBe("delivered");
    expect(tickFor(msg({ deliveredAt: "2026-11-26T10:00:01Z", readAt: "2026-11-26T10:00:05Z" }))).toBe("read");
    // قراءة بلا ختم تسليم (سباق بين النسخ) تبقى «قُرئت»
    expect(tickFor(msg({ readAt: "2026-11-26T10:00:05Z" }))).toBe("read");
  });
});

describe("duty chat presence", () => {
  const now = Date.parse("2026-11-26T10:00:00Z");
  it("online within 75 seconds of the last heartbeat only", () => {
    expect(isOnline("2026-11-26T09:59:00Z", now)).toBe(true);
    expect(isOnline("2026-11-26T09:58:40Z", now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
    expect(isOnline("not a date", now)).toBe(false);
  });
});

describe("duty chat status events", () => {
  it("read implies delivered, ack implies read, and existing stamps are kept", () => {
    const list = [msg({ id: "x" }), msg({ id: "y", deliveredAt: "2026-11-26T10:00:02Z" }), msg({ id: "z" })];
    const read = applyStatusEvent(list, { type: "status", peerId: "b", ids: ["x", "y"], field: "readAt", at: "2026-11-26T10:01:00Z" });
    expect(read[0]).toMatchObject({ readAt: "2026-11-26T10:01:00Z", deliveredAt: "2026-11-26T10:01:00Z" });
    expect(read[1]).toMatchObject({ readAt: "2026-11-26T10:01:00Z", deliveredAt: "2026-11-26T10:00:02Z" });
    expect(read[2].readAt).toBeNull();

    const acked = applyStatusEvent([msg({ id: "a1", kind: "alert" })], { type: "status", peerId: "b", ids: ["a1"], field: "ackedAt", at: "2026-11-26T10:02:00Z" });
    expect(acked[0]).toMatchObject({ ackedAt: "2026-11-26T10:02:00Z", readAt: "2026-11-26T10:02:00Z", deliveredAt: "2026-11-26T10:02:00Z" });
  });

  it("a message arriving from both the stream and the send response is added once", () => {
    const once = appendMessage([msg({ id: "1" })], msg({ id: "2" }));
    expect(appendMessage(once, msg({ id: "2" }))).toHaveLength(2);
  });
});

describe("duty chat paging", () => {
  it("keeps older pages and messages that left the latest page, with fresh status winning", () => {
    const older = [msg({ id: "1", createdAt: "2026-11-26T09:00:00Z" }), msg({ id: "2", createdAt: "2026-11-26T09:01:00Z" })];
    const latest = [msg({ id: "2", createdAt: "2026-11-26T09:01:00Z", readAt: "2026-11-26T09:05:00Z" }), msg({ id: "3", createdAt: "2026-11-26T09:02:00Z" })];
    const merged = mergeMessages(older, latest);
    expect(merged.map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(merged[1].readAt).toBe("2026-11-26T09:05:00Z");
  });
});

describe("duty chat strip", () => {
  it("shows the newest conversation with unread or unacknowledged alerts first", () => {
    const list = [
      conv("duty", "2026-11-26T10:05:00Z"),
      conv("old-unread", "2026-11-26T09:00:00Z", { unread: 2 }),
      conv("alert", "2026-11-26T09:30:00Z", { pendingAcks: 1 }),
    ];
    expect(pickStripConversation(list, ["duty"])?.peer.id).toBe("alert");
  });

  it("otherwise shows the latest chat with someone on duty now, else nothing", () => {
    const list = [conv("someone", "2026-11-26T10:09:00Z"), conv("duty", "2026-11-26T10:05:00Z")];
    expect(pickStripConversation(list, ["duty"])?.peer.id).toBe("duty");
    expect(pickStripConversation(list, ["nobody"])).toBeNull();
    expect(pickStripConversation([], ["duty"])).toBeNull();
  });

  it("keeps the latest chat visible for the person on duty so they can reply to the manager", () => {
    const list = [conv("lead", "2026-11-26T10:09:00Z")];
    expect(pickStripConversation(list, ["me"], "me")?.peer.id).toBe("lead");
    expect(pickStripConversation(list, ["someone-else"], "me")).toBeNull();
  });
});

describe("duty chat input", () => {
  it("accepts images and PDF only", () => {
    expect(isAllowedAttachmentMime("image/png")).toBe(true);
    expect(isAllowedAttachmentMime("application/pdf")).toBe(true);
    expect(isAllowedAttachmentMime("text/html")).toBe(false);
    expect(isAllowedAttachmentMime("image/svg+xml")).toBe(false);
    expect(isAllowedAttachmentMime(null)).toBe(false);
  });

  it("strips paths and unsafe characters from file names", () => {
    expect(safeFileName("../../etc/بيان\"القمة\".pdf", "application/pdf")).toBe("بيانالقمة.pdf");
    expect(safeFileName("", "application/pdf")).toBe("مرفق.pdf");
    expect(safeFileName(null, "image/png")).toBe("صورة");
  });

  it("trims and caps the message body", () => {
    expect(normalizeBody("  سطر\r\nثانٍ  ")).toBe("سطر\nثانٍ");
    expect(normalizeBody(42)).toBe("");
    expect(normalizeBody("x".repeat(5000))).toHaveLength(4000);
  });

  it("gives each on-duty colleague their own strip so one chat never hides the other", () => {
    const list = [conv("ali", "2026-11-26T18:40:00Z"), conv("salah", "2026-11-26T18:20:00Z", { pendingAcks: 1 })];
    const { byPeer, extra } = pickStripConversations(list, ["salah", "ali"], "lead", NOW);
    expect([...byPeer.keys()].sort()).toEqual(["ali", "salah"]);
    expect(extra).toBeNull();
    // رسالة منتظرة من غير المناوبين تظهر في شريط مستقل.
    const more = pickStripConversations([...list, conv("off", "2026-11-26T18:41:00Z", { unread: 1 })], ["salah", "ali"], "lead", NOW);
    expect(more.extra?.conversation.peer.id).toBe("off");
    // المناوب نفسه يرى محادثته مع المسؤول، ولا يُحسب صفه هو.
    const self = pickStripConversations([conv("lead", "2026-11-26T18:42:00Z")], ["salah", "me"], "me", NOW);
    expect(self.byPeer.size).toBe(0);
    expect(self.extra?.conversation.peer.id).toBe("lead");
  });
});

describe("stale strips", () => {
  const later = Date.parse("2026-11-27T17:30:00Z");
  it("hides an old read conversation, keeps an old unread one as a compact line", () => {
    const read = conv("amjad", "2026-11-26T13:24:00Z", { last: msg({ createdAt: "2026-11-26T13:24:00Z", readAt: "2026-11-26T13:30:00Z" }) });
    expect(pickStripConversations([read], ["amjad"], "lead", later).byPeer.size).toBe(0);
    const unreadByPeer = conv("amjad", "2026-11-26T13:24:00Z");
    expect(pickStripConversations([unreadByPeer], ["amjad"], "lead", later).byPeer.get("amjad")?.compact).toBe(true);
    // ما ينتظرني يبقى كاملًا مهما قدُم.
    const waiting = conv("amjad", "2026-11-26T13:24:00Z", { unread: 2, last: msg({ mine: false, createdAt: "2026-11-26T13:24:00Z" }) });
    expect(pickStripConversations([waiting], ["amjad"], "lead", later).byPeer.get("amjad")?.compact).toBe(false);
    // تنبيه قُرئ ولم يُؤكَّد: سطر صغير.
    const alert = conv("amjad", "2026-11-26T13:24:00Z", { last: msg({ kind: "alert", createdAt: "2026-11-26T13:24:00Z", readAt: "2026-11-26T13:30:00Z" }) });
    expect(stripItemFor(alert, later)?.compact).toBe(true);
    // خلال 3 ساعات: كامل.
    expect(stripItemFor(read, Date.parse("2026-11-26T15:00:00Z"))?.compact).toBe(false);
  });
});

describe("messagePreview", () => {
  const img = { name: "a.png", mime: "image/png", size: 1, isImage: true, url: "/x" };
  const pdf = { ...img, mime: "application/pdf", isImage: false };
  it("keeps the attachment visible when text accompanies it", () => {
    expect(messagePreview({ body: "يا هلا", attachment: img })).toBe("📎 صورة · يا هلا");
    expect(messagePreview({ body: "", attachment: pdf })).toBe("📎 ملف PDF");
    expect(messagePreview({ body: "نص", attachment: null })).toBe("نص");
  });
});
