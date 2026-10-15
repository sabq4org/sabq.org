/**
 * قالب صفحات الخدمة على حافة Pages.
 * النموذج من /api/service-pages/:id. البشر والزواحف يرون الوثيقة نفسها.
 */

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&family=Tajawal:wght@700&display=swap";

export function servicePageIdFromPath(path) {
  const match = /^\/services\/([a-z0-9-]+)$/.exec(path);
  return match ? match[1] : null;
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

function asciiSlug(row) {
  const english = String((row && row.englishSlug) || "");
  if (/^[A-Za-z0-9_-]+$/.test(english)) return english;
  const slug = String((row && row.slug) || "");
  return /^[A-Za-z0-9_-]+$/.test(slug) ? slug : "";
}

function collectArticles(rows) {
  const links = [];
  const seen = new Set();
  for (const row of rows) {
    if (links.length >= 4) break;
    const slug = asciiSlug(row);
    const title = String((row && row.title) || "").trim();
    if (!title || !slug) continue;
    const key = title.replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ title, href: `/article/${slug}` });
  }
  return links;
}

export function relatedArticlesFromSearch(payload) {
  const rows = payload && Array.isArray(payload.results) ? payload.results : [];
  return collectArticles(rows);
}

export function relatedArticlesFromKeyword(payload) {
  const rows = payload && Array.isArray(payload.articles) ? payload.articles : [];
  return collectArticles(rows);
}

function riyadhStartMs(iso) {
  const bits = String(iso || "").split("-").map(Number);
  if (bits.length !== 3 || bits.some((n) => !Number.isFinite(n))) return NaN;
  return Date.UTC(bits[0], bits[1] - 1, bits[2], -3, 0, 0, 0);
}

function remaining(iso, nowMs) {
  const ms = riyadhStartMs(iso) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor(minutes / 60) % 24,
    minutes: minutes % 60,
  };
}

function leadHtml(model) {
  const rule = model.shiftRule ? ` ${esc(model.shiftRule)}` : "";
  if (!model.next) return `<p class="answer" id="answer">${esc(model.leadPrefix)}${rule}</p>`;
  const next = model.next;
  const badge = next.certainty === "expected" ? "badge badge-warn" : "badge badge-ok";
  const hint = next.expectedHint ? ` ${esc(next.expectedHint)}` : "";
  return `<p class="answer" id="answer">${esc(model.leadPrefix)} <time datetime="${esc(next.startsOn)}">${esc(
    next.gregorianLabel,
  )}</time> الموافق <span class="hijri">${esc(next.hijriLabel)}</span>، <strong data-countdown data-date="${esc(
    next.startsOn,
  )}" data-today="${esc(next.todayLabel)}">${esc(next.countdownText)}</strong>. الحالة: <span class="${badge}">${esc(
    next.certaintyLabel,
  )}</span>.${hint}${rule}</p>`;
}

function clockHtml(model, nowMs) {
  const next = model.next;
  if (!next || next.isToday) return "";
  const left = remaining(next.startsOn, nowMs);
  if (!left) return "";
  const cell = (part, value, label) =>
    `<div class="cell"><b data-part="${part}">${value}</b><span>${label}</span></div>`;
  return `<div class="clock" data-clock data-date="${esc(next.startsOn)}" aria-hidden="true">
    ${cell("d", left.days, "يوم")}
    ${cell("h", left.hours, "ساعة")}
    ${cell("m", left.minutes, "دقيقة")}
  </div>`;
}

function chipsHtml(model) {
  if (!model.next) return "";
  const next = model.next;
  return `<div class="chips">
    <p><span>ميلادي</span><time datetime="${esc(next.startsOn)}">${esc(next.gregorianLabel)}</time></p>
    <p><span>هجري</span><bdi class="hijri">${esc(next.hijriLabel)}</bdi></p>
  </div>`;
}

function actionsHtml(model) {
  const calendar = model.calendarHref
    ? `<a class="btn btn-solid" href="${esc(model.calendarHref)}">أضف المواعيد القادمة إلى التقويم</a>`
    : "";
  return `<div class="actions">${calendar}<button class="btn btn-ghost" type="button" data-share>شارك الموعد</button></div>`;
}

function sourceHtml(model) {
  if (!model.next || !model.next.sourceUrl) return "";
  return `<p class="source">المصدر: <a href="${esc(model.next.sourceUrl)}" rel="noopener noreferrer">${esc(
    model.next.sourceTitle,
  )}</a></p>`;
}

