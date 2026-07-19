import { describe, expect, it } from "vitest";
import {
  getSessionFallbackPoolConfig,
  SESSION_FALLBACK_POOL_DEFAULT_MAX,
  shouldRunStartupMaintenance,
} from "../../server/dbPoolConfig";

describe("session fallback pool config", () => {
  it("uses a small pool with bounded timeouts by default", () => {
    const config = getSessionFallbackPoolConfig("postgresql://example/db", {});

    expect(config.max).toBe(SESSION_FALLBACK_POOL_DEFAULT_MAX);
    expect(config.min).toBe(0);
    expect(config.connectionTimeoutMillis).toBe(2_000);
    expect(config.query_timeout).toBe(2_500);
  });

  it("clamps the configurable pool size between 1 and 10", () => {
    expect(getSessionFallbackPoolConfig("postgresql://example/db", {
      SESSION_FALLBACK_POOL_MAX: "0",
    }).max).toBe(1);
    expect(getSessionFallbackPoolConfig("postgresql://example/db", {
      SESSION_FALLBACK_POOL_MAX: "99",
    }).max).toBe(10);
    expect(getSessionFallbackPoolConfig("postgresql://example/db", {
      SESSION_FALLBACK_POOL_MAX: "invalid",
    }).max).toBe(SESSION_FALLBACK_POOL_DEFAULT_MAX);
  });
});

describe("startup database maintenance gate", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(shouldRunStartupMaintenance({})).toBe(false);
    expect(shouldRunStartupMaintenance({ RUN_DB_STARTUP_MAINTENANCE: "false" })).toBe(false);
    expect(shouldRunStartupMaintenance({ RUN_DB_STARTUP_MAINTENANCE: "true" })).toBe(true);
  });

  it("keeps the legacy skip flag as a higher-priority safety override", () => {
    expect(shouldRunStartupMaintenance({
      RUN_DB_STARTUP_MAINTENANCE: "true",
      SKIP_DB_MAINTENANCE: "true",
    })).toBe(false);
  });
});
