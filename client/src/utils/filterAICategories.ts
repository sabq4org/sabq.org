/**
 * Utility function to filter out AI (iFox) categories from the main site
 * AI categories are only accessible through /ai routes
 */

export interface CategoryWithSlug {
  id: string;
  slug?: string;
  [key: string]: any;
}

const AI_CATEGORY_ID = "112b3ebd-ab7c-424c-a2d8-ee0287df5506";

/**
 * Checks if a category is an AI category that should be hidden from main site
 * @param category Category object with id and optional slug
 * @returns true if category should be filtered out (is an AI category)
 */
export function isAICategory(category: CategoryWithSlug): boolean {
  // Filter by specific AI category ID
  if (category.id === AI_CATEGORY_ID) {
    return true;
  }

  // Filter by slug prefix
  if (category.slug) {
    const slugLower = category.slug.toLowerCase();
    if (slugLower.startsWith('ifox') || slugLower.startsWith('ai-')) {
      return true;
    }
  }

  return false;
}

/**
 * Filters out AI categories from an array of categories
 * @param categories Array of categories
 * @returns Filtered array without AI categories
 */
export function filterAICategories<T extends CategoryWithSlug>(categories: T[]): T[] {
  return categories.filter(category => !isAICategory(category));
}
