// وثيقة المحضر (PDF والبريد) — القوالب النقية وقاعدة التحميل.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("../../server/db", () => ({ db: {} }));

import {
  accessLabelFor,
  arCount,
  esc,
  formatDuration,
  formatGregorianDay,
  formatHijriDay,
  formatOffset,
  groupTranscriptTurns,
  formatTimeRange,
  minutesPdfFileName,
  renderMinutesEmailHtml,
  renderMinutesPdfHtml,
  splitParagraphs,
  type MinutesDocument,
  type MinutesPdfAssets,
} from "../../server/services/meetingMinutesDocument";
import {
  canDownloadMinutesPdf,
  closeBrowserWithin,
  minutesPdfCacheKey,
  withDeadline,
} from "../../server/services/meetingMinutesPdfService";

const root = path.resolve(import.meta.dirname, "../..");
const NO_ASSETS: MinutesPdfAssets = {
  logoWhite: null,
  mark: null,
  fonts: { displaySemiBold: null, displayBold: null, displayBlack: null, bodyRegular: null, bodySemiBold: null },
};

// 2:53 – 2:57 مساءً بتوقيت الرياض، الثلاثاء 17 نوفمبر 2026
const start = new Date("2026-11-17T11:53:00Z");
const end = new Date("2026-11-17T11:57:10Z");

const doc = (over: Partial<MinutesDocument> = {}): MinutesDocument => ({
  meetingId: "m-1",
  title: "اجتماع المراسلين",
  startedAt: start,
  endedAt: end,
  chair: { name: "علي الحازمي", title: "رئيس التحرير" },
  attendees: [
    { name: "علي الحازمي", title: "رئيس التحرير" },
    { name: "علي بن عبده الحازمي", title: "مراسل" },
  ],
  absent: [{ name: "فهد الدوسري", reason: "اعتذر" }],
  agenda: ["ترحيب", "نقاش"],
  accessLabel: "بدعوات محددة",
  minutes: {
    summary: "الفقرة الأولى.\n\nالفقرة الثانية.\nالفقرة الثالثة.",
    decisions: ["دراسة المقترحات الثلاثة.", "المضي في خطوات تطويرية."],
    actionItems: [
      { task: "خطة تطوير إدخال الأخبار", owner: "إدارة التحرير", due: null },
      { task: "آلية النشر", owner: null, due: "24 نوفمبر", done: true },
    ],
    deferred: [],
  },
  approval: { by: { name: "علي الحازمي", title: "رئيس التحرير" }, at: new Date("2026-11-17T12:01:00Z") },
  ...over,
});

describe("التنسيق", () => {
  it("اليوم والتاريخ ميلادياً وهجرياً بتوقيت الرياض", () => {
    expect(formatGregorianDay(start)).toBe("الثلاثاء 17 نوفمبر 2026م");
    expect(formatHijriDay(start)).toMatch(/^7 جمادى الآخرة 1448\s?هـ$/);
    // قبيل منتصف الليل UTC = اليوم التالي في الرياض
    expect(formatGregorianDay(new Date("2026-11-17T21:30:00Z"))).toBe("الأربعاء 18 نوفمبر 2026م");
  });

  it("مدى الوقت: فترة واحدة تُذكر مرة، وفترتان تُذكران", () => {
    expect(formatTimeRange(start, end)).toBe("2:53 – 2:57 مساءً");
    expect(formatTimeRange(new Date("2026-11-17T08:50:00Z"), new Date("2026-11-17T09:20:00Z"))).toBe(
      "11:50 صباحًا – 12:20 مساءً",
    );
    expect(formatTimeRange(start, null)).toBe("2:53 مساءً");
    expect(formatTimeRange(null, null)).toBe("");
  });

  it("المدة بصياغة عربية صحيحة", () => {
    expect(formatDuration(start, end)).toBe("4 دقائق");
    expect(formatDuration(start, new Date(start.getTime() + 60_000))).toBe("دقيقة واحدة");
    expect(formatDuration(start, new Date(start.getTime() + 120_000))).toBe("دقيقتان");
    expect(formatDuration(start, new Date(start.getTime() + 34 * 60_000))).toBe("34 دقيقة");
    expect(formatDuration(null, end)).toBe("");
    expect(arCount(3, { one: "a", two: "b", few: "مهام", many: "مهمة", zero: "z" })).toBe("3 مهام");
  });

  it("الملخص يُقسَّم فقرات على فواصل الأسطر", () => {
    expect(splitParagraphs("أ\n\nب\r\nج  د\n\n\n")).toEqual(["أ", "ب", "ج د"]);
    expect(splitParagraphs(null)).toEqual([]);
  });

  it("وصف نمط الدخول واسم الملف", () => {
    expect(accessLabelFor("selected")).toBe("بدعوات محددة");
    expect(accessLabelFor("غير معروف")).toBe("");
    expect(minutesPdfFileName('اجتماع "المراسلين" / خاص\n', start)).toBe("محضر اجتماع المراسلين خاص 2026-11-17.pdf");
    expect(minutesPdfFileName("   ", null)).toBe("محضر اجتماع.pdf");
  });
});

