// ----------------------------------------------------------------------------
// وثيقة محضر الاجتماع — النموذج والقوالب (نقية: بلا قاعدة بيانات ولا متصفح)
//
// التصميم المعتمد 2026-11-17: القرارات والمهام في الصدارة، والوقائع الثابتة
// (رئيس الاجتماع، الحضور، جدول الأعمال) في عمود جانبي، والملخص فقرات.
// قالبان من النموذج نفسه:
//   • renderMinutesPdfHtml  — صفحة A4 تُحوَّل إلى PDF (meetingMinutesPdfService)
//   • renderMinutesEmailHtml — بريد الاعتماد (جداول وأنماط سطرية لبرامج البريد)
// كل نص يأتي من المستخدم أو النموذج يمر عبر esc().
// ----------------------------------------------------------------------------

import type { MeetingMinutes } from "@shared/schema";

export interface MinutesPerson {
  name: string;
  /** المسمى الوظيفي من دليل المنسوبين، أو null */
  title: string | null;
}

export interface MinutesDocument {
  meetingId: string;
  title: string;
  startedAt: Date | null;
  endedAt: Date | null;
  chair: MinutesPerson;
  /** من دخل الاجتماع فعلاً (رئيس الاجتماع أولاً) */
  attendees: MinutesPerson[];
  /** مدعوون لم يدخلوا — reason: «اعتذر» أو «لم يحضر» */
  absent: Array<{ name: string; reason: string }>;
  agenda: string[];
  /** وصف نمط الدخول: «بدعوات محددة»، «لجميع المنسوبين»… */
  accessLabel: string;
  minutes: MeetingMinutes;
  /** null = مسودة لم تُعتمد */
  approval: { by: MinutesPerson; at: Date } | null;
  /**
   * ملحق التفريغ — لنسخة رئيس الاجتماع فقط (قرار المالك: التفريغ الخام للمضيف
   * وحده). غائب أو null في نسخة الحضور وفي البريد.
   */
  transcript?: MinutesTranscript | null;
}

export interface MinutesTranscriptTurn {
  startMs: number;
  speakerName: string;
  text: string;
}

export interface MinutesTranscript {
  turns: MinutesTranscriptTurn[];
  /** تجاوز التفريغ سقف المقاطع فاقتُطع آخره */
  truncated: boolean;
}

/** «4:07» أو «1:02:09» من بداية التسجيل */
export function formatOffset(ms: number): string {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * يضم المقاطع المتتالية للمتحدث نفسه في مداخلة واحدة (حتى maxChars) — تنسيق
 * للقراءة فقط: لا يغيّر نصاً ولا ينسب كلاماً لغير صاحب الحساب المسجَّل.
 */
export function groupTranscriptTurns(
  rows: Array<{ speakerIdentity?: string | null; speakerName: string; text: string; startMs: number }>,
  maxChars = 700,
): MinutesTranscriptTurn[] {
  const turns: MinutesTranscriptTurn[] = [];
  let lastKey: string | null = null;
  for (const r of rows) {
    const text = String(r.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const key = r.speakerIdentity || r.speakerName;
    const last = turns[turns.length - 1];
    if (last && key === lastKey && last.text.length + text.length + 1 <= maxChars) {
      last.text = `${last.text} ${text}`;
    } else {
      turns.push({ startMs: r.startMs, speakerName: r.speakerName || "متحدث", text });
      lastKey = key;
    }
  }
  return turns;
}

// ─── تنسيق ───────────────────────────────────────────────────────────────────

const TZ = "Asia/Riyadh";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** الملخص نص واحد بفواصل أسطر — كل سطر غير فارغ فقرة */
export function splitParagraphs(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function formatGregorianDay(date: Date): string {
  const s = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ,
  }).format(date);
  // «الثلاثاء، 17 نوفمبر 2026» → «الثلاثاء 17 نوفمبر 2026م»
  return `${s.replace("،", "")}م`;
}

export function formatHijriDay(date: Date): string {
  try {
    const s = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric", month: "long", year: "numeric", timeZone: TZ,
    }).format(date);
    return s.includes("هـ") ? s.replace(/\s+هـ/, "هـ") : `${s}هـ`;
  } catch {
    return "";
  }
}

