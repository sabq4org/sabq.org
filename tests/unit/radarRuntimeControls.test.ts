import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  rows: [] as Array<{ value: unknown }>,
}));
const ai = vi.hoisted(() => ({ generate: vi.fn() }));
const cron = vi.hoisted(() => ({ schedule: vi.fn() }));
const cycle = vi.hoisted(() => ({ runRadarCycle: vi.fn() }));

vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => database.rows }),
      }),
    }),
  },
}));
vi.mock("../../server/ai-manager", () => ({ aiManager: ai }));
vi.mock("node-cron", () => ({ default: cron }));
vi.mock("../../server/leaderElection", () => ({ isLeader: () => true }));
vi.mock("../../server/services/radar/cycle", () => cycle);

import { generateWithFallback } from "../../server/services/radar/aiChain";
import { startRadarJob } from "../../server/jobs/radarJob";

describe("Radar pause boundaries", () => {
  beforeEach(() => {
    database.rows = [{ value: true }];
    ai.generate.mockReset();
    cron.schedule.mockReset();
    cycle.runRadarCycle.mockReset();
    vi.stubEnv("RADAR_ENABLED", "false");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call an AI provider while paused", async () => {
    database.rows = [{ value: false }];
    await expect(generateWithFallback("prompt", [{ provider: "openai", model: "test" }])).rejects.toMatchObject({
      code: "RADAR_DISABLED",
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it("does not enter the fallback after a provider returns during a pause", async () => {
    ai.generate.mockImplementationOnce(async () => {
      database.rows = [{ value: false }];
      return { content: "{}", provider: "openai", model: "test", truncated: false };
    });
    await expect(
      generateWithFallback("prompt", [
        { provider: "openai", model: "first" },
        { provider: "anthropic", model: "fallback" },
      ]),
    ).rejects.toMatchObject({ code: "RADAR_DISABLED" });
    expect(ai.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps cron registered with env false and resumes on the next enabled tick", async () => {
    startRadarJob();
    expect(cron.schedule).toHaveBeenCalledTimes(1);
    const tick = cron.schedule.mock.calls[0][1] as () => void;

    database.rows = [{ value: false }];
    tick();
    await vi.runAllTimersAsync();
    expect(cycle.runRadarCycle).not.toHaveBeenCalled();

    database.rows = [{ value: true }];
    tick();
    await vi.runAllTimersAsync();
    expect(cycle.runRadarCycle).toHaveBeenCalledTimes(1);
  });
});
