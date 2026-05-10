import { storage } from "../../storage";
import { aiManager } from "../../ai-manager";
import type { InsertIfoxStrategyInsight, IfoxStrategyInsight } from "@shared/schema";

/**
 * iFox Strategy Service
 * 
 * AI-powered content strategy insights service for the iFox AI Management System.
 * Generates strategic recommendations for content planning, timing, and optimization.
 */
export class IfoxStrategyService {
  /**
   * Generate AI-powered content strategy insights
   * 
   * Generates strategic recommendations for content based on:
   * - Trending topics
   * - Content gaps
   * - Timing optimization
   * - Audience preferences
   * - Competitive analysis
   * 
   * @param params - Insight type and context for strategy generation
   * @returns Complete strategy insight with recommendations
   */
  async generateInsights(params: {
    insightType: "trending_topic" | "content_gap" | "timing_optimization" | "audience_preference" | "competitive_analysis";
    context?: string;
  }): Promise<IfoxStrategyInsight> {
    const prompt = `أنت خبير استراتيجية محتوى صحفي. قدم توصية استراتيجية من نوع "${params.insightType}":

${params.context || ''}

قدم توصية مفصلة تتضمن:
1. عنوان واضح وجذاب
2. وصف تفصيلي للفرصة
3. توصية عملية قابلة للتنفيذ
4. التأثير المتوقع (high_traffic, high_engagement, viral_potential, seo_boost)
5. درجة الثقة (0-100)
6. المواضيع ذات الصلة
7. أفضل وقت للنشر
8. التكرار المثالي
9. العمر المتوقع للموضوع (بالأيام)
10. تحليل تغطية المنافسين
11. الفجوة في المحتوى الحالي
12. استراتيجية التميز

أرجع النتيجة بصيغة JSON:
{
  "title": string,
  "description": string,
  "recommendation": string,
  "expectedImpact": string,
  "confidenceScore": number,
  "relatedTopics": [string],
  "bestPublishTime": ISO_date_string,
  "optimalFrequency": string,
  "estimatedLifespan": number,
  "competitorCoverage": {analysis},
  "contentGap": string,
  "differentiationStrategy": string
}`;

    try {
      const response = await aiManager.generate(prompt, {
        provider: "openai",
        model: "gpt-4o-mini",
        maxTokens: 2000,
      });

      if (response.error) {
        throw new Error(`AI strategy insight generation failed: ${response.error}`);
      }

      const analysis = JSON.parse(response.content);

      const insight: InsertIfoxStrategyInsight = {
        insightType: params.insightType,
        title: analysis.title,
        description: analysis.description,
        priority: analysis.confidenceScore >= 80 ? "high" : analysis.confidenceScore >= 60 ? "medium" : "low",
        recommendation: analysis.recommendation,
        expectedImpact: analysis.expectedImpact,
        confidenceScore: analysis.confidenceScore,
        supportingData: analysis,
        relatedTopics: analysis.relatedTopics,
        bestPublishTime: analysis.bestPublishTime ? new Date(analysis.bestPublishTime) : undefined,
        optimalFrequency: analysis.optimalFrequency,
        estimatedLifespan: analysis.estimatedLifespan,
        competitorCoverage: analysis.competitorCoverage,
        contentGap: analysis.contentGap,
        differentiationStrategy: analysis.differentiationStrategy,
        analysisModel: "gpt-4",
        analysisData: analysis,
        status: "active",
        expiresAt: analysis.estimatedLifespan ? new Date(Date.now() + analysis.estimatedLifespan * 24 * 60 * 60 * 1000) : undefined,
      };

      return await storage.createIfoxStrategyInsight(insight);
    } catch (error) {
      console.error("Strategy insight generation error:", error);
      throw new Error(`Failed to generate strategy insight: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List insights with filters
   * 
   * @param filters - Optional filters for strategy insights
   * @returns Array of strategy insight records
   */
  async listInsights(filters?: {
    insightType?: string;
    status?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }): Promise<IfoxStrategyInsight[]> {
    const result = await storage.listIfoxStrategyInsights(filters);
    return result.insights;
  }

  /**
   * Get insight by ID
   * 
   * @param id - Strategy insight ID
   * @returns Strategy insight record or null if not found
   */
  async getInsight(id: string): Promise<IfoxStrategyInsight | null> {
    const insight = await storage.getIfoxStrategyInsight(id);
    return insight || null;
  }

  /**
   * Update insight status (mark as implemented/dismissed/expired)
   * 
   * @param id - Strategy insight ID
   * @param status - New status
   * @param implementedBy - Optional user ID who implemented the insight
   * @returns Updated strategy insight record
   */
  async updateInsightStatus(
    id: string, 
    status: "active" | "implemented" | "dismissed" | "expired", 
    implementedBy?: string
  ): Promise<IfoxStrategyInsight> {
    return await storage.updateIfoxStrategyInsightStatus(id, status, implementedBy);
  }

  /**
   * Delete insight
   * 
   * @param id - Strategy insight ID
   */
  async deleteInsight(id: string): Promise<void> {
    await storage.deleteIfoxStrategyInsight(id);
  }
}

/**
 * Singleton instance of IfoxStrategyService
 */
export const ifoxStrategyService = new IfoxStrategyService();
