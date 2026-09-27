/**
 * صفحة «مواعيدك» على حافة Pages: HTML من نموذج JSON الجاهز.
 * العدّاد الثابت يُحسب في الـ API. سكربت صغير يعيد الأيام والساعات بتوقيت الرياض.
 */

const REGIONS = ["riyadh", "makkah", "madinah", "jeddah", "taif"];

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

function cardHtml(card) {
  const past = card.isPast ? " card-past" : "";
  const badgeClass = card.isPast ? "badge-past" : card.certainty === "expected" ? "badge-expected" : "badge-ok";
  const badge = card.isPast ? card.pastLabel : card.certaintyLabel;
  const hint = card.expectedHint
    ? `<p class="hint" title="${esc(card.expectedHint)}">${esc(card.expectedHint)}</p>`
    : "";
  const count = card.isPast
    ? `<p class="count count-past">${esc(card.pastLabel)}</p>`
    : `<p class="count"><strong data-countdown data-date="${esc(card.startsOn)}" data-today="${esc(card.todayLabel)}">${esc(card.countdownText)}</strong></p>`;
  const notes = [card.publicNote, card.visionNote].filter(Boolean).map((line) => `<p class="note">${esc(line)}</p>`).join("");
  const end = card.endsOn && card.endsOn !== card.startsOn ? `<p class="end">حتى ${esc(card.endsOn)}</p>` : "";
  return `<article class="card${past}">
    <div class="row"><span class="badge ${badgeClass}">${esc(badge)}</span><span class="kicker">${esc(card.seriesTitle || "")}</span></div>
    <h3>${esc(card.title)}</h3>
    <p class="date"><time datetime="${esc(card.startsOn)}">${esc(card.gregorianLabel)}</time> <span class="hijri">(${esc(card.hijriLabel)})</span></p>
    ${end}
    ${count}
    ${hint}
    ${notes}
    <a class="source" href="${esc(card.sourceUrl)}" rel="noopener noreferrer">${esc(card.sourceTitle)}</a>
  </article>`;
}

function navHtml(view) {
  return `<nav class="crumbs" aria-label="أقسام مواعيدك">${view.nav.map((item) => {
    const cls = item.current ? " class=\"current\"" : "";
    return `<a${cls} href="${esc(item.href)}">${esc(item.label)}</a>`;
  }).join("")}</nav>`;
}

function regionHtml(view) {
  const show = !view.page.slug || view.page.slug === "school-calendar-1448";
  if (!show) return "";
  const path = view.page.canonical.replace("https://sabq.org", "") || "/mawaeed";
  const links = view.regions.map((region) => {
    const current = region.id === view.region ? " aria-current=\"true\"" : "";
    return `<a${current} href="${esc(regionHref(path, region.id))}">${esc(region.label)}</a>`;
  }).join("");
  return `<div class="region"><span>المنطقة</span><div class="region-list">${links}</div><p class="region-note">الافتراضي الرياض. الإجازات الإضافية تختلف، والإجازات الرسمية من الوزارة تظهر لكل المناطق.</p></div>`;
}

function westernNote(view) {
  if (view.page.slug !== "school-calendar-1448" || view.region === "riyadh") return "";
  const hasExtra = (view.sections || []).some((section) => section.id === "extra" && section.cards.length > 0);
  if (hasExtra) return "";
  return `<p class="callout">إجازات مكة المكرمة والمدينة المنورة وجدة والطائف الإضافية لا تُعرض حتى يؤكدها محرر ويربطها بمصدر الإدارة. الظاهر الآن هو تقويم الوزارة المشترك.</p>`;
}

function seriesBlock(block) {
  const previous = block.previous ? cardHtml(block.previous) : "";
  const next = block.next ? cardHtml(block.next) : `<article class="card"><p>${esc(block.answerLine)}</p></article>`;
  return `<section class="series" id="${esc(block.slug)}">
    <h2><a href="${esc(block.href)}">${esc(block.title)}</a></h2>
    <p class="answer">${esc(block.answerLine)}</p>
    ${block.followLine ? `<p class="follow">${esc(block.followLine)}</p>` : ""}
    <p class="summary">${esc(block.summary)}</p>
    <div class="cards">${previous}${next}</div>
  </section>`;
}

