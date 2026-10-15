/**
 * سلسلة نماذج الرادار — aiManager.generate يرمي الخطأ بعد استنفاد محاولاته
 * (لا يعيده في response.error)، فالتعاقب على البدائل يتطلب التقاطًا لكل حلقة.
 */
import { aiManager, type AIModelConfig, type AIResponse } from "../../ai-manager";
import { assertRadarEnabled, isRadarDisabledError } from "./runtime";

export async function generateWithFallback(
  prompt: string,
  chain: AIModelConfig[]
): Promise<AIResponse> {
  let lastError = "";
  for (const config of chain) {
    // افحص قبل كل مزوّد وبعده: التوقف أثناء نداء مزوّد لا يلغي النداء
    // الجاري، لكنه يمنع الانتقال إلى fallback أو كتابة نتيجة لاحقة.
    await assertRadarEnabled();
    try {
      const response = await aiManager.generate(prompt, { ...config, beforeAttempt: assertRadarEnabled });
      await assertRadarEnabled();
      if (response.error) {
        await assertRadarEnabled();
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
      // aiManager preserves its legacy Error surface and can wrap the
      // gateway's terminal FEATURE_DISABLED. Re-check Radar state here so a
      // pause is returned as RadarDisabledError instead of triggering fallback.
      try {
        await assertRadarEnabled();
      } catch (disabled) {
        throw disabled;
      }
      if (isRadarDisabledError(error)) throw error;
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`[Radar] all models failed: ${lastError}`);
}
