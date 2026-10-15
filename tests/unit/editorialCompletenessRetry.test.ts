import { describe, expect, it, vi } from "vitest";
import { withEditorialCompletenessRepair } from "../../server/ai/editorialCompletenessRetry";
import { assertEditedContentComplete } from "../../server/ai/editorialOutputGuards";

const source = "تفاصيل الخبر وتصريحات المسؤول والأرقام والخلفية. ".repeat(110);
const shortened = `<p>${source.slice(0, 1418)}</p>`;
const complete = `<p>${source}</p>`;
const validate = (body: string) => {
  assertEditedContentComplete(body, source);
  return body;
};

describe("editorial completeness repair", () => {
  it("rejects a shortened result and supplies corrective feedback before accepting a complete result", async () => {
    const generate = vi.fn(async (feedback: string) => validate(feedback ? complete : shortened));
    expect(await withEditorialCompletenessRepair(generate)).toBe(complete);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain("50%");
    expect(generate.mock.calls[1][0]).toContain("Do not pad");
  });

  it("still rejects incomplete repair output and stops after one corrective attempt", async () => {
    const generate = vi.fn(async () => validate(shortened));
    await expect(withEditorialCompletenessRepair(generate)).rejects.toThrow(/truncated/);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("passes primary-model completeness failure to the fallback without adding another repair", async () => {
    let primaryError: unknown;
    try { validate(shortened); } catch (error) { primaryError = error; }
    const generate = vi.fn(async () => validate(shortened));
    await expect(withEditorialCompletenessRepair(generate, primaryError)).rejects.toThrow(/truncated/);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]).toEqual([expect.stringContaining("preserving all news details")]);
  });

  it("does not retry authentication or connection failures", async () => {
    const error = new Error("401 unauthorized");
    const generate = vi.fn(async () => { throw error; });
    await expect(withEditorialCompletenessRepair(generate)).rejects.toBe(error);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not retry complete output", async () => {
    const generate = vi.fn(async () => validate(complete));
    expect(await withEditorialCompletenessRepair(generate)).toBe(complete);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
