// Extracted from pages/ArticleEditor.tsx (refactor: article-editor-split).
// Generates a URL slug from Arabic/English text.
export const generateSlug = (text: string) => {
  if (!text || typeof text !== 'string') return "";

  const slug = text
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "") // Keep Arabic, English, numbers, spaces, hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .substring(0, 150); // Limit to 150 characters

  return slug || ""; // Return slug or empty string
};
