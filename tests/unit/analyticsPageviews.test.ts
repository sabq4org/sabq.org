import { describe, expect, it } from "vitest";
import { createPageViewCoordinator, type AnalyticsPage } from "../../client/src/lib/analytics-pageviews";

function fixture() {
  const events: AnalyticsPage[] = [];
  const tracker = createPageViewCoordinator(page => { events.push(page); return true; });
  return { tracker, events };
}

describe("SPA pageview readiness", () => {
  it("waits for delayed metadata and never uses the previous headline", () => {
    const { tracker, events } = fixture();
    tracker.navigate("https://sabq.org/", "https://search.example/");
    tracker.ready("https://sabq.org/", "Home"); tracker.flush();
    tracker.navigate("https://sabq.org/article/a"); tracker.flush();
    expect(events).toHaveLength(1);
    tracker.ready("https://sabq.org/", "Late old home"); tracker.flush();
    expect(events).toHaveLength(1);
    tracker.ready("https://sabq.org/article/a", "Final article"); tracker.flush();
    expect(events[1]).toEqual({ location: "https://sabq.org/article/a", referrer: "https://sabq.org/", title: "Final article" });
  });
  it("counts distinct visits with identical titles including Back and Forward", () => {
    const { tracker, events } = fixture();
    for (const path of ["a", "b", "a", "b"]) {
      const url = `https://sabq.org/article/${path}`;
      tracker.navigate(url); tracker.ready(url, "Same title"); tracker.flush(); tracker.flush();
    }
    expect(events).toHaveLength(4);
    expect(events[2].referrer).toBe("https://sabq.org/article/b");
  });
  it("accepts cached readiness before flush and ignores later metadata refreshes", () => {
    const { tracker, events } = fixture();
    tracker.navigate("https://sabq.org/category/saudi?page=2");
    tracker.ready("https://sabq.org/category/saudi?page=2", "Page 2");
    tracker.flush(); tracker.ready("https://sabq.org/category/saudi?page=2", "Updated"); tracker.flush();
    expect(events).toHaveLength(1);
    tracker.navigate("https://sabq.org/category/saudi?page=3"); tracker.flush();
    expect(events).toHaveLength(1);
  });
  it("cancels abandoned unresolved routes and retries an unavailable transport", () => {
    const events: AnalyticsPage[] = []; let ready = false;
    const tracker = createPageViewCoordinator(page => { if (!ready) return false; events.push(page); return true; });
    tracker.navigate("https://sabq.org/article/a");
    tracker.navigate("https://sabq.org/article/b");
    tracker.ready("https://sabq.org/article/a", "Late A"); tracker.flush();
    tracker.ready("https://sabq.org/article/b", "B"); tracker.flush();
    expect(events).toHaveLength(0);
    ready = true; tracker.flush(); tracker.flush();
    expect(events.map(e => e.title)).toEqual(["B"]);
  });
});
