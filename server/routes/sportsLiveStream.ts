/**
 * بثّ SSE للنتائج والأحداث الحية — VARA + الويب (useSportsLiveStream).
 *
 * بدل استطلاع العميل كل 10–15 ثانية، يفتح اتصال `GET /api/sports/live-stream` واحدًا
 * ويستقبل «موجزًا» مضغوطًا لكل المباريات الجارية (رياضة + مونديال) فور تغيّره.
 * الخادم يبني الموجز مرة كل ثانيتين (نفس إيقاع liveActivityWorker، ومصادره مكاشة
 * SWR فلا ضغط إضافيًا على المزوّد) ويبثّه لكل المتصلين فقط عند الاختلاف.
 *
 * النتيجة داخل الموجز بطزاجة TheSports (MQTT ثم detail_live): getWorldLiveFixtures
 * تُطبّق الطبقة اللحظية، وعناصر المونديال تُركَّب عليها TheSports→SportMonks هنا.
 * `cs` = مرساة الساعة الموحّدة (matchClock) — نفس القيمة التي تدفعها Live Activity
 * عبر APNs، فيتطابق العدّاد داخل التطبيق مع شاشة القفل حرفيًّا.
 *
 * لا يستورد db (ADR-001). نمط الترويسات مطابق لسابقة editorPresence.ts.
 */
import type { Express, Request, Response } from "express";
import {
  getWorldLiveFixtures,
  isSaudiLeagueConfigured,
} from "../services/saudiLeagueService";
import { getLiveFixtures, isWorldCupConfigured, type WcFixture } from "../services/worldCupService";
import { getLiveScore, isSportmonksConfigured } from "../services/sportmonksService";
import { getTheSportsFastScore } from "../services/theSportsService";
import { clockStartEpochFor } from "../services/matchClock";

/** عنصر موجز مضغوط — مفاتيح قصيرة لتقليل حجم كل دفعة. */
interface LiveDigestItem {
  k: string; // "s:<id>" رياضة | "w:<id>" مونديال
  gh: number;
  ga: number;
  st: string; // status.code
  el: number | null;
  ex: number | null;
  liv: boolean;
  fin: boolean;
  /** مرساة الساعة الموحّدة (Unix ثوانٍ) — null والساعة متوقّفة. */
  cs: number | null;
}

const TICK_MS = 2_000;
const HEARTBEAT_MS = 20_000;
// سقف أمان للمقابس المفتوحة لكل نسخة — كانت المجموعة بلا حدّ، وGET معفى من كل
// محدّدات المعدل، فعاصفة إعادة اتصال تكدّس اتصالات معلّقة حتى ضغط الذاكرة/FD.
const MAX_CLIENTS = 2_000;

const clients = new Set<Response>();
let timer: ReturnType<typeof setInterval> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let lastPayload = "";
let building = false;
let version = 0;

/** تركيب النتيجة اللحظية على مباراة مونديال — TheSports أولًا ثم SportMonks (مطابق لـ worldCup.ts). */
async function overlayWc(fx: WcFixture): Promise<WcFixture> {
  if (fx.status.finished) return fx;
  try {
    const ts = await getTheSportsFastScore(fx.id, fx.timestamp);
    if (ts && (ts.live || ts.finished)) {
      return {
        ...fx,
        goals: { home: ts.home, away: ts.away },
        penalties:
          ts.penHome != null || ts.penAway != null
            ? { home: ts.penHome, away: ts.penAway }
            : fx.penalties,
        status: {
          ...fx.status,
          elapsed: ts.elapsed ?? fx.status.elapsed,
          extra: ts.extra ?? fx.status.extra,
          live: ts.live,
          finished: ts.finished || fx.status.finished,
        },
      };
    }
  } catch {
    /* تراجع لـSportMonks */
  }
  if (!isSportmonksConfigured()) return fx;
  try {
    const live = await getLiveScore(fx.id);
    if (!live) return fx;
    return {
      ...fx,
      goals: { home: live.home, away: live.away },
      status: {
        ...fx.status,
        elapsed: live.minute > 0 ? live.minute : fx.status.elapsed,
        live: live.live,
        finished: live.finished || fx.status.finished,
      },
    };
  } catch {
    return fx;
  }
}

async function buildDigest(): Promise<LiveDigestItem[]> {
  const items: LiveDigestItem[] = [];

  if (isSaudiLeagueConfigured()) {
    try {
      const world = await getWorldLiveFixtures();
      for (const f of world) {
        items.push({
          k: `s:${f.id}`,
          gh: f.goals?.home ?? 0,
          ga: f.goals?.away ?? 0,
          st: f.status?.code ?? "",
          el: f.status?.elapsed ?? null,
          ex: f.status?.extra ?? null,
          liv: Boolean(f.status?.live),
          fin: Boolean(f.status?.finished),
          cs: f.status ? (f.status.clockStartEpoch ?? clockStartEpochFor(f.id, f.status)) : null,
        });
      }
    } catch {
      /* أفضل جهد — دورة لاحقة تعوّض */
    }
  }

  if (isWorldCupConfigured()) {
    try {
      const base = await getLiveFixtures();
      const overlaid = await Promise.all((base ?? []).map(overlayWc));
      for (const f of overlaid) {
        items.push({
          k: `w:${f.id}`,
          gh: f.goals?.home ?? 0,
          ga: f.goals?.away ?? 0,
          st: f.status?.code ?? "",
          el: f.status?.elapsed ?? null,
          ex: f.status?.extra ?? null,
          liv: Boolean(f.status?.live),
          fin: Boolean(f.status?.finished),
          cs: f.status ? clockStartEpochFor(f.id, f.status) : null,
        });
      }
    } catch {
      /* أفضل جهد */
    }
  }

  items.sort((a, b) => (a.k < b.k ? -1 : 1));
  return items;
}

function broadcast(line: string): void {
  for (const res of clients) {
    try {
      res.write(line);
    } catch {
      clients.delete(res);
    }
  }
}

async function tick(): Promise<void> {
  if (building || clients.size === 0) return;
  building = true;
  try {
    const items = await buildDigest();
    const body = JSON.stringify(items);
    if (body !== lastPayload) {
      lastPayload = body;
      version += 1;
      broadcast(`event: digest\ndata: {"v":${version},"items":${body}}\n\n`);
    }
  } finally {
    building = false;
  }
}

function ensureLoops(): void {
  if (!timer) timer = setInterval(() => void tick(), TICK_MS);
  if (!heartbeat) heartbeat = setInterval(() => broadcast(`: hb\n\n`), HEARTBEAT_MS);
}

function stopLoopsIfIdle(): void {
  if (clients.size > 0) return;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  lastPayload = "";
}

export function registerSportsLiveStreamRoutes(app: Express): void {
  app.get("/api/sports/live-stream", (req: Request, res: Response) => {
    if (clients.size >= MAX_CLIENTS) {
      res.status(503).set("Retry-After", "15").json({ message: "الخدمة مشغولة، أعد المحاولة" });
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    clients.add(res);
    ensureLoops();

    // لقطة فورية للمتصل الجديد (إن كانت متوفرة) كي لا ينتظر أول تغيّر.
    if (lastPayload) {
      res.write(`event: digest\ndata: {"v":${version},"items":${lastPayload}}\n\n`);
    } else {
      res.write(`: connected\n\n`);
      void tick();
    }

    req.on("close", () => {
      clients.delete(res);
      stopLoopsIfIdle();
    });
  });
}
