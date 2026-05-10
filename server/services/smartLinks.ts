import OpenAI from "openai";
import type { SmartEntity, SmartTerm } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface SmartLinkSuggestion {
  text: string;
  type: "entity" | "term";
  entityId?: string;
  termId?: string;
  entity?: SmartEntity;
  term?: SmartTerm;
  position: number;
  length: number;
  confidence: number;
  context: string;
}

export interface AnalyzeContentResult {
  suggestions: SmartLinkSuggestion[];
  entities: string[];
  terms: string[];
  processingTime: number;
}

/**
 * تحليل محتوى المقال واستخراج الكيانات والمصطلحات باستخدام الذكاء الاصطناعي
 */
export async function analyzeContent(
  content: string,
  existingEntities: SmartEntity[],
  existingTerms: SmartTerm[]
): Promise<AnalyzeContentResult> {
  const startTime = Date.now();

  try {
    // تجهيز قائمة الكيانات والمصطلحات الموجودة
    const entitiesMap = new Map<string, SmartEntity>();
    const termsMap = new Map<string, SmartTerm>();

    // إضافة الكيانات وأسمائها المستعارة
    for (const entity of existingEntities) {
      entitiesMap.set(entity.name.toLowerCase(), entity);
      if (entity.aliases) {
        for (const alias of entity.aliases) {
          entitiesMap.set(alias.toLowerCase(), entity);
        }
      }
    }

    // إضافة المصطلحات وأسمائها المستعارة
    for (const term of existingTerms) {
      termsMap.set(term.term.toLowerCase(), term);
      if (term.aliases) {
        for (const alias of term.aliases) {
          termsMap.set(alias.toLowerCase(), term);
        }
      }
    }

    // استخدام OpenAI لتحليل المحتوى (Migrated to gpt-5.1)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت محلل ذكي للمحتوى العربي. مهمتك استخراج الكيانات (أشخاص، مؤسسات، أماكن، مشاريع) والمصطلحات من النص.

قائمة الكيانات الموجودة:
${Array.from(entitiesMap.keys()).join(", ")}

قائمة المصطلحات الموجودة:
${Array.from(termsMap.keys()).join(", ")}

قم بتحليل النص واستخراج:
1. الكيانات الموجودة في القائمة أعلاه
2. المصطلحات الموجودة في القائمة أعلاه
3. كيانات جديدة مهمة غير موجودة في القائمة
4. مصطلحات جديدة مهمة غير موجودة في القائمة

أعد النتيجة بصيغة JSON:
{
  "matches": [
    {
      "text": "النص الدقيق",
      "type": "entity" | "term",
      "name": "اسم الكيان/المصطلح",
      "confidence": 0.0-1.0,
      "position": رقم,
      "length": طول النص
    }
  ],
  "newSuggestions": [
    {
      "text": "نص جديد",
      "type": "entity" | "term",
      "category": "نوع الكيان (person, organization, location, etc) أو فئة المصطلح"
    }
  ]
}`,
        },
        {
          role: "user",
          content: content.substring(0, 10000), // حد أقصى للطول
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    const suggestions: SmartLinkSuggestion[] = [];
    const entities: string[] = [];
    const terms: string[] = [];

    // معالجة النتائج
    if (result.matches && Array.isArray(result.matches)) {
      for (const match of result.matches) {
        const lowerText = match.name.toLowerCase();
        
        if (match.type === "entity" && entitiesMap.has(lowerText)) {
          const entity = entitiesMap.get(lowerText)!;
          suggestions.push({
            text: match.text,
            type: "entity",
            entityId: entity.id,
            entity,
            position: match.position || 0,
            length: match.length || match.text.length,
            confidence: match.confidence || 0.8,
            context: extractContext(content, match.position, match.length),
          });
          if (!entities.includes(entity.id)) {
            entities.push(entity.id);
          }
        } else if (match.type === "term" && termsMap.has(lowerText)) {
          const term = termsMap.get(lowerText)!;
          suggestions.push({
            text: match.text,
            type: "term",
            termId: term.id,
            term,
            position: match.position || 0,
            length: match.length || match.text.length,
            confidence: match.confidence || 0.8,
            context: extractContext(content, match.position, match.length),
          });
          if (!terms.includes(term.id)) {
            terms.push(term.id);
          }
        }
      }
    }

    // ترتيب الاقتراحات حسب الموقع
    suggestions.sort((a, b) => a.position - b.position);

    const processingTime = Date.now() - startTime;

    return {
      suggestions,
      entities,
      terms,
      processingTime,
    };
  } catch (error) {
    console.error("[SmartLinks] Error analyzing content:", error);
    return {
      suggestions: [],
      entities: [],
      terms: [],
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * استخراج السياق المحيط بالنص
 */
function extractContext(content: string, position: number, length: number): string {
  const contextRadius = 50;
  const start = Math.max(0, position - contextRadius);
  const end = Math.min(content.length, position + length + contextRadius);
  return content.substring(start, end);
}

/**
 * توليد slug من النص العربي
 */
export function generateSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\u0600-\u06FFa-z0-9\-]/g, "")
    .substring(0, 100);
}
