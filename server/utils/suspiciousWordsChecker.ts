import { db } from "../db";
import { suspiciousWords } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export interface SuspiciousWordMatch {
  word: string;
  category: string;
  severity: string;
  wordId: string;
}

export interface CheckResult {
  hasSuspiciousWords: boolean;
  foundWords: SuspiciousWordMatch[];
  highestSeverity: string | null;
  shouldHoldForReview: boolean;
}

export async function checkTextForSuspiciousWords(text: string): Promise<CheckResult> {
  try {
    const activeWords = await db
      .select()
      .from(suspiciousWords)
      .where(eq(suspiciousWords.isActive, true));

    const foundWords: SuspiciousWordMatch[] = [];
    const lowerText = text.toLowerCase();

    for (const wordEntry of activeWords) {
      let matched = false;
      const lowerWord = wordEntry.word.toLowerCase();

      switch (wordEntry.matchType) {
        case "exact":
          const exactRegex = new RegExp(`\\b${escapeRegex(lowerWord)}\\b`, "i");
          matched = exactRegex.test(lowerText);
          break;
        case "contains":
          matched = lowerText.includes(lowerWord);
          break;
        case "starts_with":
          const words = lowerText.split(/\s+/);
          matched = words.some(w => w.startsWith(lowerWord));
          break;
        case "ends_with":
          const wordsEnd = lowerText.split(/\s+/);
          matched = wordsEnd.some(w => w.endsWith(lowerWord));
          break;
        case "regex":
          try {
            const regex = new RegExp(wordEntry.word, "i");
            matched = regex.test(text);
          } catch (e) {
            matched = lowerText.includes(lowerWord);
          }
          break;
        default:
          matched = lowerText.includes(lowerWord);
      }

      if (matched) {
        foundWords.push({
          word: wordEntry.word,
          category: wordEntry.category,
          severity: wordEntry.severity,
          wordId: wordEntry.id,
        });
      }
    }

    const severityOrder = ["low", "medium", "high", "critical"];
    let highestSeverity: string | null = null;
    
    for (const word of foundWords) {
      if (!highestSeverity || severityOrder.indexOf(word.severity) > severityOrder.indexOf(highestSeverity)) {
        highestSeverity = word.severity;
      }
    }

    const shouldHoldForReview = foundWords.length > 0;

    return {
      hasSuspiciousWords: foundWords.length > 0,
      foundWords,
      highestSeverity,
      shouldHoldForReview,
    };
  } catch (error) {
    console.error("[SuspiciousWords] Error checking text:", error);
    return {
      hasSuspiciousWords: false,
      foundWords: [],
      highestSeverity: null,
      shouldHoldForReview: false,
    };
  }
}

export async function incrementSuspiciousWordFlagCount(wordIds: string[]): Promise<void> {
  try {
    for (const wordId of wordIds) {
      await db
        .update(suspiciousWords)
        .set({ 
          flagCount: sql`${suspiciousWords.flagCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(suspiciousWords.id, wordId));
    }
  } catch (error) {
    console.error("[SuspiciousWords] Error incrementing flag count:", error);
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