function timelineHtml(model) {
  const rows = model.rows || [];
  if (rows.length === 0) {
    return `<section class="block" aria-labelledby="dates-title"><h2 id="dates-title">المواعيد</h2><p>لا توجد مواعيد منشورة في السجل.</p></section>`;
  }
  const items = rows
    .map((row) => {
      const state = row.isPast ? "is-past" : row.isNext ? "is-next" : "is-future";
      const mark = row.isPast
        ? `<span class="mark mark-past">${esc(row.pastLabel || "صُرفت")}</span>`
        : `<span class="mark">${esc(row.certaintyLabel)}</span>`;
      const when = row.isPast ? esc(row.pastLabel || "صُرفت") : esc(row.countdownText);
      const kicker = row.isNext ? `<p class="event-kicker">الموعد القادم</p>` : "";
      return `<li class="event ${state}">
        <span class="dot" aria-hidden="true"></span>
        <div class="event-body">
          ${kicker}
          <h3>${esc(row.title)}</h3>
          <p class="event-date"><time datetime="${esc(row.startsOn)}">${esc(row.gregorianLabel)}</time></p>
          <p class="event-hijri hijri">${esc(row.hijriLabel)}</p>
          <p class="event-meta">${mark}<span>${when}</span></p>
        </div>
      </li>`;
    })
    .join("");
  return `<section class="block" aria-labelledby="dates-title">
    <h2 id="dates-title">خط المواعيد</h2>
    <p class="note">من السجل المنشور فقط. ما مضى يظهر «صُرفت»، وما حُسب قبل إعلان الجهة يظهر «متوقع».</p>
    <ol class="timeline">${items}</ol>
  </section>`;
}

function explanationHtml(model) {
  const paragraphs = (model.explanation || []).map((paragraph) => `<p>${esc(paragraph)}</p>`).join("");
  return `<section class="block prose" aria-labelledby="how-title"><h2 id="how-title">كيف يُحدَّد الموعد</h2>${paragraphs}</section>`;
}

function relatedHtml(related) {
  if (!related || related.length === 0) return "";
  const items = related.map((item) => `<li><a href="${esc(item.href)}">${esc(item.title)}</a></li>`).join("");
  return `<section class="block" aria-labelledby="news-title"><h2 id="news-title">من أخبار سبق</h2><ul class="links">${items}</ul></section>`;
}

function faqHtml(faq) {
  if (!faq || faq.length === 0) return "";
  const items = faq
    .map((item) => `<article class="qa"><h3>${esc(item.question)}</h3><p>${esc(item.answer)}</p></article>`)
    .join("");
  return `<section class="block" aria-labelledby="faq-title"><h2 id="faq-title">أسئلة شائعة</h2>${items}</section>`;
}

