/**
 * iFox Budget Service
 * 
 * خدمة إدارة ميزانية الـ APIs
 * Manages API budget tracking and usage monitoring for AI providers
 */

import { storage } from "../../storage";
import type { InsertIfoxBudgetTracking, IfoxBudgetTracking } from "@shared/schema";

export class IfoxBudgetService {
  /**
   * Get current period budget
   */
  async getCurrentPeriodBudget(period: "daily" | "weekly" | "monthly"): Promise<IfoxBudgetTracking | null> {
    const budget = await storage.getCurrentPeriodBudget(period);
    return budget || null;
  }

  /**
   * List historical budget data
   */
  async listBudgetHistory(filters?: {
    period?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<IfoxBudgetTracking[]> {
    return await storage.listIfoxBudgetTracking(filters);
  }

  /**
   * Track API usage and update budget
   */
  async trackApiUsage(params: {
    provider: "openai" | "anthropic" | "gemini" | "visual-ai";
    apiCalls: number;
    tokens?: number;
    cost: number;
    period: "daily" | "weekly" | "monthly";
  }): Promise<void> {
    const current = await this.getCurrentPeriodBudget(params.period);
    
    if (current) {
      const updates: any = {
        totalApiCalls: (current.totalApiCalls || 0) + params.apiCalls,
        totalTokens: (current.totalTokens || 0) + (params.tokens || 0),
        totalCost: (current.totalCost || 0) + params.cost,
      };

      if (params.provider === "openai") {
        updates.openaiCalls = (current.openaiCalls || 0) + params.apiCalls;
        updates.openaiTokens = (current.openaiTokens || 0) + (params.tokens || 0);
        updates.openaiCost = (current.openaiCost || 0) + params.cost;
      } else if (params.provider === "anthropic") {
        updates.anthropicCalls = (current.anthropicCalls || 0) + params.apiCalls;
        updates.anthropicTokens = (current.anthropicTokens || 0) + (params.tokens || 0);
        updates.anthropicCost = (current.anthropicCost || 0) + params.cost;
      } else if (params.provider === "gemini") {
        updates.geminiCalls = (current.geminiCalls || 0) + params.apiCalls;
        updates.geminiTokens = (current.geminiTokens || 0) + (params.tokens || 0);
        updates.geminiCost = (current.geminiCost || 0) + params.cost;
      } else if (params.provider === "visual-ai") {
        updates.visualAiCalls = (current.visualAiCalls || 0) + params.apiCalls;
        updates.visualAiCost = (current.visualAiCost || 0) + params.cost;
      }

      await this.updateBudgetTracking(params.period, updates);
    }
  }

  /**
   * Create or update budget tracking for a period
   */
  async updateBudgetTracking(period: "daily" | "weekly" | "monthly", data: Partial<InsertIfoxBudgetTracking>): Promise<IfoxBudgetTracking> {
    const periodStart = this.getPeriodStart(period);
    const periodEnd = this.getPeriodEnd(period, periodStart);

    return await storage.createOrUpdateIfoxBudgetTracking(period, {
      ...data,
      periodStart,
      periodEnd,
    });
  }

  /**
   * Check if budget limit is exceeded
   */
  async checkBudgetStatus(): Promise<{
    daily: { isOverBudget: boolean; utilization: number; remaining: number };
    weekly: { isOverBudget: boolean; utilization: number; remaining: number };
    monthly: { isOverBudget: boolean; utilization: number; remaining: number };
  }> {
    const daily = await this.getCurrentPeriodBudget("daily");
    const weekly = await this.getCurrentPeriodBudget("weekly");
    const monthly = await this.getCurrentPeriodBudget("monthly");

    return {
      daily: {
        isOverBudget: daily?.isOverBudget || false,
        utilization: daily?.budgetUtilization || 0,
        remaining: daily?.budgetRemaining || 0,
      },
      weekly: {
        isOverBudget: weekly?.isOverBudget || false,
        utilization: weekly?.budgetUtilization || 0,
        remaining: weekly?.budgetRemaining || 0,
      },
      monthly: {
        isOverBudget: monthly?.isOverBudget || false,
        utilization: monthly?.budgetUtilization || 0,
        remaining: monthly?.budgetRemaining || 0,
      },
    };
  }

  /**
   * Get period start date
   */
  private getPeriodStart(period: "daily" | "weekly" | "monthly"): Date {
    const now = new Date();
    
    if (period === "daily") {
      now.setHours(0, 0, 0, 0);
    } else if (period === "weekly") {
      const day = now.getDay();
      now.setDate(now.getDate() - day);
      now.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      now.setDate(1);
      now.setHours(0, 0, 0, 0);
    }

    return now;
  }

  /**
   * Get period end date
   */
  private getPeriodEnd(period: "daily" | "weekly" | "monthly", start: Date): Date {
    const end = new Date(start);
    
    if (period === "daily") {
      end.setDate(end.getDate() + 1);
    } else if (period === "weekly") {
      end.setDate(end.getDate() + 7);
    } else if (period === "monthly") {
      end.setMonth(end.getMonth() + 1);
    }

    end.setSeconds(end.getSeconds() - 1);
    return end;
  }
}

export const ifoxBudgetService = new IfoxBudgetService();
