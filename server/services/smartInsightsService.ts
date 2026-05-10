import { GoogleGenAI } from "@google/genai";
import pRetry from "p-retry";

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

interface SmartInsightsResult {
  insights: string[];
  contextToken: string;
  model: string;
  generatedAt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  response: string;
  model: string;
}

const SYSTEM_INSTRUCTION = `استخرج 3 رؤى قصيرة من الخبر. أعد JSON فقط: {"insights":["رؤية1","رؤية2","رؤية3"]}`;

const CHAT_SYSTEM_INSTRUCTION = `أنت مساعد ذكي متخصص في تحليل الأخبار. أنت تجيب على أسئلة المستخدم حول خبر محدد.

قواعد الإجابة:
1. أجب بناءً على سياق الخبر المعطى فقط
2. إذا كان السؤال خارج نطاق الخبر، وضح ذلك بلطف
3. استخدم لغة عربية واضحة ومباشرة
4. قدم إجابات مفيدة وموضوعية
5. يمكنك تقديم تحليلات إضافية إذا طُلب منك ذلك`;

export async function generateSmartInsights(
  articleId: string,
  articleTitle: string,
  articleContent: string
): Promise<SmartInsightsResult> {
  console.log(`🧠 [Smart Insights] Generating insights for article: ${articleId}`);

  const generateWithRetry = async (): Promise<SmartInsightsResult> => {
    const cleanContent = articleContent
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 3000);

    const prompt = `${SYSTEM_INSTRUCTION}

العنوان: ${articleTitle}
المحتوى: ${cleanContent}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      }
    });

    // Extract text from the new @google/genai SDK response format
    let text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    if (!text) {
      console.error(`[Smart Insights] Empty response from Gemini. Full response:`, JSON.stringify(response, null, 2).substring(0, 500));
      throw new Error("Empty response from AI model");
    }

    // Strip markdown code fences (```json ... ```) if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    // Try to find and validate complete JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[Smart Insights] No JSON structure found in response:`, text.substring(0, 300));
      throw new Error("Failed to parse AI response as JSON");
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error(`[Smart Insights] JSON parse error:`, parseError);
      console.error(`[Smart Insights] Attempted to parse:`, jsonMatch[0].substring(0, 500));
      throw new Error("Incomplete or malformed JSON response from AI");
    }
    
    if (!parsed.insights || !Array.isArray(parsed.insights) || parsed.insights.length === 0) {
      console.error(`[Smart Insights] Invalid structure:`, JSON.stringify(parsed).substring(0, 200));
      throw new Error("Invalid response structure - missing insights array");
    }

    const contextToken = Buffer.from(JSON.stringify({
      articleId,
      title: articleTitle,
      contentHash: Buffer.from(cleanContent.substring(0, 500)).toString('base64').substring(0, 32),
      generatedAt: new Date().toISOString()
    })).toString('base64');

    console.log(`✅ [Smart Insights] Generated ${parsed.insights.length} insights`);

    return {
      insights: parsed.insights,
      contextToken,
      model: "gemini-2.5-flash",
      generatedAt: new Date().toISOString()
    };
  };

  return pRetry(generateWithRetry, {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 30000,
    onFailedAttempt: (error) => {
      console.warn(`⚠️ [Smart Insights] Attempt ${error.attemptNumber} failed. Retries left: ${error.retriesLeft}`);
    }
  });
}

export async function chatWithContext(
  articleId: string,
  articleTitle: string,
  articleContent: string,
  userMessage: string,
  chatHistory: ChatMessage[] = []
): Promise<ChatResponse> {
  console.log(`💬 [Smart Insights Chat] Processing question for article: ${articleId}`);

  const chatWithRetry = async (): Promise<ChatResponse> => {
    const cleanContent = articleContent
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 6000);

    const contextPrompt = `${CHAT_SYSTEM_INSTRUCTION}

سياق الخبر الذي نتحدث عنه:

العنوان: ${articleTitle}

المحتوى:
${cleanContent}

---

${chatHistory.length > 0 ? `المحادثة السابقة:\n${chatHistory.map(m => `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${m.content}`).join('\n')}\n\n---\n\n` : ''}سؤال المستخدم الحالي: ${userMessage}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contextPrompt,
      config: {
        temperature: 0.5,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      }
    });

    // Extract text from the new @google/genai SDK response format
    let text = response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    if (!text) {
      console.error(`[Smart Insights Chat] Empty response from Gemini`);
      throw new Error("Empty response from AI model");
    }

    // Strip markdown code fences if present
    text = text.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '').trim();

    console.log(`✅ [Smart Insights Chat] Generated response`);

    return {
      response: text.trim(),
      model: "gemini-2.5-flash"
    };
  };

  return pRetry(chatWithRetry, {
    retries: 5,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 30000,
    onFailedAttempt: (error) => {
      console.warn(`⚠️ [Smart Insights Chat] Attempt ${error.attemptNumber} failed. Retries left: ${error.retriesLeft}`);
    }
  });
}

export default {
  generateSmartInsights,
  chatWithContext
};
