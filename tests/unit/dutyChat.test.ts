import { describe, expect, it } from "vitest";
import {
  appendMessage,
  applyStatusEvent,
  isAllowedAttachmentMime,
  isOnline,
  normalizeBody,
  pickStripConversation,
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
});
