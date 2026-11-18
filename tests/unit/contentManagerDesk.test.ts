import { describe, expect, it } from "vitest";
import { waitingLabel } from "../../client/src/pages/dashboard/ContentManagerDesk";

describe("ContentManagerDesk waitingLabel", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");
  it("shows minutes, hours and days", () => {
    expect(waitingLabel("2026-11-18T11:59:40Z", now)).toBe("الآن");
    expect(waitingLabel("2026-11-18T11:13:00Z", now)).toBe("منذ 47 د");
    expect(waitingLabel("2026-11-18T09:00:00Z", now)).toBe("منذ 3 س");
    expect(waitingLabel("2026-11-16T09:00:00Z", now)).toBe("منذ 2 يوم");
  });
  it("returns empty for bad input", () => {
    expect(waitingLabel("not-a-date", now)).toBe("");
  });
});
