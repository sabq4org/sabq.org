import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  rows: [] as Array<{ value: unknown }>,
  failReads: false,
  writes: [] as unknown[],
}));

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (database.failReads) throw new Error("db unavailable");
            return database.rows;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (value: unknown) => {
        database.writes.push(value);
        return {
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
  },
}));

import {
  assertRadarEnabled,
  getRadarRuntimeState,
  setRadarEnabled,
} from "../../server/services/radar/runtime";

describe("Radar runtime switch", () => {
  beforeEach(() => {
    database.rows = [];
    database.failReads = false;
    database.writes = [];
    vi.stubEnv("RADAR_ENABLED", "false");
  });

  it("falls back to RADAR_ENABLED when the setting is absent", async () => {
    expect(await getRadarRuntimeState()).toMatchObject({
      enabled: false,
      source: "environment",
      reason: "disabled_by_environment",
    });

    vi.stubEnv("RADAR_ENABLED", "true");
    expect(await getRadarRuntimeState()).toMatchObject({ enabled: true, source: "environment", reason: null });
  });

  it("lets the persisted boolean override the environment", async () => {
    vi.stubEnv("RADAR_ENABLED", "false");
    database.rows = [{ value: true }];
    expect(await getRadarRuntimeState()).toMatchObject({ enabled: true, source: "database", reason: null });

    database.rows = [{ value: false }];
    expect(await getRadarRuntimeState()).toMatchObject({ enabled: false, source: "database", reason: "paused" });
  });

  it("fails closed when the runtime setting cannot be read", async () => {
    vi.stubEnv("RADAR_ENABLED", "true");
    database.failReads = true;
    expect(await getRadarRuntimeState()).toMatchObject({
      enabled: false,
      source: "unavailable",
      reason: "runtime_setting_unavailable",
    });
    await expect(assertRadarEnabled()).rejects.toMatchObject({ code: "RADAR_DISABLED", reason: "runtime_setting_unavailable" });
  });

  it("writes the requested boolean and exposes a structured stopped error", async () => {
    database.rows = [{ value: false }];
    await setRadarEnabled(false);
    expect(database.writes).toEqual([
      expect.objectContaining({ key: "radar_runtime_enabled", value: false, category: "radar" }),
    ]);
    await expect(assertRadarEnabled()).rejects.toMatchObject({ code: "RADAR_DISABLED", reason: "paused" });
  });
});
