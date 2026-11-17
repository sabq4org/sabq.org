import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
vi.mock("../../server/embeddingsService", () => ({}));
import { findSimilarArticles } from "../../server/similarityEngine";

const url = process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
  throw new Error("Ranking integration tests require local PostgreSQL");
}

describe.skipIf(!url)("similar article ranking on Postgres", () => {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: url });
    await client.connect();
    state.db = drizzle(client);
    await client.query(`
      CREATE TEMP TABLE articles (id text PRIMARY KEY, status text);
      CREATE TEMP TABLE content_vectors (article_id text PRIMARY KEY, title text,
        tags text[], entities text[], published_at timestamp, embedding jsonb);
      INSERT INTO content_vectors
        SELECT id, id, tags, ARRAY[]::text[], NOW() AT TIME ZONE 'UTC', embedding::jsonb FROM (VALUES
          ('ref', ARRAY['a','a'], '[1,0]'), ('best', ARRAY['a'], '["1",false,0]'),
          ('long', ARRAY['a','b'], '[1,0,1]'), ('zero', ARRAY[]::text[], '[0,0]'),
          ('negative', ARRAY[]::text[], '[-1]'), ('missing', ARRAY[]::text[], NULL),
          ('invalid', ARRAY['a'], '[{}]'), ('overflow', ARRAY['a'], '[1e500]'),
          ('norm-overflow', ARRAY['a'], '["1e200"]'), ('draft', ARRAY['a'], '[1,0]'), ('old', ARRAY['a'], '[1,0]')
        ) AS fixtures(id,tags,embedding);
      INSERT INTO articles SELECT article_id,
        CASE WHEN article_id='draft' THEN 'draft' ELSE 'published' END FROM content_vectors;
      UPDATE content_vectors SET published_at = published_at - interval '31 days' WHERE article_id='old';
    `);
  });
  afterAll(async () => { await client?.end(); });

  it("retains weighted ranking, empty/duplicate labels and zero-padded cosine", async () => {
    const result = await findSimilarArticles("ref", 10);
    expect(result.map(row => row.articleId)).toEqual(["best", "long", "zero", "negative"]);
    expect(result[0]).toMatchObject({ title: "best", reasons: {
      cosineSimilarity: 1, tagOverlap: 1, entityOverlap: 1, categoryMatch: false, freshnessBoost: 1,
    } });
    expect(result[0].score).toBeCloseTo(1, 12);
    expect(result[1].reasons.cosineSimilarity).toBeCloseTo(1 / Math.sqrt(2), 12);
    expect(result[1].reasons.tagOverlap).toBe(0.5);
    expect(result[2].reasons.cosineSimilarity).toBe(0);
    expect(result[3].reasons.cosineSimilarity).toBe(-1);
  });
  it("handles exclusions, limits and missing reference vectors", async () => {
    expect((await findSimilarArticles("ref", 1, ["best"])).map(row => row.articleId)).toEqual(["long"]);
    expect(await findSimilarArticles("missing")).toEqual([]);
    expect(await findSimilarArticles("invalid")).toEqual([]);
    expect(await findSimilarArticles("absent")).toEqual([]);
  });
});
