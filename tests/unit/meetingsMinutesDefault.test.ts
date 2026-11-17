import { beforeEach, describe, expect, it, vi } from "vitest";

// «أمين المحضر» مفعّل افتراضياً للاجتماعات الجديدة (2026-11-17):
// إغفال minutesEnabled = مفعّل، وfalse الصريحة تُحترم. الاجتماعات القائمة لا تُمس.

const state = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>> }));

vi.mock("../../server/db", () => {
  const insert = () => ({
    values: (v: Record<string, unknown> | Array<Record<string, unknown>>) => {
      const rows = Array.isArray(v) ? v : [v];
      state.inserted.push(...rows);
      const result = Promise.resolve(undefined) as Promise<undefined> & { returning: () => Promise<unknown[]>; catch: Promise<undefined>["catch"] };
      result.returning = async () => rows.map((r, i) => ({ id: `m-${state.inserted.length}-${i}`, ...r }));
      return result;
    },
  });
  return { db: { insert, select: vi.fn(), update: vi.fn(), delete: vi.fn() } };
});

vi.mock("../../server/auth", () => ({ isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../../server/rbac", () => ({ userHasPermission: vi.fn(async () => true) }));

import { createMeetingSchema } from "../../server/routes/meetingsRoutes";
import { createMeeting } from "../../server/services/meetingsService";

const base = { title: "اجتماع التحرير", accessType: "all" as const };

beforeEach(() => {
  state.inserted.length = 0;
});

describe("minutes default for new meetings", () => {
  it("create API schema defaults minutesEnabled to true and respects explicit false", () => {
    expect(createMeetingSchema.parse(base).minutesEnabled).toBe(true);
    expect(createMeetingSchema.parse({ ...base, minutesEnabled: false }).minutesEnabled).toBe(false);
    expect(createMeetingSchema.parse({ ...base, minutesEnabled: true }).minutesEnabled).toBe(true);
  });

  it("createMeeting stores true when the flag is omitted and false when explicitly off", async () => {
    const future = new Date(Date.now() + 3_600_000);
    await createMeeting("host-1", { ...base, requireApproval: true, muteOnJoin: true, scheduledAt: future });
    await createMeeting("host-1", { ...base, requireApproval: true, muteOnJoin: true, scheduledAt: future, minutesEnabled: false });
    const meetingRows = state.inserted.filter((r) => "roomName" in r);
    expect(meetingRows.map((r) => r.minutesEnabled)).toEqual([true, false]);
  });
});
