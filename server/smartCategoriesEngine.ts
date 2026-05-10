/**
 * Smart Categories Engine
 * محرك التصنيفات الذكية - يدير التصنيفات الديناميكية والموسمية تلقائياً
 */

import { db } from "./db";
import { categories, type Category } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import HijriDate, { toHijri, toGregorian } from "hijri-converter";

/**
 * الأشهر الهجرية بالأسماء العربية
 * Hijri months in Arabic names
 */
const HIJRI_MONTHS = [
  "محرم",         // 1
  "صفر",          // 2
  "ربيع الأول",   // 3
  "ربيع الآخر",   // 4
  "جمادى الأولى", // 5
  "جمادى الآخرة", // 6
  "رجب",          // 7
  "شعبان",        // 8
  "رمضان",        // 9
  "شوال",         // 10
  "ذو القعدة",    // 11
  "ذو الحجة"      // 12
];

/**
 * تحويل اسم الشهر الهجري العربي إلى رقمه
 * Convert Arabic Hijri month name to number (1-12)
 */
function getHijriMonthNumber(monthName: string): number {
  const index = HIJRI_MONTHS.indexOf(monthName);
  return index >= 0 ? index + 1 : -1;
}

/**
 * إضافة أيام إلى تاريخ ميلادي والحصول على تاريخ ميلادي جديد
 * Add days to a Gregorian date (using ISO dates for precision)
 */
