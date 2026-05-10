import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ParsedDataset } from './data-parser';
import { calculateStatistics, getTopValues } from './data-parser';

// Initialize AI clients using Replit AI Integrations
const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});
const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface AIInsights {
  keyFindings: string[];
  trends: string[];
  anomalies: string[];
  recommendations: string[];
  narrative: string;
}

export interface ChartConfig {
  id: string;
  type: 'bar' | 'line' | 'pie' | 'area' | 'scatter';
  title: string;
  description?: string;
  dataKey: string;
  xAxis?: string;
  yAxis?: string;
  data?: any[];
  config?: any;
}

export interface StoryDraft {
  title: string;
  subtitle: string;
  content: string;
  excerpt: string;
  outline: {
    sections: Array<{
      heading: string;
      content: string;
      dataReferences?: string[];
    }>;
  };
}

export interface AnalysisResult {
  statistics: any;
  insights: AIInsights;
  charts: ChartConfig[];
  provider: string;
  model: string;
  tokensUsed: number;
  processingTime: number;
}

export interface StoryResult {
  draft: StoryDraft;
  provider: string;
  model: string;
  tokensUsed: number;
  generationTime: number;
}

/**
 * Analyze dataset and generate insights using AI
 */
export async function analyzeDataset(
  dataset: ParsedDataset,
  fileName: string
): Promise<AnalysisResult> {
  const startTime = Date.now();

  try {
    // Step 1: Calculate local statistics
    const statistics = calculateDatasetStatistics(dataset);

    // Step 2: Generate AI insights using GPT-4o (best for data analysis)
    const insights = await generateDataInsights(dataset, statistics, fileName);

    // Step 3: Generate chart configurations
    const charts = generateChartConfigs(dataset, statistics);

    const processingTime = Date.now() - startTime;

    return {
      statistics,
      insights: insights.insights,
      charts,
      provider: insights.provider,
      model: insights.model,
      tokensUsed: insights.tokensUsed,
      processingTime
    };
  } catch (error: any) {
    console.error('Error analyzing dataset:', error);
    throw new Error(`فشل تحليل البيانات: ${error.message}`);
  }
}

/**
 * Generate Arabic news story from analysis
 */
export async function generateStory(
  dataset: ParsedDataset,
  analysis: AnalysisResult,
  fileName: string
): Promise<StoryResult> {
  const startTime = Date.now();

  try {
    // Use Claude Sonnet 3.5 for Arabic text generation
    const prompt = buildStoryPrompt(dataset, analysis, fileName);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse the JSON response
    const storyData = JSON.parse(content.text);

    const generationTime = Date.now() - startTime;

    return {
      draft: storyData,
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      generationTime
    };
  } catch (error: any) {
    console.error('Error generating story:', error);
    
    // Fallback to GPT-4o if Claude fails
    try {
      return await generateStoryWithGPT(dataset, analysis, fileName);
    } catch (fallbackError: any) {
      throw new Error(`فشل توليد القصة: ${error.message}`);
    }
  }
}

/**
 * Calculate comprehensive statistics for the dataset
 */
function calculateDatasetStatistics(dataset: ParsedDataset) {
  const { rows, columns } = dataset;

  const summary = {
    totalRows: rows.length,
    totalColumns: columns.length,
    numericColumns: columns.filter(c => c.type === 'number').length,
    categoricalColumns: columns.filter(c => c.type === 'string').length
  };

  const columnStats: Record<string, any> = {};

  columns.forEach(column => {
    if (column.type === 'number') {
      const stats = calculateStatistics(rows, column.name);
      if (stats) {
        columnStats[column.name] = stats;
      }
    } else {
      const topValues = getTopValues(rows, column.name, 5);
      columnStats[column.name] = { topValues };
    }
  });

  return { summary, columnStats };
}

/**
 * Generate AI insights using GPT-4o
 */
