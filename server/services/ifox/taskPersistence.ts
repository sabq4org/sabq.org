import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { ifoxEditorialCalendar } from "@shared/schema";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function claimCalendarTask(id: string, userId: string) {
  const [claim] = await db.update(ifoxEditorialCalendar)
    .set({ status: "in_progress", updatedAt: new Date(), updatedBy: userId })
    .where(and(eq(ifoxEditorialCalendar.id, id), eq(ifoxEditorialCalendar.status, "planned")))
    .returning({ updatedAt: ifoxEditorialCalendar.updatedAt });
  return claim;
}

/** Hold the claim row until BOTH the article and its task link are committed. */
export async function completeCalendarTask<T extends { id: string }>(id: string, claimedAt: Date,
  userId: string, published: boolean, create: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    const [owned] = await tx.select({ id: ifoxEditorialCalendar.id }).from(ifoxEditorialCalendar)
      .where(and(eq(ifoxEditorialCalendar.id, id), eq(ifoxEditorialCalendar.status, "in_progress"),
        eq(ifoxEditorialCalendar.updatedAt, claimedAt))).for("update");
    if (!owned) throw new Error("iFox task ownership lost");
    const article = await create(tx);
    await tx.update(ifoxEditorialCalendar).set({ status: "completed", articleId: article.id,
      updatedAt: new Date(), updatedBy: userId,
      ...(published ? { actualPublishedAt: new Date() } : {}),
    }).where(eq(ifoxEditorialCalendar.id, id));
    return article;
  });
}
