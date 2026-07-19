#!/usr/bin/env node
// قياس فارق سرعة النتيجة اللحظية: TheSports (مباشر) ضد API سبق الحالي (SportMonks).
//
// يربط مباراةً من جدولنا بمباراة TheSports عبر بطولة المونديال + وقت البداية،
// ثم يسحب المصدرين كل بضع ثوانٍ ويطبع سطرًا فور تغيّر النتيجة في أيٍّ منهما —
// فترى بعينك كم ثانية يسبق TheSports ظهورَ الهدف على API الحالي (وهو نفس مصدر
// شاشة قفل المتابعة). يجيب عمليًا: «كم أسرع TheSports قبل الاشتراك الفعلي؟»
//
// الاستخدام (مباراة الليلة الأرجنتين × النمسا، 20:00 الرياض):
//   THESPORTS_USER=sabqme THESPORTS_SECRET=xxxx node scripts/thesports-live-latency.mjs الأرجنتين النمسا
// خيارات:
//   الوسيط 1 (+2 اختياري): جزء من اسم الفريق (عربي) في جدولنا. اسمان يحسمان
//     المباراة عند تعدّد مباريات الفريق. يُختار الحيّ/القادم الأقرب لو اسم واحد.
//   API_BASE: قاعدة API سبق (افتراضي https://api.sabq.org)
//   POLL_MS:  إيقاع السحب (افتراضي 4000)
//
// ملاحظة: يعمل فقط من عنوان IP مُدرَج في قائمة TheSports المسموح بها.

const TS_BASE = "https://api.thesports.com/v1/football";
const WC = "kp3glrw7hwqdyjv"; // بطولة المونديال في TheSports (مُتحقَّق)
const API_BASE = process.env.API_BASE || "https://api.sabq.org";
const POLL_MS = Number(process.env.POLL_MS || 4000);
const TEAM_A = (process.argv[2] || "الأرجنتين").toLowerCase();
const TEAM_B = (process.argv[3] || "").toLowerCase();

const USER = (process.env.THESPORTS_USER || "").trim();
const SECRET = (process.env.THESPORTS_SECRET || "").trim();
if (!USER || !SECRET) {
  console.error("✗ اضبط THESPORTS_USER و THESPORTS_SECRET في البيئة قبل التشغيل.");
  process.exit(1);
}

const now = () => new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Riyadh" });
const TS_LIVE = new Set([2, 3, 4, 5, 6, 7]);

async function tsGet(path, params = {}) {
  const url = new URL(`${TS_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("user", USER);
  url.searchParams.set("secret", SECRET);
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const j = await r.json();
  if (j && j.err) throw new Error(`TheSports: ${j.err}`);
  return j;
}

function dateKeys(ts) {
  const k = (off) => {
    const d = new Date((ts + off * 3600) * 1000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;
  };
  return [...new Set([k(8), k(0), k(32), k(-16)])];
}

// جلب مباراتنا (المعرّف + الوقت + الأسماء) من جدول المونديال.
// مع اسمين: المباراة التي يظهر فيها الاثنان. مع اسم واحد: الحيّة أو القادمة
// الأقرب (الفريق قد يلعب عدّة مباريات — لا نلتقط منتهيةً قديمة).
async function ourFixture() {
  const r = await fetch(`${API_BASE}/api/world-cup/fixtures`, { signal: AbortSignal.timeout(15000) });
  const d = await r.json();
  const list = Array.isArray(d?.fixtures) ? d.fixtures : Array.isArray(d) ? d : [];
  const has = (f, t) =>
    (f.home?.name || "").toLowerCase().includes(t) || (f.away?.name || "").toLowerCase().includes(t);

  let cands;
  if (TEAM_B) {
    cands = list.filter((f) => has(f, TEAM_A) && has(f, TEAM_B));
  } else {
    cands = list.filter((f) => has(f, TEAM_A));
  }
  if (cands.length === 0) throw new Error(`لم أجد مباراة تطابق "${TEAM_A}${TEAM_B ? " × " + TEAM_B : ""}"`);

  // الأفضلية: مباراة حيّة → أقرب قادمة → أحدث منتهية
  const live = cands.find((f) => f.status?.live);
  if (live) return live;
  const nowTs = Date.now() / 1000;
  const upcoming = cands
    .filter((f) => !f.status?.finished && f.timestamp >= nowTs - 7200)
    .sort((a, b) => a.timestamp - b.timestamp)[0];
  if (upcoming) return upcoming;
  return cands.sort((a, b) => b.timestamp - a.timestamp)[0];
}

// ربط معرّف TheSports عبر بطولة + وقت بداية
async function resolveTs(kickoffTs) {
  for (const key of dateKeys(kickoffTs)) {
    const res = (await tsGet("match/diary", { date: key })).results || [];
    const hit = res.find(
      (m) => m.competition_id === WC && Math.abs((m.match_time || 0) - kickoffTs) <= 120
    );
    if (hit?.id) return hit.id;
  }
  return null;
}

async function tsScore(matchId) {
  const res = (await tsGet("match/detail_live")).results || [];
  const m = res.find((x) => x.id === matchId);
  if (!m || !Array.isArray(m.score)) return null;
  const s = m.score;
  return { home: Number(s[2]?.[0]) || 0, away: Number(s[3]?.[0]) || 0, status: Number(s[1]) };
}

async function apiScore(fixtureId) {
  const r = await fetch(`${API_BASE}/api/world-cup/match/${fixtureId}?_nc=${Date.now()}`, {
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json();
  const f = d?.fixture;
  if (!f) return null;
  return { home: f.goals?.home ?? 0, away: f.goals?.away ?? 0, status: f.status?.code };
}

const main = async () => {
  const fx = await ourFixture();
  console.log(
    `المباراة: ${fx.home?.name} × ${fx.away?.name} | البداية ${new Date(
      fx.timestamp * 1000
    ).toLocaleString("en-GB", { timeZone: "Asia/Riyadh" })} | حالتنا: ${fx.status?.code}`
  );
  const tsId = await resolveTs(fx.timestamp);
  if (!tsId) {
    console.error("✗ تعذّر ربط المباراة في TheSports (وقت/بطولة).");
    process.exit(1);
  }
  console.log(`✓ مربوطة بـTheSports: ${tsId}\n— أراقب المصدرين كل ${POLL_MS / 1000}ث (Ctrl+C للإيقاف) —\n`);

  let lastTs = "",
    lastApi = "";
  const tsSeen = new Map(); // "h-a" → وقت أول ظهور في TheSports (لقياس الفارق)

  for (;;) {
    const [ts, api] = await Promise.all([
      tsScore(tsId).catch(() => null),
      apiScore(fx.id).catch(() => null),
    ]);

    if (ts) {
      const key = `${ts.home}-${ts.away}`;
      if (key !== lastTs) {
        lastTs = key;
        if (!tsSeen.has(key)) tsSeen.set(key, Date.now());
        const live = TS_LIVE.has(ts.status) ? "▶" : ts.status === 8 ? "✓انتهت" : "⏸";
        console.log(`[${now()}] ⚡ TheSports: ${ts.home}-${ts.away}  ${live}`);
      }
    }
    if (api) {
      const key = `${api.home}-${api.away}`;
      if (key !== lastApi) {
        lastApi = key;
        const seen = tsSeen.get(key);
        const lag = seen ? `  ← متأخّر ${Math.round((Date.now() - seen) / 1000)}ث عن TheSports` : "";
        console.log(`[${now()}] 🐢 سبق-API:  ${api.home}-${api.away}  (${api.status})${lag}`);
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
};

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
