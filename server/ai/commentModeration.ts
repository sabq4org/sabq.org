import OpenAI from "openai";

const openai = new OpenAI();

export interface ModerationResult {
  score: number; // 0-100
  classification: "safe" | "flagged" | "spam" | "harmful";
  detected: string[]; // toxicity, hate_speech, spam, etc.
  reason: string;
}

const MODERATION_PROMPT = `أنت نظام رقابة تعليقات لموقع إخباري عربي، مهمتك تحليل النصوص بدقة وتصنيفها وفق سياسات النشر.

حلّل التعليق التالي وقيّمه حسب المعايير التالية:

1. قيّم احتمالية وجود:
   - الإساءة والسباب (profanity)
   - العنصرية أو خطاب الكراهية (hate_speech)
   - التحرش أو التقليل من الآخرين (harassment)
   - المحتوى الجنسي أو غير اللائق (adult_content)
   - التهديد أو التحريض أو العنف (violence)
   - الأخبار الكاذبة أو الادعاءات الخطرة (misinformation)
   - السبام أو الروابط العشوائية أو الترويج الذاتي (spam, self_promotion)
   - الهجوم الشخصي (personal_attack)
   - خارج الموضوع (off_topic)

2. أرجع نتيجة واحدة فقط من التصنيفات التالية:
   - safe (آمن للنشر - لا توجد مشاكل)
   - flagged (مشكوك فيه - يحتاج مراجعة بشرية)
   - spam (محتوى مزعج أو ترويج ذاتي)
   - harmful (ضار - يحتوي خطاب كراهية أو عنف أو تحرش)

3. أرجع درجة رقمية من 0 إلى 100:
   - 80–100 → safe (آمن)
   - 60–79  → flagged (مشكوك فيه)
   - 40–59  → spam (سبام)
   - 0–39   → harmful (ضار)

4. أعد النتيجة فقط بصيغة JSON بهذا الشكل:

{
  "score": رقم,
  "classification": "safe | flagged | spam | harmful",
  "detected": ["hate_speech", "profanity", "spam", "harassment", "violence", "misinformation", "personal_attack", "adult_content", "off_topic", "self_promotion"],
  "reason": "شرح قصير جداً يوضح السبب"
}

النص المطلوب تحليله:`;

export async function moderateComment(commentText: string): Promise<ModerationResult> {
  try {
    console.log(`[Comment Moderation] Analyzing comment: ${commentText.substring(0, 50)}...`);
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: MODERATION_PROMPT
        },
        {
          role: "user",
          content: `"${commentText}"`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      console.error("[Comment Moderation] Empty response from AI");
      return {
        score: 50,
        classification: "flagged",
        detected: ["ai_error"],
        reason: "لم يتمكن النظام من تحليل التعليق - يحتاج مراجعة بشرية"
      };
    }

    const result = JSON.parse(content) as ModerationResult;
    
    // Validate and normalize the result
    const validClassifications = ["safe", "flagged", "spam", "harmful"];
    const normalizedResult: ModerationResult = {
      score: Math.min(100, Math.max(0, result.score || 50)),
      classification: validClassifications.includes(result.classification) 
        ? result.classification as ModerationResult["classification"]
        : result.score >= 80 ? "safe" 
          : result.score >= 60 ? "flagged" 
          : result.score >= 40 ? "spam" 
          : "harmful",
      detected: Array.isArray(result.detected) ? result.detected : [],
      reason: result.reason || "تم التحليل بنجاح"
    };

    console.log(`[Comment Moderation] Result: ${normalizedResult.classification} (${normalizedResult.score})`);
    
    return normalizedResult;
  } catch (error) {
    console.error("[Comment Moderation] Error:", error);
    return {
      score: 50,
      classification: "flagged",
      detected: ["ai_error"],
      reason: "حدث خطأ أثناء تحليل التعليق - يحتاج مراجعة بشرية"
    };
  }
}

export function getStatusFromClassification(classification: string): "approved" | "rejected" | "pending" {
  switch (classification) {
    case "safe":
      return "approved";
    case "harmful":
      return "rejected";
    case "spam":
      return "rejected";
    case "flagged":
    default:
      return "pending";
  }
}
