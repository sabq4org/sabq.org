// «مُدوِّن سبق AI» — قائمة الأسماء/الأقسام (keyterms) ومسارها: الخادم ← metadata
// الاستدعاء ← prompt التفريغ، وprompt المحضر بقائمة الأسماء وتجاهل المقاطع العبثية.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/ai/gateway", () => ({ aiGateway: { complete: vi.fn() } }));
vi.mock("../../server/services/email", () => ({ sendEmailNotification: vi.fn() }));
vi.mock("../../server/services/meetingsService", () => ({ logMeetingEvent: vi.fn() }));

import {
  MAX_KEYTERMS,
  MAX_KEYTERMS_CHARS,
  composeMeetingVocabulary,
  displayName,
} from "../../server/services/meetingVocabulary";
import {
  MINUTES_AGENT_DISPLAY_NAME,
  MINUTES_SYSTEM_PROMPT,
  buildDispatchMetadata,
  buildMinutesUserMessage,
} from "../../server/services/meetingMinutesService";
import { buildTranscriptionPrompt, parseJobMetadata } from "../../meetings-agent/src/sttConfig";
import { MINUTES_AGENT_DISPLAY_NAME as CLIENT_NAME } from "../../client/src/components/meetings/minutesAgentIdentity";

describe("composeMeetingVocabulary", () => {
  it("المشاركون أولاً ثم الأقسام ثم بقية المنسوبين، بلا تكرار", () => {
    const v = composeMeetingVocabulary({
      participantNames: ["علي الحازمي", " سارة  أحمد ", ""],
      departmentNames: ["التحرير", "التقنية"],
      staffNames: ["علي الحازمي", "خالد"],
    });
    expect(v.names).toEqual(["علي الحازمي", "سارة أحمد", "خالد"]);
    expect(v.departments).toEqual(["التحرير", "التقنية"]);
    expect(v.keyterms).toEqual(["علي الحازمي", "سارة أحمد", "التحرير", "التقنية", "خالد"]);
  });

  it("سقف العدد والطول", () => {
    const staff = Array.from({ length: 400 }, (_, i) => `اسم طويل نسبياً رقم ${i}`);
    const v = composeMeetingVocabulary({ participantNames: [], departmentNames: [], staffNames: staff });
    expect(v.keyterms.length).toBeLessThanOrEqual(MAX_KEYTERMS);
    expect(v.keyterms.join("").length).toBeLessThanOrEqual(MAX_KEYTERMS_CHARS);
    expect(v.names.length).toBe(400); // قائمة المحضر أوسع — يسقفها buildMinutesUserMessage
  });

  it("displayName يجمع الاسم الأول والأخير ويتجاهل الفارغ", () => {
    expect(displayName("علي", "الحازمي")).toBe("علي الحازمي");
    expect(displayName("علي", null)).toBe("علي");
    expect(displayName(null, undefined)).toBe("");
  });
});

describe("metadata الاستدعاء ← العامل (عقد واحد)", () => {
  it("ما يبنيه الخادم يقرؤه العامل ويصل إلى prompt التفريغ", () => {
    const v = composeMeetingVocabulary({
      participantNames: ["نورة العتيبي"],
      departmentNames: ["الاقتصاد"],
      staffNames: [],
    });
    const raw = buildDispatchMetadata("meet-1", v.keyterms);
    const parsed = parseJobMetadata(raw);
    expect(parsed).toEqual({ meetingId: "meet-1", keyterms: ["نورة العتيبي", "الاقتصاد"] });
    const prompt = buildTranscriptionPrompt(parsed.keyterms);
    expect(prompt).toContain("نورة العتيبي");
    expect(prompt).toContain("الاقتصاد");
  });
});

describe("prompt المحضر", () => {
  it("الشخصية الجديدة + تجاهل المقاطع العبثية + الاعتماد على قائمة الأسماء", () => {
    expect(MINUTES_AGENT_DISPLAY_NAME).toBe("مُدوِّن سبق AI");
    expect(CLIENT_NAME).toBe(MINUTES_AGENT_DISPLAY_NAME);
    expect(MINUTES_SYSTEM_PROMPT).toContain("«مُدوِّن سبق AI»");
    expect(MINUTES_SYSTEM_PROMPT).not.toContain("أمين المحضر");
    expect(MINUTES_SYSTEM_PROMPT).toMatch(/مقاطع قصيرة بلا معنى/);
    expect(MINUTES_SYSTEM_PROMPT).toMatch(/تجاهلها تماماً/);
    expect(MINUTES_SYSTEM_PROMPT).toMatch(/قائمة الأسماء/);
  });

  it("رسالة المستخدم تحمل قائمة الأسماء والأقسام ثم التفريغ", () => {
    const msg = buildMinutesUserMessage(
      "اجتماع التحرير",
      { names: ["علي الحازمي", "سارة"], departments: ["التحرير"] },
      "[0:05] علي: صباح الخير",
    );
    expect(msg).toBe(
      "عنوان الاجتماع: اجتماع التحرير\n\nقائمة الأسماء (المشاركون ومنسوبو الجهة): علي الحازمي، سارة\nالأقسام: التحرير\n\nالتفريغ:\n[0:05] علي: صباح الخير",
    );
    const empty = buildMinutesUserMessage("ت", { names: [], departments: [] }, "x");
    expect(empty).toContain("قائمة الأسماء (المشاركون ومنسوبو الجهة): —");
  });
});

describe("الصورة الرمزية", () => {
  it("ملف SVG في client/public بحجم ≤ 30KB يحمل WebP مضمّناً بأبعاد 256", async () => {
    const { readFileSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const { MINUTES_AGENT_AVATAR_URL } = await import(
      "../../client/src/components/meetings/minutesAgentIdentity"
    );
    const file = path.resolve(import.meta.dirname, "../../client/public", MINUTES_AGENT_AVATAR_URL.slice(1));
    expect(statSync(file).size).toBeLessThanOrEqual(30 * 1024);
    const svg = readFileSync(file, "utf8");
    expect(svg).toMatch(/^<svg [^>]*width="256" height="256"/);
    expect(svg).toContain('href="data:image/webp;base64,');
    const b64 = svg.split("base64,")[1].split('"')[0];
    const bytes = Buffer.from(b64, "base64");
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
  });
});
