/**
 * وصف المشهد لصور الأخبار التلقائية.
 *
 * لماذا؟ (تشخيص 2026-08-28) المسار التلقائي كان يرسل للنموذج «قائمة بيانات»
 * (Title / Category / Style / Mood) فيخرج رموزًا وخرائط وأيقونات وبوصلات بدل
 * مشهد صحفي، بينما المسار اليدوي — الذي يكتب فيه المحرر وصفًا لمشهد ملموس —
 * يعطي النتيجة الأنيقة المعتادة. هنا نكتب الوصف نفسه آليًا بنموذج نصي سريع،
 * ثم يُركَّب مع نمط الصورة عبر composeImagePrompt كالمسار اليدوي تمامًا.
 */
import { aiGateway } from "../ai/gateway";

export const IMAGE_SCENE_BRIEF_FEATURE = "image-scene-brief";
const SCENE_BRIEF_TIMEOUT_MS = 15_000;

/** ما يُمنع في صور الأخبار التلقائية — يُضاف للـnegative prompt ولنص المشهد. */
export const NEWS_IMAGE_AVOID_LIST =
  "maps, map outlines, compass roses, icons, symbols, pictograms, infographic elements, " +
  "labels, arrows, diagrams, split-screen collages, childish cartoon style, exaggerated proportions, clip-art";

export interface SceneBriefInput {
  title: string;
  summary?: string;
  category?: string;
  language: "ar" | "en" | "ur";
}

const SYSTEM_PROMPT = `You write art-direction briefs for a Saudi news publisher's illustrators.
Given a news headline (and summary), describe ONE concrete, real-world scene that visually tells the story.

Rules:
- Exactly one scene, one clear focal point, cinematic wide 16:9 composition.
- Real places, weather, people, vehicles, objects — things a camera or illustrator can depict.
- Saudi/Arab context when relevant: modern Saudi cityscapes, desert, traditional dress, local architecture.
- Never describe maps, map outlines, compasses, icons, symbols, charts, diagrams, arrows, labels, collages, or text of any kind.
- No real identifiable individuals' faces; no logos.
- Neutral, credible editorial tone. 60–110 English words. Output JSON only: {"scene": "..."}`;

/** وصف احتياطي حتمي عند تعذر النموذج النصي — أفضل من قائمة بيانات خام. */
export function fallbackSceneBrief(input: SceneBriefInput): string {
  const topic = input.summary?.trim() || input.title.trim();
  return (
    `ONE concrete real-world scene that tells this news story: ${topic}. ` +
    `Wide cinematic 16:9 composition with a single clear focal point, real places and people in a Saudi context, ` +
    `credible editorial tone.`
  );
}

/** يبني نص المضمون النهائي (المشهد + توجيه التكوين + الممنوعات) لتمريره لـcomposeImagePrompt. */
export function buildSceneContent(scene: string): string {
  return (
    `Editorial image for a Saudi news article. Depict ONE concrete real-world scene, not a diagram.\n\n` +
    `Scene brief: ${scene.trim()}\n\n` +
    `Composition: cinematic wide 16:9, one clear focal point, atmospheric depth, realistic proportions, ` +
    `mature editorial tone like a quality newspaper.\n\n` +
    `Strictly avoid: ${NEWS_IMAGE_AVOID_LIST}, and ANY text, letters, or numbers in any language.`
  );
}

export async function generateSceneBrief(input: SceneBriefInput, userId?: string): Promise<{ scene: string; source: "ai" | "fallback" }> {
  try {
    const response = await aiGateway.complete({
      feature: IMAGE_SCENE_BRIEF_FEATURE,
      userId,
      timeoutMs: SCENE_BRIEF_TIMEOUT_MS,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            `Headline: ${input.title}\n` +
            (input.summary ? `Summary: ${input.summary}\n` : "") +
            (input.category ? `Section: ${input.category}\n` : "") +
            `Language of the article: ${input.language}`,
        },
      ],
      options: { jsonMode: true, maxTokens: 400, temperature: 0.7 },
    });
    const raw = (response.content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { scene?: unknown };
    const scene = typeof parsed.scene === "string" ? parsed.scene.trim() : "";
    if (scene.length >= 30) return { scene, source: "ai" };
    console.warn("[Image Scene] Empty/short scene from model — using fallback brief");
  } catch (error) {
    console.warn("[Image Scene] Scene brief failed — using fallback brief:", (error as Error)?.message);
  }
  return { scene: fallbackSceneBrief(input), source: "fallback" };
}
