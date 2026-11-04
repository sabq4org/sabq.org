
const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json;charset=utf-8", "cache-control": "no-store", ...extra } });

/* ---------- Data adapters (pluggable) ----------
   nyt-preview : INTERNAL PREVIEW ONLY. AP numbers as republished in NYT public JSON. NOT licensed for production.
   ap          : placeholder for licensed AP Elections API (needs AP_API_KEY).
   sample      : clearly labelled demo data.                                                    */
const NYT = o => `https://static01.nyt.com/elections-assets/pages/data/2026-11-03/results-${o}.json`;
const pty = p => p === "DEM" ? "D" : p === "GOP" ? "R" : "I";

function normRace(r, officeKey) {
  const tru = r.top_reporting_unit || {}; const meta = r.candidate_metadata || {};
  const won = r.outcome?.won || [];
  const cands = (tru.candidates || []).map(c => {
    const m = meta[c.nyt_id] || {};
    return { id: c.nyt_id, n: [m.first_name, m.last_name].filter(Boolean).join(" "), p: pty(m.party?.nyt_id || m.party_caucus), inc: !!m.incumbent,
      v: c.votes?.total || 0, w: won.includes(c.nyt_id), l: !!c.leader };
  });
  const tot = cands.reduce((a, c) => a + c.v, 0);
  cands.forEach(c => c.pct = tot ? +(100 * c.v / tot).toFixed(1) : 0);
  cands.sort((a, b) => b.v - a.v || (b.w - a.w));
  const wc = cands.find(c => c.w);
  const dm = (r.seat || "").match(/District (\d+)/);
  return { id: r.nyt_id, o: officeKey, st: tru.state_postal, sn: tru.name, dist: dm ? +dm[1] : (r.seat === "At-Large" ? 0 : null),
    status: r.race_call_status, winner: wc ? wc.p : null, flip: r.outcome?.gained === true,
    calledBy: r.outcome?.called_by || [], calledAt: (r.outcome?.winner_accepted_at || [])[0] || null,
    rating: r.rating, eevp: tru.eevp ?? null, votes: tot, upd: tru.provider_updated_at || r.updated_at, c: cands.slice(0, 6) };
}
function normBalance(d, k) {
  const o = d.partyControlData?.results?.[0]?.offices?.[k]; if (!o) return null;
  const b = o.party_balance || {}; const g = p => ({ seats: b[p]?.seats || 0, noElection: b[p]?.no_election || 0, flips: b[p]?.flip_count || 0, winner: !!b[p]?.winner });
  return { total: o.total, toWin: o.to_win, called: o.num_races_called, up: o.open_seats, D: g("DEM"), R: g("GOP"), I: g("OTH") };
}
async function nytAdapter() {
  const offices = { senate: "S", house: "H", governor: "G" };
  const out = { source: "nyt-preview", sourceLabel: "AP عبر ملفات NYT العامة — معاينة داخلية فقط", demo: false, fetchedAt: new Date().toISOString(), offices: {} };
  await Promise.all(Object.entries(offices).map(async ([name, k]) => {
    const r = await fetch(NYT(name), { cf: { cacheTtl: 60 }, headers: { "user-agent": "sabq-elections-preview/0.1 (internal)" } });
    if (!r.ok) throw new Error(name + " " + r.status);
    const d = await r.json();
    out.offices[name] = { balance: normBalance(d, k), races: (d.races || []).filter(x => x.top_reporting_unit?.level !== "national").map(x => normRace(x, name)) };
  }));
  return out;
}
const CACHE_KEY = "https://cache.internal/sabq-elections/results-v1";
async function results(env, ctx) {
  const cache = caches.default;
  const hit = await cache.match(CACHE_KEY);
  if (hit) { const h = new Response(hit.body, hit); h.headers.set("x-cache", "HIT"); h.headers.set("cache-control", "private, max-age=240"); return h; }
  let data;
  try {
    if (env.DATA_SOURCE !== "nyt-preview") throw new Error("source " + env.DATA_SOURCE + " not configured");
    data = await nytAdapter();
  } catch (e) {
    data = { source: "sample", sourceLabel: "بيانات تجريبية", demo: true, error: String(e.message || e), fetchedAt: new Date().toISOString(), offices: {} };
  }
  const resp = json(data, 200, { "cache-control": "public, max-age=270" });
  ctx.waitUntil(cache.put(CACHE_KEY, resp.clone()));
  const r = new Response(resp.body, resp); r.headers.set("x-cache", "MISS"); r.headers.set("cache-control", "private, max-age=240"); return r;
}

const NOINDEX = "noindex, nofollow";
function withRobots(r) { const n = new Response(r.body, r); n.headers.set("x-robots-tag", NOINDEX); return n; }
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain;charset=utf-8", "cache-control": "public, max-age=3600", "x-robots-tag": NOINDEX } });
    if (url.pathname === "/login" || url.pathname === "/logout") return withRobots(new Response(null, { status: 303, headers: { location: "/" } }));
    if (url.pathname === "/api/results") {
      const origin = req.headers.get("origin") || "";
      const ok = /^https:\/\/([a-z0-9-]+\.)*sabq\.org$/.test(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin);
      const cors = ok ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, OPTIONS", "vary": "Origin", "access-control-max-age": "86400" } : { "vary": "Origin" };
      if (req.method === "OPTIONS") return withRobots(new Response(null, { status: 204, headers: cors }));
      const r = withRobots(await results(env, ctx)); for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r;
    }
    const r = await env.ASSETS.fetch(req);
    const n = withRobots(r); n.headers.set("cache-control", url.pathname.startsWith("/vendor/") || url.pathname.startsWith("/fonts/") ? "public, max-age=86400" : "public, max-age=60");
    return n;
  },
};
