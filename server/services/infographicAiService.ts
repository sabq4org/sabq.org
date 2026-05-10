import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

// Initialize Gemini AI with API key
const genai = new GoogleGenerativeAI(
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || ""
);

// Zod schema for infographic suggestions
const InfographicSuggestionsSchema = z.object({
  title: z.string().describe("عنوان جذاب للإنفوجرافيك"),
  subtitle: z.string().describe("عنوان فرعي توضيحي"),
  bulletPoints: z.array(z.object({
    icon: z.string().describe("اسم الأيقونة المقترحة"),
    text: z.string().describe("نص النقطة"),
    highlight: z.string().optional().describe("رقم أو معلومة مميزة")
  })).describe("النقاط الرئيسية للمحتوى"),
  keywords: z.array(z.string()).describe("كلمات مفتاحية مقترحة"),
  description: z.string().describe("وصف مختصر للإنفوجرافيك"),
  visualDesign: z.object({
    primaryColor: z.string().describe("اللون الرئيسي المقترح"),
    secondaryColor: z.string().describe("اللون الثانوي المقترح"),
    style: z.enum(["modern", "classic", "minimalist", "colorful", "professional"]).describe("أسلوب التصميم"),
    layout: z.enum(["vertical", "horizontal", "grid", "timeline", "comparison"]).describe("تخطيط الإنفوجرافيك"),
    icons: z.array(z.string()).describe("أنواع الأيقونات المقترحة"),
    visualElements: z.array(z.string()).describe("عناصر بصرية إضافية")
  }).describe("اقتراحات التصميم المرئي"),
  dataVisualization: z.object({
    hasCharts: z.boolean().describe("هل يحتاج رسوم بيانية"),
    chartTypes: z.array(z.string()).optional().describe("أنواع الرسوم البيانية المقترحة"),
    hasStatistics: z.boolean().describe("هل يحتوي على إحصائيات"),
    statisticsFormat: z.string().optional().describe("تنسيق عرض الإحصائيات")
  }).describe("اقتراحات عرض البيانات")
});

type InfographicSuggestions = z.infer<typeof InfographicSuggestionsSchema>;