describe("قالب PDF", () => {
  const html = renderMinutesPdfHtml(doc(), NO_ASSETS);

  it("القرارات والمهام قبل الملخص، والوقائع في العمود الجانبي", () => {
    const order = ["القرارات", "المهام", "ملخص الاجتماع", "رئيس الاجتماع", "جدول الأعمال"].map((t) =>
      html.indexOf(`>${t}`),
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("يحمل التاريخ والوقت والمدة والحضور والغياب بأسمائهم", () => {
    for (const t of [
      "الثلاثاء 17 نوفمبر 2026م",
      "2:53 – 2:57 مساءً بتوقيت الرياض",
      "4 دقائق",
      "حضر (2 من 3)",
      "علي بن عبده الحازمي",
      "فهد الدوسري",
      "اعتذر",
      "بدعوات محددة",
    ]) {
      expect(html, t).toContain(t);
    }
  });

  it("الملخص ثلاث فقرات لا فقرة واحدة", () => {
    const sum = html.slice(html.indexOf(">ملخص الاجتماع"), html.indexOf('<aside class="rail">'));
    expect(sum.match(/<p>/g)?.length).toBe(3);
  });

  it("المهمة المنجزة تظهر «منجزة»، وغير المحددة «لم يُحدَّد»", () => {
    expect(html).toContain('<td class="done">منجزة</td>');
    expect(html).toContain('<td class="who">لم يُحدَّد</td>');
    expect(html).toContain('<td class="due">لم يُحدَّد</td>');
  });

  it("معتمد: اسم المعتمِد والختم؛ مسودة: ختم «غير معتمدة» بلا اسم معتمِد", () => {
    expect(html).toContain("اعتمده");
    expect(html).toContain("معتمد<small>صحيفة سبق</small>");
    const draft = renderMinutesPdfHtml(doc({ approval: null }), NO_ASSETS);
    expect(draft).toContain("مسودة لم تُعتمد بعد");
    expect(draft).toContain("مسودة<small>غير معتمدة</small>");
    expect(draft).not.toContain(">اعتمده<");
  });

  it("يهرّب كل نص قادم من المستخدم أو النموذج", () => {
    const evil = '<script>alert(1)</script><img src=x onerror="x">';
    const out = renderMinutesPdfHtml(
      doc({
        title: evil,
        chair: { name: evil, title: evil },
        attendees: [{ name: evil, title: evil }],
        absent: [{ name: evil, reason: evil }],
        agenda: [evil],
        minutes: { summary: evil, decisions: [evil], actionItems: [{ task: evil, owner: evil, due: evil }], deferred: [evil] },
      }),
      NO_ASSETS,
    );
    expect(out).not.toContain("<script>");
    expect(out).not.toMatch(/<img src=x/);
    expect(out).toContain("&lt;script&gt;");
    expect(esc(`"'&<>`)).toBe("&quot;&#39;&amp;&lt;&gt;");
  });

  it("بلا أصول ولا خطوط لا يفشل، ويتحمل محضراً فارغاً", () => {
    const out = renderMinutesPdfHtml(
      doc({ absent: [], agenda: [], minutes: { summary: "", decisions: [], actionItems: [], deferred: [] } }),
      NO_ASSETS,
    );
    expect(out).toContain("لم تُسجَّل قرارات");
    expect(out).toContain("لم تُسجَّل مهام");
    expect(out).not.toContain("@font-face");
    expect(out).not.toContain(">جدول الأعمال");
  });
});

describe("ملحق التفريغ — نسخة رئيس الاجتماع فقط", () => {
  const transcript = {
    truncated: false,
    turns: [
      { startMs: 7_000, speakerName: "علي الحازمي", text: "نبدأ <b>الاجتماع</b>" },
      { startMs: 3_729_000, speakerName: "أحد المراسلين", text: "عندي مقترح." },
    ],
  };

  it("نسخة الحضور والبريد بلا أي تفريغ", () => {
    const html = renderMinutesPdfHtml(doc(), NO_ASSETS);
    expect(html).not.toContain("ملحق: تفريغ الاجتماع");
    expect(html).not.toContain('class="apx"');
    expect(html).toContain("وثيقة داخلية");
    const email = renderMinutesEmailHtml(doc({ transcript }), {
      minutesUrl: "https://sabq.org/x",
      logoUrl: "https://sabq.org/l.png",
    });
    expect(email).not.toContain("عندي مقترح");
    expect(email).not.toContain("ملحق");
  });

  it("نسخة المضيف تحمل الملحق بعد التوقيع، بالتوقيت والاسم، ونصه مهرَّب", () => {
    const html = renderMinutesPdfHtml(doc({ transcript }), NO_ASSETS);
    expect(html.indexOf('class="apx"')).toBeGreaterThan(html.indexOf('class="sign"'));
    expect(html).toContain("نسخة رئيس الاجتماع · تتضمن التفريغ");
    expect(html).toContain("<time>0:07</time>");
    expect(html).toContain("<time>1:02:09</time>");
    expect(html).toContain("أحد المراسلين");
    expect(html).toContain("نبدأ &lt;b&gt;الاجتماع&lt;/b&gt;");
    expect(html).not.toContain("<b>الاجتماع</b>");
  });

  it("تفريغ فارغ (حُذف بعد 30 يومًا) يظهر كملاحظة لا كصفحة فارغة", () => {
    const html = renderMinutesPdfHtml(doc({ transcript: { turns: [], truncated: false } }), NO_ASSETS);
    expect(html).toContain("لا يوجد تفريغ محفوظ");
  });

  it("يضم مقاطع المتحدث المتتالية ولا يخلط حسابين يحملان الاسم نفسه", () => {
    const turns = groupTranscriptTurns([
      { speakerIdentity: "u1", speakerName: "علي", text: " أولًا ", startMs: 1000 },
      { speakerIdentity: "u1", speakerName: "علي", text: "ثانيًا", startMs: 4000 },
      { speakerIdentity: "u2", speakerName: "علي", text: "ثالثًا", startMs: 6000 },
      { speakerIdentity: "u2", speakerName: "علي", text: "   ", startMs: 7000 },
      { speakerIdentity: "u1", speakerName: "علي", text: "رابعًا", startMs: 9000 },
    ]);
    expect(turns).toEqual([
      { startMs: 1000, speakerName: "علي", text: "أولًا ثانيًا" },
      { startMs: 6000, speakerName: "علي", text: "ثالثًا" },
      { startMs: 9000, speakerName: "علي", text: "رابعًا" },
    ]);
    const long = groupTranscriptTurns(
      [
        { speakerIdentity: "u1", speakerName: "علي", text: "ا".repeat(400), startMs: 0 },
        { speakerIdentity: "u1", speakerName: "علي", text: "ب".repeat(400), startMs: 5000 },
      ],
      700,
    );
    expect(long).toHaveLength(2);
  });

  it("مفتاح الكاش يفصل نسخة المضيف عن نسخة الحضور، واسم الملف يميّزها", () => {
    const meeting = {
      id: "m-1", title: "اجتماع", minutesStatus: "approved",
      minutesApprovedAt: new Date(1), minutesGeneratedAt: new Date(2), minutes: { summary: "س" },
    } as never;
    expect(minutesPdfCacheKey(meeting, true)).not.toBe(minutesPdfCacheKey(meeting, false));
    expect(minutesPdfCacheKey(meeting)).toBe(minutesPdfCacheKey(meeting, false));
    expect(minutesPdfFileName("اجتماع", null, true)).toBe("محضر اجتماع (نسخة رئيس الاجتماع).pdf");
    expect(formatOffset(-5)).toBe("0:00");
  });
});

describe("قالب البريد", () => {
  const html = renderMinutesEmailHtml(doc(), {
    minutesUrl: "https://sabq.org/dashboard/meetings/m-1/minutes",
    logoUrl: "https://sabq.org/branding/sabq-logo.png",
  });

  it("يحمل التاريخ والحضور والغياب والملخص فقرات ورابط اللوحة", () => {
    expect(html).toContain("الثلاثاء 17 نوفمبر 2026م");
    expect(html).toContain("حضر (2):");
    expect(html).toContain("فهد الدوسري (اعتذر)");
    const sum = html.slice(html.indexOf("ملخص الاجتماع"));
    expect(sum.match(/<p style="margin:0 0 10px">/g)?.length).toBe(3);
    expect(html).toContain('href="https://sabq.org/dashboard/meetings/m-1/minutes"');
    expect(html).toContain("اعتمده علي الحازمي، رئيس التحرير");
  });

  it("لا مرفق ولا رابط مباشر لملف PDF، ولا سكربت", () => {
    expect(html).not.toContain("/minutes/pdf");
    expect(html).not.toContain("<script");
  });

  it("يهرّب المحتوى والروابط", () => {
    const out = renderMinutesEmailHtml(doc({ title: "<b>x</b>" }), {
      minutesUrl: 'https://sabq.org/"onmouseover="x',
      logoUrl: "https://sabq.org/branding/sabq-logo.png",
    });
    expect(out).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(out).not.toContain('"onmouseover="x');
  });
});

describe("قاعدة تحميل الملف", () => {
  it("المضيف: المسودة والمعتمد فقط", () => {
    for (const s of ["draft", "approved"]) {
      expect(canDownloadMinutesPdf({ isHost: true, minutesStatus: s, attended: true })).toBe(true);
    }
    for (const s of ["none", "recording", "generating", "failed"]) {
      expect(canDownloadMinutesPdf({ isHost: true, minutesStatus: s, attended: true })).toBe(false);
    }
  });

  it("غير المضيف: بعد الاعتماد وإن كان قد حضر — لا مسودة ولا لمن لم يحضر", () => {
    expect(canDownloadMinutesPdf({ isHost: false, minutesStatus: "approved", attended: true })).toBe(true);
    expect(canDownloadMinutesPdf({ isHost: false, minutesStatus: "approved", attended: false })).toBe(false);
    expect(canDownloadMinutesPdf({ isHost: false, minutesStatus: "draft", attended: true })).toBe(false);
  });

  it("توليد واحد للطلبات المتزامنة على الملف نفسه، وطابور محدود", () => {
    const svc = readFileSync(path.join(root, "server/services/meetingMinutesPdfService.ts"), "utf8");
    const fn = svc.slice(svc.indexOf("export async function generateMinutesPdf"));
    expect(fn).toContain("const running = pdfInflight.get(key);");
    expect(fn.indexOf("pdfInflight.get(key)")).toBeLessThan(fn.indexOf("renderHtmlToPdf(html)"));
    expect(fn).toContain("if (pdfQueued >= PDF_MAX_QUEUED) throw new MinutesPdfBusyError();");
    expect(fn).toContain("pdfInflight.delete(key);");
  });

  it("الاعتماد يبني وثيقة البريد قبل تغيير الحالة — لا محضر معتمد بلا بريد", () => {
    const svc = readFileSync(path.join(root, "server/services/meetingMinutesService.ts"), "utf8");
    const fn = svc.slice(svc.indexOf("export async function approveAndDistributeMinutes"));
    const build = fn.indexOf("await buildMinutesDocument(meeting)");
    const update = fn.indexOf('minutesStatus: "approved"');
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(update);
    expect(fn.indexOf('await import("./meetingMinutesDocument")')).toBeLessThan(update);
  });

  it("المسار خلف تسجيل الدخول، يطبق القاعدة، وبلا كاش وسيط", () => {
    const routes = readFileSync(path.join(root, "server/routes/meetingMinutesRoutes.ts"), "utf8");
    const block = routes.slice(routes.indexOf('"/api/meetings/:id/minutes/pdf"'));
    const handler = block.slice(0, block.indexOf("\n);\n"));
    expect(handler).toContain("isAuthenticated,");
    expect(handler).toContain("canDownloadMinutesPdf({");
    expect(handler).toContain("return res.status(403)");
    expect(handler.indexOf("return res.status(403)")).toBeLessThan(handler.indexOf("generateMinutesPdf(meeting"));
    // الملحق بطلب صريح من المضيف/المدير فقط؛ الافتراضي نسخة التوزيع
    expect(handler).toContain('const withTranscript = isHost && req.query.transcript === "1";');
    expect(handler).toContain("generateMinutesPdf(meeting, { includeTranscript: withTranscript })");
    expect(handler).toContain('"private, no-store"');
  });
});

describe("مهلة توليد PDF — متصفح عالق لا يحجز الطابور", () => {
  it("withDeadline يرفض عند المهلة ولا ينتظر وعداً لا ينتهي", async () => {
    const never = new Promise<number>(() => undefined);
    await expect(withDeadline(never, 10, () => new Error("T"))).rejects.toThrow("T");
    await expect(withDeadline(Promise.resolve(7), 1000, () => new Error("T"))).resolves.toBe(7);
    await expect(withDeadline(Promise.reject(new Error("X")), 1000, () => new Error("T"))).rejects.toThrow("X");
  });

  it("إغلاق عالق يقتل عملية المتصفح، والإغلاق السليم لا يقتلها", async () => {
    const kill = vi.fn(() => true);
    await closeBrowserWithin({ close: () => new Promise(() => undefined), process: () => ({ kill }) }, 10);
    expect(kill).toHaveBeenCalledWith("SIGKILL");
    const kill2 = vi.fn(() => true);
    await closeBrowserWithin({ close: async () => undefined, process: () => ({ kill: kill2 }) }, 1000);
    expect(kill2).not.toHaveBeenCalled();
    // close يرمي + لا عملية: لا يرمي للمستدعي
    await closeBrowserWithin({ close: async () => { throw new Error("x"); }, process: () => null }, 1000);
  });
});
