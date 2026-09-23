import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), news: vi.fn(), select: vi.fn() }));
vi.mock('../../server/db', () => ({ db: { execute: mocks.execute, select: mocks.select } }));
vi.mock('../../server/storage', () => ({ storage: { getNewsStatistics: mocks.news } }));
import { CACHE_TTL, swrCache } from '../../server/memoryCache';
import { getDashboardPulseStats } from '../../server/services/dashboardPulseService';
import { getAiPublicStats } from '../../server/services/aiPublicStatsService';
import { getCachedNewsStatistics } from '../../server/services/newsStatisticsService';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  swrCache.invalidatePattern('^(public:ai-stats|news:stats|admin:dashboard:pulse)$');
  vi.clearAllMocks();
});
afterEach(() => { vi.useRealTimers(); });

describe('statistics refresh load', () => {
  it('runs one AI batch for fifty concurrent cold readers', async () => {
    const gate = deferred<{ rows: never[] }>();
    mocks.execute.mockReturnValue(gate.promise);
    const readers = Array.from({ length: 50 }, () => getAiPublicStats());
    expect(mocks.execute).toHaveBeenCalledTimes(9);
    gate.resolve({ rows: [] });
    const results = await Promise.all(readers);
    expect(results.every((r) => r === results[0])).toBe(true);
  });

  it('returns the measured AI snapshot immediately during a single refresh', async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    const previous = await getAiPublicStats();
    vi.advanceTimersByTime(300_001);
    const gate = deferred<{ rows: never[] }>();
    mocks.execute.mockReturnValue(gate.promise);
    const results = await Promise.all(Array.from({ length: 50 }, () => getAiPublicStats()));
    expect(mocks.execute).toHaveBeenCalledTimes(18);
    expect(results.every((r) => r === previous)).toBe(true);
    expect(results[0].generatedAt).toBe(previous.generatedAt);
    gate.resolve({ rows: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect((await getAiPublicStats()).generatedAt).not.toBe(previous.generatedAt);
  });

  it('does not cache invented stats after a cold failure and allows recovery', async () => {
    mocks.execute.mockRejectedValue(new Error('database unavailable'));
    await expect(getAiPublicStats()).rejects.toThrow('database unavailable');
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(getAiPublicStats()).resolves.toHaveProperty('generatedAt');
    expect(mocks.execute).toHaveBeenCalledTimes(18);
  });

  it('coalesces news cold requests and serves stale news during refresh', async () => {
    const gate = deferred<object>();
    mocks.news.mockReturnValue(gate.promise);
    const readers = Array.from({ length: 50 }, () => getCachedNewsStatistics());
    expect(mocks.news).toHaveBeenCalledTimes(1);
    const previous = { totalNews: 945000, todayNews: 42 };
    gate.resolve(previous);
    expect((await Promise.all(readers)).every((r) => r === previous)).toBe(true);
    vi.advanceTimersByTime(CACHE_TTL.SHORT + 1);
    const refresh = deferred<object>();
    mocks.news.mockReturnValue(refresh.promise);
    const stale = await Promise.all(Array.from({ length: 50 }, () => getCachedNewsStatistics()));
    expect(stale.every((r) => r === previous)).toBe(true);
    expect(mocks.news).toHaveBeenCalledTimes(2);
    refresh.resolve({ ...previous, todayNews: 43 });
    await vi.advanceTimersByTimeAsync(0);
    expect(await getCachedNewsStatistics()).toHaveProperty('todayNews', 43);
  });
});


it('coalesces eight dashboard pulse queries across fifty readers and TTL refresh', async () => {
  let gate = deferred<object[]>();
  mocks.select.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const name of ['from', 'where', 'innerJoin', 'leftJoin', 'groupBy', 'orderBy', 'limit']) {
      chain[name] = () => chain;
    }
    chain.then = gate.promise.then.bind(gate.promise);
    return chain;
  });
  const readers = Array.from({ length: 50 }, () => getDashboardPulseStats());
  expect(mocks.select).toHaveBeenCalledTimes(8);
  gate.resolve([{}]);
  const previous = (await Promise.all(readers))[0];
  vi.advanceTimersByTime(CACHE_TTL.SHORT + 1);
  gate = deferred<object[]>();
  const stale = await Promise.all(Array.from({ length: 50 }, () => getDashboardPulseStats()));
  expect(stale.every((r) => r === previous)).toBe(true);
  expect(mocks.select).toHaveBeenCalledTimes(16);
  gate.resolve([{}]);
  await vi.advanceTimersByTimeAsync(0);
  expect((await getDashboardPulseStats()).generatedAt).not.toBe(previous.generatedAt);
});