export async function generateInfographicSuggestions(
  content: string,
  title?: string,
  category?: string
): Promise<InfographicSuggestions> {
  console.log("🎨 [Infographic AI] Generating infographic suggestions");

  try {
    const model = genai.getGenerativeModel({ 
      model: "gemini-2.5-flash-preview-05-20",
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 2000,
      }
    });

    const prompt = `أنت خبير في تصميم الإنفوجرافيك الصحفي وتحويل المحتوى النصي إلى محتوى بصري جذاب.

تحليل المحتوى:
${title ? `العنوان: ${title}` : ""}
${category ? `التصنيف: ${category}` : ""}
المحتوى: ${content.substring(0, 2000)}

المهمة:
قم بتحليل المحتوى واقترح تصميم إنفوجرافيك احترافي يناسب القارئ العربي.

المطلوب:
1. عنوان جذاب وقصير للإنفوجرافيك (أقصى 10 كلمات)
2. عنوان فرعي توضيحي (أقصى 15 كلمة)
3. 3-7 نقاط رئيسية مع اقتراح أيقونات مناسبة لكل نقطة
4. 5-8 كلمات مفتاحية ذات صلة
5. وصف مختصر للإنفوجرافيك (50-100 كلمة)
6. اقتراحات التصميم المرئي:
   - الألوان المناسبة (hex codes)
   - أسلوب التصميم (modern/classic/minimalist/colorful/professional)
   - التخطيط المقترح (vertical/horizontal/grid/timeline/comparison)
   - أنواع الأيقونات (flat/outline/3d/gradient)
   - عناصر بصرية إضافية

7. اقتراحات عرض البيانات:
   - هل يحتاج رسوم بيانية؟
   - أنواع الرسوم البيانية المناسبة
   - هل يحتوي على إحصائيات؟
   - كيفية عرض الإحصائيات

معايير مهمة:
- اجعل المحتوى مختصراً ومركّزاً
- استخدم أرقام وإحصائيات عند توفرها
- اقترح أيقونات بسيطة وواضحة
- الألوان يجب أن تكون احترافية ومريحة للعين
- النص يجب أن يكون بالعربية الفصحى

قدم الإجابة بصيغة JSON فقط بالشكل التالي:
{
  "title": "العنوان الرئيسي",
  "subtitle": "العنوان الفرعي",
  "bulletPoints": [
    {
      "icon": "chart-line",
      "text": "نص النقطة",
      "highlight": "85%"
    }
  ],
  "keywords": ["كلمة1", "كلمة2"],
  "description": "وصف مختصر",
  "visualDesign": {
    "primaryColor": "#2563eb",
    "secondaryColor": "#10b981",
    "style": "modern",
    "layout": "vertical",
    "icons": ["flat", "colorful"],
    "visualElements": ["charts", "icons", "numbers"]
  },
  "dataVisualization": {
    "hasCharts": true,
    "chartTypes": ["bar", "pie"],
    "hasStatistics": true,
    "statisticsFormat": "percentage"
  }
}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("❌ [Infographic AI] No JSON found in response");
      throw new Error("فشل في استخراج اقتراحات الإنفوجرافيك");
    }

    const rawSuggestions = JSON.parse(jsonMatch[0]);
    
    // Validate and transform the suggestions
    const validatedSuggestions = InfographicSuggestionsSchema.parse(rawSuggestions);

    console.log("✅ [Infographic AI] Successfully generated infographic suggestions");
    console.log(`   - Title: ${validatedSuggestions.title}`);
    console.log(`   - Bullet points: ${validatedSuggestions.bulletPoints.length}`);
    console.log(`   - Keywords: ${validatedSuggestions.keywords.length}`);
    console.log(`   - Style: ${validatedSuggestions.visualDesign.style}`);
    console.log(`   - Layout: ${validatedSuggestions.visualDesign.layout}`);

    return validatedSuggestions;

  } catch (error) {
    console.error("❌ [Infographic AI] Failed to generate suggestions:", error);
    
    // Return default suggestions as fallback
    return {
      title: "إنفوجرافيك معلوماتي",
      subtitle: "معلومات مهمة ومفيدة",
      bulletPoints: [
        {
          icon: "info-circle",
          text: "نقطة رئيسية أولى",
          highlight: ""
        },
        {
          icon: "chart-bar",
          text: "نقطة رئيسية ثانية",
          highlight: ""
        },
        {
          icon: "lightbulb",
          text: "نقطة رئيسية ثالثة", 
          highlight: ""
        }
      ],
      keywords: ["إنفوجرافيك", "معلومات", "بيانات", "إحصائيات"],
      description: "إنفوجرافيك يعرض معلومات مهمة بطريقة بصرية جذابة وسهلة الفهم",
      visualDesign: {
        primaryColor: "#2563eb",
        secondaryColor: "#10b981",
        style: "modern",
        layout: "vertical",
        icons: ["flat", "colorful"],
        visualElements: ["icons", "numbers", "shapes"]
      },
      dataVisualization: {
        hasCharts: false,
        hasStatistics: true,
        statisticsFormat: "numbers"
      }
    };
  }
}

// Function to apply suggestions to article fields
export function applySuggestionsToArticle(
  suggestions: InfographicSuggestions,
  currentArticle: {
    title?: string;
    subtitle?: string;
    content?: string;
    keywords?: string[];
    excerpt?: string;
  }
) {
  return {
    title: suggestions.title || currentArticle.title,
    subtitle: suggestions.subtitle || currentArticle.subtitle,
    keywords: [...(currentArticle.keywords || []), ...suggestions.keywords].filter((k, i, arr) => arr.indexOf(k) === i),
    excerpt: suggestions.description || currentArticle.excerpt,
    // Convert bullet points to formatted content
    content: formatBulletPointsAsContent(suggestions.bulletPoints, currentArticle.content)
  };
}

function formatBulletPointsAsContent(bulletPoints: InfographicSuggestions['bulletPoints'], existingContent?: string): string {
  let formattedContent = existingContent || "";
  
  // Add bullet points as formatted list
  if (bulletPoints.length > 0) {
    const bulletPointsHtml = bulletPoints.map(point => {
      const highlight = point.highlight ? `<strong>${point.highlight}</strong> - ` : "";
      return `<li>${highlight}${point.text}</li>`;
    }).join("\n");
    
    formattedContent += `\n\n<h3>النقاط الرئيسية:</h3>\n<ul>\n${bulletPointsHtml}\n</ul>`;
  }
  
  return formattedContent;
}