async function generateDataInsights(
  dataset: ParsedDataset,
  statistics: any,
  fileName: string
): Promise<{ insights: AIInsights; provider: string; model: string; tokensUsed: number }> {
  const prompt = `أنت محلل بيانات وصحافة بيانات خبير. قم بتحليل البيانات التالية واستخراج رؤى قابلة للنشر كقصة صحفية.

اسم الملف: ${fileName}
عدد الصفوف: ${dataset.rowCount}
عدد الأعمدة: ${dataset.columnCount}

الأعمدة:
${dataset.columns.map(c => `- ${c.name} (${c.type})`).join('\n')}

الإحصائيات:
${JSON.stringify(statistics, null, 2)}

عينة من البيانات (أول 5 صفوف):
${JSON.stringify(dataset.previewData.slice(0, 5), null, 2)}

📊 معايير التحليل الاحترافي:

1. **البُعد الزمني**: إذا كانت البيانات تحتوي على تواريخ أو فترات زمنية، اذكر:
   - معدل النمو أو التغير (مثلاً: "ارتفع بنسبة 27% مقارنة بالفترة السابقة")
   - الاتجاه العام (صاعد/هابط/مستقر)
   - أي تقلبات موسمية أو دورية

2. **المقارنات والتباين**: قارن بين أعلى وأدنى القيم:
   - مثلاً: "بينما تصدر X بـ70 ألفاً، جاء Y في الذيل بـ8 آلاف فقط"
   - استخدم عبارات مثل "في الوقت الذي..." و "بينما..." و "مقابل..."

3. **النسب المئوية**: احسب النسب لخلق صورة واضحة:
   - مثلاً: "شكّل الاقتصاد 24% من الإجمالي، مقابل 18% للرياضة"
   - "يمثل 3 من كل 10 سجلات..."

4. **التفسير السياقي**: لا تكتفِ بالوصف، بل فسّر:
   - لماذا هذه المنطقة؟ (موسم، حدث، طبيعة السكان)
   - ما العوامل المحتملة وراء هذا الاتجاه؟

5. **الدراما البيانية**: استخدم لغة تخلق إثارة:
   - "يكتسح"، "يتصدر"، "يقفز"، "يتراجع"، "يهيمن"
   - ابتعد عن الجمود الوصفي

قم بتحليل البيانات وأعد النتيجة بصيغة JSON بالشكل التالي:
{
  "keyFindings": [
    "نقطة رئيسية بأرقام محددة ونسب مئوية",
    "نقطة تتضمن مقارنة وتباين",
    "نقطة مع تفسير سياقي"
  ],
  "trends": [
    "اتجاه مع بُعد زمني (إن وجد)",
    "اتجاه مع نسب وأرقام",
    "اتجاه مفسّر بالسياق"
  ],
  "anomalies": [
    "شذوذ أو ملاحظة غير عادية مع الأرقام"
  ],
  "recommendations": [
    "توصية تحريرية عملية قابلة للتنفيذ",
    "توصية استراتيجية مبنية على البيانات"
  ],
  "narrative": "ملخص سردي احترافي (3-4 فقرات) يجمع بين الأرقام والتفسير والسياق، مكتوب بأسلوب صحفي جذاب"
}

استخدم اللغة العربية الفصحى. اجعل التحليل جاهزاً للنشر كقصة إخبارية في صحيفة "سبق".`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [{
      role: "system",
      content: "أنت محلل بيانات وصحفي بيانات خبير. تتخصص في تحويل البيانات إلى قصص صحفية احترافية مدعومة بالأرقام والتحليل العميق. أسلوبك يجمع بين الدقة البيانية والسرد الصحفي الجذاب."
    }, {
      role: "user",
      content: prompt
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 2048,
  });

  const insights = JSON.parse(response.choices[0].message.content || '{}');

  return {
    insights,
    provider: 'openai',
    model: 'gpt-5.1',
    tokensUsed: response.usage?.total_tokens || 0
  };
}

/**
 * Generate chart configurations based on dataset
 */
