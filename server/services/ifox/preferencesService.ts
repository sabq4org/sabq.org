import { storage } from "../../storage";
import type { InsertIfoxAiPreferences, IfoxAiPreferences } from "@shared/schema";

/**
 * iFox AI Preferences Service
 * 
 * Manages centralized AI configuration settings for iFox AI Management System.
 * Implements singleton pattern where only one active configuration exists at a time.
 */
export class IfoxPreferencesService {
  /**
   * Get active AI preferences (singleton pattern - only one active config)
   * 
   * @returns The active AI preferences or null if none exists
   */
  async getActivePreferences(): Promise<IfoxAiPreferences | null> {
    const prefs = await storage.getActiveIfoxAiPreferences();
    return prefs || null;
  }

  /**
   * Create or update preferences (creates default if doesn't exist)
   * 
   * @param data - Partial preferences data to save
   * @param userId - ID of the user performing the operation
   * @returns The saved preferences
   */
  async savePreferences(data: Partial<InsertIfoxAiPreferences>, userId: string): Promise<IfoxAiPreferences> {
    const existing = await storage.getActiveIfoxAiPreferences();
    
    if (existing) {
      return await storage.createOrUpdateIfoxAiPreferences({
        ...data,
        updatedBy: userId,
      });
    }
    
    // Create new with defaults
    return await storage.createOrUpdateIfoxAiPreferences({
      ...data,
      createdBy: userId,
      isActive: true,
    });
  }

  /**
   * Reset to default preferences
   * 
   * Resets all AI preferences to their default values.
   * 
   * @param userId - ID of the user performing the reset
   * @returns The reset preferences with default values
   */
  async resetToDefaults(userId: string): Promise<IfoxAiPreferences> {
    return await storage.createOrUpdateIfoxAiPreferences({
      writingStyle: "professional",
      tone: "neutral",
      contentDepth: "medium",
      defaultWordCount: 800,
      primaryModel: "gpt-4",
      autoGenerateSeo: true,
      autoGenerateImages: true,
      enableQualityCheck: true,
      qualityThreshold: 70,
      autoPublishEnabled: false,
      updatedBy: userId,
      isActive: true,
    });
  }
}

/**
 * Singleton instance of IfoxPreferencesService
 */
export const ifoxPreferencesService = new IfoxPreferencesService();
