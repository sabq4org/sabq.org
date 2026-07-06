/**
 * بوابات حياد لقطات VARA الذكية. الدوال هنا نقيّة وقابلة لاختبار الوحدة:
 * فلتر معجمي، فحص بنيوي خفيف، وتحقق أن الأرقام المذكورة موجودة في sourceStats.
 */
import {
  SNAP_BODY_MAX_CHARS,
  SNAP_HEADLINE_MAX_CHARS,
  SPORTS_SNAP_ACCENTS,
  SPORTS_SNAP_KINDS,
  type SportsSnapAccent,
  type SportsSnapKind,
} from "./config";

export const BANNED_SPORTS_SNAP_TERMS = [
  "سحق",
  "اكتساح",
  "اذلال",
  "تلقين درس",
  "دمر",
  "انهيار",
  "فضيحة",
  "مهزلة",
  "كارث",
  "مذبحة",
  "اعدام",
  "انتقام",
  "ثار",
  "ثأر",
  "غريم",
  "عقدة",
  "عدو",
  "حرب",
  "معركة",
  "صراع وجود",
] as const;

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;
const TATWEEL = /\u0640/g;
const NUMERIC_TOKEN_RE = /[0-9٠-٩۰-۹]+(?::[0-9٠-٩۰-۹]+|[.,٫٬][0-9٠-٩۰-۹]+)?/g;

export interface SportsSnapCandidate {
  kind: SportsSnapKind;
  headline: string;
  body: string;
  accent: SportsSnapAccent;
}

export interface GuardrailResult {
  ok: boolean;
  reasons: string[];
  bannedTerms?: string[];
  missingNumbers?: string[];
}

function ok(): GuardrailResult {
  return { ok: true, reasons: [] };
}

function fail(reason: string, extra: Partial<GuardrailResult> = {}): GuardrailResult {
  return { ok: false, reasons: [reason], ...extra };
}

export function normalizeArabicText(value: string): string {
  return value
    .toLocaleLowerCase("ar")
    .replace(ARABIC_DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

export function findBannedSnapTerms(text: string): string[] {
  const normalized = normalizeArabicText(text);
  const hits = new Set<string>();
  for (const term of BANNED_SPORTS_SNAP_TERMS) {
    if (normalized.includes(normalizeArabicText(term))) hits.add(term);
  }
  return [...hits];
}

export function validateNeutralLanguage(text: string): GuardrailResult {
  const bannedTerms = findBannedSnapTerms(text);
  if (bannedTerms.length === 0) return ok();
  return fail("banned_terms", { bannedTerms });
}

function charLength(value: string): number {
  return Array.from(value).length;
}

function normalizeNumericToken(token: string): string {
  const western = token.replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩".indexOf(digit);
    if (arabic >= 0) return String(arabic);
    const persian = "۰۱۲۳۴۵۶۷۸۹".indexOf(digit);
    return persian >= 0 ? String(persian) : digit;
  });
  return western.replace(/[٫٬,]/g, ".");
}

export function extractNumericTokens(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  const matches = text.match(NUMERIC_TOKEN_RE) ?? [];
  return matches.map(normalizeNumericToken);
}

function addNumberAndParts(numbers: Set<string>, token: string): void {
  numbers.add(token);
  for (const part of token.split(/[:.]/).filter(Boolean)) numbers.add(part);
}

export function collectGroundedNumbers(sourceStats: unknown): Set<string> {
  const grounded = new Set<string>();
  for (const token of extractNumericTokens(sourceStats)) addNumberAndParts(grounded, token);
  return grounded;
}

export function findUngroundedNumbers(text: string, sourceStats: unknown): string[] {
  const grounded = collectGroundedNumbers(sourceStats);
  const missing = new Set<string>();
  for (const token of extractNumericTokens(text)) {
    if (grounded.has(token)) continue;
    const parts = token.split(/[:.]/).filter(Boolean);
    if (parts.length > 1 && parts.every((part) => grounded.has(part))) continue;
    missing.add(token);
  }
  return [...missing];
}

export function validateNumbersAreGrounded(text: string, sourceStats: unknown): GuardrailResult {
  const missingNumbers = findUngroundedNumbers(text, sourceStats);
  if (missingNumbers.length === 0) return ok();
  return fail("ungrounded_numbers", { missingNumbers });
}

export function validateSnapCandidate(
  candidate: SportsSnapCandidate,
  sourceStats: unknown,
): GuardrailResult {
  const reasons: string[] = [];
  const bannedTerms = findBannedSnapTerms(`${candidate.headline}\n${candidate.body}`);
  const missingNumbers = findUngroundedNumbers(`${candidate.headline}\n${candidate.body}`, sourceStats);

  if (!SPORTS_SNAP_KINDS.has(candidate.kind)) reasons.push("invalid_kind");
  if (!SPORTS_SNAP_ACCENTS.has(candidate.accent)) reasons.push("invalid_accent");
  if (charLength(candidate.headline) > SNAP_HEADLINE_MAX_CHARS) reasons.push("headline_too_long");
  if (charLength(candidate.body) > SNAP_BODY_MAX_CHARS) reasons.push("body_too_long");
  if (bannedTerms.length > 0) reasons.push("banned_terms");
  if (missingNumbers.length > 0) reasons.push("ungrounded_numbers");

  return {
    ok: reasons.length === 0,
    reasons,
    ...(bannedTerms.length > 0 ? { bannedTerms } : {}),
    ...(missingNumbers.length > 0 ? { missingNumbers } : {}),
  };
}
