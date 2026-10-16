import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../server/db", () => ({ get db() { return state.db; } }));
import { getNextSlotsForWriters } from "../../server/services/opinionWritersService";
import { attachWriterWeeklySlots, collectOpinionDraftIds } from "../../server/services/writerWeeklySlot";

const url = process.env.OPINION_SLOT_TEST_DATABASE_URL;
const local = url && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(url).hostname);
const suite = local ? describe : describe.skip;
// Session-scoped TEMP tables on one connection; each test rolls back its rows.
// Nothing is truncated or dropped: the tables vanish when the connection closes.
let client: pg.Client;

// Friday 2026-10-16, 11:00 Riyadh. The writer's weekly slot is Friday 14:30 Riyadh (11:30Z).
const NOW = new Date("2026-10-16T08:00:00Z");
const THIS_FRIDAY = "2026-10-16T11:30:00.000Z";
const NEXT_FRIDAY = "2026-10-23T11:30:00.000Z";

suite("writer weekly slot — actual PostgreSQL, temp tables", () => {
  beforeAll(async () => {
    client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
    await client.connect();
    await client.query(`CREATE TEMP TABLE opinion_writer_schedules (
      id text PRIMARY KEY, writer_id text NOT NULL, weekday int NOT NULL, publish_time varchar(5) NOT NULL,
      active boolean NOT NULL DEFAULT true, notes text, updated_by text,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TEMP TABLE articles (
      id text PRIMARY KEY, article_type text, author_id text, status text, review_status text,
      published_at timestamp, scheduled_at timestamp, updated_at timestamp
    )`);
    await client.query(`INSERT INTO opinion_writer_schedules(id, writer_id, weekday, publish_time) VALUES ('s1','writer',5,'14:30')`);
    state.db = drizzle(client);
  });
  afterAll(async () => {
    vi.useRealTimers();
    await client?.end();
  });
  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    await client.query("BEGIN");
  });
  afterEach(async () => {
    await client.query("ROLLBACK");
  });

  const draft = (id: string, reviewStatus: string) =>
    ({ id, status: "draft", articleType: "opinion", authorId: "writer", reviewStatus });

  it("an approved draft without a saved date is listed on this week's slot, not pushed by itself", async () => {
    // Reported 2026-10-16: the editor suggested Friday 16 Oct, the drafts list showed 23 Oct.
    await client.query(`INSERT INTO articles VALUES
      ('draft','opinion','writer','draft','approved',NULL,NULL,'2026-10-16 07:00')`);

    const editorSuggestion = await getNextSlotsForWriters(["writer"], { excludeArticleId: "draft" });
    expect(editorSuggestion.writer.nextSlot).toBe(THIS_FRIDAY);

    const rows = [draft("draft", "approved")];
    const listBase = await getNextSlotsForWriters(["writer"], { distributedDraftIds: collectOpinionDraftIds(rows) });
    const [listed] = attachWriterWeeklySlots(rows, listBase);
    expect(listed.writerWeeklySlot?.nextSlot).toBe(THIS_FRIDAY);

    // Scheduling a DIFFERENT article still treats the in-flight draft as occupying this Friday.
    expect((await getNextSlotsForWriters(["writer"])).writer.nextSlot).toBe(NEXT_FRIDAY);
  });

  it("an in-flight draft outside the current page still holds its slot", async () => {
    await client.query(`INSERT INTO articles VALUES
      ('a','opinion','writer','draft','pending_review',NULL,NULL,'2026-10-16 07:00'),
      ('b','opinion','writer','draft','approved',NULL,NULL,'2026-10-16 07:30')`);
    // A page (or a mobile detail call) that only contains draft b.
    const rows = [draft("b", "approved")];
    const base = await getNextSlotsForWriters(["writer"], { distributedDraftIds: collectOpinionDraftIds(rows) });
    expect(attachWriterWeeklySlots(rows, base)[0].writerWeeklySlot?.nextSlot).toBe(NEXT_FRIDAY);
  });

  it("published and scheduled articles still push the listed slot a week", async () => {
    await client.query(`INSERT INTO articles VALUES
      ('pub','opinion','writer','published',NULL,'2026-10-14 11:30',NULL,'2026-10-14 11:30'),
      ('draft','opinion','writer','draft','pending_review',NULL,NULL,'2026-10-16 07:00')`);
    const listBase = await getNextSlotsForWriters(["writer"], { distributedDraftIds: ["draft"] });
    expect(listBase.writer.nextSlot).toBe(NEXT_FRIDAY);
  });
});
