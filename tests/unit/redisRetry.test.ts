import { describe, expect, it } from "vitest";
import { REDIS_RETRY_MAX_DELAY_MS, redisRetryDelay } from "../../server/utils/redisRetry";

// تدقيق 2026-11-10: الاستراتيجية السابقة كانت تعيد null بعد 5 محاولات، فيدخل
// ioredis حالة end النهائية ولا يعود الاتصال حتى النشر التالي.
describe("redisRetryDelay", () => {
  it("never tells ioredis to stop reconnecting", () => {
    for (const times of [1, 5, 6, 50, 10_000]) {
      const delay = redisRetryDelay(times);
      expect(typeof delay).toBe("number");
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(REDIS_RETRY_MAX_DELAY_MS);
    }
  });

  it("backs off, then settles at the cap", () => {
    expect(redisRetryDelay(1)).toBe(200);
    expect(redisRetryDelay(10)).toBe(2000);
    expect(redisRetryDelay(1000)).toBe(REDIS_RETRY_MAX_DELAY_MS);
  });
});