function generateChartConfigs(dataset: ParsedDataset, statistics: any): ChartConfig[] {
  const charts: ChartConfig[] = [];
  const { columns, rows } = dataset;

  // Find numeric columns for visualizations
  const numericColumns = columns.filter(c => c.type === 'number');
  const categoricalColumns = columns.filter(c => c.type === 'string' && c.uniqueCount && c.uniqueCount <= 20);

  // Chart 1: Bar chart for categorical + numeric
  if (categoricalColumns.length > 0 && numericColumns.length > 0) {
    const catCol = categoricalColumns[0];
    const numCol = numericColumns[0];

    const aggregatedData = aggregateData(rows, catCol.name, numCol.name);

    charts.push({
      id: 'chart-1',
      type: 'bar',
      title: `${numCol.name} حسب ${catCol.name}`,
      dataKey: numCol.name,
      xAxis: catCol.name,
      yAxis: numCol.name,
      data: aggregatedData.slice(0, 10) // Top 10
    });
  }

  // Chart 2: Pie chart for top categorical values
  if (categoricalColumns.length > 0) {
    const catCol = categoricalColumns[0];
    const topValues = getTopValues(rows, catCol.name, 6);

    charts.push({
      id: 'chart-2',
      type: 'pie',
      title: `توزيع ${catCol.name}`,
      dataKey: 'count',
      data: topValues.map(v => ({
        name: v.value,
        value: v.count,
        percentage: v.percentage
      }))
    });
  }

  // Chart 3: Line chart for trends (if date column exists)
  const dateColumn = columns.find(c => c.type === 'date');
  if (dateColumn && numericColumns.length > 0) {
    const numCol = numericColumns[0];
    const trendData = rows
      .map(row => ({
        date: row[dateColumn.name],
        value: Number(row[numCol.name])
      }))
      .filter(d => d.date && !isNaN(d.value))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    charts.push({
      id: 'chart-3',
      type: 'line',
      title: `اتجاه ${numCol.name} عبر الزمن`,
      dataKey: 'value',
      xAxis: 'date',
      yAxis: 'value',
      data: trendData.slice(0, 50) // Limit to 50 points
    });
  }

  return charts;
}

/**
 * Aggregate data for charts
 */
function aggregateData(rows: any[], groupBy: string, valueColumn: string) {
  const groups = new Map<any, number[]>();

  rows.forEach(row => {
    const key = row[groupBy];
    const value = Number(row[valueColumn]);

    if (key && !isNaN(value)) {
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(value);
    }
  });

  return Array.from(groups.entries())
    .map(([key, values]) => ({
      [groupBy]: key,
      [valueColumn]: values.reduce((a, b) => a + b, 0) / values.length, // Average
      count: values.length
    }))
    .sort((a, b) => b[valueColumn] - a[valueColumn]);
}

/**
 * Build prompt for story generation
 */
