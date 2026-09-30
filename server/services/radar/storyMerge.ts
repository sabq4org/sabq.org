/**
 * توحيد القصص المتفرقة — نقي بلا DB.
 *
 * التجميع قبل التحليل يقارن نصوصًا بلغات مختلفة، فقد ينقسم الحدث الواحد إلى
 * عدة قصص (نسخة روسية وأخرى إنجليزية…). بعد التحليل تصبح كل العناوين عربية،
 * فتُقارن مباشرة: عنوانان يشتركان في معظم كلماتهما الدالة = قصة واحدة.
 * محافظ عمدًا: عناوين قصيرة أو اشتراك قليل لا يُدمج (دمج خاطئ أسوأ من تكرار).
 */
import { significantTokens } from "./textNormalize";

export interface StoryTitle {
  id: string;
  title: string;
  /** حجم القصة (عدد موادها) — القصة الأكبر تبقى والبقية تُضم إليها */
  size: number;
}

const MIN_TOKENS = 4;
const MIN_COMMON = 4;

function mergeThreshold(): number {
  const n = Number(process.env.RADAR_STORY_MERGE_THRESHOLD ?? 0.75);
  return Number.isFinite(n) && n > 0.5 && n <= 1 ? n : 0.75;
}

export function sameEventTitles(a: string, b: string, threshold = mergeThreshold()): boolean {
  return sameEventTokens(new Set(significantTokens(a)), new Set(significantTokens(b)), threshold);
}

function sameEventTokens(setA: Set<string>, setB: Set<string>, threshold: number): boolean {
  if (setA.size < MIN_TOKENS || setB.size < MIN_TOKENS) return false;
  let common = 0;
  for (const token of setA) if (setB.has(token)) common++;
  if (common < MIN_COMMON) return false;
  return common / Math.min(setA.size, setB.size) >= threshold;
}

/**
 * يعيد خريطة: قصة مُضمومة ← القصة الباقية. اتحاد مجموعات (union-find) حتى
 * تتوحد السلاسل (أ≈ب، ب≈ج)، والباقية هي الأكبر حجمًا ثم الأسبق في القائمة.
 *
 * تعمل على خيط Node الوحيد: تُطبَّع العناوين مرة واحدة، ولا تُقارن إلا الأزواج
 * التي تشترك في MIN_COMMON كلمات على الأقل (فهرس معكوس). المقارنة الكاملة لكل
 * زوج (~4.5 مليون لـ3000 قصة) كانت تجمّد الـAPI نحو 25 ثانية كل 5 دقائق.
 */
export function planStoryMerges(stories: StoryTitle[]): Map<string, string> {
  const threshold = mergeThreshold();
  const tokens = stories.map((s) => new Set(significantTokens(s.title)));
  const postings = new Map<string, number[]>();
  tokens.forEach((set, i) => {
    if (set.size < MIN_TOKENS) return;
    for (const token of set) {
      const list = postings.get(token);
      if (list) list.push(i);
      else postings.set(token, [i]);
    }
  });

  const parent = stories.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const shared = new Map<number, number>();
  for (let i = 0; i < stories.length; i++) {
    if (tokens[i].size < MIN_TOKENS) continue;
    shared.clear();
    for (const token of tokens[i]) {
      for (const j of postings.get(token) ?? []) if (j > i) shared.set(j, (shared.get(j) ?? 0) + 1);
    }
    for (const [j, common] of shared) {
      if (common < MIN_COMMON || find(i) === find(j)) continue;
      if (sameEventTokens(tokens[i], tokens[j], threshold)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, number[]>();
  stories.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });
  const plan = new Map<string, string>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const keeper = members.reduce((best, i) => (stories[i].size > stories[best].size ? i : best), members[0]);
    for (const i of members) if (i !== keeper) plan.set(stories[i].id, stories[keeper].id);
  }
  return plan;
}
