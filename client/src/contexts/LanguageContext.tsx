import { createContext, useContext, useState, useEffect } from "react";

export type Language = "ar" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: "rtl" | "ltr";
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Translation dictionaries
const translations = {
  ar: {
    // Navigation
    "nav.home": "الرئيسية",
    "nav.articles": "الأخبار",
    "nav.categories": "التصنيفات",
    "nav.dashboard": "لوحة التحكم",
    
    // Common
    "common.loading": "جاري التحميل...",
    "common.error": "حدث خطأ",
    "common.save": "حفظ",
    "common.cancel": "إلغاء",
    "common.delete": "حذف",
    "common.edit": "تعديل",
    "common.create": "إنشاء",
    "common.search": "بحث",
    "common.filter": "تصفية",
    "common.back": "رجوع",
    "common.next": "التالي",
    "common.previous": "السابق",
    "common.submit": "إرسال",
    "common.close": "إغلاق",
    
    // Article
    "article.title": "العنوان",
    "article.subtitle": "العنوان الفرعي",
    "article.content": "المحتوى",
    "article.category": "التصنيف",
    "article.status": "الحالة",
    "article.publish": "نشر",
    "article.draft": "مسودة",
    "article.published": "منشور",
    "article.views": "المشاهدات",
    "article.comments": "التعليقات",
    "article.likes": "الإعجابات",
    
    // Category
    "category.name": "اسم التصنيف",
    "category.description": "الوصف",
    "category.slug": "الرابط المختصر",
    
    // Dashboard
    "dashboard.title": "لوحة التحكم",
    "dashboard.articles": "الأخبار والمقالات",
    "dashboard.categories": "التصنيفات",
    "dashboard.createArticle": "إنشاء خبر جديد",
    "dashboard.createCategory": "إنشاء تصنيف جديد",
  },
  en: {
    // Navigation
    "nav.home": "Home",
    "nav.articles": "Articles",
    "nav.categories": "Categories",
    "nav.dashboard": "Dashboard",
    
    // Common
    "common.loading": "Loading...",
    "common.error": "An error occurred",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.create": "Create",
    "common.search": "Search",
    "common.filter": "Filter",
    "common.back": "Back",
    "common.next": "Next",
    "common.previous": "Previous",
    "common.submit": "Submit",
    "common.close": "Close",
    
    // Article
    "article.title": "Title",
    "article.subtitle": "Subtitle",
    "article.content": "Content",
    "article.category": "Category",
    "article.status": "Status",
    "article.publish": "Publish",
    "article.draft": "Draft",
    "article.published": "Published",
    "article.views": "Views",
    "article.comments": "Comments",
    "article.likes": "Likes",
    
    // Category
    "category.name": "Category Name",
    "category.description": "Description",
    "category.slug": "Slug",
    
    // Dashboard
    "dashboard.title": "Dashboard",
    "dashboard.articles": "Articles",
    "dashboard.categories": "Categories",
    "dashboard.createArticle": "Create New Article",
    "dashboard.createCategory": "Create New Category",
  },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Detect language from URL path or localStorage
  const getInitialLanguage = (): Language => {
    const path = window.location.pathname;
    if (path.startsWith("/en")) return "en";
    if (path.startsWith("/ar")) return "ar";
    
    const stored = localStorage.getItem("preferred-language") as Language;
    return stored || "ar"; // Default to Arabic
  };

  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("preferred-language", lang);
    
    // Update document direction and lang attribute
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  // Update direction on mount and language change
  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations.ar] || key;
  };

  const dir = language === "ar" ? "rtl" : "ltr";

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
