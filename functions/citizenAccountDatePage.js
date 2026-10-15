/**
 * صفحة جواب دائمة: «موعد صرف حساب المواطن».
 * التواريخ من JSON مواعيدك فقط (/api/mawaeed/citizen-account). لا تواريخ مكتوبة هنا.
 * الأخبار من GET /api/keyword/حساب المواطن، وإن فشل الاستعلام تُحذف القائمة ولا تسقط الصفحة.
 */

export const CITIZEN_ACCOUNT_DATE_PATH = "/services/citizen-account-date";
const CANONICAL = `https://sabq.org${CITIZEN_ACCOUNT_DATE_PATH}`;
const KEYWORD = "حساب المواطن";
const H1 = "موعد صرف حساب المواطن";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&family=Tajawal:wght@700&display=swap";

export function isCitizenAccountDatePath(path) {
  return path === CITIZEN_ACCOUNT_DATE_PATH;
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

function blockOf(view) {
  const block = view && Array.isArray(view.series) ? view.series[0] : null;
  if (!block || block.slug !== "citizen-account") return null;
  return block;
}

function cardsOf(block) {
  return block && Array.isArray(block.upcoming) ? block.upcoming : [];
}

export function relatedArticlesFromPayload(payload) {
  const rows = payload && Array.isArray(payload.articles) ? payload.articles : [];
  const out = [];
  for (const row of rows) {
    const slug = String((row && (row.englishSlug || row.slug)) || "");
    const title = String((row && row.title) || "").trim();
    if (!title || !/^[A-Za-z0-9_-]+$/.test(slug)) continue;
    out.push({
      title,
      href: `/article/${slug}`,
      publishedAt: row.publishedAt || null,
    });
    if (out.length === 6) break;
  }
  return out;
}

function articleDateLabel(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function countdownSpan(card) {
  if (!card || card.isPast) return esc(card ? card.countdownText : "");
  return `<span data-countdown data-date="${esc(card.startsOn)}" data-today="${esc(card.todayLabel || "")}">${esc(card.countdownText)}</span>`;
}

/** نص الجواب بلا وسوم، للعنوان والوصف والمخطط. كل تاريخ حقل من البطاقة. */
export function leadText(view) {
  const block = blockOf(view);
  const next = block && block.next;
  if (!next) {
    const prev = block && block.previous;
    if (prev) {
      return `آخر موعد صرف منشور لحساب المواطن هو ${prev.gregorianLabel} الموافق ${prev.hijriLabel} (${prev.title})، وقد ${prev.pastLabel || "صُرفت"}. لا توجد دفعة قادمة معلنة حالياً.`;
    }
    return "لا توجد دفعة قادمة معلنة حالياً لصرف حساب المواطن في مواعيد سبق.";
  }
  const hint = next.expectedHint ? ` ${next.expectedHint}` : "";
  return `موعد صرف حساب المواطن القادم هو ${next.gregorianLabel} الموافق ${next.hijriLabel} (${next.title})، ${next.countdownText}، والموعد ${next.certaintyLabel}.${hint}`;
}

function pageTitle(view) {
  const next = blockOf(view) && blockOf(view).next;
  if (next && !next.isPast && next.gregorianLabel) return `موعد صرف حساب المواطن: ${next.gregorianLabel} | سبق`;
  return "موعد صرف حساب المواطن | سبق";
}

function leadHtml(view) {
  const block = blockOf(view);
  const next = block && block.next;
  if (!next) {
    const prev = block && block.previous;
    if (prev) {
      return `<p class="answer">آخر موعد صرف منشور لحساب المواطن هو ${esc(prev.gregorianLabel)} الموافق ${esc(prev.hijriLabel)} (${esc(prev.title)})، وقد ${esc(prev.pastLabel || "صُرفت")}. لا توجد دفعة قادمة معلنة حالياً.</p>`;
    }
    return `<p class="answer">لا توجد دفعة قادمة معلنة حالياً لصرف حساب المواطن في مواعيد سبق.</p>`;
  }
  const hint = next.expectedHint ? ` ${esc(next.expectedHint)}` : "";
  return `<p class="answer">موعد صرف حساب المواطن القادم هو ${esc(next.gregorianLabel)} الموافق ${esc(next.hijriLabel)} (${esc(next.title)})، ${countdownSpan(next)}، والموعد ${esc(next.certaintyLabel)}.${hint}</p>`;
}

function statusText(card) {
  if (card.isPast) return card.pastLabel || "صُرفت";
  if (card.isToday) return `${card.todayLabel || "تُصرف اليوم"} · ${card.certaintyLabel}`;
  return card.certaintyLabel;
}

function statusClass(card) {
  if (card.isPast) return "badge badge-neutral";
  if (card.certainty === "expected") return "badge badge-warn";
  return "badge badge-ok";
}

function tableHtml(view) {
  const cards = cardsOf(blockOf(view));
  if (cards.length === 0) {
    return `<section class="block" id="dates"><h2>مواعيد الصرف القادمة</h2><p>لا توجد مواعيد منشورة حالياً في مواعيد سبق.</p></section>`;
  }
  const nextId = blockOf(view).next && blockOf(view).next.id;
  const rows = cards
    .map((card) => {
      const count = card.isPast
        ? esc(card.pastLabel || "صُرفت")
        : countdownSpan(card);
      return `<tr class="${card.id === nextId ? "is-next" : ""}">
        <th scope="row" data-label="الدفعة">${esc(card.title)}</th>
        <td data-label="الميلادي">${esc(card.gregorianLabel)}</td>
        <td data-label="الهجري">${esc(card.hijriLabel)}</td>
        <td data-label="الحالة"><span class="${statusClass(card)}">${esc(statusText(card))}</span></td>
        <td data-label="المتبقي">${count}</td>
      </tr>`;
    })
    .join("");
  return `<section class="block" id="dates">
    <h2>مواعيد الصرف القادمة</h2>
    <div class="table-scroll">
      <table class="dates">
        <caption>مواعيد صرف حساب المواطن المنشورة في مواعيد سبق. «متوقع» محسوب من الجدول المعتاد، و«مؤكد» من إعلان الجهة.</caption>
        <thead>
          <tr>
            <th scope="col">الدفعة</th>
            <th scope="col">التاريخ الميلادي</th>
            <th scope="col">التاريخ الهجري</th>
            <th scope="col">الحالة</th>
            <th scope="col">المتبقي</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function findAnswer(faq, needle) {
  const item = (faq || []).find((row) => String(row.question || "").includes(needle));
  return item && item.answer ? String(item.answer) : "";
}

function sourceHtml(view) {
  const block = blockOf(view);
  const card = (block && (block.next || block.previous)) || cardsOf(block)[0] || null;
  if (!card || !card.sourceUrl) return "";
  return `<p class="source">المصدر: <a href="${esc(card.sourceUrl)}" rel="noopener noreferrer">${esc(card.sourceTitle || card.sourceUrl)}</a></p>`;
}

function explainHtml(view) {
  const block = blockOf(view);
  const summary = block && block.summary ? `<p>${esc(block.summary)}</p>` : "";
  const amount = findAnswer(view.faq, "مبلغ");
  const hour = findAnswer(view.faq, "ساعة");
  const amountHtml = amount ? `<p>مبلغ الاستحقاق يُعرف ${esc(amount)}</p>` : "";
  const hourHtml = hour ? `<p>${esc(hour)}</p>` : "";
  return `<section class="block" id="how">
    <h2>كيف يُصرف الدعم ومن يحدد الأهلية؟</h2>
    <p>هذه الصفحة تعرض مواعيد الصرف المنشورة في «مواعيدك» فقط، ولا تحسب شروط الأهلية أو مبلغ الدعم.</p>
    ${summary}
    ${amountHtml}
    ${hourHtml}
    ${sourceHtml(view)}
  </section>`;
}

function faqHtml(faq) {
  const items = (faq || []).filter((item) => item && item.question && item.answer);
  if (items.length === 0) return "";
  const body = items
    .map(
      (item) => `<div class="qa"><h3>${esc(item.question)}</h3><p>${esc(item.answer)}</p></div>`,
    )
    .join("");
  return `<section class="block" id="faq"><h2>أسئلة شائعة</h2>${body}</section>`;
}

function newsHtml(articles) {
  if (!articles || articles.length === 0) return "";
  const items = articles
    .map((article) => {
      const when = articleDateLabel(article.publishedAt);
      const time = when ? ` <time datetime="${esc(article.publishedAt)}">${esc(when)}</time>` : "";
      return `<li><a href="${esc(article.href)}">${esc(article.title)}</a>${time}</li>`;
    })
    .join("");
  return `<section class="block" id="news"><h2>آخر أخبار حساب المواطن في سبق</h2><ul class="news">${items}</ul></section>`;
}

function jsonLd(view, articles) {
  const description = leadText(view);
  const modified = view.dateModified;
  const schemaFaq = (view.faq || []).filter(
    (item) => item && item.inSchema && item.question && item.answer && !String(item.answer).includes("يُستكمل"),
  );
  const graph = [
    {
      "@type": "WebPage",
      "@id": `${CANONICAL}#webpage`,
      url: CANONICAL,
      name: H1,
      headline: H1,
      description,
      inLanguage: "ar",
      dateModified: modified,
      isPartOf: { "@type": "WebSite", name: "سبق", url: "https://sabq.org/" },
      breadcrumb: { "@id": `${CANONICAL}#breadcrumb` },
      ...(schemaFaq.length ? { mainEntity: { "@id": `${CANONICAL}#faq` } } : {}),
    },
    {
      "@type": "Article",
      "@id": `${CANONICAL}#article`,
      headline: H1,
      description,
      inLanguage: "ar",
      dateModified: modified,
      mainEntityOfPage: { "@id": `${CANONICAL}#webpage` },
      author: { "@type": "Organization", name: "سبق", url: "https://sabq.org/" },
      publisher: { "@type": "Organization", name: "سبق", url: "https://sabq.org/" },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${CANONICAL}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "سبق", item: "https://sabq.org/" },
        { "@type": "ListItem", position: 2, name: "مواعيدك", item: "https://sabq.org/mawaeed" },
        { "@type": "ListItem", position: 3, name: H1, item: CANONICAL },
      ],
    },
  ];
  if (schemaFaq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${CANONICAL}#faq`,
      mainEntity: schemaFaq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  }
  if (articles.length > 0) {
    graph.push({
      "@type": "ItemList",
      name: "آخر أخبار حساب المواطن في سبق",
      itemListElement: articles.map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: article.title,
        url: `https://sabq.org${article.href}`,
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function renderCitizenAccountDateHtml(view, options = {}) {
  const articles = Array.isArray(options.articles) ? options.articles : [];
  const indexable = options.indexable !== false;
  const title = esc(pageTitle(view));
  const description = esc(leadText(view));
  const robots = indexable ? "index, follow" : "noindex, nofollow";
  const modified = esc(view.dateModified || "");
  const modifiedLabel = esc(view.dateModifiedLabel || "");
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${CANONICAL}">
<meta name="robots" content="${robots}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${CANONICAL}">
<meta property="og:type" content="website">
<meta property="og:locale" content="ar_SA">
<meta property="og:image" content="https://sabq.org/branding/sabq-og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta property="article:modified_time" content="${modified}">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<script type="application/ld+json">${safeJson(jsonLd(view, articles))}</script>
<style>
  :root {
    color-scheme: light;
    --paper:#f3f5f8; --surface:#fff; --ink:#101a2b; --muted:#5d6877; --line:#e3e8ee;
    --accent:#0e7cb8; --accent-soft:#e6f3fb;
    --ok:#0d6b4d; --ok-soft:#e4f5ec;
    --warn:#8a5a00; --warn-soft:#fff2cf;
    --neutral:#5d6877; --neutral-soft:#edf0f4;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      color-scheme: dark;
      --paper:#0b1017; --surface:#141c26; --ink:#eaf0f6; --muted:#9aa8b6; --line:#253140;
      --accent:#5cc0f0; --accent-soft:#12303f;
      --ok:#6fd3aa; --ok-soft:#10322a;
      --warn:#e8bd6a; --warn-soft:#3a2f14;
      --neutral:#9aa8b6; --neutral-soft:#1d2732;
    }
  }
  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }
  body {
    margin:0; background:var(--paper); color:var(--ink); line-height:1.75;
    font-family:"IBM Plex Sans Arabic","Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;
  }
  a { color:var(--accent); }
  .wrap { width:min(820px, calc(100% - 32px)); margin-inline:auto; }
  .topbar { border-bottom:1px solid var(--line); background:var(--surface); }
  .topbar .wrap { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:52px; }
  .brand { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.3rem; color:var(--ink); text-decoration:none; }
  .crumbs { display:flex; flex-wrap:wrap; gap:6px; align-items:center; color:var(--muted); font-size:.85rem; margin:18px 0 8px; }
  .crumbs a { color:var(--muted); }
  h1 { font-family:Tajawal,sans-serif; font-weight:700; font-size:1.7rem; line-height:1.35; margin:0 0 12px; }
  .answer {
    margin:0; font-size:1.08rem; background:var(--surface); border:1px solid var(--line);
    border-inline-start:4px solid var(--warn); border-radius:16px; padding:14px 16px;
  }
  .updated { color:var(--muted); font-size:.85rem; margin:10px 0 0; }
  .block { margin-top:28px; }
  h2 { font-family:Tajawal,sans-serif; font-size:1.25rem; margin:0 0 10px; }
  h3 { font-size:1.02rem; margin:0 0 6px; }
  .block p { margin:0 0 10px; }
  .table-scroll { overflow-x:auto; }
  table.dates { width:100%; border-collapse:collapse; background:var(--surface); border-radius:16px; }
  caption { text-align:start; color:var(--muted); font-size:.85rem; margin-bottom:8px; }
  th, td { text-align:start; padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
  thead th { font-size:.82rem; color:var(--muted); }
  tr.is-next { background:var(--accent-soft); }
  .badge { display:inline-block; border-radius:999px; padding:1px 8px; font-size:.78rem; font-weight:700; }
  .badge-warn { background:var(--warn-soft); color:var(--warn); }
  .badge-ok { background:var(--ok-soft); color:var(--ok); }
  .badge-neutral { background:var(--neutral-soft); color:var(--neutral); }
  .qa { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:12px 14px; margin-top:8px; }
  .qa p { color:var(--muted); margin:0; }
  .news { list-style:none; margin:0; padding:0; }
  .news li { background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:10px 12px; margin-top:8px; }
  .news time { display:block; color:var(--muted); font-size:.8rem; }
  .source { font-size:.92rem; }
  footer { color:var(--muted); font-size:.82rem; margin:28px 0 40px; }
  @media (max-width:700px) {
    h1 { font-size:1.45rem; }
    table.dates thead { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
    table.dates, table.dates tbody, table.dates tr, table.dates th, table.dates td { display:block; width:100%; }
    table.dates tr { background:var(--surface); border:1px solid var(--line); border-radius:14px; margin-bottom:10px; padding:8px 0; }
    table.dates tr.is-next { background:var(--accent-soft); }
    table.dates th, table.dates td { border:0; display:flex; justify-content:space-between; gap:12px; padding:6px 12px; }
    table.dates td::before, table.dates th[scope="row"]::before { content:attr(data-label); color:var(--muted); font-weight:700; }
  }
</style>
</head>
<body>
<header class="topbar"><div class="wrap"><a class="brand" href="/">سبق</a><a href="/mawaeed">مواعيدك</a></div></header>
<main class="wrap">
<nav class="crumbs" aria-label="مسار التنقل"><a href="/">سبق</a><span aria-hidden="true">/</span><a href="/mawaeed">مواعيدك</a><span aria-hidden="true">/</span><span aria-current="page">${H1}</span></nav>
<h1>${H1}</h1>
${leadHtml(view)}
<p class="updated">آخر تحديث للبيانات: <time datetime="${modified}">${modifiedLabel}</time> بتوقيت السعودية.</p>
${tableHtml(view)}
${explainHtml(view)}
${faqHtml(view.faq)}
${newsHtml(articles)}
<p class="more"><a href="/mawaeed/citizen-account">عدّاد حساب المواطن في مواعيدك</a></p>
</main>
<footer class="wrap"><p>التاريخ الميلادي كما كتبه المحرر في مواعيدك. الهجري بتقويم أم القرى. ما لم يصدر إعلانه يبقى «متوقع».</p></footer>
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
  function phrase(days, hours) {
    if (days <= 0 && hours <= 0) return "";
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
    return { days: Math.floor(mins / 1440), hours: Math.floor(mins / 60) % 24 };
  }
  function tick() {
    var nodes = document.querySelectorAll("[data-countdown]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var remain = left(el.getAttribute("data-date"));
      if (!remain) continue;
      el.textContent = remain.done ? (el.getAttribute("data-today") || "تُصرف اليوم") : phrase(remain.days, remain.hours);
    }
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
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>موعد صرف حساب المواطن | سبق</title><meta name="robots" content="noindex, nofollow"></head><body><h1>تعذر تحميل موعد الصرف</h1><p>حدّث الصفحة بعد قليل. لم نعرض موعداً حتى لا يُفهرس تاريخ غير محمّل.</p><p><a href="/mawaeed">العودة إلى مواعيدك</a></p></body></html>`;
}

function originGuard(env) {
  const configuredOrigin = String(env.API_ORIGIN || "").trim().replace(/\/+$/, "");
  const staging = String(env.STAGING_NO_INDEX || "").toLowerCase() === "true";
  if (staging && !configuredOrigin) {
    return { error: new Response("Staging API origin is not configured.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
    }) };
  }
  let host = "";
  try { host = configuredOrigin ? new URL(configuredOrigin).hostname : ""; } catch (_) { host = ""; }
  if (staging && ["api.sabq.org", "sabqorg-production.up.railway.app"].includes(host)) {
    return { error: new Response("Production API origin is forbidden in staging.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
    }) };
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

export async function serveCitizenAccountDatePage({ request, url, env, waitUntil, signProxyRequest }) {
  const indexableHost = url.hostname === "sabq.org";
  const commit = env.CF_PAGES_COMMIT_SHA || env.CF_PAGES_BUILD_ID || "";
  const cacheable = indexableHost && Boolean(commit) && request.method === "GET";
  const keyUrl = new URL(url.origin + CITIZEN_ACCOUNT_DATE_PATH);
  keyUrl.searchParams.set("__b", commit || "dev");
  keyUrl.searchParams.set("__v", "citizen-account-date");
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

  const guarded = originGuard(env || {});
  if (guarded.error) return guarded.error;
  const datesEndpoint = `${guarded.origin}/api/mawaeed/citizen-account`;
  const newsEndpoint = `${guarded.origin}/api/keyword/${encodeURIComponent(KEYWORD)}`;

  let dates = null;
  let status = 0;
  try {
    const result = await fetchJson(datesEndpoint, request, env, signProxyRequest);
    status = result.status;
    dates = result.payload;
  } catch (error) {
    console.error("[citizen-account-date] origin", error);
    status = 0;
  }

  if (status === 404) {
    const missing = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>الصفحة غير موجودة | سبق</title><meta name="robots" content="noindex"></head><body><p>صفحة موعد الصرف غير متاحة. <a href="/mawaeed">العودة إلى مواعيدك</a></p></body></html>`;
    return htmlResponse(missing, { status: 404, cacheable: false, robots: "noindex, follow" });
  }
  if (!dates || !dates.page || dates.page.slug !== "citizen-account" || !dates.dateModified || !blockOf(dates)) {
    return htmlResponse(failureHtml(), { status: 503, cacheable: false, robots: "noindex, nofollow" });
  }

  let articles = [];
  try {
    const news = await fetchJson(newsEndpoint, request, env, signProxyRequest);
    if (news.payload) articles = relatedArticlesFromPayload(news.payload);
  } catch (error) {
    console.error("[citizen-account-date] keyword", error);
  }

  const html = renderCitizenAccountDateHtml(dates, { articles, indexable: indexableHost });
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
