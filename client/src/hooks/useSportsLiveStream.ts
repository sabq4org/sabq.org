/**
 * بث النتائج الحية للويب — نفس موجز VARA (`GET /api/sports/live-stream`).
 *
 * يفتح EventSource واحدًا مشتركًا (مرجع العدّ) ويحقن النتيجة/الدقيقة فورًا في
 * كاش React Query لصفحات الرياضة والمونديال، فلا ننتظر استطلاع 7–15ث.
 *
 * على sabq.org يتصل مباشرة بـ api.sabq.org لتفادي تخزين مؤقت لـSSE عبر
 * وكيل Cloudflare Pages. الاستطلاع الدوري يبقى شبكة أمان عند انقطاع البث.
 */
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/queryClient";

export type SportsLiveDigestItem = {
  k: string;
  gh: number;
  ga: number;
  st: string;
  el: number | null;
  ex: number | null;
  liv: boolean;
  fin: boolean;
  cs: number | null;
};

type LiveStatusPatch = {
  code?: string;
  label?: string;
  elapsed: number | null;
  extra: number | null;
  live: boolean;
  finished: boolean;
  clockStartEpoch?: number | null;
};

type LiveFixtureLike = {
  id: number;
  goals?: { home: number | null; away: number | null };
  status?: LiveStatusPatch & Record<string, unknown>;
};

let sharedSource: EventSource | null = null;
let refCount = 0;
let applyToClient: ((items: SportsLiveDigestItem[]) => void) | null = null;

function liveStreamUrl(): string {
  const fromEnv = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
  if (fromEnv) return `${fromEnv}/api/sports/live-stream`;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // الإنتاج عبر Pages: الوكيل قد يخزّن/يُبطئ SSE — اتصال مباشر بالأصل.
    if (host === "sabq.org" || host === "www.sabq.org" || host.endsWith(".pages.dev")) {
      return "https://api.sabq.org/api/sports/live-stream";
    }
  }
  return apiUrl("/api/sports/live-stream");
}

function patchFixture<T extends LiveFixtureLike>(fx: T, item: SportsLiveDigestItem): T {
  const prev = fx.status ?? ({} as LiveStatusPatch);
  return {
    ...fx,
    goals: { home: item.gh, away: item.ga },
    status: {
      ...prev,
      code: item.st || prev.code || "",
      elapsed: item.el,
      extra: item.ex,
      live: item.liv,
      finished: item.fin,
      clockStartEpoch: item.cs,
    },
  };
}

function mapByPrefix(items: SportsLiveDigestItem[], prefix: "s:" | "w:"): Map<number, SportsLiveDigestItem> {
  const map = new Map<number, SportsLiveDigestItem>();
  for (const item of items) {
    if (!item.k.startsWith(prefix)) continue;
    const id = Number(item.k.slice(2));
    if (Number.isFinite(id)) map.set(id, item);
  }
  return map;
}

function patchList<T extends LiveFixtureLike>(
  list: T[] | null | undefined,
  byId: Map<number, SportsLiveDigestItem>,
): T[] | null | undefined {
  if (!Array.isArray(list) || byId.size === 0) return list;
  let changed = false;
  const next = list.map((fx) => {
    const item = byId.get(fx.id);
    if (!item) return fx;
    const gh = fx.goals?.home ?? null;
    const ga = fx.goals?.away ?? null;
    const st = fx.status;
    if (
      gh === item.gh &&
      ga === item.ga &&
      (st?.elapsed ?? null) === item.el &&
      (st?.extra ?? null) === item.ex &&
      Boolean(st?.live) === item.liv &&
      Boolean(st?.finished) === item.fin &&
      (st?.code ?? "") === (item.st || st?.code || "")
    ) {
      return fx;
    }
    changed = true;
    return patchFixture(fx, item);
  });
  return changed ? next : list;
}

