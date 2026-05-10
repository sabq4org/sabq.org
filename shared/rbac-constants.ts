// RBAC Constants - Roles and Permissions Definitions
// هذا الملف يحتوي على تعريفات الأدوار والصلاحيات المستخدمة في النظام

export const ROLE_NAMES = {
  SYSTEM_ADMIN: "system_admin",
  ADMIN: "admin",
  EDITOR: "editor",
  REPORTER: "reporter",
  OPINION_AUTHOR: "opinion_author",
  COMMENTS_MODERATOR: "comments_moderator",
  MEDIA_MANAGER: "media_manager",
  READER: "reader",
} as const;

export const ROLE_LABELS_AR = {
  [ROLE_NAMES.SYSTEM_ADMIN]: "مدير النظام",
  [ROLE_NAMES.ADMIN]: "مسؤول",
  [ROLE_NAMES.EDITOR]: "محرر",
  [ROLE_NAMES.REPORTER]: "مراسل",
  [ROLE_NAMES.OPINION_AUTHOR]: "كاتب مقال رأي",
  [ROLE_NAMES.COMMENTS_MODERATOR]: "مشرف تعليقات",
  [ROLE_NAMES.MEDIA_MANAGER]: "مدير وسائط",
  [ROLE_NAMES.READER]: "قارئ",
} as const;

export const ROLE_LABELS_EN = {
  [ROLE_NAMES.SYSTEM_ADMIN]: "System Admin",
  [ROLE_NAMES.ADMIN]: "Admin",
  [ROLE_NAMES.EDITOR]: "Editor",
  [ROLE_NAMES.REPORTER]: "Reporter",
  [ROLE_NAMES.OPINION_AUTHOR]: "Opinion Author",
  [ROLE_NAMES.COMMENTS_MODERATOR]: "Comments Moderator",
  [ROLE_NAMES.MEDIA_MANAGER]: "Media Manager",
  [ROLE_NAMES.READER]: "Reader",
} as const;

export const ROLE_DESCRIPTIONS_AR = {
  [ROLE_NAMES.SYSTEM_ADMIN]: "صلاحيات كاملة على النظام",
  [ROLE_NAMES.ADMIN]: "إدارة المستخدمين والموافقات التحريرية والإعدادات العامة",
  [ROLE_NAMES.EDITOR]: "إنشاء وتحرير ونشر المحتوى وإدارة الوسائط والتصنيفات",
  [ROLE_NAMES.REPORTER]: "إنشاء وتحرير المقالات الخاصة فقط دون صلاحيات النشر، مع إمكانية رفع الوسائط ومتابعة التعليقات والإحصائيات على مقالاته",
  [ROLE_NAMES.OPINION_AUTHOR]: "كتابة وتحرير مقالات الرأي الخاصة فقط وإرسالها للمراجعة، دون صلاحيات النشر المباشر",
  [ROLE_NAMES.COMMENTS_MODERATOR]: "إدارة التعليقات: الموافقة والرفض والتعديل والحذف والحظر",
  [ROLE_NAMES.MEDIA_MANAGER]: "إدارة المكتبة الإعلامية والألبومات",
  [ROLE_NAMES.READER]: "مستخدم عادي بدون صلاحيات تحريرية",
} as const;

