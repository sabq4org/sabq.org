import { db } from "../db";
import { suspiciousWords } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export interface SuspiciousWordMatch {
  word: string;
  category: string;
  severity: string;
  action: string;
  wordId: string;
}

export interface CheckResult {
  hasSuspiciousWords: boolean;
  foundWords: SuspiciousWordMatch[];
  highestSeverity: string | null;
  shouldHoldForReview: boolean;
  shouldAutoReject: boolean;
}

/**
 * Normalize Arabic text so a stored word matches the same phrase
 * regardless of cosmetic variations the reader typed:
 *   - Tashkeel (diacritics U+064B..U+0652, U+0670)
 *   - Tatweel (U+0640) — readers paste it to lengthen letters
 *   - Hamza variants: أ إ آ ٱ → ا
 *   - Final ى → ي
 *   - Ta marbuta ة → ه (reader often types either form)
 *   - Hamza-bearing letters ؤ → و, ئ → ي
 *
 * Without this, "كلمَة" or "كلــمة" or "أحمد" failed to match the
 * stored "كلمة" / "احمد" — comments slipped past the filter (reported
 * 2026-05-24, user saw banned phrases published verbatim).
 */
function normalizeArabic(input: string): string {
  return input
    .replace(/[ً-ْٰ]/g, "")  // tashkeel
    .replace(/ـ/g, "")                  // tatweel
    .replace(/[آأإٱ]/g, "ا") // آأإٱ → ا
    .replace(/ى/g, "ي")            // ى → ي
    .replace(/ة/g, "ه")            // ة → ه
    .replace(/ؤ/g, "و")            // ؤ → و
    .replace(/ئ/g, "ي");           // ئ → ي
}

export async function checkTextForSuspiciousWords(text: string): Promise<CheckResult> {
  try {
    const activeWords = await db
      .select()
      .from(suspiciousWords)
      .where(eq(suspiciousWords.isActive, true));

    const foundWords: SuspiciousWordMatch[] = [];
    const lowerText = normalizeArabic(text.toLowerCase());

    for (const wordEntry of activeWords) {
      let matched = false;
      const lowerWord = normalizeArabic(wordEntry.word.toLowerCase());

      switch (wordEntry.matchType) {
        case "exact":
          // Unicode-aware word boundary: JS \b only works with ASCII \w
          // (latin letters + digits + underscore), so Arabic text never
          // matches with \b. Use lookbehind/lookahead on \p{L}/\p{N} so the
          // word must be bounded by non-letter, non-digit chars.
          const exactRegex = new RegExp(
            `(?<![\\p{L}\\p{N}_])${escapeRegex(lowerWord)}(?![\\p{L}\\p{N}_])`,
            "iu"
          );
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
          action: wordEntry.action ?? "review",
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

    const shouldAutoReject = foundWords.some(w => w.action === "reject");
    const shouldHoldForReview = foundWords.length > 0 && !shouldAutoReject;

    return {
      hasSuspiciousWords: foundWords.length > 0,
      foundWords,
      highestSeverity,
      shouldHoldForReview,
      shouldAutoReject,
    };
  } catch (error) {
    console.error("[SuspiciousWords] Error checking text:", error);
    return {
      hasSuspiciousWords: false,
      foundWords: [],
      highestSeverity: null,
      shouldHoldForReview: false,
      shouldAutoReject: false,
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
