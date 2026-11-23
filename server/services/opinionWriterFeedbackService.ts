// خدمة استبيان كتّاب الرأي: قراءة رد الكاتب وحفظه (صف واحد لكل كاتب)،
// وقائمة الإدارة مع الاسم والبريد من حساب الكاتب.

import { desc, eq, sql } from "drizzle-orm";
import { opinionWriterFeedback, users } from "@shared/schema";
import type { OpinionWriterFeedbackInput } from "@shared/opinionWriterFeedback";
import { db } from "../db";

export type OpinionWriterFeedbackDto = {
  interests: string[];
  otherInterest: string | null;
  suggestions: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpinionWriterFeedbackAdminRow = OpinionWriterFeedbackDto & {
  id: string;
  userId: string;
  name: string;
  email: string | null;
};

function fullName(firstName: string | null, lastName: string | null, email: string | null): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || email || "كاتب رأي";
}

export async function getWriterIdentity(userId: string) {
  const [row] = await db
    .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { name: fullName(row.firstName, row.lastName, null), email: row.email ?? null };
}

export async function getMyOpinionWriterFeedback(userId: string): Promise<OpinionWriterFeedbackDto | null> {
  const [row] = await db
    .select()
    .from(opinionWriterFeedback)
    .where(eq(opinionWriterFeedback.userId, userId))
    .limit(1);
  if (!row) return null;
  return {
    interests: row.interests ?? [],
    otherInterest: row.otherInterest,
    suggestions: row.suggestions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function saveMyOpinionWriterFeedback(
  userId: string,
  input: OpinionWriterFeedbackInput,
): Promise<OpinionWriterFeedbackDto> {
  const [row] = await db
    .insert(opinionWriterFeedback)
    .values({
      userId,
      interests: input.interests,
      otherInterest: input.otherInterest,
      suggestions: input.suggestions,
    })
    .onConflictDoUpdate({
      target: opinionWriterFeedback.userId,
      set: {
        interests: input.interests,
        otherInterest: input.otherInterest,
        suggestions: input.suggestions,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return {
    interests: row.interests ?? [],
    otherInterest: row.otherInterest,
    suggestions: row.suggestions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listOpinionWriterFeedback(): Promise<OpinionWriterFeedbackAdminRow[]> {
  const rows = await db
    .select({
      id: opinionWriterFeedback.id,
      userId: opinionWriterFeedback.userId,
      interests: opinionWriterFeedback.interests,
      otherInterest: opinionWriterFeedback.otherInterest,
      suggestions: opinionWriterFeedback.suggestions,
      createdAt: opinionWriterFeedback.createdAt,
      updatedAt: opinionWriterFeedback.updatedAt,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(opinionWriterFeedback)
    .leftJoin(users, eq(opinionWriterFeedback.userId, users.id))
    .orderBy(desc(opinionWriterFeedback.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    name: fullName(row.firstName, row.lastName, row.email),
    email: row.email ?? null,
    interests: row.interests ?? [],
    otherInterest: row.otherInterest,
    suggestions: row.suggestions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
