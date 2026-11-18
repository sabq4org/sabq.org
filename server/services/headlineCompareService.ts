/**
 * مقارنة عناوين متعددة النماذج. المنطق كان داخل POST /api/ai/compare-headlines؛
 * استُخرج هنا ليستعمله مسار المحرر ومسار نشر سبق بنفس البرومبت ونفس النماذج.
 */
export interface HeadlineSuggestion {
  provider: string;
  model: string;
  title: string;
  error?: string;
}

export function buildCompareHeadlinesPrompt(content: string, currentTitle?: string): string {
  return `أنت محرر خبير في كتابة العناوين الصحفية الجذابة باللغة العربية.

المحتوى:
${content.substring(0, 500)}...

${currentTitle ? `العنوان الحالي: ${currentTitle}\n\n` : ''}
المطلوب: اقترح عنوانًا واحدًا جذابًا وواضحًا يلخص المحتوى (لا تكتب أي شيء آخر، فقط العنوان).`;
}

export async function compareHeadlines(content: string, currentTitle?: string): Promise<HeadlineSuggestion[]> {
  const { aiManager, AI_MODELS } = await import("../ai-manager");
  const prompt = buildCompareHeadlinesPrompt(content, currentTitle);
  const results = await aiManager.generateMultiple(prompt, [
    { ...AI_MODELS.GPT5, maxTokens: 512, feature: "content-tools" },
    { ...AI_MODELS.CLAUDE_SONNET, maxTokens: 512, temperature: 0.8, feature: "content-tools" },
    { ...AI_MODELS.GEMINI_FLASH, maxTokens: 512, temperature: 0.8, feature: "content-tools" },
  ]);
  return results.map((result) => ({
    provider: result.provider,
    model: result.model,
    title: result.content.replace(/^["']|["']$/g, '').trim(),
    error: result.error,
  }));
}
