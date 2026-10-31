import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { desc, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mediaFiles } from "../../shared/schema";
import { buildMediaSearch, mediaListSortFields } from "../../server/mediaSearch";

const url = process.env.MEDIA_SEARCH_TEST_DATABASE_URL || process.env.SESSION_REVOCATION_TEST_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const suite = local ? describe : describe.skip;
let client: pg.Client;

type Fixture = { id: string; title?: string; alt?: string; caption?: string; description?: string; keywords?: string[]; url?: string; generated?: boolean; created?: string };
async function seed(rows: Fixture[]) {
  for (const row of rows) await client.query(`INSERT INTO media_files
    (id,url,title,alt_text,caption,description,keywords,is_ai_generated,created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
  [row.id,row.url ?? row.id,row.title ?? null,row.alt ?? null,row.caption ?? null,row.description ?? null,row.keywords ?? [],row.generated ?? false,row.created ?? "2026-10-01"]);
}

async function results(term: string, mostUsed = false, offset = 0, limit = 20) {
  const db = drizzle(client);
  const search = buildMediaSearch(term);
  const dedup = db.selectDistinctOn([mediaFiles.url], {
    id: mediaFiles.id, url: mediaFiles.url, createdAt: mediaFiles.createdAt,
    ...mediaListSortFields(search, mostUsed),
  }).from(mediaFiles).where(search?.where).orderBy(mediaFiles.url,
    ...(search && !mostUsed ? [desc(sql.identifier("score"))] : []),
    desc(mediaFiles.createdAt), desc(mediaFiles.id)).as("dedup");
  return (await db.select({ id: dedup.id }).from(dedup).orderBy(
    ...(search && !mostUsed ? [desc(dedup.score)] : []),
    mostUsed ? desc(dedup.usage) : desc(dedup.createdAt), desc(dedup.id),
  ).limit(limit).offset(offset)).map(row => row.id);
}

suite("media subject priority — real PostgreSQL, temporary tables only", () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
    await client.connect();
  });
  beforeEach(async () => {
    await client.query("BEGIN");
    await client.query("SET LOCAL search_path = pg_temp");
    await client.query(`CREATE TEMP TABLE media_files (
      id text PRIMARY KEY, url text NOT NULL, title text, alt_text text, caption text,
      description text, keywords text[], file_name text DEFAULT 'archive.jpg',
      type text DEFAULT 'image', is_ai_generated boolean DEFAULT false,
      ai_analysis_status text DEFAULT 'done', created_at timestamp NOT NULL
    ) ON COMMIT DROP`);
    await client.query("CREATE TEMP TABLE article_media_assets (media_file_id text) ON COMMIT DROP");
    await client.query("CREATE TEMP TABLE media_usage_log (media_id text) ON COMMIT DROP");
  });
  afterEach(async () => { await client.query("ROLLBACK"); });
  afterAll(async () => { await client?.end(); });

  const portrait: Fixture = { id: "portrait", alt: "صورة رسمية للأمير محمد بن سلمان ولي العهد السعودي", keywords: ["portrait", "Mohammed bin Salman"], created: "2020-01-01" };
  const headline = "مشروع الأمير محمد بن سلمان يعيد إحياء مسجد";

  it.each(["محمد بن سلمان", "مُحَمَّد بن سَلْمان", "ولي العهد"])("puts the person's portrait before article mentions for %s", async term => {
    await seed([portrait, {
      id: "project", title: `${headline} - صورة 1`, alt: `صورة ${headline}`,
      caption: headline, description: `${headline} برعاية ولي العهد`,
      keywords: ["مشروع محمد بن سلمان", "ولي العهد"], created: "2026-10-31",
    }, { id: "other-person", title: "النويمر: محمد بن سلمان يحيي التراث بأمر ولي العهد", alt: "صورة شخصية لرجل سعودي يرتدي الشماغ", keywords: ["portrait"] }]);
    const ordered = await results(term);
    expect(ordered[0]).toBe("portrait");
    expect(ordered).toContain("project");
    expect(ordered).toContain("other-person");
  });

  it("does not promote screenshots, banners or generated illustrations above the portrait", async () => {
    await seed([portrait,
      { id: "screenshot", alt: "لقطة شاشة تعرض صورة شخصية لمحمد بن سلمان", keywords: ["portrait", "محمد بن سلمان"], title: "محمد بن سلمان", created: "2026-10-31" },
      { id: "banner", alt: "بانر إعلاني يظهر محمد بن سلمان", keywords: ["portrait", "محمد بن سلمان"], title: "محمد بن سلمان" },
      { id: "generated", alt: "صورة شخصية لمحمد بن سلمان", keywords: ["portrait", "محمد بن سلمان"], title: "محمد بن سلمان", generated: true },
    ]);
    expect((await results("محمد بن سلمان"))[0]).toBe("portrait");
  });

  it("keeps project searches about the named project, not the portrait", async () => {
    await seed([portrait, { id: "mosque", title: headline, alt: "مسجد تاريخي بأرضية مفروشة", keywords: ["مسجد"] }]);
    expect(await results("مشروع محمد بن سلمان")).toEqual(["mosque"]);
  });

  it("ranks an independent image description above a copied headline", async () => {
    await seed([
      { id: "direct", alt: "محمد بن سلمان يصافح ضيفه خلال استقبال رسمي", created: "2020-01-01" },
      { id: "copy", title: `${headline} - صورة 2`, alt: `صورة ${headline}`, caption: headline, description: headline, created: "2026-10-31" },
    ]);
    expect(await results("محمد بن سلمان")).toEqual(["direct", "copy"]);
  });

  it("uses an exact keyword as subject evidence, not a name within a project keyword", async () => {
    await seed([
      { id: "subject", keywords: ["محمد بن سلمان"], alt: "صورة شخصية لولي العهد", created: "2020-01-01" },
      { id: "project-tag", title: headline, keywords: ["مشروع محمد بن سلمان"], description: headline },
    ]);
    expect(await results("محمد بن سلمان")).toEqual(["subject", "project-tag"]);
  });

  it("recognizes a short subject label even when the alt text repeats it", async () => {
    await seed([
      { id: "label", title: "محمد بن سلمان", alt: "صورة محمد بن سلمان", created: "2020-01-01" },
      { id: "context", title: headline, alt: headline, created: "2026-10-31" },
    ]);
    expect(await results("محمد بن سلمان")).toEqual(["label", "context"]);
  });

  it("keeps a richer older record for one URL, with stable deduplicated pagination", async () => {
    await seed([
      { ...portrait, url: "same-image" },
      { id: "new-copy", url: "same-image", title: headline, alt: `صورة ${headline}`, created: "2026-10-31" },
      { id: "context", title: headline },
    ]);
    expect(await results("محمد بن سلمان", false, 0, 1)).toEqual(["portrait"]);
    expect(await results("محمد بن سلمان", false, 1, 1)).toEqual(["context"]);
    expect(await results("محمد بن سلمان", false, 2, 1)).toEqual([]);
  });

  it("leaves explicit most-used ordering and unsearched browsing unchanged", async () => {
    await seed([portrait, { id: "recent", title: headline, created: "2026-10-31" }]);
    await client.query("INSERT INTO article_media_assets(media_file_id) VALUES ('recent'),('recent')");
    expect(await results("محمد بن سلمان", true)).toEqual(["recent", "portrait"]);
    expect(await results("")).toEqual(["recent", "portrait"]);
  });

  it("preserves the newest duplicate selection in the explicit most-used collection", async () => {
    await seed([
      { ...portrait, url: "same-image" },
      { id: "latest", url: "same-image", title: headline, created: "2026-10-31" },
      { id: "used", title: headline },
    ]);
    await client.query("INSERT INTO media_usage_log(media_id) VALUES ('portrait'),('portrait'),('used')");
    expect(await results("محمد بن سلمان", true)).toEqual(["used", "latest"]);
  });

  it("handles missing visual metadata and does not require an identity match to return context", async () => {
    await seed([{ id: "sparse", title: "ولي العهد محمد بن سلمان يزور المنطقة" }, { id: "unrelated", title: "خبر آخر" }]);
    expect(await results("محمد بن سلمان")).toEqual(["sparse"]);
    expect(await results("محمد%سلمان")).toEqual([]);
  });
});
