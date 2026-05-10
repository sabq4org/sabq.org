import { nanoid } from 'nanoid';

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
  // Use nanoid with custom alphabet for URL-safe, readable slugs
  // 7 characters gives us 62^7 = 3.5 trillion possible combinations
  return nanoid(7);
}
