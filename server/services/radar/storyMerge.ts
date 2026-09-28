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
  const setA = new Set(significantTokens(a));
  const setB = new Set(significantTokens(b));
  if (setA.size < MIN_TOKENS || setB.size < MIN_TOKENS) return false;
  let common = 0;
  for (const token of setA) if (setB.has(token)) common++;
  if (common < MIN_COMMON) return false;
  return common / Math.min(setA.size, setB.size) >= threshold;
}

/**
 * يعيد خريطة: قصة مُضمومة ← القصة الباقية. اتحاد مجموعات (union-find) حتى
 * تتوحد السلاسل (أ≈ب، ب≈ج)، والباقية هي الأكبر حجمًا ثم الأسبق في القائمة.
 */
export function planStoryMerges(stories: StoryTitle[]): Map<string, string> {
  const parent = stories.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < stories.length; i++) {
    for (let j = i + 1; j < stories.length; j++) {
      if (find(i) === find(j)) continue;
      if (sameEventTitles(stories[i].title, stories[j].title)) parent[find(j)] = find(i);
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
