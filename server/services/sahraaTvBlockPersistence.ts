/**
 * Persistence for the Sahraa TV block.
 *
 * This feature owns its system_settings reads and its conditional writes. The
 * generic storage upsert is intentionally not used for admin saves because a
 * resolver/mirror may run for several seconds while another admin hides the
 * block.
 */
import { and, eq, sql } from "drizzle-orm";
import { systemSettings } from "@shared/schema";
import { db } from "../db";
import { SAHRAA_TV_BLOCK_KEY, type SahraaTvBlockConfig } from "./sahraaTvBlockUtils";

export interface SahraaTvBlockSettingSnapshot {
  rawValue: unknown;
}

export class SahraaTvBlockWriteConflictError extends Error {
  readonly code = "SAHRAA_TV_BLOCK_WRITE_CONFLICT";

  constructor() {
    super("SAHRAA_TV_BLOCK_WRITE_CONFLICT");
    this.name = "SahraaTvBlockWriteConflictError";
  }
}

/** Read the raw row so malformed values remain distinguishable from a missing row. */
export async function readSahraaTvBlockSetting(): Promise<SahraaTvBlockSettingSnapshot | null> {
  const rows = await db
    .select({ rawValue: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, SAHRAA_TV_BLOCK_KEY));

  const row = rows[0];
  return row ? { rawValue: row.rawValue } : null;
}

/**
 * Replace the row only if the exact snapshot that was read before slow work is
 * still current. An absent snapshot uses INSERT ... ON CONFLICT DO NOTHING so
 * a concurrent first save is reported as a conflict rather than overwritten.
 */
export async function compareAndSetSahraaTvBlockSetting(
  snapshot: SahraaTvBlockSettingSnapshot | null,
  value: SahraaTvBlockConfig,
): Promise<void> {
  if (snapshot === null) {
    const inserted = await db
      .insert(systemSettings)
      .values({
        key: SAHRAA_TV_BLOCK_KEY,
        value,
        category: "content",
        isPublic: true,
      })
      .onConflictDoNothing({ target: systemSettings.key })
      .returning({ id: systemSettings.id });

    if (inserted.length === 0) throw new SahraaTvBlockWriteConflictError();
    return;
  }

  const updated = await db
    .update(systemSettings)
    .set({ value, category: "content", isPublic: true, updatedAt: new Date() })
    .where(
      and(
        eq(systemSettings.key, SAHRAA_TV_BLOCK_KEY),
        sql`${systemSettings.value} IS NOT DISTINCT FROM ${JSON.stringify(snapshot.rawValue)}::jsonb`,
      ),
    )
    .returning({ id: systemSettings.id });

  if (updated.length === 0) throw new SahraaTvBlockWriteConflictError();
}
