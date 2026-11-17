import { botEditorOperations } from "@shared/schema";
import { db } from "../db";

/** Do not put prompts, credentials or generated content in metadata. */
export async function recordBotEditorOperation(input: {
  actorId: string | null;
  operation: string;
  outcome: "started" | "succeeded" | "failed";
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await db.insert(botEditorOperations).values({ ...input, metadata: { actorName: "نشر سبق", originalSource: null, ...input.metadata } });
}
