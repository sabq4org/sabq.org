/**
 * صفحة «مواعيدك» على حافة Pages: HTML من نموذج JSON الجاهز.
 * العدّاد الثابت يُحسب في الـ API. سكربت صغير يعيد الأيام والساعات بتوقيت الرياض.
 *
 * الهيكل (مستلهم من تطبيقات العدّ التنازلي الأعلى دخلاً عبر Appllama): بطاقة «ويدجت» للموعد الأقرب
 * بساعة أيام/ساعات/دقائق، ثم بطاقات أقسام بمربع «باقي N يوم» مرتبة من الأقرب، ثم منهجية وأسئلة.
 */

const REGIONS = ["riyadh", "makkah", "madinah", "jeddah", "taif"];

/** تطبيع للعربية: إزالة التشكيل والتطويل وتوحيد المسافات — لمقارنة العناوين فقط. */
function normalizeArabic(text) {
  return String(text == null ? "" : text)
    .replace(/[\u064B-\u065F\u0670\u0640\u06D6-\u06ED]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * لون كل سلسلة. --kind للنصوص والنقاط (يتبدّل مع الوضع الداكن)،
 * و--kind-deep خلفية مصمتة لبطاقة البطل بنص أبيض (ثابتة في الوضعين).
 */
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

/* ───────── الوقت المتبقي (نفس منطق السكربت في المتصفح) ───────── */

/** منتصف ليل اليوم المستهدف بتوقيت الرياض (UTC+3) بالميلي ثانية. */
function riyadhStartMs(iso) {
  const bits = String(iso || "").split("-").map(Number);
  if (bits.length !== 3 || bits.some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(bits[0], bits[1] - 1, bits[2], -3, 0, 0, 0);
}

function remainingParts(iso, nowMs) {
  const ms = riyadhStartMs(iso) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor(totalMinutes / 60) % 24,
    minutes: totalMinutes % 60,
  };
}

function daysUnit(n) {
  if (n <= 2) return "يوم";
  if (n >= 3 && n <= 10) return "أيام";
  return "يوماً";
}

function hoursUnit(n) {
  if (n <= 2) return "ساعة";
  if (n >= 3 && n <= 10) return "ساعات";
  return "ساعة";
}

/** مربع العدّاد في بطاقة القائمة: رقم كبير + وحدة (نمط «Split Time Badge»). */
function tileHtml(card, nowMs) {
  if (card.isPast) {
    return `<div class="tile tile-past"><span class="tile-word">${esc(card.pastLabel || "انتهى")}</span></div>`;
  }
  const left = remainingParts(card.startsOn, nowMs);
  let num = "";
  let unit = "";
  if (!left) {
    return `<div class="tile tile-today" data-tile data-date="${esc(card.startsOn)}" data-today="${esc(
      card.todayLabel,
    )}"><span class="tile-word">${esc(card.todayLabel || "اليوم")}</span></div>`;
  }
  if (left.days >= 1) {
    num = String(left.days);
    unit = daysUnit(left.days);
  } else {
    num = String(Math.max(1, left.hours));
    unit = hoursUnit(Math.max(1, left.hours));
  }
  return `<div class="tile" data-tile data-date="${esc(card.startsOn)}" data-today="${esc(card.todayLabel)}">
      <span class="tile-pre">باقي</span>
      <b class="tile-num">${esc(num)}</b>
      <span class="tile-unit">${esc(unit)}</span>
    </div>`;
}

/** ساعة البطل: أيام | ساعات | دقائق (نمط «Expanded Format»). */
function clockHtml(card, nowMs) {
  if (card.isPast) return `<p class="clock-word">${esc(card.pastLabel || "انتهى")}</p>`;
  const left = remainingParts(card.startsOn, nowMs);
  if (!left) return `<p class="clock-word">${esc(card.todayLabel || "اليوم")}</p>`;
  const cell = (part, value, label) =>
    `<div class="clock-cell"><b data-part="${part}">${value}</b><span>${label}</span></div>`;
  return `<div class="clock" data-clock data-date="${esc(card.startsOn)}" aria-hidden="true">
      ${cell("d", left.days, "أيام")}
      ${cell("h", left.hours, "ساعات")}
      ${cell("m", left.minutes, "دقائق")}
    </div>`;
}

/* ───────── أجزاء مشتركة ───────── */

/** شارة الحالة: مؤكد / متوقع / انتهى. */
function badgeFor(card) {
  if (card.isPast) return { cls: "badge badge-neutral", text: card.pastLabel || "انتهى" };
  if (card.certainty === "expected") return { cls: "badge badge-warn", text: card.certaintyLabel };
  return { cls: "badge badge-ok", text: card.certaintyLabel };
}

/** العدّاد النصي: عنصر يحمّل data-countdown ليحدّثه السكربت في المتصفح. */
function countdownHtml(card, className) {
  if (card.isPast) return `<span class="${className} ${className}-past">${esc(card.pastLabel || "")}</span>`;
  return `<strong class="${className}" data-countdown data-date="${esc(card.startsOn)}" data-today="${esc(card.todayLabel)}">${esc(card.countdownText)}</strong>`;
}

/** تاريخ مكدّس لبطاقات القوائم: الميلادي بخط عريض والهجري تحته. */
function dateStackHtml(card) {
  return `<p class="item-date"><time datetime="${esc(card.startsOn)}">${esc(card.gregorianLabel)}</time><span class="hijri">${esc(card.hijriLabel)}</span></p>`;
}

function dateLineHtml(card, className) {
  return `<p class="${className}"><time datetime="${esc(card.startsOn)}">${esc(card.gregorianLabel)}</time><span class="sep" aria-hidden="true">·</span><span class="hijri">${esc(card.hijriLabel)}</span></p>`;
}

function noteLines(card) {
  return [card.publicNote, card.visionNote]
    .filter(Boolean)
    .map((line) => `<p class="note">${esc(line)}</p>`)
    .join("");
}

function sourceHtml(card) {
  if (!card || !card.sourceUrl) return "";
  return `<p class="src"><span class="src-label">المصدر</span><a href="${esc(card.sourceUrl)}" rel="noopener noreferrer">${esc(card.sourceTitle)}</a></p>`;
}

function prevHtml(block) {
  if (!block.previous) return "";
  return `<p class="prev">السابق: ${esc(block.previous.title)} — ${esc(block.previous.gregorianLabel)} · ${esc(
    block.previous.pastLabel || "",
  )}</p>`;
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

/* ───────── البطل: الموعد الأقرب ───────── */

function nearestCard(view) {
  let best = null;
  for (const block of view.series || []) {
    const card = block.next;
    if (!card) continue;
    if (!best || card.startsOn < best.startsOn) best = card;
  }
  return best;
}

function heroHtml(card, { nowMs, href }) {
  if (!card) return "";
  const badge = badgeFor(card);
  // كثير من عناوين المواعيد تبدأ باسم السلسلة نفسها (وقد تختلف حركة واحدة)؛ لا نكرّره.
  const series = String(card.seriesTitle || "").trim();
  const showEyebrow = Boolean(series) && !normalizeArabic(card.title).startsWith(normalizeArabic(series));
  const hint = card.expectedHint ? `<p class="hero-note">${esc(card.expectedHint)}</p>` : "";
  const notes = [card.publicNote, card.visionNote]
    .filter(Boolean)
    .map((line) => `<p class="hero-note">${esc(line)}</p>`)
    .join("");
  return `<section class="hero ${kindClass(card.kind)}" aria-labelledby="hero-title">
    <div class="hero-top">
      <p class="hero-kicker">الموعد الأقرب${showEyebrow ? ` · ${esc(series)}` : ""}</p>
      <span class="${badge.cls} badge-on-hero">${esc(badge.text)}</span>
    </div>
    <h2 class="hero-title" id="hero-title">${esc(card.title)}</h2>
    ${clockHtml(card, nowMs)}
    <p class="hero-phrase">${countdownHtml(card, "hero-count")}</p>
    ${dateLineHtml(card, "hero-date")}
    ${hint}${notes}
    <div class="hero-foot">
      ${
        card.sourceUrl
          ? `<a class="hero-src" href="${esc(card.sourceUrl)}" rel="noopener noreferrer">المصدر: ${esc(card.sourceTitle)}</a>`
          : ""
      }
      ${href ? `<a class="hero-cta" href="${esc(href)}">كل مواعيد القسم</a>` : ""}
    </div>
  </section>`;
}

/* ───────── لوحة الأقسام (الرئيسية) ───────── */

/** بطاقة قسم: شريط لوني، العنوان والموعد القادم، ومربع «باقي» على الطرف. */
function seriesRow(block, nowMs) {
  const next = block.next;
  const badge = next ? badgeFor(next) : null;
  const details = [
    `<p class="answer">${esc(block.answerLine)}</p>`,
    followHtml(block),
    `<p class="summary">${esc(block.summary)}</p>`,
    next && next.expectedHint ? `<p class="note">${esc(next.expectedHint)}</p>` : "",
    next ? noteLines(next) : "",
    sourceHtml(next),
    prevHtml(block),
  ].join("");
  return `<article class="item ${kindClass(block.kind)}" id="${esc(block.slug)}">
    <a class="item-main" href="${esc(block.href)}">
      <span class="item-bar" aria-hidden="true"></span>
      <div class="item-text">
        <h2 class="item-series">${esc(block.title)}</h2>
        ${
          next
            ? `<p class="item-title">${esc(next.title)}</p>
               ${dateStackHtml(next)}
               <p class="item-meta"><span class="${badge.cls}">${esc(badge.text)}</span></p>`
            : `<p class="item-title item-empty">لا موعد قادم معلن بعد</p>`
        }
      </div>
      ${next ? tileHtml(next, nowMs) : ""}
    </a>
    <details class="more"><summary>التفاصيل والمصدر</summary><div class="more-body">${details}</div></details>
  </article>`;
}

/** ترتيب اللوحة من الأقرب (نمط تطبيقات العدّ التنازلي)؛ الأقسام بلا موعد قادم في الآخر. */
function sortedSeries(series) {
  return (series || [])
    .map((block, index) => ({ block, index }))
    .sort((a, b) => {
      const x = a.block.next ? a.block.next.startsOn : "9999";
      const y = b.block.next ? b.block.next.startsOn : "9999";
      return x < y ? -1 : x > y ? 1 : a.index - b.index;
    })
    .map((entry) => entry.block);
}

/* ───────── صفحة القسم ───────── */

/**
 * نص الجواب والملخص والسجل فقط.
 * الموعد القادم وشارته ومصدره وملاحظاته يعرضها البطل أعلاه — لا نكرّرها.
 */
function seriesDetail(block) {
  if (!block) return "";
  return `<section class="panel ${kindClass(block.kind)}" id="${esc(block.slug)}">
    <p class="answer answer-lg">${esc(block.answerLine)}</p>
    ${followHtml(block)}
    <p class="summary">${esc(block.summary)}</p>
    ${prevHtml(block)}
  </section>`;
}

/** صف موعد في قوائم «المواعيد القادمة». */
function occurrenceRow(card, nowMs) {
  const badge = badgeFor(card);
  const end =
    card.endsOn && card.endsOn !== card.startsOn ? `<p class="item-end">حتى ${esc(card.endsOn)}</p>` : "";
  const details = [
    card.expectedHint ? `<p class="note">${esc(card.expectedHint)}</p>` : "",
    noteLines(card),
    sourceHtml(card),
  ].join("");
  return `<li class="item ${kindClass(card.kind)}">
    <div class="item-main">
      <span class="item-bar" aria-hidden="true"></span>
      <div class="item-text">
        <p class="item-title item-title-strong">${esc(card.title)}</p>
        ${dateStackHtml(card)}
        ${end}
        <p class="item-meta"><span class="${badge.cls}">${esc(badge.text)}</span></p>
      </div>
      ${tileHtml(card, nowMs)}
    </div>
    ${details ? `<details class="more"><summary>المصدر والملاحظات</summary><div class="more-body">${details}</div></details>` : ""}
  </li>`;
}

/** قوائم «المواعيد القادمة» — نستثني موعد البطل فقد عُرض أعلاه. */
function sectionsHtml(sections, heroId, nowMs) {
  return (sections || [])
    .map((section) => ({ ...section, cards: section.cards.filter((card) => card.id !== heroId) }))
    .filter((section) => section.cards.length > 0)
    .map(
      (section) => `<section class="group">
      <h2 class="group-title">${esc(section.title)}<span class="group-count">${section.cards.length}</span></h2>
      <ul class="list">${section.cards.map((card) => occurrenceRow(card, nowMs)).join("")}</ul>
    </section>`,
    )
    .join("");
}

/* ───────── التنقل والمنطقة والأسئلة ───────── */

function navHtml(view) {
  return `<nav class="chips" aria-label="أقسام مواعيدك"><div class="chips-track">${view.nav
    .map(
      (item) =>
        `<a class="chip${item.current ? " is-current" : ""}"${item.current ? ' aria-current="page"' : ""} href="${esc(
          item.href,
        )}">${esc(item.label)}</a>`,
    )
    .join("")}</div></nav>`;
}

function regionHtml(view) {
  const show = !view.page.slug || view.page.slug === "school-calendar-1448";
  if (!show || view.regions.length === 0) return "";
  const path = view.page.canonical.replace("https://sabq.org", "") || "/mawaeed";
  const links = view.regions
    .map(
      (region) =>
        `<a class="seg${region.id === view.region ? " is-on" : ""}"${
          region.id === view.region ? ' aria-current="true"' : ""
        } href="${esc(regionHref(path, region.id))}">${esc(region.label)}</a>`,
    )
    .join("");
  return `<div class="region">
    <p class="region-label">المنطقة التعليمية</p>
    <div class="segmented" role="group" aria-label="اختر المنطقة">${links}</div>
    <p class="region-note">الافتراضي الرياض. الإجازات الإضافية تختلف، والإجازات الرسمية من الوزارة تظهر لكل المناطق.</p>
  </div>`;
}

function westernNote(view) {
  if (view.page.slug !== "school-calendar-1448" || view.region === "riyadh") return "";
  const hasExtra = (view.sections || []).some((section) => section.id === "extra" && section.cards.length > 0);
  if (hasExtra) return "";
  return `<p class="callout">إجازات مكة المكرمة والمدينة المنورة وجدة والطائف الإضافية لا تُعرض حتى يؤكدها محرر ويربطها بمصدر الإدارة. الظاهر الآن هو تقويم الوزارة المشترك.</p>`;
}

function faqHtml(faq) {
  if (!faq || faq.length === 0) return "";
  const items = faq
    .map((item) => `<details class="qa"><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`)
    .join("");
  return `<section class="faq"><h2 class="group-title">أسئلة شائعة</h2><div class="inset">${items}</div></section>`;
}

function methodHtml(text) {
  if (!text) return "";
  return `<section class="method">
    <h2 class="group-title">كيف نحسب المواعيد ومن أين نأخذها؟</h2>
    <div class="panel"><p>${esc(text)}</p>
      <p class="legend"><span class="badge badge-ok">مؤكد</span> من إعلان رسمي منشور
        <span class="badge badge-warn">متوقع</span> من الجدول المعتاد للجهة حتى يصدر الإعلان</p>
    </div>
  </section>`;
}

export function renderMawaeedHtml(view, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const title = esc(view.page.title);
  const description = esc(view.page.description);
  const canonical = esc(view.page.canonical);
  const home = !view.page.slug;
  const hero = nearestCard(view);
  const heroBlock = hero ? (view.series || []).find((block) => block.slug === hero.seriesSlug) : null;
  const heroHref = home && heroBlock ? heroBlock.href : null;
  const series = sortedSeries(view.series);

  const bodyMain = home
    ? `${heroHtml(hero, { nowMs, href: heroHref })}
       ${
         series.length
           ? `<section class="board-wrap" aria-labelledby="board-title">
                <div class="section-head"><h2 class="group-title" id="board-title">كل المواعيد</h2><span class="section-sub">من الأقرب إلى الأبعد</span></div>
                <div class="board">${series.map((block) => seriesRow(block, nowMs)).join("")}</div>
              </section>`
           : ""
       }
       ${methodHtml(view.methodology)}`
    : `${heroHtml(hero, { nowMs, href: null })}
       ${seriesDetail((view.series || [])[0])}
       ${sectionsHtml(view.sections, hero ? hero.id : null, nowMs)}
       ${westernNote(view)}
       ${faqHtml(view.faq)}`;

  const jsonLd = view.jsonLd ? `<script type="application/ld+json">${safeJson(view.jsonLd)}</script>` : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f3f5f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1017" media="(prefers-color-scheme: dark)">
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
    --paper:#f3f5f8; --surface:#fff; --surface-2:#f7f9fb; --ink:#101a2b; --muted:#5d6877; --line:#e3e8ee;
    --accent:#0e7cb8; --accent-soft:#e6f3fb;
    --ok:#0d6b4d; --ok-soft:#e4f5ec;
    --warn:#8a5a00; --warn-soft:#fff2cf;
    --neutral:#5d6877; --neutral-soft:#edf0f4;
    --k-school:#1571b0; --k-salary:#0d6b4d; --k-citizen:#8a5a00; --k-social:#6d28d9; --k-pension:#b45309;
    --shadow:0 1px 2px rgba(16,26,43,.05), 0 4px 16px rgba(16,26,43,.05);
    --radius:18px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --paper:#0b1017; --surface:#141c26; --surface-2:#18212c; --ink:#eaf0f6; --muted:#9aa8b6; --line:#253140;
      --accent:#5cc0f0; --accent-soft:#12303f;
      --ok:#6fd3aa; --ok-soft:#10322a;
      --warn:#e8bd6a; --warn-soft:#3a2f14;
      --neutral:#9aa8b6; --neutral-soft:#1d2732;
      --k-school:#5cc0f0; --k-salary:#6fd3aa; --k-citizen:#e8bd6a; --k-social:#b79cf5; --k-pension:#f0a868;
      --shadow:0 1px 2px rgba(0,0,0,.3);
    }
  }
  .k-school  { --kind:var(--k-school);  --kind-deep:#135f96; --kind-deep-2:#1b86c9; }
  .k-salary  { --kind:var(--k-salary);  --kind-deep:#0b5c42; --kind-deep-2:#138a62; }
  .k-citizen { --kind:var(--k-citizen); --kind-deep:#7a4f00; --kind-deep-2:#a86d06; }
  .k-social  { --kind:var(--k-social);  --kind-deep:#5421b5; --kind-deep-2:#7c3aed; }
  .k-pension { --kind:var(--k-pension); --kind-deep:#94400a; --kind-deep-2:#c2570c; }

  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body {
    margin:0; background:var(--paper); color:var(--ink); line-height:1.7;
    font-family:"IBM Plex Sans Arabic","Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;
  }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .wrap { width:min(920px, calc(100% - 32px)); margin-inline:auto; }
  .num, .tile-num, .clock b, .hijri, time { font-variant-numeric:tabular-nums; }

  /* شريط علوي مضغوط يلتصق بالأعلى */
  .topbar {
    position:sticky; top:0; z-index:10;
    background:color-mix(in srgb, var(--paper) 86%, transparent);
    -webkit-backdrop-filter:saturate(1.6) blur(14px); backdrop-filter:saturate(1.6) blur(14px);
    border-bottom:1px solid var(--line);
  }
  .topbar .wrap { display:flex; align-items:center; justify-content:space-between; gap:12px; height:52px; }
  .brand { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.3rem; color:var(--ink); }
  .brand:hover { text-decoration:none; }
  .top-title { font-size:.9rem; color:var(--muted); font-weight:700; }

  /* رأس الصفحة: عنوان كبير بأسلوب iOS */
  .intro { padding:18px 0 4px; }
  h1 { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.65rem; line-height:1.35; margin:0 0 8px; letter-spacing:-.01em; }
  .lede { color:var(--muted); font-size:.95rem; margin:0 0 8px; max-width:62ch; }
  .updated { display:inline-flex; align-items:center; gap:6px; color:var(--muted); font-size:.8rem; margin:0; }
  .live { width:7px; height:7px; border-radius:50%; background:var(--ok); box-shadow:0 0 0 3px var(--ok-soft); flex:none; }

  /* شرائح الأقسام: تمرير أفقي بلا التفاف */
  .chips { margin:14px -16px 0; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  .chips::-webkit-scrollbar { display:none; }
  .chips-track { display:flex; gap:8px; padding:2px 16px 4px; width:max-content; }
  .chip {
    white-space:nowrap; border-radius:999px; padding:7px 14px; font-size:.88rem; font-weight:700;
    background:var(--surface); color:var(--muted); border:1px solid var(--line);
  }
  .chip:hover { text-decoration:none; color:var(--ink); }
  .chip.is-current { background:var(--ink); color:var(--paper); border-color:var(--ink); }

  /* المنطقة: متحكم مقسّم */
  .region { margin:18px 0 0; }
  .region-label { font-size:.8rem; color:var(--muted); font-weight:700; margin:0 0 6px; }
  .segmented {
    display:flex; gap:2px; padding:3px; border-radius:12px; background:var(--neutral-soft);
    overflow-x:auto; scrollbar-width:none;
  }
  .segmented::-webkit-scrollbar { display:none; }
  .seg {
    flex:1 0 auto; text-align:center; white-space:nowrap; padding:7px 12px; border-radius:9px;
    font-size:.88rem; color:var(--muted);
  }
  .seg:hover { text-decoration:none; color:var(--ink); }
  .seg.is-on { background:var(--surface); color:var(--ink); font-weight:700; box-shadow:0 1px 3px rgba(16,26,43,.12); }
  .region-note { color:var(--muted); font-size:.8rem; margin:8px 0 0; max-width:62ch; }

  /* البطل: بطاقة «ويدجت» مصمتة بلون القسم */
  .hero {
    position:relative; overflow:hidden; margin:20px 0 0; color:#fff;
    background:linear-gradient(145deg, var(--kind-deep-2), var(--kind-deep));
    border-radius:24px; padding:18px 18px 16px; box-shadow:0 10px 30px -12px var(--kind-deep);
  }
  .hero::after {
    content:""; position:absolute; inset-inline-end:-60px; top:-70px; width:220px; height:220px; border-radius:50%;
    background:radial-gradient(circle, rgba(255,255,255,.16), rgba(255,255,255,0) 70%); pointer-events:none;
  }
  .hero a { color:#fff; }
  .hero-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .hero-kicker { margin:0; font-size:.82rem; font-weight:700; opacity:.85; }
  .badge-on-hero { background:rgba(255,255,255,.18) !important; color:#fff !important; }
  .hero-title { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.35rem; line-height:1.45; margin:8px 0 14px; }
  .clock { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
  .clock-cell {
    background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.14);
    border-radius:14px; padding:10px 6px 8px; text-align:center;
  }
  .clock-cell b { display:block; font-family:Inter,"IBM Plex Sans Arabic",sans-serif; font-weight:600; font-size:2.1rem; line-height:1.1; letter-spacing:-.02em; }
  .clock-cell span { display:block; font-size:.78rem; opacity:.85; margin-top:2px; }
  .clock-word { margin:0; font-family:Tajawal,sans-serif; font-weight:700; font-size:2rem; }
  .hero-phrase { margin:12px 0 0; font-size:.95rem; }
  .hero-count { font-weight:700; }
  .hero-count-past { opacity:.85; }
  .hero-date { margin:2px 0 0; font-size:.92rem; }
  .hero-date time { font-weight:700; }
  .hero-date .hijri { opacity:.85; }
  .hero .sep { margin-inline:6px; opacity:.6; }
  .hero-note { margin:10px 0 0; font-size:.84rem; opacity:.88; max-width:60ch; }
  .hero-foot { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 16px; margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,.18); }
  .hero-src { font-size:.82rem; opacity:.9; text-decoration:underline; text-underline-offset:3px; }
  .hero-cta { font-size:.85rem; font-weight:700; background:#fff; color:var(--kind-deep) !important; padding:7px 14px; border-radius:999px; }
  .hero-cta:hover { text-decoration:none; }

  .badge { display:inline-block; border-radius:999px; padding:1px 9px; font-size:.76rem; font-weight:700; white-space:nowrap; }
  .badge-ok { background:var(--ok-soft); color:var(--ok); }
  .badge-warn { background:var(--warn-soft); color:var(--warn); }
  .badge-neutral { background:var(--neutral-soft); color:var(--neutral); }

  /* رؤوس المجموعات */
  .section-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin:28px 0 10px; }
  .group-title { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.1rem; margin:0; display:flex; align-items:center; gap:8px; }
  .section-sub { color:var(--muted); font-size:.82rem; }
  .group { margin-top:26px; }
  .group > .group-title { margin-bottom:10px; }
  .group-count { font-family:Inter,sans-serif; font-size:.75rem; font-weight:600; color:var(--muted); background:var(--neutral-soft); border-radius:999px; padding:0 8px; }

  /* بطاقات المواعيد: شريط لوني + نص + مربع «باقي» */
  .board, .list { display:grid; gap:10px; }
  .list { list-style:none; margin:0; padding:0; }
  .item { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); box-shadow:var(--shadow); overflow:hidden; }
  .item-main { display:flex; align-items:stretch; gap:12px; padding:14px 14px 12px; color:inherit; }
  a.item-main:hover { text-decoration:none; background:var(--surface-2); }
  .item-bar { width:4px; border-radius:4px; background:var(--kind); flex:none; }
  .item-text { flex:1; min-width:0; }
  .item-series { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.02rem; line-height:1.4; margin:0 0 2px; color:var(--ink); }
  .item-title { margin:0; font-size:.9rem; color:var(--muted); }
  .item-title-strong { color:var(--ink); font-weight:700; font-size:.96rem; }
  .item-empty { font-style:normal; }
  .item-date { margin:6px 0 0; font-size:.86rem; line-height:1.5; display:flex; flex-direction:column; }
  .item-date time { font-weight:700; }
  .item-date .hijri { color:var(--muted); font-size:.8rem; }
  .sep { margin-inline:6px; color:var(--muted); }
  .item-end { margin:2px 0 0; font-size:.82rem; color:var(--muted); }
  .item-meta { margin:8px 0 0; }

  .tile {
    flex:none; align-self:center; width:78px; min-height:78px; border-radius:16px;
    display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
    background:var(--neutral-soft); background:color-mix(in srgb, var(--kind) 12%, var(--surface));
    color:var(--kind); padding:6px 4px;
  }
  .tile-pre { font-size:.68rem; font-weight:700; opacity:.8; line-height:1.2; }
  .tile-num { font-family:Inter,"IBM Plex Sans Arabic",sans-serif; font-weight:600; font-size:1.75rem; line-height:1.1; letter-spacing:-.02em; }
  .tile-unit { font-size:.74rem; font-weight:700; line-height:1.3; }
  .tile-word { font-size:.85rem; font-weight:700; padding:0 4px; line-height:1.4; }
  .tile-past { color:var(--neutral); background:var(--neutral-soft); }

  .answer { margin:0; font-size:.92rem; color:var(--ink); }
  .answer-lg { padding:0; font-size:1rem; }
  .more { border-top:1px solid var(--line); }
  .more > summary {
    list-style:none; cursor:pointer; padding:10px 14px; font-size:.84rem; font-weight:700; color:var(--accent);
    display:flex; align-items:center; justify-content:space-between;
  }
  .more > summary::-webkit-details-marker { display:none; }
  .more > summary::after { content:"+"; font-family:Inter,sans-serif; font-size:1.1rem; line-height:1; color:var(--muted); }
  .more[open] > summary::after { content:"−"; }
  .more-body { padding:0 14px 14px; }
  .follow, .summary { color:var(--muted); font-size:.9rem; margin:6px 0 0; max-width:62ch; }
  .more-body > :first-child { margin-top:0; }
  .note { color:var(--muted); font-size:.85rem; margin:8px 0 0; max-width:62ch; }
  .src { font-size:.85rem; margin:10px 0 0; display:flex; flex-wrap:wrap; gap:4px 8px; align-items:baseline; }
  .src-label { font-size:.72rem; font-weight:700; color:var(--muted); background:var(--neutral-soft); border-radius:6px; padding:0 6px; }
  .prev { color:var(--muted); font-size:.8rem; margin:10px 0 0; }

  /* لوحات نصية (صفحة القسم والمنهجية) */
  .panel { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:14px 16px; margin-top:14px; box-shadow:var(--shadow); }
  .panel.k-school, .panel.k-salary, .panel.k-citizen, .panel.k-social, .panel.k-pension { border-inline-start:4px solid var(--kind); }
  .method { margin-top:30px; }
  .method .panel { margin-top:10px; }
  .method p { color:var(--muted); font-size:.9rem; margin:0; max-width:66ch; }
  .method .legend { margin-top:12px; display:flex; flex-wrap:wrap; align-items:center; gap:6px 8px; font-size:.82rem; }

  .callout { background:var(--warn-soft); border:1px solid var(--line); border-radius:14px; padding:11px 13px; font-size:.9rem; margin:22px 0 0; max-width:62ch; }

  /* الأسئلة: قائمة مجمّعة */
  .faq { margin-top:30px; }
  .inset { margin-top:10px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; box-shadow:var(--shadow); }
  .qa + .qa { border-top:1px solid var(--line); }
  .qa > summary { list-style:none; cursor:pointer; padding:13px 16px; font-weight:700; font-size:.94rem; display:flex; justify-content:space-between; gap:12px; }
  .qa > summary::-webkit-details-marker { display:none; }
  .qa > summary::after { content:"‹"; color:var(--muted); transition:transform .15s; }
  .qa[open] > summary::after { transform:rotate(-90deg); }
  .qa p { color:var(--muted); font-size:.9rem; margin:0; padding:0 16px 14px; }

  footer { padding:26px 0 calc(40px + env(safe-area-inset-bottom)); color:var(--muted); font-size:.82rem; margin-top:30px; }
  footer p { margin:0; }

  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
  @media (prefers-reduced-motion: reduce) { * { transition:none !important; } }

  @media (min-width:760px) {
    h1 { font-size:2rem; }
    .chips { margin-inline:0; }
    .chips-track { padding-inline:0; }
    .segmented { display:inline-flex; }
    .hero { padding:24px 26px 20px; }
    .hero-title { font-size:1.6rem; }
    .clock { max-width:440px; }
    .clock-cell b { font-size:2.6rem; }
    .board { grid-template-columns:1fr 1fr; align-items:start; }
  }
</style>
</head>
<body>
<header class="topbar"><div class="wrap"><a class="brand" href="/">سبق</a><a class="top-title" href="/mawaeed">مواعيدك</a></div></header>
<main class="wrap">
<div class="intro">
<h1>${esc(view.page.h1)}</h1>
<p class="lede">${description}</p>
<p class="updated"><span class="live" aria-hidden="true"></span>آخر تحديث للبيانات: <time datetime="${esc(view.dateModified)}">${esc(view.dateModifiedLabel)}</time> — بتوقيت السعودية</p>
</div>
${navHtml(view)}
${regionHtml(view)}
${bodyMain}
</main>
<footer class="wrap"><p>الأوقات بتوقيت السعودية. التاريخ الهجري بتقويم أم القرى.</p></footer>
<script>
(function () {
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
  function phrase(days, hours, todayLabel) {
    if (days <= 0 && hours <= 0) return todayLabel;
    if (days <= 0) return "بعد " + hoursText(hours).replace(/^و/, "");
    if (hours <= 0) return "بعد " + daysText(days);
    return "بعد " + daysText(days) + " " + hoursText(hours);
  }
  function dayUnit(n) { return n <= 2 ? "يوم" : n <= 10 ? "أيام" : "يوماً"; }
  function hourUnit(n) { return n <= 2 ? "ساعة" : n <= 10 ? "ساعات" : "ساعة"; }
  function left(target) {
    var bits = String(target || "").split("-");
    if (bits.length !== 3) return null;
    var start = Date.UTC(Number(bits[0]), Number(bits[1]) - 1, Number(bits[2]), -3, 0, 0, 0);
    var ms = start - Date.now();
    if (!(ms > 0)) return { done: true };
    var mins = Math.floor(ms / 60000);
    return { days: Math.floor(mins / 1440), hours: Math.floor(mins / 60) % 24, minutes: mins % 60 };
  }
  function each(sel, fn) { var n = document.querySelectorAll(sel); for (var i = 0; i < n.length; i++) fn(n[i]); }
  function tick() {
    each("[data-countdown]", function (el) {
      var r = left(el.getAttribute("data-date")); if (!r) return;
      var today = el.getAttribute("data-today") || "اليوم";
      el.textContent = r.done ? today : phrase(r.days, r.hours, today);
    });
    each("[data-clock]", function (el) {
      var r = left(el.getAttribute("data-date")); if (!r) return;
      if (r.done) { el.outerHTML = '<p class="clock-word">اليوم</p>'; return; }
      var map = { d: r.days, h: r.hours, m: r.minutes };
      var parts = el.querySelectorAll("[data-part]");
      for (var i = 0; i < parts.length; i++) parts[i].textContent = map[parts[i].getAttribute("data-part")];
    });
    each("[data-tile]", function (el) {
      var r = left(el.getAttribute("data-date")); if (!r) return;
      var num = el.querySelector(".tile-num"), unit = el.querySelector(".tile-unit");
      if (r.done) { el.innerHTML = '<span class="tile-word"></span>'; el.firstChild.textContent = el.getAttribute("data-today") || "اليوم"; return; }
      if (!num || !unit) return;
      if (r.days >= 1) { num.textContent = r.days; unit.textContent = dayUnit(r.days); }
      else { var h = Math.max(1, r.hours); num.textContent = h; unit.textContent = hourUnit(h); }
    });
  }
  tick();
  setInterval(tick, 30000);
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
