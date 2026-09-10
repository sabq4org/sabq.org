import { z } from "zod";

export const EDITORIAL_IMAGE_FEATURE_KEY = "editor-openai-images";

export const EDITORIAL_IMAGE_MODELS = [
  { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 · Flare" },
  { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 · Sunburst" },
] as const;

export const editorialImageRequestSchema = z.object({
  requestId: z.string().uuid(),
  prompt: z.string().trim().min(10, "اكتب وصفًا من 10 أحرف على الأقل").max(4000),
  model: z.enum(["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"]),
  size: z.enum(["1536x864", "1024x1024", "1024x1536"]),
  quality: z.enum(["low", "medium", "high"]),
}).strict();

export type EditorialImageRequest = z.infer<typeof editorialImageRequestSchema>;
export interface EditorialImageJob {
  id: string;
  status: "processing" | "completed" | "failed";
  model: string;
  imageUrl: string | null;
  error: string | null;
}
