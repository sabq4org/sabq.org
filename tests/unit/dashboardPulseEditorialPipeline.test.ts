import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const captured: Array<Record<string, unknown>> = [];
vi.mock('../../server/db', () => {
  const makeChain = (fields: Record<string, unknown>) => {
    captured.push(fields);
    const row = Object.fromEntries(Object.keys(fields).map((k) => [k, 0]));
    const result = Promise.resolve([row]);
    const chain: any = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'then') return result.then.bind(result);
          return () => chain;
        },
      },
    );
    return chain;
  };
  return { db: { select: (fields: Record<string, unknown>) => makeChain(fields) } };
});

import { getDashboardPulseStats, riyadhDayStart } from '../../server/services/dashboardPulseService';

const dialect = new PgDialect();
const sqlText = (value: unknown) => dialect.sqlToQuery(value as SQL).sql;

describe('riyadhDayStart', () => {
  it('returns 21:00Z of the previous UTC day after Riyadh midnight', () => {
    // 2026-11-06 21:05 Riyadh = 18:05Z
    expect(riyadhDayStart(new Date('2026-11-06T18:05:00Z')).toISOString()).toBe('2026-11-05T21:00:00.000Z');
  });
  it('rolls over at Riyadh midnight, not UTC midnight', () => {
    // 00:30 Riyadh on 11-07 = 21:30Z on 11-06
    expect(riyadhDayStart(new Date('2026-11-06T21:30:00Z')).toISOString()).toBe('2026-11-06T21:00:00.000Z');
    // 02:00 Riyadh on 11-07 = 23:00Z: still the same Riyadh day
    expect(riyadhDayStart(new Date('2026-11-06T23:00:00Z')).toISOString()).toBe('2026-11-06T21:00:00.000Z');
  });
});

describe('editorial pipeline counts', () => {
  it('counts review states only on drafts and keeps drafts disjoint from review', async () => {
    const stats = await getDashboardPulseStats();
    const articleFields = captured.find((f) => 'pendingReview' in f)!;
    expect(articleFields).toBeDefined();

    const pending = sqlText(articleFields.pendingReview);
    const needs = sqlText(articleFields.needsChanges);
    const draft = sqlText(articleFields.draft);
    expect(pending).toMatch(/"status" = 'draft' and .*"review_status" = 'pending_review'/);
    expect(needs).toMatch(/"status" = 'draft' and .*"review_status" = 'needs_changes'/);
    expect(draft).toContain("not in ('pending_review', 'needs_changes')");
    expect(sqlText(articleFields.scheduled)).toContain("= 'scheduled'");

    expect(stats.articles).toMatchObject({ pendingReview: 0, needsChanges: 0, draft: 0, scheduled: 0 });
  });
});
