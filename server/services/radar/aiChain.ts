/**
 * سلسلة نماذج الرادار — aiManager.generate يرمي الخطأ بعد استنفاد محاولاته
 * (لا يعيده في response.error)، فالتعاقب على البدائل يتطلب التقاطًا لكل حلقة.
 */
import { aiManager, type AIModelConfig, type AIResponse } from "../../ai-manager";

export async function generateWithFallback(
  prompt: string,
  chain: AIModelConfig[]
): Promise<AIResponse> {
  let lastError = "";
  for (const config of chain) {
    try {
      const response = await aiManager.generate(prompt, config);
      if (response.error) {
        lastError = response.error;
        continue;
      }
      // لا تقبل مخرجات مبتورة — انتقل للبديل بدل كتابة مسودة ناقصة
      if (response.truncated) {
        lastError = `${config.provider}/${config.model}: response truncated (max tokens)`;
        continue;
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`[Radar] all models failed: ${lastError}`);
}
