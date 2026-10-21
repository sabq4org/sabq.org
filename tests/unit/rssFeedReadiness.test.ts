import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  category: { id: "cat-1", slug: "tech", nameAr: "تقنية", status: "active" },
}));
const originalAppUrl = process.env.APP_URL;

async function listen(app: express.Express) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}

vi.mock("../../server/db", () => ({
  get db() {
    return {
      select: () => {
        const query = {
          from: () => query,
          where: () => query,
          orderBy: () => query,
          limit: async () => state.rows,
        };
        return query;
      },
      query: {
        categories: {
          findFirst: async () => state.category,
        },
      },
    };
  },
}));

import router from "../../server/routes/rssFeedRoutes";
import { articleCanonicalUrl, cdata, escapeXmlAttribute } from "../../server/utils/rssXml";

describe("RSS AI readiness", () => {
  beforeEach(() => {
    process.env.APP_URL = "https://sabq.org";
  });

  afterEach(() => {
    state.rows = [];
    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;
  });

  it("uses the canonical englishSlug while keeping the legacy guid stable", async () => {
    state.rows = [{
      id: "article-1",
      title: "عنوان ]]> آمن & صالح",
      slug: "legacy-slug",
      englishSlug: "short-slug",
      excerpt: "وصف ]]> آمن",
      imageUrl: 'https://img.example/a?x=1&y="2"',
      publishedAt: new Date("2026-10-21T10:00:00Z"),
    }];
    const app = express();
    app.use("/api/rss", router);

    const server = await listen(app);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server did not bind");
      const xml = await (await fetch(`http://127.0.0.1:${address.port}/api/rss/articles`)).text();
      expect(XMLValidator.validate(xml)).toBe(true);
      const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as {
        rss: { channel: { item: {
          title: string;
          description: string;
          link: string;
          guid: { "#text": string; "@_isPermaLink": string };
          enclosure: { "@_url": string };
        } } };
      };
      expect(parsed.rss.channel.item.link).toBe("https://sabq.org/article/short-slug");
      expect(parsed.rss.channel.item.guid["#text"]).toBe("https://sabq.org/article/legacy-slug");
      expect(parsed.rss.channel.item.title).toBe("عنوان ]]> آمن & صالح");
      expect(parsed.rss.channel.item.description).toBe("وصف ]]> آمن");
      expect(parsed.rss.channel.item.enclosure["@_url"]).toBe('https://img.example/a?x=1&y="2"');
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it("uses the canonical slug in category RSS and JSON Feed without changing JSON ids", async () => {
    state.rows = [{
      id: "article-2",
      title: "عنوان",
      slug: "legacy-two",
      englishSlug: "short-two",
      excerpt: "وصف",
      imageUrl: null,
      publishedAt: new Date("2026-10-21T10:00:00Z"),
    }];
    const app = express();
    app.use("/api/rss", router);
    const server = await listen(app);
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("server did not bind");
      const base = `http://127.0.0.1:${address.port}/api/rss`;
      const categoryXml = await (await fetch(`${base}/articles/category/tech`)).text();
      expect(XMLValidator.validate(categoryXml)).toBe(true);
      const parsedCategory = new XMLParser({ ignoreAttributes: false }).parse(categoryXml) as {
        rss: { channel: { item: { link: string; guid: { "#text": string } } } };
      };
      expect(parsedCategory.rss.channel.item.link).toBe("https://sabq.org/article/short-two");
      expect(parsedCategory.rss.channel.item.guid["#text"]).toBe("https://sabq.org/article/legacy-two");
      const feed = await (await fetch(`${base}/articles.json`)).json() as { items: Array<{ id: string; url: string; content_text: string }> };
      expect(feed.items[0]).toMatchObject({ id: "article-2", url: "https://sabq.org/article/short-two", content_text: "وصف" });
      state.rows[0].englishSlug = null;
      state.rows[0].excerpt = "";
      const fallback = await (await fetch(`${base}/articles.json?limit=49`)).json() as { items: Array<{ id: string; url: string; content_text: string }> };
      expect(fallback.items[0]).toMatchObject({ id: "article-2", url: "https://sabq.org/article/legacy-two", content_text: "عنوان" });
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

  it("escapes XML attributes and splits CDATA terminators", () => {
    expect(escapeXmlAttribute('a&b"<c>\'')).toBe("a&amp;b&quot;&lt;c&gt;&apos;");
    expect(cdata("x ]]> y")).toBe("<![CDATA[x ]]]]><![CDATA[> y]]>");
    expect(articleCanonicalUrl("https://sabq.org", { slug: "legacy", englishSlug: "short" }))
      .toBe("https://sabq.org/article/short");
  });
});
