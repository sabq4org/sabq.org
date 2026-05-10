import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CalendarEventAiDraft {
  editorialIdeas: string[];
  headlines: {
    primary: string;
    secondary: string;
    alternates: string[];
  };
  infographicData: string[];
  socialMedia: {
    twitter: string;
    instagram: string;
    linkedin: string;
    hashtags: string[];
  };
  seo: {
    keywords: string[];
    metaTitle: string;
    metaDescription: string;
  };
}

export async function generateCalendarEventIdeas(
  eventTitle: string,
  eventDescription: string,
  eventType: string,
  eventDate: Date
): Promise<CalendarEventAiDraft> {
  try {
    const arabicDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
      dateStyle: 'long'
    }).format(eventDate);

    const prompt = `أنت خبير تحريري في صحيفة سبق. لديك حدث "${eventTitle}" من نوع "${eventType}" في تاريخ ${arabicDate}.

الوصف: ${eventDescription}

قم بإنشاء محتوى شامل بصيغة JSON يتضمن:

1. editorialIdeas: 5 زوايا صحفية مختلفة لتغطية الحدث (مثل: الزاوية السياسية، الاقتصادية، الاجتماعية، التقنية، إلخ)
2. headlines: 
   - primary: عنوان رئيسي جذاب (8-12 كلمة)
   - secondary: عنوان فرعي داعم (10-15 كلمة)
   - alternates: 3 عناوين بديلة
3. infographicData: 8 نقاط بيانات أو إحصائيات مهمة يمكن تمثيلها بصريا
4. socialMedia:
   - twitter: تغريدة (280 حرف كحد أقصى)
   - instagram: منشور إنستغرام (2200 حرف كحد أقصى)
   - linkedin: منشور لينكدإن احترافي
   - hashtags: 5-7 هاشتاقات عربية وإنجليزية مناسبة
5. seo:
   - keywords: 10 كلمات مفتاحية عربية
   - metaTitle: عنوان SEO (60 حرف كحد أقصى)
   - metaDescription: وصف SEO (155 حرف كحد أقصى)

أعد الإجابة بصيغة JSON فقط`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "أنت خبير تحريري ومتخصص في تحليل الأحداث وإنشاء محتوى إعلامي شامل باللغة العربية. أنت تعمل لصحيفة سبق الإخبارية."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 2048,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result as CalendarEventAiDraft;
  } catch (error) {
    console.error("خطأ في توليد أفكار الحدث:", error);
    throw new Error("فشل في توليد أفكار الحدث");
  }
}

export async function generateHeadlineVariations(
  eventTitle: string,
  angle: string
): Promise<string[]> {
  try {
    const prompt = `أنشئ 5 عناوين صحفية مختلفة للحدث "${eventTitle}" من الزاوية "${angle}". 
    
يجب أن تكون العناوين:
- جذابة ومثيرة للاهتمام
- واضحة ومباشرة
- مناسبة لصحيفة إخبارية رقمية
- متنوعة في الأسلوب (استفهام، تقرير، تحليل، إلخ)

أعد النتيجة بصيغة JSON: {"headlines": ["...", "...", ...]}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "أنت محرر صحفي متخصص في كتابة العناوين الإخبارية الجذابة باللغة العربية."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 512,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.headlines || [];
  } catch (error) {
    console.error("خطأ في توليد العناوين:", error);
    throw new Error("فشل في توليد العناوين");
  }
}

export async function generateSocialMediaContent(
  eventTitle: string,
  eventDescription: string,
  platform: 'twitter' | 'instagram' | 'linkedin'
): Promise<{ content: string; hashtags: string[] }> {
  try {
    const platformGuidelines = {
      twitter: 'تغريدة قصيرة ومباشرة (280 حرف كحد أقصى)',
      instagram: 'منشور جذاب مع وصف تفصيلي (2200 حرف كحد أقصى)',
      linkedin: 'منشور احترافي وتحليلي'
    };

    const prompt = `أنشئ محتوى ${platformGuidelines[platform]} عن الحدث "${eventTitle}".

الوصف: ${eventDescription}

قم بإنشاء:
1. content: المحتوى المناسب للمنصة
2. hashtags: 5-7 هاشتاقات مناسبة (عربية وإنجليزية)

أعد النتيجة بصيغة JSON: {"content": "...", "hashtags": ["...", ...]}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `أنت خبير في كتابة محتوى وسائل التواصل الاجتماعي للأخبار باللغة العربية. تتقن كتابة محتوى جذاب ومناسب لكل منصة.`
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 1024,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      content: result.content || '',
      hashtags: result.hashtags || []
    };
  } catch (error) {
    console.error(`خطأ في توليد محتوى ${platform}:`, error);
    throw new Error(`فشل في توليد محتوى ${platform}`);
  }
}

