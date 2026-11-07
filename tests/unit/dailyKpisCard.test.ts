import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({
  captured: [] as Array<Record<string, unknown>>,
  failOpens: false,
  poolQuery: vi.fn(),
}));

vi.mock('../../server/db', () => {
  const makeChain = (fields: Record<string, unknown>) => {
    mocks.captured.push(fields);
    const isOpens = Object.values(fields).some((v) => {
      try {
        return new PgDialect().sqlToQuery(v as SQL).sql.includes('article_open_buckets');
      } catch {
        return false;
      }
    });
    const row = Object.fromEntries(Object.keys(fields).map((k) => [k, k === 'hour' ? '09:00' : 7]));
    const result =
      isOpens && mocks.failOpens
        ? Promise.reject(Object.assign(new Error('relation "article_open_buckets" does not exist'), { code: '42P01' }))
        : Promise.resolve([row]);
    result.catch(() => {});
    const chain: any = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'then') return result.then.bind(result);
          if (prop === 'catch') return result.catch.bind(result);
          return () => chain;
        },
      },
    );
    return chain;
  };
  return {
    db: { select: (fields: Record<string, unknown>) => makeChain(fields) },
    pool: {
      connect: async () => ({ query: mocks.poolQuery, release: () => {} }),
    },
  };
});

import { swrCache } from '../../server/memoryCache';
import { getDashboardPulseStats } from '../../server/services/dashboardPulseService';
import {
  flushArticleOpenBuckets,
  openBucketStart,
  peekPendingOpens,
  recordArticleOpens,
} from '../../server/services/articleOpenBuckets';
import { formatReadDuration, kpiComparison } from '../../client/src/lib/dailyKpiFormat';

const dialect = new PgDialect();
const sqlOf = (value: unknown) => dialect.sqlToQuery(value as SQL);

beforeEach(() => {
  mocks.captured.length = 0;
  mocks.failOpens = false;
  mocks.poolQuery.mockReset();
  swrCache.invalidatePattern('^admin:dashboard:pulse$');
});

describe('daily KPI card: pulse windows', () => {
  it('serves every today/yesterday value from the pulse, all on the Riyadh day', async () => {
    vi.useFakeTimers();
    // 09:06 Riyadh = 06:06Z → Riyadh day starts 21:00Z the previous day (not 00:00Z).
    vi.setSystemTime(new Date('2026-11-07T06:06:00Z'));
    const stats = await getDashboardPulseStats();
    vi.useRealTimers();

    for (const key of ['readsToday', 'todayCount', 'today']) {
      const fields = mocks.captured.find((f) => key in f)!;
      expect(fields, key).toBeDefined();
      const params = sqlOf(fields[key]).params.map((p) => (p instanceof Date ? p.toISOString() : String(p)));
      expect(params.some((p) => p.startsWith('2026-11-06T21:00:00'))).toBe(true);
      expect(params.some((p) => p.startsWith('2026-11-07T00:00:00'))).toBe(false);
    }

    expect(stats.articles.viewsSource).toBe('opens');
    expect(stats.articles.viewsToday).toBe(7);
    expect(stats.users.activeToday).toBe(7);
    expect(stats.engagement).toMatchObject({ readsToday: 7, readsYesterday: 7, averageTimeOnSite: 7 });
    expect(stats.reactions).toMatchObject({ todayCount: 7, yesterdayCount: 7 });

    // 06:06Z: current bucket 06:00Z is 60% done → yesterday adds 60% of its 06:00Z bucket.
    const yesterday = sqlOf(mocks.captured.find((f) => 'yesterday' in f && 'today' in f)!.yesterday);
    const yParams = yesterday.params.map((p) => (p instanceof Date ? p.toISOString() : String(p)));
    expect(yParams.filter((p) => p.startsWith('2026-11-06T06:00:00'))).toHaveLength(2);
    expect(yParams).toContain('0.6');

    const avg = sqlOf(mocks.captured.find((f) => 'avgDurationToday' in f)!.avgDurationToday).sql;
    expect(avg).toContain('between 1 and 3600');
  });

  it('falls back to the old member-only views when the opens table is missing', async () => {
    mocks.failOpens = true;
    const stats = await getDashboardPulseStats();
    expect(stats.articles.viewsSource).toBe('legacy');
    expect(stats.articles.viewsToday).toBe(7);
    expect(stats.hourlyViews[0]?.hour).toBe('09:00');
  });
});

describe('real opens buffer', () => {
  it('buckets opens by 10 minutes with no boost and upserts once per bucket', async () => {
    const t = Date.parse('2026-11-07T06:06:30Z');
    recordArticleOpens(1, t);
    recordArticleOpens(1, t + 60_000);
    recordArticleOpens(0, t);
    recordArticleOpens(3, Date.parse('2026-11-07T06:12:00Z'));
    expect(peekPendingOpens()).toEqual([
      [openBucketStart(t), 2],
      [Date.parse('2026-11-07T06:10:00Z'), 3],
    ]);
    expect(new Date(openBucketStart(t)).toISOString()).toBe('2026-11-07T06:00:00.000Z');

    mocks.poolQuery.mockResolvedValue({ rows: [] });
    await flushArticleOpenBuckets();
    const insert = mocks.poolQuery.mock.calls.find(([q]) => String(q).includes('article_open_buckets'))!;
    expect(insert[1]).toEqual(['2026-11-07T06:00:00.000Z', 2, '2026-11-07T06:10:00.000Z', 3]);
    expect(peekPendingOpens()).toEqual([]);
  });

  it('drops opens quietly while the table does not exist, and requeues other failures', async () => {
    mocks.poolQuery.mockImplementation(async (q: string) => {
      if (q.includes('article_open_buckets')) throw Object.assign(new Error('missing'), { code: '42P01' });
      return { rows: [] };
    });
    recordArticleOpens(1, Date.parse('2026-11-07T06:00:00Z'));
    await flushArticleOpenBuckets();
    expect(peekPendingOpens()).toEqual([]);

    mocks.poolQuery.mockImplementation(async (q: string) => {
      if (q.includes('article_open_buckets')) throw Object.assign(new Error('timeout'), { code: '57014' });
      return { rows: [] };
    });
    recordArticleOpens(4, Date.parse('2026-11-07T06:00:00Z'));
    await flushArticleOpenBuckets();
    expect(peekPendingOpens()).toEqual([[Date.parse('2026-11-07T06:00:00Z'), 4]]);
  });
});

describe('card formatting', () => {
  it('shows yesterday itself instead of a percent when the base is small', () => {
    expect(kpiComparison(32, 13)).toEqual({ kind: 'yesterday', value: 13 });
    expect(kpiComparison(78, 50)).toEqual({ kind: 'percent', value: 56 });
    expect(kpiComparison(5, undefined)).toBeUndefined();
  });

  it('formats reading time on one line', () => {
    expect(formatReadDuration(87)).toBe('1:27 د');
    expect(formatReadDuration(60)).toBe('1:00 د');
    expect(formatReadDuration(45)).toBe('45 ث');
    expect(formatReadDuration(0)).toBe('غير متاح');
  });
});
