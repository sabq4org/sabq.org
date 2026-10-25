// Routed through the AI Hub ("comment-moderation" feature): gpt-4o-mini by
// default with automatic failover to the mini-tier chain, dashboard-editable.
import { aiGateway } from "./gateway";

export type CommentSentiment = "positive" | "neutral" | "negative";

export interface ModerationResult {
  score: number; // 0-100
  classification: "safe" | "flagged" | "spam" | "harmful" | "low_value";
  detected: string[]; // toxicity, hate_speech, spam, etc.
  reason: string;
  sentiment: CommentSentiment;
  sentimentConfidence: number; // 0-1
  /** Provider/model that produced the analysis (for comment_sentiments history). */
  provider?: string;
  modelId?: string;
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
   - low_value (تعليق بلا قيمة أو خارج الموضوع: أرقام، حروف عشوائية، نسخ من نص الخبر، كلام لا صلة له بالخبر)

   الحكم على الصلة بالخبر: إن وصلك «عنوان الخبر» ومقتطف منه فاحكم هل التعليق يتفاعل مع موضوعه.
   التعليق الذي لا يضيف رأياً ولا تفاعلاً (رقم، رمز، حروف مكررة، جملة منسوخة من نص الخبر، نص عام يُلصق على أي خبر) هو low_value مع detected: ["low_value"] أو ["off_topic"].
   لكن العبارات القصيرة المعتادة المناسبة لسياق الخبر ليست low_value: التعزية والدعاء على أخبار الوفاة، والتهنئة على أخبار الإنجاز، والدعاء بالشفاء على أخبار المرض — كلها safe.

3. أرجع درجة رقمية من 0 إلى 100:
   - 80–100 → safe (آمن)
   - 60–79  → flagged (مشكوك فيه)
   - 40–59  → spam (سبام)
   - 0–39   → harmful (ضار)
   - low_value: استخدم درجة 50–70 (ليس ضاراً لكنه لا يستحق النشر التلقائي)

4. حلّل أيضاً مشاعر التعليق تجاه موضوع الخبر:
   - sentiment: positive (إيجابي) أو neutral (محايد) أو negative (سلبي)
   - sentiment_confidence: درجة ثقتك من 0 إلى 1
   ملاحظة: المشاعر مستقلة عن التصنيف — تعليق ناقد بأدب هو negative لكنه safe.

قواعد معايرة مهمة (تعلّمناها من مراجعات بشرية سابقة):

أ. الرأي الحاد المشروع ليس مخالفة. النقد السياسي أو الرياضي أو نقد الخدمات — حتى بلهجة ساخرة أو غاضبة ("قرار غير موفق"، "أداء المنتخب محبط"، "ليش زعلان يا كاتب التقرير") — هو safe بدرجة 80+ ما دام خالياً من سبّ صريح أو تحريض على عنف أو تعميم عنصري على فئة. لا تخفض الدرجة لمجرد أن الموضوع سياسي أو الرأي سلبي.

ب. flagged تعني وجود شبهة حقيقية محددة (إهانة شخصية محتملة، ادعاء خطير غير مؤكد، تلميح عنصري) — لا تستخدمها كدرجة "غير متأكد" افتراضية. إن لم تجد مشكلة محددة تسميها في detected فالتصنيف safe.

ج. انتبه لنمط السبام المالي المقنّع: تعليق يبدأ بدعاء أو عبارات وطنية عاطفية ثم ينتقل إلى تجربة شخصية مع بنك أو منصة استثمار أو تداول ويمدح أرباحها ("ساهمت بمحفظة وأحصل أرباح شهرية"). هذا spam ترويجي بدرجة 40-59 مهما كان أسلوبه مهذباً — لا تنخدع بالمقدمة الدينية أو الوطنية.

أمثلة معايرة:
- "ترامب المجنون يبي يشن حرب بالمنطقة" → safe (85): رأي سياسي حاد لكنه نقد شخصية عامة بلا تحريض.
- "كثرة اللاعبين الأجانب سبب تدني المنتخب" → safe (85): رأي رياضي مشروع.
- "الله يحفظ الوطن... وبالمناسبة ساهمت في بنك X للاستثمار وأرباحي الشهرية ممتازة أنصحكم فيه" → spam (45): ترويج مالي مقنّع.
- "يا كلب يا حقير أنت وأمثالك" → harmful (20): سبّ صريح.
- "فلان الفلاني معروف أنه حرامي وسارق أموال الناس" → flagged (65): اتهام جنائي محدد لشخص مسمّى يحتاج مراجعة.
- "إنا لله وإنا إليه راجعون" على خبر وفاة → safe (90): تعزية مناسبة للخبر رغم قصرها.
- "65" أو "..." أو "ههههه" على أي خبر → low_value (55): لا رأي ولا تفاعل مع الخبر.
- جملة منقولة حرفياً من عنوان الخبر أو نصه دون إضافة → low_value (55): نسخ من نص الخبر.

5. أعد النتيجة فقط بصيغة JSON بهذا الشكل:

{
  "score": رقم,
  "classification": "safe | flagged | spam | harmful | low_value",
  "detected": ["hate_speech", "profanity", "spam", "harassment", "violence", "misinformation", "personal_attack", "adult_content", "off_topic", "self_promotion", "low_value"],
  "reason": "شرح قصير جداً يوضح السبب",
  "sentiment": "positive | neutral | negative",
  "sentiment_confidence": رقم من 0 إلى 1
}

النص المطلوب تحليله:`;

export interface ModerateCommentOptions {
  /**
   * Extra few-shot examples built from recent human moderator overrides
   * (feedback loop). Appended to the system prompt when provided.
   */
  calibrationExamples?: string;
  /**
   * The commented article, so the model can judge relevance (a bare "65" or a
   * line copied from the body is low_value; a condolence on death news is
   * safe). Adds roughly 200-300 input tokens per call (title + ≤ 400-char
   * excerpt) on the mini-tier model.
   */
  article?: { title?: string | null; excerpt?: string | null };
}

const ARTICLE_EXCERPT_MAX_CHARS = 400;

/** User message: the comment, prefixed with the article context when known. */
export function buildModerationUserMessage(
  commentText: string,
  article?: ModerateCommentOptions["article"],
): string {
  const title = article?.title?.replace(/\s+/g, " ").trim();
  if (!title) return `"${commentText}"`;
  const excerpt = (article?.excerpt ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ARTICLE_EXCERPT_MAX_CHARS);
  return [
    `عنوان الخبر: ${title}`,
    ...(excerpt ? [`مقتطف من الخبر: ${excerpt}`] : []),
    "",
    `التعليق: "${commentText}"`,
  ].join("\n");
}

function fallbackResult(reason: string): ModerationResult {
  return {
    score: 50,
    classification: "flagged",
    detected: ["ai_error"],
    reason,
    sentiment: "neutral",
    sentimentConfidence: 0,
  };
}

export async function moderateComment(
  commentText: string,
  opts?: ModerateCommentOptions
): Promise<ModerationResult> {
  try {
    console.log(`[Comment Moderation] Analyzing comment: ${commentText.substring(0, 50)}...`);

    const systemPrompt = opts?.calibrationExamples
      ? `${MODERATION_PROMPT.replace("النص المطلوب تحليله:", "")}\nأمثلة إضافية من قرارات المشرفين البشر (اعتمدها كمرجع للمعايرة):\n${opts.calibrationExamples}\n\nالنص المطلوب تحليله:`
      : MODERATION_PROMPT;

    const response = await aiGateway.complete({
      feature: "comment-moderation",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: buildModerationUserMessage(commentText, opts?.article)
        }
      ],
      options: { jsonMode: true, temperature: 0.1, maxTokens: 500 },
    });

    const content = response.content;

    if (!content) {
      console.error("[Comment Moderation] Empty response from AI");
      return fallbackResult("لم يتمكن النظام من تحليل التعليق - يحتاج مراجعة بشرية");
    }

    const result = JSON.parse(content) as ModerationResult & { sentiment_confidence?: number };

    // Validate and normalize the result
    const validClassifications = ["safe", "flagged", "spam", "harmful", "low_value"];
    const validSentiments: CommentSentiment[] = ["positive", "neutral", "negative"];
    const rawConfidence = result.sentimentConfidence ?? result.sentiment_confidence;
    const normalizedResult: ModerationResult = {
      score: Math.min(100, Math.max(0, result.score || 50)),
      classification: validClassifications.includes(result.classification)
        ? result.classification as ModerationResult["classification"]
        : result.score >= 80 ? "safe"
          : result.score >= 60 ? "flagged"
          : result.score >= 40 ? "spam"
          : "harmful",
      detected: Array.isArray(result.detected) ? result.detected : [],
      reason: result.reason || "تم التحليل بنجاح",
      sentiment: validSentiments.includes(result.sentiment) ? result.sentiment : "neutral",
      sentimentConfidence: Math.min(1, Math.max(0, typeof rawConfidence === "number" ? rawConfidence : 0.5)),
      provider: response.provider,
      modelId: response.modelId,
    };

    console.log(`[Comment Moderation] Result: ${normalizedResult.classification} (${normalizedResult.score}), sentiment: ${normalizedResult.sentiment}`);

    return normalizedResult;
  } catch (error) {
    console.error("[Comment Moderation] Error:", error);
    return fallbackResult("حدث خطأ أثناء تحليل التعليق - يحتاج مراجعة بشرية");
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
    // بلا قيمة / خارج الموضوع: لا يُنشر تلقائياً ولا يُرفض آلياً — يحسمه مشرف،
    // ولا يكسب نقاطاً حتى لو اعتُمد (commentLoyalty.commentAwardBlocker).
    case "low_value":
    case "flagged":
    default:
      return "pending";
  }
}