function clockParts(date: Date): { text: string; pm: boolean } {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: TZ,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { text: `${get("hour")}:${get("minute")}`, pm: get("dayPeriod").toUpperCase() === "PM" };
}

/** «2:53 – 2:57 مساءً» — وإن اختلفت الفترتان: «11:50 صباحًا – 12:20 مساءً» */
export function formatTimeRange(start: Date | null, end: Date | null): string {
  const period = (pm: boolean) => (pm ? "مساءً" : "صباحًا");
  if (!start && !end) return "";
  if (!start || !end) {
    const one = clockParts((start ?? end)!);
    return `${one.text} ${period(one.pm)}`;
  }
  const a = clockParts(start);
  const b = clockParts(end);
  return a.pm === b.pm
    ? `${a.text} – ${b.text} ${period(b.pm)}`
    : `${a.text} ${period(a.pm)} – ${b.text} ${period(b.pm)}`;
}

export function formatClock(date: Date): string {
  const c = clockParts(date);
  return `${c.text} ${c.pm ? "م" : "ص"}`;
}

export function durationMinutes(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : null;
}

/** صياغة عربية للمعدود: واحد/مثنى/جمع ٣–١٠/تمييز ١١+ */
export function arCount(
  n: number,
  f: { one: string; two: string; few: string; many: string; zero: string },
): string {
  if (!Number.isFinite(n) || n <= 0) return f.zero;
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  const mod = n % 100;
  return mod >= 3 && mod <= 10 ? `${n} ${f.few}` : `${n} ${f.many}`;
}

