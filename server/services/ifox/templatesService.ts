import { storage } from "../../storage";
import type { InsertIfoxContentTemplate, IfoxContentTemplate } from "@shared/schema";

/**
 * iFox Content Templates Service
 * 
 * Manages reusable content templates for automated article generation.
 * Provides CRUD operations and template usage tracking.
 */
export class IfoxTemplatesService {
  /**
   * Create new content template
   * 
   * @param data - Template data to create
   * @returns The created template
   */
  async createTemplate(data: InsertIfoxContentTemplate): Promise<IfoxContentTemplate> {
    return await storage.createIfoxContentTemplate(data);
  }

  /**
   * List templates with optional filters
   * 
   * @param filters - Optional filters for querying templates
   * @param filters.templateType - Filter by template type (e.g., "news", "feature", "analysis")
   * @param filters.language - Filter by language (e.g., "ar", "en", "ur")
   * @param filters.isActive - Filter by active status
   * @param filters.createdBy - Filter by creator user ID
   * @param filters.page - Page number for pagination
   * @param filters.limit - Number of results per page
   * @returns Paginated result with templates array and total count
   */
  async listTemplates(filters?: {
    templateType?: string;
    language?: string;
    isActive?: boolean;
    createdBy?: string;
    page?: number;
    limit?: number;
  }): Promise<{ templates: IfoxContentTemplate[]; total: number }> {
    return await storage.listIfoxContentTemplates(filters);
  }

  /**
   * Get template by ID
   * 
   * @param id - Template ID
   * @returns The template or null if not found
   */
  async getTemplate(id: string): Promise<IfoxContentTemplate | null> {
    const template = await storage.getIfoxContentTemplate(id);
    return template || null;
  }

  /**
   * Update template
   * 
   * @param id - Template ID to update
   * @param data - Partial template data to update
   * @param userId - ID of the user performing the update
   * @returns The updated template
   */
  async updateTemplate(id: string, data: Partial<InsertIfoxContentTemplate>, userId: string): Promise<IfoxContentTemplate> {
    return await storage.updateIfoxContentTemplate(id, {
      ...data,
      updatedBy: userId,
    });
  }

  /**
   * Delete template (soft delete by setting isActive = false)
   * 
   * @param id - Template ID to delete
   */
  async deleteTemplate(id: string): Promise<void> {
    await storage.deleteIfoxContentTemplate(id);
  }

  /**
   * Increment usage count when template is used
   * 
   * Tracks how many times a template has been used for analytics.
   * 
   * @param id - Template ID
   */
  async recordTemplateUsage(id: string): Promise<void> {
    await storage.incrementTemplateUsage(id);
  }

  /**
   * Get popular templates (most used)
   * 
   * Returns templates sorted by usage count in descending order.
   * 
   * @param limit - Maximum number of templates to return (default: 10)
   * @returns Array of popular templates
   */
  async getPopularTemplates(limit: number = 10): Promise<IfoxContentTemplate[]> {
    const result = await storage.listIfoxContentTemplates({
      isActive: true,
      limit,
    });
    // Sort by usage count (already done in storage layer)
    return result.templates;
  }
}

/**
 * Singleton instance of IfoxTemplatesService
 */
export const ifoxTemplatesService = new IfoxTemplatesService();