function addDaysToDate(date: Date, days: number): Date {
  const newDate = new Date(date);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

/**
 * تحويل تاريخ هجري إلى ميلادي
 * Convert Hijri date to Gregorian Date object
 */
function hijriToDate(hy: number, hm: number, hd: number): Date {
  const greg = toGregorian(hy, hm, hd);
  return new Date(greg.gy, greg.gm - 1, greg.gd);
}

/**
 * الحصول على آخر يوم في شهر هجري معين (29 أو 30)
 * Get the last day of a Hijri month (29 or 30 days)
 */
function getHijriMonthLength(year: number, month: number): number {
  // Try day 30 first
  try {
    const greg30 = toGregorian(year, month, 30);
    const hijri30 = toHijri(greg30.gy, greg30.gm, greg30.gd);
    
    // If month is still the same, this month has 30 days
    if (hijri30.hm === month && hijri30.hy === year) {
      return 30;
    }
  } catch {
    // Day 30 doesn't exist or conversion failed, try day 29
  }
  
  // Try day 29
  try {
    const greg29 = toGregorian(year, month, 29);
    const hijri29 = toHijri(greg29.gy, greg29.gm, greg29.gd);
    
    // If month is still the same, this month has 29 days
    if (hijri29.hm === month && hijri29.hy === year) {
      return 29;
    }
  } catch {
    // Shouldn't happen, but default to 30
  }
  
  // Default to 30 (shouldn't reach here)
  return 30;
}

/**
 * التحقق من فعالية تصنيف موسمي بناءً على التاريخ الهجري
 * Check if seasonal category should be active based on Hijri date
 */
function shouldActivateHijriCategory(
  seasonalRules: any,
  currentDate: Date
): boolean {
  if (!seasonalRules.hijriMonth) return false;
  
  // Get target month number
  const targetMonthNumber = getHijriMonthNumber(seasonalRules.hijriMonth);
  if (targetMonthNumber === -1) {
    console.error(`[Smart Categories] Invalid Hijri month: ${seasonalRules.hijriMonth}`);
    return false;
  }
  
  const activateDaysBefore = seasonalRules.activateDaysBefore || 0;
  const deactivateDaysAfter = seasonalRules.deactivateDaysAfter || 0;
  
  // Get current Hijri date
  const currentHijri = toHijri(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    currentDate.getDate()
  );
  
  // Determine which years to check
  const yearsToCheck: number[] = [];
  
  if (seasonalRules.hijriYear && seasonalRules.hijriYear !== "auto") {
    // Specific year provided
    yearsToCheck.push(parseInt(seasonalRules.hijriYear, 10));
  } else {
    // Auto mode: check current and next 9 years (covers long gaps)
    for (let i = 0; i < 10; i++) {
      yearsToCheck.push(currentHijri.hy + i);
    }
  }
  
  // Check each candidate year
  for (const targetYear of yearsToCheck) {
    // Get month boundaries
    const monthStart = hijriToDate(targetYear, targetMonthNumber, 1);
    const monthLength = getHijriMonthLength(targetYear, targetMonthNumber);
    const monthEnd = hijriToDate(targetYear, targetMonthNumber, monthLength);
    
    // Calculate activation window with offsets
    const activationStart = addDaysToDate(monthStart, -activateDaysBefore);
    const deactivationEnd = addDaysToDate(monthEnd, deactivateDaysAfter);
    
    // Check if current date falls within this window
    if (currentDate >= activationStart && currentDate <= deactivationEnd) {
      return true;
    }
    
    // If we're in auto mode and already past this occurrence's deactivation window,
    // continue to next year. If in specific-year mode, stop here.
    if (seasonalRules.hijriYear && seasonalRules.hijriYear !== "auto") {
      break;
    }
  }
  
  return false;
}

/**
 * التحقق من فعالية تصنيف موسمي بناءً على التاريخ الميلادي
 * Check if seasonal category should be active based on Gregorian date
 */
function shouldActivateGregorianCategory(
  seasonalRules: any,
  currentDate: Date
): boolean {
  // Check by month
  if (seasonalRules.gregorianMonth) {
    const targetMonth = seasonalRules.gregorianMonth;
    const activateDaysBefore = seasonalRules.activateDaysBefore || 0;
    const deactivateDaysAfter = seasonalRules.deactivateDaysAfter || 0;
    
    // Check previous year, current year, and next year to handle all cross-year scenarios
    // Example: Jan 5 2025 with target December (+10 days) needs 2024 window
    // Example: Dec 25 2025 with target January (+10 days) needs 2026 window
    const yearsToCheck = [
      currentDate.getFullYear() - 1,
      currentDate.getFullYear(),
      currentDate.getFullYear() + 1
    ];
    
    for (const year of yearsToCheck) {
      // Calculate activation window for this year
      const activationDate = new Date(year, targetMonth - 1, 1);
      activationDate.setDate(activationDate.getDate() - activateDaysBefore);
      
      const deactivationDate = new Date(year, targetMonth, 0); // Last day of target month
      deactivationDate.setDate(deactivationDate.getDate() + deactivateDaysAfter);
      
      // Check if current date falls within this window
      if (currentDate >= activationDate && currentDate <= deactivationDate) {
        return true;
      }
    }
    
    return false;
  }
  
  // Check by date range
  if (seasonalRules.dateRange) {
    const startDate = new Date(seasonalRules.dateRange.start);
    const endDate = new Date(seasonalRules.dateRange.end);
    
    return currentDate >= startDate && currentDate <= endDate;
  }
  
  return false;
}

/**
 * التحقق من فعالية تصنيف موسمي
 * Check if a seasonal category should be active
 */
export function shouldCategoryBeActive(
  category: any,
  currentDate: Date = new Date()
): boolean {
  if (!category.seasonalRules) return false;
  
  const { seasonalRules } = category;
  
  // Check Hijri-based activation
  if (seasonalRules.hijriMonth) {
    return shouldActivateHijriCategory(seasonalRules, currentDate);
  }
  
  // Check Gregorian-based activation
  if (seasonalRules.gregorianMonth || seasonalRules.dateRange) {
    return shouldActivateGregorianCategory(seasonalRules, currentDate);
  }
  
  return false;
}

/**
 * تفعيل/تعطيل التصنيفات الموسمية تلقائياً
 * Activate/deactivate seasonal categories automatically
 */
export async function updateSeasonalCategories(): Promise<{
  activated: string[];
  deactivated: string[];
}> {
  try {
    const currentDate = new Date();
    
    // Fetch all seasonal categories with autoActivate enabled
    const seasonalCategories = await db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.type, "seasonal"),
          eq(categories.autoActivate, true)
        )
      );
    
    const activated: string[] = [];
    const deactivated: string[] = [];
    
    for (const category of seasonalCategories) {
      const shouldBeActive = shouldCategoryBeActive(category, currentDate);
      const isCurrentlyActive = category.status === "active";
      
      // Need to activate
      if (shouldBeActive && !isCurrentlyActive) {
        await db
          .update(categories)
          .set({ status: "active" })
          .where(eq(categories.id, category.id));
        
        activated.push(category.nameAr);
        console.log(`[Smart Categories] ✅ Activated: ${category.nameAr} (${category.slug})`);
      }
      
      // Need to deactivate
      if (!shouldBeActive && isCurrentlyActive) {
        await db
          .update(categories)
          .set({ status: "inactive" })
          .where(eq(categories.id, category.id));
        
        deactivated.push(category.nameAr);
        console.log(`[Smart Categories] ⏸️ Deactivated: ${category.nameAr} (${category.slug})`);
      }
    }
    
    if (activated.length > 0 || deactivated.length > 0) {
      console.log(`[Smart Categories] 🔄 Update complete:`, {
        activated: activated.length,
        deactivated: deactivated.length,
      });
    }
    
    return { activated, deactivated };
  } catch (error) {
    console.error("[Smart Categories] ❌ Error updating seasonal categories:", error);
    throw error;
  }
}

