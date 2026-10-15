import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSahraaTvBlockConfig } from "../../server/services/sahraaTvBlockUtils";

const database = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../../server/db", () => database);
import {
  compareAndSetSahraaTvBlockSetting,
  readSahraaTvBlockSetting,
} from "../../server/services/sahraaTvBlockPersistence";

// Reuse CI's disposable PostgreSQL service; never read application DB secrets.
const url = process.env.SAHRAA_BLOCK_TEST_URL || process.env.SESSION_REVOCATION_TEST_URL;
if (url && !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
  throw new Error("Sahraa integration tests require a disposable localhost database");
}

describe.skipIf(!url)("Sahraa conditional saves — real PostgreSQL", () => {
  const schemaName = `sahraa_cas_${randomUUID().replaceAll("-", "")}`;
  let admin: Pool;
  let pool: Pool;
  let created = false;
  const active = () => ({
    ...defaultSahraaTvBlockConfig(),
    isActive: true,
    videoUrl: "https://example.invalid/video.mp4",
    updatedAt: "2026-10-01T19:30:00.000Z",
  });

  beforeAll(async () => {
    admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`CREATE SCHEMA ${schemaName}`);
    created = true;
    pool = new Pool({ connectionString: url, max: 4, options: `-c search_path=${schemaName}` });
    database.db = drizzle(pool);
    await pool.query(`CREATE TABLE system_settings (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE,
      value jsonb NOT NULL, category text NOT NULL DEFAULT 'system',
      is_public boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    )`);
  });
  beforeEach(async () => { await pool.query("TRUNCATE system_settings"); });
  afterAll(async () => {
    await pool?.end();
    if (created) await admin.query(`DROP SCHEMA ${schemaName} CASCADE`);
    await admin?.end();
  });

  it("rejects a concurrent first save instead of replacing it", async () => {
    expect(await readSahraaTvBlockSetting()).toBeNull();
    await compareAndSetSahraaTvBlockSetting(null, { ...active(), isActive: false });
    await expect(compareAndSetSahraaTvBlockSetting(null, active())).rejects.toMatchObject({
      code: "SAHRAA_TV_BLOCK_WRITE_CONFLICT",
    });
    expect((await readSahraaTvBlockSetting())?.rawValue).toMatchObject({ isActive: false });
  });

  it("preserves a hide against a delayed activation and handles microsecond timestamps", async () => {
    await compareAndSetSahraaTvBlockSetting(null, active());
    await pool.query("UPDATE system_settings SET updated_at = '2026-10-01 19:30:00.123456'");
    const beforeSlowActivation = await readSahraaTvBlockSetting();
    await compareAndSetSahraaTvBlockSetting(beforeSlowActivation, { ...active(), isActive: false });
    await expect(compareAndSetSahraaTvBlockSetting(beforeSlowActivation, active())).rejects.toMatchObject({
      code: "SAHRAA_TV_BLOCK_WRITE_CONFLICT",
    });
    expect((await readSahraaTvBlockSetting())?.rawValue).toMatchObject({ isActive: false });
  });

  it("allows exactly one simultaneous update from the same snapshot", async () => {
    await compareAndSetSahraaTvBlockSetting(null, active());
    const snapshot = await readSahraaTvBlockSetting();
    const outcomes = await Promise.allSettled([
      compareAndSetSahraaTvBlockSetting(snapshot, { ...active(), title: "one" }),
      compareAndSetSahraaTvBlockSetting(snapshot, { ...active(), title: "two" }),
    ]);
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((r) => r.status === "rejected")).toHaveLength(1);
  });

  it("distinguishes an existing JSON null setting from an absent row", async () => {
    await pool.query("INSERT INTO system_settings (key, value) VALUES ($1, 'null'::jsonb)", ["sahraa_tv_block"]);
    const snapshot = await readSahraaTvBlockSetting();
    expect(snapshot).not.toBeNull();
    expect(snapshot?.rawValue).toBeNull();
    await compareAndSetSahraaTvBlockSetting(snapshot, { ...active(), isActive: false });
    expect((await readSahraaTvBlockSetting())?.rawValue).toMatchObject({ isActive: false });
  });
});
