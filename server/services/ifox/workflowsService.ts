import { storage } from "../../storage";
import type { InsertIfoxWorkflowRule, IfoxWorkflowRule } from "@shared/schema";

/**
 * iFox Workflow Rules Service
 * 
 * Manages automated workflow rules for content generation and processing.
 * Handles rule creation, evaluation, execution tracking, and conditional logic.
 */
export class IfoxWorkflowsService {
  /**
   * Create new workflow rule
   * 
   * @param data - Rule data to create
   * @returns The created rule
   */
  async createRule(data: InsertIfoxWorkflowRule): Promise<IfoxWorkflowRule> {
    return await storage.createIfoxWorkflowRule(data);
  }

  /**
   * List rules with optional filters
   * 
   * @param filters - Optional filters for querying rules
   * @param filters.ruleType - Filter by rule type (e.g., "auto_publish", "quality_check")
   * @param filters.isActive - Filter by active status
   * @param filters.page - Page number for pagination
   * @param filters.limit - Number of results per page
   * @returns Paginated result with rules array and total count
   */
  async listRules(filters?: {
    ruleType?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ rules: IfoxWorkflowRule[]; total: number }> {
    return await storage.listIfoxWorkflowRules(filters);
  }

  /**
   * Get rule by ID
   * 
   * @param id - Rule ID
   * @returns The rule or null if not found
   */
  async getRule(id: string): Promise<IfoxWorkflowRule | null> {
    const rule = await storage.getIfoxWorkflowRule(id);
    return rule || null;
  }

  /**
   * Update rule
   * 
   * @param id - Rule ID to update
   * @param data - Partial rule data to update
   * @param userId - ID of the user performing the update
   * @returns The updated rule
   */
  async updateRule(id: string, data: Partial<InsertIfoxWorkflowRule>, userId: string): Promise<IfoxWorkflowRule> {
    return await storage.updateIfoxWorkflowRule(id, {
      ...data,
      updatedBy: userId,
    });
  }

  /**
   * Delete rule
   * 
   * @param id - Rule ID to delete
   */
  async deleteRule(id: string): Promise<void> {
    await storage.deleteIfoxWorkflowRule(id);
  }

  /**
   * Record rule execution result
   * 
   * Tracks whether a rule execution succeeded or failed.
   * Updates execution statistics for monitoring and analytics.
   * 
   * @param id - Rule ID
   * @param success - Whether the execution was successful
   */
  async recordExecution(id: string, success: boolean): Promise<void> {
    await storage.updateIfoxWorkflowRuleExecution(id, success);
  }

  /**
   * Get active rules for a specific event type
   * 
   * Retrieves all active rules that should be triggered for a given event,
   * sorted by priority in descending order (highest priority first).
   * 
   * @param triggerEvent - Event type (e.g., "article_created", "article_published")
   * @returns Array of active rules for the event, sorted by priority
   */
  async getActiveRulesForEvent(triggerEvent: string): Promise<IfoxWorkflowRule[]> {
    const result = await storage.listIfoxWorkflowRules({
      isActive: true,
    });
    
    // Filter by trigger event and sort by priority (descending)
    return result.rules
      .filter((rule: IfoxWorkflowRule) => rule.triggerEvent === triggerEvent)
      .sort((a: IfoxWorkflowRule, b: IfoxWorkflowRule) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Evaluate rule conditions against data
   * 
   * Checks if provided data meets the rule's conditions.
   * Supports various comparison operators:
   * - gte: Greater than or equal
   * - lte: Less than or equal
   * - eq: Equal to
   * - between: Value within range [min, max]
   * 
   * @param rule - The workflow rule to evaluate
   * @param data - Data object to check against rule conditions
   * @returns true if all conditions are met, false otherwise
   * 
   * @example
   * ```typescript
   * const rule = {
   *   conditions: {
   *     qualityScore: { gte: 70 },
   *     wordCount: { between: [500, 2000] }
   *   }
   * };
   * const data = { qualityScore: 85, wordCount: 1200 };
   * const result = evaluateConditions(rule, data); // true
   * ```
   */
  evaluateConditions(rule: IfoxWorkflowRule, data: any): boolean {
    if (!rule.conditions) return true;
    
    const conditions = rule.conditions as Record<string, any>;
    
    for (const [key, condition] of Object.entries(conditions)) {
      const value = data[key];
      
      if (typeof condition === 'object') {
        if (condition.gte !== undefined && value < condition.gte) return false;
        if (condition.lte !== undefined && value > condition.lte) return false;
        if (condition.eq !== undefined && value !== condition.eq) return false;
        if (condition.between && (!value || value < condition.between[0] || value > condition.between[1])) return false;
      } else {
        if (value !== condition) return false;
      }
    }
    
    return true;
  }
}

/**
 * Singleton instance of IfoxWorkflowsService
 */
export const ifoxWorkflowsService = new IfoxWorkflowsService();