/**
 * الحصول على التصنيفات النشطة حسب النوع
 * Get active categories by type
 */
export async function getActiveCategories(type?: "core" | "dynamic" | "smart" | "seasonal") {
  try {
    let query = db
      .select()
      .from(categories)
      .where(eq(categories.status, "active"));
    
    if (type) {
      query = db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.status, "active"),
            eq(categories.type, type)
          )
        );
    }
    
    const results = await query;
    return results;
  } catch (error) {
    console.error("[Smart Categories] ❌ Error fetching active categories:", error);
    throw error;
  }
}

/**
 * الحصول على التصنيفات المنظمة للعرض في الواجهة
 * Get organized categories for UI display
 */
export async function getCategoriesForUI() {
  try {
    const allActive = await db
      .select()
      .from(categories)
      .where(eq(categories.status, "active"))
      .orderBy(categories.displayOrder);
    
    return {
      core: allActive.filter((c: Category) => c.type === "core"),
      dynamic: allActive.filter((c: Category) => c.type === "dynamic"),
      smart: allActive.filter((c: Category) => c.type === "smart"),
      seasonal: allActive.filter((c: Category) => c.type === "seasonal"),
      all: allActive,
    };
  } catch (error) {
    console.error("[Smart Categories] ❌ Error fetching categories for UI:", error);
    throw error;
  }
}

/**
 * تحديث محتوى التصنيفات الديناميكية (الآن، مختارات AI، إلخ)
 * Update content of dynamic categories
 */
export async function updateDynamicCategories(): Promise<void> {
  try {
    const dynamicCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.type, "dynamic"));
    
    for (const category of dynamicCategories) {
      // Logic to update dynamic content based on category slug
      switch (category.slug) {
        case "now":
          // Update "الآن" with trending/breaking news
          console.log(`[Smart Categories] 🔥 Updating "الآن" category...`);
          // TODO: Implement trending news logic
          break;
        
        case "ai-picks":
          // Update "مختارات AI" with personalized recommendations
          console.log(`[Smart Categories] ✨ Updating "مختارات AI" category...`);
          // TODO: Implement AI recommendations logic
          break;
        
        default:
          break;
      }
    }
  } catch (error) {
    console.error("[Smart Categories] ❌ Error updating dynamic categories:", error);
  }
}