export async function generateInfographicDataPoints(
  eventTitle: string,
  eventDescription: string,
  eventType: string
): Promise<string[]> {
  try {
    const prompt = `للحدث "${eventTitle}" من نوع "${eventType}"، اقترح 8 نقاط بيانات أو إحصائيات مهمة يمكن تمثيلها في إنفوجرافيك.

الوصف: ${eventDescription}

يجب أن تكون النقاط:
- قابلة للتمثيل البصري
- مثيرة للاهتمام وذات قيمة
- مدعومة بأرقام أو حقائق عندما يكون ذلك ممكنا
- متنوعة في المحتوى

أعد النتيجة بصيغة JSON: {"dataPoints": ["...", "...", ...]}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "أنت خبير في تحليل البيانات وإنشاء محتوى الإنفوجرافيك الإعلامي."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 768,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return result.dataPoints || [];
  } catch (error) {
    console.error("خطأ في توليد نقاط البيانات:", error);
    throw new Error("فشل في توليد نقاط البيانات");
  }
}

export async function generateSEOContent(
  eventTitle: string,
  eventDescription: string
): Promise<{ keywords: string[]; metaTitle: string; metaDescription: string }> {
  try {
    const prompt = `للحدث "${eventTitle}"، قم بإنشاء محتوى SEO شامل:

الوصف: ${eventDescription}

1. keywords: 10 كلمات مفتاحية عربية مناسبة للبحث
2. metaTitle: عنوان SEO جذاب (60 حرف كحد أقصى)
3. metaDescription: وصف SEO مختصر ودقيق (155 حرف كحد أقصى)

أعد النتيجة بصيغة JSON فقط`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "أنت خبير SEO متخصص في تحسين المحتوى العربي لمحركات البحث."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 512,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      keywords: result.keywords || [],
      metaTitle: result.metaTitle || '',
      metaDescription: result.metaDescription || ''
    };
  } catch (error) {
    console.error("خطأ في توليد محتوى SEO:", error);
    throw new Error("فشل في توليد محتوى SEO");
  }
}

export async function generateArticleDraft(
  eventTitle: string,
  eventDescription: string,
  selectedAngle: string
): Promise<{ title: string; content: string; summary: string }> {
  try {
    const prompt = `أنشئ مسودة مقال صحفي عن الحدث "${eventTitle}" من الزاوية "${selectedAngle}".

الوصف: ${eventDescription}

قم بإنشاء:
1. title: عنوان جذاب للمقال
2. content: محتوى المقال الكامل (800-1200 كلمة) منسق بتنسيق HTML بسيط (<p>, <h2>, <strong>, <em>)
3. summary: ملخص المقال (2-3 جمل)

أعد النتيجة بصيغة JSON فقط`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "أنت صحفي محترف تكتب مقالات إخبارية شاملة ومتوازنة باللغة العربية لصحيفة سبق."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 3072,
    });

    const result = JSON.parse(response.choices[0].message.content || "{}");
    return {
      title: result.title || '',
      content: result.content || '',
      summary: result.summary || ''
    };
  } catch (error) {
    console.error("خطأ في توليد مسودة المقال:", error);
    throw new Error("فشل في توليد مسودة المقال");
  }
}
