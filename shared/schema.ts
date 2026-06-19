import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, bigint, jsonb, index, real, primaryKey, uniqueIndex, serial, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// ZOD SCHEMAS FOR JSONB COLUMNS
// ============================================

// Category jsonb schemas
export const seasonalRulesSchema = z.object({
  hijriMonth: z.string().optional(),
  hijriYear: z.union([z.string(), z.literal("auto")]).optional(),
  gregorianMonth: z.number().optional(),
  dateRange: z.object({
    start: z.string(),
    end: z.string(),
  }).optional(),
  activateDaysBefore: z.number().optional(),
  deactivateDaysAfter: z.number().optional(),
}).optional();

export const categoryFeaturesSchema = z.object({
  realtime: z.boolean().optional(),
  ai_powered: z.boolean().optional(),
  trending: z.boolean().optional(),
  breaking_news: z.boolean().optional(),
  personalized: z.boolean().optional(),
  recommendation_engine: z.boolean().optional(),
  learning: z.boolean().optional(),
  data_visualization: z.boolean().optional(),
  ai_analysis: z.boolean().optional(),
  interactive: z.boolean().optional(),
  charts: z.boolean().optional(),
  long_form: z.boolean().optional(),
  expert_analysis: z.boolean().optional(),
  ai_summary: z.boolean().optional(),
  audio_version: z.boolean().optional(),
  opinion: z.boolean().optional(),
  authors: z.boolean().optional(),
  audio_newsletter: z.boolean().optional(),
}).catchall(z.boolean()).optional();

export const aiConfigSchema = z.object({
  promptTemplate: z.string().optional(),
  modelVersion: z.enum(["gpt-4", "gpt-3.5-turbo", "claude-3", "gemini-pro"]).optional(),
  maxArticles: z.number().int().min(1).max(100).optional(),
  refreshStrategy: z.enum(["realtime", "hourly", "daily", "manual"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4000).optional(),
}).optional();

// Article jsonb schemas
export const imageFocalPointSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  needsReview: z.boolean().optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
}).optional();

export const seoSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  socialTitle: z.string().optional(),
  socialDescription: z.string().optional(),
  imageAltText: z.string().optional(),
  ogImageUrl: z.string().optional(),
}).optional();

export const seoMetadataSchema = z.object({
  status: z.enum(["draft", "generated", "approved", "rejected"]).optional(),
  version: z.number().optional(),
  generatedAt: z.string().optional(),
  generatedBy: z.string().optional(),
  provider: z.enum(["anthropic", "openai", "gemini", "qwen"]).optional(),
  model: z.string().optional(),
  manualOverride: z.boolean().optional(),
  overrideBy: z.string().optional(),
  overrideReason: z.string().optional(),
  rawResponse: z.any().optional(),
}).optional();

export const sourceMetadataSchema = z.object({
  type: z.enum(["email", "whatsapp", "manual"]),
  from: z.string().optional(),
  token: z.string().optional(),
  originalMessage: z.string().optional(),
  webhookLogId: z.string().optional(),
}).optional();

// Behavior logs
export const behaviorMetadataSchema = z.object({
  articleId: z.string().optional(),
  categoryId: z.string().optional(),
  duration: z.number().optional(),
  query: z.string().optional(),
  action: z.string().optional(),
}).optional();

// Sentiment scores
export const emotionalBreakdownSchema = z.object({
  enthusiasm: z.number().optional(),
  satisfaction: z.number().optional(),
  anger: z.number().optional(),
  sadness: z.number().optional(),
  neutral: z.number().optional(),
}).optional();

// Theme assets
export const themeAssetsSchema = z.object({
  logoLight: z.string().optional(),
  logoDark: z.string().optional(),
  favicon: z.string().optional(),
  banner: z.string().optional(),
  ogImage: z.string().optional(),
}).optional();

export const themeTokensSchema = z.object({
  colors: z.record(z.string()).optional(),
  fonts: z.record(z.string()).optional(),
  spacing: z.record(z.string()).optional(),
  borderRadius: z.record(z.string()).optional(),
}).optional();

export const themeChangelogSchema = z.array(z.object({
  version: z.number(),
  changes: z.string(),
  timestamp: z.string(),
  userId: z.string(),
})).optional();

// Theme audit
export const themeAuditChangesSchema = z.record(z.any()).optional();

export const themeAuditMetadataSchema = z.object({
  previousStatus: z.string().optional(),
  newStatus: z.string().optional(),
  reason: z.string().optional(),
}).optional();

// Activity logs
export const activityLogMetadataSchema = z.object({
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  reason: z.string().optional(),
}).optional();

// Loyalty system
export const loyaltyPayloadSchema = z.object({
  articleId: z.string().optional(),
  categoryId: z.string().optional(),
  duration: z.number().optional(),
  commentId: z.string().optional(),
  reactionId: z.string().optional(),
}).optional();

export const loyaltyMetadataSchema = z.object({
  prevRank: z.string().optional(),
  newRank: z.string().optional(),
  pointsRequired: z.number().optional(),
  source: z.string().optional(),
}).optional();

export const rewardDataSchema = z.object({
  digitalCode: z.string().optional(),
  qrCode: z.string().optional(),
  expiryDate: z.string().optional(),
  instructions: z.string().optional(),
  customFields: z.record(z.any()).optional(),
}).optional();

export const rewardSnapshotSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  pointsCost: z.number().optional(),
  imageUrl: z.string().optional(),
  category: z.string().optional(),
}).optional();

export const deliveryDataSchema = z.object({
  method: z.string().optional(),
  status: z.string().optional(),
  trackingInfo: z.string().optional(),
  estimatedDelivery: z.string().optional(),
}).optional();

// Smart blocks
export const smartBlockFiltersSchema = z.object({
  categories: z.array(z.string()).optional(),
  dateRange: z.object({
    from: z.string(),
    to: z.string(),
  }).optional(),
}).optional();

// Additional jsonb schemas for remaining fields
export const rawMetadataSchema = z.record(z.any()).optional();

// User preferences arrays
export const preferredCategoriesSchema = z.array(z.string()).optional();
export const preferredAuthorsSchema = z.array(z.string()).optional();
export const blockedCategoriesSchema = z.array(z.string()).optional();

// Experiment schemas
export const experimentVariantDataSchema = z.object({
  headline: z.string().optional(),
  image: z.string().url().optional(),
  cta: z.string().optional(),
  layout: z.enum(["standard", "grid", "list", "featured"]).optional(),
  buttonText: z.string().optional(),
  buttonColor: z.string().optional(),
}).optional();

export const experimentMetadataSchema = z.object({
  notes: z.string().optional(),
  hypothesis: z.string().optional(),
  expectedImpact: z.string().optional(),
  startReason: z.string().optional(),
  endReason: z.string().optional(),
}).optional();

// SEO history schemas
export const seoContentSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  socialTitle: z.string().optional(),
  socialDescription: z.string().optional(),
  imageAltText: z.string().optional(),
  ogImageUrl: z.string().optional(),
}).optional();

// Weekly Photos (صور الأسبوع) schema
export const weeklyPhotoItemSchema = z.object({
  imageUrl: z.string().min(1, "رابط الصورة مطلوب"),
  caption: z.string().optional().default(""), // التعليق اختياري
  credit: z.string().optional(), // مصدر الصورة
});

export const weeklyPhotosDataSchema = z.object({
  photos: z.array(weeklyPhotoItemSchema).min(1, "يجب إضافة صورة واحدة على الأقل").max(50, "الحد الأقصى 50 صورة"),
}).optional();

export type WeeklyPhotoItem = z.infer<typeof weeklyPhotoItemSchema>;
export type WeeklyPhotosData = z.infer<typeof weeklyPhotosDataSchema>;

// Data story schemas
export const chartDataSchema = z.array(z.object({
  label: z.string(),
  value: z.number(),
  color: z.string().optional(),
  category: z.string().optional(),
})).optional();

export const alertsSchema = z.array(z.object({
  type: z.enum(["threshold", "trend", "anomaly", "prediction"]),
  message: z.string(),
  threshold: z.number().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  triggeredAt: z.string().datetime().optional(),
})).optional();

// Audio newsletter schemas
export const voiceSettingsSchema = z.object({
  voice: z.string().optional(),
  speed: z.number().optional(),
  pitch: z.number().optional(),
}).optional();

// Topic (Muqtarab) schemas
// سير عمل مواضيع كتّاب الزوايا:
//   draft → pending_review → published (موافقة الإدارة)
//                          → needs_revision (إرجاع للتعديل) → pending_review مجدداً
// المحرر/الأدمن قد ينشر مباشرة (draft → published) كما السابق.
export const topicStatusEnum = z.enum([
  "draft",
  "pending_review",
  "published",
  "needs_revision",
  "archived",
]);

export const topicContentBlockSchema = z.object({
  type: z.enum(["text", "image", "video", "link", "embed", "quote", "heading"]),
  content: z.string().optional(),
  url: z.string().optional(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  level: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export const topicContentSchema = z.object({
  blocks: z.array(topicContentBlockSchema).optional(),
  rawHtml: z.string().optional(),
  plainText: z.string().optional(),
}).optional();

export const topicAttachmentsSchema = z.array(z.object({
  id: z.string().optional(),
  url: z.string(),
  name: z.string(),
  type: z.enum(["image", "video", "audio", "document", "other"]),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  caption: z.string().optional(),
})).optional();

export const topicSeoMetaSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  ogImage: z.string().optional(),
  canonicalUrl: z.string().optional(),
}).optional();

// Internal announcements schemas
export const channelsSchema = z.array(z.string()).optional();
export const audienceRolesSchema = z.array(z.string()).optional();
export const audienceUserIdsSchema = z.array(z.string()).optional();
export const tagsSchema = z.array(z.string()).optional();
export const attachmentsSchema = z.array(z.object({
  url: z.string(),
  name: z.string(),
  type: z.string(),
})).optional();

export const internalAnnouncementMetaSchema = z.object({
  version: z.number().optional(),
  changes: z.string().optional(),
}).optional();

// Journalist tasks schemas
export const taskConfigSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  priorityLevel: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
  estimatedHours: z.number().min(0).max(100).optional(),
  requiresReview: z.boolean().optional(),
}).optional();

// Calendar schemas
export const calendarAttachmentsSchema = z.array(z.object({
  name: z.string(),
  url: z.string(),
  type: z.string(),
})).optional();

export const aiDraftIdeasSchema = z.object({
  main: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
}).optional();

export const aiDraftHeadlinesSchema = z.object({
  primary: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
}).optional();

export const aiDraftInfographicSchema = z.object({
  title: z.string().optional(),
  dataPoints: z.array(z.string()).optional(),
}).optional();

export const aiDraftSocialSchema = z.object({
  twitter: z.string().optional(),
  facebook: z.string().optional(),
}).optional();

export const aiDraftSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
}).optional();

// Smart entities schemas
export const smartEntitiesSchema = z.object({
  entities: z.array(z.string()).optional(),
  confidence: z.number().optional(),
}).optional();

export const modelInsightsSchema = z.object({
  model: z.string().optional(),
  confidence: z.number().optional(),
  suggestions: z.array(z.string()).optional(),
}).optional();

export const metadataSchema = z.object({
  source: z.string().optional(),
  version: z.number().optional(),
  timestamp: z.string().datetime().optional(),
  userId: z.string().optional(),
  notes: z.string().optional(),
}).optional();

// AI suggestions schemas
export const aiSuggestionsSchema = z.object({
  keywords: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  relatedTopics: z.array(z.string()).optional(),
}).optional();

// Task changes schemas
export const taskChangesSchema = z.object({
  field: z.string(),
  oldValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  newValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  changedAt: z.string().datetime().optional(),
  changedBy: z.string().optional(),
}).optional();

// Deep analysis schemas
export const deepAnalysisResultsSchema = z.object({
  findings: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
  score: z.number().min(0).max(100).optional(),
  confidence: z.number().min(0).max(1).optional(),
  methodology: z.string().optional(),
}).optional();

// Data story source schemas
export const columnsSchema = z.record(z.object({
  name: z.string(),
  type: z.string(),
  sampleValues: z.array(z.any()).optional(),
  uniqueCount: z.number().optional(),
  nullCount: z.number().optional(),
})).optional();

export const statisticsSchema = z.object({
  rowCount: z.number().int().min(0).optional(),
  columnCount: z.number().int().min(0).optional(),
  nullPercentage: z.number().min(0).max(100).optional(),
  uniqueValues: z.number().int().min(0).optional(),
  completeness: z.number().min(0).max(100).optional(),
}).optional();

export const aiInsightsSchema = z.object({
  summary: z.string().optional(),
  keyFindings: z.array(z.string()).optional(),
  trends: z.array(z.string()).optional(),
  anomalies: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
}).optional();

export const chartConfigsSchema = z.array(z.object({
  type: z.string(),
  title: z.string(),
  data: z.any(),
})).optional();

// Data story draft schemas
export const outlineSchema = z.object({
  introduction: z.string().optional(),
  sections: z.array(z.object({
    title: z.string(),
    content: z.string(),
  })).optional(),
}).optional();

// Wallet device metadata
export const deviceMetadataSchema = z.object({
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  osVersion: z.string().optional(),
}).optional();

// Ad account billing
export const billingAddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
}).optional();

// Creative recommendation
export const creativeRecommendationSchema = z.object({
  suggestions: z.array(z.string()).optional(),
  score: z.number().optional(),
}).optional();

// System settings value schema (highly variable, but validate common types)
export const systemSettingsValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.any()),
  z.record(z.any()),
]);

// Notification template content schema
export const notificationTemplateContentSchema = z.object({
  subject: z.string().optional(),
  body: z.string(),
  template: z.string().optional(),
  variables: z.array(z.string()).optional(),
}).optional();

// AI workflow config schema
export const aiWorkflowConfigSchema = z.object({
  model: z.enum(["gpt-4", "gpt-3.5-turbo", "claude-3", "gemini-pro"]).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4000).optional(),
  prompt: z.string().optional(),
  topP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
}).optional();

// Journalist task config schema (more specific)
export const journalistTaskConfigSchema = z.object({
  reminderEnabled: z.boolean().optional(),
  priorityLevel: z.number().optional(),
  tags: z.array(z.string()).optional(),
  estimatedHours: z.number().optional(),
}).optional();

// Session data schema
export const sessionDataSchema = z.object({
  cookie: z.object({
    originalMaxAge: z.number().optional(),
    expires: z.union([z.string(), z.date()]).optional(),
    secure: z.boolean().optional(),
    httpOnly: z.boolean().optional(),
    path: z.string().optional(),
  }).optional(),
  passport: z.object({
    user: z.any().optional(),
  }).optional(),
}).catchall(z.any());

// Activity log old/new value schemas
export const activityLogValueSchema = z.record(z.any()).optional();

// Internal announcement revision schemas
export const revisionDiffSchema = z.any().optional();
export const revisionMetaSchema = z.object({
  editor: z.string().optional(),
  reason: z.string().optional(),
}).optional();

// Preview data schema
export const previewDataSchema = z.array(z.record(z.any())).optional();

// AI analysis schemas
export const aiAnalysisSchema = z.object({
  summary: z.string().optional(),
  topics: z.array(z.string()).optional(),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]).optional(),
  entities: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  language: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
}).optional();

// Attachments data schema
export const attachmentsDataSchema = z.array(z.object({
  url: z.string(),
  name: z.string(),
  type: z.string(),
  size: z.number().optional(),
})).optional();

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table with email/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey(), // Keep existing structure - no default
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // bcrypt hashed password (optional for OAuth users)
  firstName: text("first_name"),
  lastName: text("last_name"),
  firstNameEn: text("first_name_en"), // English first name (optional)
  lastNameEn: text("last_name_en"), // English last name (optional)
  bio: text("bio"),
  phoneNumber: text("phone_number"),
  profileImageUrl: text("profile_image_url"),
  role: text("role").notNull().default("reader"),
  status: text("status").default("active").notNull(), // active, pending, suspended, banned, locked, deleted
  isProfileComplete: boolean("is_profile_complete").default(false).notNull(),
  
  // OAuth fields
  authProvider: text("auth_provider").default("local").notNull(), // local, google, apple
  googleId: text("google_id").unique(), // Google OAuth ID
  appleId: text("apple_id").unique(), // Apple OAuth ID
  
  // Verification fields
  emailVerified: boolean("email_verified").default(false).notNull(),
  phoneVerified: boolean("phone_verified").default(false).notNull(),
  verificationBadge: text("verification_badge").default("none").notNull(), // none, silver, gold
  
  // Activity tracking
  lastActivityAt: timestamp("last_activity_at"),
  loggedOutAt: timestamp("logged_out_at"), // When user explicitly logged out
  
  // Suspension fields
  suspendedUntil: timestamp("suspended_until"),
  suspensionReason: text("suspension_reason"),
  
  // Ban fields
  bannedUntil: timestamp("banned_until"),
  banReason: text("ban_reason"),
  
  // Security lock fields
  accountLocked: boolean("account_locked").default(false).notNull(),
  lockedUntil: timestamp("locked_until"),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  
  // Two-Factor Authentication fields
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
  twoFactorBackupCodes: text("two_factor_backup_codes").array(),
  twoFactorMethod: text("two_factor_method").default("authenticator").notNull(), // authenticator, sms, both
  
  // Temporary password flag - requires password change on first login
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  
  // Soft delete
  deletedAt: timestamp("deleted_at"),
  
  // Language permissions (ar, en, or both)
  allowedLanguages: text("allowed_languages").array().default(sql`ARRAY['ar']::text[]`).notNull(),
  
  // Press Card fields (Apple Wallet Digital Press Card)
  hasPressCard: boolean("has_press_card").default(false).notNull(),
  jobTitle: text("job_title"),
  department: text("department"),
  pressIdNumber: text("press_id_number"),
  cardValidUntil: timestamp("card_valid_until"),
  
  // Reporter notification preferences
  notifyOnPublish: boolean("notify_on_publish").default(true).notNull(),
  
  // Mobile App fields (for readers/members)
  fcmToken: text("fcm_token"), // Firebase Cloud Messaging token
  fcmTopics: jsonb("fcm_topics").$type<string[]>().default([]), // Subscribed FCM topics
  locale: varchar("locale", { length: 5 }).default("ar"), // User language preference
  city: text("city"), // User city
  country: text("country").default("SA"), // User country
  gender: varchar("gender", { length: 10 }), // male, female
  birthDate: timestamp("birth_date"), // Date of birth
  lastLoginAt: timestamp("last_login_at"), // Last login timestamp
  lastDeviceInfo: jsonb("last_device_info").$type<{
    platform?: string;
    osVersion?: string;
    appVersion?: string;
    deviceName?: string;
    deviceId?: string;
  }>(), // Last device used
  
  
  // Link to publisher for staff members who publish on behalf of a publisher agency
  linkedPublisherId: varchar("linked_publisher_id"),

  // User-preferred visual variant (light/dark). Synced across devices when set.
  preferredVariant: text("preferred_variant"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Unique index on pressIdNumber (only for non-null values)
  uniqueIndex("users_press_id_number_idx").on(table.pressIdNumber).where(sql`press_id_number IS NOT NULL`),
  // Case-insensitive uniqueness on email. The column-level .unique() above is
  // case-sensitive, which let "Ahmad@x.com" and "ahmad@x.com" coexist as two
  // accounts (the reader-vs-writer duplicate bug). This index forbids that.
  // NOTE: db:push / the migration that creates it will FAIL until existing
  // case-only duplicates are merged first — run scripts/merge-duplicate-accounts.ts.
  uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
]);

// Password reset tokens
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Email verification tokens
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// News categories (with Smart Categories support)
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  slug: text("slug").notNull().unique(),
  englishSlug: text("english_slug"),
  description: text("description"),
  color: text("color"),
  icon: text("icon"),
  heroImageUrl: text("hero_image_url"),
  displayOrder: integer("display_order").default(0),
  status: text("status").default("active").notNull(),
  
  // iFox separation flag - true for AI-generated content categories
  isIfoxCategory: boolean("is_ifox_category").default(false).notNull(),
  
  // Smart Categories fields
  type: text("type").default("core").notNull(), // core, dynamic, smart, seasonal
  autoActivate: boolean("auto_activate").default(false).notNull(),
  updateInterval: integer("update_interval"), // in seconds, for dynamic categories
  seasonalRules: jsonb("seasonal_rules").$type<{
    hijriMonth?: string;
    hijriYear?: string | "auto";
    gregorianMonth?: number;
    dateRange?: {
      start: string;
      end: string;
    };
    activateDaysBefore?: number;
    deactivateDaysAfter?: number;
  }>(),
  features: jsonb("features").$type<{
    realtime?: boolean;
    ai_powered?: boolean;
    trending?: boolean;
    breaking_news?: boolean;
    personalized?: boolean;
    recommendation_engine?: boolean;
    learning?: boolean;
    data_visualization?: boolean;
    ai_analysis?: boolean;
    interactive?: boolean;
    charts?: boolean;
    long_form?: boolean;
    expert_analysis?: boolean;
    ai_summary?: boolean;
    audio_version?: boolean;
    opinion?: boolean;
    authors?: boolean;
    audio_newsletter?: boolean;
    [key: string]: boolean | undefined;
  }>(),
  aiConfig: jsonb("ai_config").$type<{
    promptTemplate?: string;
    modelVersion?: string;
    maxArticles?: number;
    refreshStrategy?: string;
    [key: string]: any;
  }>(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Performance indexes
  index("idx_categories_type_status").on(table.type, table.status),
  index("idx_categories_status").on(table.status),
  // High-traffic optimization: slug lookups for URL routing
  index("idx_categories_slug").on(table.slug),
]);

// Articles (supports both news and opinion pieces)
export const articles = pgTable("articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  slug: text("slug").notNull().unique(),
  englishSlug: text("english_slug"),
  legacySlug: text("legacy_slug"),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  imageUrl: text("image_url"),
  thumbnailUrl: text("thumbnail_url"), // صورة الغلاف المصغرة 16:9 للعرض في القوائم
  thumbnailManuallyDeleted: boolean("thumbnail_manually_deleted").default(false), // Flag to prevent auto-generation after manual deletion
  liteOptimizedImageUrl: text("lite_optimized_image_url"), // صورة محسّنة لعرض Lite Swipe (1080px WebP)
  albumImages: text("album_images").array().default(sql`ARRAY[]::text[]`), // مصفوفة صور الألبوم الإضافية
  imageFocalPoint: jsonb("image_focal_point").$type<{
    x: number; // percentage 0-100 from left
    y: number; // percentage 0-100 from top
    needsReview?: boolean;
    confidence?: "high" | "medium" | "low";
  }>(),
  
  // AI Image Generation tracking (for featured image)
  isAiGeneratedImage: boolean("is_ai_generated_image").default(false).notNull(),
  aiImageModel: text("ai_image_model"), // Model used (nano-banana-pro, gemini-3-pro, etc.)
  aiImagePrompt: text("ai_image_prompt"), // Prompt used for generation
  
  // AI Thumbnail Generation tracking
  isAiGeneratedThumbnail: boolean("is_ai_generated_thumbnail").default(false).notNull(),
  aiThumbnailModel: text("ai_thumbnail_model"), // Model used for thumbnail (gemini-3-pro-image, etc.)
  aiThumbnailPrompt: text("ai_thumbnail_prompt"), // Prompt used for thumbnail generation
  
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: 'set null' }),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  submitterId: varchar("submitter_id").references(() => users.id), // Who originally submitted the article (may differ from authorId for productivity tracking)
  reporterId: varchar("reporter_id").references(() => users.id),
  articleType: text("article_type").default("news").notNull(), // news, opinion, analysis, column, infographic, weekly_photos
  weeklyPhotosData: jsonb("weekly_photos_data").$type<{
    photos: Array<{
      imageUrl: string;
      caption: string;
      credit?: string;
    }>;
  }>(), // Data for weekly_photos article type
  
  // Data Infographic fields (for articleType === 'infographic')
  infographicBannerUrl: text("infographic_banner_url"), // بانر أفقي مخصص للإنفوجرافيك (16:9) للعرض في البطاقات
  isAiGeneratedInfographicBanner: boolean("is_ai_generated_infographic_banner").default(false), // هل البانر مُولّد بالذكاء الاصطناعي
  infographicType: text("infographic_type").default("image"), // 'image' (visual/صوري) or 'data' (data-driven/بياني)
  infographicData: jsonb("infographic_data").$type<{
    hero?: {
      title?: string;
      subtitle?: string;
      category?: string;
      gradient?: string;
      backgroundImage?: string;
    };
    keyInsight?: {
      text: string;
      variant?: 'highlight' | 'quote' | 'gradient';
      icon?: string;
    };
    bigNumbers?: Array<{
      value: number;
      label: string;
      suffix?: string;
      prefix?: string;
      icon?: string;
      color?: string;
    }>;
    progressBars?: Array<{
      label: string;
      value: number;
      max?: number;
      color?: string;
      showPercentage?: boolean;
    }>;
    donutChart?: {
      title?: string;
      segments: Array<{
        label: string;
        value: number;
        color?: string;
      }>;
    };
    timeline?: Array<{
      year: string;
      title: string;
      description?: string;
      icon?: string;
    }>;
    dataCards?: Array<{
      title: string;
      value: string;
      description?: string;
      icon?: string;
    }>;
    sections?: Array<{
      title: string;
      icon?: string;
      content?: string;
    }>;
    source?: string;
    lastUpdated?: string;
  }>(),
  
  newsType: text("news_type").default("regular").notNull(), // breaking, featured, regular
  publishType: text("publish_type").default("instant").notNull(), // instant, scheduled
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").notNull().default("draft"), // draft, scheduled, published, archived
  reviewStatus: text("review_status"), // null, pending_review, approved, rejected, needs_changes (for opinion articles)
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  hideFromHomepage: boolean("hide_from_homepage").default(false).notNull(), // Hide article from homepage but keep accessible via direct link
  aiSummary: text("ai_summary"),
  aiBullets: jsonb("ai_bullets").$type<string[]>(), // ملخص ذكي مُولَّد محفوظ كقائمة نقاط (3 نقاط مختصرة)
  aiBulletsGeneratedAt: timestamp("ai_bullets_generated_at"),
  aiGenerated: boolean("ai_generated").default(false),
  
  // Newsletter-specific fields (البريد الذكي)
  newsletterSubtitle: text("newsletter_subtitle"), // العنوان الفرعي المخصص للنشرة الإخبارية
  newsletterExcerpt: text("newsletter_excerpt"), // ملخص مخصص للنشرة
  
  // AI Category Suggestion (اقتراح التصنيف الذكي)
  suggestedCategoryId: varchar("suggested_category_id").references(() => categories.id, { onDelete: 'set null' }),
  categorySuggestionConfidence: real("category_suggestion_confidence"), // نسبة الثقة 0-1
  categorySuggestionReason: text("category_suggestion_reason"), // سبب الاقتراح
  
  isFeatured: boolean("is_featured").default(false).notNull(),
  views: integer("views").default(0).notNull(),
  displayOrder: bigint("display_order", { mode: "number" }).default(0).notNull(),
  seo: jsonb("seo").$type<{
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    socialTitle?: string;
    socialDescription?: string;
    imageAltText?: string;
    ogImageUrl?: string;
  }>(),
  seoMetadata: jsonb("seo_metadata").$type<{
    status?: "draft" | "generated" | "approved" | "rejected";
    version?: number;
    generatedAt?: string;
    generatedBy?: string;
    provider?: "anthropic" | "openai" | "gemini" | "qwen";
    model?: string;
    manualOverride?: boolean;
    overrideBy?: string;
    overrideReason?: string;
    rawResponse?: any;
  }>(),
  credibilityScore: integer("credibility_score"),
  credibilityAnalysis: text("credibility_analysis"),
  credibilityLastUpdated: timestamp("credibility_last_updated"),
  source: text("source").default("manual").notNull(), // 'email' | 'whatsapp' | 'manual'
  sourceMetadata: jsonb("source_metadata").$type<{
    type: 'email' | 'whatsapp' | 'manual';
    from?: string;
    token?: string;
    originalMessage?: string;
    webhookLogId?: string;
  }>(),
  sourceUrl: text("source_url"), // URL of the original source
  
  // Verification fields
  verifiedBy: varchar("verified_by").references(() => users.id), // Staff/admin who verified the article
  verifiedAt: timestamp("verified_at"), // When the article was verified
  
  // OLD Publisher/Agency review fields (keep for backward compatibility with existing data)
  isPublisherContent: boolean("is_publisher_content").default(false),
  publisherStatus: text("publisher_status"), // 'pending', 'approved', 'rejected'
  publisherReviewedBy: varchar("publisher_reviewed_by").references(() => users.id),
  publisherReviewedAt: timestamp("publisher_reviewed_at"),
  publisherReviewNotes: text("publisher_review_notes"),
  
  // NEW Publisher/Agency content sales fields
  isPublisherNews: boolean("is_publisher_news").default(false).notNull(),
  publisherId: varchar("publisher_id").references(() => publishers.id, { onDelete: "set null" }),
  publisherCreditDeducted: boolean("publisher_credit_deducted").default(false).notNull(), // Track if credit was already deducted
  publisherSubmittedAt: timestamp("publisher_submitted_at"), // When publisher created the draft
  publisherApprovedAt: timestamp("publisher_approved_at"), // When admin approved it
  publisherApprovedBy: varchar("publisher_approved_by").references(() => users.id), // Admin who approved
  
  geoLocations: jsonb("geo_locations").$type<Array<{
    name: string;
    nameEn: string;
    country: string;
    lat: number;
    lng: number;
  }>>(),

  // Video Template fields
  isVideoTemplate: boolean("is_video_template").default(false), // Show video instead of hero image
  videoUrl: text("video_url"), // YouTube/Dailymotion URL or direct video path
  videoThumbnailUrl: text("video_thumbnail_url"), // Custom thumbnail for video
  
  // Paid Content / Paywall fields
  isPaid: boolean("is_paid").default(false).notNull(), // Is this a paid article?
  priceHalalas: integer("price_halalas").default(0), // Price in halalas (1 SAR = 100 halalas)
  previewLength: integer("preview_length").default(300), // Characters shown before paywall
  
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Performance indexes for most common queries
  index("idx_articles_status_published").on(table.status, table.publishedAt.desc()),
  index("idx_articles_category_status").on(table.categoryId, table.status),
  index("idx_articles_author_status").on(table.authorId, table.status),
  index("idx_articles_type").on(table.articleType),
  index("idx_articles_published_at").on(table.publishedAt.desc()),
  // High-traffic optimization: homepage and popular queries
  index("idx_articles_homepage").on(table.status, table.hideFromHomepage, table.publishedAt.desc()),
  index("idx_articles_homepage_order").on(table.status, table.hideFromHomepage, table.displayOrder.desc(), table.publishedAt.desc()),
  index("idx_articles_views").on(table.views.desc()),
  index("idx_articles_slug").on(table.slug),
  // Edge slug-redirect does OR(englishSlug, slug); englishSlug was unindexed → full scan.
  index("idx_articles_english_slug").on(table.englishSlug),
  index("idx_articles_featured").on(table.isFeatured, table.status, table.publishedAt.desc()),
  // Database cost optimization: indexes for common filter combinations
  index("idx_articles_breaking").on(table.status, table.hideFromHomepage, table.newsType, table.publishedAt.desc()),
  index("idx_articles_ai_generated").on(table.aiGenerated, table.status),
  index("idx_articles_legacy_slug").on(table.legacySlug),
]);

// Article Events (سجل أحداث المقالات - Timeline/Audit events)
export const articleEventTypeEnum = z.enum([
  'created',
  'updated', 
  'published',
  'unpublished',
  'deleted',
  'restored',
  'approved',
  'rejected'
]);

export const articleEventMetadataSchema = z.object({
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.any().optional(),
    newValue: z.any().optional(),
  })).optional(),
}).catchall(z.any()).optional();

export const articleEvents = pgTable("article_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  eventType: text("event_type").notNull(), // 'created', 'updated', 'published', 'unpublished', 'deleted', 'restored', 'approved', 'rejected'
  actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
  summary: text("summary"), // وصف عربي مختصر للحدث
  metadata: jsonb("metadata").$type<{
    changes?: Array<{
      field: string;
      oldValue?: any;
      newValue?: any;
    }>;
    [key: string]: any;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_article_events_article_id").on(table.articleId),
  index("idx_article_events_created_at").on(table.createdAt.desc()),
]);

export const articleEventsRelations = relations(articleEvents, ({ one }) => ({
  article: one(articles, {
    fields: [articleEvents.articleId],
    references: [articles.id],
  }),
  actor: one(users, {
    fields: [articleEvents.actorId],
    references: [users.id],
  }),
}));

export const insertArticleEventSchema = createInsertSchema(articleEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertArticleEvent = z.infer<typeof insertArticleEventSchema>;
export type ArticleEvent = typeof articleEvents.$inferSelect;

// RSS feeds for import
export const rssFeeds = pgTable("rss_feeds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: 'set null' }),
  isActive: boolean("is_active").default(true).notNull(),
  lastFetchedAt: timestamp("last_fetched_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// رادار سبق الذكي — رصد المصادر العالمية (RSS/JSON) بأي لغة،
// تحليل القيمة الإخبارية، ثم التحويل التحريري بمعيار سبق الموحّد.
// ============================================

export const radarSources = pgTable("radar_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  url: text("url").notNull().unique(),
  type: text("type").notNull().default("rss"), // rss | json
  language: text("language").notNull().default("en"), // لغة المصدر (en, es, tr, fr, ...)
  categorySlug: text("category_slug"), // تلميح تصنيف افتراضي لمواد هذا المصدر
  fetchIntervalMinutes: integer("fetch_interval_minutes").notNull().default(15),
  isActive: boolean("is_active").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at"),
  lastError: text("last_error"), // null = آخر جلب نجح
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const radarItems = pgTable("radar_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").references(() => radarSources.id, { onDelete: "cascade" }).notNull(),
  guid: text("guid").notNull(), // معرف المادة لدى المصدر (guid/link) — أساس منع التكرار
  link: text("link").notNull(),
  originalTitle: text("original_title").notNull(),
  originalExcerpt: text("original_excerpt"),
  originalLanguage: text("original_language"),
  imageUrl: text("image_url"),
  publishedAt: timestamp("published_at"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  // new → analyzed → ready (مسودة جاهزة) → exported | dismissed
  status: text("status").notNull().default("new"),
  newsValue: integer("news_value"), // 0–100 قيمة إخبارية لجمهور سبق
  scoreBreakdown: jsonb("score_breakdown").$type<{
    breaking?: number;
    saudiRelevance?: number;
    regionalRelevance?: number;
    novelty?: number;
    reason?: string;
  }>(),
  isBreaking: boolean("is_breaking").notNull().default(false),
  matchedKeywords: jsonb("matched_keywords").$type<string[]>(),
  translatedTitle: text("translated_title"), // ترجمة تفسيرية لا حرفية
  translatedSummary: text("translated_summary"),
  suggestedCategorySlug: text("suggested_category_slug"),
  // مسودة التحويل التحريري الكامل — تطابق حقول فورم النشر
  draft: jsonb("draft").$type<{
    title: string;
    subheadline?: string;
    content: string;
    excerpt?: string;
    summary?: string;
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
    seoKeywords?: string[];
    categorySlug?: string;
    provider?: string;
    model?: string;
  }>(),
  draftGeneratedAt: timestamp("draft_generated_at"),
  analyzedAt: timestamp("analyzed_at"),
  alertedAt: timestamp("alerted_at"), // أُرسل تنبيه عاجل لهذه المادة
  exportedArticleId: varchar("exported_article_id").references(() => articles.id, { onDelete: "set null" }),
  exportedAt: timestamp("exported_at"),
  exportedBy: varchar("exported_by").references(() => users.id, { onDelete: "set null" }),
  error: text("error"), // آخر خطأ تحليل/تحويل لهذه المادة
}, (table) => [
  uniqueIndex("uq_radar_items_source_guid").on(table.sourceId, table.guid),
  index("idx_radar_items_status").on(table.status, table.fetchedAt.desc()),
  index("idx_radar_items_news_value").on(table.newsValue),
]);

export const radarAlertRules = pgTable("radar_alert_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(), // مثال: "المونديال 2026"
  keywords: jsonb("keywords").$type<string[]>().notNull(), // تطابق غير حساس لحالة الأحرف على العنوان/الملخص
  minNewsValue: integer("min_news_value").notNull().default(0),
  markBreaking: boolean("mark_breaking").notNull().default(true),
  notifyTelegram: boolean("notify_telegram").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRadarSourceSchema = createInsertSchema(radarSources).omit({
  id: true,
  lastFetchedAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
});
export const insertRadarAlertRuleSchema = createInsertSchema(radarAlertRules).omit({
  id: true,
  createdAt: true,
});

export type RadarSource = typeof radarSources.$inferSelect;
export type InsertRadarSource = z.infer<typeof insertRadarSourceSchema>;
export type RadarItem = typeof radarItems.$inferSelect;
export type RadarAlertRule = typeof radarAlertRules.$inferSelect;
export type InsertRadarAlertRule = z.infer<typeof insertRadarAlertRuleSchema>;

// User reading history for recommendations (ENHANCED for advanced analytics)
export const readingHistory = pgTable("reading_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
  readDuration: integer("read_duration"), // in seconds
  
  // NEW ADDITIVE FIELDS for advanced tracking
  scrollDepth: integer("scroll_depth"), // percentage 0-100
  completionRate: integer("completion_rate"), // percentage 0-100 (estimated based on scroll + duration)
  engagementScore: real("engagement_score"), // calculated score 0-1 based on multiple factors
  deviceType: text("device_type"), // mobile, tablet, desktop
  platform: text("platform"), // ios, android, web
  referrer: text("referrer"), // where user came from
}, (table) => [
  index("idx_reading_history_user").on(table.userId, table.readAt.desc()),
  index("idx_reading_history_article").on(table.articleId),
  index("idx_reading_history_engagement").on(table.userId, table.engagementScore),
]);

// ============================================
// FOCUS MODE - Distraction-free reading sessions (Task #80)
// ============================================
export const focusReadingSessions = pgTable("focus_reading_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  articleId: varchar("article_id").notNull(),
  language: text("language").notNull().default("ar"), // ar, en, ur
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  focusedSeconds: integer("focused_seconds").default(0).notNull(),
  completed: boolean("completed").default(false).notNull(),
  shareSlug: varchar("share_slug", { length: 16 }).unique(),
  // Denormalized snapshot for share landing page (so it works even after article changes)
  articleTitle: text("article_title"),
  articleImageUrl: text("article_image_url"),
  articleSlug: text("article_slug"),
  categoryName: text("category_name"),
}, (table) => [
  index("idx_focus_sessions_user_started").on(table.userId, table.startedAt.desc()),
  index("idx_focus_sessions_article").on(table.articleId),
  index("idx_focus_sessions_share_slug").on(table.shareSlug),
]);

// Dismissed articles from continue reading section
export const dismissedContinueReading = pgTable("dismissed_continue_reading", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dismissed_continue_reading_user").on(table.userId),
  uniqueIndex("idx_dismissed_continue_reading_unique").on(table.userId, table.articleId),
]);

// Comments with status management
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, rejected, flagged
  parentId: varchar("parent_id"),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationReason: text("moderation_reason"),
  // Sentiment analysis fields
  currentSentiment: text("current_sentiment"), // positive, neutral, negative (denormalized for performance)
  currentSentimentConfidence: real("current_sentiment_confidence"), // 0-1
  sentimentAnalyzedAt: timestamp("sentiment_analyzed_at"),
  // AI Moderation fields - نظام الرقابة الذكية
  aiModerationScore: integer("ai_moderation_score"), // 0-100
  aiClassification: text("ai_classification"), // safe, review, reject
  aiDetectedIssues: jsonb("ai_detected_issues").$type<string[]>(), // toxicity, hate_speech, spam, etc.
  aiModerationReason: text("ai_moderation_reason"), // شرح سبب التصنيف
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  // Submission source — lets the moderation dashboard show whether a
  // comment came from the web, the iOS app, or the Android app at a
  // glance. Set by the comment-post route (mobile reads req.body
  // platform, web hardcodes "web"). Default "web" keeps existing rows
  // sensible after migration.
  platform: text("platform").default("web").notNull(), // web, ios, android
  // Denormalised like counter — kept in sync by the comment-reaction routes so
  // the public (cacheable) comments payload can show counts without a per-user
  // join. Per-user "did I like this" is overlaid client-side via /my-likes.
  likesCount: integer("likes_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_comments_article_status").on(table.articleId, table.status),
  index("idx_comments_user").on(table.userId),
  index("idx_comments_status").on(table.status),
  index("idx_comments_ai_classification").on(table.aiClassification),
]);

// Likes on individual comments (news + opinion share the comments table).
// Mirrors the article `reactions` table; unique(comment,user) makes a like
// idempotent. likesCount on comments is the denormalised counter.
export const commentReactions = pgTable("comment_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").references(() => comments.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull().default("like"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_comment_reactions_comment").on(table.commentId),
  uniqueIndex("idx_comment_reactions_unique").on(table.commentId, table.userId),
]);

// Comment sentiment analysis (tracks sentiment history)
export const commentSentiments = pgTable("comment_sentiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").references(() => comments.id, { onDelete: "cascade" }).notNull(),
  sentiment: text("sentiment").notNull(), // positive, neutral, negative
  confidence: real("confidence").notNull(), // 0-1 scale
  provider: text("provider").notNull(), // openai, anthropic, gemini
  model: text("model").notNull(), // specific model used
  language: text("language").notNull(), // ar, en, ur
  rawMetadata: jsonb("raw_metadata"), // full AI response for debugging
  analyzedAt: timestamp("analyzed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_sentiment_comment").on(table.commentId),
  index("idx_sentiment_sentiment").on(table.sentiment),
  index("idx_sentiment_analyzed").on(table.analyzedAt),
]);

// Article SEO generation history (unified for all languages)
export const articleSeoHistory = pgTable("article_seo_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull(), // Article ID from any language table
  language: text("language").notNull(), // ar, en, ur
  seoContent: jsonb("seo_content").$type<{
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    socialTitle?: string;
    socialDescription?: string;
    imageAltText?: string;
    ogImageUrl?: string;
  }>().notNull(),
  seoMetadata: jsonb("seo_metadata").$type<{
    status?: "draft" | "generated" | "approved" | "rejected";
    version?: number;
    generatedAt?: string;
    generatedBy?: string;
    provider?: "anthropic" | "openai" | "gemini" | "qwen";
    model?: string;
    manualOverride?: boolean;
    overrideBy?: string;
    overrideReason?: string;
    rawResponse?: any;
  }>().notNull(),
  version: integer("version").notNull(),
  provider: text("provider").notNull(), // anthropic, openai, gemini, qwen
  model: text("model").notNull(),
  generatedBy: varchar("generated_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_seo_history_article_lang").on(table.articleId, table.language),
  index("idx_seo_history_version").on(table.articleId, table.language, table.version.desc()),
  index("idx_seo_history_created").on(table.createdAt.desc()),
  uniqueIndex("idx_seo_history_unique_version").on(table.articleId, table.language, table.version),
]);

// Likes/reactions
export const reactions = pgTable("reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull().default("like"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_reactions_article").on(table.articleId),
  index("idx_reactions_user_article").on(table.userId, table.articleId),
]);

// Bookmarks/saved articles
export const bookmarks = pgTable("bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_bookmarks_user").on(table.userId, table.createdAt.desc()),
  index("idx_bookmarks_article").on(table.articleId),
]);

// Smart/Dynamic category assignments (auto-populated by AI)
export const articleSmartCategories = pgTable("article_smart_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "cascade" }).notNull(),
  score: real("score").default(1.0).notNull(), // Relevance score (0.0-1.0) for ranking
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_article_smart_category_unique").on(table.articleId, table.categoryId),
  index("idx_article_smart_category_id").on(table.categoryId),
  index("idx_article_smart_article_id").on(table.articleId),
]);

// User preferences for recommendations (ENHANCED with granular controls)
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  preferredCategories: jsonb("preferred_categories").$type<string[]>(),
  notificationsEnabled: boolean("notifications_enabled").default(true).notNull(),
  
  // NEW ADDITIVE FIELDS for granular notification control
  emailNotifications: boolean("email_notifications").default(true),
  pushNotifications: boolean("push_notifications").default(true),
  weeklyDigest: boolean("weekly_digest").default(false),
  followingNotifications: boolean("following_notifications").default(true), // notifications from followed users
  
  // NEW ADDITIVE FIELDS for content preferences
  preferredAuthors: jsonb("preferred_authors").$type<string[]>(), // array of user IDs
  blockedCategories: jsonb("blocked_categories").$type<string[]>(), // array of category IDs to hide
  recommendationFrequency: text("recommendation_frequency").default("daily"), // daily, weekly, never
  
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Interests for personalization system
export const interests = pgTable("interests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull().unique(),
  nameEn: text("name_en").notNull().unique(),
  slug: text("slug").notNull().unique(),
  icon: text("icon"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User interests (many-to-many) with weights - links users to categories they're interested in
export const userInterests = pgTable("user_interests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: 'cascade' }).notNull(),
  weight: real("weight").default(1.0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User reading history (for personalized match score sync across devices)
export const userReadingHistory = pgTable("user_reading_history", {
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  articleId: varchar("article_id").notNull(),
  categoryId: varchar("category_id"),
  categoryName: text("category_name"),
  keywords: text("keywords").array().default(sql`ARRAY[]::text[]`).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  timeSpent: integer("time_spent").default(0).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.articleId] }),
}));

// ============================================
// USER SEGMENTS SYSTEM (Audience Classification)
// ============================================

// Segment definitions - templates for categorizing users
export const userSegmentDefinitions = pgTable("user_segment_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  description: text("description"),
  descriptionAr: text("description_ar"),
  segmentType: text("segment_type").notNull(), // interest, activity, geography, device
  rules: jsonb("rules").$type<{
    minArticlesRead?: number;
    maxArticlesRead?: number;
    preferredCategories?: string[];
    activityLevel?: 'high' | 'medium' | 'low' | 'dormant';
    lastActiveWithinDays?: number;
    deviceTypes?: string[];
    regions?: string[];
  }>(),
  priority: integer("priority").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// User segment assignments - which segments each user belongs to
export const userSegmentAssignments = pgTable("user_segment_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  segmentId: varchar("segment_id").references(() => userSegmentDefinitions.id, { onDelete: 'cascade' }).notNull(),
  score: real("score").default(1.0).notNull(), // confidence score
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at"), // optional expiration
  metadata: jsonb("metadata").$type<{
    source?: 'auto' | 'manual';
    reason?: string;
  }>(),
}, (table) => [
  uniqueIndex("idx_user_segment_unique").on(table.userId, table.segmentId),
  index("idx_user_segment_user").on(table.userId),
  index("idx_user_segment_segment").on(table.segmentId),
]);

// User activity summary - pre-computed metrics for segmentation
export const userActivitySummary = pgTable("user_activity_summary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  totalArticlesRead: integer("total_articles_read").default(0).notNull(),
  articlesReadLast7Days: integer("articles_read_last_7_days").default(0).notNull(),
  articlesReadLast30Days: integer("articles_read_last_30_days").default(0).notNull(),
  avgReadingTimeSeconds: integer("avg_reading_time_seconds").default(0).notNull(),
  totalComments: integer("total_comments").default(0).notNull(),
  totalReactions: integer("total_reactions").default(0).notNull(),
  totalBookmarks: integer("total_bookmarks").default(0).notNull(),
  topCategories: jsonb("top_categories").$type<{categoryId: string; count: number; weight: number}[]>(),
  activityLevel: text("activity_level").default("new"), // high, medium, low, dormant, new
  lastActiveAt: timestamp("last_active_at"),
  lastDeviceType: text("last_device_type"),
  primaryRegion: text("primary_region"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// SOCIAL FOLLOWING SYSTEM (NEW)
// ============================================

// Social follows - user-to-user following relationships
export const socialFollows = pgTable("social_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").references(() => users.id, { onDelete: 'cascade' }).notNull(), // who is following
  followingId: varchar("following_id").references(() => users.id, { onDelete: 'cascade' }).notNull(), // who is being followed
  notificationsEnabled: boolean("notifications_enabled").default(true).notNull(), // receive notifications for this user's activity
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // Ensure a user can't follow the same person twice
  uniqueIndex("idx_social_follows_unique").on(table.followerId, table.followingId),
  // Quick lookups for followers/following lists
  index("idx_social_follows_follower").on(table.followerId, table.createdAt.desc()),
  index("idx_social_follows_following").on(table.followingId, table.createdAt.desc()),
]);

// Behavior tracking logs
export const behaviorLogs = pgTable("behavior_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  eventType: text("event_type").notNull(),
  metadata: jsonb("metadata").$type<{
    articleId?: string;
    categoryId?: string;
    duration?: number;
    query?: string;
    action?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Sentiment analysis scores
export const sentimentScores = pgTable("sentiment_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  overallScore: real("overall_score").notNull(),
  emotionalBreakdown: jsonb("emotional_breakdown").$type<{
    enthusiasm?: number;
    satisfaction?: number;
    anger?: number;
    sadness?: number;
    neutral?: number;
  }>(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  commentId: varchar("comment_id").references(() => comments.id),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Theme management system
export const themes = pgTable("themes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isDefault: boolean("is_default").default(false).notNull(),
  priority: integer("priority").default(0).notNull(),
  status: text("status").notNull().default("draft"),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  assets: jsonb("assets").$type<{
    logoLight?: string;
    logoDark?: string;
    favicon?: string;
    banner?: string;
    ogImage?: string;
  }>(),
  tokens: jsonb("tokens").$type<{
    colors?: Record<string, string>;
    fonts?: Record<string, string>;
    spacing?: Record<string, string>;
    borderRadius?: Record<string, string>;
  }>(),
  applyTo: text("apply_to").array().default(sql`ARRAY[]::text[]`).notNull(),
  version: integer("version").default(1).notNull(),
  changelog: jsonb("changelog").$type<Array<{
    version: number;
    changes: string;
    timestamp: string;
    userId: string;
  }>>(),
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  approvedBy: varchar("approved_by").references(() => users.id),
  publishedBy: varchar("published_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Theme audit log for tracking changes
export const themeAuditLog = pgTable("theme_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  themeId: varchar("theme_id").references(() => themes.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  changes: jsonb("changes").$type<Record<string, any>>(),
  metadata: jsonb("metadata").$type<{
    previousStatus?: string;
    newStatus?: string;
    reason?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// System settings for configurable application settings
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: jsonb("value").notNull(),
  category: text("category").default("system").notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Roles for RBAC
export const roles = pgTable("roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Permissions for granular access control
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // e.g., "articles.create", "users.ban"
  label: text("label").notNull(),
  labelAr: text("label_ar").notNull(),
  module: text("module").notNull(), // articles, users, categories, comments, etc.
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Role-Permission mapping (many-to-many)
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  permissionId: varchar("permission_id").references(() => permissions.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User-Role mapping (updated to support RBAC)
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  roleId: varchar("role_id").references(() => roles.id, { onDelete: "cascade" }).notNull(),
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => ({
  // Prevent duplicate role assignments
  uniqueUserRole: uniqueIndex("unique_user_role_idx").on(table.userId, table.roleId),
}));

// User Permission Overrides - allows per-user permission customization
// الصلاحيات المخصصة للمستخدم - تتيح تخصيص الصلاحيات لكل مستخدم على حدة
export const userPermissionOverrides = pgTable("user_permission_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  permissionCode: text("permission_code").notNull(), // e.g., "articles.ai_generate"
  effect: text("effect").notNull().default("allow"), // "allow" or "deny"
  grantedBy: varchar("granted_by").references(() => users.id),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  reason: text("reason"), // Optional reason for the override
}, (table) => ({
  // Prevent duplicate overrides for same user-permission pair
  uniqueUserPermission: uniqueIndex("unique_user_permission_override_idx").on(table.userId, table.permissionCode),
}));

// Staff (reporters, writers, supervisors)
export const staff = pgTable("staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  slug: text("slug").notNull().unique(),
  
  // Bilingual fields (English and Arabic only - Urdu version uses English names)
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  title: text("title"),
  titleAr: text("title_ar"),
  bio: text("bio"),
  bioAr: text("bio_ar"),
  specializations: text("specializations").array().default(sql`ARRAY[]::text[]`).notNull(),
  
  profileImage: text("profile_image"),
  staffType: text("staff_type").notNull(), // reporter, writer, supervisor
  isActive: boolean("is_active").default(true).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  publishedCount: integer("published_count").default(0).notNull(),
  totalViews: integer("total_views").default(0).notNull(),
  totalLikes: integer("total_likes").default(0).notNull(),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Activity logs for audit trail
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: text("action").notNull(), // create, update, delete, publish, etc.
  entityType: text("entity_type").notNull(), // article, user, category, etc.
  entityId: varchar("entity_id").notNull(),
  oldValue: jsonb("old_value").$type<Record<string, any>>(),
  newValue: jsonb("new_value").$type<Record<string, any>>(),
  metadata: jsonb("metadata").$type<{
    ip?: string;
    userAgent?: string;
    reason?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_activity_logs_user").on(table.userId, table.createdAt.desc()),
  index("idx_activity_logs_entity").on(table.entityType, table.entityId),
  index("idx_activity_logs_created").on(table.createdAt.desc()),
]);

// Notification Templates
export const notificationTemplates = pgTable("notification_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().unique(), // BreakingNews, InterestMatch, LikedStoryUpdate, MostReadTodayForYou
  channel: text("channel").notNull(), // in-app, web-push, email, daily-digest
  titleAr: text("title_ar").notNull(),
  bodyAr: text("body_ar").notNull(),
  deeplinkPattern: text("deeplink_pattern"), // e.g., "/news/{slug}"
  ctaLabelAr: text("cta_label_ar"), // e.g., "افتح الخبر"
  priority: integer("priority").default(50).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User Notification Preferences
export const userNotificationPrefs = pgTable("user_notification_prefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  breaking: boolean("breaking").default(true).notNull(),
  interest: boolean("interest").default(true).notNull(),
  likedUpdates: boolean("liked_updates").default(true).notNull(),
  mostRead: boolean("most_read").default(true).notNull(),
  webPush: boolean("web_push").default(false).notNull(),
  dailyDigest: boolean("daily_digest").default(false).notNull(),
  quietHoursStart: text("quiet_hours_start").default("23:00"),
  quietHoursEnd: text("quiet_hours_end").default("08:00"),
  whatsappPhone: text("whatsapp_phone"),
  whatsappEnabled: boolean("whatsapp_enabled").default(false).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Notification Queue
export const notificationQueue = pgTable("notification_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // BreakingNews, InterestMatch, LikedStoryUpdate, MostReadTodayForYou
  payload: jsonb("payload").$type<{
    articleId?: string;
    articleTitle?: string;
    matchedTopic?: string;
    deeplink?: string;
  }>().notNull(),
  priority: integer("priority").default(50).notNull(),
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").default("queued").notNull(), // queued, sent, error
  dedupeKey: text("dedupe_key").notNull().unique(), // user_id:article_id:type (unique to prevent duplicates)
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notification_queue_user_status").on(table.userId, table.status),
  index("idx_notification_queue_scheduled").on(table.scheduledAt),
  index("idx_notification_queue_user_type").on(table.userId, table.type), // For fast duplicate checks
  index("idx_notification_queue_status_priority").on(table.status, table.priority), // For queue processing
]);

// Notifications Inbox (user's notification feed)
export const notificationsInbox = pgTable("notifications_inbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  deeplink: text("deeplink"),
  read: boolean("read").default(false).notNull(),
  metadata: jsonb("metadata").$type<{
    articleId?: string;
    articleSlug?: string;
    imageUrl?: string;
    categorySlug?: string;
    articleIds?: string[];
    recommendationType?: string;
    similarToArticleId?: string;
    [key: string]: any; // Allow additional metadata fields
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notifications_inbox_user_created").on(table.userId, table.createdAt.desc()),
  index("idx_notifications_inbox_read").on(table.userId, table.read),
  index("idx_notifications_inbox_user_type").on(table.userId, table.type), // For fast duplicate checks
]);

// Notification metrics for analytics
export const notificationMetrics = pgTable("notification_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  notificationId: varchar("notification_id").references(() => notificationsInbox.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(),
  opened: boolean("opened").default(false).notNull(),
  clicked: boolean("clicked").default(false).notNull(),
  dismissed: boolean("dismissed").default(false).notNull(),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notification_metrics_type").on(table.type),
]);

// User Loyalty Events (points earning log)
export const userLoyaltyEvents = pgTable("user_loyalty_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // READ, LIKE, SHARE, COMMENT, NOTIFICATION_OPEN, etc.
  points: integer("points").notNull(),
  source: text("source"), // article_id, comment_id, etc.
  campaignId: varchar("campaign_id").references(() => loyaltyCampaigns.id), // للربط بالحملة
  metadata: jsonb("metadata").$type<{
    articleId?: string;
    commentId?: string;
    duration?: number;
    extraInfo?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_loyalty_events_user_created").on(table.userId, table.createdAt),
  index("idx_loyalty_events_action").on(table.action),
]);

// User Points Total (aggregated points and rank)
// Tier names + level numbers are the source of truth in shared/loyalty.ts.
// Level 4 ("القارئ الموثوق") was inserted in Phase 1 (2026-05-18); legacy
// "سفير سبق" users were grandfathered to level 5 by
// scripts/migrate-loyalty-tiers.ts.
export const userPointsTotal = pgTable("user_points_total", {
  userId: varchar("user_id").primaryKey().references(() => users.id),
  totalPoints: integer("total_points").default(0).notNull(),
  currentRank: text("current_rank").default("القارئ الجديد").notNull(),
  rankLevel: integer("rank_level").default(1).notNull(),
  lifetimePoints: integer("lifetime_points").default(0).notNull(),
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  sql`CONSTRAINT rank_level_check CHECK (rank_level BETWEEN 1 AND 5)`,
]);

// ============================================================================
// World Cup 2026 — Match Predictions Competition
// Fixtures are NOT stored (fetched live from API-Football via worldCupService).
// These two tables hold ONLY user predictions + per-fixture settlement state.
// ============================================================================

// One row per (fixtureId, userId): the user's exact-scoreline guess.
export const wcPredictions = pgTable("wc_predictions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // API-Football fixture id is numeric; stored as text to match the
  // userLoyaltyEvents.source convention the loyalty dedup keys off.
  fixtureId: varchar("fixture_id").notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  predHome: integer("pred_home").notNull(),
  predAway: integer("pred_away").notNull(),
  // 'pending' until the match settles, then 'correct' | 'incorrect'.
  status: text("status").notNull().default("pending"),
  pointsAwarded: integer("points_awarded").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  settledAt: timestamp("settled_at"),
}, (table) => [
  // One prediction per user per match — upsert anchor + dup-submit guard.
  uniqueIndex("idx_wc_pred_fixture_user").on(table.fixtureId, table.userId),
  index("idx_wc_pred_user").on(table.userId),       // "my predictions" + leaderboard
  index("idx_wc_pred_fixture").on(table.fixtureId), // settlement scan
]);

// Per-fixture settlement state. WHY THIS TABLE EXISTS:
//   1. Idempotency anchor — settledAt is the single guard that makes the
//      per-minute settlement cron safe to overlap / re-run after a pod restart.
//   2. History display — snapshots team names + logos + final score so the
//      results UI renders settled matches WITHOUT a live API call (fixtures
//      roll out of the 60s cache and old rounds drop from the provider list).
//   3. Leaderboard joins — winnersCount / pointsPerWinner read straight here.
export const wcPredictionMatches = pgTable("wc_prediction_matches", {
  fixtureId: varchar("fixture_id").primaryKey(),
  kickoffAt: timestamp("kickoff_at").notNull(),
  homeTeamName: text("home_team_name").notNull(),
  homeTeamLogo: text("home_team_logo").notNull().default(""),
  awayTeamName: text("away_team_name").notNull(),
  awayTeamLogo: text("away_team_logo").notNull().default(""),
  finalHome: integer("final_home"),   // null until settled
  finalAway: integer("final_away"),   // null until settled
  // 'open' (accepting predictions) | 'locked' (kicked off) | 'settled'.
  status: text("status").notNull().default("open"),
  winnersCount: integer("winners_count").notNull().default(0),
  predictionsCount: integer("predictions_count").notNull().default(0),
  pointsPool: integer("points_pool").notNull().default(500),
  pointsPerWinner: integer("points_per_winner").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  settledAt: timestamp("settled_at"),  // THE idempotency guard
}, (table) => [
  index("idx_wc_pred_match_status").on(table.status),
]);

export type WcPrediction = typeof wcPredictions.$inferSelect;
export type WcPredictionMatch = typeof wcPredictionMatches.$inferSelect;

// Loyalty Rewards (available rewards)
export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  pointsCost: integer("points_cost").notNull(),
  rewardType: text("reward_type").notNull(), // COUPON, BADGE, CONTENT_ACCESS, PARTNER_REWARD
  partnerName: text("partner_name"), // STC, Jarir, Noon, etc.
  rewardData: jsonb("reward_data").$type<{
    couponCode?: string;
    badgeIcon?: string;
    partnerApiData?: Record<string, any>;
  }>(),
  stock: integer("stock"), // null = unlimited
  remainingStock: integer("remaining_stock"), // يتناقص مع كل استبدال
  maxRedemptionsPerUser: integer("max_redemptions_per_user"), // null = unlimited
  isActive: boolean("is_active").default(true).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User Rewards History (reward redemption log)
export const userRewardsHistory = pgTable("user_rewards_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  rewardId: varchar("reward_id").references(() => loyaltyRewards.id).notNull(),
  pointsSpent: integer("points_spent").notNull(),
  status: text("status").default("pending").notNull(), // pending, delivered, expired, cancelled
  rewardSnapshot: jsonb("reward_snapshot").$type<{
    nameAr: string;
    nameEn: string;
    pointsCost: number;
    rewardType: string;
  }>(), // لحفظ تفاصيل الجائزة وقت الاستبدال
  deliveryData: jsonb("delivery_data").$type<{
    couponCode?: string;
    trackingInfo?: string;
  }>(),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
  deliveredAt: timestamp("delivered_at"),
}, (table) => [
  index("idx_rewards_history_user").on(table.userId),
  index("idx_rewards_history_status").on(table.status),
]);

// Loyalty Campaigns (promotional campaigns)
export const loyaltyCampaigns = pgTable("loyalty_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  description: text("description"),
  campaignType: text("campaign_type").notNull(), // BONUS_POINTS, MULTIPLIER, SPECIAL_EVENT
  targetAction: text("target_action"), // READ, SHARE, etc. (null = all actions)
  multiplier: real("multiplier").default(1.0), // 2.0 = نقاط مضاعفة
  bonusPoints: integer("bonus_points").default(0),
  targetCategory: varchar("target_category").references(() => categories.id, { onDelete: 'set null' }), // null = all categories
  isActive: boolean("is_active").default(true).notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaigns_active_dates").on(table.isActive, table.startAt, table.endAt),
]);

// Sections table (for organizing angles)
export const sections = pgTable("sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Angles table (زوايا - thematic perspectives)
export const angles = pgTable("angles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sectionId: varchar("section_id").references(() => sections.id).notNull(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  slug: text("slug").notNull().unique(),
  colorHex: text("color_hex").notNull(), // #RRGGBB format
  iconKey: text("icon_key").notNull(), // Lucide icon name
  coverImageUrl: text("cover_image_url"),
  shortDesc: text("short_desc"),
  writerSignature: text("writer_signature"), // توقيع الكاتب — يظهر نهاية كل موضوع
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  managerUserId: varchar("manager_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_angles_active").on(table.isActive),
  index("idx_angles_sort").on(table.sortOrder),
  index("idx_angles_manager").on(table.managerUserId),
]);

// Junction table for article-angle many-to-many
export const articleAngles = pgTable("article_angles", {
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  angleId: varchar("angle_id").references(() => angles.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.articleId, table.angleId] }),
  articleIdx: index("idx_article_angles_article").on(table.articleId),
  angleIdx: index("idx_article_angles_angle").on(table.angleId),
}));

// Topics table (مواضيع - Muqtarab topics within angles)
export const topics = pgTable("topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  angleId: varchar("angle_id").references(() => angles.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  excerpt: text("excerpt"),
  content: jsonb("content").$type<{
    blocks?: Array<{
      type: "text" | "image" | "video" | "link" | "embed" | "quote" | "heading";
      content?: string;
      url?: string;
      alt?: string;
      caption?: string;
      level?: number;
      metadata?: Record<string, any>;
    }>;
    rawHtml?: string;
    plainText?: string;
  }>(),
  heroImageUrl: text("hero_image_url"),
  attachments: jsonb("attachments").$type<Array<{
    id?: string;
    url: string;
    name: string;
    type: "image" | "video" | "audio" | "document" | "other";
    size?: number;
    mimeType?: string;
    caption?: string;
  }>>(),
  seoMeta: jsonb("seo_meta").$type<{
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    ogImage?: string;
    canonicalUrl?: string;
  }>(),
  status: text("status").default("draft").notNull(),
  publishedAt: timestamp("published_at"),
  viewCount: integer("view_count").default(0).notNull(), // عدّاد المشاهدات (تحليلات الكاتب)
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  updatedBy: varchar("updated_by").references(() => users.id),
  // مراجعة الإدارة لمواضيع كتّاب الزوايا (سير pending_review → published/needs_revision)
  submittedAt: timestamp("submitted_at"), // متى أرسله الكاتب للمراجعة
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"), // ملاحظات الإدارة عند الإرجاع
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_topics_angle_status").on(table.angleId, table.status),
  index("idx_topics_slug").on(table.slug),
  index("idx_topics_published").on(table.publishedAt),
  index("idx_topics_status_submitted").on(table.status, table.submittedAt), // طابور المراجعة
  uniqueIndex("idx_topics_angle_slug").on(table.angleId, table.slug),
]);

// Comments on Muqtarab topics. A parallel family to `comments` (topics live in
// their own table, not `articles`, so the comments.articleId FK can't be
// reused). Mirrors the full comments feature set — threaded replies, AI
// moderation, suspicious-words flagging, sentiment, platform attribution and
// the likesCount counter — so the shared <CommentSection> and the unified
// moderation dashboard work without special-casing.
export const topicComments = pgTable("topic_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").references(() => topics.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, rejected, flagged
  parentId: varchar("parent_id"),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationReason: text("moderation_reason"),
  // Sentiment analysis fields (denormalised current value for performance)
  currentSentiment: text("current_sentiment"), // positive, neutral, negative
  currentSentimentConfidence: real("current_sentiment_confidence"), // 0-1
  sentimentAnalyzedAt: timestamp("sentiment_analyzed_at"),
  // AI Moderation fields - نظام الرقابة الذكية
  aiModerationScore: integer("ai_moderation_score"), // 0-100
  aiClassification: text("ai_classification"), // safe, review, reject
  aiDetectedIssues: jsonb("ai_detected_issues").$type<string[]>(),
  aiModerationReason: text("ai_moderation_reason"),
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  platform: text("platform").default("web").notNull(), // web, ios, android
  likesCount: integer("likes_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_topic_comments_topic_status").on(table.topicId, table.status),
  index("idx_topic_comments_user").on(table.userId),
  index("idx_topic_comments_status").on(table.status),
  index("idx_topic_comments_ai_classification").on(table.aiClassification),
]);

// Likes on individual Muqtarab topic comments (mirrors commentReactions).
export const topicCommentReactions = pgTable("topic_comment_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicCommentId: varchar("topic_comment_id").references(() => topicComments.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull().default("like"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_topic_comment_reactions_comment").on(table.topicCommentId),
  uniqueIndex("idx_topic_comment_reactions_unique").on(table.topicCommentId, table.userId),
]);

// Angle Submissions table - طلبات كتابة الزوايا
export const angleSubmissions = pgTable("angle_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // معلومات شخصية
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  city: text("city"),
  // معلومات الزاوية
  angleName: text("angle_name").notNull(),
  angleCategory: text("angle_category").notNull(), // سياسي، اجتماعي، رياضي، تقني، ثقافي، اقتصادي
  angleDescription: text("angle_description").notNull(),
  uniquePoints: text("unique_points"), // ما يميز الزاوية
  // الخبرة
  writingExperience: text("writing_experience"),
  previousArticlesUrl: text("previous_articles_url"),
  expectedArticlesPerMonth: integer("expected_articles_per_month"),
  // الحالة
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  reviewerNotes: text("reviewer_notes"),
  reviewedBy: varchar("reviewed_by").references(() => users.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at"),
  // الربط بالزاوية إذا تم القبول
  createdAngleId: varchar("created_angle_id").references(() => angles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_angle_submissions_status").on(table.status),
  index("idx_angle_submissions_email").on(table.email),
]);

export const insertAngleSubmissionSchema = createInsertSchema(angleSubmissions).omit({
  id: true,
  status: true,
  reviewerNotes: true,
  reviewedBy: true,
  reviewedAt: true,
  createdAngleId: true,
  createdAt: true,
});

export type InsertAngleSubmission = z.infer<typeof insertAngleSubmissionSchema>;
export type AngleSubmission = typeof angleSubmissions.$inferSelect;

// Image assets table for managing uploads
export const imageAssets = pgTable("image_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  url: text("url").notNull(),
  width: integer("width"),
  height: integer("height"),
  mimeType: text("mime_type"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tags table (الوسوم)
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  usageCount: integer("usage_count").default(0).notNull(),
  color: text("color"),
  status: text("status").default("active").notNull(), // active, inactive
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tags_slug").on(table.slug),
  index("idx_tags_status").on(table.status),
]);

// Junction table for article-tag many-to-many
export const articleTags = pgTable("article_tags", {
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  tagId: varchar("tag_id").references(() => tags.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.articleId, table.tagId] }),
  articleIdx: index("idx_article_tags_article").on(table.articleId),
  tagIdx: index("idx_article_tags_tag").on(table.tagId),
}));

// User followed terms (for keyword following feature)
export const userFollowedTerms = pgTable("user_followed_terms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tagId: varchar("tag_id").references(() => tags.id, { onDelete: "cascade" }).notNull(),
  notify: boolean("notify").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniq: index("user_followed_terms_user_tag_idx").on(table.userId, table.tagId),
}));

// ============================================
// Smart Recommendations & Personalization Tables
// ============================================

// User events tracking (unified interaction tracking)
export const userEvents = pgTable("user_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  eventType: text("event_type").notNull(), // 'like', 'save', 'read', 'share', 'comment'
  eventValue: integer("event_value").default(1).notNull(), // weight for scoring (like=3, save=2, read=1, share=4)
  metadata: jsonb("metadata").$type<{
    readDuration?: number; // seconds
    scrollDepth?: number; // percentage 0-100
    referrer?: string;
    deviceType?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_events_user").on(table.userId),
  index("idx_user_events_article").on(table.articleId),
  index("idx_user_events_type").on(table.eventType),
  index("idx_user_events_created").on(table.createdAt),
]);

// User affinities (derived preferences - updated periodically)
export const userAffinities = pgTable("user_affinities", {
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tag: text("tag").notNull(), // tag name, category slug, entity name
  tagType: text("tag_type").notNull(), // 'tag', 'category', 'entity', 'topic'
  score: real("score").notNull(), // 0.0 - 1.0
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.tag] }),
  userIdx: index("idx_user_affinities_user").on(table.userId),
  scoreIdx: index("idx_user_affinities_score").on(table.score),
}));

// Content vectors (embeddings for similarity matching)
export const contentVectors = pgTable("content_vectors", {
  articleId: varchar("article_id").primaryKey().references(() => articles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  excerpt: text("excerpt"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(), // tag slugs
  entities: text("entities").array().default(sql`ARRAY[]::text[]`).notNull(), // extracted entities (people, places, organizations)
  embedding: jsonb("embedding").$type<number[]>(), // 1024-dim embedding vector (from OpenAI text-embedding-3-large)
  embeddingModel: text("embedding_model").default("text-embedding-3-large"), // track which model was used
  publishedAt: timestamp("published_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_content_vectors_published").on(table.publishedAt),
]);

// Article Impressions - تتبع ظهور المقالات للمستخدم (لتحسين التوصيات)
export const articleImpressions = pgTable("article_impressions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  impressionType: text("impression_type").notNull().default("feed"), // 'feed', 'recommendation', 'search', 'related'
  position: integer("position"), // موضع المقال في الفيد عند الظهور
  viewDuration: integer("view_duration"), // مدة ظهور المقال بالميلي ثانية
  isClicked: boolean("is_clicked").default(false).notNull(), // هل تم النقر على المقال
  deviceType: text("device_type"), // mobile, tablet, desktop
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_impressions_user").on(table.userId),
  index("idx_impressions_article").on(table.articleId),
  index("idx_impressions_user_article").on(table.userId, table.articleId),
  index("idx_impressions_created").on(table.createdAt.desc()),
  index("idx_impressions_type").on(table.impressionType),
]);

// Per-IP article view aggregate — answers "is this article's traffic from one IP?"
// One row per (article, hashed IP): views_count = number of COUNTED views from that
// IP (post 5-min dedup). The IP is stored ONLY as a salted SHA-256 hash (privacy),
// which still allows distinct-IP counting and per-IP distribution. The table grows
// with the number of DISTINCT IPs, not pageviews, so it stays small. Written via a
// buffered batch UPSERT in server/services/articleViewStatsService.ts.
export const articleIpViews = pgTable("article_ip_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  userId: varchar("user_id"), // last known logged-in viewer for this IP (nullable)
  viewsCount: integer("views_count").default(0).notNull(),
  firstSeen: timestamp("first_seen").defaultNow().notNull(),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_article_ip_views_article_ip").on(table.articleId, table.ipHash),
  index("idx_article_ip_views_article").on(table.articleId),
]);

// Feed Recommendations - التوصيات المخصصة للعرض في الفيد
export const feedRecommendations = pgTable("feed_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  score: real("score").notNull(), // درجة التوصية (0-1)
  reason: text("reason").notNull(), // 'liked_similar', 'saved_similar', 'category_interest', 'author_follow', 'trending_match'
  reasonDetails: jsonb("reason_details").$type<{
    basedOnArticleId?: string; // المقال الذي أدى للتوصية
    basedOnCategory?: string;
    basedOnTag?: string;
    matchScore?: number;
  }>(),
  isDisplayed: boolean("is_displayed").default(false).notNull(),
  isClicked: boolean("is_clicked").default(false).notNull(),
  displayPosition: integer("display_position"), // موضع العرض في الفيد
  expiresAt: timestamp("expires_at").notNull(), // صلاحية التوصية
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_feed_rec_user").on(table.userId),
  index("idx_feed_rec_article").on(table.articleId),
  index("idx_feed_rec_user_score").on(table.userId, table.score.desc()),
  index("idx_feed_rec_expires").on(table.expiresAt),
  index("idx_feed_rec_displayed").on(table.userId, table.isDisplayed),
]);

// Recommendation log (track sent recommendations to prevent spam/duplicates)
export const recommendationLog = pgTable("recommendation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  reason: text("reason").notNull(), // 'because_you_liked', 'similar_to_saved', 'within_reads', 'trending_for_you'
  score: real("score").notNull(), // similarity score that triggered the recommendation
  channel: text("channel").notNull(), // 'notification', 'feed', 'email', 'digest'
  metadata: jsonb("metadata").$type<{
    similarToArticleId?: string; // reference article that triggered this recommendation
    triggerEvent?: string; // what event triggered this (e.g., 'article_published')
    abTestVariant?: string; // for A/B testing
  }>(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => [
  index("idx_recommendation_log_user").on(table.userId),
  index("idx_recommendation_log_article").on(table.articleId),
  index("idx_recommendation_log_sent").on(table.sentAt),
  index("idx_recommendation_log_reason").on(table.reason),
]);

// User recommendation preferences (enhanced notification preferences for recommendations)
export const userRecommendationPrefs = pgTable("user_recommendation_prefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  // Notification types
  becauseYouLiked: boolean("because_you_liked").default(true).notNull(),
  similarToSaved: boolean("similar_to_saved").default(true).notNull(),
  withinReads: boolean("within_reads").default(true).notNull(),
  trendingForYou: boolean("trending_for_you").default(true).notNull(),
  // Digest preferences
  dailyDigest: boolean("daily_digest").default(false).notNull(),
  digestTime: text("digest_time").default("20:30"), // 8:30 PM
  // Frequency limits
  maxDailyPersonal: integer("max_daily_personal").default(3).notNull(), // max personal recommendations per day
  cooldownHours: integer("cooldown_hours").default(6).notNull(), // hours between similar notifications
  // A/B testing
  abTestGroup: text("ab_test_group").default("control"), // for experiments
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Recommendation metrics (for analytics and A/B testing)
export const recommendationMetrics = pgTable("recommendation_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recommendationId: varchar("recommendation_id").references(() => recommendationLog.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  // Engagement tracking
  viewed: boolean("viewed").default(false).notNull(),
  clicked: boolean("clicked").default(false).notNull(),
  read: boolean("read").default(false).notNull(), // stayed >30s or >40% scroll
  liked: boolean("liked").default(false).notNull(),
  saved: boolean("saved").default(false).notNull(),
  shared: boolean("shared").default(false).notNull(),
  muted: boolean("muted").default(false).notNull(), // user muted this type of recommendation
  // Timing
  viewedAt: timestamp("viewed_at"),
  clickedAt: timestamp("clicked_at"),
  readAt: timestamp("read_at"),
  timeToClick: integer("time_to_click"), // seconds from notification to click
  readDuration: integer("read_duration"), // seconds spent reading
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_recommendation_metrics_user").on(table.userId),
  index("idx_recommendation_metrics_article").on(table.articleId),
  index("idx_recommendation_metrics_clicked").on(table.clicked),
  index("idx_recommendation_metrics_muted").on(table.muted),
]);

// ============================================
// Story Following/Tracking Tables
// ============================================

// Stories (news clusters)
export const stories = pgTable("stories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  rootArticleId: varchar("root_article_id").references(() => articles.id, { onDelete: "set null" }),
  entities: jsonb("entities").$type<Record<string, any>>(),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Story links (linking articles to stories)
export const storyLinks = pgTable("story_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storyId: varchar("story_id").references(() => stories.id).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  relation: text("relation").notNull(), // 'root' or 'followup'
  confidence: real("confidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_story_links_story").on(table.storyId),
  index("idx_story_links_article").on(table.articleId),
]);

// Story follows (user subscriptions)
export const storyFollows = pgTable("story_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  storyId: varchar("story_id").references(() => stories.id).notNull(),
  level: text("level").default("all").notNull(), // 'all', 'breaking', 'analysis', 'official'
  channels: text("channels").array().default(sql`ARRAY['inapp']::text[]`).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_story_follows_user").on(table.userId),
  index("idx_story_follows_story").on(table.storyId),
]);

// Sports follows — متابعة المستخدم لفِرق/بطولات رياضية (شخصنة /sports2).
// kind: 'team' | 'competition'؛ refId = معرّف الفريق (رقم كنص) أو slug البطولة.
export const sportsFollows = pgTable("sports_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  kind: text("kind").notNull(),
  refId: text("ref_id").notNull(),
  refName: text("ref_name").notNull(),
  refLogo: text("ref_logo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_sports_follows_unique").on(table.userId, table.kind, table.refId),
  index("idx_sports_follows_user").on(table.userId, table.createdAt.desc()),
]);

export type SportsFollow = typeof sportsFollows.$inferSelect;
export type InsertSportsFollow = typeof sportsFollows.$inferInsert;

// Story notifications (notification log)
export const storyNotifications = pgTable("story_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storyId: varchar("story_id").references(() => stories.id).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  deliveredTo: text("delivered_to").array().default(sql`ARRAY[]::text[]`).notNull(),
  channel: text("channel").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_story_notifications_story").on(table.storyId),
  index("idx_story_notifications_article").on(table.articleId),
]);

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({ 
  id: true, 
  createdAt: true,
  isProfileComplete: true,
  lastActivityAt: true,
  emailVerified: true,
  phoneVerified: true,
  verificationBadge: true,
  suspendedUntil: true,
  suspensionReason: true,
  bannedUntil: true,
  banReason: true,
  accountLocked: true,
  lockedUntil: true,
  failedLoginAttempts: true,
  deletedAt: true,
});

export const updateUserSchema = z.object({
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").optional(),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").optional(),
  firstNameEn: z.union([z.string().min(2, "English first name must be at least 2 characters"), z.literal("")]).optional(),
  lastNameEn: z.union([z.string().min(2, "English last name must be at least 2 characters"), z.literal("")]).optional(),
  bio: z.string().max(500, "النبذة يجب أن لا تزيد عن 500 حرف").optional().or(z.literal("")),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional().or(z.literal("")),
  profileImageUrl: z.string().optional().or(z.literal("")),
  isProfileComplete: z.boolean().optional(),
  preferredVariant: z.enum(["ai-first", "magazine", "classic", "terminal"]).nullable().optional(),
});

export const adminUpdateUserSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح").optional(),
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").optional(),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").optional(),
  firstNameEn: z.union([z.string().min(2, "English first name must be at least 2 characters"), z.literal("")]).optional(),
  lastNameEn: z.union([z.string().min(2, "English last name must be at least 2 characters"), z.literal("")]).optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional().or(z.literal("")),
  profileImageUrl: z.string().nullable().optional(),
  status: z.enum(["active", "pending", "suspended", "banned", "locked", "deleted"], {
    errorMap: () => ({ message: "الحالة يجب أن تكون: نشط، معلق، محظور، أو مقفل" })
  }).optional(),
  roleId: z.string().uuid("معرف الدور غير صحيح").optional(),
  verificationBadge: z.enum(["none", "silver", "gold"]).optional(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  
  // Press Card fields (Apple Wallet Digital Press Card)
  hasPressCard: z.boolean().optional(),
  jobTitle: z.union([z.string(), z.literal(""), z.null()]).optional(),
  department: z.union([z.string(), z.literal(""), z.null()]).optional(),
  pressIdNumber: z.union([z.string(), z.literal(""), z.null()]).optional(),
  cardValidUntil: z.union([z.string(), z.literal(""), z.null()]).optional(), // ISO date string
});

// Admin schema for creating new users with roles
export const adminCreateUserSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل"),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل"),
  firstNameEn: z.union([z.string().min(2, "English first name must be at least 2 characters"), z.literal("")]).optional(),
  lastNameEn: z.union([z.string().min(2, "English last name must be at least 2 characters"), z.literal("")]).optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional().or(z.literal("")),
  profileImageUrl: z.string().nullable().optional(),
  roleIds: z.array(z.string().uuid("معرف الدور غير صحيح")).min(1, "يجب اختيار دور واحد على الأقل"),
  status: z.enum(["active", "pending", "suspended", "banned", "locked"]).default("active"),
  emailVerified: z.boolean().default(false),
  phoneVerified: z.boolean().default(false),
});

// Admin schema for updating user roles (bulk update)
export const adminUpdateUserRolesSchema = z.object({
  roleIds: z.array(z.string().uuid("معرف الدور غير صحيح")).min(1, "يجب اختيار دور واحد على الأقل"),
  reason: z.string().min(5, "يجب إدخال سبب التغيير (5 أحرف على الأقل)").optional(),
});

export const suspendUserSchema = z.object({
  reason: z.string().min(5, "يجب إدخال سبب التعليق (5 أحرف على الأقل)"),
  duration: z.number().int().positive().optional(), // in days
});

export const banUserSchema = z.object({
  reason: z.string().min(5, "يجب إدخال سبب الحظر (5 أحرف على الأقل)"),
  isPermanent: z.boolean().default(false),
  duration: z.number().int().positive().optional(), // in days, only if not permanent
});
export const insertCategorySchema = createInsertSchema(categories).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true 
}).extend({
  type: z.enum(["core", "dynamic", "smart", "seasonal"]).default("core"),
  status: z.enum(["active", "inactive"]).default("active"),
  seasonalRules: seasonalRulesSchema,
  features: categoryFeaturesSchema,
  aiConfig: aiConfigSchema,
});
export const insertArticleSchema = createInsertSchema(articles).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  views: true,
  aiGenerated: true,
  credibilityScore: true,
  credibilityAnalysis: true,
  credibilityLastUpdated: true,
  authorId: true, // Backend adds this from req.user.id
}).extend({
  slug: z.string().max(150, "الرابط (slug) يجب أن لا يتجاوز 150 حرف"),
  imageFocalPoint: imageFocalPointSchema.nullable().optional(),
  seo: seoSchema,
  seoMetadata: seoMetadataSchema,
  sourceMetadata: sourceMetadataSchema,
});

// iFox Article Schemas - Accept categorySlug instead of categoryId
export const insertIFoxArticleSchema = z.object({
  title: z.string().min(10, "العنوان يجب أن يكون 10 أحرف على الأقل"),
  subtitle: z.string().optional(),
  slug: z.string().max(150, "الرابط (slug) يجب أن لا يتجاوز 150 حرف").optional(),
  content: z.string().min(100, "المحتوى يجب أن يكون 100 حرف على الأقل"),
  excerpt: z.string().min(50, "الوصف يجب أن يكون 50 حرف على الأقل"),
  categorySlug: z.string().min(1, "يرجى اختيار التصنيف"),
  imageUrl: z.string().url("رابط الصورة غير صحيح").optional(),
  status: z.enum(["draft", "published", "scheduled"]).default("draft"),
  publishedAt: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
  scheduledAt: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
  seo: z.object({
    metaTitle: z.string().max(70, "عنوان SEO يجب ألا يتجاوز 70 حرف").optional(),
    metaDescription: z.string().max(160, "وصف SEO يجب ألا يتجاوز 160 حرف").optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
  aiScore: z.number().min(0).max(100).optional(),
  sentimentScore: z.object({
    positive: z.number(),
    negative: z.number(),
    neutral: z.number(),
  }).nullable().optional(),
});

export const updateIFoxArticleSchema = z.object({
  title: z.string().min(10, "العنوان يجب أن يكون 10 أحرف على الأقل").optional(),
  subtitle: z.string().optional(),
  slug: z.string().max(150, "الرابط (slug) يجب أن لا يتجاوز 150 حرف").optional(),
  content: z.string().min(100, "المحتوى يجب أن يكون 100 حرف على الأقل").optional(),
  excerpt: z.string().min(50, "الوصف يجب أن يكون 50 حرف على الأقل").optional(),
  categorySlug: z.string().min(1, "يرجى اختيار التصنيف").optional(),
  imageUrl: z.string().url("رابط الصورة غير صحيح").optional(),
  status: z.enum(["draft", "published", "scheduled"]).optional(),
  publishedAt: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
  scheduledAt: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
  seo: z.object({
    metaTitle: z.string().max(70, "عنوان SEO يجب ألا يتجاوز 70 حرف").optional(),
    metaDescription: z.string().max(160, "وصف SEO يجب ألا يتجاوز 160 حرف").optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
  aiScore: z.number().min(0).max(100).optional(),
  sentimentScore: z.object({
    positive: z.number(),
    negative: z.number(),
    neutral: z.number(),
  }).nullable().optional(),
});

export const insertRssFeedSchema = createInsertSchema(rssFeeds).omit({ 
  id: true, 
  createdAt: true,
  lastFetchedAt: true,
});
export const insertCommentSchema = createInsertSchema(comments).omit({ 
  id: true, 
  createdAt: true,
  moderatedBy: true,
  moderatedAt: true,
  moderationReason: true,
});
// Comment sentiments schemas
export const insertCommentSentimentSchema = createInsertSchema(commentSentiments).omit({
  id: true,
  analyzedAt: true,
}).extend({
  rawMetadata: rawMetadataSchema,
});
export const insertReactionSchema = createInsertSchema(reactions).omit({ id: true, createdAt: true });
export const insertBookmarkSchema = createInsertSchema(bookmarks).omit({ id: true, createdAt: true });
export const insertCommentReactionSchema = createInsertSchema(commentReactions).omit({ id: true, createdAt: true });

// Muqtarab topic comments — same omit set as insertCommentSchema. likesCount is
// managed by the reaction routes, not the create path, so it's omitted too.
export const insertTopicCommentSchema = createInsertSchema(topicComments).omit({
  id: true,
  createdAt: true,
  moderatedBy: true,
  moderatedAt: true,
  moderationReason: true,
  likesCount: true,
});
export const insertTopicCommentReactionSchema = createInsertSchema(topicCommentReactions).omit({ id: true, createdAt: true });

// Focus mode reading sessions insert schema (Task #80)
// `startedAt` is left in so the guest-session sync route can backfill the
// original read timestamp; for the standard create flow it is left undefined
// and the column default (now()) is used.
export const insertFocusReadingSessionSchema = createInsertSchema(focusReadingSessions).omit({
  id: true,
}).extend({
  language: z.enum(["ar", "en", "ur"]).optional(),
  focusedSeconds: z.number().int().min(0).optional(),
  startedAt: z.coerce.date().optional(),
});

export const updateFocusReadingSessionSchema = z.object({
  focusedSeconds: z.number().int().min(0).optional(),
  endedAt: z.coerce.date().optional(),
  completed: z.boolean().optional(),
});

// NEW: Reading history insert schema (with enhanced tracking fields)
export const insertReadingHistorySchema = createInsertSchema(readingHistory).omit({
  id: true,
  readAt: true,
}).extend({
  scrollDepth: z.number().min(0).max(100).optional(),
  completionRate: z.number().min(0).max(100).optional(),
  engagementScore: z.number().min(0).max(1).optional(),
  deviceType: z.enum(["mobile", "tablet", "desktop"]).optional(),
  platform: z.enum(["ios", "android", "web"]).optional(),
  referrer: z.string().optional(),
});

// NEW: User preferences insert/update schema (with enhanced notification controls)
export const insertUserPreferenceSchema = createInsertSchema(userPreferences).omit({
  id: true,
  updatedAt: true,
}).extend({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  followingNotifications: z.boolean().optional(),
  preferredCategories: preferredCategoriesSchema,
  preferredAuthors: preferredAuthorsSchema,
  blockedCategories: blockedCategoriesSchema,
  recommendationFrequency: z.enum(["daily", "weekly", "never"]).default("daily"),
});
export const updateUserPreferenceSchema = insertUserPreferenceSchema.partial();

// NEW: Social follows insert schema
export const insertSocialFollowSchema = createInsertSchema(socialFollows).omit({
  id: true,
  createdAt: true,
}).extend({
  // Ensure user can't follow themselves
  followerId: z.string(),
  followingId: z.string(),
}).refine((data) => data.followerId !== data.followingId, {
  message: "لا يمكنك متابعة نفسك",
  path: ["followingId"],
});

export const insertInterestSchema = createInsertSchema(interests).omit({ id: true, createdAt: true });
export const insertUserInterestSchema = createInsertSchema(userInterests).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export const insertBehaviorLogSchema = createInsertSchema(behaviorLogs).omit({ id: true, createdAt: true }).extend({
  metadata: behaviorMetadataSchema,
});
export const insertSentimentScoreSchema = createInsertSchema(sentimentScores).omit({ id: true, createdAt: true }).extend({
  emotionalBreakdown: emotionalBreakdownSchema,
});
export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
}).extend({
  value: systemSettingsValueSchema,
});
export const insertThemeSchema = createInsertSchema(themes).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  version: true,
}).extend({
  // Override dates to accept null, empty strings, undefined, or valid datetime
  startAt: z.union([z.null(), z.literal(''), z.undefined(), z.string().datetime()]).optional(),
  endAt: z.union([z.null(), z.literal(''), z.undefined(), z.string().datetime()]).optional(),
  // Override assets to accept null, empty strings, undefined, or valid URLs
  assets: z.object({
    logoLight: z.union([z.null(), z.literal(''), z.undefined(), z.string().url()]).optional(),
    logoDark: z.union([z.null(), z.literal(''), z.undefined(), z.string().url()]).optional(),
    favicon: z.union([z.null(), z.literal(''), z.undefined(), z.string().url()]).optional(),
    banner: z.union([z.null(), z.literal(''), z.undefined(), z.string().url()]).optional(),
    ogImage: z.union([z.null(), z.literal(''), z.undefined(), z.string().url()]).optional(),
  }).optional().nullable(),
});
export const updateThemeSchema = z.object({
  name: z.string().min(2).optional(),
  slug: z.string().min(2).optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().int().min(0).max(9999).optional(),
  status: z.enum(["draft", "review", "scheduled", "active", "expired", "disabled"]).optional(),
  startAt: z.union([z.literal(''), z.null(), z.undefined(), z.string().datetime()]).optional(),
  endAt: z.union([z.literal(''), z.null(), z.undefined(), z.string().datetime()]).optional(),
  assets: z.object({
    logoLight: z.union([z.literal(''), z.null(), z.undefined(), z.string().url()]).optional(),
    logoDark: z.union([z.literal(''), z.null(), z.undefined(), z.string().url()]).optional(),
    favicon: z.union([z.literal(''), z.null(), z.undefined(), z.string().url()]).optional(),
    banner: z.union([z.literal(''), z.null(), z.undefined(), z.string().url()]).optional(),
    ogImage: z.union([z.literal(''), z.null(), z.undefined(), z.string().url()]).optional(),
  }).optional().nullable(),
  tokens: z.object({
    colors: z.record(z.string()).optional(),
    fonts: z.record(z.string()).optional(),
    spacing: z.record(z.string()).optional(),
    borderRadius: z.record(z.string()).optional(),
  }).optional(),
  applyTo: z.array(z.string()).optional(),
  approvedBy: z.union([z.string(), z.null()]).optional(),
  publishedBy: z.union([z.string(), z.null()]).optional(),
});
export const insertThemeAuditLogSchema = createInsertSchema(themeAuditLog).omit({ id: true, createdAt: true }).extend({
  changes: themeAuditChangesSchema,
  metadata: themeAuditMetadataSchema,
});

export const insertRoleSchema = createInsertSchema(roles).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({ id: true, createdAt: true });

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true, createdAt: true });

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({ 
  id: true, 
  assignedAt: true 
});

export const insertUserPermissionOverrideSchema = createInsertSchema(userPermissionOverrides).omit({ 
  id: true, 
  grantedAt: true 
});

export const insertStaffSchema = createInsertSchema(staff).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  publishedCount: true,
  totalViews: true,
  lastActiveAt: true,
});

export const updateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().min(2).optional(),
  title: z.string().optional(),
  titleAr: z.string().optional(),
  bio: z.string().optional(),
  bioAr: z.string().optional(),
  profileImage: z.string().url().optional(),
  staffType: z.enum(["reporter", "writer", "supervisor"]).optional(),
  specializations: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true }).extend({
  oldValue: activityLogValueSchema,
  newValue: activityLogValueSchema,
  metadata: activityLogMetadataSchema,
});

export const insertNotificationTemplateSchema = createInsertSchema(notificationTemplates).omit({ 
  id: true, 
  createdAt: true 
}).extend({
  config: notificationTemplateContentSchema,
});

export const insertUserNotificationPrefsSchema = createInsertSchema(userNotificationPrefs).omit({ 
  id: true, 
  updatedAt: true 
});

export const updateUserNotificationPrefsSchema = z.object({
  breaking: z.boolean().optional(),
  interest: z.boolean().optional(),
  likedUpdates: z.boolean().optional(),
  mostRead: z.boolean().optional(),
  webPush: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "صيغة الوقت غير صحيحة").optional(),
  quietHoursEnd: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "صيغة الوقت غير صحيحة").optional(),
  whatsappPhone: z.union([
    z.string()
      .transform(val => {
        if (!val) return null;
        const digitsOnly = val.replace(/[^0-9]/g, "");
        if (!digitsOnly) return null;
        return '+' + digitsOnly;
      })
      .refine(val => {
        if (val === null) return true;
        const digits = val.replace(/[^0-9]/g, "");
        return digits.length >= 10 && digits.length <= 15;
      }, "رقم الهاتف غير صحيح - يجب أن يحتوي على 10-15 رقم"),
    z.null(),
  ]).optional(),
  whatsappEnabled: z.boolean().optional(),
});

export const insertNotificationQueueSchema = createInsertSchema(notificationQueue).omit({ 
  id: true, 
  createdAt: true,
  sentAt: true,
  errorMessage: true,
});

export const insertNotificationsInboxSchema = createInsertSchema(notificationsInbox).omit({ 
  id: true, 
  createdAt: true 
});

export const insertNotificationMetricsSchema = createInsertSchema(notificationMetrics).omit({ 
  id: true, 
  createdAt: true,
  openedAt: true,
  clickedAt: true,
  dismissedAt: true,
});

export const insertUserLoyaltyEventSchema = createInsertSchema(userLoyaltyEvents).omit({ 
  id: true, 
  createdAt: true 
}).extend({
  payload: loyaltyPayloadSchema,
  metadata: loyaltyMetadataSchema,
});

export const insertUserPointsTotalSchema = createInsertSchema(userPointsTotal).omit({ 
  createdAt: true, 
  updatedAt: true 
}).extend({
  rankLevel: z.number().int().min(1).max(4).optional(), // Validate rankLevel is between 1-4
});

export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({ 
  id: true, 
  createdAt: true 
}).extend({
  rewardData: rewardDataSchema,
});

export const insertUserRewardsHistorySchema = createInsertSchema(userRewardsHistory).omit({ 
  id: true, 
  redeemedAt: true,
  deliveredAt: true,
}).extend({
  rewardSnapshot: rewardSnapshotSchema,
  deliveryData: deliveryDataSchema,
});

export const insertLoyaltyCampaignSchema = createInsertSchema(loyaltyCampaigns).omit({ 
  id: true, 
  createdAt: true 
});

export const insertSectionSchema = createInsertSchema(sections).omit({ 
  id: true, 
  createdAt: true 
});

export const insertAngleSchema = createInsertSchema(angles).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertArticleAngleSchema = createInsertSchema(articleAngles).omit({ 
  createdAt: true 
});

export const insertTopicSchema = createInsertSchema(topics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  // حقول المراجعة تُدار حصراً عبر مسارات الإرسال/المراجعة في الخادم
  submittedAt: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
}).extend({
  status: topicStatusEnum.default("draft"),
  content: topicContentSchema,
  attachments: topicAttachmentsSchema,
  seoMeta: topicSeoMetaSchema,
});

export const updateTopicSchema = insertTopicSchema.partial().extend({
  updatedBy: z.string(),
});

export const insertImageAssetSchema = createInsertSchema(imageAssets).omit({ 
  id: true, 
  createdAt: true 
});

export const insertTagSchema = createInsertSchema(tags).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  usageCount: true,
});

export const updateTagSchema = z.object({
  nameAr: z.string().min(2, "الاسم بالعربية يجب أن يكون حرفين على الأقل").optional(),
  nameEn: z.string().min(2, "الاسم بالإنجليزية يجب أن يكون حرفين على الأقل").optional(),
  slug: z.string().min(2).optional(),
  description: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]).optional(),
});

export const insertArticleTagSchema = createInsertSchema(articleTags).omit({ 
  createdAt: true 
});

export const insertUserFollowedTermSchema = createInsertSchema(userFollowedTerms).omit({
  id: true,
  createdAt: true,
});

// Recommendation system schemas
export const insertUserEventSchema = createInsertSchema(userEvents).omit({ 
  id: true, 
  createdAt: true 
});

export const insertUserAffinitySchema = createInsertSchema(userAffinities).omit({ 
  updatedAt: true 
});

export const insertContentVectorSchema = createInsertSchema(contentVectors).omit({ 
  createdAt: true, 
  updatedAt: true 
});

// Article Impressions schemas
export const insertArticleImpressionSchema = createInsertSchema(articleImpressions).omit({ 
  id: true, 
  createdAt: true 
});

// Feed Recommendations schemas
export const insertFeedRecommendationSchema = createInsertSchema(feedRecommendations).omit({ 
  id: true, 
  createdAt: true 
});

export const insertRecommendationLogSchema = createInsertSchema(recommendationLog).omit({ 
  id: true, 
  sentAt: true 
});

export const insertUserRecommendationPrefsSchema = createInsertSchema(userRecommendationPrefs).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const updateUserRecommendationPrefsSchema = z.object({
  becauseYouLiked: z.boolean().optional(),
  similarToSaved: z.boolean().optional(),
  withinReads: z.boolean().optional(),
  trendingForYou: z.boolean().optional(),
  dailyDigest: z.boolean().optional(),
  digestTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "صيغة الوقت غير صحيحة").optional(),
  maxDailyPersonal: z.number().int().min(0).max(10).optional(),
  cooldownHours: z.number().int().min(1).max(24).optional(),
  abTestGroup: z.string().optional(),
});

export const insertRecommendationMetricsSchema = createInsertSchema(recommendationMetrics).omit({ 
  id: true, 
  createdAt: true,
  viewedAt: true,
  clickedAt: true,
  readAt: true,
});

// Story tracking schemas
export const insertStorySchema = createInsertSchema(stories).omit({ 
  id: true, 
  createdAt: true 
});

export const insertStoryLinkSchema = createInsertSchema(storyLinks).omit({ 
  id: true, 
  createdAt: true 
});

export const insertStoryFollowSchema = createInsertSchema(storyFollows).omit({ 
  id: true, 
  createdAt: true,
  updatedAt: true,
});

export const insertStoryNotificationSchema = createInsertSchema(storyNotifications).omit({ 
  id: true, 
  createdAt: true 
});

export const updateArticleSchema = z.object({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل").optional(),
  subtitle: z.string().max(120, "العنوان الفرعي يجب ألا يتجاوز 120 حرف").optional(),
  slug: z.string().min(3).max(150, "الرابط (slug) يجب أن لا يتجاوز 150 حرف").optional(),
  content: z.string().min(10, "المحتوى يجب أن يكون 10 أحرف على الأقل").optional(),
  excerpt: z.string().optional(),
  imageUrl: z.union([
    z.string().url("رابط الصورة غير صحيح"),
    z.string().startsWith("/", "رابط الصورة غير صحيح"),
    z.literal("")
  ]).optional(),
  thumbnailUrl: z.union([
    z.string().url("رابط الصورة المصغرة غير صحيح"),
    z.string().startsWith("/", "رابط الصورة المصغرة غير صحيح"),
    z.literal("")
  ]).optional(),
  thumbnailManuallyDeleted: z.boolean().optional(),
  isAiGeneratedImage: z.boolean().optional(),
  albumImages: z.array(z.string()).optional(),
  imageFocalPoint: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }).nullable().optional(),
  categoryId: z.union([
    z.string().uuid("معرف التصنيف غير صحيح"),
    z.literal(""),
    z.null()
  ]).optional(),
  reporterId: z.union([
    z.string().min(1, "معرف المراسل غير صحيح"),
    z.null()
  ]).optional(),
  articleType: z.enum(["news", "opinion", "analysis", "column", "infographic", "weekly_photos"]).optional(),
  weeklyPhotosData: weeklyPhotosDataSchema,
  newsType: z.enum(["breaking", "featured", "regular"]).optional(),
  publishType: z.enum(["instant", "scheduled"]).optional(),
  scheduledAt: z.union([
    z.string().datetime(),
    z.null()
  ]).optional(),
  status: z.enum(["draft", "scheduled", "published", "archived"]).optional(),
  aiSummary: z.union([
    z.string(),
    z.null()
  ]).optional(),
  isFeatured: z.boolean().optional(),
  hideFromHomepage: z.boolean().optional(),
  publishedAt: z.union([
    z.string().datetime(),
    z.null()
  ]).optional(),
  seo: z.object({
    metaTitle: z.union([
      z.string().max(70, "عنوان SEO يجب ألا يتجاوز 70 حرف"),
      z.literal("")
    ]).optional(),
    metaDescription: z.union([
      z.string().max(160, "وصف SEO يجب ألا يتجاوز 160 حرف"),
      z.literal("")
    ]).optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),
  // Video Template fields
  isVideoTemplate: z.boolean().optional(),
  videoUrl: z.union([
    z.string().url("رابط الفيديو غير صحيح"),
    z.string().startsWith("/", "رابط الفيديو غير صحيح"),
    z.literal(""),
    z.null()
  ]).optional(),
  videoThumbnailUrl: z.union([
    z.string().url("رابط صورة الفيديو غير صحيح"),
    z.string().startsWith("/", "رابط صورة الفيديو غير صحيح"),
    z.literal(""),
    z.null()
  ]).optional(),
  // Infographic fields
  infographicBannerUrl: z.union([
    z.string().url("رابط بانر الإنفوجرافيك غير صحيح"),
    z.string().startsWith("/", "رابط بانر الإنفوجرافيك غير صحيح"),
    z.literal(""),
    z.null()
  ]).optional(),
  isAiGeneratedInfographicBanner: z.boolean().optional(),
  infographicType: z.enum(["image", "data"]).optional(),
  infographicData: z.object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
    sections: z.array(z.object({
      id: z.string(),
      title: z.string(),
      value: z.string(),
      unit: z.string().optional(),
      description: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
    })).optional(),
    sources: z.array(z.string()).optional(),
    lastUpdated: z.string().optional(),
  }).nullable().optional(),
  // Editorial review fields. Without these here, Zod's `.strict()`-like
  // strip behavior silently drops them from PATCH bodies — which means
  // archive/rejection/needs-revision reasons never make it to the DB or
  // the editorial notification payload.
  reviewStatus: z.union([
    z.enum(["pending_review", "approved", "rejected", "needs_changes"]),
    z.null(),
  ]).optional(),
  reviewNotes: z.union([z.string(), z.null()]).optional(),
});

export const adminArticleFiltersSchema = z.object({
  status: z.enum(["draft", "scheduled", "published", "archived", "all"]).optional(),
  articleType: z.enum(["news", "opinion", "analysis", "column", "infographic", "weekly_photos", "all"]).optional(),
  categoryId: z.string().uuid().optional(),
  authorId: z.string().optional(),
  search: z.string().optional(),
  featured: z.boolean().optional(),
});

export const updateCommentStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "flagged"]),
  moderationReason: z.string().optional(),
});

export const updateRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().min(1, "معرف الصلاحية غير صحيح")),
});

// Activity type for unified timeline
export const ActivitySchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "article_published","article_updated","breaking_news",
    "comment_added","reaction_added","bookmark_added",
    "category_created","tag_created",
    "user_registered","role_changed"
  ]),
  occurredAt: z.string().datetime(),
  actor: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    avatarUrl: z.string().url().optional()
  }).optional(),
  target: z.object({
    id: z.string().optional(),
    kind: z.enum(["article","category","tag","user"]).optional(),
    title: z.string().optional(),
    slug: z.string().optional(),
    url: z.string().url().optional(),
    imageUrl: z.string().url().optional()
  }).optional(),
  importance: z.enum(["low","normal","high","urgent"]).default("normal"),
  summary: z.string().optional()
});

export type Activity = z.infer<typeof ActivitySchema>;

// TypeScript types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type AdminCreateUser = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUser = z.infer<typeof adminUpdateUserSchema>;
export type AdminUpdateUserRoles = z.infer<typeof adminUpdateUserRolesSchema>;

export type Category = typeof categories.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;

export type CategoryPulseLevel = "calm" | "normal" | "active" | "hot";

export type CategoryWithStats = Category & {
  articleCount: number;
  totalViews: number;
  totalLikes: number;
  totalBookmarks: number;
  pulsePercent: number | null;
  pulseLevel: CategoryPulseLevel;
  hasPulseData: boolean;
};

export type Article = typeof articles.$inferSelect;
export type InsertArticle = z.infer<typeof insertArticleSchema>;
export type UpdateArticle = z.infer<typeof updateArticleSchema>;
export type AdminArticleFilters = z.infer<typeof adminArticleFiltersSchema>;

export type RssFeed = typeof rssFeeds.$inferSelect;
export type InsertRssFeed = z.infer<typeof insertRssFeedSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type InsertCommentSentiment = z.infer<typeof insertCommentSentimentSchema>;
export type CommentSentiment = typeof commentSentiments.$inferSelect;

export type Reaction = typeof reactions.$inferSelect;
export type InsertReaction = z.infer<typeof insertReactionSchema>;

export type Bookmark = typeof bookmarks.$inferSelect;
export type InsertBookmark = z.infer<typeof insertBookmarkSchema>;

export type ReadingHistory = typeof readingHistory.$inferSelect;
export type InsertReadingHistory = z.infer<typeof insertReadingHistorySchema>;

export type FocusReadingSession = typeof focusReadingSessions.$inferSelect;
export type InsertFocusReadingSession = z.infer<typeof insertFocusReadingSessionSchema>;
export type UpdateFocusReadingSession = z.infer<typeof updateFocusReadingSessionSchema>;

export type DismissedContinueReading = typeof dismissedContinueReading.$inferSelect;

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = z.infer<typeof insertUserPreferenceSchema>;
export type UpdateUserPreference = z.infer<typeof updateUserPreferenceSchema>;

export type SocialFollow = typeof socialFollows.$inferSelect;
export type InsertSocialFollow = z.infer<typeof insertSocialFollowSchema>;

export type Interest = typeof interests.$inferSelect;
export type InsertInterest = z.infer<typeof insertInterestSchema>;

export type UserInterest = typeof userInterests.$inferSelect;
export type InsertUserInterest = z.infer<typeof insertUserInterestSchema>;

export type UserSegmentDefinition = typeof userSegmentDefinitions.$inferSelect;
export type InsertUserSegmentDefinition = typeof userSegmentDefinitions.$inferInsert;

export type UserSegmentAssignment = typeof userSegmentAssignments.$inferSelect;
export type InsertUserSegmentAssignment = typeof userSegmentAssignments.$inferInsert;

export type UserActivitySummary = typeof userActivitySummary.$inferSelect;
export type InsertUserActivitySummary = typeof userActivitySummary.$inferInsert;

export type BehaviorLog = typeof behaviorLogs.$inferSelect;
export type InsertBehaviorLog = z.infer<typeof insertBehaviorLogSchema>;

export type SentimentScore = typeof sentimentScores.$inferSelect;
export type InsertSentimentScore = z.infer<typeof insertSentimentScoreSchema>;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

export type Theme = typeof themes.$inferSelect;
export type InsertTheme = z.infer<typeof insertThemeSchema>;
export type UpdateTheme = z.infer<typeof updateThemeSchema>;

export type ThemeAuditLog = typeof themeAuditLog.$inferSelect;
export type InsertThemeAuditLog = z.infer<typeof insertThemeAuditLogSchema>;

export type Role = typeof roles.$inferSelect;
export type InsertRole = z.infer<typeof insertRoleSchema>;

export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;

export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;

export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;

export type UserPermissionOverride = typeof userPermissionOverrides.$inferSelect;
export type InsertUserPermissionOverride = z.infer<typeof insertUserPermissionOverrideSchema>;

export type Staff = typeof staff.$inferSelect;
export type InsertStaff = z.infer<typeof insertStaffSchema>;
export type UpdateStaff = z.infer<typeof updateStaffSchema>;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

export type NotificationTemplate = typeof notificationTemplates.$inferSelect;
export type InsertNotificationTemplate = z.infer<typeof insertNotificationTemplateSchema>;

export type UserNotificationPrefs = typeof userNotificationPrefs.$inferSelect;
export type InsertUserNotificationPrefs = z.infer<typeof insertUserNotificationPrefsSchema>;
export type UpdateUserNotificationPrefs = z.infer<typeof updateUserNotificationPrefsSchema>;

export type NotificationQueue = typeof notificationQueue.$inferSelect;
export type InsertNotificationQueue = z.infer<typeof insertNotificationQueueSchema>;

export type NotificationsInbox = typeof notificationsInbox.$inferSelect;
export type InsertNotificationsInbox = z.infer<typeof insertNotificationsInboxSchema>;

export type NotificationInbox = typeof notificationsInbox.$inferSelect;
export type InsertNotificationInbox = z.infer<typeof insertNotificationsInboxSchema>;

export type NotificationMetrics = typeof notificationMetrics.$inferSelect;
export type InsertNotificationMetrics = z.infer<typeof insertNotificationMetricsSchema>;

// Recommendation system types
export type UserEvent = typeof userEvents.$inferSelect;
export type InsertUserEvent = z.infer<typeof insertUserEventSchema>;

export type UserAffinity = typeof userAffinities.$inferSelect;
export type InsertUserAffinity = z.infer<typeof insertUserAffinitySchema>;

export type ContentVector = typeof contentVectors.$inferSelect;
export type InsertContentVector = z.infer<typeof insertContentVectorSchema>;

export type ArticleImpression = typeof articleImpressions.$inferSelect;
export type InsertArticleImpression = z.infer<typeof insertArticleImpressionSchema>;

export type FeedRecommendation = typeof feedRecommendations.$inferSelect;
export type InsertFeedRecommendation = z.infer<typeof insertFeedRecommendationSchema>;

export type RecommendationLog = typeof recommendationLog.$inferSelect;
export type InsertRecommendationLog = z.infer<typeof insertRecommendationLogSchema>;

export type UserRecommendationPrefs = typeof userRecommendationPrefs.$inferSelect;
export type InsertUserRecommendationPrefs = z.infer<typeof insertUserRecommendationPrefsSchema>;
export type UpdateUserRecommendationPrefs = z.infer<typeof updateUserRecommendationPrefsSchema>;

export type RecommendationMetrics = typeof recommendationMetrics.$inferSelect;
export type InsertRecommendationMetrics = z.infer<typeof insertRecommendationMetricsSchema>;

export type UpdateCommentStatus = z.infer<typeof updateCommentStatusSchema>;
export type UpdateRolePermissions = z.infer<typeof updateRolePermissionsSchema>;

// Extended types with joins for frontend
export type ArticleWithDetails = Article & {
  category?: Category;
  author?: User;
  opinionAuthor?: User;
  staff?: {
    id: string;
    nameAr: string;
    slug: string;
    profileImage: string | null;
    isVerified: boolean;
  };
  commentsCount?: number;
  reactionsCount?: number;
  isBookmarked?: boolean;
  hasReacted?: boolean;
  storyId?: string;
  storyTitle?: string;
  hasPoll?: boolean;
};

export type CommentWithUser = Comment & {
  user: User;
  replies?: CommentWithUser[];
  moderator?: User;
  // Injected client-side from the per-user /my-likes overlay (never part of the
  // shared cacheable payload — see per-user-data-shared-cache-trap).
  hasLiked?: boolean;
};

export type TopicComment = typeof topicComments.$inferSelect;
export type InsertTopicComment = z.infer<typeof insertTopicCommentSchema>;
export type CommentReaction = typeof commentReactions.$inferSelect;
export type TopicCommentReaction = typeof topicCommentReactions.$inferSelect;

export type TopicCommentWithUser = TopicComment & {
  user: User;
  replies?: TopicCommentWithUser[];
  moderator?: User;
  hasLiked?: boolean;
};

// Minimal structural shape the shared <CommentSection> renders, so one
// component can display both article comments and Muqtarab topic comments.
// Both CommentWithUser and TopicCommentWithUser are assignable to it.
export type DisplayComment = {
  id: string;
  content: string;
  status: string;
  parentId?: string | null;
  createdAt: Date | string;
  likesCount?: number;
  hasLiked?: boolean;
  aiClassification?: string | null;
  moderationReason?: string | null;
  user: User;
  replies?: DisplayComment[];
};

export type RoleWithPermissions = Role & {
  permissions: Permission[];
  userCount?: number;
};

export type StaffWithUser = Staff & {
  user?: User;
  role?: Role;
};

export type ReporterArticle = {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  publishedAt: Date | null;
  category: {
    name: string;
    slug: string;
    color: string | null;
    icon: string | null;
  } | null;
  isBreaking: boolean;
  views: number;
  likes: number;
  comments: number;
  readingTime: number;
};

export type ReporterTopCategory = {
  name: string;
  slug: string;
  color: string | null;
  articles: number;
  views: number;
  sharePct: number;
};

export type ReporterTimeseries = {
  date: string;
  views: number;
  likes: number;
};

export type ReporterProfile = {
  userId: string;
  id: string;
  slug: string;
  fullName: string;
  title: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isVerified: boolean;
  tags: string[];
  kpis: {
    totalArticles: number;
    totalViews: number;
    totalLikes: number;
    avgReadTimeMin: number;
    avgCompletionRate: number;
    followers: number;
  };
  lastArticles: ReporterArticle[];
  topCategories: ReporterTopCategory[];
  timeseries: {
    windowDays: number;
    daily: ReporterTimeseries[];
  };
  badges: Array<{
    key: string;
    label: string;
  }>;
};

export type InterestWithWeight = Interest & {
  weight: number;
};

export type StoryWithDetails = Story & {
  rootArticle?: Article;
  articlesCount?: number;
  followersCount?: number;
  isFollowing?: boolean;
};

export type StoryLinkWithArticle = StoryLink & {
  article?: ArticleWithDetails;
};

export type UserProfile = User & {
  interests?: InterestWithWeight[];
  behaviorSummary?: {
    last7Days: {
      clicks: Record<string, number>;
      avgReadTime: Record<string, number>;
      searches: string[];
      interactions: {
        shares: number;
        comments: number;
        likes: number;
      };
    };
  };
  sentimentProfile?: {
    overallScore: number;
    emotionalBreakdown: {
      enthusiasm: number;
      satisfaction: number;
      anger: number;
      sadness: number;
      neutral: number;
    };
    trendingSentiments: string[];
  };
};

export type UserLoyaltyEvent = typeof userLoyaltyEvents.$inferSelect;
export type InsertUserLoyaltyEvent = z.infer<typeof insertUserLoyaltyEventSchema>;

export type UserPointsTotal = typeof userPointsTotal.$inferSelect;
export type InsertUserPointsTotal = z.infer<typeof insertUserPointsTotalSchema>;

export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;

export type UserRewardsHistory = typeof userRewardsHistory.$inferSelect;
export type InsertUserRewardsHistory = z.infer<typeof insertUserRewardsHistorySchema>;

export type LoyaltyCampaign = typeof loyaltyCampaigns.$inferSelect;
export type InsertLoyaltyCampaign = z.infer<typeof insertLoyaltyCampaignSchema>;

export type Section = typeof sections.$inferSelect;
export type InsertSection = z.infer<typeof insertSectionSchema>;

export type Angle = typeof angles.$inferSelect;
export type InsertAngle = z.infer<typeof insertAngleSchema>;

export type ArticleAngle = typeof articleAngles.$inferSelect;
export type InsertArticleAngle = z.infer<typeof insertArticleAngleSchema>;

export type Topic = typeof topics.$inferSelect;
export type InsertTopic = z.infer<typeof insertTopicSchema>;
export type UpdateTopic = z.infer<typeof updateTopicSchema>;

export type ImageAsset = typeof imageAssets.$inferSelect;
export type InsertImageAsset = z.infer<typeof insertImageAssetSchema>;

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type UpdateTag = z.infer<typeof updateTagSchema>;

export type ArticleTag = typeof articleTags.$inferSelect;
export type InsertArticleTag = z.infer<typeof insertArticleTagSchema>;

export type UserFollowedTerm = typeof userFollowedTerms.$inferSelect;
export type InsertUserFollowedTerm = z.infer<typeof insertUserFollowedTermSchema>;

// Story tracking types
export type Story = typeof stories.$inferSelect;
export type InsertStory = z.infer<typeof insertStorySchema>;

export type StoryLink = typeof storyLinks.$inferSelect;
export type InsertStoryLink = z.infer<typeof insertStoryLinkSchema>;

export type StoryFollow = typeof storyFollows.$inferSelect;
export type InsertStoryFollow = z.infer<typeof insertStoryFollowSchema>;

export type StoryNotification = typeof storyNotifications.$inferSelect;
export type InsertStoryNotification = z.infer<typeof insertStoryNotificationSchema>;

// Drizzle Relations
export const sectionsRelations = relations(sections, ({ many }) => ({
  angles: many(angles),
}));

export const anglesRelations = relations(angles, ({ one, many }) => ({
  section: one(sections, {
    fields: [angles.sectionId],
    references: [sections.id],
  }),
  manager: one(users, {
    fields: [angles.managerUserId],
    references: [users.id],
  }),
  articleAngles: many(articleAngles),
  topics: many(topics),
}));

export const topicsRelations = relations(topics, ({ one }) => ({
  angle: one(angles, {
    fields: [topics.angleId],
    references: [angles.id],
  }),
  creator: one(users, {
    fields: [topics.createdBy],
    references: [users.id],
    relationName: "topicCreator",
  }),
  updater: one(users, {
    fields: [topics.updatedBy],
    references: [users.id],
    relationName: "topicUpdater",
  }),
}));

export const articlesRelations = relations(articles, ({ many }) => ({
  articleAngles: many(articleAngles),
  articleTags: many(articleTags),
}));

export const articleAnglesRelations = relations(articleAngles, ({ one }) => ({
  article: one(articles, {
    fields: [articleAngles.articleId],
    references: [articles.id],
  }),
  angle: one(angles, {
    fields: [articleAngles.angleId],
    references: [angles.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  articleTags: many(articleTags),
  userFollowedTerms: many(userFollowedTerms),
}));

export const articleTagsRelations = relations(articleTags, ({ one }) => ({
  article: one(articles, {
    fields: [articleTags.articleId],
    references: [articles.id],
  }),
  tag: one(tags, {
    fields: [articleTags.tagId],
    references: [tags.id],
  }),
}));

export const userFollowedTermsRelations = relations(userFollowedTerms, ({ one }) => ({
  user: one(users, {
    fields: [userFollowedTerms.userId],
    references: [users.id],
  }),
  tag: one(tags, {
    fields: [userFollowedTerms.tagId],
    references: [tags.id],
  }),
}));

export const socialFollowsRelations = relations(socialFollows, ({ one }) => ({
  follower: one(users, {
    fields: [socialFollows.followerId],
    references: [users.id],
  }),
  following: one(users, {
    fields: [socialFollows.followingId],
    references: [users.id],
  }),
}));

// ============================================================
// User Status Helper Functions
// ============================================================

export type UserStatus = "active" | "pending" | "suspended" | "banned" | "locked" | "deleted";

export function getUserEffectiveStatus(user: User): UserStatus {
  const now = new Date();
  
  // Priority 1: Deleted (soft delete)
  if (user.deletedAt) {
    return "deleted";
  }
  
  // Priority 2: Banned (permanent or temporary)
  if (user.status === "banned") {
    if (user.bannedUntil && user.bannedUntil > now) {
      return "banned";
    } else if (!user.bannedUntil) {
      // Permanent ban
      return "banned";
    }
    // Temporary ban expired - continue checking other statuses
  }
  
  // Priority 3: Suspended (temporary)
  if (user.status === "suspended") {
    if (user.suspendedUntil && user.suspendedUntil > now) {
      return "suspended";
    }
    // Suspension expired - continue checking other statuses
  }
  
  // Priority 4: Account locked (security)
  if (user.accountLocked) {
    if (user.lockedUntil && user.lockedUntil > now) {
      return "locked";
    }
    // Lock expired - continue checking other statuses
  }
  
  // Priority 5: Pending (email not verified)
  if (!user.emailVerified) {
    return "pending";
  }
  
  // Default: Active
  return "active";
}

export function canUserInteract(user: User): boolean {
  const status = getUserEffectiveStatus(user);
  return status === "active";
}

export function canUserLogin(user: User): boolean {
  const status = getUserEffectiveStatus(user);
  return status !== "banned" && status !== "deleted";
}

export function getUserStatusMessage(user: User): string | null {
  const status = getUserEffectiveStatus(user);
  
  switch (status) {
    case "banned":
      if (user.bannedUntil) {
        return `حسابك محظور حتى ${user.bannedUntil.toLocaleDateString('ar-SA')}. السبب: ${user.banReason || 'غير محدد'}`;
      }
      return `حسابك محظور بشكل دائم. السبب: ${user.banReason || 'غير محدد'}`;
    
    case "suspended":
      if (user.suspendedUntil) {
        return `حسابك معلق حتى ${user.suspendedUntil.toLocaleDateString('ar-SA')}. السبب: ${user.suspensionReason || 'غير محدد'}`;
      }
      return `حسابك معلق. السبب: ${user.suspensionReason || 'غير محدد'}`;
    
    case "locked":
      if (user.lockedUntil) {
        return `حسابك مقفل مؤقتاً حتى ${user.lockedUntil.toLocaleDateString('ar-SA')} بسبب محاولات دخول فاشلة متعددة.`;
      }
      return `حسابك مقفل بسبب محاولات دخول فاشلة متعددة. يرجى التواصل مع الإدارة.`;
    
    case "pending":
      return `يرجى تفعيل حسابك عبر البريد الإلكتروني أولاً`;
    
    case "deleted":
      return `هذا الحساب محذوف.`;
    
    default:
      return null;
  }
}

// ============================================================================
// A/B Testing System
// ============================================================================

// Experiments - تجارب A/B
export const experiments = pgTable("experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  
  // نوع التجربة: headline, image, layout, cta
  testType: text("test_type").notNull(), // headline, image, layout, cta, mixed
  
  // اختياري - إذا كانت التجربة مرتبطة بخبر معين
  articleId: varchar("article_id").references(() => articles.id),
  
  // الحالة: draft, running, paused, completed, archived
  status: text("status").default("draft").notNull(),
  
  // معايير النجاح
  successMetric: text("success_metric").notNull(), // ctr, read_time, engagement, conversions
  
  // الفائز (يتم تحديده تلقائياً أو يدوياً)
  winnerVariantId: varchar("winner_variant_id"),
  
  // التوقيتات
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  
  // الإحصائيات السريعة (cached)
  totalExposures: integer("total_exposures").default(0).notNull(),
  totalConversions: integer("total_conversions").default(0).notNull(),
  
  // من أنشأ التجربة
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Experiment Variants - الخيارات المختلفة (A, B, C...)
export const experimentVariants = pgTable("experiment_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  
  // اسم الـ variant (A, B, C, Control...)
  name: text("name").notNull(),
  
  // هل هذا الـ control variant (الأصلي)
  isControl: boolean("is_control").default(false).notNull(),
  
  // نسبة الزيارات الموجهة لهذا الـ variant (%)
  trafficAllocation: integer("traffic_allocation").default(50).notNull(),
  
  // البيانات المتغيرة (headline, imageUrl, etc.)
  variantData: jsonb("variant_data").$type<{
    headline?: string;
    imageUrl?: string;
    excerpt?: string;
    ctaText?: string;
    layout?: string;
  }>().notNull(),
  
  // إحصائيات سريعة (cached)
  exposures: integer("exposures").default(0).notNull(),
  conversions: integer("conversions").default(0).notNull(),
  conversionRate: real("conversion_rate").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Experiment Exposures - تتبع من شاف أي variant
export const experimentExposures = pgTable("experiment_exposures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  variantId: varchar("variant_id").references(() => experimentVariants.id).notNull(),
  
  // المستخدم (nullable للزوار الغير مسجلين)
  userId: varchar("user_id").references(() => users.id),
  
  // Session ID للتتبع
  sessionId: text("session_id").notNull(),
  
  // معلومات إضافية
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  
  exposedAt: timestamp("exposed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_exposures_experiment").on(table.experimentId),
  index("idx_exposures_variant").on(table.variantId),
  index("idx_exposures_user").on(table.userId),
  index("idx_exposures_session").on(table.sessionId),
]);

// Experiment Conversions - تتبع التحويلات (clicks, reads, likes, etc.)
export const experimentConversions = pgTable("experiment_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  variantId: varchar("variant_id").references(() => experimentVariants.id).notNull(),
  exposureId: varchar("exposure_id").references(() => experimentExposures.id).notNull(),
  
  // نوع التحويل: click, read, like, share, comment, bookmark
  conversionType: text("conversion_type").notNull(),
  
  // القيمة (مثلاً: وقت القراءة بالثواني)
  value: real("value"),
  
  // معلومات إضافية
  metadata: jsonb("metadata").$type<{
    readDuration?: number;
    scrollDepth?: number;
    shareDestination?: string;
  }>(),
  
  convertedAt: timestamp("converted_at").defaultNow().notNull(),
}, (table) => [
  index("idx_conversions_experiment").on(table.experimentId),
  index("idx_conversions_variant").on(table.variantId),
  index("idx_conversions_exposure").on(table.exposureId),
  index("idx_conversions_type").on(table.conversionType),
]);

// Relations for A/B Testing
export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  article: one(articles, {
    fields: [experiments.articleId],
    references: [articles.id],
  }),
  creator: one(users, {
    fields: [experiments.createdBy],
    references: [users.id],
  }),
  variants: many(experimentVariants),
  exposures: many(experimentExposures),
  conversions: many(experimentConversions),
}));

export const experimentVariantsRelations = relations(experimentVariants, ({ one, many }) => ({
  experiment: one(experiments, {
    fields: [experimentVariants.experimentId],
    references: [experiments.id],
  }),
  exposures: many(experimentExposures),
  conversions: many(experimentConversions),
}));

export const experimentExposuresRelations = relations(experimentExposures, ({ one, many }) => ({
  experiment: one(experiments, {
    fields: [experimentExposures.experimentId],
    references: [experiments.id],
  }),
  variant: one(experimentVariants, {
    fields: [experimentExposures.variantId],
    references: [experimentVariants.id],
  }),
  user: one(users, {
    fields: [experimentExposures.userId],
    references: [users.id],
  }),
  conversions: many(experimentConversions),
}));

export const experimentConversionsRelations = relations(experimentConversions, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentConversions.experimentId],
    references: [experiments.id],
  }),
  variant: one(experimentVariants, {
    fields: [experimentConversions.variantId],
    references: [experimentVariants.id],
  }),
  exposure: one(experimentExposures, {
    fields: [experimentConversions.exposureId],
    references: [experimentExposures.id],
  }),
}));

// Types for A/B Testing
export type Experiment = typeof experiments.$inferSelect;
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;
export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type InsertExperimentVariant = z.infer<typeof insertExperimentVariantSchema>;
export type ExperimentExposure = typeof experimentExposures.$inferSelect;
export type InsertExperimentExposure = z.infer<typeof insertExperimentExposureSchema>;
export type ExperimentConversion = typeof experimentConversions.$inferSelect;
export type InsertExperimentConversion = z.infer<typeof insertExperimentConversionSchema>;

// Zod Schemas for A/B Testing
export const insertExperimentSchema = createInsertSchema(experiments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalExposures: true,
  totalConversions: true,
});

export const insertExperimentVariantSchema = createInsertSchema(experimentVariants).omit({
  id: true,
  createdAt: true,
  exposures: true,
  conversions: true,
  conversionRate: true,
}).extend({
  variantData: experimentVariantDataSchema,
});

export const insertExperimentExposureSchema = createInsertSchema(experimentExposures).omit({
  id: true,
  exposedAt: true,
});

export const insertExperimentConversionSchema = createInsertSchema(experimentConversions).omit({
  id: true,
  convertedAt: true,
});

export const updateExperimentVariantSchema = insertExperimentVariantSchema.partial();

// Smart Blocks (البلوكات الذكية)
export const smartBlocks = pgTable("smart_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 60 }).notNull(),
  keyword: varchar("keyword", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(),
  backgroundColor: varchar("background_color", { length: 20 }),
  placement: varchar("placement", { length: 30 }).notNull(), // below_featured, above_all_news, between_all_and_murqap, above_footer
  layoutStyle: varchar("layout_style", { length: 20 }).notNull().default('grid'), // grid, list, featured
  limitCount: integer("limit_count").notNull().default(6),
  filters: jsonb("filters").$type<{
    categories?: string[];
    dateRange?: { from: string; to: string };
  }>(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_smart_blocks_keyword").on(table.keyword),
  index("idx_smart_blocks_placement").on(table.placement),
  index("idx_smart_blocks_active").on(table.isActive),
]);

// Smart Blocks Relations
export const smartBlocksRelations = relations(smartBlocks, ({ one }) => ({
  creator: one(users, {
    fields: [smartBlocks.createdBy],
    references: [users.id],
  }),
}));

// Smart Blocks Types
export type SmartBlock = typeof smartBlocks.$inferSelect;
export const insertSmartBlockSchema = createInsertSchema(smartBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSmartBlock = z.infer<typeof insertSmartBlockSchema>;
export type UpdateSmartBlock = Partial<InsertSmartBlock>;

// ============================================
// Hajj Block — singleton config table (2026-05-20)
// ============================================
//
// Powers the "صدى الحج" homepage block during the Hajj season. Lives
// as a singleton (id='default') instead of the generic smart_blocks
// table because it has fields no other block needs: a curated keyword
// pool, a season-window pair, pinned article IDs, and a few display
// tunables. The frontend's HajjBlock.tsx reads /api/hajj-block and
// hides itself when `isActive=false` or we're outside the season
// window, so editors can enable it weeks ahead without affecting
// production.
export const hajjBlockConfig = pgTable("hajj_block_config", {
  id: varchar("id").primaryKey().default("default"), // enforced singleton via UNIQUE
  isActive: boolean("is_active").notNull().default(false),
  // Display copy — kept editable so the dashboard can A/B "مناسك الحج"
  // vs "صدى الحج" without a code deploy.
  title: varchar("title", { length: 80 }).notNull().default("صدى الحج"),
  subtitle: varchar("subtitle", { length: 160 }),
  // Keywords used to discover Hajj articles. Articles match when their
  // title / excerpt / tags contain any of these (case-insensitive).
  keywords: jsonb("keywords").$type<string[]>().notNull()
    .default(sql`'["الحج","المناسك","عرفات","المزدلفة","منى","الجمرات","ضيوف الرحمن","المشاعر المقدسة"]'::jsonb`),
  // Max articles to show in the block.
  articleLimit: integer("article_limit").notNull().default(5),
  // Only consider articles published within the last N hours so a
  // dormant article from a previous season doesn't surface.
  lookbackHours: integer("lookback_hours").notNull().default(48),
  // Hijri-aware season window — block hides itself outside this range
  // even when isActive=true. ISO dates (Gregorian) since the backend
  // already works in that calendar; the UI converts on render.
  seasonStartDate: timestamp("season_start_date"),
  seasonEndDate: timestamp("season_end_date"),
  // Editor-pinned articles always appear at the top of the block,
  // before the keyword-discovered ones. Order in this array = display
  // order.
  pinnedArticleIds: jsonb("pinned_article_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type HajjBlockConfig = typeof hajjBlockConfig.$inferSelect;

// ============================================
// ENGLISH SMART BLOCKS
// ============================================

export const enSmartBlocks = pgTable("en_smart_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 60 }).notNull(),
  keyword: varchar("keyword", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(),
  placement: varchar("placement", { length: 30 }).notNull(),
  layoutStyle: varchar("layout_style", { length: 20 }).notNull().default('grid'),
  limitCount: integer("limit_count").notNull().default(6),
  filters: jsonb("filters").$type<{
    categories?: string[];
    dateRange?: { from: string; to: string };
  }>(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_en_smart_blocks_keyword").on(table.keyword),
  index("idx_en_smart_blocks_placement").on(table.placement),
  index("idx_en_smart_blocks_active").on(table.isActive),
]);

export const enSmartBlocksRelations = relations(enSmartBlocks, ({ one }) => ({
  creator: one(users, {
    fields: [enSmartBlocks.createdBy],
    references: [users.id],
  }),
}));

export type EnSmartBlock = typeof enSmartBlocks.$inferSelect;
export const insertEnSmartBlockSchema = createInsertSchema(enSmartBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEnSmartBlock = z.infer<typeof insertEnSmartBlockSchema>;

// ============================================
// AUDIO NEWS BRIEFS (الأخبار الصوتية السريعة)
// ============================================

// Audio News Briefs - أخبار صوتية قصيرة
export const audioNewsBriefs = pgTable("audio_news_briefs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  audioUrl: text("audio_url"),
  voiceId: varchar("voice_id", { length: 100 }), // ElevenLabs voice ID
  voiceSettings: jsonb("voice_settings").$type<{
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  }>(),
  duration: integer("duration"), // in seconds
  generationStatus: varchar("generation_status", { length: 20 })
    .notNull()
    .default("pending"), // pending, processing, completed, failed
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, published
  publishedAt: timestamp("published_at"),
  createdBy: varchar("created_by", { length: 21 }).notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("idx_audio_briefs_status").on(table.status),
  index("idx_audio_briefs_published").on(table.publishedAt),
  index("idx_audio_briefs_created_by").on(table.createdBy),
]);

// Relations
export const audioNewsBriefsRelations = relations(audioNewsBriefs, ({ one }) => ({
  creator: one(users, {
    fields: [audioNewsBriefs.createdBy],
    references: [users.id],
  }),
}));

// Types
export type AudioNewsBrief = typeof audioNewsBriefs.$inferSelect;
export const insertAudioNewsBriefSchema = createInsertSchema(audioNewsBriefs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAudioNewsBrief = z.infer<typeof insertAudioNewsBriefSchema>;

// ============================================
// AUDIO NEWSLETTERS (النشرات الصوتية)
// ============================================

// Audio Newsletters - النشرات الصوتية الأسبوعية
export const audioNewsletters = pgTable("audio_newsletters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(), // عنوان النشرة
  description: text("description"), // وصف النشرة
  customContent: text("custom_content"), // محتوى نصي مباشر (بديل عن المقالات)
  slug: text("slug").notNull().unique(),
  
  // Audio file information
  audioUrl: text("audio_url"), // رابط الملف الصوتي على Object Storage
  duration: integer("duration"), // مدة التشغيل بالثواني
  fileSize: integer("file_size"), // حجم الملف بالبايت
  
  // Generation metadata
  generatedBy: varchar("generated_by").references(() => users.id).notNull(),
  generationStatus: text("generation_status").default("pending").notNull(), // pending, processing, completed, failed
  generationError: text("generation_error"),
  
  // TTS settings
  voiceId: text("voice_id"), // ElevenLabs voice ID
  voiceModel: text("voice_model").default("eleven_multilingual_v2"), // ElevenLabs model
  voiceSettings: jsonb("voice_settings").$type<{
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  }>(),
  
  // Publishing
  status: text("status").default("draft").notNull(), // draft, scheduled, published, archived, failed
  publishedAt: timestamp("published_at"),
  scheduledFor: timestamp("scheduled_for"), // موعد النشر المجدول
  
  // Template type
  template: text("template"), // morning_brief, evening_digest, etc.
  
  // Additional metadata (retry count, recurrence settings, etc)
  metadata: jsonb("metadata").$type<{
    retryCount?: number;
    lastRetryAt?: string;
    abandonedAt?: string; // set when retries are exhausted (status → failed_permanent)
    isRecurring?: boolean;
    recurrencePattern?: string; // cron pattern
    nextRecurrenceDate?: string;
  }>(),
  
  // Analytics
  listenCount: integer("listen_count").default(0).notNull(), // Total listen count (alias for totalListens)
  totalListens: integer("total_listens").default(0).notNull(),
  uniqueListeners: integer("unique_listeners").default(0).notNull(),
  averageCompletionRate: real("average_completion_rate").default(0).notNull(), // 0-100%
  
  // Metadata for RSS/Podcast
  coverImageUrl: text("cover_image_url"),
  author: text("author").default("سبق الذكية"),
  category: text("category").default("أخبار"),
  keywords: text("keywords").array(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_audio_newsletters_status").on(table.status),
  index("idx_audio_newsletters_published").on(table.publishedAt),
  index("idx_audio_newsletters_scheduled").on(table.scheduledFor),
  index("idx_audio_newsletters_generated_by").on(table.generatedBy),
]);

// Junction table: أي مقالات تم تضمينها في النشرة
export const audioNewsletterArticles = pgTable("audio_newsletter_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  newsletterId: varchar("newsletter_id").references(() => audioNewsletters.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  order: integer("order").notNull(), // ترتيب المقال في النشرة
  includeFullContent: boolean("include_full_content").default(false).notNull(), // تضمين المحتوى كامل أو ملخص فقط
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_audio_newsletter_articles_newsletter").on(table.newsletterId),
  index("idx_audio_newsletter_articles_article").on(table.articleId),
  uniqueIndex("idx_audio_newsletter_articles_unique").on(table.newsletterId, table.articleId),
]);

// Listening history & analytics
export const audioNewsletterListens = pgTable("audio_newsletter_listens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  newsletterId: varchar("newsletter_id").references(() => audioNewsletters.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Session info (for anonymous users)
  sessionId: text("session_id"), // للمستخدمين غير المسجلين
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  // Listening metrics
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  lastPosition: integer("last_position").default(0).notNull(), // آخر موضع استماع بالثواني
  duration: integer("duration").notNull(), // المدة التي استمع لها
  completionPercentage: real("completion_percentage").default(0).notNull(), // نسبة الإكمال
  
  // Platform info
  platform: text("platform"), // web, ios, android
  deviceType: text("device_type"), // mobile, tablet, desktop
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_audio_listens_newsletter").on(table.newsletterId),
  index("idx_audio_listens_user").on(table.userId),
  index("idx_audio_listens_session").on(table.sessionId),
  index("idx_audio_listens_started").on(table.startedAt),
  // New indexes for analytics performance
  index("idx_audio_listens_completion").on(table.newsletterId, table.completionPercentage),
  index("idx_audio_listens_analytics").on(table.newsletterId, table.userId, table.sessionId),
]);

// Relations
export const audioNewslettersRelations = relations(audioNewsletters, ({ one, many }) => ({
  generator: one(users, {
    fields: [audioNewsletters.generatedBy],
    references: [users.id],
  }),
  articles: many(audioNewsletterArticles),
  listens: many(audioNewsletterListens),
}));

export const audioNewsletterArticlesRelations = relations(audioNewsletterArticles, ({ one }) => ({
  newsletter: one(audioNewsletters, {
    fields: [audioNewsletterArticles.newsletterId],
    references: [audioNewsletters.id],
  }),
  article: one(articles, {
    fields: [audioNewsletterArticles.articleId],
    references: [articles.id],
  }),
}));

export const audioNewsletterListensRelations = relations(audioNewsletterListens, ({ one }) => ({
  newsletter: one(audioNewsletters, {
    fields: [audioNewsletterListens.newsletterId],
    references: [audioNewsletters.id],
  }),
  user: one(users, {
    fields: [audioNewsletterListens.userId],
    references: [users.id],
  }),
}));

// Types
export type AudioNewsletter = typeof audioNewsletters.$inferSelect;
export type InsertAudioNewsletter = z.infer<typeof insertAudioNewsletterSchema>;
export type UpdateAudioNewsletter = Partial<InsertAudioNewsletter>;

export type AudioNewsletterArticle = typeof audioNewsletterArticles.$inferSelect;
export type InsertAudioNewsletterArticle = z.infer<typeof insertAudioNewsletterArticleSchema>;

export type AudioNewsletterListen = typeof audioNewsletterListens.$inferSelect;
export type InsertAudioNewsletterListen = z.infer<typeof insertAudioNewsletterListenSchema>;

// Combined type with details
export type AudioNewsletterWithDetails = AudioNewsletter & {
  generator?: User;
  articles?: (AudioNewsletterArticle & { article?: Article })[];
  listens?: AudioNewsletterListen[];
  _count?: {
    articles: number;
    listens: number;
  };
};

// Zod Schemas
export const insertAudioNewsletterSchema = createInsertSchema(audioNewsletters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalListens: true,
  uniqueListeners: true,
  averageCompletionRate: true,
});

export const insertAudioNewsletterArticleSchema = createInsertSchema(audioNewsletterArticles).omit({
  id: true,
  createdAt: true,
});

export const insertAudioNewsletterListenSchema = createInsertSchema(audioNewsletterListens).omit({
  id: true,
  createdAt: true,
});

export const updateAudioNewsletterSchema = insertAudioNewsletterSchema.partial();

// TTS usage logs — tracks per-call provider usage for analytics
export const ttsUsageLogs = pgTable("tts_usage_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  newsletterId: varchar("newsletter_id"),
  provider: text("provider").notNull(), // openai | elevenlabs | google
  voiceId: text("voice_id"),
  language: text("language"), // ar | en | ur
  charCount: integer("char_count").default(0).notNull(),
  durationMs: integer("duration_ms").default(0).notNull(),
  estimatedCostUsd: real("estimated_cost_usd").default(0).notNull(),
  success: boolean("success").default(true).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tts_usage_provider").on(table.provider),
  index("idx_tts_usage_created").on(table.createdAt),
  index("idx_tts_usage_newsletter").on(table.newsletterId),
]);

export type TtsUsageLog = typeof ttsUsageLogs.$inferSelect;
export const insertTtsUsageLogSchema = createInsertSchema(ttsUsageLogs).omit({
  id: true,
  createdAt: true,
});
export type InsertTtsUsageLog = z.infer<typeof insertTtsUsageLogSchema>;

// ============================================================
// INTERNAL ANNOUNCEMENTS SYSTEM - نظام الإعلانات الداخلية المتقدم
// ============================================================

// Internal Announcements (multiple announcements with advanced features)
export const internalAnnouncements = pgTable("internal_announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  message: text("message").notNull(), // Rich text HTML or JSON
  priority: text("priority").default("normal").notNull(), // low, normal, high
  status: text("status").default("draft").notNull(), // draft, scheduled, published, expired, archived
  
  // Channels where announcement will appear
  channels: jsonb("channels").default([]).notNull().$type<string[]>(), // ["dashboardBanner", "inbox", "toast"]
  
  // Targeting & Audience
  audienceRoles: jsonb("audience_roles").$type<string[]>(), // ["admin", "editor", "reporter"] or null for all
  audienceUserIds: jsonb("audience_user_ids").$type<string[]>(), // Specific user IDs or null
  
  // Metadata
  tags: jsonb("tags").$type<string[]>(), // Keywords for filtering/search
  attachments: jsonb("attachments").$type<{url: string; name: string; type: string}[]>(), // Files/links
  
  // Display settings
  dismissible: boolean("dismissible").default(true).notNull(),
  maxViewsPerUser: integer("max_views_per_user"), // null = unlimited
  
  // Scheduling
  startAt: timestamp("start_at"), // When to auto-publish (null = manual publish)
  endAt: timestamp("end_at"), // When to auto-expire (null = never)
  
  // Tracking
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  updatedBy: varchar("updated_by").references(() => users.id),
  publishedBy: varchar("published_by").references(() => users.id),
  publishedAt: timestamp("published_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_announcements_status").on(table.status),
  index("idx_announcements_priority").on(table.priority),
  index("idx_announcements_published").on(table.publishedAt),
  index("idx_announcements_schedule").on(table.startAt, table.endAt),
  index("idx_announcements_created").on(table.createdBy),
]);

// Announcement Versions (for history/archiving)
export const internalAnnouncementVersions = pgTable("internal_announcement_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => internalAnnouncements.id, { onDelete: "cascade" }).notNull(),
  
  // Snapshot of data at this version
  title: text("title").notNull(),
  message: text("message").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  channels: jsonb("channels").notNull().$type<string[]>(),
  audienceRoles: jsonb("audience_roles").$type<string[]>(),
  audienceUserIds: jsonb("audience_user_ids").$type<string[]>(),
  tags: jsonb("tags").$type<string[]>(),
  
  // Version metadata
  changedBy: varchar("changed_by").references(() => users.id).notNull(),
  changeReason: text("change_reason"), // Optional description of change
  diff: jsonb("diff"), // JSON diff of what changed
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_versions_announcement").on(table.announcementId),
  index("idx_versions_created").on(table.createdAt),
]);

// Announcement Metrics (for analytics)
export const internalAnnouncementMetrics = pgTable("internal_announcement_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => internalAnnouncements.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id), // null for anonymous
  
  event: text("event").notNull(), // impression, unique_view, dismiss, click
  channel: text("channel"), // Which channel it was seen on
  
  // Event metadata
  meta: jsonb("meta").$type<{
    deviceType?: string;
    userAgent?: string;
    location?: string;
    [key: string]: any;
  }>(),
  
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("idx_metrics_announcement").on(table.announcementId),
  index("idx_metrics_event").on(table.event),
  index("idx_metrics_user").on(table.userId),
  index("idx_metrics_occurred").on(table.occurredAt),
  index("idx_metrics_analytics").on(table.announcementId, table.event, table.occurredAt),
]);

// Relations
export const internalAnnouncementsRelations = relations(internalAnnouncements, ({ one, many }) => ({
  creator: one(users, {
    fields: [internalAnnouncements.createdBy],
    references: [users.id],
    relationName: "announcement_creator",
  }),
  updater: one(users, {
    fields: [internalAnnouncements.updatedBy],
    references: [users.id],
    relationName: "announcement_updater",
  }),
  publisher: one(users, {
    fields: [internalAnnouncements.publishedBy],
    references: [users.id],
    relationName: "announcement_publisher",
  }),
  versions: many(internalAnnouncementVersions),
  metrics: many(internalAnnouncementMetrics),
}));

export const internalAnnouncementVersionsRelations = relations(internalAnnouncementVersions, ({ one }) => ({
  announcement: one(internalAnnouncements, {
    fields: [internalAnnouncementVersions.announcementId],
    references: [internalAnnouncements.id],
  }),
  changer: one(users, {
    fields: [internalAnnouncementVersions.changedBy],
    references: [users.id],
  }),
}));

export const internalAnnouncementMetricsRelations = relations(internalAnnouncementMetrics, ({ one }) => ({
  announcement: one(internalAnnouncements, {
    fields: [internalAnnouncementMetrics.announcementId],
    references: [internalAnnouncements.id],
  }),
  user: one(users, {
    fields: [internalAnnouncementMetrics.userId],
    references: [users.id],
  }),
}));

// Types
export type InternalAnnouncement = typeof internalAnnouncements.$inferSelect;
export type InternalAnnouncementVersion = typeof internalAnnouncementVersions.$inferSelect;
export type InternalAnnouncementMetric = typeof internalAnnouncementMetrics.$inferSelect;

// Combined type with details
export type InternalAnnouncementWithDetails = InternalAnnouncement & {
  creator?: User;
  updater?: User;
  publisher?: User;
  versions?: InternalAnnouncementVersion[];
  metrics?: InternalAnnouncementMetric[];
  _count?: {
    versions: number;
    metrics: number;
    impressions: number;
    uniqueViews: number;
    dismissals: number;
    clicks: number;
  };
};

// Zod Schemas
export const insertInternalAnnouncementSchema = createInsertSchema(internalAnnouncements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  createdBy: true, // Will be added by backend from req.user
  updatedBy: true,
  publishedBy: true,
}).extend({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل").max(200, "العنوان يجب ألا يتجاوز 200 حرف"),
  message: z.string().min(10, "الرسالة يجب أن تكون 10 أحرف على الأقل"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  status: z.enum(["draft", "scheduled", "published", "expired", "archived"]).default("draft"),
  channels: z.array(z.enum(["dashboardBanner", "inbox", "toast"])).min(1, "يجب اختيار قناة واحدة على الأقل"),
});

export const updateInternalAnnouncementSchema = insertInternalAnnouncementSchema.partial();

export const insertInternalAnnouncementVersionSchema = createInsertSchema(internalAnnouncementVersions).omit({
  id: true,
  createdAt: true,
});

export const insertInternalAnnouncementMetricSchema = createInsertSchema(internalAnnouncementMetrics).omit({
  id: true,
  occurredAt: true,
}).extend({
  event: z.enum(["impression", "unique_view", "dismiss", "click"]),
});

export type InsertInternalAnnouncement = z.infer<typeof insertInternalAnnouncementSchema>;
export type UpdateInternalAnnouncement = z.infer<typeof updateInternalAnnouncementSchema>;
export type InsertInternalAnnouncementVersion = z.infer<typeof insertInternalAnnouncementVersionSchema>;
export type InsertInternalAnnouncementMetric = z.infer<typeof insertInternalAnnouncementMetricSchema>;

// ————————————————————————————————————————————————————————————————————
// Sabq Shorts (Reels) - Short-form video news content
// ————————————————————————————————————————————————————————————————————

export const shorts = pgTable("shorts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  
  // Video files
  coverImage: text("cover_image").notNull(), // poster/placeholder
  hlsUrl: text("hls_url"), // m3u8 for ABR streaming
  mp4Url: text("mp4_url"), // fallback for browsers without HLS support
  
  // Metadata
  duration: integer("duration"), // in seconds
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: 'set null' }),
  reporterId: varchar("reporter_id").references(() => users.id),
  
  // Publishing
  status: text("status").default("draft").notNull(), // draft, scheduled, published, archived
  publishType: text("publish_type").default("instant").notNull(), // instant, scheduled
  scheduledAt: timestamp("scheduled_at"),
  publishedAt: timestamp("published_at"),
  
  // Stats (cached for performance)
  views: integer("views").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  shares: integer("shares").default(0).notNull(),
  comments: integer("comments").default(0).notNull(),
  avgWatchTime: real("avg_watch_time").default(0), // in seconds
  completionRate: real("completion_rate").default(0), // percentage
  
  // Ordering & visibility
  displayOrder: integer("display_order").default(0).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("shorts_status_idx").on(table.status),
  index("shorts_published_at_idx").on(table.publishedAt),
  index("shorts_display_order_idx").on(table.displayOrder),
  index("shorts_reporter_idx").on(table.reporterId),
  index("shorts_category_idx").on(table.categoryId),
]);

// Analytics tracking for shorts
export const shortAnalytics = pgTable("short_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shortId: varchar("short_id").references(() => shorts.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }),
  sessionId: text("session_id"), // for anonymous users
  
  // Event type
  eventType: text("event_type").notNull(), // view, like, unlike, share, comment, watch_time
  
  // Watch time tracking
  watchTime: integer("watch_time"), // seconds watched
  watchPercentage: real("watch_percentage"), // percentage of video watched
  
  // Metadata
  userAgent: text("user_agent"),
  referrer: text("referrer"),
  
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("short_analytics_short_idx").on(table.shortId),
  index("short_analytics_user_idx").on(table.userId),
  index("short_analytics_event_idx").on(table.eventType),
  index("short_analytics_occurred_at_idx").on(table.occurredAt),
]);

// Relations
export const shortsRelations = relations(shorts, ({ one, many }) => ({
  category: one(categories, {
    fields: [shorts.categoryId],
    references: [categories.id],
  }),
  reporter: one(users, {
    fields: [shorts.reporterId],
    references: [users.id],
  }),
  analytics: many(shortAnalytics),
}));

export const shortAnalyticsRelations = relations(shortAnalytics, ({ one }) => ({
  short: one(shorts, {
    fields: [shortAnalytics.shortId],
    references: [shorts.id],
  }),
  user: one(users, {
    fields: [shortAnalytics.userId],
    references: [users.id],
  }),
}));

// Types
export type Short = typeof shorts.$inferSelect;
export type ShortAnalytic = typeof shortAnalytics.$inferSelect;

export type ShortWithDetails = Short & {
  category?: Category;
  reporter?: User;
  analytics?: ShortAnalytic[];
};

// Zod Schemas
export const insertShortSchema = createInsertSchema(shorts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  views: true,
  likes: true,
  shares: true,
  comments: true,
  avgWatchTime: true,
  completionRate: true,
}).extend({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل").max(200, "العنوان يجب ألا يتجاوز 200 حرف"),
  coverImage: z.string().url("رابط صورة الغلاف يجب أن يكون صحيح"),
  status: z.enum(["draft", "scheduled", "published", "archived"]).default("draft"),
  publishType: z.enum(["instant", "scheduled"]).default("instant"),
});

export const updateShortSchema = insertShortSchema.partial();

export const insertShortAnalyticSchema = createInsertSchema(shortAnalytics).omit({
  id: true,
  occurredAt: true,
}).extend({
  eventType: z.enum(["view", "like", "unlike", "share", "comment", "watch_time"]),
});

export type InsertShort = z.infer<typeof insertShortSchema>;
export type UpdateShort = z.infer<typeof updateShortSchema>;
export type InsertShortAnalytic = z.infer<typeof insertShortAnalyticSchema>;

// Quad Categories Block Settings
export const quadCategoriesSettings = pgTable("quad_categories_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  isActive: boolean("is_active").default(true).notNull(),
  
  // Configuration JSON
  config: jsonb("config").$type<{
    sections: Array<{
      categorySlug: string;
      headlineMode: "latest" | "mostViewed" | "editorsPick";
      statType: "dailyCount" | "weeklyCount" | "totalViews" | "engagementRate";
      teaser?: string;
      listSize: number;
    }>;
    mobileCarousel: boolean;
    freshHours: number;
    badges: {
      exclusive: boolean;
      breaking: boolean;
      analysis: boolean;
    };
    backgroundColor?: string;
  }>().notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type QuadCategoriesSettings = typeof quadCategoriesSettings.$inferSelect;

export const insertQuadCategoriesSettingsSchema = createInsertSchema(quadCategoriesSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  config: z.object({
    sections: z.array(z.object({
      categorySlug: z.string(),
      headlineMode: z.enum(["latest", "mostViewed", "editorsPick"]),
      statType: z.enum(["dailyCount", "weeklyCount", "totalViews", "engagementRate"]),
      teaser: z.string().optional(),
      listSize: z.number().min(3).max(8),
    })).length(4, "يجب اختيار 4 تصنيفات بالضبط"),
    mobileCarousel: z.boolean(),
    freshHours: z.number().min(1).max(72),
    badges: z.object({
      exclusive: z.boolean(),
      breaking: z.boolean(),
      analysis: z.boolean(),
    }),
    backgroundColor: z.string().optional(),
  }),
});

export type InsertQuadCategoriesSettings = z.infer<typeof insertQuadCategoriesSettingsSchema>;

// English Quad Categories Block Settings
export const enQuadCategoriesSettings = pgTable("en_quad_categories_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  isActive: boolean("is_active").default(true).notNull(),
  
  // Configuration JSON
  config: jsonb("config").$type<{
    sections: Array<{
      categorySlug: string;
      headlineMode: "latest" | "mostViewed" | "editorsPick";
      statType: "dailyCount" | "weeklyCount" | "totalViews" | "engagementRate";
      teaser?: string;
      listSize: number;
    }>;
    mobileCarousel: boolean;
    freshHours: number;
    badges: {
      exclusive: boolean;
      breaking: boolean;
      analysis: boolean;
    };
    backgroundColor?: string;
  }>().notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EnQuadCategoriesSettings = typeof enQuadCategoriesSettings.$inferSelect;

export const insertEnQuadCategoriesSettingsSchema = createInsertSchema(enQuadCategoriesSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  config: z.object({
    sections: z.array(z.object({
      categorySlug: z.string(),
      headlineMode: z.enum(["latest", "mostViewed", "editorsPick"]),
      statType: z.enum(["dailyCount", "weeklyCount", "totalViews", "engagementRate"]),
      teaser: z.string().optional(),
      listSize: z.number().min(3).max(8),
    })).length(4, "Must select exactly 4 categories"),
    mobileCarousel: z.boolean(),
    freshHours: z.number().min(1).max(72),
    badges: z.object({
      exclusive: z.boolean(),
      breaking: z.boolean(),
      analysis: z.boolean(),
    }),
    backgroundColor: z.string().optional(),
  }),
});

export type InsertEnQuadCategoriesSettings = z.infer<typeof insertEnQuadCategoriesSettingsSchema>;

// ============================================
// URDU QUAD CATEGORIES SETTINGS
// ============================================

export const urQuadCategoriesSettings = pgTable("ur_quad_categories_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  isActive: boolean("is_active").default(true).notNull(),
  
  // Configuration JSON
  config: jsonb("config").$type<{
    sections: Array<{
      categorySlug: string;
      headlineMode: "latest" | "mostViewed" | "editorsPick";
      statType: "dailyCount" | "weeklyCount" | "totalViews" | "engagementRate";
      teaser?: string;
      listSize: number;
    }>;
    mobileCarousel: boolean;
    freshHours: number;
    badges: {
      exclusive: boolean;
      breaking: boolean;
      analysis: boolean;
    };
    backgroundColor?: string;
  }>().notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UrQuadCategoriesSettings = typeof urQuadCategoriesSettings.$inferSelect;

export const insertUrQuadCategoriesSettingsSchema = createInsertSchema(urQuadCategoriesSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  config: z.object({
    sections: z.array(z.object({
      categorySlug: z.string(),
      headlineMode: z.enum(["latest", "mostViewed", "editorsPick"]),
      statType: z.enum(["dailyCount", "weeklyCount", "totalViews", "engagementRate"]),
      teaser: z.string().optional(),
      listSize: z.number().min(3).max(8),
    })).length(4, "بالکل 4 زمرے منتخب کریں"),
    mobileCarousel: z.boolean(),
    freshHours: z.number().min(1).max(72),
    badges: z.object({
      exclusive: z.boolean(),
      breaking: z.boolean(),
      analysis: z.boolean(),
    }),
    backgroundColor: z.string().optional(),
  }),
});

export type InsertUrQuadCategoriesSettings = z.infer<typeof insertUrQuadCategoriesSettingsSchema>;

// ============================================
// Calendar System (Sabq Calendar / تقويم سبق)
// ============================================

// Calendar Events - Global/National/Internal occasions
export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  dateStart: timestamp("date_start", { withTimezone: true }).notNull(),
  dateEnd: timestamp("date_end", { withTimezone: true }),
  timezone: text("timezone").default("Asia/Riyadh").notNull(),
  type: text("type").notNull(), // GLOBAL, NATIONAL, INTERNAL
  localeScope: text("locale_scope"), // WORLD, SA, GCC, CUSTOM
  importance: integer("importance").default(3).notNull(), // 1-5 scale
  categoryId: varchar("category_id").references(() => categories.id),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  source: text("source"), // UN, WHO, Manual, ICS import
  description: text("description"),
  attachments: jsonb("attachments").$type<{
    url?: string;
    type?: string;
    name?: string;
    [key: string]: any;
  }[]>(),
  
  // Metadata
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_calendar_events_date_start").on(table.dateStart),
  index("idx_calendar_events_type").on(table.type),
  index("idx_calendar_events_importance").on(table.importance),
  index("idx_calendar_events_category").on(table.categoryId),
]);

// Reminders - Notification schedule for events
export const calendarReminders = pgTable("calendar_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => calendarEvents.id, { onDelete: "cascade" }).notNull(),
  fireWhen: integer("fire_when").notNull(), // days before event (e.g., 30, 14, 7, 5, 3, 1)
  channel: text("channel").notNull(), // IN_APP, EMAIL, WHATSAPP, SLACK
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_calendar_reminders_event").on(table.eventId),
  index("idx_calendar_reminders_enabled").on(table.enabled),
]);

// AI Drafts - Cached AI-generated content for events
export const calendarAiDrafts = pgTable("calendar_ai_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => calendarEvents.id, { onDelete: "cascade" }).notNull().unique(),
  ideas: jsonb("ideas").$type<{
    id?: string;
    type?: string; // report, feature, explainer, opinion
    title?: string;
    alternateTitle?: string;
    angle?: string;
    keyPoints?: string[];
    openingParagraph?: string;
    sources?: string[];
    [key: string]: any;
  }[]>(),
  headlines: jsonb("headlines").$type<{
    primary?: string;
    secondary?: string;
    alternates?: string[];
    [key: string]: any;
  }>(),
  infographic: jsonb("infographic").$type<{
    title?: string;
    subtitle?: string;
    dataPoints?: Array<{
      label?: string;
      value?: string | number;
      icon?: string;
    }>;
    cta?: string;
    [key: string]: any;
  }>(),
  social: jsonb("social").$type<{
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    hashtags?: string[];
    [key: string]: any;
  }>(),
  seo: jsonb("seo").$type<{
    keywords?: string[];
    metaTitle?: string;
    metaDescription?: string;
    internalLinks?: string[];
    [key: string]: any;
  }>(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_calendar_ai_drafts_event").on(table.eventId),
]);

// Assignments - Task assignments for event coverage
export const calendarAssignments = pgTable("calendar_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => calendarEvents.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull(), // editor, reporter, designer, social
  status: text("status").default("planned").notNull(), // planned, in_progress, done, cancelled
  notes: text("notes"),
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_calendar_assignments_event").on(table.eventId),
  index("idx_calendar_assignments_user").on(table.userId),
  index("idx_calendar_assignments_status").on(table.status),
]);

// ============================================
// Calendar System Relations
// ============================================

export const calendarEventsRelations = relations(calendarEvents, ({ one, many }) => ({
  category: one(categories, {
    fields: [calendarEvents.categoryId],
    references: [categories.id],
  }),
  createdBy: one(users, {
    fields: [calendarEvents.createdById],
    references: [users.id],
  }),
  reminders: many(calendarReminders),
  aiDraft: one(calendarAiDrafts),
  assignments: many(calendarAssignments),
}));

export const calendarRemindersRelations = relations(calendarReminders, ({ one }) => ({
  event: one(calendarEvents, {
    fields: [calendarReminders.eventId],
    references: [calendarEvents.id],
  }),
}));

export const calendarAiDraftsRelations = relations(calendarAiDrafts, ({ one }) => ({
  event: one(calendarEvents, {
    fields: [calendarAiDrafts.eventId],
    references: [calendarEvents.id],
  }),
}));

export const calendarAssignmentsRelations = relations(calendarAssignments, ({ one }) => ({
  event: one(calendarEvents, {
    fields: [calendarAssignments.eventId],
    references: [calendarEvents.id],
  }),
  user: one(users, {
    fields: [calendarAssignments.userId],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [calendarAssignments.assignedBy],
    references: [users.id],
  }),
}));

// ============================================
// Calendar System Types
// ============================================

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type CalendarReminder = typeof calendarReminders.$inferSelect;
export type CalendarAiDraft = typeof calendarAiDrafts.$inferSelect;
export type CalendarAssignment = typeof calendarAssignments.$inferSelect;

// ============================================
// Calendar System Zod Schemas
// ============================================

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "عنوان المناسبة مطلوب").max(500, "العنوان طويل جداً"),
  slug: z.string().min(1, "الرابط المختصر مطلوب"),
  dateStart: z.string().or(z.date()),
  dateEnd: z.string().or(z.date()).optional(),
  type: z.enum(["GLOBAL", "NATIONAL", "INTERNAL"]),
  importance: z.number().min(1).max(5).default(3),
  tags: z.array(z.string()).default([]),
});

export const updateCalendarEventSchema = insertCalendarEventSchema.partial();

export const insertCalendarReminderSchema = createInsertSchema(calendarReminders).omit({
  id: true,
  createdAt: true,
}).extend({
  fireWhen: z.number().min(0, "الأيام قبل الحدث يجب أن تكون 0 أو أكثر"),
  channel: z.enum(["IN_APP", "EMAIL", "WHATSAPP", "SLACK"]),
});

export const insertCalendarAiDraftSchema = createInsertSchema(calendarAiDrafts).omit({
  id: true,
  generatedAt: true,
  updatedAt: true,
});

export const insertCalendarAssignmentSchema = createInsertSchema(calendarAssignments).omit({
  id: true,
  assignedAt: true,
  completedAt: true,
}).extend({
  role: z.enum(["editor", "reporter", "designer", "social"]),
  status: z.enum(["planned", "in_progress", "done", "cancelled"]).default("planned"),
});

export const updateCalendarAssignmentSchema = insertCalendarAssignmentSchema.partial().omit({
  eventId: true,
  userId: true,
  assignedBy: true,
});

// ============================================
// Calendar System Insert Types
// ============================================

export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type UpdateCalendarEvent = z.infer<typeof updateCalendarEventSchema>;
export type InsertCalendarReminder = z.infer<typeof insertCalendarReminderSchema>;
export type InsertCalendarAiDraft = z.infer<typeof insertCalendarAiDraftSchema>;
export type InsertCalendarAssignment = z.infer<typeof insertCalendarAssignmentSchema>;
export type UpdateCalendarAssignment = z.infer<typeof updateCalendarAssignmentSchema>;

// ============================================
// Smart Links System - Entity Types
// ============================================

export const entityTypes = pgTable("entity_types", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  nameAr: text("name_ar").notNull().unique(),
  nameEn: text("name_en").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  color: text("color"),
  displayOrder: integer("display_order").default(0).notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================
// Smart Links System - Entities (كيانات)
// ============================================

export const smartEntities = pgTable("smart_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  aliases: text("aliases").array().default([]).notNull(),
  typeId: integer("type_id").references(() => entityTypes.id).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  slug: text("slug").notNull().unique(),
  importanceScore: real("importance_score").default(0.5).notNull(),
  usageCount: integer("usage_count").default(0).notNull(),
  metadata: jsonb("metadata").$type<{
    birthDate?: string;
    position?: string;
    organization?: string;
    location?: string;
    website?: string;
    social?: {
      twitter?: string;
      linkedin?: string;
      instagram?: string;
    };
    [key: string]: any;
  }>(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_smart_entities_type").on(table.typeId),
  index("idx_smart_entities_importance").on(table.importanceScore),
]);

// ============================================
// Smart Links System - Terms (مصطلحات)
// ============================================

export const smartTerms = pgTable("smart_terms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  term: text("term").notNull().unique(),
  aliases: text("aliases").array().default([]).notNull(),
  description: text("description"),
  category: text("category"),
  usageCount: integer("usage_count").default(0).notNull(),
  metadata: jsonb("metadata").$type<{
    definition?: string;
    relatedTerms?: string[];
    [key: string]: any;
  }>(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_smart_terms_category").on(table.category),
]);

// ============================================
// Smart Links System - Article Links Junction
// ============================================

export const articleSmartLinks = pgTable("article_smart_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  entityId: varchar("entity_id").references(() => smartEntities.id, { onDelete: "cascade" }),
  termId: varchar("term_id").references(() => smartTerms.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  context: text("context"),
  autoLinked: boolean("auto_linked").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_article_smart_links_article").on(table.articleId),
  index("idx_article_smart_links_entity").on(table.entityId),
  index("idx_article_smart_links_term").on(table.termId),
]);

// ============================================
// Smart Links System - Relations
// ============================================

export const entityTypesRelations = relations(entityTypes, ({ many }) => ({
  entities: many(smartEntities),
}));

export const smartEntitiesRelations = relations(smartEntities, ({ one, many }) => ({
  type: one(entityTypes, {
    fields: [smartEntities.typeId],
    references: [entityTypes.id],
  }),
  links: many(articleSmartLinks),
}));

export const smartTermsRelations = relations(smartTerms, ({ many }) => ({
  links: many(articleSmartLinks),
}));

export const articleSmartLinksRelations = relations(articleSmartLinks, ({ one }) => ({
  article: one(articles, {
    fields: [articleSmartLinks.articleId],
    references: [articles.id],
  }),
  entity: one(smartEntities, {
    fields: [articleSmartLinks.entityId],
    references: [smartEntities.id],
  }),
  term: one(smartTerms, {
    fields: [articleSmartLinks.termId],
    references: [smartTerms.id],
  }),
}));

// ============================================
// Smart Links System - Types
// ============================================

export type EntityType = typeof entityTypes.$inferSelect;
export type InsertEntityTypeDb = typeof entityTypes.$inferInsert;
export type SmartEntity = typeof smartEntities.$inferSelect;
export type InsertSmartEntityDb = typeof smartEntities.$inferInsert;
export type SmartTerm = typeof smartTerms.$inferSelect;
export type InsertSmartTermDb = typeof smartTerms.$inferInsert;
export type ArticleSmartLink = typeof articleSmartLinks.$inferSelect;
export type InsertArticleSmartLinkDb = typeof articleSmartLinks.$inferInsert;

// ============================================
// Smart Links System - Zod Schemas
// ============================================

export const insertEntityTypeSchema = z.object({
  nameAr: z.string().min(1, "الاسم بالعربية مطلوب"),
  nameEn: z.string().min(1, "الاسم بالإنجليزية مطلوب"),
  slug: z.string().min(1, "الرابط المختصر مطلوب"),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  displayOrder: z.number().default(0),
  status: z.string().default("active"),
});

export const insertSmartEntitySchema = createInsertSchema(smartEntities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "اسم الكيان مطلوب"),
  slug: z.string().min(1, "الرابط المختصر مطلوب"),
  typeId: z.number().min(1, "نوع الكيان مطلوب"),
  aliases: z.array(z.string()).default([]),
  importanceScore: z.number().min(0).max(1).default(0.5),
});

export const insertSmartTermSchema = createInsertSchema(smartTerms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  term: z.string().min(1, "المصطلح مطلوب"),
  aliases: z.array(z.string()).default([]),
});

export const insertArticleSmartLinkSchema = createInsertSchema(articleSmartLinks).omit({
  id: true,
  createdAt: true,
}).extend({
  articleId: z.string().min(1, "معرف المقال مطلوب"),
  position: z.number().min(0, "الموقع يجب أن يكون 0 أو أكثر"),
});

// ============================================
// Smart Links System - Insert Types
// ============================================

export type InsertEntityType = z.infer<typeof insertEntityTypeSchema>;
export type InsertSmartEntity = z.infer<typeof insertSmartEntitySchema>;
export type InsertSmartTerm = z.infer<typeof insertSmartTermSchema>;
export type InsertArticleSmartLink = z.infer<typeof insertArticleSmartLinkSchema>;

// ============================================
// ENGLISH VERSION TABLES
// ============================================

// English Categories
export const enCategories = pgTable("en_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  color: text("color"),
  icon: text("icon"),
  heroImageUrl: text("hero_image_url"),
  displayOrder: integer("display_order").default(0),
  status: text("status").default("active").notNull(),
  type: text("type").default("core").notNull(), // core, dynamic, smart, seasonal
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_en_categories_status").on(table.status),
  index("idx_en_categories_type_status").on(table.type, table.status),
]);

// English Articles
export const enArticles = pgTable("en_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  slug: text("slug").notNull().unique(),
  englishSlug: text("english_slug"),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  imageUrl: text("image_url"),
  imageFocalPoint: jsonb("image_focal_point").$type<{
    x: number;
    y: number;
  }>(),
  categoryId: varchar("category_id").references(() => enCategories.id, { onDelete: 'set null' }),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  reporterId: varchar("reporter_id").references(() => users.id),
  articleType: text("article_type").default("news").notNull(), // news, opinion, analysis, column, infographic
  newsType: text("news_type").default("regular").notNull(), // breaking, featured, regular
  publishType: text("publish_type").default("instant").notNull(), // instant, scheduled
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").notNull().default("draft"), // draft, scheduled, published, archived
  reviewStatus: text("review_status"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  hideFromHomepage: boolean("hide_from_homepage").default(false).notNull(),
  aiSummary: text("ai_summary"),
  smartSummary: text("smart_summary"),
  aiGenerated: boolean("ai_generated").default(false),
  isFeatured: boolean("is_featured").default(false).notNull(),
  views: integer("views").default(0).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  seo: jsonb("seo").$type<{
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    socialTitle?: string;
    socialDescription?: string;
    imageAltText?: string;
    ogImageUrl?: string;
  }>(),
  seoMetadata: jsonb("seo_metadata").$type<{
    status?: "draft" | "generated" | "approved" | "rejected";
    version?: number;
    generatedAt?: string;
    generatedBy?: string;
    provider?: "anthropic" | "openai" | "gemini" | "qwen";
    model?: string;
    manualOverride?: boolean;
    overrideBy?: string;
    overrideReason?: string;
    rawResponse?: any;
  }>(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_en_articles_status_published").on(table.status, table.publishedAt.desc()),
  index("idx_en_articles_category_status").on(table.categoryId, table.status),
  index("idx_en_articles_author_status").on(table.authorId, table.status),
  index("idx_en_articles_type").on(table.articleType),
  index("idx_en_articles_published_at").on(table.publishedAt.desc()),
  index("idx_en_articles_english_slug").on(table.englishSlug),
]);

// English Comments
export const enComments = pgTable("en_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => enArticles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, rejected, flagged
  parentId: varchar("parent_id"),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationReason: text("moderation_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_en_comments_article_status").on(table.articleId, table.status),
  index("idx_en_comments_user").on(table.userId),
  index("idx_en_comments_status").on(table.status),
]);

// English Reactions
export const enReactions = pgTable("en_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => enArticles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull().default("like"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_en_reactions_article").on(table.articleId),
  index("idx_en_reactions_user_article").on(table.userId, table.articleId),
]);

// English Bookmarks
export const enBookmarks = pgTable("en_bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => enArticles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_en_bookmarks_user").on(table.userId, table.createdAt.desc()),
  index("idx_en_bookmarks_article").on(table.articleId),
]);

// English Reading History
export const enReadingHistory = pgTable("en_reading_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  articleId: varchar("article_id").references(() => enArticles.id, { onDelete: "cascade" }).notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
  readDuration: integer("read_duration"),
}, (table) => [
  index("idx_en_reading_history_user").on(table.userId, table.readAt.desc()),
  index("idx_en_reading_history_article").on(table.articleId),
]);

// ============================================
// ENGLISH VERSION - INSERT SCHEMAS
// ============================================

export const insertEnCategorySchema = createInsertSchema(enCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Category name is required"),
  slug: z.string().min(1, "Slug is required"),
});

export const insertEnArticleSchema = createInsertSchema(enArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  views: true,
  authorId: true, // Backend adds this from req.user.id
}).extend({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  slug: z.string().min(1, "Slug is required"),
});

export const insertEnCommentSchema = createInsertSchema(enComments).omit({
  id: true,
  createdAt: true,
}).extend({
  content: z.string().min(1, "Comment content is required"),
});

// ============================================
// ENGLISH VERSION - SELECT TYPES
// ============================================

export type EnCategory = typeof enCategories.$inferSelect;
export type InsertEnCategory = z.infer<typeof insertEnCategorySchema>;

export type EnArticle = typeof enArticles.$inferSelect;
export type InsertEnArticle = z.infer<typeof insertEnArticleSchema>;

export type EnComment = typeof enComments.$inferSelect;
export type InsertEnComment = z.infer<typeof insertEnCommentSchema>;

export type EnReaction = typeof enReactions.$inferSelect;
export type EnBookmark = typeof enBookmarks.$inferSelect;
export type EnReadingHistory = typeof enReadingHistory.$inferSelect;

// English Article with full details (similar to ArticleWithDetails for Arabic)
export type EnArticleWithDetails = EnArticle & {
  category?: EnCategory;
  author?: User;
  commentsCount?: number;
  reactionsCount?: number;
  isBookmarked?: boolean;
  hasReacted?: boolean;
};

export type EnCommentWithUser = EnComment & {
  user: User;
  replies?: EnCommentWithUser[];
};

// ============================================
// URDU VERSION - DATABASE TABLES
// ============================================

// Urdu Categories
export const urCategories = pgTable("ur_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  color: text("color"),
  icon: text("icon"),
  heroImageUrl: text("hero_image_url"),
  displayOrder: integer("display_order").default(0),
  status: text("status").default("active").notNull(),
  type: text("type").default("core").notNull(), // core, dynamic, smart, seasonal
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ur_categories_status").on(table.status),
  index("idx_ur_categories_type_status").on(table.type, table.status),
]);

// Urdu Articles
export const urArticles = pgTable("ur_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  slug: text("slug").notNull().unique(),
  englishSlug: text("english_slug"),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  imageUrl: text("image_url"),
  imageFocalPoint: jsonb("image_focal_point").$type<{
    x: number;
    y: number;
  }>(),
  categoryId: varchar("category_id").references(() => urCategories.id, { onDelete: 'set null' }),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  reporterId: varchar("reporter_id").references(() => users.id),
  articleType: text("article_type").default("news").notNull(), // news, opinion, analysis, column, infographic
  newsType: text("news_type").default("regular").notNull(), // breaking, featured, regular
  publishType: text("publish_type").default("instant").notNull(), // instant, scheduled
  scheduledAt: timestamp("scheduled_at"),
  status: text("status").notNull().default("draft"), // draft, scheduled, published, archived
  reviewStatus: text("review_status"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  hideFromHomepage: boolean("hide_from_homepage").default(false).notNull(),
  aiSummary: text("ai_summary"),
  smartSummary: text("smart_summary"),
  aiGenerated: boolean("ai_generated").default(false),
  isFeatured: boolean("is_featured").default(false).notNull(),
  views: integer("views").default(0).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  seo: jsonb("seo").$type<{
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    socialTitle?: string;
    socialDescription?: string;
    imageAltText?: string;
    ogImageUrl?: string;
  }>(),
  seoMetadata: jsonb("seo_metadata").$type<{
    status?: "draft" | "generated" | "approved" | "rejected";
    version?: number;
    generatedAt?: string;
    generatedBy?: string;
    provider?: "anthropic" | "openai" | "gemini" | "qwen";
    model?: string;
    manualOverride?: boolean;
    overrideBy?: string;
    overrideReason?: string;
    rawResponse?: any;
  }>(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ur_articles_status_published").on(table.status, table.publishedAt.desc()),
  index("idx_ur_articles_category_status").on(table.categoryId, table.status),
  index("idx_ur_articles_author_status").on(table.authorId, table.status),
  index("idx_ur_articles_type").on(table.articleType),
  index("idx_ur_articles_published_at").on(table.publishedAt.desc()),
  index("idx_ur_articles_english_slug").on(table.englishSlug),
]);

// Urdu Comments
export const urComments = pgTable("ur_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => urArticles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  status: text("status").default("pending").notNull(), // pending, approved, rejected, flagged
  parentId: varchar("parent_id"),
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationReason: text("moderation_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ur_comments_article_status").on(table.articleId, table.status),
  index("idx_ur_comments_user").on(table.userId),
]);

// Urdu Reactions
export const urReactions = pgTable("ur_reactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => urArticles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull().default("like"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ur_reactions_article").on(table.articleId),
  index("idx_ur_reactions_user_article").on(table.userId, table.articleId),
]);

// Urdu Bookmarks
export const urBookmarks = pgTable("ur_bookmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => urArticles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ur_bookmarks_user").on(table.userId, table.createdAt.desc()),
  index("idx_ur_bookmarks_article").on(table.articleId),
]);

// Urdu Reading History
export const urReadingHistory = pgTable("ur_reading_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  articleId: varchar("article_id").references(() => urArticles.id, { onDelete: "cascade" }).notNull(),
  readAt: timestamp("read_at").defaultNow().notNull(),
  readDuration: integer("read_duration"),
}, (table) => [
  index("idx_ur_reading_history_user").on(table.userId, table.readAt.desc()),
  index("idx_ur_reading_history_article").on(table.articleId),
]);

// ============================================
// URDU VERSION - INSERT SCHEMAS
// ============================================

export const insertUrCategorySchema = createInsertSchema(urCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Category name is required"),
  slug: z.string().min(1, "Slug is required"),
});

export const insertUrArticleSchema = createInsertSchema(urArticles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  views: true,
  authorId: true, // Backend adds this from req.user.id
}).extend({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  slug: z.string().min(1, "Slug is required"),
});

export const insertUrCommentSchema = createInsertSchema(urComments).omit({
  id: true,
  createdAt: true,
}).extend({
  content: z.string().min(1, "Comment content is required"),
});

export const insertUrReactionSchema = createInsertSchema(urReactions).omit({
  id: true,
  createdAt: true,
});

export const insertUrBookmarkSchema = createInsertSchema(urBookmarks).omit({
  id: true,
  createdAt: true,
});

export const insertUrReadingHistorySchema = createInsertSchema(urReadingHistory).omit({
  id: true,
  readAt: true,
});

// ============================================
// URDU VERSION - SELECT TYPES
// ============================================

export type UrCategory = typeof urCategories.$inferSelect;
export type InsertUrCategory = z.infer<typeof insertUrCategorySchema>;

export type UrArticle = typeof urArticles.$inferSelect;
export type InsertUrArticle = z.infer<typeof insertUrArticleSchema>;

export type UrComment = typeof urComments.$inferSelect;
export type InsertUrComment = z.infer<typeof insertUrCommentSchema>;

export type UrReaction = typeof urReactions.$inferSelect;
export type InsertUrReaction = z.infer<typeof insertUrReactionSchema>;

export type UrBookmark = typeof urBookmarks.$inferSelect;
export type InsertUrBookmark = z.infer<typeof insertUrBookmarkSchema>;

export type UrReadingHistory = typeof urReadingHistory.$inferSelect;
export type InsertUrReadingHistory = z.infer<typeof insertUrReadingHistorySchema>;

// Urdu Article with full details (similar to ArticleWithDetails for Arabic/English)
export type UrArticleWithDetails = UrArticle & {
  category?: UrCategory;
  author?: User;
  commentsCount?: number;
  reactionsCount?: number;
  isBookmarked?: boolean;
  hasReacted?: boolean;
};

export type UrCommentWithUser = UrComment & {
  user: User;
  replies?: UrCommentWithUser[];
};

// Urdu Smart Blocks
export const urSmartBlocks = pgTable("ur_smart_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 60 }).notNull(),
  keyword: varchar("keyword", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).notNull(),
  placement: varchar("placement", { length: 30 }).notNull(),
  layoutStyle: varchar("layout_style", { length: 20 }).notNull().default('grid'),
  limitCount: integer("limit_count").notNull().default(6),
  filters: jsonb("filters").$type<{
    categories?: string[];
    dateRange?: { from: string; to: string };
  }>(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ur_smart_blocks_keyword").on(table.keyword),
  index("idx_ur_smart_blocks_placement").on(table.placement),
  index("idx_ur_smart_blocks_active").on(table.isActive),
]);

export const urSmartBlocksRelations = relations(urSmartBlocks, ({ one }) => ({
  creator: one(users, {
    fields: [urSmartBlocks.createdBy],
    references: [users.id],
  }),
}));

export type UrSmartBlock = typeof urSmartBlocks.$inferSelect;
export const insertUrSmartBlockSchema = createInsertSchema(urSmartBlocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUrSmartBlock = z.infer<typeof insertUrSmartBlockSchema>;

// ============================================
// MEDIA LIBRARY (Arabic Version Only)
// ============================================

// Media Folders for organizing media files
export const mediaFolders = pgTable("media_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id").references((): any => mediaFolders.id, { onDelete: "cascade" }),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_media_folders_parent").on(table.parentId),
]);

// Media Files - main media library table
export const mediaFiles = pgTable("media_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  originalName: text("original_name").notNull(),
  folderId: varchar("folder_id").references(() => mediaFolders.id, { onDelete: "set null" }),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  type: text("type").notNull(), // image, video, document
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(), // in bytes
  width: integer("width"),
  height: integer("height"),
  
  // Metadata
  title: text("title"),
  description: text("description"),
  altText: text("alt_text"),
  caption: text("caption"),
  keywords: text("keywords").array().default(sql`ARRAY[]::text[]`),
  
  // AI Generation tracking
  isAiGenerated: boolean("is_ai_generated").default(false).notNull(),
  aiGenerationModel: text("ai_generation_model"), // gemini-3-pro, nano-banana-pro, etc.
  aiGenerationPrompt: text("ai_generation_prompt"), // The prompt used to generate the image

  // AI auto-tagging (Phase 2) — every library image is analyzed on upload to
  // fill keywords/altText/quality. Status drives the "بانتظار التحليل" collection
  // and the per-card badge. "skipped" = non-fetchable URL or non-library asset.
  aiAnalysisStatus: text("ai_analysis_status").default("pending"), // pending | done | failed | skipped
  aiAnalyzedAt: timestamp("ai_analyzed_at"),
  aiQualityScore: integer("ai_quality_score"), // 0-100
  aiHasSensitiveContent: boolean("ai_has_sensitive_content").default(false).notNull(),

  // Rights & credibility (Phase 6). isAiGenerated above already records AI
  // provenance; these capture licensing + a librarian's rights clearance.
  licenseType: text("license_type"), // own_work | agency | stock | creative_commons | public_domain | unknown
  creditText: text("credit_text"), // attribution line, e.g. "© واس"
  copyrightHolder: text("copyright_holder"),
  rightsVerified: boolean("rights_verified").default(false).notNull(), // a librarian confirmed usage rights
  rightsNote: text("rights_note"), // restrictions / expiry note

  // Organization
  isFavorite: boolean("is_favorite").default(false).notNull(),
  category: text("category"), // articles, logos, reporters, banners, general
  
  // Usage tracking
  usedIn: text("used_in").array().default(sql`ARRAY[]::text[]`), // Array of article IDs or entity IDs
  usageCount: integer("usage_count").default(0).notNull(),
  
  // Ownership
  uploadedBy: varchar("uploaded_by").references(() => users.id).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_media_files_folder").on(table.folderId),
  index("idx_media_files_uploaded_by").on(table.uploadedBy),
  index("idx_media_files_created_at").on(table.createdAt.desc()),
  index("idx_media_files_is_favorite").on(table.isFavorite),
  index("idx_media_files_category").on(table.category),
  index("idx_media_files_ai_status").on(table.aiAnalysisStatus),
  index("idx_media_files_rights_verified").on(table.rightsVerified),
]);

// Media Usage Log - track where and when media is used
export const mediaUsageLog = pgTable("media_usage_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  mediaId: varchar("media_id").references(() => mediaFiles.id, { onDelete: "cascade" }).notNull(),
  entityType: text("entity_type").notNull(), // article, user_profile, banner, etc.
  entityId: varchar("entity_id").notNull(),
  usedBy: varchar("used_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_media_usage_log_media").on(table.mediaId),
  index("idx_media_usage_log_entity").on(table.entityType, table.entityId),
]);

// Media vectors (embeddings for semantic search — Phase 3). Mirrors
// content_vectors for articles: 1536-dim text-embedding-3-large vector stored as
// jsonb; cosine similarity is computed in JS. Kept in a separate table so the
// large vector never loads in the common media list query.
export const mediaVectors = pgTable("media_vectors", {
  mediaFileId: varchar("media_file_id").primaryKey().references(() => mediaFiles.id, { onDelete: "cascade" }),
  embedding: jsonb("embedding").$type<number[]>(), // 1536-dim vector
  embeddingText: text("embedding_text"), // the source text the vector was built from
  embeddingModel: text("embedding_model").default("text-embedding-3-large"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_media_vectors_updated").on(table.updatedAt),
]);

// ============================================
// MEDIA LIBRARY - INSERT SCHEMAS
// ============================================

export const insertMediaFolderSchema = createInsertSchema(mediaFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Folder name is required"),
});

export const insertMediaFileSchema = createInsertSchema(mediaFiles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
}).extend({
  fileName: z.string().min(1, "File name is required"),
  url: z.string().url("Invalid URL"),
  type: z.enum(["image", "video", "document"]),
  size: z.number().positive("Size must be positive"),
});

export const insertMediaUsageLogSchema = createInsertSchema(mediaUsageLog).omit({
  id: true,
  createdAt: true,
}).extend({
  mediaId: z.string().min(1, "Media ID is required"),
  entityType: z.string().min(1, "Entity type is required"),
  entityId: z.string().min(1, "Entity ID is required"),
});

export const updateMediaFileSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  altText: z.string().optional(),
  caption: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  isFavorite: z.boolean().optional(),
  folderId: z.string().nullable().optional(),
  // Rights & credibility (Phase 6)
  licenseType: z.string().nullable().optional(),
  creditText: z.string().nullable().optional(),
  copyrightHolder: z.string().nullable().optional(),
  rightsVerified: z.boolean().optional(),
  rightsNote: z.string().nullable().optional(),
});

export const updateMediaFolderSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  parentId: z.string().nullable().optional(),
});

// ============================================
// MEDIA LIBRARY - SELECT TYPES
// ============================================

export type MediaFolder = typeof mediaFolders.$inferSelect;
export type InsertMediaFolder = z.infer<typeof insertMediaFolderSchema>;

export type MediaFile = typeof mediaFiles.$inferSelect;
export type InsertMediaFile = z.infer<typeof insertMediaFileSchema>;

export type MediaUsageLog = typeof mediaUsageLog.$inferSelect;
export type InsertMediaUsageLog = z.infer<typeof insertMediaUsageLogSchema>;

// Media File with additional details
export type MediaFileWithDetails = MediaFile & {
  folder?: MediaFolder;
  uploader?: User;
  usageHistory?: MediaUsageLog[];
};

// ============================================
// ADVERTISING SYSTEM - SMART AD PLATFORM
// ============================================

// Ad Accounts - حسابات المعلنين
export const adAccounts = pgTable("ad_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  companyName: text("company_name").notNull(),
  companyNameEn: text("company_name_en"),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone"),
  taxId: text("tax_id"), // الرقم الضريبي
  billingAddress: jsonb("billing_address").$type<{
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  }>(),
  status: text("status").default("active").notNull(), // active, suspended, closed
  accountType: text("account_type").default("standard").notNull(), // standard, premium, enterprise
  totalSpent: integer("total_spent").default(0).notNull().$type<number>(), // بالسنتات - using integer for compatibility
  totalBudget: integer("total_budget").$type<number>(), // حد الإنفاق الإجمالي (اختياري)
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ad_accounts_user").on(table.userId),
  index("idx_ad_accounts_status").on(table.status),
]);

// Campaigns - الحملات الإعلانية
export const campaigns = pgTable("campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  accountId: varchar("account_id").references(() => adAccounts.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  objective: text("objective").notNull(), // CPM, CPC, CPA
  status: text("status").default("draft").notNull(), // draft, pending_review, active, paused, completed, rejected
  dailyBudget: integer("daily_budget").notNull(), // عدد الظهورات اليومية المسموحة
  totalBudget: integer("total_budget").notNull(), // إجمالي الظهورات المسموحة
  spentBudget: integer("spent_budget").default(0).notNull(), // عدد الظهورات المستخدمة
  spentToday: integer("spent_today").default(0).notNull(), // عدد الظهورات المستخدمة اليوم
  lastResetDate: timestamp("last_reset_date").defaultNow(), // لإعادة تعيين عداد الظهورات اليومية
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  bidAmount: integer("bid_amount").notNull(), // للاحتفاظ بالتوافقية (غير مستخدم حالياً)
  
  // معلومات الموافقة
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_campaigns_account").on(table.accountId),
  index("idx_campaigns_status").on(table.status),
  index("idx_campaigns_objective").on(table.objective),
  index("idx_campaigns_dates").on(table.startDate, table.endDate),
]);

// Ad Groups - المجموعات الإعلانية
export const adGroups = pgTable("ad_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  
  // الاستهداف
  targetCountries: text("target_countries").array().default(sql`ARRAY['SA']::text[]`),
  targetDevices: text("target_devices").array().default(sql`ARRAY['desktop', 'mobile', 'tablet']::text[]`),
  targetCategories: text("target_categories").array().default(sql`ARRAY[]::text[]`), // IDs من جدول categories
  targetKeywords: text("target_keywords").array().default(sql`ARRAY[]::text[]`),
  
  status: text("status").default("active").notNull(), // active, paused
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ad_groups_campaign").on(table.campaignId),
  index("idx_ad_groups_status").on(table.status),
]);

// Creatives - الإعلانات (المحتوى الإعلاني)
export const creatives = pgTable("creatives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adGroupId: varchar("ad_group_id").references(() => adGroups.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // image, video, html, text
  content: text("content").notNull(), // URL للصورة/فيديو أو HTML code
  destinationUrl: text("destination_url").notNull(),
  size: text("size").notNull(), // "728x90", "300x250", etc.
  
  // معلومات إضافية
  title: text("title"), // للإعلانات النصية
  description: text("description"), // للإعلانات النصية
  callToAction: text("call_to_action"), // "اشتري الآن"، "سجل الآن"
  
  // الأداء المتوقع بواسطة AI
  predictedCTR: integer("predicted_ctr").default(0), // نسبة مئوية × 10000
  
  status: text("status").default("active").notNull(), // active, paused, rejected
  rejectionReason: text("rejection_reason"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_creatives_ad_group").on(table.adGroupId),
  index("idx_creatives_status").on(table.status),
  index("idx_creatives_type").on(table.type),
  index("idx_creatives_size").on(table.size),
]);

// Inventory Slots - أماكن العرض في الموقع
export const inventorySlots = pgTable("inventory_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  location: text("location").notNull(), // header, sidebar, footer, inline, between_articles
  size: text("size").notNull(), // "728x90", "300x250", etc.
  pageType: text("page_type").default("all").notNull(), // all, home, article, category
  deviceType: text("device_type").default("all").notNull(), // desktop, mobile, tablet, all
  isActive: boolean("is_active").default(true).notNull(),
  floorPrice: integer("floor_price").default(0), // الحد الأدنى للسعر بالسنتات
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_inventory_slots_location").on(table.location),
  index("idx_inventory_slots_size").on(table.size),
  index("idx_inventory_slots_active").on(table.isActive),
  index("idx_inventory_slots_device_type").on(table.deviceType),
]);

// Ad Creative Placements - ربط البنرات بأماكن العرض
export const adCreativePlacements = pgTable("ad_creative_placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  adGroupId: varchar("ad_group_id").references(() => adGroups.id, { onDelete: "cascade" }), // اختياري للاستهداف المتقدم
  creativeId: varchar("creative_id").references(() => creatives.id, { onDelete: "cascade" }).notNull(),
  inventorySlotId: varchar("inventory_slot_id").references(() => inventorySlots.id, { onDelete: "cascade" }).notNull(),
  
  // الجدولة والأولوية
  priority: integer("priority").default(5).notNull(), // 1-10 (أعلى رقم = أولوية أعلى)
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  status: text("status").default("scheduled").notNull(), // scheduled, active, paused, expired
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_placements_campaign").on(table.campaignId),
  index("idx_placements_creative").on(table.creativeId),
  index("idx_placements_slot").on(table.inventorySlotId),
  index("idx_placements_status").on(table.status),
  index("idx_placements_dates").on(table.startDate, table.endDate),
]);

// Impressions - المشاهدات
export const impressions = pgTable("impressions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creativeId: varchar("creative_id").references(() => creatives.id, { onDelete: "cascade" }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  slotId: varchar("slot_id").references(() => inventorySlots.id),
  
  // معلومات المستخدم
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  country: text("country").default("SA"),
  device: text("device"), // desktop, mobile, tablet
  
  // معلومات الصفحة
  pageUrl: text("page_url"),
  referrer: text("referrer"),
  
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_impressions_creative").on(table.creativeId),
  index("idx_impressions_campaign").on(table.campaignId),
  index("idx_impressions_slot").on(table.slotId),
  index("idx_impressions_timestamp").on(table.timestamp.desc()),
  index("idx_impressions_country").on(table.country),
  index("idx_impressions_device").on(table.device),
]);

// Clicks - النقرات
export const clicks = pgTable("clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  impressionId: varchar("impression_id").references(() => impressions.id),
  creativeId: varchar("creative_id").references(() => creatives.id, { onDelete: "cascade" }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  slotId: varchar("slot_id").references(() => inventorySlots.id),
  
  // معلومات المستخدم
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  country: text("country").default("SA"),
  device: text("device"),
  
  // معلومات الصفحة
  pageUrl: text("page_url"),
  referrer: text("referrer"),
  
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_clicks_impression").on(table.impressionId),
  index("idx_clicks_creative").on(table.creativeId),
  index("idx_clicks_campaign").on(table.campaignId),
  index("idx_clicks_slot").on(table.slotId),
  index("idx_clicks_timestamp").on(table.timestamp.desc()),
  index("idx_clicks_country").on(table.country),
  index("idx_clicks_device").on(table.device),
]);

// Conversions - التحويلات
export const conversions = pgTable("conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clickId: varchar("click_id").references(() => clicks.id),
  creativeId: varchar("creative_id").references(() => creatives.id, { onDelete: "cascade" }).notNull(),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  
  conversionType: text("conversion_type").notNull(), // purchase, signup, download, form_submit
  conversionValue: integer("conversion_value"), // قيمة التحويل بالسنتات (اختياري)
  
  // معلومات إضافية
  metadata: jsonb("metadata").$type<{
    orderId?: string;
    productId?: string;
    quantity?: number;
    [key: string]: any;
  }>(),
  
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_ad_conversions_click").on(table.clickId),
  index("idx_ad_conversions_creative").on(table.creativeId),
  index("idx_ad_conversions_campaign").on(table.campaignId),
  index("idx_ad_conversions_timestamp").on(table.timestamp.desc()),
  index("idx_ad_conversions_type").on(table.conversionType),
]);

// Daily Stats - الإحصائيات اليومية المحسوبة
export const dailyStats = pgTable("daily_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  creativeId: varchar("creative_id").references(() => creatives.id, { onDelete: "cascade" }),
  slotId: varchar("slot_id").references(() => inventorySlots.id),
  
  date: timestamp("date").notNull(),
  
  // المقاييس
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  conversions: integer("conversions").default(0).notNull(),
  spent: integer("spent").default(0).notNull(), // بالسنتات
  revenue: integer("revenue").default(0).notNull(), // بالسنتات (للناشر)
  
  // المقاييس المحسوبة (نسب مئوية × 10000)
  ctr: integer("ctr").default(0), // Click-Through Rate
  conversionRate: integer("conversion_rate").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_daily_stats_campaign").on(table.campaignId),
  index("idx_daily_stats_creative").on(table.creativeId),
  index("idx_daily_stats_slot").on(table.slotId),
  index("idx_daily_stats_date").on(table.date.desc()),
  // فهرس مركب لتحسين الاستعلامات
  index("idx_daily_stats_campaign_date").on(table.campaignId, table.date.desc()),
]);

// Budget History - سجل الميزانية
export const budgetHistory = pgTable("budget_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  amount: integer("amount").notNull(), // بالسنتات
  type: text("type").notNull(), // charge, refund, adjustment
  reason: text("reason"),
  performedBy: varchar("performed_by").references(() => users.id),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_budget_history_campaign").on(table.campaignId),
  index("idx_budget_history_timestamp").on(table.timestamp.desc()),
  index("idx_budget_history_type").on(table.type),
]);

// AI Recommendations - التوصيات الذكية
export const aiRecommendations = pgTable("ai_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }).notNull(),
  creativeId: varchar("creative_id").references(() => creatives.id, { onDelete: "cascade" }),
  
  type: text("type").notNull(), // budget_increase, budget_decrease, pause_ad, target_adjustment, bid_adjustment
  priority: text("priority").default("medium").notNull(), // low, medium, high, critical
  message: text("message").notNull(),
  
  // التوصية المفصلة
  recommendation: jsonb("recommendation").$type<{
    action?: string;
    currentValue?: any;
    suggestedValue?: any;
    reason?: string;
    expectedImpact?: string;
    [key: string]: any;
  }>(),
  
  confidence: integer("confidence").default(5000), // نسبة الثقة (0-10000)
  
  isRead: boolean("is_read").default(false).notNull(),
  isApplied: boolean("is_applied").default(false).notNull(),
  appliedAt: timestamp("applied_at"),
  appliedBy: varchar("applied_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_recommendations_campaign").on(table.campaignId),
  index("idx_ai_recommendations_creative").on(table.creativeId),
  index("idx_ai_recommendations_type").on(table.type),
  index("idx_ai_recommendations_priority").on(table.priority),
  index("idx_ai_recommendations_is_read").on(table.isRead),
  index("idx_ai_recommendations_created_at").on(table.createdAt.desc()),
]);

// Audit Logs - سجل التدقيق
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  entityType: text("entity_type").notNull(), // campaign, creative, ad_group, etc.
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(), // create, update, delete, approve, reject, pause, resume
  
  // التغييرات
  changes: jsonb("changes").$type<{
    before?: any;
    after?: any;
    [key: string]: any;
  }>(),
  
  // معلومات الطلب
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (table) => [
  index("idx_audit_logs_user").on(table.userId),
  index("idx_audit_logs_entity").on(table.entityType, table.entityId),
  index("idx_audit_logs_action").on(table.action),
  index("idx_audit_logs_timestamp").on(table.timestamp.desc()),
]);

// ============================================
// DATA-STORY GENERATOR SYSTEM
// ============================================

// Data story source files (uploaded datasets)
export const dataStorySources = pgTable("data_story_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(), // uploader
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // csv, excel, json
  fileSize: integer("file_size").notNull(), // bytes
  storageKey: text("storage_key").notNull(), // object storage path
  storageUrl: text("storage_url"), // public URL if needed
  
  // Parsing status
  parseStatus: text("parse_status").default("pending").notNull(), // pending, parsing, completed, failed
  parseError: text("parse_error"),
  parsedAt: timestamp("parsed_at"),
  
  // Dataset metadata (populated after parsing)
  rowCount: integer("row_count"),
  columnCount: integer("column_count"),
  columns: jsonb("columns").$type<{
    name: string;
    type: "number" | "string" | "date" | "boolean";
    sampleValues?: any[];
    uniqueCount?: number;
    nullCount?: number;
  }[]>(),
  
  // Preview data (first 10 rows)
  previewData: jsonb("preview_data"),
  
  status: text("status").default("active").notNull(), // active, archived, deleted
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Data story analyses (AI-generated insights)
export const dataStoryAnalyses = pgTable("data_story_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceId: varchar("source_id").references(() => dataStorySources.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Analysis status
  status: text("status").default("pending").notNull(), // pending, analyzing, completed, failed
  error: text("error"),
  
  // Statistical insights (computed locally)
  statistics: jsonb("statistics").$type<{
    summary?: {
      totalRows: number;
      totalColumns: number;
      numericColumns: number;
      categoricalColumns: number;
    };
    columnStats?: Record<string, {
      mean?: number;
      median?: number;
      min?: number;
      max?: number;
      stdDev?: number;
      topValues?: Array<{ value: any; count: number; percentage: number }>;
    }>;
  }>(),
  
  // AI-generated insights
  aiInsights: jsonb("ai_insights").$type<{
    keyFindings?: string[];
    trends?: string[];
    anomalies?: string[];
    recommendations?: string[];
    narrative?: string; // Arabic narrative summary
  }>(),
  
  // Chart configurations (for Recharts)
  chartConfigs: jsonb("chart_configs").$type<Array<{
    id: string;
    type: "bar" | "line" | "pie" | "area" | "scatter";
    title: string;
    description?: string;
    dataKey: string;
    xAxis?: string;
    yAxis?: string;
    data?: any[];
    config?: any;
  }>>(),
  
  // AI metadata
  aiProvider: text("ai_provider"), // openai, anthropic, gemini
  aiModel: text("ai_model"),
  tokensUsed: integer("tokens_used"),
  processingTime: integer("processing_time"), // milliseconds
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Data story drafts (AI-generated Arabic news stories)
export const dataStoryDrafts = pgTable("data_story_drafts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  analysisId: varchar("analysis_id").references(() => dataStoryAnalyses.id, { onDelete: 'cascade' }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  
  // Draft content
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  content: text("content").notNull(), // Main article content in Arabic
  excerpt: text("excerpt"),
  
  // Story structure
  outline: jsonb("outline").$type<{
    sections?: Array<{
      heading: string;
      content: string;
      dataReferences?: string[]; // references to charts/stats
    }>;
  }>(),
  
  // Status
  status: text("status").default("draft").notNull(), // draft, review, approved, published, converted_to_article
  
  // Link to published article (if converted)
  articleId: varchar("article_id").references(() => articles.id),
  convertedAt: timestamp("converted_at"),
  
  // AI metadata
  aiProvider: text("ai_provider"), // anthropic (Claude for Arabic)
  aiModel: text("ai_model"),
  tokensUsed: integer("tokens_used"),
  generationTime: integer("generation_time"), // milliseconds
  
  // Editor metadata
  editedBy: varchar("edited_by").references(() => users.id),
  editedAt: timestamp("edited_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// APPLE WALLET PASSES MANAGEMENT
// ============================================

// Apple Wallet Passes - Digital press card and loyalty card for users
export const walletPasses = pgTable("wallet_passes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  passType: text("pass_type").notNull().default('press'), // 'press' | 'loyalty'
  passTypeIdentifier: text("pass_type_identifier").notNull(), // e.g., pass.life.sabq.presscard
  serialNumber: text("serial_number").notNull().unique(),
  authenticationToken: text("authentication_token").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("wallet_passes_user_id_idx").on(table.userId),
  index("wallet_passes_type_idx").on(table.passType),
  uniqueIndex("wallet_passes_user_type_idx").on(table.userId, table.passType),
]);

// Apple Wallet Devices - Devices that have the pass installed
export const walletDevices = pgTable("wallet_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  passId: varchar("pass_id").notNull().references(() => walletPasses.id, { onDelete: 'cascade' }),
  deviceLibraryIdentifier: text("device_library_identifier").notNull(),
  pushToken: text("push_token").notNull(),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
}, (table) => [
  index("wallet_devices_pass_id_idx").on(table.passId),
  uniqueIndex("wallet_devices_unique_idx").on(table.passId, table.deviceLibraryIdentifier),
]);

// Apple Wallet Relations
export const walletPassesRelations = relations(walletPasses, ({ one, many }) => ({
  user: one(users, {
    fields: [walletPasses.userId],
    references: [users.id],
  }),
  devices: many(walletDevices),
}));

export const walletDevicesRelations = relations(walletDevices, ({ one }) => ({
  pass: one(walletPasses, {
    fields: [walletDevices.passId],
    references: [walletPasses.id],
  }),
}));

// Apple Wallet Types
export type WalletPass = typeof walletPasses.$inferSelect;
export type WalletDevice = typeof walletDevices.$inferSelect;

// Apple Wallet Zod Schemas
export const insertWalletPassSchema = createInsertSchema(walletPasses).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
}).extend({
  passType: z.enum(['press', 'loyalty']).optional(), // Validate passType is 'press' or 'loyalty'
});
export type InsertWalletPass = z.infer<typeof insertWalletPassSchema>;

export const insertWalletDeviceSchema = createInsertSchema(walletDevices).omit({
  id: true,
  registeredAt: true,
});
export type InsertWalletDevice = z.infer<typeof insertWalletDeviceSchema>;

// Data story relations
export const dataStorySourcesRelations = relations(dataStorySources, ({ one, many }) => ({
  user: one(users, {
    fields: [dataStorySources.userId],
    references: [users.id],
  }),
  analyses: many(dataStoryAnalyses),
}));

export const dataStoryAnalysesRelations = relations(dataStoryAnalyses, ({ one, many }) => ({
  source: one(dataStorySources, {
    fields: [dataStoryAnalyses.sourceId],
    references: [dataStorySources.id],
  }),
  user: one(users, {
    fields: [dataStoryAnalyses.userId],
    references: [users.id],
  }),
  drafts: many(dataStoryDrafts),
}));

export const dataStoryDraftsRelations = relations(dataStoryDrafts, ({ one }) => ({
  analysis: one(dataStoryAnalyses, {
    fields: [dataStoryDrafts.analysisId],
    references: [dataStoryAnalyses.id],
  }),
  user: one(users, {
    fields: [dataStoryDrafts.userId],
    references: [users.id],
  }),
  article: one(articles, {
    fields: [dataStoryDrafts.articleId],
    references: [articles.id],
  }),
  editedByUser: one(users, {
    fields: [dataStoryDrafts.editedBy],
    references: [users.id],
  }),
}));

// ============================================
// ADVERTISING SYSTEM - INSERT SCHEMAS
// ============================================

export const insertAdAccountSchema = createInsertSchema(adAccounts).omit({
  id: true,
  totalSpent: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  companyName: z.string().min(1, "اسم الشركة مطلوب"),
  contactEmail: z.string().email("البريد الإلكتروني غير صحيح"),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  id: true,
  spentBudget: true,
  spentToday: true,
  lastResetDate: true,
  reviewedBy: true,
  reviewedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "اسم الحملة مطلوب"),
  objective: z.enum(["CPM", "CPC", "CPA", "CPE"], { message: "نوع الحملة غير صحيح" }),
  dailyBudget: z.number().int().positive("عدد الظهورات اليومية يجب أن يكون موجباً"),
  totalBudget: z.number().int().positive("إجمالي الظهورات يجب أن يكون موجباً"),
  bidAmount: z.number().int().positive("القيمة يجب أن تكون موجبة").default(1),
  startDate: z.coerce.date(), // Accept ISO string and convert to date
  endDate: z.coerce.date().nullable().optional(), // Accept ISO string, optional, can be null
});

export const insertAdGroupSchema = createInsertSchema(adGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "اسم المجموعة مطلوب"),
});

export const insertCreativeSchema = createInsertSchema(creatives).omit({
  id: true,
  predictedCTR: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "اسم الإعلان مطلوب"),
  type: z.enum(["image", "video", "html", "text"], { message: "نوع الإعلان غير صحيح" }),
  content: z.string().min(1, "محتوى الإعلان مطلوب"),
  destinationUrl: z.string().url("الرابط غير صحيح"),
  size: z.string().min(1, "حجم الإعلان مطلوب"),
});

export const insertInventorySlotSchema = createInsertSchema(inventorySlots).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "اسم المكان مطلوب"),
  location: z.enum(["header", "sidebar", "footer", "inline", "between_articles"]),
  size: z.string().min(1, "الحجم مطلوب"),
  deviceType: z.enum(["desktop", "mobile", "tablet", "all"]).default("all"),
});

export const insertAdCreativePlacementSchema = createInsertSchema(adCreativePlacements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  campaignId: z.string().uuid("معرف الحملة غير صحيح"),
  creativeId: z.string().uuid("معرف البنر غير صحيح"),
  inventorySlotId: z.string().uuid("معرف مكان العرض غير صحيح"),
  priority: z.coerce.number().int().min(1, "الأولوية يجب أن تكون 1 على الأقل").max(10, "الأولوية لا يمكن أن تزيد عن 10").default(5),
  startDate: z.coerce.date({ message: "تاريخ البداية مطلوب" }),
  endDate: z.coerce.date({ message: "تاريخ النهاية غير صحيح" }).optional().nullable(),
  status: z.enum(["scheduled", "active", "paused", "expired"], { message: "الحالة غير صحيحة" }).default("scheduled"),
}).refine((data) => !data.endDate || data.endDate > data.startDate, {
  message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
  path: ["endDate"],
});

// ============================================
// ADVERTISING SYSTEM - SELECT TYPES
// ============================================

export type AdAccount = typeof adAccounts.$inferSelect;
export type InsertAdAccount = z.infer<typeof insertAdAccountSchema>;

export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;

export type AdGroup = typeof adGroups.$inferSelect;
export type InsertAdGroup = z.infer<typeof insertAdGroupSchema>;

export type Creative = typeof creatives.$inferSelect;
export type InsertCreative = z.infer<typeof insertCreativeSchema>;

export type InventorySlot = typeof inventorySlots.$inferSelect;
export type InsertInventorySlot = z.infer<typeof insertInventorySlotSchema>;

export type AdCreativePlacement = typeof adCreativePlacements.$inferSelect;
export type InsertAdCreativePlacement = z.infer<typeof insertAdCreativePlacementSchema>;

export type Impression = typeof impressions.$inferSelect;
export type Click = typeof clicks.$inferSelect;
export type Conversion = typeof conversions.$inferSelect;
export type DailyStat = typeof dailyStats.$inferSelect;
export type BudgetHistory = typeof budgetHistory.$inferSelect;
export type AIRecommendation = typeof aiRecommendations.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

// ============================================
// ADVERTISER PROFILES - حسابات المعلنين
// ============================================

export const advertiserProfiles = pgTable("advertiser_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // بيانات المعلن
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // hashed password
  name: text("name").notNull(),
  phone: text("phone"),
  company: text("company"),
  logo: text("logo"),
  
  // حالة الحساب
  isVerified: boolean("is_verified").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  
  // الإحصائيات الإجمالية
  totalAds: integer("total_ads").default(0).notNull(),
  totalSpent: integer("total_spent").default(0).notNull(), // بالهللات
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_advertiser_profiles_email").on(table.email),
  index("idx_advertiser_profiles_active").on(table.isActive),
]);

export const insertAdvertiserProfileSchema = createInsertSchema(advertiserProfiles).omit({
  id: true,
  isVerified: true,
  isActive: true,
  totalAds: true,
  totalSpent: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
  name: z.string().min(2, "الاسم مطلوب"),
  phone: z.string().optional(),
  company: z.string().optional(),
});

export type AdvertiserProfile = typeof advertiserProfiles.$inferSelect;
export type InsertAdvertiserProfile = z.infer<typeof insertAdvertiserProfileSchema>;

// ============================================
// NATIVE ADS - المحتوى المدفوع (Sponsored Content)
// ============================================

export const nativeAds = pgTable("native_ads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // المحتوى الأساسي
  title: text("title").notNull(), // عنوان الإعلان
  description: text("description"), // وصف مختصر
  imageUrl: text("image_url").notNull(), // صورة الإعلان
  destinationUrl: text("destination_url").notNull(), // رابط الوجهة
  callToAction: text("call_to_action").default("اقرأ المزيد"), // زر الإجراء (CTA)
  
  // معلومات المعلن
  advertiserName: text("advertiser_name").notNull(), // اسم المعلن
  advertiserLogo: text("advertiser_logo"), // شعار المعلن
  advertiserEmail: text("advertiser_email"), // بريد المعلن (للخدمة الذاتية)
  advertiserPhone: text("advertiser_phone"), // هاتف المعلن
  advertiserCompany: text("advertiser_company"), // اسم الشركة
  isSelfServe: boolean("is_self_serve").default(false).notNull(), // هل أنشأه المعلن بنفسه
  advertiserId: varchar("advertiser_id").references(() => advertiserProfiles.id, { onDelete: "set null" }), // ربط بحساب المعلن
  
  // الاستهداف
  targetCategories: text("target_categories").array(), // استهداف بالتصنيفات
  targetKeywords: text("target_keywords").array(), // استهداف بالكلمات المفتاحية
  targetDevices: text("target_devices").default("all").notNull(), // desktop, mobile, tablet, all
  
  // الجدولة والميزانية
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  dailyBudget: integer("daily_budget"), // الميزانية اليومية بالسنتات
  totalBudget: integer("total_budget"), // الميزانية الإجمالية بالسنتات
  costPerClick: integer("cost_per_click").default(100), // تكلفة النقرة بالسنتات
  
  // Daily budget controls
  dailyBudgetEnabled: boolean("daily_budget_enabled").default(false).notNull(),
  dailyBudgetExhaustedAt: timestamp("daily_budget_exhausted_at"), // When daily budget was hit (reset daily)
  dailyBudgetResetHour: integer("daily_budget_reset_hour").default(0).notNull(), // Hour in Saudi time (0-23) to reset budget
  
  // الإحصائيات
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  conversions: integer("conversions").default(0).notNull(),
  
  // الترتيب والأولوية
  priority: integer("priority").default(5).notNull(), // 1-10 (أعلى = أولوية أكبر)
  position: integer("position").default(0).notNull(), // ترتيب العرض
  
  // الحالة
  status: text("status").default("draft").notNull(), // draft, pending_approval, active, paused, expired, rejected
  rejectionReason: text("rejection_reason"),
  
  // الإنشاء والتعديل
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_native_ads_status").on(table.status),
  index("idx_native_ads_dates").on(table.startDate, table.endDate),
  index("idx_native_ads_priority").on(table.priority),
  index("idx_native_ads_device").on(table.targetDevices),
  index("idx_native_ads_advertiser").on(table.advertiserId),
]);

// إحصائيات المحتوى المدفوع
export const nativeAdImpressions = pgTable("native_ad_impressions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nativeAdId: varchar("native_ad_id").references(() => nativeAds.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  userId: varchar("user_id"),
  sessionId: text("session_id"),
  deviceType: text("device_type"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_native_impressions_ad").on(table.nativeAdId),
  index("idx_native_impressions_article").on(table.articleId),
  index("idx_native_impressions_date").on(table.createdAt),
]);

export const nativeAdClicks = pgTable("native_ad_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nativeAdId: varchar("native_ad_id").references(() => nativeAds.id, { onDelete: "cascade" }).notNull(),
  impressionId: varchar("impression_id").references(() => nativeAdImpressions.id, { onDelete: "set null" }),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  userId: varchar("user_id"),
  sessionId: text("session_id"),
  deviceType: text("device_type"),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_native_clicks_ad").on(table.nativeAdId),
  index("idx_native_clicks_impression").on(table.impressionId),
  index("idx_native_clicks_date").on(table.createdAt),
]);

// Daily spend tracking for budget enforcement
export const nativeAdDailySpend = pgTable("native_ad_daily_spend", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nativeAdId: varchar("native_ad_id").references(() => nativeAds.id, { onDelete: "cascade" }).notNull(),
  spendDate: date("spend_date").notNull(), // The date for this spend record (YYYY-MM-DD)
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  amountHalalas: integer("amount_halalas").default(0).notNull(), // Amount spent in halalas (cents)
  isCapped: boolean("is_capped").default(false).notNull(), // Whether daily budget was exceeded
  cappedAt: timestamp("capped_at"), // When the budget was exceeded
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_daily_spend_ad").on(table.nativeAdId),
  index("idx_daily_spend_date").on(table.spendDate),
  index("idx_daily_spend_ad_date").on(table.nativeAdId, table.spendDate),
]);

export const insertNativeAdDailySpendSchema = createInsertSchema(nativeAdDailySpend).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type NativeAdDailySpend = typeof nativeAdDailySpend.$inferSelect;
export type InsertNativeAdDailySpend = z.infer<typeof insertNativeAdDailySpendSchema>;

// Insert schemas
export const insertNativeAdSchema = createInsertSchema(nativeAds).omit({
  id: true,
  impressions: true,
  clicks: true,
  conversions: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "عنوان الإعلان مطلوب").max(100, "العنوان طويل جداً"),
  description: z.string().max(200, "الوصف طويل جداً").optional(),
  imageUrl: z.string().refine(
    (val) => val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/api/media/proxy/") || val.startsWith("/uploads/") || val.startsWith("/public-objects/"),
    { message: "رابط الصورة غير صحيح" }
  ),
  advertiserLogo: z.string().refine(
    (val) => !val || val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/api/media/proxy/") || val.startsWith("/uploads/") || val.startsWith("/public-objects/"),
    { message: "رابط شعار المعلن غير صحيح" }
  ).optional().nullable(),
  destinationUrl: z.string().url("رابط الوجهة غير صحيح"),
  callToAction: z.string().max(30, "زر الإجراء طويل جداً").optional(),
  advertiserName: z.string().min(1, "اسم المعلن مطلوب"),
  advertiserEmail: z.string().email("البريد الإلكتروني غير صحيح").optional().nullable(),
  advertiserPhone: z.string().max(20, "رقم الهاتف طويل جداً").optional().nullable(),
  advertiserCompany: z.string().max(100, "اسم الشركة طويل جداً").optional().nullable(),
  isSelfServe: z.boolean().default(false),
  targetCategories: z.array(z.string()).optional(),
  targetKeywords: z.array(z.string()).optional(),
  targetDevices: z.enum(["desktop", "mobile", "tablet", "all"]).default("all"),
  startDate: z.coerce.date({ message: "تاريخ البداية مطلوب" }),
  endDate: z.coerce.date().optional().nullable(),
  priority: z.coerce.number().int().min(1).max(10).default(5),
  status: z.enum(["draft", "pending_approval", "active", "paused", "expired", "rejected"]).default("draft"),
});

// Types
export type NativeAd = typeof nativeAds.$inferSelect;
export type InsertNativeAd = z.infer<typeof insertNativeAdSchema>;
export type NativeAdImpression = typeof nativeAdImpressions.$inferSelect;
export type NativeAdClick = typeof nativeAdClicks.$inferSelect;

// Campaign with additional details
export type CampaignWithDetails = Campaign & {
  account?: AdAccount;
  adGroups?: AdGroup[];
  stats?: {
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    ctr: number;
    conversionRate: number;
  };
  recommendations?: AIRecommendation[];
};

// ============================================
// DATA-STORY GENERATOR - INSERT SCHEMAS
// ============================================

export const insertDataStorySourceSchema = createInsertSchema(dataStorySources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  columns: columnsSchema,
  previewData: previewDataSchema,
});

export const insertDataStoryAnalysisSchema = createInsertSchema(dataStoryAnalyses).omit({
  id: true,
  createdAt: true,
  completedAt: true,
}).extend({
  statistics: statisticsSchema,
  aiInsights: aiInsightsSchema,
  chartConfigs: chartConfigsSchema,
});

export const insertDataStoryDraftSchema = createInsertSchema(dataStoryDrafts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "عنوان القصة مطلوب"),
  content: z.string().min(10, "محتوى القصة مطلوب"),
  outline: outlineSchema,
});

// ============================================
// DATA-STORY GENERATOR - SELECT TYPES
// ============================================

export type DataStorySource = typeof dataStorySources.$inferSelect;
export type InsertDataStorySource = z.infer<typeof insertDataStorySourceSchema>;

export type DataStoryAnalysis = typeof dataStoryAnalyses.$inferSelect;
export type InsertDataStoryAnalysis = z.infer<typeof insertDataStoryAnalysisSchema>;

export type DataStoryDraft = typeof dataStoryDrafts.$inferSelect;
export type InsertDataStoryDraft = z.infer<typeof insertDataStoryDraftSchema>;

// Combined type with relations
export type DataStoryWithDetails = DataStorySource & {
  analyses?: (DataStoryAnalysis & {
    drafts?: DataStoryDraft[];
  })[];
};

// ============================================
// SMART JOURNALIST AGENT - TABLES
// ============================================

export const journalistTasks = pgTable("journalist_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  prompt: text("prompt").notNull(), // The journalist's request
  
  // Status tracking
  status: text("status").default("pending").notNull(), // pending, processing, completed, failed
  progress: text("progress"), // Current step description
  progressStep: integer("progress_step").default(0).notNull(), // 0-5 (research, analysis, writing, media, headlines)
  
  // Results
  results: jsonb("results").$type<{
    research?: {
      sources: Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
      summary: string;
    };
    analysis?: {
      keyPoints: string[];
      mainTheme: string;
      suggestedAngle: string;
    };
    draft?: {
      title: string;
      content: string;
      wordCount: number;
    };
    images?: Array<{
      url: string;
      description: string;
      source: string;
      license: string;
    }>;
    headlines?: Array<{
      text: string;
      style: string; // formal, casual, clickbait, seo
      aiModel: string;
    }>;
  }>(),
  
  // AI metadata
  aiProviders: text("ai_providers").array(), // List of AI providers used
  totalTokens: integer("total_tokens").default(0),
  processingTime: integer("processing_time"), // Total processing time in milliseconds
  
  // Error handling
  errorMessage: text("error_message"),
  errorStep: text("error_step"),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Journalist tasks relations
export const journalistTasksRelations = relations(journalistTasks, ({ one }) => ({
  user: one(users, {
    fields: [journalistTasks.userId],
    references: [users.id],
  }),
}));

// ============================================
// SMART JOURNALIST AGENT - INSERT SCHEMAS
// ============================================

export const insertJournalistTaskSchema = createInsertSchema(journalistTasks).omit({
  id: true,
  status: true,
  progress: true,
  progressStep: true,
  results: true,
  aiProviders: true,
  totalTokens: true,
  processingTime: true,
  errorMessage: true,
  errorStep: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  updatedAt: true,
}).extend({
  prompt: z.string().min(10, "الطلب يجب أن يكون 10 أحرف على الأقل").max(2000, "الطلب يجب ألا يتجاوز 2000 حرف"),
});

// ============================================
// SMART JOURNALIST AGENT - SELECT TYPES
// ============================================

export type JournalistTask = typeof journalistTasks.$inferSelect;
export type InsertJournalistTask = z.infer<typeof insertJournalistTaskSchema>;

// ============================================
// SOCIAL SHARING - SHORT LINKS TABLE
// ============================================

export const shortLinks = pgTable("short_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shortCode: varchar("short_code", { length: 12 }).notNull().unique(), // e.g., "a1b2c3"
  originalUrl: text("original_url").notNull(),
  
  // UTM parameters for tracking
  utmSource: text("utm_source"), // e.g., "twitter", "whatsapp", "facebook"
  utmMedium: text("utm_medium"), // e.g., "social" - set in service logic
  utmCampaign: text("utm_campaign"), // e.g., "breaking_news"
  utmContent: text("utm_content"), // optional additional tracking
  
  // Metadata
  articleId: varchar("article_id").references(() => articles.id, { onDelete: 'set null' }),
  createdBy: varchar("created_by").references(() => users.id),
  
  // Analytics
  clickCount: integer("click_count").default(0).notNull(),
  lastClickedAt: timestamp("last_clicked_at"),
  
  // Lifecycle
  expiresAt: timestamp("expires_at"), // optional expiration
  isActive: boolean("is_active").default(true).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_short_links_code").on(table.shortCode),
  index("idx_short_links_article_active").on(table.articleId, table.isActive),
  index("idx_short_links_created").on(table.createdAt.desc()),
]);

// Short links relations
export const shortLinksRelations = relations(shortLinks, ({ one }) => ({
  article: one(articles, {
    fields: [shortLinks.articleId],
    references: [articles.id],
  }),
  creator: one(users, {
    fields: [shortLinks.createdBy],
    references: [users.id],
  }),
}));

// ============================================
// SOCIAL SHARING - CLICK TRACKING TABLE
// ============================================

export const shortLinkClicks = pgTable("short_link_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shortLinkId: varchar("short_link_id").references(() => shortLinks.id, { onDelete: 'cascade' }).notNull(),
  
  // Click details
  clickedAt: timestamp("clicked_at").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  referer: text("referer"),
  
  // Geolocation (optional)
  country: text("country"),
  city: text("city"),
  
  // User tracking (if logged in)
  userId: varchar("user_id").references(() => users.id),
}, (table) => [
  index("idx_short_link_clicks_link").on(table.shortLinkId),
  index("idx_short_link_clicks_date").on(table.clickedAt.desc()),
]);

// Short link clicks relations
export const shortLinkClicksRelations = relations(shortLinkClicks, ({ one }) => ({
  shortLink: one(shortLinks, {
    fields: [shortLinkClicks.shortLinkId],
    references: [shortLinks.id],
  }),
  user: one(users, {
    fields: [shortLinkClicks.userId],
    references: [users.id],
  }),
}));

// ============================================
// SOCIAL SHARING - INSERT SCHEMAS
// ============================================

export const insertShortLinkSchema = createInsertSchema(shortLinks).omit({
  id: true,
  shortCode: true, // auto-generated
  clickCount: true,
  lastClickedAt: true,
  createdAt: true,
}).extend({
  originalUrl: z.string().url("يجب أن يكون رابط صالح"),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  articleId: z.string().optional(),
});

export const insertShortLinkClickSchema = createInsertSchema(shortLinkClicks).omit({
  id: true,
  clickedAt: true,
});

// ============================================
// SOCIAL SHARING - SELECT TYPES
// ============================================

export type ShortLink = typeof shortLinks.$inferSelect;
export type InsertShortLink = z.infer<typeof insertShortLinkSchema>;
export type ShortLinkClick = typeof shortLinkClicks.$inferSelect;
export type InsertShortLinkClick = z.infer<typeof insertShortLinkClickSchema>;

// ============================================
// DEEP ANALYSIS SYSTEM
// ============================================

export const deepAnalyses = pgTable("deep_analyses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Core fields
  title: text("title").notNull(),
  topic: text("topic").notNull(),
  description: text("description"),
  
  // Context & Configuration
  categoryId: varchar("category_id").references(() => categories.id),
  reporterId: varchar("reporter_id").references(() => users.id),
  keywords: text("keywords").array().default(sql`ARRAY[]::text[]`).notNull(),
  analysisDepth: text("analysis_depth").default("deep").notNull(), // short, deep, expert
  analysisType: text("analysis_type").default("comprehensive").notNull(), // economic, political, technical, social, comprehensive
  
  // AI Configuration
  useMultiModel: boolean("use_multi_model").default(true).notNull(),
  modelsUsed: text("models_used").array().default(sql`ARRAY['openai', 'gemini']::text[]`).notNull(), // openai, anthropic, gemini
  
  // Analysis Outputs
  gptAnalysis: text("gpt_analysis"),
  geminiAnalysis: text("gemini_analysis"),
  claudeAnalysis: text("claude_analysis"),
  mergedAnalysis: text("merged_analysis"),
  executiveSummary: text("executive_summary"),
  recommendations: text("recommendations"),
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id).notNull(),
  status: text("status").default("draft").notNull(), // draft, completed, published, archived
  generationTime: integer("generation_time"), // milliseconds
  
  // SEO & Keywords (AI-generated)
  aiKeywords: text("ai_keywords").array().default(sql`ARRAY[]::text[]`).notNull(),
  smartEntities: jsonb("smart_entities").$type<{
    persons?: string[];
    organizations?: string[];
    locations?: string[];
  }>(),
  
  // Model comparison insights
  modelInsights: jsonb("model_insights").$type<{
    gptScore?: number;
    geminiScore?: number;
    claudeScore?: number;
    comparisonNotes?: string;
  }>(),
  
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_deep_analyses_created_by").on(table.createdBy),
  index("idx_deep_analyses_status").on(table.status),
  index("idx_deep_analyses_category").on(table.categoryId),
  index("idx_deep_analyses_created_at").on(table.createdAt.desc()),
]);

// Deep analysis metrics (one-to-one with deep_analyses)
export const deepAnalysisMetrics = pgTable("deep_analysis_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  analysisId: varchar("analysis_id").references(() => deepAnalyses.id, { onDelete: "cascade" }).notNull().unique(),
  views: integer("views").default(0).notNull(),
  shares: integer("shares").default(0).notNull(),
  downloads: integer("downloads").default(0).notNull(),
  exportsPdf: integer("exports_pdf").default(0).notNull(),
  exportsDocx: integer("exports_docx").default(0).notNull(),
  lastViewedAt: timestamp("last_viewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_deep_analysis_metrics_analysis_id").on(table.analysisId),
]);

// Deep analysis events (append-only log)
export const deepAnalysisEvents = pgTable("deep_analysis_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  analysisId: varchar("analysis_id").references(() => deepAnalyses.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id), // nullable for anonymous visitors
  eventType: text("event_type").notNull(), // 'view', 'share', 'download', 'export_pdf', 'export_docx'
  metadata: jsonb("metadata").$type<{
    userAgent?: string;
    ipAddress?: string;
    referrer?: string;
    shareTarget?: string; // twitter, facebook, whatsapp, etc.
    downloadFormat?: string;
    [key: string]: any;
  }>(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("idx_deep_analysis_events_analysis_id").on(table.analysisId),
  index("idx_deep_analysis_events_user_id").on(table.userId),
  index("idx_deep_analysis_events_event_type").on(table.eventType),
  index("idx_deep_analysis_events_occurred_at").on(table.occurredAt.desc()),
]);

// Deep analyses relations
export const deepAnalysesRelations = relations(deepAnalyses, ({ one, many }) => ({
  category: one(categories, {
    fields: [deepAnalyses.categoryId],
    references: [categories.id],
  }),
  reporter: one(users, {
    fields: [deepAnalyses.reporterId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [deepAnalyses.createdBy],
    references: [users.id],
  }),
  metrics: one(deepAnalysisMetrics, {
    fields: [deepAnalyses.id],
    references: [deepAnalysisMetrics.analysisId],
  }),
  events: many(deepAnalysisEvents),
}));

// Deep analysis metrics relations
export const deepAnalysisMetricsRelations = relations(deepAnalysisMetrics, ({ one }) => ({
  analysis: one(deepAnalyses, {
    fields: [deepAnalysisMetrics.analysisId],
    references: [deepAnalyses.id],
  }),
}));

// Deep analysis events relations
export const deepAnalysisEventsRelations = relations(deepAnalysisEvents, ({ one }) => ({
  analysis: one(deepAnalyses, {
    fields: [deepAnalysisEvents.analysisId],
    references: [deepAnalyses.id],
  }),
  user: one(users, {
    fields: [deepAnalysisEvents.userId],
    references: [users.id],
  }),
}));

// Deep analyses insert schema
export const insertDeepAnalysisSchema = createInsertSchema(deepAnalyses).omit({
  id: true,
  gptAnalysis: true,
  geminiAnalysis: true,
  claudeAnalysis: true,
  mergedAnalysis: true,
  executiveSummary: true,
  recommendations: true,
  aiKeywords: true,
  generationTime: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(3, "يجب أن يكون العنوان 3 أحرف على الأقل"),
  topic: z.string().min(10, "يجب أن يكون الموضوع 10 أحرف على الأقل"),
  analysisDepth: z.enum(["short", "deep", "expert"]).default("deep"),
  analysisType: z.enum(["economic", "political", "technical", "social", "comprehensive"]).default("comprehensive"),
});

// Deep analyses select types
export type DeepAnalysis = typeof deepAnalyses.$inferSelect;
export type InsertDeepAnalysis = z.infer<typeof insertDeepAnalysisSchema>;

// Deep analysis metrics insert schema
export const insertDeepAnalysisMetricsSchema = createInsertSchema(deepAnalysisMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  analysisId: z.string().uuid("يجب أن يكون معرف التحليل صالح"),
});

// Deep analysis metrics select types
export type DeepAnalysisMetrics = typeof deepAnalysisMetrics.$inferSelect;
export type InsertDeepAnalysisMetrics = z.infer<typeof insertDeepAnalysisMetricsSchema>;

// Deep analysis events insert schema
export const insertDeepAnalysisEventSchema = createInsertSchema(deepAnalysisEvents).omit({
  id: true,
  occurredAt: true,
}).extend({
  analysisId: z.string().uuid("يجب أن يكون معرف التحليل صالح"),
  userId: z.string().uuid("يجب أن يكون معرف المستخدم صالح").optional(),
  eventType: z.enum(["view", "share", "download", "export_pdf", "export_docx"], {
    errorMap: () => ({ message: "نوع الحدث غير صالح" }),
  }),
});

// Deep analysis events select types
export type DeepAnalysisEvent = typeof deepAnalysisEvents.$inferSelect;
export type InsertDeepAnalysisEvent = z.infer<typeof insertDeepAnalysisEventSchema>;

// ============================================
// TASK MANAGEMENT SYSTEM
// ============================================

// Tasks table
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("todo").notNull(), // todo, in_progress, review, completed, archived
  priority: text("priority").default("medium").notNull(), // low, medium, high, critical
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  
  // Assignment
  createdById: varchar("created_by_id").references(() => users.id).notNull(),
  assignedToId: varchar("assigned_to_id").references(() => users.id),
  parentTaskId: varchar("parent_task_id"),
  
  // Categorization
  department: text("department"), // تحرير، تقنية، سوشيال، فيديو
  category: text("category"), // Custom tags/categories
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  
  // AI-powered fields
  aiSuggestions: jsonb("ai_suggestions").$type<{
    suggestedAssignee?: string;
    suggestedDuration?: number; // in minutes
    suggestedSubtasks?: string[];
    confidenceScore?: number;
  }>(),
  estimatedDuration: integer("estimated_duration"), // in minutes
  actualDuration: integer("actual_duration"), // in minutes
  
  // Progress tracking
  progress: integer("progress").default(0).notNull(), // 0-100
  
  // Metadata
  attachmentsCount: integer("attachments_count").default(0).notNull(),
  subtasksCount: integer("subtasks_count").default(0).notNull(),
  commentsCount: integer("comments_count").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("tasks_status_idx").on(table.status),
  index("tasks_priority_idx").on(table.priority),
  index("tasks_assigned_to_idx").on(table.assignedToId),
  index("tasks_created_by_idx").on(table.createdById),
  index("tasks_due_date_idx").on(table.dueDate),
  index("tasks_parent_task_idx").on(table.parentTaskId),
]);

// Subtasks table
export const subtasks = pgTable("subtasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  completedById: varchar("completed_by_id").references(() => users.id),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("subtasks_task_idx").on(table.taskId),
]);

// Task comments table
export const taskComments = pgTable("task_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("task_comments_task_idx").on(table.taskId),
  index("task_comments_user_idx").on(table.userId),
]);

// Task attachments table
export const taskAttachments = pgTable("task_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"), // in bytes
  fileType: text("file_type"), // image, document, video, etc.
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("task_attachments_task_idx").on(table.taskId),
]);

// Task activity log table
export const taskActivityLog = pgTable("task_activity_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: varchar("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // created, updated, status_changed, assigned, commented, etc.
  changes: jsonb("changes").$type<{
    field?: string;
    oldValue?: any;
    newValue?: any;
    description?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("task_activity_task_idx").on(table.taskId),
  index("task_activity_user_idx").on(table.userId),
]);

// Task relations
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [tasks.createdById],
    references: [users.id],
    relationName: "tasksCreated",
  }),
  assignedTo: one(users, {
    fields: [tasks.assignedToId],
    references: [users.id],
    relationName: "tasksAssigned",
  }),
  parentTask: one(tasks, {
    fields: [tasks.parentTaskId],
    references: [tasks.id],
    relationName: "taskHierarchy",
  }),
  childTasks: many(tasks, {
    relationName: "taskHierarchy",
  }),
  subtasks: many(subtasks),
  comments: many(taskComments),
  attachments: many(taskAttachments),
  activityLog: many(taskActivityLog),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, {
    fields: [subtasks.taskId],
    references: [tasks.id],
  }),
  completedBy: one(users, {
    fields: [subtasks.completedById],
    references: [users.id],
  }),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskComments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskComments.userId],
    references: [users.id],
  }),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAttachments.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskAttachments.userId],
    references: [users.id],
  }),
}));

export const taskActivityLogRelations = relations(taskActivityLog, ({ one }) => ({
  task: one(tasks, {
    fields: [taskActivityLog.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [taskActivityLog.userId],
    references: [users.id],
  }),
}));

// Task insert schemas
export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  attachmentsCount: true,
  subtasksCount: true,
  commentsCount: true,
  completedAt: true,
  actualDuration: true,
  progress: true,
}).extend({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "review", "completed", "archived"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  createdById: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  assignedToId: z.string().optional(),
  parentTaskId: z.string().optional(),
  department: z.string().optional(),
  category: z.string().optional(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  estimatedDuration: z.number().int().positive().optional(),
});

export const insertSubtaskSchema = createInsertSchema(subtasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  completedById: true,
  displayOrder: true,
}).extend({
  taskId: z.string().uuid("معرف المهمة غير صالح"),
  title: z.string().min(1, "العنوان مطلوب"),
  description: z.string().optional(),
});

export const insertTaskCommentSchema = createInsertSchema(taskComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  taskId: z.string().uuid("معرف المهمة غير صالح"),
  userId: z.string().uuid("معرف المستخدم غير صالح"),
  content: z.string().min(1, "التعليق مطلوب"),
});

export const insertTaskAttachmentSchema = createInsertSchema(taskAttachments).omit({
  id: true,
  createdAt: true,
}).extend({
  taskId: z.string().uuid("معرف المهمة غير صالح"),
  userId: z.string().uuid("معرف المستخدم غير صالح"),
  fileName: z.string().min(1, "اسم الملف مطلوب"),
  fileUrl: z.string().url("رابط الملف غير صالح"),
  fileSize: z.number().int().positive().optional(),
  fileType: z.string().optional(),
});

// Task select types
export type Task = typeof tasks.$inferSelect & {
  subtasksCount?: number;
};
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Subtask = typeof subtasks.$inferSelect;
export type InsertSubtask = z.infer<typeof insertSubtaskSchema>;
export type TaskComment = typeof taskComments.$inferSelect;
export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;
export type TaskAttachment = typeof taskAttachments.$inferSelect;
export type InsertTaskAttachment = z.infer<typeof insertTaskAttachmentSchema>;
export type TaskActivityLogEntry = typeof taskActivityLog.$inferSelect;

// ============================================
// EMAIL AGENT SYSTEM
// ============================================

// Trusted senders for email-to-publish automation
export const trustedEmailSenders = pgTable("trusted_email_senders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  
  // Reporter assignment - link to actual reporter user in database
  reporterUserId: varchar("reporter_user_id").references(() => users.id),
  
  token: text("token").notNull().unique(), // Secret token for additional verification
  status: text("status").default("active").notNull(), // active, suspended, revoked
  
  // Auto-publish settings
  autoPublish: boolean("auto_publish").default(true).notNull(), // true = auto-publish, false = save as draft
  defaultCategory: varchar("default_category").references(() => categories.id),
  
  // Language support
  language: text("language").default("ar").notNull(), // ar, en, ur
  
  // Security settings
  requireTokenInSubject: boolean("require_token_in_subject").default(true).notNull(),
  requireTokenInBody: boolean("require_token_in_body").default(false).notNull(),
  ipWhitelist: text("ip_whitelist").array(), // Optional IP restrictions
  
  // Stats
  totalEmailsReceived: integer("total_emails_received").default(0).notNull(),
  totalArticlesPublished: integer("total_articles_published").default(0).notNull(),
  totalArticlesDrafted: integer("total_articles_drafted").default(0).notNull(),
  totalEmailsRejected: integer("total_emails_rejected").default(0).notNull(),
  lastEmailAt: timestamp("last_email_at"),
  
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Email webhook logs (all incoming emails)
export const emailWebhookLogs = pgTable("email_webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Email details
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  subject: text("subject").notNull(),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  
  // Attachments info
  attachmentsCount: integer("attachments_count").default(0).notNull(),
  attachmentsData: jsonb("attachments_data").$type<Array<{
    filename: string;
    contentType: string;
    size: number;
    url?: string; // Uploaded to storage
  }>>(),
  
  // Processing status
  status: text("status").default("received").notNull(), // received, processing, published, drafted, rejected, failed
  processingError: text("processing_error"),
  rejectionReason: text("rejection_reason"), // Why email was rejected
  
  // Security verification
  senderVerified: boolean("sender_verified").default(false).notNull(),
  tokenVerified: boolean("token_verified").default(false).notNull(),
  trustedSenderId: varchar("trusted_sender_id").references(() => trustedEmailSenders.id, { onDelete: "set null" }),
  
  // AI Analysis results
  aiAnalysis: jsonb("ai_analysis").$type<{
    contentQuality?: number; // 0-100
    languageDetected?: string;
    categoryPredicted?: string;
    isNewsWorthy?: boolean;
    suggestedTitle?: string;
    suggestedSummary?: string;
    errors?: string[];
    warnings?: string[];
  }>(),
  
  // Result
  articleId: varchar("article_id").references(() => articles.id),
  publishedAt: timestamp("published_at"),
  
  // Metadata
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

// Email agent statistics and reports
export const emailAgentStats = pgTable("email_agent_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(), // Daily stats
  
  // Counts
  emailsReceived: integer("emails_received").default(0).notNull(),
  emailsPublished: integer("emails_published").default(0).notNull(),
  emailsDrafted: integer("emails_drafted").default(0).notNull(),
  emailsRejected: integer("emails_rejected").default(0).notNull(),
  emailsFailed: integer("emails_failed").default(0).notNull(),
  
  // Processing metrics
  avgProcessingTime: integer("avg_processing_time"), // milliseconds
  avgContentQuality: real("avg_content_quality"), // 0-100
  
  // By language
  arabicCount: integer("arabic_count").default(0).notNull(),
  englishCount: integer("english_count").default(0).notNull(),
  urduCount: integer("urdu_count").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("email_agent_stats_date_idx").on(table.date),
]);

// Relations
export const trustedEmailSendersRelations = relations(trustedEmailSenders, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [trustedEmailSenders.createdBy],
    references: [users.id],
  }),
  reporterUser: one(users, {
    fields: [trustedEmailSenders.reporterUserId],
    references: [users.id],
  }),
  webhookLogs: many(emailWebhookLogs),
  category: one(categories, {
    fields: [trustedEmailSenders.defaultCategory],
    references: [categories.id],
  }),
}));

export const emailWebhookLogsRelations = relations(emailWebhookLogs, ({ one }) => ({
  trustedSender: one(trustedEmailSenders, {
    fields: [emailWebhookLogs.trustedSenderId],
    references: [trustedEmailSenders.id],
  }),
  article: one(articles, {
    fields: [emailWebhookLogs.articleId],
    references: [articles.id],
  }),
}));

// Insert schemas
export const insertTrustedEmailSenderSchema = createInsertSchema(trustedEmailSenders).omit({
  id: true,
  totalEmailsReceived: true,
  totalArticlesPublished: true,
  totalArticlesDrafted: true,
  totalEmailsRejected: true,
  lastEmailAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  token: z.string().min(16, "الرمز السري يجب أن يكون 16 حرف على الأقل"),
  language: z.enum(["ar", "en", "ur"]).default("ar"),
  status: z.enum(["active", "suspended", "revoked"]).default("active"),
});

export const insertEmailWebhookLogSchema = createInsertSchema(emailWebhookLogs).omit({
  id: true,
  receivedAt: true,
  processedAt: true,
});

// Select types
export type TrustedEmailSender = typeof trustedEmailSenders.$inferSelect;
export type InsertTrustedEmailSender = z.infer<typeof insertTrustedEmailSenderSchema>;
export type EmailWebhookLog = typeof emailWebhookLogs.$inferSelect;
export type InsertEmailWebhookLog = z.infer<typeof insertEmailWebhookLogSchema>;
export type EmailAgentStats = typeof emailAgentStats.$inferSelect;

// ============================================
// WHATSAPP INTEGRATION
// ============================================

// WhatsApp Tokens - for secure WhatsApp webhook integration
export const whatsappTokens = pgTable("whatsapp_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: text("token").notNull().unique(),
  label: text("label"),
  phoneNumber: text("phone_number").notNull(),
  autoPublish: boolean("auto_publish").default(false).notNull(),
  allowedLanguages: text("allowed_languages").array().default(sql`ARRAY['ar']::text[]`).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // Advanced permissions for WhatsApp users
  isAdmin: boolean("is_admin").default(false).notNull(), // Full admin privileges (Editor-in-Chief)
  canDeleteAny: boolean("can_delete_any").default(false).notNull(), // Can delete any article
  canArchiveAny: boolean("can_archive_any").default(false).notNull(), // Can archive any article
  canEditAny: boolean("can_edit_any").default(false).notNull(), // Can edit any article
  canMarkBreaking: boolean("can_mark_breaking").default(false).notNull(), // Can mark articles as breaking news
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  usageCount: integer("usage_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("whatsapp_tokens_user_id_idx").on(table.userId),
  index("whatsapp_tokens_phone_number_idx").on(table.phoneNumber),
]);

// WhatsApp Webhook Logs - track all incoming WhatsApp messages
export const whatsappWebhookLogs = pgTable("whatsapp_webhook_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  from: text("from").notNull(),
  message: text("message"),
  mediaUrls: text("media_urls").array(),
  token: text("token"),
  tokenId: varchar("token_id").references(() => whatsappTokens.id),
  userId: varchar("user_id").references(() => users.id),
  articleId: varchar("article_id").references(() => articles.id),
  articleLink: text("article_link"),
  publishStatus: text("publish_status"), // 'published', 'draft', null for rejected/failed
  status: text("status").notNull(), // received, processed, rejected, error
  reason: text("reason"),
  qualityScore: integer("quality_score"),
  aiAnalysis: jsonb("ai_analysis").$type<{
    detectedLanguage?: string;
    detectedCategory?: string;
    hasNewsValue?: boolean;
    issues?: string[];
  }>(),
  processingTimeMs: integer("processing_time_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("whatsapp_webhook_logs_user_id_idx").on(table.userId),
  index("whatsapp_webhook_logs_token_id_idx").on(table.tokenId),
  index("whatsapp_webhook_logs_created_at_idx").on(table.createdAt),
  index("whatsapp_webhook_logs_status_idx").on(table.status),
]);

// Relations
export const whatsappTokensRelations = relations(whatsappTokens, ({ one, many }) => ({
  user: one(users, {
    fields: [whatsappTokens.userId],
    references: [users.id],
  }),
  webhookLogs: many(whatsappWebhookLogs),
}));

export const whatsappWebhookLogsRelations = relations(whatsappWebhookLogs, ({ one }) => ({
  user: one(users, {
    fields: [whatsappWebhookLogs.userId],
    references: [users.id],
  }),
  whatsappToken: one(whatsappTokens, {
    fields: [whatsappWebhookLogs.tokenId],
    references: [whatsappTokens.id],
  }),
  article: one(articles, {
    fields: [whatsappWebhookLogs.articleId],
    references: [articles.id],
  }),
}));

// Insert schemas
export const insertWhatsappTokenSchema = createInsertSchema(whatsappTokens).omit({
  id: true,
  usageCount: true,
  lastUsedAt: true,
  createdAt: true,
});

export const insertWhatsappWebhookLogSchema = createInsertSchema(whatsappWebhookLogs).omit({
  id: true,
  createdAt: true,
});

// Select types
export type WhatsappToken = typeof whatsappTokens.$inferSelect;
export type InsertWhatsappToken = z.infer<typeof insertWhatsappTokenSchema>;
export type WhatsappWebhookLog = typeof whatsappWebhookLogs.$inferSelect;
export type InsertWhatsappWebhookLog = z.infer<typeof insertWhatsappWebhookLogSchema>;

// ============================================
// PENDING WHATSAPP MESSAGE PARTS (for multi-part message aggregation)
// ============================================

export const pendingWhatsappMessages = pgTable("pending_whatsapp_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: text("phone_number").notNull(),
  token: text("token").notNull(),
  tokenId: varchar("token_id").references(() => whatsappTokens.id),
  userId: varchar("user_id").references(() => users.id),
  messageParts: text("message_parts").array().notNull().default(sql`'{}'::text[]`),
  mediaUrls: text("media_urls").array().default(sql`'{}'::text[]`),
  firstMessageAt: timestamp("first_message_at").defaultNow().notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  isProcessing: boolean("is_processing").default(false).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (table) => [
  uniqueIndex("pending_whatsapp_messages_phone_token_unique_idx").on(table.phoneNumber, table.token),
  index("pending_whatsapp_messages_expires_at_idx").on(table.expiresAt),
]);

export const insertPendingWhatsappMessageSchema = createInsertSchema(pendingWhatsappMessages).omit({
  id: true,
  firstMessageAt: true,
  lastMessageAt: true,
});

export type PendingWhatsappMessage = typeof pendingWhatsappMessages.$inferSelect;
export type InsertPendingWhatsappMessage = z.infer<typeof insertPendingWhatsappMessageSchema>;

// ============================================
// ACCESSIBILITY TELEMETRY
// ============================================

export const accessibilityEvents = pgTable("accessibility_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // nullable - allow anonymous tracking
  sessionId: text("session_id").notNull(), // track anonymous sessions
  eventType: text("event_type").notNull(), // fontSize, highContrast, reduceMotion, readingMode, voiceCommand, skipLink, etc.
  eventAction: text("event_action").notNull(), // enabled, disabled, changed, clicked, activated, etc.
  eventValue: text("event_value"), // the actual value: 'large', 'true', 'home command', etc.
  language: text("language").notNull(), // ar, en, ur
  pageUrl: text("page_url"), // current page when event occurred
  metadata: jsonb("metadata"), // additional data
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("accessibility_events_user_id_idx").on(table.userId),
  index("accessibility_events_event_type_idx").on(table.eventType),
  index("accessibility_events_created_at_idx").on(table.createdAt),
  index("accessibility_events_language_idx").on(table.language),
]);

// Relations
export const accessibilityEventsRelations = relations(accessibilityEvents, ({ one }) => ({
  user: one(users, {
    fields: [accessibilityEvents.userId],
    references: [users.id],
  }),
}));

// Insert schema
export const insertAccessibilityEventSchema = createInsertSchema(accessibilityEvents).omit({
  id: true,
  createdAt: true,
});

// Select types
export type AccessibilityEvent = typeof accessibilityEvents.$inferSelect;
export type InsertAccessibilityEvent = z.infer<typeof insertAccessibilityEventSchema>;

// ============================================
// NEWSLETTER SUBSCRIPTIONS - اشتراكات النشرة البريدية
// ============================================

export const newsletterSubscriptions = pgTable("newsletter_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  status: text("status").default("active").notNull(), // active, unsubscribed, bounced
  language: text("language").default("ar"), // ar, en, ur - preferred language
  userId: varchar("user_id").references(() => users.id), // optional - if user is logged in
  
  // Subscription preferences
  preferences: jsonb("preferences").$type<{
    frequency?: "daily" | "weekly" | "monthly";
    categories?: string[]; // interested categories
    articleTypes?: string[]; // news, analysis, opinion
  }>(),
  
  // Tracking
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  source: text("source"), // website-footer, popup, article-page, etc.
  
  // Verification
  verifiedAt: timestamp("verified_at"),
  verificationToken: text("verification_token"),
  
  // Unsubscribe
  unsubscribedAt: timestamp("unsubscribed_at"),
  unsubscribeReason: text("unsubscribe_reason"),
  
  // Metadata
  metadata: jsonb("metadata"), // additional data
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("newsletter_subscriptions_email_idx").on(table.email),
  index("newsletter_subscriptions_status_idx").on(table.status),
  index("newsletter_subscriptions_user_id_idx").on(table.userId),
  index("newsletter_subscriptions_created_at_idx").on(table.createdAt),
]);

// Relations
export const newsletterSubscriptionsRelations = relations(newsletterSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [newsletterSubscriptions.userId],
    references: [users.id],
  }),
}));

// Insert schema
export const insertNewsletterSubscriptionSchema = createInsertSchema(newsletterSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Select types
export type NewsletterSubscription = typeof newsletterSubscriptions.$inferSelect;
export type InsertNewsletterSubscription = z.infer<typeof insertNewsletterSubscriptionSchema>;

// ============================================
// ARTICLE MEDIA ASSETS - تعريفات الصور في المقالات
// ============================================

export const articleMediaAssets = pgTable("article_media_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  mediaFileId: varchar("media_file_id").references(() => mediaFiles.id, { onDelete: "cascade" }),
  
  // Language-specific content
  locale: text("locale").default("ar").notNull(), // ar, en, ur
  
  // Display order for multiple images in article
  displayOrder: integer("display_order").default(0).notNull(),
  
  // SEO-optimized alt text (concise for screen readers)
  altText: text("alt_text").notNull(),
  
  // Rich caption (can include HTML formatting)
  captionHtml: text("caption_html"),
  
  // Plain text caption (fallback)
  captionPlain: text("caption_plain"),
  
  // Keywords for SEO
  keywordTags: text("keyword_tags").array().default(sql`ARRAY[]::text[]`),
  
  // Related articles (internal linking)
  relatedArticleSlugs: text("related_article_slugs").array().default(sql`ARRAY[]::text[]`),
  
  // Source attribution
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  rightsStatement: text("rights_statement"),
  
  // AI-generated metadata
  aiGeneratedSummary: jsonb("ai_generated_summary").$type<{
    provider?: "openai" | "anthropic" | "gemini";
    model?: string;
    generatedAt?: string;
    summary?: string;
    suggestedKeywords?: string[];
  }>(),
  
  // Moderation
  moderationStatus: text("moderation_status").default("approved").notNull(), // approved, pending, rejected
  moderatedBy: varchar("moderated_by").references(() => users.id),
  moderatedAt: timestamp("moderated_at"),
  moderationNotes: text("moderation_notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("article_media_assets_article_id_idx").on(table.articleId),
  index("article_media_assets_media_file_id_idx").on(table.mediaFileId),
  index("article_media_assets_locale_idx").on(table.locale),
  index("article_media_assets_display_order_idx").on(table.displayOrder),
  // Unique constraint: one caption per article+media+locale combination
  uniqueIndex("article_media_assets_unique_idx").on(table.articleId, table.mediaFileId, table.locale),
]);

// Relations
export const articleMediaAssetsRelations = relations(articleMediaAssets, ({ one }) => ({
  article: one(articles, {
    fields: [articleMediaAssets.articleId],
    references: [articles.id],
  }),
  mediaFile: one(mediaFiles, {
    fields: [articleMediaAssets.mediaFileId],
    references: [mediaFiles.id],
  }),
  moderator: one(users, {
    fields: [articleMediaAssets.moderatedBy],
    references: [users.id],
  }),
}));

// Insert schema
export const insertArticleMediaAssetSchema = createInsertSchema(articleMediaAssets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  articleId: z.string().min(1, "Article ID is required"),
  mediaFileId: z.string().optional().nullable(),
  locale: z.enum(["ar", "en", "ur"]),
  altText: z.string().max(125, "Alt text should be concise (max 125 chars)").optional().nullable(),
  captionHtml: z.string().optional().nullable(),
  captionPlain: z.string().max(500, "Caption should be concise (max 500 chars)").optional().nullable(),
  sourceName: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  keywordTags: z.array(z.string()).optional().nullable(),
  relatedArticleSlugs: z.array(z.string()).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
});

// Update schema
export const updateArticleMediaAssetSchema = z.object({
  altText: z.string().max(125).optional().nullable(),
  captionHtml: z.string().optional().nullable(),
  captionPlain: z.string().max(500).optional().nullable(),
  keywordTags: z.array(z.string()).optional().nullable(),
  relatedArticleSlugs: z.array(z.string()).optional().nullable(),
  sourceName: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  rightsStatement: z.string().optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  moderationStatus: z.enum(["approved", "pending", "rejected"]).optional(),
  moderationNotes: z.string().optional().nullable(),
});

// Select types
export type ArticleMediaAsset = typeof articleMediaAssets.$inferSelect;
export type InsertArticleMediaAsset = z.infer<typeof insertArticleMediaAssetSchema>;
export type UpdateArticleMediaAsset = z.infer<typeof updateArticleMediaAssetSchema>;

// ============================================
// PUBLISHERS / CONTENT SALES
// ============================================

export const publishers = pgTable("publishers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  
  // Agency/Publisher details
  agencyName: text("agency_name").notNull(),
  agencyNameEn: text("agency_name_en"),
  contactPerson: text("contact_person").notNull(),
  contactPersonEn: text("contact_person_en"),
  phoneNumber: text("phone_number").notNull(),
  email: text("email").notNull(),
  logoUrl: text("logo_url"), // Publisher/Agency logo
  
  // Business info
  commercialRegistration: text("commercial_registration"),
  taxNumber: text("tax_number"),
  address: text("address"),
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  suspendedUntil: timestamp("suspended_until"),
  suspensionReason: text("suspension_reason"),
  
  // Metadata
  notes: text("notes"), // Internal admin notes
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("publishers_user_id_idx").on(table.userId),
  index("publishers_is_active_idx").on(table.isActive),
]);

export const publisherCredits = pgTable("publisher_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publisherId: varchar("publisher_id").references(() => publishers.id, { onDelete: "cascade" }).notNull(),
  
  // Package details
  packageName: text("package_name").notNull(), // e.g., "باقة 20 خبر", "Package 50 news"
  totalCredits: integer("total_credits").notNull(), // Total number of articles in package
  usedCredits: integer("used_credits").default(0).notNull(), // Number of published articles
  remainingCredits: integer("remaining_credits").notNull(), // Remaining articles
  
  // Package period
  period: text("period").notNull(), // monthly, quarterly, yearly, one-time
  startDate: timestamp("start_date").notNull(),
  expiryDate: timestamp("expiry_date"), // null for one-time packages
  
  // Pricing (optional - for invoicing)
  price: real("price"),
  currency: text("currency").default("SAR"),
  
  // Status
  isActive: boolean("is_active").default(true).notNull(),
  
  // Metadata
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("publisher_credits_publisher_id_idx").on(table.publisherId),
  index("publisher_credits_is_active_idx").on(table.isActive),
  index("publisher_credits_expiry_date_idx").on(table.expiryDate),
]);

export const publisherCreditLogs = pgTable("publisher_credit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  publisherId: varchar("publisher_id").references(() => publishers.id, { onDelete: "cascade" }).notNull(),
  creditPackageId: varchar("credit_package_id").references(() => publisherCredits.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  
  // Action type
  actionType: text("action_type").notNull(), // credit_added, credit_used, credit_refunded, package_expired
  
  // Details
  creditsBefore: integer("credits_before").notNull(),
  creditsChanged: integer("credits_changed").notNull(), // +/- amount
  creditsAfter: integer("credits_after").notNull(),
  
  // Who performed the action
  performedBy: varchar("performed_by").references(() => users.id),
  
  // Notes
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("publisher_credit_logs_publisher_id_idx").on(table.publisherId),
  index("publisher_credit_logs_article_id_idx").on(table.articleId),
  index("publisher_credit_logs_created_at_idx").on(table.createdAt.desc()),
]);

// Relations
export const publishersRelations = relations(publishers, ({ one, many }) => ({
  user: one(users, {
    fields: [publishers.userId],
    references: [users.id],
  }),
  creditPackages: many(publisherCredits),
  creditLogs: many(publisherCreditLogs),
}));

export const publisherCreditsRelations = relations(publisherCredits, ({ one, many }) => ({
  publisher: one(publishers, {
    fields: [publisherCredits.publisherId],
    references: [publishers.id],
  }),
  logs: many(publisherCreditLogs),
}));

export const publisherCreditLogsRelations = relations(publisherCreditLogs, ({ one }) => ({
  publisher: one(publishers, {
    fields: [publisherCreditLogs.publisherId],
    references: [publishers.id],
  }),
  creditPackage: one(publisherCredits, {
    fields: [publisherCreditLogs.creditPackageId],
    references: [publisherCredits.id],
  }),
  article: one(articles, {
    fields: [publisherCreditLogs.articleId],
    references: [articles.id],
  }),
  performedBy: one(users, {
    fields: [publisherCreditLogs.performedBy],
    references: [users.id],
  }),
}));

// Insert/Update Schemas
export const insertPublisherSchema = createInsertSchema(publishers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updatePublisherSchema = z.object({
  agencyName: z.string().min(2).optional().or(z.literal("")),
  agencyNameEn: z.string().min(2).optional().or(z.literal("")),
  contactPerson: z.string().min(2).optional().or(z.literal("")),
  contactPersonEn: z.string().min(2).optional().or(z.literal("")),
  phoneNumber: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  logoUrl: z.string().nullable().optional(),
  commercialRegistration: z.string().optional(),
  taxNumber: z.string().optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
  suspendedUntil: z.string().nullable().optional(),
  suspensionReason: z.string().optional(),
  notes: z.string().optional(),
});

export const insertPublisherCreditSchema = createInsertSchema(publisherCredits).omit({
  id: true,
  publisherId: true,
  usedCredits: true,
  remainingCredits: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  totalCredits: z.number().int().min(1, "يجب أن يكون عدد الأخبار 1 على الأقل"),
  period: z.enum(["monthly", "quarterly", "yearly", "one-time"]),
  startDate: z.coerce.date({ message: "تاريخ البداية مطلوب" }),
  expiryDate: z.coerce.date({ message: "تاريخ النهاية غير صحيح" }).optional().nullable(),
});

export const insertPublisherCreditLogSchema = createInsertSchema(publisherCreditLogs).omit({
  id: true,
  createdAt: true,
});

// Select types
export type Publisher = typeof publishers.$inferSelect;
export type InsertPublisher = z.infer<typeof insertPublisherSchema>;
export type UpdatePublisher = z.infer<typeof updatePublisherSchema>;

export type PublisherCredit = typeof publisherCredits.$inferSelect;
export type InsertPublisherCredit = z.infer<typeof insertPublisherCreditSchema>;

export type PublisherCreditLog = typeof publisherCreditLogs.$inferSelect;
export type InsertPublisherCreditLog = z.infer<typeof insertPublisherCreditLogSchema>;

// ============================================
// IFOX SECTION - قسم آي فوكس
// ============================================

// إعدادات قسم آي فوكس
export const ifoxSettings = pgTable("ifox_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(), // مفتاح الإعداد
  value: jsonb("value").notNull(), // قيمة الإعداد (يمكن أن تكون أي نوع من البيانات)
  description: text("description"), // وصف الإعداد
  updatedAt: timestamp("updated_at").defaultNow().notNull(), // آخر تحديث
  updatedBy: varchar("updated_by").references(() => users.id), // المستخدم الذي قام بالتحديث
});

// مكتبة الوسائط الخاصة بآي فوكس
export const ifoxMedia = pgTable("ifox_media", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 20 }).notNull(), // نوع الملف: image, video, audio, document
  fileName: varchar("file_name", { length: 255 }).notNull(), // اسم الملف
  fileUrl: text("file_url").notNull(), // رابط الملف
  fileSize: integer("file_size"), // حجم الملف بالبايت
  mimeType: varchar("mime_type", { length: 100 }), // نوع MIME للملف
  metadata: jsonb("metadata"), // بيانات إضافية: الأبعاد، المدة، الخ
  categorySlug: varchar("category_slug", { length: 100 }), // تصنيف الملف: ai-news, ai-voice, etc
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(), // تاريخ الرفع
  uploadedBy: varchar("uploaded_by").references(() => users.id), // المستخدم الذي رفع الملف
}, (table) => [
  // فهرس على التصنيف للبحث السريع
  index("ifox_media_category_slug_idx").on(table.categorySlug),
  index("ifox_media_type_idx").on(table.type),
  index("ifox_media_uploaded_at_idx").on(table.uploadedAt.desc()),
]);

// تحليلات قسم آي فوكس
export const ifoxAnalytics = pgTable("ifox_analytics", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(), // التاريخ
  categorySlug: varchar("category_slug", { length: 100 }).notNull(), // تصنيف البيانات
  metric: varchar("metric", { length: 50 }).notNull(), // نوع المقياس: views, engagement, shares, etc
  value: integer("value").notNull().default(0), // قيمة المقياس
  metadata: jsonb("metadata"), // بيانات إضافية للسياق
  createdAt: timestamp("created_at").defaultNow().notNull(), // تاريخ الإنشاء
}, (table) => [
  // فهارس للأداء
  index("ifox_analytics_date_idx").on(table.date.desc()),
  index("ifox_analytics_category_slug_idx").on(table.categorySlug),
  index("ifox_analytics_metric_idx").on(table.metric),
  // فهرس مركب للاستعلامات الشائعة
  index("ifox_analytics_date_category_metric_idx").on(table.date, table.categorySlug, table.metric),
]);

// جدولة نشر المحتوى
export const ifoxSchedule = pgTable("ifox_schedule", {
  id: serial("id").primaryKey(),
  articleId: varchar("article_id").references(() => articles.id).notNull(), // المقال المجدول
  scheduledAt: timestamp("scheduled_at").notNull(), // وقت النشر المجدول
  status: varchar("status", { length: 20 }).notNull().default("pending"), // الحالة: pending, published, failed
  publishSettings: jsonb("publish_settings"), // إعدادات النشر: social media, notifications, etc
  createdAt: timestamp("created_at").defaultNow().notNull(), // تاريخ إنشاء الجدولة
  createdBy: varchar("created_by").references(() => users.id), // المستخدم الذي أنشأ الجدولة
}, (table) => [
  // فهارس للأداء
  index("ifox_schedule_scheduled_at_idx").on(table.scheduledAt),
  index("ifox_schedule_status_idx").on(table.status),
  index("ifox_schedule_article_id_idx").on(table.articleId),
]);

// إعدادات خاصة بكل تصنيف
export const ifoxCategorySettings = pgTable("ifox_category_settings", {
  id: serial("id").primaryKey(),
  categorySlug: varchar("category_slug", { length: 100 }).notNull().unique(), // معرف التصنيف
  layoutConfig: jsonb("layout_config"), // إعدادات التخطيط المخصصة
  featureFlags: jsonb("feature_flags"), // الميزات المفعلة لكل تصنيف
  customFields: jsonb("custom_fields"), // حقول مخصصة خاصة بالتصنيف
  displayOrder: integer("display_order").notNull().default(0), // ترتيب العرض
  isActive: boolean("is_active").notNull().default(true), // هل التصنيف نشط
  updatedAt: timestamp("updated_at").defaultNow().notNull(), // آخر تحديث
}, (table) => [
  // فهرس على التصنيف للبحث السريع
  index("ifox_category_settings_slug_idx").on(table.categorySlug),
  index("ifox_category_settings_active_idx").on(table.isActive),
  index("ifox_category_settings_display_order_idx").on(table.displayOrder),
]);

// Relations for iFox tables
export const ifoxSettingsRelations = relations(ifoxSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [ifoxSettings.updatedBy],
    references: [users.id],
  }),
}));

export const ifoxMediaRelations = relations(ifoxMedia, ({ one }) => ({
  uploadedByUser: one(users, {
    fields: [ifoxMedia.uploadedBy],
    references: [users.id],
  }),
}));

export const ifoxScheduleRelations = relations(ifoxSchedule, ({ one }) => ({
  article: one(articles, {
    fields: [ifoxSchedule.articleId],
    references: [articles.id],
  }),
  createdByUser: one(users, {
    fields: [ifoxSchedule.createdBy],
    references: [users.id],
  }),
}));

// Insert schemas for iFox tables
export const insertIfoxSettingsSchema = createInsertSchema(ifoxSettings).omit({
  id: true,
  updatedAt: true,
}).extend({
  key: z.string().min(1, "المفتاح مطلوب").max(100, "المفتاح طويل جداً"),
  value: z.any(), // jsonb can be any valid JSON
  description: z.string().optional(),
});

export const insertIfoxMediaSchema = createInsertSchema(ifoxMedia).omit({
  id: true,
  uploadedAt: true,
}).extend({
  type: z.enum(["image", "video", "audio", "document"]),
  fileName: z.string().min(1, "اسم الملف مطلوب").max(255, "اسم الملف طويل جداً"),
  fileUrl: z.string().url("رابط الملف غير صحيح"),
  fileSize: z.number().int().positive().optional(),
  mimeType: z.string().max(100).optional(),
  metadata: z.any().optional(), // jsonb
  categorySlug: z.string().max(100).optional(),
});

export const insertIfoxAnalyticsSchema = createInsertSchema(ifoxAnalytics).omit({
  id: true,
  createdAt: true,
}).extend({
  date: z.coerce.date({ message: "التاريخ مطلوب" }),
  categorySlug: z.string().min(1, "التصنيف مطلوب").max(100),
  metric: z.string().min(1, "المقياس مطلوب").max(50),
  value: z.number().int().min(0, "القيمة يجب أن تكون صفر أو أكثر"),
  metadata: z.any().optional(), // jsonb
});

export const insertIfoxScheduleSchema = createInsertSchema(ifoxSchedule).omit({
  id: true,
  createdAt: true,
}).extend({
  articleId: z.string().min(1, "معرف المقال مطلوب"),
  scheduledAt: z.coerce.date({ message: "وقت الجدولة مطلوب" }),
  status: z.enum(["pending", "published", "failed"]).default("pending"),
  publishSettings: z.any().optional(), // jsonb
});

export const insertIfoxCategorySettingsSchema = createInsertSchema(ifoxCategorySettings).omit({
  id: true,
  updatedAt: true,
}).extend({
  categorySlug: z.string().min(1, "معرف التصنيف مطلوب").max(100),
  layoutConfig: z.any().optional(), // jsonb
  featureFlags: z.any().optional(), // jsonb
  customFields: z.any().optional(), // jsonb
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

// ============================================
// AI SCHEDULED TASKS (AI AUTONOMOUS NEWSROOM)
// ============================================

export const aiScheduledTasks = pgTable("ai_scheduled_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Task identification
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  
  // Scheduling
  scheduledAt: timestamp("scheduled_at").notNull(),
  executedAt: timestamp("executed_at"),
  
  // Task configuration
  contentType: varchar("content_type", { length: 50 }).notNull().default("news"),
  locale: varchar("locale", { length: 5 }).notNull().default("ar"),
  categoryId: varchar("category_id").references(() => categories.id),
  
  // Content specifications
  topics: jsonb("topics"),
  keywords: jsonb("keywords"),
  sources: jsonb("sources"),
  tone: varchar("tone", { length: 50 }).default("formal"),
  
  // AI generation settings
  aiModel: varchar("ai_model", { length: 100 }).default("gpt-4"),
  aiPrompt: text("ai_prompt"),
  temperature: real("temperature").default(0.7),
  maxTokens: integer("max_tokens").default(2000),
  
  // Image generation settings
  generateImage: boolean("generate_image").default(true),
  imagePrompt: text("image_prompt"),
  imageModel: varchar("image_model", { length: 100 }).default("dall-e-3"),
  
  // Publishing settings
  autoPublish: boolean("auto_publish").default(false),
  publishStatus: varchar("publish_status", { length: 20 }).default("draft"),
  
  // Execution status
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  
  // Results
  generatedArticleId: varchar("generated_article_id").references(() => articles.id),
  generatedImageUrl: text("generated_image_url"),
  executionLogs: jsonb("execution_logs"),
  errorMessage: text("error_message"),
  
  // Metrics
  executionTimeMs: integer("execution_time_ms"),
  tokensUsed: integer("tokens_used"),
  generationCost: real("generation_cost"),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ai_scheduled_tasks_scheduled_at_idx").on(table.scheduledAt),
  index("ai_scheduled_tasks_status_idx").on(table.status),
  index("ai_scheduled_tasks_created_by_idx").on(table.createdBy),
  index("ai_scheduled_tasks_category_idx").on(table.categoryId),
]);

export const aiScheduledTasksRelations = relations(aiScheduledTasks, ({ one }) => ({
  category: one(categories, {
    fields: [aiScheduledTasks.categoryId],
    references: [categories.id],
  }),
  generatedArticle: one(articles, {
    fields: [aiScheduledTasks.generatedArticleId],
    references: [articles.id],
  }),
  createdByUser: one(users, {
    fields: [aiScheduledTasks.createdBy],
    references: [users.id],
  }),
}));

export const insertAiScheduledTaskSchema = createInsertSchema(aiScheduledTasks).omit({
  id: true,
  executedAt: true,
  generatedArticleId: true,
  generatedImageUrl: true,
  executionLogs: true,
  executionTimeMs: true,
  tokensUsed: true,
  generationCost: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1, "عنوان المهمة مطلوب").max(255),
  description: z.string().optional(),
  scheduledAt: z.coerce.date({ message: "وقت التنفيذ مطلوب" }),
  contentType: z.enum(["news", "report", "analysis", "opinion"]).default("news"),
  locale: z.enum(["ar", "en", "ur"]).default("ar"),
  categoryId: z.string().optional(),
  topics: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  sources: z.array(z.object({
    type: z.enum(["url", "text"]),
    content: z.string(),
  })).optional(),
  tone: z.enum(["formal", "urgent", "analytical", "neutral"]).default("formal"),
  aiModel: z.string().default("gpt-4"),
  aiPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().int().min(100).max(4000).default(2000),
  generateImage: z.boolean().default(true),
  imagePrompt: z.string().optional(),
  imageModel: z.string().default("dall-e-3"),
  autoPublish: z.boolean().default(false),
  publishStatus: z.enum(["draft", "published"]).default("draft"),
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).default("pending"),
  errorMessage: z.string().optional(),
});

export type AiScheduledTask = typeof aiScheduledTasks.$inferSelect;
export type InsertAiScheduledTask = z.infer<typeof insertAiScheduledTaskSchema>;

// Select types for iFox tables
export type IfoxSettings = typeof ifoxSettings.$inferSelect;
export type InsertIfoxSettings = z.infer<typeof insertIfoxSettingsSchema>;

export type IfoxMedia = typeof ifoxMedia.$inferSelect;
export type InsertIfoxMedia = z.infer<typeof insertIfoxMediaSchema>;

export type IfoxAnalytics = typeof ifoxAnalytics.$inferSelect;
export type InsertIfoxAnalytics = z.infer<typeof insertIfoxAnalyticsSchema>;

export type IfoxSchedule = typeof ifoxSchedule.$inferSelect;
export type InsertIfoxSchedule = z.infer<typeof insertIfoxScheduleSchema>;

export type IfoxCategorySettings = typeof ifoxCategorySettings.$inferSelect;
export type InsertIfoxCategorySettings = z.infer<typeof insertIfoxCategorySettingsSchema>;

// ============================================
// AI IMAGE GENERATIONS (NANO BANANA PRO)
// ============================================

export const aiImageGenerations = pgTable("ai_image_generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  articleId: varchar("article_id").references(() => articles.id), // Optional: link to article
  
  // Prompt & generation details
  prompt: text("prompt").notNull(),
  negativePrompt: text("negative_prompt"),
  model: varchar("model", { length: 100 }).notNull().default("gemini-3-pro-image-preview"), // Nano Banana Pro
  
  // Image configuration
  aspectRatio: varchar("aspect_ratio", { length: 20 }).default("16:9"), // 16:9, 1:1, 4:3, 9:16, 21:9
  imageSize: varchar("image_size", { length: 10 }).default("2K"), // 1K, 2K, 4K
  numImages: integer("num_images").default(1), // Max 4
  
  // Generation metadata
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, processing, completed, failed
  imageUrl: text("image_url"), // GCS URL of generated image
  thumbnailUrl: text("thumbnail_url"), // Smaller preview
  mediaFileId: varchar("media_file_id").references(() => mediaFiles.id), // Link to media library when saved
  
  // Advanced features
  referenceImages: jsonb("reference_images"), // Array of reference image URLs (max 14)
  enableSearchGrounding: boolean("enable_search_grounding").default(false), // Use Google Search for facts
  enableThinking: boolean("enable_thinking").default(true), // Use reasoning process
  
  // Brand customization
  brandingConfig: jsonb("branding_config"), // Logo, colors, watermark settings
  
  // Result metadata
  generationTime: integer("generation_time"), // Time in seconds
  cost: real("cost"), // Cost in USD
  metadata: jsonb("metadata"), // Raw response, thinking process, etc.
  
  // Error handling
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ai_image_gen_user_idx").on(table.userId),
  index("ai_image_gen_article_idx").on(table.articleId),
  index("ai_image_gen_status_idx").on(table.status),
  index("ai_image_gen_created_idx").on(table.createdAt),
]);

// Relations
export const aiImageGenerationsRelations = relations(aiImageGenerations, ({ one }) => ({
  user: one(users, {
    fields: [aiImageGenerations.userId],
    references: [users.id],
  }),
  article: one(articles, {
    fields: [aiImageGenerations.articleId],
    references: [articles.id],
  }),
}));

// Insert schema
export const insertAiImageGenerationSchema = createInsertSchema(aiImageGenerations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  prompt: z.string().min(1, "البرومبت مطلوب").max(5000, "البرومبت طويل جداً"),
  negativePrompt: z.string().max(2000).optional(),
  model: z.string().default("gemini-3-pro-image-preview"),
  aspectRatio: z.enum(["1:1", "16:9", "4:3", "9:16", "21:9", "3:4"]).default("16:9"),
  imageSize: z.enum(["1K", "2K", "4K"]).default("2K"),
  numImages: z.number().int().min(1).max(4).default(1),
  articleId: z.string().optional(),
  referenceImages: z.array(z.string().url()).max(14).optional(),
  enableSearchGrounding: z.boolean().default(false),
  enableThinking: z.boolean().default(true),
  brandingConfig: z.object({
    logoUrl: z.string().url().optional(),
    watermarkText: z.string().max(100).optional(),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
  }).optional(),
});

// Select types
export type AiImageGeneration = typeof aiImageGenerations.$inferSelect;
export type InsertAiImageGeneration = z.infer<typeof insertAiImageGenerationSchema>;

// ============================================
// VISUAL AI SYSTEM (Gemini 3 Pro Image Analysis & Generation)
// ============================================

// Image Analysis: Quality checks, content detection, Alt text generation
export const imageAnalysis = pgTable("image_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  imageUrl: text("image_url").notNull(),
  articleId: varchar("article_id").references(() => articles.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Analysis results
  qualityScore: real("quality_score"), // 0-100 quality rating
  qualityMetrics: jsonb("quality_metrics"), // resolution, sharpness, lighting, composition
  contentDescription: jsonb("content_description"), // {ar: string, en: string, ur: string}
  detectedObjects: jsonb("detected_objects"), // Array of detected objects/people/places
  dominantColors: jsonb("dominant_colors"), // Array of hex colors
  tags: jsonb("tags"), // Auto-generated tags
  
  // Multilingual Alt Text (auto-generated)
  altTextAr: text("alt_text_ar"),
  altTextEn: text("alt_text_en"),
  altTextUr: text("alt_text_ur"),
  
  // Content warnings
  hasAdultContent: boolean("has_adult_content").default(false),
  hasSensitiveContent: boolean("has_sensitive_content").default(false),
  contentWarnings: jsonb("content_warnings"), // Array of warning types
  
  // Image-to-article matching
  relevanceScore: real("relevance_score"), // How well image matches article (0-100)
  matchingSuggestions: jsonb("matching_suggestions"), // Better image suggestions
  
  // Processing metadata
  model: varchar("model", { length: 100 }).default("gemini-3-pro-image-preview"),
  processingTime: integer("processing_time"), // milliseconds
  cost: real("cost"),
  status: varchar("status", { length: 50 }).default("pending"), // pending, completed, failed
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("image_analysis_article_idx").on(table.articleId),
  index("image_analysis_user_idx").on(table.userId),
  index("image_analysis_status_idx").on(table.status),
]);

// Social Media Cards: Auto-generated cards for Twitter/Instagram/Facebook/WhatsApp
export const socialMediaCards = pgTable("social_media_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Platform-specific variants
  platform: varchar("platform", { length: 50 }).notNull(), // twitter, instagram, facebook, whatsapp, all
  cardType: varchar("card_type", { length: 50 }).notNull(), // standard, story, post, status
  
  // Design configuration
  template: varchar("template", { length: 100 }).notNull(), // breaking_news, analysis, sports, etc.
  language: varchar("language", { length: 5 }).notNull(), // ar, en, ur
  
  // Generated content
  imageUrl: text("image_url").notNull(), // GCS URL
  thumbnailUrl: text("thumbnail_url"),
  dimensions: jsonb("dimensions"), // {width: number, height: number}
  
  // Card content
  headline: text("headline"),
  subheadline: text("subheadline"),
  categoryBadge: varchar("category_badge", { length: 100 }),
  brandElements: jsonb("brand_elements"), // logo, watermark, colors
  
  // Performance tracking
  downloadCount: integer("download_count").default(0),
  shareCount: integer("share_count").default(0),
  engagementScore: real("engagement_score"), // Based on usage
  
  // Generation metadata
  generationPrompt: text("generation_prompt"),
  model: varchar("model", { length: 100 }).default("gemini-3-pro-image-preview"),
  generationTime: integer("generation_time"),
  cost: real("cost"),
  status: varchar("status", { length: 50 }).default("pending"),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("social_cards_article_idx").on(table.articleId),
  index("social_cards_platform_idx").on(table.platform),
  index("social_cards_status_idx").on(table.status),
]);

// Visual Recommendations: Smart suggestions for visual content
export const visualRecommendations = pgTable("visual_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Recommendation type
  recommendationType: varchar("recommendation_type", { length: 100 }).notNull(), 
  // Types: add_infographic, add_image, improve_image_quality, add_social_cards, 
  // add_story_cards, change_layout, add_comparison_chart, add_timeline
  
  // Recommendation details
  priority: varchar("priority", { length: 20 }).default("medium"), // low, medium, high, critical
  confidence: real("confidence"), // AI confidence score 0-100
  
  // Suggestion content
  title: jsonb("title"), // {ar: string, en: string, ur: string}
  description: jsonb("description"), // Detailed explanation in 3 languages
  reasoning: jsonb("reasoning"), // Why this recommendation
  
  // Actionable items
  suggestedTemplates: jsonb("suggested_templates"), // Array of template IDs
  suggestedPrompts: jsonb("suggested_prompts"), // Ready-to-use prompts
  estimatedImpact: jsonb("estimated_impact"), // {engagement: "+20%", readability: "+15%"}
  
  // Context analysis
  currentVisualScore: real("current_visual_score"), // Before applying recommendation
  projectedVisualScore: real("projected_visual_score"), // After applying
  categoryBenchmark: real("category_benchmark"), // Category average
  
  // User interaction
  status: varchar("status", { length: 50 }).default("pending"), // pending, accepted, rejected, auto_applied
  appliedAt: timestamp("applied_at"),
  rejectedReason: text("rejected_reason"),
  
  // AI metadata
  model: varchar("model", { length: 100 }).default("gemini-3-pro-image-preview"),
  analysisData: jsonb("analysis_data"), // Raw AI analysis
  
  expiresAt: timestamp("expires_at"), // Recommendations expire after time
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("visual_rec_article_idx").on(table.articleId),
  index("visual_rec_type_idx").on(table.recommendationType),
  index("visual_rec_priority_idx").on(table.priority),
  index("visual_rec_status_idx").on(table.status),
]);

// Story Cards: Multi-slide visual stories for social media
export const storyCards = pgTable("story_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  
  // Story configuration
  title: text("title").notNull(),
  language: varchar("language", { length: 5 }).notNull(), // ar, en, ur
  slideCount: integer("slide_count").notNull().default(5), // Number of slides (3-10)
  
  // Slides data
  slides: jsonb("slides").notNull(), // Array of slide objects
  // Each slide: {order: number, imageUrl: string, headline: string, content: string, template: string}
  
  // Visual theme
  template: varchar("template", { length: 100 }).notNull(), // news_story, analysis_thread, quick_facts
  colorScheme: varchar("color_scheme", { length: 50 }).default("brand"), // brand, dark, light, custom
  brandElements: jsonb("brand_elements"), // Logo placement, watermark
  
  // Export formats
  instagramStoryUrl: text("instagram_story_url"), // 9:16 format
  facebookStoryUrl: text("facebook_story_url"),
  whatsappStatusUrl: text("whatsapp_status_url"),
  twitterThreadImages: jsonb("twitter_thread_images"), // Array of URLs
  
  // Performance tracking
  viewCount: integer("view_count").default(0),
  completionRate: real("completion_rate"), // % who viewed all slides
  shareCount: integer("share_count").default(0),
  
  // Generation metadata
  generationPrompt: text("generation_prompt"),
  model: varchar("model", { length: 100 }).default("gemini-3-pro-image-preview"),
  totalGenerationTime: integer("total_generation_time"),
  totalCost: real("total_cost"),
  status: varchar("status", { length: 50 }).default("draft"), // draft, processing, completed, failed
  
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("story_cards_article_idx").on(table.articleId),
  index("story_cards_status_idx").on(table.status),
  index("story_cards_published_idx").on(table.isPublished),
]);

// Relations for Visual AI tables
export const imageAnalysisRelations = relations(imageAnalysis, ({ one }) => ({
  article: one(articles, {
    fields: [imageAnalysis.articleId],
    references: [articles.id],
  }),
  user: one(users, {
    fields: [imageAnalysis.userId],
    references: [users.id],
  }),
}));

export const socialMediaCardsRelations = relations(socialMediaCards, ({ one }) => ({
  article: one(articles, {
    fields: [socialMediaCards.articleId],
    references: [articles.id],
  }),
  user: one(users, {
    fields: [socialMediaCards.userId],
    references: [users.id],
  }),
}));

export const visualRecommendationsRelations = relations(visualRecommendations, ({ one }) => ({
  article: one(articles, {
    fields: [visualRecommendations.articleId],
    references: [articles.id],
  }),
  user: one(users, {
    fields: [visualRecommendations.userId],
    references: [users.id],
  }),
}));

export const storyCardsRelations = relations(storyCards, ({ one }) => ({
  article: one(articles, {
    fields: [storyCards.articleId],
    references: [articles.id],
  }),
  user: one(users, {
    fields: [storyCards.userId],
    references: [users.id],
  }),
}));

// Insert schemas for Visual AI tables
export const insertImageAnalysisSchema = createInsertSchema(imageAnalysis).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSocialMediaCardSchema = createInsertSchema(socialMediaCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  platform: z.enum(["twitter", "instagram", "facebook", "whatsapp", "all"]),
  cardType: z.enum(["standard", "story", "post", "status"]),
  language: z.enum(["ar", "en", "ur"]),
});

export const insertVisualRecommendationSchema = createInsertSchema(visualRecommendations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  recommendationType: z.enum([
    "add_infographic", "add_image", "improve_image_quality", "add_social_cards",
    "add_story_cards", "change_layout", "add_comparison_chart", "add_timeline"
  ]),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

export const insertStoryCardSchema = createInsertSchema(storyCards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  title: z.string().min(1).max(200),
  language: z.enum(["ar", "en", "ur"]),
  slideCount: z.number().int().min(3).max(10),
  slides: z.array(z.object({
    order: z.number().int(),
    imageUrl: z.string().url(),
    headline: z.string(),
    content: z.string(),
    template: z.string(),
  })),
});

// Select types for Visual AI tables
export type ImageAnalysis = typeof imageAnalysis.$inferSelect;
export type InsertImageAnalysis = z.infer<typeof insertImageAnalysisSchema>;

export type SocialMediaCard = typeof socialMediaCards.$inferSelect;
export type InsertSocialMediaCard = z.infer<typeof insertSocialMediaCardSchema>;

export type VisualRecommendation = typeof visualRecommendations.$inferSelect;
export type InsertVisualRecommendation = z.infer<typeof insertVisualRecommendationSchema>;

export type StoryCard = typeof storyCards.$inferSelect;
export type InsertStoryCard = z.infer<typeof insertStoryCardSchema>;

// ============================================
// VISUAL AI REQUEST VALIDATION SCHEMAS
// ============================================

// Schema for image analysis API requests
export const visualAiAnalyzeRequestSchema = z.object({
  imageUrl: z.string().url("يجب أن يكون رابط صورة صالح"),
  articleId: z.string().uuid().optional(),
  articleTitle: z.string().max(500).optional(),
  articleContent: z.string().max(50000).optional(),
  checkQuality: z.boolean().default(true),
  generateAltText: z.boolean().default(true),
  detectContent: z.boolean().default(true),
  checkRelevance: z.boolean().default(false),
});
export type VisualAiAnalyzeRequest = z.infer<typeof visualAiAnalyzeRequestSchema>;

// Schema for news image generation requests
export const visualAiGenerateImageRequestSchema = z.object({
  articleTitle: z.string().min(5, "عنوان المقال قصير جداً").max(500),
  articleContent: z.string().min(50, "محتوى المقال قصير جداً").max(50000).optional(),
  articleId: z.string().uuid().optional(),
  style: z.enum(["photorealistic", "illustration", "infographic", "abstract", "news"]).default("photorealistic"),
  aspectRatio: z.enum(["16:9", "4:3", "1:1", "9:16"]).default("16:9"),
  includeText: z.boolean().default(false),
  language: z.enum(["ar", "en", "ur"]).default("ar"),
});
export type VisualAiGenerateImageRequest = z.infer<typeof visualAiGenerateImageRequestSchema>;

// Schema for social media cards generation
export const visualAiSocialCardsRequestSchema = z.object({
  articleId: z.string().uuid("معرف المقال غير صالح"),
  articleTitle: z.string().min(5).max(500),
  articleSummary: z.string().max(1000).optional(),
  articleImage: z.string().url().optional(),
  platforms: z.array(z.enum(["twitter", "instagram", "facebook", "whatsapp", "linkedin"])).min(1).default(["twitter"]),
  language: z.enum(["ar", "en", "ur"]).default("ar"),
  template: z.enum(["standard", "breaking", "analysis", "opinion", "sports", "tech"]).default("standard"),
});
export type VisualAiSocialCardsRequest = z.infer<typeof visualAiSocialCardsRequestSchema>;

// Schema for card performance tracking
export const visualAiTrackPerformanceRequestSchema = z.object({
  cardId: z.string().uuid("معرف البطاقة غير صالح"),
  platform: z.enum(["twitter", "instagram", "facebook", "whatsapp", "linkedin"]),
  eventType: z.enum(["view", "click", "share", "download"]),
  metadata: z.record(z.any()).optional(),
});
export type VisualAiTrackPerformanceRequest = z.infer<typeof visualAiTrackPerformanceRequestSchema>;

// Schema for visual recommendations decision
export const visualAiRecommendationDecisionSchema = z.object({
  recommendationId: z.string().uuid(),
  action: z.enum(["apply", "dismiss", "defer"]),
  feedback: z.string().max(500).optional(),
});
export type VisualAiRecommendationDecision = z.infer<typeof visualAiRecommendationDecisionSchema>;

// ============================================
// HOMEPAGE STATISTICS
// ============================================

export interface HomepageStats {
  totalArticles: number;        // Count of all published articles
  todayArticles: number;         // Articles published in last 24h
  totalViews: number;            // Sum of all article views (lifetime)
  activeUsers: number;           // Users logged in last 7 days
}

// ============================================
// IFOX AI MANAGEMENT SYSTEM - PHASE 2
// Comprehensive AI-powered newsroom management
// ============================================

// 1. AI Preferences & Settings - Central configuration for AI behavior
export const ifoxAiPreferences = pgTable("ifox_ai_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Writing style preferences
  writingStyle: varchar("writing_style", { length: 100 }).default("professional"), // professional, casual, formal, investigative
  tone: varchar("tone", { length: 100 }).default("neutral"), // neutral, critical, supportive, analytical
  contentDepth: varchar("content_depth", { length: 50 }).default("medium"), // short, medium, long, comprehensive
  defaultWordCount: integer("default_word_count").default(800),
  
  // AI Model preferences
  primaryModel: varchar("primary_model", { length: 100 }).default("gpt-4"), // gpt-4, gpt-5, claude-3, gemini-pro
  fallbackModel: varchar("fallback_model", { length: 100 }).default("gpt-3.5-turbo"),
  temperature: real("temperature").default(0.7), // 0.0-2.0
  maxTokens: integer("max_tokens").default(2000),
  
  // SEO automation
  autoGenerateSeo: boolean("auto_generate_seo").default(true),
  seoKeywordDensity: real("seo_keyword_density").default(0.02), // 2%
  seoProvider: varchar("seo_provider", { length: 100 }).default("openai"),
  
  // Image generation
  autoGenerateImages: boolean("auto_generate_images").default(true),
  imageStyle: varchar("image_style", { length: 100 }).default("photorealistic"), // photorealistic, artistic, infographic, minimalist
  imageProvider: varchar("image_provider", { length: 100 }).default("visual-ai"),
  
  // Quality control
  enableQualityCheck: boolean("enable_quality_check").default(true),
  qualityThreshold: integer("quality_threshold").default(70), // 0-100
  requireHumanReview: boolean("require_human_review").default(false),
  
  // Publishing automation
  autoPublishEnabled: boolean("auto_publish_enabled").default(false),
  autoPublishThreshold: integer("auto_publish_threshold").default(90), // Only auto-publish if quality score >= 90
  publishDelay: integer("publish_delay").default(0), // Minutes delay before auto-publish
  
  // Content strategy
  preferredCategories: jsonb("preferred_categories"), // Array of category IDs
  contentMix: jsonb("content_mix"), // {news: 40%, analysis: 30%, opinion: 20%, other: 10%}
  targetAudience: varchar("target_audience", { length: 100 }).default("general"), // general, tech-savvy, professionals, youth
  
  // Advanced settings
  customPrompts: jsonb("custom_prompts"), // Custom prompt templates
  bannedWords: jsonb("banned_words"), // Array of words to avoid
  requiredDisclosures: jsonb("required_disclosures"), // Legal disclaimers, AI disclosure
  
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_ai_prefs_active_idx").on(table.isActive),
]);

// 2. Content Templates Library - Reusable AI content templates
export const ifoxContentTemplates = pgTable("ifox_content_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Template identity
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  templateType: varchar("template_type", { length: 100 }).notNull(), // breaking_news, analysis, interview, opinion, review, tutorial
  language: varchar("language", { length: 5 }).notNull().default("ar"), // ar, en, ur
  
  // Template configuration
  promptTemplate: text("prompt_template").notNull(), // Main AI prompt with variables like {{topic}}, {{keywords}}
  systemPrompt: text("system_prompt"), // System-level instructions
  exampleOutput: text("example_output"), // Sample output for reference
  
  // Content structure
  structure: jsonb("structure"), // {sections: ["intro", "body", "conclusion"], format: "article"}
  wordCountRange: jsonb("word_count_range"), // {min: 500, max: 1000}
  requiredSections: jsonb("required_sections"), // Array of section names
  
  // AI parameters
  model: varchar("model", { length: 100 }).default("gpt-4"),
  temperature: real("temperature").default(0.7),
  maxTokens: integer("max_tokens").default(2000),
  
  // Metadata requirements
  requiresImages: boolean("requires_images").default(true),
  imageCount: integer("image_count").default(1),
  requiresSeo: boolean("requires_seo").default(true),
  requiresCategories: boolean("requires_categories").default(true),
  
  // Quality & validation
  qualityChecks: jsonb("quality_checks"), // Array of checks to perform
  validationRules: jsonb("validation_rules"), // Custom validation rules
  
  // Usage tracking
  usageCount: integer("usage_count").default(0),
  successRate: real("success_rate"), // Percentage of successful generations
  averageQualityScore: real("average_quality_score"),
  
  // Publishing settings
  defaultCategory: varchar("default_category").references(() => categories.id),
  defaultStatus: varchar("default_status", { length: 50 }).default("draft"), // draft, published
  autoPublish: boolean("auto_publish").default(false),
  
  isPublic: boolean("is_public").default(false), // Can other users use this template?
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_templates_type_idx").on(table.templateType),
  index("ifox_templates_active_idx").on(table.isActive),
  index("ifox_templates_creator_idx").on(table.createdBy),
]);

// 3. Automated Workflow Rules - Smart automation rules
export const ifoxWorkflowRules = pgTable("ifox_workflow_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Rule identity
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  ruleType: varchar("rule_type", { length: 100 }).notNull(), // auto_publish, auto_review, auto_reject, escalate, notify
  priority: integer("priority").default(5), // 1-10, higher = more important
  
  // Trigger conditions
  triggerEvent: varchar("trigger_event", { length: 100 }).notNull(), // task_completed, quality_check_passed, scheduled_time
  conditions: jsonb("conditions").notNull(), // Complex conditions like {qualityScore: {gte: 90}, wordCount: {between: [500, 1000]}}
  
  // Actions to perform
  actions: jsonb("actions").notNull(), // Array of actions: [{type: "publish", params: {}}, {type: "notify", params: {users: []}}]
  
  // Execution settings
  executeImmediately: boolean("execute_immediately").default(true),
  delayMinutes: integer("delay_minutes").default(0),
  retryOnFailure: boolean("retry_on_failure").default(true),
  maxRetries: integer("max_retries").default(3),
  
  // Scope & filters
  appliesTo: varchar("applies_to", { length: 100 }).default("all"), // all, specific_categories, specific_templates
  categoryFilters: jsonb("category_filters"), // Array of category IDs
  templateFilters: jsonb("template_filters"), // Array of template IDs
  
  // Human oversight
  requiresApproval: boolean("requires_approval").default(false),
  approvalRoles: jsonb("approval_roles"), // Array of role names that can approve
  notifyOnExecution: boolean("notify_on_execution").default(true),
  notifyUsers: jsonb("notify_users"), // Array of user IDs to notify
  
  // Execution tracking
  executionCount: integer("execution_count").default(0),
  successCount: integer("success_count").default(0),
  failureCount: integer("failure_count").default(0),
  lastExecutedAt: timestamp("last_executed_at"),
  
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_rules_type_idx").on(table.ruleType),
  index("ifox_rules_active_idx").on(table.isActive),
  index("ifox_rules_priority_idx").on(table.priority),
]);

// 4. Quality Checks - AI-powered quality control logs
export const ifoxQualityChecks = pgTable("ifox_quality_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Reference to content
  articleId: varchar("article_id").references(() => articles.id),
  taskId: varchar("task_id").references(() => aiScheduledTasks.id),
  
  // Overall quality score
  overallScore: integer("overall_score").notNull(), // 0-100
  passThreshold: integer("pass_threshold").default(70),
  passed: boolean("passed").notNull(),
  
  // Individual checks
  grammarScore: integer("grammar_score"), // 0-100
  readabilityScore: integer("readability_score"), // 0-100 (Flesch reading ease)
  factualAccuracyScore: integer("factual_accuracy_score"), // 0-100
  seoScore: integer("seo_score"), // 0-100
  biasScore: integer("bias_score"), // 0-100 (higher = less biased)
  originalityScore: integer("originality_score"), // 0-100
  relevanceScore: integer("relevance_score"), // 0-100
  
  // Detailed analysis
  issues: jsonb("issues"), // Array of {type, severity, description, suggestion}
  suggestions: jsonb("suggestions"), // Array of improvement suggestions
  strengths: jsonb("strengths"), // Array of positive aspects
  
  // AI analysis details
  analysisModel: varchar("analysis_model", { length: 100 }).default("gpt-4"),
  analysisPrompt: text("analysis_prompt"),
  rawAnalysis: jsonb("raw_analysis"),
  
  // Human review
  humanReviewRequired: boolean("human_review_required").default(false),
  humanReviewStatus: varchar("human_review_status", { length: 50 }), // pending, approved, rejected
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  
  // Metadata
  checkDuration: integer("check_duration"), // Milliseconds
  apiCost: real("api_cost"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_quality_article_idx").on(table.articleId),
  index("ifox_quality_task_idx").on(table.taskId),
  index("ifox_quality_score_idx").on(table.overallScore),
  index("ifox_quality_passed_idx").on(table.passed),
]);

// 5. Performance Metrics - Track AI content performance
export const ifoxPerformanceMetrics = pgTable("ifox_performance_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Content reference
  articleId: varchar("article_id").notNull().references(() => articles.id),
  isAiGenerated: boolean("is_ai_generated").notNull(),
  generationMethod: varchar("generation_method", { length: 100 }), // scheduled_task, manual_generation, email_import, whatsapp_import
  
  // Engagement metrics
  viewCount: integer("view_count").default(0),
  uniqueVisitors: integer("unique_visitors").default(0),
  avgTimeOnPage: integer("avg_time_on_page"), // Seconds
  bounceRate: real("bounce_rate"), // Percentage
  shareCount: integer("share_count").default(0),
  commentCount: integer("comment_count").default(0),
  bookmarkCount: integer("bookmark_count").default(0),
  
  // Social performance
  facebookShares: integer("facebook_shares").default(0),
  twitterShares: integer("twitter_shares").default(0),
  whatsappShares: integer("whatsapp_shares").default(0),
  linkedinShares: integer("linkedin_shares").default(0),
  
  // SEO performance
  organicTraffic: integer("organic_traffic").default(0),
  searchRankings: jsonb("search_rankings"), // {keyword: rank}
  clickThroughRate: real("click_through_rate"), // From search results
  
  // Conversion metrics
  newsletterSignups: integer("newsletter_signups").default(0),
  leadGenerated: integer("lead_generated").default(0),
  
  // Quality indicators
  qualityScore: integer("quality_score"),
  userSatisfaction: real("user_satisfaction"), // 0-5 stars
  reportCount: integer("report_count").default(0), // User reports
  
  // Financial metrics
  generationCost: real("generation_cost"),
  estimatedRevenue: real("estimated_revenue"),
  roi: real("roi"), // Return on investment
  
  // Time tracking
  publishedAt: timestamp("published_at"),
  firstViewAt: timestamp("first_view_at"),
  peakTrafficAt: timestamp("peak_traffic_at"),
  
  // Comparison benchmarks
  performanceVsAverage: real("performance_vs_average"), // Percentage vs category average
  performanceVsHuman: real("performance_vs_human"), // AI vs human-written content
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_perf_article_idx").on(table.articleId),
  index("ifox_perf_ai_gen_idx").on(table.isAiGenerated),
  index("ifox_perf_published_idx").on(table.publishedAt),
]);

// 6. Budget Tracking - Monitor API usage and costs
export const ifoxBudgetTracking = pgTable("ifox_budget_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Period tracking
  period: varchar("period", { length: 50 }).notNull(), // daily, weekly, monthly
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // API usage by provider
  openaiCalls: integer("openai_calls").default(0),
  openaiTokens: integer("openai_tokens").default(0),
  openaiCost: real("openai_cost").default(0),
  
  anthropicCalls: integer("anthropic_calls").default(0),
  anthropicTokens: integer("anthropic_tokens").default(0),
  anthropicCost: real("anthropic_cost").default(0),
  
  geminiCalls: integer("gemini_calls").default(0),
  geminiTokens: integer("gemini_tokens").default(0),
  geminiCost: real("gemini_cost").default(0),
  
  visualAiCalls: integer("visual_ai_calls").default(0),
  visualAiCost: real("visual_ai_cost").default(0),
  
  // Total costs
  totalApiCalls: integer("total_api_calls").default(0),
  totalTokens: integer("total_tokens").default(0),
  totalCost: real("total_cost").default(0),
  
  // Budget limits
  budgetLimit: real("budget_limit"),
  budgetRemaining: real("budget_remaining"),
  budgetUtilization: real("budget_utilization"), // Percentage
  
  // Usage breakdown
  contentGenerationCost: real("content_generation_cost").default(0),
  imageGenerationCost: real("image_generation_cost").default(0),
  qualityCheckCost: real("quality_check_cost").default(0),
  seoCost: real("seo_cost").default(0),
  otherCost: real("other_cost").default(0),
  
  // Efficiency metrics
  articlesGenerated: integer("articles_generated").default(0),
  costPerArticle: real("cost_per_article"),
  avgTokensPerArticle: real("avg_tokens_per_article"),
  
  // Alerts
  isOverBudget: boolean("is_over_budget").default(false),
  alertsSent: integer("alerts_sent").default(0),
  lastAlertAt: timestamp("last_alert_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_budget_period_idx").on(table.period, table.periodStart),
  index("ifox_budget_cost_idx").on(table.totalCost),
  index("ifox_budget_alert_idx").on(table.isOverBudget),
]);

// 7. Strategy Insights - AI-powered content strategy recommendations
export const ifoxStrategyInsights = pgTable("ifox_strategy_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Insight metadata
  insightType: varchar("insight_type", { length: 100 }).notNull(), // trending_topic, content_gap, timing_optimization, audience_preference
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description").notNull(),
  priority: varchar("priority", { length: 50 }).default("medium"), // low, medium, high, critical
  
  // Data-driven recommendations
  recommendation: text("recommendation").notNull(),
  expectedImpact: varchar("expected_impact", { length: 100 }), // high_traffic, high_engagement, viral_potential, seo_boost
  confidenceScore: integer("confidence_score"), // 0-100
  
  // Supporting data
  supportingData: jsonb("supporting_data"), // Data that led to this insight
  relatedTopics: jsonb("related_topics"), // Array of related topics/keywords
  suggestedCategories: jsonb("suggested_categories"), // Array of category IDs
  
  // Timing recommendations
  bestPublishTime: timestamp("best_publish_time"),
  optimalFrequency: varchar("optimal_frequency", { length: 100 }), // daily, twice_weekly, weekly
  estimatedLifespan: integer("estimated_lifespan"), // Days until topic becomes stale
  
  // Competitive analysis
  competitorCoverage: jsonb("competitor_coverage"), // How competitors are covering this
  contentGap: text("content_gap"), // What's missing in current coverage
  differentiationStrategy: text("differentiation_strategy"),
  
  // AI analysis
  analysisModel: varchar("analysis_model", { length: 100 }).default("gpt-4"),
  analysisData: jsonb("analysis_data"),
  
  // Action tracking
  status: varchar("status", { length: 50 }).default("active"), // active, implemented, dismissed, expired
  implementedBy: varchar("implemented_by").references(() => users.id),
  implementedAt: timestamp("implemented_at"),
  resultingArticles: jsonb("resulting_articles"), // Array of article IDs created from this insight
  
  // Performance
  actualImpact: jsonb("actual_impact"), // Actual results vs prediction
  impactScore: integer("impact_score"), // 0-100, how successful was this insight
  
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_insights_type_idx").on(table.insightType),
  index("ifox_insights_priority_idx").on(table.priority),
  index("ifox_insights_status_idx").on(table.status),
  index("ifox_insights_expires_idx").on(table.expiresAt),
]);

// 8. Editorial Calendar - Smart content planning
export const ifoxEditorialCalendar = pgTable("ifox_editorial_calendar", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Scheduled content
  scheduledDate: timestamp("scheduled_date").notNull(),
  slot: varchar("slot", { length: 50 }).notNull(), // morning, afternoon, evening, night
  
  // Content planning
  topicIdea: text("topic_idea"),
  plannedContentType: varchar("planned_content_type", { length: 100 }), // news, analysis, opinion, tutorial
  targetAudience: varchar("target_audience", { length: 100 }),
  keywords: jsonb("keywords"), // Array of target keywords
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: 'set null' }),
  
  // Assignment
  assignmentType: varchar("assignment_type", { length: 50 }).default("ai"), // ai, human, hybrid
  assignedToUser: varchar("assigned_to_user").references(() => users.id),
  assignedToTask: varchar("assigned_to_task").references(() => aiScheduledTasks.id),
  templateId: varchar("template_id").references(() => ifoxContentTemplates.id),
  
  // AI recommendations
  aiSuggestion: text("ai_suggestion"),
  suggestedCategories: jsonb("suggested_categories"),
  estimatedEngagement: integer("estimated_engagement"), // Predicted view count
  competitionLevel: varchar("competition_level", { length: 50 }), // low, medium, high
  
  // Status tracking
  status: varchar("status", { length: 50 }).default("planned"), // planned, in_progress, completed, cancelled, failed
  articleId: varchar("article_id").references(() => articles.id), // Link to published article
  
  // Retry tracking (for failed tasks)
  retryCount: integer("retry_count").default(0).notNull(),
  lastErrorAt: timestamp("last_error_at"),
  lastErrorReason: text("last_error_reason"),
  
  // Performance tracking
  actualPublishedAt: timestamp("actual_published_at"),
  actualEngagement: integer("actual_engagement"),
  performanceVsPrediction: real("performance_vs_prediction"), // Percentage
  
  // Metadata
  notes: text("notes"),
  tags: jsonb("tags"),
  
  createdBy: varchar("created_by").references(() => users.id),
  updatedBy: varchar("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("ifox_calendar_date_idx").on(table.scheduledDate),
  index("ifox_calendar_status_idx").on(table.status),
  index("ifox_calendar_assigned_idx").on(table.assignedToUser),
]);

// Relations for iFox AI Management tables
export const ifoxAiPreferencesRelations = relations(ifoxAiPreferences, ({ one }) => ({
  creator: one(users, {
    fields: [ifoxAiPreferences.createdBy],
    references: [users.id],
  }),
}));

export const ifoxContentTemplatesRelations = relations(ifoxContentTemplates, ({ one, many }) => ({
  creator: one(users, {
    fields: [ifoxContentTemplates.createdBy],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [ifoxContentTemplates.defaultCategory],
    references: [categories.id],
  }),
  calendarEntries: many(ifoxEditorialCalendar),
}));

export const ifoxWorkflowRulesRelations = relations(ifoxWorkflowRules, ({ one }) => ({
  creator: one(users, {
    fields: [ifoxWorkflowRules.createdBy],
    references: [users.id],
  }),
}));

export const ifoxQualityChecksRelations = relations(ifoxQualityChecks, ({ one }) => ({
  article: one(articles, {
    fields: [ifoxQualityChecks.articleId],
    references: [articles.id],
  }),
  task: one(aiScheduledTasks, {
    fields: [ifoxQualityChecks.taskId],
    references: [aiScheduledTasks.id],
  }),
  reviewer: one(users, {
    fields: [ifoxQualityChecks.reviewedBy],
    references: [users.id],
  }),
}));

export const ifoxPerformanceMetricsRelations = relations(ifoxPerformanceMetrics, ({ one }) => ({
  article: one(articles, {
    fields: [ifoxPerformanceMetrics.articleId],
    references: [articles.id],
  }),
}));

export const ifoxStrategyInsightsRelations = relations(ifoxStrategyInsights, ({ one }) => ({
  implementer: one(users, {
    fields: [ifoxStrategyInsights.implementedBy],
    references: [users.id],
  }),
}));

export const ifoxEditorialCalendarRelations = relations(ifoxEditorialCalendar, ({ one }) => ({
  assignedUser: one(users, {
    fields: [ifoxEditorialCalendar.assignedToUser],
    references: [users.id],
  }),
  task: one(aiScheduledTasks, {
    fields: [ifoxEditorialCalendar.assignedToTask],
    references: [aiScheduledTasks.id],
  }),
  template: one(ifoxContentTemplates, {
    fields: [ifoxEditorialCalendar.templateId],
    references: [ifoxContentTemplates.id],
  }),
  article: one(articles, {
    fields: [ifoxEditorialCalendar.articleId],
    references: [articles.id],
  }),
  creator: one(users, {
    fields: [ifoxEditorialCalendar.createdBy],
    references: [users.id],
  }),
}));

// ============================================
// ADVANCED READER BEHAVIOR ANALYTICS SYSTEM
// ============================================

// Reading Sessions - Track complete reading sessions
export const readingSessions = pgTable("reading_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  sessionId: varchar("session_id").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  deviceType: text("device_type"),
  platform: text("platform"),
  browser: text("browser"),
  screenWidth: integer("screen_width"),
  screenHeight: integer("screen_height"),
  referrerDomain: text("referrer_domain"),
  referrerUrl: text("referrer_url"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  utmTerm: text("utm_term"),
  utmContent: text("utm_content"),
  landingPage: text("landing_page"),
  exitPage: text("exit_page"),
  totalDurationMs: integer("total_duration_ms"),
  totalPagesViewed: integer("total_pages_viewed").default(0),
  totalArticlesRead: integer("total_articles_read").default(0),
  isNewVisitor: boolean("is_new_visitor").default(false),
  country: text("country"),
  city: text("city"),
  language: text("language").default("ar"),
}, (table) => [
  index("idx_reading_sessions_user").on(table.userId),
  index("idx_reading_sessions_session").on(table.sessionId),
  index("idx_reading_sessions_started").on(table.startedAt.desc()),
  index("idx_reading_sessions_device").on(table.deviceType),
  index("idx_reading_sessions_source").on(table.utmSource, table.utmMedium),
]);

// Section Analytics - Track section-level engagement within articles
export const sectionAnalytics = pgTable("section_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => readingSessions.id, { onDelete: "cascade" }),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id),
  sectionIndex: integer("section_index").notNull(),
  sectionType: text("section_type"),
  paragraphIndex: integer("paragraph_index"),
  dwellTimeMs: integer("dwell_time_ms").default(0),
  scrollDepthStart: integer("scroll_depth_start"),
  scrollDepthEnd: integer("scroll_depth_end"),
  visibleTimeMs: integer("visible_time_ms").default(0),
  heatScore: real("heat_score"),
  wasHighlighted: boolean("was_highlighted").default(false),
  wasShared: boolean("was_shared").default(false),
  interactionCount: integer("interaction_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_section_analytics_session").on(table.sessionId),
  index("idx_section_analytics_article").on(table.articleId),
  index("idx_section_analytics_section").on(table.articleId, table.sectionIndex),
  index("idx_section_analytics_heat").on(table.articleId, table.heatScore.desc()),
]);

// Navigation Paths - Track user navigation between pages/articles
export const navigationPaths = pgTable("navigation_paths", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => readingSessions.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id),
  fromPageType: text("from_page_type"),
  fromPageId: varchar("from_page_id"),
  fromArticleId: varchar("from_article_id").references(() => articles.id, { onDelete: "set null" }),
  fromCategoryId: varchar("from_category_id").references(() => categories.id, { onDelete: "set null" }),
  toPageType: text("to_page_type").notNull(),
  toPageId: varchar("to_page_id"),
  toArticleId: varchar("to_article_id").references(() => articles.id, { onDelete: "set null" }),
  toCategoryId: varchar("to_category_id").references(() => categories.id, { onDelete: "set null" }),
  transitionType: text("transition_type"),
  dwellTimeOnFromMs: integer("dwell_time_on_from_ms"),
  scrollDepthOnFrom: integer("scroll_depth_on_from"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("idx_nav_paths_session").on(table.sessionId),
  index("idx_nav_paths_from_article").on(table.fromArticleId),
  index("idx_nav_paths_to_article").on(table.toArticleId),
  index("idx_nav_paths_occurred").on(table.occurredAt.desc()),
  index("idx_nav_paths_transition").on(table.transitionType),
]);

// Traffic Sources - Detailed referrer and source tracking
export const trafficSources = pgTable("traffic_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => readingSessions.id, { onDelete: "cascade" }).notNull(),
  sourceType: text("source_type").notNull(),
  sourceMedium: text("source_medium"),
  sourceChannel: text("source_channel"),
  referrerDomain: text("referrer_domain"),
  referrerPath: text("referrer_path"),
  searchKeyword: text("search_keyword"),
  socialPlatform: text("social_platform"),
  campaignName: text("campaign_name"),
  campaignSource: text("campaign_source"),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  conversionValue: real("conversion_value"),
  isConverted: boolean("is_converted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_traffic_sources_session").on(table.sessionId),
  index("idx_traffic_sources_type").on(table.sourceType),
  index("idx_traffic_sources_social").on(table.socialPlatform),
  index("idx_traffic_sources_domain").on(table.referrerDomain),
  index("idx_traffic_sources_created").on(table.createdAt.desc()),
]);

// Hourly Engagement Rollups - Pre-aggregated hourly statistics
export const hourlyEngagementRollups = pgTable("hourly_engagement_rollups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dateHour: timestamp("date_hour").notNull(),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  dimensions: jsonb("dimensions"),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "cascade" }),
  deviceType: text("device_type"),
  platform: text("platform"),
  language: text("language"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_hourly_rollups_hour").on(table.dateHour.desc()),
  index("idx_hourly_rollups_metric").on(table.metric),
  index("idx_hourly_rollups_article").on(table.articleId),
  index("idx_hourly_rollups_category").on(table.categoryId),
  index("idx_hourly_rollups_composite").on(table.dateHour, table.metric, table.articleId),
]);

// Real-time Metrics - For live dashboard updates
export const realTimeMetrics = pgTable("real_time_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),
  dimensions: jsonb("dimensions"),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_realtime_metrics_metric").on(table.metric),
  index("idx_realtime_metrics_window").on(table.windowStart, table.windowEnd),
  index("idx_realtime_metrics_article").on(table.articleId),
]);

// Article Engagement Scores - Pre-calculated engagement scores per article
export const articleEngagementScores = pgTable("article_engagement_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull().unique(),
  overallScore: real("overall_score").default(0),
  readabilityScore: real("readability_score"),
  engagementRate: real("engagement_rate"),
  avgTimeOnPage: integer("avg_time_on_page"),
  avgScrollDepth: real("avg_scroll_depth"),
  bounceRate: real("bounce_rate"),
  shareCount: integer("share_count").default(0),
  commentCount: integer("comment_count").default(0),
  reactionCount: integer("reaction_count").default(0),
  bookmarkCount: integer("bookmark_count").default(0),
  uniqueVisitors: integer("unique_visitors").default(0),
  returningVisitors: integer("returning_visitors").default(0),
  peakHour: integer("peak_hour"),
  topReferrer: text("top_referrer"),
  topDevice: text("top_device"),
  lastCalculated: timestamp("last_calculated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_engagement_scores_article").on(table.articleId),
  index("idx_engagement_scores_overall").on(table.overallScore.desc()),
  index("idx_engagement_scores_rate").on(table.engagementRate.desc()),
]);

// Reader Journey Milestones - Track key moments in reader journey
export const readerJourneyMilestones = pgTable("reader_journey_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  sessionId: varchar("session_id").references(() => readingSessions.id, { onDelete: "cascade" }),
  milestoneType: text("milestone_type").notNull(),
  milestoneValue: text("milestone_value"),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  metadata: jsonb("metadata"),
  achievedAt: timestamp("achieved_at").defaultNow().notNull(),
}, (table) => [
  index("idx_journey_milestones_user").on(table.userId),
  index("idx_journey_milestones_type").on(table.milestoneType),
  index("idx_journey_milestones_achieved").on(table.achievedAt.desc()),
]);

// Relations for Advanced Analytics
export const readingSessionsRelations = relations(readingSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [readingSessions.userId],
    references: [users.id],
  }),
  sectionAnalytics: many(sectionAnalytics),
  navigationPaths: many(navigationPaths),
  trafficSources: many(trafficSources),
  milestones: many(readerJourneyMilestones),
}));

export const sectionAnalyticsRelations = relations(sectionAnalytics, ({ one }) => ({
  session: one(readingSessions, {
    fields: [sectionAnalytics.sessionId],
    references: [readingSessions.id],
  }),
  article: one(articles, {
    fields: [sectionAnalytics.articleId],
    references: [articles.id],
  }),
  user: one(users, {
    fields: [sectionAnalytics.userId],
    references: [users.id],
  }),
}));

export const navigationPathsRelations = relations(navigationPaths, ({ one }) => ({
  session: one(readingSessions, {
    fields: [navigationPaths.sessionId],
    references: [readingSessions.id],
  }),
  user: one(users, {
    fields: [navigationPaths.userId],
    references: [users.id],
  }),
  fromArticle: one(articles, {
    fields: [navigationPaths.fromArticleId],
    references: [articles.id],
  }),
  toArticle: one(articles, {
    fields: [navigationPaths.toArticleId],
    references: [articles.id],
  }),
}));

export const trafficSourcesRelations = relations(trafficSources, ({ one }) => ({
  session: one(readingSessions, {
    fields: [trafficSources.sessionId],
    references: [readingSessions.id],
  }),
  article: one(articles, {
    fields: [trafficSources.articleId],
    references: [articles.id],
  }),
}));

export const articleEngagementScoresRelations = relations(articleEngagementScores, ({ one }) => ({
  article: one(articles, {
    fields: [articleEngagementScores.articleId],
    references: [articles.id],
  }),
}));

export const readerJourneyMilestonesRelations = relations(readerJourneyMilestones, ({ one }) => ({
  user: one(users, {
    fields: [readerJourneyMilestones.userId],
    references: [users.id],
  }),
  session: one(readingSessions, {
    fields: [readerJourneyMilestones.sessionId],
    references: [readingSessions.id],
  }),
  article: one(articles, {
    fields: [readerJourneyMilestones.articleId],
    references: [articles.id],
  }),
  category: one(categories, {
    fields: [readerJourneyMilestones.categoryId],
    references: [categories.id],
  }),
}));

// Insert schemas for Advanced Analytics
export const insertReadingSessionSchema = createInsertSchema(readingSessions).omit({
  id: true,
  startedAt: true,
});

export const insertSectionAnalyticsSchema = createInsertSchema(sectionAnalytics).omit({
  id: true,
  createdAt: true,
});

export const insertNavigationPathSchema = createInsertSchema(navigationPaths).omit({
  id: true,
  occurredAt: true,
});

export const insertTrafficSourceSchema = createInsertSchema(trafficSources).omit({
  id: true,
  createdAt: true,
});

export const insertHourlyEngagementRollupSchema = createInsertSchema(hourlyEngagementRollups).omit({
  id: true,
  createdAt: true,
});

export const insertRealTimeMetricSchema = createInsertSchema(realTimeMetrics).omit({
  id: true,
  updatedAt: true,
});

export const insertArticleEngagementScoreSchema = createInsertSchema(articleEngagementScores).omit({
  id: true,
  createdAt: true,
  lastCalculated: true,
});

export const insertReaderJourneyMilestoneSchema = createInsertSchema(readerJourneyMilestones).omit({
  id: true,
  achievedAt: true,
});

// Select types for Advanced Analytics
export type ReadingSession = typeof readingSessions.$inferSelect;
export type InsertReadingSession = z.infer<typeof insertReadingSessionSchema>;

export type SectionAnalytic = typeof sectionAnalytics.$inferSelect;
export type InsertSectionAnalytic = z.infer<typeof insertSectionAnalyticsSchema>;

export type NavigationPath = typeof navigationPaths.$inferSelect;
export type InsertNavigationPath = z.infer<typeof insertNavigationPathSchema>;

export type TrafficSource = typeof trafficSources.$inferSelect;
export type InsertTrafficSource = z.infer<typeof insertTrafficSourceSchema>;

export type HourlyEngagementRollup = typeof hourlyEngagementRollups.$inferSelect;
export type InsertHourlyEngagementRollup = z.infer<typeof insertHourlyEngagementRollupSchema>;

export type RealTimeMetric = typeof realTimeMetrics.$inferSelect;
export type InsertRealTimeMetric = z.infer<typeof insertRealTimeMetricSchema>;

export type ArticleEngagementScore = typeof articleEngagementScores.$inferSelect;
export type InsertArticleEngagementScore = z.infer<typeof insertArticleEngagementScoreSchema>;

export type ReaderJourneyMilestone = typeof readerJourneyMilestones.$inferSelect;
export type InsertReaderJourneyMilestone = z.infer<typeof insertReaderJourneyMilestoneSchema>;

// Insert schemas for iFox AI Management
export const insertIfoxAiPreferencesSchema = createInsertSchema(ifoxAiPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIfoxContentTemplateSchema = createInsertSchema(ifoxContentTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
  successRate: true,
  averageQualityScore: true,
}).extend({
  name: z.string().min(1).max(200),
  templateType: z.enum(["breaking_news", "analysis", "interview", "opinion", "review", "tutorial", "feature", "listicle"]),
  language: z.enum(["ar", "en", "ur"]),
  promptTemplate: z.string().min(10),
});

export const insertIfoxWorkflowRuleSchema = createInsertSchema(ifoxWorkflowRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  executionCount: true,
  successCount: true,
  failureCount: true,
  lastExecutedAt: true,
}).extend({
  name: z.string().min(1).max(200),
  ruleType: z.enum(["auto_publish", "auto_review", "auto_reject", "escalate", "notify", "schedule"]),
  triggerEvent: z.enum(["task_completed", "quality_check_passed", "quality_check_failed", "scheduled_time", "manual_trigger"]),
});

export const insertIfoxQualityCheckSchema = createInsertSchema(ifoxQualityChecks).omit({
  id: true,
  createdAt: true,
});

export const insertIfoxPerformanceMetricSchema = createInsertSchema(ifoxPerformanceMetrics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIfoxBudgetTrackingSchema = createInsertSchema(ifoxBudgetTracking).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIfoxStrategyInsightSchema = createInsertSchema(ifoxStrategyInsights).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  insightType: z.enum(["trending_topic", "content_gap", "timing_optimization", "audience_preference", "competitive_analysis"]),
  title: z.string().min(1).max(300),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

export const insertIfoxEditorialCalendarSchema = createInsertSchema(ifoxEditorialCalendar).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  scheduledDate: z.string().or(z.date()),
  slot: z.enum(["morning", "afternoon", "evening", "night"]),
  assignmentType: z.enum(["ai", "human", "hybrid"]),
  status: z.enum(["planned", "in_progress", "completed", "cancelled", "failed"]),
  categoryId: z.string().optional(),
});

// Select types for iFox AI Management
export type IfoxAiPreferences = typeof ifoxAiPreferences.$inferSelect;
export type InsertIfoxAiPreferences = z.infer<typeof insertIfoxAiPreferencesSchema>;

export type IfoxContentTemplate = typeof ifoxContentTemplates.$inferSelect;
export type InsertIfoxContentTemplate = z.infer<typeof insertIfoxContentTemplateSchema>;

export type IfoxWorkflowRule = typeof ifoxWorkflowRules.$inferSelect;
export type InsertIfoxWorkflowRule = z.infer<typeof insertIfoxWorkflowRuleSchema>;

export type IfoxQualityCheck = typeof ifoxQualityChecks.$inferSelect;
export type InsertIfoxQualityCheck = z.infer<typeof insertIfoxQualityCheckSchema>;

export type IfoxPerformanceMetric = typeof ifoxPerformanceMetrics.$inferSelect;
export type InsertIfoxPerformanceMetric = z.infer<typeof insertIfoxPerformanceMetricSchema>;

export type IfoxBudgetTracking = typeof ifoxBudgetTracking.$inferSelect;
export type InsertIfoxBudgetTracking = z.infer<typeof insertIfoxBudgetTrackingSchema>;

export type IfoxStrategyInsight = typeof ifoxStrategyInsights.$inferSelect;
export type InsertIfoxStrategyInsight = z.infer<typeof insertIfoxStrategyInsightSchema>;

export type IfoxEditorialCalendar = typeof ifoxEditorialCalendar.$inferSelect;
export type InsertIfoxEditorialCalendar = z.infer<typeof insertIfoxEditorialCalendarSchema>;

// ============================================
// نظام إدارة التعليقات المتقدم - Advanced Comments Management System
// ============================================

// جدول الكلمات المشبوهة - Suspicious Words Table
export const suspiciousWords = pgTable("suspicious_words", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  word: text("word").notNull().unique(),
  category: text("category").default("general").notNull(), // spam, offensive, political, religious, advertising
  severity: text("severity").default("medium").notNull(), // low, medium, high, critical
  isActive: boolean("is_active").default(true).notNull(),
  matchType: text("match_type").default("exact").notNull(), // exact, contains, starts_with, ends_with, regex
  action: text("action").default("review").notNull(), // review = hold for moderation, reject = auto-reject (never publish)
  addedBy: varchar("added_by").references(() => users.id),
  notes: text("notes"),
  flagCount: integer("flag_count").default(0).notNull(), // عدد مرات الإبلاغ
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_suspicious_words_word").on(table.word),
  index("idx_suspicious_words_category").on(table.category),
  index("idx_suspicious_words_active").on(table.isActive),
]);

// جدول سجل التعليقات المحظورة - Flagged Comments Log
export const flaggedCommentsLog = pgTable("flagged_comments_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").references(() => comments.id, { onDelete: "cascade" }),
  wordId: varchar("word_id").references(() => suspiciousWords.id),
  matchedWord: text("matched_word").notNull(),
  originalContent: text("original_content").notNull(),
  action: text("action").default("flagged").notNull(), // flagged, auto_rejected, reviewed, approved
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_flagged_comments_comment").on(table.commentId),
  index("idx_flagged_comments_action").on(table.action),
]);

// جدول سجل تعديلات التعليقات - Comment Edit History
export const commentEditHistory = pgTable("comment_edit_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").references(() => comments.id, { onDelete: "cascade" }).notNull(),
  previousContent: text("previous_content").notNull(),
  newContent: text("new_content").notNull(),
  editedBy: varchar("edited_by").references(() => users.id).notNull(),
  editReason: text("edit_reason"),
  editType: text("edit_type").default("content").notNull(), // content, status, moderation
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_comment_edit_history_comment").on(table.commentId),
  index("idx_comment_edit_history_edited_by").on(table.editedBy),
]);

// جدول سجل حذف التعليقات - Comment Deletion Log
export const commentDeletionLog = pgTable("comment_deletion_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  commentId: varchar("comment_id").notNull(),
  articleId: varchar("article_id").notNull(),
  userId: varchar("user_id").notNull(),
  content: text("content").notNull(),
  status: text("status").notNull(),
  deletedBy: varchar("deleted_by").references(() => users.id).notNull(),
  deletionReason: text("deletion_reason"),
  aiClassification: text("ai_classification"),
  aiModerationScore: integer("ai_moderation_score"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_comment_deletion_log_article").on(table.articleId),
  index("idx_comment_deletion_log_deleted_by").on(table.deletedBy),
]);

// Insert schemas for Comments Management
export const insertSuspiciousWordSchema = createInsertSchema(suspiciousWords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  flagCount: true,
}).extend({
  word: z.string().min(2).max(100),
  category: z.enum([
    "general",
    "spam",
    "offensive",
    "profanity",
    "political",
    "religious",
    "advertising",
    "personal_attack",
  ]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  matchType: z.enum(["exact", "contains", "starts_with", "ends_with", "regex"]).optional(),
  action: z.enum(["review", "reject"]).optional(),
});

export const insertFlaggedCommentLogSchema = createInsertSchema(flaggedCommentsLog).omit({
  id: true,
  createdAt: true,
});

// Insert schemas for Comment Edit History
export const insertCommentEditHistorySchema = createInsertSchema(commentEditHistory).omit({
  id: true,
  createdAt: true,
});

export const insertCommentDeletionLogSchema = createInsertSchema(commentDeletionLog).omit({
  id: true,
  createdAt: true,
});

// Select types for Comments Management
export type SuspiciousWord = typeof suspiciousWords.$inferSelect;
export type InsertSuspiciousWord = z.infer<typeof insertSuspiciousWordSchema>;

export type FlaggedCommentLog = typeof flaggedCommentsLog.$inferSelect;
export type InsertFlaggedCommentLog = z.infer<typeof insertFlaggedCommentLogSchema>;

export type CommentEditHistory = typeof commentEditHistory.$inferSelect;
export type InsertCommentEditHistory = z.infer<typeof insertCommentEditHistorySchema>;

export type CommentDeletionLog = typeof commentDeletionLog.$inferSelect;
export type InsertCommentDeletionLog = z.infer<typeof insertCommentDeletionLogSchema>;

// ============================================
// Smart Notification System v2.0
// ============================================

// جدول ذاكرة الإشعارات - Notification Memory Layer (30-day deduplication)
export const notificationMemory = pgTable("notification_memory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  notificationType: varchar("notification_type", { length: 50 }).notNull(), // 'breaking', 'interest', 'behavior'
  hash: varchar("hash", { length: 64 }).notNull().unique(), // SHA256(userId + articleId + type)
  sentAt: timestamp("sent_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").default(sql`NOW() + INTERVAL '30 days'`).notNull(),
}, (table) => [
  index("idx_notification_memory_user").on(table.userId),
  index("idx_notification_memory_expires").on(table.expiresAt),
  index("idx_notification_memory_hash").on(table.hash),
  index("idx_notification_memory_user_article").on(table.userId, table.articleId),
]);

// جدول إشارات سلوك المستخدم - User Behavior Signals
export const userBehaviorSignals = pgTable("user_behavior_signals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  signalType: varchar("signal_type", { length: 50 }).notNull(), // 'read', 'like', 'share', 'bookmark', 'time_spent', 'comment', 'search', 'notification_click', 'notification_dismiss'
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }),
  categoryId: varchar("category_id").references(() => categories.id, { onDelete: "set null" }),
  tagId: varchar("tag_id"),
  weight: real("weight").default(1.0).notNull(), // Signal importance weight
  decayFactor: real("decay_factor").default(1.0).notNull(), // Decays over time
  metadata: jsonb("metadata"), // Additional signal context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_behavior_signals_user").on(table.userId),
  index("idx_behavior_signals_type").on(table.signalType),
  index("idx_behavior_signals_created").on(table.createdAt),
  index("idx_behavior_signals_user_category").on(table.userId, table.categoryId),
  index("idx_behavior_signals_user_type").on(table.userId, table.signalType),
]);

// جدول الاهتمامات الديناميكية - Dynamic User Interests (calculated from behavior)
export const userDynamicInterests = pgTable("user_dynamic_interests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  interestType: varchar("interest_type", { length: 50 }).notNull(), // 'category', 'tag', 'author', 'topic'
  interestId: varchar("interest_id", { length: 255 }).notNull(),
  interestName: varchar("interest_name", { length: 255 }), // Display name
  score: real("score").default(0.0).notNull(), // 0.0 to 1.0 affinity score
  interactionCount: integer("interaction_count").default(0).notNull(),
  lastInteraction: timestamp("last_interaction").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dynamic_interests_user").on(table.userId),
  index("idx_dynamic_interests_score").on(table.userId, table.score),
  index("idx_dynamic_interests_type").on(table.userId, table.interestType),
  uniqueIndex("idx_dynamic_interests_unique").on(table.userId, table.interestType, table.interestId),
]);

// جدول تحليلات الإشعارات - Notification Analytics
export const notificationAnalytics = pgTable("notification_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  notificationId: varchar("notification_id").references(() => notificationsInbox.id, { onDelete: "cascade" }).notNull(),
  notificationType: varchar("notification_type", { length: 50 }).notNull(),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  scoreAtSend: real("score_at_send"), // The score when notification was sent
  recommendationReason: varchar("recommendation_reason", { length: 100 }), // Why this was recommended
  opened: boolean("opened").default(false).notNull(),
  clicked: boolean("clicked").default(false).notNull(),
  dismissed: boolean("dismissed").default(false).notNull(),
  timeToOpen: integer("time_to_open"), // Seconds until opened
  timeToClick: integer("time_to_click"), // Seconds until clicked
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  dismissedAt: timestamp("dismissed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notification_analytics_user").on(table.userId),
  index("idx_notification_analytics_type").on(table.notificationType),
  index("idx_notification_analytics_article").on(table.articleId),
  index("idx_notification_analytics_created").on(table.createdAt),
]);

// Insert schemas for Smart Notification System
export const insertNotificationMemorySchema = createInsertSchema(notificationMemory).omit({
  id: true,
  sentAt: true,
  expiresAt: true,
});

export const insertUserBehaviorSignalSchema = createInsertSchema(userBehaviorSignals).omit({
  id: true,
  createdAt: true,
  decayFactor: true,
});

export const insertUserDynamicInterestSchema = createInsertSchema(userDynamicInterests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  interactionCount: true,
});

export const insertNotificationAnalyticsSchema = createInsertSchema(notificationAnalytics).omit({
  id: true,
  createdAt: true,
  opened: true,
  clicked: true,
  dismissed: true,
  timeToOpen: true,
  timeToClick: true,
  openedAt: true,
  clickedAt: true,
  dismissedAt: true,
});

// Select types for Smart Notification System
export type NotificationMemory = typeof notificationMemory.$inferSelect;
export type InsertNotificationMemory = z.infer<typeof insertNotificationMemorySchema>;

export type UserBehaviorSignal = typeof userBehaviorSignals.$inferSelect;
export type InsertUserBehaviorSignal = z.infer<typeof insertUserBehaviorSignalSchema>;

export type UserDynamicInterest = typeof userDynamicInterests.$inferSelect;
export type InsertUserDynamicInterest = z.infer<typeof insertUserDynamicInterestSchema>;

export type NotificationAnalytics = typeof notificationAnalytics.$inferSelect;
export type InsertNotificationAnalytics = z.infer<typeof insertNotificationAnalyticsSchema>;

// ============================================
// ARTICLE QUIZ SYSTEM - اختبارات الفهم
// ============================================

// جدول الاختبارات المرتبطة بالمقالات
export const articleQuizzes = pgTable("article_quizzes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull().unique(),
  title: text("title").notNull(), // عنوان الاختبار
  description: text("description"), // وصف الاختبار
  isEnabled: boolean("is_enabled").default(true).notNull(), // تفعيل/إيقاف الاختبار
  passingScore: integer("passing_score").default(70).notNull(), // النسبة المئوية للنجاح
  showCorrectAnswers: boolean("show_correct_answers").default(true).notNull(), // إظهار الإجابات الصحيحة
  allowRetake: boolean("allow_retake").default(true).notNull(), // السماح بإعادة المحاولة
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_article_quizzes_article").on(table.articleId),
  index("idx_article_quizzes_enabled").on(table.isEnabled),
]);

// جدول أسئلة الاختبار
export const quizQuestions = pgTable("quiz_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quizId: varchar("quiz_id").references(() => articleQuizzes.id, { onDelete: "cascade" }).notNull(),
  question: text("question").notNull(), // نص السؤال
  choices: jsonb("choices").notNull().$type<string[]>(), // الخيارات
  correctIndex: integer("correct_index").notNull(), // فهرس الإجابة الصحيحة
  explanation: text("explanation"), // شرح الإجابة الصحيحة
  order: integer("order").default(0).notNull(), // ترتيب السؤال
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_quiz_questions_quiz").on(table.quizId),
  index("idx_quiz_questions_order").on(table.quizId, table.order),
]);

// جدول إجابات المستخدمين
export const quizResponses = pgTable("quiz_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quizId: varchar("quiz_id").references(() => articleQuizzes.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: varchar("session_id", { length: 255 }), // للزوار غير المسجلين
  answers: jsonb("answers").notNull().$type<{ questionId: string; selectedIndex: number }[]>(),
  score: integer("score").notNull(), // النتيجة كنسبة مئوية
  correctCount: integer("correct_count").notNull(), // عدد الإجابات الصحيحة
  totalQuestions: integer("total_questions").notNull(), // إجمالي الأسئلة
  passed: boolean("passed").default(false).notNull(), // هل نجح في الاختبار
  timeSpent: integer("time_spent"), // الوقت المستغرق بالثواني
  completedAt: timestamp("completed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_quiz_responses_quiz").on(table.quizId),
  index("idx_quiz_responses_user").on(table.userId),
  index("idx_quiz_responses_session").on(table.sessionId),
  index("idx_quiz_responses_completed").on(table.completedAt),
]);

// Relations for Quiz System
export const articleQuizzesRelations = relations(articleQuizzes, ({ one, many }) => ({
  article: one(articles, {
    fields: [articleQuizzes.articleId],
    references: [articles.id],
  }),
  createdByUser: one(users, {
    fields: [articleQuizzes.createdBy],
    references: [users.id],
  }),
  questions: many(quizQuestions),
  responses: many(quizResponses),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(articleQuizzes, {
    fields: [quizQuestions.quizId],
    references: [articleQuizzes.id],
  }),
}));

export const quizResponsesRelations = relations(quizResponses, ({ one }) => ({
  quiz: one(articleQuizzes, {
    fields: [quizResponses.quizId],
    references: [articleQuizzes.id],
  }),
  user: one(users, {
    fields: [quizResponses.userId],
    references: [users.id],
  }),
}));

// Insert schemas for Quiz System
export const insertArticleQuizSchema = createInsertSchema(articleQuizzes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQuizQuestionSchema = createInsertSchema(quizQuestions).omit({
  id: true,
  createdAt: true,
});

export const insertQuizResponseSchema = createInsertSchema(quizResponses).omit({
  id: true,
  completedAt: true,
});

// Select types for Quiz System
export type ArticleQuiz = typeof articleQuizzes.$inferSelect;
export type InsertArticleQuiz = z.infer<typeof insertArticleQuizSchema>;

export type QuizQuestion = typeof quizQuestions.$inferSelect;
export type InsertQuizQuestion = z.infer<typeof insertQuizQuestionSchema>;

export type QuizResponse = typeof quizResponses.$inferSelect;
export type InsertQuizResponse = z.infer<typeof insertQuizResponseSchema>;

// ============================================
// CORRESPONDENT REGISTRATION SYSTEM - نظام تسجيل المراسلين
// ============================================

// جدول طلبات تسجيل المراسلين
export const correspondentApplications = pgTable("correspondent_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // معلومات المراسل
  arabicName: text("arabic_name").notNull(), // الاسم بالعربية
  englishName: text("english_name").notNull(), // الاسم بالإنجليزية
  email: text("email").notNull(), // البريد الإلكتروني
  phone: text("phone").notNull(), // رقم الهاتف
  jobTitle: text("job_title").default("مراسل صحفي").notNull(), // المسمى الوظيفي
  bio: text("bio"), // السيرة الذاتية (اختياري)
  city: text("city").notNull(), // المدينة
  profilePhotoUrl: text("profile_photo_url").notNull(), // رابط الصورة الشخصية
  
  // حالة الطلب
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  
  // معلومات المراجعة
  reviewedBy: varchar("reviewed_by").references(() => users.id), // من راجع الطلب
  reviewedAt: timestamp("reviewed_at"), // تاريخ المراجعة
  reviewNotes: text("review_notes"), // ملاحظات المراجعة (سبب الرفض مثلاً)
  
  // المستخدم الناتج عن الموافقة
  createdUserId: varchar("created_user_id").references(() => users.id), // المستخدم المُنشأ بعد الموافقة
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_correspondent_applications_status").on(table.status),
  index("idx_correspondent_applications_email").on(table.email),
  index("idx_correspondent_applications_created").on(table.createdAt),
]);

// Relations for Correspondent Applications
export const correspondentApplicationsRelations = relations(correspondentApplications, ({ one }) => ({
  reviewer: one(users, {
    fields: [correspondentApplications.reviewedBy],
    references: [users.id],
    relationName: "reviewer",
  }),
  createdUser: one(users, {
    fields: [correspondentApplications.createdUserId],
    references: [users.id],
    relationName: "createdUser",
  }),
}));

// Insert schema for Correspondent Applications
export const insertCorrespondentApplicationSchema = createInsertSchema(correspondentApplications).omit({
  id: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  createdUserId: true,
  createdAt: true,
});

// Select types for Correspondent Applications
export type CorrespondentApplication = typeof correspondentApplications.$inferSelect;
export type InsertCorrespondentApplication = z.infer<typeof insertCorrespondentApplicationSchema>;

// Type for application with reviewer details
export type CorrespondentApplicationWithDetails = CorrespondentApplication & {
  reviewer?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

// ============================================
// OPINION AUTHOR REGISTRATION SYSTEM - نظام تسجيل كتّاب الرأي
// ============================================

// جدول طلبات تسجيل كتّاب الرأي
export const opinionAuthorApplications = pgTable("opinion_author_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // معلومات كاتب الرأي
  arabicName: text("arabic_name").notNull(), // الاسم بالعربية
  englishName: text("english_name").notNull(), // الاسم بالإنجليزية
  email: text("email").notNull(), // البريد الإلكتروني
  phone: text("phone").notNull(), // رقم الهاتف
  jobTitle: text("job_title").default("كاتب رأي").notNull(), // المسمى الوظيفي
  bio: text("bio"), // السيرة الذاتية (اختياري)
  city: text("city").notNull(), // المدينة
  profilePhotoUrl: text("profile_photo_url").notNull(), // رابط الصورة الشخصية
  
  // حقول خاصة بكتّاب الرأي
  specializations: text("specializations"), // التخصصات الكتابية (مثل: سياسة، اقتصاد، تقنية)
  writingSamples: text("writing_samples"), // روابط عينات الكتابة السابقة
  
  // حالة الطلب
  status: text("status").default("pending").notNull(), // pending, approved, rejected
  
  // معلومات المراجعة
  reviewedBy: varchar("reviewed_by").references(() => users.id), // من راجع الطلب
  reviewedAt: timestamp("reviewed_at"), // تاريخ المراجعة
  reviewNotes: text("review_notes"), // ملاحظات المراجعة (سبب الرفض مثلاً)
  
  // المستخدم الناتج عن الموافقة
  createdUserId: varchar("created_user_id").references(() => users.id), // المستخدم المُنشأ بعد الموافقة
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_opinion_author_applications_status").on(table.status),
  index("idx_opinion_author_applications_email").on(table.email),
  index("idx_opinion_author_applications_created").on(table.createdAt),
]);

// Relations for Opinion Author Applications
export const opinionAuthorApplicationsRelations = relations(opinionAuthorApplications, ({ one }) => ({
  reviewer: one(users, {
    fields: [opinionAuthorApplications.reviewedBy],
    references: [users.id],
    relationName: "opinionAuthorReviewer",
  }),
  createdUser: one(users, {
    fields: [opinionAuthorApplications.createdUserId],
    references: [users.id],
    relationName: "opinionAuthorCreatedUser",
  }),
}));

// Insert schema for Opinion Author Applications
export const insertOpinionAuthorApplicationSchema = createInsertSchema(opinionAuthorApplications).omit({
  id: true,
  status: true,
  reviewedBy: true,
  reviewedAt: true,
  reviewNotes: true,
  createdUserId: true,
  createdAt: true,
});

// Select types for Opinion Author Applications
export type OpinionAuthorApplication = typeof opinionAuthorApplications.$inferSelect;
export type InsertOpinionAuthorApplication = z.infer<typeof insertOpinionAuthorApplicationSchema>;

// Type for application with reviewer details
export type OpinionAuthorApplicationWithDetails = OpinionAuthorApplication & {
  reviewer?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
};

// ============================================
// نظام إشعارات البريد الإلكتروني للموظفين - Employee Email Notification System
// ============================================

export const employeeEmailTemplates = pgTable("employee_email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull().unique(), // 'correspondent_approved', 'correspondent_rejected', 'article_published', 'article_rejected', 'motivational'
  nameAr: text("name_ar").notNull(), // Arabic name for the template
  subject: text("subject").notNull(), // Email subject
  bodyHtml: text("body_html").notNull(), // HTML email body with placeholders
  bodyText: text("body_text").notNull(), // Plain text version
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_employee_email_templates_type").on(table.type),
  index("idx_employee_email_templates_active").on(table.isActive),
]);

// Insert schema for Employee Email Templates
export const insertEmployeeEmailTemplateSchema = createInsertSchema(employeeEmailTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateEmployeeEmailTemplateSchema = createInsertSchema(employeeEmailTemplates).omit({
  id: true,
  type: true,
  createdAt: true,
  updatedAt: true,
}).partial();

// Select types for Employee Email Templates
export type EmployeeEmailTemplate = typeof employeeEmailTemplates.$inferSelect;
export type InsertEmployeeEmailTemplate = z.infer<typeof insertEmployeeEmailTemplateSchema>;
export type UpdateEmployeeEmailTemplate = z.infer<typeof updateEmployeeEmailTemplateSchema>;

// ============================================
// نظام المحتوى المدفوع - Paid Content / Tap Payment System
// ============================================

// Article Purchases table - tracks user purchases
export const articlePurchases = pgTable("article_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }), // Nullable for guest purchases
  guestEmail: text("guest_email"), // Email for guest checkout
  guestPhone: text("guest_phone"), // Phone for guest checkout
  priceHalalas: integer("price_halalas").notNull(), // Price paid in halalas
  currency: text("currency").default("SAR").notNull(),
  status: text("status").default("pending").notNull(), // pending, completed, failed, refunded
  chargeId: text("charge_id"), // Tap charge ID
  accessToken: text("access_token"), // Token for guest access verification
  accessExpiresAt: timestamp("access_expires_at"), // Optional expiry for access
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_purchases_article").on(table.articleId),
  index("idx_purchases_user").on(table.userId),
  index("idx_purchases_charge").on(table.chargeId),
  index("idx_purchases_status").on(table.status),
  index("idx_purchases_access_token").on(table.accessToken),
]);

// Tap Payments table - tracks all payment transactions
export const tapPayments = pgTable("tap_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chargeId: text("charge_id").unique().notNull(), // Tap charge ID (chg_xxx)
  purchaseId: varchar("purchase_id").references(() => articlePurchases.id, { onDelete: "cascade" }).notNull(),
  amountHalalas: integer("amount_halalas").notNull(),
  currency: text("currency").default("SAR").notNull(),
  status: text("status").default("INITIATED").notNull(), // INITIATED, CAPTURED, FAILED, DECLINED, CANCELLED, ABANDONED
  redirectUrl: text("redirect_url"),
  transactionUrl: text("transaction_url"), // Tap payment page URL
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerName: text("customer_name"),
  cardBrand: text("card_brand"), // VISA, MASTERCARD, MADA, etc.
  cardLastFour: text("card_last_four"),
  gatewayResponse: jsonb("gateway_response").$type<{
    code?: string;
    message?: string;
  }>(),
  fullResponse: jsonb("full_response").$type<Record<string, any>>(), // Full Tap API response
  webhookHashstring: text("webhook_hashstring"), // For verification
  webhookReceivedAt: timestamp("webhook_received_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_tap_payments_charge").on(table.chargeId),
  index("idx_tap_payments_purchase").on(table.purchaseId),
  index("idx_tap_payments_status").on(table.status),
]);

// Relations for purchases
export const articlePurchasesRelations = relations(articlePurchases, ({ one }) => ({
  article: one(articles, {
    fields: [articlePurchases.articleId],
    references: [articles.id],
  }),
  user: one(users, {
    fields: [articlePurchases.userId],
    references: [users.id],
  }),
}));

// Relations for tap payments
export const tapPaymentsRelations = relations(tapPayments, ({ one }) => ({
  purchase: one(articlePurchases, {
    fields: [tapPayments.purchaseId],
    references: [articlePurchases.id],
  }),
}));

// Insert schemas
export const insertArticlePurchaseSchema = createInsertSchema(articlePurchases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTapPaymentSchema = createInsertSchema(tapPayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Select types
export type ArticlePurchase = typeof articlePurchases.$inferSelect;
export type InsertArticlePurchase = z.infer<typeof insertArticlePurchaseSchema>;
export type TapPayment = typeof tapPayments.$inferSelect;
export type InsertTapPayment = z.infer<typeof insertTapPaymentSchema>;

// Extended types
export type ArticlePurchaseWithDetails = ArticlePurchase & {
  article?: {
    id: string;
    title: string;
    slug: string;
    imageUrl?: string | null;
  };
  user?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
};

// ============================================
// ADVERTISER WALLET & TRANSACTIONS - محفظة المعلن
// ============================================

export const advertiserWallets = pgTable("advertiser_wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").references(() => advertiserProfiles.id, { onDelete: "cascade" }).notNull().unique(),
  balanceHalalas: integer("balance_halalas").default(0).notNull(),
  totalDepositedHalalas: integer("total_deposited_halalas").default(0).notNull(),
  totalSpentHalalas: integer("total_spent_halalas").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_advertiser_wallets_advertiser").on(table.advertiserId),
]);

export const advertiserPackages = pgTable("advertiser_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  description: text("description"),
  priceHalalas: integer("price_halalas").notNull(),
  impressions: integer("impressions").notNull(),
  bonusImpressions: integer("bonus_impressions").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_advertiser_packages_active").on(table.isActive),
]);

export const advertiserTransactions = pgTable("advertiser_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  advertiserId: varchar("advertiser_id").references(() => advertiserProfiles.id, { onDelete: "cascade" }).notNull(),
  walletId: varchar("wallet_id").references(() => advertiserWallets.id, { onDelete: "cascade" }).notNull(),
  packageId: varchar("package_id").references(() => advertiserPackages.id, { onDelete: "set null" }),
  adId: varchar("ad_id").references(() => nativeAds.id, { onDelete: "set null" }),
  type: text("type").notNull(), // deposit, spend, refund
  amountHalalas: integer("amount_halalas").notNull(),
  balanceBeforeHalalas: integer("balance_before_halalas").notNull(),
  balanceAfterHalalas: integer("balance_after_halalas").notNull(),
  description: text("description"),
  chargeId: text("charge_id"),
  status: text("status").default("completed").notNull(), // pending, completed, failed
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_advertiser_transactions_advertiser").on(table.advertiserId),
  index("idx_advertiser_transactions_wallet").on(table.walletId),
  index("idx_advertiser_transactions_type").on(table.type),
  index("idx_advertiser_transactions_created").on(table.createdAt.desc()),
]);

export const advertiserWalletsRelations = relations(advertiserWallets, ({ one, many }) => ({
  advertiser: one(advertiserProfiles, {
    fields: [advertiserWallets.advertiserId],
    references: [advertiserProfiles.id],
  }),
  transactions: many(advertiserTransactions),
}));

export const advertiserTransactionsRelations = relations(advertiserTransactions, ({ one }) => ({
  advertiser: one(advertiserProfiles, {
    fields: [advertiserTransactions.advertiserId],
    references: [advertiserProfiles.id],
  }),
  wallet: one(advertiserWallets, {
    fields: [advertiserTransactions.walletId],
    references: [advertiserWallets.id],
  }),
  package: one(advertiserPackages, {
    fields: [advertiserTransactions.packageId],
    references: [advertiserPackages.id],
  }),
  ad: one(nativeAds, {
    fields: [advertiserTransactions.adId],
    references: [nativeAds.id],
  }),
}));

export const insertAdvertiserWalletSchema = createInsertSchema(advertiserWallets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdvertiserPackageSchema = createInsertSchema(advertiserPackages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdvertiserTransactionSchema = createInsertSchema(advertiserTransactions).omit({
  id: true,
  createdAt: true,
});

export type AdvertiserWallet = typeof advertiserWallets.$inferSelect;
export type InsertAdvertiserWallet = z.infer<typeof insertAdvertiserWalletSchema>;
export type AdvertiserPackage = typeof advertiserPackages.$inferSelect;
export type InsertAdvertiserPackage = z.infer<typeof insertAdvertiserPackageSchema>;
export type AdvertiserTransaction = typeof advertiserTransactions.$inferSelect;
export type InsertAdvertiserTransaction = z.infer<typeof insertAdvertiserTransactionSchema>;

// =====================================================
// PAYMENT ANALYTICS SYSTEM - نظام تحليلات المدفوعات
// =====================================================

// Daily Payment Summary - ملخص المدفوعات اليومي
export const paymentDailySummary = pgTable("payment_daily_summary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: date("date").notNull(),
  
  // Article Payments - مدفوعات المقالات
  articlePaymentsCount: integer("article_payments_count").default(0).notNull(),
  articlePaymentsSuccessful: integer("article_payments_successful").default(0).notNull(),
  articlePaymentsFailed: integer("article_payments_failed").default(0).notNull(),
  articlePaymentsPending: integer("article_payments_pending").default(0).notNull(),
  articleRevenueHalalas: integer("article_revenue_halalas").default(0).notNull(),
  
  // Advertiser Payments - مدفوعات المعلنين
  advertiserPaymentsCount: integer("advertiser_payments_count").default(0).notNull(),
  advertiserPaymentsSuccessful: integer("advertiser_payments_successful").default(0).notNull(),
  advertiserPaymentsFailed: integer("advertiser_payments_failed").default(0).notNull(),
  advertiserPaymentsPending: integer("advertiser_payments_pending").default(0).notNull(),
  advertiserRevenueHalalas: integer("advertiser_revenue_halalas").default(0).notNull(),
  
  // Combined Totals - الإجماليات
  totalPaymentsCount: integer("total_payments_count").default(0).notNull(),
  totalRevenueHalalas: integer("total_revenue_halalas").default(0).notNull(),
  successRate: real("success_rate").default(0).notNull(), // نسبة النجاح (0-100)
  
  // Metadata
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_payment_summary_date").on(table.date),
]);

// Payment Alerts - تنبيهات المدفوعات
export const paymentAlerts = pgTable("payment_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type", { length: 50 }).notNull(), // failed_payment, high_failure_rate, refund_request
  severity: varchar("severity", { length: 20 }).notNull().default("medium"), // low, medium, high, critical
  
  paymentType: varchar("payment_type", { length: 50 }).notNull(), // article, advertiser
  referenceId: varchar("reference_id", { length: 100 }), // chargeId or transactionId
  
  title: text("title").notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  isRead: boolean("is_read").default(false).notNull(),
  isResolved: boolean("is_resolved").default(false).notNull(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_payment_alerts_type").on(table.type),
  index("idx_payment_alerts_severity").on(table.severity),
  index("idx_payment_alerts_read").on(table.isRead),
  index("idx_payment_alerts_created").on(table.createdAt.desc()),
]);

// Payment Export Logs - سجل التصديرات
export const paymentExportLogs = pgTable("payment_export_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  exportedBy: varchar("exported_by").references(() => users.id, { onDelete: "set null" }),
  
  exportType: varchar("export_type", { length: 50 }).notNull(), // daily, monthly, custom_range
  format: varchar("format", { length: 20 }).notNull(), // csv, xlsx, json
  
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  
  recordsCount: integer("records_count").default(0).notNull(),
  fileUrl: text("file_url"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_payment_exports_user").on(table.exportedBy),
  index("idx_payment_exports_created").on(table.createdAt.desc()),
]);

// Schemas and Types
export const insertPaymentDailySummarySchema = createInsertSchema(paymentDailySummary).omit({
  id: true,
  lastUpdatedAt: true,
});

export const insertPaymentAlertSchema = createInsertSchema(paymentAlerts).omit({
  id: true,
  createdAt: true,
});

export const insertPaymentExportLogSchema = createInsertSchema(paymentExportLogs).omit({
  id: true,
  createdAt: true,
});

export type PaymentDailySummary = typeof paymentDailySummary.$inferSelect;
export type InsertPaymentDailySummary = z.infer<typeof insertPaymentDailySummarySchema>;
export type PaymentAlert = typeof paymentAlerts.$inferSelect;
export type InsertPaymentAlert = z.infer<typeof insertPaymentAlertSchema>;
export type PaymentExportLog = typeof paymentExportLogs.$inferSelect;
export type InsertPaymentExportLog = z.infer<typeof insertPaymentExportLogSchema>;

// =====================================================
// MEDIA SERVICES STORE - متجر خدمات البيع الإعلامي
// =====================================================

// Media Service Types - أنواع الخدمات الإعلامية
export const mediaServiceTypeEnum = ["press_release", "x_post", "x_pinned_post", "x_repost", "instagram_post"] as const;
export type MediaServiceType = typeof mediaServiceTypeEnum[number];

// Media Service Order Status - حالات الطلب
export const mediaOrderStatusEnum = ["pending", "payment_pending", "paid", "processing", "completed", "cancelled", "refunded"] as const;
export type MediaOrderStatus = typeof mediaOrderStatusEnum[number];

// Media Services Catalog - كتالوج الخدمات الإعلامية
export const mediaServices = pgTable("media_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Service Details - تفاصيل الخدمة
  type: varchar("type", { length: 50 }).notNull().$type<MediaServiceType>(),
  nameAr: text("name_ar").notNull(), // اسم الخدمة بالعربية
  nameEn: text("name_en").notNull(), // اسم الخدمة بالإنجليزية
  descriptionAr: text("description_ar").notNull(), // وصف الخدمة بالعربية
  descriptionEn: text("description_en"), // وصف الخدمة بالإنجليزية
  
  // Pricing - التسعير
  priceHalalas: integer("price_halalas").notNull(), // السعر بالهللات (100 هللة = 1 ريال)
  currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
  
  // Features - الميزات
  features: jsonb("features").$type<string[]>().default([]),
  duration: varchar("duration", { length: 50 }), // مدة التنفيذ (مثل: 24 ساعة)
  platform: varchar("platform", { length: 50 }).notNull(), // المنصة (x, instagram, press)
  
  // Display - العرض
  icon: varchar("icon", { length: 50 }), // أيقونة lucide-react
  color: varchar("color", { length: 20 }), // لون البطاقة
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_media_services_type").on(table.type),
  index("idx_media_services_active").on(table.isActive),
  index("idx_media_services_order").on(table.sortOrder),
]);

// Media Service Orders - طلبات الخدمات الإعلامية
export const mediaServiceOrders = pgTable("media_service_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Order Reference - مرجع الطلب
  orderNumber: varchar("order_number", { length: 20 }).notNull().unique(),
  trackingToken: varchar("tracking_token", { length: 64 }).notNull().unique(), // رمز التتبع الآمن
  
  // Service - الخدمة
  serviceId: varchar("service_id", { length: 36 }).references(() => mediaServices.id, { onDelete: "restrict" }).notNull(),
  serviceType: varchar("service_type", { length: 50 }).notNull().$type<MediaServiceType>(),
  serviceName: text("service_name").notNull(), // نسخة من اسم الخدمة وقت الطلب
  
  // Customer Details - بيانات العميل
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone"),
  customerCompany: text("customer_company"),
  
  // Content Details - تفاصيل المحتوى
  contentTitle: text("content_title"), // عنوان المحتوى للنشر
  contentBody: text("content_body"), // نص المحتوى
  contentUrl: text("content_url"), // رابط المحتوى (إذا كان موجود)
  attachments: jsonb("attachments").$type<string[]>().default([]), // مرفقات (صور، ملفات)
  socialHandle: text("social_handle"), // حساب التواصل الاجتماعي للعميل
  additionalNotes: text("additional_notes"), // ملاحظات إضافية
  
  // Pricing - التسعير
  priceHalalas: integer("price_halalas").notNull(), // السعر الأساسي
  vatHalalas: integer("vat_halalas").notNull(), // قيمة الضريبة
  totalHalalas: integer("total_halalas").notNull(), // الإجمالي شامل الضريبة
  currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
  
  // Payment - الدفع
  status: varchar("status", { length: 30 }).default("pending").notNull().$type<MediaOrderStatus>(),
  paymentId: varchar("payment_id", { length: 100 }), // معرف الدفع من Tap
  paymentChargeId: varchar("payment_charge_id", { length: 100 }), // معرف الشحنة من Tap
  paymentMethod: varchar("payment_method", { length: 50 }), // طريقة الدفع
  paidAt: timestamp("paid_at"),
  
  // Execution - التنفيذ
  executionNotes: text("execution_notes"), // ملاحظات التنفيذ
  executionUrl: text("execution_url"), // رابط المنشور بعد النشر
  executedAt: timestamp("executed_at"),
  executedBy: varchar("executed_by").references(() => users.id, { onDelete: "set null" }),
  
  // Metadata
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_media_orders_number").on(table.orderNumber),
  index("idx_media_orders_token").on(table.trackingToken),
  index("idx_media_orders_service").on(table.serviceId),
  index("idx_media_orders_status").on(table.status),
  index("idx_media_orders_email").on(table.customerEmail),
  index("idx_media_orders_created").on(table.createdAt.desc()),
]);

// Media Order Events - أحداث الطلب (للتتبع)
export const mediaOrderEvents = pgTable("media_order_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  orderId: varchar("order_id", { length: 36 }).references(() => mediaServiceOrders.id, { onDelete: "cascade" }).notNull(),
  
  eventType: varchar("event_type", { length: 50 }).notNull(), // created, payment_initiated, paid, processing, completed, cancelled
  description: text("description").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_media_order_events_order").on(table.orderId),
  index("idx_media_order_events_type").on(table.eventType),
  index("idx_media_order_events_created").on(table.createdAt.desc()),
]);

// Relations
export const mediaServicesRelations = relations(mediaServices, ({ many }) => ({
  orders: many(mediaServiceOrders),
}));

export const mediaServiceOrdersRelations = relations(mediaServiceOrders, ({ one, many }) => ({
  service: one(mediaServices, {
    fields: [mediaServiceOrders.serviceId],
    references: [mediaServices.id],
  }),
  events: many(mediaOrderEvents),
  executor: one(users, {
    fields: [mediaServiceOrders.executedBy],
    references: [users.id],
  }),
}));

export const mediaOrderEventsRelations = relations(mediaOrderEvents, ({ one }) => ({
  order: one(mediaServiceOrders, {
    fields: [mediaOrderEvents.orderId],
    references: [mediaServiceOrders.id],
  }),
  creator: one(users, {
    fields: [mediaOrderEvents.createdBy],
    references: [users.id],
  }),
}));

// ==========================================
// Store Customer Accounts - حسابات عملاء المتجر
// ==========================================
export const storeCustomers = pgTable("store_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Link to existing user (optional - for logged in users)
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // Link to advertiser profile (optional - for advertisers)
  advertiserId: varchar("advertiser_id").references(() => adAccounts.id, { onDelete: "set null" }),
  
  // Customer Info - بيانات العميل
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // null for social login or guest converted
  name: text("name").notNull(),
  phone: text("phone"),
  companyName: text("company_name"),
  taxId: text("tax_id"), // الرقم الضريبي
  
  // Billing Address - عنوان الفوترة
  billingAddress: jsonb("billing_address").$type<{
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  }>(),
  
  // Account Status
  status: varchar("status", { length: 20 }).default("active").notNull(), // active, suspended, closed
  emailVerified: boolean("email_verified").default(false).notNull(),
  
  // Stats
  totalOrders: integer("total_orders").default(0).notNull(),
  totalSpent: integer("total_spent").default(0).notNull(), // بالهللات
  
  // Metadata
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_store_customers_email").on(table.email),
  index("idx_store_customers_user").on(table.userId),
  index("idx_store_customers_advertiser").on(table.advertiserId),
  index("idx_store_customers_status").on(table.status),
]);

// Store Shopping Cart Items - عناصر سلة التسوق
export const storeCartItems = pgTable("store_cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Customer
  customerId: varchar("customer_id").references(() => storeCustomers.id, { onDelete: "cascade" }).notNull(),
  
  // Item Details
  itemType: varchar("item_type", { length: 30 }).notNull(), // media_service, ad_campaign, ad_credit
  itemId: varchar("item_id").notNull(), // ID of the service/campaign
  itemName: text("item_name").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  priceHalalas: integer("price_halalas").notNull(), // سعر الوحدة
  
  // Additional data for the item
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_store_cart_customer").on(table.customerId),
  index("idx_store_cart_item").on(table.itemType, table.itemId),
]);

// Customer Auth Sessions - جلسات العميل
export const storeCustomerSessions = pgTable("store_customer_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => storeCustomers.id, { onDelete: "cascade" }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_store_sessions_customer").on(table.customerId),
  index("idx_store_sessions_token").on(table.token),
  index("idx_store_sessions_expires").on(table.expiresAt),
]);

// Relations for store customers
export const storeCustomersRelations = relations(storeCustomers, ({ one, many }) => ({
  user: one(users, {
    fields: [storeCustomers.userId],
    references: [users.id],
  }),
  advertiser: one(adAccounts, {
    fields: [storeCustomers.advertiserId],
    references: [adAccounts.id],
  }),
  cartItems: many(storeCartItems),
  sessions: many(storeCustomerSessions),
}));

export const storeCartItemsRelations = relations(storeCartItems, ({ one }) => ({
  customer: one(storeCustomers, {
    fields: [storeCartItems.customerId],
    references: [storeCustomers.id],
  }),
}));

export const storeCustomerSessionsRelations = relations(storeCustomerSessions, ({ one }) => ({
  customer: one(storeCustomers, {
    fields: [storeCustomerSessions.customerId],
    references: [storeCustomers.id],
  }),
}));

// Schemas and Types
export const insertMediaServiceSchema = createInsertSchema(mediaServices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMediaServiceOrderSchema = createInsertSchema(mediaServiceOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMediaOrderEventSchema = createInsertSchema(mediaOrderEvents).omit({
  id: true,
  createdAt: true,
});

export const insertStoreCustomerSchema = createInsertSchema(storeCustomers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  totalOrders: true,
  totalSpent: true,
});

export const insertStoreCartItemSchema = createInsertSchema(storeCartItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type MediaService = typeof mediaServices.$inferSelect;
export type InsertMediaService = z.infer<typeof insertMediaServiceSchema>;
export type MediaServiceOrder = typeof mediaServiceOrders.$inferSelect;
export type InsertMediaServiceOrder = z.infer<typeof insertMediaServiceOrderSchema>;
export type MediaOrderEvent = typeof mediaOrderEvents.$inferSelect;
export type InsertMediaOrderEvent = z.infer<typeof insertMediaOrderEventSchema>;
export type StoreCustomer = typeof storeCustomers.$inferSelect;
export type InsertStoreCustomer = z.infer<typeof insertStoreCustomerSchema>;
export type StoreCartItem = typeof storeCartItems.$inferSelect;
export type InsertStoreCartItem = z.infer<typeof insertStoreCartItemSchema>;
export type StoreCustomerSession = typeof storeCustomerSessions.$inferSelect;

// ============================================
// ARTICLE POLLS - استطلاعات الرأي للمقالات
// ============================================

export const articlePolls = pgTable("article_polls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "cascade" }).notNull(),
  question: text("question").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  allowMultipleVotes: boolean("allow_multiple_votes").default(false).notNull(),
  showResults: boolean("show_results").default(true).notNull(),
  expiresAt: timestamp("expires_at"),
  totalVotes: integer("total_votes").default(0).notNull(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_polls_article").on(table.articleId),
  index("idx_polls_active").on(table.isActive),
]);

export const pollOptions = pgTable("poll_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pollId: varchar("poll_id").references(() => articlePolls.id, { onDelete: "cascade" }).notNull(),
  text: text("text").notNull(),
  votesCount: integer("votes_count").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  color: varchar("color", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_poll_options_poll").on(table.pollId),
]);

export const pollVotes = pgTable("poll_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pollId: varchar("poll_id").references(() => articlePolls.id, { onDelete: "cascade" }).notNull(),
  optionId: varchar("option_id").references(() => pollOptions.id, { onDelete: "cascade" }).notNull(),
  
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  sessionId: varchar("session_id", { length: 100 }),
  ipAddress: varchar("ip_address", { length: 45 }),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_poll_votes_poll").on(table.pollId),
  index("idx_poll_votes_option").on(table.optionId),
  index("idx_poll_votes_user").on(table.userId),
  index("idx_poll_votes_session").on(table.sessionId),
]);

export const articlePollsRelations = relations(articlePolls, ({ one, many }) => ({
  article: one(articles, {
    fields: [articlePolls.articleId],
    references: [articles.id],
  }),
  createdByUser: one(users, {
    fields: [articlePolls.createdBy],
    references: [users.id],
  }),
  options: many(pollOptions),
  votes: many(pollVotes),
}));

export const pollOptionsRelations = relations(pollOptions, ({ one, many }) => ({
  poll: one(articlePolls, {
    fields: [pollOptions.pollId],
    references: [articlePolls.id],
  }),
  votes: many(pollVotes),
}));

export const pollVotesRelations = relations(pollVotes, ({ one }) => ({
  poll: one(articlePolls, {
    fields: [pollVotes.pollId],
    references: [articlePolls.id],
  }),
  option: one(pollOptions, {
    fields: [pollVotes.optionId],
    references: [pollOptions.id],
  }),
  user: one(users, {
    fields: [pollVotes.userId],
    references: [users.id],
  }),
}));

export const insertArticlePollSchema = createInsertSchema(articlePolls).omit({
  id: true,
  totalVotes: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPollOptionSchema = createInsertSchema(pollOptions).omit({
  id: true,
  votesCount: true,
  createdAt: true,
});

export const insertPollVoteSchema = createInsertSchema(pollVotes).omit({
  id: true,
  createdAt: true,
});

export type ArticlePoll = typeof articlePolls.$inferSelect;
export type InsertArticlePoll = z.infer<typeof insertArticlePollSchema>;
export type PollOption = typeof pollOptions.$inferSelect;
export type InsertPollOption = z.infer<typeof insertPollOptionSchema>;
export type PollVote = typeof pollVotes.$inferSelect;
export type InsertPollVote = z.infer<typeof insertPollVoteSchema>;

// ============================================
// CONTACT MESSAGES TABLE
// ============================================

export const contactMessages = pgTable("contact_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  message: text("message").notNull(),
  additionalMessages: jsonb("additional_messages").$type<string[]>().default([]),
  attachments: jsonb("attachments").$type<string[]>().default([]),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  repliedAt: timestamp("replied_at"),
  repliedBy: varchar("replied_by").references(() => users.id),
  replyText: text("reply_text"),
}, (table) => [
  index("idx_contact_messages_status").on(table.status),
  index("idx_contact_messages_created").on(table.createdAt),
]);

export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({
  id: true,
  status: true,
  createdAt: true,
  repliedAt: true,
  repliedBy: true,
  replyText: true,
});

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;

// Contact Message Replies - for threaded conversation
export const contactMessageReplies = pgTable("contact_message_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => contactMessages.id, { onDelete: 'cascade' }),
  replyText: text("reply_text").notNull(),
  repliedBy: varchar("replied_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isEdited: boolean("is_edited").default(false),
}, (table) => [
  index("idx_contact_replies_message").on(table.messageId),
  index("idx_contact_replies_created").on(table.createdAt),
]);

export const contactMessageRepliesRelations = relations(contactMessageReplies, ({ one }) => ({
  message: one(contactMessages, {
    fields: [contactMessageReplies.messageId],
    references: [contactMessages.id],
  }),
  repliedByUser: one(users, {
    fields: [contactMessageReplies.repliedBy],
    references: [users.id],
  }),
}));

export const contactMessagesRelations = relations(contactMessages, ({ one, many }) => ({
  repliedByUser: one(users, {
    fields: [contactMessages.repliedBy],
    references: [users.id],
  }),
  replies: many(contactMessageReplies),
}));

export const insertContactMessageReplySchema = createInsertSchema(contactMessageReplies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isEdited: true,
});

export type ContactMessageReply = typeof contactMessageReplies.$inferSelect;
export type InsertContactMessageReply = z.infer<typeof insertContactMessageReplySchema>;

// ============================================
// DASHBOARD ANNOUNCEMENTS SYSTEM
// ============================================

export const dashboardAnnouncements = pgTable("dashboard_announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: varchar("type", { length: 20 }).default("info").notNull(), // info, success, warning, feature
  icon: varchar("icon", { length: 50 }), // lucide icon name
  linkUrl: varchar("link_url", { length: 500 }),
  linkText: varchar("link_text", { length: 100 }),
  priority: integer("priority").default(0).notNull(), // higher = more important
  isActive: boolean("is_active").default(true).notNull(),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_dash_ann_active").on(table.isActive),
  index("idx_dash_ann_priority").on(table.priority),
  index("idx_dash_ann_dates").on(table.startsAt, table.expiresAt),
]);

export const announcementDismissals = pgTable("announcement_dismissals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").notNull().references(() => dashboardAnnouncements.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  dismissedAt: timestamp("dismissed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ann_dismiss_user").on(table.userId),
  index("idx_ann_dismiss_ann").on(table.announcementId),
  uniqueIndex("idx_ann_dismiss_unique").on(table.announcementId, table.userId),
]);

export const dashboardAnnouncementsRelations = relations(dashboardAnnouncements, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [dashboardAnnouncements.createdBy],
    references: [users.id],
  }),
  dismissals: many(announcementDismissals),
}));

export const announcementDismissalsRelations = relations(announcementDismissals, ({ one }) => ({
  announcement: one(dashboardAnnouncements, {
    fields: [announcementDismissals.announcementId],
    references: [dashboardAnnouncements.id],
  }),
  user: one(users, {
    fields: [announcementDismissals.userId],
    references: [users.id],
  }),
}));

export const insertDashboardAnnouncementSchema = createInsertSchema(dashboardAnnouncements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnnouncementDismissalSchema = createInsertSchema(announcementDismissals).omit({
  id: true,
  dismissedAt: true,
});

export type DashboardAnnouncement = typeof dashboardAnnouncements.$inferSelect;
export type InsertDashboardAnnouncement = z.infer<typeof insertDashboardAnnouncementSchema>;
export type AnnouncementDismissal = typeof announcementDismissals.$inferSelect;
export type InsertAnnouncementDismissal = z.infer<typeof insertAnnouncementDismissalSchema>;

// ============================================
// NEWSLETTER EMAIL TRACKING ANALYTICS
// ============================================

export const newsletterEmailCampaigns = pgTable("newsletter_email_campaigns", {
  id: varchar("id").primaryKey(),
  subject: text("subject").notNull(),
  templateType: varchar("template_type", { length: 50 }).notNull(), // morning_brief, evening_digest, weekly_roundup, breaking_news, personalized_digest
  recipientCount: integer("recipient_count").default(0).notNull(),
  openCount: integer("open_count").default(0).notNull(),
  clickCount: integer("click_count").default(0).notNull(),
  sentAt: timestamp("sent_at"),
  status: varchar("status", { length: 20 }).default("sending").notNull(), // sending, sent, failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_newsletter_campaigns_status").on(table.status),
  index("idx_newsletter_campaigns_template").on(table.templateType),
  index("idx_newsletter_campaigns_sent").on(table.sentAt),
  index("idx_newsletter_campaigns_created").on(table.createdAt),
]);

export const newsletterEmailEvents = pgTable("newsletter_email_events", {
  id: varchar("id").primaryKey(),
  campaignId: varchar("campaign_id").notNull().references(() => newsletterEmailCampaigns.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 20 }).notNull(), // sent, opened, clicked, bounced, unsubscribed
  linkUrl: text("link_url"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_newsletter_events_campaign").on(table.campaignId),
  index("idx_newsletter_events_email").on(table.email),
  index("idx_newsletter_events_type").on(table.eventType),
  index("idx_newsletter_events_created").on(table.createdAt),
]);

// Relations
export const newsletterEmailCampaignsRelations = relations(newsletterEmailCampaigns, ({ many }) => ({
  events: many(newsletterEmailEvents),
}));

export const newsletterEmailEventsRelations = relations(newsletterEmailEvents, ({ one }) => ({
  campaign: one(newsletterEmailCampaigns, {
    fields: [newsletterEmailEvents.campaignId],
    references: [newsletterEmailCampaigns.id],
  }),
}));

// Insert schemas
export const insertNewsletterEmailCampaignSchema = createInsertSchema(newsletterEmailCampaigns).omit({
  openCount: true,
  clickCount: true,
  createdAt: true,
});

export const insertNewsletterEmailEventSchema = createInsertSchema(newsletterEmailEvents).omit({
  createdAt: true,
});

// Types
export type NewsletterEmailCampaign = typeof newsletterEmailCampaigns.$inferSelect;
export type InsertNewsletterEmailCampaign = z.infer<typeof insertNewsletterEmailCampaignSchema>;
export type NewsletterEmailEvent = typeof newsletterEmailEvents.$inferSelect;
export type InsertNewsletterEmailEvent = z.infer<typeof insertNewsletterEmailEventSchema>;

// ============================================
// WORLD DAYS MANAGEMENT SYSTEM
// ============================================

export const worldDayCategories = [
  "international", // أيام دولية
  "national", // أيام وطنية
  "religious", // أيام دينية
  "health", // أيام صحية
  "environmental", // أيام بيئية
  "cultural", // أيام ثقافية
  "social", // أيام اجتماعية
  "educational", // أيام تعليمية
  "sports", // أيام رياضية
  "economic", // أيام اقتصادية
  "other", // أخرى
] as const;

export const worldDays = pgTable("world_days", {
  id: varchar("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  eventDate: date("event_date").notNull(),
  month: integer("month").notNull(), // 1-12 for recurring calculations
  day: integer("day").notNull(), // 1-31 for recurring calculations
  category: varchar("category", { length: 50 }).default("international").notNull(),
  isRecurring: boolean("is_recurring").default(true).notNull(),
  linkedCategoryId: varchar("linked_category_id").references(() => categories.id, { onDelete: "set null" }),
  sourceUid: varchar("source_uid", { length: 255 }), // UID from ICS file for deduplication
  color: varchar("color", { length: 20 }).default("#1BADF8"),
  reminderDays: integer("reminder_days").default(7).notNull(), // Days before to send reminder
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  index("idx_world_days_date").on(table.eventDate),
  index("idx_world_days_month_day").on(table.month, table.day),
  index("idx_world_days_category").on(table.category),
  index("idx_world_days_active").on(table.isActive),
  uniqueIndex("idx_world_days_source_uid").on(table.sourceUid),
]);

export const worldDayReminders = pgTable("world_day_reminders", {
  id: varchar("id").primaryKey(),
  worldDayId: varchar("world_day_id").notNull().references(() => worldDays.id, { onDelete: "cascade" }),
  reminderType: varchar("reminder_type", { length: 20 }).notNull(), // week_before, day_before, same_day
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, sent, failed
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_world_day_reminders_day").on(table.worldDayId),
  index("idx_world_day_reminders_status").on(table.status),
  index("idx_world_day_reminders_scheduled").on(table.scheduledFor),
]);

export const worldDaySuggestions = pgTable("world_day_suggestions", {
  id: varchar("id").primaryKey(),
  worldDayId: varchar("world_day_id").notNull().references(() => worldDays.id, { onDelete: "cascade" }),
  suggestionType: varchar("suggestion_type", { length: 30 }).notNull(), // news, report, infographic, event, social_post
  title: text("title").notNull(),
  summary: text("summary"),
  aiProvider: varchar("ai_provider", { length: 30 }), // openai, gemini, anthropic
  confidenceScore: real("confidence_score"),
  linkedArticleId: varchar("linked_article_id").references(() => articles.id, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, accepted, rejected, published
  createdAt: timestamp("created_at").defaultNow().notNull(),
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at"),
}, (table) => [
  index("idx_world_day_suggestions_day").on(table.worldDayId),
  index("idx_world_day_suggestions_type").on(table.suggestionType),
  index("idx_world_day_suggestions_status").on(table.status),
]);

// Relations
export const worldDaysRelations = relations(worldDays, ({ one, many }) => ({
  linkedCategory: one(categories, {
    fields: [worldDays.linkedCategoryId],
    references: [categories.id],
  }),
  createdByUser: one(users, {
    fields: [worldDays.createdBy],
    references: [users.id],
  }),
  reminders: many(worldDayReminders),
  suggestions: many(worldDaySuggestions),
}));

export const worldDayRemindersRelations = relations(worldDayReminders, ({ one }) => ({
  worldDay: one(worldDays, {
    fields: [worldDayReminders.worldDayId],
    references: [worldDays.id],
  }),
}));

export const worldDaySuggestionsRelations = relations(worldDaySuggestions, ({ one }) => ({
  worldDay: one(worldDays, {
    fields: [worldDaySuggestions.worldDayId],
    references: [worldDays.id],
  }),
  linkedArticle: one(articles, {
    fields: [worldDaySuggestions.linkedArticleId],
    references: [articles.id],
  }),
  acceptedByUser: one(users, {
    fields: [worldDaySuggestions.acceptedBy],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertWorldDaySchema = createInsertSchema(worldDays).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorldDayReminderSchema = createInsertSchema(worldDayReminders).omit({
  id: true,
  createdAt: true,
});

export const insertWorldDaySuggestionSchema = createInsertSchema(worldDaySuggestions).omit({
  id: true,
  createdAt: true,
});

// Types
export type WorldDay = typeof worldDays.$inferSelect;
export type InsertWorldDay = z.infer<typeof insertWorldDaySchema>;
export type WorldDayReminder = typeof worldDayReminders.$inferSelect;
export type InsertWorldDayReminder = z.infer<typeof insertWorldDayReminderSchema>;
export type WorldDaySuggestion = typeof worldDaySuggestions.$inferSelect;
export type InsertWorldDaySuggestion = z.infer<typeof insertWorldDaySuggestionSchema>;
export type WorldDayCategory = typeof worldDayCategories[number];

// ============================================
// BREAKING NEWS TICKER SYSTEM
// ============================================

// Breaking Ticker Topics - Groups headlines under one topic
export const breakingTickerTopics = pgTable("breaking_ticker_topics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicTitle: text("topic_title").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_breaking_ticker_topics_active").on(table.isActive),
  index("idx_breaking_ticker_topics_expires").on(table.expiresAt),
]);

// Breaking Ticker Headlines - Individual headlines for a topic
export const breakingTickerHeadlines = pgTable("breaking_ticker_headlines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  topicId: varchar("topic_id").notNull().references(() => breakingTickerTopics.id, { onDelete: "cascade" }),
  orderIndex: integer("order_index").default(0).notNull(),
  headline: text("headline").notNull(),
  linkedArticleId: varchar("linked_article_id").references(() => articles.id, { onDelete: "set null" }),
  linkedArticleTitle: text("linked_article_title"),
  linkedArticleSlug: text("linked_article_slug"),
  externalUrl: text("external_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_breaking_ticker_headlines_topic").on(table.topicId),
  index("idx_breaking_ticker_headlines_order").on(table.orderIndex),
]);

// Relations
export const breakingTickerTopicsRelations = relations(breakingTickerTopics, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [breakingTickerTopics.createdBy],
    references: [users.id],
  }),
  headlines: many(breakingTickerHeadlines),
}));

export const breakingTickerHeadlinesRelations = relations(breakingTickerHeadlines, ({ one }) => ({
  topic: one(breakingTickerTopics, {
    fields: [breakingTickerHeadlines.topicId],
    references: [breakingTickerTopics.id],
  }),
  linkedArticle: one(articles, {
    fields: [breakingTickerHeadlines.linkedArticleId],
    references: [articles.id],
  }),
}));

// Insert Schemas
export const insertBreakingTickerTopicSchema = createInsertSchema(breakingTickerTopics).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBreakingTickerHeadlineSchema = createInsertSchema(breakingTickerHeadlines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type BreakingTickerTopic = typeof breakingTickerTopics.$inferSelect;
export type InsertBreakingTickerTopic = z.infer<typeof insertBreakingTickerTopicSchema>;
export type BreakingTickerHeadline = typeof breakingTickerHeadlines.$inferSelect;
export type InsertBreakingTickerHeadline = z.infer<typeof insertBreakingTickerHeadlineSchema>;

// ============================================
// STAFF COMMUNICATION SYSTEM - نظام التواصل المؤسسي
// ============================================

// Staff Communication Groups - مجموعات التواصل
export const staffCommunicationGroups = pgTable("staff_communication_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameAr: text("name_ar").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  icon: text("icon"),
  color: text("color").default("#3b82f6"),
  isRoleBased: boolean("is_role_based").default(false),
  roleFilter: text("role_filter"),
  isActive: boolean("is_active").default(true).notNull(),
  memberCount: integer("member_count").default(0),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_staff_comm_groups_slug").on(table.slug),
  index("idx_staff_comm_groups_active").on(table.isActive),
]);

// Staff Communication Group Members - أعضاء المجموعات
export const staffCommunicationGroupMembers = pgTable("staff_communication_group_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull().references(() => staffCommunicationGroups.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addedBy: varchar("added_by").references(() => users.id, { onDelete: "set null" }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
}, (table) => [
  index("idx_staff_comm_members_group").on(table.groupId),
  index("idx_staff_comm_members_user").on(table.userId),
  uniqueIndex("idx_staff_comm_members_unique").on(table.groupId, table.userId),
]);

// Staff Communication Campaigns - حملات الرسائل
export const staffCommunicationCampaigns = pgTable("staff_communication_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  contentHtml: text("content_html").notNull(),
  contentText: text("content_text"),
  templateType: text("template_type").default("standard"),
  audienceType: text("audience_type").notNull().default("groups"),
  targetGroups: jsonb("target_groups").$type<string[]>().default([]),
  targetRoles: jsonb("target_roles").$type<string[]>().default([]),
  targetUserIds: jsonb("target_user_ids").$type<string[]>().default([]),
  channels: jsonb("channels").$type<string[]>().default(["email"]),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  status: text("status").notNull().default("draft"),
  recipientCount: integer("recipient_count").default(0),
  sentCount: integer("sent_count").default(0),
  failedCount: integer("failed_count").default(0),
  openCount: integer("open_count").default(0),
  clickCount: integer("click_count").default(0),
  priority: text("priority").default("normal"),
  metadata: jsonb("metadata"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_staff_comm_campaigns_status").on(table.status),
  index("idx_staff_comm_campaigns_scheduled").on(table.scheduledAt),
  index("idx_staff_comm_campaigns_created").on(table.createdAt),
]);

// Staff Communication Deliveries - سجل التوصيل
export const staffCommunicationDeliveries = pgTable("staff_communication_deliveries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull().references(() => staffCommunicationCampaigns.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  channel: text("channel").notNull().default("email"),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("idx_staff_comm_deliveries_campaign").on(table.campaignId),
  index("idx_staff_comm_deliveries_user").on(table.userId),
  index("idx_staff_comm_deliveries_status").on(table.status),
]);

// Relations
export const staffCommunicationGroupsRelations = relations(staffCommunicationGroups, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [staffCommunicationGroups.createdBy],
    references: [users.id],
  }),
  members: many(staffCommunicationGroupMembers),
}));

export const staffCommunicationGroupMembersRelations = relations(staffCommunicationGroupMembers, ({ one }) => ({
  group: one(staffCommunicationGroups, {
    fields: [staffCommunicationGroupMembers.groupId],
    references: [staffCommunicationGroups.id],
  }),
  user: one(users, {
    fields: [staffCommunicationGroupMembers.userId],
    references: [users.id],
  }),
  addedByUser: one(users, {
    fields: [staffCommunicationGroupMembers.addedBy],
    references: [users.id],
  }),
}));

export const staffCommunicationCampaignsRelations = relations(staffCommunicationCampaigns, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [staffCommunicationCampaigns.createdBy],
    references: [users.id],
  }),
  deliveries: many(staffCommunicationDeliveries),
}));

export const staffCommunicationDeliveriesRelations = relations(staffCommunicationDeliveries, ({ one }) => ({
  campaign: one(staffCommunicationCampaigns, {
    fields: [staffCommunicationDeliveries.campaignId],
    references: [staffCommunicationCampaigns.id],
  }),
  user: one(users, {
    fields: [staffCommunicationDeliveries.userId],
    references: [users.id],
  }),
}));

// Insert Schemas
export const insertStaffCommunicationGroupSchema = createInsertSchema(staffCommunicationGroups).omit({
  id: true,
  memberCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStaffCommunicationGroupMemberSchema = createInsertSchema(staffCommunicationGroupMembers).omit({
  id: true,
  addedAt: true,
});

export const insertStaffCommunicationCampaignSchema = createInsertSchema(staffCommunicationCampaigns).omit({
  id: true,
  sentAt: true,
  recipientCount: true,
  sentCount: true,
  failedCount: true,
  openCount: true,
  clickCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStaffCommunicationDeliverySchema = createInsertSchema(staffCommunicationDeliveries).omit({
  id: true,
  sentAt: true,
  openedAt: true,
  clickedAt: true,
});

// Types
export type StaffCommunicationGroup = typeof staffCommunicationGroups.$inferSelect;
export type InsertStaffCommunicationGroup = z.infer<typeof insertStaffCommunicationGroupSchema>;
export type StaffCommunicationGroupMember = typeof staffCommunicationGroupMembers.$inferSelect;
export type InsertStaffCommunicationGroupMember = z.infer<typeof insertStaffCommunicationGroupMemberSchema>;
export type StaffCommunicationCampaign = typeof staffCommunicationCampaigns.$inferSelect;
export type InsertStaffCommunicationCampaign = z.infer<typeof insertStaffCommunicationCampaignSchema>;
export type StaffCommunicationDelivery = typeof staffCommunicationDeliveries.$inferSelect;
export type InsertStaffCommunicationDelivery = z.infer<typeof insertStaffCommunicationDeliverySchema>;

// ============================================================================
// Article Edit Locks - نظام قفل تعديل المقالات
// ============================================================================

export const articleEditLocks = pgTable("article_edit_locks", {
  articleId: varchar("article_id").primaryKey().notNull().references(() => articles.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("user_name").notNull(),
  acquiredAt: timestamp("acquired_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  lastHeartbeat: timestamp("last_heartbeat").notNull().defaultNow(),
}, (table) => [
  index("idx_article_edit_locks_user").on(table.userId),
  index("idx_article_edit_locks_expires").on(table.expiresAt),
]);

export const articleEditLocksRelations = relations(articleEditLocks, ({ one }) => ({
  article: one(articles, {
    fields: [articleEditLocks.articleId],
    references: [articles.id],
  }),
  user: one(users, {
    fields: [articleEditLocks.userId],
    references: [users.id],
  }),
}));

export const insertArticleEditLockSchema = createInsertSchema(articleEditLocks).omit({
  acquiredAt: true,
  lastHeartbeat: true,
});

export type ArticleEditLock = typeof articleEditLocks.$inferSelect;
export type InsertArticleEditLock = z.infer<typeof insertArticleEditLockSchema>;

// ============================================================================
// Legacy URL Redirects - تحويلات الروابط القديمة
// ============================================================================

export const legacyRedirects = pgTable("legacy_redirects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  oldPath: text("old_path").notNull().unique(), // e.g., "/saudia/d2922c1lfe"
  newPath: text("new_path").notNull(), // e.g., "/article/U4frwXP"
  redirectType: integer("redirect_type").default(301).notNull(), // 301 permanent, 302 temporary
  hitCount: integer("hit_count").default(0).notNull(),
  lastHitAt: timestamp("last_hit_at"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("idx_legacy_redirects_old_path").on(table.oldPath),
  index("idx_legacy_redirects_active").on(table.isActive),
]);

export const insertLegacyRedirectSchema = createInsertSchema(legacyRedirects).omit({
  id: true,
  hitCount: true,
  lastHitAt: true,
  createdAt: true,
});

export type LegacyRedirect = typeof legacyRedirects.$inferSelect;
export type InsertLegacyRedirect = z.infer<typeof insertLegacyRedirectSchema>;

// ============================================================================
// iOS Push Notification System - نظام إشعارات iOS
// ============================================================================

export const pushDevices = pgTable("push_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
  deviceToken: text("device_token").notNull().unique(),
  tokenProvider: varchar("token_provider", { length: 10 }).default("fcm").notNull(), // fcm, expo
  platform: varchar("platform", { length: 20 }).default("ios").notNull(), // ios, android
  deviceName: text("device_name"),
  osVersion: text("os_version"),
  appVersion: text("app_version"),
  locale: varchar("locale", { length: 10 }).default("ar"),
  timezone: text("timezone"),
  isActive: boolean("is_active").default(true).notNull(),
  lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_push_devices_user").on(table.userId),
  index("idx_push_devices_token").on(table.deviceToken),
  index("idx_push_devices_active").on(table.isActive),
  index("idx_push_devices_platform").on(table.platform),
  index("idx_push_devices_provider").on(table.tokenProvider),
]);

/**
 * Per-user log of every targeted push notification we've sent for editorial
 * events (article scheduled / published / rejected / needs revision). Powers
 * the "Notifications" tab inside the iOS app — even when push delivery
 * fails or the device is offline, the user can pull up the history here.
 */
export const editorialNotifications = pgTable("editorial_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  // One of: 'scheduled', 'published', 'rejected', 'needs_revision'
  type: varchar("type", { length: 30 }).notNull(),
  title: text("title").notNull(),         // Arabic notification title
  body: text("body").notNull(),           // Arabic notification body
  // Article reference + deep-link metadata (consumed by the iOS notification
  // center to navigate to the right surface on tap).
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  articleTitle: text("article_title"),
  articleSlug: text("article_slug"),
  deepLink: text("deep_link"),            // sabq://article/<slug> | sabq://draft/<id> | sabq://feedback/<id>
  // Editor-supplied note (rejection reason / revision request). NULL for
  // scheduled/published events.
  reviewerNote: text("reviewer_note"),
  // Apple/FCM delivery outcome. Always logged regardless of delivery success
  // so the in-app history stays consistent.
  deliveryStatus: varchar("delivery_status", { length: 20 }).default("pending").notNull(), // pending, sent, failed, no_device
  deliveryError: text("delivery_error"),
  // User-side read state — set when the iOS app calls the mark-read endpoint
  // (also auto-flipped when the user taps the notification).
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_editorial_notifs_user").on(table.userId, table.createdAt),
  index("idx_editorial_notifs_unread").on(table.userId, table.readAt),
  index("idx_editorial_notifs_article").on(table.articleId),
]);

/**
 * Per-user notification preferences for the four editorial event types.
 * Defaults to all-enabled so first-time users get notified by default; they
 * can opt out individually from the iOS settings screen.
 */
export const editorialNotificationPrefs = pgTable("editorial_notification_prefs", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  scheduledEnabled: boolean("scheduled_enabled").default(true).notNull(),
  publishedEnabled: boolean("published_enabled").default(true).notNull(),
  rejectedEnabled: boolean("rejected_enabled").default(true).notNull(),
  revisionEnabled: boolean("revision_enabled").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type EditorialNotification = typeof editorialNotifications.$inferSelect;
export type EditorialNotificationPrefs = typeof editorialNotificationPrefs.$inferSelect;

export const pushSegments = pgTable("push_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  description: text("description"),
  criteria: jsonb("criteria").$type<{
    locations?: string[];
    ageMin?: number;
    ageMax?: number;
    interests?: string[];
    behaviors?: string[];
    registeredAfter?: string;
    registeredBefore?: string;
    lastActiveAfter?: string;
    lastActiveBefore?: string;
  }>().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  userCount: integer("user_count").default(0),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_push_segments_active").on(table.isActive),
]);

export const pushCampaigns = pgTable("push_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: varchar("type", { length: 50 }).notNull(), // breaking_news, promotion, personalized, event, custom
  title: text("title").notNull(),
  titleAr: text("title_ar"),
  body: text("body").notNull(),
  bodyAr: text("body_ar"),
  imageUrl: text("image_url"),
  deeplink: text("deeplink"),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  segmentId: varchar("segment_id").references(() => pushSegments.id, { onDelete: "set null" }),
  targetAll: boolean("target_all").default(false).notNull(),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  status: varchar("status", { length: 20 }).default("draft").notNull(), // draft, scheduled, sending, sent, cancelled
  priority: varchar("priority", { length: 10 }).default("normal"), // low, normal, high, critical
  badge: integer("badge"),
  sound: text("sound").default("default"),
  // Rich notification options
  richMediaUrl: text("rich_media_url"),
  actionButtons: jsonb("action_buttons").$type<Array<{
    id: string;
    title: string;
    action: string;
  }>>(),
  // Statistics
  totalDevices: integer("total_devices").default(0),
  sentCount: integer("sent_count").default(0),
  deliveredCount: integer("delivered_count").default(0),
  openedCount: integer("opened_count").default(0),
  clickedCount: integer("clicked_count").default(0),
  failedCount: integer("failed_count").default(0),
  // Metadata
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_push_campaigns_status").on(table.status),
  index("idx_push_campaigns_scheduled").on(table.scheduledAt),
  index("idx_push_campaigns_type").on(table.type),
  index("idx_push_campaigns_created").on(table.createdAt),
]);

export const pushCampaignEvents = pgTable("push_campaign_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").references(() => pushCampaigns.id, { onDelete: "cascade" }).notNull(),
  deviceId: varchar("device_id").references(() => pushDevices.id, { onDelete: "set null" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 30 }).notNull(), // sent, delivered, opened, clicked, dismissed, failed
  apnsId: text("apns_id"), // Apple Push Notification ID
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<{
    action?: string;
    buttonId?: string;
    timeToOpen?: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_push_events_campaign").on(table.campaignId),
  index("idx_push_events_device").on(table.deviceId),
  index("idx_push_events_user").on(table.userId),
  index("idx_push_events_type").on(table.eventType),
  index("idx_push_events_created").on(table.createdAt),
]);

// Insert schemas
export const insertPushDeviceSchema = createInsertSchema(pushDevices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastActiveAt: true,
});

export const insertPushSegmentSchema = createInsertSchema(pushSegments).omit({
  id: true,
  userCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPushCampaignSchema = createInsertSchema(pushCampaigns).omit({
  id: true,
  sentAt: true,
  totalDevices: true,
  sentCount: true,
  deliveredCount: true,
  openedCount: true,
  clickedCount: true,
  failedCount: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPushCampaignEventSchema = createInsertSchema(pushCampaignEvents).omit({
  id: true,
  createdAt: true,
});

// Types
export type PushDevice = typeof pushDevices.$inferSelect;
export type InsertPushDevice = z.infer<typeof insertPushDeviceSchema>;

export type PushSegment = typeof pushSegments.$inferSelect;
export type InsertPushSegment = z.infer<typeof insertPushSegmentSchema>;

export type PushCampaign = typeof pushCampaigns.$inferSelect;
export type InsertPushCampaign = z.infer<typeof insertPushCampaignSchema>;

export type PushCampaignEvent = typeof pushCampaignEvents.$inferSelect;
export type InsertPushCampaignEvent = z.infer<typeof insertPushCampaignEventSchema>;

// ============================================================================
// PUSH NOTIFICATION LOGS - تتبع وسجلات الإشعارات التفصيلية
// ============================================================================

export const pushNotificationLogs = pgTable("push_notification_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // معرفات الربط
  campaignId: varchar("campaign_id").references(() => pushCampaigns.id, { onDelete: "set null" }),
  articleId: varchar("article_id").references(() => articles.id, { onDelete: "set null" }),
  deviceId: varchar("device_id").references(() => pushDevices.id, { onDelete: "set null" }),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  
  // نوع العملية
  operationType: varchar("operation_type", { length: 30 }).notNull(), // send_to_device, send_to_topic, send_batch, quick_send
  targetType: varchar("target_type", { length: 20 }).notNull(), // device, topic, segment, all
  targetValue: text("target_value"), // device token hash, topic name, segment id
  
  // تفاصيل الرسالة
  messageTitle: text("message_title"),
  messageBody: text("message_body"),
  messageData: jsonb("message_data").$type<Record<string, string>>(),
  
  // النتيجة
  status: varchar("status", { length: 20 }).notNull(), // pending, sent, delivered, failed, retrying
  fcmMessageId: text("fcm_message_id"),
  httpStatusCode: integer("http_status_code"),
  
  // تصنيف الخطأ
  errorCategory: varchar("error_category", { length: 30 }), // invalid_token, auth_failure, rate_limited, quota_exceeded, network_error, server_error, config_error
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  errorDetails: jsonb("error_details").$type<{
    fcmError?: any;
    rawResponse?: string;
    stackTrace?: string;
  }>(),
  
  // إعادة المحاولة
  attempt: integer("attempt").default(1),
  maxAttempts: integer("max_attempts").default(3),
  nextRetryAt: timestamp("next_retry_at"),
  
  // الأداء
  durationMs: integer("duration_ms"), // وقت الإرسال بالميلي ثانية
  
  // البيئة
  environment: varchar("environment", { length: 20 }).default("production"), // production, development
  serverVersion: text("server_version"),
  
  // الوقت
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_push_logs_campaign").on(table.campaignId),
  index("idx_push_logs_article").on(table.articleId),
  index("idx_push_logs_device").on(table.deviceId),
  index("idx_push_logs_status").on(table.status),
  index("idx_push_logs_error_category").on(table.errorCategory),
  index("idx_push_logs_created").on(table.createdAt),
  index("idx_push_logs_operation").on(table.operationType),
]);

export const insertPushNotificationLogSchema = createInsertSchema(pushNotificationLogs).omit({
  id: true,
  createdAt: true,
});

export type PushNotificationLog = typeof pushNotificationLogs.$inferSelect;
export type InsertPushNotificationLog = z.infer<typeof insertPushNotificationLogSchema>;

// ============================================================================
// MOBILE APP SESSIONS (جلسات تطبيق الجوال)
// ============================================================================

// Mobile App Sessions - جلسات التطبيق (للتحكم في تسجيل الخروج من جميع الأجهزة)
// يستخدم جدول users الموحد للعضوية
export const appMemberSessions = pgTable("app_member_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  memberId: varchar("member_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull(),
  deviceInfo: jsonb("device_info").$type<{
    platform?: string;
    osVersion?: string;
    appVersion?: string;
    deviceName?: string;
    deviceId?: string;
  }>(),
  ipAddress: text("ip_address"),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamp("expires_at").notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_app_sessions_member").on(table.memberId),
  index("idx_app_sessions_active").on(table.isActive),
  index("idx_app_sessions_expires").on(table.expiresAt),
]);

// Type for mobile app sessions
export type AppMemberSession = typeof appMemberSessions.$inferSelect;

// ============================================================================
// EMAIL AGENT PROCESSED (تكرار البريد الذكي)
// ============================================================================

// Tracks processed emails to prevent duplicates across Autoscale pods
export const emailAgentProcessed = pgTable("email_agent_processed", {
  id: varchar("id", { length: 255 }).primaryKey(),
  messageId: varchar("message_id", { length: 500 }),
  subject: text("subject"),
  sender: varchar("sender", { length: 255 }),
  processedAt: timestamp("processed_at").defaultNow(),
  articleId: varchar("article_id", { length: 255 }),
}, (table) => [
  index("idx_email_agent_processed_at").on(table.processedAt),
  index("idx_email_agent_message_id").on(table.messageId),
]);

export type EmailAgentProcessed = typeof emailAgentProcessed.$inferSelect;

// ============================================
// GULF LIVE COVERAGE (البث الحي)
// ============================================

export const gulfCountries = [
  "saudi_arabia", "uae", "bahrain", "kuwait", "qatar", "oman", "yemen"
] as const;

export const gulfEventTypes = [
  "drone_intercepted", "ballistic_intercepted", "cruise_intercepted",
  "debris_fallen", "no_damage", "injuries", "martyrdom",
  "official_statement", "official_comment", "military_action", "international_condemnation"
] as const;

export const gulfEventPriority = ["urgent", "important", "normal"] as const;
export const gulfEventSource = [
  "official_statement", "official_news_agency", "sabq_correspondent",
  "international_agencies", "informed_sources", "other"
] as const;

export const gulfEvents = pgTable("gulf_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  country: text("country").notNull(),
  eventType: text("event_type").notNull(),
  priority: text("priority").default("normal").notNull(),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name"),
  content: text("content").notNull(),
  status: text("status").default("published").notNull(),
  isPinned: boolean("is_pinned").default(false),
  parentEventId: varchar("parent_event_id"),
  isUpdate: boolean("is_update").default(false),
  editedAt: timestamp("edited_at"),
  authorId: varchar("author_id").notNull(),
  publishedAt: timestamp("published_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_gulf_events_status").on(table.status),
  index("idx_gulf_events_country").on(table.country),
  index("idx_gulf_events_published").on(table.publishedAt),
  index("idx_gulf_events_priority").on(table.priority),
  index("idx_gulf_events_parent").on(table.parentEventId),
]);

export const gulfEventLogs = pgTable("gulf_event_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").notNull(),
  action: text("action").notNull(),
  editorId: varchar("editor_id").notNull(),
  editorName: text("editor_name"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_gulf_logs_event").on(table.eventId),
]);

export const insertGulfEventSchema = createInsertSchema(gulfEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  editedAt: true,
});

export const updateGulfEventSchema = createInsertSchema(gulfEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
}).partial();

export type GulfEvent = typeof gulfEvents.$inferSelect;
export type InsertGulfEvent = z.infer<typeof insertGulfEventSchema>;
export type GulfEventLog = typeof gulfEventLogs.$inferSelect;


// ============================================
// IMAGE MIGRATION TRACKING
// ============================================
export const imageMigrations = pgTable("image_migrations", {
  id: serial("id").primaryKey(),
  oldUrl: text("old_url").notNull(),
  newUrl: text("new_url"),
  cloudflareId: text("cloudflare_id"),
  status: text("status").notNull().default("pending"),
  articlesUpdated: integer("articles_updated").default(0),
  fileSize: integer("file_size"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  uniqueIndex("image_migrations_old_url_idx").on(table.oldUrl),
  index("image_migrations_status_idx").on(table.status),
]);

// ============================================
// OPINION WRITER ↔ EDITORIAL TICKETS
// ============================================
// Internal ticket/messaging system between opinion-column writers
// (role: opinion_author) and editorial admins. Each ticket is a thread of
// messages; messages can optionally reply to another message in the same
// ticket (parentMessageId) for nested replies. lastReadByWriterAt /
// lastReadByAdminAt drive the "new reply" badge.

export const opinionTicketStatuses = ["open", "answered", "closed"] as const;
export type OpinionTicketStatus = (typeof opinionTicketStatuses)[number];

export const opinionTickets = pgTable("opinion_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  writerId: varchar("writer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).default("open").notNull(),
  lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
  lastReadByWriterAt: timestamp("last_read_by_writer_at"),
  lastReadByAdminAt: timestamp("last_read_by_admin_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_opinion_tickets_writer").on(table.writerId),
  index("idx_opinion_tickets_status").on(table.status),
  index("idx_opinion_tickets_last_message").on(table.lastMessageAt),
]);

export const opinionTicketMessages = pgTable("opinion_ticket_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => opinionTickets.id, { onDelete: "cascade" }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  senderRole: varchar("sender_role", { length: 10 }).notNull(), // "writer" | "admin"
  message: text("message").notNull(),
  parentMessageId: varchar("parent_message_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_opinion_ticket_msgs_ticket").on(table.ticketId),
  index("idx_opinion_ticket_msgs_created").on(table.createdAt),
  index("idx_opinion_ticket_msgs_parent").on(table.parentMessageId),
]);

export const opinionTicketsRelations = relations(opinionTickets, ({ one, many }) => ({
  writer: one(users, {
    fields: [opinionTickets.writerId],
    references: [users.id],
  }),
  messages: many(opinionTicketMessages),
}));

export const opinionTicketMessagesRelations = relations(opinionTicketMessages, ({ one }) => ({
  ticket: one(opinionTickets, {
    fields: [opinionTicketMessages.ticketId],
    references: [opinionTickets.id],
  }),
  sender: one(users, {
    fields: [opinionTicketMessages.senderId],
    references: [users.id],
  }),
}));

export const insertOpinionTicketSchema = z.object({
  title: z.string().trim().min(3, "العنوان قصير جداً").max(255, "العنوان طويل جداً"),
  message: z.string().trim().min(1, "نص الاستفسار مطلوب").max(10000, "النص طويل جداً"),
});

export const insertOpinionTicketMessageSchema = z.object({
  message: z.string().trim().min(1, "الرسالة مطلوبة").max(10000, "النص طويل جداً"),
  parentMessageId: z.string().uuid().optional().nullable(),
});

export const updateOpinionTicketStatusSchema = z.object({
  status: z.enum(opinionTicketStatuses),
});

export type OpinionTicket = typeof opinionTickets.$inferSelect;
export type InsertOpinionTicket = z.infer<typeof insertOpinionTicketSchema>;
export type OpinionTicketMessage = typeof opinionTicketMessages.$inferSelect;
export type InsertOpinionTicketMessage = z.infer<typeof insertOpinionTicketMessageSchema>;

export type ImageMigration = typeof imageMigrations.$inferSelect;

// ── Article Daily Stats (time-series for contributor dashboards) ──
export const articleDailyStats = pgTable("article_daily_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  articleId: varchar("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  views: integer("views").default(0).notNull(),
  likes: integer("likes").default(0).notNull(),
  comments: integer("comments").default(0).notNull(),
  bookmarks: integer("bookmarks").default(0).notNull(),
}, (table) => [
  uniqueIndex("idx_article_daily_stats_unique").on(table.articleId, table.date),
  index("idx_article_daily_stats_date").on(table.date),
  index("idx_article_daily_stats_article").on(table.articleId),
]);

export type ArticleDailyStat = typeof articleDailyStats.$inferSelect;

// ── World Cup player-name transliterations (AI, cached once) ──
// مفتاح المصدر = الاسم كما يرسله مزود البيانات (لاتيني). يُعرَّب مرة واحدة
// ويُحفظ هنا فلا يُعاد طلبه من الـAI أبدًا. انظر server/services/worldCupNameTranslator.ts
export const wcPlayerNames = pgTable("wc_player_names", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().unique(),
  arabic: text("arabic").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WcPlayerName = typeof wcPlayerNames.$inferSelect;
