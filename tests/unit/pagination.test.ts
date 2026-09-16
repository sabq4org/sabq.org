import { describe, it, expect } from "vitest";
import { readPagination, parseLimit, parseOffset, boundedLimit, HARD_MAX_LIMIT } from "../../server/utils/pagination";

const OPTS = { defaultLimit: 20, maxLimit: 50 };
const read = (limit: unknown, extra: Record<string, unknown> = {}) =>
  readPagination({ limit, ...extra }, OPTS);

// Owner-mandated value matrix (2026-08-30 incident: /api/v1/articles?limit=-1 → 24k rows / 40 MB)
describe("readPagination limit matrix", () => {
  it.each([
    ["-1", { ok: false, field: "limit" }],
    ["0", { ok: true, limit: 20 }],
    ["1", { ok: true, limit: 1 }],
    ["50", { ok: true, limit: 50 }],
    ["51", { ok: true, limit: 50 }],
    ["999999", { ok: true, limit: 50 }],
    ["abc", { ok: true, limit: 20 }],
    ["", { ok: true, limit: 20 }],
    [undefined, { ok: true, limit: 20 }],
  ])("limit=%j", (input, expected) => {
    expect(read(input)).toMatchObject(expected);
  });
  it("negative limit → 400 status", () => expect(read("-1")).toMatchObject({ ok: false, status: 400 }));
  it("never exceeds HARD_MAX_LIMIT even if caller asks for more", () => {
    const r = readPagination({ limit: "999999" }, { defaultLimit: 20, maxLimit: 100000 });
    expect(r).toMatchObject({ ok: true, limit: HARD_MAX_LIMIT });
  });
  it("array-valued query (limit=1&limit=-1) uses first value", () => {
    expect(read(["1", "-1"])).toMatchObject({ ok: true, limit: 1 });
  });
});

describe("readPagination offset / page", () => {
  it("negative offset → 400", () => expect(read("10", { offset: "-1" })).toMatchObject({ ok: false, status: 400, field: "offset" }));
  it("offset abc/empty → 0", () => {
    expect(read("10", { offset: "abc" })).toMatchObject({ ok: true, offset: 0 });
    expect(read("10", { offset: "" })).toMatchObject({ ok: true, offset: 0 });
  });
  it("page overrides offset when allowed; page<1 → 400", () => {
    const o = { ...OPTS, allowPage: true };
    expect(readPagination({ limit: "10", page: "3" }, o)).toMatchObject({ ok: true, offset: 20, page: 3 });
    expect(readPagination({ limit: "10", page: "0" }, o)).toMatchObject({ ok: false, field: "page" });
    expect(readPagination({ limit: "10", page: "-2" }, o)).toMatchObject({ ok: false, field: "page" });
  });
  it("page ignored when not allowed", () => {
    expect(readPagination({ page: "-2" }, OPTS)).toMatchObject({ ok: true, offset: 0 });
  });
});

describe("lenient helpers + query-layer guard", () => {
  it("parseLimit never returns <1 or >max", () => {
    expect(parseLimit("-1", 20, 50)).toBe(20);
    expect(parseLimit("5000", 20, 50)).toBe(50);
    expect(parseLimit("", 20, 50)).toBe(20);
  });
  it("parseOffset never negative", () => expect(parseOffset("-10")).toBe(0));
  it("boundedLimit clamps everything into [1, HARD_MAX_LIMIT]", () => {
    expect(boundedLimit(-1)).toBe(20);
    expect(boundedLimit(0)).toBe(20);
    expect(boundedLimit(Number.NaN)).toBe(20);
    expect(boundedLimit(7)).toBe(7);
    expect(boundedLimit(10_000)).toBe(HARD_MAX_LIMIT);
  });
});
