import { describe, expect, it } from "vitest";
import { buildRobotsTxt, CONTENT_SIGNAL } from "../../server/utils/robotsTxt";

describe("robots.txt", () => {
  const txt = buildRobotsTxt();
  const lines = txt.split("\n");

  it("declares the /ai-policy content signals inside the * group", () => {
    expect(CONTENT_SIGNAL).toBe("search=yes, ai-input=yes, ai-train=no");
    const ua = lines.indexOf("User-agent: *");
    expect(ua).toBeGreaterThanOrEqual(0);
    expect(lines[ua + 1]).toBe(`Content-Signal: ${CONTENT_SIGNAL}`);
  });

  it("keeps crawl rules and sitemaps unchanged", () => {
    expect(lines).toContain("Allow: /");
    expect(lines).toContain("Disallow: /api/");
    expect(lines).toContain("Allow: /api/articles$");
    expect(lines).toContain("Allow: /api/rss/");
    expect(lines).toContain("Sitemap: https://sabq.org/sitemap.xml");
    expect(lines).toContain("Sitemap: https://sabq.org/sitemap-news.xml");
    expect(txt).not.toMatch(/^Disallow: \/$/m);
  });
});