function faqHtml(faq) {
  if (!faq || faq.length === 0) return "";
  const items = faq.map((item) => `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("");
  return `<section class="faq"><h2>أسئلة شائعة</h2>${items}</section>`;
}

export function renderMawaeedHtml(view) {
  const title = esc(view.page.title);
  const description = esc(view.page.description);
  const canonical = esc(view.page.canonical);
  const home = !view.page.slug;
  const bodyMain = home
    ? `<div class="answers">${(view.series || []).map((block) => block.next ? cardHtml({ ...block.next, seriesTitle: block.title }) : "").join("")}</div>
       ${(view.series || []).map(seriesBlock).join("")}
       <section class="method"><h2>كيف نحسب المواعيد ومن أين نأخذها؟</h2><p>${esc(view.methodology || "")}</p></section>`
    : `${(view.series || []).map((block) => `<p class="answer">${esc(block.answerLine)}</p>${block.followLine ? `<p class="follow">${esc(block.followLine)}</p>` : ""}<p class="summary">${esc(block.summary)}</p>${block.previous ? cardHtml(block.previous) : ""}`).join("")}
       ${(view.sections || []).map((section) => `<section><h2>${esc(section.title)}</h2><div class="cards">${section.cards.map(cardHtml).join("")}</div></section>`).join("")}
       ${westernNote(view)}
       ${faqHtml(view.faq)}`;

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
  :root { color-scheme: light; --ink:#142033; --muted:#5c6b7a; --line:#e4ebf2; --bg:#f3f6fa; --card:#fff; --blue:#1578b8; --ok:#0d6b4d; --okbg:#e7f6ef; --exp:#8a5a00; --expbg:#fff4d6; --past:#5c6b7a; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"IBM Plex Sans Arabic","Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif; background:var(--bg); color:var(--ink); line-height:1.7; }
  a { color:var(--blue); text-decoration:none; }
  a:hover { text-decoration:underline; }
  header, main, footer { width:min(920px, calc(100% - 28px)); margin-inline:auto; }
  header { padding:18px 0 8px; display:flex; justify-content:space-between; align-items:center; gap:12px; }
  .brand { font-weight:800; color:var(--ink); font-size:1.25rem; }
  .crumbs { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 14px; }
  .crumbs a { background:#fff; border:1px solid var(--line); border-radius:999px; padding:4px 10px; font-size:.92rem; }
  .crumbs a.current { background:var(--blue); color:#fff; border-color:var(--blue); }
  h1 { font-size:1.55rem; line-height:1.45; margin:8px 0; }
  h2 { font-size:1.2rem; margin:22px 0 8px; }
  h3 { font-size:1.05rem; margin:6px 0; }
  .lede, .summary, .follow, .method p, .faq p { color:var(--muted); }
  .answer { font-size:1.08rem; background:#fff; border-inline-start:4px solid var(--blue); padding:10px 12px; border-radius:10px; }
  .region { margin:12px 0 18px; }
  .region-list { display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; }
  .region-list a { background:#fff; border:1px solid var(--line); border-radius:10px; padding:6px 10px; }
  .region-list a[aria-current="true"] { background:#e8f4fc; border-color:var(--blue); font-weight:700; }
  .region-note, .hint, .note, .end { color:var(--muted); font-size:.92rem; margin:4px 0; }
  .cards, .answers { display:grid; gap:12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px 14px 12px; }
  .card-past { opacity:.8; }
  .row { display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .badge { border-radius:999px; padding:2px 8px; font-size:.82rem; font-weight:700; }
  .badge-ok { background:var(--okbg); color:var(--ok); }
  .badge-expected { background:var(--expbg); color:var(--exp); }
  .badge-past { background:#eef2f6; color:var(--past); }
  .kicker { color:var(--muted); font-size:.85rem; }
  .date { margin:4px 0; font-weight:700; }
  .hijri { font-weight:500; color:#3d4d33; }
  .count { font-size:1.35rem; margin:6px 0; color:var(--blue); }
  .count-past { color:var(--past); font-size:1.1rem; }
  .source { display:inline-block; margin-top:6px; font-size:.92rem; }
  .callout { background:#fff8e8; border:1px solid #f0e0b2; border-radius:12px; padding:10px 12px; }
  details { background:#fff; border:1px solid var(--line); border-radius:12px; padding:8px 12px; margin:8px 0; }
  summary { cursor:pointer; font-weight:700; }
  footer { padding:22px 0 36px; color:var(--muted); font-size:.9rem; }
  @media (min-width: 800px) {
    h1 { font-size:1.9rem; }
    .answers { grid-template-columns:1fr 1fr; }
    .cards { grid-template-columns:1fr 1fr; }
  }
</style>
</head>
<body>
<header><a class="brand" href="/">سبق</a><a href="/mawaeed">مواعيدك</a></header>
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
  }).replace("<h1>تعذر تحميل المواعيد</h1>", "<h1>تعذر تحميل المواعيد</h1><p class=\"callout\">حدّث الصفحة بعد قليل. لم نعرض قشرة فارغة حتى لا تُفهرس الصفحة بلا موعد.</p>");
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