function linksHtml(links) {
  if (!links || links.length === 0) return "";
  const items = links.map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`).join("");
  return `<nav class="block" aria-label="صفحات ذات صلة"><h2>صفحات ذات صلة</h2><ul class="links">${items}</ul></nav>`;
}

export function renderServicePageHtml(model, options = {}) {
  const related = Array.isArray(options.related) ? options.related : [];
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const tone = model.tone === "salary" ? "tone-salary" : "tone-citizen";
  const jsonLd = model.jsonLd ? `<script type="application/ld+json">${safeJson(model.jsonLd)}</script>` : "";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#071422">
<title>${esc(model.title)}</title>
<meta name="description" content="${esc(model.description)}">
<link rel="canonical" href="${esc(model.canonical)}">
<meta property="og:title" content="${esc(model.title)}">
<meta property="og:description" content="${esc(model.description)}">
<meta property="og:url" content="${esc(model.canonical)}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_SA">
<meta property="og:image" content="${esc(model.ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(model.ogImage)}">
<meta property="article:modified_time" content="${esc(model.dateModified)}">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
${jsonLd}
<style>
  :root {
    color-scheme: light;
    --paper:#f3f7fb; --card:#fff; --ink:#10202e; --muted:#5d7082; --line:#d7e3ee;
    --blue:#087dbb; --navy:#071422; --ok:#0f7a4a; --ok-soft:#e5f6ee; --warn:#8a5a00; --warn-soft:#fff3d4;
    --accent:${tone === "tone-salary" ? "#1f8a5b" : "#c9922a"};
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --paper:#0c141c; --card:#15202b; --ink:#e7eef5; --muted:#a5b5c4; --line:#2c3d4d;
      --blue:#53baff; --ok:#8ed7b8; --ok-soft:#143028; --warn:#e4c27a; --warn-soft:#3a2e14;
    }
  }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  body {
    margin:0; background:
      radial-gradient(900px 320px at 100% -40px, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
      var(--paper);
    color:var(--ink); line-height:1.75;
    font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;
  }
  a { color:var(--blue); }
  :focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
  .skip { position:absolute; inset-inline-start:12px; top:-40px; background:#fff; color:#000; padding:8px 12px; z-index:20; }
  .skip:focus { top:8px; }
  .wrap { width:min(880px, calc(100% - 28px)); margin-inline:auto; }
  header.top { position:sticky; top:0; z-index:5; background:color-mix(in srgb, var(--paper) 88%, transparent); backdrop-filter:blur(12px); border-bottom:1px solid var(--line); }
  header.top .wrap { display:flex; justify-content:space-between; align-items:center; min-height:56px; }
  .brand { font-family:Tajawal,sans-serif; font-size:1.45rem; font-weight:700; color:var(--ink); text-decoration:none; }
  .quiet { color:var(--muted); font-weight:700; text-decoration:none; }
  main { padding:18px 0 56px; }
  .crumbs { display:flex; flex-wrap:wrap; gap:6px; color:var(--muted); font-size:.84rem; margin-bottom:14px; }
  .crumbs a { color:var(--muted); }
  .hero {
    position:relative; overflow:hidden; color:#f5fbff;
    background:
      radial-gradient(520px 220px at 0% 100%, color-mix(in srgb, var(--accent) 55%, transparent), transparent 70%),
      linear-gradient(155deg, #071422 0%, #0b3a5c 58%, #087dbb 130%);
    border-radius:28px; padding:22px 18px 18px;
    box-shadow:0 18px 50px rgba(7,20,34,.18);
  }
  .hero h1 { font-family:Tajawal,sans-serif; font-size:clamp(1.7rem, 4vw, 2.5rem); line-height:1.25; margin:6px 0 12px; }
  .kicker { margin:0; letter-spacing:.08em; font-size:.78rem; font-weight:700; color:var(--accent); }
  .answer { margin:0; font-size:1.05rem; }
  .badge { display:inline-block; border-radius:999px; padding:0 8px; font-size:.82rem; font-weight:700; }
  .badge-ok { background:var(--ok-soft); color:var(--ok); }
  .badge-warn { background:var(--warn-soft); color:var(--warn); }
  .hero .badge-ok { background:#e5f6ee; color:#0f7a4a; }
  .hero .badge-warn { background:#fff3d4; color:#8a5a00; }
  .hero-grid { display:grid; gap:16px; }
  .clock {
    display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;
    background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.16);
    border-radius:20px; padding:12px;
  }
  .cell { text-align:center; }
  .cell b { display:block; font-family:Tajawal,sans-serif; font-size:clamp(1.8rem, 6vw, 2.8rem); line-height:1; font-variant-numeric:tabular-nums; }
  .cell span { font-size:.8rem; opacity:.8; }
  .chips { display:grid; gap:8px; margin-top:14px; }
  .chips p { margin:0; background:rgba(255,255,255,.08); border-radius:14px; padding:10px 12px; }
  .chips span { display:block; font-size:.75rem; opacity:.75; }
  .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
  .btn {
    appearance:none; border:0; cursor:pointer; text-decoration:none; font:inherit; font-weight:700;
    min-height:44px; padding:10px 16px; border-radius:999px; display:inline-flex; align-items:center;
  }
  .btn-solid { background:#fff; color:#071422; }
  .btn-ghost { background:transparent; color:#fff; border:1px solid rgba(255,255,255,.45); }
  .source, .updated, .note { color:var(--muted); }
  .hero .source { color:rgba(255,255,255,.82); }
  .hero .source a { color:#fff; }
  .updated { font-size:.9rem; }
  .block { margin-top:34px; }
  .block h2 { font-family:Tajawal,sans-serif; font-size:1.45rem; margin:0 0 8px; }
  .timeline { list-style:none; margin:18px 0 0; padding:0; position:relative; }
  .timeline::before {
    content:""; position:absolute; inset-inline-start:15px; top:8px; bottom:8px; width:2px;
    background:linear-gradient(var(--accent), var(--line));
  }
  .event { position:relative; padding:0 0 18px 0; padding-inline-start:46px; }
  .dot {
    position:absolute; inset-inline-start:8px; top:18px; width:16px; height:16px; border-radius:50%;
    background:var(--card); border:3px solid var(--line);
  }
  .event-body { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:14px 16px; }
  .event-kicker { margin:0; color:var(--muted); font-size:.8rem; font-weight:700; }
  .event-body h3 { font-family:Tajawal,sans-serif; margin:2px 0 4px; font-size:1.15rem; }
  .event-date, .event-hijri, .event-meta { margin:0; }
  .event-meta { display:flex; gap:8px; align-items:center; margin-top:8px; color:var(--muted); font-size:.92rem; }
  .mark { border-radius:999px; padding:1px 8px; background:var(--ok-soft); color:var(--ok); font-weight:700; font-size:.8rem; }
  .mark-past { background:var(--line); color:var(--muted); }
  .is-next .dot { border-color:var(--accent); background:var(--accent); }
  .is-next .event-body { border-color:color-mix(in srgb, var(--accent) 55%, var(--line)); box-shadow:0 10px 30px rgba(8,125,187,.08); }
  .is-past .event-body { opacity:.78; }
  .qa { margin:0 0 16px; }
  .qa h3 { font-size:1.02rem; margin:0 0 4px; }
  .qa p { margin:0; }
  .links { margin:0; padding-inline-start:1.1rem; }
  .hijri, time, .cell b { font-variant-numeric:tabular-nums; }
  footer { color:var(--muted); font-size:.85rem; padding-bottom:28px; }
  @media (min-width: 800px) {
    .hero { padding:36px; }
    .hero-grid { grid-template-columns:minmax(0,1fr) 280px; align-items:center; }
    .chips { grid-template-columns:1fr 1fr; }
    .clock { align-self:stretch; align-content:center; }
  }
  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior:auto; }
  }
</style>
</head>
<body class="${tone}">
<a class="skip" href="#answer">تخطَّ إلى الجواب</a>
<header class="top"><div class="wrap"><a class="brand" href="/">سبق</a><a class="quiet" href="/mawaeed">مواعيدك</a></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="مسار التنقل"><a href="/">سبق</a><span aria-hidden="true">/</span><a href="/mawaeed">مواعيدك</a><span aria-hidden="true">/</span><span aria-current="page">${esc(model.h1)}</span></nav>
<article class="hero ${tone}">
  <p class="kicker">الجواب</p>
  <div class="hero-grid">
    <div>
      <h1>${esc(model.h1)}</h1>
      ${leadHtml(model)}
      ${chipsHtml(model)}
      ${sourceHtml(model)}
      ${actionsHtml(model)}
    </div>
    ${clockHtml(model, nowMs)}
  </div>
</article>
<p class="updated">آخر تحديث للبيانات: <time datetime="${esc(model.dateModified)}">${esc(model.dateModifiedLabel)}</time> بتوقيت السعودية</p>
${timelineHtml(model)}
${explanationHtml(model)}
${relatedHtml(related)}
${faqHtml(model.faq)}
${linksHtml(model.links)}
</main>
<footer class="wrap"><p>التواريخ من سجل مواعيدك، وتُحدَّث عندما يعدّلها المحرر. الهجري بتقويم أم القرى.</p></footer>
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
  function left(target) {
    var bits = String(target || "").split("-");
    if (bits.length !== 3) return null;
    var start = Date.UTC(Number(bits[0]), Number(bits[1]) - 1, Number(bits[2]), -3, 0, 0, 0);
    var ms = start - Date.now();
    if (!(ms > 0)) return { done: true };
    var mins = Math.floor(ms / 60000);
    return { days: Math.floor(mins / 1440), hours: Math.floor(mins / 60) % 24, minutes: mins % 60 };
  }
  function tick() {
    var clocks = document.querySelectorAll("[data-clock]");
    for (var i = 0; i < clocks.length; i++) {
      var remain = left(clocks[i].getAttribute("data-date"));
      if (!remain || remain.done) continue;
      var map = { d: remain.days, h: remain.hours, m: remain.minutes };
      var parts = clocks[i].querySelectorAll("[data-part]");
      for (var p = 0; p < parts.length; p++) parts[p].textContent = map[parts[p].getAttribute("data-part")];
    }
    var nodes = document.querySelectorAll("[data-countdown]");
    for (var j = 0; j < nodes.length; j++) {
      var row = left(nodes[j].getAttribute("data-date"));
      if (!row) continue;
      var today = nodes[j].getAttribute("data-today") || "اليوم";
      nodes[j].textContent = row.done ? today : phrase(row.days, row.hours, today);
    }
  }
  tick();
  setInterval(tick, 30000);
  var share = document.querySelector("[data-share]");
  if (share) share.addEventListener("click", function () {
    var url = location.href.split("#")[0];
    var title = document.title;
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {});
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { share.textContent = "تم نسخ الرابط"; }).catch(function () {});
    }
  });
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

function publicOrigin(env) {
  const configuredOrigin = String(env.API_ORIGIN || "").trim().replace(/\/+$/, "");
  const staging = String(env.STAGING_NO_INDEX || "").toLowerCase() === "true";
  if (staging && !configuredOrigin) return { error: "Staging API origin is not configured." };
  if (staging) {
    let hostname = "";
    try { hostname = new URL(configuredOrigin).hostname; } catch (_) { hostname = ""; }
    if (hostname === "api.sabq.org" || hostname === "sabqorg-production.up.railway.app") {
      return { error: "Production API origin is forbidden in staging." };
    }
  }
  return { origin: configuredOrigin || "https://api.sabq.org" };
}

async function fetchJson(endpoint, request, env, signProxyRequest) {
  const sourceHeaders = new Headers();
  const clientIp = request.headers.get("cf-connecting-ip");
  if (clientIp) sourceHeaders.set("cf-connecting-ip", clientIp);
  const authorization = request.headers.get("authorization");
  if (authorization) sourceHeaders.set("authorization", authorization);
  const metadataRequest = new Request(endpoint, { method: "GET", headers: sourceHeaders });
  const headers = await signProxyRequest(metadataRequest, endpoint, env.EDGE_PROXY_SHARED_SECRET);
  headers.set("User-Agent", "sabq-pages-fn/1.0");
  headers.set("Accept", "application/json");
  const res = await fetch(endpoint, { headers, signal: AbortSignal.timeout(2500) });
  if (!res.ok) return { status: res.status, payload: null };
  return { status: res.status, payload: await res.json() };
}

async function loadRelated(model, request, env, origin, signProxyRequest) {
  const query = String(model.relatedQuery || "").trim();
  if (query.length < 2) return [];
  const endpoint = model.relatedSource === "keyword"
    ? `${origin}/api/keyword/${encodeURIComponent(query)}`
    : `${origin}/api/search?q=${encodeURIComponent(query)}&limit=6`;
  const result = await fetchJson(endpoint, request, env, signProxyRequest);
  return model.relatedSource === "keyword"
    ? relatedArticlesFromKeyword(result.payload)
    : relatedArticlesFromSearch(result.payload);
}

export async function serveServicePage({ request, url, env, waitUntil, signProxyRequest }) {
  const id = servicePageIdFromPath(url.pathname);
  if (!id) return htmlResponse("Not found", { status: 404, robots: "noindex, follow" });
  const indexableHost = url.hostname === "sabq.org";
  const commit = env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BUILD_ID || "";
  const cacheable = indexableHost && Boolean(commit) && request.method === "GET";
  const keyUrl = new URL(url.origin + url.pathname);
  keyUrl.searchParams.set("__b", commit || "dev");
  keyUrl.searchParams.set("__v", "service-page-2");
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

  const resolved = publicOrigin(env);
  if (resolved.error) {
    return new Response(resolved.error, {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  let page = { status: 0, payload: null };
  try {
    page = await fetchJson(`${resolved.origin}/api/service-pages/${encodeURIComponent(id)}`, request, env, signProxyRequest);
  } catch (error) {
    console.error("[service-page] origin", error);
  }

  if (page.status === 404) {
    const missing = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الصفحة غير موجودة | سبق</title><meta name="robots" content="noindex"></head><body><p>هذه الصفحة غير موجودة. <a href="/mawaeed">العودة إلى مواعيدك</a></p></body></html>`;
    return htmlResponse(missing, { status: 404, robots: "noindex, follow" });
  }
  if (!page.payload || !page.payload.canonical) {
    const failure = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تعذر تحميل الصفحة | سبق</title><meta name="robots" content="noindex"></head><body><h1>تعذر تحميل الموعد</h1><p>حدّث الصفحة بعد قليل. لم نعرض قشرة فارغة حتى لا تُفهرس الصفحة بلا تاريخ.</p></body></html>`;
    return htmlResponse(failure, { status: 503, robots: "noindex, nofollow" });
  }

  let related = [];
  try {
    related = await loadRelated(page.payload, request, env, resolved.origin, signProxyRequest);
  } catch (error) {
    console.error("[service-page] related", error);
  }

  const html = renderServicePageHtml(page.payload, { related });
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
    try {
      waitUntil(caches.default.put(cacheKey, new Response(html, { status: 200, headers: storedHeaders })).catch(() => {}));
    } catch (_) { /* ignore */ }
  }
  if (request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
  response.headers.set("x-edge-cache", cacheable ? "MISS" : "BYPASS");
  return response;
}
