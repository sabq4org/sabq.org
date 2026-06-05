import { customAlphabet } from 'nanoid';

/** URL-safe lowercase IDs for writer-created topics (validation requires a-z only). */
const shortTopicSlug = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 7);

const arabicToEnglishMap: Record<string, string> = {
  'ا': 'a',
  'أ': 'a',
  'إ': 'a',
  'آ': 'a',
  'ب': 'b',
  'ت': 't',
  'ث': 'th',
  'ج': 'j',
  'ح': 'h',
  'خ': 'kh',
  'د': 'd',
  'ذ': 'dh',
  'ر': 'r',
  'ز': 'z',
  'س': 's',
  'ش': 'sh',
  'ص': 's',
  'ض': 'd',
  'ط': 't',
  'ظ': 'z',
  'ع': 'a',
  'غ': 'gh',
  'ف': 'f',
  'ق': 'q',
  'ك': 'k',
  'ل': 'l',
  'م': 'm',
  'ن': 'n',
  'ه': 'h',
  'و': 'w',
  'ي': 'y',
  'ى': 'a',
  'ء': '',
  'ئ': 'y',
  'ؤ': 'w',
};

const arabicDiacritics = /[\u064B-\u065F\u0670]/g;

function removeDiacritics(text: string): string {
  return text.replace(arabicDiacritics, '');
}

function handleTaaMarbuta(text: string): string {
  return text.replace(/ة(\s|$)/g, 'a$1').replace(/ة/g, 'h');
}

export function transliterateToEnglish(arabicText: string): string {
  if (!arabicText) return '';
  
  let result = removeDiacritics(arabicText);
  
  result = handleTaaMarbuta(result);
  
  let transliterated = '';
  for (const char of result) {
    if (arabicToEnglishMap[char] !== undefined) {
      transliterated += arabicToEnglishMap[char];
    } else {
      transliterated += char;
    }
  }
  
  return transliterated.toLowerCase();
}

/**
 * Generate a short, URL-friendly slug for social media sharing.
 * Uses only 7 alphanumeric characters for maximum shareability.
 * Example: "a7B3kF9" instead of long transliterated slugs.
 * 
 * @param _text - The original text (kept for API compatibility, but not used)
 * @returns A short 7-character alphanumeric slug
 */
export function generateEnglishSlug(_text?: string): string {
  // Lowercase-only alphabet — TopicsManagement validates /^[a-z0-9-]+$/ (no uppercase).
  return shortTopicSlug();
}

/** Normalize a topic slug for storage/validation (lowercase, strip invalid chars). */
export function normalizeTopicSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
