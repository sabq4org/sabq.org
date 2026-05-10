/**
 * iFox Performance Service
 * 
 * خدمة تتبع أداء المحتوى
 * Tracks and analyzes performance metrics for AI-generated vs human-generated content
 */

import { storage } from "../../storage";
import type { InsertIfoxPerformanceMetric, IfoxPerformanceMetric } from "@shared/schema";

export class IfoxPerformanceService {
  /**
   * Create or update performance metrics for an article
   */
  async trackArticlePerformance(articleId: string, data: Partial<InsertIfoxPerformanceMetric>): Promise<IfoxPerformanceMetric> {
    return await storage.createOrUpdateIfoxPerformanceMetric(articleId, data);
  }

  /**
   * Get performance metrics for an article
   */
  async getArticlePerformance(articleId: string): Promise<IfoxPerformanceMetric | null> {
    const metric = await storage.getIfoxPerformanceMetric(articleId);
    return metric || null;
  }

  /**
   * List performance metrics with filters
   */
  async listPerformanceMetrics(filters?: {
    isAiGenerated?: boolean;
    publishedAtFrom?: Date;
    publishedAtTo?: Date;
    page?: number;
    limit?: number;
  }): Promise<IfoxPerformanceMetric[]> {
    const result = await storage.listIfoxPerformanceMetrics(filters);
    return result.metrics;
  }

  /**
   * Calculate ROI for AI-generated content
   */
  calculateRoi(metric: IfoxPerformanceMetric): number {
    if (!metric.generationCost || metric.generationCost === 0) {
      return 0;
    }

    const revenue = metric.estimatedRevenue || 0;
    return ((revenue - metric.generationCost) / metric.generationCost) * 100;
  }

  /**
   * Get aggregated performance metrics for the analytics dashboard
   * 
   * This method queries ACTUAL articles from the articles table to provide
   * real-time analytics, rather than relying on separate metrics table.
   */
  async getPerformanceMetrics(timeRange?: 'today' | 'week' | 'month' | 'all'): Promise<{
    articlesGenerated: number;
    avgQualityScore: number;
    successRate: number;
    totalSaves: number;
    metrics: Array<{
      name: string;
      value: number | string;
      trend: number;
    }>;
  }> {
    // Calculate date range based on timeRange parameter
    let publishedAtFrom: Date | undefined;
    const now = new Date();

    if (timeRange === 'today') {
      publishedAtFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (timeRange === 'week') {
      publishedAtFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === 'month') {
      publishedAtFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    // If 'all', publishedAtFrom stays undefined

    // Query ACTUAL AI-generated articles from articles table
    const articles = await storage.getAiGeneratedArticlesMetrics({
      publishedAtFrom,
      publishedAtTo: new Date(), // up to now
    });

    // Calculate KPIs from actual articles
    const articlesGenerated = articles.length;
    
    const avgQualityScore = articles.length > 0
      ? articles.reduce((sum, a) => sum + (a.qualityScore || 0), 0) / articles.length
      : 0;

    // Success rate = articles with quality score >= 70
    const successfulArticles = articles.filter(a => (a.qualityScore || 0) >= 70).length;
    const successRate = articles.length > 0
      ? (successfulArticles / articles.length) * 100
      : 0;

    const totalSaves = articles.reduce((sum, a) => sum + (a.bookmarkCount || 0), 0);

    // Calculate additional metrics
    const totalViews = articles.reduce((sum, a) => sum + (a.viewCount || 0), 0);
    const avgViews = articles.length > 0 ? totalViews / articles.length : 0;

    const totalEngagement = articles.reduce((sum, a) => {
      const engagement = (a.shareCount || 0) + (a.commentCount || 0) + (a.bookmarkCount || 0);
      return sum + engagement;
    }, 0);
    const avgEngagement = articles.length > 0 ? totalEngagement / articles.length : 0;

    // For simplicity, trends are set to 0. In a real scenario, you'd compare with the previous period.
    const metrics = [
      { name: 'إجمالي المشاهدات', value: totalViews, trend: 0 },
      { name: 'متوسط المشاهدات', value: Math.round(avgViews), trend: 0 },
      { name: 'إجمالي التفاعل', value: totalEngagement, trend: 0 },
      { name: 'متوسط التفاعل', value: Math.round(avgEngagement), trend: 0 },
    ];

    return {
      articlesGenerated,
      avgQualityScore: Math.round(avgQualityScore),
      successRate: Math.round(successRate),
      totalSaves,
      metrics,
    };
  }

}

export const ifoxPerformanceService = new IfoxPerformanceService();
