/**
 * iFox Calendar Service
 * 
 * خدمة إدارة التقويم التحريري الذكي
 * Manages editorial calendar entries for AI-generated and human-assigned content
 */

import { storage } from "../../storage";
import type { InsertIfoxEditorialCalendar, IfoxEditorialCalendar } from "@shared/schema";

/**
 * Helper function to normalize dates to ISO UTC strings
 * Converts all Date objects in an object to ISO 8601 UTC strings
 */
function normalizeDates<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString() as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => normalizeDates(item)) as any;
  }

  if (typeof obj === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeDates(value);
    }
    return normalized;
  }

  return obj;
}

export class IfoxCalendarService {
  /**
   * Create new calendar entry
   */
  async createEntry(data: InsertIfoxEditorialCalendar): Promise<IfoxEditorialCalendar> {
    const entry = await storage.createIfoxEditorialCalendarEntry(data);
    return normalizeDates(entry);
  }

  /**
   * List calendar entries with filters
   */
  async listEntries(filters?: {
    scheduledDateFrom?: Date;
    scheduledDateTo?: Date;
    status?: string;
    assignmentType?: string;
    assignedToUser?: string;
    page?: number;
    limit?: number;
  }): Promise<IfoxEditorialCalendar[]> {
    const result = await storage.listIfoxEditorialCalendar(filters);
    return normalizeDates(result.entries);
  }

  /**
   * Get entry by ID
   */
  async getEntry(id: string): Promise<IfoxEditorialCalendar | null> {
    const entry = await storage.getIfoxEditorialCalendarEntry(id);
    return entry ? normalizeDates(entry) : null;
  }

  /**
   * Update entry
   */
  async updateEntry(id: string, data: Partial<InsertIfoxEditorialCalendar>, userId: string): Promise<IfoxEditorialCalendar> {
    const entry = await storage.updateIfoxEditorialCalendarEntry(id, {
      ...data,
      updatedBy: userId,
    });
    return normalizeDates(entry);
  }

  /**
   * Delete entry
   */
  async deleteEntry(id: string): Promise<void> {
    await storage.deleteIfoxEditorialCalendarEntry(id);
  }

  /**
   * Update entry status and link to published article
   */
  async markAsCompleted(id: string, articleId: string): Promise<IfoxEditorialCalendar> {
    const entry = await storage.updateIfoxEditorialCalendarStatus(id, "completed", articleId);
    return normalizeDates(entry);
  }

  /**
   * Get entries for a specific date range
   */
  async getEntriesForDateRange(scheduledDateFrom: Date, scheduledDateTo: Date): Promise<IfoxEditorialCalendar[]> {
    const result = await storage.listIfoxEditorialCalendar({
      scheduledDateFrom,
      scheduledDateTo,
    });
    return normalizeDates(result.entries);
  }

  /**
   * Get upcoming AI-assigned entries (next 7 days)
   */
  async getUpcomingAiEntries(daysAhead: number = 7): Promise<IfoxEditorialCalendar[]> {
    const scheduledDateFrom = new Date();
    const scheduledDateTo = new Date();
    scheduledDateTo.setDate(scheduledDateTo.getDate() + daysAhead);

    const result = await storage.listIfoxEditorialCalendar({
      scheduledDateFrom,
      scheduledDateTo,
      assignmentType: "ai",
      status: "planned",
    });

    return normalizeDates(result.entries);
  }
}

export const ifoxCalendarService = new IfoxCalendarService();