// Permission codes mapping to roles
export const PERMISSION_CODES = {
  // Articles
  ARTICLES_VIEW: "articles.view",
  ARTICLES_CREATE: "articles.create",
  ARTICLES_EDIT_OWN: "articles.edit_own",
  ARTICLES_EDIT_ANY: "articles.edit_any",
  ARTICLES_PUBLISH: "articles.publish",
  ARTICLES_UNPUBLISH: "articles.unpublish",
  ARTICLES_DELETE: "articles.delete",
  ARTICLES_ARCHIVE: "articles.archive",
  ARTICLES_FEATURE: "articles.feature",
  
  // Article Editor Features - ميزات محرر المقالات
  ARTICLES_AI_GENERATE: "articles.ai_generate",
  ARTICLES_SCHEDULE: "articles.schedule",
  ARTICLES_POLLS: "articles.polls",
  ARTICLES_SMART_LINKS: "articles.smart_links",
  ARTICLES_GENERATE_IMAGES: "articles.generate_images",
  ARTICLES_INFOGRAPHICS: "articles.infographics",
  ARTICLES_NEWS_TYPE: "articles.news_type",
  ARTICLES_MUQTARAB_ANGLES: "articles.muqtarab_angles",
  ARTICLES_COMPREHENSIVE_EDIT: "articles.comprehensive_edit",
  ARTICLES_CONTENT_TYPE_SELECTOR: "articles.content_type_selector",
  ARTICLES_HIDE_HOMEPAGE: "articles.hide_homepage",

  // Categories
  CATEGORIES_VIEW: "categories.view",
  CATEGORIES_CREATE: "categories.create",
  CATEGORIES_UPDATE: "categories.update",
  CATEGORIES_DELETE: "categories.delete",

  // Users
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  USERS_SUSPEND: "users.suspend",
  USERS_BAN: "users.ban",
  USERS_CHANGE_ROLE: "users.change_role",

  // Comments
  COMMENTS_VIEW: "comments.view",
  COMMENTS_VIEW_OWN: "comments.view_own",
  COMMENTS_CREATE: "comments.create",
  COMMENTS_EDIT: "comments.edit",
  COMMENTS_APPROVE: "comments.approve",
  COMMENTS_REJECT: "comments.reject",
  COMMENTS_DELETE: "comments.delete",
  COMMENTS_BAN_USER: "comments.ban_user",

  // Media
  MEDIA_VIEW: "media.view",
  MEDIA_UPLOAD: "media.upload",
  MEDIA_EDIT: "media.edit",
  MEDIA_DELETE: "media.delete",

  // Settings
  SETTINGS_VIEW: "settings.view",
  SETTINGS_UPDATE: "settings.update",

  // Analytics
  ANALYTICS_VIEW: "analytics.view",
  ANALYTICS_VIEW_OWN: "analytics.view_own",
  
  // Tags
  TAGS_VIEW: "tags.view",
  TAGS_CREATE: "tags.create",
  TAGS_UPDATE: "tags.update",
  TAGS_DELETE: "tags.delete",
  
  // Mirqab - المرقاب (Future Forecasting/Observatory)
  MIRQAB_VIEW: "mirqab.view",
  MIRQAB_CREATE: "mirqab.create",
  MIRQAB_EDIT: "mirqab.edit",
  MIRQAB_DELETE: "mirqab.delete",
  MIRQAB_PUBLISH: "mirqab.publish",
  MIRQAB_MANAGE_SETTINGS: "mirqab.manage_settings",
  
  // Audio Newsletters - النشرات الصوتية
  AUDIO_NEWSLETTERS_VIEW: "audio_newsletters.view",
  AUDIO_NEWSLETTERS_CREATE: "audio_newsletters.create",
  AUDIO_NEWSLETTERS_EDIT: "audio_newsletters.edit",
  AUDIO_NEWSLETTERS_DELETE: "audio_newsletters.delete",
  AUDIO_NEWSLETTERS_PUBLISH: "audio_newsletters.publish",
  AUDIO_NEWSLETTERS_MANAGE_ALL: "audio_newsletters.manage_all",
  
  // Audio Briefs - الأخبار الصوتية السريعة
  AUDIO_BRIEFS_VIEW: "audio_briefs.view",
  AUDIO_BRIEFS_CREATE: "audio_briefs.create",
  AUDIO_BRIEFS_EDIT: "audio_briefs.edit",
  AUDIO_BRIEFS_DELETE: "audio_briefs.delete",
  AUDIO_BRIEFS_PUBLISH: "audio_briefs.publish",
  AUDIO_BRIEFS_GENERATE: "audio_briefs.generate",
  AUDIO_BRIEFS_MANAGE_ALL: "audio_briefs.manage_all",
  
  // Opinion Articles - مقالات الرأي
  OPINION_VIEW: "opinion.view",
  OPINION_CREATE: "opinion.create",
  OPINION_EDIT_OWN: "opinion.edit_own",
  OPINION_EDIT_ANY: "opinion.edit_any",
  OPINION_SUBMIT_REVIEW: "opinion.submit_review",
  OPINION_REVIEW: "opinion.review",
  OPINION_PUBLISH: "opinion.publish",
  OPINION_REJECT: "opinion.reject",
  OPINION_DELETE_OWN: "opinion.delete_own",
  OPINION_DELETE_ANY: "opinion.delete_any",
  
  // System
  SYSTEM_VIEW_AUDIT: "system.view_audit",
  SYSTEM_MANAGE_SETTINGS: "system.manage_settings",
  
  // Dashboard - لوحة التحكم (صلاحيات فرعية)
  DASHBOARD_VIEW: "dashboard.view",
  DASHBOARD_VIEW_STATS: "dashboard.view_stats",
  DASHBOARD_VIEW_MESSAGES: "dashboard.view_messages",
  DASHBOARD_VIEW_MODERATORS: "dashboard.view_moderators",
  DASHBOARD_VIEW_QUICK_ACTIONS: "dashboard.view_quick_actions",
  DASHBOARD_VIEW_VISITORS: "dashboard.view_visitors",
  
  // Communications - التواصل
  COMMUNICATIONS_STAFF: "communications.staff",
  
  // Breaking News Ticker - شريط الأخبار العاجلة
  BREAKING_TICKER_MANAGE: "breaking_ticker.manage",
  
  // Staff Productivity - إنتاجية الموظفين
  VIEW_STAFF_PRODUCTIVITY: "staff.view_productivity",
} as const;

