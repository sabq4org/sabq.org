import { beforeEach, describe, expect, it, vi } from 'vitest';

let budget: typeof import('../../server/services/summaryAudioBudget');
beforeEach(async () => {
  vi.resetModules();
  budget = await import('../../server/services/summaryAudioBudget');
});

const T0 = Date.UTC(2026, 9, 23, 8, 0, 0);
const MINUTE = 60_000;

describe('«استمع» synthesis limit', () => {
  it('allows 20 new clips per visitor per 10 minutes, then refuses until the window ends', () => {
    for (let i = 0; i < 20; i += 1) expect(budget.takeSummaryAudioSlot('1.2.3.4', T0 + i)).toBe(true);
    expect(budget.takeSummaryAudioSlot('1.2.3.4', T0 + 2 * MINUTE)).toBe(false);
    expect(budget.summaryAudioRetryAfterSeconds('1.2.3.4', T0 + 2 * MINUTE)).toBe(8 * 60);
    expect(budget.takeSummaryAudioSlot('5.6.7.8', T0 + 2 * MINUTE)).toBe(true);
    expect(budget.takeSummaryAudioSlot('1.2.3.4', T0 + 10 * MINUTE)).toBe(true);
  });

  it('caps the replica at 60 new clips an hour across visitors', () => {
    for (let visitor = 0; visitor < 3; visitor += 1) {
      for (let i = 0; i < 20; i += 1) expect(budget.takeSummaryAudioSlot(`v${visitor}`, T0 + visitor)).toBe(true);
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(budget.takeSummaryAudioSlot('newcomer', T0 + 30 * MINUTE)).toBe(false);
    expect(budget.takeSummaryAudioSlot('another', T0 + 31 * MINUTE)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(budget.summaryAudioRetryAfterSeconds('newcomer', T0 + 30 * MINUTE)).toBe(30 * 60);
    expect(budget.takeSummaryAudioSlot('newcomer', T0 + 60 * MINUTE)).toBe(true);
    warn.mockRestore();
  });

  it('keys a signed-in reader apart from an address', () => {
    for (let i = 0; i < 20; i += 1) budget.takeSummaryAudioSlot('203.0.113.9', T0);
    expect(budget.takeSummaryAudioSlot('u:reader-1', T0)).toBe(true);
  });

  it('answers Retry-After of at least one second when nothing is spent', () => {
    expect(budget.summaryAudioRetryAfterSeconds('fresh', T0)).toBe(1);
  });
});
