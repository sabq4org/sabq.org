import { storage } from "../../storage";
import { aiManager } from "../../ai-manager";
import type { InsertIfoxQualityCheck, IfoxQualityCheck } from "@shared/schema";

/**
 * iFox Quality Service
 * 
 * AI-powered content quality checking service for the iFox AI Management System.
 * Analyzes article content across multiple quality dimensions and provides
 * actionable feedback for improvement.
 */
export class IfoxQualityService {
  /**
   * Run comprehensive quality check on article content
   * 
   * Analyzes content across 7 quality dimensions:
   * - Grammar and spelling
   * - Readability
   * - Factual accuracy
   * - SEO optimization
   * - Bias/neutrality
   * - Originality
   * - Relevance
   * 
   * @param params - Article content and metadata for quality analysis
   * @returns Complete quality check record with scores and recommendations
   */
  async checkArticleQuality(params: {
    articleId?: string;
    taskId?: string;
    content: string;
    title: string;
    keywords?: string[];
  }): Promise<IfoxQualityCheck> {
    const startTime = Date.now();
    
    // Build analysis prompt
    const prompt = `قم بتحليل جودة هذا المقال الصحفي وتقييمه على عدة محاور:

العنوان: ${params.title}
${params.keywords ? `الكلمات المفتاحية: ${params.keywords.join(', ')}` : ''}

المحتوى:
${params.content}

قدم تقييماً شاملاً يتضمن:
1. النحو والإملاء (0-100)
2. القابلية للقراءة (0-100)
3. الدقة الواقعية (0-100)
4. تحسين محركات البحث SEO (0-100)
5. الحيادية وعدم التحيز (0-100، كلما كان أعلى كلما كان أقل تحيزاً)
6. الأصالة (0-100)
7. مدى الصلة بالموضوع (0-100)

أرجع النتيجة بصيغة JSON:
{
  "grammarScore": number,
  "readabilityScore": number,
  "factualAccuracyScore": number,
  "seoScore": number,
  "biasScore": number,
  "originalityScore": number,
  "relevanceScore": number,
  "overallScore": number,
  "issues": [{type: string, severity: "low"|"medium"|"high"|"critical", description: string, suggestion: string}],
  "suggestions": [string],
  "strengths": [string]
}`;

    try {
      const response = await aiManager.generate(prompt, {
        provider: "openai",
        model: "gpt-4o-mini",
        maxTokens: 2000,
      });

      if (response.error) {
        throw new Error(`AI quality check failed: ${response.error}`);
      }

      const analysis = JSON.parse(response.content);
      
      const duration = Date.now() - startTime;

      const qualityCheck: InsertIfoxQualityCheck = {
        articleId: params.articleId,
        taskId: params.taskId,
        overallScore: analysis.overallScore,
        passThreshold: 70,
        passed: analysis.overallScore >= 70,
        grammarScore: analysis.grammarScore,
        readabilityScore: analysis.readabilityScore,
        factualAccuracyScore: analysis.factualAccuracyScore,
        seoScore: analysis.seoScore,
        biasScore: analysis.biasScore,
        originalityScore: analysis.originalityScore,
        relevanceScore: analysis.relevanceScore,
        issues: analysis.issues,
        suggestions: analysis.suggestions,
        strengths: analysis.strengths,
        analysisModel: "gpt-4",
        analysisPrompt: prompt,
        rawAnalysis: analysis,
        checkDuration: duration,
        humanReviewRequired: analysis.overallScore < 70,
      };

      return await storage.createIfoxQualityCheck(qualityCheck);
    } catch (error) {
      console.error("Quality check error:", error);
      throw new Error(`Failed to perform quality check: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get quality check by ID
   * 
   * @param id - Quality check ID
   * @returns Quality check record or null if not found
   */
  async getQualityCheck(id: string): Promise<IfoxQualityCheck | null> {
    const check = await storage.getIfoxQualityCheck(id);
    return check || null;
  }

  /**
   * List quality checks with filters
   * 
   * @param filters - Optional filters for quality checks
   * @returns Array of quality check records
   */
  async listQualityChecks(filters?: {
    articleId?: string;
    taskId?: string;
    passed?: boolean;
    page?: number;
    limit?: number;
  }): Promise<IfoxQualityCheck[]> {
    const result = await storage.listIfoxQualityChecks(filters);
    return result.checks;
  }

  /**
   * Update human review status
   * 
   * @param id - Quality check ID
   * @param data - Human review data
   * @returns Updated quality check record
   */
  async updateHumanReview(id: string, data: {
    humanReviewStatus: "approved" | "rejected";
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<IfoxQualityCheck> {
    return await storage.updateIfoxQualityCheckHumanReview(id, {
      humanReviewStatus: data.humanReviewStatus as "pending" | "approved" | "rejected",
      reviewedBy: data.reviewedBy,
      reviewNotes: data.reviewNotes,
    });
  }
}

/**
 * Singleton instance of IfoxQualityService
 */
export const ifoxQualityService = new IfoxQualityService();