// Role to permissions mapping (for UI display)
export const ROLE_PERMISSIONS_MAP: Record<string, string[]> = {
  [ROLE_NAMES.SYSTEM_ADMIN]: ["*"], // All permissions
  
  [ROLE_NAMES.ADMIN]: [
    PERMISSION_CODES.USERS_VIEW,
    PERMISSION_CODES.USERS_CREATE,
    PERMISSION_CODES.USERS_UPDATE, // Note: Admins can update users but email changes require system_admin (enforced in backend)
    PERMISSION_CODES.USERS_DELETE,
    PERMISSION_CODES.USERS_SUSPEND,
    PERMISSION_CODES.USERS_BAN,
    PERMISSION_CODES.USERS_CHANGE_ROLE,
    PERMISSION_CODES.ARTICLES_VIEW,
    PERMISSION_CODES.ARTICLES_PUBLISH,
    PERMISSION_CODES.ARTICLES_EDIT_ANY,
    PERMISSION_CODES.ARTICLES_DELETE,
    // Article Editor Features
    PERMISSION_CODES.ARTICLES_AI_GENERATE,
    PERMISSION_CODES.ARTICLES_SCHEDULE,
    PERMISSION_CODES.ARTICLES_POLLS,
    PERMISSION_CODES.ARTICLES_SMART_LINKS,
    PERMISSION_CODES.ARTICLES_GENERATE_IMAGES,
    PERMISSION_CODES.ARTICLES_INFOGRAPHICS,
    PERMISSION_CODES.ARTICLES_NEWS_TYPE,
    PERMISSION_CODES.ARTICLES_MUQTARAB_ANGLES,
    PERMISSION_CODES.ARTICLES_COMPREHENSIVE_EDIT,
    PERMISSION_CODES.ARTICLES_CONTENT_TYPE_SELECTOR,
    PERMISSION_CODES.ARTICLES_HIDE_HOMEPAGE,
    PERMISSION_CODES.COMMENTS_VIEW,
    PERMISSION_CODES.COMMENTS_APPROVE,
    PERMISSION_CODES.MEDIA_VIEW,
    PERMISSION_CODES.MEDIA_UPLOAD,
    PERMISSION_CODES.SETTINGS_VIEW,
    PERMISSION_CODES.SETTINGS_UPDATE,
    PERMISSION_CODES.ANALYTICS_VIEW,
    PERMISSION_CODES.SYSTEM_VIEW_AUDIT,
    PERMISSION_CODES.SYSTEM_MANAGE_SETTINGS,
    PERMISSION_CODES.MIRQAB_VIEW,
    PERMISSION_CODES.MIRQAB_CREATE,
    PERMISSION_CODES.MIRQAB_EDIT,
    PERMISSION_CODES.MIRQAB_DELETE,
    PERMISSION_CODES.MIRQAB_PUBLISH,
    PERMISSION_CODES.MIRQAB_MANAGE_SETTINGS,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_VIEW,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_CREATE,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_EDIT,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_DELETE,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_PUBLISH,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_MANAGE_ALL,
    PERMISSION_CODES.AUDIO_BRIEFS_VIEW,
    PERMISSION_CODES.AUDIO_BRIEFS_CREATE,
    PERMISSION_CODES.AUDIO_BRIEFS_EDIT,
    PERMISSION_CODES.AUDIO_BRIEFS_DELETE,
    PERMISSION_CODES.AUDIO_BRIEFS_PUBLISH,
    PERMISSION_CODES.AUDIO_BRIEFS_GENERATE,
    PERMISSION_CODES.AUDIO_BRIEFS_MANAGE_ALL,
    PERMISSION_CODES.OPINION_VIEW,
    PERMISSION_CODES.OPINION_EDIT_ANY,
    PERMISSION_CODES.OPINION_REVIEW,
    PERMISSION_CODES.OPINION_PUBLISH,
    PERMISSION_CODES.OPINION_REJECT,
    PERMISSION_CODES.OPINION_DELETE_ANY,
    // Dashboard - صلاحيات كاملة للمسؤول
    PERMISSION_CODES.DASHBOARD_VIEW,
    PERMISSION_CODES.DASHBOARD_VIEW_STATS,
    PERMISSION_CODES.DASHBOARD_VIEW_MESSAGES,
    PERMISSION_CODES.DASHBOARD_VIEW_MODERATORS,
    PERMISSION_CODES.DASHBOARD_VIEW_QUICK_ACTIONS,
    PERMISSION_CODES.DASHBOARD_VIEW_VISITORS,
    // Communications
    PERMISSION_CODES.COMMUNICATIONS_STAFF,
    // Breaking News Ticker
    PERMISSION_CODES.BREAKING_TICKER_MANAGE,
    // Staff Productivity
    PERMISSION_CODES.VIEW_STAFF_PRODUCTIVITY,
  ],
  
  [ROLE_NAMES.EDITOR]: [
    PERMISSION_CODES.ARTICLES_VIEW,
    PERMISSION_CODES.ARTICLES_CREATE,
    PERMISSION_CODES.ARTICLES_EDIT_ANY,
    PERMISSION_CODES.ARTICLES_PUBLISH,
    PERMISSION_CODES.ARTICLES_UNPUBLISH,
    PERMISSION_CODES.ARTICLES_FEATURE,
    // Article Editor Features
    PERMISSION_CODES.ARTICLES_AI_GENERATE,
    PERMISSION_CODES.ARTICLES_SCHEDULE,
    PERMISSION_CODES.ARTICLES_POLLS,
    PERMISSION_CODES.ARTICLES_SMART_LINKS,
    PERMISSION_CODES.ARTICLES_GENERATE_IMAGES,
    PERMISSION_CODES.ARTICLES_INFOGRAPHICS,
    PERMISSION_CODES.ARTICLES_NEWS_TYPE,
    PERMISSION_CODES.ARTICLES_MUQTARAB_ANGLES,
    PERMISSION_CODES.ARTICLES_COMPREHENSIVE_EDIT,
    PERMISSION_CODES.ARTICLES_CONTENT_TYPE_SELECTOR,
    PERMISSION_CODES.ARTICLES_HIDE_HOMEPAGE,
    PERMISSION_CODES.MEDIA_VIEW,
    PERMISSION_CODES.MEDIA_UPLOAD,
    PERMISSION_CODES.MEDIA_EDIT,
    PERMISSION_CODES.CATEGORIES_VIEW,
    PERMISSION_CODES.CATEGORIES_CREATE,
    PERMISSION_CODES.CATEGORIES_UPDATE,
    PERMISSION_CODES.ANALYTICS_VIEW,
    PERMISSION_CODES.MIRQAB_VIEW,
    PERMISSION_CODES.MIRQAB_CREATE,
    PERMISSION_CODES.MIRQAB_EDIT,
    PERMISSION_CODES.MIRQAB_PUBLISH,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_VIEW,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_CREATE,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_EDIT,
    PERMISSION_CODES.AUDIO_NEWSLETTERS_PUBLISH,
    PERMISSION_CODES.AUDIO_BRIEFS_VIEW,
    PERMISSION_CODES.AUDIO_BRIEFS_CREATE,
    PERMISSION_CODES.AUDIO_BRIEFS_EDIT,
    PERMISSION_CODES.AUDIO_BRIEFS_PUBLISH,
    PERMISSION_CODES.AUDIO_BRIEFS_GENERATE,
    PERMISSION_CODES.OPINION_VIEW,
    PERMISSION_CODES.OPINION_CREATE,
    PERMISSION_CODES.OPINION_EDIT_ANY,
    PERMISSION_CODES.OPINION_REVIEW,
    PERMISSION_CODES.OPINION_PUBLISH,
    PERMISSION_CODES.OPINION_REJECT,
    PERMISSION_CODES.OPINION_DELETE_ANY,
    // Dashboard - المحرر يرى الإحصائيات ولكن ليس رسائل التواصل
    PERMISSION_CODES.DASHBOARD_VIEW,
    PERMISSION_CODES.DASHBOARD_VIEW_STATS,
    PERMISSION_CODES.DASHBOARD_VIEW_MODERATORS,
    PERMISSION_CODES.DASHBOARD_VIEW_QUICK_ACTIONS,
    PERMISSION_CODES.DASHBOARD_VIEW_VISITORS,
    // Breaking News Ticker
    PERMISSION_CODES.BREAKING_TICKER_MANAGE,
  ],
  
  [ROLE_NAMES.REPORTER]: [
    PERMISSION_CODES.ARTICLES_VIEW,
    PERMISSION_CODES.ARTICLES_CREATE,
    PERMISSION_CODES.ARTICLES_EDIT_OWN,
    // Article Editor Features - المراسل له صلاحيات أساسية فقط (بدون الميزات المتقدمة)
    PERMISSION_CODES.ARTICLES_AI_GENERATE, // التوليد الذكي الشامل (زر توليد ذكي شامل فقط)
    PERMISSION_CODES.MEDIA_VIEW,
    PERMISSION_CODES.MEDIA_UPLOAD,
    PERMISSION_CODES.COMMENTS_VIEW_OWN, // عرض التعليقات على مقالاته فقط
    PERMISSION_CODES.ANALYTICS_VIEW_OWN, // عرض إحصائيات مقالاته فقط
    // Dashboard - المراسل يرى الإحصائيات فقط
    PERMISSION_CODES.DASHBOARD_VIEW,
    PERMISSION_CODES.DASHBOARD_VIEW_STATS,
    PERMISSION_CODES.DASHBOARD_VIEW_VISITORS,
  ],
  
  [ROLE_NAMES.OPINION_AUTHOR]: [
    PERMISSION_CODES.OPINION_VIEW,
    PERMISSION_CODES.OPINION_CREATE,
    PERMISSION_CODES.OPINION_EDIT_OWN,
    PERMISSION_CODES.OPINION_SUBMIT_REVIEW,
    PERMISSION_CODES.OPINION_DELETE_OWN,
    PERMISSION_CODES.MEDIA_VIEW,
    PERMISSION_CODES.MEDIA_UPLOAD,
    PERMISSION_CODES.ANALYTICS_VIEW_OWN,
  ],
  
  [ROLE_NAMES.COMMENTS_MODERATOR]: [
    PERMISSION_CODES.COMMENTS_VIEW,
    PERMISSION_CODES.COMMENTS_EDIT,
    PERMISSION_CODES.COMMENTS_APPROVE,
    PERMISSION_CODES.COMMENTS_REJECT,
    PERMISSION_CODES.COMMENTS_DELETE,
    PERMISSION_CODES.COMMENTS_BAN_USER,
  ],
  
  [ROLE_NAMES.MEDIA_MANAGER]: [
    PERMISSION_CODES.MEDIA_VIEW,
    PERMISSION_CODES.MEDIA_UPLOAD,
    PERMISSION_CODES.MEDIA_EDIT,
    PERMISSION_CODES.MEDIA_DELETE,
  ],
  
  [ROLE_NAMES.READER]: [],
};

