/**
 * مخزن Drizzle لغرفة العمليات (ADR-001: كل الاستعلامات هنا، لا db في المسارات).
 * claimStep ذري: UPDATE … WHERE status = 'ready' RETURNING — يمنع تنفيذ خطوة
 * واحدة مرتين إن تزامن الكرون مع دفعة فورية أو تعددت النسخ.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { opsTaskEvents, opsTasks, type InsertOpsTask, type InsertOpsTaskEvent, type OpsTaskEventRow, type OpsTaskRow } from "@shared/schema";
import { OPS_ACTIVE_STATUSES, type OpsTaskStatus } from "@shared/opsRoom";
import type { OpsStore, TaskPatch } from "./types";

export class DrizzleOpsStore implements OpsStore {
  async insertTask(row: InsertOpsTask): Promise<OpsTaskRow> {
    const [inserted] = await db.insert(opsTasks).values(row).returning();
    return inserted;
  }

  async getTask(id: string): Promise<OpsTaskRow | undefined> {
    const [row] = await db.select().from(opsTasks).where(eq(opsTasks.id, id)).limit(1);
    return row;
  }

  async updateTask(id: string, patch: TaskPatch): Promise<OpsTaskRow | undefined> {
    const [row] = await db.update(opsTasks).set(patch).where(eq(opsTasks.id, id)).returning();
    return row;
  }

  async claimStep(id: string, patch: TaskPatch): Promise<OpsTaskRow | undefined> {
    const [row] = await db
      .update(opsTasks)
      .set(patch)
      .where(and(eq(opsTasks.id, id), eq(opsTasks.status, "ready")))
      .returning();
    return row;
  }

  async listSteps(parentId: string): Promise<OpsTaskRow[]> {
    return db.select().from(opsTasks).where(eq(opsTasks.parentId, parentId)).orderBy(opsTasks.stepIndex);
  }

  async listMainTasks(opts?: { statuses?: OpsTaskStatus[]; limit?: number }): Promise<OpsTaskRow[]> {
    const conds = [isNull(opsTasks.parentId)];
    if (opts?.statuses?.length) conds.push(inArray(opsTasks.status, opts.statuses));
    return db
      .select()
      .from(opsTasks)
      .where(and(...conds))
      .orderBy(desc(opsTasks.createdAt))
      .limit(opts?.limit ?? 100);
  }

  async findRecentDuplicate(taskType: string, normalizedTitle: string, sinceMs: number): Promise<OpsTaskRow | undefined> {
    const since = new Date(Date.now() - sinceMs);
    const [row] = await db
      .select()
      .from(opsTasks)
      .where(
        and(
          isNull(opsTasks.parentId),
          eq(opsTasks.taskType, taskType),
          inArray(opsTasks.status, [...OPS_ACTIVE_STATUSES]),
          gte(opsTasks.createdAt, since),
          sql`lower(regexp_replace(trim(${opsTasks.title}), '\\s+', ' ', 'g')) = ${normalizedTitle}`,
        ),
      )
      .limit(1);
    return row;
  }

  async insertEvent(row: InsertOpsTaskEvent): Promise<void> {
    await db.insert(opsTaskEvents).values(row);
  }

  async listEvents(taskId: string, limit = 200): Promise<OpsTaskEventRow[]> {
    return db.select().from(opsTaskEvents).where(eq(opsTaskEvents.taskId, taskId)).orderBy(opsTaskEvents.createdAt).limit(limit);
  }

  async listRecentEvents(limit = 50): Promise<OpsTaskEventRow[]> {
    return db.select().from(opsTaskEvents).orderBy(desc(opsTaskEvents.createdAt)).limit(limit);
  }
}