function buildStoryPrompt(dataset: ParsedDataset, analysis: AnalysisResult, fileName: string): string {
  return `أنت صحفي بيانات محترف في صحيفة "سبق" السعودية. متخصص في كتابة القصص الإخبارية القائمة على البيانات باللغة العربية الفصحى بأسلوب احترافي جذاب.

البيانات الأساسية:
- اسم الملف: ${fileName}
- عدد السجلات: ${dataset.rowCount}
- الأعمدة: ${dataset.columns.map(c => c.name).join(', ')}

الرؤى الرئيسية:
${analysis.insights.keyFindings.map((f, i) => `${i + 1}. ${f}`).join('\n')}

الاتجاهات:
${analysis.insights.trends.map((t, i) => `${i + 1}. ${t}`).join('\n')}

التوصيات:
${analysis.insights.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

الملخص السردي:
${analysis.insights.narrative}

📰 معايير الكتابة الصحفية الاحترافية:

**1. العنوان (Title):**
- استخدم أسلوب "سبق" الصحفي: جذاب، مشوّق، يحمل دراما بيانية
- أمثلة: "الاقتصاد يكتسح.. ومكة تتصدر المشهد الصحي"
- أو: "70 ألف مشاهدة للاقتصاد مقابل 8 آلاف للفن: خريطة تفاعل القراء تكشف المفاجآت"
- تجنب العناوين المملة مثل "تحليل البيانات الاقتصادية"

**2. العنوان الفرعي (Subtitle):**
- يضيف معلومة إضافية أو سياقاً
- يحتوي على رقم أو نسبة مئوية بارزة
- مثال: "البيانات تكشف ارتفاعاً بنسبة 27% في اهتمامات القراء بالأخبار الاقتصادية"

**3. المحتوى (Content):**

**الفقرة الافتتاحية:**
- ابدأ بالرقم الأبرز أو المفاجأة الأكبر
- اذكر النسب المئوية والمقارنات فوراً
- مثال: "في الوقت الذي تصدرت فيه الأخبار الاقتصادية المشهد بمعدل مشاهدات تجاوز 70 ألفاً، جاءت أخبار الفن في ذيل القائمة بمتوسط لا يتجاوز 8 آلاف مشاهدة."

**التقسيم المنطقي:**
استخدم <h2> لتقسيم القصة إلى أقسام واضحة:
- "الاقتصاد يتصدر المشهد"
- "مكة تهيمن على الأخبار الصحية"
- "الرياضة تحافظ على جمهورها"
- "توصيات تحريرية"

**في كل قسم:**
- ابدأ بالرقم أو النسبة المئوية
- أضف المقارنة والتباين
- فسّر السياق (لماذا؟ ما السبب المحتمل؟)
- استخدم <strong> للأرقام والنسب البارزة
- استخدم <ul><li> للنقاط التفصيلية

**أمثلة على الأسلوب المطلوب:**

✅ جيد: "شكلت الأخبار الاقتصادية 24% من إجمالي المشاهدات، مقابل 18% للأخبار الرياضية و14% للصحية. هذا الارتفاع يبدو مرتبطاً بالتغطيات الأخيرة للأسواق المحلية."

❌ تجنب: "الأخبار الاقتصادية كانت الأعلى."

✅ جيد: "يبدو أن اهتمام سكان مكة بالأخبار الصحية ارتفع بالتزامن مع تغطيات موسم الحج والأنشطة الطبية المصاحبة له."

❌ تجنب: "مكة مهتمة بالصحة."

**4. الخاتمة:**
- لخّص الرسالة الرئيسية
- أضف توصية تحريرية عملية
- اربطها بالمستقبل أو التوجه القادم

**5. المقتطف (Excerpt):**
- جملتان قويتان تلخصان القصة
- تحتويان على الرقم الأبرز
- تشجعان على القراءة

أعد النتيجة بصيغة JSON:
{
  "title": "عنوان صحفي جذاب بأسلوب سبق (لا تزيد عن 80 حرفاً)",
  "subtitle": "عنوان فرعي يضيف معلومة أو رقماً بارزاً (60-80 حرفاً)",
  "excerpt": "مقتطف قوي يلخص القصة في جملتين مع الرقم الأبرز",
  "content": "المحتوى الكامل بصيغة HTML مع <h2> للأقسام، <p> للفقرات، <strong> للأرقام البارزة، <ul><li> للنقاط",
  "outline": {
    "sections": [
      {
        "heading": "عنوان القسم (مثال: الاقتصاد يتصدر المشهد)",
        "content": "محتوى القسم مع الأرقام والتفسيرات",
        "dataReferences": ["chart-1", "chart-2"]
      }
    ]
  }
}

تذكّر: القصة يجب أن تكون جاهزة للنشر مباشرة في "سبق" دون تعديل. استخدم لغة صحفية احترافية، أرقاماً دقيقة، تفسيرات سياقية، ومقارنات درامية.`;
}

/**
 * Fallback: Generate story using GPT-4o
 */
async function generateStoryWithGPT(
  dataset: ParsedDataset,
  analysis: AnalysisResult,
  fileName: string
): Promise<StoryResult> {
  const startTime = Date.now();
  const prompt = buildStoryPrompt(dataset, analysis, fileName);

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [{
      role: "system",
      content: "أنت صحفي بيانات محترف متخصص في كتابة القصص الإخبارية باللغة العربية."
    }, {
      role: "user",
      content: prompt
    }],
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });

  const storyData = JSON.parse(response.choices[0].message.content || '{}');
  const generationTime = Date.now() - startTime;

  return {
    draft: storyData,
    provider: 'openai',
    model: 'gpt-5.1',
    tokensUsed: response.usage?.total_tokens || 0,
    generationTime
  };
}