// Permission labels in Arabic for UI display
export const PERMISSION_LABELS_AR: Record<string, string> = {
  [PERMISSION_CODES.ARTICLES_VIEW]: "عرض المقالات",
  [PERMISSION_CODES.ARTICLES_CREATE]: "إنشاء المقالات",
  [PERMISSION_CODES.ARTICLES_EDIT_OWN]: "تعديل المقالات الخاصة",
  [PERMISSION_CODES.ARTICLES_EDIT_ANY]: "تعديل أي مقال",
  [PERMISSION_CODES.ARTICLES_PUBLISH]: "نشر المقالات",
  [PERMISSION_CODES.ARTICLES_UNPUBLISH]: "إلغاء نشر المقالات",
  [PERMISSION_CODES.ARTICLES_DELETE]: "حذف المقالات",
  [PERMISSION_CODES.ARTICLES_ARCHIVE]: "أرشفة المقالات",
  [PERMISSION_CODES.ARTICLES_FEATURE]: "تمييز المقالات",
  
  // Article Editor Features - ميزات محرر المقالات
  [PERMISSION_CODES.ARTICLES_AI_GENERATE]: "التوليد الذكي الشامل",
  [PERMISSION_CODES.ARTICLES_SCHEDULE]: "جدولة النشر",
  [PERMISSION_CODES.ARTICLES_POLLS]: "استطلاع الرأي",
  [PERMISSION_CODES.ARTICLES_SMART_LINKS]: "الروابط الذكية",
  [PERMISSION_CODES.ARTICLES_GENERATE_IMAGES]: "توليد الصور بالذكاء الاصطناعي",
  [PERMISSION_CODES.ARTICLES_INFOGRAPHICS]: "الانفوجرافيك",
  [PERMISSION_CODES.ARTICLES_NEWS_TYPE]: "نوع الخبر",
  [PERMISSION_CODES.ARTICLES_MUQTARAB_ANGLES]: "زوايا مُقترب",
  [PERMISSION_CODES.ARTICLES_COMPREHENSIVE_EDIT]: "تحرير وتوليد شامل",
  [PERMISSION_CODES.ARTICLES_CONTENT_TYPE_SELECTOR]: "اختيار نوع المحتوى",
  [PERMISSION_CODES.ARTICLES_HIDE_HOMEPAGE]: "إخفاء من الواجهة الرئيسية",

  [PERMISSION_CODES.CATEGORIES_VIEW]: "عرض التصنيفات",
  [PERMISSION_CODES.CATEGORIES_CREATE]: "إنشاء التصنيفات",
  [PERMISSION_CODES.CATEGORIES_UPDATE]: "تعديل التصنيفات",
  [PERMISSION_CODES.CATEGORIES_DELETE]: "حذف التصنيفات",

  [PERMISSION_CODES.USERS_VIEW]: "عرض المستخدمين",
  [PERMISSION_CODES.USERS_CREATE]: "إنشاء المستخدمين",
  [PERMISSION_CODES.USERS_UPDATE]: "تعديل المستخدمين",
  [PERMISSION_CODES.USERS_DELETE]: "حذف المستخدمين",
  [PERMISSION_CODES.USERS_SUSPEND]: "تعليق المستخدمين",
  [PERMISSION_CODES.USERS_BAN]: "حظر المستخدمين",
  [PERMISSION_CODES.USERS_CHANGE_ROLE]: "تغيير أدوار المستخدمين",

  [PERMISSION_CODES.COMMENTS_VIEW]: "عرض جميع التعليقات",
  [PERMISSION_CODES.COMMENTS_VIEW_OWN]: "عرض التعليقات على مقالاتي",
  [PERMISSION_CODES.COMMENTS_CREATE]: "إنشاء التعليقات",
  [PERMISSION_CODES.COMMENTS_EDIT]: "تعديل التعليقات",
  [PERMISSION_CODES.COMMENTS_APPROVE]: "الموافقة على التعليقات",
  [PERMISSION_CODES.COMMENTS_REJECT]: "رفض التعليقات",
  [PERMISSION_CODES.COMMENTS_DELETE]: "حذف التعليقات",
  [PERMISSION_CODES.COMMENTS_BAN_USER]: "حظر المستخدمين من التعليق",

  [PERMISSION_CODES.MEDIA_VIEW]: "عرض الوسائط",
  [PERMISSION_CODES.MEDIA_UPLOAD]: "رفع الوسائط",
  [PERMISSION_CODES.MEDIA_EDIT]: "تعديل الوسائط",
  [PERMISSION_CODES.MEDIA_DELETE]: "حذف الوسائط",

  [PERMISSION_CODES.SETTINGS_VIEW]: "عرض الإعدادات",
  [PERMISSION_CODES.SETTINGS_UPDATE]: "تحديث الإعدادات",

  [PERMISSION_CODES.ANALYTICS_VIEW]: "عرض جميع التحليلات",
  [PERMISSION_CODES.ANALYTICS_VIEW_OWN]: "عرض التحليلات الخاصة",

  [PERMISSION_CODES.TAGS_VIEW]: "عرض الوسوم",
  [PERMISSION_CODES.TAGS_CREATE]: "إنشاء الوسوم",
  [PERMISSION_CODES.TAGS_UPDATE]: "تعديل الوسوم",
  [PERMISSION_CODES.TAGS_DELETE]: "حذف الوسوم",
  
  [PERMISSION_CODES.MIRQAB_VIEW]: "عرض المرقاب",
  [PERMISSION_CODES.MIRQAB_CREATE]: "إنشاء محتوى المرقاب",
  [PERMISSION_CODES.MIRQAB_EDIT]: "تعديل محتوى المرقاب",
  [PERMISSION_CODES.MIRQAB_DELETE]: "حذف محتوى المرقاب",
  [PERMISSION_CODES.MIRQAB_PUBLISH]: "نشر محتوى المرقاب",
  [PERMISSION_CODES.MIRQAB_MANAGE_SETTINGS]: "إدارة إعدادات المرقاب",
  
  [PERMISSION_CODES.AUDIO_NEWSLETTERS_VIEW]: "عرض النشرات الصوتية",
  [PERMISSION_CODES.AUDIO_NEWSLETTERS_CREATE]: "إنشاء نشرة صوتية",
  [PERMISSION_CODES.AUDIO_NEWSLETTERS_EDIT]: "تعديل نشرة صوتية",
  [PERMISSION_CODES.AUDIO_NEWSLETTERS_DELETE]: "حذف نشرة صوتية",
  [PERMISSION_CODES.AUDIO_NEWSLETTERS_PUBLISH]: "نشر نشرة صوتية",
  [PERMISSION_CODES.AUDIO_NEWSLETTERS_MANAGE_ALL]: "إدارة كاملة للنشرات الصوتية",
  
  [PERMISSION_CODES.AUDIO_BRIEFS_VIEW]: "عرض الأخبار الصوتية",
  [PERMISSION_CODES.AUDIO_BRIEFS_CREATE]: "إنشاء خبر صوتي",
  [PERMISSION_CODES.AUDIO_BRIEFS_EDIT]: "تعديل خبر صوتي",
  [PERMISSION_CODES.AUDIO_BRIEFS_DELETE]: "حذف خبر صوتي",
  [PERMISSION_CODES.AUDIO_BRIEFS_PUBLISH]: "نشر خبر صوتي",
  [PERMISSION_CODES.AUDIO_BRIEFS_GENERATE]: "توليد صوت للخبر",
  [PERMISSION_CODES.AUDIO_BRIEFS_MANAGE_ALL]: "إدارة كاملة للأخبار الصوتية",
  
  [PERMISSION_CODES.OPINION_VIEW]: "عرض مقالات الرأي",
  [PERMISSION_CODES.OPINION_CREATE]: "إنشاء مقال رأي",
  [PERMISSION_CODES.OPINION_EDIT_OWN]: "تعديل مقالات الرأي الخاصة",
  [PERMISSION_CODES.OPINION_EDIT_ANY]: "تعديل أي مقال رأي",
  [PERMISSION_CODES.OPINION_SUBMIT_REVIEW]: "إرسال مقال رأي للمراجعة",
  [PERMISSION_CODES.OPINION_REVIEW]: "مراجعة مقالات الرأي",
  [PERMISSION_CODES.OPINION_PUBLISH]: "نشر مقالات الرأي",
  [PERMISSION_CODES.OPINION_REJECT]: "رفض مقالات الرأي",
  [PERMISSION_CODES.OPINION_DELETE_OWN]: "حذف مقالات الرأي الخاصة",
  [PERMISSION_CODES.OPINION_DELETE_ANY]: "حذف أي مقال رأي",
  
  [PERMISSION_CODES.SYSTEM_VIEW_AUDIT]: "عرض سجلات النشاط",
  [PERMISSION_CODES.SYSTEM_MANAGE_SETTINGS]: "إدارة إعدادات النظام",
  
  // Dashboard - لوحة التحكم
  [PERMISSION_CODES.DASHBOARD_VIEW]: "عرض لوحة التحكم",
  [PERMISSION_CODES.DASHBOARD_VIEW_STATS]: "عرض الإحصائيات",
  [PERMISSION_CODES.DASHBOARD_VIEW_MESSAGES]: "عرض رسائل التواصل",
  [PERMISSION_CODES.DASHBOARD_VIEW_MODERATORS]: "عرض المشرفين المتواجدين",
  [PERMISSION_CODES.DASHBOARD_VIEW_QUICK_ACTIONS]: "عرض الإجراءات السريعة",
  [PERMISSION_CODES.DASHBOARD_VIEW_VISITORS]: "عرض الزوار الحاليين",
  
  // Communications - التواصل
  [PERMISSION_CODES.COMMUNICATIONS_STAFF]: "مراسلة الزملاء",
  [PERMISSION_CODES.BREAKING_TICKER_MANAGE]: "إدارة شريط الأخبار العاجلة",
  
  // Staff Productivity - إنتاجية الموظفين
  [PERMISSION_CODES.VIEW_STAFF_PRODUCTIVITY]: "عرض إنتاجية الموظفين",
};

