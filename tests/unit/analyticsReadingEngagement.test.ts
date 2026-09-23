// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAnalyticsReadingEngagement, type AnalyticsReadingEnvironment, type AnalyticsReadingEvent } from "@/hooks/useAnalyticsReadingEngagement";

class FakeDocument extends EventTarget { visibilityState: DocumentVisibilityState = "visible"; }
class FakeWindow extends EventTarget { innerHeight = 1000; location = { href: "https://sabq.org/article/old" }; }

describe("analytics reading engagement lifecycle", () => {
  let doc: FakeDocument; let win: FakeWindow; let time: number; let events: AnalyticsReadingEvent[]; let rect: { top: number; bottom: number; height: number };
  const environment = (): AnalyticsReadingEnvironment => ({ document: doc, window: win, now: () => time });
  const install = (id = "article-1") => installAnalyticsReadingEngagement({ articleId: id, getContentElement: () => ({ getBoundingClientRect: () => rect }), onEvent: (event) => events.push(event) }, environment());
  const visibility = (state: DocumentVisibilityState) => { doc.visibilityState = state; doc.dispatchEvent(new Event("visibilitychange")); };
  beforeEach(() => { doc = new FakeDocument(); win = new FakeWindow(); time = 0; events = []; rect = { top: 1000, bottom: 2000, height: 1000 }; });
  afterEach(() => vi.restoreAllMocks());
  it("emits each article-body depth threshold once", () => { const cleanup = install(); rect = { top: 0, bottom: 1000, height: 1000 }; win.innerHeight = 250; win.dispatchEvent(new Event("scroll")); expect(events.filter((e) => e.name === "scroll_depth").map((e) => e.params.percent_scrolled)).toEqual([25]); rect = { top: -1000, bottom: 0, height: 1000 }; win.dispatchEvent(new Event("scroll")); expect(events.filter((e) => e.name === "scroll_depth").map((e) => e.params.percent_scrolled)).toEqual([25, 50, 75, 90]); cleanup(); });
  it("ignores scroll while hidden", () => { const cleanup = install(); visibility("hidden"); rect = { top: -1000, bottom: 0, height: 1000 }; win.dispatchEvent(new Event("scroll")); expect(events).toHaveLength(0); cleanup(); });
  it("counts foreground time and pauses while hidden", () => { const cleanup = install(); time = 6000; visibility("hidden"); time = 26000; visibility("visible"); time = 31000; win.dispatchEvent(new Event("pagehide")); expect(events.find((e) => e.name === "reading_time")?.params.reading_time_seconds).toBe(11); win.dispatchEvent(new Event("pagehide")); expect(events.filter((e) => e.name === "reading_time")).toHaveLength(1); cleanup(); });
  it("does not emit short visits", () => { const cleanup = install(); time = 9000; cleanup(); expect(events).toHaveLength(0); });
  it("keeps navigation flush attributed to the leaving article", () => { const cleanup = install("article-old"); time = 12000; cleanup(); expect(events[0].params.article_id).toBe("article-old"); expect(events[0].params.page_location).toBe("https://sabq.org/article/old"); });
  it("resumes bfcache visits without loss or duplication", () => { const cleanup = install(); time = 6000; win.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true })); time = 26000; win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true })); time = 31000; win.dispatchEvent(new Event("pagehide")); expect(events.filter((e) => e.name === "reading_time")).toHaveLength(1); expect(events[0].params.reading_time_seconds).toBe(11); cleanup(); });
});
