import { REGIONS } from "../shared/mawaeed/model.ts";
import { compactOccurrenceTitle, stripDisplayedSourceSentence } from "../shared/mawaeed/display.ts";

/**
 * صفحة «مواعيدك» على حافة Pages: HTML من نموذج JSON الجاهز.
 * العدّاد الثابت يُحسب في الـ API. سكربت صغير يعيد الأيام والساعات بتوقيت الرياض.
 *
 * الهيكل (مستلهم من تطبيقات العدّ التنازلي الأعلى دخلاً عبر Appllama): بطاقة «ويدجت» للموعد الأقرب
 * بساعة أيام/ساعات/دقائق، ثم بطاقات أقسام بمربع «باقي N يوم» مرتبة من الأقرب، ثم منهجية وأسئلة.
 */

function overviewTitle(card) {
  const title = compactOccurrenceTitle(card.title, card.startsOn);
  if (card.kind === "school_holiday") return title;
  const normalize = (value) => String(value || "").replace(/[\u064B-\u065F\u0670\u0640]/g, "").trim();
  return normalize(title).startsWith(normalize(card.seriesTitle)) ? title : `${card.seriesTitle} — ${title}`;
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
  return REGIONS.some((region) => region.id === id) ? id : "riyadh";
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

const SCHOOL_SERVICE_PATH = "/services/school-calendar-date";

/* هيدر سبق وفوتره: نسخة ثابتة من web-next/components/SiteHeader.tsx وSiteFooter.tsx. عدّلهما معًا. */
const SITE_SECTIONS = [
  { name: "الأخبار", href: "/news" },
  { name: "التصنيفات", href: "/categories" },
  { name: "مقالات", href: "/opinion" },
  { name: "مُقترب", href: "/muqtarab" },
  { name: "لحظة بلحظة", href: "/moment-by-moment" },
  { name: "مواعيدك", href: "/mawaeed" },
];
const SITE_APPS = [
  { label: "App Store", href: "https://apps.apple.com/us/app/%D8%B3%D8%A8%D9%82/id521017976?l=ar", bg: "#000000" },
  { label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.sabqorg.sabq&hl=ar", bg: "#01875f" },
  { label: "AppGallery", href: "https://appgallery.huawei.com/app/C105897661", bg: "#c7112d" },
];
const SITE_INFO_LINKS = [
  { label: "النشرة البريدية", href: "/newsletter" },
  { label: "مواعيدك: الرواتب والإجازات", href: "/mawaeed" },
  { label: "من نحن", href: "/about" },
  { label: "سياسة الخصوصية", href: "/ar/privacy" },
  { label: "شروط الاستخدام", href: "/ar/terms" },
  { label: "تواصل معنا", href: "/contact" },
];
const SITE_SOCIAL = [
  { label: "إكس", href: "https://x.com/sabqorg", path: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" },
  { label: "فيسبوك", href: "https://www.facebook.com/sabq.org", path: "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" },
  { label: "إنستغرام", href: "https://www.instagram.com/sabqorg", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" },
  { label: "يوتيوب", href: "https://youtube.com/@sabqorg", path: "M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" },
  { label: "واتساب", href: "https://whatsapp.com/channel/0029VaCUMDGEAKWA2soRAl02", path: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" },
];

function siteFooterHtml() {
  const year = new Date().getFullYear();
  return `<footer class="site-footer" id="footer">
  <div class="wrap">
    <div class="foot-cols">
      <div class="foot-brand">
        <a href="/" aria-label="الصفحة الرئيسية"><img src="/branding/sabq-logo.png" alt="سبق" width="751" height="681" loading="lazy" decoding="async"></a>
        <p>منصة إخبارية سعودية ذكية</p>
        <div class="apps">${SITE_APPS.map((app) => `<a href="${app.href}" target="_blank" rel="noopener noreferrer" style="background:${app.bg}">${app.label}</a>`).join("")}</div>
      </div>
      <div class="foot-links">
        <h2>معلومات</h2>
        <ul>${SITE_INFO_LINKS.map((link) => `<li><a href="${link.href}">${link.label}</a></li>`).join("")}</ul>
      </div>
    </div>
    <div class="foot-bottom">
      <p>© ${year} سبق الذكية — صُنعت بكل <span class="heart">♥</span> في السعودية</p>
      <div class="social">${SITE_SOCIAL.map((item) => `<a href="${item.href}" target="_blank" rel="noopener noreferrer" aria-label="${item.label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${item.path}"/></svg></a>`).join("")}</div>
    </div>
  </div>
</footer>`;
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

/** تمييز العدد: 3–10 أيام، 11–99 يوماً، ومع المئات يُنظر إلى ما بعد المئة (100 يوم، 103 أيام). */
function daysUnit(n) {
  var rest = Math.abs(Math.trunc(n)) % 100;
  if (rest === 0) return "يوم";
  if (rest >= 3 && rest <= 10) return "أيام";
  return "يوماً";
}

/** واحد واثنان يُكتبان بالكلمة بدل «باقي 2 يوم». */
function tileWord(days, hours) {
  if (days === 1) return "باقي يوم واحد";
  if (days === 2) return "باقي يومان";
  if (hours === 1) return "باقي ساعة";
  if (hours === 2) return "باقي ساعتان";
  return "";
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
  if (card.isOngoing) return `<div class="tile tile-today"><span class="tile-word">${esc(card.countdownText)}</span></div>`;
  const left = remainingParts(card.startsOn, nowMs);
  let num = "";
  let unit = "";
  if (!left) {
    return `<div class="tile tile-today" data-tile data-date="${esc(card.startsOn)}" data-today="${esc(
      card.todayLabel,
    )}"><span class="tile-word">${esc(card.todayLabel || "اليوم")}</span></div>`;
  }
  const word = tileWord(left.days, left.days >= 1 ? 0 : Math.max(1, left.hours));
  if (word) {
    return `<div class="tile" data-tile data-date="${esc(card.startsOn)}" data-today="${esc(
      card.todayLabel,
    )}"><span class="tile-word">${esc(word)}</span></div>`;
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
  if (card.isOngoing) return `<p class="clock-word">${esc(card.countdownText)}</p>`;
  const left = remainingParts(card.startsOn, nowMs);
  if (!left) return `<p class="clock-word">${esc(card.todayLabel || "اليوم")}</p>`;
  const cell = (part, value, label) =>
    `<div class="clock-cell"><b data-part="${part}">${value}</b><span>${label}</span></div>`;
  return `<div class="clock" data-clock data-date="${esc(card.startsOn)}" aria-label="الوقت المتبقي">
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

function prevHtml(block) {
  if (!block.previous) return "";
  return `<p class="prev">السابق: ${esc(compactOccurrenceTitle(block.previous.title, block.previous.startsOn))} — ${esc(block.previous.gregorianLabel)} · ${esc(
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
  const hint = card.expectedHint ? `<p class="hero-note">${esc(card.expectedHint)}</p>` : "";
  const notes = [card.publicNote, card.visionNote]
    .filter(Boolean)
    .map((line) => `<p class="hero-note">${esc(line)}</p>`)
    .join("");
  return `<section class="hero ${kindClass(card.kind)}" aria-labelledby="hero-title">
    <div class="hero-top">
      <p class="hero-kicker"><span class="hero-dot" aria-hidden="true"></span><span>الموعد الأقرب</span></p>
      <span class="${badge.cls} badge-on-hero">${esc(badge.text)}</span>
    </div>
    <h2 class="hero-title" id="hero-title">${esc(overviewTitle(card))}</h2>
    ${clockHtml(card, nowMs)}
    <div class="hero-meta-bar">
      ${dateLineHtml(card, "hero-date")}
    </div>
    ${hint || notes ? `<div class="hero-notes">${hint}${notes}</div>` : ""}
    <div class="hero-foot">
      ${href ? `<a class="hero-cta" href="${esc(href)}"><span>كل مواعيد القسم</span><span aria-hidden="true">›</span></a>` : ""}
    </div>
  </section>`;
}

/* ───────── لوحة الأقسام (الرئيسية) ───────── */

/** بطاقة قسم: شريط لوني، العنوان والموعد القادم، ومربع «باقي» على الطرف. */
function seriesRow(block, nowMs) {
  const next = block.next;
  const badge = next ? badgeFor(next) : null;
  const details = [
    followHtml(block),
    `<p class="summary">${esc(block.summary)}</p>`,
    next && next.expectedHint ? `<p class="note">${esc(next.expectedHint)}</p>` : "",
    next ? noteLines(next) : "",
    prevHtml(block),
  ].join("");
  return `<article class="item ${kindClass(block.kind)}" id="${esc(block.slug)}">
    <a class="item-main" href="${esc(block.href)}">
      <span class="item-bar" aria-hidden="true"></span>
      <div class="item-text">
        <div class="item-head">
          <h2 class="item-series">${esc(next ? overviewTitle(next) : block.title)}</h2>
          ${badge ? `<span class="${badge.cls}">${esc(badge.text)}</span>` : ""}
        </div>
        ${
          next
            ? `${dateStackHtml(next)}
               <p class="item-meta"><span class="item-link-hint">عرض جدول المواعيد <span aria-hidden="true">›</span></span></p>`
            : `<p class="item-title item-empty">لا موعد قادم معلن بعد</p>`
        }
      </div>
      ${next ? tileHtml(next, nowMs) : ""}
    </a>
    <details class="more"><summary><span>التفاصيل</span></summary><div class="more-body">${details}</div></details>
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
    card.endLabel ? `<p class="item-end">حتى ${esc(card.endLabel)}</p>` : "";
  const details = [
    card.expectedHint ? `<p class="note">${esc(card.expectedHint)}</p>` : "",
    noteLines(card),
  ].join("");
  return `<li class="item ${kindClass(card.kind)}${card.isPast ? " is-past" : ""}">
    <div class="item-main">
      <span class="item-bar" aria-hidden="true"></span>
      <div class="item-text">
        <div class="item-head">
          <p class="item-title item-title-strong">${esc(compactOccurrenceTitle(card.title, card.startsOn))}</p>
          <span class="${badge.cls}">${esc(badge.text)}</span>
        </div>
        ${dateStackHtml(card)}
        ${end}
      </div>
      ${tileHtml(card, nowMs)}
    </div>
    ${details ? `<details class="more"><summary><span>الملاحظات</span></summary><div class="more-body">${details}</div></details>` : ""}
  </li>`;
}

/** قوائم «المواعيد القادمة» — نستثني موعد البطل فقد عُرض أعلاه، ونفصل ما مضى في «مواعيد سابقة». */
function sectionsHtml(sections, heroId, nowMs) {
  const groups = [];
  for (const section of sections || []) {
    const filtered = (section.cards || []).filter((card) => card.id !== heroId);
    if (section.id === "upcoming") {
      const upcoming = filtered.filter((card) => !card.isPast);
      const past = filtered.filter((card) => card.isPast).slice().reverse();
      if (upcoming.length > 0) groups.push({ title: section.title, cards: upcoming });
      if (past.length > 0) groups.push({ title: "مواعيد سابقة", cards: past });
    } else if (filtered.length > 0) {
      groups.push({ title: section.title, cards: filtered });
    }
  }
  return groups
    .map(
      (section) => `<section class="group">
      <div class="section-head"><h2 class="group-title">${esc(section.title)}<span class="group-count">${section.cards.length}</span></h2></div>
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
  // في الصفحة العامة لا تغيّر المدينة غير الإجازات المدرسية، وبطاقة «الموعد الأقرب» تبقى لأقرب موعد
  // (رواتب غالباً)، فيبدو الضغط على مكة كأنه فتح الرواتب. لذلك تفتح المدينة التقويم الدراسي مباشرة.
  const path = view.page.slug
    ? view.page.canonical.replace("https://sabq.org", "")
    : SCHOOL_SERVICE_PATH;
  const links = view.regions
    .map(
      (region) =>
        `<a class="seg${region.id === view.region ? " is-on" : ""}"${
          region.id === view.region ? ' aria-current="true"' : ""
        } href="${esc(regionHref(path, region.id))}">${esc(region.label)}</a>`,
    )
    .join("");
  return `<div class="region">
    <div class="region-head">
      <p class="region-label">المنطقة التعليمية</p>
      <p class="region-note">الإجازات الرسمية موحّدة، والإضافية حسب المنطقة</p>
    </div>
    <div class="segmented" role="group" aria-label="اختر المنطقة">${links}</div>
  </div>`;
}

function westernNote(view) {
  if (view.page.slug !== "school-calendar-1448") return "";
  const hasExtra = (view.sections || []).some((section) => section.id === "extra" && section.cards.length > 0);
  if (hasExtra) return "";
  return `<p class="callout">المعروض هو التقويم الدراسي العام. لم تُعتمد في الخدمة إجازات إضافية خاصة بهذه المنطقة بعد.</p>`;
}

function faqHtml(faq) {
  if (!faq || faq.length === 0) return "";
  const items = faq
    .map(
      (item) =>
        `<details class="qa"><summary><span>${esc(item.question)}</span></summary><p>${esc(stripDisplayedSourceSentence(item.answer))}</p></details>`,
    )
    .join("");
  return `<section class="faq"><h2 class="group-title">أسئلة شائعة</h2><div class="inset">${items}</div></section>`;
}

function methodHtml(text) {
  if (!text) return "";
  return `<section class="method">
    <h2 class="group-title">عن المواعيد</h2>
    <div class="panel"><p>جميع الأوقات بتوقيت السعودية. تُعرض التواريخ بالميلادي والهجري وفق تقويم أم القرى، ويتحدّث العدّاد تلقائيًا.</p>
      <div class="legend">
        <span class="legend-item"><span class="badge badge-ok">مؤكد</span> من إعلان رسمي منشور</span>
        <span class="legend-item"><span class="badge badge-warn">متوقع</span> من الجدول المعتاد للجهة حتى يصدر الإعلان</span>
      </div>
    </div>
  </section>`;
}

export function renderMawaeedHtml(view, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const title = esc(view.page.title);
  const description = esc(view.page.description.replace(" ورابط المصدر الرسمي", ""));
  const canonical = esc(view.page.canonical);
  const home = !view.page.slug;
  const hero = nearestCard(view);
  const heroBlock = hero ? (view.series || []).find((block) => block.slug === hero.seriesSlug) : null;
  const heroHref = home && heroBlock ? heroBlock.href : null;
  const series = sortedSeries(view.series).filter((block) => !hero || block.slug !== hero.seriesSlug);
  const currentNav = (view.nav || []).find((item) => item.current && item.href !== "/mawaeed");

  const bodyMain = home
    ? `${heroHtml(hero, { nowMs, href: heroHref })}
       ${
         series.length
           ? `<section class="board-wrap" aria-labelledby="board-title">
                <div class="section-head"><h2 class="group-title" id="board-title">باقي المواعيد</h2><span class="section-sub">مرتبة من الأقرب إلى الأبعد</span></div>
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
  var allowed = ${safeJson(Object.fromEntries(REGIONS.map(({ id }) => [id, 1])))};
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
    --paper:#f3f6fa; --surface:#ffffff; --surface-2:#f7f9fc; --ink:#10202e; --muted:#58697a; --line:#e1e8f0;
    --accent:#087dbb; --accent-soft:#e6f3fb;
    --ok:#0d6b4d; --ok-soft:#e4f5ec;
    --warn:#8a5a00; --warn-soft:#fff2cf;
    --neutral:#58697a; --neutral-soft:#edf1f6;
    --k-school:#087dbb; --k-salary:#0d6b4d; --k-citizen:#9a5b00; --k-social:#5b21b6; --k-pension:#b45309;
    --shadow:0 1px 3px rgba(16,32,46,.05), 0 6px 18px rgba(16,32,46,.04);
    --radius:18px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --paper:#0b1118; --surface:#141e28; --surface-2:#192531; --ink:#e8eef4; --muted:#9dafc0; --line:#243242;
      --accent:#53baff; --accent-soft:#112e40;
      --ok:#6fd3aa; --ok-soft:#10322a;
      --warn:#e8bd6a; --warn-soft:#3a2f14;
      --neutral:#9dafc0; --neutral-soft:#1c2836;
      --k-school:#53baff; --k-salary:#6fd3aa; --k-citizen:#e8bd6a; --k-social:#b79cf5; --k-pension:#f0a868;
      --shadow:0 2px 10px rgba(0,0,0,.32);
    }
  }
  .k-school  { --kind:var(--k-school);  --kind-deep:#0c5382; --kind-deep-2:#0f7ab9; }
  .k-salary  { --kind:var(--k-salary);  --kind-deep:#0a543c; --kind-deep-2:#117a57; }
  .k-citizen { --kind:var(--k-citizen); --kind-deep:#734600; --kind-deep-2:#9e6204; }
  .k-social  { --kind:var(--k-social);  --kind-deep:#481c99; --kind-deep-2:#682bd7; }
  .k-pension { --kind:var(--k-pension); --kind-deep:#823607; --kind-deep-2:#b04c0c; }

  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; scroll-behavior:smooth; }
  body {
    margin:0; background:var(--paper); color:var(--ink); line-height:1.7;
    font-family:"IBM Plex Sans Arabic","Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  a { color:var(--accent); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .wrap { width:min(940px, calc(100% - 28px)); margin-inline:auto; }
  .num, .tile-num, .clock b, .hijri, time, .group-count { font-variant-numeric:tabular-nums; }

  .skip-link {
    position:fixed; top:8px; inset-inline-start:12px; z-index:50;
    background:var(--ink); color:var(--surface); padding:8px 14px; border-radius:10px; font-weight:700; font-size:.86rem;
  }
  .skip-link:not(:focus-visible) {
    position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; border:0;
  }

  /* هيدر سبق: نفس هيدر الموقع (web-next/components/SiteHeader.tsx) */
  .site-header {
    position:sticky; top:0; z-index:20;
    padding-inline:env(safe-area-inset-left) env(safe-area-inset-right);
    background:color-mix(in srgb, var(--surface) 92%, transparent);
    -webkit-backdrop-filter:saturate(1.6) blur(14px); backdrop-filter:saturate(1.6) blur(14px);
    border-bottom:1px solid var(--line);
  }
  .site-header-row { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:64px; }
  .site-logo { display:flex; align-items:center; flex:none; }
  .site-logo img { height:44px; width:auto; display:block; }
  .site-nav { display:none; flex:1; align-items:center; justify-content:center; gap:24px; }
  .site-nav a { white-space:nowrap; font-size:.9rem; font-weight:500; color:var(--ink); }
  .site-nav a:hover { text-decoration:none; color:var(--accent); }
  .site-header-spacer { display:none; width:48px; flex:none; }

  /* مسار الصفحة تحت الهيدر */
  .topbar { border-bottom:1px solid var(--line); background:var(--surface); }
  .topbar .wrap { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:54px; }
  .top-crumbs { display:flex; align-items:center; gap:8px; min-width:0; overflow:hidden; }
  .brand { font-weight:700; font-size:1.22rem; color:var(--ink); letter-spacing:-.01em; flex:none; }
  .brand:hover { text-decoration:none; color:var(--accent); }
  .crumb-sep { color:var(--muted); opacity:.55; font-size:.9rem; flex:none; }
  .top-title { font-size:.92rem; color:var(--ink); font-weight:700; white-space:nowrap; }
  .top-title:hover { text-decoration:none; color:var(--accent); }
  .top-sub { font-size:.85rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .top-home {
    flex:none; display:inline-flex; align-items:center; gap:4px;
    font-size:.82rem; font-weight:700; color:var(--muted);
    background:var(--neutral-soft); border:1px solid var(--line); border-radius:999px;
    padding:5px 12px; min-block-size:34px;
  }
  .top-home:hover { text-decoration:none; color:var(--ink); border-color:var(--muted); }

  /* رأس الصفحة */
  .intro { padding:16px 0 4px; }
  h1 {
    font-weight:700; font-size:clamp(1.38rem, 4.6vw, 2rem); line-height:1.36;
    margin:0 0 6px; letter-spacing:-.01em; text-wrap:balance;
  }
  .lede { color:var(--muted); font-size:.93rem; line-height:1.65; margin:0 0 10px; max-width:65ch; }
  .updated {
    display:inline-flex; align-items:center; gap:7px; color:var(--muted); font-size:.79rem;
    margin:0; padding:4px 10px; border-radius:999px; background:var(--surface); border:1px solid var(--line);
  }
  .live { width:7px; height:7px; border-radius:50%; background:var(--ok); box-shadow:0 0 0 3px var(--ok-soft); flex:none; }

  /* شرائح الأقسام: تمرير أفقي سلس وملائم للمس */
  .chips {
    margin:12px -14px 0; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch;
    scroll-snap-type:x proximity; scroll-padding-inline:14px; touch-action:pan-x pan-y;
  }
  .chips::-webkit-scrollbar { display:none; }
  .chips-track { display:flex; gap:8px; padding:2px 14px 4px; width:max-content; }
  .chip {
    scroll-snap-align:start; display:inline-flex; align-items:center; justify-content:center;
    white-space:nowrap; border-radius:999px; padding:7px 15px; min-block-size:38px;
    font-size:.88rem; font-weight:700;
    background:var(--surface); color:var(--muted); border:1px solid var(--line);
    transition:background-color .15s, color .15s, border-color .15s;
  }
  .chip:hover { text-decoration:none; color:var(--ink); border-color:var(--muted); }
  .chip.is-current { background:var(--ink); color:var(--surface); border-color:var(--ink); box-shadow:0 2px 6px rgba(16,32,46,.14); }

  /* المنطقة: متحكم مقسّم مضغوط */
  .region {
    margin:12px 0 0; padding:10px 12px; border-radius:16px;
    background:var(--surface); border:1px solid var(--line);
  }
  .region-head { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:4px 10px; margin-bottom:8px; }
  .region-label { font-size:.82rem; color:var(--ink); font-weight:700; margin:0; }
  .region-note { color:var(--muted); font-size:.76rem; margin:0; }
  .segmented {
    display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:4px;
    padding:3px; border-radius:12px; background:var(--neutral-soft);
  }
  .seg {
    display:inline-flex; align-items:center; justify-content:center;
    text-align:center; white-space:nowrap; padding:6px 6px; min-block-size:36px; border-radius:9px;
    font-size:.82rem; font-weight:700; color:var(--muted);
  }
  .seg:hover { text-decoration:none; color:var(--ink); }
  .seg.is-on { background:var(--surface); color:var(--ink); box-shadow:0 1px 3px rgba(16,32,46,.12); }

  /* البطل: بطاقة «ويدجت» مصمتة بلون القسم */
  .hero {
    position:relative; overflow:hidden; margin:14px 0 0; color:#fff;
    background:linear-gradient(145deg, var(--kind-deep-2), var(--kind-deep));
    border:1px solid rgba(255,255,255,.14);
    border-radius:22px; padding:18px 16px 16px;
    box-shadow:0 12px 28px -12px rgba(10,30,50,.35);
  }
  .hero::after {
    content:""; position:absolute; inset-inline-end:-60px; top:-70px; width:220px; height:220px; border-radius:50%;
    background:radial-gradient(circle, rgba(255,255,255,.16), rgba(255,255,255,0) 70%); pointer-events:none;
  }
  .hero a { color:#fff; }
  .hero-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .hero-kicker {
    margin:0; display:inline-flex; align-items:center; gap:7px;
    font-size:.82rem; font-weight:700; opacity:.92;
  }
  .hero-dot { width:7px; height:7px; border-radius:50%; background:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.22); flex:none; }
  .badge-on-hero { background:rgba(255,255,255,.2) !important; color:#fff !important; border:1px solid rgba(255,255,255,.22); }
  .hero-title { font-weight:700; font-size:clamp(1.3rem, 4.2vw, 1.65rem); line-height:1.4; margin:8px 0 14px; }
  .clock { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; }
  .clock-cell {
    background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.2);
    border-radius:14px; padding:10px 6px 8px; text-align:center;
    -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px);
  }
  .clock-cell b { display:block; font-weight:700; font-size:clamp(1.85rem, 6vw, 2.5rem); line-height:1.1; letter-spacing:-.02em; }
  .clock-cell span { display:block; font-size:.78rem; font-weight:700; opacity:.9; margin-top:3px; }
  .clock-word { margin:0; font-weight:700; font-size:1.85rem; }

  .hero-meta-bar {
    margin-top:12px; padding:10px 12px; border-radius:14px;
    background:rgba(0,0,0,.16); border:1px solid rgba(255,255,255,.12);
    display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px 12px;
  }
  .hero-phrase { margin:0; font-size:.92rem; }
  .hero-count {
    display:inline-block; font-weight:700; background:rgba(255,255,255,.18);
    padding:2px 10px; border-radius:999px;
  }
  .hero-count-past { opacity:.85; }
  .hero-date { margin:0; font-size:.88rem; display:flex; flex-wrap:wrap; align-items:center; gap:4px 6px; }
  .hero-date time { font-weight:700; white-space:nowrap; }
  .hero-date .hijri { opacity:.9; white-space:nowrap; }
  .hero .sep { margin-inline:2px; opacity:.65; }
  .hero-notes { margin-top:10px; display:grid; gap:4px; }
  .hero-note { margin:0; font-size:.83rem; line-height:1.6; opacity:.9; max-width:62ch; }
  .hero-foot {
    display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px 14px;
    margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,.18);
  }
  .hero-src { font-size:.82rem; font-weight:700; opacity:.92; text-decoration:underline; text-underline-offset:3px; }
  .hero-cta {
    display:inline-flex; align-items:center; gap:6px;
    font-size:.85rem; font-weight:700; background:#fff; color:var(--kind-deep) !important;
    padding:7px 15px; min-block-size:38px; border-radius:999px;
    box-shadow:0 2px 8px rgba(0,0,0,.15);
  }
  .hero-cta:hover { text-decoration:none; opacity:.95; }

  .badge { display:inline-flex; align-items:center; border-radius:999px; padding:2px 10px; font-size:.75rem; font-weight:700; white-space:nowrap; flex:none; }
  .badge-ok { background:var(--ok-soft); color:var(--ok); }
  .badge-warn { background:var(--warn-soft); color:var(--warn); }
  .badge-neutral { background:var(--neutral-soft); color:var(--neutral); }

  /* رؤوس المجموعات */
  .section-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin:24px 0 10px; }
  .group-title { font-weight:700; font-size:1.12rem; margin:0; display:flex; align-items:center; gap:8px; color:var(--ink); }
  .section-sub { color:var(--muted); font-size:.8rem; }
  .group { margin-top:22px; }
  .group > .section-head { margin-top:0; }
  .group-count { font-size:.76rem; font-weight:700; color:var(--muted); background:var(--neutral-soft); border:1px solid var(--line); border-radius:999px; padding:1px 9px; }

  /* بطاقات المواعيد: شريط لوني + نص + مربع «باقي» */
  .board, .list { display:grid; gap:10px; }
  /* بطاقات اللوحة بارتفاع واحد في كل صف، و«التفاصيل» في أسفلها */
  .board > .item { display:flex; flex-direction:column; }
  .board > .item > .item-main { flex:1; }
  .list { list-style:none; margin:0; padding:0; }
  .item {
    background:var(--surface); border:1px solid var(--line); border-radius:var(--radius);
    box-shadow:var(--shadow); overflow:hidden; transition:border-color .15s;
  }
  .item.is-past { opacity:.82; }
  .item-main { display:flex; align-items:center; gap:12px; padding:14px; color:inherit; }
  a.item-main:hover { text-decoration:none; background:var(--surface-2); }
  .item-bar { align-self:stretch; width:4px; border-radius:4px; background:var(--kind); flex:none; }
  .item-text { flex:1; min-width:0; }
  .item-head { display:flex; align-items:flex-start; justify-content:space-between; gap:6px 8px; margin-bottom:3px; }
  .item-series { flex:1; min-width:0; font-weight:700; font-size:1.02rem; line-height:1.4; margin:0; color:var(--ink); }
  .item-head > .badge, .item-head > [class^="badge"] { flex:none; margin-top:2px; }
  .item-title { margin:0; font-size:.9rem; color:var(--muted); line-height:1.45; }
  .item-title-strong { color:var(--ink); font-weight:700; font-size:.96rem; }
  .item-empty { font-style:normal; }
  .item-date { margin:5px 0 0; font-size:.85rem; line-height:1.5; display:flex; flex-direction:column; gap:1px; }
  .item-date time { font-weight:700; color:var(--ink); }
  .item-date .hijri { color:var(--muted); font-size:.8rem; }
  .sep { margin-inline:6px; color:var(--muted); }
  .item-end { margin:3px 0 0; font-size:.8rem; color:var(--muted); }
  .item-meta { margin:7px 0 0; display:flex; align-items:center; gap:8px; }
  .item-link-hint { font-size:.78rem; font-weight:700; color:var(--accent); display:inline-flex; align-items:center; gap:4px; }

  .tile {
    flex:none; align-self:center; width:78px; min-height:78px; border-radius:16px;
    display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
    background:var(--neutral-soft); background:color-mix(in srgb, var(--kind) 11%, var(--surface));
    border:1px solid color-mix(in srgb, var(--kind) 22%, transparent);
    color:var(--kind); padding:6px 4px;
  }
  .tile-pre { font-size:.7rem; font-weight:700; line-height:1.2; }
  .tile-num { font-weight:700; font-size:1.7rem; line-height:1.1; letter-spacing:-.02em; }
  .tile-unit { font-size:.74rem; font-weight:700; line-height:1.3; }
  .tile-word { font-size:.82rem; font-weight:700; padding:0 4px; line-height:1.35; }
  .tile-past { color:var(--neutral); background:var(--neutral-soft); border-color:var(--line); }

  .answer { margin:0; font-size:.93rem; font-weight:700; color:var(--ink); line-height:1.65; }
  .answer-lg { padding:0; font-size:1rem; }
  .more { border-top:1px solid var(--line); background:var(--surface-2); }
  .more > summary {
    list-style:none; cursor:pointer; padding:10px 14px; min-block-size:42px;
    font-size:.83rem; font-weight:700; color:var(--accent);
    display:flex; align-items:center; justify-content:space-between; gap:8px;
  }
  .more > summary::-webkit-details-marker { display:none; }
  .more > summary::after {
    content:"+"; width:22px; height:22px; border-radius:50%;
    background:var(--surface); border:1px solid var(--line);
    display:inline-grid; place-items:center; font-size:1rem; line-height:1; color:var(--muted); flex:none;
  }
  .more[open] > summary::after { content:"−"; color:var(--accent); border-color:var(--accent); }
  .more-body { padding:2px 14px 14px; border-top:1px dashed var(--line); }
  .follow, .summary { color:var(--muted); font-size:.88rem; line-height:1.7; margin:6px 0 0; max-width:64ch; }
  .more-body > :first-child { margin-top:8px; }
  .note { color:var(--muted); font-size:.84rem; margin:6px 0 0; max-width:64ch; }
  .src { font-size:.84rem; margin:10px 0 0; display:flex; flex-wrap:wrap; gap:4px 8px; align-items:center; }
  .src-label { font-size:.72rem; font-weight:700; color:var(--muted); background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:1px 7px; }
  .prev { color:var(--muted); font-size:.8rem; margin:8px 0 0; padding-top:8px; border-top:1px solid var(--line); }

  /* لوحات نصية (صفحة القسم والمنهجية) */
  .panel { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:15px 16px; margin-top:14px; box-shadow:var(--shadow); }
  .panel.k-school, .panel.k-salary, .panel.k-citizen, .panel.k-social, .panel.k-pension { border-inline-start:4px solid var(--kind); }
  .method { margin-top:28px; }
  .method .panel { margin-top:10px; }
  .method p { color:var(--muted); font-size:.9rem; line-height:1.8; margin:0; max-width:68ch; }
  .method .legend { margin-top:12px; padding-top:12px; border-top:1px solid var(--line); display:flex; flex-wrap:wrap; align-items:center; gap:8px 16px; font-size:.82rem; color:var(--ink); }
  .legend-item { display:inline-flex; align-items:center; gap:6px; }

  .callout { background:var(--warn-soft); color:var(--warn); border:1px solid color-mix(in srgb, var(--warn) 25%, var(--line)); border-radius:14px; padding:12px 14px; font-size:.88rem; font-weight:700; margin:18px 0 0; max-width:64ch; }

  /* الأسئلة: قائمة مجمّعة */
  .faq { margin-top:28px; }
  .inset { margin-top:10px; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; box-shadow:var(--shadow); }
  .qa + .qa { border-top:1px solid var(--line); }
  .qa > summary {
    list-style:none; cursor:pointer; padding:14px 16px; min-block-size:48px;
    font-weight:700; font-size:.94rem; line-height:1.55;
    display:flex; align-items:center; justify-content:space-between; gap:12px;
  }
  .qa > summary::-webkit-details-marker { display:none; }
  .qa > summary::after { content:"›"; font-size:1.15rem; color:var(--muted); transition:transform .15s; flex:none; }
  .qa[open] > summary::after { transform:rotate(-90deg); color:var(--accent); }
  .qa p { color:var(--muted); font-size:.9rem; line-height:1.8; margin:0; padding:0 16px 15px; }

  .page-note { color:var(--muted); font-size:.82rem; margin-top:28px; margin-bottom:0; }

  /* فوتر سبق: نفس فوتر الموقع (web-next/components/SiteFooter.tsx) */
  .site-footer { margin-top:32px; border-top:1px solid var(--line); background:var(--surface-2); padding-bottom:env(safe-area-inset-bottom); }
  .site-footer .wrap { display:flex; flex-direction:column; gap:28px; padding:30px 0 24px; }
  .foot-cols { display:flex; flex-direction:column; gap:28px; }
  .foot-brand { display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .foot-brand img { height:40px; width:auto; display:block; }
  .foot-brand p { margin:0; color:var(--muted); font-size:.86rem; }
  .apps { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }
  .apps a { display:inline-flex; align-items:center; height:32px; padding:0 12px; border-radius:8px; color:#fff; font-size:.76rem; font-weight:500; }
  .apps a:hover { text-decoration:none; opacity:.9; }
  .foot-links h2 { margin:0 0 10px; font-size:.86rem; font-weight:500; color:var(--ink); }
  .foot-links ul { list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px 16px; }
  .foot-links a { color:var(--muted); font-size:.86rem; }
  .foot-links a:hover { color:var(--ink); text-decoration:none; }
  .foot-bottom { display:flex; flex-direction:column; align-items:center; gap:14px; padding-top:20px; border-top:1px solid var(--line); }
  .foot-bottom p { margin:0; color:var(--muted); font-size:.76rem; }
  .foot-bottom .heart { color:#16a34a; }
  .social { display:flex; align-items:center; gap:12px; }
  .social a { color:var(--muted); display:inline-flex; }
  .social a:hover { color:var(--ink); }
  .social svg { width:16px; height:16px; fill:currentColor; }

  :focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:6px; }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior:auto; }
    * { transition:none !important; }
  }

  /* تحسينات مخصّصة لشاشات الهواتف والأجهزة اللمسية */
  @media (pointer: coarse) {
    .chip { min-block-size:42px; padding:8px 16px; }
    .seg { min-block-size:40px; }
    .more > summary { min-block-size:46px; }
    .qa > summary { min-block-size:50px; }
    .hero-cta { min-block-size:42px; }
  }
  @media (max-width: 420px) {
    .wrap { width:calc(100% - 22px); }
    .chips { margin-inline:-11px; scroll-padding-inline:11px; }
    .chips-track { padding-inline:11px; }
    .segmented { display:flex; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
    .segmented::-webkit-scrollbar { display:none; }
    .seg { flex:none; padding:6px 12px; }
    .hero { padding:16px 14px 14px; border-radius:20px; }
    .item-main { padding:12px; gap:10px; }
    .tile { width:72px; min-height:72px; border-radius:14px; }
    .tile-num { font-size:1.55rem; }
  }

  @media (min-width:760px) {
    .intro { padding:22px 0 6px; }
    .chips { margin-inline:0; }
    .chips-track { padding-inline:0; }
    .region { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:10px 16px; }
    .region-head { margin-bottom:0; flex-direction:column; gap:2px; }
    .segmented { display:inline-flex; width:auto; }
    .seg { padding:6px 14px; }
    .hero { padding:24px 26px 20px; }
    .clock { max-width:440px; }
    .board { grid-template-columns:1fr 1fr; align-items:stretch; }
    .site-nav, .site-header-spacer { display:flex; }
    .foot-cols { flex-direction:row; justify-content:space-between; }
    .foot-brand { align-items:flex-start; text-align:start; }
    .apps { justify-content:flex-start; }
    .foot-bottom { flex-direction:row; justify-content:space-between; }
  }
</style>
</head>
<body>
<a class="skip-link" href="#main-content">تخطَّ إلى المحتوى</a>
<header class="site-header" role="banner">
  <div class="wrap site-header-row">
    <a class="site-logo" href="/" aria-label="الصفحة الرئيسية"><img src="/branding/sabq-logo.png" alt="سبق - SABQ" width="751" height="681" loading="eager" decoding="async"></a>
    <nav class="site-nav" aria-label="القائمة الرئيسية">${SITE_SECTIONS.map((item) => `<a href="${item.href}">${item.name}</a>`).join("")}</nav>
    <span class="site-header-spacer" aria-hidden="true"></span>
  </div>
</header>
<div class="topbar">
  <div class="wrap">
    <div class="top-crumbs">
      <a class="top-title" href="/">الرئيسية</a>
      <span class="crumb-sep" aria-hidden="true">›</span>
      ${home ? `<span class="top-title" aria-current="page">مواعيدك</span>` : `<a class="top-title" href="/mawaeed">مواعيدك</a>`}
      ${currentNav ? `<span class="crumb-sep" aria-hidden="true">›</span><span class="top-sub">${esc(currentNav.label)}</span>` : ""}
    </div>
    ${home ? "" : `<a class="top-home" href="/mawaeed">كل المواعيد ›</a>`}
  </div>
</div>
<main id="main-content" class="wrap" tabindex="-1">
<div class="intro">
<h1>${esc(view.page.h1)}</h1>
<p class="lede">${description}</p>
<p class="updated"><span class="live" aria-hidden="true"></span><span>آخر تحديث للبيانات: <time datetime="${esc(view.dateModified)}">${esc(view.dateModifiedLabel)}</time> — بتوقيت السعودية</span></p>
</div>
${navHtml(view)}
${regionHtml(view)}
${bodyMain}
</main>
<p class="wrap page-note">الأوقات بتوقيت السعودية. التاريخ الهجري بتقويم أم القرى.</p>
${siteFooterHtml()}
<script>
(function () {
  var activeChip = document.querySelector(".chip.is-current");
  if (activeChip && activeChip.scrollIntoView) {
    try { activeChip.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {}
  }
  function dayUnit(n) { var r = Math.abs(Math.trunc(n)) % 100; return r === 0 ? "يوم" : r >= 3 && r <= 10 ? "أيام" : "يوماً"; }
  function daysText(n) {
    if (n === 1) return "يوم واحد";
    if (n === 2) return "يومين";
    return n + " " + dayUnit(n);
  }
  function hoursText(n) {
    if (n <= 0) return "";
    if (n === 1) return "وساعة";
    if (n === 2) return "وساعتين";
    if (n <= 10) return "و" + n + " ساعات";
    return "و" + n + " ساعة";
  }
  function phrase(days, hours) {
    if (days <= 0 && hours <= 0) return "بعد أقل من ساعة";
    if (days <= 0) return "بعد " + hoursText(hours).replace(/^و/, "");
    if (hours <= 0) return "بعد " + daysText(days);
    return "بعد " + daysText(days) + " " + hoursText(hours);
  }
  function hourUnit(n) { return n <= 2 ? "ساعة" : n <= 10 ? "ساعات" : "ساعة"; }
  function tileWord(days, hours) {
    if (days === 1) return "باقي يوم واحد";
    if (days === 2) return "باقي يومان";
    if (hours === 1) return "باقي ساعة";
    if (hours === 2) return "باقي ساعتان";
    return "";
  }
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
  function riyadhDay() { return new Date(Date.now() + 10800000).toISOString().slice(0, 10); }
  var loadedDay = riyadhDay(), reloading = false;
  function tick() {
    // بعد منتصف ليل الرياض تتغيّر المواعيد القادمة وحالاتها: نعيد التحميل مرة بدل البقاء على «اليوم».
    if (!reloading && riyadhDay() !== loadedDay) { reloading = true; location.reload(); return; }
    each("[data-countdown]", function (el) {
      var r = left(el.getAttribute("data-date")); if (!r) return;
      var today = el.getAttribute("data-today") || "اليوم";
      el.textContent = r.done ? today : phrase(r.days, r.hours);
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
      if (r.done) { el.innerHTML = '<span class="tile-word"></span>'; el.firstChild.textContent = el.getAttribute("data-today") || "اليوم"; return; }
      var h = r.days >= 1 ? 0 : Math.max(1, r.hours);
      var word = tileWord(r.days, h);
      if (word) {
        // واحد واثنان بالكلمة؛ الأرقام تعود حين يكبر العدد (لا يحدث إلا بعد إعادة التحميل).
        if (!el.querySelector(".tile-word")) el.innerHTML = '<span class="tile-word"></span>';
        el.firstChild.textContent = word;
        return;
      }
      if (!el.querySelector(".tile-num")) {
        el.innerHTML = '<span class="tile-pre">باقي</span><b class="tile-num"></b><span class="tile-unit"></span>';
      }
      var num = el.querySelector(".tile-num"), unit = el.querySelector(".tile-unit");
      if (r.days >= 1) { num.textContent = r.days; unit.textContent = dayUnit(r.days); }
      else { num.textContent = h; unit.textContent = hourUnit(h); }
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

const SERVICE_REDIRECTS = {
  "school-calendar-1448": SCHOOL_SERVICE_PATH,
  "citizen-account": "/services/citizen-account-date",
  salaries: "/services/government-salaries-date",
  "social-security": "/services/social-security-date",
  pensions: "/services/pensions-date",
};

export async function serveMawaeedPage({ request, url, env, waitUntil, signProxyRequest }) {
  const slug = mawaeedSlugFromPath(url.pathname);
  if (slug && SERVICE_REDIRECTS[slug]) {
    // المنطقة تعيش في الاستعلام؛ إسقاطها يعيد قارئ مكة إلى تواريخ الرياض.
    const picked = url.searchParams.get("region");
    const region = slug === "school-calendar-1448" && picked ? normalizeRegion(picked) : "riyadh";
    const query = region === "riyadh" ? "" : `?region=${region}`;
    return Response.redirect(`${url.origin}${SERVICE_REDIRECTS[slug]}${query}`, 301);
  }
  const indexableHost = url.hostname === "sabq.org";
  const commit = env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BUILD_ID || "";
  const cacheable = indexableHost && Boolean(commit) && request.method === "GET";
  const keyUrl = new URL(url.origin + url.pathname);
  keyUrl.searchParams.set("region", normalizeRegion(url.searchParams.get("region")));
  keyUrl.searchParams.set("__b", commit || "dev");
  keyUrl.searchParams.set("__v", "mawaeed");
  // يوم الرياض في المفتاح: نسخة مخزّنة قبل منتصف الليل لا تُقدَّم بعده، فإعادة التحميل عند تغيّر اليوم تجلب الجديد.
  keyUrl.searchParams.set("__d", new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10));
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
