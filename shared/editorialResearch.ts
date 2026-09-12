import { z } from "zod";

export const EDITORIAL_RESEARCH_FEATURE = "editorial-research";
// Explicit system administrator aliases; generic admin or AI permissions do not grant access.
export const EDITORIAL_RESEARCH_ROLES = ["system_admin", "system.admin", "superadmin", "super_admin"] as const;
export const EDITORIAL_RESEARCH_MODEL = "gpt-6-astra";
export const researchRequestSchema = z.object({
  requestId: z.string().uuid(),
  topic: z.string().trim().min(20, "اكتب موضوعًا واضحًا من 20 حرفًا على الأقل.").max(2000),
}).strict();
export type ResearchRequest = z.infer<typeof researchRequestSchema>;
export const researchStatusSchema = z.enum(["queued", "starting", "researching", "editing", "cancelling", "completed", "failed", "cancelled"]);
export type ResearchStatus = z.infer<typeof researchStatusSchema>;
export const ACTIVE_RESEARCH_STATUSES: ResearchStatus[] = ["queued", "starting", "researching", "editing", "cancelling"];
export const researchStatusLabels: Record<ResearchStatus, string> = {
  queued: "في انتظار البحث", starting: "جارٍ بدء البحث", researching: "جارٍ جمع المصادر ومقارنتها",
  editing: "جارٍ إعداد التقرير", cancelling: "جارٍ إيقاف البحث", completed: "جاهز للمراجعة", failed: "تعذر إكمال المهمة", cancelled: "أُلغيت المهمة",
};
const sourceSchema = z.object({ title: z.string().trim().min(1).max(300), url: z.string().url().max(2000).refine(u => /^https?:\/\//.test(u)), evidence: z.string().trim().min(1).max(2000) }).strict();
export const researchBundleSchema = z.object({
  summary: z.string().trim().min(30).max(16000),
  sources: z.array(sourceSchema).min(1).max(8),
  openQuestions: z.array(z.string().trim().min(1).max(1000)).max(12),
}).strict();
export type ResearchBundle = z.infer<typeof researchBundleSchema>;
export interface ResearchUsage { input_tokens: number; output_tokens: number; total_tokens: number; input_tokens_details?: { cached_tokens: number } }
export interface ResearchResult {
  headline: string; altHeadlines: string[]; body: string; editorNotes: string[];
  sources: { title: string; url: string }[]; riskFlags: string[]; pushText: null; enVersion: null;
  meta: { task: "report"; modelId: string; fallbackUsed: boolean; verificationRecommended: boolean };
}
export interface ResearchJob {
  id: string; topic: string; status: ResearchStatus; createdAt: string; updatedAt: string;
  error: string | null; research: ResearchBundle | null; result: ResearchResult | null;
  usage: ResearchUsage | null;
}
export interface ResearchCapabilities { enabled: boolean; reason: string | null; dailyLimit: number; maxMinutes: number }
