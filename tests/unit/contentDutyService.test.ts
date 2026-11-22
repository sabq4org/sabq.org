import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  getInactiveRoles: vi.fn(),
}));
vi.mock("../../server/db", () => ({ db: { select: mocks.select } }));
vi.mock("../../server/services/roleStatusCache", () => ({ getInactiveRoles: mocks.getInactiveRoles }));
import {
  ContentDutyConfigError,
  getContentDutyRoster,
  loadContentDutyRoster,
  resolveContentDutyOnline,
  type ContentDutyAccountRow,
  type ContentDutyManagerConfig,
} from "../../server/services/contentDutyService";

const manager = (overrides: Partial<ContentDutyManagerConfig> = {}): ContentDutyManagerConfig => ({
  key: "alpha",
  name: "محرر تجريبي",
  userId: "user-alpha",
  shifts: [{ days: [0, 1], startHour: 8, endHour: 14 }],
  ...overrides,
});

const account = (overrides: Partial<ContentDutyAccountRow> = {}): ContentDutyAccountRow => ({
  id: "user-alpha",
  role: "content_manager",
  assignedRole: null,
  status: "active",
  deletedAt: null,
  lastActivityAt: new Date("2026-11-22T10:00:00.000Z"),
  loggedOutAt: null,
  roleId: null,
  ...overrides,
});

afterEach(() => vi.unstubAllEnvs());

describe("content duty roster", () => {
  it("keeps the response contract free of account identifiers", () => {
    const [result] = resolveContentDutyOnline(
      [manager()],
      [account()],
      new Date("2026-11-22T10:10:00.000Z"),
    );

    expect(result).toEqual({
      key: "alpha",
      name: "محرر تجريبي",
      online: true,
      shifts: [{ days: [0, 1], startHour: 8, endHour: 14 }],
    });
    expect(result).not.toHaveProperty("userId");
  });

  it.each([
    ["missing account", [], null],
    ["reader account", [account({ role: "reader" })], null],
    ["stale activity", [account({ lastActivityAt: new Date("2026-11-22T09:44:59.000Z") })], false],
    ["logged out after activity", [account({ loggedOutAt: new Date("2026-11-22T10:01:00.000Z") })], false],
  ])("returns the safe online state for %s", (_label, accounts, expected) => {
    const [result] = resolveContentDutyOnline(
      [manager()],
      accounts as ContentDutyAccountRow[],
      new Date("2026-11-22T10:00:00.000Z"),
    );
    expect(result.online).toBe(expected);
  });

  it("uses any active non-reader role when a user has multiple role rows", () => {
    const [result] = resolveContentDutyOnline(
      [manager()],
      [account({ assignedRole: "reader" }), account({ assignedRole: "editor" })],
      new Date("2026-11-22T10:00:00.000Z"),
    );
    expect(result.online).toBe(true);
  });

  it("serves an unknown state when a manager has no confirmed user ID", () => {
    const [result] = resolveContentDutyOnline(
      [manager({ userId: undefined })],
      [account()],
      new Date("2026-11-22T10:00:00.000Z"),
    );
    expect(result.online).toBeNull();
  });

  it("rejects unconfigured or unsafe roster JSON", async () => {
    await expect(loadContentDutyRoster()).rejects.toBeInstanceOf(ContentDutyConfigError);
    vi.stubEnv("CONTENT_DUTY_ROSTER_JSON", JSON.stringify({
      managers: [{ ...manager(), shifts: [{ days: [0], startHour: 24, endHour: 2 }] }],
    }));
    await expect(loadContentDutyRoster()).rejects.toBeInstanceOf(ContentDutyConfigError);
  });

  it("rejects a zero-length shift", async () => {
    vi.stubEnv("CONTENT_DUTY_ROSTER_JSON", JSON.stringify({
      managers: [{ ...manager(), shifts: [{ days: [0], startHour: 8, endHour: 8 }] }],
    }));
    await expect(loadContentDutyRoster()).rejects.toBeInstanceOf(ContentDutyConfigError);
  });

  it("rejects duplicate configured account IDs instead of guessing", async () => {
    vi.stubEnv("CONTENT_DUTY_ROSTER_JSON", JSON.stringify({
      managers: [manager(), manager({ key: "beta" })],
    }));
    await expect(loadContentDutyRoster()).rejects.toBeInstanceOf(ContentDutyConfigError);
  });

  it("keeps the schedule and marks presence unknown when activity lookup fails", async () => {
    vi.stubEnv("CONTENT_DUTY_ROSTER_JSON", JSON.stringify({ managers: [manager()] }));
    mocks.getInactiveRoles.mockResolvedValue({ names: new Set(), ids: new Set() });
    const query = {
      from: vi.fn(),
      leftJoin: vi.fn(),
      where: vi.fn().mockRejectedValue(new Error("temporary database failure")),
    };
    query.from.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    mocks.select.mockReturnValue(query);

    const result = await getContentDutyRoster(new Date("2026-11-22T10:00:00.000Z"));
    expect(result.managers).toEqual([{
      key: "alpha",
      name: "محرر تجريبي",
      shifts: [{ days: [0, 1], startHour: 8, endHour: 14 }],
      online: null,
    }]);
  });
});