const MINUTES_FORMS = { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة", zero: "أقل من دقيقة" };
const TASKS_FORMS = { one: "مهمة واحدة", two: "مهمتان", few: "مهام", many: "مهمة", zero: "لا مهام" };

export function formatDuration(start: Date | null, end: Date | null): string {
  const m = durationMinutes(start, end);
  return m === null ? "" : arCount(m, MINUTES_FORMS);
}

export function accessLabelFor(accessType: string): string {
  switch (accessType) {
    case "all":
      return "لجميع المنسوبين";
    case "department":
      return "لإدارة محددة";
    case "selected":
      return "بدعوات محددة";
    case "link":
      return "برابط دعوة";
    default:
      return "";
  }
}

/** اسم الملف عند التحميل — بلا محارف تكسر الترويسة */
export function minutesPdfFileName(title: string, day: Date | null, hostCopy = false): string {
  const clean = title.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "اجتماع";
  const d = day
    ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(day)
    : "";
  return `محضر ${clean}${d ? ` ${d}` : ""}${hostCopy ? " (نسخة رئيس الاجتماع)" : ""}.pdf`;
}

// ─── عناصر مشتركة ────────────────────────────────────────────────────────────

function dateLine(doc: MinutesDocument): { day: string; rest: string } {
  const ref = doc.endedAt ?? doc.startedAt;
  const day = ref ? formatGregorianDay(ref) : "";
  const range = formatTimeRange(doc.startedAt, doc.endedAt);
  const rest = [
    ref ? formatHijriDay(ref) : "",
    range ? `${range} بتوقيت الرياض` : "",
    formatDuration(doc.startedAt, doc.endedAt),
  ].filter(Boolean).join(" · ");
  return { day, rest };
}

const personLine = (p: MinutesPerson) => (p.title ? `${p.name}، ${p.title}` : p.name);

// ─── قالب PDF ────────────────────────────────────────────────────────────────

export interface MinutesPdfAssets {
  /** شعار سبق الأبيض (data URL) للرأس الداكن */
  logoWhite: string | null;
  /** أيقونة سبق الملونة (data URL) للتذييل */
  mark: string | null;
  /** خطوط مضمّنة كـdata URL؛ ما غاب منها يسقط إلى التالي في السلسلة */
  fonts: {
    displaySemiBold: string | null;
    displayBold: string | null;
    displayBlack: string | null;
    bodyRegular: string | null;
    bodySemiBold: string | null;
  };
}

const C = {
  ink: "#081420", muted: "#5a6b79", rule: "#e3ebf2", wash: "#f4f8fb",
  sky: "#4cbcfd", deep: "#0e76b8",
};

function fontFace(family: string, weight: number, src: string | null, format: string): string {
  return src
    ? `@font-face{font-family:'${family}';src:url('${src}') format('${format}');font-weight:${weight};font-style:normal}`
    : "";
}

export function renderMinutesPdfHtml(doc: MinutesDocument, assets: MinutesPdfAssets): string {
  const { day, rest } = dateLine(doc);
  const m = doc.minutes;
  const decisions = Array.isArray(m.decisions) ? m.decisions.filter(Boolean) : [];
  const tasks = Array.isArray(m.actionItems) ? m.actionItems.filter((a) => a?.task) : [];
  const deferred = Array.isArray(m.deferred) ? m.deferred.filter(Boolean) : [];
  const paragraphs = splitParagraphs(m.summary);
  const invited = doc.attendees.length + doc.absent.length;

  const f = assets.fonts;
  const css = `
${fontFace("SabqDisplay", 600, f.displaySemiBold, "opentype")}
${fontFace("SabqDisplay", 700, f.displayBold, "opentype")}
${fontFace("SabqDisplay", 900, f.displayBlack ?? f.displayBold, "opentype")}
${fontFace("SabqBody", 400, f.bodyRegular, "truetype")}
${fontFace("SabqBody", 600, f.bodySemiBold, "truetype")}
@page{size:A4;margin:12mm 0}
@page :first{margin-top:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'SabqBody','IBM Plex Sans Arabic','Noto Sans Arabic',Tahoma,sans-serif;font-size:9.9pt;line-height:1.78;color:${C.ink};direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.d{font-family:'SabqDisplay','SabqBody','IBM Plex Sans Arabic','Noto Sans Arabic',Tahoma,sans-serif}
.doc{width:210mm;min-height:285mm;display:flex;flex-direction:column}
.mast{background:${C.ink};color:#fff;padding:6mm 12mm;display:flex;justify-content:space-between;align-items:center;gap:6mm}
.mast img{height:16mm;width:auto;display:block}
.mast .big{font-weight:900;font-size:34.5pt;line-height:1.25;white-space:nowrap}
.mast .big i{font-style:normal;color:${C.sky}}
.strip{background:${C.sky};color:${C.ink};padding:1mm 12mm;display:flex;justify-content:space-between;gap:4mm;font-size:8.3pt;font-weight:600}
.tit{padding:5mm 12mm 3.4mm}
.tit h1{font-weight:700;font-size:25.5pt;line-height:1.4;margin:0}
.tit p{margin:0;color:${C.muted}}
.tit p b{color:${C.ink};font-weight:600}
.body{display:flex;flex:1;border-top:1px solid ${C.rule};background:linear-gradient(to right,${C.wash} 0,${C.wash} 31%,transparent 31%)}
.main{flex:1;min-width:0;padding:4.8mm 12mm;display:flex;flex-direction:column;gap:4.2mm}
.rail{width:31%;flex:none;border-right:1px solid ${C.rule};padding:4.8mm 5.8mm;display:flex;flex-direction:column;gap:3.2mm;font-size:9.3pt;line-height:1.7}
.rail h4{font-weight:700;color:${C.deep};font-size:10pt;margin:0 0 1mm}
.rail b{font-weight:600;display:block}
.rail small{color:${C.muted};display:block;font-size:8.7pt;line-height:1.6}
.rail ul,.rail ol{margin:0;padding:0;list-style:none}
.rail li{margin-bottom:1.3mm;break-inside:avoid}
.rail ol{counter-reset:ag}
.rail ol li{counter-increment:ag;display:flex;gap:2mm}
.rail ol li::before{content:counter(ag);font-family:'SabqDisplay','SabqBody',sans-serif;font-weight:700;color:${C.sky}}
h3{font-weight:700;font-size:15pt;line-height:1.5;margin:0 0 1.3mm;break-after:avoid}
h3 small{font-family:'SabqBody',sans-serif;font-weight:400;font-size:9pt;color:${C.muted};margin-inline-start:2.5mm}
.hero{list-style:none;margin:0;padding:0}
.hero li{display:flex;gap:3.6mm;align-items:flex-start;padding:1.6mm 0;border-top:1px solid ${C.rule};break-inside:avoid}
.hero li:first-child{border-top:3px solid ${C.ink}}
.hero i{font-style:normal;font-weight:900;font-size:25.5pt;line-height:1.15;color:${C.sky};flex:none;min-width:6mm}
.hero span{font-size:10.7pt;font-weight:600;line-height:1.75;padding-top:.7mm}
table{width:100%;border-collapse:collapse}
th{text-align:right;font-size:8.5pt;color:${C.muted};font-weight:600;padding:.8mm 0;border-bottom:3px solid ${C.ink}}
td{padding:1.6mm 0;border-bottom:1px solid ${C.rule};vertical-align:top}
tr{break-inside:avoid}
th+th,td+td{padding-inline-start:3.6mm}
td.who{font-weight:600;white-space:nowrap}
td.due{color:${C.muted};white-space:nowrap}
td.done{color:${C.deep};font-weight:600;white-space:nowrap}
.sum p{margin:0 0 1.2mm;orphans:2;widows:2}
.muted{color:${C.muted}}
.sign{border-top:3px solid ${C.ink};margin:0 12mm;padding:2.4mm 0 1.6mm;display:flex;align-items:center;justify-content:space-between;gap:4mm;break-inside:avoid}
.sign span{display:block;color:${C.muted};font-size:8.3pt}
.sign b{font-weight:700;font-size:11.4pt;display:block}
.seal{width:17mm;height:17mm;border-radius:50%;border:2px solid ${C.deep};color:${C.deep};display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;font-size:9.9pt;line-height:1.35;transform:rotate(-8deg);flex:none;box-shadow:inset 0 0 0 1mm #fff,inset 0 0 0 1.25mm ${C.deep}}
.seal small{display:block;font-family:'SabqBody',sans-serif;font-weight:400;font-size:5.6pt}
.seal.draft{border-color:${C.muted};color:${C.muted};box-shadow:inset 0 0 0 1mm #fff,inset 0 0 0 1.25mm ${C.muted}}
.foot{margin:0 12mm;padding-bottom:4mm;display:flex;align-items:center;gap:2.6mm;color:${C.muted};font-size:8.3pt;break-inside:avoid}
.foot img{height:5mm;width:auto;display:block}
.apx{break-before:page;padding:0 12mm}
.apx h2{font-weight:700;font-size:20pt;line-height:1.5;margin:0;border-bottom:3px solid ${C.ink};padding-bottom:1mm}
.apx h2 small{font-family:'SabqBody',sans-serif;font-weight:400;font-size:9pt;color:${C.muted};margin-inline-start:2.5mm}
.apx .note{background:${C.wash};border-right:3px solid ${C.sky};padding:2mm 3.6mm;margin:3mm 0 2mm;font-size:8.8pt;line-height:1.75;color:${C.muted}}
.apx .note b{color:${C.ink};font-weight:600}
.turn{display:flex;gap:3.6mm;padding:1.7mm 0;border-bottom:1px solid ${C.rule};break-inside:avoid}
.turn time{flex:none;width:13mm;direction:ltr;text-align:right;color:${C.deep};font-weight:600;font-size:8.6pt;line-height:2}
.turn b{font-weight:600;display:block;font-size:9.3pt;line-height:1.6}
.turn p{margin:0;orphans:2;widows:2}
`;

  const attendeesHtml = doc.attendees.length
    ? `<ul>${doc.attendees
        .map((p) => `<li><b>${esc(p.name)}</b>${p.title ? `<small>${esc(p.title)}</small>` : ""}</li>`)
        .join("")}</ul>`
    : `<small>لم يُسجَّل حضور.</small>`;

  const absentHtml = doc.absent.length
    ? `<ul>${doc.absent
        .map((p) => `<li><b>${esc(p.name)}</b><small>${esc(p.reason)}</small></li>`)
        .join("")}</ul>`
    : `<small>لا أحد.${invited > 1 ? " حضر جميع المدعوين." : ""}</small>`;

  const decisionsHtml = decisions.length
    ? `<ol class="hero">${decisions
        .map((d, i) => `<li><i class="d">${i + 1}</i><span>${esc(d)}</span></li>`)
        .join("")}</ol>`
    : `<p class="muted">لم تُسجَّل قرارات في هذا الاجتماع.</p>`;

  const tasksHtml = tasks.length
    ? `<table><thead><tr><th>المهمة</th><th>المسؤول</th><th>الموعد</th></tr></thead><tbody>${tasks
        .map(
          (a) =>
            `<tr><td>${esc(a.task)}</td><td class="who">${esc(a.owner || "لم يُحدَّد")}</td><td class="${a.done ? "done" : "due"}">${a.done ? "منجزة" : esc(a.due || "لم يُحدَّد")}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="muted">لم تُسجَّل مهام في هذا الاجتماع.</p>`;

  const transcript = doc.transcript ?? null;
  const appendixHtml = transcript
    ? `<section class="apx">
  <h2 class="d">ملحق: تفريغ الاجتماع<small>${esc(doc.title)}</small></h2>
  <div class="note"><b>نسخة رئيس الاجتماع — لا تُوزَّع.</b> النص كما سجّله مُدوِّن سبق AI دون تنقيح، والتوقيت من بداية التسجيل. اسم المتحدث هو اسم الحساب الذي صدر منه الصوت؛ إن تكلّم أكثر من شخص من حساب واحد ظهروا باسمه. يُحذف التفريغ بعد 30 يومًا من الاجتماع.</div>
  ${
    transcript.turns.length
      ? transcript.turns
          .map(
            (t) =>
              `<div class="turn"><time>${esc(formatOffset(t.startMs))}</time><div><b>${esc(t.speakerName)}</b><p>${esc(t.text)}</p></div></div>`,
          )
          .join("")
      : `<p class="muted">لا يوجد تفريغ محفوظ لهذا الاجتماع (لم يُسجَّل كلام، أو حُذف بعد 30 يومًا).</p>`
  }
  ${transcript.truncated ? `<p class="muted">اقتُطع التفريغ عند هذا الحد لطوله؛ النص الكامل في صفحة المحضر.</p>` : ""}
</section>`
    : "";

  const approval = doc.approval;
  const signHtml = approval
    ? `<div><span>اعتمده</span><b class="d">${esc(approval.by.name)}</b><span>${esc(
        [approval.by.title, "رئيس الاجتماع"].filter(Boolean).join("، "),
      )} · ${esc(formatGregorianDay(approval.at))}، ${esc(formatClock(approval.at))}</span></div>
       <div class="seal d"><span>معتمد<small>صحيفة سبق</small></span></div>`
    : `<div><span>الحالة</span><b class="d">مسودة لم تُعتمد بعد</b><span>تُراجَع من رئيس الاجتماع قبل الاعتماد والتوزيع</span></div>
       <div class="seal draft d"><span>مسودة<small>غير معتمدة</small></span></div>`;

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><title>${esc(`محضر ${doc.title}`)}</title><style>${css}</style></head>
<body>
<div class="doc">
  <div class="mast">
    ${assets.logoWhite ? `<img alt="صحيفة سبق" src="${assets.logoWhite}">` : `<span class="d" style="font-weight:900;font-size:22pt">سبق</span>`}
    <div class="big d">محضر <i>اجتماع</i></div>
  </div>
  <div class="strip"><span>صحيفة سبق الإلكترونية · منصة اجتماعات سبق</span><span>${transcript ? "نسخة رئيس الاجتماع · تتضمن التفريغ" : "وثيقة داخلية"}</span></div>

  <div class="tit">
    <h1 class="d">${esc(doc.title)}</h1>
    <p>${day ? `<b>${esc(day)}</b>` : ""}${day && rest ? " · " : ""}${esc(rest)}</p>
  </div>

  <div class="body">
    <div class="main">
      <section><h3 class="d">القرارات</h3>${decisionsHtml}</section>
      <section><h3 class="d">المهام${tasks.length ? `<small>${esc(arCount(tasks.length, TASKS_FORMS))}</small>` : ""}</h3>${tasksHtml}</section>
      <section class="sum"><h3 class="d">ملخص الاجتماع</h3>${
        paragraphs.length ? paragraphs.map((p) => `<p>${esc(p)}</p>`).join("") : `<p class="muted">لا ملخص.</p>`
      }</section>
    </div>
    <aside class="rail">
      <div><h4 class="d">رئيس الاجتماع</h4><b>${esc(doc.chair.name)}</b>${doc.chair.title ? `<small>${esc(doc.chair.title)}</small>` : ""}</div>
      <div><h4 class="d">حضر (${doc.attendees.length}${invited > doc.attendees.length ? ` من ${invited}` : ""})</h4>${attendeesHtml}</div>
      <div><h4 class="d">لم يحضر</h4>${absentHtml}</div>
      ${doc.agenda.length ? `<div><h4 class="d">جدول الأعمال</h4><ol>${doc.agenda.map((a) => `<li><span>${esc(a)}</span></li>`).join("")}</ol></div>` : ""}
      <div><h4 class="d">نقاط مؤجلة</h4>${
        deferred.length ? `<ul>${deferred.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<small>لا نقاط مؤجلة.</small>`
      }</div>
      <div><h4 class="d">المنصة</h4><b>اجتماعات سبق</b>${doc.accessLabel ? `<small>${esc(doc.accessLabel)}</small>` : ""}</div>
    </aside>
  </div>

  <div class="sign">${signHtml}</div>
  <div class="foot">${assets.mark ? `<img alt="" src="${assets.mark}">` : ""}<span>أُعدّ بواسطة مُدوِّن سبق AI من تفريغ الاجتماع، وراجعه رئيس الاجتماع قبل الاعتماد</span></div>
</div>
${appendixHtml}
</body>
</html>`;
}

// ─── قالب البريد ─────────────────────────────────────────────────────────────

export interface MinutesEmailOptions {
  /** رابط صفحة المحضر في اللوحة (التحميل منها بعد تسجيل الدخول) */
  minutesUrl: string;
  /** رابط شعار PNG عام — برامج البريد لا تعرض SVG */
  logoUrl: string;
}

export function renderMinutesEmailHtml(doc: MinutesDocument, opts: MinutesEmailOptions): string {
  const { day, rest } = dateLine(doc);
  const m = doc.minutes;
  const decisions = Array.isArray(m.decisions) ? m.decisions.filter(Boolean) : [];
  const tasks = Array.isArray(m.actionItems) ? m.actionItems.filter((a) => a?.task) : [];
  const deferred = Array.isArray(m.deferred) ? m.deferred.filter(Boolean) : [];
  const paragraphs = splitParagraphs(m.summary);
  const font = "'IBM Plex Sans Arabic',Tahoma,'Segoe UI',Arial,sans-serif";
  const h = (t: string) =>
    `<h3 style="margin:0 0 8px;font-size:17px;line-height:1.6;color:${C.ink};border-bottom:3px solid ${C.ink};padding-bottom:4px">${t}</h3>`;

  const decisionsHtml = decisions.length
    ? decisions
        .map(
          (d, i) =>
            `<tr><td style="vertical-align:top;padding:8px 0 8px 12px;font-size:24px;font-weight:700;line-height:1.2;color:${C.sky};width:28px">${i + 1}</td><td style="vertical-align:top;padding:10px 0;font-weight:600;border-bottom:1px solid ${C.rule}">${esc(d)}</td></tr>`,
        )
        .join("")
    : `<tr><td style="color:${C.muted}">لم تُسجَّل قرارات في هذا الاجتماع.</td></tr>`;

  const tasksHtml = tasks.length
    ? tasks
        .map(
          (a) =>
            `<tr><td style="padding:9px 0;border-bottom:1px solid ${C.rule};vertical-align:top">${esc(a.task)}<div style="font-size:12.5px;color:${C.muted};margin-top:2px"><b style="color:${C.ink}">${esc(a.owner || "لم يُحدَّد مسؤول")}</b> · ${a.done ? "منجزة" : esc(a.due || "لم يُحدَّد موعد")}</div></td></tr>`,
        )
        .join("")
    : `<tr><td style="color:${C.muted}">لم تُسجَّل مهام في هذا الاجتماع.</td></tr>`;

  const approved = doc.approval
    ? `اعتمده ${esc(personLine(doc.approval.by))}، ${esc(formatGregorianDay(doc.approval.at))} الساعة ${esc(formatClock(doc.approval.at))}.`
    : "";

  return `<div dir="rtl" lang="ar" style="margin:0;padding:16px;background:${C.wash};font-family:${font};color:${C.ink};line-height:1.9;font-size:15px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid ${C.rule};border-radius:12px;overflow:hidden">
  <tr><td style="background:${C.ink};padding:18px 24px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
      <td style="vertical-align:middle"><img src="${esc(opts.logoUrl)}" alt="صحيفة سبق" height="48" style="display:block;height:48px;width:auto;border:0;background:#ffffff;border-radius:6px;padding:4px"></td>
      <td style="vertical-align:middle;text-align:left;font-size:28px;font-weight:700;line-height:1.3;color:#ffffff;white-space:nowrap">محضر <span style="color:${C.sky}">اجتماع</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${C.sky};padding:4px 24px;font-size:12px;font-weight:600;color:${C.ink}">صحيفة سبق الإلكترونية · منصة اجتماعات سبق · وثيقة داخلية</td></tr>
  <tr><td style="padding:22px 24px 6px">
    <h2 style="margin:0;font-size:26px;line-height:1.5;color:${C.ink}">${esc(doc.title)}</h2>
    <p style="margin:2px 0 0;font-size:13px;color:${C.muted}">${day ? `<b style="color:${C.ink}">${esc(day)}</b>` : ""}${day && rest ? " · " : ""}${esc(rest)}</p>
  </td></tr>
  <tr><td style="padding:10px 24px">
    <div style="background:${C.wash};border-radius:10px;padding:12px 16px;font-size:13.5px;line-height:1.9">
      <b>رئيس الاجتماع:</b> ${esc(personLine(doc.chair))}<br>
      <b>حضر (${doc.attendees.length}):</b> ${doc.attendees.length ? esc(doc.attendees.map((p) => p.name).join("، ")) : "لم يُسجَّل حضور"}<br>
      <b>لم يحضر:</b> ${doc.absent.length ? esc(doc.absent.map((p) => `${p.name} (${p.reason})`).join("، ")) : "لا أحد"}
    </div>
  </td></tr>
  <tr><td style="padding:12px 24px">${h("القرارات")}<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${decisionsHtml}</table></td></tr>
  <tr><td style="padding:12px 24px">${h("المهام")}<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${tasksHtml}</table></td></tr>
  <tr><td style="padding:12px 24px">${h("ملخص الاجتماع")}${
    paragraphs.length
      ? paragraphs.map((p) => `<p style="margin:0 0 10px">${esc(p)}</p>`).join("")
      : `<p style="margin:0;color:${C.muted}">لا ملخص.</p>`
  }</td></tr>
  ${
    deferred.length
      ? `<tr><td style="padding:12px 24px">${h("نقاط مؤجلة")}<ul style="margin:0;padding:0 18px 0 0">${deferred.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></td></tr>`
      : ""
  }
  <tr><td style="padding:14px 24px 24px">
    <a href="${esc(opts.minutesUrl)}" style="display:inline-block;background:${C.deep};color:#ffffff;text-decoration:none;font-weight:600;font-size:14.5px;padding:11px 22px;border-radius:8px">فتح المحضر وتحميل PDF</a>
    <p style="margin:10px 0 0;font-size:12.5px;color:${C.muted}">الملف يُحمَّل من لوحة التحكم بعد تسجيل الدخول، لمن حضر الاجتماع.</p>
  </td></tr>
  <tr><td style="background:${C.wash};padding:14px 24px;font-size:12px;line-height:1.9;color:${C.muted}">${approved} أُعدّ بواسطة مُدوِّن سبق AI من تفريغ الاجتماع. وثيقة داخلية لصحيفة سبق.</td></tr>
</table>
</div>`;
}