// Helper function to get all permissions for given roles
export function getPermissionsForRoles(roleNames: string[]): string[] {
  const allPermissions = new Set<string>();
  
  for (const roleName of roleNames) {
    const permissions = ROLE_PERMISSIONS_MAP[roleName] || [];
    
    // If role has wildcard (*), return all permissions
    if (permissions.includes("*")) {
      return Object.values(PERMISSION_CODES);
    }
    
    permissions.forEach(p => allPermissions.add(p));
  }
  
  return Array.from(allPermissions);
}

// Helper function to check if a role can be assigned by another role
export function canAssignRole(assignerRole: string, targetRole: string): boolean {
  // System admin can assign any role
  if (assignerRole === ROLE_NAMES.SYSTEM_ADMIN) {
    return true;
  }
  
  // Admin can assign any role except system_admin
  if (assignerRole === ROLE_NAMES.ADMIN) {
    return targetRole !== ROLE_NAMES.SYSTEM_ADMIN;
  }
  
  // Other roles cannot assign roles
  return false;
}

// Activity log action types
export const ACTIVITY_ACTIONS = {
  USER_CREATED: "user_created",
  USER_UPDATED: "user_updated",
  USER_DELETED: "user_deleted",
  ROLES_UPDATED: "roles_updated",
  STATUS_UPDATED: "status_updated",
  PASSWORD_RESET: "password_reset",
} as const;