/** يحقن الموجز في كاشات القوائم/التفاصيل الرياضية المعروفة. */
export function applySportsLiveDigest(qc: QueryClient, items: SportsLiveDigestItem[]): void {
  if (!Array.isArray(items) || items.length === 0) return;
  const sports = mapByPrefix(items, "s:");
  const wc = mapByPrefix(items, "w:");

  if (sports.size > 0) {
    qc.setQueriesData<{ matches?: LiveFixtureLike[] }>({ queryKey: ["/api/sports/world-live"] }, (old) => {
      if (!old) return old;
      const matches = patchList(old.matches, sports);
      return matches === old.matches ? old : { ...old, matches: matches ?? [] };
    });
    qc.setQueriesData<{ live?: LiveFixtureLike[] }>({ queryKey: ["/api/sports/live"] }, (old) => {
      if (!old) return old;
      const live = patchList(old.live, sports);
      return live === old.live ? old : { ...old, live: live ?? [] };
    });
    qc.setQueriesData<{ today?: LiveFixtureLike[] }>({ queryKey: ["/api/sports/today"] }, (old) => {
      if (!old) return old;
      const today = patchList(old.today, sports);
      return today === old.today ? old : { ...old, today: today ?? [] };
    });
    // قوائم بطولة: /api/sports/:slug/matches — { live, today, upcoming, results }
    qc.setQueriesData<{
      live?: LiveFixtureLike[];
      today?: LiveFixtureLike[];
      upcoming?: LiveFixtureLike[];
      results?: LiveFixtureLike[];
    }>(
      {
        predicate: (q) => {
          const key = q.queryKey[0];
          return typeof key === "string" && /^\/api\/sports\/[^/]+\/matches$/.test(key);
        },
      },
      (old) => {
        if (!old) return old;
        const live = patchList(old.live, sports);
        const today = patchList(old.today, sports);
        const upcoming = patchList(old.upcoming, sports);
        const results = patchList(old.results, sports);
        if (
          live === old.live &&
          today === old.today &&
          upcoming === old.upcoming &&
          results === old.results
        ) {
          return old;
        }
        return {
          ...old,
          live: live ?? old.live,
          today: today ?? old.today,
          upcoming: upcoming ?? old.upcoming,
          results: results ?? old.results,
        };
      },
    );
    qc.setQueriesData<{
      live?: LiveFixtureLike[];
      today?: LiveFixtureLike[];
      nextMatch?: LiveFixtureLike | null;
    }>({ queryKey: ["/api/rsl/hero"] }, (old) => {
      if (!old) return old;
      const live = patchList(old.live, sports);
      const today = patchList(old.today, sports);
      const nextMatch = old.nextMatch
        ? (() => {
            const item = sports.get(old.nextMatch!.id);
            return item ? patchFixture(old.nextMatch!, item) : old.nextMatch;
          })()
        : old.nextMatch;
      if (live === old.live && today === old.today && nextMatch === old.nextMatch) return old;
      return { ...old, live: live ?? old.live, today: today ?? old.today, nextMatch };
    });
    // تفاصيل مركز المباراة: `/api/sports/match/:id`
    for (const [id, item] of sports) {
      qc.setQueriesData<{ fixture?: LiveFixtureLike }>(
        { queryKey: [`/api/sports/match/${id}`] },
        (old) => {
          if (!old?.fixture) return old;
          const fixture = patchFixture(old.fixture, item);
          return fixture === old.fixture ? old : { ...old, fixture };
        },
      );
    }
  }

  if (wc.size > 0) {
    qc.setQueriesData<{ fixtures?: LiveFixtureLike[] }>({ queryKey: ["/api/world-cup/fixtures"] }, (old) => {
      if (!old) return old;
      const fixtures = patchList(old.fixtures, wc);
      return fixtures === old.fixtures ? old : { ...old, fixtures: fixtures ?? [] };
    });
    qc.setQueriesData<{
      live?: LiveFixtureLike[];
      today?: LiveFixtureLike[];
      matchOfTheDay?: { fixture?: LiveFixtureLike } | null;
      saudi?: { fixtures?: LiveFixtureLike[]; next?: LiveFixtureLike | null };
    }>({ queryKey: ["/api/world-cup/overview"] }, (old) => {
      if (!old) return old;
      const live = patchList(old.live, wc);
      const today = patchList(old.today, wc);
      const motdFx = old.matchOfTheDay?.fixture
        ? (() => {
            const item = wc.get(old.matchOfTheDay!.fixture!.id);
            return item ? patchFixture(old.matchOfTheDay!.fixture!, item) : old.matchOfTheDay!.fixture;
          })()
        : old.matchOfTheDay?.fixture;
      const saudiFixtures = patchList(old.saudi?.fixtures, wc);
      const saudiNext = old.saudi?.next
        ? (() => {
            const item = wc.get(old.saudi!.next!.id);
            return item ? patchFixture(old.saudi!.next!, item) : old.saudi!.next;
          })()
        : old.saudi?.next;
      if (
        live === old.live &&
        today === old.today &&
        motdFx === old.matchOfTheDay?.fixture &&
        saudiFixtures === old.saudi?.fixtures &&
        saudiNext === old.saudi?.next
      ) {
        return old;
      }
      return {
        ...old,
        live: live ?? old.live,
        today: today ?? old.today,
        matchOfTheDay: old.matchOfTheDay
          ? { ...old.matchOfTheDay, fixture: motdFx }
          : old.matchOfTheDay,
        saudi: old.saudi
          ? { ...old.saudi, fixtures: saudiFixtures ?? old.saudi.fixtures, next: saudiNext }
          : old.saudi,
      };
    });
    for (const [id, item] of wc) {
      qc.setQueriesData<{ fixture?: LiveFixtureLike }>(
        { queryKey: [`/api/world-cup/match/${id}`] },
        (old) => {
          if (!old?.fixture) return old;
          const fixture = patchFixture(old.fixture, item);
          return fixture === old.fixture ? old : { ...old, fixture };
        },
      );
    }
  }
}

function ensureSharedSource(): void {
  if (sharedSource) return;
  const url = liveStreamUrl();
  const es = new EventSource(url);
  sharedSource = es;
  es.addEventListener("digest", (ev) => {
    try {
      const msg = JSON.parse(String((ev as MessageEvent).data)) as {
        items?: SportsLiveDigestItem[];
      };
      if (Array.isArray(msg.items) && applyToClient) applyToClient(msg.items);
    } catch {
      /* تجاهل دفعة تالفة */
    }
  });
  es.onerror = () => {
    // EventSource يعيد الاتصال ذاتيًا؛ لا نغلق هنا.
  };
}

function releaseSharedSource(): void {
  if (refCount > 0) return;
  sharedSource?.close();
  sharedSource = null;
  applyToClient = null;
}

/**
 * يشترك في موجز النتائج الحية ويحدّث كاش React Query.
 * @param enabled عطّله خارج صفحات الرياضة الحية لتوفير الاتصالات.
 */
export function useSportsLiveStream(enabled = true): void {
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    if (!enabled) return;
    applyToClient = (items) => applySportsLiveDigest(qcRef.current, items);
    refCount += 1;
    ensureSharedSource();
    return () => {
      refCount = Math.max(0, refCount - 1);
      releaseSharedSource();
    };
  }, [enabled]);
}
