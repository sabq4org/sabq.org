/**
 * صفحة «مواعيدك» على حافة Pages: HTML من نموذج JSON الجاهز.
 * العدّاد الثابت يُحسب في الـ API. سكربت صغير يعيد الأيام والساعات بتوقيت الرياض.
 *
 * الهيكل: hero للموعد الأقرب (العنصر البصري الوحيد البارز)، ثم صفوف الأقسام
 * بخطوط شعرية، ثم أسئلة شائعة ومنهجية. لا شبكة بطاقات مكررة.
 */

const REGIONS = ["riyadh", "makkah", "madinah", "jeddah", "taif"];

/** تطبيع للعربية: إزالة التشكيل والتطويل وتوحيد المسافات — لمقارنة العناوين فقط. */
function normalizeArabic(text) {
  return String(text == null ? "" : text)
    .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** لون مميز واحد لكل سلسلة، يُطبَّق كمتغير CSS على القسم. */
const KIND_CLASS = {
  school_holiday: "k-school",
  salary: "k-salary",
  citizen_account: "k-citizen",
  social_security: "k-social",
  pension: "k-pension",
};

/** نفس رابط الخطوط الذي يحمّله موقع سبق — يعيد استخدام كاش المتصفح بلا طلب جديد. */
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&family=Tajawal:wght@700&family=Inter:wght@400;600&family=JetBrains+Mono:wght@400&display=swap";

export function mawaeedSlugFromPath(path) {
  if (path === "/mawaeed") return "";
  const match = /^\/mawaeed\/([a-z0-9-]+)$/.exec(path);
  return match ? match[1] : null;
}

function normalizeRegion(raw) {
  const id = String(raw || "").trim().toLowerCase();
  return REGIONS.includes(id) ? id : "riyadh";
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function regionHref(pathname, id) {
  return `${pathname}?region=${id}`;
}

function kindClass(kind) {
  return KIND_CLASS[kind] || "k-school";
}

/** شارة الحالة: مؤكد / متوقع / انتهى. */
function badgeFor(card) {
  if (card.isPast) return { cls: "badge badge-neutral", text: card.pastLabel || "انتهى" };
  if (card.certainty === "expected") return { cls: "badge badge-warn", text: card.certaintyLabel };
  return { cls: "badge badge-ok", text: card.certaintyLabel };
}

/** العدّاد: عنصر واحد يحمّل data-countdown ليحدّثه السكربت في المتصفح. */
function countdownHtml(card, className) {
  if (card.isPast) return `<span class="${className} ${className}-past">${esc(card.pastLabel || "")}</span>`;
  return `<strong class="${className}" data-countdown data-date="${esc(card.startsOn)}" data-today="${esc(card.todayLabel)}">${esc(card.countdownText)}</strong>`;
}

function calendarHtml(card, className) {
  return `<span class="${className}">
      <time datetime="${esc(card.startsOn)}">${esc(card.gregorianLabel)}</time>
      <span class="hijri">${esc(card.hijriLabel)}</span>
    </span>`;
}

function noteLines(card) {
  return [card.publicNote, card.visionNote]
    .filter(Boolean)
    .map((line) => `<p class="note">${esc(line)}</p>`)
    .join("");
}

function sourceHtml(card) {
  if (!card) return "";
  return `<p class="src">المصدر: <a href="${esc(card.sourceUrl)}" rel="noopener noreferrer">${esc(card.sourceTitle)}</a></p>`;
}

/** بطاقة موعد مستوية تُستخدم في قوائم «المواعيد القادمة» داخل صفحات الأقسام. */
function occurrenceRow(card) {
  const badge = badgeFor(card);
  const end =
    card.endsOn && card.endsOn !== card.startsOn
      ? `<span class="end">حتى ${esc(card.endsOn)}</span>`
      : "";
  return `<li class="occ">
    <div class="occ-when">
      ${countdownHtml(card, "count")}
      ${calendarHtml(card, "cal")}
      ${end}
    </div>
    <div class="occ-body">
      <p class="occ-title">${esc(card.title)}</p>
      <p class="occ-meta"><span class="${badge.cls}">${esc(badge.text)}</span></p>
      ${card.expectedHint ? `<p class="note">${esc(card.expectedHint)}</p>` : ""}
      ${noteLines(card)}
      ${sourceHtml(card)}
    </div>
  </li>`;
}

/**
 * سطر «تليها … / المصدر». لبعض الأقسام يكون جملة المصدر وحدها،
 * وهي معروضة كرابط في بطاقة الموعد — لا نكرّرها نصاً.
 */
function followHtml(block) {
  const line = block.followLine;
  if (!line) return "";
  if (block.next && line === `المصدر: ${block.next.sourceTitle}.`) return "";
  return `<p class="follow">${esc(line)}</p>`;
}

/** الموعد الأقرب عبر كل السلاسل — بطل الصفحة. */
function nearestCard(view) {
  let best = null;
  for (const block of view.series || []) {
    const card = block.next;
    if (!card) continue;
    if (!best || card.startsOn < best.startsOn) best = card;
  }
  return best;
}

function heroHtml(card) {
  if (!card) return "";
  const badge = badgeFor(card);
  // كثير من عناوين المواعيد تبدأ باسم السلسلة نفسها (وقد تختلف حركة واحدة)؛ لا نكرّره.
  const series = String(card.seriesTitle || "").trim();
  const showEyebrow = Boolean(series) && !normalizeArabic(card.title).startsWith(normalizeArabic(series));
  return `<section class="hero ${kindClass(card.kind)}" aria-labelledby="hero-title">
    ${
      showEyebrow
        ? `<p class="hero-eyebrow"><span class="dot" aria-hidden="true"></span>${esc(series)}</p>`
        : ""
    }
    <h2 class="hero-title" id="hero-title">${esc(card.title)}</h2>
    <div class="hero-when">
      ${countdownHtml(card, "hero-count")}
      ${calendarHtml(card, "hero-cal")}
    </div>
    <p class="hero-meta"><span class="${badge.cls}">${esc(badge.text)}</span></p>
    ${card.expectedHint ? `<p class="note">${esc(card.expectedHint)}</p>` : ""}
    ${noteLines(card)}
    ${sourceHtml(card)}
  </section>`;
}

/** صف قسم في الصفحة الرئيسية: العنوان، ثم الموعد القادم، ثم نص الجواب. */
function seriesRow(block) {
  const next = block.next;
  const badge = next ? badgeFor(next) : null;
  return `<section class="series ${kindClass(block.kind)}" id="${esc(block.slug)}">
    <h2><a href="${esc(block.href)}">${esc(block.title)}</a></h2>
    ${
      next
        ? `<div class="row-when">
            ${countdownHtml(next, "count")}
            ${calendarHtml(next, "cal")}
            <span class="${badge.cls}">${esc(badge.text)}</span>
          </div>`
        : ""
    }
    <p class="answer">${esc(block.answerLine)}</p>
    ${followHtml(block)}
    <p class="summary">${esc(block.summary)}</p>
    ${next && next.expectedHint ? `<p class="note">${esc(next.expectedHint)}</p>` : ""}
    ${next ? noteLines(next) : ""}
    ${sourceHtml(next)}
    ${
      block.previous
        ? `<p class="prev">السابق: ${esc(block.previous.title)} — ${esc(block.previous.gregorianLabel)} · ${esc(
            block.previous.pastLabel || "",
          )}</p>`
        : ""
    }
  </section>`;
}

/**
 * صفحة قسم: نص الجواب والملخص والسجل فقط.
 * الموعد القادم وشارته ومصدره وملاحظاته يعرضها الـhero أعلاه — لا نكرّرها.
 */
function seriesDetail(block) {
  if (!block) return "";
  return `<section class="series ${kindClass(block.kind)}" id="${esc(block.slug)}">
    <p class="answer">${esc(block.answerLine)}</p>
    ${followHtml(block)}
    <p class="summary">${esc(block.summary)}</p>
    ${
      block.previous
        ? `<p class="prev">السابق: ${esc(block.previous.title)} — ${esc(block.previous.gregorianLabel)} · ${esc(
            block.previous.pastLabel || "",
          )}</p>`
        : ""
    }
  </section>`;
}

function navHtml(view) {
  return `<nav class="crumbs" aria-label="أقسام مواعيدك">${view.nav
    .map((item) => `<a${item.current ? ' class="current"' : ""} href="${esc(item.href)}">${esc(item.label)}</a>`)
    .join("")}</nav>`;
}

function regionHtml(view) {
  const show = !view.page.slug || view.page.slug === "school-calendar-1448";
  if (!show || view.regions.length === 0) return "";
  const path = view.page.canonical.replace("https://sabq.org", "") || "/mawaeed";
  const links = view.regions
    .map(
      (region) =>
        `<a${region.id === view.region ? ' aria-current="true"' : ""} href="${esc(regionHref(path, region.id))}">${esc(
          region.label,
        )}</a>`,
    )
    .join("");
  return `<div class="region"><span class="region-label">المنطقة</span><div class="region-list">${links}</div><p class="region-note">الافتراضي الرياض. الإجازات الإضافية تختلف، والإجازات الرسمية من الوزارة تظهر لكل المناطق.</p></div>`;
}

function westernNote(view) {
  if (view.page.slug !== "school-calendar-1448" || view.region === "riyadh") return "";
  const hasExtra = (view.sections || []).some((section) => section.id === "extra" && section.cards.length > 0);
  if (hasExtra) return "";
  return `<p class="callout">إجازات مكة المكرمة والمدينة المنورة وجدة والطائف الإضافية لا تُعرض حتى يؤكدها محرر ويربطها بمصدر الإدارة. الظاهر الآن هو تقويم الوزارة المشترك.</p>`;
}

/** قوائم «المواعيد القادمة» — نستثني موعد الـhero فقد عُرض أعلاه. */
function sectionsHtml(sections, heroId) {
  return (sections || [])
    .map((section) => ({ ...section, cards: section.cards.filter((card) => card.id !== heroId) }))
    .filter((section) => section.cards.length > 0)
    .map(
      (section) => `<section class="upcoming">
      <h2>${esc(section.title)}</h2>
      <ul class="occ-list">${section.cards.map(occurrenceRow).join("")}</ul>
    </section>`,
    )
    .join("");
}

function faqHtml(faq) {
  if (!faq || faq.length === 0) return "";
  const items = faq
    .map((item) => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`)
    .join("");
  return `<section class="faq"><h2>أسئلة شائعة</h2>${items}</section>`;
}

export function renderMawaeedHtml(view) {
  const title = esc(view.page.title);
  const description = esc(view.page.description);
  const canonical = esc(view.page.canonical);
  const home = !view.page.slug;
  const hero = nearestCard(view);

  const bodyMain = home
    ? `${heroHtml(hero)}
       <div class="board">${(view.series || []).map(seriesRow).join("")}</div>
       ${
         view.methodology
           ? `<section class="method"><h2>كيف نحسب المواعيد ومن أين نأخذها؟</h2><p>${esc(view.methodology)}</p></section>`
           : ""
       }`
    : `${heroHtml(hero)}
       ${seriesDetail((view.series || [])[0])}
       ${sectionsHtml(view.sections, hero ? hero.id : null)}
       ${westernNote(view)}
       ${faqHtml(view.faq)}`;

  const jsonLd = view.jsonLd ? `<script type="application/ld+json">${safeJson(view.jsonLd)}</script>` : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_SA">
<meta property="og:image" content="https://sabq.org/branding/sabq-og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta property="article:modified_time" content="${esc(view.dateModified)}">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
${jsonLd}
<script>
(function () {
  var allowed = { riyadh: 1, makkah: 1, madinah: 1, jeddah: 1, taif: 1 };
  var params = new URLSearchParams(location.search);
  var picked = params.get("region");
  try {
    if (picked && allowed[picked]) localStorage.setItem("mawaeed-region", picked);
    else if (!picked) {
      var saved = localStorage.getItem("mawaeed-region");
      if (saved && allowed[saved] && saved !== "riyadh") {
        params.set("region", saved);
        location.replace(location.pathname + "?" + params.toString());
      }
    }
  } catch (e) {}
})();
</script>
<style>
  :root {
    color-scheme: light;
    --paper:#fbfcfd; --surface:#fff; --ink:#111c2e; --muted:#5b6675; --line:#e4e9ef;
    --accent:#0e7cb8; --accent-soft:#eaf6fd;
    --ok:#0d6b4d; --ok-soft:#e7f6ef;
    --warn:#8a5a00; --warn-soft:#fff4d6;
    --neutral:#5b6675; --neutral-soft:#eef1f5;
    --k-school:#1578b8; --k-salary:#0d6b4d; --k-citizen:#8a5a00;
    --k-social:#6d28d9; --k-pension:#b45309;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --paper:#0e141c; --surface:#151d27; --ink:#eaf0f6; --muted:#9aa8b6; --line:#27323e;
      --accent:#5cc0f0; --accent-soft:#12303f;
      --ok:#6fd3aa; --ok-soft:#10322a;
      --warn:#e8bd6a; --warn-soft:#3a2f14;
      --neutral:#9aa8b6; --neutral-soft:#1d2732;
      --k-school:#5cc0f0; --k-salary:#6fd3aa; --k-citizen:#e8bd6a;
      --k-social:#b79cf5; --k-pension:#f0a868;
    }
  }
  .k-school { --kind:var(--k-school); }
  .k-salary { --kind:var(--k-salary); }
  .k-citizen { --kind:var(--k-citizen); }
  .k-social { --kind:var(--k-social); }
  .k-pension { --kind:var(--k-pension); }

  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--paper); color:var(--ink); line-height:1.75;
    font-family:"IBM Plex Sans Arabic","Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;
    -webkit-text-size-adjust:100%;
  }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  header, main, footer { width:min(880px, calc(100% - 32px)); margin-inline:auto; }

  header {
    padding:16px 0 10px; display:flex; justify-content:space-between; align-items:baseline;
    gap:12px; border-bottom:1px solid var(--line); margin-bottom:20px;
  }
  .brand { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.3rem; color:var(--ink); }
  header .site { font-size:.92rem; color:var(--muted); }

  .crumbs { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 18px; }
  .crumbs a { border:1px solid var(--line); border-radius:999px; padding:4px 11px; font-size:.86rem; color:var(--muted); }
  .crumbs a.current { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); font-weight:700; }

  h1 { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.4rem; line-height:1.5; margin:0 0 8px; letter-spacing:-.01em; }
  .lede { color:var(--muted); font-size:.95rem; margin:0 0 6px; max-width:62ch; }
  .updated { color:var(--muted); font-size:.82rem; margin:0 0 20px; }

  .region { margin:0 0 22px; }
  .region-label { font-size:.82rem; color:var(--muted); }
  .region-list { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
  .region-list a { border:1px solid var(--line); border-radius:8px; padding:5px 11px; font-size:.88rem; color:var(--muted); }
  .region-list a[aria-current="true"] { background:var(--accent-soft); border-color:var(--accent); color:var(--accent); font-weight:700; }
  .region-note { color:var(--muted); font-size:.82rem; margin:8px 0 0; max-width:62ch; }

  /* البطل: الموعد الأقرب — العنصر البصري الوحيد البارز */
  .hero {
    background:var(--surface); border:1px solid var(--line); border-inline-start:4px solid var(--kind, var(--accent));
    border-radius:12px; padding:16px 18px 14px; margin-bottom:26px;
  }
  .hero-eyebrow {
    display:flex; align-items:center; gap:7px; margin:0 0 6px;
    font-size:.85rem; color:var(--muted);
  }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--kind, var(--accent)); flex:none; }
  .hero-title { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.3rem; line-height:1.45; margin:0 0 14px; }
  .hero-when { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 20px; }
  .hero-count {
    font-weight:700; font-size:2rem; line-height:1.15; letter-spacing:-.02em;
    font-variant-numeric:tabular-nums;
  }
  .hero-count-past { color:var(--muted); font-size:1.3rem; }
  .hero-cal { display:flex; flex-direction:column; gap:1px; font-size:.95rem; }
  .hero-cal time { font-weight:700; }
  .hero-meta { margin:12px 0 0; }
  .hijri { color:var(--muted); font-size:.88rem; font-variant-numeric:tabular-nums; }

  .badge { display:inline-block; border-radius:999px; padding:1px 9px; font-size:.78rem; font-weight:700; }
  .badge-ok { background:var(--ok-soft); color:var(--ok); }
  .badge-warn { background:var(--warn-soft); color:var(--warn); }
  .badge-neutral { background:var(--neutral-soft); color:var(--neutral); }

  /* لوحة الأقسام: صفوف بخطوط شعرية، لا بطاقات متطابقة */
  .board { border-top:1px solid var(--line); }
  .series { border-bottom:1px solid var(--line); padding:20px 0; }
  .series h2 { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.05rem; margin:0 0 10px; }
  .series h2 a { color:var(--ink); }
  .series h2 a::before { content:""; display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--kind, var(--accent)); margin-inline-end:8px; vertical-align:middle; }

  .row-when { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px 16px; margin-bottom:10px; }
  .count { font-weight:700; font-size:1.2rem; font-variant-numeric:tabular-nums; }
  .count-past { color:var(--muted); font-weight:400; font-size:1rem; }
  .cal { display:flex; flex-wrap:wrap; align-items:baseline; gap:2px 8px; font-size:.9rem; }
  .cal time { font-weight:700; }

  .answer { font-size:1rem; margin:0 0 8px; padding-inline-start:12px; border-inline-start:3px solid var(--kind, var(--accent)); }
  .follow, .summary { color:var(--muted); font-size:.92rem; margin:6px 0 0; max-width:62ch; }
  .note { color:var(--muted); font-size:.86rem; margin:8px 0 0; max-width:62ch; }
  .src { font-size:.86rem; margin:8px 0 0; }
  .prev { color:var(--muted); font-size:.82rem; margin:10px 0 0; }
  .end { color:var(--muted); font-size:.86rem; }

  /* قائمة المواعيد القادمة داخل صفحات الأقسام */
  .upcoming { margin-top:26px; }
  .upcoming > h2 { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.05rem; margin:0 0 4px; }
  .occ-list { list-style:none; margin:0; padding:0; border-top:1px solid var(--line); }
  .occ { border-bottom:1px solid var(--line); padding:14px 0; }
  .occ-when { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 14px; margin-bottom:6px; }
  .occ-title { font-weight:700; font-size:.98rem; margin:0 0 4px; }
  .occ-meta { margin:0; }

  .callout { background:var(--warn-soft); border:1px solid var(--line); border-radius:10px; padding:11px 13px; font-size:.9rem; margin:22px 0 0; max-width:62ch; }
  .method { margin-top:28px; }
  .method h2, .faq h2 { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.05rem; margin:0 0 8px; }
  .method p { color:var(--muted); font-size:.92rem; margin:0; max-width:62ch; }
  .faq { margin-top:28px; }
  details { background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:10px 13px; margin:8px 0; }
  summary { cursor:pointer; font-weight:700; font-size:.95rem; }
  details p { color:var(--muted); font-size:.9rem; margin:8px 0 0; }

  footer { padding:26px 0 40px; color:var(--muted); font-size:.85rem; border-top:1px solid var(--line); margin-top:30px; }
  footer p { margin:0; }

  @media (min-width:760px) {
    h1 { font-size:1.7rem; }
    .hero { padding:20px 22px 18px; }
    .hero-title { font-size:1.5rem; }
    .hero-count { font-size:2.5rem; }
  }
</style>
</head>
<body>
<header><a class="brand" href="/">سبق</a><a class="site" href="/mawaeed">مواعيدك</a></header>
<main>
${navHtml(view)}
<h1>${esc(view.page.h1)}</h1>
<p class="lede">${description}</p>
<p class="updated">آخر تحديث للبيانات: <time datetime="${esc(view.dateModified)}">${esc(view.dateModifiedLabel)}</time> — بتوقيت السعودية</p>
${regionHtml(view)}
${bodyMain}
</main>
<footer><p>الأوقات بتوقيت السعودية. التاريخ الهجري بتقويم أم القرى.</p></footer>
<script>
(function () {
  function phrase(days, hours, todayLabel) {
    if (days <= 0 && hours <= 0) return todayLabel;
    function daysText(n) {
      if (n === 1) return "يوم واحد";
      if (n === 2) return "يومين";
      if (n <= 10) return n + " أيام";
      return n + " يوماً";
    }
    function hoursText(n) {
      if (n <= 0) return "";
      if (n === 1) return "وساعة";
      if (n === 2) return "وساعتان";
      if (n <= 10) return "و" + n + " ساعات";
      return "و" + n + " ساعة";
    }
    if (days <= 0) return "بعد " + hoursText(hours).replace(/^و/, "");
    if (hours <= 0) return "بعد " + daysText(days);
    return "بعد " + daysText(days) + " " + hoursText(hours);
  }
  function tick() {
    var now = new Date();
    var nodes = document.querySelectorAll("[data-countdown]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var target = el.getAttribute("data-date");
      var todayLabel = el.getAttribute("data-today") || "اليوم";
      if (!target) continue;
      var bits = target.split("-");
      var start = Date.UTC(Number(bits[0]), Number(bits[1]) - 1, Number(bits[2]), -3, 0, 0, 0);
      var ms = start - now.getTime();
      if (ms <= 0) { el.textContent = todayLabel; continue; }
      var totalHours = Math.floor(ms / 3600000);
      el.textContent = phrase(Math.floor(totalHours / 24), totalHours % 24, todayLabel);
    }
  }
  tick();
  setInterval(tick, 60000);
})();
</script>
</body>
</html>`;
}

function htmlResponse(html, { status = 200, cacheable = false, robots = "index, follow" } = {}) {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": robots,
  });
  if (cacheable) {
    headers.set("Cache-Control", "private, no-cache, must-revalidate, max-age=0");
    headers.set("CDN-Cache-Control", "public, max-age=60");
  } else {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(html, { status, headers });
}

function failureHtml() {
  return renderMawaeedHtml({
    dateModified: "2026-09-27T00:00:00.000Z",
    dateModifiedLabel: "",
    region: "riyadh",
    regions: [],
    page: {
      slug: "error",
      title: "مواعيدك | سبق",
      description: "تعذر تحميل المواعيد الآن.",
      h1: "تعذر تحميل المواعيد",
      canonical: "https://sabq.org/mawaeed",
    },
    nav: [{ href: "/mawaeed", label: "مواعيدك", current: true }],
    series: [],
    sections: [],
    faq: [],
    methodology: null,
    jsonLd: null,
  }).replace(
    "<h1>تعذر تحميل المواعيد</h1>",
    '<h1>تعذر تحميل المواعيد</h1><p class="callout">حدّث الصفحة بعد قليل. لم نعرض قشرة فارغة حتى لا تُفهرس الصفحة بلا موعد.</p>',
  );
}

export async function serveMawaeedPage({ request, url, env, waitUntil, signProxyRequest }) {
  const slug = mawaeedSlugFromPath(url.pathname);
  const indexableHost = url.hostname === "sabq.org";
  const commit = env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BUILD_ID || "";
  const cacheable = indexableHost && Boolean(commit) && request.method === "GET";
  const keyUrl = new URL(url.origin + url.pathname);
  keyUrl.searchParams.set("region", normalizeRegion(url.searchParams.get("region")));
  keyUrl.searchParams.set("__b", commit || "dev");
  keyUrl.searchParams.set("__v", "mawaeed");
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });

  if (cacheable && typeof caches !== "undefined") {
    try {
      const hit = await caches.default.match(cacheKey);
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set("Cache-Control", "private, no-cache, must-revalidate, max-age=0");
        headers.set("CDN-Cache-Control", "public, max-age=60");
        headers.set("x-edge-cache", "HIT");
        headers.set("X-Robots-Tag", "index, follow");
        return new Response(hit.body, { status: hit.status, headers });
      }
    } catch (_) { /* fetch origin */ }
  }

  const origin = String(env.API_ORIGIN || "https://api.sabq.org").replace(/\/+$/, "");
  const region = normalizeRegion(url.searchParams.get("region"));
  const endpoint = slug
    ? `${origin}/api/mawaeed/${encodeURIComponent(slug)}?region=${region}`
    : `${origin}/api/mawaeed?region=${region}`;

  let payload = null;
  let status = 0;
  try {
    const sourceHeaders = new Headers();
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) sourceHeaders.set("cf-connecting-ip", clientIp);
    const metadataRequest = new Request(endpoint, { method: "GET", headers: sourceHeaders });
    const headers = await signProxyRequest(metadataRequest, endpoint, env.EDGE_PROXY_SHARED_SECRET);
    headers.set("User-Agent", "sabq-pages-fn/1.0");
    headers.set("Accept", "application/json");
    const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(2500) });
    status = res.status;
    if (res.ok) payload = await res.json();
  } catch (error) {
    console.error("[mawaeed] origin", error);
    status = 0;
  }

  if (status === 404) {
    const missing = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>القسم غير موجود | سبق</title><meta name="robots" content="noindex"></head><body><p>هذا القسم غير موجود. <a href="/mawaeed">العودة إلى مواعيدك</a></p></body></html>`;
    return htmlResponse(missing, { status: 404, cacheable: false, robots: "noindex, follow" });
  }
  if (!payload || !payload.page) {
    return htmlResponse(failureHtml(), { status: 503, cacheable: false, robots: "noindex, nofollow" });
  }

  const html = renderMawaeedHtml(payload);
  const response = htmlResponse(html, {
    status: 200,
    cacheable: indexableHost,
    robots: indexableHost ? "index, follow" : "noindex, follow",
  });
  if (!indexableHost) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.delete("CDN-Cache-Control");
  }
  if (cacheable && typeof caches !== "undefined") {
    const storedHeaders = new Headers(response.headers);
    storedHeaders.set("Cache-Control", "public, max-age=60");
    const stored = new Response(html, { status: 200, headers: storedHeaders });
    try {
      waitUntil(caches.default.put(cacheKey, stored).catch(() => {}));
    } catch (_) { /* ignore */ }
  }
  if (request.method === "HEAD") {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  response.headers.set("x-edge-cache", cacheable ? "MISS" : "BYPASS");
  return response;
}