export const ACTIVITY_LABELS_AR: Record<string, string> = {
  [ACTIVITY_ACTIONS.USER_CREATED]: "إنشاء مستخدم",
  [ACTIVITY_ACTIONS.USER_UPDATED]: "تحديث مستخدم",
  [ACTIVITY_ACTIONS.USER_DELETED]: "حذف مستخدم",
  [ACTIVITY_ACTIONS.ROLES_UPDATED]: "تحديث الأدوار",
  [ACTIVITY_ACTIONS.STATUS_UPDATED]: "تحديث الحالة",
  [ACTIVITY_ACTIONS.PASSWORD_RESET]: "إعادة تعيين كلمة المرور",
};

// Article Editor Permissions for UI display
// صلاحيات محرر المقالات للعرض في الواجهة
export const ARTICLE_EDITOR_PERMISSIONS = [
  {
    code: PERMISSION_CODES.ARTICLES_PUBLISH,
    label: "نشر المقالات",
    labelEn: "Publish Articles",
    description: "صلاحية نشر المقالات مباشرة (مطلوبة للجدولة)"
  },
  {
    code: PERMISSION_CODES.ARTICLES_AI_GENERATE,
    label: "التوليد الذكي الشامل",
    labelEn: "AI Generation",
    description: "توليد العناوين والمحتوى والملخصات بالذكاء الاصطناعي"
  },
  {
    code: PERMISSION_CODES.ARTICLES_SCHEDULE,
    label: "جدولة النشر",
    labelEn: "Scheduling",
    description: "جدولة المقالات للنشر في وقت لاحق"
  },
  {
    code: PERMISSION_CODES.ARTICLES_POLLS,
    label: "استطلاع الرأي",
    labelEn: "Polls",
    description: "إضافة استطلاعات رأي للمقالات"
  },
  {
    code: PERMISSION_CODES.ARTICLES_SMART_LINKS,
    label: "الروابط الذكية",
    labelEn: "Smart Links",
    description: "تحليل المحتوى وإضافة روابط ذكية"
  },
  {
    code: PERMISSION_CODES.ARTICLES_GENERATE_IMAGES,
    label: "توليد الصور",
    labelEn: "Image Generation",
    description: "توليد صور بالذكاء الاصطناعي"
  },
  {
    code: PERMISSION_CODES.ARTICLES_INFOGRAPHICS,
    label: "الانفوجرافيك",
    labelEn: "Infographics",
    description: "إنشاء انفوجرافيك للمقالات"
  },
  {
    code: PERMISSION_CODES.ARTICLES_CONTENT_TYPE_SELECTOR,
    label: "اختيار نوع المحتوى",
    labelEn: "Content Type Selector",
    description: "إمكانية اختيار نوع المحتوى (خبر، تقرير، انفوجرافيك، الخ)"
  },
  {
    code: PERMISSION_CODES.ARTICLES_HIDE_HOMEPAGE,
    label: "إخفاء من الواجهة الرئيسية",
    labelEn: "Hide from Homepage",
    description: "إخفاء المقال من الصفحة الرئيسية مع إبقائه متاحاً عبر الرابط المباشر"
  }
];
