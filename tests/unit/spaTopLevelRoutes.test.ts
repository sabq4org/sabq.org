import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isKnownSpaTopLevelPath, SPA_TOP_LEVEL_SEGMENTS } from "../../server/utils/spaTopLevelRoutes";

// المقاطع الأولى الفعلية لمسارات Switch في App.tsx (عدا معاينات التطوير).
function appTopLevelSegments(): Set<string> {
  const app = readFileSync(path.resolve(import.meta.dirname, "../../client/src/App.tsx"), "utf8");
  const out = new Set<string>();
  for (const m of app.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const first = m[1].split("/").filter(Boolean)[0];
    if (first && !first.startsWith("__")) out.add(first.toLowerCase());
  }
  return out;
}

describe("SPA top-level segments (edge soft-404 guard)", () => {
  it("covers every route segment in App.tsx — a missing one would 404 a real page", () => {
    const missing = [...appTopLevelSegments()].filter((s) => !SPA_TOP_LEVEL_SEGMENTS.has(s));
    expect(missing).toEqual([]);
  });

  it("lists no segment that App.tsx does not route (keeps the 404 honest)", () => {
    const app = appTopLevelSegments();
    const stale = [...SPA_TOP_LEVEL_SEGMENTS].filter((s) => !app.has(s));
    expect(stale).toEqual([]);
  });

  it("App.tsx has no root-level param route that would swallow every path", () => {
    const app = readFileSync(path.resolve(import.meta.dirname, "../../client/src/App.tsx"), "utf8");
    expect(app).not.toMatch(/<Route\s+path="\/:/);
  });

  it("classifies known and unknown paths", () => {
    expect(isKnownSpaTopLevelPath("/")).toBe(true);
    expect(isKnownSpaTopLevelPath("/about")).toBe(true);
    expect(isKnownSpaTopLevelPath("/About")).toBe(true);
    expect(isKnownSpaTopLevelPath("/article/g19fvwa")).toBe(true);
    expect(isKnownSpaTopLevelPath("/en/whatever")).toBe(true);
    expect(isKnownSpaTopLevelPath("/this-page-does-not-exist-xyz123")).toBe(false);
    expect(isKnownSpaTopLevelPath("/wp-login.php")).toBe(false);
    expect(isKnownSpaTopLevelPath("/%E0%A4%A")).toBe(false);
  });
});
