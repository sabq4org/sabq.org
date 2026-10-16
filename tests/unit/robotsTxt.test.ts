import { describe, expect, it } from "vitest";
import { AI_TRAINING_CRAWLERS, buildRobotsTxt, CONTENT_SIGNAL } from "../../server/utils/robotsTxt";

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
    expect(lines).toContain("Sitemap: https://sabq.org/sitemap-mawaeed.xml");
  });

  // يحاكي اختيار المجموعة وفق RFC 9309: مجموعة باسم البوت إن وُجدت وإلا "*".
  function groupFor(agent: string): string[] {
    const groups: { agents: string[]; rules: string[] }[] = [];
    let current: { agents: string[]; rules: string[] } | null = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [key, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (key.toLowerCase() === "user-agent") {
        if (!current || current.rules.length > 0) {
          current = { agents: [], rules: [] };
          groups.push(current);
        }
        current.agents.push(value.toLowerCase());
      } else if (current && /^(allow|disallow)$/i.test(key)) {
        current.rules.push(`${key}: ${value}`);
      }
    }
    const named = groups.find((g) => g.agents.includes(agent.toLowerCase()));
    return (named ?? groups.find((g) => g.agents.includes("*"))!).rules;
  }

  it("blocks AI training crawlers from the whole site", () => {
    for (const ua of AI_TRAINING_CRAWLERS) {
      expect(groupFor(ua)).toEqual(["Disallow: /"]);
    }
  });

  it("leaves search, citation and Google-Extended crawlers on the * group", () => {
    const star = groupFor("*");
    expect(star).toContain("Allow: /");
    expect(star).toContain("Disallow: /api/");
    for (const ua of [
      "Googlebot",
      "Googlebot-News",
      "Bingbot",
      "Google-Extended",
      "OAI-SearchBot",
      "ChatGPT-User",
      "Claude-SearchBot",
      "Claude-User",
      "PerplexityBot",
      "Perplexity-User",
    ]) {
      expect(groupFor(ua)).toEqual(star);
    }
  });
});
