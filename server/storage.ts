// Reference: javascript_database blueprint + javascript_log_in_with_replit blueprint
import { db } from "./db";
import { log } from "./utils/logger";
import { isUniqueViolation } from "./utils/pgError";
import { memoryCache, CACHE_TTL, withCache } from "./memoryCache";
import { articleCardSelect, articleListSelect, categoryBasicSelect, userPublicSelect } from "./selectHelpers";
import { eq, desc, asc, sql, and, or, not, inArray, ne, gte, lt, lte, isNull, isNotNull, ilike, count, getTableColumns, type SQL } from "drizzle-orm";
import { alias as aliasedTable } from "drizzle-orm/pg-core";
import { nanoid } from 'nanoid';
import bcrypt from 'bcrypt';
import { generateEnglishSlug } from './utils/slugTransliterator';
import { notificationBus } from "./notificationBus";
import { bufferArticleViewIncrement } from "./services/articleViewCounterService";
import { matchesInternalAnnouncementAudience } from "./utils/internalAnnouncementTargeting";
import {
  users,
  categories,
  articles,
  rssFeeds,
  comments,
  reactions,
  bookmarks,
  readingHistory,
  focusReadingSessions,
  userPreferences,
  interests,
  userInterests,
  userSegmentDefinitions,
  userSegmentAssignments,
  userActivitySummary,
  behaviorLogs,
  sentimentScores,
  systemSettings,
  themes,
  themeAuditLog,
  userLoyaltyEvents,
  userPointsTotal,
  loyaltyRewards,
  userRewardsHistory,
  loyaltyCampaigns,
  angles,
  articleAngles,
  sections,
  stories,
  storyLinks,
  storyFollows,
  storyNotifications,
  experiments,
  experimentVariants,
  experimentExposures,
  experimentConversions,
  smartBlocks,
  audioNewsletters,
  audioNewsletterArticles,
  audioNewsletterListens,
  internalAnnouncements,
  internalAnnouncementVersions,
  internalAnnouncementMetrics,
  staff,
  roles,
  permissions,
  userRoles,
  rolePermissions,
  activityLogs,
  userEvents,
  enArticles,
  enCategories,
  enComments,
  enBookmarks,
  enReactions,
  enReadingHistory,
  urArticles,
  urCategories,
  urComments,
  urBookmarks,
  urReactions,
  urReadingHistory,
  urSmartBlocks,
  dismissedContinueReading,
  articleSeoHistory,
  dataStorySources,
  dataStoryAnalyses,
  dataStoryDrafts,
  shortLinks,
  shortLinkClicks,
  socialFollows,
  walletPasses,
  walletDevices,
  deepAnalyses,
  deepAnalysisMetrics,
  deepAnalysisEvents,
  notificationsInbox,
  articleMediaAssets,
  mediaFiles,
  type DeepAnalysis,
  type InsertDeepAnalysis,
  type NotificationInbox,
  type InsertNotificationInbox,
  type ArticleMediaAsset,
  type InsertArticleMediaAsset,
  type UpdateArticleMediaAsset,
  type MediaFile,
  type User,
  type InsertUser,
  type UpdateUser,
  type AdminCreateUser,
  type AdminUpdateUserRoles,
  type Category,
  type CategoryWithStats,
  type InsertCategory,
  type Article,
  type InsertArticle,
  type RssFeed,
  type InsertRssFeed,
  type Comment,
  type InsertComment,
  type Reaction,
  type InsertReaction,
  type Bookmark,
  type InsertBookmark,
  type Interest,
  type InsertInterest,
  type UserInterest,
  type InsertUserInterest,
  type UserPreference,
  type InsertUserPreference,
  type UserSegmentDefinition,
  type InsertUserSegmentDefinition,
  type UserSegmentAssignment,
  type InsertUserSegmentAssignment,
  type UserActivitySummary,
  type InsertUserActivitySummary,
  type BehaviorLog,
  type InsertBehaviorLog,
  type SentimentScore,
  type InsertSentimentScore,
  type Theme,
  type InsertTheme,
  type UpdateTheme,
  type ThemeAuditLog,
  type InsertThemeAuditLog,
  type ArticleWithDetails,
  type CommentWithUser,
  type InterestWithWeight,
  type UserLoyaltyEvent,
  type InsertUserLoyaltyEvent,
  type UserPointsTotal,
  type InsertUserPointsTotal,
  type LoyaltyReward,
  type InsertLoyaltyReward,
  type UserRewardsHistory,
  type InsertUserRewardsHistory,
  type LoyaltyCampaign,
  type InsertLoyaltyCampaign,
  type Angle,
  type InsertAngle,
  angleSubmissions,
  type AngleSubmission,
  type InsertAngleSubmission,
  topics,
  type Topic,
  type InsertTopic,
  type UpdateTopic,
  type Experiment,
  type InsertExperiment,
  type ExperimentVariant,
  type InsertExperimentVariant,
  type ExperimentExposure,
  type InsertExperimentExposure,
  type ExperimentConversion,
  type InsertExperimentConversion,
  type ArticleAngle,
  type InsertArticleAngle,
  type Section,
  type InsertSection,
  type Story,
  type InsertStory,
  type StoryLink,
  type InsertStoryLink,
  type StoryFollow,
  type InsertStoryFollow,
  type StoryNotification,
  type InsertStoryNotification,
  type StoryWithDetails,
  type StoryLinkWithArticle,
  type Staff,
  type ReporterProfile,
  type ReporterArticle,
  type ReporterTopCategory,
  type ReporterTimeseries,
  type SmartBlock,
  type InsertSmartBlock,
  type UpdateSmartBlock,
  type AudioNewsletter,
  type InsertAudioNewsletter,
  type UpdateAudioNewsletter,
  type AudioNewsletterArticle,
  type InsertAudioNewsletterArticle,
  type AudioNewsletterListen,
  type InsertAudioNewsletterListen,
  type AudioNewsletterWithDetails,
  type AudioNewsBrief,
  type InsertAudioNewsBrief,
  audioNewsBriefs,
  type InternalAnnouncement,
  type InsertInternalAnnouncement,
  type UpdateInternalAnnouncement,
  type InternalAnnouncementVersion,
  type InsertInternalAnnouncementVersion,
  type InternalAnnouncementMetric,
  type InsertInternalAnnouncementMetric,
  type InternalAnnouncementWithDetails,
  shorts,
  shortAnalytics,
  type Short,
  type ShortWithDetails,
  type InsertShort,
  type UpdateShort,
  type ShortAnalytic,
  type InsertShortAnalytic,
  calendarEvents,
  calendarReminders,
  calendarAiDrafts,
  calendarAssignments,
  type CalendarEvent,
  type CalendarReminder,
  type CalendarAiDraft,
  type CalendarAssignment,
  type InsertCalendarEvent,
  type UpdateCalendarEvent,
  type InsertCalendarReminder,
  type InsertCalendarAiDraft,
  type InsertCalendarAssignment,
  type UpdateCalendarAssignment,
  entityTypes,
  smartEntities,
  smartTerms,
  articleSmartLinks,
  type EntityType,
  type InsertEntityTypeDb,
  type SmartEntity,
  type InsertSmartEntityDb,
  type SmartTerm,
  type InsertSmartTermDb,
  type ArticleSmartLink,
  type InsertArticleSmartLinkDb,
  type InsertEntityType,
  type InsertSmartEntity,
  type InsertSmartTerm,
  type InsertArticleSmartLink,
  type EnArticleWithDetails,
  type UrCategory,
  type InsertUrCategory,
  type UrArticle,
  type InsertUrArticle,
  type UrComment,
  type InsertUrComment,
  type UrReaction,
  type InsertUrReaction,
  type UrBookmark,
  type InsertUrBookmark,
  type UrReadingHistory,
  type InsertUrReadingHistory,
  type UrArticleWithDetails,
  type UrCommentWithUser,
  type UrSmartBlock,
  type InsertUrSmartBlock,
  type DataStorySource,
  type InsertDataStorySource,
  type DataStoryAnalysis,
  type InsertDataStoryAnalysis,
  type DataStoryDraft,
  type InsertDataStoryDraft,
  type DataStoryWithDetails,
  type ShortLink,
  type InsertShortLink,
  type ShortLinkClick,
  type InsertShortLinkClick,
  type SocialFollow,
  type InsertSocialFollow,
  type WalletPass,
  type InsertWalletPass,
  type WalletDevice,
  type InsertWalletDevice,
  type HomepageStats,
  tasks,
  subtasks,
  taskComments,
  taskAttachments,
  taskActivityLog,
  type Task,
  type InsertTask,
  type Subtask,
  type InsertSubtask,
  type TaskComment,
  type InsertTaskComment,
  type TaskAttachment,
  type InsertTaskAttachment,
  type TaskActivityLogEntry,
  trustedEmailSenders,
  emailWebhookLogs,
  emailAgentStats,
  type TrustedEmailSender,
  type InsertTrustedEmailSender,
  type EmailWebhookLog,
  type InsertEmailWebhookLog,
  type EmailAgentStats,
  whatsappTokens,
  whatsappWebhookLogs,
  pendingWhatsappMessages,
  type WhatsappToken,
  type InsertWhatsappToken,
  type WhatsappWebhookLog,
  type InsertWhatsappWebhookLog,
  type PendingWhatsappMessage,
  newsletterSubscriptions,
  type NewsletterSubscription,
  type InsertNewsletterSubscription,
  publishers,
  publisherCredits,
  publisherCreditLogs,
  type Publisher,
  type InsertPublisher,
  type UpdatePublisher,
  type PublisherCredit,
  type InsertPublisherCredit,
  type PublisherCreditLog,
  type InsertPublisherCreditLog,
  // iFox imports
  ifoxSettings,
  ifoxMedia,
  ifoxAnalytics,
  ifoxSchedule,
  ifoxCategorySettings,
  type IfoxSettings,
  type InsertIfoxSettings,
  type IfoxMedia,
  type InsertIfoxMedia,
  type IfoxAnalytics,
  type InsertIfoxAnalytics,
  type IfoxSchedule,
  type InsertIfoxSchedule,
  type IfoxCategorySettings,
  type InsertIfoxCategorySettings,
  // iFox AI Management System - Phase 2
  ifoxAiPreferences,
  ifoxContentTemplates,
  ifoxWorkflowRules,
  ifoxQualityChecks,
  ifoxPerformanceMetrics,
  ifoxBudgetTracking,
  ifoxStrategyInsights,
  ifoxEditorialCalendar,
  type IfoxAiPreferences,
  type InsertIfoxAiPreferences,
  type IfoxContentTemplate,
  type InsertIfoxContentTemplate,
  type IfoxWorkflowRule,
  type InsertIfoxWorkflowRule,
  type IfoxQualityCheck,
  type InsertIfoxQualityCheck,
  type IfoxPerformanceMetric,
  type InsertIfoxPerformanceMetric,
  type IfoxBudgetTracking,
  type InsertIfoxBudgetTracking,
  type IfoxStrategyInsight,
  type InsertIfoxStrategyInsight,
  type IfoxEditorialCalendar,
  type InsertIfoxEditorialCalendar,
  // AI Scheduled Tasks imports
  aiScheduledTasks,
  type AiScheduledTask,
  type InsertAiScheduledTask,
  // AI Image Generations
  aiImageGenerations,
  readingSessions,
  sectionAnalytics,
  navigationPaths,
  trafficSources,
  hourlyEngagementRollups,
  realTimeMetrics,
  articleEngagementScores,
  readerJourneyMilestones,
  commentEditHistory,
  commentDeletionLog,
  type CommentEditHistory,
  type InsertCommentEditHistory,
  type CommentDeletionLog,
  type InsertCommentDeletionLog,
  // Opinion Author Applications
  opinionAuthorApplications,
  type OpinionAuthorApplication,
  type InsertOpinionAuthorApplication,
  type OpinionAuthorApplicationWithDetails,
  // Employee Email Templates
  employeeEmailTemplates,
  type EmployeeEmailTemplate,
  type UpdateEmployeeEmailTemplate,
  // Contact Message Replies
  contactMessages,
  contactMessageReplies,
  type ContactMessage,
  type ContactMessageReply,
  type InsertContactMessageReply,
  // World Days
  worldDays,
  worldDayReminders,
  worldDaySuggestions,
  type WorldDay,
  type InsertWorldDay,
  type WorldDayReminder,
  type InsertWorldDayReminder,
  type WorldDaySuggestion,
  type InsertWorldDaySuggestion,
  // Breaking Ticker
  breakingTickerTopics,
  breakingTickerHeadlines,
  type BreakingTickerTopic,
  type InsertBreakingTickerTopic,
  type BreakingTickerHeadline,
  type InsertBreakingTickerHeadline,
  // Auth tokens and user permissions (for permanent delete)
  passwordResetTokens,
  emailVerificationTokens,
  userPermissionOverrides,
  notificationQueue,
  announcementDismissals,
  accessibilityEvents,
  // Tags
  tags,
  articleTags,
  type FocusReadingSession,
  type InsertFocusReadingSession,
  type UpdateFocusReadingSession,
} from "@shared/schema";
import { computeTier, getLoyaltyActionMeta } from "@shared/loyalty";

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserPublicProfile(id: string): Promise<Partial<User> | undefined>;
  getUserForAuth(identifier: string): Promise<User | undefined>;
  upsertUser(user: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  }): Promise<User>;
  updateUser(id: string, userData: UpdateUser): Promise<User>;
  updateUserActivity(userId: string): Promise<void>;
  getOrCreateSystemUser(): Promise<User>;
  getOrCreateReporterUser(email: string, name: string): Promise<User>;
  
  // Admin user management operations
  getUsersWithStats(params: {
    page?: number;
    limit?: number;
    status?: string;
    role?: string;
    verificationBadge?: string;
    emailVerified?: boolean;
    searchQuery?: string;
    hasRejectedComments?: boolean;
    activityDays?: number;
  }): Promise<{
    users: (User & {
      commentCount: number;
      articleCount: number;
      totalPoints: number;
    })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  getUserKPIs(): Promise<{
    total: number;
    emailVerified: number;
    unverified: number;
    withPhone: number;
    suspended: number;
    banned: number;
    newToday: number;
    newThisWeek: number;
    active24h: number;
    trends: {
      emailVerifiedTrend: number;
      unverifiedTrend: number;
      withPhoneTrend: number;
      suspendedTrend: number;
      bannedTrend: number;
      newUsersTrend: number;
      activeUsersTrend: number;
    };
  }>;
  suspendUser(userId: string, reason: string, duration?: number): Promise<User>;
  unsuspendUser(userId: string): Promise<User>;
  banUser(userId: string, reason: string, isPermanent: boolean, duration?: number): Promise<User>;
  unbanUser(userId: string): Promise<User>;
  updateUserRole(userId: string, role: string): Promise<User>;
  updateVerificationBadge(userId: string, badge: string): Promise<User>;
  softDeleteUser(userId: string): Promise<User>;
  restoreUser(userId: string): Promise<User>;
  
  getUserDeletionPreview(userId: string): Promise<{
    canDelete: boolean;
    blockers: string[];
    counts: {
      tokens: number;
      socialFollows: number;
      reactions: number;
      bookmarks: number;
      readingHistory: number;
      notifications: number;
      notificationQueue: number;
      comments: number;
      articlesAsAuthor: number;
      articlesAsReporter: number;
      publishedArticles: number;
      staffRecords: number;
      userEvents: number;
      behaviorLogs: number;
      userPreferences: number;
      userInterests: number;
      userLoyaltyEvents: number;
      userPointsTotal: number;
      userRewardsHistory: number;
      storyFollows: number;
      experimentExposures: number;
      experimentConversions: number;
      audioNewsletterListens: number;
      walletPasses: number;
      dismissedContinueReading: number;
      accessibilityEvents: number;
      announcementDismissals: number;
    };
    userStatus: string;
    isBanned: boolean;
  }>;
  
  deleteUserPermanently(userId: string): Promise<{
    success: boolean;
    deletedCounts: {
      tokens: number;
      socialFollows: number;
      reactions: number;
      bookmarks: number;
      readingHistory: number;
      notifications: number;
      notificationQueue: number;
      comments: number;
      articlesReassigned: number;
      staffUpdated: number;
      userEvents: number;
      behaviorLogs: number;
      userPreferences: number;
      userInterests: number;
      userLoyaltyEvents: number;
      userPointsTotal: number;
      userRewardsHistory: number;
      storyFollows: number;
      experimentExposures: number;
      experimentConversions: number;
      audioNewsletterListens: number;
      walletPasses: number;
      dismissedContinueReading: number;
      accessibilityEvents: number;
      announcementDismissals: number;
    };
  }>;
  
  bulkSuspendUsers(userIds: string[], reason: string, duration?: number): Promise<{ success: number; failed: number }>;
  bulkBanUsers(userIds: string[], reason: string, isPermanent: boolean, duration?: number): Promise<{ success: number; failed: number }>;
  bulkUpdateUserRole(userIds: string[], role: string): Promise<{ success: number; failed: number }>;
  
  // RBAC operations (Role-Based Access Control)
  createUserWithRoles(userData: {
    email: string;
    firstName: string;
    lastName: string;
    firstNameEn?: string;
    lastNameEn?: string;
    phoneNumber?: string;
    profileImageUrl?: string | null;
    roleIds: string[];
    status?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  }, createdBy: string): Promise<{ user: User; temporaryPassword: string }>;
  /** lookup مستخدم بالإيميل (case-insensitive) — لـ pre-check ومعالجة race. */
  getUserByEmailBasic(email: string): Promise<{ id: string; email: string; firstName: string | null; lastName: string | null; status: string; role: string } | undefined>;
  getUserRoles(userId: string): Promise<Array<{ id: string; name: string; nameAr: string }>>;
  updateUserRoles(userId: string, roleIds: string[], updatedBy: string, reason?: string): Promise<void>;
  getAllRoles(): Promise<Array<{ id: string; name: string; nameAr: string; description: string | null; isSystem: boolean }>>;
  getRolePermissions(roleId: string): Promise<Array<{ code: string; label: string; labelAr: string; module: string }>>;
  getUserPermissions(userId: string): Promise<string[]>;
  logActivity(activity: {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, any>;
    newValue?: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<void>;
  
  // Category operations
  getAllCategories(options?: { excludeIfox?: boolean }): Promise<Category[]>;
  getCategoryById(id: string): Promise<Category | undefined>;
  createCategory(category: InsertCategory): Promise<Category>;
  updateCategory(id: string, category: Partial<InsertCategory>): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
  
  // Article operations
  getArticles(filters?: {
    categoryId?: string;
    status?: string;
    authorId?: string;
    searchQuery?: string;
    includeAI?: boolean;
  }): Promise<ArticleWithDetails[]>;
  getArticleBySlug(slug: string, userId?: string, userRole?: string): Promise<ArticleWithDetails | undefined>;
  getLatestArticlesForFooter(limit: number): Promise<{ id: number; title: string; slug: string }[]>;
  getArticleById(id: string, userId?: string): Promise<ArticleWithDetails | undefined>;
  createArticle(article: InsertArticle): Promise<Article>;
  updateArticle(id: string, article: Partial<InsertArticle>): Promise<Article>;
  deleteArticle(id: string): Promise<void>;
  incrementArticleViews(id: string): Promise<void>;
  getFeaturedArticle(userId?: string): Promise<ArticleWithDetails | undefined>;
  getRelatedArticles(articleId: string, categoryId?: string): Promise<ArticleWithDetails[]>;
  getArticlesMetrics(): Promise<{ published: number; scheduled: number; draft: number; archived: number }>;
  archiveArticle(id: string, userId: string): Promise<Article>;
  restoreArticle(id: string, userId: string): Promise<Article>;
  toggleArticleBreaking(id: string, userId: string): Promise<Article>;
  getNewsStatistics(): Promise<{
    totalNews: number;
    todayNews: number;
    topStoriesThisWeek: Array<{
      id: string;
      title: string;
      slug: string;
      englishSlug?: string | null;
      imageUrl?: string | null;
      categoryName?: string | null;
      categorySlug?: string | null;
    }>;
    /** Legacy field kept for older clients — views omitted from public API. */
    topViewedThisWeek: {
      article: ArticleWithDetails | null;
      views: number;
    };
    averageViews: number;
  }>;
  
  // SEO operations
  getArticleForSeo(id: string, language: "ar" | "en" | "ur"): Promise<{
    id: string;
    title: string;
    subtitle?: string | null;
    content: string;
    excerpt?: string | null;
  } | undefined>;
  saveSeoMetadata(
    articleId: string,
    language: "ar" | "en" | "ur",
    seo: {
      metaTitle?: string;
      metaDescription?: string;
      keywords?: string[];
      socialTitle?: string;
      socialDescription?: string;
      imageAltText?: string;
      ogImageUrl?: string;
    },
    metadata: {
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
    }
  ): Promise<void>;
  createSeoHistoryEntry(params: {
    articleId: string;
    language: "ar" | "en" | "ur";
    seoContent: {
      metaTitle?: string;
      metaDescription?: string;
      keywords?: string[];
      socialTitle?: string;
      socialDescription?: string;
      imageAltText?: string;
      ogImageUrl?: string;
    };
    seoMetadata: {
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
    };
    provider: string;
    model: string;
    generatedBy: string;
  }): Promise<void>;
  
  // RSS Feed operations
  getAllRssFeeds(): Promise<RssFeed[]>;
  createRssFeed(feed: InsertRssFeed): Promise<RssFeed>;
  updateRssFeedLastFetch(id: string): Promise<void>;
  
  // Comment operations
  getCommentsByArticle(articleId: string, showPending?: boolean): Promise<CommentWithUser[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  getAllComments(filters?: { status?: string; articleId?: string }): Promise<CommentWithUser[]>;
  approveComment(commentId: string, moderatorId: string): Promise<Comment>;
  rejectComment(commentId: string, moderatorId: string, reason?: string): Promise<Comment>;
  restoreComment(commentId: string): Promise<Comment>;
  
  // AI Comment Moderation operations
  getCommentById(commentId: string): Promise<Comment | undefined>;
  updateCommentModeration(commentId: string, data: {
    aiModerationScore?: number;
    aiClassification?: string;
    aiDetectedIssues?: string[];
    aiModerationReason?: string;
    aiAnalyzedAt?: Date;
  }): Promise<void>;
  updateCommentStatus(commentId: string, data: {
    status: string;
    moderatedBy?: string;
    moderatedAt?: Date;
    moderationReason?: string;
  }): Promise<void>;
  getCommentsForModeration(filters: {
    classification?: string;
    status?: string;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{ comments: CommentWithUser[]; total: number }>;
  getCommentModerationStats(): Promise<{
    approvedToday: number;
    pendingReview: number;
    rejectedToday: number;
    averageScore: number;
  }>;
  getAIModerationStats(): Promise<{
    total: number;
    safe: number;
    flagged: number;
    spam: number;
    harmful: number;
    pending: number;
    averageScore: number;
  }>;
  getUnanalyzedComments(limit: number): Promise<{ id: string; content: string }[]>;
  getModerationResults(filters: {
    classification?: string;
    minScore?: number;
    maxScore?: number;
    limit: number;
  }): Promise<{
    commentId: string;
    moderationScore: number;
    aiClassification: string;
    detectedIssues: string[];
    aiModerationAnalyzedAt: string;
    comment: {
      id: string;
      content: string;
      status: string;
      createdAt: string;
      sentiment?: string; sentimentConfidence?: number;
      user: { id: string; firstName?: string; lastName?: string; email: string };
      articleId: string;
      articleTitle?: string;
      articleSlug?: string;
    };
  }[]>;

  // Advanced Moderation Search - البحث المتقدم في الرقابة الذكية
  searchModerationComments(params: {
    query?: string;
    userId?: string;
    status?: string;
    aiClassification?: string;
    dateFrom?: Date;
    dateTo?: Date;
    sortBy?: 'relevance' | 'date' | 'score';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    comments: Array<{
      id: string;
      content: string;
      status: string;
      createdAt: string;
      aiModerationScore: number | null;
      aiClassification: string | null;
      aiDetectedIssues: string[] | null;
      highlightedContent?: string;
      relevanceScore?: number;
      user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        profileImage: string | null;
      };
      article: {
        id: string;
        title: string;
        slug: string;
        categoryId: string | null;
        categoryName: string | null;
      };
    }>;
    total: number;
    page: number;
    totalPages: number;
  }>;
  
  searchModerationArticles(params: {
    query?: string;
    categoryId?: string;
    publishFrom?: Date;
    publishTo?: Date;
    includeComments?: boolean;
    sortBy?: 'relevance' | 'date' | 'comments' | 'engagement';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    articles: Array<{
      id: string;
      title: string;
      slug: string;
      excerpt: string | null;
      imageUrl: string | null;
      publishedAt: string | null;
      views: number;
      categoryId: string | null;
      categoryName: string | null;
      highlightedTitle?: string;
      relevanceScore?: number;
      commentStats: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        flagged: number;
      };
      latestComments?: Array<{
        id: string;
        content: string;
        status: string;
        aiClassification: string | null;
        aiModerationScore: number | null;
        createdAt: string;
        userName: string;
      }>;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }>;

  // Comment Edit & Delete operations with audit logging
  editCommentWithHistory(commentId: string, newContent: string, editedBy: string, editReason?: string): Promise<Comment>;
  deleteCommentWithLog(commentId: string, deletedBy: string, deletionReason?: string): Promise<void>;
  getCommentEditHistory(commentId: string): Promise<CommentEditHistory[]>;
  getCommentWithArticle(commentId: string): Promise<{
    comment: Comment;
    article: { id: string; title: string; slug: string } | null;
    user: { id: string; firstName?: string; lastName?: string; email: string } | null;
  } | null>;
  
  // Reaction operations
  toggleReaction(articleId: string, userId: string): Promise<{ hasReacted: boolean }>;
  getReactionsByArticle(articleId: string): Promise<number>;
  
  // Bookmark operations
  toggleBookmark(articleId: string, userId: string): Promise<{ isBookmarked: boolean }>;
  getUserBookmarks(userId: string): Promise<ArticleWithDetails[]>;
  getUserLikedArticles(userId: string): Promise<ArticleWithDetails[]>;
  
  // Reading history operations
  recordArticleRead(userId: string, articleId: string, duration?: number): Promise<void>;
  getUserReadingHistory(userId: string, limit?: number): Promise<ArticleWithDetails[]>;

  // Focus mode reading sessions (Task #80)
  createFocusReadingSession(data: InsertFocusReadingSession): Promise<FocusReadingSession>;
  updateFocusReadingSession(id: string, data: UpdateFocusReadingSession & { shareSlug?: string }): Promise<FocusReadingSession | undefined>;
  getFocusReadingSession(id: string): Promise<FocusReadingSession | undefined>;
  getFocusSessionByShareSlug(slug: string): Promise<FocusReadingSession | undefined>;
  getUserFocusSessionsInRange(userId: string, start: Date, end: Date): Promise<FocusReadingSession[]>;
  
  // Recommendation operations
  getUserPreferences(userId: string): Promise<string[]>;
  getRecommendations(userId: string): Promise<ArticleWithDetails[]>;
  getPersonalizedFeed(userId: string, limit?: number): Promise<ArticleWithDetails[]>;
  getPersonalizedRecommendations(userId: string, limit?: number): Promise<ArticleWithDetails[]>;
  getContinueReading(userId: string, limit?: number): Promise<Array<ArticleWithDetails & { progress: number; lastReadAt: Date }>>;
  dismissContinueReading(userId: string, articleId: string): Promise<void>;
  clearAllContinueReading(userId: string): Promise<void>;
  
  // User Segments & Personalization operations
  getUserFullPreferences(userId: string): Promise<UserPreference | undefined>;
  updateUserFullPreferences(userId: string, prefs: Partial<InsertUserPreference>): Promise<UserPreference>;
  getUserCategoryInterests(userId: string): Promise<Array<{categoryId: string; weight: number; category?: Category}>>;
  setUserCategoryInterests(userId: string, interests: Array<{categoryId: string; weight?: number}>): Promise<void>;
  getUserActivitySummary(userId: string): Promise<UserActivitySummary | undefined>;
  updateUserActivitySummary(userId: string): Promise<UserActivitySummary>;
  getUserSegments(userId: string): Promise<Array<UserSegmentDefinition & {score: number; assignedAt: Date}>>;
  getAllSegmentDefinitions(): Promise<UserSegmentDefinition[]>;
  createSegmentDefinition(segment: InsertUserSegmentDefinition): Promise<UserSegmentDefinition>;
  assignUserToSegment(userId: string, segmentId: string, score?: number): Promise<void>;
  removeUserFromSegment(userId: string, segmentId: string): Promise<void>;
  recalculateUserSegments(userId: string): Promise<void>;
  trackUserEngagement(userId: string, articleId: string, engagementType: 'read' | 'like' | 'bookmark' | 'comment' | 'share', categoryId?: string): Promise<void>;
  getUserActivitySummaryWithRecency(userId: string): Promise<{
    summary: UserActivitySummary | undefined;
    weightedMetrics: {
      weightedArticleCount: number;
      trendingInterests: Array<{categoryId: string; name?: string; score: number}>;
      longTermInterests: Array<{categoryId: string; name?: string; score: number}>;
      recentEngagementScore: number;
    };
  }>;
  
  // Muqtarab Angles operations
  getSectionBySlug(slug: string): Promise<Section | undefined>;
  getAllAngles(activeOnly?: boolean): Promise<Angle[]>;
  getAnglesWithStats(activeOnly?: boolean): Promise<Array<Angle & { topicCount: number; writerName: string | null; writerAvatar: string | null }>>;
  getAngleBySlug(slug: string): Promise<Angle | undefined>;
  getAngleWriter(managerUserId: string | null): Promise<{ name: string; avatar: string | null; slug: string | null } | null>;
  getAngleById(id: string): Promise<Angle | undefined>;
  createAngle(angle: InsertAngle): Promise<Angle>;
  updateAngle(id: string, angle: Partial<InsertAngle>): Promise<Angle>;
  deleteAngle(id: string): Promise<void>;
  getArticlesByAngle(angleSlug: string, limit?: number): Promise<ArticleWithDetails[]>;
  linkArticleToAngle(articleId: string, angleId: string): Promise<void>;
  unlinkArticleFromAngle(articleId: string, angleId: string): Promise<void>;
  getArticleAngles(articleId: string): Promise<Angle[]>;
  
  // Topics CRUD
  getTopicsByAngle(angleId: string, options?: {
    status?: 'draft' | 'published' | 'archived';
    limit?: number;
    offset?: number;
    /** Omit heavy jsonb columns (content, attachments, seoMeta) for admin list views. */
    listOnly?: boolean;
  }): Promise<{ topics: Topic[]; total: number }>;
  getTopicBySlug(angleId: string, slug: string): Promise<Topic | undefined>;
  getTopicById(id: string): Promise<Topic | undefined>;
  createTopic(topic: InsertTopic): Promise<Topic>;
  updateTopic(id: string, topic: UpdateTopic): Promise<Topic>;
  deleteTopic(id: string): Promise<void>;
  publishTopic(id: string, userId: string): Promise<Topic>;
  unpublishTopic(id: string, userId: string): Promise<Topic>;
  getPublishedTopicsByAngle(angleSlug: string, limit?: number): Promise<Topic[]>;
  getLatestPublishedTopics(limit?: number): Promise<Array<Topic & { angle: { id: string; name: string; slug: string; icon?: string | null; colorHex?: string | null } }>>;
  
  // Angle Submissions operations - طلبات كتابة الزوايا
  createAngleSubmission(data: InsertAngleSubmission): Promise<AngleSubmission>;
  getAngleSubmissions(status?: string): Promise<AngleSubmission[]>;
  getAngleSubmission(id: string): Promise<AngleSubmission | undefined>;
  updateAngleSubmission(id: string, data: Partial<AngleSubmission>): Promise<AngleSubmission | undefined>;
  deleteAngleSubmission(id: string): Promise<boolean>;
  
  // Homepage operations
  getHeroArticles(): Promise<ArticleWithDetails[]>;
  getBreakingNews(limit?: number): Promise<ArticleWithDetails[]>;
  getEditorPicks(limit?: number): Promise<ArticleWithDetails[]>;
  getDeepDiveArticles(limit?: number): Promise<ArticleWithDetails[]>;
  getTrendingTopics(): Promise<Array<{ topic: string; count: number; views: number; articles: number; comments: number }>>;
  getAllPublishedArticles(limit?: number, offset?: number): Promise<ArticleWithDetails[]>;
  
  // Dashboard stats
  getDashboardStats(userId: string): Promise<{
    totalArticles: number;
    publishedArticles: number;
    draftArticles: number;
    totalViews: number;
  }>;

  // Admin Dashboard stats
  getAdminDashboardStats(): Promise<{
    articles: {
      total: number;
      published: number;
      draft: number;
      archived: number;
      totalViews: number;
    };
    users: {
      total: number;
      emailVerified: number;
      active24h: number;
      newThisWeek: number;
    };
    comments: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    };
    categories: {
      total: number;
    };
    abTests: {
      total: number;
      running: number;
    };
    reactions: {
      total: number;
    };
    audioNewsletters: {
      total: number;
      published: number;
      totalListens: number;
    };
    deepAnalyses: {
      total: number;
      published: number;
    };
    publishers: {
      total: number;
      active: number;
    };
    mediaLibrary: {
      totalFiles: number;
      totalSize: number;
    };
    aiTasks: {
      total: number;
      pending: number;
      completed: number;
    };
    aiImages: {
      total: number;
      thisWeek: number;
    };
    smartBlocks: {
      total: number;
    };
    recentArticles: ArticleWithDetails[];
    recentComments: CommentWithUser[];
    topArticles: ArticleWithDetails[];
  }>;
  
  // Online moderators operations
  getOnlineModerators(minutesThreshold?: number): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    role: string;
    jobTitle: string | null;
    lastActivityAt: Date | null;
    isOnline: boolean;
  }[]>;
  
  // Set moderator offline (clear lastActivityAt to mark user as logged out)
  setModeratorOffline(userId: string): Promise<void>;
  
  // Interest operations
  getAllInterests(): Promise<Interest[]>;
  getUserInterests(userId: string): Promise<InterestWithWeight[]>;
  setUserInterests(userId: string, interestIds: string[]): Promise<void>;
  updateInterestWeight(userId: string, interestId: string, weight: number): Promise<void>;
  
  // Behavior tracking operations
  logBehavior(log: InsertBehaviorLog): Promise<void>;
  getUserBehaviorSummary(userId: string, days?: number): Promise<any>;
  analyzeUserInterestsFromBehavior(userId: string, days?: number): Promise<Array<{
    categoryId: string;
    currentWeight: number;
    suggestedWeight: number;
    stats: {
      reads: number;
      likes: number;
      comments: number;
      shares: number;
      readTimeMinutes: number;
    };
  }>>;
  updateUserInterestsAutomatically(userId: string, days?: number): Promise<{
    updated: number;
    added: number;
    removed: number;
  }>;
  
  // Sentiment analysis operations
  saveSentimentScore(score: InsertSentimentScore): Promise<void>;
  getUserSentimentProfile(userId: string): Promise<any>;
  
  // Theme management operations
  getActiveTheme(scope?: string): Promise<Theme | undefined>;
  getAllThemes(filters?: { status?: string; createdBy?: string }): Promise<Theme[]>;
  getThemeById(id: string): Promise<Theme | undefined>;
  getThemeBySlug(slug: string): Promise<Theme | undefined>;
  createTheme(theme: InsertTheme): Promise<Theme>;
  updateTheme(id: string, theme: UpdateTheme, userId: string): Promise<Theme>;
  deleteTheme(id: string): Promise<void>;
  publishTheme(id: string, userId: string): Promise<Theme>;
  expireTheme(id: string, userId: string): Promise<Theme>;
  rollbackTheme(id: string, userId: string): Promise<Theme>;
  createThemeAuditLog(log: InsertThemeAuditLog): Promise<void>;
  getThemeAuditLogs(themeId: string): Promise<ThemeAuditLog[]>;
  initializeDefaultTheme(userId: string): Promise<Theme>;

  // Loyalty System - Points and Events
  recordLoyaltyPoints(params: {
    userId: string;
    action: string;
    points: number;
    source?: string;
    metadata?: any;
  }): Promise<{ pointsEarned: number; totalPoints: number; rankChanged: boolean; newRank?: string }>;
  recordLoyaltyPointsInTx(tx: any, params: {
    userId: string;
    action: string;
    points: number;
    source?: string;
    metadata?: any;
  }, balanceLockHeld?: boolean): Promise<{ pointsEarned: number; totalPoints: number; rankChanged: boolean; newRank?: string }>;
  getUserPoints(userId: string): Promise<UserPointsTotal | undefined>;
  getUserLoyaltyHistory(userId: string, limit?: number): Promise<UserLoyaltyEvent[]>;
  getTopUsers(limit?: number): Promise<Array<UserPointsTotal & { user: User }>>;

  // Loyalty System - Rewards
  getActiveRewards(): Promise<LoyaltyReward[]>;
  getRewardById(rewardId: string): Promise<LoyaltyReward | undefined>;
  redeemReward(params: {
    userId: string;
    rewardId: string;
  }): Promise<{ success: boolean; message: string; redemption?: UserRewardsHistory }>;
  getUserRedemptionHistory(userId: string): Promise<UserRewardsHistory[]>;

  // Loyalty System - Campaigns
  getActiveCampaigns(): Promise<LoyaltyCampaign[]>;
  getApplicableCampaign(action: string, categoryId?: string): Promise<LoyaltyCampaign | undefined>;

  // Loyalty System - Admin
  createReward(data: InsertLoyaltyReward): Promise<LoyaltyReward>;
  updateReward(id: string, data: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward>;
  deleteReward(id: string): Promise<void>;
  createCampaign(data: InsertLoyaltyCampaign): Promise<LoyaltyCampaign>;
  updateCampaign(id: string, data: Partial<InsertLoyaltyCampaign>): Promise<LoyaltyCampaign>;
  adjustUserPoints(userId: string, points: number, reason: string): Promise<void>;

  // Story operations
  createStory(story: InsertStory): Promise<Story>;
  getStoryById(id: string): Promise<Story | undefined>;
  getStoryBySlug(slug: string): Promise<StoryWithDetails | undefined>;
  getAllStories(filters?: { status?: string }): Promise<StoryWithDetails[]>;
  updateStory(id: string, data: Partial<InsertStory>): Promise<Story>;
  deleteStory(id: string): Promise<void>;

  // Story link operations
  createStoryLink(link: InsertStoryLink): Promise<StoryLink>;
  getStoryLinks(storyId: string): Promise<StoryLinkWithArticle[]>;
  deleteStoryLink(id: string): Promise<void>;

  // Story follow operations
  followStory(follow: InsertStoryFollow): Promise<StoryFollow>;
  unfollowStory(userId: string, storyId: string): Promise<void>;
  getStoryFollows(userId: string): Promise<(StoryFollow & { story: StoryWithDetails })[]>;
  getStoryFollowersByStoryId(storyId: string): Promise<StoryFollow[]>;
  isFollowingStory(userId: string, storyId: string): Promise<boolean>;
  updateStoryFollow(userId: string, storyId: string, data: Partial<InsertStoryFollow>): Promise<StoryFollow>;

  // Social Following System
  followUser(data: InsertSocialFollow): Promise<SocialFollow>;
  unfollowUser(followerId: string, followingId: string): Promise<void>;
  getFollowers(userId: string, limit?: number): Promise<Array<SocialFollow & { follower: User }>>;
  getFollowing(userId: string, limit?: number): Promise<Array<SocialFollow & { following: User }>>;
  isFollowing(followerId: string, followingId: string): Promise<boolean>;
  getFollowStats(userId: string): Promise<{ followersCount: number; followingCount: number }>;

  // Story notification operations
  createStoryNotification(notification: InsertStoryNotification): Promise<StoryNotification>;
  getStoryNotifications(storyId: string): Promise<StoryNotification[]>;

  // System settings operations
  getSystemSetting(key: string): Promise<any | undefined>;
  upsertSystemSetting(key: string, value: any, category?: string, isPublic?: boolean): Promise<void>;

  // A/B Testing operations
  createExperiment(experiment: InsertExperiment): Promise<Experiment>;
  getExperimentById(id: string): Promise<Experiment | undefined>;
  getAllExperiments(filters?: { status?: string; testType?: string }): Promise<Experiment[]>;
  updateExperiment(id: string, data: Partial<InsertExperiment>): Promise<Experiment>;
  deleteExperiment(id: string): Promise<void>;
  startExperiment(id: string): Promise<Experiment>;
  pauseExperiment(id: string): Promise<Experiment>;
  completeExperiment(id: string, winnerVariantId?: string): Promise<Experiment>;

  // Experiment variant operations
  createExperimentVariant(variant: InsertExperimentVariant): Promise<ExperimentVariant>;
  getExperimentVariants(experimentId: string): Promise<ExperimentVariant[]>;
  updateExperimentVariant(id: string, data: Partial<InsertExperimentVariant>): Promise<ExperimentVariant>;
  deleteExperimentVariant(id: string): Promise<void>;

  // Experiment exposure operations
  recordExperimentExposure(exposure: InsertExperimentExposure): Promise<ExperimentExposure>;
  getExperimentExposures(experimentId: string, variantId?: string): Promise<ExperimentExposure[]>;

  // Experiment conversion operations
  recordExperimentConversion(conversion: InsertExperimentConversion): Promise<ExperimentConversion>;
  getExperimentConversions(experimentId: string, variantId?: string): Promise<ExperimentConversion[]>;

  // A/B Testing analytics
  getExperimentAnalytics(experimentId: string): Promise<{
    experiment: Experiment;
    variants: Array<ExperimentVariant & {
      exposureCount: number;
      conversionCount: number;
      conversionRate: number;
      averageReadTime?: number;
      engagementScore: number;
    }>;
    totalExposures: number;
    totalConversions: number;
    overallConversionRate: number;
    winner?: string;
    confidenceLevel?: number;
  }>;

  // Get active experiment for article
  getActiveExperimentForArticle(articleId: string): Promise<Experiment | undefined>;

  // Assign variant to user/session
  assignExperimentVariant(experimentId: string, userId?: string, sessionId?: string): Promise<ExperimentVariant>;

  // Reporter/Staff operations
  getReporterBySlug(slug: string): Promise<Staff | undefined>;
  getReporterProfile(slug: string, windowDays?: number, language?: 'ar' | 'en'): Promise<ReporterProfile | undefined>;
  ensureReporterStaffRecord(userId: string): Promise<Staff>;
  getStaffByUserId(userId: string): Promise<Staff | null>;
  upsertStaff(userId: string, data: { bio?: string; bioAr?: string; title?: string; titleAr?: string }): Promise<Staff>;

  // Activity Logs operations
  getActivityLogs(filters?: {
    userId?: string;
    action?: string;
    entityType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    searchQuery?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    logs: Array<{
      id: string;
      userId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      oldValue: Record<string, any> | null;
      newValue: Record<string, any> | null;
      metadata: { ip?: string; userAgent?: string; reason?: string } | null;
      createdAt: Date;
      user?: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        profileImageUrl: string | null;
      } | null;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  getActivityLogById(id: string): Promise<{
    id: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, any> | null;
    newValue: Record<string, any> | null;
    metadata: { ip?: string; userAgent?: string; reason?: string } | null;
    createdAt: Date;
    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    } | null;
  } | undefined>;

  getActivityLogsAnalytics(days?: number): Promise<{
    periodDays: number;
    summary: {
      totalCount: number;
      previousCount: number;
      changePercent: number | null;
      activeUsers: number;
      affectedEntities: number;
      sensitiveActions: number;
      automatedActions: number;
      averagePerDay: number;
      lastActivityAt: Date | null;
    };
    topUsers: Array<{
      userId: string;
      userName: string;
      email: string;
      activityCount: number;
      profileImageUrl: string | null;
    }>;
    topActions: Array<{
      action: string;
      count: number;
    }>;
    topEntities: Array<{ entityType: string; count: number }>;
    recentActivity: Array<{
      date: string;
      count: number;
    }>;
  }>;

  // ============================================
  // Smart Blocks Operations - البلوكات الذكية
  // ============================================
  
  createSmartBlock(data: InsertSmartBlock): Promise<SmartBlock>;
  getSmartBlocks(filters?: { isActive?: boolean; placement?: string }): Promise<SmartBlock[]>;
  getSmartBlockById(id: string): Promise<SmartBlock | undefined>;
  getSmartBlocksByPlacement(placement: string): Promise<SmartBlock[]>;
  updateSmartBlock(id: string, updates: UpdateSmartBlock): Promise<SmartBlock>;
  deleteSmartBlock(id: string): Promise<void>;
  queryArticlesByKeyword(keyword: string, limit: number, filters?: {
    categories?: string[];
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Array<any>>;
  queryUrArticlesByKeyword(keyword: string, limit: number, filters?: {
    categories?: string[];
    dateFrom?: string;
    dateTo?: string;
  }): Promise<Array<any>>;

  // ============================================
  // Audio News Briefs Operations - الأخبار الصوتية السريعة
  // ============================================
  createAudioNewsBrief(data: InsertAudioNewsBrief): Promise<AudioNewsBrief>;
  getAudioNewsBriefById(id: string): Promise<AudioNewsBrief | null>;
  getAllAudioNewsBriefs(): Promise<AudioNewsBrief[]>;
  getPublishedAudioNewsBriefs(limit?: number): Promise<AudioNewsBrief[]>;
  updateAudioNewsBrief(id: string, data: Partial<InsertAudioNewsBrief>): Promise<AudioNewsBrief>;
  deleteAudioNewsBrief(id: string): Promise<void>;
  publishAudioNewsBrief(id: string): Promise<AudioNewsBrief>;

  // ============================================
  // Audio Newsletters Operations - النشرات الصوتية
  // ============================================
  
  // Audio Newsletter CRUD operations
  createAudioNewsletter(data: InsertAudioNewsletter): Promise<AudioNewsletter>;
  getAudioNewsletterById(id: string): Promise<AudioNewsletterWithDetails | null>;
  getAudioNewsletterBySlug(slug: string): Promise<AudioNewsletterWithDetails | null>;
  getAllAudioNewsletters(filters?: { status?: string; limit?: number; offset?: number }): Promise<AudioNewsletterWithDetails[]>;
  updateAudioNewsletter(id: string, data: UpdateAudioNewsletter): Promise<AudioNewsletter>;
  deleteAudioNewsletter(id: string): Promise<void>;

  // Articles in newsletter
  addArticlesToNewsletter(newsletterId: string, articleIds: string[]): Promise<void>;
  removeArticleFromNewsletter(newsletterId: string, articleId: string): Promise<void>;
  getNewsletterArticles(newsletterId: string): Promise<(AudioNewsletterArticle & { article?: Article })[]>;

  // Listen tracking
  trackListen(data: InsertAudioNewsletterListen): Promise<AudioNewsletterListen>;
  getNewsletterAnalytics(newsletterId: string): Promise<{
    totalListens: number;
    uniqueListeners: number;
    averageCompletionRate: number;
    listensByDay: { date: string; count: number }[];
  }>;

  // ============================================
  // Internal Announcements Operations - نظام الإعلانات الداخلية المتقدم
  // ============================================
  
  // Announcement CRUD operations
  createInternalAnnouncement(data: InsertInternalAnnouncement): Promise<InternalAnnouncement>;
  getInternalAnnouncementById(id: string): Promise<InternalAnnouncementWithDetails | null>;
  getAllInternalAnnouncements(filters?: {
    status?: string;
    priority?: string;
    channel?: string;
    tags?: string[];
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<InternalAnnouncementWithDetails[]>;
  updateInternalAnnouncement(id: string, data: UpdateInternalAnnouncement, changedBy: string, changeReason?: string): Promise<InternalAnnouncement>;
  deleteInternalAnnouncement(id: string): Promise<void>;
  
  // Status management
  publishInternalAnnouncement(id: string, publishedBy: string): Promise<InternalAnnouncement>;
  archiveInternalAnnouncement(id: string): Promise<InternalAnnouncement>;
  scheduleInternalAnnouncement(id: string, startAt: Date, endAt?: Date): Promise<InternalAnnouncement>;
  
  // Audience targeting
  getActiveAnnouncementsForUser(userId: string, userRoles: string[], channel?: string): Promise<InternalAnnouncementWithDetails[]>;
  
  // Versioning
  createAnnouncementVersion(data: InsertInternalAnnouncementVersion): Promise<InternalAnnouncementVersion>;
  getAnnouncementVersions(announcementId: string): Promise<InternalAnnouncementVersion[]>;
  restoreAnnouncementVersion(versionId: string, restoredBy: string): Promise<InternalAnnouncement>;
  
  // Metrics tracking
  trackAnnouncementMetric(data: InsertInternalAnnouncementMetric): Promise<InternalAnnouncementMetric>;
  getAnnouncementMetrics(announcementId: string, event?: string): Promise<InternalAnnouncementMetric[]>;
  getAnnouncementAnalytics(announcementId: string): Promise<{
    totalImpressions: number;
    uniqueViews: number;
    dismissals: number;
    clicks: number;
    viewsByChannel: { channel: string; count: number }[];
    viewsByDay: { date: string; count: number }[];
  }>;
  
  // Scheduled tasks
  processScheduledAnnouncements(): Promise<void>;

  // ============================================
  // Sabq Shorts (Reels) Operations - سبق شورتس
  // ============================================
  
  // Get all shorts with filters and pagination
  getAllShorts(filters?: {
    status?: string;
    categoryId?: string;
    reporterId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    shorts: ShortWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;

  // Get single short by ID with relations
  getShortById(id: string): Promise<ShortWithDetails | undefined>;

  // Get single short by slug for public viewing
  getShortBySlug(slug: string): Promise<ShortWithDetails | undefined>;

  // Create new short
  createShort(short: InsertShort): Promise<Short>;

  // Update existing short
  updateShort(id: string, updates: UpdateShort): Promise<Short>;

  // Delete short (soft delete by setting status=archived)
  deleteShort(id: string): Promise<Short>;

  // Increment view count
  incrementShortViews(id: string): Promise<void>;

  // Increment like count
  likeShort(id: string): Promise<Short>;

  // Increment share count
  shareShort(id: string): Promise<Short>;

  // Record analytics event (view, watch_time, etc.)
  trackShortAnalytic(data: InsertShortAnalytic): Promise<ShortAnalytic>;

  // Get analytics for a short
  getShortAnalytics(shortId: string, filters?: {
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    uniqueViewers: number;
    averageWatchTime: number;
    completionRate: number;
    eventsByType: { eventType: string; count: number }[];
    viewsByDay: { date: string; count: number }[];
  }>;

  // Get featured shorts for homepage block
  getFeaturedShorts(limit?: number): Promise<ShortWithDetails[]>;

  // ==========================================
  // Calendar System - تقويم سبق
  // ==========================================
  
  // Calendar Events - CRUD operations
  getAllCalendarEvents(filters?: {
    type?: string;
    importance?: number;
    dateFrom?: Date;
    dateTo?: Date;
    categoryId?: string;
    tags?: string[];
    searchQuery?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    events: Array<any>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>;
  
  getCalendarEventById(id: string): Promise<any | undefined>;
  getCalendarEventBySlug(slug: string): Promise<any | undefined>;
  createCalendarEvent(event: any, reminders?: any[]): Promise<any>;
  updateCalendarEvent(id: string, updates: any): Promise<any>;
  deleteCalendarEvent(id: string): Promise<void>;
  
  // Upcoming events (7-day lookahead)
  getUpcomingCalendarEvents(days?: number): Promise<Array<any>>;
  
  // Reminders
  getCalendarReminders(eventId: string): Promise<any[]>;
  createCalendarReminder(reminder: any): Promise<any>;
  updateCalendarReminder(id: string, updates: any): Promise<any>;
  deleteCalendarReminder(id: string): Promise<void>;
  getRemindersToFire(date: Date): Promise<Array<any>>;
  getUpcomingReminders(days?: number): Promise<Array<any>>;
  
  // AI Drafts
  getCalendarAiDraft(eventId: string): Promise<any | undefined>;
  createCalendarAiDraft(draft: any): Promise<any>;
  updateCalendarAiDraft(eventId: string, updates: any): Promise<any>;
  deleteCalendarAiDraft(eventId: string): Promise<void>;
  
  // Assignments
  getCalendarAssignments(filters?: {
    eventId?: string;
    userId?: string;
    status?: string;
    role?: string;
  }): Promise<any[]>;
  createCalendarAssignment(assignment: any): Promise<any>;
  updateCalendarAssignment(id: string, updates: any): Promise<any>;
  deleteCalendarAssignment(id: string): Promise<void>;
  completeCalendarAssignment(id: string): Promise<any>;

  // ==========================================
  // English User Data Operations - عمليات بيانات المستخدم الإنجليزية
  // ==========================================
  getEnUserBookmarks(userId: string): Promise<EnArticleWithDetails[]>;
  getEnUserLikedArticles(userId: string): Promise<EnArticleWithDetails[]>;
  getEnUserReadingHistory(userId: string, limit?: number): Promise<EnArticleWithDetails[]>;
  getEnArticleById(id: string, userId?: string): Promise<EnArticleWithDetails | undefined>;

  // ==========================================
  // Urdu Operations - عملیات اردو
  // ==========================================
  
  // Urdu Categories
  getUrCategories(filters?: { status?: string }): Promise<UrCategory[]>;
  getUrCategoryById(id: string): Promise<UrCategory | undefined>;
  getUrCategoryBySlug(slug: string): Promise<UrCategory | undefined>;
  createUrCategory(category: InsertUrCategory): Promise<UrCategory>;
  updateUrCategory(id: string, updates: Partial<InsertUrCategory>): Promise<UrCategory>;
  deleteUrCategory(id: string): Promise<void>;
  
  // Urdu Articles
  getUrArticles(filters?: {
    categoryId?: string;
    status?: string;
    authorId?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  }): Promise<UrArticleWithDetails[]>;
  getUrArticleBySlug(slug: string): Promise<UrArticleWithDetails | undefined>;
  getUrArticleById(id: string): Promise<UrArticleWithDetails | undefined>;
  createUrArticle(article: InsertUrArticle): Promise<UrArticle>;
  updateUrArticle(id: string, updates: Partial<InsertUrArticle>): Promise<UrArticle>;
  deleteUrArticle(id: string): Promise<void>;
  incrementUrArticleViews(id: string): Promise<void>;
  
  // Urdu Comments
  getUrArticleComments(articleId: string): Promise<UrCommentWithUser[]>;
  createUrComment(comment: InsertUrComment): Promise<UrComment>;
  updateUrComment(id: string, updates: Partial<InsertUrComment>): Promise<UrComment>;
  deleteUrComment(id: string): Promise<void>;
  
  // Urdu Reactions
  getUrArticleReactions(articleId: string): Promise<UrReaction[]>;
  getUserUrReaction(articleId: string, userId: string): Promise<UrReaction | undefined>;
  createUrReaction(reaction: InsertUrReaction): Promise<UrReaction>;
  deleteUrReaction(id: string): Promise<void>;
  
  // Urdu Bookmarks
  getUrUserBookmarks(userId: string): Promise<UrArticleWithDetails[]>;
  getUserUrBookmark(articleId: string, userId: string): Promise<UrBookmark | undefined>;
  createUrBookmark(bookmark: InsertUrBookmark): Promise<UrBookmark>;
  deleteUrBookmark(id: string): Promise<void>;
  
  // Urdu Reading History
  getUrUserReadingHistory(userId: string, limit?: number): Promise<UrArticleWithDetails[]>;
  createUrReadingHistory(history: InsertUrReadingHistory): Promise<UrReadingHistory>;
  
  // Urdu Smart Blocks
  getUrSmartBlocks(filters?: { placement?: string; type?: string; isActive?: boolean }): Promise<UrSmartBlock[]>;
  getUrSmartBlockById(id: string): Promise<UrSmartBlock | undefined>;
  createUrSmartBlock(block: InsertUrSmartBlock): Promise<UrSmartBlock>;
  updateUrSmartBlock(id: string, updates: Partial<InsertUrSmartBlock>): Promise<UrSmartBlock>;
  deleteUrSmartBlock(id: string): Promise<void>;
  
  // Urdu Dashboard Statistics
  getUrDashboardStats(): Promise<{
    articles: {
      published: number;
      draft: number;
      archived: number;
      scheduled: number;
      totalViews: number;
    };
    categories: { total: number; active: number };
    recentArticles: Array<any>;
    topArticles: Array<any>;
  }>;
  
  // Data Story operations
  createDataStorySource(source: InsertDataStorySource): Promise<DataStorySource>;
  getDataStorySource(id: string): Promise<DataStorySource | undefined>;
  updateDataStorySource(id: string, data: Partial<InsertDataStorySource>): Promise<DataStorySource>;
  getUserDataStorySources(userId: string, limit?: number): Promise<DataStorySource[]>;
  
  createDataStoryAnalysis(analysis: InsertDataStoryAnalysis): Promise<DataStoryAnalysis>;
  getDataStoryAnalysis(id: string): Promise<DataStoryAnalysis | undefined>;
  updateDataStoryAnalysis(id: string, data: Partial<InsertDataStoryAnalysis>): Promise<DataStoryAnalysis>;
  getAnalysesBySourceId(sourceId: string): Promise<DataStoryAnalysis[]>;
  
  createDataStoryDraft(draft: InsertDataStoryDraft): Promise<DataStoryDraft>;
  getDataStoryDraft(id: string): Promise<DataStoryDraft | undefined>;
  updateDataStoryDraft(id: string, data: Partial<InsertDataStoryDraft>): Promise<DataStoryDraft>;
  getDraftsByAnalysisId(analysisId: string): Promise<DataStoryDraft[]>;
  getUserDataStoryDrafts(userId: string, limit?: number): Promise<DataStoryDraft[]>;
  convertDraftToArticle(draftId: string, articleId: string): Promise<DataStoryDraft>;
  
  getDataStoryWithDetails(sourceId: string): Promise<DataStoryWithDetails | undefined>;
  
  // Short Links operations
  createShortLink(data: InsertShortLink): Promise<ShortLink>;
  getShortLinkByCode(code: string): Promise<ShortLink | undefined>;
  getShortLinkByArticle(articleId: string): Promise<ShortLink | undefined>;
  incrementShortLinkClick(linkId: string, clickData: InsertShortLinkClick): Promise<void>;
  getShortLinkAnalytics(linkId: string, days?: number): Promise<{
    totalClicks: number;
    uniqueUsers: number;
    topSources: Array<{ source: string; count: number }>;
  }>;
  
  // Apple Wallet operations
  getWalletPassByUserAndType(userId: string, passType: 'press' | 'loyalty'): Promise<WalletPass | null>;
  getWalletPassBySerial(serialNumber: string): Promise<WalletPass | null>;
  createWalletPass(data: {
    userId: string;
    passType: 'press' | 'loyalty';
    passTypeIdentifier: string;
    serialNumber: string;
    authenticationToken: string;
  }): Promise<WalletPass>;
  updateWalletPassTimestamp(passId: string): Promise<void>;
  deleteWalletPass(userId: string, passType: 'press' | 'loyalty'): Promise<void>;
  getWalletPassesByUser(userId: string): Promise<WalletPass[]>;
  getDevicesForPass(passId: string): Promise<WalletDevice[]>;
  registerDevice(data: {
    passId: string;
    deviceLibraryIdentifier: string;
    pushToken: string;
  }): Promise<WalletDevice>;
  unregisterDevice(passId: string, deviceLibraryIdentifier: string): Promise<void>;
  getUpdatedPasses(deviceLibraryIdentifier: string, passTypeIdentifier: string, tag?: string): Promise<string[]>;
  
  // User Points/Loyalty for Loyalty Cards
  getUserPointsTotal(userId: string): Promise<UserPointsTotal | null>;
  createUserPointsTotal(userId: string): Promise<UserPointsTotal>;
  updateUserPointsTotal(userId: string, data: {
    totalPoints?: number;
    currentRank?: string;
    rankLevel?: number;
    lifetimePoints?: number;
  }): Promise<UserPointsTotal>;
  triggerLoyaltyPassUpdate(userId: string, reason: string): Promise<void>;
  
  // Press Card Permissions
  updateUserPressCardPermission(userId: string, data: {
    hasPressCard?: boolean;
    jobTitle?: string | null;
    department?: string | null;
    pressIdNumber?: string | null;
    cardValidUntil?: Date | null;
  }): Promise<User>;
  
  // Deep Analysis Operations
  createDeepAnalysis(data: InsertDeepAnalysis): Promise<DeepAnalysis>;
  getDeepAnalysis(id: string): Promise<DeepAnalysis | undefined>;
  updateDeepAnalysis(id: string, data: Partial<DeepAnalysis>): Promise<DeepAnalysis>;
  listDeepAnalyses(params: {
    createdBy?: string;
    status?: string;
    categoryId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ analyses: DeepAnalysis[]; total: number }>;
  deleteDeepAnalysis(id: string): Promise<void>;
  
  // Deep Analysis (Omq) Methods - Phase 2
  getPublishedDeepAnalyses(filters: {
    status?: string;
    keyword?: string;
    category?: string;
    dateRange?: { from: Date; to: Date };
    page?: number;
    limit?: number;
  }): Promise<{ analyses: (DeepAnalysis & { metrics?: any })[]; total: number }>;
  
  getDeepAnalysisMetrics(analysisId: string): Promise<any | null>;
  
  recordDeepAnalysisEvent(event: {
    analysisId: string;
    userId?: string;
    eventType: 'view' | 'share' | 'download' | 'export_pdf' | 'export_docx';
    metadata?: any;
  }): Promise<void>;
  
  getDeepAnalysisStats(): Promise<{
    totalAnalyses: number;
    totalViews: number;
    totalShares: number;
    totalDownloads: number;
    recentAnalyses: any[];
  }>;
  
  // Homepage Statistics
  getHomepageStats(): Promise<HomepageStats>;
  
  // Task Management Operations
  createTask(task: InsertTask): Promise<Task>;
  getTaskById(id: string): Promise<Task | null>;
  getTasks(filters: {
    status?: string;
    priority?: string;
    assignedToId?: string;
    createdById?: string;
    department?: string;
    parentTaskId?: string | null;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }>;
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;
  deleteTask(id: string): Promise<void>;
  getTaskWithDetails(id: string): Promise<Task & {
    createdBy: User;
    assignedTo: User | null;
    subtasks: Subtask[];
    comments: (TaskComment & { user: User })[];
    attachments: TaskAttachment[];
  } | null>;
  
  // Subtask Operations
  createSubtask(subtask: InsertSubtask): Promise<Subtask>;
  getSubtaskById(id: string): Promise<Subtask | null>;
  updateSubtask(id: string, updates: Partial<Subtask>): Promise<Subtask>;
  deleteSubtask(id: string): Promise<void>;
  toggleSubtaskComplete(id: string, completedById: string): Promise<Subtask>;
  
  // Task Comment Operations
  createTaskComment(comment: InsertTaskComment): Promise<TaskComment>;
  getTaskCommentById(id: string): Promise<TaskComment | null>;
  getTaskComments(taskId: string): Promise<(TaskComment & { user: User })[]>;
  deleteTaskComment(id: string): Promise<void>;
  
  // Task Attachment Operations
  createTaskAttachment(attachment: InsertTaskAttachment): Promise<TaskAttachment>;
  getTaskAttachmentById(id: string): Promise<TaskAttachment | null>;
  deleteTaskAttachment(id: string): Promise<void>;
  getTaskAttachments(taskId: string): Promise<TaskAttachment[]>;
  
  // Task Activity Log
  logTaskActivity(entry: {
    taskId: string;
    userId: string;
    action: string;
    changes?: {
      field?: string;
      oldValue?: any;
      newValue?: any;
      description?: string;
    };
  }): Promise<void>;
  getTaskActivity(taskId: string): Promise<(TaskActivityLogEntry & { user: User })[]>;
  
  // Task Statistics
  getTaskStatistics(userId?: string): Promise<{
    total: number;
    todo: number;
    inProgress: number;
    review: number;
    completed: number;
    overdue: number;
  }>;
  
  // Email Agent Operations
  createTrustedSender(sender: InsertTrustedEmailSender, createdBy: string): Promise<TrustedEmailSender>;
  getTrustedSenders(): Promise<TrustedEmailSender[]>;
  getTrustedSenderById(id: string): Promise<TrustedEmailSender | null>;
  getTrustedSenderByEmail(email: string): Promise<TrustedEmailSender | null>;
  updateTrustedSender(id: string, updates: Partial<InsertTrustedEmailSender>): Promise<TrustedEmailSender>;
  deleteTrustedSender(id: string): Promise<void>;
  
  createEmailWebhookLog(log: InsertEmailWebhookLog): Promise<EmailWebhookLog>;
  getEmailWebhookLogs(filters?: {
    status?: string;
    trustedSenderId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: EmailWebhookLog[]; total: number }>;
  getEmailWebhookLogsByDateRange(startDate: Date, endDate: Date): Promise<EmailWebhookLog[]>;
  updateEmailWebhookLog(id: string, updates: Partial<EmailWebhookLog>): Promise<EmailWebhookLog>;
  deleteEmailWebhookLog(id: string): Promise<void>;
  deleteEmailWebhookLogs(ids: string[]): Promise<void>;
  
  getEmailAgentStats(date?: Date): Promise<EmailAgentStats | null>;
  updateEmailAgentStats(date: Date, updates: Partial<EmailAgentStats>): Promise<EmailAgentStats>;
  getEmailLanguageCounts(): Promise<{ ar: number; en: number; ur: number }>;
  
  // WhatsApp Tokens
  createWhatsappToken(token: InsertWhatsappToken): Promise<WhatsappToken>;
  getWhatsappToken(id: string): Promise<WhatsappToken | null>;
  getWhatsappTokenByToken(token: string): Promise<WhatsappToken | null>;
  getWhatsappTokensByUser(userId: string): Promise<WhatsappToken[]>;
  getAllWhatsappTokens(): Promise<WhatsappToken[]>;
  updateWhatsappToken(id: string, updates: Partial<InsertWhatsappToken>): Promise<WhatsappToken | null>;
  updateWhatsappTokenUsage(id: string): Promise<void>;
  deleteWhatsappToken(id: string): Promise<void>;
  
  // WhatsApp Webhook Logs
  createWhatsappWebhookLog(log: InsertWhatsappWebhookLog): Promise<WhatsappWebhookLog>;
  updateWhatsappWebhookLog(id: string, updates: Partial<InsertWhatsappWebhookLog>): Promise<WhatsappWebhookLog | null>;
  getWhatsappWebhookLogs(params: { limit?: number; offset?: number; status?: string }): Promise<{ logs: WhatsappWebhookLog[]; total: number }>;
  getWhatsappWebhookLog(id: string): Promise<WhatsappWebhookLog | null>;
  deleteWhatsappWebhookLog(id: string): Promise<void>;
  bulkDeleteWhatsappWebhookLogs(ids: string[]): Promise<void>;
  
  // Pending WhatsApp Messages (multi-part message aggregation)
  getPendingWhatsappMessage(phoneNumber: string, token: string): Promise<PendingWhatsappMessage | null>;
  getPendingWhatsappMessageById(id: string): Promise<PendingWhatsappMessage | null>;
  createOrUpdatePendingWhatsappMessage(data: {
    phoneNumber: string;
    token: string;
    tokenId?: string;
    userId?: string;
    messagePart: string;
    mediaUrls?: string[];
    aggregationWindowSeconds?: number;
  }): Promise<PendingWhatsappMessage>;
  deletePendingWhatsappMessage(id: string): Promise<void>;
  getExpiredPendingMessages(): Promise<PendingWhatsappMessage[]>;
  markPendingMessageProcessing(id: string): Promise<PendingWhatsappMessage | null>;
  
  // Notifications Operations
  createNotification(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    deeplink?: string;
    metadata?: any;
  }): Promise<any>;
  getNotifications(userId: string, filters?: {
    read?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ notifications: any[]; total: number }>;
  getUnreadNotificationsCount(userId: string): Promise<number>;
  markNotificationAsRead(notificationId: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(notificationId: string): Promise<void>;
  clearAllNotifications(userId: string): Promise<void>;
  
  // Broadcast notification to all staff/admin users
  broadcastNotificationToStaff(data: {
    type: string;
    title: string;
    body: string;
    deeplink?: string;
    metadata?: any;
  }): Promise<void>;
  
  // Newsletter Subscriptions
  createNewsletterSubscription(data: InsertNewsletterSubscription): Promise<NewsletterSubscription>;
  getNewsletterSubscription(email: string): Promise<NewsletterSubscription | null>;
  getAllNewsletterSubscriptions(params?: { 
    status?: string; 
    language?: string;
    limit?: number; 
    offset?: number;
  }): Promise<{ subscriptions: NewsletterSubscription[]; total: number }>;
  updateNewsletterSubscription(id: string, updates: Partial<InsertNewsletterSubscription>): Promise<NewsletterSubscription | null>;
  deleteNewsletterSubscription(id: string): Promise<void>;
  
  // Article Media Assets operations
  createArticleMediaAsset(data: InsertArticleMediaAsset): Promise<ArticleMediaAsset>;
  getArticleMediaAssets(articleId: string, locale?: string): Promise<ArticleMediaAsset[]>;
  getArticleMediaAssetById(id: string): Promise<ArticleMediaAsset | null>;
  updateArticleMediaAsset(id: string, data: UpdateArticleMediaAsset): Promise<ArticleMediaAsset>;
  deleteArticleMediaAsset(id: string): Promise<void>;
  getArticleMediaAssetWithDetails(articleId: string, locale?: string): Promise<Array<ArticleMediaAsset & { mediaFile: MediaFile }>>;
  
  // Article Tags operations
  getArticleTags(articleId: string): Promise<Array<{ id: string; nameAr: string; nameEn: string; slug: string }>>;
  
  // Publisher operations
  getPublisher(id: string): Promise<Publisher | undefined>;
  getPublisherByUserId(userId: string): Promise<Publisher | undefined>;
  createPublisher(publisher: InsertPublisher): Promise<Publisher>;
  updatePublisher(id: string, publisher: UpdatePublisher): Promise<Publisher>;
  getAllPublishers(params: { page?: number; limit?: number; isActive?: boolean }): Promise<{ publishers: Publisher[]; total: number }>;
  
  // Publisher Credits operations
  getPublisherCredits(publisherId: string): Promise<PublisherCredit[]>;
  getActivePublisherCredit(publisherId: string): Promise<PublisherCredit | undefined>;
  getPublisherActiveCredits(publisherId: string): Promise<PublisherCredit[]>;
  getPublisherCreditById(creditId: string): Promise<PublisherCredit | undefined>;
  createPublisherCredit(credit: InsertPublisherCredit & { remainingCredits: number }): Promise<PublisherCredit>;
  updatePublisherCredit(creditId: string, updates: Partial<Pick<PublisherCredit, 'packageName' | 'expiryDate' | 'isActive' | 'notes'>>): Promise<PublisherCredit>;
  // deductPublisherCredit moved to services/publisherCreditService.ts
  // (ADR-001): atomic transaction + retry + reconcile logging.
  deactivateExpiredCredits(): Promise<{ deactivated: number; creditIds: string[] }>;
  getPublisherStats(publisherId: string, period?: { start: Date; end: Date }): Promise<{
    totalArticles: number;
    publishedArticles: number;
    pendingArticles: number;
    rejectedArticles: number;
    remainingCredits: number;
    usedCredits: number;
  }>;
  
  // Publisher Credit Logs
  getPublisherCreditLogs(publisherId: string, page?: number, limit?: number): Promise<{ logs: PublisherCreditLog[]; total: number }>;
  createCreditLog(log: InsertPublisherCreditLog): Promise<PublisherCreditLog>;
  logCreditAction(params: {
    publisherId: string;
    creditPackageId?: string;
    articleId?: string;
    actionType: 'credit_added' | 'credit_used' | 'credit_refunded' | 'credit_expired' | 'credit_adjusted';
    creditsBefore: number;
    creditsChanged: number;
    creditsAfter: number;
    performedBy?: string;
    notes?: string;
  }): Promise<PublisherCreditLog>;
  
  // Publisher Article Operations (with security & transactions)
  getPublisherArticles(publisherId: string, filters?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ articles: ArticleWithDetails[]; total: number }>;
  approvePublisherArticle(articleId: string, publisherId: string, performedBy: string): Promise<Article>;
  updatePublisherArticle(articleId: string, publisherId: string, authorId: string, updates: Partial<InsertArticle>): Promise<Article>;
  
  // ============================================
  // iFox Operations - عمليات آي فوكس
  // ============================================
  
  // iFox Articles Management
  listIFoxArticles(params: {
    categorySlug?: string;
    status?: 'draft' | 'published' | 'scheduled' | 'archived';
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ articles: Article[], total: number }>;
  
  getIFoxArticleStats(): Promise<{
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    scheduled: number;
    total: number;
  }>;
  
  getIFoxArticleMetrics(): Promise<{
    published: number;
    scheduled: number;
    draft: number;
    archived: number;
    total: number;
  }>;
  
  // iFox Settings
  getIFoxSettings(keys?: string[]): Promise<IfoxSettings[]>;
  upsertIFoxSetting(key: string, value: any, description?: string, userId?: string): Promise<IfoxSettings>;
  deleteIFoxSetting(key: string): Promise<void>;
  
  // Category Settings
  getIFoxCategorySettings(categorySlug?: string): Promise<IfoxCategorySettings[]>;
  upsertIFoxCategorySettings(data: InsertIfoxCategorySettings): Promise<IfoxCategorySettings>;
  
  // iFox Media
  createIFoxMedia(data: InsertIfoxMedia): Promise<IfoxMedia>;
  listIFoxMedia(params: {
    type?: string;
    categorySlug?: string;
    page?: number;
    limit?: number;
  }): Promise<{ media: IfoxMedia[], total: number }>;
  deleteIFoxMedia(id: number): Promise<void>;
  
  // iFox Schedule
  createIFoxSchedule(data: InsertIfoxSchedule): Promise<IfoxSchedule>;
  updateIFoxSchedule(id: number, data: Partial<InsertIfoxSchedule>): Promise<IfoxSchedule>;
  listIFoxScheduled(params: {
    status?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<IfoxSchedule[]>;
  deleteIFoxSchedule(id: number): Promise<void>;
  processScheduledPublishing(): Promise<{ published: number; failed: number }>;
  
  // iFox Analytics
  recordIFoxAnalytics(data: InsertIfoxAnalytics[]): Promise<void>;
  getIFoxAnalytics(params: {
    categorySlug?: string;
    fromDate: Date;
    toDate: Date;
    metrics?: string[];
  }): Promise<IfoxAnalytics[]>;
  getIFoxAnalyticsSummary(categorySlug?: string): Promise<{
    totalViews: number;
    totalEngagement: number;
    topCategories: { slug: string; views: number }[];
    trend: 'up' | 'down' | 'stable';
  }>;
  
  // iFox Category Mapping
  getIFoxCategoryMap(): Promise<Record<string, string>>;
  
  // ============================================
  // AI Scheduled Tasks Operations - مهام AI المجدولة
  // ============================================
  
  // Create new AI task
  createAiTask(task: InsertAiScheduledTask): Promise<AiScheduledTask>;
  
  // Get AI task by ID
  getAiTask(id: string): Promise<AiScheduledTask | undefined>;
  
  // List AI tasks with filters
  listAiTasks(params: {
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    page?: number;
    limit?: number;
    categoryId?: string;
    createdBy?: string;
  }): Promise<{ tasks: AiScheduledTask[]; total: number }>;
  
  // Update AI task
  updateAiTask(id: string, updates: Partial<InsertAiScheduledTask>): Promise<AiScheduledTask>;
  
  // Atomically mark task as processing (prevents race conditions)
  markAiTaskProcessing(id: string): Promise<AiScheduledTask | null>;
  
  // Update task status with execution results
  updateAiTaskExecution(id: string, updates: {
    status: 'processing' | 'completed' | 'failed' | 'cancelled';
    executedAt?: Date;
    generatedArticleId?: string;
    generatedImageUrl?: string;
    executionLogs?: any;
    errorMessage?: string;
    executionTimeMs?: number;
    tokensUsed?: number;
    generationCost?: number;
  }, requiredCurrentStatus?: 'pending' | 'processing'): Promise<AiScheduledTask | null>;
  
  // Delete AI task
  deleteAiTask(id: string): Promise<void>;
  
  // Get pending tasks for execution
  getPendingAiTasks(): Promise<AiScheduledTask[]>;
  
  // Get task statistics
  getAiTaskStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalCost: number;
    averageExecutionTime: number;
  }>;
  
  // ============================================
  // iFox AI Management System - Phase 2
  // Comprehensive AI-powered newsroom management
  // ============================================
  
  // 1. AI Preferences & Settings - Central configuration for AI behavior
  createOrUpdateIfoxAiPreferences(data: Partial<InsertIfoxAiPreferences>): Promise<IfoxAiPreferences>;
  getIfoxAiPreferences(): Promise<IfoxAiPreferences | undefined>;
  getActiveIfoxAiPreferences(): Promise<IfoxAiPreferences | undefined>;
  
  // 2. Content Templates Library - Reusable AI content templates
  createIfoxContentTemplate(data: InsertIfoxContentTemplate): Promise<IfoxContentTemplate>;
  listIfoxContentTemplates(filters?: {
    templateType?: string;
    language?: string;
    isActive?: boolean;
    createdBy?: string;
    page?: number;
    limit?: number;
  }): Promise<{ templates: IfoxContentTemplate[]; total: number }>;
  getIfoxContentTemplate(id: string): Promise<IfoxContentTemplate | undefined>;
  updateIfoxContentTemplate(id: string, data: Partial<InsertIfoxContentTemplate>): Promise<IfoxContentTemplate>;
  deleteIfoxContentTemplate(id: string): Promise<void>;
  incrementTemplateUsage(id: string): Promise<IfoxContentTemplate>;
  
  // 3. Automated Workflow Rules - Smart automation rules
  createIfoxWorkflowRule(data: InsertIfoxWorkflowRule): Promise<IfoxWorkflowRule>;
  listIfoxWorkflowRules(filters?: {
    ruleType?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ rules: IfoxWorkflowRule[]; total: number }>;
  getIfoxWorkflowRule(id: string): Promise<IfoxWorkflowRule | undefined>;
  updateIfoxWorkflowRule(id: string, data: Partial<InsertIfoxWorkflowRule>): Promise<IfoxWorkflowRule>;
  deleteIfoxWorkflowRule(id: string): Promise<void>;
  updateIfoxWorkflowRuleExecution(id: string, success: boolean): Promise<IfoxWorkflowRule>;
  
  // 4. Quality Checks - AI-powered quality control logs
  createIfoxQualityCheck(data: InsertIfoxQualityCheck): Promise<IfoxQualityCheck>;
  listIfoxQualityChecks(filters?: {
    articleId?: string;
    taskId?: string;
    passed?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ checks: IfoxQualityCheck[]; total: number }>;
  getIfoxQualityCheck(id: string): Promise<IfoxQualityCheck | undefined>;
  updateIfoxQualityCheckHumanReview(id: string, data: {
    humanReviewStatus: 'pending' | 'approved' | 'rejected';
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<IfoxQualityCheck>;
  
  // 5. Performance Metrics - Track AI content performance
  createOrUpdateIfoxPerformanceMetric(articleId: string, data: Partial<InsertIfoxPerformanceMetric>): Promise<IfoxPerformanceMetric>;
  getIfoxPerformanceMetric(articleId: string): Promise<IfoxPerformanceMetric | undefined>;
  listIfoxPerformanceMetrics(filters?: {
    isAiGenerated?: boolean;
    publishedAtFrom?: Date;
    publishedAtTo?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ metrics: IfoxPerformanceMetric[]; total: number }>;
  getIfoxPerformanceStats(): Promise<{
    totalArticles: number;
    aiGeneratedArticles: number;
    averageViewCount: number;
    averageEngagement: number;
    totalRevenue: number;
    averageROI: number;
  }>;
  
  // Performance metrics from actual articles
  getAiGeneratedArticlesMetrics(filters: {
    publishedAtFrom?: Date;
    publishedAtTo?: Date;
  }): Promise<Array<{
    id: string;
    qualityScore: number | null;
    bookmarkCount: number | null;
    viewCount: number | null;
    shareCount: number | null;
    commentCount: number | null;
  }>>;
  
  // 6. Budget Tracking - Monitor API usage and costs
  createOrUpdateIfoxBudgetTracking(period: string, data: Partial<InsertIfoxBudgetTracking>): Promise<IfoxBudgetTracking>;
  getCurrentPeriodBudget(period: string): Promise<IfoxBudgetTracking | undefined>;
  listIfoxBudgetTracking(filters?: {
    period?: string;
    fromDate?: Date;
    toDate?: Date;
    isOverBudget?: boolean;
  }): Promise<IfoxBudgetTracking[]>;
  updateBudgetUsage(updates: {
    provider: 'openai' | 'anthropic' | 'gemini' | 'visual-ai';
    apiCalls: number;
    tokens?: number;
    cost: number;
  }): Promise<IfoxBudgetTracking>;
  
  // 7. Strategy Insights - AI-powered content strategy recommendations
  createIfoxStrategyInsight(data: InsertIfoxStrategyInsight): Promise<IfoxStrategyInsight>;
  listIfoxStrategyInsights(filters?: {
    insightType?: string;
    status?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }): Promise<{ insights: IfoxStrategyInsight[]; total: number }>;
  getIfoxStrategyInsight(id: string): Promise<IfoxStrategyInsight | undefined>;
  updateIfoxStrategyInsightStatus(id: string, status: string, implementedBy?: string): Promise<IfoxStrategyInsight>;
  deleteIfoxStrategyInsight(id: string): Promise<void>;
  
  // 8. Editorial Calendar - Smart content planning
  createIfoxEditorialCalendarEntry(data: InsertIfoxEditorialCalendar): Promise<IfoxEditorialCalendar>;
  listIfoxEditorialCalendar(filters?: {
    scheduledDateFrom?: Date;
    scheduledDateTo?: Date;
    status?: string;
    assignmentType?: string;
    assignedToUser?: string;
    page?: number;
    limit?: number;
  }): Promise<{ entries: IfoxEditorialCalendar[]; total: number }>;
  getIfoxEditorialCalendarEntry(id: string): Promise<IfoxEditorialCalendar | undefined>;
  updateIfoxEditorialCalendarEntry(id: string, data: Partial<InsertIfoxEditorialCalendar>): Promise<IfoxEditorialCalendar>;
  deleteIfoxEditorialCalendarEntry(id: string): Promise<void>;
  updateIfoxEditorialCalendarStatus(id: string, status: string, articleId?: string): Promise<IfoxEditorialCalendar>;
  
  // Advanced Reader Behavior Analytics
  createReadingSession(data: {
    sessionId: string;
    userId?: string;
    deviceType?: string;
    platform?: string;
    browser?: string;
    screenWidth?: number;
    screenHeight?: number;
    referrerDomain?: string;
    referrerUrl?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    landingPage?: string;
    isNewVisitor?: boolean;
    country?: string;
    city?: string;
    language?: string;
  }): Promise<{ id: string }>;
  
  endReadingSession(sessionId: string, data: {
    exitPage?: string;
    totalDurationMs?: number;
    totalPagesViewed?: number;
    totalArticlesRead?: number;
  }): Promise<void>;
  
  recordSectionAnalytic(data: {
    sessionId?: string;
    articleId: string;
    userId?: string;
    sectionIndex: number;
    sectionType?: string;
    paragraphIndex?: number;
    dwellTimeMs?: number;
    scrollDepthStart?: number;
    scrollDepthEnd?: number;
    visibleTimeMs?: number;
    heatScore?: number;
    wasHighlighted?: boolean;
    wasShared?: boolean;
    interactionCount?: number;
  }): Promise<void>;
  
  recordBatchSectionAnalytics(events: Array<{
    sessionId?: string;
    articleId: string;
    userId?: string;
    sectionIndex: number;
    sectionType?: string;
    paragraphIndex?: number;
    dwellTimeMs?: number;
    scrollDepthStart?: number;
    scrollDepthEnd?: number;
    visibleTimeMs?: number;
    heatScore?: number;
    wasHighlighted?: boolean;
    wasShared?: boolean;
    interactionCount?: number;
  }>): Promise<void>;
  
  recordNavigationPath(data: {
    sessionId: string;
    userId?: string;
    fromPageType?: string;
    fromPageId?: string;
    fromArticleId?: string;
    fromCategoryId?: string;
    toPageType: string;
    toPageId?: string;
    toArticleId?: string;
    toCategoryId?: string;
    transitionType?: string;
    dwellTimeOnFromMs?: number;
    scrollDepthOnFrom?: number;
  }): Promise<void>;
  
  recordTrafficSource(data: {
    sessionId: string;
    sourceType: string;
    sourceMedium?: string;
    sourceChannel?: string;
    referrerDomain?: string;
    referrerPath?: string;
    searchKeyword?: string;
    socialPlatform?: string;
    campaignName?: string;
    campaignSource?: string;
    articleId?: string;
  }): Promise<void>;
  
  getAdvancedAnalyticsOverview(range: string): Promise<{
    sessions: {
      total: number;
      uniqueUsers: number;
      newVisitors: number;
      returningVisitors: number;
      avgDuration: number;
      avgPagesPerSession: number;
    };
    engagement: {
      avgScrollDepth: number;
      avgTimeOnPage: number;
      bounceRate: number;
      completionRate: number;
    };
    topArticles: Array<{
      articleId: string;
      title: string;
      views: number;
      avgTimeOnPage: number;
      engagementScore: number;
    }>;
    topCategories: Array<{
      categoryId: string;
      name: string;
      views: number;
      avgEngagement: number;
    }>;
  }>;
  
  getArticleHeatmap(articleId: string): Promise<Array<{
    sectionIndex: number;
    avgDwellTime: number;
    avgScrollDepth: number;
    heatScore: number;
    viewCount: number;
  }>>;
  
  getNavigationPaths(range: string, limit: number): Promise<Array<{
    fromPage: string;
    toPage: string;
    count: number;
    avgDwellTime: number;
  }>>;
  
  getTrafficSourcesAnalytics(range: string): Promise<{
    byType: Array<{ type: string; count: number; percentage: number }>;
    bySocial: Array<{ platform: string; count: number; percentage: number }>;
    byReferrer: Array<{ domain: string; count: number; percentage: number }>;
  }>;
  
  getPeakHoursAnalytics(range: string): Promise<{
    hourly: Array<{ hour: number; count: number; avgEngagement: number }>;
    daily: Array<{ day: string; count: number; avgEngagement: number }>;
  }>;
  
  getRealTimeMetrics(): Promise<{
    activeUsers: number;
    currentPageViews: number;
    topCurrentArticles: Array<{ articleId: string; title: string; viewers: number }>;
    recentEvents: Array<{ type: string; count: number; trend: number }>;
  }>;
  
  getTopEngagementScores(limit: number, sortBy: string): Promise<Array<{
    articleId: string;
    title: string;
    overallScore: number;
    engagementRate: number;
    avgTimeOnPage: number;
    avgScrollDepth: number;
    uniqueVisitors: number;
  }>>;
  
  getCategoryAnalytics(range: string): Promise<Array<{
    categoryId: string;
    name: string;
    articleCount: number;
    totalViews: number;
    avgEngagement: number;
    topArticle: string | null;
  }>>;
  
  getDeviceAnalytics(range: string): Promise<{
    byDevice: Array<{ device: string; count: number; percentage: number }>;
    byPlatform: Array<{ platform: string; count: number; percentage: number }>;
    byBrowser: Array<{ browser: string; count: number; percentage: number }>;
  }>;
  
  getArticleEngagementDetails(articleId: string): Promise<{
    score: number | null;
    metrics: {
      avgTimeOnPage: number;
      avgScrollDepth: number;
      bounceRate: number;
      shareCount: number;
      commentCount: number;
      reactionCount: number;
      bookmarkCount: number;
      uniqueVisitors: number;
      returningVisitors: number;
    };
    peakHour: number | null;
    topReferrer: string | null;
    topDevice: string | null;
  }>;
  
  calculateArticleEngagementScore(articleId: string): Promise<void>;
  calculateAllEngagementScores(): Promise<void>;
  
  // Opinion Author Applications - طلبات كتّاب الرأي
  createOpinionAuthorApplication(data: InsertOpinionAuthorApplication): Promise<OpinionAuthorApplication>;
  getOpinionAuthorApplications(status?: string, page?: number, limit?: number): Promise<{applications: OpinionAuthorApplicationWithDetails[], total: number}>;
  getOpinionAuthorApplicationById(id: string): Promise<OpinionAuthorApplicationWithDetails | undefined>;
  approveOpinionAuthorApplication(id: string, reviewerId: string, notes?: string): Promise<{application: OpinionAuthorApplication, user: User, temporaryPassword: string}>;
  rejectOpinionAuthorApplication(id: string, reviewerId: string, reason: string): Promise<OpinionAuthorApplication>;
  
  // Employee Email Templates
  getAllEmailTemplates(): Promise<EmployeeEmailTemplate[]>;
  getEmailTemplate(type: string): Promise<EmployeeEmailTemplate | undefined>;
  upsertEmailTemplate(type: string, data: UpdateEmployeeEmailTemplate & { nameAr?: string; subject?: string; bodyHtml?: string; bodyText?: string }): Promise<EmployeeEmailTemplate>;
  
  // Contact Message Replies
  createContactMessageReply(data: InsertContactMessageReply): Promise<ContactMessageReply>;
  getContactMessageReplies(messageId: string): Promise<Array<ContactMessageReply & { user: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null }>>;
  updateContactMessageReply(id: string, replyText: string): Promise<ContactMessageReply>;
  deleteContactMessageReply(id: string): Promise<void>;
  getContactMessageWithReplies(id: string): Promise<(ContactMessage & { replies: Array<ContactMessageReply & { user: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null }> }) | undefined>;
  
  // World Days CRUD
  getAllWorldDays(filters?: { category?: string; isActive?: boolean; month?: number }): Promise<WorldDay[]>;
  getWorldDayById(id: string): Promise<WorldDay | undefined>;
  getUpcomingWorldDays(days: number): Promise<(WorldDay & { nextOccurrence: Date; daysUntil: number })[]>;
  getWorldDayBySourceUid(sourceUid: string): Promise<WorldDay | undefined>;
  createWorldDay(data: InsertWorldDay): Promise<WorldDay>;
  updateWorldDay(id: string, data: Partial<InsertWorldDay>): Promise<WorldDay | undefined>;
  deleteWorldDay(id: string): Promise<boolean>;
  bulkCreateWorldDays(data: InsertWorldDay[]): Promise<WorldDay[]>;
  
  // World Day Reminders
  getWorldDayReminders(worldDayId: string): Promise<WorldDayReminder[]>;
  getPendingReminders(): Promise<WorldDayReminder[]>;
  createWorldDayReminder(data: InsertWorldDayReminder): Promise<WorldDayReminder>;
  updateWorldDayReminderStatus(id: string, status: string, sentAt?: Date, errorMessage?: string): Promise<void>;
  
  // World Day Suggestions
  getWorldDaySuggestions(worldDayId: string): Promise<WorldDaySuggestion[]>;
  createWorldDaySuggestion(data: InsertWorldDaySuggestion): Promise<WorldDaySuggestion>;
  updateWorldDaySuggestionStatus(id: string, status: string, acceptedBy?: string): Promise<void>;
  
  // Breaking Ticker operations
  getActiveBreakingTicker(): Promise<{ topic: BreakingTickerTopic; headlines: BreakingTickerHeadline[] } | null>;
  getAllBreakingTickerTopics(): Promise<BreakingTickerTopic[]>;
  getBreakingTickerTopic(id: string): Promise<BreakingTickerTopic | undefined>;
  getBreakingTickerHeadlines(topicId: string): Promise<BreakingTickerHeadline[]>;
  createBreakingTickerTopic(data: InsertBreakingTickerTopic): Promise<BreakingTickerTopic>;
  updateBreakingTickerTopic(id: string, data: Partial<InsertBreakingTickerTopic>): Promise<BreakingTickerTopic>;
  deleteBreakingTickerTopic(id: string): Promise<void>;
  createBreakingTickerHeadline(data: InsertBreakingTickerHeadline): Promise<BreakingTickerHeadline>;
  updateBreakingTickerHeadline(id: string, data: Partial<InsertBreakingTickerHeadline>): Promise<BreakingTickerHeadline>;
  deleteBreakingTickerHeadline(id: string): Promise<void>;
  activateBreakingTickerTopic(id: string): Promise<BreakingTickerTopic>;
  deactivateBreakingTickerTopic(id: string): Promise<BreakingTickerTopic>;
}

async function getIfoxCategoryIds(): Promise<string[]> {
  const cacheKey = 'ifox_category_ids';
  const cached = memoryCache.get<string[]>(cacheKey);
  if (cached) return cached;
  
  const ifoxCategories = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isIfoxCategory, true));
  
  const ids = ifoxCategories.map(c => c.id);
  memoryCache.set(cacheKey, ids, CACHE_TTL.MEDIUM);
  return ids;
}

function reporterPublicSelect(reporterAlias: any) {
  return {
    id: reporterAlias.id,
    firstName: reporterAlias.firstName,
    lastName: reporterAlias.lastName,
    profileImageUrl: reporterAlias.profileImageUrl,
    bio: reporterAlias.bio,
  };
}

export class DatabaseStorage implements IStorage {
  // In-memory cache for iFox category mapping
  private ifoxCategoryMapCache: Record<string, string> | null = null;
  private ifoxCategoryMapCacheTime: number = 0;
  private readonly CATEGORY_MAP_CACHE_TTL = 1000 * 60 * 60; // 1 hour

  // @deprecated Use getUserPublicProfile() for display or getUserForAuth() for login
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserPublicProfile(id: string): Promise<Partial<User> | undefined> {
    const [user] = await db.select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      profileImageUrl: users.profileImageUrl,
      phoneNumber: users.phoneNumber,
      bio: users.bio,
    }).from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserForAuth(identifier: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(or(eq(users.email, identifier.toLowerCase()), eq(users.id, identifier)))
      .limit(1);
    return user;
  }

  async upsertUser(userData: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        id: userData.id,
        email: userData.email || "",
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email || "",
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
        },
      })
      .returning();
    return user;
  }

  async updateUser(id: string, userData: UpdateUser): Promise<User> {
    const updateData: any = {};

    if (userData.firstName !== undefined) updateData.firstName = userData.firstName;
    if (userData.lastName !== undefined) updateData.lastName = userData.lastName;
    if (userData.firstNameEn !== undefined) updateData.firstNameEn = userData.firstNameEn;
    if (userData.lastNameEn !== undefined) updateData.lastNameEn = userData.lastNameEn;
    if (userData.bio !== undefined) updateData.bio = userData.bio;
    if (userData.phoneNumber !== undefined) updateData.phoneNumber = userData.phoneNumber;
    if (userData.profileImageUrl !== undefined) updateData.profileImageUrl = userData.profileImageUrl;
    if (userData.preferredVariant !== undefined) updateData.preferredVariant = userData.preferredVariant;
    // Honor an explicit isProfileComplete (e.g. POST /api/auth/complete-profile
    // sends ONLY this flag). Without mapping it the whole payload was dropped
    // and Drizzle threw "No values to set" on .set({}).
    if (userData.isProfileComplete !== undefined) updateData.isProfileComplete = userData.isProfileComplete;

    // Convenience: الاسم الأول كافٍ لاعتبار الملف مكتملًا (حسابات الجوال
    // كانت تُترك بلا اسم لأننا كنّا نشترط الاسمين معًا).
    const nextFirst = (userData.firstName ?? "").trim();
    if (nextFirst.length >= 2) {
      updateData.isProfileComplete = true;
    } else if (userData.firstName && userData.lastName) {
      updateData.isProfileComplete = true;
    }

    // Guard the empty-update case: Drizzle's .set({}) throws "No values to set".
    // Nothing to change → return the current row unchanged instead of crashing.
    if (Object.keys(updateData).length === 0) {
      const [current] = await db.select().from(users).where(eq(users.id, id));
      return current;
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    return user;
  }

  async updateUserActivity(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        lastActivityAt: new Date(),
        loggedOutAt: null // Clear logout timestamp when user is active
      })
      .where(eq(users.id, userId));
  }

  async getOrCreateSystemUser(): Promise<User> {
    const SYSTEM_EMAIL = "system@sabq.sa";
    const SYSTEM_ID = "email-agent-system";
    
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, SYSTEM_EMAIL));
    
    if (existingUser) {
      return existingUser;
    }
    
    console.log("[Storage] Creating Email Agent System User...");
    
    const [newUser] = await db
      .insert(users)
      .values({
        id: SYSTEM_ID,
        email: SYSTEM_EMAIL,
        firstName: "Email Agent",
        lastName: "System",
        role: "reporter",
        status: "active",
        emailVerified: true,
        isProfileComplete: true,
        allowedLanguages: ["ar", "en", "ur"],
        authProvider: "local",
      })
      .returning();
    
    console.log("[Storage] Email Agent System User created:", newUser.id);
    return newUser;
  }

  async getOrCreateReporterUser(email: string, name: string): Promise<User> {
    console.log("[Storage] 👤 Getting or creating reporter user:", email);
    
    // Try to find existing user by email
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    
    if (existingUser) {
      console.log("[Storage] ✅ Reporter user already exists:", existingUser.id);
      return existingUser;
    }
    
    console.log("[Storage] 📝 Creating new reporter user:", email);
    
    // Parse name into first and last name (with safe fallback)
    const safeName = (name || "Reporter").trim() || "Reporter";
    const nameParts = safeName.split(/\s+/);
    const firstName = nameParts[0] || "Reporter";
    const lastName = nameParts.slice(1).join(' ') || firstName;
    
    // Create new user as reporter
    const userId = nanoid();
    const [newUser] = await db
      .insert(users)
      .values({
        id: userId,
        email,
        firstName,
        lastName,
        role: "reporter",
        status: "active",
        emailVerified: true,
        isProfileComplete: true,
        allowedLanguages: ["ar", "en", "ur"],
        authProvider: "local",
      })
      .returning();
    
    console.log("[Storage] ✅ Reporter user created successfully:", newUser.id);
    return newUser;
  }

  // Admin user management operations
  async getUsersWithStats(params: {
    page?: number;
    limit?: number;
    status?: string;
    role?: string;
    verificationBadge?: string;
    emailVerified?: boolean;
    searchQuery?: string;
    hasRejectedComments?: boolean;
    activityDays?: number;
  }): Promise<{
    users: (User & {
      commentCount: number;
      articleCount: number;
      totalPoints: number;
    })[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      status,
      role,
      verificationBadge,
      emailVerified,
      searchQuery,
      hasRejectedComments,
      activityDays,
    } = params;

    const conditions = [];

    // Filter by status
    if (status) {
      conditions.push(eq(users.status, status));
    }

    // Filter by role
    if (role) {
      conditions.push(eq(users.role, role));
    }

    // Filter by verification badge
    if (verificationBadge) {
      conditions.push(eq(users.verificationBadge, verificationBadge));
    }

    // Filter by email verified
    if (emailVerified !== undefined) {
      conditions.push(eq(users.emailVerified, emailVerified));
    }

    // Filter by activity
    if (activityDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - activityDays);
      conditions.push(gte(users.lastActivityAt, cutoffDate));
    }

    // Exclude soft-deleted users
    conditions.push(isNull(users.deletedAt));

    // Search query
    if (searchQuery) {
      const searchPattern = `%${searchQuery}%`;
      conditions.push(
        or(
          ilike(users.email, searchPattern),
          ilike(users.firstName, searchPattern),
          ilike(users.lastName, searchPattern),
          ilike(users.phoneNumber, searchPattern)
        )
      );
    }

    // Count total
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = Number(countResult?.count || 0);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Get users with stats
    const userResults = await db
      .select({
        user: users,
        commentCount: sql<number>`count(distinct ${comments.id})`,
        articleCount: sql<number>`count(distinct ${articles.id})`,
        totalPoints: sql<number>`coalesce(${userPointsTotal.totalPoints}, 0)`,
      })
      .from(users)
      .leftJoin(comments, eq(comments.userId, users.id))
      .leftJoin(articles, eq(articles.authorId, users.id))
      .leftJoin(userPointsTotal, eq(userPointsTotal.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(users.id)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    const usersWithStats = userResults.map((r) => ({
      ...r.user,
      commentCount: Number(r.commentCount),
      articleCount: Number(r.articleCount),
      totalPoints: Number(r.totalPoints),
    }));

    return {
      users: usersWithStats,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getUserKPIs(): Promise<{
    total: number;
    emailVerified: number;
    unverified: number;
    withPhone: number;
    suspended: number;
    banned: number;
    newToday: number;
    newThisWeek: number;
    active24h: number;
    trends: {
      emailVerifiedTrend: number;
      unverifiedTrend: number;
      withPhoneTrend: number;
      suspendedTrend: number;
      bannedTrend: number;
      newUsersTrend: number;
      activeUsersTrend: number;
    };
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const hasPhone = sql`${users.phoneNumber} is not null and btrim(${users.phoneNumber}) <> ''`;
    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        emailVerified: sql<number>`count(*) filter (where ${users.emailVerified} = true)`,
        unverified: sql<number>`count(*) filter (where ${users.emailVerified} = false)`,
        withPhone: sql<number>`count(*) filter (where ${hasPhone})`,
        suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')`,
        banned: sql<number>`count(*) filter (where ${users.status} = 'banned')`,
        newToday: sql<number>`count(*) filter (where ${users.createdAt} >= ${today})`,
        newThisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= ${weekAgo})`,
        active24h: sql<number>`count(*) filter (where ${users.lastActivityAt} >= ${yesterday})`,
        withPhoneThisWeek: sql<number>`count(*) filter (where ${hasPhone} and ${users.createdAt} >= ${weekAgo})`,
      })
      .from(users)
      .where(isNull(users.deletedAt));
    const [prevWeekStats] = await db
      .select({
        emailVerified: sql<number>`count(*) filter (where ${users.emailVerified} = true)`,
        unverified: sql<number>`count(*) filter (where ${users.emailVerified} = false)`,
        withPhone: sql<number>`count(*) filter (where ${hasPhone} and ${users.createdAt} >= ${twoWeeksAgo} and ${users.createdAt} < ${weekAgo})`,
        suspended: sql<number>`count(*) filter (where ${users.status} = 'suspended')`,
        banned: sql<number>`count(*) filter (where ${users.status} = 'banned')`,
        newUsers: sql<number>`count(*) filter (where ${users.createdAt} >= ${twoWeeksAgo} and ${users.createdAt} < ${weekAgo})`,
        activeUsers: sql<number>`count(*) filter (where ${users.lastActivityAt} >= ${twoWeeksAgo} and ${users.lastActivityAt} < ${weekAgo})`,
      })
      .from(users)
      .where(isNull(users.deletedAt));
    const calculateTrend = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    return {
      total: Number(stats.total),
      emailVerified: Number(stats.emailVerified),
      unverified: Number(stats.unverified),
      withPhone: Number(stats.withPhone),
      suspended: Number(stats.suspended),
      banned: Number(stats.banned),
      newToday: Number(stats.newToday),
      newThisWeek: Number(stats.newThisWeek),
      active24h: Number(stats.active24h),
      trends: {
        emailVerifiedTrend: calculateTrend(Number(stats.emailVerified), Number(prevWeekStats.emailVerified)),
        unverifiedTrend: calculateTrend(Number(stats.unverified), Number(prevWeekStats.unverified)),
        withPhoneTrend: calculateTrend(Number(stats.withPhoneThisWeek), Number(prevWeekStats.withPhone)),
        suspendedTrend: calculateTrend(Number(stats.suspended), Number(prevWeekStats.suspended)),
        bannedTrend: calculateTrend(Number(stats.banned), Number(prevWeekStats.banned)),
        newUsersTrend: calculateTrend(Number(stats.newThisWeek), Number(prevWeekStats.newUsers)),
        activeUsersTrend: calculateTrend(Number(stats.active24h), Number(prevWeekStats.activeUsers)),
      },
    };
  }

  async suspendUser(userId: string, reason: string, duration?: number): Promise<User> {
    const suspendedUntil = duration
      ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
      : null;

    const [user] = await db
      .update(users)
      .set({
        status: 'suspended',
        suspendedUntil,
        suspensionReason: reason,
        bannedUntil: null,
        banReason: null,
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async unsuspendUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        status: 'active',
        suspendedUntil: null,
        suspensionReason: null,
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async banUser(userId: string, reason: string, isPermanent: boolean, duration?: number): Promise<User> {
    const bannedUntil = isPermanent || !duration
      ? null
      : new Date(Date.now() + duration * 24 * 60 * 60 * 1000);

    const [user] = await db
      .update(users)
      .set({
        status: 'banned',
        bannedUntil,
        banReason: reason,
        suspendedUntil: null,
        suspensionReason: null,
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async unbanUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        status: 'active',
        bannedUntil: null,
        banReason: null,
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async updateUserRole(userId: string, role: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async updateVerificationBadge(userId: string, badge: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ verificationBadge: badge })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async softDeleteUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        deletedAt: new Date(),
        status: 'deleted',
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async restoreUser(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        deletedAt: null,
        status: 'active',
        suspendedUntil: null,
        suspensionReason: null,
        bannedUntil: null,
        banReason: null,
      })
      .where(eq(users.id, userId))
      .returning();

    return user;
  }

  async getUserDeletionPreview(userId: string): Promise<{
    canDelete: boolean;
    blockers: string[];
    counts: {
      tokens: number;
      socialFollows: number;
      reactions: number;
      bookmarks: number;
      readingHistory: number;
      notifications: number;
      notificationQueue: number;
      comments: number;
      articlesAsAuthor: number;
      articlesAsReporter: number;
      publishedArticles: number;
      staffRecords: number;
      userEvents: number;
      behaviorLogs: number;
      userPreferences: number;
      userInterests: number;
      userLoyaltyEvents: number;
      userPointsTotal: number;
      userRewardsHistory: number;
      storyFollows: number;
      experimentExposures: number;
      experimentConversions: number;
      audioNewsletterListens: number;
      walletPasses: number;
      dismissedContinueReading: number;
      accessibilityEvents: number;
      announcementDismissals: number;
    };
    userStatus: string;
    isBanned: boolean;
  }> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    const blockers: string[] = [];
    const isBanned = user.status === 'banned';

    // Check if user is banned (requirement for deletion)
    if (!isBanned) {
      blockers.push('User must be banned before permanent deletion');
    }

    // Count all related data
    const [
      passwordTokensCount,
      emailTokensCount,
      socialFollowsCount,
      reactionsCount,
      bookmarksCount,
      readingHistoryCount,
      notificationsCount,
      notificationQueueCount,
      commentsCount,
      articlesAsAuthorCount,
      articlesAsReporterCount,
      publishedArticlesCount,
      staffRecordsCount,
      userEventsCount,
      behaviorLogsCount,
      userPreferencesCount,
      userInterestsCount,
      userLoyaltyEventsCount,
      userPointsTotalCount,
      userRewardsHistoryCount,
      storyFollowsCount,
      experimentExposuresCount,
      experimentConversionsCount,
      audioNewsletterListensCount,
      walletPassesCount,
      dismissedContinueReadingCount,
      accessibilityEventsCount,
      announcementDismissalsCount,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(socialFollows).where(or(eq(socialFollows.followerId, userId), eq(socialFollows.followingId, userId))),
      db.select({ count: sql<number>`count(*)::int` }).from(reactions).where(eq(reactions.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(bookmarks).where(eq(bookmarks.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(readingHistory).where(eq(readingHistory.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(notificationsInbox).where(eq(notificationsInbox.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(notificationQueue).where(eq(notificationQueue.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(comments).where(eq(comments.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(articles).where(eq(articles.authorId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(articles).where(eq(articles.reporterId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(articles).where(and(eq(articles.authorId, userId), eq(articles.status, 'published'))),
      db.select({ count: sql<number>`count(*)::int` }).from(staff).where(eq(staff.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(userEvents).where(eq(userEvents.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(behaviorLogs).where(eq(behaviorLogs.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(userPreferences).where(eq(userPreferences.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(userInterests).where(eq(userInterests.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(userLoyaltyEvents).where(eq(userLoyaltyEvents.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(userPointsTotal).where(eq(userPointsTotal.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(userRewardsHistory).where(eq(userRewardsHistory.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(storyFollows).where(eq(storyFollows.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(experimentExposures).where(eq(experimentExposures.userId, userId)),
      // experimentConversions doesn't have userId column, count through exposures
      db.select({ count: sql<number>`count(*)::int` })
        .from(experimentConversions)
        .innerJoin(experimentExposures, eq(experimentConversions.exposureId, experimentExposures.id))
        .where(eq(experimentExposures.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(audioNewsletterListens).where(eq(audioNewsletterListens.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(walletPasses).where(eq(walletPasses.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(dismissedContinueReading).where(eq(dismissedContinueReading.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(accessibilityEvents).where(eq(accessibilityEvents.userId, userId)),
      db.select({ count: sql<number>`count(*)::int` }).from(announcementDismissals).where(eq(announcementDismissals.userId, userId)),
    ]);

    const publishedCount = publishedArticlesCount[0]?.count ?? 0;
    if (publishedCount > 0) {
      blockers.push(`User has ${publishedCount} published article(s) that would be anonymized`);
    }

    const counts = {
      tokens: (passwordTokensCount[0]?.count ?? 0) + (emailTokensCount[0]?.count ?? 0),
      socialFollows: socialFollowsCount[0]?.count ?? 0,
      reactions: reactionsCount[0]?.count ?? 0,
      bookmarks: bookmarksCount[0]?.count ?? 0,
      readingHistory: readingHistoryCount[0]?.count ?? 0,
      notifications: notificationsCount[0]?.count ?? 0,
      notificationQueue: notificationQueueCount[0]?.count ?? 0,
      comments: commentsCount[0]?.count ?? 0,
      articlesAsAuthor: articlesAsAuthorCount[0]?.count ?? 0,
      articlesAsReporter: articlesAsReporterCount[0]?.count ?? 0,
      publishedArticles: publishedCount,
      staffRecords: staffRecordsCount[0]?.count ?? 0,
      userEvents: userEventsCount[0]?.count ?? 0,
      behaviorLogs: behaviorLogsCount[0]?.count ?? 0,
      userPreferences: userPreferencesCount[0]?.count ?? 0,
      userInterests: userInterestsCount[0]?.count ?? 0,
      userLoyaltyEvents: userLoyaltyEventsCount[0]?.count ?? 0,
      userPointsTotal: userPointsTotalCount[0]?.count ?? 0,
      userRewardsHistory: userRewardsHistoryCount[0]?.count ?? 0,
      storyFollows: storyFollowsCount[0]?.count ?? 0,
      experimentExposures: experimentExposuresCount[0]?.count ?? 0,
      experimentConversions: experimentConversionsCount[0]?.count ?? 0,
      audioNewsletterListens: audioNewsletterListensCount[0]?.count ?? 0,
      walletPasses: walletPassesCount[0]?.count ?? 0,
      dismissedContinueReading: dismissedContinueReadingCount[0]?.count ?? 0,
      accessibilityEvents: accessibilityEventsCount[0]?.count ?? 0,
      announcementDismissals: announcementDismissalsCount[0]?.count ?? 0,
    };

    return {
      canDelete: blockers.length === 0,
      blockers,
      counts,
      userStatus: user.status ?? 'unknown',
      isBanned,
    };
  }

  async deleteUserPermanently(userId: string): Promise<{
    success: boolean;
    deletedCounts: {
      tokens: number;
      socialFollows: number;
      reactions: number;
      bookmarks: number;
      readingHistory: number;
      notifications: number;
      notificationQueue: number;
      comments: number;
      articlesReassigned: number;
      staffUpdated: number;
      userEvents: number;
      behaviorLogs: number;
      userPreferences: number;
      userInterests: number;
      userLoyaltyEvents: number;
      userPointsTotal: number;
      userRewardsHistory: number;
      storyFollows: number;
      experimentExposures: number;
      experimentConversions: number;
      audioNewsletterListens: number;
      walletPasses: number;
      dismissedContinueReading: number;
      accessibilityEvents: number;
      announcementDismissals: number;
    };
  }> {
    const deletedCounts = {
      tokens: 0,
      socialFollows: 0,
      reactions: 0,
      bookmarks: 0,
      readingHistory: 0,
      notifications: 0,
      notificationQueue: 0,
      comments: 0,
      articlesReassigned: 0,
      staffUpdated: 0,
      userEvents: 0,
      behaviorLogs: 0,
      userPreferences: 0,
      userInterests: 0,
      userLoyaltyEvents: 0,
      userPointsTotal: 0,
      userRewardsHistory: 0,
      storyFollows: 0,
      experimentExposures: 0,
      experimentConversions: 0,
      audioNewsletterListens: 0,
      walletPasses: 0,
      dismissedContinueReading: 0,
      accessibilityEvents: 0,
      announcementDismissals: 0,
    };

    try {
      await db.transaction(async (tx) => {
        // 1. Delete password reset tokens
        const deletedPasswordTokens = await tx
          .delete(passwordResetTokens)
          .where(eq(passwordResetTokens.userId, userId))
          .returning();
        deletedCounts.tokens += deletedPasswordTokens.length;

        // 2. Delete email verification tokens
        const deletedEmailTokens = await tx
          .delete(emailVerificationTokens)
          .where(eq(emailVerificationTokens.userId, userId))
          .returning();
        deletedCounts.tokens += deletedEmailTokens.length;

        // 3. Delete social follows (both as follower and following)
        const deletedFollows = await tx
          .delete(socialFollows)
          .where(
            or(
              eq(socialFollows.followerId, userId),
              eq(socialFollows.followingId, userId)
            )
          )
          .returning();
        deletedCounts.socialFollows = deletedFollows.length;

        // 4. Delete reactions
        const deletedReactions = await tx
          .delete(reactions)
          .where(eq(reactions.userId, userId))
          .returning();
        deletedCounts.reactions = deletedReactions.length;

        // 5. Delete bookmarks
        const deletedBookmarks = await tx
          .delete(bookmarks)
          .where(eq(bookmarks.userId, userId))
          .returning();
        deletedCounts.bookmarks = deletedBookmarks.length;

        // 6. Delete reading history
        const deletedHistory = await tx
          .delete(readingHistory)
          .where(eq(readingHistory.userId, userId))
          .returning();
        deletedCounts.readingHistory = deletedHistory.length;

        // 7. Delete notifications inbox
        const deletedNotifications = await tx
          .delete(notificationsInbox)
          .where(eq(notificationsInbox.userId, userId))
          .returning();
        deletedCounts.notifications = deletedNotifications.length;

        // 8. Delete notification queue
        const deletedNotificationQueue = await tx
          .delete(notificationQueue)
          .where(eq(notificationQueue.userId, userId))
          .returning();
        deletedCounts.notificationQueue = deletedNotificationQueue.length;

        // 9. Delete user events
        const deletedUserEvents = await tx
          .delete(userEvents)
          .where(eq(userEvents.userId, userId))
          .returning();
        deletedCounts.userEvents = deletedUserEvents.length;

        // 10. Delete behavior logs
        const deletedBehaviorLogs = await tx
          .delete(behaviorLogs)
          .where(eq(behaviorLogs.userId, userId))
          .returning();
        deletedCounts.behaviorLogs = deletedBehaviorLogs.length;

        // 11. Delete user preferences
        const deletedUserPreferences = await tx
          .delete(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .returning();
        deletedCounts.userPreferences = deletedUserPreferences.length;

        // 12. Delete user interests
        const deletedUserInterests = await tx
          .delete(userInterests)
          .where(eq(userInterests.userId, userId))
          .returning();
        deletedCounts.userInterests = deletedUserInterests.length;

        // 13. Delete user loyalty events
        const deletedLoyaltyEvents = await tx
          .delete(userLoyaltyEvents)
          .where(eq(userLoyaltyEvents.userId, userId))
          .returning();
        deletedCounts.userLoyaltyEvents = deletedLoyaltyEvents.length;

        // 14. Delete user points total
        const deletedPointsTotal = await tx
          .delete(userPointsTotal)
          .where(eq(userPointsTotal.userId, userId))
          .returning();
        deletedCounts.userPointsTotal = deletedPointsTotal.length;

        // 15. Delete user rewards history
        const deletedRewardsHistory = await tx
          .delete(userRewardsHistory)
          .where(eq(userRewardsHistory.userId, userId))
          .returning();
        deletedCounts.userRewardsHistory = deletedRewardsHistory.length;

        // 16. Delete story follows
        const deletedStoryFollows = await tx
          .delete(storyFollows)
          .where(eq(storyFollows.userId, userId))
          .returning();
        deletedCounts.storyFollows = deletedStoryFollows.length;

        // 17. Delete experiment conversions first (they reference exposures via foreign key)
        // experimentConversions doesn't have userId column, delete through exposures
        const userExposureIds = await tx
          .select({ id: experimentExposures.id })
          .from(experimentExposures)
          .where(eq(experimentExposures.userId, userId));
        const exposureIdsList = userExposureIds.map(e => e.id);
        let deletedConversionsCount = 0;
        if (exposureIdsList.length > 0) {
          const deletedExperimentConversions = await tx
            .delete(experimentConversions)
            .where(sql`${experimentConversions.exposureId} IN (${sql.join(exposureIdsList.map(id => sql`${id}`), sql`,`)})`)
            .returning();
          deletedConversionsCount = deletedExperimentConversions.length;
        }
        deletedCounts.experimentConversions = deletedConversionsCount;

        // 18. Delete experiment exposures
        const deletedExperimentExposures = await tx
          .delete(experimentExposures)
          .where(eq(experimentExposures.userId, userId))
          .returning();
        deletedCounts.experimentExposures = deletedExperimentExposures.length;

        // 19. Delete audio newsletter listens
        const deletedAudioListens = await tx
          .delete(audioNewsletterListens)
          .where(eq(audioNewsletterListens.userId, userId))
          .returning();
        deletedCounts.audioNewsletterListens = deletedAudioListens.length;

        // 20. Delete wallet passes
        const deletedWalletPasses = await tx
          .delete(walletPasses)
          .where(eq(walletPasses.userId, userId))
          .returning();
        deletedCounts.walletPasses = deletedWalletPasses.length;

        // 21. Delete dismissed continue reading
        const deletedDismissed = await tx
          .delete(dismissedContinueReading)
          .where(eq(dismissedContinueReading.userId, userId))
          .returning();
        deletedCounts.dismissedContinueReading = deletedDismissed.length;

        // 22. Delete accessibility events
        const deletedAccessibilityEvents = await tx
          .delete(accessibilityEvents)
          .where(eq(accessibilityEvents.userId, userId))
          .returning();
        deletedCounts.accessibilityEvents = deletedAccessibilityEvents.length;

        // 23. Delete announcement dismissals
        const deletedAnnouncementDismissals = await tx
          .delete(announcementDismissals)
          .where(eq(announcementDismissals.userId, userId))
          .returning();
        deletedCounts.announcementDismissals = deletedAnnouncementDismissals.length;

        // 24. Set userId to null for comments (preserve content, anonymize author)
        const updatedComments = await tx
          .update(comments)
          .set({ userId: null } as any)
          .where(eq(comments.userId, userId))
          .returning();
        deletedCounts.comments = updatedComments.length;

        // 25. Reassign articles to صحيفة سبق instead of anonymizing
        const updatedArticlesAuthor = await tx
          .update(articles)
          .set({ authorId: 'RnP7eDOAl5T5rGpib9_8d' })
          .where(eq(articles.authorId, userId))
          .returning();
        const updatedArticlesReporter = await tx
          .update(articles)
          .set({ reporterId: 'RnP7eDOAl5T5rGpib9_8d' })
          .where(eq(articles.reporterId, userId))
          .returning();
        deletedCounts.articlesReassigned = updatedArticlesAuthor.length + updatedArticlesReporter.length;

        // 25b. Reassign English articles to صحيفة سبق
        const updatedEnArticlesAuthor = await tx
          .update(enArticles)
          .set({ authorId: 'RnP7eDOAl5T5rGpib9_8d' })
          .where(eq(enArticles.authorId, userId))
          .returning();
        const updatedEnArticlesReporter = await tx
          .update(enArticles)
          .set({ reporterId: 'RnP7eDOAl5T5rGpib9_8d' })
          .where(eq(enArticles.reporterId, userId))
          .returning();
        deletedCounts.articlesReassigned += updatedEnArticlesAuthor.length + updatedEnArticlesReporter.length;

        // 25c. Reassign Urdu articles to صحيفة سبق
        const updatedUrArticlesAuthor = await tx
          .update(urArticles)
          .set({ authorId: 'RnP7eDOAl5T5rGpib9_8d' })
          .where(eq(urArticles.authorId, userId))
          .returning();
        const updatedUrArticlesReporter = await tx
          .update(urArticles)
          .set({ reporterId: 'RnP7eDOAl5T5rGpib9_8d' })
          .where(eq(urArticles.reporterId, userId))
          .returning();
        deletedCounts.articlesReassigned += updatedUrArticlesAuthor.length + updatedUrArticlesReporter.length;

        // 26. Update staff records - set userId to null
        const updatedStaff = await tx
          .update(staff)
          .set({ userId: null })
          .where(eq(staff.userId, userId))
          .returning();
        deletedCounts.staffUpdated = updatedStaff.length;

        // 27. Delete user roles
        await tx
          .delete(userRoles)
          .where(eq(userRoles.userId, userId));

        // 28. Delete user permission overrides
        await tx
          .delete(userPermissionOverrides)
          .where(eq(userPermissionOverrides.userId, userId));

        // 29. Finally delete the user
        await tx
          .delete(users)
          .where(eq(users.id, userId));
      });

      console.log(`[PERMANENT DELETE] User ${userId} permanently deleted with counts:`, deletedCounts);
      return { success: true, deletedCounts };
    } catch (error) {
      console.error(`[PERMANENT DELETE] Failed to delete user ${userId}:`, error);
      throw error;
    }
  }

  async bulkSuspendUsers(userIds: string[], reason: string, duration?: number): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        await this.suspendUser(userId, reason, duration);
        success++;
      } catch (error) {
        console.error(`Failed to suspend user ${userId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  async bulkBanUsers(userIds: string[], reason: string, isPermanent: boolean, duration?: number): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        await this.banUser(userId, reason, isPermanent, duration);
        success++;
      } catch (error) {
        console.error(`Failed to ban user ${userId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  async bulkUpdateUserRole(userIds: string[], role: string): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        await this.updateUserRole(userId, role);
        success++;
      } catch (error) {
        console.error(`Failed to update role for user ${userId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  // RBAC operations (Role-Based Access Control)
  async createUserWithRoles(userData: {
    email: string;
    firstName: string;
    lastName: string;
    firstNameEn?: string;
    lastNameEn?: string;
    phoneNumber?: string;
    profileImageUrl?: string | null;
    roleIds: string[];
    status?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  }, createdBy: string): Promise<{ user: User; temporaryPassword: string }> {
    const userId = nanoid();
    // توليد كلمة مرور عشوائية فريدة لكل مستخدم
    const randomPassword = `Temp${nanoid(12)}@${new Date().getFullYear()}`;
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    const user = await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        id: userId,
        email: userData.email.trim().toLowerCase(),
        passwordHash,
        firstName: userData.firstName.trim(),
        lastName: userData.lastName.trim(),
        firstNameEn: userData.firstNameEn?.trim() || null,
        lastNameEn: userData.lastNameEn?.trim() || null,
        phoneNumber: userData.phoneNumber?.trim() || null,
        profileImageUrl: userData.profileImageUrl || null,
        status: userData.status || 'active',
        emailVerified: userData.emailVerified || false,
        phoneVerified: userData.phoneVerified || false,
        role: 'reader',
        isProfileComplete: true,
        mustChangePassword: true, // Require password change on first login
      }).returning();

      if (userData.roleIds && userData.roleIds.length > 0) {
        await tx.insert(userRoles).values(
          [...new Set(userData.roleIds)].map(roleId => ({
            id: nanoid(),
            userId,
            roleId,
            assignedBy: createdBy,
          }))
        );
      }

      await tx.insert(activityLogs).values({
        id: nanoid(),
        userId: createdBy,
        action: 'user_created',
        entityType: 'user',
        entityId: userId,
        newValue: {
          email: userData.email.trim().toLowerCase(),
          firstName: userData.firstName.trim(),
          lastName: userData.lastName.trim(),
          roleIds: userData.roleIds,
        },
      });

      return user;
    });

    return { user, temporaryPassword: randomPassword };
  }

  /** lookup مستخدم بالإيميل (case-insensitive) — لـ pre-check ومعالجة race. */
  async getUserByEmailBasic(email: string): Promise<{ id: string; email: string; firstName: string | null; lastName: string | null; status: string; role: string } | undefined> {
    const [u] = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, status: users.status, role: users.role })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    return u;
  }

  async getUserRoles(userId: string): Promise<Array<{ id: string; name: string; nameAr: string }>> {
    const results = await db
      .select({
        id: roles.id,
        name: roles.name,
        nameAr: roles.nameAr,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    return results;
  }

  async updateUserRoles(userId: string, roleIds: string[], updatedBy: string, reason?: string): Promise<void> {
    await db.transaction(async (tx) => {
      const oldRoles = await tx
        .select({
          id: roles.id,
          name: roles.name,
        })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(eq(userRoles.userId, userId));

      await tx.delete(userRoles).where(eq(userRoles.userId, userId));

      if (roleIds && roleIds.length > 0) {
        await tx.insert(userRoles).values(
          roleIds.map(roleId => ({
            id: nanoid(),
            userId,
            roleId,
          }))
        );
      }

      const newRoles = await tx
        .select({
          id: roles.id,
          name: roles.name,
        })
        .from(roles)
        .where(inArray(roles.id, roleIds));

      await tx.insert(activityLogs).values({
        id: nanoid(),
        userId: updatedBy,
        action: 'roles_updated',
        entityType: 'user',
        entityId: userId,
        oldValue: {
          roleIds: oldRoles.map(r => r.id),
          roleNames: oldRoles.map(r => r.name),
        },
        newValue: {
          roleIds: newRoles.map(r => r.id),
          roleNames: newRoles.map(r => r.name),
        },
        metadata: reason ? { reason } : undefined,
      });
    });
  }

  async getAllRoles(): Promise<Array<{ id: string; name: string; nameAr: string; description: string | null; isSystem: boolean }>> {
    return await db
      .select({
        id: roles.id,
        name: roles.name,
        nameAr: roles.nameAr,
        description: roles.description,
        isSystem: roles.isSystem,
      })
      .from(roles)
      .orderBy(roles.nameAr);
  }

  async getRolePermissions(roleId: string): Promise<Array<{ code: string; label: string; labelAr: string; module: string }>> {
    const results = await db
      .select({
        code: permissions.code,
        label: permissions.label,
        labelAr: permissions.labelAr,
        module: permissions.module,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    return results;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const results = await db
      .select({
        code: permissions.code,
      })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(userRoles.roleId, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(userRoles.userId, userId))
      .groupBy(permissions.code);

    return results.map(r => r.code);
  }

  async logActivity(activity: {
    userId?: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: Record<string, any>;
    newValue?: Record<string, any>;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await db.insert(activityLogs).values({
      id: nanoid(),
      userId: activity.userId,
      action: activity.action,
      entityType: activity.entityType,
      entityId: activity.entityId,
      oldValue: activity.oldValue,
      newValue: activity.newValue,
      metadata: activity.metadata,
    });
  }

  // Category operations
  async getAllCategories(options?: { excludeIfox?: boolean }): Promise<Category[]> {
    if (options?.excludeIfox) {
      return await db.select().from(categories)
        .where(eq(categories.isIfoxCategory, false))
        .orderBy(categories.displayOrder)
        .limit(200);
    }
    return await db.select().from(categories).orderBy(categories.displayOrder).limit(200);
  }

  async getCategoriesWithStats(): Promise<Array<CategoryWithStats>> {
    const result = await db.execute(sql`
      WITH reaction_counts AS (
        SELECT article_id, count(*) AS total_likes
        FROM reactions
        GROUP BY article_id
      ),
      bookmark_counts AS (
        SELECT article_id, count(*) AS total_bookmarks
        FROM bookmarks
        GROUP BY article_id
      ),
      article_stats AS (
        SELECT
          a.category_id,
          count(*) AS article_count,
          COALESCE(sum(a.views), 0) AS total_views,
          COALESCE(sum(rc.total_likes), 0) AS total_likes,
          COALESCE(sum(bc.total_bookmarks), 0) AS total_bookmarks,
          count(*) FILTER (
            WHERE a.published_at >= NOW() - INTERVAL '24 hours'
          ) AS last_24h,
          count(*) FILTER (
            WHERE a.published_at >= NOW() - INTERVAL '7 days'
          ) AS last_7d
        FROM articles a
        LEFT JOIN reaction_counts rc ON rc.article_id = a.id
        LEFT JOIN bookmark_counts bc ON bc.article_id = a.id
        WHERE a.status = 'published'
        GROUP BY a.category_id
      )
      SELECT c.*,
        COALESCE(s.article_count, 0)::int AS "articleCount",
        COALESCE(s.total_views, 0)::int AS "totalViews",
        COALESCE(s.total_likes, 0)::int AS "totalLikes",
        COALESCE(s.total_bookmarks, 0)::int AS "totalBookmarks",
        COALESCE(s.last_24h, 0)::int AS "last24h",
        COALESCE(s.last_7d, 0)::int AS "last7d"
      FROM categories c
      LEFT JOIN article_stats s ON s.category_id = c.id
      ORDER BY c.display_order, c.name_ar
    `);

    const rows: any[] = (result as any).rows || result;
    return rows.map((r: any) => {
      const last24h: number = Number(r.last24h) || 0;
      const last7d: number = Number(r.last7d) || 0;
      const dailyAvg = last7d / 7;

      let pulsePercent: number | null = null;
      let pulseLevel: 'calm' | 'normal' | 'active' | 'hot' = 'calm';
      let hasPulseData = false;

      if (last7d >= 3 && dailyAvg > 0) {
        const raw = (last24h / dailyAvg) * 100;
        pulsePercent = Math.min(150, Math.round(raw));
        hasPulseData = true;
        if (pulsePercent >= 120) pulseLevel = 'hot';
        else if (pulsePercent >= 80) pulseLevel = 'active';
        else if (pulsePercent >= 40) pulseLevel = 'normal';
        else pulseLevel = 'calm';
      }

      return {
        id: r.id,
        nameAr: r.name_ar,
        nameEn: r.name_en,
        slug: r.slug,
        englishSlug: r.english_slug,
        description: r.description,
        color: r.color,
        icon: r.icon,
        heroImageUrl: r.hero_image_url,
        displayOrder: r.display_order,
        status: r.status,
        type: r.type,
        isIfoxCategory: r.is_ifox_category,
        autoActivate: r.auto_activate,
        parentId: r.parent_id,
        createdAt: r.created_at ? new Date(r.created_at) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at) : null,
        articleCount: r.articleCount,
        totalViews: r.totalViews,
        totalLikes: r.totalLikes,
        totalBookmarks: r.totalBookmarks,
        pulsePercent,
        pulseLevel,
        hasPulseData,
      };
    }) as unknown as CategoryWithStats[];
  }

  async getCategoryById(id: string): Promise<Category | undefined> {
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    return category;
  }

  async createCategory(category: InsertCategory): Promise<Category> {
    const [created] = await db.insert(categories).values([category]).returning();
    return created;
  }

  async updateCategory(id: string, categoryData: Partial<InsertCategory>): Promise<Category> {
    const [updated] = await db
      .update(categories)
      .set({ ...categoryData, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return updated;
  }

  async deleteCategory(id: string): Promise<void> {
    await db.delete(categories).where(eq(categories.id, id));
  }

  // Article operations
  
  async getArticles(filters?: {
    categoryId?: string;
    status?: string;
    authorId?: string;
    searchQuery?: string;
    userRole?: string;
    includeAI?: boolean; // New parameter to explicitly include AI articles
    limit?: number;
    orderBy?: string;
  }): Promise<ArticleWithDetails[]> {
    // Security: Check authorization BEFORE applying status filter
    const isAuthorized = filters?.userRole === 'system_admin' || 
                        filters?.userRole === 'admin' || 
                        filters?.userRole === 'editor';

    // CRITICAL SECURITY: Prevent unauthorized access to archived articles
    if (filters?.status === 'archived' && !isAuthorized) {
      console.warn(`[SECURITY] Unauthorized attempt to access archived articles - UserRole: ${filters.userRole || 'unauthenticated'}`);
      return []; // Early return: no results for unauthorized archived requests
    }

    const conditions: (SQL<unknown> | undefined)[] = [];

    if (filters?.categoryId) {
      conditions.push(eq(articles.categoryId, filters.categoryId));
    }

    if (filters?.status) {
      conditions.push(eq(articles.status, filters.status));
    } else {
      // Default to published articles only
      conditions.push(eq(articles.status, "published"));
    }

    if (filters?.authorId) {
      conditions.push(eq(articles.authorId, filters.authorId));
    }

    if (filters?.searchQuery) {
      const searchPattern = `%${filters.searchQuery}%`;
      conditions.push(
        or(
          // Matches idx_articles_title_trgm (GIN on lower(title)) for
          // published searches while preserving case-insensitive semantics.
          sql`lower(${articles.title}) LIKE lower(${searchPattern})`,
          ilike(articles.excerpt, searchPattern),
        )
      );
    }

    // Exclude opinion articles from regular news feeds
    conditions.push(
      or(
        isNull(articles.articleType),
        ne(articles.articleType, 'opinion')
      )
    );

    // IMPORTANT: Exclude AI/iFox articles from regular news feed unless explicitly requested
    if (!filters?.includeAI) {
      const ifoxCategoryIds = await getIfoxCategoryIds();
      
      if (ifoxCategoryIds.length > 0) {
        conditions.push(
          or(
            isNull(articles.categoryId),
            not(inArray(articles.categoryId, ifoxCategoryIds))
          )
        );
      }
    }

    const reporterAlias = aliasedTable(users, 'reporter');

    // ملاحظة انحدار 2026-07-25: كان هذا الاستعلام ملفوفًا بـwithStatementTimeout،
    // وهي معاملة صريحة (BEGIN/SET LOCAL/COMMIT). على نقطة Neon `-pooler` يعمل
    // PgBouncer في وضع transaction pooling، فالمعاملة تُثبّت اتصال خادم طوال
    // مدتها بينما الاستعلام المفرد يحرره فور انتهائه. لفّ أسخن استعلام في
    // التطبيق بمعاملة خفّض التوازي الفعلي عند الـpooler وأنتج موجة
    // «timeout exceeded when trying to connect». سقف زمن الاستعلام يُضبط الآن
    // على مستوى الدور في Neon (ALTER ROLE ... SET statement_timeout) فيسري بلا
    // معاملة ولا اتصال إضافي. لا تُعِد لفّ هذا المسار.
    const results = await db
      .select({
        article: articleListSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: {
          id: reporterAlias.id,
          firstName: reporterAlias.firstName,
          lastName: reporterAlias.lastName,
          profileImageUrl: reporterAlias.profileImageUrl,
          bio: reporterAlias.bio,
        },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      // «إنعاش»: COALESCE يقدّم الخبر المُنعش دون تغيير تاريخ نشره الظاهر
      .orderBy(desc(articles.displayOrder), desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`), desc(articles.createdAt))
      .limit(filters?.limit || 500);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getArticleBySlug(slug: string, userId?: string, userRole?: string): Promise<ArticleWithDetails | undefined> {
    // OPTIMIZED: Single query with inline subqueries to reduce from 5 DB connections to 1
    // This significantly improves performance on Neon serverless (~4s -> ~800ms)
    
    const userIdParam = userId || null;
    
    const results = await db.execute(sql`
      SELECT 
        a.*,
        -- Category fields
        c.id as category_id,
        c.name_ar as category_name,
        c.name_en as category_name_en,
        c.slug as category_slug,
        c.color as category_color,
        c.icon as category_icon,
        c.description as category_description,
        c.status as category_status,
        c.display_order as category_display_order,
        c.is_ifox_category as category_is_ifox_category,
        -- Author (users) fields (narrow: no password/email/secrets)
        u.id as author_id,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        u.profile_image_url as author_profile_image_url,
        u.bio as author_bio,
        u.gender as author_gender,
        -- Reporter (users) fields (narrow: no password/email/secrets)
        r.id as reporter_id,
        r.first_name as reporter_first_name,
        r.last_name as reporter_last_name,
        r.profile_image_url as reporter_profile_image_url,
        r.bio as reporter_bio,
        r.gender as reporter_gender,
        -- Staff member fields (for author)
        s.id as staff_id,
        s.name_ar as staff_name_ar,
        s.slug as staff_slug,
        s.profile_image as staff_profile_image,
        s.is_verified as staff_is_verified,
        s.bio_ar as staff_bio_ar,
        -- Reporter staff member fields
        rs.id as reporter_staff_id,
        rs.name_ar as reporter_staff_name_ar,
        rs.slug as reporter_staff_slug,
        rs.profile_image as reporter_staff_profile_image,
        rs.is_verified as reporter_staff_is_verified,
        rs.bio_ar as reporter_staff_bio_ar,
        -- Publisher fields
        p.id as publisher_id_ref,
        p.agency_name as publisher_agency_name,
        p.agency_name_en as publisher_agency_name_en,
        p.logo_url as publisher_logo_url,
        -- Inline counts (avoid separate queries)
        (SELECT COUNT(*)::int FROM reactions WHERE article_id = a.id) as reactions_count,
        (SELECT COUNT(*)::int FROM comments WHERE article_id = a.id) as comments_count,
        -- User-specific flags (use CASE to handle null userId)
        CASE 
          WHEN ${userIdParam}::text IS NULL THEN false
          ELSE EXISTS(SELECT 1 FROM bookmarks WHERE article_id = a.id AND user_id = ${userIdParam})
        END as is_bookmarked,
        CASE 
          WHEN ${userIdParam}::text IS NULL THEN false
          ELSE EXISTS(SELECT 1 FROM reactions WHERE article_id = a.id AND user_id = ${userIdParam})
        END as has_reacted
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN users r ON a.reporter_id = r.id
      LEFT JOIN staff s ON s.user_id = u.id
      LEFT JOIN staff rs ON rs.user_id = r.id
      LEFT JOIN publishers p ON a.publisher_id = p.id
      WHERE a.slug = ${slug} OR a.english_slug = ${slug}
      LIMIT 1
    `);

    if (results.rows.length === 0) return undefined;

    const row = results.rows[0] as any;

    // Security: Prevent access to archived articles for non-admin/editor users
    if (row.status === 'archived') {
      const isAuthorized = userRole === 'system_admin' || userRole === 'admin' || userRole === 'editor';
      if (!isAuthorized) {
        // الوصول المرفوض من زائر غير مسجّل سلوكٌ طبيعي (روابط قديمة/زواحف)
        // وكان يملأ السجلّات بضجيج بلا قيمة. نُسجّل فقط محاولات المستخدمين
        // المسجّلين غير المصرّح لهم لأنها الإشارة الأمنية الفعلية.
        if (userId) {
          console.warn(`[SECURITY] Archived article access denied - Article: ${row.slug}, UserRole: ${userRole || 'unknown'}, UserId: ${userId}`);
        }
        return undefined;
      }
    }

    // Reconstruct article object with proper camelCase
    const article = {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      content: row.content,
      excerpt: row.excerpt,
      slug: row.slug,
      englishSlug: row.english_slug,
      imageUrl: row.image_url,
      thumbnailUrl: row.thumbnail_url,
      imageSizes: row.image_sizes,
      videoUrl: row.video_url,
      audioUrl: row.audio_url,
      categoryId: row.category_id,
      authorId: row.author_id,
      reporterId: row.reporter_id,
      status: row.status,
      views: row.views,
      displayOrder: row.display_order,
      isBreaking: row.is_breaking,
      isFeatured: row.is_featured,
      isEditorPick: row.is_editor_pick,
      isDeepDive: row.is_deep_dive,
      readingTime: row.reading_time,
      articleType: row.article_type,
      language: row.language,
      tags: row.tags,
      keywords: row.keywords,
      metaTitle: row.meta_title,
      metaDescription: row.meta_description,
      socialTitle: row.social_title,
      socialDescription: row.social_description,
      createdAt: row.created_at ? new Date(row.created_at + 'Z').toISOString() : null,
      updatedAt: row.updated_at ? new Date(row.updated_at + 'Z').toISOString() : null,
      publishedAt: row.published_at ? new Date(row.published_at + 'Z').toISOString() : null,
      scheduledAt: row.scheduled_at ? new Date(row.scheduled_at + 'Z').toISOString() : null,
      archivedAt: row.archived_at ? new Date(row.archived_at + 'Z').toISOString() : null,
      archivedBy: row.archived_by,
      seo: row.seo,
      seoContent: row.seo_content,
      seoMetadata: row.seo_metadata,
      aiGenerated: row.ai_generated,
      aiBullets: row.ai_bullets,
      aiBulletsGeneratedAt: row.ai_bullets_generated_at ? new Date(row.ai_bullets_generated_at + 'Z').toISOString() : null,
      aiProvider: row.ai_provider,
      aiModel: row.ai_model,
      aiPrompt: row.ai_prompt,
      aiMetadata: row.ai_metadata,
      sourceUrl: row.source_url,
      sourceName: row.source_name,
      imageCaption: row.image_caption,
      imageSource: row.image_source,
      relatedArticleIds: row.related_article_ids,
      location: row.location,
      locationCoordinates: row.location_coordinates,
      importanceScore: row.importance_score,
      sentimentScore: row.sentiment_score,
      factCheckStatus: row.fact_check_status,
      factCheckNotes: row.fact_check_notes,
      factCheckDate: row.fact_check_date,
      factCheckedBy: row.fact_checked_by,
      newsType: row.news_type,
      isAiGeneratedImage: row.is_ai_generated_image,
      aiImageModel: row.ai_image_model,
      isAiGeneratedThumbnail: row.is_ai_generated_thumbnail,
      imageFocalPoint: row.image_focal_point,
      aiSummary: row.ai_summary,
      isVideoTemplate: row.is_video_template,
      videoThumbnailUrl: row.video_thumbnail_url,
      infographicType: row.infographic_type,
      infographicData: row.infographic_data,
      shortCode: row.short_code,
      weeklyPhotosData: row.weekly_photos_data,
      albumImages: row.album_images,
    };

    // Reconstruct category object
    const category = row.category_id ? {
      id: row.category_id,
      nameAr: row.category_name,
      nameEn: row.category_name_en,
      slug: row.category_slug,
      color: row.category_color,
      icon: row.category_icon,
      description: row.category_description,
      status: row.category_status,
      displayOrder: row.category_display_order,
      isIfoxCategory: row.category_is_ifox_category,
    } : undefined;

    // Reconstruct author object (narrow: no password/email/secrets)
    const author = row.author_id ? {
      id: row.author_id,
      firstName: row.author_first_name,
      lastName: row.author_last_name,
      profileImageUrl: row.author_profile_image_url,
      bio: row.author_bio,
      gender: row.author_gender,
    } : undefined;

    // Reconstruct reporter object (narrow: no password/email/secrets)
    const reporter = row.reporter_id ? {
      id: row.reporter_id,
      firstName: row.reporter_first_name,
      lastName: row.reporter_last_name,
      profileImageUrl: row.reporter_profile_image_url,
      bio: row.reporter_bio,
      gender: row.reporter_gender,
    } : undefined;

    // Reconstruct staff member object
    const staffMember = row.staff_id ? {
      id: row.staff_id,
      nameAr: row.staff_name_ar,
      slug: row.staff_slug,
      profileImage: row.staff_profile_image,
      isVerified: row.staff_is_verified,
      bioAr: row.staff_bio_ar,
    } : undefined;

    // Reconstruct reporter staff member object
    const reporterStaffMember = row.reporter_staff_id ? {
      id: row.reporter_staff_id,
      nameAr: row.reporter_staff_name_ar,
      slug: row.reporter_staff_slug,
      profileImage: row.reporter_staff_profile_image,
      isVerified: row.reporter_staff_is_verified,
      bioAr: row.reporter_staff_bio_ar,
    } : undefined;

    // Reconstruct publisher object
    const publisher = row.publisher_id_ref ? {
      id: row.publisher_id_ref,
      agencyName: row.publisher_agency_name,
      agencyNameEn: row.publisher_agency_name_en,
      logoUrl: row.publisher_logo_url,
    } : undefined;

    return {
      ...article,
      category,
      author: article.articleType === 'opinion' ? (author || undefined) : (reporter || author || undefined),
      opinionAuthor: article.articleType === 'opinion' ? author : undefined,
      staff: article.articleType === 'opinion' ? (staffMember?.id ? staffMember : undefined) : (reporterStaffMember?.id ? reporterStaffMember : (!reporter && staffMember?.id ? staffMember : undefined)),
      publisher,
      isBookmarked: Boolean(row.is_bookmarked),
      hasReacted: Boolean(row.has_reacted),
      reactionsCount: Number(row.reactions_count) || 0,
      commentsCount: Number(row.comments_count) || 0,
    } as unknown as ArticleWithDetails;
  }

  async getArticleById(id: string, userId?: string): Promise<ArticleWithDetails | undefined> {
    const reporterAlias = aliasedTable(users, 'reporter');
    const reporterStaffAlias = aliasedTable(staff, 'reporterStaff');
    
    const results = await db
      .select({
        article: articles,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
        staffMember: {
          id: staff.id,
          nameAr: staff.nameAr,
          slug: staff.slug,
          profileImage: staff.profileImage,
          isVerified: staff.isVerified,
          bioAr: staff.bioAr,
        },
        reporterStaffMember: {
          id: reporterStaffAlias.id,
          nameAr: reporterStaffAlias.nameAr,
          slug: reporterStaffAlias.slug,
          profileImage: reporterStaffAlias.profileImage,
          isVerified: reporterStaffAlias.isVerified,
          bioAr: reporterStaffAlias.bioAr,
        },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .leftJoin(staff, eq(staff.userId, users.id))
      .leftJoin(reporterStaffAlias, eq(reporterStaffAlias.userId, reporterAlias.id))
      .where(eq(articles.id, id));

    if (results.length === 0) return undefined;

    const result = results[0];
    const article = result.article;

    // Run all queries in parallel for better performance
    const [
      bookmarkResult,
      reactionResult,
      reactionsCountResult,
      commentsCountResult
    ] = await Promise.all([
      userId ? db.select().from(bookmarks)
        .where(and(eq(bookmarks.articleId, article.id), eq(bookmarks.userId, userId)))
        .limit(1) : Promise.resolve([]),
      userId ? db.select().from(reactions)
        .where(and(eq(reactions.articleId, article.id), eq(reactions.userId, userId)))
        .limit(1) : Promise.resolve([]),
      db.select({ count: sql<number>`count(*)` })
        .from(reactions)
        .where(eq(reactions.articleId, article.id)),
      db.select({ count: sql<number>`count(*)` })
        .from(comments)
        .where(eq(comments.articleId, article.id))
    ]);

    const isBookmarked = bookmarkResult.length > 0;
    const hasReacted = reactionResult.length > 0;
    const reactionsCount = Number(reactionsCountResult[0].count);
    const commentsCount = Number(commentsCountResult[0].count);

    return {
      ...article,
      category: result.category || undefined,
      author: result.reporter || result.author || undefined,
      opinionAuthor: article.articleType === 'opinion' ? result.author : undefined,
      staff: result.reporterStaffMember?.id ? result.reporterStaffMember : (!result.reporter && result.staffMember?.id ? result.staffMember : undefined),
      isBookmarked,
      hasReacted,
      reactionsCount,
      commentsCount,
    } as unknown as ArticleWithDetails;
  }

  async createArticle(article: InsertArticle): Promise<Article> {
    // Auto-generate short englishSlug if not provided
    const articleWithSlug = {
      ...article,
      englishSlug: article.englishSlug || generateEnglishSlug(),
    };

    // Auto-link publisher-agency articles: any author with
    // users.linkedPublisherId gets their articles stamped with the agency.
    // (Replaces the old hardcoded contentManagerPublisherMap that only knew
    // أحمد بديوي; the legacy pair is kept as a fallback until the manual
    // linked_publisher_id backfill runs in production.)
    const authorId = (article as any).authorId as string | undefined;
    if (authorId && !(articleWithSlug as any).publisherId) {
      let linkedPublisherId: string | null = null;
      try {
        const [author] = await db
          .select({ linkedPublisherId: users.linkedPublisherId })
          .from(users)
          .where(eq(users.id, authorId))
          .limit(1);
        linkedPublisherId = author?.linkedPublisherId ?? null;
      } catch (err) {
        console.error('[Publisher] linkedPublisherId lookup failed:', err);
      }
      if (!linkedPublisherId && authorId === 'DI1H7gaTfZ5mr765EhQNW') {
        linkedPublisherId = '948fdde0-97b0-44ac-872d-639337ebcafa'; // أحمد بديوي -> شركة عنوان الإعلام
      }
      // مالك الوكالة (publishers.userId) قد لا يحمل linkedPublisherId —
      // نختم مواده أيضاً حتى تُنسب للوكالة من المحرر الأساسي
      if (!linkedPublisherId) {
        try {
          const [owned] = await db
            .select({ id: publishers.id })
            .from(publishers)
            .where(eq(publishers.userId, authorId))
            .limit(1);
          linkedPublisherId = owned?.id ?? null;
        } catch (err) {
          console.error('[Publisher] owner publisher lookup failed:', err);
        }
      }
      if (linkedPublisherId) {
        (articleWithSlug as any).publisherId = linkedPublisherId;
        (articleWithSlug as any).isPublisherNews = true;
      }
    }

    // Pre-fill ai_image flag from media_files if the chosen image URL
    // matches an AI-generated media row. The dashboard's nano-banana
    // flow only flags the media_files row, not the article row, so
    // without this step every fresh article ships with
    // is_ai_generated_image=false even when the cover image clearly
    // came from the AI generator. iOS uses this flag to overlay the
    // "ذكاء اصطناعي" badge on the hero image.
    await this.applyAiImageFlagFromMedia(articleWithSlug);

    const [created] = await db.insert(articles).values([articleWithSlug as any]).returning();
    return created;
  }

  async updateArticle(id: string, articleData: Partial<InsertArticle>): Promise<Article> {
    const updateData: any = { ...articleData, updatedAt: new Date() };
    if (updateData.imageFocalPoint === null || updateData.imageFocalPoint === undefined) {
      delete updateData.imageFocalPoint;
    }
    // Same sync as createArticle — pick up the AI flag from the
    // matching media_files row whenever the cover image changes.
    await this.applyAiImageFlagFromMedia(updateData);
    const [updated] = await db
      .update(articles)
      .set(updateData)
      .where(eq(articles.id, id))
      .returning();
    return updated;
  }

  /// Mutates `data` in-place: when `data.imageUrl` matches a
  /// media_files row whose `is_ai_generated` is true and the caller
  /// hasn't already set `isAiGeneratedImage`, copy the AI metadata
  /// (model + prompt) onto the article. No-op when the URL doesn't
  /// resolve to a known media row or when the caller already provided
  /// an explicit value.
  private async applyAiImageFlagFromMedia(data: any): Promise<void> {
    if (data?.isAiGeneratedImage === true) return; // caller already set it
    const url = data?.imageUrl;
    if (typeof url !== 'string' || url.length === 0) return;
    try {
      const [media] = await db
        .select({
          isAi: mediaFiles.isAiGenerated,
          model: mediaFiles.aiGenerationModel,
          prompt: mediaFiles.aiGenerationPrompt,
        })
        .from(mediaFiles)
        .where(eq(mediaFiles.url, url))
        .limit(1);
      if (media?.isAi) {
        data.isAiGeneratedImage = true;
        if (!data.aiImageModel && media.model) data.aiImageModel = media.model;
        if (!data.aiImagePrompt && media.prompt) data.aiImagePrompt = media.prompt;
      }
    } catch (err) {
      // Best-effort — never block the actual write because of a sync
      // lookup failure. The article saves with the original payload.
      console.warn('[storage] applyAiImageFlagFromMedia failed:', err);
    }
  }

  async deleteArticle(id: string): Promise<void> {
    await db.delete(articles).where(eq(articles.id, id));
  }

  async incrementArticleViews(id: string): Promise<void> {
    // Random boost for team morale (5-10 views per visit)
    const boostOptions = [5, 6, 7, 8, 9, 10];
    const randomBoost = boostOptions[Math.floor(Math.random() * boostOptions.length)];

    bufferArticleViewIncrement(id, randomBoost);
  }

  async updateArticlesOrder(articleOrders: Array<{ id: string; displayOrder: number }>): Promise<void> {
    for (const { id, displayOrder } of articleOrders) {
      await db
        .update(articles)
        .set({ displayOrder, updatedAt: new Date() })
        .where(eq(articles.id, id));
    }
  }

  async getFeaturedArticle(userId?: string): Promise<ArticleWithDetails | undefined> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    // Get AI category IDs to exclude
    const aiCategories = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        inArray(categories.slug, ['ai-news', 'ai-insights', 'ai-opinions', 'ai-tools', 'ai-voice'])
      );
    
    const aiCategoryIds = aiCategories.map(c => c.id);
    
    const baseConditions = [
      eq(articles.status, "published"),
      or(
        isNull(articles.articleType),
        ne(articles.articleType, 'opinion')
      )
    ];
    
    // Exclude AI articles
    if (aiCategoryIds.length > 0) {
      baseConditions.push(
        or(
          isNull(articles.categoryId),
          not(inArray(articles.categoryId, aiCategoryIds))
        )
      );
    }
    
    // First, try to get an article explicitly marked as featured
    const featuredConditions = [...baseConditions, eq(articles.isFeatured, true)];
    
    let results = await db
      .select({
        article: articleListSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(and(...featuredConditions))
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt))
      .limit(1);

    // If no explicitly featured article, fall back to most viewed
    if (results.length === 0) {
      results = await db
        .select({
          article: articleListSelect,
          category: categoryBasicSelect,
          author: userPublicSelect,
          reporter: reporterPublicSelect(reporterAlias),
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(users, eq(articles.authorId, users.id))
        .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
        .where(and(...baseConditions))
        .orderBy(desc(articles.views), desc(articles.publishedAt))
        .limit(1);
    }

    if (results.length === 0) return undefined;

    const result = results[0];
    return {
      ...result.article,
      category: result.category || undefined,
      author: result.reporter || result.author || undefined,
    } as unknown as ArticleWithDetails;
  }


  async getLatestArticlesForFooter(limit: number): Promise<{ id: number; title: string; slug: string }[]> {
    try {
      const result = await db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
        })
        .from(articles)
        .where(eq(articles.status, "published"))
        .orderBy(desc(articles.publishedAt))
        .limit(limit);
      return result as unknown as { id: number; title: string; slug: string }[];
    } catch (error) {
      console.error("Error fetching footer articles:", error);
      return [];
    }
  }
  async getRelatedArticles(articleId: string, categoryId?: string): Promise<ArticleWithDetails[]> {
    const conditions = [
      eq(articles.status, "published"),
      ne(articles.id, articleId),
      or(
        isNull(articles.articleType),
        ne(articles.articleType, 'opinion')
      ),
    ];

    if (categoryId) {
      conditions.push(eq(articles.categoryId, categoryId));
    }

    const reporterAlias = aliasedTable(users, 'reporter');
    
    // For related articles, order by publishedAt only (not displayOrder)
    // displayOrder is for homepage curation, related articles should show recent content
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt))
      .limit(5);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getArticlesMetrics(): Promise<{ published: number; scheduled: number; draft: number; archived: number }> {
    const now = new Date();

    const [publishedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(eq(articles.status, 'published'));

    const [scheduledResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(and(
        eq(articles.status, 'scheduled'),
        gte(articles.scheduledAt, now)
      ));

    const [draftResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(eq(articles.status, 'draft'));

    const [archivedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(eq(articles.status, 'archived'));

    return {
      published: Number(publishedResult.count),
      scheduled: Number(scheduledResult.count),
      draft: Number(draftResult.count),
      archived: Number(archivedResult.count),
    };
  }

  async archiveArticle(id: string, userId: string): Promise<Article> {
    const [updated] = await db
      .update(articles)
      .set({ 
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning();
    
    return updated;
  }

  async restoreArticle(id: string, userId: string): Promise<Article> {
    const [updated] = await db
      .update(articles)
      .set({ 
        status: 'draft',
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning();
    
    return updated;
  }

  async toggleArticleBreaking(id: string, userId: string): Promise<Article> {
    const article = await this.getArticleById(id);
    if (!article) {
      throw new Error('Article not found');
    }

    const newNewsType = article.newsType === 'breaking' ? 'regular' : 'breaking';
    
    const [updated] = await db
      .update(articles)
      .set({ 
        newsType: newNewsType,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id))
      .returning();
    
    return updated;
  }

  async getNewsStatistics() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [summaryRows, topArticles] = await Promise.all([
      db
        .select({
          totalNews: sql<number>`count(*)::int`,
          todayNews: sql<number>`count(*) FILTER (WHERE ${articles.publishedAt} >= ${todayStart})::int`,
          averageViews: sql<number>`COALESCE(AVG(${articles.views}), 0)::int`,
        })
        .from(articles)
        .where(
          and(
            eq(articles.status, "published"),
            ne(articles.articleType, "opinion")
          )
        ),

      db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          englishSlug: articles.englishSlug,
          imageUrl: articles.imageUrl,
          views: articles.views,
          categoryName: categories.nameAr,
          categorySlug: categories.slug,
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .where(
          and(
            eq(articles.status, "published"),
            ne(articles.articleType, "opinion"),
            gte(articles.publishedAt, weekStart)
          )
        )
        .orderBy(desc(articles.views))
        .limit(5),
    ]);

    const summary = summaryRows[0];

    const topStoriesThisWeek = topArticles.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      englishSlug: row.englishSlug,
      imageUrl: row.imageUrl,
      categoryName: row.categoryName ?? null,
      categorySlug: row.categorySlug ?? null,
    }));

    const lead = topStoriesThisWeek[0] ?? null;

    return {
      totalNews: summary?.totalNews ?? 0,
      todayNews: summary?.todayNews ?? 0,
      topStoriesThisWeek,
      // Legacy shape for older clients — do not expand this for public UIs.
      topViewedThisWeek: {
        article: lead
          ? ({
              id: lead.id,
              title: lead.title,
              slug: lead.slug,
              englishSlug: lead.englishSlug,
              imageUrl: lead.imageUrl,
            } as ArticleWithDetails)
          : null,
        views: topArticles[0]?.views ?? 0,
      },
      averageViews: Math.round(summary?.averageViews ?? 0),
    };
  }

  // SEO operations
  async getArticleForSeo(id: string, language: "ar" | "en" | "ur"): Promise<{
    id: string;
    title: string;
    subtitle?: string | null;
    content: string;
    excerpt?: string | null;
  } | undefined> {
    const table = language === "ar" ? articles : language === "en" ? enArticles : urArticles;
    
    const [article] = await db
      .select({
        id: table.id,
        title: table.title,
        subtitle: table.subtitle,
        content: table.content,
        excerpt: table.excerpt,
      })
      .from(table)
      .where(eq(table.id, id))
      .limit(1);

    return article;
  }

  async saveSeoMetadata(
    articleId: string,
    language: "ar" | "en" | "ur",
    seo: {
      metaTitle?: string;
      metaDescription?: string;
      keywords?: string[];
      socialTitle?: string;
      socialDescription?: string;
      imageAltText?: string;
      ogImageUrl?: string;
    },
    metadata: {
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
    }
  ): Promise<void> {
    const table = language === "ar" ? articles : language === "en" ? enArticles : urArticles;
    
    await db
      .update(table)
      .set({
        seo,
        seoMetadata: metadata,
        updatedAt: new Date(),
      })
      .where(eq(table.id, articleId));
  }

  async createSeoHistoryEntry(params: {
    articleId: string;
    language: "ar" | "en" | "ur";
    seoContent: {
      metaTitle?: string;
      metaDescription?: string;
      keywords?: string[];
      socialTitle?: string;
      socialDescription?: string;
      imageAltText?: string;
      ogImageUrl?: string;
    };
    seoMetadata: {
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
    };
    provider: string;
    model: string;
    generatedBy: string;
  }): Promise<void> {
    // Get the latest version for this article and language
    const [latestHistory] = await db
      .select({ version: articleSeoHistory.version })
      .from(articleSeoHistory)
      .where(
        and(
          eq(articleSeoHistory.articleId, params.articleId),
          eq(articleSeoHistory.language, params.language)
        )
      )
      .orderBy(desc(articleSeoHistory.version))
      .limit(1);

    const nextVersion = latestHistory ? latestHistory.version + 1 : 1;

    await db.insert(articleSeoHistory).values({
      id: nanoid(),
      articleId: params.articleId,
      language: params.language,
      seoContent: params.seoContent,
      seoMetadata: params.seoMetadata,
      version: nextVersion,
      provider: params.provider,
      model: params.model,
      generatedBy: params.generatedBy,
    });
  }

  // RSS Feed operations
  async getAllRssFeeds(): Promise<RssFeed[]> {
    return await db.select().from(rssFeeds).orderBy(rssFeeds.name).limit(200);
  }

  async createRssFeed(feed: InsertRssFeed): Promise<RssFeed> {
    const [created] = await db.insert(rssFeeds).values(feed).returning();
    return created;
  }

  async updateRssFeedLastFetch(id: string): Promise<void> {
    await db
      .update(rssFeeds)
      .set({ lastFetchedAt: new Date() })
      .where(eq(rssFeeds.id, id));
  }

  // Comment operations
  async getCommentsByArticle(articleId: string, showPending: boolean = false): Promise<CommentWithUser[]> {
    const conditions = [eq(comments.articleId, articleId)];
    
    if (!showPending) {
      conditions.push(eq(comments.status, 'approved'));
    }
    
    const results = await db
      .select({
        comment: comments,
        user: userPublicSelect,
        // Loyalty tier is rendered next to the commenter name (Phase 2).
        // Left-join means users without a row still resolve, just with
        // null rankLevel that the client treats as tier 1.
        loyaltyRankLevel: userPointsTotal.rankLevel,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .leftJoin(userPointsTotal, eq(userPointsTotal.userId, comments.userId))
      .where(and(...conditions))
      .orderBy(comments.createdAt);

    const allComments = results.map((r) => ({
      ...r.comment,
      user: { ...(r.user as any), loyaltyRankLevel: r.loyaltyRankLevel ?? 1 } as any,
      replies: [] as CommentWithUser[],
    }));

    // Build nested structure: organize replies under parent comments
    const commentMap = new Map<string, CommentWithUser>();
    const topLevelComments: CommentWithUser[] = [];

    // First pass: create a map of all comments
    allComments.forEach(comment => {
      commentMap.set(comment.id, comment);
    });

    // Second pass: organize into parent-child relationships
    allComments.forEach(comment => {
      if (comment.parentId) {
        // This is a reply
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies!.push(comment);
        }
      } else {
        // This is a top-level comment
        topLevelComments.push(comment);
      }
    });

    return topLevelComments;
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const [created] = await db.insert(comments).values(comment).returning();
    return created;
  }

  async getAllComments(filters?: { status?: string; articleId?: string }): Promise<CommentWithUser[]> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(comments.status, filters.status));
    }
    
    if (filters?.articleId) {
      conditions.push(eq(comments.articleId, filters.articleId));
    }
    
    const results = await db
      .select({
        comment: comments,
        user: userPublicSelect,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(comments.createdAt));

    return results.map((r) => ({
      ...r.comment,
      user: r.user!,
    })) as unknown as CommentWithUser[];
  }

  async approveComment(commentId: string, moderatorId: string): Promise<Comment> {
    const [updated] = await db
      .update(comments)
      .set({
        status: 'approved',
        moderatedBy: moderatorId,
        moderatedAt: new Date(),
      })
      .where(eq(comments.id, commentId))
      .returning();
    
    return updated;
  }

  async rejectComment(commentId: string, moderatorId: string, reason?: string): Promise<Comment> {
    const [updated] = await db
      .update(comments)
      .set({
        status: 'rejected',
        moderatedBy: moderatorId,
        moderatedAt: new Date(),
        moderationReason: reason,
      })
      .where(eq(comments.id, commentId))
      .returning();
    
    return updated;
  }

  async restoreComment(commentId: string): Promise<Comment> {
    // First check if comment exists and is rejected
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    
    if (!comment) {
      throw new Error('Comment not found');
    }
    
    if (comment.status !== 'rejected') {
      throw new Error('Only rejected comments can be restored');
    }
    
    const [updated] = await db
      .update(comments)
      .set({
        status: 'pending',
        moderatedBy: null,
        moderatedAt: null,
        moderationReason: null,
      })
      .where(and(
        eq(comments.id, commentId),
        eq(comments.status, 'rejected')
      ))
      .returning();
    
    return updated;
  }

  // AI Comment Moderation operations
  async getCommentById(commentId: string): Promise<Comment | undefined> {
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1);
    return comment;
  }

  async updateCommentModeration(commentId: string, data: {
    aiModerationScore?: number;
    aiClassification?: string;
    aiDetectedIssues?: string[];
    aiModerationReason?: string;
    aiAnalyzedAt?: Date;
  }): Promise<void> {
    await db
      .update(comments)
      .set({
        aiModerationScore: data.aiModerationScore,
        aiClassification: data.aiClassification,
        aiDetectedIssues: data.aiDetectedIssues,
        aiModerationReason: data.aiModerationReason,
        aiAnalyzedAt: data.aiAnalyzedAt,
      })
      .where(eq(comments.id, commentId));
  }

  async updateCommentStatus(commentId: string, data: {
    status: string;
    moderatedBy?: string;
    moderatedAt?: Date;
    moderationReason?: string;
  }): Promise<void> {
    await db
      .update(comments)
      .set({
        status: data.status,
        moderatedBy: data.moderatedBy || null,
        moderatedAt: data.moderatedAt || null,
        moderationReason: data.moderationReason || null,
      })
      .where(eq(comments.id, commentId));
  }

  async getCommentsForModeration(filters: {
    classification?: string;
    status?: string;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{ comments: CommentWithUser[]; total: number }> {
    const conditions = [];
    
    if (filters.classification) {
      conditions.push(eq(comments.aiClassification, filters.classification));
    }
    
    if (filters.status) {
      conditions.push(eq(comments.status, filters.status));
    }
    
    if (filters.search) {
      conditions.push(
        sql`${comments.content} ILIKE ${'%' + filters.search + '%'}`
      );
    }
    
    const offset = (filters.page - 1) * filters.limit;
    
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const results = await db
      .select({
        comment: comments,
        user: userPublicSelect,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(comments.createdAt))
      .limit(filters.limit)
      .offset(offset);
    
    return {
      comments: results.map((r) => ({
        ...r.comment,
        user: r.user!,
      })) as unknown as CommentWithUser[],
      total: Number(countResult.count),
    };
  }

  async getCommentModerationStats(): Promise<{
    approvedToday: number;
    pendingReview: number;
    rejectedToday: number;
    averageScore: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [approvedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(and(
        eq(comments.status, 'approved'),
        sql`${comments.moderatedAt} >= ${today}`
      ));
    
    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.aiClassification, 'review'));
    
    const [rejectedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(and(
        eq(comments.status, 'rejected'),
        sql`${comments.moderatedAt} >= ${today}`
      ));
    
    const [scoreResult] = await db
      .select({ avg: sql<number>`COALESCE(AVG(${comments.aiModerationScore}), 0)` })
      .from(comments)
      .where(sql`${comments.aiModerationScore} IS NOT NULL`);
    
    return {
      approvedToday: Number(approvedResult.count),
      pendingReview: Number(pendingResult.count),
      rejectedToday: Number(rejectedResult.count),
      averageScore: Math.round(Number(scoreResult.avg)),
    };
  }

  async getAIModerationStats(): Promise<{
    total: number;
    safe: number;
    flagged: number;
    spam: number;
    harmful: number;
    pending: number;
    averageScore: number;
  }> {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(sql`${comments.aiClassification} IS NOT NULL`);
    
    const [safeResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.aiClassification, 'safe'));
    
    const [flaggedResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.aiClassification, 'flagged'));
    
    const [spamResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.aiClassification, 'spam'));
    
    const [harmfulResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(eq(comments.aiClassification, 'harmful'));
    
    const [pendingResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(sql`${comments.aiClassification} IS NULL`);
    
    const [scoreResult] = await db
      .select({ avg: sql<number>`COALESCE(AVG(${comments.aiModerationScore}), 0)` })
      .from(comments)
      .where(sql`${comments.aiModerationScore} IS NOT NULL`);
    
    return {
      total: Number(totalResult.count),
      safe: Number(safeResult.count),
      flagged: Number(flaggedResult.count),
      spam: Number(spamResult.count),
      harmful: Number(harmfulResult.count),
      pending: Number(pendingResult.count),
      averageScore: Math.round(Number(scoreResult.avg)),
    };
  }

  async getUnanalyzedComments(limit: number): Promise<{ id: string; content: string }[]> {
    const results = await db
      .select({
        id: comments.id,
        content: comments.content,
      })
      .from(comments)
      .where(sql`${comments.aiClassification} IS NULL`)
      .orderBy(desc(comments.createdAt))
      .limit(limit);
    
    return results;
  }

  async getModerationResults(filters: {
    classification?: string;
    minScore?: number;
    maxScore?: number;
    limit: number;
  }): Promise<{
    commentId: string;
    moderationScore: number;
    aiClassification: string;
    detectedIssues: string[];
    aiModerationAnalyzedAt: string;
    comment: {
      id: string;
      content: string;
      status: string;
      createdAt: string;
      platform: string;
      sentiment?: string; sentimentConfidence?: number;
      user: { id: string; firstName?: string; lastName?: string; email: string };
      articleId: string;
      articleTitle?: string;
      articleSlug?: string;
    };
  }[]> {
    const conditions: SQL[] = [sql`${comments.aiClassification} IS NOT NULL`];
    
    if (filters.classification) {
      conditions.push(eq(comments.aiClassification, filters.classification));
    }
    
    if (filters.minScore !== undefined) {
      conditions.push(sql`${comments.aiModerationScore} >= ${filters.minScore}`);
    }
    
    if (filters.maxScore !== undefined) {
      conditions.push(sql`${comments.aiModerationScore} <= ${filters.maxScore}`);
    }
    
    const results = await db
      .select({
        comment: comments,
        user: userPublicSelect,
        article: {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
        },
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .leftJoin(articles, eq(comments.articleId, articles.id))
      .where(and(...conditions))
      .orderBy(desc(comments.aiAnalyzedAt))
      .limit(filters.limit);
    
    return results.map((r) => ({
      commentId: r.comment.id,
      moderationScore: r.comment.aiModerationScore || 0,
      aiClassification: r.comment.aiClassification || 'unknown',
      detectedIssues: r.comment.aiDetectedIssues || [],
      aiModerationAnalyzedAt: r.comment.aiAnalyzedAt?.toISOString() || new Date().toISOString(),
      comment: {
        id: r.comment.id,
        content: r.comment.content,
        status: r.comment.status,
        createdAt: r.comment.createdAt.toISOString(),
        platform: r.comment.platform || "web",
        sentiment: r.comment.currentSentiment || undefined, sentimentConfidence: r.comment.currentSentimentConfidence ?? undefined,
        user: {
          id: r.user?.id || '',
          firstName: r.user?.firstName || undefined,
          lastName: r.user?.lastName || undefined,
          email: (r.user as any)?.email || '',
        },
        articleId: r.comment.articleId,
        articleTitle: r.article?.title || undefined,
        articleSlug: r.article?.slug || undefined,
      },
    }));
  }

  // Advanced Moderation Search - البحث المتقدم في الرقابة الذكية
  async searchModerationComments(params: {
    query?: string;
    userId?: string;
    status?: string;
    aiClassification?: string;
    dateFrom?: Date;
    dateTo?: Date;
    sortBy?: 'relevance' | 'date' | 'score';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    comments: Array<{
      id: string;
      content: string;
      status: string;
      createdAt: string;
      aiModerationScore: number | null;
      aiClassification: string | null;
      aiDetectedIssues: string[] | null;
      highlightedContent?: string;
      relevanceScore?: number;
      user: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string;
        profileImage: string | null;
      };
      article: {
        id: string;
        title: string;
        slug: string;
        categoryId: string | null;
        categoryName: string | null;
      };
    }>;
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;
    const sortOrder = params.sortOrder || 'desc';

    const conditions: SQL[] = [];

    // Arabic text normalization helper (removes diacritics)
    const normalizeArabic = (text: string) => {
      return text
        .replace(/[\u064B-\u065F\u0670]/g, '') // Remove Arabic diacritics
        .replace(/[أإآ]/g, 'ا') // Normalize Hamza
        .replace(/[ى]/g, 'ي') // Normalize Ya
        .replace(/[ة]/g, 'ه') // Normalize Ta Marbuta
        .trim();
    };

    // Escape regex special characters to prevent injection
    const escapeRegex = (text: string) => {
      return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Text search with Arabic optimization.
    // The query is normalized in JS (ة→ه, أ/إ/آ→ا, ى→ي, diacritics stripped).
    // We must apply the *same* normalization to the column on the DB side
    // before comparing — otherwise a query like "تجاره" never matches
    // content stored as "تجارة". REGEXP_REPLACE chained server-side.
    if (params.query && params.query.trim()) {
      const trimmedQuery = params.query.trim();
      const normalizedQuery = normalizeArabic(trimmedQuery);

      if (normalizedQuery.length > 0) {
        const normalizedColumn = sql`
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(${comments.content}, '[ً-ٰٟ]', '', 'g'),
                '[أإآ]', 'ا', 'g'),
              'ى', 'ي', 'g'),
            'ة', 'ه', 'g')
        `;
        // Match against normalized column AND raw column (in case the user
        // happened to query the un-normalized form, or content already
        // matches verbatim).
        conditions.push(sql`(
          ${normalizedColumn} ILIKE ${`%${normalizedQuery}%`}
          OR ${comments.content} ILIKE ${`%${trimmedQuery}%`}
        )`);
      }
    }

    // User filter
    if (params.userId) {
      conditions.push(eq(comments.userId, params.userId));
    }

    // Status filter
    if (params.status) {
      conditions.push(eq(comments.status, params.status));
    }

    // AI Classification filter
    if (params.aiClassification) {
      conditions.push(eq(comments.aiClassification, params.aiClassification));
    }

    // Date range filters
    if (params.dateFrom) {
      conditions.push(sql`${comments.createdAt} >= ${params.dateFrom}`);
    }
    if (params.dateTo) {
      conditions.push(sql`${comments.createdAt} <= ${params.dateTo}`);
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = countResult?.count || 0;

    // Build sort expression
    let orderByExpr;
    if (params.sortBy === 'score') {
      orderByExpr = sortOrder === 'asc' 
        ? sql`COALESCE(${comments.aiModerationScore}, 0) ASC`
        : sql`COALESCE(${comments.aiModerationScore}, 0) DESC`;
    } else if (params.sortBy === 'relevance' && params.query) {
      // Simple relevance scoring based on exact match position
      orderByExpr = sql`
        CASE 
          WHEN ${comments.content} ILIKE ${`%${params.query}%`} THEN 1
          ELSE 2
        END,
        ${comments.createdAt} DESC
      `;
    } else {
      orderByExpr = sortOrder === 'asc'
        ? sql`${comments.createdAt} ASC`
        : sql`${comments.createdAt} DESC`;
    }

    // Query with joins
    const results = await db
      .select({
        comment: comments,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          profileImage: users.profileImageUrl,
        },
        article: {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          categoryId: articles.categoryId,
        },
        categoryName: categories.nameAr,
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .leftJoin(articles, eq(comments.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);

    // Process results with highlighting
    const processedComments = results.map((r) => {
      let highlightedContent = r.comment.content;
      let relevanceScore = 0;

      if (params.query && params.query.trim()) {
        const searchTerm = params.query.trim();
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedContent = r.comment.content.replace(regex, '<mark>$1</mark>');
        
        // Calculate simple relevance score
        const matchCount = (r.comment.content.match(regex) || []).length;
        relevanceScore = Math.min(matchCount * 0.2, 1);
      }

      return {
        id: r.comment.id,
        content: r.comment.content,
        status: r.comment.status,
        createdAt: r.comment.createdAt.toISOString(),
        aiModerationScore: r.comment.aiModerationScore,
        aiClassification: r.comment.aiClassification,
        aiDetectedIssues: r.comment.aiDetectedIssues as string[] | null,
        highlightedContent,
        relevanceScore: relevanceScore > 0 ? relevanceScore : undefined,
        user: {
          id: r.user?.id || '',
          firstName: r.user?.firstName || null,
          lastName: r.user?.lastName || null,
          email: r.user?.email || '',
          profileImage: r.user?.profileImage || null,
        },
        article: {
          id: r.article?.id || '',
          title: r.article?.title || '',
          slug: r.article?.slug || '',
          categoryId: r.article?.categoryId || null,
          categoryName: r.categoryName || null,
        },
      };
    });

    return {
      comments: processedComments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async searchModerationArticles(params: {
    query?: string;
    categoryId?: string;
    publishFrom?: Date;
    publishTo?: Date;
    includeComments?: boolean;
    sortBy?: 'relevance' | 'date' | 'comments' | 'engagement';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }): Promise<{
    articles: Array<{
      id: string;
      title: string;
      slug: string;
      excerpt: string | null;
      imageUrl: string | null;
      publishedAt: string | null;
      views: number;
      categoryId: string | null;
      categoryName: string | null;
      highlightedTitle?: string;
      relevanceScore?: number;
      commentStats: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        flagged: number;
      };
      latestComments?: Array<{
        id: string;
        content: string;
        status: string;
        aiClassification: string | null;
        aiModerationScore: number | null;
        createdAt: string;
        userName: string;
      }>;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;
    const sortOrder = params.sortOrder || 'desc';
    const includeComments = params.includeComments !== false;

    const conditions: SQL[] = [eq(articles.status, 'published')];

    // Arabic text normalization
    const normalizeArabic = (text: string) => {
      return text
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/[ى]/g, 'ي')
        .replace(/[ة]/g, 'ه')
        .trim();
    };

    // Text search
    if (params.query && params.query.trim()) {
      const normalizedQuery = normalizeArabic(params.query.trim());
      conditions.push(sql`(
        ${articles.title} ILIKE ${`%${normalizedQuery}%`}
        OR ${articles.excerpt} ILIKE ${`%${normalizedQuery}%`}
      )`);
    }

    // Category filter
    if (params.categoryId) {
      conditions.push(eq(articles.categoryId, params.categoryId));
    }

    // Date range filters
    if (params.publishFrom) {
      conditions.push(sql`${articles.publishedAt} >= ${params.publishFrom}`);
    }
    if (params.publishTo) {
      conditions.push(sql`${articles.publishedAt} <= ${params.publishTo}`);
    }

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    // Subquery for comment counts
    const commentCountSubquery = db
      .select({
        articleId: comments.articleId,
        totalComments: sql<number>`count(*)::int`.as('total_comments'),
        pendingComments: sql<number>`count(*) FILTER (WHERE ${comments.status} = 'pending')::int`.as('pending_comments'),
        approvedComments: sql<number>`count(*) FILTER (WHERE ${comments.status} = 'approved')::int`.as('approved_comments'),
        rejectedComments: sql<number>`count(*) FILTER (WHERE ${comments.status} = 'rejected')::int`.as('rejected_comments'),
        flaggedComments: sql<number>`count(*) FILTER (WHERE ${comments.aiClassification} IN ('flagged', 'harmful', 'spam'))::int`.as('flagged_comments'),
      })
      .from(comments)
      .groupBy(comments.articleId)
      .as('comment_stats');

    // Build order expression
    let orderByExpr;
    if (params.sortBy === 'comments') {
      orderByExpr = sortOrder === 'asc'
        ? sql`COALESCE(${commentCountSubquery.totalComments}, 0) ASC`
        : sql`COALESCE(${commentCountSubquery.totalComments}, 0) DESC`;
    } else if (params.sortBy === 'engagement') {
      orderByExpr = sortOrder === 'asc'
        ? sql`(${articles.views} + COALESCE(${commentCountSubquery.totalComments}, 0) * 10) ASC`
        : sql`(${articles.views} + COALESCE(${commentCountSubquery.totalComments}, 0) * 10) DESC`;
    } else if (params.sortBy === 'relevance' && params.query) {
      orderByExpr = sql`
        CASE 
          WHEN ${articles.title} ILIKE ${`%${params.query}%`} THEN 1
          WHEN ${articles.excerpt} ILIKE ${`%${params.query}%`} THEN 2
          ELSE 3
        END,
        ${articles.publishedAt} DESC NULLS LAST
      `;
    } else {
      orderByExpr = sortOrder === 'asc'
        ? sql`${articles.publishedAt} ASC NULLS LAST`
        : sql`${articles.publishedAt} DESC NULLS LAST`;
    }

    // Main query with join for comment stats
    const results = await db
      .select({
        article: {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          excerpt: articles.excerpt,
          imageUrl: articles.imageUrl,
          publishedAt: articles.publishedAt,
          views: articles.views,
          categoryId: articles.categoryId,
        },
        categoryName: categories.nameAr,
        totalComments: commentCountSubquery.totalComments,
        pendingComments: commentCountSubquery.pendingComments,
        approvedComments: commentCountSubquery.approvedComments,
        rejectedComments: commentCountSubquery.rejectedComments,
        flaggedComments: commentCountSubquery.flaggedComments,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(commentCountSubquery, eq(articles.id, commentCountSubquery.articleId))
      .where(and(...conditions))
      .orderBy(orderByExpr)
      .limit(limit)
      .offset(offset);

    // Audit M1.4 (2026-06-10): latest-comments used to be fetched with one
    // query PER search result (N+1 — a 50-row page fired 50 extra queries).
    // Now a single window-function query fetches the newest 5 comments for
    // every result at once, grouped in memory below.
    type LatestComment = {
      id: string;
      content: string;
      status: string;
      aiClassification: string | null;
      aiModerationScore: number | null;
      createdAt: string;
      userName: string;
    };
    const commentsByArticle = new Map<string, LatestComment[]>();
    const articleIdsWithComments = includeComments
      ? results.filter((r) => (r.totalComments || 0) > 0).map((r) => r.article.id)
      : [];

    if (articleIdsWithComments.length > 0) {
      const ranked = db.$with('ranked_comments').as(
        db
          .select({
            id: comments.id,
            articleId: comments.articleId,
            content: comments.content,
            status: comments.status,
            aiClassification: comments.aiClassification,
            aiModerationScore: comments.aiModerationScore,
            createdAt: comments.createdAt,
            userName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, ${users.email})`.as('user_name'),
            rn: sql<number>`row_number() over (partition by ${comments.articleId} order by ${comments.createdAt} desc)`.as('rn'),
          })
          .from(comments)
          .leftJoin(users, eq(comments.userId, users.id))
          .where(inArray(comments.articleId, articleIdsWithComments)),
      );

      const commentRows = await db
        .with(ranked)
        .select()
        .from(ranked)
        .where(sql`${ranked.rn} <= 5`)
        .orderBy(ranked.articleId, ranked.rn);

      for (const row of commentRows) {
        const list = commentsByArticle.get(row.articleId) ?? [];
        list.push({
          id: row.id,
          content: row.content,
          status: row.status,
          aiClassification: row.aiClassification,
          aiModerationScore: row.aiModerationScore,
          createdAt: row.createdAt.toISOString(),
          userName: row.userName || 'مجهول',
        });
        commentsByArticle.set(row.articleId, list);
      }
    }

    // Process results
    const processedArticles = results.map((r) => {
      let highlightedTitle = r.article.title;
      let relevanceScore = 0;

      if (params.query && params.query.trim()) {
        const searchTerm = params.query.trim();
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        highlightedTitle = r.article.title.replace(regex, '<mark>$1</mark>');

        const matchCount = (r.article.title.match(regex) || []).length;
        relevanceScore = Math.min(matchCount * 0.25, 1);
      }

      const latestComments: LatestComment[] | undefined =
        includeComments && (r.totalComments || 0) > 0
          ? commentsByArticle.get(r.article.id) ?? []
          : undefined;

      return {
        id: r.article.id,
        title: r.article.title,
        slug: r.article.slug,
        excerpt: r.article.excerpt,
        imageUrl: r.article.imageUrl,
        publishedAt: r.article.publishedAt?.toISOString() || null,
        views: r.article.views,
        categoryId: r.article.categoryId,
        categoryName: r.categoryName || null,
        highlightedTitle: highlightedTitle !== r.article.title ? highlightedTitle : undefined,
        relevanceScore: relevanceScore > 0 ? relevanceScore : undefined,
        commentStats: {
          total: r.totalComments || 0,
          pending: r.pendingComments || 0,
          approved: r.approvedComments || 0,
          rejected: r.rejectedComments || 0,
          flagged: r.flaggedComments || 0,
        },
        latestComments,
      };
    });

    return {
      articles: processedArticles,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // Comment Edit & Delete operations with audit logging
  async editCommentWithHistory(commentId: string, newContent: string, editedBy: string, editReason?: string): Promise<Comment> {
    const [existingComment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId));
    
    if (!existingComment) {
      throw new Error('التعليق غير موجود');
    }
    
    // Log the edit history
    await db.insert(commentEditHistory).values({
      commentId,
      previousContent: existingComment.content,
      newContent,
      editedBy,
      editReason,
      editType: 'content',
    });
    
    // Update the comment
    const [updated] = await db
      .update(comments)
      .set({ content: newContent })
      .where(eq(comments.id, commentId))
      .returning();
    
    return updated;
  }

  async deleteCommentWithLog(commentId: string, deletedBy: string, deletionReason?: string): Promise<void> {
    const [existingComment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId));
    
    if (!existingComment) {
      throw new Error('التعليق غير موجود');
    }
    
    // Log the deletion
    await db.insert(commentDeletionLog).values({
      commentId,
      articleId: existingComment.articleId,
      userId: existingComment.userId,
      content: existingComment.content,
      status: existingComment.status,
      deletedBy,
      deletionReason,
      aiClassification: existingComment.aiClassification || undefined,
      aiModerationScore: existingComment.aiModerationScore || undefined,
    });
    
    // Delete the comment
    await db.delete(comments).where(eq(comments.id, commentId));
  }

  async getCommentEditHistory(commentId: string): Promise<CommentEditHistory[]> {
    const history = await db
      .select()
      .from(commentEditHistory)
      .where(eq(commentEditHistory.commentId, commentId))
      .orderBy(desc(commentEditHistory.createdAt));
    
    return history;
  }

  async getCommentWithArticle(commentId: string): Promise<{
    comment: Comment;
    article: { id: string; title: string; slug: string } | null;
    user: { id: string; firstName?: string; lastName?: string; email: string } | null;
  } | null> {
    const [result] = await db
      .select({
        comment: comments,
        article: {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
        },
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(comments)
      .leftJoin(articles, eq(comments.articleId, articles.id))
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.id, commentId));
    
    if (!result) return null;
    
    return {
      comment: result.comment,
      article: result.article?.id ? {
        id: result.article.id,
        title: result.article.title,
        slug: result.article.slug,
      } : null,
      user: result.user?.id ? {
        id: result.user.id,
        firstName: result.user.firstName || undefined,
        lastName: result.user.lastName || undefined,
        email: result.user.email,
      } : null,
    };
  }

  // Member Profile for Moderation Dashboard
  async getMemberModerationProfile(memberId: string): Promise<{
    user: {
      id: string;
      firstName?: string;
      lastName?: string;
      email: string;
      profileImage?: string;
      createdAt: string;
    };
    stats: {
      totalComments: number;
      approvedComments: number;
      rejectedComments: number;
      pendingComments: number;
      flaggedComments: number;
      avgModerationScore: number;
      firstCommentDate?: string;
      lastCommentDate?: string;
      memberSince: string;
      daysSinceJoined: number;
    };
    aiAnalysis: {
      overallBehavior: 'excellent' | 'good' | 'moderate' | 'concerning' | 'high_risk';
      behaviorScore: number;
      topClassifications: { classification: string; count: number }[];
    };
  } | null> {
    // Get user information
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, memberId));
    
    if (!user) return null;
    
    // Get comment statistics
    const memberComments = await db
      .select()
      .from(comments)
      .where(eq(comments.userId, memberId));
    
    const totalComments = memberComments.length;
    const approvedComments = memberComments.filter(c => c.status === 'approved').length;
    const rejectedComments = memberComments.filter(c => c.status === 'rejected').length;
    const pendingComments = memberComments.filter(c => c.status === 'pending').length;
    const flaggedComments = memberComments.filter(c => c.aiClassification === 'flagged' || c.aiClassification === 'harmful').length;
    
    // Calculate average moderation score
    const scoresSum = memberComments.reduce((sum, c) => sum + (c.aiModerationScore || 0), 0);
    const avgModerationScore = totalComments > 0 ? Math.round(scoresSum / totalComments) : 0;
    
    // Get first and last comment dates
    const sortedByDate = [...memberComments].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const firstCommentDate = sortedByDate[0]?.createdAt.toISOString();
    const lastCommentDate = sortedByDate[sortedByDate.length - 1]?.createdAt.toISOString();
    
    // Calculate days since joined
    const daysSinceJoined = Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Calculate AI classifications breakdown
    const classificationCounts: Record<string, number> = {};
    memberComments.forEach(c => {
      const classification = c.aiClassification || 'unknown';
      classificationCounts[classification] = (classificationCounts[classification] || 0) + 1;
    });
    
    const topClassifications = Object.entries(classificationCounts)
      .map(([classification, count]) => ({ classification, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // Determine overall behavior rating
    let behaviorScore = 100;
    if (totalComments > 0) {
      const rejectionRate = rejectedComments / totalComments;
      const flagRate = flaggedComments / totalComments;
      behaviorScore = Math.max(0, Math.round(100 - (rejectionRate * 50) - (flagRate * 30) - ((100 - avgModerationScore) * 0.2)));
    }
    
    let overallBehavior: 'excellent' | 'good' | 'moderate' | 'concerning' | 'high_risk';
    if (behaviorScore >= 90) overallBehavior = 'excellent';
    else if (behaviorScore >= 75) overallBehavior = 'good';
    else if (behaviorScore >= 50) overallBehavior = 'moderate';
    else if (behaviorScore >= 25) overallBehavior = 'concerning';
    else overallBehavior = 'high_risk';
    
    return {
      user: {
        id: user.id,
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        email: user.email,
        profileImage: user.profileImageUrl || undefined,
        createdAt: user.createdAt.toISOString(),
      },
      stats: {
        totalComments,
        approvedComments,
        rejectedComments,
        pendingComments,
        flaggedComments,
        avgModerationScore,
        firstCommentDate,
        lastCommentDate,
        memberSince: user.createdAt.toISOString(),
        daysSinceJoined,
      },
      aiAnalysis: {
        overallBehavior,
        behaviorScore,
        topClassifications,
      },
    };
  }

  async getMemberCommentHistory(
    memberId: string,
    options?: {
      status?: string;
      classification?: string;
      sortBy?: 'date' | 'score';
      sortOrder?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }
  ): Promise<{
    comments: Array<{
      id: string;
      content: string;
      status: string;
      aiClassification?: string;
      aiModerationScore?: number;
      createdAt: string;
      article: { id: string; title: string; slug: string } | null;
    }>;
    total: number;
  }> {
    const { status, classification, sortBy = 'date', sortOrder = 'desc', limit = 20, offset = 0 } = options || {};
    
    // Build conditions
    const conditions = [eq(comments.userId, memberId)];
    if (status) conditions.push(eq(comments.status, status));
    if (classification) conditions.push(eq(comments.aiClassification, classification));
    
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(and(...conditions));
    
    // Get paginated comments with article info
    const orderColumn = sortBy === 'score' ? comments.aiModerationScore : comments.createdAt;
    const orderDirection = sortOrder === 'asc' ? asc : desc;
    
    const results = await db
      .select({
        comment: comments,
        article: {
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
        },
      })
      .from(comments)
      .leftJoin(articles, eq(comments.articleId, articles.id))
      .where(and(...conditions))
      .orderBy(orderDirection(orderColumn))
      .limit(limit)
      .offset(offset);
    
    return {
      comments: results.map(r => ({
        id: r.comment.id,
        content: r.comment.content,
        status: r.comment.status,
        aiClassification: r.comment.aiClassification || undefined,
        aiModerationScore: r.comment.aiModerationScore || undefined,
        createdAt: r.comment.createdAt.toISOString(),
        article: r.article?.id ? {
          id: r.article.id,
          title: r.article.title,
          slug: r.article.slug,
        } : null,
      })),
      total: Number(count),
    };
  }

  // Reaction operations
  async toggleReaction(articleId: string, userId: string): Promise<{ hasReacted: boolean }> {
    const [existing] = await db
      .select()
      .from(reactions)
      .where(and(eq(reactions.articleId, articleId), eq(reactions.userId, userId)));

    if (existing) {
      await db.delete(reactions).where(eq(reactions.id, existing.id));
      return { hasReacted: false };
    } else {
      await db.insert(reactions).values({ articleId, userId });
      return { hasReacted: true };
    }
  }

  async getReactionsByArticle(articleId: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(reactions)
      .where(eq(reactions.articleId, articleId));
    return Number(count);
  }

  // Bookmark operations
  async toggleBookmark(articleId: string, userId: string): Promise<{ isBookmarked: boolean }> {
    const [existing] = await db
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.articleId, articleId), eq(bookmarks.userId, userId)));

    if (existing) {
      await db.delete(bookmarks).where(eq(bookmarks.id, existing.id));
      return { isBookmarked: false };
    } else {
      await db.insert(bookmarks).values({ articleId, userId });
      return { isBookmarked: true };
    }
  }

  async getUserBookmarks(userId: string): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(bookmarks)
      .innerJoin(articles, eq(bookmarks.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt));

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      isBookmarked: true,
    })) as unknown as ArticleWithDetails[];
  }

  async getUserLikedArticles(userId: string): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(reactions)
      .innerJoin(articles, eq(reactions.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(and(eq(reactions.userId, userId), eq(articles.status, "published")))
      .orderBy(desc(reactions.createdAt));

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      hasReacted: true,
    })) as unknown as ArticleWithDetails[];
  }

  // Reading history operations
  async recordArticleRead(userId: string, articleId: string, duration?: number): Promise<void> {
    const existing = await db
      .select({ id: readingHistory.id })
      .from(readingHistory)
      .where(and(eq(readingHistory.userId, userId), eq(readingHistory.articleId, articleId)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(readingHistory)
        .set({
          readDuration: duration ?? undefined,
          readAt: new Date(),
        })
        .where(eq(readingHistory.id, existing[0].id));
    } else {
      await db.insert(readingHistory).values({
        userId,
        articleId,
        readDuration: duration,
      });
    }
  }

  // Update reading progress with scroll depth and completion rate
  async updateReadingProgress(
    userId: string, 
    articleId: string, 
    scrollDepth: number, 
    readDuration?: number
  ): Promise<void> {
    // Calculate completion rate based on scroll depth
    // If user scrolled past 90%, consider it complete
    const completionRate = Math.min(100, scrollDepth);
    
    // Check if there's already a reading history entry for this user/article
    const existing = await db
      .select()
      .from(readingHistory)
      .where(
        and(
          eq(readingHistory.userId, userId),
          eq(readingHistory.articleId, articleId)
        )
      )
      .orderBy(desc(readingHistory.readAt))
      .limit(1);

    if (existing.length > 0) {
      // Update the most recent reading record with higher scroll depth
      const currentScrollDepth = existing[0].scrollDepth || 0;
      const currentCompletionRate = existing[0].completionRate || 0;
      
      // Only update if new values are higher
      if (scrollDepth > currentScrollDepth || completionRate > currentCompletionRate) {
        await db
          .update(readingHistory)
          .set({
            scrollDepth: Math.max(scrollDepth, currentScrollDepth),
            completionRate: Math.max(completionRate, currentCompletionRate),
            readDuration: readDuration || existing[0].readDuration,
            readAt: new Date(), // Update timestamp
          })
          .where(eq(readingHistory.id, existing[0].id));
      }
    } else {
      // Create new reading history entry with scroll depth
      await db.insert(readingHistory).values({
        userId,
        articleId,
        scrollDepth,
        completionRate,
        readDuration,
      });
    }
  }

  async getUserReadingHistory(userId: string, limit: number = 20): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(eq(readingHistory.userId, userId))
      .orderBy(desc(readingHistory.readAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  // Focus mode reading sessions (Task #80)
  async createFocusReadingSession(data: InsertFocusReadingSession): Promise<FocusReadingSession> {
    const [row] = await db.insert(focusReadingSessions).values(data).returning();
    return row;
  }

  async updateFocusReadingSession(
    id: string,
    data: UpdateFocusReadingSession & { shareSlug?: string },
  ): Promise<FocusReadingSession | undefined> {
    const [row] = await db
      .update(focusReadingSessions)
      .set(data)
      .where(eq(focusReadingSessions.id, id))
      .returning();
    return row;
  }

  async getFocusReadingSession(id: string): Promise<FocusReadingSession | undefined> {
    const [row] = await db
      .select()
      .from(focusReadingSessions)
      .where(eq(focusReadingSessions.id, id))
      .limit(1);
    return row;
  }

  async getFocusSessionByShareSlug(slug: string): Promise<FocusReadingSession | undefined> {
    const [row] = await db
      .select()
      .from(focusReadingSessions)
      .where(eq(focusReadingSessions.shareSlug, slug))
      .limit(1);
    return row;
  }

  async getUserFocusSessionsInRange(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<FocusReadingSession[]> {
    return db
      .select()
      .from(focusReadingSessions)
      .where(and(
        eq(focusReadingSessions.userId, userId),
        gte(focusReadingSessions.startedAt, start),
        sql`${focusReadingSessions.startedAt} < ${end}`,
      ))
      .orderBy(desc(focusReadingSessions.startedAt));
  }

  // Recommendation operations
  async getUserPreferences(userId: string): Promise<string[]> {
    const [pref] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    return (pref?.preferredCategories as string[]) || [];
  }

  async getRecommendations(userId: string): Promise<ArticleWithDetails[]> {
    const history = await db
      .select({ categoryId: articles.categoryId })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .where(and(eq(readingHistory.userId, userId), sql`${articles.categoryId} IS NOT NULL`))
      .limit(10);

    const categoryIds = Array.from(new Set(history.map(h => h.categoryId).filter(Boolean))) as string[];

    if (categoryIds.length === 0) {
      return await this.getArticles({ status: "published" });
    }

    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(
        and(
          eq(articles.status, "published"),
          inArray(articles.categoryId, categoryIds),
          or(
            isNull(articles.articleType),
            ne(articles.articleType, 'opinion')
          )
        )
      )
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt))
      .limit(6);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getPersonalizedFeed(userId: string, limit: number = 20): Promise<ArticleWithDetails[]> {
    const results = await db.execute(sql`
      WITH user_interests_weights AS (
        SELECT 
          category_id,
          weight
        FROM user_interests
        WHERE user_id = ${userId}
      ),
      recently_read_articles AS (
        SELECT article_id
        FROM reading_history
        WHERE user_id = ${userId}
          AND read_at > NOW() - INTERVAL '3 days'
      ),
      article_scores AS (
        SELECT 
          a.id,
          a.title,
          a.subtitle,
          a.slug,
          a.excerpt,
          a.image_url,
          a.thumbnail_url,
          a.infographic_banner_url,
          a.image_focal_point,
          a.category_id,
          a.author_id,
          a.reporter_id,
          a.article_type,
          a.news_type,
          a.publish_type,
          a.scheduled_at,
          a.status,
          a.hide_from_homepage,
          a.ai_summary,
          a.ai_generated,
          a.is_featured,
          a.display_order,
          a.views,
          a.seo,
          a.credibility_score,
          a.credibility_last_updated,
          a.source,
          a.source_url,
          a.is_publisher_news,
          a.publisher_id,
          a.published_at,
          a.created_at,
          a.updated_at,
          COALESCE(ui.weight, 0) as category_weight,
          COALESCE(
            CASE 
              WHEN a.published_at > NOW() - INTERVAL '7 days' 
              THEN 10 - EXTRACT(EPOCH FROM (NOW() - a.published_at)) / (86400.0 * 7) * 10
              ELSE 0
            END, 0
          ) as recency_score,
          COALESCE(a.views, 0) + COALESCE(
            (SELECT COUNT(*) FROM reactions r WHERE r.article_id = a.id), 0
          ) * 2 as popularity_score,
          (
            COALESCE(ui.weight, 0) * 10 +
            COALESCE(
              CASE 
                WHEN a.published_at > NOW() - INTERVAL '7 days' 
                THEN 10 - EXTRACT(EPOCH FROM (NOW() - a.published_at)) / (86400.0 * 7) * 10
                ELSE 0
              END, 0
            ) +
            COALESCE(a.views, 0) / 10.0 + COALESCE(
              (SELECT COUNT(*) FROM reactions r WHERE r.article_id = a.id), 0
            ) * 0.5
          ) as total_score
        FROM articles a
        LEFT JOIN user_interests_weights ui ON a.category_id = ui.category_id
        WHERE a.status = 'published'
          AND a.hide_from_homepage = false
          AND a.id NOT IN (SELECT article_id FROM recently_read_articles)
          AND (a.article_type IS NULL OR a.article_type != 'opinion')
          AND (
            EXISTS (SELECT 1 FROM user_interests_weights WHERE category_id = a.category_id)
            OR NOT EXISTS (SELECT 1 FROM user_interests_weights)
          )
        ORDER BY total_score DESC, a.published_at DESC
        LIMIT ${limit}
      )
      SELECT 
        ascores.*,
        ascores.thumbnail_url AS thumbnail_url,
        ascores.infographic_banner_url AS infographic_banner_url,
        c.id as category_id,
        c.name_ar as category_name_ar,
        c.name_en as category_name_en,
        c.slug as category_slug,
        c.description as category_description,
        c.color as category_color,
        c.icon as category_icon,
        c.hero_image_url as category_hero_image_url,
        c.display_order as category_display_order,
        c.status as category_status,
        c.created_at as category_created_at,
        u.id as author_id,
        u.email as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        u.bio as author_bio,
        u.phone_number as author_phone_number,
        u.profile_image_url as author_profile_image_url,
        u.role as author_role,
        u.status as author_status,
        u.is_profile_complete as author_is_profile_complete,
        u.created_at as author_created_at
      FROM article_scores ascores
      LEFT JOIN categories c ON ascores.category_id = c.id
      LEFT JOIN users u ON ascores.author_id = u.id
      ORDER BY ascores.total_score DESC, ascores.published_at DESC
    `);

    return (results.rows as any[]).map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      slug: row.slug,
      content: '',
      excerpt: row.excerpt,
      imageUrl: row.image_url,
      imageFocalPoint: row.image_focal_point || null,
      categoryId: row.category_id,
      authorId: row.author_id,
      reporterId: row.reporter_id,
      articleType: row.article_type,
      newsType: row.news_type,
      publishType: row.publish_type,
      scheduledAt: row.scheduled_at,
      status: row.status,
      reviewStatus: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      hideFromHomepage: row.hide_from_homepage,
      aiSummary: row.ai_summary,
      aiGenerated: row.ai_generated,
      isFeatured: row.is_featured,
      displayOrder: row.display_order || 0,
      views: row.views,
      seo: row.seo,
      seoMetadata: null,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      credibilityScore: row.credibility_score || null,
      credibilityAnalysis: null,
      credibilityLastUpdated: row.credibility_last_updated || null,
      source: row.source || 'manual',
      sourceMetadata: null,
      sourceUrl: row.source_url || null,
      verifiedBy: null,
      verifiedAt: null,
      thumbnailUrl: row.thumbnail_url || null,
      infographicBannerUrl: row.infographic_banner_url || null,
      isAiGeneratedImage: row.is_ai_generated_image || false,
      aiImageModel: row.ai_image_model || null,
      aiImagePrompt: row.ai_image_prompt || null,
      isAiGeneratedThumbnail: row.is_ai_generated_thumbnail || false,
      aiThumbnailModel: row.ai_thumbnail_model || null,
      aiThumbnailPrompt: row.ai_thumbnail_prompt || null,
      isPublisherContent: row.is_publisher_content || false,
      publisherStatus: row.publisher_status || null,
      publisherReviewedBy: row.publisher_reviewed_by || null,
      publisherReviewedAt: row.publisher_reviewed_at || null,
      publisherReviewNotes: row.publisher_review_notes || null,
      isPublisherNews: row.is_publisher_news || false,
      publisherId: row.publisher_id || null,
      publisherCreditDeducted: false,
      publisherSubmittedAt: null,
      publisherApprovedAt: null,
      publisherApprovedBy: null,
      category: row.category_id ? {
        id: row.category_id,
        nameAr: row.category_name_ar,
        nameEn: row.category_name_en,
        slug: row.category_slug,
        description: row.category_description,
        color: row.category_color,
        icon: row.category_icon,
        heroImageUrl: row.category_hero_image_url,
        displayOrder: row.category_display_order,
        status: row.category_status,
        createdAt: row.category_created_at,
      } : undefined,
      author: row.author_id ? {
        id: row.author_id,
        email: row.author_email,
        passwordHash: null,
        firstName: row.author_first_name,
        lastName: row.author_last_name,
        bio: row.author_bio,
        phoneNumber: row.author_phone_number,
        profileImageUrl: row.author_profile_image_url,
        role: row.author_role,
        status: row.author_status,
        isProfileComplete: row.author_is_profile_complete,
        emailVerified: row.author_email_verified || false,
        phoneVerified: row.author_phone_verified || false,
        verificationBadge: row.author_verification_badge || 'none',
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
        twoFactorMethod: 'authenticator',
        lastActivityAt: row.author_last_activity_at || null,
        suspendedUntil: row.author_suspended_until || null,
        suspensionReason: row.author_suspension_reason || null,
        bannedUntil: row.author_banned_until || null,
        banReason: row.author_ban_reason || null,
        accountLocked: row.author_account_locked || false,
        lockedUntil: row.author_locked_until || null,
        failedLoginAttempts: row.author_failed_login_attempts || 0,
        deletedAt: row.author_deleted_at || null,
        createdAt: row.author_created_at,
      } : undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getPersonalizedRecommendations(userId: string, limit: number = 20): Promise<ArticleWithDetails[]> {
    console.log(`[Smart Recommendations] Fetching personalized recommendations for user: ${userId}, limit: ${limit}`);
    
    const sanitizedLimit = Math.min(Math.max(limit, 1), 50);
    console.log(`[Smart Recommendations] Sanitized limit: ${sanitizedLimit}`);

    const results = await db.execute(sql`
      WITH user_reading_categories AS (
        SELECT 
          a.category_id,
          COUNT(*) as read_count
        FROM reading_history rh
        INNER JOIN articles a ON rh.article_id = a.id
        WHERE rh.user_id = ${userId}
          AND a.category_id IS NOT NULL
        GROUP BY a.category_id
        ORDER BY read_count DESC
        LIMIT 3
      ),
      user_interest_categories AS (
        SELECT 
          category_id,
          weight
        FROM user_interests
        WHERE user_id = ${userId}
      ),
      user_followed_authors AS (
        SELECT following_id as author_id
        FROM social_follows
        WHERE follower_id = ${userId}
      ),
      user_prefs AS (
        SELECT 
          preferred_categories,
          blocked_categories,
          preferred_authors
        FROM user_preferences
        WHERE user_id = ${userId}
        LIMIT 1
      ),
      already_read_articles AS (
        SELECT article_id
        FROM reading_history
        WHERE user_id = ${userId}
      ),
      scored_articles AS (
        SELECT 
          a.id,
          a.title,
          a.subtitle,
          a.slug,
          a.excerpt,
          a.image_url,
          a.thumbnail_url,
          a.infographic_banner_url,
          a.image_focal_point,
          a.category_id,
          a.author_id,
          a.reporter_id,
          a.article_type,
          a.news_type,
          a.publish_type,
          a.scheduled_at,
          a.status,
          a.hide_from_homepage,
          a.ai_summary,
          a.ai_generated,
          a.is_featured,
          a.display_order,
          a.views,
          a.seo,
          a.credibility_score,
          a.credibility_last_updated,
          a.source,
          a.source_url,
          a.is_publisher_news,
          a.publisher_id,
          a.published_at,
          a.created_at,
          a.updated_at,
          (
            CASE 
              WHEN a.category_id IN (SELECT category_id FROM user_reading_categories)
                OR a.category_id IN (SELECT category_id FROM user_interest_categories)
                OR (
                  SELECT preferred_categories @> ARRAY[a.category_id]::jsonb
                  FROM user_prefs
                  WHERE preferred_categories IS NOT NULL
                  LIMIT 1
                )
              THEN 10
              ELSE 0
            END
          ) as category_score,
          (
            CASE 
              WHEN a.author_id IN (SELECT author_id FROM user_followed_authors)
                OR a.reporter_id IN (SELECT author_id FROM user_followed_authors)
              THEN 15
              ELSE 0
            END
          ) as author_follow_score,
          (
            CASE 
              WHEN a.published_at > NOW() - INTERVAL '7 days'
              THEN 5
              ELSE 0
            END
          ) as recency_score,
          (
            CASE 
              WHEN a.views > 1000
              THEN 3
              ELSE 0
            END
          ) as high_views_score,
          (
            CASE 
              WHEN a.category_id IN (SELECT category_id FROM user_reading_categories)
                OR a.category_id IN (SELECT category_id FROM user_interest_categories)
                OR (
                  SELECT preferred_categories @> ARRAY[a.category_id]::jsonb
                  FROM user_prefs
                  WHERE preferred_categories IS NOT NULL
                  LIMIT 1
                )
              THEN 10
              ELSE 0
            END
            +
            CASE 
              WHEN a.author_id IN (SELECT author_id FROM user_followed_authors)
                OR a.reporter_id IN (SELECT author_id FROM user_followed_authors)
              THEN 15
              ELSE 0
            END
            +
            CASE 
              WHEN a.published_at > NOW() - INTERVAL '7 days'
              THEN 5
              ELSE 0
            END
            +
            CASE 
              WHEN a.views > 1000
              THEN 3
              ELSE 0
            END
          ) as total_score
        FROM articles a
        WHERE a.status = 'published'
          AND a.hide_from_homepage = false
          AND a.id NOT IN (SELECT article_id FROM already_read_articles)
          AND (
            a.published_at > NOW() - INTERVAL '30 days'
            OR a.views > 10000
          )
          AND NOT EXISTS (
            SELECT 1 FROM user_prefs up
            WHERE up.blocked_categories IS NOT NULL
              AND up.blocked_categories @> ARRAY[a.category_id]::jsonb
          )
        ORDER BY total_score DESC, a.published_at DESC
        LIMIT ${sanitizedLimit}
      )
      SELECT 
        sa.*,
        sa.thumbnail_url AS thumbnail_url,
        sa.infographic_banner_url AS infographic_banner_url,
        c.id as category_id,
        c.name_ar as category_name_ar,
        c.name_en as category_name_en,
        c.slug as category_slug,
        c.description as category_description,
        c.color as category_color,
        c.icon as category_icon,
        c.hero_image_url as category_hero_image_url,
        c.display_order as category_display_order,
        c.status as category_status,
        c.created_at as category_created_at,
        u.id as author_id,
        u.email as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        u.bio as author_bio,
        u.phone_number as author_phone_number,
        u.profile_image_url as author_profile_image_url,
        u.role as author_role,
        u.status as author_status,
        u.is_profile_complete as author_is_profile_complete,
        u.email_verified as author_email_verified,
        u.phone_verified as author_phone_verified,
        u.verification_badge as author_verification_badge,
        u.created_at as author_created_at,
        r.id as reporter_id,
        r.email as reporter_email,
        r.first_name as reporter_first_name,
        r.last_name as reporter_last_name,
        r.bio as reporter_bio,
        r.phone_number as reporter_phone_number,
        r.profile_image_url as reporter_profile_image_url,
        r.role as reporter_role,
        r.status as reporter_status,
        r.is_profile_complete as reporter_is_profile_complete,
        r.email_verified as reporter_email_verified,
        r.phone_verified as reporter_phone_verified,
        r.verification_badge as reporter_verification_badge,
        r.created_at as reporter_created_at
      FROM scored_articles sa
      LEFT JOIN categories c ON sa.category_id = c.id
      LEFT JOIN users u ON sa.author_id = u.id
      LEFT JOIN users r ON sa.reporter_id = r.id
      ORDER BY sa.total_score DESC, sa.published_at DESC
    `);

    console.log(`[Smart Recommendations] Found ${results.rows.length} recommendations for user ${userId}`);

    return (results.rows as any[]).map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      slug: row.slug,
      content: '',
      excerpt: row.excerpt,
      imageUrl: row.image_url,
      imageFocalPoint: row.image_focal_point || null,
      categoryId: row.category_id,
      authorId: row.author_id,
      reporterId: row.reporter_id,
      articleType: row.article_type,
      newsType: row.news_type,
      publishType: row.publish_type,
      scheduledAt: row.scheduled_at,
      status: row.status,
      reviewStatus: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      hideFromHomepage: row.hide_from_homepage,
      aiSummary: row.ai_summary,
      aiGenerated: row.ai_generated,
      isFeatured: row.is_featured,
      displayOrder: row.display_order || 0,
      views: row.views,
      seo: row.seo,
      seoMetadata: null,
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      credibilityScore: row.credibility_score || null,
      credibilityAnalysis: null,
      credibilityLastUpdated: row.credibility_last_updated || null,
      source: row.source || 'manual',
      sourceMetadata: null,
      sourceUrl: row.source_url || null,
      verifiedBy: null,
      verifiedAt: null,
      thumbnailUrl: row.thumbnail_url || null,
      infographicBannerUrl: row.infographic_banner_url || null,
      isAiGeneratedImage: row.is_ai_generated_image || false,
      aiImageModel: row.ai_image_model || null,
      aiImagePrompt: row.ai_image_prompt || null,
      isAiGeneratedThumbnail: row.is_ai_generated_thumbnail || false,
      aiThumbnailModel: row.ai_thumbnail_model || null,
      aiThumbnailPrompt: row.ai_thumbnail_prompt || null,
      isPublisherContent: row.is_publisher_content || false,
      publisherStatus: row.publisher_status || null,
      publisherReviewedBy: row.publisher_reviewed_by || null,
      publisherReviewedAt: row.publisher_reviewed_at || null,
      publisherReviewNotes: row.publisher_review_notes || null,
      isPublisherNews: row.is_publisher_news || false,
      publisherId: row.publisher_id || null,
      publisherCreditDeducted: false,
      publisherSubmittedAt: null,
      publisherApprovedAt: null,
      publisherApprovedBy: null,
      category: row.category_id ? {
        id: row.category_id,
        nameAr: row.category_name_ar,
        nameEn: row.category_name_en,
        slug: row.category_slug,
        description: row.category_description,
        color: row.category_color,
        icon: row.category_icon,
        heroImageUrl: row.category_hero_image_url,
        displayOrder: row.category_display_order,
        status: row.category_status,
        createdAt: row.category_created_at,
      } : undefined,
      author: row.author_id ? {
        id: row.author_id,
        email: row.author_email,
        passwordHash: null,
        firstName: row.author_first_name,
        lastName: row.author_last_name,
        bio: row.author_bio,
        phoneNumber: row.author_phone_number,
        profileImageUrl: row.author_profile_image_url,
        role: row.author_role,
        status: row.author_status,
        isProfileComplete: row.author_is_profile_complete,
        emailVerified: row.author_email_verified || false,
        phoneVerified: row.author_phone_verified || false,
        verificationBadge: row.author_verification_badge || 'none',
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
        twoFactorMethod: 'authenticator',
        lastActivityAt: null,
        suspendedUntil: null,
        suspensionReason: null,
        bannedUntil: null,
        banReason: null,
        accountLocked: false,
        lockedUntil: null,
        failedLoginAttempts: 0,
        deletedAt: null,
        authProvider: 'local',
        googleId: null,
        appleId: null,
        firstNameEn: null,
        lastNameEn: null,
        allowedLanguages: ['ar'],
        createdAt: row.author_created_at,
      } : row.reporter_id ? {
        id: row.reporter_id,
        email: row.reporter_email,
        passwordHash: null,
        firstName: row.reporter_first_name,
        lastName: row.reporter_last_name,
        bio: row.reporter_bio,
        phoneNumber: row.reporter_phone_number,
        profileImageUrl: row.reporter_profile_image_url,
        role: row.reporter_role,
        status: row.reporter_status,
        isProfileComplete: row.reporter_is_profile_complete,
        emailVerified: row.reporter_email_verified || false,
        phoneVerified: row.reporter_phone_verified || false,
        verificationBadge: row.reporter_verification_badge || 'none',
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
        twoFactorMethod: 'authenticator',
        lastActivityAt: null,
        suspendedUntil: null,
        suspensionReason: null,
        bannedUntil: null,
        banReason: null,
        accountLocked: false,
        lockedUntil: null,
        failedLoginAttempts: 0,
        deletedAt: null,
        authProvider: 'local',
        googleId: null,
        appleId: null,
        firstNameEn: null,
        lastNameEn: null,
        allowedLanguages: ['ar'],
        createdAt: row.reporter_created_at,
      } : undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getContinueReading(userId: string, limit: number = 5): Promise<Array<ArticleWithDetails & { progress: number; lastReadAt: Date }>> {
    // Use raw SQL with DISTINCT ON to get unique articles with their max progress
    const query = sql`
      WITH article_progress AS (
        SELECT DISTINCT ON (rh.article_id)
          rh.article_id,
          GREATEST(
            COALESCE(MAX(rh.scroll_depth) OVER (PARTITION BY rh.article_id), 0),
            COALESCE(MAX(rh.completion_rate) OVER (PARTITION BY rh.article_id), 0)
          ) as max_progress,
          rh.read_at as last_read_at
        FROM reading_history rh
        WHERE rh.user_id = ${userId}
          AND rh.read_at > NOW() - INTERVAL '14 days'
        ORDER BY rh.article_id, rh.read_at DESC
      )
      SELECT 
        a.id, a.title, a.subtitle, a.slug, a.english_slug, a.excerpt,
        a.image_url, a.thumbnail_url, a.infographic_banner_url, a.image_focal_point,
        a.category_id, a.author_id, a.reporter_id, a.article_type, a.news_type,
        a.status, a.hide_from_homepage, a.ai_summary, a.ai_generated,
        a.is_featured, a.display_order, a.views, a.seo, a.credibility_score,
        a.source, a.source_url, a.is_ai_generated_image, a.is_ai_generated_thumbnail,
        a.is_publisher_content, a.is_publisher_news, a.publisher_id, a.publisher_status,
        a.published_at, a.created_at, a.updated_at,
        c.id as category_id,
        c.name_ar as category_name_ar,
        c.name_en as category_name_en,
        c.slug as category_slug,
        c.description as category_description,
        c.color as category_color,
        c.icon as category_icon,
        c.hero_image_url as category_hero_image_url,
        c.display_order as category_display_order,
        c.status as category_status,
        c.created_at as category_created_at,
        u.id as author_id,
        u.email as author_email,
        u.first_name as author_first_name,
        u.last_name as author_last_name,
        u.bio as author_bio,
        u.phone_number as author_phone_number,
        u.profile_image_url as author_profile_image_url,
        u.role as author_role,
        u.status as author_status,
        u.is_profile_complete as author_is_profile_complete,
        u.email_verified as author_email_verified,
        u.phone_verified as author_phone_verified,
        u.verification_badge as author_verification_badge,
        u.created_at as author_created_at,
        r.id as reporter_id,
        r.email as reporter_email,
        r.first_name as reporter_first_name,
        r.last_name as reporter_last_name,
        r.bio as reporter_bio,
        r.phone_number as reporter_phone_number,
        r.profile_image_url as reporter_profile_image_url,
        r.role as reporter_role,
        r.status as reporter_status,
        r.is_profile_complete as reporter_is_profile_complete,
        r.email_verified as reporter_email_verified,
        r.phone_verified as reporter_phone_verified,
        r.verification_badge as reporter_verification_badge,
        r.created_at as reporter_created_at,
        ap.max_progress as progress,
        ap.last_read_at
      FROM article_progress ap
      INNER JOIN articles a ON a.id = ap.article_id
      LEFT JOIN categories c ON c.id = a.category_id
      LEFT JOIN users u ON u.id = a.author_id
      LEFT JOIN users r ON r.id = a.reporter_id
      LEFT JOIN dismissed_continue_reading dcr ON dcr.article_id = ap.article_id AND dcr.user_id = ${userId}
      WHERE a.status = 'published'
        AND ap.max_progress < 75
        AND dcr.id IS NULL
      ORDER BY ap.last_read_at DESC
      LIMIT ${limit}
    `;
    
    const results = await db.execute(query);
    
    return (results.rows as any[]).map((row) => ({
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      slug: row.slug,
      content: '',
      excerpt: row.excerpt,
      imageUrl: row.image_url,
      imageFocalPoint: row.image_focal_point,
      categoryId: row.category_id,
      authorId: row.author_id,
      reporterId: row.reporter_id,
      articleType: row.article_type,
      newsType: row.news_type,
      publishType: row.publish_type,
      scheduledAt: row.scheduled_at,
      status: row.status,
      reviewStatus: null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      hideFromHomepage: row.hide_from_homepage,
      aiSummary: row.ai_summary,
      aiGenerated: row.ai_generated,
      isFeatured: row.is_featured,
      displayOrder: row.display_order,
      views: row.views,
      seo: row.seo,
      seoMetadata: null,
      credibilityScore: row.credibility_score,
      credibilityAnalysis: null,
      credibilityLastUpdated: row.credibility_last_updated,
      source: row.source,
      sourceMetadata: null,
      sourceUrl: row.source_url,
      verifiedBy: null,
      verifiedAt: null,
      thumbnailUrl: row.thumbnail_url,
      isAiGeneratedImage: row.is_ai_generated_image,
      aiImageModel: row.ai_image_model,
      aiImagePrompt: row.ai_image_prompt,
      isAiGeneratedThumbnail: row.is_ai_generated_thumbnail,
      aiThumbnailModel: row.ai_thumbnail_model,
      aiThumbnailPrompt: row.ai_thumbnail_prompt,
      isPublisherContent: row.is_publisher_content || false,
      publisherStatus: row.publisher_status || null,
      publisherReviewedBy: row.publisher_reviewed_by || null,
      publisherReviewedAt: row.publisher_reviewed_at || null,
      publisherReviewNotes: row.publisher_review_notes || null,
      isPublisherNews: row.is_publisher_news || false,
      publisherId: row.publisher_id || null,
      publisherCreditDeducted: false,
      publisherSubmittedAt: null,
      publisherApprovedAt: null,
      publisherApprovedBy: null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      category: row.category_id ? {
        id: row.category_id,
        nameAr: row.category_name_ar,
        nameEn: row.category_name_en,
        slug: row.category_slug,
        description: row.category_description,
        color: row.category_color,
        icon: row.category_icon,
        heroImageUrl: row.category_hero_image_url,
        displayOrder: row.category_display_order,
        status: row.category_status,
        createdAt: row.category_created_at,
      } : undefined,
      author: row.author_id ? {
        id: row.author_id,
        email: row.author_email,
        passwordHash: null,
        firstName: row.author_first_name,
        lastName: row.author_last_name,
        bio: row.author_bio,
        phoneNumber: row.author_phone_number,
        profileImageUrl: row.author_profile_image_url,
        role: row.author_role,
        status: row.author_status,
        isProfileComplete: row.author_is_profile_complete,
        emailVerified: row.author_email_verified || false,
        phoneVerified: row.author_phone_verified || false,
        verificationBadge: row.author_verification_badge || 'none',
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
        twoFactorMethod: 'authenticator',
        lastActivityAt: null,
        suspendedUntil: null,
        suspensionReason: null,
        bannedUntil: null,
        banReason: null,
        accountLocked: false,
        lockedUntil: null,
        failedLoginAttempts: 0,
        deletedAt: null,
        authProvider: 'local',
        googleId: null,
        appleId: null,
        firstNameEn: null,
        lastNameEn: null,
        allowedLanguages: ['ar'],
        createdAt: row.author_created_at,
      } : row.reporter_id ? {
        id: row.reporter_id,
        email: row.reporter_email,
        passwordHash: null,
        firstName: row.reporter_first_name,
        lastName: row.reporter_last_name,
        bio: row.reporter_bio,
        phoneNumber: row.reporter_phone_number,
        profileImageUrl: row.reporter_profile_image_url,
        role: row.reporter_role,
        status: row.reporter_status,
        isProfileComplete: row.reporter_is_profile_complete,
        emailVerified: row.reporter_email_verified || false,
        phoneVerified: row.reporter_phone_verified || false,
        verificationBadge: row.reporter_verification_badge || 'none',
        twoFactorSecret: null,
        twoFactorEnabled: false,
        twoFactorBackupCodes: null,
        twoFactorMethod: 'authenticator',
        lastActivityAt: null,
        suspendedUntil: null,
        suspensionReason: null,
        bannedUntil: null,
        banReason: null,
        accountLocked: false,
        lockedUntil: null,
        failedLoginAttempts: 0,
        deletedAt: null,
        authProvider: 'local',
        googleId: null,
        appleId: null,
        firstNameEn: null,
        lastNameEn: null,
        allowedLanguages: ['ar'],
        createdAt: row.reporter_created_at,
      } : undefined,
      progress: Math.round(Number(row.progress) || 0),
      lastReadAt: row.last_read_at,
    })) as Array<ArticleWithDetails & { progress: number; lastReadAt: Date }>;
  }

  async dismissContinueReading(userId: string, articleId: string): Promise<void> {
    await db.insert(dismissedContinueReading).values({
      userId,
      articleId,
    }).onConflictDoNothing();
  }

  async clearAllContinueReading(userId: string): Promise<void> {
    // Get all articles the user has in their continue reading (unfinished articles)
    const continueReadingArticles = await this.getContinueReading(userId, 100);
    
    if (continueReadingArticles.length === 0) return;
    
    // Insert all articles as dismissed
    const valuesToInsert = continueReadingArticles.map(article => ({
      userId,
      articleId: article.id,
    }));
    
    await db.insert(dismissedContinueReading)
      .values(valuesToInsert)
      .onConflictDoNothing();
  }

  // ============================================
  // USER SEGMENTS & PERSONALIZATION OPERATIONS
  // ============================================

  async getUserFullPreferences(userId: string): Promise<UserPreference | undefined> {
    const [result] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    return result;
  }

  async updateUserFullPreferences(userId: string, prefs: Partial<InsertUserPreference>): Promise<UserPreference> {
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...prefs,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userPreferences)
        .values({
          userId,
          ...prefs,
        })
        .returning();
      return created;
    }
  }

  async getUserCategoryInterests(userId: string): Promise<Array<{categoryId: string; weight: number; category?: Category}>> {
    const results = await db
      .select({
        categoryId: userInterests.categoryId,
        weight: userInterests.weight,
        category: categories,
      })
      .from(userInterests)
      .leftJoin(categories, eq(userInterests.categoryId, categories.id))
      .where(eq(userInterests.userId, userId))
      .orderBy(desc(userInterests.weight));

    return results.map(r => ({
      categoryId: r.categoryId,
      weight: r.weight,
      category: r.category || undefined,
    }));
  }

  async setUserCategoryInterests(userId: string, interests: Array<{categoryId: string; weight?: number}>): Promise<void> {
    await db.delete(userInterests).where(eq(userInterests.userId, userId));

    if (interests.length > 0) {
      const valuesToInsert = interests.map(interest => ({
        userId,
        categoryId: interest.categoryId,
        weight: interest.weight ?? 1.0,
      }));
      await db.insert(userInterests).values(valuesToInsert);
    }
  }

  async getUserActivitySummary(userId: string): Promise<UserActivitySummary | undefined> {
    const [result] = await db
      .select()
      .from(userActivitySummary)
      .where(eq(userActivitySummary.userId, userId))
      .limit(1);
    return result;
  }

  async updateUserActivitySummary(userId: string): Promise<UserActivitySummary> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalArticlesResult] = await db
      .select({ count: count() })
      .from(readingHistory)
      .where(eq(readingHistory.userId, userId));

    const [last7DaysResult] = await db
      .select({ count: count() })
      .from(readingHistory)
      .where(and(
        eq(readingHistory.userId, userId),
        gte(readingHistory.readAt, sevenDaysAgo)
      ));

    const [last30DaysResult] = await db
      .select({ count: count() })
      .from(readingHistory)
      .where(and(
        eq(readingHistory.userId, userId),
        gte(readingHistory.readAt, thirtyDaysAgo)
      ));

    const [commentsResult] = await db
      .select({ count: count() })
      .from(comments)
      .where(eq(comments.userId, userId));

    const [reactionsResult] = await db
      .select({ count: count() })
      .from(reactions)
      .where(eq(reactions.userId, userId));

    const [bookmarksResult] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId));

    // Calculate recency-weighted category stats
    // Weight: last 7 days = 3x, last 30 days = 1.5x, older = 1x
    const categoryStatsWithRecency = await db
      .select({
        categoryId: articles.categoryId,
        readAt: readingHistory.readAt,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .where(eq(readingHistory.userId, userId));

    // Apply recency weights to calculate weighted category scores
    const categoryWeights: Record<string, { count: number; weightedScore: number }> = {};
    for (const entry of categoryStatsWithRecency) {
      if (!entry.categoryId) continue;
      
      let recencyWeight = 1.0; // Default: older than 30 days
      if (entry.readAt && entry.readAt >= sevenDaysAgo) {
        recencyWeight = 3.0; // Last 7 days
      } else if (entry.readAt && entry.readAt >= thirtyDaysAgo) {
        recencyWeight = 1.5; // Last 30 days
      }
      
      if (!categoryWeights[entry.categoryId]) {
        categoryWeights[entry.categoryId] = { count: 0, weightedScore: 0 };
      }
      categoryWeights[entry.categoryId].count++;
      categoryWeights[entry.categoryId].weightedScore += recencyWeight;
    }

    // Sort by weighted score and take top 5
    const sortedCategories = Object.entries(categoryWeights)
      .map(([categoryId, data]) => ({
        categoryId,
        count: data.count,
        weightedScore: data.weightedScore,
      }))
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, 5);

    const totalWeightedScore = sortedCategories.reduce((sum, c) => sum + c.weightedScore, 0);
    const topCategories = sortedCategories.map(c => ({
      categoryId: c.categoryId,
      count: c.count,
      weight: totalWeightedScore > 0 ? c.weightedScore / totalWeightedScore : 0,
    }));

    const articlesLast7 = last7DaysResult?.count ?? 0;
    let activityLevel: string = 'new';
    if (articlesLast7 >= 20) activityLevel = 'high';
    else if (articlesLast7 >= 7) activityLevel = 'medium';
    else if (articlesLast7 >= 1) activityLevel = 'low';
    else if ((totalArticlesResult?.count ?? 0) > 0) activityLevel = 'dormant';

    const [lastBehavior] = await db
      .select()
      .from(behaviorLogs)
      .where(eq(behaviorLogs.userId, userId))
      .orderBy(desc(behaviorLogs.createdAt))
      .limit(1);

    const summaryData = {
      userId,
      totalArticlesRead: totalArticlesResult?.count ?? 0,
      articlesReadLast7Days: articlesLast7,
      articlesReadLast30Days: last30DaysResult?.count ?? 0,
      avgReadingTimeSeconds: 0,
      totalComments: commentsResult?.count ?? 0,
      totalReactions: reactionsResult?.count ?? 0,
      totalBookmarks: bookmarksResult?.count ?? 0,
      topCategories,
      activityLevel,
      lastActiveAt: lastBehavior?.createdAt || now,
      updatedAt: now,
    };

    const [existing] = await db
      .select()
      .from(userActivitySummary)
      .where(eq(userActivitySummary.userId, userId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(userActivitySummary)
        .set(summaryData)
        .where(eq(userActivitySummary.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(userActivitySummary)
        .values(summaryData)
        .returning();
      return created;
    }
  }

  async getUserSegments(userId: string): Promise<Array<UserSegmentDefinition & {score: number; assignedAt: Date}>> {
    const results = await db
      .select({
        segment: userSegmentDefinitions,
        score: userSegmentAssignments.score,
        assignedAt: userSegmentAssignments.assignedAt,
      })
      .from(userSegmentAssignments)
      .innerJoin(userSegmentDefinitions, eq(userSegmentAssignments.segmentId, userSegmentDefinitions.id))
      .where(and(
        eq(userSegmentAssignments.userId, userId),
        or(
          isNull(userSegmentAssignments.expiresAt),
          gte(userSegmentAssignments.expiresAt, new Date())
        )
      ))
      .orderBy(desc(userSegmentDefinitions.priority));

    return results.map(r => ({
      ...r.segment,
      score: r.score,
      assignedAt: r.assignedAt,
    }));
  }

  async getAllSegmentDefinitions(): Promise<UserSegmentDefinition[]> {
    return db
      .select()
      .from(userSegmentDefinitions)
      .orderBy(desc(userSegmentDefinitions.priority), asc(userSegmentDefinitions.name));
  }

  async createSegmentDefinition(segment: InsertUserSegmentDefinition): Promise<UserSegmentDefinition> {
    const [created] = await db
      .insert(userSegmentDefinitions)
      .values(segment)
      .returning();
    return created;
  }

  async assignUserToSegment(userId: string, segmentId: string, score: number = 1.0): Promise<void> {
    await db
      .insert(userSegmentAssignments)
      .values({
        userId,
        segmentId,
        score,
        metadata: { source: 'manual' },
      })
      .onConflictDoNothing();
  }

  async removeUserFromSegment(userId: string, segmentId: string): Promise<void> {
    await db
      .delete(userSegmentAssignments)
      .where(and(
        eq(userSegmentAssignments.userId, userId),
        eq(userSegmentAssignments.segmentId, segmentId)
      ));
  }

  async recalculateUserSegments(userId: string): Promise<void> {
    const summary = await this.updateUserActivitySummary(userId);
    const allSegments = await db
      .select()
      .from(userSegmentDefinitions)
      .where(eq(userSegmentDefinitions.isActive, true));

    // Get recency-weighted category interests for segment matching
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Calculate recency-weighted category interests from reading history
    const readingEntries = await db
      .select({
        categoryId: articles.categoryId,
        readAt: readingHistory.readAt,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .where(eq(readingHistory.userId, userId));

    // Apply recency weights: 7 days = 3x, 30 days = 1.5x, older = 1x
    const categoryWeightedScores: Record<string, number> = {};
    for (const entry of readingEntries) {
      if (!entry.categoryId) continue;
      
      let recencyWeight = 1.0;
      if (entry.readAt && entry.readAt >= sevenDaysAgo) {
        recencyWeight = 3.0;
      } else if (entry.readAt && entry.readAt >= thirtyDaysAgo) {
        recencyWeight = 1.5;
      }
      
      categoryWeightedScores[entry.categoryId] = (categoryWeightedScores[entry.categoryId] || 0) + recencyWeight;
    }

    // Get user interests from explicit preferences
    const userInterestsList = await this.getUserInterests(userId);
    const userCategoryIds = [
      ...userInterestsList.map(i => (i as any).categoryId),
      ...Object.keys(categoryWeightedScores),
    ];
    const uniqueCategoryIds = [...new Set(userCategoryIds)];

    for (const segment of allSegments) {
      const rules = segment.rules as {
        minArticlesRead?: number;
        maxArticlesRead?: number;
        preferredCategories?: string[];
        activityLevel?: 'high' | 'medium' | 'low' | 'dormant';
        lastActiveWithinDays?: number;
        deviceTypes?: string[];
        regions?: string[];
      } | null;

      if (!rules) continue;

      let matches = true;
      let score = 1.0;

      if (rules.minArticlesRead !== undefined && summary.totalArticlesRead < rules.minArticlesRead) {
        matches = false;
      }
      if (rules.maxArticlesRead !== undefined && summary.totalArticlesRead > rules.maxArticlesRead) {
        matches = false;
      }
      if (rules.activityLevel && summary.activityLevel !== rules.activityLevel) {
        matches = false;
      }
      if (rules.lastActiveWithinDays !== undefined) {
        const cutoff = new Date(Date.now() - rules.lastActiveWithinDays * 24 * 60 * 60 * 1000);
        if (!summary.lastActiveAt || summary.lastActiveAt < cutoff) {
          matches = false;
        }
      }
      if (rules.preferredCategories && rules.preferredCategories.length > 0) {
        // Use recency-weighted scoring for category matching
        const matchingCategories = rules.preferredCategories.filter(c => uniqueCategoryIds.includes(c));
        if (matchingCategories.length === 0) {
          matches = false;
        } else {
          // Calculate weighted score based on recency
          let totalRecencyScore = 0;
          for (const catId of matchingCategories) {
            totalRecencyScore += categoryWeightedScores[catId] || 1.0;
          }
          // Normalize by max possible score (if all categories matched with 3x weight)
          const maxPossibleScore = rules.preferredCategories.length * 3.0;
          score = Math.min(1.0, totalRecencyScore / maxPossibleScore);
        }
      }
      if (rules.regions && rules.regions.length > 0 && summary.primaryRegion) {
        if (!rules.regions.includes(summary.primaryRegion)) {
          matches = false;
        }
      }
      if (rules.deviceTypes && rules.deviceTypes.length > 0 && summary.lastDeviceType) {
        if (!rules.deviceTypes.includes(summary.lastDeviceType)) {
          matches = false;
        }
      }

      if (matches) {
        await db
          .insert(userSegmentAssignments)
          .values({
            userId,
            segmentId: segment.id,
            score,
            metadata: { source: 'auto', recencyWeighted: true },
          } as any)
          .onConflictDoNothing();
      } else {
        await db
          .delete(userSegmentAssignments)
          .where(and(
            eq(userSegmentAssignments.userId, userId),
            eq(userSegmentAssignments.segmentId, segment.id)
          ));
      }
    }
  }

  async trackUserEngagement(
    userId: string,
    articleId: string,
    engagementType: 'read' | 'like' | 'bookmark' | 'comment' | 'share',
    categoryId?: string
  ): Promise<void> {
    const now = new Date();
    
    // Get the article's category if not provided
    let actualCategoryId = categoryId;
    if (!actualCategoryId) {
      const [article] = await db
        .select({ categoryId: articles.categoryId })
        .from(articles)
        .where(eq(articles.id, articleId))
        .limit(1);
      actualCategoryId = article?.categoryId || undefined;
    }

    // Record engagement based on type using existing tables
    switch (engagementType) {
      case 'read':
        await this.recordArticleRead(userId, articleId, 0);
        break;
      case 'like':
        await db
          .insert(reactions)
          .values({ articleId, userId })
          .onConflictDoNothing();
        break;
      case 'bookmark':
        await db
          .insert(bookmarks)
          .values({ articleId, userId })
          .onConflictDoNothing();
        break;
      case 'comment':
        // Comments are handled separately through createComment method
        // This just updates the activity summary
        break;
      case 'share':
        // Track share as a behavior log entry
        await db
          .insert(behaviorLogs)
          .values({
            userId,
            sessionId: `session_${userId}_${Date.now()}`,
            eventType: 'share',
            eventData: { articleId, categoryId: actualCategoryId },
            createdAt: now,
          } as any);
        break;
    }

    // Update real-time activity counters by refreshing the activity summary
    await this.updateUserActivitySummary(userId);
  }

  async getUserActivitySummaryWithRecency(userId: string): Promise<{
    summary: UserActivitySummary | undefined;
    weightedMetrics: {
      weightedArticleCount: number;
      trendingInterests: Array<{categoryId: string; name?: string; score: number}>;
      longTermInterests: Array<{categoryId: string; name?: string; score: number}>;
      recentEngagementScore: number;
    };
  }> {
    const summary = await this.getUserActivitySummary(userId);
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get all reading history with timestamps and categories
    const readingEntries = await db
      .select({
        categoryId: articles.categoryId,
        categoryName: categories.nameAr,
        readAt: readingHistory.readAt,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(eq(readingHistory.userId, userId));

    // Calculate weighted article count and category interests by time period
    let weightedArticleCount = 0;
    const recentCategoryScores: Record<string, { score: number; name?: string }> = {};
    const longTermCategoryScores: Record<string, { score: number; name?: string }> = {};

    for (const entry of readingEntries) {
      let recencyWeight = 1.0;
      const isRecent = entry.readAt && entry.readAt >= sevenDaysAgo;
      const isMidTerm = entry.readAt && entry.readAt >= thirtyDaysAgo && entry.readAt < sevenDaysAgo;
      const isOlder = !entry.readAt || entry.readAt < thirtyDaysAgo;

      if (isRecent) {
        recencyWeight = 3.0;
      } else if (isMidTerm) {
        recencyWeight = 1.5;
      }

      weightedArticleCount += recencyWeight;

      if (entry.categoryId) {
        // Trending interests: weighted heavily towards recent (7 days)
        if (isRecent) {
          if (!recentCategoryScores[entry.categoryId]) {
            recentCategoryScores[entry.categoryId] = { score: 0, name: entry.categoryName || undefined };
          }
          recentCategoryScores[entry.categoryId].score += 3.0;
        }

        // Long-term interests: older articles with less weight for very recent
        if (!longTermCategoryScores[entry.categoryId]) {
          longTermCategoryScores[entry.categoryId] = { score: 0, name: entry.categoryName || undefined };
        }
        // For long-term, older articles count more, recent less
        const longTermWeight = isOlder ? 2.0 : (isMidTerm ? 1.5 : 0.5);
        longTermCategoryScores[entry.categoryId].score += longTermWeight;
      }
    }

    // Calculate recent engagement score from reactions, bookmarks, comments in last 7 days
    const [recentReactions] = await db
      .select({ count: count() })
      .from(reactions)
      .where(and(
        eq(reactions.userId, userId),
        gte(reactions.createdAt, sevenDaysAgo)
      ));

    const [recentBookmarks] = await db
      .select({ count: count() })
      .from(bookmarks)
      .where(and(
        eq(bookmarks.userId, userId),
        gte(bookmarks.createdAt, sevenDaysAgo)
      ));

    const [recentComments] = await db
      .select({ count: count() })
      .from(comments)
      .where(and(
        eq(comments.userId, userId),
        gte(comments.createdAt, sevenDaysAgo)
      ));

    const recentEngagementScore = 
      (recentReactions?.count ?? 0) * 1 +
      (recentBookmarks?.count ?? 0) * 2 +
      (recentComments?.count ?? 0) * 3;

    // Sort and format trending interests
    const trendingInterests = Object.entries(recentCategoryScores)
      .map(([categoryId, data]) => ({
        categoryId,
        name: data.name,
        score: data.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Sort and format long-term interests
    const longTermInterests = Object.entries(longTermCategoryScores)
      .map(([categoryId, data]) => ({
        categoryId,
        name: data.name,
        score: data.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      summary,
      weightedMetrics: {
        weightedArticleCount,
        trendingInterests,
        longTermInterests,
        recentEngagementScore,
      },
    };
  }

  async getHeroArticles(): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
        story: stories,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .leftJoin(storyLinks, eq(articles.id, storyLinks.articleId))
      .leftJoin(stories, eq(storyLinks.storyId, stories.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false),
          or(
            eq(articles.newsType, "breaking"),
            eq(articles.isFeatured, true)
          ),
          or(
            isNull(articles.articleType),
            ne(articles.articleType, 'opinion'),
            eq(articles.isFeatured, true)
          ),
          // المحتوى المولّد آليًا لا يدخل الكروسيل إلا بتمييز محرر صريح
          or(
            isNull(articles.aiGenerated),
            eq(articles.aiGenerated, false),
            eq(articles.isFeatured, true)
          )
        )
      )
      // التمييز من بعض المسارات (iOS الإداري) لا يختم displayOrder فيبقى 0
      // ويغرق تحت المختومين — GREATEST يساوي غير المختوم بحداثة نشره/إنعاشه
      // (displayOrder المختوم = ثوانٍ يونكس، نفس مقياس EPOCH)
      .orderBy(
        desc(sql`GREATEST(COALESCE(${articles.displayOrder}, 0), EXTRACT(EPOCH FROM COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})))`),
        desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`),
        desc(articles.views)
      )
      .limit(3);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      storyId: r.story?.id || undefined,
      storyTitle: r.story?.title || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getBreakingNews(limit: number = 5): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
        story: stories,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .leftJoin(storyLinks, eq(articles.id, storyLinks.articleId))
      .leftJoin(stories, eq(storyLinks.storyId, stories.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false),
          or(
            isNull(articles.articleType),
            ne(articles.articleType, 'opinion')
          ),
          or(
            isNull(articles.aiGenerated),
            eq(articles.aiGenerated, false)
          )
        )
      )
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      storyId: r.story?.id || undefined,
      storyTitle: r.story?.title || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getAllPublishedArticles(limit: number = 20, offset: number = 0): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
        story: stories,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .leftJoin(storyLinks, eq(articles.id, storyLinks.articleId))
      .leftJoin(stories, eq(storyLinks.storyId, stories.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false),
          or(
            isNull(articles.articleType),
            ne(articles.articleType, "opinion")
          ),
          or(
            isNull(articles.aiGenerated),
            eq(articles.aiGenerated, false)
          )
        )
      )
      // «إنعاش»: COALESCE يقدّم الخبر المُنعش دون تغيير تاريخ نشره الظاهر
      .orderBy(desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`), desc(articles.createdAt))
      .limit(limit * 3)
      .offset(offset);

    const seenIds = new Set<string>();
    const uniqueResults = results.filter((r) => {
      if (seenIds.has(r.article.id)) return false;
      seenIds.add(r.article.id);
      return true;
    }).slice(0, limit);

    return uniqueResults.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      storyId: r.story?.id || undefined,
      storyTitle: r.story?.title || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getEditorPicks(limit: number = 6): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
        story: stories,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .leftJoin(storyLinks, eq(articles.id, storyLinks.articleId))
      .leftJoin(stories, eq(storyLinks.storyId, stories.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false),
          or(
            isNull(articles.articleType),
            ne(articles.articleType, 'opinion')
          ),
          or(
            isNull(articles.aiGenerated),
            eq(articles.aiGenerated, false)
          )
        )
      )
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt), desc(articles.views))
      .limit(limit);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      storyId: r.story?.id || undefined,
      storyTitle: r.story?.title || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getDeepDiveArticles(limit: number = 6): Promise<ArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
        story: stories,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .leftJoin(storyLinks, eq(articles.id, storyLinks.articleId))
      .leftJoin(stories, eq(storyLinks.storyId, stories.id))
      .where(and(
        eq(articles.status, "published"),
        eq(articles.hideFromHomepage, false),
        sql`${articles.aiSummary} IS NOT NULL AND LENGTH(${articles.content}) > 200`,
        or(
          isNull(articles.articleType),
          ne(articles.articleType, 'opinion')
        ),
        or(
          isNull(articles.aiGenerated),
          eq(articles.aiGenerated, false)
        )
      ))
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt), desc(articles.createdAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      storyId: r.story?.id || undefined,
      storyTitle: r.story?.title || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async getTrendingTopics(): Promise<Array<{ topic: string; count: number; views: number; articles: number; comments: number }>> {
    const cacheKey = 'trending-topics';
    const cached = memoryCache.get<Array<{ topic: string; count: number; views: number; articles: number; comments: number }>>(cacheKey);
    if (cached) return cached;

    const results = await db.execute(sql`
      WITH category_stats AS (
        SELECT 
          c.id as cat_id,
          c.name_ar as topic,
          COALESCE(SUM(a.views), 0) as total_views,
          COUNT(*) as article_count
        FROM categories c
        INNER JOIN articles a ON a.category_id = c.id AND a.status = 'published'
        WHERE c.name_ar IS NOT NULL
        GROUP BY c.id, c.name_ar
      ),
      comment_counts AS (
        SELECT 
          a.category_id,
          COUNT(*) as total_comments
        FROM comments cm
        INNER JOIN articles a ON a.id = cm.article_id
        GROUP BY a.category_id
      )
      SELECT 
        cs.topic,
        cs.total_views::int as views,
        cs.article_count::int as articles,
        COALESCE(cc.total_comments, 0)::int as comments,
        (cs.total_views + (COALESCE(cc.total_comments, 0) * 10) + (cs.article_count * 5))::int as count
      FROM category_stats cs
      LEFT JOIN comment_counts cc ON cc.category_id = cs.cat_id
      WHERE cs.total_views + (COALESCE(cc.total_comments, 0) * 10) + (cs.article_count * 5) > 0
      ORDER BY count DESC
      LIMIT 8
    `);

    const filtered = (results.rows as Array<{ topic: string; count: number; views: number; articles: number; comments: number }>)
      .filter(r => r.topic && r.topic.trim().length > 0);
    memoryCache.set(cacheKey, filtered, 300000);
    return filtered;
  }

  // Dashboard stats - cached for 60 seconds to reduce DB load
  async getDashboardStats(userId: string): Promise<{
    totalArticles: number;
    publishedArticles: number;
    draftArticles: number;
    totalViews: number;
  }> {
    const cacheKey = `dashboard:stats:${userId}`;
    const cached = memoryCache.get<{
      totalArticles: number;
      publishedArticles: number;
      draftArticles: number;
      totalViews: number;
    }>(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Use single query with aggregates to reduce DB load
    const [result] = await db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`count(*) filter (where status = 'published')`,
        draft: sql<number>`count(*) filter (where status = 'draft')`,
        views: sql<number>`coalesce(sum(views), 0)`
      })
      .from(articles)
      .where(eq(articles.authorId, userId));

    const stats = {
      totalArticles: Number(result.total || 0),
      publishedArticles: Number(result.published || 0),
      draftArticles: Number(result.draft || 0),
      totalViews: Number(result.views || 0),
    };
    
    // Cache for 60 seconds
    memoryCache.set(cacheKey, stats, 60000);
    return stats;
  }

  // Admin Dashboard stats
  async getAdminDashboardStats(): Promise<{
    articles: {
      total: number;
      published: number;
      draft: number;
      archived: number;
      scheduled: number;
      totalViews: number;
      viewsToday: number;
    };
    users: {
      total: number;
      emailVerified: number;
      active24h: number;
      newThisWeek: number;
      activeToday: number;
    };
    comments: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    };
    categories: {
      total: number;
    };
    abTests: {
      total: number;
      running: number;
    };
    reactions: {
      total: number;
      todayCount: number;
    };
    engagement: {
      averageTimeOnSite: number;
      totalReads: number;
      readsToday: number;
    };
    audioNewsletters: {
      total: number;
      published: number;
      totalListens: number;
    };
    deepAnalyses: {
      total: number;
      published: number;
    };
    publishers: {
      total: number;
      active: number;
    };
    mediaLibrary: {
      totalFiles: number;
      totalSize: number;
    };
    aiTasks: {
      total: number;
      pending: number;
      completed: number;
    };
    aiImages: {
      total: number;
      thisWeek: number;
    };
    smartBlocks: {
      total: number;
    };
    recentArticles: ArticleWithDetails[];
    recentComments: CommentWithUser[];
    topArticles: ArticleWithDetails[];
  }> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Execute all independent queries in parallel for better performance
    const [
      [articleStats],
      [viewsTodayStats],
      [userStats],
      [commentStats],
      [categoriesStats],
      [abTestsStats],
      [reactionsStats],
      [engagementStats],
      [audioStats],
      [deepAnalysesStats],
      [publishersStats],
      [mediaStats],
      [aiTasksStats],
      [aiImagesStats],
      [smartBlocksStats],
      recentArticlesData,
      recentCommentsData,
      topArticlesData,
    ] = await Promise.all([
      // Get article stats with scheduled count
      db
        .select({
          total: sql<number>`count(*)`,
          published: sql<number>`count(*) filter (where ${articles.status} = 'published')`,
          draft: sql<number>`count(*) filter (where ${articles.status} = 'draft')`,
          archived: sql<number>`count(*) filter (where ${articles.status} = 'archived')`,
          scheduled: sql<number>`count(*) filter (where ${articles.status} = 'scheduled')`,
          totalViews: sql<number>`coalesce(sum(${articles.views}), 0)`,
        })
        .from(articles),

      // Get views today
      db
        .select({
          viewsToday: sql<number>`coalesce(count(*), 0)`,
        })
        .from(userEvents)
        .where(and(
          sql`${userEvents.eventType} = 'view'`,
          sql`${userEvents.createdAt} >= ${todayStart}`
        )),

      // Get user stats with active today count
      db
        .select({
          total: sql<number>`count(*)`,
          emailVerified: sql<number>`count(*) filter (where ${users.emailVerified} = true)`,
          active24h: sql<number>`count(*) filter (where ${users.lastActivityAt} >= ${yesterday})`,
          newThisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= ${weekAgo})`,
          activeToday: sql<number>`count(*) filter (where ${users.lastActivityAt} >= ${todayStart})`,
        })
        .from(users)
        .where(isNull(users.deletedAt)),

      // Get comment stats
      db
        .select({
          total: sql<number>`count(*)`,
          pending: sql<number>`count(*) filter (where ${comments.status} = 'pending')`,
          approved: sql<number>`count(*) filter (where ${comments.status} = 'approved')`,
          rejected: sql<number>`count(*) filter (where ${comments.status} = 'rejected')`,
        })
        .from(comments),

      // Get categories count
      db
        .select({
          total: sql<number>`count(*)`,
        })
        .from(categories),

      // Get AB tests stats
      db
        .select({
          total: sql<number>`count(*)`,
          running: sql<number>`count(*) filter (where ${experiments.status} = 'running')`,
        })
        .from(experiments),

      // Get reactions count (total and today)
      db
        .select({
          total: sql<number>`count(*)`,
          todayCount: sql<number>`count(*) filter (where ${reactions.createdAt} >= ${todayStart})`,
        })
        .from(reactions),

      // Get engagement stats
      db
        .select({
          totalReads: sql<number>`count(*)`,
          readsToday: sql<number>`count(*) filter (where ${readingHistory.readAt} >= ${todayStart})`,
          avgDuration: sql<number>`coalesce(avg(${readingHistory.readDuration}), 0)`,
        })
        .from(readingHistory),

      // Get audio newsletters stats
      db
        .select({
          total: sql<number>`count(*)`,
          published: sql<number>`count(*) filter (where ${audioNewsletters.status} = 'published')`,
          totalListens: sql<number>`coalesce(sum(${audioNewsletters.totalListens}), 0)`,
        })
        .from(audioNewsletters),

      // Get deep analyses stats
      db
        .select({
          total: sql<number>`count(*)`,
          published: sql<number>`count(*) filter (where ${deepAnalyses.status} = 'published')`,
        })
        .from(deepAnalyses),

      // Get publishers stats
      db
        .select({
          total: sql<number>`count(*)`,
          active: sql<number>`count(*) filter (where ${publishers.isActive} = true)`,
        })
        .from(publishers),

      // Get media library stats
      db
        .select({
          totalFiles: sql<number>`count(*)`,
          totalSize: sql<number>`coalesce(sum(${mediaFiles.size}), 0)`,
        })
        .from(mediaFiles),

      // Get AI tasks stats
      db
        .select({
          total: sql<number>`count(*)`,
          pending: sql<number>`count(*) filter (where ${aiScheduledTasks.status} = 'pending')`,
          completed: sql<number>`count(*) filter (where ${aiScheduledTasks.status} = 'completed')`,
        })
        .from(aiScheduledTasks),

      // Get AI images stats
      db
        .select({
          total: sql<number>`count(*)`,
          thisWeek: sql<number>`count(*) filter (where ${aiImageGenerations.createdAt} >= ${weekAgo})`,
        })
        .from(aiImageGenerations),

      // Get smart blocks stats
      db
        .select({
          total: sql<number>`count(*)`,
        })
        .from(smartBlocks),

      // Get recent articles (latest 5) — بلا معاملة (راجع ملاحظة الانحدار في getArticles)
      db
        .select({
          article: articleCardSelect,
          category: categoryBasicSelect,
          author: userPublicSelect,
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(users, eq(articles.authorId, users.id))
        .orderBy(desc(articles.createdAt))
        .limit(5),

      // Get recent comments (latest 5)
      db
        .select({
          comment: comments,
          user: userPublicSelect,
        })
        .from(comments)
        .innerJoin(users, eq(comments.userId, users.id))
        .orderBy(desc(comments.createdAt))
        .limit(5),

      // Get top articles (most viewed, top 5) — بلا معاملة (راجع ملاحظة الانحدار في getArticles)
      db
        .select({
          article: articleCardSelect,
          category: categoryBasicSelect,
          author: userPublicSelect,
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .leftJoin(users, eq(articles.authorId, users.id))
        .where(eq(articles.status, "published"))
        .orderBy(desc(articles.views))
        .limit(5),
    ]);

    const recentArticles: ArticleWithDetails[] = recentArticlesData.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.author || undefined,
    })) as unknown as ArticleWithDetails[];

    const recentComments: CommentWithUser[] = recentCommentsData.map((r) => ({
      ...r.comment,
      user: r.user,
      currentSentiment: null,
      currentSentimentConfidence: null,
      sentimentAnalyzedAt: null,
    })) as unknown as CommentWithUser[];

    const topArticles: ArticleWithDetails[] = topArticlesData.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.author || undefined,
    })) as unknown as ArticleWithDetails[];

    return {
      articles: {
        total: Number(articleStats.total),
        published: Number(articleStats.published),
        draft: Number(articleStats.draft),
        archived: Number(articleStats.archived),
        scheduled: Number(articleStats.scheduled),
        totalViews: Number(articleStats.totalViews),
        viewsToday: Number(viewsTodayStats.viewsToday),
      },
      users: {
        total: Number(userStats.total),
        emailVerified: Number(userStats.emailVerified),
        active24h: Number(userStats.active24h),
        newThisWeek: Number(userStats.newThisWeek),
        activeToday: Number(userStats.activeToday),
      },
      comments: {
        total: Number(commentStats.total),
        pending: Number(commentStats.pending),
        approved: Number(commentStats.approved),
        rejected: Number(commentStats.rejected),
      },
      categories: {
        total: Number(categoriesStats.total),
      },
      abTests: {
        total: Number(abTestsStats.total),
        running: Number(abTestsStats.running),
      },
      reactions: {
        total: Number(reactionsStats.total),
        todayCount: Number(reactionsStats.todayCount),
      },
      engagement: {
        averageTimeOnSite: Math.round(Number(engagementStats.avgDuration)),
        totalReads: Number(engagementStats.totalReads),
        readsToday: Number(engagementStats.readsToday),
      },
      audioNewsletters: {
        total: Number(audioStats.total),
        published: Number(audioStats.published),
        totalListens: Number(audioStats.totalListens),
      },
      deepAnalyses: {
        total: Number(deepAnalysesStats.total),
        published: Number(deepAnalysesStats.published),
      },
      publishers: {
        total: Number(publishersStats.total),
        active: Number(publishersStats.active),
      },
      mediaLibrary: {
        totalFiles: Number(mediaStats.totalFiles),
        totalSize: Number(mediaStats.totalSize),
      },
      aiTasks: {
        total: Number(aiTasksStats.total),
        pending: Number(aiTasksStats.pending),
        completed: Number(aiTasksStats.completed),
      },
      aiImages: {
        total: Number(aiImagesStats.total),
        thisWeek: Number(aiImagesStats.thisWeek),
      },
      smartBlocks: {
        total: Number(smartBlocksStats.total),
      },
      recentArticles,
      recentComments,
      topArticles,
    };
  }

  // English Admin Dashboard stats
  async getEnglishAdminDashboardStats(): Promise<{
    articles: {
      total: number;
      published: number;
      draft: number;
      archived: number;
      scheduled: number;
      totalViews: number;
      viewsToday: number;
    };
    users: {
      total: number;
      emailVerified: number;
      active24h: number;
      newThisWeek: number;
      activeToday: number;
    };
    comments: {
      total: number;
      pending: number;
      approved: number;
      rejected: number;
    };
    categories: {
      total: number;
    };
    abTests: {
      total: number;
      running: number;
    };
    reactions: {
      total: number;
      todayCount: number;
    };
    engagement: {
      averageTimeOnSite: number;
      totalReads: number;
      readsToday: number;
    };
    recentArticles: ArticleWithDetails[];
    recentComments: CommentWithUser[];
    topArticles: ArticleWithDetails[];
  }> {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get article stats with scheduled count
    const [articleStats] = await db
      .select({
        total: sql<number>`count(*)`,
        published: sql<number>`count(*) filter (where ${enArticles.status} = 'published')`,
        draft: sql<number>`count(*) filter (where ${enArticles.status} = 'draft')`,
        archived: sql<number>`count(*) filter (where ${enArticles.status} = 'archived')`,
        scheduled: sql<number>`count(*) filter (where ${enArticles.status} = 'scheduled')`,
        totalViews: sql<number>`coalesce(sum(${enArticles.views}), 0)`,
      })
      .from(enArticles);

    // Get views today
    const [viewsTodayStats] = await db
      .select({
        viewsToday: sql<number>`coalesce(count(*), 0)`,
      })
      .from(userEvents)
      .where(and(
        sql`${userEvents.eventType} = 'view'`,
        sql`${userEvents.createdAt} >= ${todayStart}`
      ));

    // Get user stats with active today count
    const [userStats] = await db
      .select({
        total: sql<number>`count(*)`,
        emailVerified: sql<number>`count(*) filter (where ${users.emailVerified} = true)`,
        active24h: sql<number>`count(*) filter (where ${users.lastActivityAt} >= ${yesterday})`,
        newThisWeek: sql<number>`count(*) filter (where ${users.createdAt} >= ${weekAgo})`,
        activeToday: sql<number>`count(*) filter (where ${users.lastActivityAt} >= ${todayStart})`,
      })
      .from(users)
      .where(isNull(users.deletedAt));

    // Get comment stats
    const [commentStats] = await db
      .select({
        total: sql<number>`count(*)`,
        pending: sql<number>`count(*) filter (where ${enComments.status} = 'pending')`,
        approved: sql<number>`count(*) filter (where ${enComments.status} = 'approved')`,
        rejected: sql<number>`count(*) filter (where ${enComments.status} = 'rejected')`,
      })
      .from(enComments);

    // Get categories count
    const [categoriesStats] = await db
      .select({
        total: sql<number>`count(*)`,
      })
      .from(enCategories);

    // Get AB tests stats
    const [abTestsStats] = await db
      .select({
        total: sql<number>`count(*)`,
        running: sql<number>`count(*) filter (where ${experiments.status} = 'running')`,
      })
      .from(experiments);

    // Get reactions count (total and today)
    const [reactionsStats] = await db
      .select({
        total: sql<number>`count(*)`,
        todayCount: sql<number>`count(*) filter (where ${reactions.createdAt} >= ${todayStart})`,
      })
      .from(reactions);

    // Get engagement stats
    const [engagementStats] = await db
      .select({
        totalReads: sql<number>`count(*)`,
        readsToday: sql<number>`count(*) filter (where ${readingHistory.readAt} >= ${todayStart})`,
        avgDuration: sql<number>`coalesce(avg(${readingHistory.readDuration}), 0)`,
      })
      .from(readingHistory);

    // Get recent articles (latest 5)
    const recentArticlesData = await db
      .select({
        article: enArticles,
        category: enCategories,
        author: userPublicSelect,
      })
      .from(enArticles)
      .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .orderBy(desc(enArticles.createdAt))
      .limit(5);

    const recentArticles = recentArticlesData.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.author || undefined,
      thumbnailUrl: null,
      isAiGeneratedImage: false,
      aiImageModel: null,
      aiImagePrompt: null,
      isAiGeneratedThumbnail: false,
      aiThumbnailModel: null,
      aiThumbnailPrompt: null,
      credibilityScore: null,
      credibilityAnalysis: null,
      credibilityLastUpdated: null,
      source: 'manual',
      sourceMetadata: null,
      sourceUrl: null,
      verifiedBy: null,
      verifiedAt: null,
      isPublisherContent: false,
      publisherStatus: null,
      publisherReviewedBy: null,
      publisherReviewedAt: null,
      publisherReviewNotes: null,
      isPublisherNews: false,
      publisherId: null,
      publisherCreditDeducted: false,
      publisherSubmittedAt: null,
      publisherApprovedAt: null,
      publisherApprovedBy: null,
    }));

    // Get recent comments (latest 5)
    const recentCommentsData = await db
      .select({
        comment: enComments,
        user: userPublicSelect,
      })
      .from(enComments)
      .innerJoin(users, eq(enComments.userId, users.id))
      .orderBy(desc(enComments.createdAt))
      .limit(5);

    const recentComments: CommentWithUser[] = recentCommentsData.map((r) => ({
      ...r.comment,
      user: r.user,
      currentSentiment: null,
      currentSentimentConfidence: null,
      sentimentAnalyzedAt: null,
    })) as unknown as CommentWithUser[];

    // Get top articles (most viewed, top 5)
    const topArticlesData = await db
      .select({
        article: enArticles,
        category: enCategories,
        author: userPublicSelect,
      })
      .from(enArticles)
      .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .where(eq(enArticles.status, "published"))
      .orderBy(desc(enArticles.views))
      .limit(5);

    const topArticles = topArticlesData.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.author || undefined,
      thumbnailUrl: null,
      isAiGeneratedImage: false,
      aiImageModel: null,
      aiImagePrompt: null,
      isAiGeneratedThumbnail: false,
      aiThumbnailModel: null,
      aiThumbnailPrompt: null,
      credibilityScore: null,
      credibilityAnalysis: null,
      credibilityLastUpdated: null,
      source: 'manual',
      sourceMetadata: null,
      sourceUrl: null,
      verifiedBy: null,
      verifiedAt: null,
      isPublisherContent: false,
      publisherStatus: null,
      publisherReviewedBy: null,
      publisherReviewedAt: null,
      publisherReviewNotes: null,
      isPublisherNews: false,
      publisherId: null,
      publisherCreditDeducted: false,
      publisherSubmittedAt: null,
      publisherApprovedAt: null,
      publisherApprovedBy: null,
    }));

    return {
      articles: {
        total: Number(articleStats.total),
        published: Number(articleStats.published),
        draft: Number(articleStats.draft),
        archived: Number(articleStats.archived),
        scheduled: Number(articleStats.scheduled),
        totalViews: Number(articleStats.totalViews),
        viewsToday: Number(viewsTodayStats.viewsToday),
      },
      users: {
        total: Number(userStats.total),
        emailVerified: Number(userStats.emailVerified),
        active24h: Number(userStats.active24h),
        newThisWeek: Number(userStats.newThisWeek),
        activeToday: Number(userStats.activeToday),
      },
      comments: {
        total: Number(commentStats.total),
        pending: Number(commentStats.pending),
        approved: Number(commentStats.approved),
        rejected: Number(commentStats.rejected),
      },
      categories: {
        total: Number(categoriesStats.total),
      },
      abTests: {
        total: Number(abTestsStats.total),
        running: Number(abTestsStats.running),
      },
      reactions: {
        total: Number(reactionsStats.total),
        todayCount: Number(reactionsStats.todayCount),
      },
      engagement: {
        averageTimeOnSite: Math.round(Number(engagementStats.avgDuration)),
        totalReads: Number(engagementStats.totalReads),
        readsToday: Number(engagementStats.readsToday),
      },
      recentArticles: recentArticles as unknown as ArticleWithDetails[],
      recentComments,
      topArticles: topArticles as unknown as ArticleWithDetails[],
    };
  }

  // Online moderators operations
  async getOnlineModerators(minutesThreshold: number = 15): Promise<{
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    role: string;
    roleNameAr: string | null;
    jobTitle: string | null;
    lastActivityAt: Date | null;
    isOnline: boolean;
  }[]> {
    const legacyModeratorRoles = ['admin', 'superadmin', 'editor', 'chief_editor', 'moderator', 'system_admin', 'comments_moderator'];
    const excludedRoles = ['reader']; // Roles to exclude from moderators list
    const onlineThreshold = new Date(Date.now() - minutesThreshold * 60 * 1000);
    
    // Query 1: Get users with moderator roles from legacy users.role field
    const legacyModerators = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: users.role,
        roleNameAr: sql<string | null>`null`,
        jobTitle: users.jobTitle,
        lastActivityAt: users.lastActivityAt,
        loggedOutAt: users.loggedOutAt,
      })
      .from(users)
      .where(
        and(
          inArray(users.role, legacyModeratorRoles),
          eq(users.status, 'active')
        )
      );
    
    // Query 2: Get ALL users with ANY RBAC role (except excluded roles like 'reader')
    // This includes custom roles like content_manager, opinion_author, etc.
    const rbacModerators = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        role: roles.name,
        roleNameAr: roles.nameAr,
        jobTitle: users.jobTitle,
        lastActivityAt: users.lastActivityAt,
        loggedOutAt: users.loggedOutAt,
      })
      .from(users)
      .innerJoin(userRoles, eq(users.id, userRoles.userId))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(
        and(
          not(inArray(roles.name, excludedRoles)),
          eq(users.status, 'active')
        )
      );
    
    // Combine and deduplicate by user ID, preferring RBAC role when available
    const moderatorMap = new Map<string, {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
      role: string;
      roleNameAr: string | null;
      jobTitle: string | null;
      lastActivityAt: Date | null;
      loggedOutAt: Date | null;
    }>();
    
    // First add legacy moderators
    for (const mod of legacyModerators) {
      moderatorMap.set(mod.id, mod);
    }
    
    // Then add/override with RBAC moderators (preferred)
    for (const mod of rbacModerators) {
      moderatorMap.set(mod.id, mod);
    }
    
    // Convert to array and sort by lastActivityAt descending
    const moderators = Array.from(moderatorMap.values()).sort((a, b) => {
      if (!a.lastActivityAt && !b.lastActivityAt) return 0;
      if (!a.lastActivityAt) return 1;
      if (!b.lastActivityAt) return -1;
      return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
    });
    
    // Determine online status:
    // - User is online if lastActivityAt is recent AND (loggedOutAt is null OR lastActivityAt > loggedOutAt)
    return moderators.map(mod => {
      const hasRecentActivity = mod.lastActivityAt ? mod.lastActivityAt >= onlineThreshold : false;
      const notLoggedOut = !mod.loggedOutAt || (mod.lastActivityAt ? mod.lastActivityAt > mod.loggedOutAt : false);
      return {
        id: mod.id,
        email: mod.email,
        firstName: mod.firstName,
        lastName: mod.lastName,
        profileImageUrl: mod.profileImageUrl,
        role: mod.role,
        roleNameAr: mod.roleNameAr,
        jobTitle: mod.jobTitle,
        lastActivityAt: mod.lastActivityAt,
        isOnline: Boolean(hasRecentActivity && notLoggedOut),
      };
    });
  }

  // Set moderator offline (set loggedOutAt to mark user as logged out immediately)
  async setModeratorOffline(userId: string): Promise<void> {
    try {
      // Set loggedOutAt to current time - keeps lastActivityAt for "آخر نشاط" display
      await db
        .update(users)
        .set({ loggedOutAt: new Date() })
        .where(eq(users.id, userId));
      
      console.log(`[Online Status] User ${userId} marked as offline (logout)`);
    } catch (error) {
      console.error(`[Online Status] Error setting user ${userId} offline:`, error);
      // Don't throw - logout should still proceed even if status update fails
    }
  }

  // Interest operations
  async getAllInterests(): Promise<Interest[]> {
    return await db.select().from(interests).orderBy(interests.nameAr).limit(200);
  }

  async getUserInterests(userId: string): Promise<InterestWithWeight[]> {
    const results = await db
      .select({
        interest: interests,
        weight: userInterests.weight,
      })
      .from(userInterests)
      .innerJoin(interests, eq(userInterests.categoryId, interests.id))
      .where(eq(userInterests.userId, userId));

    return results.map((r) => ({
      ...r.interest,
      weight: r.weight,
    }));
  }

  async setUserInterests(userId: string, interestIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(userInterests).where(eq(userInterests.userId, userId));

      if (interestIds.length > 0) {
        await tx.insert(userInterests).values(
          interestIds.map((categoryId) => ({
            userId,
            categoryId,
            weight: 1.0,
          }))
        );
        
        await tx.update(users)
          .set({ isProfileComplete: true })
          .where(eq(users.id, userId));
      }
    });
  }

  async updateInterestWeight(userId: string, interestId: string, weight: number): Promise<void> {
    await db
      .update(userInterests)
      .set({ weight, updatedAt: new Date() })
      .where(and(eq(userInterests.userId, userId), eq(userInterests.categoryId, interestId)));
  }

  // Behavior tracking operations
  async logBehavior(log: InsertBehaviorLog): Promise<void> {
    await db.insert(behaviorLogs).values([log as any]);
  }

  async getUserBehaviorSummary(userId: string, days: number = 7): Promise<any> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const logs = await db
      .select()
      .from(behaviorLogs)
      .where(and(
        eq(behaviorLogs.userId, userId),
        sql`${behaviorLogs.createdAt} >= ${cutoffDate.toISOString()}`
      ));

    const clicks: Record<string, number> = {};
    const avgReadTime: Record<string, number> = {};
    const readTimeCounts: Record<string, number> = {};
    const searches: string[] = [];
    const interactions = { shares: 0, comments: 0, likes: 0 };

    for (const log of logs) {
      const metadata = log.metadata as any;

      if (log.eventType === 'click' && metadata?.categoryId) {
        clicks[metadata.categoryId] = (clicks[metadata.categoryId] || 0) + 1;
      }

      if (log.eventType === 'read' && metadata?.categoryId && metadata?.duration) {
        avgReadTime[metadata.categoryId] = (avgReadTime[metadata.categoryId] || 0) + metadata.duration;
        readTimeCounts[metadata.categoryId] = (readTimeCounts[metadata.categoryId] || 0) + 1;
      }

      if (log.eventType === 'search' && metadata?.query) {
        searches.push(metadata.query);
      }

      if (log.eventType === 'interaction') {
        if (metadata?.action === 'share') interactions.shares++;
        if (metadata?.action === 'comment') interactions.comments++;
        if (metadata?.action === 'like') interactions.likes++;
      }
    }

    for (const category in avgReadTime) {
      avgReadTime[category] = Math.round(avgReadTime[category] / readTimeCounts[category]);
    }

    return {
      clicks,
      avgReadTime,
      searches: searches.slice(-10),
      interactions,
    };
  }

  async analyzeUserInterestsFromBehavior(userId: string, days: number = 7): Promise<Array<{
    categoryId: string;
    currentWeight: number;
    suggestedWeight: number;
    stats: {
      reads: number;
      likes: number;
      comments: number;
      shares: number;
      readTimeMinutes: number;
    };
  }>> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get current user interests
    const currentInterests = await db
      .select()
      .from(userInterests)
      .where(eq(userInterests.userId, userId));

    const currentWeightMap: Record<string, number> = {};
    for (const interest of currentInterests) {
      currentWeightMap[interest.categoryId] = interest.weight;
    }

    // Aggregate behavior data using SQL
    const behaviorData = await db.execute(sql`
      WITH category_stats AS (
        -- Reading history
        SELECT 
          a.category_id,
          COUNT(DISTINCT rh.id) as reads,
          COALESCE(SUM(rh.read_duration), 0) as total_read_time
        FROM reading_history rh
        INNER JOIN articles a ON rh.article_id = a.id
        WHERE rh.user_id = ${userId}
          AND rh.read_at >= ${cutoffDate.toISOString()}
          AND a.category_id IS NOT NULL
        GROUP BY a.category_id
      ),
      reaction_stats AS (
        -- Likes/Reactions
        SELECT 
          a.category_id,
          COUNT(*) as likes
        FROM reactions r
        INNER JOIN articles a ON r.article_id = a.id
        WHERE r.user_id = ${userId}
          AND r.created_at >= ${cutoffDate.toISOString()}
          AND a.category_id IS NOT NULL
        GROUP BY a.category_id
      ),
      comment_stats AS (
        -- Comments
        SELECT 
          a.category_id,
          COUNT(*) as comments
        FROM comments c
        INNER JOIN articles a ON c.article_id = a.id
        WHERE c.user_id = ${userId}
          AND c.created_at >= ${cutoffDate.toISOString()}
          AND a.category_id IS NOT NULL
        GROUP BY a.category_id
      ),
      share_stats AS (
        -- Shares from behavior logs
        SELECT 
          (metadata->>'categoryId')::varchar as category_id,
          COUNT(*) as shares
        FROM behavior_logs
        WHERE user_id = ${userId}
          AND event_type = 'article_share'
          AND created_at >= ${cutoffDate.toISOString()}
          AND metadata->>'categoryId' IS NOT NULL
        GROUP BY (metadata->>'categoryId')::varchar
      ),
      all_categories AS (
        SELECT DISTINCT category_id FROM category_stats
        UNION
        SELECT DISTINCT category_id FROM reaction_stats
        UNION
        SELECT DISTINCT category_id FROM comment_stats
        UNION
        SELECT DISTINCT category_id FROM share_stats
      )
      SELECT 
        ac.category_id,
        COALESCE(cs.reads, 0)::int as reads,
        COALESCE(rs.likes, 0)::int as likes,
        COALESCE(cms.comments, 0)::int as comments,
        COALESCE(ss.shares, 0)::int as shares,
        COALESCE(cs.total_read_time, 0)::int as total_read_time
      FROM all_categories ac
      LEFT JOIN category_stats cs ON ac.category_id = cs.category_id
      LEFT JOIN reaction_stats rs ON ac.category_id = rs.category_id
      LEFT JOIN comment_stats cms ON ac.category_id = cms.category_id
      LEFT JOIN share_stats ss ON ac.category_id = ss.category_id
      WHERE ac.category_id IS NOT NULL
    `);

    const results: Array<{
      categoryId: string;
      currentWeight: number;
      suggestedWeight: number;
      stats: {
        reads: number;
        likes: number;
        comments: number;
        shares: number;
        readTimeMinutes: number;
      };
    }> = [];

    for (const row of behaviorData.rows as any[]) {
      const categoryId = row.category_id;
      const reads = Number(row.reads) || 0;
      const likes = Number(row.likes) || 0;
      const comments = Number(row.comments) || 0;
      const shares = Number(row.shares) || 0;
      const totalReadTimeSeconds = Number(row.total_read_time) || 0;
      const readTimeMinutes = Math.round(totalReadTimeSeconds / 60);

      // Calculate suggested weight using the formula
      const rawWeight = 
        (reads * 1.0) + 
        (likes * 0.5) + 
        (comments * 1.0) + 
        (shares * 1.5) + 
        (readTimeMinutes * 0.1);

      // Normalize weight between 0 and 5
      const suggestedWeight = Math.min(5, Math.max(0, rawWeight));

      results.push({
        categoryId,
        currentWeight: currentWeightMap[categoryId] || 0,
        suggestedWeight: Math.round(suggestedWeight * 10) / 10, // Round to 1 decimal
        stats: {
          reads,
          likes,
          comments,
          shares,
          readTimeMinutes,
        },
      });
    }

    return results;
  }

  async updateUserInterestsAutomatically(userId: string, days: number = 7): Promise<{
    updated: number;
    added: number;
    removed: number;
  }> {
    const analysis = await this.analyzeUserInterestsFromBehavior(userId, days);

    let updated = 0;
    let added = 0;
    let removed = 0;

    await db.transaction(async (tx) => {
      for (const item of analysis) {
        const { categoryId, currentWeight, suggestedWeight } = item;

        // Check if the interest already exists
        const [existing] = await tx
          .select()
          .from(userInterests)
          .where(
            and(
              eq(userInterests.userId, userId),
              eq(userInterests.categoryId, categoryId)
            )
          );

        if (existing) {
          // Interest exists
          if (suggestedWeight < 0.5) {
            // Remove if weight is too low
            await tx
              .delete(userInterests)
              .where(eq(userInterests.id, existing.id));
            removed++;
          } else {
            // Update the weight
            await tx
              .update(userInterests)
              .set({ 
                weight: suggestedWeight,
                updatedAt: new Date()
              })
              .where(eq(userInterests.id, existing.id));
            updated++;
          }
        } else {
          // New interest
          if (suggestedWeight > 1) {
            // Add new interest if weight is significant
            await tx
              .insert(userInterests)
              .values({
                userId,
                categoryId,
                weight: suggestedWeight,
              });
            added++;
          }
        }
      }
    });

    return { updated, added, removed };
  }

  // Sentiment analysis operations
  async saveSentimentScore(score: InsertSentimentScore): Promise<void> {
    await db.insert(sentimentScores).values([score as any]);
  }

  async getUserSentimentProfile(userId: string): Promise<any> {
    const recentScores = await db
      .select()
      .from(sentimentScores)
      .where(eq(sentimentScores.userId, userId))
      .orderBy(desc(sentimentScores.createdAt))
      .limit(20);

    if (recentScores.length === 0) {
      return {
        overallScore: 0,
        emotionalBreakdown: {
          enthusiasm: 0,
          satisfaction: 0,
          anger: 0,
          sadness: 0,
          neutral: 0,
        },
        trendingSentiments: ['neutral'],
      };
    }

    const avgScore = recentScores.reduce((sum, s) => sum + s.overallScore, 0) / recentScores.length;

    const emotionTotals = {
      enthusiasm: 0,
      satisfaction: 0,
      anger: 0,
      sadness: 0,
      neutral: 0,
    };

    for (const score of recentScores) {
      const breakdown = score.emotionalBreakdown as any;
      if (breakdown) {
        emotionTotals.enthusiasm += breakdown.enthusiasm || 0;
        emotionTotals.satisfaction += breakdown.satisfaction || 0;
        emotionTotals.anger += breakdown.anger || 0;
        emotionTotals.sadness += breakdown.sadness || 0;
        emotionTotals.neutral += breakdown.neutral || 0;
      }
    }

    const count = recentScores.length;
    const emotionalBreakdown = {
      enthusiasm: emotionTotals.enthusiasm / count,
      satisfaction: emotionTotals.satisfaction / count,
      anger: emotionTotals.anger / count,
      sadness: emotionTotals.sadness / count,
      neutral: emotionTotals.neutral / count,
    };

    const sorted = Object.entries(emotionalBreakdown)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([emotion]) => emotion);

    return {
      overallScore: avgScore,
      emotionalBreakdown,
      trendingSentiments: sorted,
    };
  }

  // Theme management operations
  async getActiveTheme(scope: string = 'site_full'): Promise<Theme | undefined> {
    const now = new Date();
    
    const activeThemes = await db
      .select()
      .from(themes)
      .where(
        and(
          inArray(themes.status, ['active', 'scheduled']),
          or(isNull(themes.startAt), lte(themes.startAt, now)),
          or(isNull(themes.endAt), gte(themes.endAt, now)),
          sql`${scope} = ANY(${themes.applyTo})`
        )
      )
      .orderBy(desc(themes.priority), desc(themes.version), desc(themes.updatedAt));

    if (activeThemes.length > 0) {
      return activeThemes[0];
    }

    const defaultTheme = await db
      .select()
      .from(themes)
      .where(
        and(
          eq(themes.isDefault, true),
          eq(themes.status, 'active'),
          or(isNull(themes.startAt), lte(themes.startAt, now)),
          or(isNull(themes.endAt), gte(themes.endAt, now)),
          sql`${scope} = ANY(${themes.applyTo})`
        )
      )
      .orderBy(desc(themes.priority))
      .limit(1);

    return defaultTheme[0];
  }

  async getAllThemes(filters?: { status?: string; createdBy?: string }): Promise<Theme[]> {
    let query = db.select().from(themes);

    if (filters?.status && filters?.createdBy) {
      query = query.where(
        and(
          eq(themes.status, filters.status),
          eq(themes.createdBy, filters.createdBy)
        )
      ) as any;
    } else if (filters?.status) {
      query = query.where(eq(themes.status, filters.status)) as any;
    } else if (filters?.createdBy) {
      query = query.where(eq(themes.createdBy, filters.createdBy)) as any;
    }

    return await query.orderBy(desc(themes.updatedAt)).limit(100);
  }

  async getThemeById(id: string): Promise<Theme | undefined> {
    const result = await db.select().from(themes).where(eq(themes.id, id)).limit(1);
    return result[0];
  }

  async getThemeBySlug(slug: string): Promise<Theme | undefined> {
    const result = await db.select().from(themes).where(eq(themes.slug, slug)).limit(1);
    return result[0];
  }

  async createTheme(theme: InsertTheme): Promise<Theme> {
    const result = await db.insert(themes).values([theme as any]).returning();
    await this.createThemeAuditLog({
      themeId: result[0].id,
      userId: theme.createdBy,
      action: 'created',
      changes: theme as any,
      metadata: { newStatus: 'draft' },
    });
    return result[0];
  }

  async updateTheme(id: string, themeData: UpdateTheme, userId: string): Promise<Theme> {
    const existing = await this.getThemeById(id);
    if (!existing) {
      throw new Error('Theme not found');
    }

    const updateData: any = { ...themeData };
    if (updateData.startAt && typeof updateData.startAt === 'string') {
      updateData.startAt = new Date(updateData.startAt);
    }
    if (updateData.endAt && typeof updateData.endAt === 'string') {
      updateData.endAt = new Date(updateData.endAt);
    }
    updateData.updatedAt = new Date();

    const updated = await db
      .update(themes)
      .set(updateData)
      .where(eq(themes.id, id))
      .returning();

    await this.createThemeAuditLog({
      themeId: id,
      userId,
      action: 'updated',
      changes: themeData as any,
      metadata: {
        previousStatus: existing.status,
        newStatus: themeData.status || existing.status,
      },
    });

    return updated[0];
  }

  async deleteTheme(id: string): Promise<void> {
    await db.delete(themes).where(eq(themes.id, id));
  }

  async publishTheme(id: string, userId: string): Promise<Theme> {
    const existing = await this.getThemeById(id);
    if (!existing) {
      throw new Error('Theme not found');
    }

    const updated = await db
      .update(themes)
      .set({
        status: 'active',
        publishedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(themes.id, id))
      .returning();

    await this.createThemeAuditLog({
      themeId: id,
      userId,
      action: 'published',
      changes: {},
      metadata: {
        previousStatus: existing.status,
        newStatus: 'active',
      },
    });

    return updated[0];
  }

  async expireTheme(id: string, userId: string): Promise<Theme> {
    const existing = await this.getThemeById(id);
    if (!existing) {
      throw new Error('Theme not found');
    }

    const updated = await db
      .update(themes)
      .set({
        status: 'expired',
        endAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(themes.id, id))
      .returning();

    await this.createThemeAuditLog({
      themeId: id,
      userId,
      action: 'expired',
      changes: {},
      metadata: {
        previousStatus: existing.status,
        newStatus: 'expired',
      },
    });

    return updated[0];
  }

  async rollbackTheme(id: string, userId: string): Promise<Theme> {
    const existing = await this.getThemeById(id);
    if (!existing) {
      throw new Error('Theme not found');
    }

    if (existing.version <= 1) {
      throw new Error('Cannot rollback - no previous version available');
    }

    const updated = await db
      .update(themes)
      .set({
        version: existing.version + 1,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(themes.id, id))
      .returning();

    await this.createThemeAuditLog({
      themeId: id,
      userId,
      action: 'rolled_back',
      changes: { fromVersion: existing.version, toVersion: existing.version + 1 } as any,
      metadata: {
        previousStatus: existing.status,
        newStatus: 'active',
        reason: 'Rollback to previous version',
      },
    });

    return updated[0];
  }

  async createThemeAuditLog(log: InsertThemeAuditLog): Promise<void> {
    await db.insert(themeAuditLog).values([log as any]);
  }

  async getThemeAuditLogs(themeId: string): Promise<ThemeAuditLog[]> {
    return await db
      .select()
      .from(themeAuditLog)
      .where(eq(themeAuditLog.themeId, themeId))
      .orderBy(desc(themeAuditLog.createdAt));
  }

  async initializeDefaultTheme(userId: string): Promise<Theme> {
    const existing = await db
      .select()
      .from(themes)
      .where(eq(themes.isDefault, true))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const defaultTheme = await db.insert(themes).values([{
      name: 'سبق الافتراضية',
      slug: 'sabq-default',
      isDefault: true,
      priority: 0,
      status: 'active',
      applyTo: ['site_full'],
      assets: {
        logoLight: '/assets/logo-light.svg',
        logoDark: '/assets/logo-dark.svg',
        favicon: '/assets/favicon.ico',
      },
      tokens: {
        colors: {
          'bg-primary': '#f8f8f7',
          'bg-surface': '#ffffff',
          'border-default': '#f0f0ef',
          'text-primary': '#1a1a1a',
          'text-secondary': '#6b7280',
          'text-muted': '#9ca3af',
          'brand-primary': '#0066cc',
          'success': '#059669',
          'warning': '#d97706',
          'error': '#dc2626',
        },
        fonts: {
          'family': 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
          'size-h1': '28px',
          'size-h2': '20px',
          'size-h3': '16px',
          'size-body': '14px',
          'size-caption': '12px',
        },
        spacing: {
          'xs': '4px',
          'sm': '8px',
          'md': '16px',
          'lg': '24px',
          'xl': '32px',
        },
        borderRadius: {
          'default': '8px',
        },
      },
      createdBy: userId,
      version: 1,
      changelog: [{
        version: 1,
        changes: 'Initial default theme created',
        timestamp: new Date().toISOString(),
        userId,
      }],
    } as any]).returning();

    return defaultTheme[0];
  }

  // Loyalty System - Private Helpers
  // Rank is computed from lifetimePoints (monotonic) — not totalPoints,
  // which can decrease when users spend on rewards. Source of truth for
  // tier thresholds and names lives in shared/loyalty.ts so the frontend
  // and the migration script see the same buckets.
  private calculateRankByLifetime(lifetimePoints: number): { name: string; level: number } {
    const tier = computeTier(lifetimePoints);
    return { name: tier.nameAr, level: tier.level };
  }

  private async getApplicableCampaignInTx(tx: any, action: string, categoryId?: string): Promise<LoyaltyCampaign | undefined> {
    const now = new Date();
    const conditions = [
      eq(loyaltyCampaigns.isActive, true),
      lte(loyaltyCampaigns.startAt, now),
      gte(loyaltyCampaigns.endAt, now),
    ];

    if (action) {
      conditions.push(
        or(
          sql`${loyaltyCampaigns.targetAction} IS NULL`,
          eq(loyaltyCampaigns.targetAction, action)
        )!
      );
    }

    if (categoryId) {
      conditions.push(
        or(
          sql`${loyaltyCampaigns.targetCategory} IS NULL`,
          eq(loyaltyCampaigns.targetCategory, categoryId)
        )!
      );
    }

    const [campaign] = await tx
      .select()
      .from(loyaltyCampaigns)
      .where(and(...conditions))
      .orderBy(desc(loyaltyCampaigns.multiplier))
      .limit(1);

    return campaign;
  }

  // Loyalty System - Points and Events
  async recordLoyaltyPointsInTx(tx: any, params: {
    userId: string;
    action: string;
    points: number;
    source?: string;
    metadata?: any;
  }, balanceLockHeld = false): Promise<{ pointsEarned: number; totalPoints: number; rankChanged: boolean; newRank?: string }> {
      const now = new Date();

      // Every points mutation for this user shares one database lock, including
      // different actions/sources. This prevents read-modify-write races from
      // dropping a concurrent payout and also serializes first-row creation.
      if (!balanceLockHeld) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`loyalty-balance:${params.userId}`}))`,
        );
      }
      
      // 1. Get active campaign inside transaction. Sports prediction awards
      // are already tier-multiplied at settlement time and admin adjustments
      // are exact by definition — applying a campaign multiplier on top of
      // either would double-inflate large payouts, so campaigns only apply
      // to editorial/engagement/account actions.
      const actionCategory = getLoyaltyActionMeta(params.action).category;
      const applicableCampaign =
        actionCategory === "sports" || actionCategory === "admin"
          ? undefined
          : await this.getApplicableCampaignInTx(
              tx,
              params.action,
              params.metadata?.categoryId
            );

      // 2. Calculate points with multiplier or bonus
      let pointsToAward = params.points;
      let campaignId: string | undefined = undefined;

      if (applicableCampaign) {
        campaignId = applicableCampaign.id;
        if (applicableCampaign.multiplier && applicableCampaign.multiplier > 1) {
          pointsToAward = Math.floor(params.points * applicableCampaign.multiplier);
        }
        if (applicableCampaign.bonusPoints && applicableCampaign.bonusPoints > 0) {
          pointsToAward += applicableCampaign.bonusPoints;
        }
      }

      // 3. Create loyalty event
      await tx.insert(userLoyaltyEvents).values({
        userId: params.userId,
        action: params.action,
        points: pointsToAward,
        source: params.source,
        campaignId,
        metadata: params.metadata,
      });

      // 4. Get or create user points total
      const [existingPoints] = await tx
        .select()
        .from(userPointsTotal)
        .where(eq(userPointsTotal.userId, params.userId))
        .for("update");

      const oldRank = existingPoints?.currentRank || "القارئ الجديد";
      const oldLevel = existingPoints?.rankLevel ?? 1;
      const newTotalPoints = (existingPoints?.totalPoints || 0) + pointsToAward;
      const newLifetimePoints = (existingPoints?.lifetimePoints || 0) + (pointsToAward > 0 ? pointsToAward : 0);
      const computed = this.calculateRankByLifetime(newLifetimePoints);

      // Grandfather: never demote a level. Migration grandfathered legacy
      // "سفير سبق" users at level 5; same protection must hold on every
      // subsequent point award so a rewards spend can't drop someone.
      const newLevel = Math.max(oldLevel, computed.level);
      const newRank = newLevel > computed.level ? oldRank : computed.name;

      // 5. Update or insert user points
      if (existingPoints) {
        await tx
          .update(userPointsTotal)
          .set({
            totalPoints: newTotalPoints,
            lifetimePoints: newLifetimePoints,
            currentRank: newRank,
            rankLevel: newLevel,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(userPointsTotal.userId, params.userId));
      } else {
        await tx.insert(userPointsTotal).values({
          userId: params.userId,
          totalPoints: newTotalPoints,
          lifetimePoints: newLifetimePoints,
          currentRank: newRank,
          rankLevel: newLevel,
          lastActivityAt: now,
        });
      }

      // 6. Check for rank change
      const rankChanged = oldRank !== newRank || oldLevel !== newLevel;

      // 7. Return result
      return {
        pointsEarned: pointsToAward,
        totalPoints: newTotalPoints,
        rankChanged,
        newRank: rankChanged ? newRank : undefined,
      };
  }

  async recordLoyaltyPoints(params: {
    userId: string;
    action: string;
    points: number;
    source?: string;
    metadata?: any;
  }): Promise<{ pointsEarned: number; totalPoints: number; rankChanged: boolean; newRank?: string }> {
    const result = await db.transaction((tx) => this.recordLoyaltyPointsInTx(tx, params));

    // Trigger loyalty pass update (outside transaction)
    await this.triggerLoyaltyPassUpdate(params.userId, params.action);

    return result;
  }

  async getUserPoints(userId: string): Promise<UserPointsTotal | undefined> {
    const [points] = await db
      .select()
      .from(userPointsTotal)
      .where(eq(userPointsTotal.userId, userId));
    return points;
  }

  async getUserLoyaltyHistory(userId: string, limit: number = 50): Promise<UserLoyaltyEvent[]> {
    return await db
      .select()
      .from(userLoyaltyEvents)
      .where(eq(userLoyaltyEvents.userId, userId))
      .orderBy(desc(userLoyaltyEvents.createdAt))
      .limit(limit);
  }

  async getTopUsers(limit: number = 100): Promise<Array<UserPointsTotal & { user: User }>> {
    const results = await db
      .select({
        points: userPointsTotal,
        user: userPublicSelect,
      })
      .from(userPointsTotal)
      .leftJoin(users, eq(userPointsTotal.userId, users.id))
      .orderBy(desc(userPointsTotal.totalPoints))
      .limit(limit);

    return results.map((r) => ({
      ...r.points,
      user: r.user!,
    })) as unknown as Array<UserPointsTotal & { user: User }>;
  }

  // Loyalty System - Rewards
  async getActiveRewards(): Promise<LoyaltyReward[]> {
    const now = new Date();
    return await db
      .select()
      .from(loyaltyRewards)
      .where(
        and(
          eq(loyaltyRewards.isActive, true),
          // سبق بلس preview-simulation rewards are admin-only surfaces —
          // never expose them in the member-facing catalog.
          sql`COALESCE(${loyaltyRewards.rewardData}->'partnerApiData'->>'previewOnly', '') <> 'true'`,
          or(
            sql`${loyaltyRewards.expiresAt} IS NULL`,
            gte(loyaltyRewards.expiresAt, now)
          )
        )
      )
      .orderBy(loyaltyRewards.pointsCost);
  }

  async getRewardById(rewardId: string): Promise<LoyaltyReward | undefined> {
    const [reward] = await db
      .select()
      .from(loyaltyRewards)
      .where(eq(loyaltyRewards.id, rewardId));
    return reward;
  }

  async redeemReward(params: {
    userId: string;
    rewardId: string;
    // سبق بلس preview rewards are redeemable only through the admin-gated
    // /api/plus-preview surface, which passes allowPreview: true.
    allowPreview?: boolean;
  }): Promise<{
    success: boolean;
    code?: "NOT_FOUND" | "INACTIVE" | "EXPIRED" | "INSUFFICIENT_POINTS" | "OUT_OF_STOCK" | "MAX_REDEMPTIONS";
    message: string;
    redemption?: UserRewardsHistory;
    remainingBalance?: number;
  }> {
    // Thrown inside the transaction to roll back the points debit if the
    // guarded stock decrement touches zero rows.
    class OutOfStockRollback extends Error {}
    try {
      return await db.transaction(async (tx) => {
        // 1. Lock the reward row — serializes concurrent redemptions of the
        // same reward so stock and per-user-count checks can't race.
        const [reward] = await tx
          .select()
          .from(loyaltyRewards)
          .where(eq(loyaltyRewards.id, params.rewardId))
          .for("update");

        if (!reward) {
          return { success: false, code: "NOT_FOUND" as const, message: "الجائزة غير موجودة" };
        }

        if (!reward.isActive) {
          return { success: false, code: "INACTIVE" as const, message: "الجائزة غير متاحة حالياً" };
        }

        if ((reward.rewardData as any)?.partnerApiData?.previewOnly === true && !params.allowPreview) {
          return { success: false, code: "NOT_FOUND" as const, message: "الجائزة غير موجودة" };
        }

        if (reward.expiresAt && new Date(reward.expiresAt) < new Date()) {
          return { success: false, code: "EXPIRED" as const, message: "انتهت صلاحية الجائزة" };
        }

        // 2. Check stock
        if (reward.remainingStock !== null && reward.remainingStock <= 0) {
          return { success: false, code: "OUT_OF_STOCK" as const, message: "نفذت كمية الجائزة" };
        }

        // 3. Check max redemptions per user (safe under the reward row lock)
        if (reward.maxRedemptionsPerUser !== null) {
          const [{ count: userRedemptions }] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(userRewardsHistory)
            .where(
              and(
                eq(userRewardsHistory.userId, params.userId),
                eq(userRewardsHistory.rewardId, params.rewardId)
              )
            );

          if (Number(userRedemptions) >= reward.maxRedemptionsPerUser) {
            return {
              success: false,
              code: "MAX_REDEMPTIONS" as const,
              message: `لقد وصلت إلى الحد الأقصى لاستبدال هذه الجائزة (${reward.maxRedemptionsPerUser})`
            };
          }
        }

        // 4. Deduct points — atomic guarded decrement so two concurrent
        // redemptions can't both spend the same balance.
        const debited = await tx
          .update(userPointsTotal)
          .set({
            totalPoints: sql`${userPointsTotal.totalPoints} - ${reward.pointsCost}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userPointsTotal.userId, params.userId),
              gte(userPointsTotal.totalPoints, reward.pointsCost)
            )
          )
          .returning({ totalPoints: userPointsTotal.totalPoints });

        if (debited.length === 0) {
          return {
            success: false,
            code: "INSUFFICIENT_POINTS" as const,
            message: `النقاط غير كافية. تحتاج إلى ${reward.pointsCost} نقطة`
          };
        }

        // 5. Decrement stock — guarded so it can never go negative; zero
        // affected rows means someone else took the last unit, so roll the
        // whole redemption (including the debit above) back.
        if (reward.remainingStock !== null) {
          const stockRows = await tx
            .update(loyaltyRewards)
            .set({ remainingStock: sql`${loyaltyRewards.remainingStock} - 1` })
            .where(
              and(
                eq(loyaltyRewards.id, params.rewardId),
                gte(loyaltyRewards.remainingStock, 1)
              )
            )
            .returning({ remainingStock: loyaltyRewards.remainingStock });
          if (stockRows.length === 0) {
            throw new OutOfStockRollback();
          }
        }

        // 6. Create redemption record with snapshot
        const [redemption] = await tx
          .insert(userRewardsHistory)
          .values({
            userId: params.userId,
            rewardId: params.rewardId,
            pointsSpent: reward.pointsCost,
            rewardSnapshot: {
              nameAr: reward.nameAr,
              nameEn: reward.nameEn,
              pointsCost: reward.pointsCost,
              rewardType: reward.rewardType,
            },
            deliveryData: reward.rewardData?.couponCode ? {
              couponCode: reward.rewardData.couponCode,
            } : undefined,
          })
          .returning();

        return {
          success: true,
          message: "تم استبدال الجائزة بنجاح",
          redemption,
          remainingBalance: Number(debited[0].totalPoints),
        };
      });
    } catch (err) {
      if (err instanceof OutOfStockRollback) {
        return { success: false, code: "OUT_OF_STOCK" as const, message: "نفذت كمية الجائزة" };
      }
      throw err;
    }
  }

  async getUserRedemptionHistory(userId: string): Promise<UserRewardsHistory[]> {
    return await db
      .select()
      .from(userRewardsHistory)
      .where(eq(userRewardsHistory.userId, userId))
      .orderBy(desc(userRewardsHistory.redeemedAt));
  }

  // Loyalty System - Campaigns
  async getActiveCampaigns(): Promise<LoyaltyCampaign[]> {
    const now = new Date();
    return await db
      .select()
      .from(loyaltyCampaigns)
      .where(
        and(
          eq(loyaltyCampaigns.isActive, true),
          lte(loyaltyCampaigns.startAt, now),
          gte(loyaltyCampaigns.endAt, now)
        )
      )
      .orderBy(loyaltyCampaigns.createdAt);
  }

  async getApplicableCampaign(action: string, categoryId?: string): Promise<LoyaltyCampaign | undefined> {
    const now = new Date();
    const conditions = [
      eq(loyaltyCampaigns.isActive, true),
      lte(loyaltyCampaigns.startAt, now),
      gte(loyaltyCampaigns.endAt, now),
    ];

    // Check if campaign targets specific action
    if (action) {
      conditions.push(
        or(
          sql`${loyaltyCampaigns.targetAction} IS NULL`,
          eq(loyaltyCampaigns.targetAction, action)
        )!
      );
    }

    // Check if campaign targets specific category
    if (categoryId) {
      conditions.push(
        or(
          sql`${loyaltyCampaigns.targetCategory} IS NULL`,
          eq(loyaltyCampaigns.targetCategory, categoryId)
        )!
      );
    }

    const [campaign] = await db
      .select()
      .from(loyaltyCampaigns)
      .where(and(...conditions))
      .orderBy(desc(loyaltyCampaigns.multiplier))
      .limit(1);

    return campaign;
  }

  // Loyalty System - Admin
  async createReward(data: InsertLoyaltyReward): Promise<LoyaltyReward> {
    const [reward] = await db
      .insert(loyaltyRewards)
      .values([data as any])
      .returning();
    return reward;
  }

  async updateReward(id: string, data: Partial<InsertLoyaltyReward>): Promise<LoyaltyReward> {
    const updateData: any = { ...data };
    const [reward] = await db
      .update(loyaltyRewards)
      .set(updateData)
      .where(eq(loyaltyRewards.id, id))
      .returning();
    return reward;
  }

  async deleteReward(id: string): Promise<void> {
    await db.delete(loyaltyRewards).where(eq(loyaltyRewards.id, id));
  }

  async createCampaign(data: InsertLoyaltyCampaign): Promise<LoyaltyCampaign> {
    const [campaign] = await db
      .insert(loyaltyCampaigns)
      .values(data)
      .returning();
    return campaign;
  }

  async updateCampaign(id: string, data: Partial<InsertLoyaltyCampaign>): Promise<LoyaltyCampaign> {
    const [campaign] = await db
      .update(loyaltyCampaigns)
      .set(data)
      .where(eq(loyaltyCampaigns.id, id))
      .returning();
    return campaign;
  }

  async adjustUserPoints(userId: string, points: number, reason: string): Promise<void> {
    await db.transaction(async (tx) => {
      const now = new Date();
      
      // 1. Create loyalty event
      await tx.insert(userLoyaltyEvents).values([{
        userId,
        action: "ADMIN_ADJUSTMENT",
        points,
        source: "admin",
        metadata: { extraInfo: reason } as any,
      }]);

      // 2. Get existing user points
      const [existingPoints] = await tx
        .select()
        .from(userPointsTotal)
        .where(eq(userPointsTotal.userId, userId));

      // 3. Calculate new totals and rank (rank from lifetimePoints, never demote)
      const oldLevel = existingPoints?.rankLevel ?? 1;
      const oldRank = existingPoints?.currentRank || "القارئ الجديد";
      const newTotalPoints = (existingPoints?.totalPoints || 0) + points;
      const newLifetimePoints = (existingPoints?.lifetimePoints || 0) + (points > 0 ? points : 0);
      const computed = this.calculateRankByLifetime(newLifetimePoints);
      const newLevel = Math.max(oldLevel, computed.level);
      const newRank = newLevel > computed.level ? oldRank : computed.name;

      // 4. Update or insert user points
      if (existingPoints) {
        await tx
          .update(userPointsTotal)
          .set({
            totalPoints: newTotalPoints,
            lifetimePoints: newLifetimePoints,
            currentRank: newRank,
            rankLevel: newLevel,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(eq(userPointsTotal.userId, userId));
      } else {
        await tx.insert(userPointsTotal).values({
          userId,
          totalPoints: newTotalPoints,
          lifetimePoints: newLifetimePoints,
          currentRank: newRank,
          rankLevel: newLevel,
          lastActivityAt: now,
        });
      }
    });
  }

  // Muqtarab Angles operations
  async getSectionBySlug(slug: string): Promise<Section | undefined> {
    const [section] = await db
      .select()
      .from(sections)
      .where(eq(sections.slug, slug))
      .limit(1);
    return section;
  }

  async getAllAngles(activeOnly?: boolean): Promise<Angle[]> {
    const conditions = [];
    
    if (activeOnly) {
      conditions.push(eq(angles.isActive, true));
    }

    return await db
      .select()
      .from(angles)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(angles.sortOrder, angles.nameAr);
  }

  async getAnglesWithStats(activeOnly?: boolean): Promise<Array<Angle & { topicCount: number; writerName: string | null; writerAvatar: string | null }>> {
    const conditions = [];
    if (activeOnly) {
      conditions.push(eq(angles.isActive, true));
    }

    const rows = await db
      .select({
        angle: angles,
        writerFirst: users.firstName,
        writerLast: users.lastName,
        writerAvatar: users.profileImageUrl,
        topicCount: sql<number>`count(case when ${topics.status} = 'published' then ${topics.id} end)`,
      })
      .from(angles)
      .leftJoin(users, eq(angles.managerUserId, users.id))
      .leftJoin(topics, eq(topics.angleId, angles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(angles.id, users.firstName, users.lastName, users.profileImageUrl)
      .orderBy(angles.sortOrder, angles.nameAr);

    return rows.map((r) => {
      const name = [r.writerFirst, r.writerLast].filter(Boolean).join(" ").trim();
      return {
        ...r.angle,
        topicCount: Number(r.topicCount) || 0,
        writerName: name || null,
        writerAvatar: r.writerAvatar ?? null,
      };
    });
  }

  async getAngleBySlug(slug: string): Promise<Angle | undefined> {
    const [angle] = await db
      .select()
      .from(angles)
      .where(eq(angles.slug, slug));
    return angle;
  }

  async getAngleWriter(managerUserId: string | null): Promise<{ id: string; name: string; avatar: string | null; slug: string | null; bio: string | null } | null> {
    if (!managerUserId) return null;

    const [row] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        bio: users.bio,
        staffSlug: staff.slug,
        staffNameAr: staff.nameAr,
        staffProfileImage: staff.profileImage,
        staffBioAr: staff.bioAr,
      })
      .from(users)
      .leftJoin(staff, eq(staff.userId, users.id))
      .where(eq(users.id, managerUserId))
      .limit(1);

    if (!row) return null;

    const name = (row.staffNameAr || [row.firstName, row.lastName].filter(Boolean).join(" ").trim()) || "كاتب الزاوية";
    return {
      id: managerUserId,
      name,
      avatar: row.staffProfileImage || row.profileImageUrl || null,
      slug: row.staffSlug || null,
      bio: row.staffBioAr || row.bio || null,
    };
  }

  async getAngleById(id: string): Promise<Angle | undefined> {
    const [angle] = await db
      .select()
      .from(angles)
      .where(eq(angles.id, id));
    return angle;
  }

  async createAngle(angle: InsertAngle): Promise<Angle> {
    const [created] = await db
      .insert(angles)
      .values(angle)
      .returning();
    return created;
  }

  async updateAngle(id: string, angleData: Partial<InsertAngle>): Promise<Angle> {
    const updateData: any = { ...angleData, updatedAt: new Date() };
    const [updated] = await db
      .update(angles)
      .set(updateData)
      .where(eq(angles.id, id))
      .returning();
    return updated;
  }

  async deleteAngle(id: string): Promise<void> {
    await db.delete(angles).where(eq(angles.id, id));
  }

  async getArticlesByAngle(angleSlug: string, limit?: number): Promise<ArticleWithDetails[]> {
    // First, get the angle by slug
    const angle = await this.getAngleBySlug(angleSlug);
    if (!angle) {
      return [];
    }

    const reporterAlias = aliasedTable(users, 'reporter');
    
    // Build query to get articles by angle
    let query = db
      .select({
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(articleAngles)
      .innerJoin(articles, eq(articleAngles.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(
        and(
          eq(articleAngles.angleId, angle.id),
          eq(articles.status, "published"),
          or(
            isNull(articles.articleType),
            ne(articles.articleType, 'opinion')
          )
        )
      )
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt), desc(articles.createdAt))
      .limit(limit || 500);

    const results = await query;

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as ArticleWithDetails[];
  }

  async linkArticleToAngle(articleId: string, angleId: string): Promise<void> {
    await db
      .insert(articleAngles)
      .values({
        articleId,
        angleId,
      })
      .onConflictDoNothing();
  }

  async unlinkArticleFromAngle(articleId: string, angleId: string): Promise<void> {
    await db
      .delete(articleAngles)
      .where(
        and(
          eq(articleAngles.articleId, articleId),
          eq(articleAngles.angleId, angleId)
        )
      );
  }

  async getArticleAngles(articleId: string): Promise<Angle[]> {
    const results = await db
      .select({
        angle: angles,
      })
      .from(articleAngles)
      .innerJoin(angles, eq(articleAngles.angleId, angles.id))
      .where(eq(articleAngles.articleId, articleId))
      .orderBy(angles.sortOrder, angles.nameAr);

    return results.map((r) => r.angle);
  }

  // Topics CRUD operations
  async getTopicsByAngle(angleId: string, options?: {
    status?: 'draft' | 'published' | 'archived';
    limit?: number;
    offset?: number;
    listOnly?: boolean;
  }): Promise<{ topics: Topic[]; total: number }> {
    const conditions = [eq(topics.angleId, angleId)];
    
    if (options?.status) {
      conditions.push(eq(topics.status, options.status));
    }
    
    const whereClause = and(...conditions);
    
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(topics)
      .where(whereClause);

    const listColumns = {
      id: topics.id,
      angleId: topics.angleId,
      title: topics.title,
      slug: topics.slug,
      excerpt: topics.excerpt,
      heroImageUrl: topics.heroImageUrl,
      status: topics.status,
      publishedAt: topics.publishedAt,
      viewCount: topics.viewCount,
      createdBy: topics.createdBy,
      updatedBy: topics.updatedBy,
      submittedAt: topics.submittedAt,
      reviewedBy: topics.reviewedBy,
      reviewedAt: topics.reviewedAt,
      reviewNotes: topics.reviewNotes,
      createdAt: topics.createdAt,
      updatedAt: topics.updatedAt,
    };
    
    let query = (options?.listOnly
      ? db.select(listColumns).from(topics)
      : db.select().from(topics))
      .where(whereClause)
      .orderBy(desc(topics.createdAt));
    
    if (options?.limit) {
      query = query.limit(options.limit) as any;
    }
    if (options?.offset) {
      query = query.offset(options.offset) as any;
    }
    
    const topicsList = await query;
    
    return {
      topics: topicsList as Topic[],
      total: Number(totalCount),
    };
  }

  async getTopicBySlug(angleId: string, slug: string): Promise<Topic | undefined> {
    const [topic] = await db
      .select()
      .from(topics)
      .where(and(eq(topics.angleId, angleId), eq(topics.slug, slug)));
    return topic;
  }

  async getTopicById(id: string): Promise<Topic | undefined> {
    const [topic] = await db
      .select()
      .from(topics)
      .where(eq(topics.id, id));
    return topic;
  }

  async createTopic(topic: InsertTopic): Promise<Topic> {
    const [created] = await db
      .insert(topics)
      .values(topic)
      .returning();
    return created;
  }

  async updateTopic(id: string, topicData: UpdateTopic): Promise<Topic> {
    const updateData: any = { ...topicData, updatedAt: new Date() };
    const [updated] = await db
      .update(topics)
      .set(updateData)
      .where(eq(topics.id, id))
      .returning();
    return updated;
  }

  async deleteTopic(id: string): Promise<void> {
    await db.delete(topics).where(eq(topics.id, id));
  }

  async publishTopic(id: string, userId: string): Promise<Topic> {
    const [updated] = await db
      .update(topics)
      .set({
        status: 'published',
        publishedAt: new Date(),
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(topics.id, id))
      .returning();
    return updated;
  }

  async unpublishTopic(id: string, userId: string): Promise<Topic> {
    const [updated] = await db
      .update(topics)
      .set({
        status: 'draft',
        publishedAt: null,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(topics.id, id))
      .returning();
    return updated;
  }

  async getPublishedTopicsByAngle(angleSlug: string, limit?: number): Promise<Topic[]> {
    let query = db
      .select({
        topic: topics,
      })
      .from(topics)
      .innerJoin(angles, eq(topics.angleId, angles.id))
      .where(and(eq(angles.slug, angleSlug), eq(topics.status, 'published')))
      .orderBy(desc(topics.publishedAt));
    
    if (limit) {
      query = query.limit(limit) as any;
    }
    
    const results = await query;
    return results.map((r) => r.topic);
  }

  async getLatestPublishedTopics(limit: number = 3): Promise<Array<Topic & { angle: { id: string; name: string; slug: string; icon?: string | null; colorHex?: string | null } }>> {
    const results = await db
      .select({
        topic: topics,
        angle: {
          id: angles.id,
          name: angles.nameAr,
          slug: angles.slug,
          icon: angles.iconKey,
          colorHex: angles.colorHex,
        },
      })
      .from(topics)
      .innerJoin(angles, eq(topics.angleId, angles.id))
      .where(and(
        eq(topics.status, 'published'),
        eq(angles.isActive, true)
      ))
      .orderBy(desc(topics.publishedAt))
      .limit(limit);
    
    return results.map((r) => ({
      ...r.topic,
      angle: r.angle,
    }));
  }

  // Angle Submissions operations - طلبات كتابة الزوايا
  async createAngleSubmission(data: InsertAngleSubmission): Promise<AngleSubmission> {
    const [submission] = await db
      .insert(angleSubmissions)
      .values(data)
      .returning();
    return submission;
  }

  async getAngleSubmissions(status?: string): Promise<AngleSubmission[]> {
    if (status) {
      return db
        .select()
        .from(angleSubmissions)
        .where(eq(angleSubmissions.status, status))
        .orderBy(desc(angleSubmissions.createdAt));
    }
    return db
      .select()
      .from(angleSubmissions)
      .orderBy(desc(angleSubmissions.createdAt));
  }

  async getAngleSubmission(id: string): Promise<AngleSubmission | undefined> {
    const [submission] = await db
      .select()
      .from(angleSubmissions)
      .where(eq(angleSubmissions.id, id));
    return submission;
  }

  async updateAngleSubmission(id: string, data: Partial<AngleSubmission>): Promise<AngleSubmission | undefined> {
    const [updated] = await db
      .update(angleSubmissions)
      .set(data)
      .where(eq(angleSubmissions.id, id))
      .returning();
    return updated;
  }

  async deleteAngleSubmission(id: string): Promise<boolean> {
    const result = await db
      .delete(angleSubmissions)
      .where(eq(angleSubmissions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Story operations
  async createStory(story: InsertStory): Promise<Story> {
    const [created] = await db
      .insert(stories)
      .values(story)
      .returning();
    return created;
  }

  async getStoryById(id: string): Promise<Story | undefined> {
    const [story] = await db
      .select()
      .from(stories)
      .where(eq(stories.id, id));
    return story;
  }

  async getStoryBySlug(slug: string): Promise<StoryWithDetails | undefined> {
    const results = await db
      .select({
        story: stories,
        rootArticle: articles,
      })
      .from(stories)
      .leftJoin(articles, eq(stories.rootArticleId, articles.id))
      .where(eq(stories.slug, slug));

    if (results.length === 0) return undefined;

    const result = results[0];

    // Get articles count
    const [{ count: articlesCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(storyLinks)
      .where(eq(storyLinks.storyId, result.story.id));

    // Get followers count
    const [{ count: followersCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(storyFollows)
      .where(and(
        eq(storyFollows.storyId, result.story.id),
        eq(storyFollows.isActive, true)
      ));

    return {
      ...result.story,
      rootArticle: result.rootArticle || undefined,
      articlesCount: Number(articlesCount),
      followersCount: Number(followersCount),
    };
  }

  async getAllStories(filters?: { status?: string }): Promise<StoryWithDetails[]> {
    const conditions = [];

    if (filters?.status) {
      conditions.push(eq(stories.status, filters.status));
    }

    const results = await db
      .select({
        story: stories,
        rootArticle: articles,
      })
      .from(stories)
      .leftJoin(articles, eq(stories.rootArticleId, articles.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(stories.createdAt));

    // Get counts for each story
    const storiesWithDetails = await Promise.all(
      results.map(async (result) => {
        const [{ count: articlesCount }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(storyLinks)
          .where(eq(storyLinks.storyId, result.story.id));

        const [{ count: followersCount }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(storyFollows)
          .where(and(
            eq(storyFollows.storyId, result.story.id),
            eq(storyFollows.isActive, true)
          ));

        return {
          ...result.story,
          rootArticle: result.rootArticle || undefined,
          articlesCount: Number(articlesCount),
          followersCount: Number(followersCount),
        };
      })
    );

    return storiesWithDetails;
  }

  async updateStory(id: string, data: Partial<InsertStory>): Promise<Story> {
    const [updated] = await db
      .update(stories)
      .set(data)
      .where(eq(stories.id, id))
      .returning();
    return updated;
  }

  async deleteStory(id: string): Promise<void> {
    await db.delete(stories).where(eq(stories.id, id));
  }

  // Story link operations
  async createStoryLink(link: InsertStoryLink): Promise<StoryLink> {
    const [created] = await db
      .insert(storyLinks)
      .values(link)
      .returning();
    return created;
  }

  async getStoryLinks(storyId: string): Promise<StoryLinkWithArticle[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        storyLink: storyLinks,
        article: articleCardSelect,
        category: categoryBasicSelect,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(storyLinks)
      .leftJoin(articles, eq(storyLinks.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
      .where(eq(storyLinks.storyId, storyId))
      .orderBy(desc(storyLinks.createdAt));

    return results.map((r) => ({
      ...r.storyLink,
      article: r.article ? {
        ...r.article,
        category: r.category || undefined,
        author: r.reporter || r.author || undefined,
      } : undefined,
    })) as unknown as StoryLinkWithArticle[];
  }

  async deleteStoryLink(id: string): Promise<void> {
    await db.delete(storyLinks).where(eq(storyLinks.id, id));
  }

  // Story follow operations
  async followStory(follow: InsertStoryFollow): Promise<StoryFollow> {
    const [created] = await db
      .insert(storyFollows)
      .values(follow)
      .returning();
    return created;
  }

  async unfollowStory(userId: string, storyId: string): Promise<void> {
    await db
      .delete(storyFollows)
      .where(and(
        eq(storyFollows.userId, userId),
        eq(storyFollows.storyId, storyId)
      ));
  }

  async getStoryFollows(userId: string): Promise<(StoryFollow & { story: StoryWithDetails })[]> {
    const results = await db
      .select({
        storyFollow: storyFollows,
        story: stories,
        rootArticle: articles,
      })
      .from(storyFollows)
      .innerJoin(stories, eq(storyFollows.storyId, stories.id))
      .leftJoin(articles, eq(stories.rootArticleId, articles.id))
      .where(and(
        eq(storyFollows.userId, userId),
        eq(storyFollows.isActive, true)
      ))
      .orderBy(desc(storyFollows.createdAt));

    // Get counts for each story
    const followsWithDetails = await Promise.all(
      results.map(async (result) => {
        const [{ count: articlesCount }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(storyLinks)
          .where(eq(storyLinks.storyId, result.story.id));

        const [{ count: followersCount }] = await db
          .select({ count: sql<number>`count(*)` })
          .from(storyFollows)
          .where(and(
            eq(storyFollows.storyId, result.story.id),
            eq(storyFollows.isActive, true)
          ));

        return {
          ...result.storyFollow,
          story: {
            ...result.story,
            rootArticle: result.rootArticle || undefined,
            articlesCount: Number(articlesCount),
            followersCount: Number(followersCount),
          },
        };
      })
    );

    return followsWithDetails;
  }

  async getStoryFollowersByStoryId(storyId: string): Promise<StoryFollow[]> {
    return await db
      .select()
      .from(storyFollows)
      .where(and(
        eq(storyFollows.storyId, storyId),
        eq(storyFollows.isActive, true)
      ))
      .orderBy(desc(storyFollows.createdAt));
  }

  async isFollowingStory(userId: string, storyId: string): Promise<boolean> {
    const [follow] = await db
      .select()
      .from(storyFollows)
      .where(and(
        eq(storyFollows.userId, userId),
        eq(storyFollows.storyId, storyId),
        eq(storyFollows.isActive, true)
      ));
    return !!follow;
  }

  async updateStoryFollow(userId: string, storyId: string, data: Partial<InsertStoryFollow>): Promise<StoryFollow> {
    const updateData: any = { ...data, updatedAt: new Date() };
    const [updated] = await db
      .update(storyFollows)
      .set(updateData)
      .where(and(
        eq(storyFollows.userId, userId),
        eq(storyFollows.storyId, storyId)
      ))
      .returning();
    return updated;
  }

  // Social Following System
  async followUser(data: InsertSocialFollow): Promise<SocialFollow> {
    console.log('[Storage] Following user:', data);
    const [created] = await db
      .insert(socialFollows)
      .values(data)
      .returning();
    console.log('[Storage] User follow created:', created);
    return created;
  }

  async unfollowUser(followerId: string, followingId: string): Promise<void> {
    console.log('[Storage] Unfollowing user:', { followerId, followingId });
    await db
      .delete(socialFollows)
      .where(and(
        eq(socialFollows.followerId, followerId),
        eq(socialFollows.followingId, followingId)
      ));
    console.log('[Storage] User unfollowed successfully');
  }

  async getFollowers(userId: string, limit?: number): Promise<Array<SocialFollow & { follower: User }>> {
    console.log('[Storage] Getting followers for user:', userId, 'limit:', limit);
    const followerUser = aliasedTable(users, 'follower');
    
    let query = db
      .select({
        socialFollow: socialFollows,
        follower: followerUser,
      })
      .from(socialFollows)
      .leftJoin(followerUser, eq(socialFollows.followerId, followerUser.id))
      .where(eq(socialFollows.followingId, userId))
      .orderBy(desc(socialFollows.createdAt));

    if (limit) {
      query = query.limit(limit) as any;
    }

    const results = await query;
    
    const followers = results.map(r => ({
      ...r.socialFollow,
      follower: r.follower!,
    }));
    
    console.log('[Storage] Found followers:', followers.length);
    return followers;
  }

  async getFollowing(userId: string, limit?: number): Promise<Array<SocialFollow & { following: User }>> {
    console.log('[Storage] Getting following for user:', userId, 'limit:', limit);
    const followingUser = aliasedTable(users, 'following');
    
    let query = db
      .select({
        socialFollow: socialFollows,
        following: followingUser,
      })
      .from(socialFollows)
      .leftJoin(followingUser, eq(socialFollows.followingId, followingUser.id))
      .where(eq(socialFollows.followerId, userId))
      .orderBy(desc(socialFollows.createdAt));

    if (limit) {
      query = query.limit(limit) as any;
    }

    const results = await query;
    
    const following = results.map(r => ({
      ...r.socialFollow,
      following: r.following!,
    }));
    
    console.log('[Storage] Found following:', following.length);
    return following;
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    console.log('[Storage] Checking if user is following:', { followerId, followingId });
    const [result] = await db
      .select()
      .from(socialFollows)
      .where(and(
        eq(socialFollows.followerId, followerId),
        eq(socialFollows.followingId, followingId)
      ));
    
    const isFollowing = !!result;
    console.log('[Storage] Is following:', isFollowing);
    return isFollowing;
  }

  async getFollowStats(userId: string): Promise<{ followersCount: number; followingCount: number }> {
    console.log('[Storage] Getting follow stats for user:', userId);
    
    const [followersResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(socialFollows)
      .where(eq(socialFollows.followingId, userId));
    
    const [followingResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(socialFollows)
      .where(eq(socialFollows.followerId, userId));
    
    const stats = {
      followersCount: followersResult?.count || 0,
      followingCount: followingResult?.count || 0,
    };
    
    console.log('[Storage] Follow stats:', stats);
    return stats;
  }

  // Story notification operations
  async createStoryNotification(notification: InsertStoryNotification): Promise<StoryNotification> {
    const [created] = await db
      .insert(storyNotifications)
      .values(notification)
      .returning();
    return created;
  }

  async getStoryNotifications(storyId: string): Promise<StoryNotification[]> {
    return await db
      .select()
      .from(storyNotifications)
      .where(eq(storyNotifications.storyId, storyId))
      .orderBy(desc(storyNotifications.createdAt));
  }

  // System settings operations
  async getSystemSetting(key: string): Promise<any | undefined> {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));
    return setting?.value;
  }

  async upsertSystemSetting(key: string, value: any, category: string = "system", isPublic: boolean = false): Promise<void> {
    const existing = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key));

    if (existing.length > 0) {
      await db
        .update(systemSettings)
        .set({ 
          value, 
          category, 
          isPublic, 
          updatedAt: new Date() 
        })
        .where(eq(systemSettings.key, key));
    } else {
      await db
        .insert(systemSettings)
        .values({ key, value, category, isPublic });
    }
  }

  // User Behavior Analytics
  async getUserBehaviorAnalytics(range: string = "7d") {
    const days = parseInt(range) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Active users count (users who had any activity during the period)
    const activeUsersResult = await db
      .select({ userId: readingHistory.userId })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, startDate))
      .union(
        db.select({ userId: comments.userId })
          .from(comments)
          .where(gte(comments.createdAt, startDate))
      )
      .union(
        db.select({ userId: reactions.userId })
          .from(reactions)
          .where(gte(reactions.createdAt, startDate))
      )
      .union(
        db.select({ userId: bookmarks.userId })
          .from(bookmarks)
          .where(gte(bookmarks.createdAt, startDate))
      )
      .union(
        db.select({ userId: behaviorLogs.userId })
          .from(behaviorLogs)
          .where(gte(behaviorLogs.createdAt, startDate))
      );

    const totalUsers = new Set(activeUsersResult.map(r => r.userId)).size;

    // Reading time average from readingHistory
    const readingStats = await db
      .select({
        avgDuration: sql<number>`avg(${readingHistory.readDuration})`,
        totalReads: sql<number>`count(*)`,
      })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, startDate));

    // Interaction counts
    const [likesCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(reactions)
      .where(gte(reactions.createdAt, startDate));

    const [commentsCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(comments)
      .where(gte(comments.createdAt, startDate));

    const [bookmarksCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(gte(bookmarks.createdAt, startDate));

    // Top categories from user interactions
    const topCategories = await db
      .select({
        categoryId: articles.categoryId,
        categoryName: sql<string>`COALESCE(${categories.nameAr}, 'غير مصنف')`,
        count: sql<number>`count(*)`,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(gte(readingHistory.readAt, startDate))
      .groupBy(articles.categoryId, sql`COALESCE(${categories.nameAr}, 'غير مصنف')`)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    // Active hours analysis from behaviorLogs
    const activeHours = await db
      .select({
        hour: sql<number>`extract(hour from ${behaviorLogs.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(behaviorLogs)
      .where(gte(behaviorLogs.createdAt, startDate))
      .groupBy(sql`extract(hour from ${behaviorLogs.createdAt})`);

    // Group by time periods
    const hourDistribution = { morning: 0, noon: 0, evening: 0, night: 0 };
    activeHours.forEach((h) => {
      const hour = Number(h.hour);
      const count = Number(h.count);
      if (hour >= 6 && hour < 12) hourDistribution.morning += count;
      else if (hour >= 12 && hour < 17) hourDistribution.noon += count;
      else if (hour >= 17 && hour < 22) hourDistribution.evening += count;
      else hourDistribution.night += count;
    });

    // Device distribution (mock data - would need user agent parsing)
    const deviceDistribution = {
      mobile: 65,
      desktop: 30,
      tablet: 5,
    };

    // Return time analysis (users who came back within 7 days)
    const returningUsers = await db
      .select({
        userId: readingHistory.userId,
        visitDays: sql<number>`count(distinct date(${readingHistory.readAt}))`,
      })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, startDate))
      .groupBy(readingHistory.userId)
      .having(sql`count(distinct date(${readingHistory.readAt})) > 1`);

    const returnRate = totalUsers > 0 
      ? Math.round((returningUsers.length / Number(totalUsers)) * 100) 
      : 0;

    return {
      totalUsers: Number(totalUsers),
      readingTimeAvg: readingStats[0]?.avgDuration ? Math.round(Number(readingStats[0].avgDuration) / 60) : 0,
      totalReads: Number(readingStats[0]?.totalReads || 0),
      topCategories: topCategories.map(c => ({
        name: c.categoryName || 'غير مصنف',
        count: Number(c.count),
      })),
      interactionCounts: {
        likes: Number(likesCount.count),
        comments: Number(commentsCount.count),
        bookmarks: Number(bookmarksCount.count),
      },
      activeHours: hourDistribution,
      deviceDistribution,
      returnRate,
      returningUsersCount: returningUsers.length,
    };
  }

  // ============================================
  // A/B Testing Operations
  // ============================================

  // Experiment Operations
  async createExperiment(experiment: InsertExperiment): Promise<Experiment> {
    const [newExperiment] = await db
      .insert(experiments)
      .values(experiment)
      .returning();
    return newExperiment;
  }

  async getExperimentById(id: string): Promise<Experiment | undefined> {
    const [experiment] = await db
      .select()
      .from(experiments)
      .where(eq(experiments.id, id));
    return experiment;
  }

  async getAllExperiments(filters?: { status?: string; testType?: string }): Promise<Experiment[]> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(experiments.status, filters.status));
    }
    
    if (filters?.testType) {
      conditions.push(eq(experiments.testType, filters.testType));
    }

    const results = await db
      .select()
      .from(experiments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(experiments.createdAt));

    return results;
  }

  async updateExperiment(id: string, data: Partial<InsertExperiment>): Promise<Experiment> {
    const [updated] = await db
      .update(experiments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(experiments.id, id))
      .returning();
    return updated;
  }

  async deleteExperiment(id: string): Promise<void> {
    await db.delete(experiments).where(eq(experiments.id, id));
  }

  async startExperiment(id: string): Promise<Experiment> {
    const [updated] = await db
      .update(experiments)
      .set({ 
        status: 'running', 
        startedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(experiments.id, id))
      .returning();
    return updated;
  }

  async pauseExperiment(id: string): Promise<Experiment> {
    const [updated] = await db
      .update(experiments)
      .set({ 
        status: 'paused',
        updatedAt: new Date()
      })
      .where(eq(experiments.id, id))
      .returning();
    return updated;
  }

  async completeExperiment(id: string, winnerVariantId?: string): Promise<Experiment> {
    const updateData: any = { 
      status: 'completed', 
      endedAt: new Date(),
      updatedAt: new Date()
    };
    
    if (winnerVariantId) {
      updateData.winnerVariantId = winnerVariantId;
    }

    const [updated] = await db
      .update(experiments)
      .set(updateData)
      .where(eq(experiments.id, id))
      .returning();
    return updated;
  }

  // Variant Operations
  async createExperimentVariant(variant: InsertExperimentVariant): Promise<ExperimentVariant> {
    const [newVariant] = await db
      .insert(experimentVariants)
      .values({
        ...variant,
        variantData: variant.variantData as any
      })
      .returning();
    return newVariant;
  }

  async getExperimentVariants(experimentId: string): Promise<ExperimentVariant[]> {
    const variants = await db
      .select()
      .from(experimentVariants)
      .where(eq(experimentVariants.experimentId, experimentId))
      .orderBy(asc(experimentVariants.createdAt));
    return variants;
  }

  async updateExperimentVariant(id: string, data: Partial<InsertExperimentVariant>): Promise<ExperimentVariant> {
    const updateData = data.variantData 
      ? { ...data, variantData: data.variantData as any }
      : data;
    
    const [updated] = await db
      .update(experimentVariants)
      .set(updateData as any)
      .where(eq(experimentVariants.id, id))
      .returning();
    return updated;
  }

  async deleteExperimentVariant(id: string): Promise<void> {
    await db.delete(experimentVariants).where(eq(experimentVariants.id, id));
  }

  // Exposure Operations
  async recordExperimentExposure(exposure: InsertExperimentExposure): Promise<ExperimentExposure> {
    const [newExposure] = await db
      .insert(experimentExposures)
      .values(exposure)
      .returning();

    // Update cached exposure count for variant
    await db
      .update(experimentVariants)
      .set({ 
        exposures: sql`${experimentVariants.exposures} + 1`
      })
      .where(eq(experimentVariants.id, exposure.variantId));

    // Update cached total exposures for experiment
    await db
      .update(experiments)
      .set({ 
        totalExposures: sql`${experiments.totalExposures} + 1`
      })
      .where(eq(experiments.id, exposure.experimentId));

    return newExposure;
  }

  async getExperimentExposures(experimentId: string, variantId?: string): Promise<ExperimentExposure[]> {
    const conditions = [eq(experimentExposures.experimentId, experimentId)];
    
    if (variantId) {
      conditions.push(eq(experimentExposures.variantId, variantId));
    }

    const exposures = await db
      .select()
      .from(experimentExposures)
      .where(and(...conditions))
      .orderBy(desc(experimentExposures.exposedAt));

    return exposures;
  }

  // Conversion Operations
  async recordExperimentConversion(conversion: InsertExperimentConversion): Promise<ExperimentConversion> {
    const [newConversion] = await db
      .insert(experimentConversions)
      .values({
        ...conversion,
        metadata: conversion.metadata as any
      })
      .returning();

    // Update cached conversion count for variant
    await db
      .update(experimentVariants)
      .set({ 
        conversions: sql`${experimentVariants.conversions} + 1`,
        conversionRate: sql`CASE WHEN ${experimentVariants.exposures} > 0 THEN (${experimentVariants.conversions} + 1)::float / ${experimentVariants.exposures}::float * 100 ELSE 0 END`
      })
      .where(eq(experimentVariants.id, conversion.variantId));

    // Update cached total conversions for experiment
    await db
      .update(experiments)
      .set({ 
        totalConversions: sql`${experiments.totalConversions} + 1`
      })
      .where(eq(experiments.id, conversion.experimentId));

    return newConversion;
  }

  async getExperimentConversions(experimentId: string, variantId?: string): Promise<ExperimentConversion[]> {
    const conditions = [eq(experimentConversions.experimentId, experimentId)];
    
    if (variantId) {
      conditions.push(eq(experimentConversions.variantId, variantId));
    }

    const conversions = await db
      .select()
      .from(experimentConversions)
      .where(and(...conditions))
      .orderBy(desc(experimentConversions.convertedAt));

    return conversions;
  }

  // Analytics Operations
  async getExperimentAnalytics(experimentId: string): Promise<{
    experiment: Experiment;
    variants: Array<ExperimentVariant & {
      exposureCount: number;
      conversionCount: number;
      conversionRate: number;
      averageReadTime?: number;
      engagementScore: number;
    }>;
    totalExposures: number;
    totalConversions: number;
    overallConversionRate: number;
    winner?: string;
    confidenceLevel?: number;
  }> {
    // Get experiment
    const experiment = await this.getExperimentById(experimentId);
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    // Get all variants with detailed stats
    const variants = await db
      .select({
        variant: experimentVariants,
        exposureCount: sql<number>`COUNT(DISTINCT ${experimentExposures.id})`,
        conversionCount: sql<number>`COUNT(DISTINCT ${experimentConversions.id})`,
        avgReadTime: sql<number>`AVG(CASE WHEN ${experimentConversions.conversionType} = 'read' THEN ${experimentConversions.value} ELSE NULL END)`,
      })
      .from(experimentVariants)
      .leftJoin(experimentExposures, eq(experimentExposures.variantId, experimentVariants.id))
      .leftJoin(experimentConversions, eq(experimentConversions.variantId, experimentVariants.id))
      .where(eq(experimentVariants.experimentId, experimentId))
      .groupBy(experimentVariants.id);

    // Calculate stats for each variant
    const variantsWithStats = variants.map(v => {
      const exposureCount = Number(v.exposureCount) || 0;
      const conversionCount = Number(v.conversionCount) || 0;
      const conversionRate = exposureCount > 0 ? (conversionCount / exposureCount) * 100 : 0;
      const engagementScore = exposureCount > 0 ? (conversionCount / exposureCount) * 100 : 0;

      return {
        ...v.variant,
        exposureCount,
        conversionCount,
        conversionRate,
        averageReadTime: v.avgReadTime ? Number(v.avgReadTime) : undefined,
        engagementScore,
      };
    });

    // Calculate totals
    const totalExposures = variantsWithStats.reduce((sum, v) => sum + v.exposureCount, 0);
    const totalConversions = variantsWithStats.reduce((sum, v) => sum + v.conversionCount, 0);
    const overallConversionRate = totalExposures > 0 ? (totalConversions / totalExposures) * 100 : 0;

    // Determine winner (highest conversion rate)
    let winner: string | undefined;
    if (variantsWithStats.length > 0) {
      const winnerVariant = variantsWithStats.reduce((best, current) => 
        current.conversionRate > best.conversionRate ? current : best
      );
      winner = winnerVariant.name;
    }

    return {
      experiment,
      variants: variantsWithStats,
      totalExposures,
      totalConversions,
      overallConversionRate,
      winner,
    };
  }

  // Helper Operations
  async getActiveExperimentForArticle(articleId: string): Promise<Experiment | undefined> {
    const [experiment] = await db
      .select()
      .from(experiments)
      .where(
        and(
          eq(experiments.articleId, articleId),
          eq(experiments.status, 'running')
        )
      )
      .limit(1);
    
    return experiment;
  }

  async assignExperimentVariant(
    experimentId: string, 
    userId?: string, 
    sessionId?: string
  ): Promise<ExperimentVariant> {
    // Get all variants for this experiment
    const variants = await this.getExperimentVariants(experimentId);
    
    if (variants.length === 0) {
      throw new Error('No variants found for this experiment');
    }

    // Check if user/session already has an assignment
    const conditions = [eq(experimentExposures.experimentId, experimentId)];
    
    if (userId) {
      conditions.push(eq(experimentExposures.userId, userId));
    } else if (sessionId) {
      conditions.push(eq(experimentExposures.sessionId, sessionId));
    }

    const [existingExposure] = await db
      .select()
      .from(experimentExposures)
      .where(and(...conditions))
      .limit(1);

    if (existingExposure) {
      // Return the existing variant assignment
      const [variant] = await db
        .select()
        .from(experimentVariants)
        .where(eq(experimentVariants.id, existingExposure.variantId));
      return variant;
    }

    // Assign new variant based on traffic allocation
    // Sort variants to ensure consistent ordering
    const sortedVariants = [...variants].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    
    // Calculate cumulative traffic allocation
    let cumulativeAllocation = 0;
    const allocations = sortedVariants.map(v => {
      const start = cumulativeAllocation;
      cumulativeAllocation += v.trafficAllocation;
      return { variant: v, start, end: cumulativeAllocation };
    });

    // Generate random number between 0 and total allocation
    const random = Math.random() * cumulativeAllocation;
    
    // Find which variant this random number falls into
    const selectedAllocation = allocations.find(a => random >= a.start && random < a.end);
    const selectedVariant = selectedAllocation?.variant || sortedVariants[0];

    return selectedVariant;
  }

  // Reporter/Staff operations
  async getReporterBySlug(slug: string): Promise<Staff | undefined> {
    // Search by staff.slug first, then fallback to staff.userId for backward compatibility
    const [result] = await db
      .select({
        id: staff.id,
        userId: staff.userId,
        slug: staff.slug,
        name: staff.name,
        nameAr: staff.nameAr,
        title: staff.title,
        titleAr: staff.titleAr,
        bio: staff.bio,
        bioAr: staff.bioAr,
        profileImage: staff.profileImage,
        userProfileImage: users.profileImageUrl,
        staffType: staff.staffType,
        specializations: staff.specializations,
        isActive: staff.isActive,
        isVerified: staff.isVerified,
        publishedCount: staff.publishedCount,
        totalViews: staff.totalViews,
        totalLikes: staff.totalLikes,
        lastActiveAt: staff.lastActiveAt,
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
      })
      .from(staff)
      .leftJoin(users, eq(staff.userId, users.id))
      .where(and(
        or(eq(staff.slug, slug), eq(staff.userId, slug)),
        eq(staff.isActive, true),
        // Only show public-facing staff types (reporters, writers, opinion authors)
        // Exclude editors and content managers who shouldn't have public profiles
        inArray(staff.staffType, ['reporter', 'writer', 'opinion_author', 'content_creator'])
      ))
      .limit(1);
    
    if (!result) return undefined;

    // Use staff profileImage first, fallback to user profileImage
    return {
      ...result,
      profileImage: result.profileImage || result.userProfileImage || null,
    } as Staff;
  }

  // Helper function to generate URL-friendly slug from Arabic/English names
  private generateSlug(firstName: string, lastName: string): string {
    // Transliteration map for Arabic to English
    const arabicToEnglish: Record<string, string> = {
      'ا': 'a', 'أ': 'a', 'إ': 'a', 'آ': 'a',
      'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
      'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
      'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
      'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'dh',
      'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
      'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
      'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
      'ة': 'h', 'ئ': 'e', 'ء': 'a',
      ' ': '-', '_': '-'
    };

    const transliterate = (text: string): string => {
      return text
        .split('')
        .map(char => arabicToEnglish[char] || char)
        .join('')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    };

    const firstSlug = transliterate(firstName || '');
    const lastSlug = transliterate(lastName || '');
    
    return `${firstSlug}-${lastSlug}`.replace(/^-|-$/g, '') || 'reporter';
  }

  // Ensure reporter has a staff record (auto-create if needed)
  async ensureReporterStaffRecord(userId: string): Promise<Staff> {
    // Check if staff record already exists
    const [existing] = await db
      .select()
      .from(staff)
      .where(eq(staff.userId, userId))
      .limit(1);
    
    if (existing) {
      return existing;
    }

    // Get user info
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Generate slug from user's name
    const baseSlug = this.generateSlug(user.firstName || '', user.lastName || '');
    
    // Check for slug conflicts and make it unique if needed
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const [conflict] = await db
        .select()
        .from(staff)
        .where(eq(staff.slug, slug))
        .limit(1);
      
      if (!conflict) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create staff record
    const nameAr = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'مراسل';
    const name = nameAr; // For now, use same name

    const [staffRecord] = await db
      .insert(staff)
      .values({
        userId: userId,
        slug: slug,
        name: name,
        nameAr: nameAr,
        staffType: 'reporter',
        isActive: true,
        isVerified: false,
        bio: user.bio || undefined,
        bioAr: user.bio || undefined,
        profileImage: user.profileImageUrl || undefined,
      })
      .returning();

    console.log(`✅ Created staff record for reporter ${userId} with slug: ${slug}`);
    return staffRecord;
  }

  async getStaffByUserId(userId: string): Promise<Staff | null> {
    const [staffRecord] = await db
      .select()
      .from(staff)
      .where(eq(staff.userId, userId))
      .limit(1);
    
    return staffRecord || null;
  }

  async upsertStaff(userId: string, data: { bio?: string; bioAr?: string; title?: string; titleAr?: string }): Promise<Staff> {
    const existingStaff = await this.getStaffByUserId(userId);
    
    if (existingStaff) {
      const [updated] = await db
        .update(staff)
        .set({
          bio: data.bio !== undefined ? (data.bio || null) : existingStaff.bio,
          bioAr: data.bioAr !== undefined ? (data.bioAr || null) : existingStaff.bioAr,
          title: data.title !== undefined ? (data.title || null) : existingStaff.title,
          titleAr: data.titleAr !== undefined ? (data.titleAr || null) : existingStaff.titleAr,
          updatedAt: new Date(),
        })
        .where(eq(staff.id, existingStaff.id))
        .returning();
      
      return updated;
    } else {
      const user = await this.getUser(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      const baseSlug = this.generateSlug(user.firstName || '', user.lastName || '');
      
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const [conflict] = await db
          .select()
          .from(staff)
          .where(eq(staff.slug, slug))
          .limit(1);
        
        if (!conflict) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const nameAr = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'موظف';
      const name = nameAr;

      const [staffRecord] = await db
        .insert(staff)
        .values({
          userId: userId,
          slug: slug,
          name: name,
          nameAr: nameAr,
          staffType: 'writer',
          bio: data.bio || null,
          bioAr: data.bioAr || null,
          title: data.title || null,
          titleAr: data.titleAr || null,
          profileImage: user.profileImageUrl || null,
          isActive: true,
          isVerified: false,
        })
        .returning();

      return staffRecord;
    }
  }

  async getReporterProfile(slug: string, windowDays: number = 90, language: 'ar' | 'en' = 'ar'): Promise<ReporterProfile | undefined> {
    // Get reporter basic info
    const reporter = await this.getReporterBySlug(slug);
    if (!reporter) return undefined;

    const windowDate = new Date();
    windowDate.setDate(windowDate.getDate() - windowDays);

    // Get reporter's articles with detailed stats
    const reporterArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        publishedAt: articles.publishedAt,
        newsType: articles.newsType,
        views: articles.views,
        categoryId: categories.id,
        categoryNameAr: categories.nameAr,
        categoryNameEn: categories.nameEn,
        categorySlug: categories.slug,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(
          or(eq(articles.reporterId, reporter.userId!), eq(articles.authorId, reporter.userId!)),
          eq(articles.status, 'published'),
          gte(articles.publishedAt, windowDate)
        )
      )
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt))
      .execute();

    // Get TOTAL article count (all time, not just within window)
    // Count articles where user is either reporter_id OR author_id (matching discover page logic)
    const allTimeStatsResult = await db
      .select({
        count: sql<number>`CAST(COUNT(DISTINCT ${articles.id}) AS INTEGER)`,
        totalViews: sql<number>`COALESCE(SUM(${articles.views}), 0)`,
      })
      .from(articles)
      .where(
        and(
          or(
            or(eq(articles.reporterId, reporter.userId!), eq(articles.authorId, reporter.userId!)),
            eq(articles.authorId, reporter.userId!)
          ),
          eq(articles.status, 'published')
        )
      )
      .execute();
    
    const totalArticles = allTimeStatsResult[0]?.count || 0;
    const totalViews = Number(allTimeStatsResult[0]?.totalViews) || 0;

    // Get likes count for reporter's articles
    const likesResult = await db
      .select({
        totalLikes: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(reactions)
      .innerJoin(articles, eq(reactions.articleId, articles.id))
      .where(
        and(
          or(eq(articles.reporterId, reporter.userId!), eq(articles.authorId, reporter.userId!)),
          eq(reactions.type, 'like')
        )
      )
      .execute();
    
    const totalLikes = likesResult[0]?.totalLikes || 0;

    // Get comments count for last articles
    const commentsResult = await db
      .select({
        articleId: comments.articleId,
        count: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      })
      .from(comments)
      .where(
        inArray(
          comments.articleId,
          reporterArticles.slice(0, 5).map(a => a.id)
        )
      )
      .groupBy(comments.articleId)
      .execute();

    const commentsMap = new Map(commentsResult.map(r => [r.articleId, r.count || 0]));

    // Get reading history for average read time
    // Note: reading_history table has read_duration (in seconds)
    const readingStats = await db
      .select({
        avgReadTime: sql<number>`CAST(AVG(read_duration) / 60.0 AS REAL)`,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .where(eq(articles.reporterId, reporter.userId!))
      .execute();

    // Use default values for completion rate (not tracked in reading_history)
    const avgCompletionRate = 75; // Default reasonable value
    const avgReadTimeMin = Math.round(readingStats[0]?.avgReadTime || 4);

    // Prepare last 5 articles with full details
    const lastArticles: ReporterArticle[] = reporterArticles.slice(0, 5).map(a => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      publishedAt: a.publishedAt,
      category: a.categoryId ? {
        // Always fallback to Arabic if English is missing
        name: language === 'en' 
          ? (a.categoryNameEn || a.categoryNameAr || '') 
          : (a.categoryNameAr || ''),
        slug: a.categorySlug || '',
        color: a.categoryColor,
        icon: a.categoryIcon,
      } : null,
      isBreaking: a.newsType === 'breaking',
      views: a.views || 0,
      likes: 0, // Will calculate separately if needed
      comments: commentsMap.get(a.id) || 0,
      readingTime: avgReadTimeMin,
    }));

    // Get top categories - query ALL articles (reporter_id OR author_id, no date filter)
    const categoryStatsResult = await db
      .select({
        categoryId: categories.id,
        categoryNameAr: categories.nameAr,
        categoryNameEn: categories.nameEn,
        categorySlug: categories.slug,
        categoryColor: categories.color,
        articlesCount: sql<number>`CAST(COUNT(DISTINCT ${articles.id}) AS INTEGER)`,
        totalViews: sql<number>`COALESCE(SUM(${articles.views}), 0)`,
      })
      .from(articles)
      .innerJoin(categories, eq(articles.categoryId, categories.id))
      .where(
        and(
          or(
            or(eq(articles.reporterId, reporter.userId!), eq(articles.authorId, reporter.userId!)),
            eq(articles.authorId, reporter.userId!)
          ),
          eq(articles.status, 'published')
        )
      )
      .groupBy(categories.id, categories.nameAr, categories.nameEn, categories.slug, categories.color)
      .orderBy(desc(sql`COUNT(DISTINCT ${articles.id})`))
      .limit(5)
      .execute();

    const topCategories = categoryStatsResult.map(cat => ({
      name: language === 'en' ? (cat.categoryNameEn || cat.categoryNameAr || '') : (cat.categoryNameAr || ''),
      slug: cat.categorySlug || '',
      color: cat.categoryColor,
      articles: cat.articlesCount || 0,
      views: Number(cat.totalViews) || 0,
      sharePct: totalArticles > 0 ? Math.round(((cat.articlesCount || 0) / totalArticles) * 100) : 0,
    }));

    // Generate time series data (simplified - daily aggregates)
    const timeseries: ReporterTimeseries[] = [];
    const dailyStats = reporterArticles.reduce((acc, a) => {
      if (!a.publishedAt) return acc;
      
      const dateStr = a.publishedAt.toISOString().split('T')[0];
      if (!acc[dateStr]) {
        acc[dateStr] = { views: 0, likes: 0 };
      }
      acc[dateStr].views += a.views || 0;
      
      return acc;
    }, {} as Record<string, { views: number; likes: number }>);

    Object.entries(dailyStats).forEach(([date, stats]) => {
      timeseries.push({
        date,
        views: stats.views,
        likes: stats.likes,
      });
    });

    timeseries.sort((a, b) => a.date.localeCompare(b.date));

    // Helper function to check if text contains Arabic characters
    const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);
    
    // Generate badges
    const badges: Array<{ key: string; label: string }> = [];
    
    if (reporter.isVerified) {
      badges.push({ 
        key: 'verified', 
        label: language === 'en' ? 'Verified' : 'موثق' 
      });
    }
    
    if (totalArticles >= 20) {
      badges.push({ 
        key: 'active_contributor', 
        label: language === 'en' ? 'Active Contributor' : 'كاتب نشط' 
      });
    }
    
    if (reporter.specializations.length > 0) {
      if (language === 'en') {
        // For English, find first non-Arabic specialization
        const firstEnglishSpec = reporter.specializations.find(spec => !hasArabic(spec));
        if (firstEnglishSpec) {
          badges.push({ 
            key: 'specialist', 
            label: `Specialized in ${firstEnglishSpec}` 
          });
        }
        // If all specializations are in Arabic, skip the badge entirely
      } else {
        // For Arabic, use first specialization
        badges.push({ 
          key: 'specialist', 
          label: `متخصص في ${reporter.specializations[0]}` 
        });
      }
    }

    // Get followers count (only if reporter has a linked userId)
    let followersCount = 0;
    if (reporter.userId) {
      const followersResult = await db
        .select({
          followersCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
        })
        .from(socialFollows)
        .where(eq(socialFollows.followingId, reporter.userId))
        .execute();
      
      followersCount = followersResult[0]?.followersCount || 0;
    }

    return {
      id: reporter.id,
      userId: reporter.userId!,
      slug: reporter.slug,
      fullName: language === 'en' ? (reporter.name || reporter.nameAr) : (reporter.nameAr || reporter.name),
      title: language === 'en' ? (reporter.title || reporter.titleAr) : (reporter.titleAr || reporter.title),
      avatarUrl: reporter.profileImage,
      bio: language === 'en' ? (reporter.bio || reporter.bioAr) : (reporter.bioAr || reporter.bio),
      isVerified: reporter.isVerified,
      tags: reporter.specializations,
      kpis: {
        totalArticles,
        totalViews,
        totalLikes,
        avgReadTimeMin,
        avgCompletionRate,
        followers: followersCount,
      },
      lastArticles,
      topCategories,
      timeseries: {
        windowDays,
        daily: timeseries,
      },
      badges,
    };
  }

  // Activity Logs operations
  async getActivityLogs(filters?: {
    userId?: string;
    action?: string;
    entityType?: string;
    dateFrom?: Date;
    dateTo?: Date;
    searchQuery?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    logs: Array<{
      id: string;
      userId: string | null;
      action: string;
      entityType: string;
      entityId: string;
      oldValue: Record<string, any> | null;
      newValue: Record<string, any> | null;
      metadata: { ip?: string; userAgent?: string; reason?: string } | null;
      createdAt: Date;
      user?: {
        id: string;
        email: string;
        firstName: string | null;
        lastName: string | null;
        profileImageUrl: string | null;
      } | null;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions: any[] = [];

    if (filters?.userId) {
      conditions.push(eq(activityLogs.userId, filters.userId));
    }

    if (filters?.action) {
      conditions.push(eq(activityLogs.action, filters.action));
    }

    if (filters?.entityType) {
      conditions.push(eq(activityLogs.entityType, filters.entityType));
    }

    if (filters?.dateFrom) {
      conditions.push(gte(activityLogs.createdAt, filters.dateFrom));
    }

    if (filters?.dateTo) {
      conditions.push(lte(activityLogs.createdAt, filters.dateTo));
    }

    if (filters?.searchQuery) {
      conditions.push(
        or(
          ilike(activityLogs.action, `%${filters.searchQuery}%`),
          ilike(activityLogs.entityType, `%${filters.searchQuery}%`),
          ilike(activityLogs.entityId, `%${filters.searchQuery}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityLogs)
      .where(whereClause);

    const total = countResult?.count || 0;
    const totalPages = Math.ceil(total / limit);

    // Get logs with user information
    const logs = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        oldValue: activityLogs.oldValue,
        newValue: activityLogs.newValue,
        metadata: activityLogs.metadata,
        createdAt: activityLogs.createdAt,
        userName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        userProfileImage: users.profileImageUrl,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(whereClause)
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      logs: logs.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        oldValue: log.oldValue,
        newValue: log.newValue,
        metadata: log.metadata,
        createdAt: log.createdAt,
        user: log.userId
          ? {
              id: log.userId,
              email: log.userEmail || '',
              firstName: log.userName,
              lastName: log.userLastName,
              profileImageUrl: log.userProfileImage,
            }
          : null,
      })),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getActivityLogById(id: string): Promise<{
    id: string;
    userId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    oldValue: Record<string, any> | null;
    newValue: Record<string, any> | null;
    metadata: { ip?: string; userAgent?: string; reason?: string } | null;
    createdAt: Date;
    user?: {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      profileImageUrl: string | null;
    } | null;
  } | undefined> {
    const [log] = await db
      .select({
        id: activityLogs.id,
        userId: activityLogs.userId,
        action: activityLogs.action,
        entityType: activityLogs.entityType,
        entityId: activityLogs.entityId,
        oldValue: activityLogs.oldValue,
        newValue: activityLogs.newValue,
        metadata: activityLogs.metadata,
        createdAt: activityLogs.createdAt,
        userName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        userProfileImage: users.profileImageUrl,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(eq(activityLogs.id, id))
      .limit(1);

    if (!log) {
      return undefined;
    }

    return {
      id: log.id,
      userId: log.userId,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      oldValue: log.oldValue,
      newValue: log.newValue,
      metadata: log.metadata,
      createdAt: log.createdAt,
      user: log.userId
        ? {
            id: log.userId,
            email: log.userEmail || '',
            firstName: log.userName,
            lastName: log.userLastName,
            profileImageUrl: log.userProfileImage,
          }
        : null,
    };
  }

  async getActivityLogsAnalytics(days = 30): Promise<{
    periodDays: number;
    summary: {
      totalCount: number;
      previousCount: number;
      changePercent: number | null;
      activeUsers: number;
      affectedEntities: number;
      sensitiveActions: number;
      automatedActions: number;
      averagePerDay: number;
      lastActivityAt: Date | null;
    };
    topUsers: Array<{
      userId: string;
      userName: string;
      email: string;
      activityCount: number;
      profileImageUrl: string | null;
    }>;
    topActions: Array<{
      action: string;
      count: number;
    }>;
    topEntities: Array<{ entityType: string; count: number }>;
    recentActivity: Array<{
      date: string;
      count: number;
    }>;
  }> {
    const periodDays = [7, 30, 90].includes(days) ? days : 30;
    const periodStart = sql`NOW() - ${periodDays} * INTERVAL '1 day'`;
    const previousPeriodStart = sql`NOW() - ${periodDays * 2} * INTERVAL '1 day'`;

    const [summaryRow] = await db
      .select({
        totalCount: sql<number>`count(*) FILTER (WHERE ${activityLogs.createdAt} >= ${periodStart})::int`,
        previousCount: sql<number>`count(*) FILTER (WHERE ${activityLogs.createdAt} >= ${previousPeriodStart} AND ${activityLogs.createdAt} < ${periodStart})::int`,
        activeUsers: sql<number>`count(DISTINCT ${activityLogs.userId}) FILTER (WHERE ${activityLogs.createdAt} >= ${periodStart} AND ${activityLogs.userId} IS NOT NULL)::int`,
        affectedEntities: sql<number>`count(DISTINCT (${activityLogs.entityType}, ${activityLogs.entityId})) FILTER (WHERE ${activityLogs.createdAt} >= ${periodStart})::int`,
        sensitiveActions: sql<number>`count(*) FILTER (WHERE ${activityLogs.createdAt} >= ${periodStart} AND lower(${activityLogs.action}) IN ('delete', 'ban', 'reject', 'assign_role', 'remove_role', 'update_role_permissions', 'reset_password'))::int`,
        automatedActions: sql<number>`count(*) FILTER (WHERE ${activityLogs.createdAt} >= ${periodStart} AND ${activityLogs.userId} IS NULL)::int`,
        lastActivityAt: sql<Date | null>`max(${activityLogs.createdAt}) FILTER (WHERE ${activityLogs.createdAt} >= ${periodStart})`,
      })
      .from(activityLogs);

    const totalCount = summaryRow?.totalCount || 0;
    const previousCount = summaryRow?.previousCount || 0;
    const changePercent = previousCount > 0
      ? Math.round(((totalCount - previousCount) / previousCount) * 1000) / 10
      : null;

    const topUsersQuery = await db
      .select({
        userId: activityLogs.userId,
        userName: users.firstName,
        userLastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
        activityCount: sql<number>`count(*)::int`,
      })
      .from(activityLogs)
      .innerJoin(users, eq(activityLogs.userId, users.id))
      .where(gte(activityLogs.createdAt, periodStart))
      .groupBy(
        activityLogs.userId,
        users.firstName,
        users.lastName,
        users.email,
        users.profileImageUrl
      )
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const topUsers = topUsersQuery.map((user) => ({
      userId: user.userId || '',
      userName: `${user.userName || ''} ${user.userLastName || ''}`.trim() || user.email || 'مستخدم غير معروف',
      email: user.email || '',
      activityCount: user.activityCount,
      profileImageUrl: user.profileImageUrl,
    }));

    const topActionsQuery = await db
      .select({
        action: activityLogs.action,
        count: sql<number>`count(*)::int`,
      })
      .from(activityLogs)
      .where(gte(activityLogs.createdAt, periodStart))
      .groupBy(activityLogs.action)
      .orderBy(desc(sql`count(*)`))
      .limit(6);

    const topActions = topActionsQuery.map((item) => ({
      action: item.action,
      count: item.count,
    }));

    const topEntitiesQuery = await db
      .select({
        entityType: activityLogs.entityType,
        count: sql<number>`count(*)::int`,
      })
      .from(activityLogs)
      .where(gte(activityLogs.createdAt, periodStart))
      .groupBy(activityLogs.entityType)
      .orderBy(desc(sql`count(*)`))
      .limit(6);

    const recentActivityQuery = await db
      .select({
        date: sql<string>`DATE(${activityLogs.createdAt})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(activityLogs)
      .where(gte(activityLogs.createdAt, periodStart))
      .groupBy(sql`DATE(${activityLogs.createdAt})`)
      .orderBy(sql`DATE(${activityLogs.createdAt})`);

    const recentActivity = recentActivityQuery.map((item) => ({
      date: item.date,
      count: item.count,
    }));

    return {
      periodDays,
      summary: {
        totalCount,
        previousCount,
        changePercent,
        activeUsers: summaryRow?.activeUsers || 0,
        affectedEntities: summaryRow?.affectedEntities || 0,
        sensitiveActions: summaryRow?.sensitiveActions || 0,
        automatedActions: summaryRow?.automatedActions || 0,
        averagePerDay: Math.round((totalCount / periodDays) * 10) / 10,
        lastActivityAt: summaryRow?.lastActivityAt || null,
      },
      topUsers,
      topActions,
      topEntities: topEntitiesQuery.map((item) => ({
        entityType: item.entityType,
        count: item.count,
      })),
      recentActivity,
    };
  }

  // ============================================
  // Smart Blocks Operations - البلوكات الذكية
  // ============================================

  async createSmartBlock(data: InsertSmartBlock): Promise<SmartBlock> {
    const [block] = await db.insert(smartBlocks).values(data as any).returning();
    return block;
  }

  async getSmartBlocks(filters?: { isActive?: boolean; placement?: string }): Promise<SmartBlock[]> {
    let query = db.select().from(smartBlocks);

    const conditions = [];
    if (filters?.isActive !== undefined) {
      conditions.push(eq(smartBlocks.isActive, filters.isActive));
    }
    if (filters?.placement) {
      conditions.push(eq(smartBlocks.placement, filters.placement));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const blocks = await query.orderBy(desc(smartBlocks.createdAt)).limit(200);
    return blocks;
  }

  async getSmartBlockById(id: string): Promise<SmartBlock | undefined> {
    const [block] = await db.select().from(smartBlocks).where(eq(smartBlocks.id, id));
    return block;
  }

  async getSmartBlocksByPlacement(placement: string): Promise<SmartBlock[]> {
    const blocks = await db
      .select()
      .from(smartBlocks)
      .where(and(
        eq(smartBlocks.placement, placement),
        eq(smartBlocks.isActive, true)
      ))
      .orderBy(desc(smartBlocks.createdAt));
    return blocks;
  }

  async updateSmartBlock(id: string, updates: UpdateSmartBlock): Promise<SmartBlock> {
    const [updated] = await db
      .update(smartBlocks)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(smartBlocks.id, id))
      .returning();
    return updated;
  }

  async deleteSmartBlock(id: string): Promise<void> {
    await db.delete(smartBlocks).where(eq(smartBlocks.id, id));
  }

  async queryArticlesByKeyword(
    keyword: string,
    limit: number,
    filters?: {
      categories?: string[];
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<Array<any>> {
    console.log(`🔎 [Storage] Searching articles with keyword: "${keyword}"`);
    
    // Check if searching for infographics specifically
    const isInfographicSearch = keyword.toLowerCase().includes('إنفوجرافيك') || 
                                 keyword.toLowerCase().includes('infographic') ||
                                 keyword.toLowerCase().includes('انفوجرافيك');
    
    const conditions = [
      eq(articles.status, 'published'),
      // Exclude opinion articles
      or(
        isNull(articles.articleType),
        ne(articles.articleType, 'opinion')
      ),
      // For infographic searches: match by articleType OR seo keywords
      // For other searches: match by seo keywords only
      isInfographicSearch
        ? or(
            eq(articles.articleType, 'infographic'),
            sql`${articles.seo}::jsonb -> 'keywords' @> ${JSON.stringify([keyword])}::jsonb`
          )
        : sql`${articles.seo}::jsonb -> 'keywords' @> ${JSON.stringify([keyword])}::jsonb`
    ];

    if (filters?.categories && filters.categories.length > 0) {
      conditions.push(inArray(articles.categoryId, filters.categories));
      console.log(`   - Filtering by categories: ${filters.categories.join(', ')}`);
    }

    if (filters?.dateFrom) {
      conditions.push(gte(articles.publishedAt, new Date(filters.dateFrom)));
      console.log(`   - Date from: ${filters.dateFrom}`);
    }

    if (filters?.dateTo) {
      conditions.push(lte(articles.publishedAt, new Date(filters.dateTo)));
      console.log(`   - Date to: ${filters.dateTo}`);
    }

    console.log(`   - Limit: ${limit}`);

    const results = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        publishedAt: articles.publishedAt,
        imageUrl: articles.imageUrl,
        thumbnailUrl: articles.thumbnailUrl,
        infographicBannerUrl: articles.infographicBannerUrl,
        articleType: articles.articleType,
        updatedAt: articles.updatedAt,
        excerpt: articles.excerpt,
        newsType: articles.newsType,
        views: articles.views,
        aiGenerated: articles.aiGenerated,
        isAiGeneratedThumbnail: articles.isAiGeneratedThumbnail,
        imageFocalPoint: articles.imageFocalPoint,
        categoryId: categories.id,
        category: {
          nameAr: categories.nameAr,
          slug: categories.slug,
          color: categories.color,
        }
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(and(...conditions))
      .orderBy(desc(articles.displayOrder), desc(articles.publishedAt))
      .limit(limit);

    console.log(`✓ [Storage] Query returned ${results.length} results`);
    
    // Log each result
    results.forEach((article, index) => {
      console.log(`   ${index + 1}. "${article.title.substring(0, 50)}..." [Image: ${article.imageUrl ? '✓' : '✗'}]`);
    });

    return results;
  }

  async queryUrArticlesByKeyword(
    keyword: string,
    limit: number,
    filters?: {
      categories?: string[];
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<Array<any>> {
    console.log(`🔎 [Storage] Searching Urdu articles with keyword: "${keyword}"`);
    
    const conditions = [
      eq(urArticles.status, 'published'),
      // Search ONLY in seo.keywords JSONB array - not in title/excerpt
      sql`${urArticles.seo}::jsonb -> 'keywords' @> ${JSON.stringify([keyword])}::jsonb`
    ];

    if (filters?.categories && filters.categories.length > 0) {
      conditions.push(inArray(urArticles.categoryId, filters.categories));
      console.log(`   - Filtering by categories: ${filters.categories.join(', ')}`);
    }

    if (filters?.dateFrom) {
      conditions.push(gte(urArticles.publishedAt, new Date(filters.dateFrom)));
      console.log(`   - Date from: ${filters.dateFrom}`);
    }

    if (filters?.dateTo) {
      conditions.push(lte(urArticles.publishedAt, new Date(filters.dateTo)));
      console.log(`   - Date to: ${filters.dateTo}`);
    }

    console.log(`   - Limit: ${limit}`);

    const results = await db
      .select({
        id: urArticles.id,
        title: urArticles.title,
        slug: urArticles.slug,
        publishedAt: urArticles.publishedAt,
        imageUrl: urArticles.imageUrl,
        imageFocalPoint: urArticles.imageFocalPoint,
        categoryId: urCategories.id,
        category: {
          name: urCategories.name,
          slug: urCategories.slug,
          color: urCategories.color,
        }
      })
      .from(urArticles)
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .where(and(...conditions))
      .orderBy(desc(urArticles.publishedAt))
      .limit(limit);

    console.log(`✓ [Storage] Query returned ${results.length} results`);
    
    // Log each result
    results.forEach((article, index) => {
      console.log(`   ${index + 1}. "${article.title.substring(0, 50)}..." [Image: ${article.imageUrl ? '✓' : '✗'}]`);
    });

    return results;
  }

  // ============================================
  // Audio News Briefs Operations - الأخبار الصوتية السريعة
  // ============================================

  async createAudioNewsBrief(data: InsertAudioNewsBrief): Promise<AudioNewsBrief> {
    const [brief] = await db.insert(audioNewsBriefs).values(data as any).returning();
    return brief;
  }

  async getAudioNewsBriefById(id: string): Promise<AudioNewsBrief | null> {
    const brief = await db.query.audioNewsBriefs.findFirst({
      where: eq(audioNewsBriefs.id, id),
    });
    return brief || null;
  }

  async getAllAudioNewsBriefs(): Promise<AudioNewsBrief[]> {
    return db.query.audioNewsBriefs.findMany({
      orderBy: [desc(audioNewsBriefs.createdAt)],
    });
  }

  async getPublishedAudioNewsBriefs(limit = 10): Promise<AudioNewsBrief[]> {
    return db.query.audioNewsBriefs.findMany({
      where: eq(audioNewsBriefs.status, 'published'),
      orderBy: [desc(audioNewsBriefs.publishedAt)],
      limit,
    });
  }

  async updateAudioNewsBrief(id: string, data: Partial<InsertAudioNewsBrief>): Promise<AudioNewsBrief> {
    const [updated] = await db.update(audioNewsBriefs)
      .set({ ...data as any, updatedAt: new Date() })
      .where(eq(audioNewsBriefs.id, id))
      .returning();
    return updated;
  }

  async deleteAudioNewsBrief(id: string): Promise<void> {
    await db.delete(audioNewsBriefs).where(eq(audioNewsBriefs.id, id));
  }

  async publishAudioNewsBrief(id: string): Promise<AudioNewsBrief> {
    const [published] = await db.update(audioNewsBriefs)
      .set({ 
        status: 'published', 
        publishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(audioNewsBriefs.id, id))
      .returning();
    return published;
  }

  // ============================================
  // Audio Newsletters Operations - النشرات الصوتية
  // ============================================

  async createAudioNewsletter(data: InsertAudioNewsletter): Promise<AudioNewsletter> {
    const [newsletter] = await db
      .insert(audioNewsletters)
      .values(data as any)
      .returning();
    return newsletter;
  }

  async getAudioNewsletterById(id: string): Promise<AudioNewsletterWithDetails | null> {
    const [newsletter] = await db
      .select()
      .from(audioNewsletters)
      .where(eq(audioNewsletters.id, id));

    if (!newsletter) return null;

    // Get articles with details
    const articlesList = await db
      .select()
      .from(audioNewsletterArticles)
      .leftJoin(articles, eq(audioNewsletterArticles.articleId, articles.id))
      .where(eq(audioNewsletterArticles.newsletterId, id))
      .orderBy(asc(audioNewsletterArticles.order));

    const articlesWithDetails = articlesList.map((row) => ({
      ...row.audio_newsletter_articles,
      article: row.articles || undefined,
    }));

    // Get listen count
    const [listensCount] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(audioNewsletterListens)
      .where(eq(audioNewsletterListens.newsletterId, id));

    return {
      ...newsletter,
      articles: articlesWithDetails,
      _count: {
        articles: articlesWithDetails.length,
        listens: listensCount?.count || 0,
      },
    };
  }

  async getAudioNewsletterBySlug(slug: string): Promise<AudioNewsletterWithDetails | null> {
    const [newsletter] = await db
      .select()
      .from(audioNewsletters)
      .where(eq(audioNewsletters.slug, slug));

    if (!newsletter) return null;

    return this.getAudioNewsletterById(newsletter.id);
  }

  async getAllAudioNewsletters(filters?: { 
    status?: string; 
    limit?: number; 
    offset?: number 
  }): Promise<AudioNewsletterWithDetails[]> {
    let query = db
      .select()
      .from(audioNewsletters)
      .orderBy(desc(audioNewsletters.publishedAt), desc(audioNewsletters.createdAt));

    if (filters?.status) {
      query = query.where(eq(audioNewsletters.status, filters.status)) as any;
    }

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    const newsletters = await query;

    // Fetch details for each newsletter
    const newslettersWithDetails = await Promise.all(
      newsletters.map(async (newsletter) => {
        const details = await this.getAudioNewsletterById(newsletter.id);
        return details!;
      })
    );

    return newslettersWithDetails;
  }

  async updateAudioNewsletter(id: string, data: UpdateAudioNewsletter): Promise<AudioNewsletter> {
    const [updated] = await db
      .update(audioNewsletters)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(audioNewsletters.id, id))
      .returning();
    return updated;
  }

  async deleteAudioNewsletter(id: string): Promise<void> {
    await db.delete(audioNewsletters).where(eq(audioNewsletters.id, id));
  }

  async addArticlesToNewsletter(newsletterId: string, articleIds: string[]): Promise<void> {
    // Get current max order
    const [maxOrder] = await db
      .select({ max: sql<number>`cast(coalesce(max(${audioNewsletterArticles.order}), 0) as integer)` })
      .from(audioNewsletterArticles)
      .where(eq(audioNewsletterArticles.newsletterId, newsletterId));

    let currentOrder = (maxOrder?.max || 0) + 1;

    // Insert articles in order
    for (const articleId of articleIds) {
      await db
        .insert(audioNewsletterArticles)
        .values({
          newsletterId,
          articleId,
          order: currentOrder++,
        })
        .onConflictDoNothing();
    }
  }

  async removeArticleFromNewsletter(newsletterId: string, articleId: string): Promise<void> {
    await db
      .delete(audioNewsletterArticles)
      .where(
        and(
          eq(audioNewsletterArticles.newsletterId, newsletterId),
          eq(audioNewsletterArticles.articleId, articleId)
        )
      );
  }

  async getNewsletterArticles(newsletterId: string): Promise<(AudioNewsletterArticle & { article?: Article })[]> {
    const results = await db
      .select()
      .from(audioNewsletterArticles)
      .leftJoin(articles, eq(audioNewsletterArticles.articleId, articles.id))
      .where(eq(audioNewsletterArticles.newsletterId, newsletterId))
      .orderBy(asc(audioNewsletterArticles.order));

    return results.map((row) => ({
      ...row.audio_newsletter_articles,
      article: row.articles || undefined,
    }));
  }

  async trackListen(data: InsertAudioNewsletterListen): Promise<AudioNewsletterListen> {
    // Insert listen event
    const [listen] = await db
      .insert(audioNewsletterListens)
      .values(data as any)
      .returning();

    // Atomic analytics update using SQL subqueries (fixes race conditions)
    await db
      .update(audioNewsletters)
      .set({
        totalListens: sql`${audioNewsletters.totalListens} + 1`,
        uniqueListeners: sql`(
          SELECT COUNT(DISTINCT COALESCE(${audioNewsletterListens.userId}, ${audioNewsletterListens.sessionId}))
          FROM ${audioNewsletterListens}
          WHERE ${audioNewsletterListens.newsletterId} = ${data.newsletterId}
        )`,
        averageCompletionRate: sql`(
          SELECT COALESCE(AVG(${audioNewsletterListens.completionPercentage}), 0)
          FROM ${audioNewsletterListens}
          WHERE ${audioNewsletterListens.newsletterId} = ${data.newsletterId}
        )`,
        updatedAt: new Date()
      })
      .where(eq(audioNewsletters.id, data.newsletterId));

    return listen;
  }

  async getNewsletterAnalytics(newsletterId: string): Promise<{
    totalListens: number;
    uniqueListeners: number;
    averageCompletionRate: number;
    listensByDay: { date: string; count: number }[];
  }> {
    // Get unique listeners
    const [uniqueListeners] = await db
      .select({
        count: sql<number>`cast(
          count(distinct coalesce(${audioNewsletterListens.userId}, ${audioNewsletterListens.sessionId}))
          as integer
        )`,
      })
      .from(audioNewsletterListens)
      .where(eq(audioNewsletterListens.newsletterId, newsletterId));

    // Get total listens
    const [totalListens] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(audioNewsletterListens)
      .where(eq(audioNewsletterListens.newsletterId, newsletterId));

    // Calculate average completion rate
    const [avgCompletion] = await db
      .select({
        avg: sql<number>`cast(coalesce(avg(${audioNewsletterListens.completionPercentage}), 0) as real)`,
      })
      .from(audioNewsletterListens)
      .where(eq(audioNewsletterListens.newsletterId, newsletterId));

    // Get listens by day (last 30 days)
    const listensByDay = await db
      .select({
        date: sql<string>`date(${audioNewsletterListens.startedAt})`,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(audioNewsletterListens)
      .where(
        and(
          eq(audioNewsletterListens.newsletterId, newsletterId),
          gte(audioNewsletterListens.startedAt, sql`now() - interval '30 days'`)
        )
      )
      .groupBy(sql`date(${audioNewsletterListens.startedAt})`)
      .orderBy(sql`date(${audioNewsletterListens.startedAt})`);

    return {
      totalListens: totalListens?.count || 0,
      uniqueListeners: uniqueListeners?.count || 0,
      averageCompletionRate: avgCompletion?.avg || 0,
      listensByDay: listensByDay.map((row) => ({
        date: row.date,
        count: row.count,
      })),
    };
  }

  // ============================================
  // Internal Announcements Operations - نظام الإعلانات الداخلية المتقدم
  // ============================================

  async createInternalAnnouncement(data: InsertInternalAnnouncement): Promise<InternalAnnouncement> {
    const [announcement] = await db
      .insert(internalAnnouncements)
      .values(data as any)
      .returning();
    return announcement;
  }

  async getInternalAnnouncementById(id: string): Promise<InternalAnnouncementWithDetails | null> {
    const creatorAlias = aliasedTable(users, 'creator');
    const updaterAlias = aliasedTable(users, 'updater');
    const publisherAlias = aliasedTable(users, 'publisher');

    const [announcement] = await db
      .select()
      .from(internalAnnouncements)
      .leftJoin(creatorAlias, eq(internalAnnouncements.createdBy, creatorAlias.id))
      .leftJoin(updaterAlias, eq(internalAnnouncements.updatedBy, updaterAlias.id))
      .leftJoin(publisherAlias, eq(internalAnnouncements.publishedBy, publisherAlias.id))
      .where(eq(internalAnnouncements.id, id));

    if (!announcement) return null;

    // Get versions
    const versions = await db
      .select()
      .from(internalAnnouncementVersions)
      .where(eq(internalAnnouncementVersions.announcementId, id))
      .orderBy(desc(internalAnnouncementVersions.createdAt));

    // Get metrics
    const metrics = await db
      .select()
      .from(internalAnnouncementMetrics)
      .where(eq(internalAnnouncementMetrics.announcementId, id));

    // Calculate counts
    const [impressionsCount] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, id),
          eq(internalAnnouncementMetrics.event, 'impression')
        )
      );

    const [uniqueViewsCount] = await db
      .select({ count: sql<number>`cast(count(distinct ${internalAnnouncementMetrics.userId}) as integer)` })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, id),
          eq(internalAnnouncementMetrics.event, 'unique_view')
        )
      );

    const [dismissalsCount] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, id),
          eq(internalAnnouncementMetrics.event, 'dismiss')
        )
      );

    const [clicksCount] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, id),
          eq(internalAnnouncementMetrics.event, 'click')
        )
      );

    return {
      ...announcement.internal_announcements,
      creator: announcement.creator || undefined,
      updater: announcement.updater || undefined,
      publisher: announcement.publisher || undefined,
      versions,
      metrics,
      _count: {
        versions: versions.length,
        metrics: metrics.length,
        impressions: impressionsCount?.count || 0,
        uniqueViews: uniqueViewsCount?.count || 0,
        dismissals: dismissalsCount?.count || 0,
        clicks: clicksCount?.count || 0,
      },
    };
  }

  async getAllInternalAnnouncements(filters?: {
    status?: string;
    priority?: string;
    channel?: string;
    tags?: string[];
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<InternalAnnouncementWithDetails[]> {
    const creatorAlias = aliasedTable(users, 'creator');
    
    let query = db
      .select()
      .from(internalAnnouncements)
      .leftJoin(creatorAlias, eq(internalAnnouncements.createdBy, creatorAlias.id))
      .orderBy(desc(internalAnnouncements.createdAt));

    const conditions = [];

    if (filters?.status) {
      conditions.push(eq(internalAnnouncements.status, filters.status));
    }

    if (filters?.priority) {
      conditions.push(eq(internalAnnouncements.priority, filters.priority));
    }

    if (filters?.channel) {
      conditions.push(sql`${internalAnnouncements.channels}::jsonb @> ${JSON.stringify([filters.channel])}::jsonb`);
    }

    if (filters?.tags && filters.tags.length > 0) {
      conditions.push(sql`${internalAnnouncements.tags}::jsonb ?| array[${filters.tags.map(t => `'${t}'`).join(',')}]`);
    }

    if (filters?.search) {
      conditions.push(
        or(
          ilike(internalAnnouncements.title, `%${filters.search}%`),
          ilike(internalAnnouncements.message, `%${filters.search}%`)
        )!
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }

    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    const results = await query;

    // Fetch details for each announcement
    const announcementsWithDetails = await Promise.all(
      results.map(async (row) => {
        const details = await this.getInternalAnnouncementById(row.internal_announcements.id);
        return details!;
      })
    );

    return announcementsWithDetails;
  }

  async updateInternalAnnouncement(
    id: string,
    data: UpdateInternalAnnouncement,
    changedBy: string,
    changeReason?: string
  ): Promise<InternalAnnouncement> {
    // Get current announcement for version snapshot
    const [current] = await db
      .select()
      .from(internalAnnouncements)
      .where(eq(internalAnnouncements.id, id));

    if (!current) {
      throw new Error('Announcement not found');
    }

    // Create version snapshot
    await this.createAnnouncementVersion({
      announcementId: id,
      title: current.title,
      message: current.message,
      priority: current.priority,
      status: current.status,
      channels: current.channels as string[],
      audienceRoles: current.audienceRoles as string[] | undefined,
      audienceUserIds: current.audienceUserIds as string[] | undefined,
      tags: current.tags as string[] | undefined,
      changedBy,
      changeReason,
    });

    // Update announcement
    const [updated] = await db
      .update(internalAnnouncements)
      .set({
        ...data,
        updatedBy: changedBy,
        updatedAt: new Date(),
      } as any)
      .where(eq(internalAnnouncements.id, id))
      .returning();

    return updated;
  }

  async deleteInternalAnnouncement(id: string): Promise<void> {
    await db.delete(internalAnnouncements).where(eq(internalAnnouncements.id, id));
  }

  async publishInternalAnnouncement(id: string, publishedBy: string): Promise<InternalAnnouncement> {
    const [published] = await db
      .update(internalAnnouncements)
      .set({
        status: 'published',
        publishedBy,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(internalAnnouncements.id, id))
      .returning();

    return published;
  }

  async archiveInternalAnnouncement(id: string): Promise<InternalAnnouncement> {
    const [archived] = await db
      .update(internalAnnouncements)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(internalAnnouncements.id, id))
      .returning();

    return archived;
  }

  async scheduleInternalAnnouncement(id: string, startAt: Date, endAt?: Date): Promise<InternalAnnouncement> {
    const [scheduled] = await db
      .update(internalAnnouncements)
      .set({
        status: 'scheduled',
        startAt,
        endAt,
        updatedAt: new Date(),
      })
      .where(eq(internalAnnouncements.id, id))
      .returning();

    return scheduled;
  }

  async getActiveAnnouncementsForUser(
    userId: string,
    userRoles: string[],
    channel?: string
  ): Promise<InternalAnnouncementWithDetails[]> {
    const now = new Date();

    let query = db
      .select()
      .from(internalAnnouncements)
      .where(
        and(
          eq(internalAnnouncements.status, 'published'),
          or(
            isNull(internalAnnouncements.startAt),
            lte(internalAnnouncements.startAt, now)
          )!,
          or(
            isNull(internalAnnouncements.endAt),
            gte(internalAnnouncements.endAt, now)
          )!
        )
      )
      .orderBy(desc(internalAnnouncements.priority), desc(internalAnnouncements.publishedAt));

    const announcements = await query;

    // Filter by channel if specified
    let filteredAnnouncements = announcements;
    if (channel) {
      filteredAnnouncements = announcements.filter(a => 
        (a.channels as string[]).includes(channel)
      );
    }

    // Exact role-name targeting; empty arrays have the same meaning as null (everyone).
    filteredAnnouncements = filteredAnnouncements.filter((announcement) =>
      matchesInternalAnnouncementAudience(
        {
          audienceRoles: announcement.audienceRoles as string[] | null,
          audienceUserIds: announcement.audienceUserIds as string[] | null,
        },
        userId,
        userRoles,
      ),
    );

    // Fetch details for each announcement
    const announcementsWithDetails = await Promise.all(
      filteredAnnouncements.map(async (announcement) => {
        const details = await this.getInternalAnnouncementById(announcement.id);
        return details!;
      })
    );

    return announcementsWithDetails;
  }

  async createAnnouncementVersion(data: InsertInternalAnnouncementVersion): Promise<InternalAnnouncementVersion> {
    const [version] = await db
      .insert(internalAnnouncementVersions)
      .values(data as any)
      .returning();

    return version;
  }

  async getAnnouncementVersions(announcementId: string): Promise<InternalAnnouncementVersion[]> {
    const versions = await db
      .select()
      .from(internalAnnouncementVersions)
      .where(eq(internalAnnouncementVersions.announcementId, announcementId))
      .orderBy(desc(internalAnnouncementVersions.createdAt));

    return versions;
  }

  async restoreAnnouncementVersion(versionId: string, restoredBy: string): Promise<InternalAnnouncement> {
    // Get the version
    const [version] = await db
      .select()
      .from(internalAnnouncementVersions)
      .where(eq(internalAnnouncementVersions.id, versionId));

    if (!version) {
      throw new Error('Version not found');
    }

    // Get current announcement for creating a version snapshot before restore
    const [current] = await db
      .select()
      .from(internalAnnouncements)
      .where(eq(internalAnnouncements.id, version.announcementId));

    if (!current) {
      throw new Error('Announcement not found');
    }

    // Create snapshot of current state before restoring
    await this.createAnnouncementVersion({
      announcementId: version.announcementId,
      title: current.title,
      message: current.message,
      priority: current.priority,
      status: current.status,
      channels: current.channels as string[],
      audienceRoles: current.audienceRoles as string[] | undefined,
      audienceUserIds: current.audienceUserIds as string[] | undefined,
      tags: current.tags as string[] | undefined,
      changedBy: restoredBy,
      changeReason: `Restored from version ${versionId}`,
    });

    // Restore the version
    const [restored] = await db
      .update(internalAnnouncements)
      .set({
        title: version.title,
        message: version.message,
        priority: version.priority,
        status: version.status,
        channels: version.channels as any,
        audienceRoles: version.audienceRoles as any,
        audienceUserIds: version.audienceUserIds as any,
        tags: version.tags as any,
        updatedBy: restoredBy,
        updatedAt: new Date(),
      })
      .where(eq(internalAnnouncements.id, version.announcementId))
      .returning();

    return restored;
  }

  async trackAnnouncementMetric(data: InsertInternalAnnouncementMetric): Promise<InternalAnnouncementMetric> {
    const [metric] = await db
      .insert(internalAnnouncementMetrics)
      .values(data as any)
      .returning();

    return metric;
  }

  async getAnnouncementMetrics(announcementId: string, event?: string): Promise<InternalAnnouncementMetric[]> {
    const conditions = [eq(internalAnnouncementMetrics.announcementId, announcementId)];
    
    if (event) {
      conditions.push(eq(internalAnnouncementMetrics.event, event));
    }

    const metrics = await db
      .select()
      .from(internalAnnouncementMetrics)
      .where(and(...conditions))
      .orderBy(desc(internalAnnouncementMetrics.occurredAt));

    return metrics;
  }

  async getAnnouncementAnalytics(announcementId: string): Promise<{
    totalImpressions: number;
    uniqueViews: number;
    dismissals: number;
    clicks: number;
    viewsByChannel: { channel: string; count: number }[];
    viewsByDay: { date: string; count: number }[];
  }> {
    // Total impressions
    const [impressions] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, announcementId),
          eq(internalAnnouncementMetrics.event, 'impression')
        )
      );

    // Unique views
    const [uniqueViews] = await db
      .select({ 
        count: sql<number>`cast(count(distinct ${internalAnnouncementMetrics.userId}) as integer)` 
      })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, announcementId),
          eq(internalAnnouncementMetrics.event, 'unique_view')
        )
      );

    // Dismissals
    const [dismissals] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, announcementId),
          eq(internalAnnouncementMetrics.event, 'dismiss')
        )
      );

    // Clicks
    const [clicks] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, announcementId),
          eq(internalAnnouncementMetrics.event, 'click')
        )
      );

    // Views by channel
    const viewsByChannel = await db
      .select({
        channel: internalAnnouncementMetrics.channel,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, announcementId),
          eq(internalAnnouncementMetrics.event, 'unique_view')
        )
      )
      .groupBy(internalAnnouncementMetrics.channel)
      .orderBy(desc(sql`count(*)`));

    // Views by day (last 30 days)
    const viewsByDay = await db
      .select({
        date: sql<string>`date(${internalAnnouncementMetrics.occurredAt})`,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(internalAnnouncementMetrics)
      .where(
        and(
          eq(internalAnnouncementMetrics.announcementId, announcementId),
          eq(internalAnnouncementMetrics.event, 'unique_view'),
          gte(internalAnnouncementMetrics.occurredAt, sql`now() - interval '30 days'`)
        )
      )
      .groupBy(sql`date(${internalAnnouncementMetrics.occurredAt})`)
      .orderBy(sql`date(${internalAnnouncementMetrics.occurredAt})`);

    return {
      totalImpressions: impressions?.count || 0,
      uniqueViews: uniqueViews?.count || 0,
      dismissals: dismissals?.count || 0,
      clicks: clicks?.count || 0,
      viewsByChannel: viewsByChannel.map((row) => ({
        channel: row.channel || 'unknown',
        count: row.count,
      })),
      viewsByDay: viewsByDay.map((row) => ({
        date: row.date,
        count: row.count,
      })),
    };
  }

  async processScheduledAnnouncements(): Promise<void> {
    const now = new Date();

    // Publish scheduled announcements whose startAt time has arrived
    await db
      .update(internalAnnouncements)
      .set({
        status: 'published',
        publishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(internalAnnouncements.status, 'scheduled'),
          lte(internalAnnouncements.startAt, now)
        )
      );

    // Expire published announcements whose endAt time has passed
    await db
      .update(internalAnnouncements)
      .set({
        status: 'expired',
        updatedAt: now,
      })
      .where(
        and(
          eq(internalAnnouncements.status, 'published'),
          lte(internalAnnouncements.endAt, now)
        )
      );
  }

  // ============================================
  // Sabq Shorts (Reels) Operations - سبق شورتس
  // ============================================

  async getAllShorts(filters?: {
    status?: string;
    categoryId?: string;
    reporterId?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    shorts: ShortWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(shorts.status, filters.status));
    }
    if (filters?.categoryId) {
      conditions.push(eq(shorts.categoryId, filters.categoryId));
    }
    if (filters?.reporterId) {
      conditions.push(eq(shorts.reporterId, filters.reporterId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shorts)
      .where(whereClause);

    // Get shorts with relations
    const results = await db
      .select({
        short: shorts,
        category: categoryBasicSelect,
        reporter: userPublicSelect,
      })
      .from(shorts)
      .leftJoin(categories, eq(shorts.categoryId, categories.id))
      .leftJoin(users, eq(shorts.reporterId, users.id))
      .where(whereClause)
      .orderBy(desc(shorts.publishedAt), desc(shorts.createdAt))
      .limit(limit)
      .offset(offset);

    const shortsWithDetails: ShortWithDetails[] = results.map(r => ({
      ...r.short,
      category: r.category || undefined,
      reporter: r.reporter || undefined,
    })) as unknown as ShortWithDetails[];

    return {
      shorts: shortsWithDetails,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  async getShortById(id: string): Promise<ShortWithDetails | undefined> {
    const [result] = await db
      .select({
        short: shorts,
        category: categoryBasicSelect,
        reporter: userPublicSelect,
      })
      .from(shorts)
      .leftJoin(categories, eq(shorts.categoryId, categories.id))
      .leftJoin(users, eq(shorts.reporterId, users.id))
      .where(eq(shorts.id, id));

    if (!result) return undefined;

    return {
      ...result.short,
      category: result.category || undefined,
      reporter: result.reporter || undefined,
    } as unknown as ShortWithDetails;
  }

  async getShortBySlug(slug: string): Promise<ShortWithDetails | undefined> {
    const [result] = await db
      .select({
        short: shorts,
        category: categoryBasicSelect,
        reporter: userPublicSelect,
      })
      .from(shorts)
      .leftJoin(categories, eq(shorts.categoryId, categories.id))
      .leftJoin(users, eq(shorts.reporterId, users.id))
      .where(
        and(
          eq(shorts.slug, slug),
          eq(shorts.status, 'published')
        )
      );

    if (!result) return undefined;

    return {
      ...result.short,
      category: result.category || undefined,
      reporter: result.reporter || undefined,
    } as unknown as ShortWithDetails;
  }

  async createShort(data: InsertShort): Promise<Short> {
    const [short] = await db.insert(shorts).values(data).returning();
    return short;
  }

  async updateShort(id: string, updates: UpdateShort): Promise<Short> {
    const [short] = await db
      .update(shorts)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(shorts.id, id))
      .returning();

    return short;
  }

  async deleteShort(id: string): Promise<Short> {
    const [short] = await db
      .update(shorts)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(shorts.id, id))
      .returning();

    return short;
  }

  async incrementShortViews(id: string): Promise<void> {
    await db
      .update(shorts)
      .set({
        views: sql`${shorts.views} + 1`,
      })
      .where(eq(shorts.id, id));
  }

  async likeShort(id: string): Promise<Short> {
    const [short] = await db
      .update(shorts)
      .set({
        likes: sql`${shorts.likes} + 1`,
      })
      .where(eq(shorts.id, id))
      .returning();

    return short;
  }

  async shareShort(id: string): Promise<Short> {
    const [short] = await db
      .update(shorts)
      .set({
        shares: sql`${shorts.shares} + 1`,
      })
      .where(eq(shorts.id, id))
      .returning();

    return short;
  }

  async trackShortAnalytic(data: InsertShortAnalytic): Promise<ShortAnalytic> {
    const [analytic] = await db
      .insert(shortAnalytics)
      .values(data)
      .returning();

    return analytic;
  }

  async getShortAnalytics(shortId: string, filters?: {
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    totalViews: number;
    totalLikes: number;
    totalShares: number;
    uniqueViewers: number;
    averageWatchTime: number;
    completionRate: number;
    eventsByType: { eventType: string; count: number }[];
    viewsByDay: { date: string; count: number }[];
  }> {
    // Build where conditions for analytics
    const conditions = [eq(shortAnalytics.shortId, shortId)];
    
    if (filters?.eventType) {
      conditions.push(eq(shortAnalytics.eventType, filters.eventType));
    }
    if (filters?.startDate) {
      conditions.push(gte(shortAnalytics.occurredAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(shortAnalytics.occurredAt, filters.endDate));
    }

    const whereClause = and(...conditions);

    // Get total views count
    const [viewsResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shortAnalytics)
      .where(
        and(
          eq(shortAnalytics.shortId, shortId),
          eq(shortAnalytics.eventType, 'view')
        )
      );

    // Get unique viewers
    const [uniqueViewersResult] = await db
      .select({ count: sql<number>`count(DISTINCT COALESCE(${shortAnalytics.userId}, ${shortAnalytics.sessionId}))::int` })
      .from(shortAnalytics)
      .where(
        and(
          eq(shortAnalytics.shortId, shortId),
          eq(shortAnalytics.eventType, 'view')
        )
      );

    // Get average watch time
    const [watchTimeResult] = await db
      .select({ 
        avgWatchTime: sql<number>`COALESCE(AVG(${shortAnalytics.watchTime}), 0)::int`
      })
      .from(shortAnalytics)
      .where(
        and(
          eq(shortAnalytics.shortId, shortId),
          eq(shortAnalytics.eventType, 'watch_time')
        )
      );

    // Get the short to calculate completion rate
    const short = await this.getShortById(shortId);
    const videoDuration = short?.duration || 1;
    const completionRate = watchTimeResult.avgWatchTime / videoDuration;

    // Get events by type
    const eventsByType = await db
      .select({
        eventType: shortAnalytics.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(shortAnalytics)
      .where(eq(shortAnalytics.shortId, shortId))
      .groupBy(shortAnalytics.eventType);

    // Get views by day
    const viewsByDay = await db
      .select({
        date: sql<string>`DATE(${shortAnalytics.occurredAt})::text`,
        count: sql<number>`count(*)::int`,
      })
      .from(shortAnalytics)
      .where(
        and(
          eq(shortAnalytics.shortId, shortId),
          eq(shortAnalytics.eventType, 'view')
        )
      )
      .groupBy(sql`DATE(${shortAnalytics.occurredAt})`)
      .orderBy(sql`DATE(${shortAnalytics.occurredAt})`);

    // Get likes and shares counts
    const [likesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shortAnalytics)
      .where(
        and(
          eq(shortAnalytics.shortId, shortId),
          eq(shortAnalytics.eventType, 'like')
        )
      );

    const [sharesResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shortAnalytics)
      .where(
        and(
          eq(shortAnalytics.shortId, shortId),
          eq(shortAnalytics.eventType, 'share')
        )
      );

    return {
      totalViews: viewsResult.count,
      totalLikes: likesResult.count,
      totalShares: sharesResult.count,
      uniqueViewers: uniqueViewersResult.count,
      averageWatchTime: watchTimeResult.avgWatchTime,
      completionRate,
      eventsByType,
      viewsByDay,
    };
  }

  async getFeaturedShorts(limit: number = 10): Promise<ShortWithDetails[]> {
    const results = await db
      .select({
        short: shorts,
        category: categoryBasicSelect,
        reporter: userPublicSelect,
      })
      .from(shorts)
      .leftJoin(categories, eq(shorts.categoryId, categories.id))
      .leftJoin(users, eq(shorts.reporterId, users.id))
      .where(
        and(
          eq(shorts.status, 'published'),
          eq(shorts.isFeatured, true)
        )
      )
      .orderBy(desc(shorts.displayOrder), desc(shorts.publishedAt))
      .limit(limit);

    return results.map(r => ({
      ...r.short,
      category: r.category || undefined,
      reporter: r.reporter || undefined,
    })) as unknown as ShortWithDetails[];
  }

  // ============================================
  // Calendar System Implementation - تقويم سبق
  // ============================================

  async getAllCalendarEvents(filters?: {
    type?: string;
    importance?: number;
    dateFrom?: Date;
    dateTo?: Date;
    categoryId?: string;
    tags?: string[];
    searchQuery?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    events: Array<CalendarEvent & { category?: Category | null; createdBy?: User | null }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      type,
      importance,
      dateFrom,
      dateTo,
      categoryId,
      tags,
      searchQuery,
      page = 1,
      limit = 50,
    } = filters || {};

    const conditions = [];

    if (type) conditions.push(eq(calendarEvents.type, type));
    if (importance !== undefined) conditions.push(eq(calendarEvents.importance, importance));
    if (dateFrom) conditions.push(gte(calendarEvents.dateStart, dateFrom));
    if (dateTo) conditions.push(lte(calendarEvents.dateStart, dateTo));
    if (categoryId) conditions.push(eq(calendarEvents.categoryId, categoryId));
    if (tags && tags.length > 0) {
      conditions.push(sql`${calendarEvents.tags} && ${tags}`);
    }
    if (searchQuery) {
      conditions.push(
        or(
          ilike(calendarEvents.title, `%${searchQuery}%`),
          ilike(calendarEvents.description, `%${searchQuery}%`)
        )!
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(whereClause);

    const total = countResult.count;
    const offset = (page - 1) * limit;

    const results = await db
      .select({
        event: calendarEvents,
        category: categoryBasicSelect,
        createdBy: userPublicSelect,
      })
      .from(calendarEvents)
      .leftJoin(categories, eq(calendarEvents.categoryId, categories.id))
      .leftJoin(users, eq(calendarEvents.createdById, users.id))
      .where(whereClause)
      .orderBy(asc(calendarEvents.dateStart))
      .limit(limit)
      .offset(offset);

    const events = results.map(r => ({
      ...r.event,
      category: r.category,
      createdBy: r.createdBy,
    })) as unknown as (CalendarEvent & { category?: Category | null; createdBy?: User | null })[];

    return {
      events,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCalendarEventById(id: string): Promise<(CalendarEvent & { category?: Category | null; createdBy?: User | null }) | undefined> {
    const [result] = await db
      .select({
        event: calendarEvents,
        category: categoryBasicSelect,
        createdBy: userPublicSelect,
      })
      .from(calendarEvents)
      .leftJoin(categories, eq(calendarEvents.categoryId, categories.id))
      .leftJoin(users, eq(calendarEvents.createdById, users.id))
      .where(eq(calendarEvents.id, id))
      .limit(1);

    if (!result) return undefined;

    return {
      ...result.event,
      category: result.category,
      createdBy: result.createdBy,
    } as unknown as (CalendarEvent & { category?: Category | null; createdBy?: User | null });
  }

  async getCalendarEventBySlug(slug: string): Promise<(CalendarEvent & { category?: Category | null; createdBy?: User | null }) | undefined> {
    const [result] = await db
      .select({
        event: calendarEvents,
        category: categoryBasicSelect,
        createdBy: userPublicSelect,
      })
      .from(calendarEvents)
      .leftJoin(categories, eq(calendarEvents.categoryId, categories.id))
      .leftJoin(users, eq(calendarEvents.createdById, users.id))
      .where(eq(calendarEvents.slug, slug))
      .limit(1);

    if (!result) return undefined;

    return {
      ...result.event,
      category: result.category,
      createdBy: result.createdBy,
    } as unknown as (CalendarEvent & { category?: Category | null; createdBy?: User | null });
  }

  async createCalendarEvent(event: InsertCalendarEvent, reminders?: InsertCalendarReminder[]): Promise<CalendarEvent> {
    return await db.transaction(async (tx) => {
      const [newEvent] = await tx.insert(calendarEvents).values(event as any).returning();

      if (reminders && reminders.length > 0) {
        const reminderValues = reminders.map(r => ({
          ...r,
          eventId: newEvent.id,
        }));
        await tx.insert(calendarReminders).values(reminderValues as any);
      }

      return newEvent;
    });
  }

  async updateCalendarEvent(id: string, updates: UpdateCalendarEvent): Promise<CalendarEvent> {
    // تحويل التواريخ من strings إلى Date objects
    const processedUpdates: any = { ...updates };
    
    if (processedUpdates.dateStart && typeof processedUpdates.dateStart === 'string') {
      processedUpdates.dateStart = new Date(processedUpdates.dateStart);
    }
    
    if (processedUpdates.dateEnd && typeof processedUpdates.dateEnd === 'string') {
      processedUpdates.dateEnd = new Date(processedUpdates.dateEnd);
    }
    
    const [updated] = await db
      .update(calendarEvents)
      .set({ ...processedUpdates, updatedAt: new Date() } as any)
      .where(eq(calendarEvents.id, id))
      .returning();

    return updated;
  }

  async deleteCalendarEvent(id: string): Promise<void> {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  }

  async getUpcomingCalendarEvents(days: number = 7): Promise<Array<CalendarEvent & { category?: Category | null }>> {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const results = await db
      .select({
        event: calendarEvents,
        category: categoryBasicSelect,
      })
      .from(calendarEvents)
      .leftJoin(categories, eq(calendarEvents.categoryId, categories.id))
      .where(
        and(
          gte(calendarEvents.dateStart, now),
          lte(calendarEvents.dateStart, endDate)
        )
      )
      .orderBy(asc(calendarEvents.dateStart));

    return results.map(r => ({
      ...r.event,
      category: r.category,
    })) as unknown as Array<CalendarEvent & { category?: Category | null }>;
  }

  async getCalendarReminders(eventId: string): Promise<CalendarReminder[]> {
    return await db
      .select()
      .from(calendarReminders)
      .where(eq(calendarReminders.eventId, eventId))
      .orderBy(asc(calendarReminders.fireWhen));
  }

  async createCalendarReminder(reminder: InsertCalendarReminder): Promise<CalendarReminder> {
    const [newReminder] = await db
      .insert(calendarReminders)
      .values(reminder as any)
      .returning();
    return newReminder;
  }

  async updateCalendarReminder(id: string, updates: Partial<InsertCalendarReminder>): Promise<CalendarReminder> {
    const [updated] = await db
      .update(calendarReminders)
      .set(updates as any)
      .where(eq(calendarReminders.id, id))
      .returning();
    return updated;
  }

  async deleteCalendarReminder(id: string): Promise<void> {
    await db.delete(calendarReminders).where(eq(calendarReminders.id, id));
  }

  async getRemindersToFire(date: Date): Promise<Array<CalendarReminder & { event: CalendarEvent }>> {
    const results = await db
      .select({
        reminder: calendarReminders,
        event: calendarEvents,
      })
      .from(calendarReminders)
      .innerJoin(calendarEvents, eq(calendarReminders.eventId, calendarEvents.id))
      .where(
        and(
          eq(calendarReminders.enabled, true),
          sql`DATE(${calendarEvents.dateStart}) - INTERVAL '1 day' * ${calendarReminders.fireWhen} <= ${date}`
        )
      );

    return results.map(r => ({
      ...r.reminder,
      event: r.event,
    }));
  }

  async getUpcomingReminders(days: number = 7): Promise<Array<any>> {
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const results = await db
      .select({
        reminder: calendarReminders,
        event: calendarEvents,
      })
      .from(calendarReminders)
      .innerJoin(calendarEvents, eq(calendarReminders.eventId, calendarEvents.id))
      .where(
        and(
          eq(calendarReminders.enabled, true),
          gte(calendarEvents.dateStart, now),
          // وقت التذكير يجب أن يكون في المستقبل
          gte(
            sql`DATE(${calendarEvents.dateStart}) - INTERVAL '1 day' * ${calendarReminders.fireWhen}`,
            now
          ),
          // وقت التذكير خلال الأيام القادمة
          lte(
            sql`DATE(${calendarEvents.dateStart}) - INTERVAL '1 day' * ${calendarReminders.fireWhen}`,
            endDate
          )
        )
      )
      .orderBy(
        asc(sql`DATE(${calendarEvents.dateStart}) - INTERVAL '1 day' * ${calendarReminders.fireWhen}`)
      )
      .limit(10);

    // تحويل البيانات للشكل المتوقع في Frontend
    return results.map(r => {
      // حساب وقت التذكير الفعلي
      const eventDate = new Date(r.event.dateStart);
      const reminderDate = new Date(eventDate);
      reminderDate.setDate(eventDate.getDate() - r.reminder.fireWhen);

      return {
        id: r.reminder.id,
        eventId: r.reminder.eventId,
        eventTitle: r.event.title,
        reminderTime: reminderDate.toISOString(),
        channelType: r.reminder.channel,
        fireWhen: r.reminder.fireWhen,
        enabled: r.reminder.enabled,
      };
    });
  }

  async getCalendarAiDraft(eventId: string): Promise<CalendarAiDraft | undefined> {
    const [draft] = await db
      .select()
      .from(calendarAiDrafts)
      .where(eq(calendarAiDrafts.eventId, eventId))
      .limit(1);
    return draft;
  }

  async createCalendarAiDraft(draft: InsertCalendarAiDraft): Promise<CalendarAiDraft> {
    const [newDraft] = await db
      .insert(calendarAiDrafts)
      .values(draft as any)
      .returning();
    return newDraft;
  }

  async updateCalendarAiDraft(eventId: string, updates: Partial<InsertCalendarAiDraft>): Promise<CalendarAiDraft> {
    const [updated] = await db
      .update(calendarAiDrafts)
      .set({ ...updates, updatedAt: new Date() } as any)
      .where(eq(calendarAiDrafts.eventId, eventId))
      .returning();
    return updated;
  }

  async deleteCalendarAiDraft(eventId: string): Promise<void> {
    await db.delete(calendarAiDrafts).where(eq(calendarAiDrafts.eventId, eventId));
  }

  async getCalendarAssignments(filters?: {
    eventId?: string;
    userId?: string;
    status?: string;
    role?: string;
  }): Promise<Array<any>> {
    const conditions = [];

    if (filters?.eventId) conditions.push(eq(calendarAssignments.eventId, filters.eventId));
    if (filters?.userId) conditions.push(eq(calendarAssignments.userId, filters.userId));
    if (filters?.status) conditions.push(eq(calendarAssignments.status, filters.status));
    if (filters?.role) conditions.push(eq(calendarAssignments.role, filters.role));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const assignedByUser = aliasedTable(users, 'assignedByUser');

    const results = await db
      .select({
        assignment: calendarAssignments,
        event: calendarEvents,
        user: userPublicSelect,
        assignedByUser,
      })
      .from(calendarAssignments)
      .leftJoin(calendarEvents, eq(calendarAssignments.eventId, calendarEvents.id))
      .leftJoin(users, eq(calendarAssignments.userId, users.id))
      .leftJoin(assignedByUser, eq(calendarAssignments.assignedBy, assignedByUser.id))
      .where(whereClause)
      .orderBy(desc(calendarAssignments.assignedAt));

    // تحويل البيانات للشكل المتوقع في Frontend
    return results.map(r => ({
      id: r.assignment.id,
      eventId: r.assignment.eventId,
      eventTitle: r.event?.title || 'مناسبة غير معروفة',
      role: r.assignment.role,
      status: r.assignment.status,
      userId: r.assignment.userId,
      assignedBy: r.assignment.assignedBy,
      assignedAt: r.assignment.assignedAt?.toISOString(),
      event: r.event || undefined,
      user: r.user || undefined,
      assignedByUser: r.assignedByUser || undefined,
    }));
  }

  async createCalendarAssignment(assignment: InsertCalendarAssignment): Promise<CalendarAssignment> {
    const [newAssignment] = await db
      .insert(calendarAssignments)
      .values(assignment as any)
      .returning();
    return newAssignment;
  }

  async updateCalendarAssignment(id: string, updates: UpdateCalendarAssignment): Promise<CalendarAssignment> {
    const [updated] = await db
      .update(calendarAssignments)
      .set(updates as any)
      .where(eq(calendarAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteCalendarAssignment(id: string): Promise<void> {
    await db.delete(calendarAssignments).where(eq(calendarAssignments.id, id));
  }

  async completeCalendarAssignment(id: string): Promise<CalendarAssignment> {
    const [updated] = await db
      .update(calendarAssignments)
      .set({
        status: 'done',
        completedAt: new Date(),
      })
      .where(eq(calendarAssignments.id, id))
      .returning();
    return updated;
  }

  // =====================================================
  // SMART LINKS SYSTEM METHODS
  // =====================================================

  async getEntityTypes(): Promise<EntityType[]> {
    return await db.select().from(entityTypes).orderBy(entityTypes.displayOrder).limit(200);
  }

  async createEntityType(data: InsertEntityTypeDb): Promise<EntityType> {
    const [entityType] = await db.insert(entityTypes).values(data).returning();
    return entityType;
  }

  async getSmartEntities(filters?: { typeId?: number; status?: string }): Promise<SmartEntity[]> {
    const conditions = [];
    
    if (filters?.typeId) conditions.push(eq(smartEntities.typeId, filters.typeId));
    if (filters?.status) conditions.push(eq(smartEntities.status, filters.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select()
      .from(smartEntities)
      .where(whereClause)
      .orderBy(desc(smartEntities.usageCount));
  }

  async createSmartEntity(data: InsertSmartEntityDb): Promise<SmartEntity> {
    const [entity] = await db.insert(smartEntities).values(data).returning();
    return entity;
  }

  async updateSmartEntity(id: string, data: Partial<InsertSmartEntityDb>): Promise<SmartEntity> {
    const [entity] = await db
      .update(smartEntities)
      .set(data)
      .where(eq(smartEntities.id, id))
      .returning();
    return entity;
  }

  async deleteSmartEntity(id: string): Promise<void> {
    await db.delete(smartEntities).where(eq(smartEntities.id, id));
  }

  async getSmartTerms(filters?: { category?: string; status?: string }): Promise<SmartTerm[]> {
    const conditions = [];
    
    if (filters?.category) conditions.push(eq(smartTerms.category, filters.category));
    if (filters?.status) conditions.push(eq(smartTerms.status, filters.status));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    return await db
      .select()
      .from(smartTerms)
      .where(whereClause)
      .orderBy(desc(smartTerms.usageCount));
  }

  async createSmartTerm(data: InsertSmartTermDb): Promise<SmartTerm> {
    const [term] = await db.insert(smartTerms).values(data).returning();
    return term;
  }

  async incrementEntityUsage(entityId: string): Promise<void> {
    await db
      .update(smartEntities)
      .set({ usageCount: sql`${smartEntities.usageCount} + 1` })
      .where(eq(smartEntities.id, entityId));
  }

  async incrementTermUsage(termId: string): Promise<void> {
    await db
      .update(smartTerms)
      .set({ usageCount: sql`${smartTerms.usageCount} + 1` })
      .where(eq(smartTerms.id, termId));
  }

  // =====================================================
  // ENGLISH USER DATA METHODS
  // =====================================================

  async getEnUserBookmarks(userId: string): Promise<EnArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: enArticles,
        category: enCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(enBookmarks)
      .innerJoin(enArticles, eq(enBookmarks.articleId, enArticles.id))
      .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(enArticles.reporterId, reporterAlias.id))
      .where(eq(enBookmarks.userId, userId))
      .orderBy(desc(enBookmarks.createdAt));

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      isBookmarked: true,
    })) as unknown as EnArticleWithDetails[];
  }

  async getEnUserLikedArticles(userId: string): Promise<EnArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: enArticles,
        category: enCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(enReactions)
      .innerJoin(enArticles, eq(enReactions.articleId, enArticles.id))
      .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(enArticles.reporterId, reporterAlias.id))
      .where(and(eq(enReactions.userId, userId), eq(enArticles.status, "published")))
      .orderBy(desc(enReactions.createdAt));

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      hasReacted: true,
    })) as unknown as EnArticleWithDetails[];
  }

  async getEnUserReadingHistory(userId: string, limit: number = 20): Promise<EnArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: enArticles,
        category: enCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(enReadingHistory)
      .innerJoin(enArticles, eq(enReadingHistory.articleId, enArticles.id))
      .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(enArticles.reporterId, reporterAlias.id))
      .where(eq(enReadingHistory.userId, userId))
      .orderBy(desc(enReadingHistory.readAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as EnArticleWithDetails[];
  }

  async getEnArticleById(id: string, userId?: string): Promise<EnArticleWithDetails | undefined> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: enArticles,
        category: enCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(enArticles)
      .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(enArticles.reporterId, reporterAlias.id))
      .where(eq(enArticles.id, id));

    if (results.length === 0) return undefined;

    const result = results[0];
    const article = result.article;

    // Run all queries in parallel for better performance
    const [
      bookmarkResult,
      reactionResult,
      reactionsCountResult,
      commentsCountResult
    ] = await Promise.all([
      userId ? db.select().from(enBookmarks)
        .where(and(eq(enBookmarks.articleId, article.id), eq(enBookmarks.userId, userId)))
        .limit(1) : Promise.resolve([]),
      userId ? db.select().from(enReactions)
        .where(and(eq(enReactions.articleId, article.id), eq(enReactions.userId, userId)))
        .limit(1) : Promise.resolve([]),
      db.select({ count: sql<number>`count(*)` })
        .from(enReactions)
        .where(eq(enReactions.articleId, article.id)),
      db.select({ count: sql<number>`count(*)` })
        .from(enComments)
        .where(eq(enComments.articleId, article.id))
    ]);

    const isBookmarked = bookmarkResult.length > 0;
    const hasReacted = reactionResult.length > 0;
    const reactionsCount = Number(reactionsCountResult[0].count);
    const commentsCount = Number(commentsCountResult[0].count);

    return {
      ...article,
      category: result.category || undefined,
      author: result.reporter || result.author || undefined,
      isBookmarked,
      hasReacted,
      reactionsCount,
      commentsCount,
    } as unknown as EnArticleWithDetails;
  }

  async getEnglishRelatedArticles(articleId: string, categoryId?: string): Promise<any[]> {
    const conditions = [
      eq(enArticles.status, "published"),
      ne(enArticles.id, articleId),
    ];

    if (categoryId) {
      conditions.push(eq(enArticles.categoryId, categoryId));
    }

    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: enArticles,
        category: enCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(enArticles)
      .leftJoin(enCategories, eq(enArticles.categoryId, enCategories.id))
      .leftJoin(users, eq(enArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(enArticles.reporterId, reporterAlias.id))
      .where(and(...conditions))
      .orderBy(desc(enArticles.publishedAt))
      .limit(5);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      thumbnailUrl: null,
      isAiGeneratedImage: false,
      aiImageModel: null,
      aiImagePrompt: null,
      isAiGeneratedThumbnail: false,
      aiThumbnailModel: null,
      aiThumbnailPrompt: null,
      credibilityScore: null,
      credibilityAnalysis: null,
      credibilityLastUpdated: null,
      source: 'manual',
      sourceMetadata: null,
      sourceUrl: null,
      verifiedBy: null,
      verifiedAt: null,
      isPublisherContent: false,
      publisherStatus: null,
      publisherReviewedBy: null,
      publisherReviewedAt: null,
      publisherReviewNotes: null,
      isPublisherNews: false,
      publisherId: null,
      publisherCreditDeducted: false,
      publisherSubmittedAt: null,
      publisherApprovedAt: null,
      publisherApprovedBy: null,
    }));
  }

  // =====================================================
  // URDU OPERATIONS - عملیات اردو
  // =====================================================

  // Urdu Categories
  async getUrCategories(filters?: { status?: string }): Promise<UrCategory[]> {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(urCategories.status, filters.status));
    }

    const query = conditions.length > 0
      ? db.select().from(urCategories).where(and(...conditions)).orderBy(asc(urCategories.displayOrder)).limit(200)
      : db.select().from(urCategories).orderBy(asc(urCategories.displayOrder)).limit(200);

    return await query;
  }

  async getUrCategoryById(id: string): Promise<UrCategory | undefined> {
    const [category] = await db.select().from(urCategories).where(eq(urCategories.id, id));
    return category;
  }

  async getUrCategoryBySlug(slug: string): Promise<UrCategory | undefined> {
    const [category] = await db.select().from(urCategories).where(eq(urCategories.slug, slug));
    return category;
  }

  async createUrCategory(category: InsertUrCategory): Promise<UrCategory> {
    const [newCategory] = await db.insert(urCategories).values(category).returning();
    return newCategory;
  }

  async updateUrCategory(id: string, updates: Partial<InsertUrCategory>): Promise<UrCategory> {
    const [updatedCategory] = await db
      .update(urCategories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(urCategories.id, id))
      .returning();
    return updatedCategory;
  }

  async deleteUrCategory(id: string): Promise<void> {
    await db.delete(urCategories).where(eq(urCategories.id, id));
  }

  // Urdu Articles
  async getUrArticles(filters?: {
    categoryId?: string;
    status?: string;
    authorId?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
  }): Promise<UrArticleWithDetails[]> {
    const conditions = [];

    if (filters?.categoryId) {
      conditions.push(eq(urArticles.categoryId, filters.categoryId));
    }
    if (filters?.status) {
      conditions.push(eq(urArticles.status, filters.status));
    }
    if (filters?.authorId) {
      conditions.push(eq(urArticles.authorId, filters.authorId));
    }
    if (filters?.searchQuery) {
      conditions.push(
        or(
          ilike(urArticles.title, `%${filters.searchQuery}%`),
          ilike(urArticles.excerpt, `%${filters.searchQuery}%`)
        )!
      );
    }

    const reporterAlias = aliasedTable(users, 'reporter');
    
    let query = db
      .select({
        article: urArticles,
        category: urCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(urArticles)
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(urArticles.reporterId, reporterAlias.id));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    query = query.orderBy(desc(urArticles.publishedAt)) as any;

    if (filters?.limit) {
      query = query.limit(filters.limit) as any;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as any;
    }

    const results = await query;

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as UrArticleWithDetails[];
  }

  async getUrArticleBySlug(slug: string): Promise<UrArticleWithDetails | undefined> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: urArticles,
        category: urCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(urArticles)
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(urArticles.reporterId, reporterAlias.id))
      .where(or(eq(urArticles.slug, slug), eq(urArticles.englishSlug, slug)));

    if (results.length === 0) return undefined;

    const result = results[0];
    return {
      ...result.article,
      category: result.category || undefined,
      author: result.reporter || result.author || undefined,
    } as unknown as UrArticleWithDetails;
  }

  async getUrArticleById(id: string): Promise<UrArticleWithDetails | undefined> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: urArticles,
        category: urCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(urArticles)
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(urArticles.reporterId, reporterAlias.id))
      .where(eq(urArticles.id, id));

    if (results.length === 0) return undefined;

    const result = results[0];
    return {
      ...result.article,
      category: result.category || undefined,
      author: result.reporter || result.author || undefined,
    } as unknown as UrArticleWithDetails;
  }

  async createUrArticle(article: InsertUrArticle): Promise<UrArticle> {
    // Auto-generate short englishSlug if not provided
    const articleWithSlug = {
      ...article,
      englishSlug: article.englishSlug || generateEnglishSlug(),
    };
    const [newArticle] = await db.insert(urArticles).values([articleWithSlug] as any).returning();
    return newArticle;
  }

  async updateUrArticle(id: string, updates: Partial<InsertUrArticle>): Promise<UrArticle> {
    const [updatedArticle] = await db
      .update(urArticles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(urArticles.id, id))
      .returning();
    return updatedArticle;
  }

  async deleteUrArticle(id: string): Promise<void> {
    await db.delete(urArticles).where(eq(urArticles.id, id));
  }

  async incrementUrArticleViews(id: string): Promise<void> {
    await db
      .update(urArticles)
      .set({ views: sql`${urArticles.views} + 1` })
      .where(eq(urArticles.id, id));
  }

  // Urdu Comments
  async getUrArticleComments(articleId: string): Promise<UrCommentWithUser[]> {
    const results = await db
      .select({
        comment: urComments,
        user: userPublicSelect,
      })
      .from(urComments)
      .leftJoin(users, eq(urComments.userId, users.id))
      .where(eq(urComments.articleId, articleId))
      .orderBy(desc(urComments.createdAt));

    return results.map((r) => ({
      ...r.comment,
      user: r.user!,
    })) as unknown as UrCommentWithUser[];
  }

  async createUrComment(comment: InsertUrComment): Promise<UrComment> {
    const [newComment] = await db.insert(urComments).values(comment).returning();
    return newComment;
  }

  async updateUrComment(id: string, updates: Partial<InsertUrComment>): Promise<UrComment> {
    const [updatedComment] = await db
      .update(urComments)
      .set(updates)
      .where(eq(urComments.id, id))
      .returning();
    return updatedComment;
  }

  async deleteUrComment(id: string): Promise<void> {
    await db.delete(urComments).where(eq(urComments.id, id));
  }

  // Urdu Reactions
  async getUrArticleReactions(articleId: string): Promise<UrReaction[]> {
    return await db.select().from(urReactions).where(eq(urReactions.articleId, articleId));
  }

  async getUserUrReaction(articleId: string, userId: string): Promise<UrReaction | undefined> {
    const [reaction] = await db
      .select()
      .from(urReactions)
      .where(and(eq(urReactions.articleId, articleId), eq(urReactions.userId, userId)));
    return reaction;
  }

  async createUrReaction(reaction: InsertUrReaction): Promise<UrReaction> {
    const [newReaction] = await db.insert(urReactions).values(reaction).returning();
    return newReaction;
  }

  async deleteUrReaction(id: string): Promise<void> {
    await db.delete(urReactions).where(eq(urReactions.id, id));
  }

  // Urdu Bookmarks
  async getUrUserBookmarks(userId: string): Promise<UrArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: urArticles,
        category: urCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(urBookmarks)
      .innerJoin(urArticles, eq(urBookmarks.articleId, urArticles.id))
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(urArticles.reporterId, reporterAlias.id))
      .where(eq(urBookmarks.userId, userId))
      .orderBy(desc(urBookmarks.createdAt));

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
      isBookmarked: true,
    })) as unknown as UrArticleWithDetails[];
  }

  async getUserUrBookmark(articleId: string, userId: string): Promise<UrBookmark | undefined> {
    const [bookmark] = await db
      .select()
      .from(urBookmarks)
      .where(and(eq(urBookmarks.articleId, articleId), eq(urBookmarks.userId, userId)));
    return bookmark;
  }

  async createUrBookmark(bookmark: InsertUrBookmark): Promise<UrBookmark> {
    const [newBookmark] = await db.insert(urBookmarks).values(bookmark).returning();
    return newBookmark;
  }

  async deleteUrBookmark(id: string): Promise<void> {
    await db.delete(urBookmarks).where(eq(urBookmarks.id, id));
  }

  // Urdu Reading History
  async getUrUserReadingHistory(userId: string, limit: number = 20): Promise<UrArticleWithDetails[]> {
    const reporterAlias = aliasedTable(users, 'reporter');
    
    const results = await db
      .select({
        article: urArticles,
        category: urCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(urReadingHistory)
      .innerJoin(urArticles, eq(urReadingHistory.articleId, urArticles.id))
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(urArticles.reporterId, reporterAlias.id))
      .where(eq(urReadingHistory.userId, userId))
      .orderBy(desc(urReadingHistory.readAt))
      .limit(limit);

    return results.map((r) => ({
      ...r.article,
      category: r.category || undefined,
      author: r.reporter || r.author || undefined,
    })) as unknown as UrArticleWithDetails[];
  }

  async createUrReadingHistory(history: InsertUrReadingHistory): Promise<UrReadingHistory> {
    const [newHistory] = await db.insert(urReadingHistory).values(history).returning();
    return newHistory;
  }

  // Urdu Smart Blocks
  async getUrSmartBlocks(filters?: { placement?: string; type?: string; isActive?: boolean }): Promise<UrSmartBlock[]> {
    let query = db.select().from(urSmartBlocks);

    const conditions = [];
    if (filters?.placement) {
      conditions.push(eq(urSmartBlocks.placement, filters.placement));
    }
    if (filters?.type) {
      conditions.push(eq((urSmartBlocks as any).type, filters.type));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(urSmartBlocks.isActive, filters.isActive));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const blocks = await query.orderBy(desc(urSmartBlocks.createdAt));
    return blocks;
  }

  async getUrSmartBlockById(id: string): Promise<UrSmartBlock | undefined> {
    const [block] = await db.select().from(urSmartBlocks).where(eq(urSmartBlocks.id, id));
    return block;
  }

  async createUrSmartBlock(block: InsertUrSmartBlock): Promise<UrSmartBlock> {
    const [newBlock] = await db.insert(urSmartBlocks).values(block).returning();
    return newBlock;
  }

  async updateUrSmartBlock(id: string, updates: Partial<InsertUrSmartBlock>): Promise<UrSmartBlock> {
    const [updated] = await db
      .update(urSmartBlocks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(urSmartBlocks.id, id))
      .returning();
    return updated;
  }

  async deleteUrSmartBlock(id: string): Promise<void> {
    await db.delete(urSmartBlocks).where(eq(urSmartBlocks.id, id));
  }

  // Urdu Dashboard Statistics
  async getUrDashboardStats(): Promise<{
    articles: {
      published: number;
      draft: number;
      archived: number;
      scheduled: number;
      totalViews: number;
    };
    categories: { total: number; active: number };
    recentArticles: Array<any>;
    topArticles: Array<any>;
  }> {
    const [articlesStats] = await db
      .select({
        published: sql<number>`count(*) filter (where ${urArticles.status} = 'published')`,
        draft: sql<number>`count(*) filter (where ${urArticles.status} = 'draft')`,
        archived: sql<number>`count(*) filter (where ${urArticles.status} = 'archived')`,
        scheduled: sql<number>`count(*) filter (where ${urArticles.status} = 'scheduled')`,
        totalViews: sql<number>`coalesce(sum(${urArticles.views}), 0)`,
      })
      .from(urArticles);

    const [categoriesStats] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${urCategories.status} = 'active')`,
      })
      .from(urCategories);

    const reporterAlias = aliasedTable(users, 'reporter');
    
    const recentArticles = await db
      .select({
        article: urArticles,
        category: urCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(urArticles)
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(urArticles.reporterId, reporterAlias.id))
      .orderBy(desc(urArticles.createdAt))
      .limit(5);

    const topArticles = await db
      .select({
        article: urArticles,
        category: urCategories,
        author: userPublicSelect,
        reporter: reporterPublicSelect(reporterAlias),
      })
      .from(urArticles)
      .leftJoin(urCategories, eq(urArticles.categoryId, urCategories.id))
      .leftJoin(users, eq(urArticles.authorId, users.id))
      .leftJoin(reporterAlias, eq(urArticles.reporterId, reporterAlias.id))
      .where(eq(urArticles.status, "published"))
      .orderBy(desc(urArticles.views))
      .limit(5);

    return {
      articles: {
        published: Number(articlesStats.published),
        draft: Number(articlesStats.draft),
        archived: Number(articlesStats.archived),
        scheduled: Number(articlesStats.scheduled),
        totalViews: Number(articlesStats.totalViews),
      },
      categories: {
        total: Number(categoriesStats.total),
        active: Number(categoriesStats.active),
      },
      recentArticles: recentArticles.map((r) => ({
        ...r.article,
        category: r.category || undefined,
        author: r.reporter || r.author || undefined,
      })),
      topArticles: topArticles.map((r) => ({
        ...r.article,
        category: r.category || undefined,
        author: r.reporter || r.author || undefined,
      })),
    };
  }
  
  // Data Story operations
  async createDataStorySource(source: InsertDataStorySource): Promise<DataStorySource> {
    const [created] = await db.insert(dataStorySources).values(source as any).returning();
    return created;
  }

  async getDataStorySource(id: string): Promise<DataStorySource | undefined> {
    const [source] = await db.select().from(dataStorySources).where(eq(dataStorySources.id, id)).limit(1);
    return source;
  }

  async updateDataStorySource(id: string, data: Partial<InsertDataStorySource>): Promise<DataStorySource> {
    const [updated] = await db
      .update(dataStorySources)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(dataStorySources.id, id))
      .returning();
    return updated;
  }

  async getUserDataStorySources(userId: string, limit: number = 50): Promise<DataStorySource[]> {
    return await db
      .select()
      .from(dataStorySources)
      .where(eq(dataStorySources.userId, userId))
      .orderBy(desc(dataStorySources.createdAt))
      .limit(limit);
  }

  async createDataStoryAnalysis(analysis: InsertDataStoryAnalysis): Promise<DataStoryAnalysis> {
    const [created] = await db.insert(dataStoryAnalyses).values(analysis as any).returning();
    return created;
  }

  async getDataStoryAnalysis(id: string): Promise<DataStoryAnalysis | undefined> {
    const [analysis] = await db.select().from(dataStoryAnalyses).where(eq(dataStoryAnalyses.id, id)).limit(1);
    return analysis;
  }

  async updateDataStoryAnalysis(id: string, data: Partial<InsertDataStoryAnalysis>): Promise<DataStoryAnalysis> {
    const [updated] = await db
      .update(dataStoryAnalyses)
      .set(data as any)
      .where(eq(dataStoryAnalyses.id, id))
      .returning();
    return updated;
  }

  async getAnalysesBySourceId(sourceId: string): Promise<DataStoryAnalysis[]> {
    return await db
      .select()
      .from(dataStoryAnalyses)
      .where(eq(dataStoryAnalyses.sourceId, sourceId))
      .orderBy(desc(dataStoryAnalyses.createdAt));
  }

  async createDataStoryDraft(draft: InsertDataStoryDraft): Promise<DataStoryDraft> {
    const [created] = await db.insert(dataStoryDrafts).values(draft as any).returning();
    return created;
  }

  async getDataStoryDraft(id: string): Promise<DataStoryDraft | undefined> {
    const [draft] = await db.select().from(dataStoryDrafts).where(eq(dataStoryDrafts.id, id)).limit(1);
    return draft;
  }

  async updateDataStoryDraft(id: string, data: Partial<InsertDataStoryDraft>): Promise<DataStoryDraft> {
    const [updated] = await db
      .update(dataStoryDrafts)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(dataStoryDrafts.id, id))
      .returning();
    return updated;
  }

  async getDraftsByAnalysisId(analysisId: string): Promise<DataStoryDraft[]> {
    return await db
      .select()
      .from(dataStoryDrafts)
      .where(eq(dataStoryDrafts.analysisId, analysisId))
      .orderBy(desc(dataStoryDrafts.createdAt));
  }

  async getUserDataStoryDrafts(userId: string, limit: number = 50): Promise<DataStoryDraft[]> {
    return await db
      .select()
      .from(dataStoryDrafts)
      .where(eq(dataStoryDrafts.userId, userId))
      .orderBy(desc(dataStoryDrafts.createdAt))
      .limit(limit);
  }

  async convertDraftToArticle(draftId: string, articleId: string): Promise<DataStoryDraft> {
    const [updated] = await db
      .update(dataStoryDrafts)
      .set({
        articleId,
        convertedAt: new Date(),
        status: 'converted_to_article',
        updatedAt: new Date()
      })
      .where(eq(dataStoryDrafts.id, draftId))
      .returning();
    return updated;
  }

  async getDataStoryWithDetails(sourceId: string): Promise<DataStoryWithDetails | undefined> {
    const source = await this.getDataStorySource(sourceId);
    if (!source) return undefined;

    const analyses = await this.getAnalysesBySourceId(sourceId);
    
    const analysesWithDrafts = await Promise.all(
      analyses.map(async (analysis) => {
        const drafts = await this.getDraftsByAnalysisId(analysis.id);
        return { ...analysis, drafts };
      })
    );

    return { ...source, analyses: analysesWithDrafts };
  }
  
  // Short Links operations
  async createShortLink(data: InsertShortLink): Promise<ShortLink> {
    const maxRetries = 5;
    let attempts = 0;
    
    while (attempts < maxRetries) {
      try {
        const shortCode = nanoid(8);
        
        const [created] = await db
          .insert(shortLinks)
          .values({
            ...data,
            shortCode,
            utmMedium: data.utmMedium || 'social',
          })
          .returning();
        
        console.log(`✅ Short link created: ${shortCode} -> ${data.originalUrl}`);
        return created;
      } catch (error: any) {
        // Drizzle يلفّ خطأ PG داخل DrizzleQueryError؛ isUniqueViolation يفك
        // التغليف ويتحقق من code + constraint بشكل موحّد.
        if (isUniqueViolation(error, 'short_links_short_code_unique')) {
          attempts++;
          console.log(`⚠️  Short code collision (attempt ${attempts}/${maxRetries}), retrying...`);
          if (attempts >= maxRetries) {
            throw new Error('Failed to generate unique short code after multiple attempts');
          }
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('Failed to create short link');
  }

  async getShortLinkByCode(code: string): Promise<ShortLink | undefined> {
    const [link] = await db
      .select()
      .from(shortLinks)
      .where(eq(shortLinks.shortCode, code))
      .limit(1);
    return link;
  }

  async getShortLinkByArticle(articleId: string): Promise<ShortLink | undefined> {
    const [link] = await db
      .select()
      .from(shortLinks)
      .where(
        and(
          eq(shortLinks.articleId, articleId),
          eq(shortLinks.isActive, true)
        )
      )
      .orderBy(desc(shortLinks.createdAt))
      .limit(1);
    return link;
  }

  async incrementShortLinkClick(linkId: string, clickData: InsertShortLinkClick): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(shortLinks)
        .set({
          clickCount: sql`${shortLinks.clickCount} + 1`,
          lastClickedAt: new Date(),
        })
        .where(eq(shortLinks.id, linkId));

      await tx.insert(shortLinkClicks).values({
        ...clickData,
        shortLinkId: ('shortLinkId' in clickData ? (clickData as any).shortLinkId : linkId),
      } as any);
    });
    
    console.log(`📊 Short link click logged: ${linkId}`);
  }

  async getShortLinkAnalytics(linkId: string, days: number = 30): Promise<{
    totalClicks: number;
    uniqueUsers: number;
    topSources: Array<{ source: string; count: number }>;
  }> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const clicks = await db
      .select()
      .from(shortLinkClicks)
      .where(
        and(
          eq(shortLinkClicks.shortLinkId, linkId),
          gte(shortLinkClicks.clickedAt, startDate)
        )
      );

    const uniqueUserIds = new Set(
      clicks
        .filter(c => c.userId)
        .map(c => c.userId)
    );

    const sourceMap = new Map<string, number>();
    clicks.forEach(click => {
      const source = click.referer || 'direct';
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    });

    const topSources = Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalClicks: clicks.length,
      uniqueUsers: uniqueUserIds.size,
      topSources,
    };
  }

  // ============================================================
  // APPLE WALLET OPERATIONS
  // ============================================================

  async getWalletPassByUserAndType(userId: string, passType: 'press' | 'loyalty'): Promise<WalletPass | null> {
    const [pass] = await db
      .select()
      .from(walletPasses)
      .where(and(
        eq(walletPasses.userId, userId),
        eq(walletPasses.passType, passType)
      ))
      .limit(1);
    return pass || null;
  }

  async getWalletPassBySerial(serialNumber: string): Promise<WalletPass | null> {
    const [pass] = await db
      .select()
      .from(walletPasses)
      .where(eq(walletPasses.serialNumber, serialNumber))
      .limit(1);
    return pass || null;
  }

  async createWalletPass(data: {
    userId: string;
    passType: 'press' | 'loyalty';
    passTypeIdentifier: string;
    serialNumber: string;
    authenticationToken: string;
  }): Promise<WalletPass> {
    const [pass] = await db
      .insert(walletPasses)
      .values(data)
      .returning();
    
    console.log(`✅ Wallet pass created for user ${data.userId} (${data.passType}): ${pass.serialNumber}`);
    return pass;
  }

  async updateWalletPassTimestamp(passId: string): Promise<void> {
    await db
      .update(walletPasses)
      .set({ lastUpdated: new Date() })
      .where(eq(walletPasses.id, passId));
    
    console.log(`🔄 Wallet pass timestamp updated: ${passId}`);
  }

  async deleteWalletPass(userId: string, passType: 'press' | 'loyalty'): Promise<void> {
    await db
      .delete(walletPasses)
      .where(and(
        eq(walletPasses.userId, userId),
        eq(walletPasses.passType, passType)
      ));
    
    console.log(`🗑️  Wallet pass deleted for user ${userId} (${passType})`);
  }

  async getWalletPassesByUser(userId: string): Promise<WalletPass[]> {
    return db
      .select()
      .from(walletPasses)
      .where(eq(walletPasses.userId, userId));
  }

  async getDevicesForPass(passId: string): Promise<WalletDevice[]> {
    const devices = await db
      .select()
      .from(walletDevices)
      .where(eq(walletDevices.passId, passId));
    return devices;
  }

  async registerDevice(data: {
    passId: string;
    deviceLibraryIdentifier: string;
    pushToken: string;
  }): Promise<WalletDevice> {
    try {
      const [device] = await db
        .insert(walletDevices)
        .values(data)
        .onConflictDoUpdate({
          target: [walletDevices.passId, walletDevices.deviceLibraryIdentifier],
          set: {
            pushToken: data.pushToken,
            registeredAt: new Date(),
          },
        })
        .returning();
      
      console.log(`📱 Device registered for pass ${data.passId}: ${data.deviceLibraryIdentifier}`);
      return device;
    } catch (error: any) {
      console.error('Error registering device:', error);
      throw error;
    }
  }

  async unregisterDevice(passId: string, deviceLibraryIdentifier: string): Promise<void> {
    await db
      .delete(walletDevices)
      .where(
        and(
          eq(walletDevices.passId, passId),
          eq(walletDevices.deviceLibraryIdentifier, deviceLibraryIdentifier)
        )
      );
    
    console.log(`🗑️  Device unregistered from pass ${passId}: ${deviceLibraryIdentifier}`);
  }

  async getUpdatedPasses(
    deviceLibraryIdentifier: string,
    passTypeIdentifier: string,
    tag?: string
  ): Promise<string[]> {
    const query = db
      .select({ serialNumber: walletPasses.serialNumber })
      .from(walletPasses)
      .innerJoin(walletDevices, eq(walletDevices.passId, walletPasses.id))
      .where(
        and(
          eq(walletDevices.deviceLibraryIdentifier, deviceLibraryIdentifier),
          eq(walletPasses.passTypeIdentifier, passTypeIdentifier)
        )
      );

    const results = await query;
    const serialNumbers = results.map(r => r.serialNumber);
    
    console.log(`🔍 Found ${serialNumbers.length} updated passes for device ${deviceLibraryIdentifier}`);
    return serialNumbers;
  }

  // ============================================================
  // USER POINTS/LOYALTY OPERATIONS
  // ============================================================

  async getUserPointsTotal(userId: string): Promise<UserPointsTotal | null> {
    const [points] = await db
      .select()
      .from(userPointsTotal)
      .where(eq(userPointsTotal.userId, userId))
      .limit(1);
    return points || null;
  }

  async createUserPointsTotal(userId: string): Promise<UserPointsTotal> {
    const [points] = await db
      .insert(userPointsTotal)
      .values({
        userId,
        totalPoints: 0,
        currentRank: 'القارئ الجديد',
        rankLevel: 1,
        lifetimePoints: 0,
      })
      .returning();
    
    console.log(`✅ User points total created for user ${userId}`);
    return points;
  }

  async updateUserPointsTotal(userId: string, data: {
    totalPoints?: number;
    currentRank?: string;
    rankLevel?: number;
    lifetimePoints?: number;
  }): Promise<UserPointsTotal> {
    const [points] = await db
      .update(userPointsTotal)
      .set(data)
      .where(eq(userPointsTotal.userId, userId))
      .returning();
    
    console.log(`🔄 User points total updated for user ${userId}`);
    return points;
  }

  // ============================================================
  // PRESS CARD PERMISSION OPERATIONS
  // ============================================================

  async updateUserPressCardPermission(userId: string, data: {
    hasPressCard?: boolean;
    jobTitle?: string | null;
    department?: string | null;
    pressIdNumber?: string | null;
    cardValidUntil?: Date | null;
  }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        ...data,
        ...(data.cardValidUntil && { cardValidUntil: new Date(data.cardValidUntil) }),
      })
      .where(eq(users.id, userId))
      .returning();
    
    console.log(`🔄 Press card permissions updated for user ${userId}`);
    return user;
  }

  async triggerLoyaltyPassUpdate(userId: string, reason: string) {
    log.debug('🔄 [Loyalty Pass] Triggering update for user:', userId, 'Reason:', reason);
    
    // Log the update event (Phase 2: will send APNs)
    const { passUpdateLogger } = await import('./lib/passkit/PassUpdateLogger');
    passUpdateLogger.log({
      userId,
      passType: 'loyalty',
      updateReason: reason,
      timestamp: new Date(),
    });
  }

  // ============================================================
  // DEEP ANALYSIS OPERATIONS
  // ============================================================

  async createDeepAnalysis(data: InsertDeepAnalysis): Promise<DeepAnalysis> {
    const [analysis] = await db
      .insert(deepAnalyses)
      .values(data)
      .returning();
    return analysis;
  }

  async getDeepAnalysis(id: string): Promise<DeepAnalysis | undefined> {
    const [analysis] = await db
      .select()
      .from(deepAnalyses)
      .where(eq(deepAnalyses.id, id));
    return analysis;
  }

  async updateDeepAnalysis(id: string, data: Partial<DeepAnalysis>): Promise<DeepAnalysis> {
    const [analysis] = await db
      .update(deepAnalyses)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(deepAnalyses.id, id))
      .returning();
    return analysis;
  }

  async listDeepAnalyses(params: {
    createdBy?: string;
    status?: string;
    categoryId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ analyses: DeepAnalysis[]; total: number }> {
    const { createdBy, status, categoryId, limit = 20, offset = 0 } = params;

    let conditions = [];
    if (createdBy) conditions.push(eq(deepAnalyses.createdBy, createdBy));
    if (status) conditions.push(eq(deepAnalyses.status, status));
    if (categoryId) conditions.push(eq(deepAnalyses.categoryId, categoryId));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const analyses = await db
      .select()
      .from(deepAnalyses)
      .where(whereClause)
      .orderBy(desc(deepAnalyses.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(deepAnalyses)
      .where(whereClause);

    return {
      analyses,
      total: count || 0,
    };
  }

  async deleteDeepAnalysis(id: string): Promise<void> {
    await db
      .delete(deepAnalyses)
      .where(eq(deepAnalyses.id, id));
  }

  // Deep Analysis (Omq) Methods - Phase 2
  async getPublishedDeepAnalyses(filters: {
    status?: string;
    keyword?: string;
    category?: string;
    dateRange?: { from: Date; to: Date };
    page?: number;
    limit?: number;
  }): Promise<{ analyses: (DeepAnalysis & { metrics?: any })[]; total: number }> {
    const { status, keyword, category, dateRange, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let conditions = [];
    
    // Status filter (default to published if not specified)
    if (status) {
      conditions.push(eq(deepAnalyses.status, status));
    } else {
      conditions.push(eq(deepAnalyses.status, 'published'));
    }
    
    // Keyword search in title or topic
    if (keyword) {
      conditions.push(
        or(
          ilike(deepAnalyses.title, `%${keyword}%`),
          ilike(deepAnalyses.topic, `%${keyword}%`)
        )
      );
    }
    
    // Category filter
    if (category) {
      conditions.push(eq(deepAnalyses.categoryId, category));
    }
    
    // Date range filter
    if (dateRange?.from && dateRange?.to) {
      conditions.push(
        and(
          gte(deepAnalyses.createdAt, dateRange.from),
          lte(deepAnalyses.createdAt, dateRange.to)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch analyses with metrics using left join
    const analysesWithMetrics = await db
      .select({
        analysis: deepAnalyses,
        metrics: deepAnalysisMetrics,
      })
      .from(deepAnalyses)
      .leftJoin(deepAnalysisMetrics, eq(deepAnalyses.id, deepAnalysisMetrics.analysisId))
      .where(whereClause)
      .orderBy(desc(deepAnalyses.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(deepAnalyses)
      .where(whereClause);

    // Format results with flattened metrics for frontend compatibility
    const analyses = analysesWithMetrics.map(row => ({
      ...row.analysis,
      viewsCount: row.metrics?.views || 0,
      sharesCount: row.metrics?.shares || 0,
      downloadsCount: (row.metrics?.downloads || 0) + (row.metrics?.exportsPdf || 0) + (row.metrics?.exportsDocx || 0),
      metrics: row.metrics || {
        views: 0,
        shares: 0,
        downloads: 0,
        exportsPdf: 0,
        exportsDocx: 0,
      },
    }));

    return {
      analyses,
      total: count || 0,
    };
  }

  async getDeepAnalysisMetrics(analysisId: string): Promise<any | null> {
    const [metrics] = await db
      .select()
      .from(deepAnalysisMetrics)
      .where(eq(deepAnalysisMetrics.analysisId, analysisId));
    
    return metrics || null;
  }

  async recordDeepAnalysisEvent(event: {
    analysisId: string;
    userId?: string;
    eventType: 'view' | 'share' | 'download' | 'export_pdf' | 'export_docx';
    metadata?: any;
  }): Promise<void> {
    const { analysisId, userId, eventType, metadata } = event;

    // Use transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // 1. Insert event record
      await tx
        .insert(deepAnalysisEvents)
        .values({
          analysisId,
          userId: userId || null,
          eventType,
          metadata: metadata || {},
        });

      // 2. Ensure metrics record exists
      const [existingMetrics] = await tx
        .select()
        .from(deepAnalysisMetrics)
        .where(eq(deepAnalysisMetrics.analysisId, analysisId));

      if (!existingMetrics) {
        // Create metrics if doesn't exist
        await tx
          .insert(deepAnalysisMetrics)
          .values({
            analysisId,
            views: eventType === 'view' ? 1 : 0,
            shares: eventType === 'share' ? 1 : 0,
            downloads: eventType === 'download' ? 1 : 0,
            exportsPdf: eventType === 'export_pdf' ? 1 : 0,
            exportsDocx: eventType === 'export_docx' ? 1 : 0,
            lastViewedAt: eventType === 'view' ? new Date() : null,
          });
      } else {
        // Update existing metrics
        const updates: any = {
          updatedAt: new Date(),
        };

        if (eventType === 'view') {
          updates.views = sql`${deepAnalysisMetrics.views} + 1`;
          updates.lastViewedAt = new Date();
        } else if (eventType === 'share') {
          updates.shares = sql`${deepAnalysisMetrics.shares} + 1`;
        } else if (eventType === 'download') {
          updates.downloads = sql`${deepAnalysisMetrics.downloads} + 1`;
        } else if (eventType === 'export_pdf') {
          updates.exportsPdf = sql`${deepAnalysisMetrics.exportsPdf} + 1`;
        } else if (eventType === 'export_docx') {
          updates.exportsDocx = sql`${deepAnalysisMetrics.exportsDocx} + 1`;
        }

        await tx
          .update(deepAnalysisMetrics)
          .set(updates)
          .where(eq(deepAnalysisMetrics.analysisId, analysisId));
      }
    });
  }

  async getDeepAnalysisStats(): Promise<{
    totalAnalyses: number;
    totalViews: number;
    totalShares: number;
    totalDownloads: number;
    recentAnalyses: any[];
  }> {
    // Get total analyses count
    const [totalResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(deepAnalyses)
      .where(eq(deepAnalyses.status, 'published'));

    const totalAnalyses = totalResult?.count || 0;

    // Get total metrics (sum of all metrics)
    const [metricsResult] = await db
      .select({
        totalViews: sql<number>`COALESCE(SUM(${deepAnalysisMetrics.views}), 0)::int`,
        totalShares: sql<number>`COALESCE(SUM(${deepAnalysisMetrics.shares}), 0)::int`,
        totalDownloads: sql<number>`COALESCE(SUM(${deepAnalysisMetrics.downloads} + ${deepAnalysisMetrics.exportsPdf} + ${deepAnalysisMetrics.exportsDocx}), 0)::int`,
      })
      .from(deepAnalysisMetrics);

    const totalViews = metricsResult?.totalViews || 0;
    const totalShares = metricsResult?.totalShares || 0;
    const totalDownloads = metricsResult?.totalDownloads || 0;

    // Get recent analyses (last 5 published)
    const recentAnalysesData = await db
      .select({
        analysis: deepAnalyses,
        metrics: deepAnalysisMetrics,
      })
      .from(deepAnalyses)
      .leftJoin(deepAnalysisMetrics, eq(deepAnalyses.id, deepAnalysisMetrics.analysisId))
      .where(eq(deepAnalyses.status, 'published'))
      .orderBy(desc(deepAnalyses.createdAt))
      .limit(5);

    const recentAnalyses = recentAnalysesData.map(row => ({
      ...row.analysis,
      metrics: row.metrics || {
        views: 0,
        shares: 0,
        downloads: 0,
        exportsPdf: 0,
        exportsDocx: 0,
      },
    }));

    return {
      totalAnalyses,
      totalViews,
      totalShares,
      totalDownloads,
      recentAnalyses,
    };
  }

  // ============================================================
  // HOMEPAGE STATISTICS
  // ============================================================

  async getHomepageStats(): Promise<HomepageStats> {
    // Cache the entire stats payload for 15 min (was hitting DB on every page load)
    return withCache('homepage:stats:v2', CACHE_TTL.LONG, async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Total published articles — use Postgres planner estimate (reltuples)
      // for the table; nearly identical to filtered count since the vast
      // majority of articles are published. ~1ms vs ~1-2s scan.
      const [estResult] = await db.execute(
        sql`SELECT GREATEST(reltuples::bigint, 0)::int AS est FROM pg_class WHERE relname = 'articles'`
      ) as any;
      const totalArticles = (estResult as any)?.est || 0;

      // Articles published in last 24 hours — keep filtered count (small index range scan)
      const [todayArticlesResult] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(articles)
        .where(
          and(
            eq(articles.status, 'published'),
            gte(articles.publishedAt, oneDayAgo)
          )
        );
      const todayArticles = todayArticlesResult?.count || 0;

      // Total views — cached separately for 1 hour (very expensive SUM)
      const totalViews = await withCache('homepage:totalViews', CACHE_TTL.VERY_LONG, async () => {
        const [r] = await db
          .select({ total: sql<number>`SUM(COALESCE(${articles.views}, 0))::bigint` })
          .from(articles)
          .where(eq(articles.status, 'published'));
        return Number(r?.total || 0);
      });

      // Active users (users with activity in last 7 days)
      const [activeUsersResult] = await db
        .select({ count: sql<number>`COUNT(DISTINCT ${users.id})::int` })
        .from(users)
        .where(gte(users.lastActivityAt, sevenDaysAgo));
      const activeUsers = activeUsersResult?.count || 0;

      return {
        totalArticles,
        todayArticles,
        totalViews,
        activeUsers,
      };
    });
  }

  // ============================================================
  // TASK MANAGEMENT OPERATIONS
  // ============================================================

  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db
      .insert(tasks)
      .values(task as any)
      .returning();
    
    await this.logTaskActivity({
      taskId: newTask.id,
      userId: task.createdById as string,
      action: 'created',
      changes: {
        description: 'Task created',
      },
    });

    return newTask;
  }

  async getTaskById(id: string): Promise<Task | null> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));
    
    return task || null;
  }

  async getTasks(filters: {
    status?: string;
    priority?: string;
    assignedToId?: string;
    createdById?: string;
    department?: string;
    parentTaskId?: string | null;
    search?: string;
    limit?: number;
    offset?: number;
    userIdForOwn?: string; // For view_own permission: created OR assigned
  }): Promise<{ tasks: Task[]; total: number }> {
    const {
      status,
      priority,
      assignedToId,
      createdById,
      department,
      parentTaskId,
      search,
      limit = 20,
      offset = 0,
      userIdForOwn,
    } = filters;

    let conditions = [];

    if (status) conditions.push(eq(tasks.status, status));
    if (priority) conditions.push(eq(tasks.priority, priority));
    if (assignedToId) conditions.push(eq(tasks.assignedToId, assignedToId));
    if (createdById) conditions.push(eq(tasks.createdById, createdById));
    if (department) conditions.push(eq(tasks.department, department));
    
    // For view_own permission: show tasks created by OR assigned to user
    if (userIdForOwn) {
      conditions.push(
        or(
          eq(tasks.createdById, userIdForOwn),
          eq(tasks.assignedToId, userIdForOwn)
        )
      );
    }
    
    // Filter by parentTaskId
    if (parentTaskId !== undefined) {
      if (parentTaskId === null) {
        // Fetch root tasks (parentTaskId IS NULL)
        conditions.push(isNull(tasks.parentTaskId));
      } else {
        // Fetch subtasks of specific parent
        conditions.push(eq(tasks.parentTaskId, parentTaskId));
      }
    }
    
    if (search) {
      conditions.push(
        or(
          ilike(tasks.title, `%${search}%`),
          ilike(tasks.description, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch tasks with subtasksCount using SQL subquery for performance
    const tasksListRaw = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdById: tasks.createdById,
        assignedToId: tasks.assignedToId,
        parentTaskId: tasks.parentTaskId,
        department: tasks.department,
        category: tasks.category,
        tags: tasks.tags,
        aiSuggestions: tasks.aiSuggestions,
        estimatedDuration: tasks.estimatedDuration,
        actualDuration: tasks.actualDuration,
        progress: tasks.progress,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        subtasksCount: sql<number>`(
          SELECT COUNT(*)::int 
          FROM ${tasks} subtask 
          WHERE subtask.parent_task_id = ${tasks.id}
        )`.as('subtasks_count'),
      })
      .from(tasks)
      .where(whereClause)
      // مفتوح أولاً → متأخر → أولوية → أقرب استحقاق → الأحدث
      .orderBy(
        sql`CASE WHEN ${tasks.status} IN ('completed', 'archived') THEN 1 ELSE 0 END`,
        sql`CASE WHEN ${tasks.status} NOT IN ('completed', 'archived') AND ${tasks.dueDate} IS NOT NULL AND ${tasks.dueDate} < NOW() THEN 0 ELSE 1 END`,
        sql`CASE ${tasks.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        sql`${tasks.dueDate} ASC NULLS LAST`,
        desc(tasks.createdAt),
      )
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(whereClause);

    return {
      tasks: tasksListRaw as Task[],
      total: countResult?.count || 0,
    };
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const [task] = await db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .returning();

    return task;
  }

  async deleteTask(id: string): Promise<void> {
    await db
      .delete(tasks)
      .where(eq(tasks.id, id));
  }

  async getTaskWithDetails(id: string): Promise<Task & {
    createdBy: User;
    assignedTo: User | null;
    subtasks: Subtask[];
    comments: (TaskComment & { user: User })[];
    attachments: TaskAttachment[];
  } | null> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));

    if (!task) return null;

    const createdByUser = aliasedTable(users, 'createdByUser');
    const assignedToUser = aliasedTable(users, 'assignedToUser');

    const [taskWithUsers] = await db
      .select({
        task: tasks,
        createdBy: createdByUser,
        assignedTo: assignedToUser,
      })
      .from(tasks)
      .leftJoin(createdByUser, eq(tasks.createdById, createdByUser.id))
      .leftJoin(assignedToUser, eq(tasks.assignedToId, assignedToUser.id))
      .where(eq(tasks.id, id));

    const taskSubtasks = await db
      .select()
      .from(subtasks)
      .where(eq(subtasks.taskId, id))
      .orderBy(subtasks.displayOrder);

    const commentsData = await db
      .select({
        comment: taskComments,
        user: userPublicSelect,
      })
      .from(taskComments)
      .leftJoin(users, eq(taskComments.userId, users.id))
      .where(eq(taskComments.taskId, id))
      .orderBy(desc(taskComments.createdAt));

    const attachmentsData = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, id))
      .orderBy(desc(taskAttachments.createdAt));

    return {
      ...task,
      createdBy: taskWithUsers.createdBy!,
      assignedTo: taskWithUsers.assignedTo || null,
      subtasks: taskSubtasks,
      comments: commentsData.map(row => ({
        ...row.comment,
        user: row.user!,
      })) as any,
      attachments: attachmentsData,
    };
  }

  async getTaskStatistics(userIdForOwn?: string): Promise<{
    total: number;
    todo: number;
    inProgress: number;
    review: number;
    completed: number;
    overdue: number;
  }> {
    const now = new Date();
    let baseConditions = [];
    
    // For view_own permission: show tasks created by OR assigned to user
    if (userIdForOwn) {
      baseConditions.push(
        or(
          eq(tasks.createdById, userIdForOwn),
          eq(tasks.assignedToId, userIdForOwn)
        )
      );
    }

    const baseWhere = baseConditions.length > 0 ? and(...baseConditions) : undefined;

    const [totalResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(baseWhere);

    const [todoResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        baseWhere
          ? and(baseWhere, eq(tasks.status, 'todo'))
          : eq(tasks.status, 'todo')
      );

    const [inProgressResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        baseWhere
          ? and(baseWhere, eq(tasks.status, 'in_progress'))
          : eq(tasks.status, 'in_progress')
      );

    const [reviewResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        baseWhere
          ? and(baseWhere, eq(tasks.status, 'review'))
          : eq(tasks.status, 'review')
      );

    const [completedResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        baseWhere
          ? and(baseWhere, eq(tasks.status, 'completed'))
          : eq(tasks.status, 'completed')
      );

    const [overdueResult] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(tasks)
      .where(
        baseWhere
          ? and(
              baseWhere,
              ne(tasks.status, 'completed'),
              ne(tasks.status, 'archived'),
              lte(tasks.dueDate, now)
            )
          : and(
              ne(tasks.status, 'completed'),
              ne(tasks.status, 'archived'),
              lte(tasks.dueDate, now)
            )
      );

    return {
      total: totalResult?.count || 0,
      todo: todoResult?.count || 0,
      inProgress: inProgressResult?.count || 0,
      review: reviewResult?.count || 0,
      completed: completedResult?.count || 0,
      overdue: overdueResult?.count || 0,
    };
  }

  // ============================================================
  // SUBTASK OPERATIONS
  // ============================================================

  async createSubtask(subtask: InsertSubtask): Promise<Subtask> {
    const [newSubtask] = await db
      .insert(subtasks)
      .values(subtask)
      .returning();

    await db
      .update(tasks)
      .set({
        subtasksCount: sql`${tasks.subtasksCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, subtask.taskId));

    await this.logTaskActivity({
      taskId: subtask.taskId,
      userId: subtask.taskId,
      action: 'subtask_created',
      changes: {
        description: `Subtask created: ${newSubtask.title}`,
      },
    });

    return newSubtask;
  }

  async getSubtaskById(id: string): Promise<Subtask | null> {
    const [subtask] = await db
      .select()
      .from(subtasks)
      .where(eq(subtasks.id, id));
    
    return subtask || null;
  }

  async updateSubtask(id: string, updates: Partial<Subtask>): Promise<Subtask> {
    const [subtask] = await db
      .update(subtasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(subtasks.id, id))
      .returning();

    await db
      .update(tasks)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, subtask.taskId));

    return subtask;
  }

  async deleteSubtask(id: string): Promise<void> {
    const [subtask] = await db
      .select()
      .from(subtasks)
      .where(eq(subtasks.id, id));

    if (subtask) {
      await db
        .delete(subtasks)
        .where(eq(subtasks.id, id));

      await db
        .update(tasks)
        .set({
          subtasksCount: sql`${tasks.subtasksCount} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, subtask.taskId));

      await this.logTaskActivity({
        taskId: subtask.taskId,
        userId: subtask.taskId,
        action: 'subtask_deleted',
        changes: {
          description: `Subtask deleted: ${subtask.title}`,
        },
      });
    }
  }

  async toggleSubtaskComplete(id: string, completedById: string): Promise<Subtask> {
    const [currentSubtask] = await db
      .select()
      .from(subtasks)
      .where(eq(subtasks.id, id));

    if (!currentSubtask) {
      throw new Error('Subtask not found');
    }

    const newCompletedState = !currentSubtask.isCompleted;

    const [subtask] = await db
      .update(subtasks)
      .set({
        isCompleted: newCompletedState,
        completedAt: newCompletedState ? new Date() : null,
        completedById: newCompletedState ? completedById : null,
        updatedAt: new Date(),
      })
      .where(eq(subtasks.id, id))
      .returning();

    await db
      .update(tasks)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, subtask.taskId));

    await this.logTaskActivity({
      taskId: subtask.taskId,
      userId: completedById,
      action: newCompletedState ? 'subtask_completed' : 'subtask_uncompleted',
      changes: {
        description: `Subtask ${newCompletedState ? 'completed' : 'uncompleted'}: ${subtask.title}`,
      },
    });

    return subtask;
  }

  // ============================================================
  // TASK COMMENT OPERATIONS
  // ============================================================

  async createTaskComment(comment: InsertTaskComment): Promise<TaskComment> {
    const [newComment] = await db
      .insert(taskComments)
      .values(comment)
      .returning();

    await db
      .update(tasks)
      .set({
        commentsCount: sql`${tasks.commentsCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, comment.taskId));

    await this.logTaskActivity({
      taskId: comment.taskId,
      userId: comment.userId,
      action: 'comment_added',
      changes: {
        description: 'Comment added',
      },
    });

    return newComment;
  }

  async getTaskCommentById(id: string): Promise<TaskComment | null> {
    const [comment] = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.id, id));
    
    return comment || null;
  }

  async getTaskComments(taskId: string): Promise<(TaskComment & { user: User })[]> {
    const commentsData = await db
      .select({
        comment: taskComments,
        user: userPublicSelect,
      })
      .from(taskComments)
      .leftJoin(users, eq(taskComments.userId, users.id))
      .where(eq(taskComments.taskId, taskId))
      .orderBy(desc(taskComments.createdAt));

    return commentsData.map(row => ({
      ...row.comment,
      user: row.user!,
    })) as unknown as (TaskComment & { user: User })[];
  }

  async deleteTaskComment(id: string): Promise<void> {
    const [comment] = await db
      .select()
      .from(taskComments)
      .where(eq(taskComments.id, id));

    if (comment) {
      await db
        .delete(taskComments)
        .where(eq(taskComments.id, id));

      await db
        .update(tasks)
        .set({
          commentsCount: sql`${tasks.commentsCount} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, comment.taskId));

      await this.logTaskActivity({
        taskId: comment.taskId,
        userId: comment.userId,
        action: 'comment_deleted',
        changes: {
          description: 'Comment deleted',
        },
      });
    }
  }

  // ============================================================
  // TASK ATTACHMENT OPERATIONS
  // ============================================================

  async createTaskAttachment(attachment: InsertTaskAttachment): Promise<TaskAttachment> {
    const [newAttachment] = await db
      .insert(taskAttachments)
      .values(attachment)
      .returning();

    await db
      .update(tasks)
      .set({
        attachmentsCount: sql`${tasks.attachmentsCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, attachment.taskId));

    await this.logTaskActivity({
      taskId: attachment.taskId,
      userId: attachment.userId,
      action: 'attachment_added',
      changes: {
        description: `Attachment added: ${newAttachment.fileName}`,
      },
    });

    return newAttachment;
  }

  async getTaskAttachmentById(id: string): Promise<TaskAttachment | null> {
    const [attachment] = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.id, id));
    
    return attachment || null;
  }

  async deleteTaskAttachment(id: string): Promise<void> {
    const [attachment] = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.id, id));

    if (attachment) {
      await db
        .delete(taskAttachments)
        .where(eq(taskAttachments.id, id));

      await db
        .update(tasks)
        .set({
          attachmentsCount: sql`${tasks.attachmentsCount} - 1`,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, attachment.taskId));

      await this.logTaskActivity({
        taskId: attachment.taskId,
        userId: attachment.userId,
        action: 'attachment_deleted',
        changes: {
          description: `Attachment deleted: ${attachment.fileName}`,
        },
      });
    }
  }

  async getTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
    const attachments = await db
      .select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(desc(taskAttachments.createdAt));

    return attachments;
  }

  // ============================================================
  // TASK ACTIVITY LOG OPERATIONS
  // ============================================================

  async logTaskActivity(entry: {
    taskId: string;
    userId: string;
    action: string;
    changes?: {
      field?: string;
      oldValue?: any;
      newValue?: any;
      description?: string;
    };
  }): Promise<void> {
    await db
      .insert(taskActivityLog)
      .values(entry);
  }

  async getTaskActivity(taskId: string): Promise<(TaskActivityLogEntry & { user: User })[]> {
    const activityData = await db
      .select({
        activity: taskActivityLog,
        user: userPublicSelect,
      })
      .from(taskActivityLog)
      .leftJoin(users, eq(taskActivityLog.userId, users.id))
      .where(eq(taskActivityLog.taskId, taskId))
      .orderBy(desc(taskActivityLog.createdAt));

    return activityData.map(row => ({
      ...row.activity,
      user: row.user!,
    })) as unknown as (TaskActivityLogEntry & { user: User })[];
  }

  // ============================================================
  // EMAIL AGENT OPERATIONS
  // ============================================================

  async createTrustedSender(sender: InsertTrustedEmailSender, createdBy: string): Promise<TrustedEmailSender> {
    const [newSender] = await db
      .insert(trustedEmailSenders)
      .values({
        ...sender,
        token: sender.token?.toLowerCase(),
        createdBy,
      })
      .returning();
    
    return newSender;
  }

  async getTrustedSenders(): Promise<TrustedEmailSender[]> {
    return await db
      .select()
      .from(trustedEmailSenders)
      .orderBy(desc(trustedEmailSenders.createdAt));
  }

  async getTrustedSenderById(id: string): Promise<TrustedEmailSender | null> {
    const [sender] = await db
      .select()
      .from(trustedEmailSenders)
      .where(eq(trustedEmailSenders.id, id));
    
    return sender || null;
  }

  async getTrustedSenderByEmail(email: string): Promise<TrustedEmailSender | null> {
    const [sender] = await db
      .select()
      .from(trustedEmailSenders)
      .where(eq(trustedEmailSenders.email, email));
    
    return sender || null;
  }

  async updateTrustedSender(id: string, updates: Partial<InsertTrustedEmailSender>): Promise<TrustedEmailSender> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date(),
    };
    
    if (updates.token) {
      updateData.token = updates.token.toLowerCase();
    }
    
    const [updated] = await db
      .update(trustedEmailSenders)
      .set(updateData)
      .where(eq(trustedEmailSenders.id, id))
      .returning();
    
    return updated;
  }

  async deleteTrustedSender(id: string): Promise<void> {
    await db
      .delete(trustedEmailSenders)
      .where(eq(trustedEmailSenders.id, id));
  }

  async createEmailWebhookLog(log: InsertEmailWebhookLog): Promise<EmailWebhookLog> {
    const [newLog] = await db
      .insert(emailWebhookLogs)
      .values(log)
      .returning();
    
    return newLog;
  }

  async getEmailWebhookLogs(filters?: {
    status?: string;
    trustedSenderId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: EmailWebhookLog[]; total: number }> {
    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(emailWebhookLogs.status, filters.status));
    }
    
    if (filters?.trustedSenderId) {
      conditions.push(eq(emailWebhookLogs.trustedSenderId, filters.trustedSenderId));
    }
    
    const query = db
      .select()
      .from(emailWebhookLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(emailWebhookLogs.receivedAt));
    
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    
    if (filters?.offset) {
      query.offset(filters.offset);
    }
    
    const logs = await query;
    
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailWebhookLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    return { logs, total: Number(count) };
  }

  async updateEmailWebhookLog(id: string, updates: Partial<EmailWebhookLog>): Promise<EmailWebhookLog> {
    const [updated] = await db
      .update(emailWebhookLogs)
      .set({
        ...updates,
        processedAt: updates.status && updates.status !== 'received' ? new Date() : undefined,
      })
      .where(eq(emailWebhookLogs.id, id))
      .returning();
    
    return updated;
  }

  async deleteEmailWebhookLog(id: string): Promise<void> {
    await db
      .delete(emailWebhookLogs)
      .where(eq(emailWebhookLogs.id, id));
  }

  async deleteEmailWebhookLogs(ids: string[]): Promise<void> {
    await db
      .delete(emailWebhookLogs)
      .where(inArray(emailWebhookLogs.id, ids));
  }

  async getEmailWebhookLogsByDateRange(startDate: Date, endDate: Date): Promise<EmailWebhookLog[]> {
    const logs = await db
      .select()
      .from(emailWebhookLogs)
      .where(
        and(
          gte(emailWebhookLogs.receivedAt, startDate),
          lt(emailWebhookLogs.receivedAt, endDate)
        )
      )
      .orderBy(desc(emailWebhookLogs.receivedAt));
    
    return logs;
  }

  async getEmailAgentStats(date?: Date): Promise<EmailAgentStats | null> {
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);
    
    const [stats] = await db
      .select()
      .from(emailAgentStats)
      .where(eq(emailAgentStats.date, targetDate));
    
    return stats || null;
  }

  async updateEmailAgentStats(date: Date, updates: Partial<EmailAgentStats>): Promise<EmailAgentStats> {
    date.setHours(0, 0, 0, 0);
    
    const [stats] = await db
      .insert(emailAgentStats)
      .values({
        date,
        ...updates,
      })
      .onConflictDoUpdate({
        target: emailAgentStats.date,
        set: {
          ...updates,
        },
      })
      .returning();
    
    return stats;
  }

  async getEmailLanguageCounts(): Promise<{ ar: number; en: number; ur: number }> {
    // Count articles created via email agent (articles that exist in emailWebhookLogs)
    // The database has separate tables for each language: articles (ar), enArticles (en), urArticles (ur)
    // Using three separate queries, one for each language table
    const arResults = await db
      .select({ id: articles.id })
      .from(articles)
      .innerJoin(emailWebhookLogs, eq(emailWebhookLogs.articleId, articles.id));
    
    const enResults = await db
      .select({ id: enArticles.id })
      .from(enArticles)
      .innerJoin(emailWebhookLogs, eq(emailWebhookLogs.articleId, enArticles.id));
    
    const urResults = await db
      .select({ id: urArticles.id })
      .from(urArticles)
      .innerJoin(emailWebhookLogs, eq(emailWebhookLogs.articleId, urArticles.id));
    
    return {
      ar: arResults.length,
      en: enResults.length,
      ur: urResults.length,
    };
  }

  // ============================================================
  // WHATSAPP INTEGRATION OPERATIONS
  // ============================================================

  async createWhatsappToken(token: InsertWhatsappToken): Promise<WhatsappToken> {
    const [newToken] = await db
      .insert(whatsappTokens)
      .values(token)
      .returning();
    
    return newToken;
  }

  async getWhatsappToken(id: string): Promise<WhatsappToken | null> {
    const [token] = await db
      .select()
      .from(whatsappTokens)
      .where(eq(whatsappTokens.id, id));
    
    return token || null;
  }

  async getWhatsappTokenByToken(token: string): Promise<WhatsappToken | null> {
    const [result] = await db
      .select()
      .from(whatsappTokens)
      .where(eq(whatsappTokens.token, token));
    
    return result || null;
  }

  async getWhatsappTokensByUser(userId: string): Promise<WhatsappToken[]> {
    return await db
      .select()
      .from(whatsappTokens)
      .where(eq(whatsappTokens.userId, userId))
      .orderBy(desc(whatsappTokens.createdAt));
  }

  async getAllWhatsappTokens(): Promise<WhatsappToken[]> {
    return await db
      .select()
      .from(whatsappTokens)
      .orderBy(desc(whatsappTokens.createdAt));
  }

  async updateWhatsappToken(id: string, updates: Partial<InsertWhatsappToken>): Promise<WhatsappToken | null> {
    const [updated] = await db
      .update(whatsappTokens)
      .set(updates)
      .where(eq(whatsappTokens.id, id))
      .returning();
    
    return updated || null;
  }

  async updateWhatsappTokenUsage(id: string): Promise<void> {
    await db
      .update(whatsappTokens)
      .set({
        usageCount: sql`${whatsappTokens.usageCount} + 1`,
        lastUsedAt: new Date(),
      })
      .where(eq(whatsappTokens.id, id));
  }

  async deleteWhatsappToken(id: string): Promise<void> {
    // First, nullify references in webhook logs to prevent foreign key constraint errors
    await db
      .update(whatsappWebhookLogs)
      .set({ tokenId: null })
      .where(eq(whatsappWebhookLogs.tokenId, id));
    
    // Delete pending messages for this token
    await db
      .delete(pendingWhatsappMessages)
      .where(eq(pendingWhatsappMessages.tokenId, id));
    
    // Now delete the token
    await db
      .delete(whatsappTokens)
      .where(eq(whatsappTokens.id, id));
  }

  async createWhatsappWebhookLog(log: InsertWhatsappWebhookLog): Promise<WhatsappWebhookLog> {
    const [newLog] = await db
      .insert(whatsappWebhookLogs)
      .values(log)
      .returning();
    
    return newLog;
  }

  async updateWhatsappWebhookLog(id: string, updates: Partial<InsertWhatsappWebhookLog>): Promise<WhatsappWebhookLog | null> {
    const [updated] = await db
      .update(whatsappWebhookLogs)
      .set(updates)
      .where(eq(whatsappWebhookLogs.id, id))
      .returning();
    
    return updated || null;
  }

  async getWhatsappWebhookLogs(params: { limit?: number; offset?: number; status?: string }): Promise<{ logs: WhatsappWebhookLog[]; total: number }> {
    const conditions = [];
    
    if (params?.status) {
      conditions.push(eq(whatsappWebhookLogs.status, params.status));
    }
    
    const query = db
      .select()
      .from(whatsappWebhookLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(whatsappWebhookLogs.createdAt));
    
    if (params?.limit) {
      query.limit(params.limit);
    }
    
    if (params?.offset) {
      query.offset(params.offset);
    }
    
    const logs = await query;
    
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(whatsappWebhookLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    return {
      logs,
      total: Number(count),
    };
  }

  async getWhatsappWebhookLog(id: string): Promise<WhatsappWebhookLog | null> {
    const [log] = await db
      .select()
      .from(whatsappWebhookLogs)
      .where(eq(whatsappWebhookLogs.id, id));
    
    return log || null;
  }

  async deleteWhatsappWebhookLog(id: string): Promise<void> {
    await db
      .delete(whatsappWebhookLogs)
      .where(eq(whatsappWebhookLogs.id, id));
  }

  async bulkDeleteWhatsappWebhookLogs(ids: string[]): Promise<void> {
    await db
      .delete(whatsappWebhookLogs)
      .where(inArray(whatsappWebhookLogs.id, ids));
  }

  // Pending WhatsApp Messages (multi-part message aggregation)
  async getPendingWhatsappMessage(phoneNumber: string, token: string): Promise<PendingWhatsappMessage | null> {
    const [pending] = await db
      .select()
      .from(pendingWhatsappMessages)
      .where(
        and(
          eq(pendingWhatsappMessages.phoneNumber, phoneNumber),
          eq(pendingWhatsappMessages.token, token),
          eq(pendingWhatsappMessages.isProcessing, false),
          gte(pendingWhatsappMessages.expiresAt, new Date())
        )
      )
      .limit(1);
    
    return pending || null;
  }

  async getPendingWhatsappMessageById(id: string): Promise<PendingWhatsappMessage | null> {
    const [pending] = await db
      .select()
      .from(pendingWhatsappMessages)
      .where(eq(pendingWhatsappMessages.id, id))
      .limit(1);
    
    return pending || null;
  }

  async createOrUpdatePendingWhatsappMessage(data: {
    phoneNumber: string;
    token: string;
    tokenId?: string;
    userId?: string;
    messagePart: string;
    mediaUrls?: string[];
    aggregationWindowSeconds?: number;
  }): Promise<PendingWhatsappMessage> {
    // استخدام ?? بدلاً من || للسماح بالقيمة 0 للنشر الفوري
    const windowSeconds = data.aggregationWindowSeconds ?? 30;
    const expiresAt = new Date(Date.now() + windowSeconds * 1000);
    
    // Use atomic upsert with array_cat to prevent race conditions
    // When two webhook deliveries arrive simultaneously, both will atomically append their parts
    const newMediaUrls = data.mediaUrls || [];
    
    // First, try to delete any expired or processing records for this phone/token combo
    // This ensures we start fresh if the previous message window expired
    await db.execute(sql`
      DELETE FROM pending_whatsapp_messages 
      WHERE phone_number = ${data.phoneNumber} 
      AND token = ${data.token} 
      AND (is_processing = true OR expires_at <= NOW())
    `);
    
    const result = await db.execute(sql`
      INSERT INTO pending_whatsapp_messages (
        id, phone_number, token, token_id, user_id, 
        message_parts, media_urls, first_message_at, last_message_at, 
        is_processing, expires_at
      ) VALUES (
        gen_random_uuid(), ${data.phoneNumber}, ${data.token}, 
        ${data.tokenId || null}, ${data.userId || null},
        ARRAY[${data.messagePart}]::text[], 
        ${newMediaUrls.length > 0 ? sql`ARRAY[${sql.join(newMediaUrls.map(u => sql`${u}`), sql`,`)}]::text[]` : sql`'{}'::text[]`},
        NOW(), NOW(), false, ${expiresAt}
      )
      ON CONFLICT (phone_number, token) 
      DO UPDATE SET
        message_parts = array_cat(pending_whatsapp_messages.message_parts, ARRAY[${data.messagePart}]::text[]),
        media_urls = array_cat(
          COALESCE(pending_whatsapp_messages.media_urls, '{}'::text[]),
          ${newMediaUrls.length > 0 ? sql`ARRAY[${sql.join(newMediaUrls.map(u => sql`${u}`), sql`,`)}]::text[]` : sql`'{}'::text[]`}
        ),
        last_message_at = NOW(),
        expires_at = ${expiresAt}
      RETURNING *
    `);
    
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as any;
      return {
        id: row.id,
        phoneNumber: row.phone_number,
        token: row.token,
        tokenId: row.token_id,
        userId: row.user_id,
        messageParts: row.message_parts,
        mediaUrls: row.media_urls,
        firstMessageAt: row.first_message_at,
        lastMessageAt: row.last_message_at,
        isProcessing: row.is_processing,
        expiresAt: row.expires_at,
      } as PendingWhatsappMessage;
    }
    
    // Fallback: if upsert didn't return, fetch the existing record
    const existing = await this.getPendingWhatsappMessage(data.phoneNumber, data.token);
    if (existing) {
      return existing;
    }
    
    throw new Error('Failed to create or update pending WhatsApp message');
  }

  async deletePendingWhatsappMessage(id: string): Promise<void> {
    await db
      .delete(pendingWhatsappMessages)
      .where(eq(pendingWhatsappMessages.id, id));
  }

  async getExpiredPendingMessages(): Promise<PendingWhatsappMessage[]> {
    const expired = await db
      .select()
      .from(pendingWhatsappMessages)
      .where(
        and(
          eq(pendingWhatsappMessages.isProcessing, false),
          lt(pendingWhatsappMessages.expiresAt, new Date())
        )
      );
    
    return expired;
  }

  async markPendingMessageProcessing(id: string): Promise<PendingWhatsappMessage | null> {
    const [updated] = await db
      .update(pendingWhatsappMessages)
      .set({ isProcessing: true })
      .where(
        and(
          eq(pendingWhatsappMessages.id, id),
          eq(pendingWhatsappMessages.isProcessing, false)
        )
      )
      .returning();
    
    return updated || null;
  }

  // Notification Operations
  private async getStaffUserIds(): Promise<string[]> {
    const staffRoles = ['super_admin', 'admin', 'editor', 'reporter', 'moderator', 'content_creator'];
    
    const staffUsers = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(inArray(roles.name, staffRoles));
    
    return staffUsers.map(u => u.userId);
  }

  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    deeplink?: string;
    metadata?: any;
  }): Promise<NotificationInbox> {
    const [notification] = await db.insert(notificationsInbox).values({
      id: nanoid(),
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      deeplink: data.deeplink,
      metadata: data.metadata,
    }).returning();
    
    notificationBus.emit(data.userId, notification);
    
    return notification;
  }

  async getNotifications(userId: string, filters?: {
    read?: boolean;
    limit?: number;
    offset?: number;
    excludeTypes?: string[];
  }): Promise<{ notifications: NotificationInbox[]; total: number }> {
    const conditions = [eq(notificationsInbox.userId, userId)];

    if (filters?.read !== undefined) {
      conditions.push(eq(notificationsInbox.read, filters.read));
    }

    // استبعاد أنواع محددة (مثل إشعارات نشر المقالات التحريرية من مركز إشعارات الويب).
    if (filters?.excludeTypes && filters.excludeTypes.length > 0) {
      conditions.push(not(inArray(notificationsInbox.type, filters.excludeTypes)));
    }

    const whereClause = and(...conditions);
    
    const [totalResult] = await db
      .select({ count: count() })
      .from(notificationsInbox)
      .where(whereClause);
    
    const notifications = await db
      .select()
      .from(notificationsInbox)
      .where(whereClause)
      .orderBy(desc(notificationsInbox.createdAt))
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);
    
    return {
      notifications,
      total: Number(totalResult.count),
    };
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(notificationsInbox)
      .where(and(
        eq(notificationsInbox.userId, userId),
        eq(notificationsInbox.read, false)
      ));
    
    return Number(result.count);
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    await db
      .update(notificationsInbox)
      .set({ read: true })
      .where(eq(notificationsInbox.id, notificationId));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notificationsInbox)
      .set({ read: true })
      .where(eq(notificationsInbox.userId, userId));
  }

  async deleteNotification(notificationId: string): Promise<void> {
    await db
      .delete(notificationsInbox)
      .where(eq(notificationsInbox.id, notificationId));
  }

  async clearAllNotifications(userId: string): Promise<void> {
    await db
      .delete(notificationsInbox)
      .where(eq(notificationsInbox.userId, userId));
  }

  async broadcastNotificationToStaff(data: {
    type: string;
    title: string;
    body: string;
    deeplink?: string;
    metadata?: any;
  }): Promise<void> {
    const staffUserIds = await this.getStaffUserIds();
    
    await db.transaction(async (tx) => {
      for (const userId of staffUserIds) {
        const [notification] = await tx.insert(notificationsInbox).values({
          id: nanoid(),
          userId,
          type: data.type,
          title: data.title,
          body: data.body,
          deeplink: data.deeplink,
          metadata: data.metadata,
        }).returning();
        
        notificationBus.emit(userId, notification);
      }
    });
  }

  // Newsletter Subscriptions
  async createNewsletterSubscription(data: InsertNewsletterSubscription): Promise<NewsletterSubscription> {
    const [subscription] = await db
      .insert(newsletterSubscriptions)
      .values({
        ...data,
        id: nanoid(),
      })
      .returning();
    
    return subscription;
  }

  async getNewsletterSubscription(email: string): Promise<NewsletterSubscription | null> {
    const [subscription] = await db
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.email, email));
    
    return subscription || null;
  }

  async getAllNewsletterSubscriptions(params?: { 
    status?: string; 
    language?: string;
    limit?: number; 
    offset?: number;
  }): Promise<{ subscriptions: NewsletterSubscription[]; total: number }> {
    const conditions = [];
    
    if (params?.status) {
      conditions.push(eq(newsletterSubscriptions.status, params.status));
    }
    
    if (params?.language) {
      conditions.push(eq(newsletterSubscriptions.language, params.language));
    }
    
    const query = db
      .select()
      .from(newsletterSubscriptions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(newsletterSubscriptions.createdAt));
    
    if (params?.limit) {
      query.limit(params.limit);
    }
    
    if (params?.offset) {
      query.offset(params.offset);
    }
    
    const subscriptions = await query;
    
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(newsletterSubscriptions)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    return {
      subscriptions,
      total: Number(count),
    };
  }

  async updateNewsletterSubscription(id: string, updates: Partial<InsertNewsletterSubscription>): Promise<NewsletterSubscription | null> {
    const [subscription] = await db
      .update(newsletterSubscriptions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(newsletterSubscriptions.id, id))
      .returning();
    
    return subscription || null;
  }

  async deleteNewsletterSubscription(id: string): Promise<void> {
    await db
      .delete(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.id, id));
  }

  // Article Media Assets operations
  async createArticleMediaAsset(data: InsertArticleMediaAsset): Promise<ArticleMediaAsset> {
    const [asset] = await db
      .insert(articleMediaAssets)
      .values(data as any)
      .returning();
    
    return asset;
  }

  async getArticleMediaAssets(articleId: string, locale?: string): Promise<ArticleMediaAsset[]> {
    const conditions = [eq(articleMediaAssets.articleId, articleId)];
    
    if (locale) {
      conditions.push(eq(articleMediaAssets.locale, locale));
    }
    
    const assets = await db
      .select()
      .from(articleMediaAssets)
      .where(and(...conditions))
      .orderBy(asc(articleMediaAssets.displayOrder));
    
    return assets;
  }

  async getArticleMediaAssetById(id: string): Promise<ArticleMediaAsset | null> {
    const [asset] = await db
      .select()
      .from(articleMediaAssets)
      .where(eq(articleMediaAssets.id, id));
    
    return asset || null;
  }

  async updateArticleMediaAsset(id: string, data: UpdateArticleMediaAsset): Promise<ArticleMediaAsset> {
    const [asset] = await db
      .update(articleMediaAssets)
      .set({
        ...data,
        updatedAt: new Date(),
      } as any)
      .where(eq(articleMediaAssets.id, id))
      .returning();
    
    if (!asset) {
      throw new Error(`Article media asset with id ${id} not found`);
    }
    
    return asset;
  }

  async deleteArticleMediaAsset(id: string): Promise<void> {
    await db
      .delete(articleMediaAssets)
      .where(eq(articleMediaAssets.id, id));
  }

  async getArticleMediaAssetWithDetails(
    articleId: string,
    locale?: string
  ): Promise<Array<ArticleMediaAsset & { mediaFile: MediaFile }>> {
    const conditions = [eq(articleMediaAssets.articleId, articleId)];
    
    if (locale) {
      conditions.push(eq(articleMediaAssets.locale, locale));
    }
    
    const results = await db
      .select({
        ...getTableColumns(articleMediaAssets),
        mediaFile: getTableColumns(mediaFiles),
      })
      .from(articleMediaAssets)
      .leftJoin(mediaFiles, eq(articleMediaAssets.mediaFileId, mediaFiles.id))
      .where(and(...conditions))
      .orderBy(asc(articleMediaAssets.displayOrder));
    
    return results as Array<ArticleMediaAsset & { mediaFile: MediaFile }>;
  }

  // Article Tags operations
  async getArticleTags(articleId: string): Promise<Array<{ id: string; nameAr: string; nameEn: string; slug: string }>> {
    const results = await db
      .select({
        id: tags.id,
        nameAr: tags.nameAr,
        nameEn: tags.nameEn,
        slug: tags.slug,
      })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(eq(articleTags.articleId, articleId));
    
    return results;
  }

  // Publisher operations
  async getPublisher(id: string): Promise<Publisher | undefined> {
    const [publisher] = await db
      .select()
      .from(publishers)
      .where(eq(publishers.id, id));
    return publisher;
  }

  async getPublisherByUserId(userId: string): Promise<Publisher | undefined> {
    // First check if user is the publisher owner
    const [publisher] = await db
      .select()
      .from(publishers)
      .where(eq(publishers.userId, userId));
    
    if (publisher) return publisher;
    
    // If not owner, check if user is linked to a publisher (content manager)
    const [user] = await db
      .select({ linkedPublisherId: users.linkedPublisherId })
      .from(users)
      .where(eq(users.id, userId));
    
    if (user?.linkedPublisherId) {
      const [linkedPublisher] = await db
        .select()
        .from(publishers)
        .where(eq(publishers.id, user.linkedPublisherId));
      return linkedPublisher;
    }
    
    return undefined;
  }

  async createPublisher(publisherData: InsertPublisher): Promise<Publisher> {
    const [publisher] = await db
      .insert(publishers)
      .values(publisherData)
      .returning();
    return publisher;
  }

  async updatePublisher(id: string, publisherData: UpdatePublisher): Promise<Publisher> {
    // updatePublisherSchema يمرر التواريخ نصوصاً ("YYYY-MM-DD") بينما drizzle
    // يستدعي toISOString() على قيم timestamp — نطبّع هنا لكلا مساري التحديث.
    const normalized: any = { ...publisherData };
    for (const key of ["publishingEndsAt", "suspendedUntil"] as const) {
      const value = normalized[key];
      if (typeof value === "string") {
        const parsed = value.trim() ? new Date(value) : null;
        normalized[key] = parsed && !isNaN(parsed.getTime()) ? parsed : null;
      }
    }

    const [publisher] = await db
      .update(publishers)
      .set({
        ...normalized,
        updatedAt: new Date(),
      } as any)
      .where(eq(publishers.id, id))
      .returning();
    
    if (!publisher) {
      throw new Error(`Publisher with id ${id} not found`);
    }
    
    return publisher;
  }

  async getAllPublishers(params: { 
    page?: number; 
    limit?: number; 
    isActive?: boolean;
  }): Promise<{ publishers: Publisher[]; total: number }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (params.isActive !== undefined) {
      conditions.push(eq(publishers.isActive, params.isActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const publishersData = await db
      .select({
        publisher: publishers,
        totalRemainingCredits: sql<number>`COALESCE((
          SELECT SUM(${publisherCredits.remainingCredits})
          FROM ${publisherCredits}
          WHERE ${publisherCredits.publisherId} = ${publishers.id}
            AND ${publisherCredits.isActive} = true
        ), 0)`,
      })
      .from(publishers)
      .where(whereClause)
      .orderBy(desc(publishers.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(publishers)
      .where(whereClause);

    // Flatten the result to include totalRemainingCredits in publisher object
    const publishersWithCredits = publishersData.map(row => ({
      ...row.publisher,
      totalRemainingCredits: Number(row.totalRemainingCredits) || 0,
    }));

    return {
      publishers: publishersWithCredits,
      total: Number(count),
    };
  }

  // Publisher Credits operations
  async getPublisherCredits(publisherId: string): Promise<PublisherCredit[]> {
    const credits = await db
      .select()
      .from(publisherCredits)
      .where(eq(publisherCredits.publisherId, publisherId))
      .orderBy(desc(publisherCredits.createdAt));
    return credits;
  }

  async getActivePublisherCredit(publisherId: string): Promise<PublisherCredit | undefined> {
    const now = new Date();
    const [credit] = await db
      .select()
      .from(publisherCredits)
      .where(
        and(
          eq(publisherCredits.publisherId, publisherId),
          eq(publisherCredits.isActive, true),
          // الباقة المفتوحة صالحة دائماً بغض النظر عن الرصيد المتبقي
          or(
            eq(publisherCredits.isUnlimited, true),
            sql`${publisherCredits.remainingCredits} > 0`
          ),
          or(
            isNull(publisherCredits.expiryDate),
            gte(publisherCredits.expiryDate, now)
          )
        )
      )
      .orderBy(desc(publisherCredits.isUnlimited), asc(publisherCredits.expiryDate))
      .limit(1);
    return credit;
  }

  async createPublisherCredit(
    creditData: InsertPublisherCredit & { remainingCredits: number }
  ): Promise<PublisherCredit> {
    const [credit] = await db
      .insert(publisherCredits)
      .values(creditData as any)
      .returning();
    
    // Log the credit addition
    await this.createCreditLog({
      publisherId: credit.publisherId,
      creditPackageId: credit.id,
      actionType: 'credit_added',
      creditsBefore: 0,
      creditsChanged: credit.totalCredits,
      creditsAfter: credit.remainingCredits,
      notes: `تمت إضافة باقة ${credit.packageName}`,
    });
    
    return credit;
  }

  async getPublisherActiveCredits(publisherId: string): Promise<PublisherCredit[]> {
    const now = new Date();
    const credits = await db
      .select()
      .from(publisherCredits)
      .where(
        and(
          eq(publisherCredits.publisherId, publisherId),
          eq(publisherCredits.isActive, true),
          sql`${publisherCredits.remainingCredits} > 0`,
          or(
            isNull(publisherCredits.expiryDate),
            gte(publisherCredits.expiryDate, now)
          )
        )
      )
      .orderBy(asc(publisherCredits.expiryDate));
    
    return credits;
  }

  async getPublisherCreditById(creditId: string): Promise<PublisherCredit | undefined> {
    const [credit] = await db
      .select()
      .from(publisherCredits)
      .where(eq(publisherCredits.id, creditId));
    
    return credit;
  }

  async updatePublisherCredit(
    creditId: string,
    updates: Partial<Pick<PublisherCredit, 'packageName' | 'expiryDate' | 'isActive' | 'notes'>>
  ): Promise<PublisherCredit> {
    const [credit] = await db
      .update(publisherCredits)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(publisherCredits.id, creditId))
      .returning();
    
    if (!credit) {
      throw new Error(`Credit package with id ${creditId} not found`);
    }
    
    return credit;
  }

  async deactivateExpiredCredits(): Promise<{ deactivated: number; creditIds: string[] }> {
    const now = new Date();
    
    const expiredCredits = await db
      .update(publisherCredits)
      .set({
        isActive: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(publisherCredits.isActive, true),
          isNotNull(publisherCredits.expiryDate),
          lt(publisherCredits.expiryDate, now)
        )
      )
      .returning({ id: publisherCredits.id, publisherId: publisherCredits.publisherId });
    
    for (const credit of expiredCredits) {
      await this.logCreditAction({
        publisherId: credit.publisherId,
        creditPackageId: credit.id,
        actionType: 'credit_expired',
        creditsBefore: 0,
        creditsChanged: 0,
        creditsAfter: 0,
        notes: 'تم إلغاء تفعيل الباقة تلقائياً بسبب انتهاء صلاحيتها',
      });
    }
    
    return {
      deactivated: expiredCredits.length,
      creditIds: expiredCredits.map(c => c.id),
    };
  }

  // deductPublisherCredit moved to services/publisherCreditService.ts
  // (ADR-001): the old version ran UPDATE + log INSERT non-atomically and
  // its callers swallowed failures. See deductPublisherCreditSafely.

  async getPublisherStats(
    publisherId: string, 
    period?: { start: Date; end: Date }
  ): Promise<{
    totalArticles: number;
    publishedArticles: number;
    pendingArticles: number;
    rejectedArticles: number;
    remainingCredits: number;
    usedCredits: number;
    totalCreditsUsed: number;
    totalCreditsPurchased: number;
  }> {
    // Get publisher to find userId
    const publisher = await this.getPublisher(publisherId);
    if (!publisher) {
      throw new Error('Publisher not found');
    }

    // Build conditions for articles query - use publisherId to find publisher articles
    const articleConditions: any[] = [eq(articles.publisherId, publisherId)];
    
    if (period) {
      articleConditions.push(
        and(
          gte(articles.createdAt, period.start),
          lte(articles.createdAt, period.end)
        )
      );
    }

    // Get article counts
    const [stats] = await db
      .select({
        totalArticles: sql<number>`count(*)`,
        publishedArticles: sql<number>`count(*) filter (where ${articles.status} = 'published')`,
        pendingArticles: sql<number>`count(*) filter (where ${articles.status} = 'draft')`,
        rejectedArticles: sql<number>`count(*) filter (where ${articles.status} = 'archived')`,
      })
      .from(articles)
      .where(and(...articleConditions));

    // Get credit stats - only count ACTIVE credits
    const [creditStats] = await db
      .select({
        remainingCredits: sql<number>`COALESCE(sum(${publisherCredits.remainingCredits}), 0)`,
        usedCredits: sql<number>`COALESCE(sum(${publisherCredits.usedCredits}), 0)`,
        totalCreditsPurchased: sql<number>`COALESCE(sum(${publisherCredits.totalCredits}), 0)`,
      })
      .from(publisherCredits)
      .where(and(
        eq(publisherCredits.publisherId, publisherId),
        eq(publisherCredits.isActive, true)
      ));

    return {
      totalArticles: Number(stats.totalArticles) || 0,
      publishedArticles: Number(stats.publishedArticles) || 0,
      pendingArticles: Number(stats.pendingArticles) || 0,
      rejectedArticles: Number(stats.rejectedArticles) || 0,
      remainingCredits: Number(creditStats?.remainingCredits) || 0,
      usedCredits: Number(creditStats?.usedCredits) || 0,
      totalCreditsUsed: Number(creditStats?.usedCredits) || 0,
      totalCreditsPurchased: Number(creditStats?.totalCreditsPurchased) || 0,
    };
  }

  // Publisher Credit Logs
  async getPublisherCreditLogs(
    publisherId: string, 
    page: number = 1, 
    limit: number = 50
  ): Promise<{ logs: PublisherCreditLog[]; total: number }> {
    const offset = (page - 1) * limit;

    const logs = await db
      .select()
      .from(publisherCreditLogs)
      .where(eq(publisherCreditLogs.publisherId, publisherId))
      .orderBy(desc(publisherCreditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(publisherCreditLogs)
      .where(eq(publisherCreditLogs.publisherId, publisherId));

    return {
      logs,
      total: Number(count),
    };
  }

  async createCreditLog(log: InsertPublisherCreditLog): Promise<PublisherCreditLog> {
    const [creditLog] = await db
      .insert(publisherCreditLogs)
      .values(log)
      .returning();
    return creditLog;
  }

  async logCreditAction(params: {
    publisherId: string;
    creditPackageId?: string;
    articleId?: string;
    actionType: 'credit_added' | 'credit_used' | 'credit_refunded' | 'credit_expired' | 'credit_adjusted';
    creditsBefore: number;
    creditsChanged: number;
    creditsAfter: number;
    performedBy?: string;
    notes?: string;
  }): Promise<PublisherCreditLog> {
    return await this.createCreditLog({
      publisherId: params.publisherId,
      creditPackageId: params.creditPackageId as string,
      articleId: params.articleId,
      actionType: params.actionType,
      creditsBefore: params.creditsBefore,
      creditsChanged: params.creditsChanged,
      creditsAfter: params.creditsAfter,
      performedBy: params.performedBy,
      notes: params.notes,
    });
  }

  async getPublisherArticles(
    publisherId: string,
    filters?: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ articles: ArticleWithDetails[]; total: number }> {
    const publisher = await this.getPublisher(publisherId);
    if (!publisher) {
      throw new Error('Publisher not found');
    }

    // مواد الوكالة = المختومة بـ publisher_id فقط (لا أرشيف المراسل عبر authorId)
    const conditions: any[] = [eq(articles.publisherId, publisherId)];

    if (filters?.status) {
      conditions.push(eq(articles.status, filters.status));
    }

    if (filters?.startDate) {
      conditions.push(gte(articles.createdAt, filters.startDate));
    }

    if (filters?.endDate) {
      conditions.push(lte(articles.createdAt, filters.endDate));
    }

    const whereClause = and(...conditions);
    const limit = filters?.limit || 20;
    const offset = filters?.offset || 0;

    const articlesData = await db
      .select({
        ...getTableColumns(articles),
        category: {
          id: categories.id,
          name: categories.nameAr,
          slug: categories.slug,
          description: categories.description,
          imageUrl: categories.heroImageUrl,
          isActive: categories.status,
        },
        author: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          role: users.role,
        },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .where(whereClause)
      .orderBy(desc(articles.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(whereClause);

    return {
      articles: articlesData as unknown as ArticleWithDetails[],
      total: Number(count),
    };
  }

  /**
   * CRITICAL: Approve publisher article with transactional safety
   * Wraps article publish + credit deduction in a single transaction
   * If ANY step fails, entire transaction rolls back
   */
  async approvePublisherArticle(
    articleId: string, 
    publisherId: string, 
    performedBy: string
  ): Promise<Article> {
    // Use Drizzle transaction to ensure atomicity
    return await db.transaction(async (tx) => {
      // Step 1: Lock and verify article exists AND is in draft status
      // Using SELECT FOR UPDATE to prevent concurrent approvals
      const [article] = await tx
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.id, articleId),
            eq(articles.status, 'draft')  // Check status in locked SELECT
          )
        )
        .for('update')  // Row-level lock - prevents concurrent modifications
        .limit(1);

      if (!article) {
        throw new Error('المقال غير موجود أو تمت الموافقة عليه مسبقاً');
      }

      // Step 2: Lock and get active credit package (within transaction)
      // Using SELECT FOR UPDATE to prevent concurrent credit deductions
      const [activeCredit] = await tx
        .select()
        .from(publisherCredits)
        .where(
          and(
            eq(publisherCredits.publisherId, publisherId),
            eq(publisherCredits.isActive, true),
            or(
              isNull(publisherCredits.expiryDate),
              gte(publisherCredits.expiryDate, new Date())
            )
          )
        )
        .orderBy(desc(publisherCredits.createdAt))
        .for('update')  // Row-level lock - prevents concurrent credit updates
        .limit(1);

      if (!activeCredit) {
        throw new Error('لا يوجد رصيد نشط متاح للناشر');
      }

      // Re-validate credit balance inside the locked transaction
      // (الباقة المفتوحة لا تُقيَّد برصيد)
      if (!activeCredit.isUnlimited && activeCredit.remainingCredits < 1) {
        throw new Error('رصيد الناشر غير كافٍ');
      }

      // Step 3: Update article to published (within transaction)
      const [publishedArticle] = await tx
        .update(articles)
        .set({
          status: 'published',
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(articles.id, articleId))
        .returning();

      // Step 4: Deduct credit (within transaction)
      // الباقة المفتوحة: نُحصي الاستخدام للتقارير دون إنقاص الرصيد
      const creditsBefore = activeCredit.remainingCredits;
      const creditsAfter = activeCredit.isUnlimited ? creditsBefore : creditsBefore - 1;

      await tx
        .update(publisherCredits)
        .set({
          usedCredits: activeCredit.usedCredits + 1,
          remainingCredits: creditsAfter,
          updatedAt: new Date(),
        })
        .where(eq(publisherCredits.id, activeCredit.id));

      // Step 5: Create credit log (within transaction)
      await tx
        .insert(publisherCreditLogs)
        .values({
          publisherId,
          creditPackageId: activeCredit.id,
          articleId,
          actionType: 'credit_used',
          creditsBefore,
          creditsChanged: activeCredit.isUnlimited ? 0 : -1,
          creditsAfter,
          performedBy,
          notes: activeCredit.isUnlimited
            ? `نشر خبر ضمن باقة مفتوحة: ${article.title}`
            : `تم خصم رصيد مقابل نشر خبر: ${article.title}`,
        });

      // If we reach here, all operations succeeded
      // Transaction will commit automatically
      return publishedArticle;
    });
  }

  /**
   * CRITICAL: Update publisher article with security checks
   * Verifies ownership AND draft status before allowing updates
   */
  async updatePublisherArticle(
    articleId: string,
    publisherId: string,
    authorId: string,
    updates: Partial<InsertArticle>
  ): Promise<Article> {
    // Get publisher info to verify ownership
    const publisher = await this.getPublisher(publisherId);
    if (!publisher) {
      throw new Error('الناشر غير موجود');
    }

    // Security Check 1: Verify ownership (publisher's userId must match article's authorId)
    if (publisher.userId !== authorId) {
      throw new Error('غير مسموح: المقال لا ينتمي إلى هذا الناشر');
    }

    // Get current article to check status
    const [currentArticle] = await db
      .select()
      .from(articles)
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.authorId, authorId)  // Ownership check at DB level
        )
      )
      .limit(1);

    if (!currentArticle) {
      throw new Error('المقال غير موجود أو غير مسموح بالتعديل');
    }

    // Security Check 2: Verify article is still in draft status
    if (currentArticle.status !== 'draft') {
      throw new Error('غير مسموح: يمكن تعديل المقالات في حالة المسودة فقط');
    }

    // Perform update with combined security checks
    const result = await db
      .update(articles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(articles.id, articleId),
          eq(articles.authorId, authorId),  // Ownership check
          eq(articles.status, 'draft')       // Status check
        )
      )
      .returning();

    // Check if any rows were affected (0 rows = conditions failed)
    if (result.length === 0) {
      throw new Error('لم يتم العثور على المقال أو لا يمكن تعديله');
    }

    return result[0];
  }

  // ============================================
  // iFox Operations - عمليات آي فوكس
  // ============================================

  // iFox Articles Management
  async listIFoxArticles(params: {
    categorySlug?: string;
    status?: 'draft' | 'published' | 'scheduled' | 'archived';
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<{ articles: ArticleWithDetails[], total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const offset = (page - 1) * limit;
    
    // iFox category slugs - these are the 5 official iFox categories
    const IFOX_CATEGORY_SLUGS = ['ai-news', 'ai-insights', 'ai-opinions', 'ai-tools', 'ai-voice'];
    
    // Get iFox category IDs from database
    const ifoxCategories = await db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(inArray(categories.slug, IFOX_CATEGORY_SLUGS));
    
    const ifoxCategoryIds = ifoxCategories.map(c => c.id);
    
    if (ifoxCategoryIds.length === 0) {
      // No iFox categories found
      return { articles: [], total: 0 };
    }
    
    // Build base conditions for articles
    const baseConditions: any[] = [
      inArray(articles.categoryId, ifoxCategoryIds),
      eq(articles.aiGenerated, true)  // iFox = AI-generated only
    ];
    
    // Additional filters
    if (params.status) {
      baseConditions.push(eq(articles.status, params.status));
    }
    
    if (params.search) {
      baseConditions.push(
        or(
          sql`${articles.title} ILIKE ${`%${params.search}%`}`,
          sql`${articles.excerpt} ILIKE ${`%${params.search}%`}`
        )
      );
    }
    
    // Create reporter alias for reporter field
    const reporterAlias = aliasedTable(users, 'reporter');
    
    // Build queries based on whether we need specific category filtering
    let totalCount: number;
    let articlesList: ArticleWithDetails[];
    
    if (params.categorySlug) {
      // Filter by specific iFox category
      const [countResult, articlesResult] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .where(and(...baseConditions, eq(categories.slug, params.categorySlug))),
        db
          .select({
            article: articleCardSelect,
            category: categoryBasicSelect,
            author: userPublicSelect,
            reporter: reporterPublicSelect(reporterAlias),
          })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .leftJoin(users, eq(articles.authorId, users.id))
          .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
          .where(and(...baseConditions, eq(categories.slug, params.categorySlug)))
          .orderBy(desc(articles.createdAt))
          .limit(limit)
          .offset(offset)
      ]);
      
      totalCount = countResult[0]?.count ?? 0;
      articlesList = articlesResult.map(row => ({
        ...row.article,
        category: row.category || undefined,
        author: row.reporter || row.author || undefined,
      })) as unknown as ArticleWithDetails[];
    } else {
      // All iFox articles across all 5 categories
      const [countResult, articlesResult] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(articles)
          .where(and(...baseConditions)),
        db
          .select({
            article: articleCardSelect,
            category: categoryBasicSelect,
            author: userPublicSelect,
            reporter: reporterPublicSelect(reporterAlias),
          })
          .from(articles)
          .leftJoin(categories, eq(articles.categoryId, categories.id))
          .leftJoin(users, eq(articles.authorId, users.id))
          .leftJoin(reporterAlias, eq(articles.reporterId, reporterAlias.id))
          .where(and(...baseConditions))
          .orderBy(desc(articles.createdAt))
          .limit(limit)
          .offset(offset)
      ]);
      
      totalCount = countResult[0]?.count ?? 0;
      articlesList = articlesResult.map(row => ({
        ...row.article,
        category: row.category || undefined,
        author: row.reporter || row.author || undefined,
      })) as unknown as ArticleWithDetails[];
    }
    
    return {
      articles: articlesList,
      total: totalCount
    };
  }

  async getIFoxArticleStats(): Promise<{
    byCategory: Record<string, number>;
    byStatus: Record<string, number>;
    scheduled: number;
    total: number;
  }> {
    // Get stats for iFox articles (all articles in the 5 iFox categories)
    const IFOX_CATEGORY_SLUGS = ['ai-news', 'ai-insights', 'ai-opinions', 'ai-tools', 'ai-voice'];
    
    // Get iFox category IDs
    const ifoxCategories = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.slug, IFOX_CATEGORY_SLUGS));
    
    const ifoxCategoryIds = ifoxCategories.map(c => c.id);
    
    if (ifoxCategoryIds.length === 0) {
      return { byCategory: {}, byStatus: {}, scheduled: 0, total: 0 };
    }
    
    const [categoryStats, statusStats, scheduledCount, totalCount] = await Promise.all([
      // By category (join with categories to get slug)
      db
        .select({
          categoryId: articles.categoryId,
          categorySlug: categories.slug,
          count: sql<number>`count(*)::int`
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .where(
          and(
            inArray(articles.categoryId, ifoxCategoryIds),
            eq(articles.aiGenerated, true)
          )
        )
        .groupBy(articles.categoryId, categories.slug),
      
      // By status
      db
        .select({
          status: articles.status,
          count: sql<number>`count(*)::int`
        })
        .from(articles)
        .where(
          and(
            inArray(articles.categoryId, ifoxCategoryIds),
            eq(articles.aiGenerated, true)
          )
        )
        .groupBy(articles.status),
      
      // Scheduled count
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(articles)
        .where(
          and(
            inArray(articles.categoryId, ifoxCategoryIds),
            eq(articles.status, 'scheduled'),
            eq(articles.aiGenerated, true)
          )
        ),
      
      // Total count
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(articles)
        .where(
          and(
            inArray(articles.categoryId, ifoxCategoryIds),
            eq(articles.aiGenerated, true)
          )
        )
    ]);
    
    const byCategory: Record<string, number> = {};
    categoryStats.forEach(stat => {
      if (stat.categorySlug) {
        byCategory[stat.categorySlug] = stat.count;
      }
    });
    
    const byStatus: Record<string, number> = {};
    statusStats.forEach(stat => {
      byStatus[stat.status] = stat.count;
    });
    
    return {
      byCategory,
      byStatus,
      scheduled: scheduledCount[0]?.count ?? 0,
      total: totalCount[0]?.count ?? 0
    };
  }

  async getIFoxArticleMetrics(): Promise<{
    published: number;
    scheduled: number;
    draft: number;
    archived: number;
    total: number;
  }> {
    // Get metrics for iFox articles by status (all articles in the 5 iFox categories)
    const IFOX_CATEGORY_SLUGS = ['ai-news', 'ai-insights', 'ai-opinions', 'ai-tools', 'ai-voice'];
    
    // Get iFox category IDs
    const ifoxCategories = await db
      .select({ id: categories.id })
      .from(categories)
      .where(inArray(categories.slug, IFOX_CATEGORY_SLUGS));
    
    const ifoxCategoryIds = ifoxCategories.map(c => c.id);
    
    if (ifoxCategoryIds.length === 0) {
      return { published: 0, scheduled: 0, draft: 0, archived: 0, total: 0 };
    }
    
    const statusCounts = await db
      .select({
        status: articles.status,
        count: sql<number>`count(*)::int`
      })
      .from(articles)
      .where(
        and(
          inArray(articles.categoryId, ifoxCategoryIds),
          eq(articles.aiGenerated, true)
        )
      )
      .groupBy(articles.status);
    
    const metrics = {
      published: 0,
      scheduled: 0,
      draft: 0,
      archived: 0,
      total: 0
    };
    
    statusCounts.forEach(stat => {
      const count = stat.count;
      metrics.total += count;
      
      if (stat.status === 'published') {
        metrics.published = count;
      } else if (stat.status === 'scheduled') {
        metrics.scheduled = count;
      } else if (stat.status === 'draft') {
        metrics.draft = count;
      } else if (stat.status === 'archived') {
        metrics.archived = count;
      }
    });
    
    return metrics;
  }

  // iFox Settings
  async getIFoxSettings(keys?: string[]): Promise<IfoxSettings[]> {
    if (keys && keys.length > 0) {
      return db
        .select()
        .from(ifoxSettings)
        .where(inArray(ifoxSettings.key, keys));
    }
    return db.select().from(ifoxSettings).limit(100);
  }

  async upsertIFoxSetting(
    key: string,
    value: any,
    description?: string,
    userId?: string
  ): Promise<IfoxSettings> {
    const [setting] = await db
      .insert(ifoxSettings)
      .values({
        key,
        value: JSON.stringify(value),
        description,
        updatedBy: userId
      })
      .onConflictDoUpdate({
        target: ifoxSettings.key,
        set: {
          value: JSON.stringify(value),
          description,
          updatedBy: userId,
          updatedAt: new Date()
        }
      })
      .returning();
    
    return setting;
  }

  async deleteIFoxSetting(key: string): Promise<void> {
    await db.delete(ifoxSettings).where(eq(ifoxSettings.key, key));
  }

  // Category Settings
  async getIFoxCategorySettings(categorySlug?: string): Promise<IfoxCategorySettings[]> {
    if (categorySlug) {
      return db
        .select()
        .from(ifoxCategorySettings)
        .where(eq(ifoxCategorySettings.categorySlug, categorySlug));
    }
    return db.select().from(ifoxCategorySettings).limit(200);
  }

  async upsertIFoxCategorySettings(data: InsertIfoxCategorySettings): Promise<IfoxCategorySettings> {
    const [settings] = await db
      .insert(ifoxCategorySettings)
      .values(data)
      .onConflictDoUpdate({
        target: ifoxCategorySettings.categorySlug,
        set: {
          ...data,
          updatedAt: new Date()
        }
      })
      .returning();
    
    return settings;
  }

  // iFox Media
  async createIFoxMedia(data: InsertIfoxMedia): Promise<IfoxMedia> {
    const [media] = await db
      .insert(ifoxMedia)
      .values(data)
      .returning();
    
    return media;
  }

  async listIFoxMedia(params: {
    type?: string;
    categorySlug?: string;
    page?: number;
    limit?: number;
  }): Promise<{ media: IfoxMedia[], total: number }> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 10;
    const offset = (page - 1) * limit;
    
    const conditions = [];
    
    if (params.type) {
      conditions.push(eq(ifoxMedia.type, params.type));
    }
    
    if (params.categorySlug) {
      conditions.push(eq(ifoxMedia.categorySlug, params.categorySlug));
    }
    
    const [totalCountResult, mediaList] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(ifoxMedia)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
      db
        .select()
        .from(ifoxMedia)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(ifoxMedia.uploadedAt))
        .limit(limit)
        .offset(offset)
    ]);
    
    return {
      media: mediaList,
      total: totalCountResult[0]?.count ?? 0
    };
  }

  async deleteIFoxMedia(id: number): Promise<void> {
    await db.delete(ifoxMedia).where(eq(ifoxMedia.id, id));
  }

  // iFox Schedule
  async createIFoxSchedule(data: InsertIfoxSchedule): Promise<IfoxSchedule> {
    const [schedule] = await db
      .insert(ifoxSchedule)
      .values(data)
      .returning();
    
    return schedule;
  }

  async updateIFoxSchedule(id: number, data: Partial<InsertIfoxSchedule>): Promise<IfoxSchedule> {
    const [schedule] = await db
      .update(ifoxSchedule)
      .set({
        ...data,
        updatedAt: new Date()
      } as any)
      .where(eq(ifoxSchedule.id, id))
      .returning();
    
    if (!schedule) {
      throw new Error('لم يتم العثور على الجدولة');
    }
    
    return schedule;
  }

  async listIFoxScheduled(params: {
    status?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<IfoxSchedule[]> {
    const conditions = [];
    
    if (params.status) {
      conditions.push(eq(ifoxSchedule.status, params.status));
    }
    
    if (params.fromDate) {
      conditions.push(gte(ifoxSchedule.scheduledAt, params.fromDate));
    }
    
    if (params.toDate) {
      conditions.push(lte(ifoxSchedule.scheduledAt, params.toDate));
    }
    
    return db
      .select()
      .from(ifoxSchedule)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(ifoxSchedule.scheduledAt));
  }

  async deleteIFoxSchedule(id: number): Promise<void> {
    await db.delete(ifoxSchedule).where(eq(ifoxSchedule.id, id));
  }

  async processScheduledPublishing(): Promise<{ published: number; failed: number }> {
    const now = new Date();
    let published = 0;
    let failed = 0;
    
    // Get all pending scheduled items that are due
    const dueSchedules = await db
      .select()
      .from(ifoxSchedule)
      .where(
        and(
          eq(ifoxSchedule.status, 'pending'),
          lte(ifoxSchedule.scheduledAt, now)
        )
      );
    
    for (const schedule of dueSchedules) {
      try {
        // Update the related article status to published
        await db
          .update(articles)
          .set({
            status: 'published',
            publishedAt: now,
            updatedAt: now
          })
          .where(eq(articles.id, schedule.articleId));
        
        // Update schedule status to completed
        await db
          .update(ifoxSchedule)
          .set({
            status: 'completed',
            executedAt: now,
            updatedAt: now
          } as any)
          .where(eq(ifoxSchedule.id, schedule.id));
        
        published++;
      } catch (error) {
        // Update schedule status to failed
        await db
          .update(ifoxSchedule)
          .set({
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: now
          } as any)
          .where(eq(ifoxSchedule.id, schedule.id));
        
        failed++;
      }
    }
    
    return { published, failed };
  }

  // iFox Analytics
  async recordIFoxAnalytics(data: InsertIfoxAnalytics[]): Promise<void> {
    if (data.length === 0) return;
    
    await db.insert(ifoxAnalytics).values(data as any);
  }

  async getIFoxAnalytics(params: {
    categorySlug?: string;
    fromDate: Date;
    toDate: Date;
    metrics?: string[];
  }): Promise<IfoxAnalytics[]> {
    const conditions = [];
    
    if (params.categorySlug) {
      conditions.push(eq(ifoxAnalytics.categorySlug, params.categorySlug));
    }
    
    conditions.push(gte(ifoxAnalytics.date, params.fromDate as any));
    conditions.push(lte(ifoxAnalytics.date, params.toDate as any));
    
    if (params.metrics && params.metrics.length > 0) {
      conditions.push(inArray(ifoxAnalytics.metric, params.metrics));
    }
    
    return db
      .select()
      .from(ifoxAnalytics)
      .where(and(...conditions))
      .orderBy(desc(ifoxAnalytics.date));
  }

  async getIFoxAnalyticsSummary(categorySlug?: string): Promise<{
    totalViews: number;
    totalEngagement: number;
    topCategories: { slug: string; views: number }[];
    trend: 'up' | 'down' | 'stable';
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const conditions = [];
    if (categorySlug) {
      conditions.push(eq(ifoxAnalytics.categorySlug, categorySlug));
    }
    
    // Get current period stats
    const currentPeriodConditions = [
      ...conditions,
      gte(ifoxAnalytics.date, thirtyDaysAgo as any)
    ];
    
    const currentStats = await db
      .select({
        metric: ifoxAnalytics.metric,
        total: sql<number>`sum(value)::int`
      })
      .from(ifoxAnalytics)
      .where(and(...currentPeriodConditions))
      .groupBy(ifoxAnalytics.metric);
    
    // Get previous period stats for trend
    const previousPeriodConditions = [
      ...conditions,
      gte(ifoxAnalytics.date, sixtyDaysAgo as any),
      lt(ifoxAnalytics.date, thirtyDaysAgo as any)
    ];
    
    const previousStats = await db
      .select({
        metric: ifoxAnalytics.metric,
        total: sql<number>`sum(value)::int`
      })
      .from(ifoxAnalytics)
      .where(and(...previousPeriodConditions))
      .groupBy(ifoxAnalytics.metric);
    
    // Get top categories by views
    const topCategoriesResult = await db
      .select({
        slug: ifoxAnalytics.categorySlug,
        views: sql<number>`sum(value)::int`
      })
      .from(ifoxAnalytics)
      .where(
        and(
          eq(ifoxAnalytics.metric, 'views'),
          gte(ifoxAnalytics.date, thirtyDaysAgo as any)
        )
      )
      .groupBy(ifoxAnalytics.categorySlug)
      .orderBy(desc(sql`sum(value)`))
      .limit(5);
    
    const currentViews = currentStats.find(s => s.metric === 'views')?.total || 0;
    const currentEngagement = currentStats.find(s => s.metric === 'engagement')?.total || 0;
    const previousViews = previousStats.find(s => s.metric === 'views')?.total || 0;
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (previousViews > 0) {
      const changePercentage = ((currentViews - previousViews) / previousViews) * 100;
      if (changePercentage > 10) trend = 'up';
      else if (changePercentage < -10) trend = 'down';
    }
    
    return {
      totalViews: currentViews,
      totalEngagement: currentEngagement,
      topCategories: topCategoriesResult,
      trend
    };
  }

  // iFox Category Mapping
  async getIFoxCategoryMap(): Promise<Record<string, string>> {
    // Check cache first
    if (this.ifoxCategoryMapCache && (Date.now() - this.ifoxCategoryMapCacheTime < this.CATEGORY_MAP_CACHE_TTL)) {
      return this.ifoxCategoryMapCache;
    }
    
    const IFOX_CATEGORY_SLUGS = ['ai-news', 'ai-insights', 'ai-opinions', 'ai-tools', 'ai-voice'];
    
    const categoriesData = await db
      .select({ id: categories.id, slug: categories.slug })
      .from(categories)
      .where(
        and(
          inArray(categories.slug, IFOX_CATEGORY_SLUGS),
          ne(categories.status, 'deleted')
        )
      );
    
    const mapping: Record<string, string> = {};
    categoriesData.forEach(cat => {
      mapping[cat.slug] = cat.id;
    });
    
    // Cache for 1 hour
    this.ifoxCategoryMapCache = mapping;
    this.ifoxCategoryMapCacheTime = Date.now();
    
    return mapping;
  }
  
  // ============================================
  // AI Scheduled Tasks Operations - مهام AI المجدولة
  // ============================================
  
  async createAiTask(task: InsertAiScheduledTask): Promise<AiScheduledTask> {
    const [created] = await db.insert(aiScheduledTasks).values(task).returning();
    return created;
  }
  
  async getAiTask(id: string): Promise<AiScheduledTask | undefined> {
    const [task] = await db
      .select()
      .from(aiScheduledTasks)
      .where(eq(aiScheduledTasks.id, id));
    return task;
  }
  
  async listAiTasks(params: {
    status?: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    page?: number;
    limit?: number;
    categoryId?: string;
    createdBy?: string;
  }): Promise<{ tasks: AiScheduledTask[]; total: number }> {
    const conditions = [];
    
    if (params.status) {
      conditions.push(eq(aiScheduledTasks.status, params.status));
    }
    
    if (params.categoryId) {
      conditions.push(eq(aiScheduledTasks.categoryId, params.categoryId));
    }
    
    if (params.createdBy) {
      conditions.push(eq(aiScheduledTasks.createdBy, params.createdBy));
    }
    
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;
    
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiScheduledTasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    const tasks = await db
      .select()
      .from(aiScheduledTasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(aiScheduledTasks.scheduledAt))
      .limit(limit)
      .offset(offset);
    
    return {
      tasks,
      total: totalCount || 0,
    };
  }
  
  async updateAiTask(id: string, updates: Partial<InsertAiScheduledTask>): Promise<AiScheduledTask> {
    const [updated] = await db
      .update(aiScheduledTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(aiScheduledTasks.id, id))
      .returning();
    return updated;
  }
  
  async markAiTaskProcessing(id: string): Promise<AiScheduledTask | null> {
    // Atomically mark task as processing ONLY if it's currently pending
    // This prevents race conditions when multiple workers try to claim the same task
    const [updated] = await db
      .update(aiScheduledTasks)
      .set({ 
        status: 'processing' as const, 
        executedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(
        and(
          eq(aiScheduledTasks.id, id),
          eq(aiScheduledTasks.status, 'pending' as const)
        )
      )
      .returning();
    return updated || null;
  }
  
  async updateAiTaskExecution(id: string, updates: {
    status: 'processing' | 'completed' | 'failed' | 'cancelled';
    executedAt?: Date;
    generatedArticleId?: string;
    generatedImageUrl?: string;
    executionLogs?: any;
    errorMessage?: string;
    executionTimeMs?: number;
    tokensUsed?: number;
    generationCost?: number;
  }, requiredCurrentStatus?: 'pending' | 'processing'): Promise<AiScheduledTask | null> {
    // If requiredCurrentStatus is provided, only update if current status matches
    // This prevents race conditions when multiple processes try to update the same task
    const whereConditions = requiredCurrentStatus
      ? and(
          eq(aiScheduledTasks.id, id),
          eq(aiScheduledTasks.status, requiredCurrentStatus)
        )
      : eq(aiScheduledTasks.id, id);
      
    const [updated] = await db
      .update(aiScheduledTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(whereConditions)
      .returning();
    return updated || null;
  }
  
  async deleteAiTask(id: string): Promise<void> {
    await db.delete(aiScheduledTasks).where(eq(aiScheduledTasks.id, id));
  }
  
  async getPendingAiTasks(): Promise<AiScheduledTask[]> {
    const now = new Date();
    return db
      .select()
      .from(aiScheduledTasks)
      .where(
        and(
          eq(aiScheduledTasks.status, 'pending'),
          lte(aiScheduledTasks.scheduledAt, now)
        )
      )
      .orderBy(asc(aiScheduledTasks.scheduledAt));
  }
  
  async getAiTaskStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalCost: number;
    averageExecutionTime: number;
  }> {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
        processing: sql<number>`count(*) filter (where status = 'processing')::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        failed: sql<number>`count(*) filter (where status = 'failed')::int`,
        totalCost: sql<number>`coalesce(sum(generation_cost), 0)::float`,
        averageExecutionTime: sql<number>`coalesce(avg(execution_time_ms), 0)::int`,
      })
      .from(aiScheduledTasks);
    
    return {
      total: stats?.total || 0,
      pending: stats?.pending || 0,
      processing: stats?.processing || 0,
      completed: stats?.completed || 0,
      failed: stats?.failed || 0,
      totalCost: stats?.totalCost || 0,
      averageExecutionTime: stats?.averageExecutionTime || 0,
    };
  }
  
  // ============================================
  // iFox AI Management System - Phase 2
  // Comprehensive AI-powered newsroom management
  // ============================================
  
  // ============================================
  // 1. AI Preferences & Settings - Central configuration for AI behavior
  // ============================================
  
  /**
   * Create or update AI preferences (singleton pattern - only one active preferences record)
   */
  async createOrUpdateIfoxAiPreferences(data: Partial<InsertIfoxAiPreferences>): Promise<IfoxAiPreferences> {
    // Check if there's an existing active preference
    const [existing] = await db
      .select()
      .from(ifoxAiPreferences)
      .where(eq(ifoxAiPreferences.isActive, true))
      .limit(1);
    
    if (existing) {
      // Update existing preferences
      const [updated] = await db
        .update(ifoxAiPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ifoxAiPreferences.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new preferences
      const [created] = await db
        .insert(ifoxAiPreferences)
        .values({ ...data, isActive: true })
        .returning();
      return created;
    }
  }
  
  /**
   * Get current AI preferences (regardless of active status)
   */
  async getIfoxAiPreferences(): Promise<IfoxAiPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(ifoxAiPreferences)
      .orderBy(desc(ifoxAiPreferences.createdAt))
      .limit(1);
    return prefs;
  }
  
  /**
   * Get active AI preferences only
   */
  async getActiveIfoxAiPreferences(): Promise<IfoxAiPreferences | undefined> {
    const [prefs] = await db
      .select()
      .from(ifoxAiPreferences)
      .where(eq(ifoxAiPreferences.isActive, true))
      .limit(1);
    return prefs;
  }
  
  // ============================================
  // 2. Content Templates Library - Reusable AI content templates
  // ============================================
  
  /**
   * Create a new content template
   */
  async createIfoxContentTemplate(data: InsertIfoxContentTemplate): Promise<IfoxContentTemplate> {
    const [created] = await db
      .insert(ifoxContentTemplates)
      .values(data)
      .returning();
    return created;
  }
  
  /**
   * List content templates with filters and pagination
   */
  async listIfoxContentTemplates(filters?: {
    templateType?: string;
    language?: string;
    isActive?: boolean;
    createdBy?: string;
    page?: number;
    limit?: number;
  }): Promise<{ templates: IfoxContentTemplate[]; total: number }> {
    const conditions = [];
    
    if (filters?.templateType) {
      conditions.push(eq(ifoxContentTemplates.templateType, filters.templateType));
    }
    
    if (filters?.language) {
      conditions.push(eq(ifoxContentTemplates.language, filters.language));
    }
    
    if (filters?.isActive !== undefined) {
      conditions.push(eq(ifoxContentTemplates.isActive, filters.isActive));
    }
    
    if (filters?.createdBy) {
      conditions.push(eq(ifoxContentTemplates.createdBy, filters.createdBy));
    }
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ifoxContentTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Get templates
    const templates = await db
      .select()
      .from(ifoxContentTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ifoxContentTemplates.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      templates,
      total: totalCount || 0,
    };
  }
  
  /**
   * Get a single content template by ID
   */
  async getIfoxContentTemplate(id: string): Promise<IfoxContentTemplate | undefined> {
    const [template] = await db
      .select()
      .from(ifoxContentTemplates)
      .where(eq(ifoxContentTemplates.id, id));
    return template;
  }
  
  /**
   * Update a content template
   */
  async updateIfoxContentTemplate(id: string, data: Partial<InsertIfoxContentTemplate>): Promise<IfoxContentTemplate> {
    const [updated] = await db
      .update(ifoxContentTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ifoxContentTemplates.id, id))
      .returning();
    return updated;
  }
  
  /**
   * Delete a content template
   */
  async deleteIfoxContentTemplate(id: string): Promise<void> {
    await db.delete(ifoxContentTemplates).where(eq(ifoxContentTemplates.id, id));
  }
  
  /**
   * Increment template usage counter
   */
  async incrementTemplateUsage(id: string): Promise<IfoxContentTemplate> {
    const [updated] = await db
      .update(ifoxContentTemplates)
      .set({ 
        usageCount: sql`${ifoxContentTemplates.usageCount} + 1`,
        updatedAt: new Date()
      })
      .where(eq(ifoxContentTemplates.id, id))
      .returning();
    return updated;
  }
  
  // ============================================
  // 3. Automated Workflow Rules - Smart automation rules
  // ============================================
  
  /**
   * Create a new workflow rule
   */
  async createIfoxWorkflowRule(data: InsertIfoxWorkflowRule): Promise<IfoxWorkflowRule> {
    const [created] = await db
      .insert(ifoxWorkflowRules)
      .values(data)
      .returning();
    return created;
  }
  
  /**
   * List workflow rules with filters and pagination
   */
  async listIfoxWorkflowRules(filters?: {
    ruleType?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ rules: IfoxWorkflowRule[]; total: number }> {
    const conditions = [];
    
    if (filters?.ruleType) {
      conditions.push(eq(ifoxWorkflowRules.ruleType, filters.ruleType));
    }
    
    if (filters?.isActive !== undefined) {
      conditions.push(eq(ifoxWorkflowRules.isActive, filters.isActive));
    }
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ifoxWorkflowRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Get rules
    const rules = await db
      .select()
      .from(ifoxWorkflowRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ifoxWorkflowRules.priority), desc(ifoxWorkflowRules.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      rules,
      total: totalCount || 0,
    };
  }
  
  /**
   * Get a single workflow rule by ID
   */
  async getIfoxWorkflowRule(id: string): Promise<IfoxWorkflowRule | undefined> {
    const [rule] = await db
      .select()
      .from(ifoxWorkflowRules)
      .where(eq(ifoxWorkflowRules.id, id));
    return rule;
  }
  
  /**
   * Update a workflow rule
   */
  async updateIfoxWorkflowRule(id: string, data: Partial<InsertIfoxWorkflowRule>): Promise<IfoxWorkflowRule> {
    const [updated] = await db
      .update(ifoxWorkflowRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ifoxWorkflowRules.id, id))
      .returning();
    return updated;
  }
  
  /**
   * Delete a workflow rule
   */
  async deleteIfoxWorkflowRule(id: string): Promise<void> {
    await db.delete(ifoxWorkflowRules).where(eq(ifoxWorkflowRules.id, id));
  }
  
  /**
   * Update workflow rule execution counters
   */
  async updateIfoxWorkflowRuleExecution(id: string, success: boolean): Promise<IfoxWorkflowRule> {
    const [updated] = await db
      .update(ifoxWorkflowRules)
      .set({
        executionCount: sql`${ifoxWorkflowRules.executionCount} + 1`,
        successCount: success ? sql`${ifoxWorkflowRules.successCount} + 1` : undefined,
        failureCount: !success ? sql`${ifoxWorkflowRules.failureCount} + 1` : undefined,
        lastExecutedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ifoxWorkflowRules.id, id))
      .returning();
    return updated;
  }
  
  // ============================================
  // 4. Quality Checks - AI-powered quality control logs
  // ============================================
  
  /**
   * Create a new quality check record
   */
  async createIfoxQualityCheck(data: InsertIfoxQualityCheck): Promise<IfoxQualityCheck> {
    const [created] = await db
      .insert(ifoxQualityChecks)
      .values(data)
      .returning();
    return created;
  }
  
  /**
   * List quality checks with filters and pagination
   */
  async listIfoxQualityChecks(filters?: {
    articleId?: string;
    taskId?: string;
    passed?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ checks: IfoxQualityCheck[]; total: number }> {
    const conditions = [];
    
    if (filters?.articleId) {
      conditions.push(eq(ifoxQualityChecks.articleId, filters.articleId));
    }
    
    if (filters?.taskId) {
      conditions.push(eq(ifoxQualityChecks.taskId, filters.taskId));
    }
    
    if (filters?.passed !== undefined) {
      conditions.push(eq(ifoxQualityChecks.passed, filters.passed));
    }
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ifoxQualityChecks)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Get checks
    const checks = await db
      .select()
      .from(ifoxQualityChecks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ifoxQualityChecks.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      checks,
      total: totalCount || 0,
    };
  }
  
  /**
   * Get a single quality check by ID
   */
  async getIfoxQualityCheck(id: string): Promise<IfoxQualityCheck | undefined> {
    const [check] = await db
      .select()
      .from(ifoxQualityChecks)
      .where(eq(ifoxQualityChecks.id, id));
    return check;
  }
  
  /**
   * Update quality check with human review
   */
  async updateIfoxQualityCheckHumanReview(id: string, data: {
    humanReviewStatus: 'pending' | 'approved' | 'rejected';
    reviewedBy: string;
    reviewNotes?: string;
  }): Promise<IfoxQualityCheck> {
    const [updated] = await db
      .update(ifoxQualityChecks)
      .set({
        humanReviewStatus: data.humanReviewStatus,
        reviewedBy: data.reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: data.reviewNotes,
      })
      .where(eq(ifoxQualityChecks.id, id))
      .returning();
    return updated;
  }
  
  // ============================================
  // 5. Performance Metrics - Track AI content performance
  // ============================================
  
  /**
   * Create or update performance metric for an article
   */
  async createOrUpdateIfoxPerformanceMetric(articleId: string, data: Partial<InsertIfoxPerformanceMetric>): Promise<IfoxPerformanceMetric> {
    // Check if metric exists for this article
    const [existing] = await db
      .select()
      .from(ifoxPerformanceMetrics)
      .where(eq(ifoxPerformanceMetrics.articleId, articleId))
      .limit(1);
    
    if (existing) {
      // Update existing metric
      const [updated] = await db
        .update(ifoxPerformanceMetrics)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ifoxPerformanceMetrics.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new metric
      const [created] = await db
        .insert(ifoxPerformanceMetrics)
        .values({ articleId, ...data } as InsertIfoxPerformanceMetric)
        .returning();
      return created;
    }
  }
  
  /**
   * Get performance metric for a specific article
   */
  async getIfoxPerformanceMetric(articleId: string): Promise<IfoxPerformanceMetric | undefined> {
    const [metric] = await db
      .select()
      .from(ifoxPerformanceMetrics)
      .where(eq(ifoxPerformanceMetrics.articleId, articleId));
    return metric;
  }
  
  /**
   * List performance metrics with filters and pagination
   */
  async listIfoxPerformanceMetrics(filters?: {
    isAiGenerated?: boolean;
    publishedAtFrom?: Date;
    publishedAtTo?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ metrics: IfoxPerformanceMetric[]; total: number }> {
    const conditions = [];
    
    if (filters?.isAiGenerated !== undefined) {
      conditions.push(eq(ifoxPerformanceMetrics.isAiGenerated, filters.isAiGenerated));
    }
    
    if (filters?.publishedAtFrom) {
      conditions.push(gte(ifoxPerformanceMetrics.publishedAt, filters.publishedAtFrom));
    }
    
    if (filters?.publishedAtTo) {
      conditions.push(lte(ifoxPerformanceMetrics.publishedAt, filters.publishedAtTo));
    }
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ifoxPerformanceMetrics)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Get metrics
    const metrics = await db
      .select()
      .from(ifoxPerformanceMetrics)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ifoxPerformanceMetrics.publishedAt))
      .limit(limit)
      .offset(offset);
    
    return {
      metrics,
      total: totalCount || 0,
    };
  }
  
  /**
   * Get overall performance statistics
   */
  async getIfoxPerformanceStats(): Promise<{
    totalArticles: number;
    aiGeneratedArticles: number;
    averageViewCount: number;
    averageEngagement: number;
    totalRevenue: number;
    averageROI: number;
  }> {
    const [stats] = await db
      .select({
        totalArticles: sql<number>`count(*)::int`,
        aiGeneratedArticles: sql<number>`count(*) filter (where is_ai_generated = true)::int`,
        averageViewCount: sql<number>`coalesce(avg(view_count), 0)::int`,
        averageEngagement: sql<number>`coalesce(avg((share_count + comment_count + bookmark_count)::float), 0)::float`,
        totalRevenue: sql<number>`coalesce(sum(estimated_revenue), 0)::float`,
        averageROI: sql<number>`coalesce(avg(roi), 0)::float`,
      })
      .from(ifoxPerformanceMetrics);
    
    return {
      totalArticles: stats?.totalArticles || 0,
      aiGeneratedArticles: stats?.aiGeneratedArticles || 0,
      averageViewCount: stats?.averageViewCount || 0,
      averageEngagement: stats?.averageEngagement || 0,
      totalRevenue: stats?.totalRevenue || 0,
      averageROI: stats?.averageROI || 0,
    };
  }
  
  /**
   * Get performance metrics from actual AI-generated articles
   * This reads from the articles table directly for real-time analytics
   */
  async getAiGeneratedArticlesMetrics(filters: {
    publishedAtFrom?: Date;
    publishedAtTo?: Date;
  }): Promise<Array<{
    id: string;
    qualityScore: number | null;
    bookmarkCount: number | null;
    viewCount: number | null;
    shareCount: number | null;
    commentCount: number | null;
  }>> {
    const conditions = [
      eq(articles.source, 'ai'), // AI-generated articles only
      eq(articles.status, 'published'), // Published only
    ];
    
    if (filters.publishedAtFrom) {
      conditions.push(gte(articles.publishedAt, filters.publishedAtFrom));
    }
    
    if (filters.publishedAtTo) {
      conditions.push(lte(articles.publishedAt, filters.publishedAtTo));
    }
    
    const results = await db
      .select({
        id: articles.id,
        qualityScore: (articles as any).qualityScore,
        bookmarkCount: (articles as any).bookmarkCount,
        viewCount: (articles as any).viewCount,
        shareCount: (articles as any).shareCount,
        commentCount: (articles as any).commentCount,
      })
      .from(articles)
      .where(and(...conditions));
    
    return results;
  }
  
  // ============================================
  // 6. Budget Tracking - Monitor API usage and costs
  // ============================================
  
  /**
   * Create or update budget tracking for a period
   */
  async createOrUpdateIfoxBudgetTracking(period: string, data: Partial<InsertIfoxBudgetTracking>): Promise<IfoxBudgetTracking> {
    // Check if budget exists for this period
    const [existing] = await db
      .select()
      .from(ifoxBudgetTracking)
      .where(eq(ifoxBudgetTracking.period, period))
      .orderBy(desc(ifoxBudgetTracking.createdAt))
      .limit(1);
    
    if (existing && existing.periodEnd && existing.periodEnd > new Date()) {
      // Update existing budget if period is still active
      const [updated] = await db
        .update(ifoxBudgetTracking)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(ifoxBudgetTracking.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new budget period
      const [created] = await db
        .insert(ifoxBudgetTracking)
        .values({ period, ...data } as InsertIfoxBudgetTracking)
        .returning();
      return created;
    }
  }
  
  /**
   * Get current period budget
   */
  async getCurrentPeriodBudget(period: string): Promise<IfoxBudgetTracking | undefined> {
    const now = new Date();
    const [budget] = await db
      .select()
      .from(ifoxBudgetTracking)
      .where(
        and(
          eq(ifoxBudgetTracking.period, period),
          lte(ifoxBudgetTracking.periodStart, now),
          gte(ifoxBudgetTracking.periodEnd, now)
        )
      )
      .limit(1);
    return budget;
  }
  
  /**
   * List budget tracking records with filters
   */
  async listIfoxBudgetTracking(filters?: {
    period?: string;
    fromDate?: Date;
    toDate?: Date;
    isOverBudget?: boolean;
  }): Promise<IfoxBudgetTracking[]> {
    const conditions = [];
    
    if (filters?.period) {
      conditions.push(eq(ifoxBudgetTracking.period, filters.period));
    }
    
    if (filters?.fromDate) {
      conditions.push(gte(ifoxBudgetTracking.periodStart, filters.fromDate));
    }
    
    if (filters?.toDate) {
      conditions.push(lte(ifoxBudgetTracking.periodEnd, filters.toDate));
    }
    
    if (filters?.isOverBudget !== undefined) {
      conditions.push(eq(ifoxBudgetTracking.isOverBudget, filters.isOverBudget));
    }
    
    return db
      .select()
      .from(ifoxBudgetTracking)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ifoxBudgetTracking.periodStart));
  }
  
  /**
   * Update budget usage with new API call
   */
  async updateBudgetUsage(updates: {
    provider: 'openai' | 'anthropic' | 'gemini' | 'visual-ai';
    apiCalls: number;
    tokens?: number;
    cost: number;
  }): Promise<IfoxBudgetTracking> {
    // Get current monthly budget
    const now = new Date();
    const period = 'monthly';
    
    let [budget] = await db
      .select()
      .from(ifoxBudgetTracking)
      .where(
        and(
          eq(ifoxBudgetTracking.period, period),
          lte(ifoxBudgetTracking.periodStart, now),
          gte(ifoxBudgetTracking.periodEnd, now)
        )
      )
      .limit(1);
    
    // Create new period if doesn't exist
    if (!budget) {
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      
      [budget] = await db
        .insert(ifoxBudgetTracking)
        .values({
          period,
          periodStart,
          periodEnd,
        })
        .returning();
    }
    
    // Update based on provider
    const updateData: any = {
      totalApiCalls: sql`${ifoxBudgetTracking.totalApiCalls} + ${updates.apiCalls}`,
      totalCost: sql`${ifoxBudgetTracking.totalCost} + ${updates.cost}`,
      updatedAt: new Date(),
    };
    
    if (updates.provider === 'openai') {
      updateData.openaiCalls = sql`${ifoxBudgetTracking.openaiCalls} + ${updates.apiCalls}`;
      updateData.openaiCost = sql`${ifoxBudgetTracking.openaiCost} + ${updates.cost}`;
      if (updates.tokens) {
        updateData.openaiTokens = sql`${ifoxBudgetTracking.openaiTokens} + ${updates.tokens}`;
        updateData.totalTokens = sql`${ifoxBudgetTracking.totalTokens} + ${updates.tokens}`;
      }
    } else if (updates.provider === 'anthropic') {
      updateData.anthropicCalls = sql`${ifoxBudgetTracking.anthropicCalls} + ${updates.apiCalls}`;
      updateData.anthropicCost = sql`${ifoxBudgetTracking.anthropicCost} + ${updates.cost}`;
      if (updates.tokens) {
        updateData.anthropicTokens = sql`${ifoxBudgetTracking.anthropicTokens} + ${updates.tokens}`;
        updateData.totalTokens = sql`${ifoxBudgetTracking.totalTokens} + ${updates.tokens}`;
      }
    } else if (updates.provider === 'gemini') {
      updateData.geminiCalls = sql`${ifoxBudgetTracking.geminiCalls} + ${updates.apiCalls}`;
      updateData.geminiCost = sql`${ifoxBudgetTracking.geminiCost} + ${updates.cost}`;
      if (updates.tokens) {
        updateData.geminiTokens = sql`${ifoxBudgetTracking.geminiTokens} + ${updates.tokens}`;
        updateData.totalTokens = sql`${ifoxBudgetTracking.totalTokens} + ${updates.tokens}`;
      }
    } else if (updates.provider === 'visual-ai') {
      updateData.visualAiCalls = sql`${ifoxBudgetTracking.visualAiCalls} + ${updates.apiCalls}`;
      updateData.visualAiCost = sql`${ifoxBudgetTracking.visualAiCost} + ${updates.cost}`;
    }
    
    const [updated] = await db
      .update(ifoxBudgetTracking)
      .set(updateData)
      .where(eq(ifoxBudgetTracking.id, budget.id))
      .returning();
    
    return updated;
  }
  
  // ============================================
  // 7. Strategy Insights - AI-powered content strategy recommendations
  // ============================================
  
  /**
   * Create a new strategy insight
   */
  async createIfoxStrategyInsight(data: InsertIfoxStrategyInsight): Promise<IfoxStrategyInsight> {
    const [created] = await db
      .insert(ifoxStrategyInsights)
      .values(data)
      .returning();
    return created;
  }
  
  /**
   * List strategy insights with filters and pagination
   */
  async listIfoxStrategyInsights(filters?: {
    insightType?: string;
    status?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }): Promise<{ insights: IfoxStrategyInsight[]; total: number }> {
    const conditions = [];
    
    if (filters?.insightType) {
      conditions.push(eq(ifoxStrategyInsights.insightType, filters.insightType));
    }
    
    if (filters?.status) {
      conditions.push(eq(ifoxStrategyInsights.status, filters.status));
    }
    
    if (filters?.priority) {
      conditions.push(eq(ifoxStrategyInsights.priority, filters.priority));
    }
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ifoxStrategyInsights)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Get insights
    const insights = await db
      .select()
      .from(ifoxStrategyInsights)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(ifoxStrategyInsights.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      insights,
      total: totalCount || 0,
    };
  }
  
  /**
   * Get a single strategy insight by ID
   */
  async getIfoxStrategyInsight(id: string): Promise<IfoxStrategyInsight | undefined> {
    const [insight] = await db
      .select()
      .from(ifoxStrategyInsights)
      .where(eq(ifoxStrategyInsights.id, id));
    return insight;
  }
  
  /**
   * Update strategy insight status
   */
  async updateIfoxStrategyInsightStatus(id: string, status: string, implementedBy?: string): Promise<IfoxStrategyInsight> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };
    
    if (status === 'implemented' && implementedBy) {
      updateData.implementedBy = implementedBy;
      updateData.implementedAt = new Date();
    }
    
    const [updated] = await db
      .update(ifoxStrategyInsights)
      .set(updateData)
      .where(eq(ifoxStrategyInsights.id, id))
      .returning();
    return updated;
  }
  
  /**
   * Delete a strategy insight
   */
  async deleteIfoxStrategyInsight(id: string): Promise<void> {
    await db.delete(ifoxStrategyInsights).where(eq(ifoxStrategyInsights.id, id));
  }
  
  // ============================================
  // 8. Editorial Calendar - Smart content planning
  // ============================================
  
  /**
   * Create a new editorial calendar entry
   */
  async createIfoxEditorialCalendarEntry(data: InsertIfoxEditorialCalendar): Promise<IfoxEditorialCalendar> {
    const [created] = await db
      .insert(ifoxEditorialCalendar)
      .values(data as any)
      .returning();
    return created;
  }
  
  /**
   * List editorial calendar entries with filters and pagination
   */
  async listIfoxEditorialCalendar(filters?: {
    scheduledDateFrom?: Date;
    scheduledDateTo?: Date;
    status?: string;
    assignmentType?: string;
    assignedToUser?: string;
    page?: number;
    limit?: number;
  }): Promise<{ entries: IfoxEditorialCalendar[]; total: number }> {
    const conditions = [];
    
    if (filters?.scheduledDateFrom) {
      conditions.push(gte(ifoxEditorialCalendar.scheduledDate, filters.scheduledDateFrom));
    }
    
    if (filters?.scheduledDateTo) {
      conditions.push(lte(ifoxEditorialCalendar.scheduledDate, filters.scheduledDateTo));
    }
    
    if (filters?.status) {
      conditions.push(eq(ifoxEditorialCalendar.status, filters.status));
    }
    
    if (filters?.assignmentType) {
      conditions.push(eq(ifoxEditorialCalendar.assignmentType, filters.assignmentType));
    }
    
    if (filters?.assignedToUser) {
      conditions.push(eq(ifoxEditorialCalendar.assignedToUser, filters.assignedToUser));
    }
    
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;
    
    // Get total count
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ifoxEditorialCalendar)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    
    // Get entries
    const entries = await db
      .select()
      .from(ifoxEditorialCalendar)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(ifoxEditorialCalendar.scheduledDate))
      .limit(limit)
      .offset(offset);
    
    return {
      entries,
      total: totalCount || 0,
    };
  }
  
  /**
   * Get a single editorial calendar entry by ID
   */
  async getIfoxEditorialCalendarEntry(id: string): Promise<IfoxEditorialCalendar | undefined> {
    const [entry] = await db
      .select()
      .from(ifoxEditorialCalendar)
      .where(eq(ifoxEditorialCalendar.id, id));
    return entry;
  }
  
  /**
   * Update an editorial calendar entry
   */
  async updateIfoxEditorialCalendarEntry(id: string, data: Partial<InsertIfoxEditorialCalendar>): Promise<IfoxEditorialCalendar> {
    const [updated] = await db
      .update(ifoxEditorialCalendar)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(ifoxEditorialCalendar.id, id))
      .returning();
    return updated;
  }
  
  /**
   * Delete an editorial calendar entry
   */
  async deleteIfoxEditorialCalendarEntry(id: string): Promise<void> {
    await db.delete(ifoxEditorialCalendar).where(eq(ifoxEditorialCalendar.id, id));
  }
  
  /**
   * Update editorial calendar entry status
   */
  async updateIfoxEditorialCalendarStatus(id: string, status: string, articleId?: string): Promise<IfoxEditorialCalendar> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };
    
    if (status === 'completed' && articleId) {
      updateData.articleId = articleId;
      updateData.actualPublishedAt = new Date();
    }
    
    const [updated] = await db
      .update(ifoxEditorialCalendar)
      .set(updateData)
      .where(eq(ifoxEditorialCalendar.id, id))
      .returning();
    return updated;
  }
  
  // ============================================
  // ADVANCED READER BEHAVIOR ANALYTICS
  // ============================================
  
  async createReadingSession(data: {
    sessionId: string;
    userId?: string;
    deviceType?: string;
    platform?: string;
    browser?: string;
    screenWidth?: number;
    screenHeight?: number;
    referrerDomain?: string;
    referrerUrl?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    landingPage?: string;
    isNewVisitor?: boolean;
    country?: string;
    city?: string;
    language?: string;
  }): Promise<{ id: string }> {
    const [session] = await db
      .insert(readingSessions)
      .values(data)
      .returning({ id: readingSessions.id });
    return session;
  }
  
  async endReadingSession(sessionId: string, data: {
    exitPage?: string;
    totalDurationMs?: number;
    totalPagesViewed?: number;
    totalArticlesRead?: number;
  }): Promise<void> {
    await db
      .update(readingSessions)
      .set({
        endedAt: new Date(),
        ...data,
      })
      .where(eq(readingSessions.sessionId, sessionId));
  }
  
  async recordSectionAnalytic(data: {
    sessionId?: string;
    articleId: string;
    userId?: string;
    sectionIndex: number;
    sectionType?: string;
    paragraphIndex?: number;
    dwellTimeMs?: number;
    scrollDepthStart?: number;
    scrollDepthEnd?: number;
    visibleTimeMs?: number;
    heatScore?: number;
    wasHighlighted?: boolean;
    wasShared?: boolean;
    interactionCount?: number;
  }): Promise<void> {
    await db.insert(sectionAnalytics).values(data);
  }
  
  async recordBatchSectionAnalytics(events: Array<{
    sessionId?: string;
    articleId: string;
    userId?: string;
    sectionIndex: number;
    sectionType?: string;
    paragraphIndex?: number;
    dwellTimeMs?: number;
    scrollDepthStart?: number;
    scrollDepthEnd?: number;
    visibleTimeMs?: number;
    heatScore?: number;
    wasHighlighted?: boolean;
    wasShared?: boolean;
    interactionCount?: number;
  }>): Promise<void> {
    if (events.length === 0) return;
    await db.insert(sectionAnalytics).values(events);
  }
  
  async recordNavigationPath(data: {
    sessionId: string;
    userId?: string;
    fromPageType?: string;
    fromPageId?: string;
    fromArticleId?: string;
    fromCategoryId?: string;
    toPageType: string;
    toPageId?: string;
    toArticleId?: string;
    toCategoryId?: string;
    transitionType?: string;
    dwellTimeOnFromMs?: number;
    scrollDepthOnFrom?: number;
  }): Promise<void> {
    await db.insert(navigationPaths).values(data);
  }
  
  async recordTrafficSource(data: {
    sessionId: string;
    sourceType: string;
    sourceMedium?: string;
    sourceChannel?: string;
    referrerDomain?: string;
    referrerPath?: string;
    searchKeyword?: string;
    socialPlatform?: string;
    campaignName?: string;
    campaignSource?: string;
    articleId?: string;
  }): Promise<void> {
    await db.insert(trafficSources).values(data);
  }
  
  async getAdvancedAnalyticsOverview(range: string): Promise<{
    sessions: {
      total: number;
      uniqueUsers: number;
      newVisitors: number;
      returningVisitors: number;
      avgDuration: number;
      avgPagesPerSession: number;
    };
    engagement: {
      avgScrollDepth: number;
      avgTimeOnPage: number;
      bounceRate: number;
      completionRate: number;
    };
    topArticles: Array<{
      articleId: string;
      title: string;
      views: number;
      avgTimeOnPage: number;
      engagementScore: number;
    }>;
    topCategories: Array<{
      categoryId: string;
      name: string;
      views: number;
      avgEngagement: number;
    }>;
  }> {
    const days = parseInt(range) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Session stats
    const sessionStats = await db
      .select({
        total: sql<number>`count(*)::int`,
        uniqueUsers: sql<number>`count(distinct ${readingSessions.userId})::int`,
        newVisitors: sql<number>`count(case when ${readingSessions.isNewVisitor} = true then 1 end)::int`,
        avgDuration: sql<number>`coalesce(avg(${readingSessions.totalDurationMs}), 0)::int`,
        avgPages: sql<number>`coalesce(avg(${readingSessions.totalPagesViewed}), 0)::float`,
      })
      .from(readingSessions)
      .where(gte(readingSessions.startedAt, startDate));
    
    const stats = sessionStats[0] || { total: 0, uniqueUsers: 0, newVisitors: 0, avgDuration: 0, avgPages: 0 };
    
    // Engagement stats from reading history
    const engagementStats = await db
      .select({
        avgScrollDepth: sql<number>`coalesce(avg(${readingHistory.scrollDepth}), 0)::float`,
        avgTimeOnPage: sql<number>`coalesce(avg(${readingHistory.readDuration}), 0)::int`,
        completionRate: sql<number>`coalesce(avg(${readingHistory.completionRate}), 0)::float`,
      })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, startDate));
    
    const engagement = engagementStats[0] || { avgScrollDepth: 0, avgTimeOnPage: 0, completionRate: 0 };
    
    // Top articles
    const topArticlesData = await db
      .select({
        articleId: readingHistory.articleId,
        title: articles.title,
        views: sql<number>`count(*)::int`,
        avgTimeOnPage: sql<number>`coalesce(avg(${readingHistory.readDuration}), 0)::int`,
        engagementScore: sql<number>`coalesce(avg(${readingHistory.engagementScore}), 0)::float`,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .where(gte(readingHistory.readAt, startDate))
      .groupBy(readingHistory.articleId, articles.title)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    // Top categories
    const topCategoriesData = await db
      .select({
        categoryId: articles.categoryId,
        name: categories.nameAr,
        views: sql<number>`count(*)::int`,
        avgEngagement: sql<number>`coalesce(avg(${readingHistory.engagementScore}), 0)::float`,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(gte(readingHistory.readAt, startDate))
      .groupBy(articles.categoryId, categories.nameAr)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    return {
      sessions: {
        total: stats.total,
        uniqueUsers: stats.uniqueUsers,
        newVisitors: stats.newVisitors,
        returningVisitors: stats.total - stats.newVisitors,
        avgDuration: stats.avgDuration,
        avgPagesPerSession: Number(stats.avgPages.toFixed(2)),
      },
      engagement: {
        avgScrollDepth: Number(engagement.avgScrollDepth.toFixed(2)),
        avgTimeOnPage: engagement.avgTimeOnPage,
        bounceRate: 0,
        completionRate: Number(engagement.completionRate.toFixed(2)),
      },
      topArticles: topArticlesData.map(a => ({
        articleId: a.articleId,
        title: a.title || '',
        views: a.views,
        avgTimeOnPage: a.avgTimeOnPage,
        engagementScore: Number(a.engagementScore.toFixed(3)),
      })),
      topCategories: topCategoriesData.map(c => ({
        categoryId: c.categoryId || '',
        name: c.name || 'غير مصنف',
        views: c.views,
        avgEngagement: Number(c.avgEngagement.toFixed(3)),
      })),
    };
  }
  
  async getArticleHeatmap(articleId: string): Promise<Array<{
    sectionIndex: number;
    avgDwellTime: number;
    avgScrollDepth: number;
    heatScore: number;
    viewCount: number;
  }>> {
    const heatmapData = await db
      .select({
        sectionIndex: sectionAnalytics.sectionIndex,
        avgDwellTime: sql<number>`coalesce(avg(${sectionAnalytics.dwellTimeMs}), 0)::int`,
        avgScrollDepth: sql<number>`coalesce(avg((${sectionAnalytics.scrollDepthStart} + ${sectionAnalytics.scrollDepthEnd}) / 2), 0)::float`,
        heatScore: sql<number>`coalesce(avg(${sectionAnalytics.heatScore}), 0)::float`,
        viewCount: sql<number>`count(*)::int`,
      })
      .from(sectionAnalytics)
      .where(eq(sectionAnalytics.articleId, articleId))
      .groupBy(sectionAnalytics.sectionIndex)
      .orderBy(asc(sectionAnalytics.sectionIndex));
    
    return heatmapData.map(h => ({
      sectionIndex: h.sectionIndex,
      avgDwellTime: h.avgDwellTime,
      avgScrollDepth: Number(h.avgScrollDepth.toFixed(2)),
      heatScore: Number(h.heatScore.toFixed(3)),
      viewCount: h.viewCount,
    }));
  }
  
  async getNavigationPaths(range: string, limit: number): Promise<Array<{
    fromPage: string;
    toPage: string;
    count: number;
    avgDwellTime: number;
  }>> {
    const days = parseInt(range) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const pathsData = await db
      .select({
        fromPage: sql<string>`coalesce(${navigationPaths.fromPageType}, 'direct')`,
        toPage: navigationPaths.toPageType,
        count: sql<number>`count(*)::int`,
        avgDwellTime: sql<number>`coalesce(avg(${navigationPaths.dwellTimeOnFromMs}), 0)::int`,
      })
      .from(navigationPaths)
      .where(gte(navigationPaths.occurredAt, startDate))
      .groupBy(navigationPaths.fromPageType, navigationPaths.toPageType)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    
    return pathsData.map(p => ({
      fromPage: p.fromPage,
      toPage: p.toPage || '',
      count: p.count,
      avgDwellTime: p.avgDwellTime,
    }));
  }
  
  async getTrafficSourcesAnalytics(range: string): Promise<{
    byType: Array<{ type: string; count: number; percentage: number }>;
    bySocial: Array<{ platform: string; count: number; percentage: number }>;
    byReferrer: Array<{ domain: string; count: number; percentage: number }>;
  }> {
    const days = parseInt(range) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // By source type
    const byTypeData = await db
      .select({
        type: trafficSources.sourceType,
        count: sql<number>`count(*)::int`,
      })
      .from(trafficSources)
      .where(gte(trafficSources.createdAt, startDate))
      .groupBy(trafficSources.sourceType)
      .orderBy(desc(sql`count(*)`));
    
    const totalType = byTypeData.reduce((sum, t) => sum + t.count, 0);
    
    // By social platform
    const bySocialData = await db
      .select({
        platform: trafficSources.socialPlatform,
        count: sql<number>`count(*)::int`,
      })
      .from(trafficSources)
      .where(and(
        gte(trafficSources.createdAt, startDate),
        isNotNull(trafficSources.socialPlatform)
      ))
      .groupBy(trafficSources.socialPlatform)
      .orderBy(desc(sql`count(*)`));
    
    const totalSocial = bySocialData.reduce((sum, s) => sum + s.count, 0);
    
    // By referrer domain
    const byReferrerData = await db
      .select({
        domain: trafficSources.referrerDomain,
        count: sql<number>`count(*)::int`,
      })
      .from(trafficSources)
      .where(and(
        gte(trafficSources.createdAt, startDate),
        isNotNull(trafficSources.referrerDomain)
      ))
      .groupBy(trafficSources.referrerDomain)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    
    const totalReferrer = byReferrerData.reduce((sum, r) => sum + r.count, 0);
    
    return {
      byType: byTypeData.map(t => ({
        type: t.type || 'unknown',
        count: t.count,
        percentage: totalType > 0 ? Number(((t.count / totalType) * 100).toFixed(1)) : 0,
      })),
      bySocial: bySocialData.map(s => ({
        platform: s.platform || 'unknown',
        count: s.count,
        percentage: totalSocial > 0 ? Number(((s.count / totalSocial) * 100).toFixed(1)) : 0,
      })),
      byReferrer: byReferrerData.map(r => ({
        domain: r.domain || 'direct',
        count: r.count,
        percentage: totalReferrer > 0 ? Number(((r.count / totalReferrer) * 100).toFixed(1)) : 0,
      })),
    };
  }
  
  async getPeakHoursAnalytics(range: string): Promise<{
    hourly: Array<{ hour: number; count: number; avgEngagement: number }>;
    daily: Array<{ day: string; count: number; avgEngagement: number }>;
  }> {
    const days = parseInt(range) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Hourly distribution
    const hourlyData = await db
      .select({
        hour: sql<number>`extract(hour from ${readingHistory.readAt})::int`,
        count: sql<number>`count(*)::int`,
        avgEngagement: sql<number>`coalesce(avg(${readingHistory.engagementScore}), 0)::float`,
      })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, startDate))
      .groupBy(sql`extract(hour from ${readingHistory.readAt})`)
      .orderBy(sql`extract(hour from ${readingHistory.readAt})`);
    
    // Daily distribution
    const dailyData = await db
      .select({
        day: sql<string>`to_char(${readingHistory.readAt}, 'Day')`,
        count: sql<number>`count(*)::int`,
        avgEngagement: sql<number>`coalesce(avg(${readingHistory.engagementScore}), 0)::float`,
      })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, startDate))
      .groupBy(sql`to_char(${readingHistory.readAt}, 'Day')`)
      .orderBy(sql`min(extract(dow from ${readingHistory.readAt}))`);
    
    return {
      hourly: hourlyData.map(h => ({
        hour: h.hour,
        count: h.count,
        avgEngagement: Number(h.avgEngagement.toFixed(3)),
      })),
      daily: dailyData.map(d => ({
        day: d.day.trim(),
        count: d.count,
        avgEngagement: Number(d.avgEngagement.toFixed(3)),
      })),
    };
  }
  
  async getRealTimeMetrics(): Promise<{
    activeUsers: number;
    currentPageViews: number;
    topCurrentArticles: Array<{ articleId: string; title: string; viewers: number }>;
    recentEvents: Array<{ type: string; count: number; trend: number }>;
  }> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    // Active sessions in last 5 minutes
    const [activeStats] = await db
      .select({
        activeUsers: sql<number>`count(distinct ${readingSessions.userId})::int`,
        currentPageViews: sql<number>`sum(${readingSessions.totalPagesViewed})::int`,
      })
      .from(readingSessions)
      .where(and(
        gte(readingSessions.startedAt, fiveMinutesAgo),
        isNull(readingSessions.endedAt)
      ));
    
    // Top current articles
    const topArticles = await db
      .select({
        articleId: readingHistory.articleId,
        title: articles.title,
        viewers: sql<number>`count(distinct ${readingHistory.userId})::int`,
      })
      .from(readingHistory)
      .innerJoin(articles, eq(readingHistory.articleId, articles.id))
      .where(gte(readingHistory.readAt, fiveMinutesAgo))
      .groupBy(readingHistory.articleId, articles.title)
      .orderBy(desc(sql`count(distinct ${readingHistory.userId})`))
      .limit(5);
    
    // Recent events comparison
    const [currentEvents] = await db
      .select({
        reads: sql<number>`count(*)::int`,
      })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, fiveMinutesAgo));
    
    const [previousEvents] = await db
      .select({
        reads: sql<number>`count(*)::int`,
      })
      .from(readingHistory)
      .where(and(
        gte(readingHistory.readAt, tenMinutesAgo),
        lt(readingHistory.readAt, fiveMinutesAgo)
      ));
    
    const currentReads = currentEvents?.reads || 0;
    const previousReads = previousEvents?.reads || 0;
    const trend = previousReads > 0 ? ((currentReads - previousReads) / previousReads) * 100 : 0;
    
    return {
      activeUsers: activeStats?.activeUsers || 0,
      currentPageViews: activeStats?.currentPageViews || 0,
      topCurrentArticles: topArticles.map(a => ({
        articleId: a.articleId,
        title: a.title || '',
        viewers: a.viewers,
      })),
      recentEvents: [
        { type: 'reads', count: currentReads, trend: Number(trend.toFixed(1)) },
      ],
    };
  }
  
  async getTopEngagementScores(limit: number, sortBy: string): Promise<Array<{
    articleId: string;
    title: string;
    overallScore: number;
    engagementRate: number;
    avgTimeOnPage: number;
    avgScrollDepth: number;
    uniqueVisitors: number;
  }>> {
    const orderByColumn = sortBy === 'engagementRate' 
      ? articleEngagementScores.engagementRate 
      : articleEngagementScores.overallScore;
    
    const scores = await db
      .select({
        articleId: articleEngagementScores.articleId,
        title: articles.title,
        overallScore: articleEngagementScores.overallScore,
        engagementRate: articleEngagementScores.engagementRate,
        avgTimeOnPage: articleEngagementScores.avgTimeOnPage,
        avgScrollDepth: articleEngagementScores.avgScrollDepth,
        uniqueVisitors: articleEngagementScores.uniqueVisitors,
      })
      .from(articleEngagementScores)
      .innerJoin(articles, eq(articleEngagementScores.articleId, articles.id))
      .orderBy(desc(orderByColumn))
      .limit(limit);
    
    return scores.map(s => ({
      articleId: s.articleId,
      title: s.title || '',
      overallScore: Number(s.overallScore?.toFixed(3) || 0),
      engagementRate: Number(s.engagementRate?.toFixed(3) || 0),
      avgTimeOnPage: s.avgTimeOnPage || 0,
      avgScrollDepth: Number(s.avgScrollDepth?.toFixed(2) || 0),
      uniqueVisitors: s.uniqueVisitors || 0,
    }));
  }
  
  async getCategoryAnalytics(range: string): Promise<Array<{
    categoryId: string;
    name: string;
    articleCount: number;
    totalViews: number;
    avgEngagement: number;
    topArticle: string | null;
  }>> {
    const days = parseInt(range) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const categoryData = await db
      .select({
        categoryId: categories.id,
        name: categories.nameAr,
        articleCount: sql<number>`count(distinct ${articles.id})::int`,
        totalViews: sql<number>`count(${readingHistory.id})::int`,
        avgEngagement: sql<number>`coalesce(avg(${readingHistory.engagementScore}), 0)::float`,
      })
      .from(categories)
      .leftJoin(articles, eq(articles.categoryId, categories.id))
      .leftJoin(readingHistory, and(
        eq(readingHistory.articleId, articles.id),
        gte(readingHistory.readAt, startDate)
      ))
      .groupBy(categories.id, categories.nameAr)
      .orderBy(desc(sql`count(${readingHistory.id})`))
      .limit(15);
    
    return categoryData.map(c => ({
      categoryId: c.categoryId,
      name: c.name || 'غير مصنف',
      articleCount: c.articleCount,
      totalViews: c.totalViews,
      avgEngagement: Number(c.avgEngagement.toFixed(3)),
      topArticle: null,
    }));
  }
  
  async getDeviceAnalytics(range: string): Promise<{
    byDevice: Array<{ device: string; count: number; percentage: number }>;
    byPlatform: Array<{ platform: string; count: number; percentage: number }>;
    byBrowser: Array<{ browser: string; count: number; percentage: number }>;
  }> {
    const days = parseInt(range) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // By device type
    const byDeviceData = await db
      .select({
        device: readingSessions.deviceType,
        count: sql<number>`count(*)::int`,
      })
      .from(readingSessions)
      .where(gte(readingSessions.startedAt, startDate))
      .groupBy(readingSessions.deviceType)
      .orderBy(desc(sql`count(*)`));
    
    const totalDevice = byDeviceData.reduce((sum, d) => sum + d.count, 0);
    
    // By platform
    const byPlatformData = await db
      .select({
        platform: readingSessions.platform,
        count: sql<number>`count(*)::int`,
      })
      .from(readingSessions)
      .where(gte(readingSessions.startedAt, startDate))
      .groupBy(readingSessions.platform)
      .orderBy(desc(sql`count(*)`));
    
    const totalPlatform = byPlatformData.reduce((sum, p) => sum + p.count, 0);
    
    // By browser
    const byBrowserData = await db
      .select({
        browser: readingSessions.browser,
        count: sql<number>`count(*)::int`,
      })
      .from(readingSessions)
      .where(gte(readingSessions.startedAt, startDate))
      .groupBy(readingSessions.browser)
      .orderBy(desc(sql`count(*)`));
    
    const totalBrowser = byBrowserData.reduce((sum, b) => sum + b.count, 0);
    
    return {
      byDevice: byDeviceData.map(d => ({
        device: d.device || 'unknown',
        count: d.count,
        percentage: totalDevice > 0 ? Number(((d.count / totalDevice) * 100).toFixed(1)) : 0,
      })),
      byPlatform: byPlatformData.map(p => ({
        platform: p.platform || 'unknown',
        count: p.count,
        percentage: totalPlatform > 0 ? Number(((p.count / totalPlatform) * 100).toFixed(1)) : 0,
      })),
      byBrowser: byBrowserData.map(b => ({
        browser: b.browser || 'unknown',
        count: b.count,
        percentage: totalBrowser > 0 ? Number(((b.count / totalBrowser) * 100).toFixed(1)) : 0,
      })),
    };
  }
  
  async getArticleEngagementDetails(articleId: string): Promise<{
    score: number | null;
    metrics: {
      avgTimeOnPage: number;
      avgScrollDepth: number;
      bounceRate: number;
      shareCount: number;
      commentCount: number;
      reactionCount: number;
      bookmarkCount: number;
      uniqueVisitors: number;
      returningVisitors: number;
    };
    peakHour: number | null;
    topReferrer: string | null;
    topDevice: string | null;
  }> {
    const [scoreData] = await db
      .select()
      .from(articleEngagementScores)
      .where(eq(articleEngagementScores.articleId, articleId));
    
    if (!scoreData) {
      return {
        score: null,
        metrics: {
          avgTimeOnPage: 0,
          avgScrollDepth: 0,
          bounceRate: 0,
          shareCount: 0,
          commentCount: 0,
          reactionCount: 0,
          bookmarkCount: 0,
          uniqueVisitors: 0,
          returningVisitors: 0,
        },
        peakHour: null,
        topReferrer: null,
        topDevice: null,
      };
    }
    
    return {
      score: scoreData.overallScore,
      metrics: {
        avgTimeOnPage: scoreData.avgTimeOnPage || 0,
        avgScrollDepth: scoreData.avgScrollDepth || 0,
        bounceRate: scoreData.bounceRate || 0,
        shareCount: scoreData.shareCount || 0,
        commentCount: scoreData.commentCount || 0,
        reactionCount: scoreData.reactionCount || 0,
        bookmarkCount: scoreData.bookmarkCount || 0,
        uniqueVisitors: scoreData.uniqueVisitors || 0,
        returningVisitors: scoreData.returningVisitors || 0,
      },
      peakHour: scoreData.peakHour,
      topReferrer: scoreData.topReferrer,
      topDevice: scoreData.topDevice,
    };
  }
  
  async calculateArticleEngagementScore(articleId: string): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get reading history stats
    const [readingStats] = await db
      .select({
        avgTimeOnPage: sql<number>`coalesce(avg(${readingHistory.readDuration}), 0)::int`,
        avgScrollDepth: sql<number>`coalesce(avg(${readingHistory.scrollDepth}), 0)::float`,
        avgEngagement: sql<number>`coalesce(avg(${readingHistory.engagementScore}), 0)::float`,
        uniqueVisitors: sql<number>`count(distinct ${readingHistory.userId})::int`,
      })
      .from(readingHistory)
      .where(and(
        eq(readingHistory.articleId, articleId),
        gte(readingHistory.readAt, thirtyDaysAgo)
      ));
    
    // Get interaction counts
    const [reactionData] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reactions)
      .where(eq(reactions.articleId, articleId));
    
    const [commentData] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(eq(comments.articleId, articleId));
    
    const [bookmarkData] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(bookmarks)
      .where(eq(bookmarks.articleId, articleId));
    
    // Calculate overall score (weighted average)
    const avgTime = readingStats?.avgTimeOnPage || 0;
    const avgScroll = readingStats?.avgScrollDepth || 0;
    const avgEngagement = readingStats?.avgEngagement || 0;
    const uniqueVisitors = readingStats?.uniqueVisitors || 0;
    const reactionCount = reactionData?.count || 0;
    const commentCount = commentData?.count || 0;
    const bookmarkCount = bookmarkData?.count || 0;
    
    const overallScore = (
      (avgEngagement * 0.3) +
      ((avgScroll / 100) * 0.2) +
      ((Math.min(avgTime, 300) / 300) * 0.2) +
      (Math.min(reactionCount / 100, 1) * 0.1) +
      (Math.min(commentCount / 20, 1) * 0.1) +
      (Math.min(bookmarkCount / 50, 1) * 0.1)
    );
    
    // Upsert the score
    await db
      .insert(articleEngagementScores)
      .values({
        articleId,
        overallScore,
        engagementRate: avgEngagement,
        avgTimeOnPage: avgTime,
        avgScrollDepth: avgScroll,
        reactionCount,
        commentCount,
        bookmarkCount,
        uniqueVisitors,
        lastCalculated: new Date(),
      })
      .onConflictDoUpdate({
        target: articleEngagementScores.articleId,
        set: {
          overallScore,
          engagementRate: avgEngagement,
          avgTimeOnPage: avgTime,
          avgScrollDepth: avgScroll,
          reactionCount,
          commentCount,
          bookmarkCount,
          uniqueVisitors,
          lastCalculated: new Date(),
        },
      });
  }
  
  async calculateAllEngagementScores(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentArticleIds = await db
      .select({ articleId: readingHistory.articleId })
      .from(readingHistory)
      .where(gte(readingHistory.readAt, thirtyDaysAgo))
      .groupBy(readingHistory.articleId);
    
    if (recentArticleIds.length === 0) return;
    
    const ids = recentArticleIds.map(a => a.articleId);
    
    const [readingStatsAll, reactionCountsAll, commentCountsAll, bookmarkCountsAll] = await Promise.all([
      db.execute(sql`
        SELECT article_id,
          COALESCE(AVG(read_duration), 0)::int AS avg_time,
          COALESCE(AVG(scroll_depth), 0)::float AS avg_scroll,
          COALESCE(AVG(engagement_score), 0)::float AS avg_engagement,
          COUNT(DISTINCT user_id)::int AS unique_visitors
        FROM reading_history
        WHERE article_id = ANY(${ids}) AND read_at >= ${thirtyDaysAgo}
        GROUP BY article_id
      `),
      db.execute(sql`
        SELECT article_id, COUNT(*)::int AS cnt
        FROM reactions WHERE article_id = ANY(${ids})
        GROUP BY article_id
      `),
      db.execute(sql`
        SELECT article_id, COUNT(*)::int AS cnt
        FROM comments WHERE article_id = ANY(${ids})
        GROUP BY article_id
      `),
      db.execute(sql`
        SELECT article_id, COUNT(*)::int AS cnt
        FROM bookmarks WHERE article_id = ANY(${ids})
        GROUP BY article_id
      `),
    ]);
    
    const toRows = (result: any): any[] => (result as any).rows || result || [];
    const readingMap = new Map(toRows(readingStatsAll).map((r: any) => [r.article_id, r]));
    const reactionMap = new Map(toRows(reactionCountsAll).map((r: any) => [r.article_id, r.cnt]));
    const commentMap = new Map(toRows(commentCountsAll).map((r: any) => [r.article_id, r.cnt]));
    const bookmarkMap = new Map(toRows(bookmarkCountsAll).map((r: any) => [r.article_id, r.cnt]));
    
    const upsertValues = ids.map(articleId => {
      const rs = readingMap.get(articleId);
      const avgTime = rs?.avg_time || 0;
      const avgScroll = rs?.avg_scroll || 0;
      const avgEngagement = rs?.avg_engagement || 0;
      const uniqueVisitors = rs?.unique_visitors || 0;
      const reactionCount = reactionMap.get(articleId) || 0;
      const commentCount = commentMap.get(articleId) || 0;
      const bookmarkCount = bookmarkMap.get(articleId) || 0;
      
      const overallScore = (
        (avgEngagement * 0.3) +
        ((avgScroll / 100) * 0.2) +
        ((Math.min(avgTime, 300) / 300) * 0.2) +
        (Math.min(reactionCount / 100, 1) * 0.1) +
        (Math.min(commentCount / 20, 1) * 0.1) +
        (Math.min(bookmarkCount / 50, 1) * 0.1)
      );
      
      return {
        articleId,
        overallScore,
        engagementRate: avgEngagement,
        avgTimeOnPage: avgTime,
        avgScrollDepth: avgScroll,
        reactionCount,
        commentCount,
        bookmarkCount,
        uniqueVisitors,
        lastCalculated: new Date(),
      };
    });
    
    const BATCH_SIZE = 100;
    for (let i = 0; i < upsertValues.length; i += BATCH_SIZE) {
      const batch = upsertValues.slice(i, i + BATCH_SIZE);
      await db
        .insert(articleEngagementScores)
        .values(batch)
        .onConflictDoUpdate({
          target: articleEngagementScores.articleId,
          set: {
            overallScore: sql`excluded.overall_score`,
            engagementRate: sql`excluded.engagement_rate`,
            avgTimeOnPage: sql`excluded.avg_time_on_page`,
            avgScrollDepth: sql`excluded.avg_scroll_depth`,
            reactionCount: sql`excluded.reaction_count`,
            commentCount: sql`excluded.comment_count`,
            bookmarkCount: sql`excluded.bookmark_count`,
            uniqueVisitors: sql`excluded.unique_visitors`,
            lastCalculated: sql`excluded.last_calculated`,
          },
        });
    }
  }

  // ============================================
  // OPINION AUTHOR APPLICATIONS - طلبات كتّاب الرأي
  // ============================================
  
  async createOpinionAuthorApplication(data: InsertOpinionAuthorApplication): Promise<OpinionAuthorApplication> {
    // Normalize email (see correspondentApplicationService) so approval matches
    // the existing reader account instead of minting a second user row.
    const [application] = await db.insert(opinionAuthorApplications).values({
      ...data,
      email: data.email?.toLowerCase().trim(),
      id: nanoid(),
    }).returning();
    return application;
  }

  async getOpinionAuthorApplications(status?: string, page: number = 1, limit: number = 10): Promise<{applications: OpinionAuthorApplicationWithDetails[], total: number}> {
    const offset = (page - 1) * limit;
    const conditions = [];
    if (status && status !== 'all') {
      conditions.push(eq(opinionAuthorApplications.status, status));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const [countResult] = await db.select({ count: count() }).from(opinionAuthorApplications).where(whereClause);
    const total = countResult?.count || 0;
    
    const applications = await db.select({
      id: opinionAuthorApplications.id,
      arabicName: opinionAuthorApplications.arabicName,
      englishName: opinionAuthorApplications.englishName,
      email: opinionAuthorApplications.email,
      phone: opinionAuthorApplications.phone,
      jobTitle: opinionAuthorApplications.jobTitle,
      bio: opinionAuthorApplications.bio,
      city: opinionAuthorApplications.city,
      profilePhotoUrl: opinionAuthorApplications.profilePhotoUrl,
      specializations: opinionAuthorApplications.specializations,
      writingSamples: opinionAuthorApplications.writingSamples,
      licenseNumber: opinionAuthorApplications.licenseNumber,
      licenseExpiresAt: opinionAuthorApplications.licenseExpiresAt,
      licenseFileKey: opinionAuthorApplications.licenseFileKey,
      consentAt: opinionAuthorApplications.consentAt,
      status: opinionAuthorApplications.status,
      reviewedBy: opinionAuthorApplications.reviewedBy,
      reviewedAt: opinionAuthorApplications.reviewedAt,
      reviewNotes: opinionAuthorApplications.reviewNotes,
      createdUserId: opinionAuthorApplications.createdUserId,
      createdAt: opinionAuthorApplications.createdAt,
    })
    .from(opinionAuthorApplications)
    .where(whereClause)
    .orderBy(desc(opinionAuthorApplications.createdAt))
    .limit(limit)
    .offset(offset);
    
    return { applications, total };
  }

  async getOpinionAuthorApplicationById(id: string): Promise<OpinionAuthorApplicationWithDetails | undefined> {
    const [application] = await db.select().from(opinionAuthorApplications).where(eq(opinionAuthorApplications.id, id));
    if (!application) return undefined;
    
    let reviewer = null;
    if (application.reviewedBy) {
      const [reviewerData] = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      }).from(users).where(eq(users.id, application.reviewedBy));
      reviewer = reviewerData || null;
    }
    
    return { ...application, reviewer };
  }

  async approveOpinionAuthorApplication(id: string, reviewerId: string, notes?: string): Promise<{application: OpinionAuthorApplication, user: User, temporaryPassword: string}> {
    const [application] = await db.select().from(opinionAuthorApplications).where(eq(opinionAuthorApplications.id, id));
    if (!application) throw new Error("Application not found");
    if (application.status !== 'pending') throw new Error("Application already processed");

    // Check if user with this email already exists (case-insensitive — see
    // correspondentApplicationService.approveCorrespondentApplication for why this matters).
    const applicantEmail = application.email.toLowerCase().trim();
    const [existingUser] = await db.select().from(users).where(sql`lower(${users.email}) = ${applicantEmail}`);
    
    let finalUser: User;
    let temporaryPassword = '';
    
    if (existingUser) {
      // User already exists - update their role to opinion_author and link to application
      const [updatedUser] = await db.update(users)
        .set({
          role: 'opinion_author',
          jobTitle: application.jobTitle || existingUser.jobTitle,
          bio: application.bio || existingUser.bio,
          city: application.city || existingUser.city,
          profileImageUrl: application.profilePhotoUrl || existingUser.profileImageUrl,
          isProfileComplete: true,
        })
        .where(eq(users.id, existingUser.id))
        .returning();
      finalUser = updatedUser;
      
      // Assign opinion_author role via RBAC
      const [opinionAuthorRole] = await db.select().from(roles).where(eq(roles.name, 'opinion_author'));
      if (opinionAuthorRole) {
        await db.insert(userRoles).values({
          userId: existingUser.id,
          roleId: opinionAuthorRole.id,
          assignedBy: reviewerId,
        }).onConflictDoNothing();
      }
    } else {
      // Create new user
      temporaryPassword = nanoid(12);
      const hashedPassword = await bcrypt.hash(temporaryPassword, 12);
      
      const [newUser] = await db.insert(users).values({
        id: nanoid(),
        email: applicantEmail,
        firstName: application.arabicName.split(' ')[0] || application.arabicName,
        lastName: application.arabicName.split(' ').slice(1).join(' ') || '',
        profileImageUrl: application.profilePhotoUrl,
        status: 'active',
        passwordHash: hashedPassword,
        emailVerified: true,
        role: 'opinion_author',
        jobTitle: application.jobTitle,
        bio: application.bio,
        isProfileComplete: true,
        mustChangePassword: true,
      }).returning();
      finalUser = newUser;
      
      // Assign opinion_author role via RBAC
      const [opinionAuthorRole] = await db.select().from(roles).where(eq(roles.name, 'opinion_author'));
      if (opinionAuthorRole) {
        await db.insert(userRoles).values({
          userId: newUser.id,
          roleId: opinionAuthorRole.id,
          assignedBy: reviewerId,
        }).onConflictDoNothing();
      }
    }
    
    // Update application
    const [updatedApplication] = await db.update(opinionAuthorApplications)
      .set({
        status: 'approved',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: notes,
        createdUserId: finalUser.id,
      })
      .where(eq(opinionAuthorApplications.id, id))
      .returning();
    
    return { application: updatedApplication, user: finalUser, temporaryPassword };
  }

  async rejectOpinionAuthorApplication(id: string, reviewerId: string, reason: string): Promise<OpinionAuthorApplication> {
    const [application] = await db.update(opinionAuthorApplications)
      .set({
        status: 'rejected',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNotes: reason,
      })
      .where(eq(opinionAuthorApplications.id, id))
      .returning();
    
    if (!application) throw new Error("Application not found");
    return application;
  }

  // Employee Email Templates
  async getAllEmailTemplates(): Promise<EmployeeEmailTemplate[]> {
    return db.select().from(employeeEmailTemplates).orderBy(asc(employeeEmailTemplates.type)).limit(200);
  }

  async getEmailTemplate(type: string): Promise<EmployeeEmailTemplate | undefined> {
    const [template] = await db.select().from(employeeEmailTemplates).where(eq(employeeEmailTemplates.type, type));
    return template;
  }

  async upsertEmailTemplate(type: string, data: UpdateEmployeeEmailTemplate & { nameAr?: string; subject?: string; bodyHtml?: string; bodyText?: string }): Promise<EmployeeEmailTemplate> {
    const existing = await this.getEmailTemplate(type);
    
    if (existing) {
      const [updated] = await db.update(employeeEmailTemplates)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(employeeEmailTemplates.type, type))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(employeeEmailTemplates)
        .values({
          type,
          nameAr: data.nameAr || type,
          subject: data.subject || '',
          bodyHtml: data.bodyHtml || '',
          bodyText: data.bodyText || '',
          isActive: data.isActive ?? true,
        })
        .returning();
      return created;
    }
  }

  // Contact Message Replies
  async createContactMessageReply(data: InsertContactMessageReply): Promise<ContactMessageReply> {
    const [reply] = await db.insert(contactMessageReplies)
      .values(data)
      .returning();
    
    await db.update(contactMessages)
      .set({ 
        status: 'replied',
        repliedAt: new Date(),
        repliedBy: data.repliedBy,
      })
      .where(eq(contactMessages.id, data.messageId));
    
    return reply;
  }

  async getContactMessageReplies(messageId: string): Promise<Array<ContactMessageReply & { user: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null }>> {
    const replies = await db
      .select({
        id: contactMessageReplies.id,
        messageId: contactMessageReplies.messageId,
        replyText: contactMessageReplies.replyText,
        repliedBy: contactMessageReplies.repliedBy,
        createdAt: contactMessageReplies.createdAt,
        updatedAt: contactMessageReplies.updatedAt,
        isEdited: contactMessageReplies.isEdited,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
      .from(contactMessageReplies)
      .leftJoin(users, eq(contactMessageReplies.repliedBy, users.id))
      .where(eq(contactMessageReplies.messageId, messageId))
      .orderBy(asc(contactMessageReplies.createdAt));
    
    return replies;
  }

  async updateContactMessageReply(id: string, replyText: string): Promise<ContactMessageReply> {
    const [updated] = await db.update(contactMessageReplies)
      .set({
        replyText,
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(contactMessageReplies.id, id))
      .returning();
    
    if (!updated) throw new Error("Reply not found");
    return updated;
  }

  async deleteContactMessageReply(id: string): Promise<void> {
    await db.delete(contactMessageReplies)
      .where(eq(contactMessageReplies.id, id));
  }

  async getContactMessageWithReplies(id: string): Promise<(ContactMessage & { replies: Array<ContactMessageReply & { user: { id: string; firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null }> }) | undefined> {
    const [message] = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.id, id));
    
    if (!message) return undefined;
    
    const replies = await this.getContactMessageReplies(id);
    
    return {
      ...message,
      replies,
    };
  }

  // ============================================
  // WORLD DAYS - الأيام العالمية
  // ============================================

  async getAllWorldDays(filters?: { category?: string; isActive?: boolean; month?: number }): Promise<WorldDay[]> {
    const conditions: SQL[] = [];
    
    if (filters?.category) {
      conditions.push(eq(worldDays.category, filters.category));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(worldDays.isActive, filters.isActive));
    }
    if (filters?.month !== undefined) {
      conditions.push(eq(worldDays.month, filters.month));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    return db
      .select()
      .from(worldDays)
      .where(whereClause)
      .orderBy(asc(worldDays.month), asc(worldDays.day));
  }

  async getWorldDayById(id: string): Promise<WorldDay | undefined> {
    const [worldDay] = await db
      .select()
      .from(worldDays)
      .where(eq(worldDays.id, id));
    return worldDay;
  }

  async getUpcomingWorldDays(days: number): Promise<(WorldDay & { nextOccurrence: Date; daysUntil: number })[]> {
    // Get all active world days
    const allDays = await db
      .select()
      .from(worldDays)
      .where(eq(worldDays.isActive, true));
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + days);
    
    const currentYear = today.getFullYear();
    
    // Calculate next occurrence for each world day
    const daysWithNextOccurrence = allDays.map(day => {
      // Try this year first
      let nextOccurrence = new Date(currentYear, day.month - 1, day.day);
      nextOccurrence.setHours(0, 0, 0, 0);
      
      // If the date has passed this year, use next year
      if (nextOccurrence < today) {
        nextOccurrence = new Date(currentYear + 1, day.month - 1, day.day);
        nextOccurrence.setHours(0, 0, 0, 0);
      }
      
      const daysUntil = Math.ceil((nextOccurrence.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      return {
        ...day,
        nextOccurrence,
        daysUntil,
      };
    });
    
    // Filter to only those within the days window and sort by next occurrence
    return daysWithNextOccurrence
      .filter(day => day.nextOccurrence <= endDate)
      .sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime());
  }

  async getWorldDayBySourceUid(sourceUid: string): Promise<WorldDay | undefined> {
    const [worldDay] = await db
      .select()
      .from(worldDays)
      .where(eq(worldDays.sourceUid, sourceUid));
    return worldDay;
  }

  async createWorldDay(data: InsertWorldDay): Promise<WorldDay> {
    const [worldDay] = await db
      .insert(worldDays)
      .values({
        id: nanoid(),
        ...data,
      })
      .returning();
    return worldDay;
  }

  async updateWorldDay(id: string, data: Partial<InsertWorldDay>): Promise<WorldDay | undefined> {
    const [worldDay] = await db
      .update(worldDays)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(worldDays.id, id))
      .returning();
    return worldDay;
  }

  async deleteWorldDay(id: string): Promise<boolean> {
    const result = await db
      .delete(worldDays)
      .where(eq(worldDays.id, id));
    return true;
  }

  async bulkCreateWorldDays(data: InsertWorldDay[]): Promise<WorldDay[]> {
    if (data.length === 0) return [];
    
    const worldDaysWithIds = data.map(item => ({
      id: nanoid(),
      ...item,
    }));
    
    return db
      .insert(worldDays)
      .values(worldDaysWithIds)
      .returning();
  }

  // World Day Reminders
  async getWorldDayReminders(worldDayId: string): Promise<WorldDayReminder[]> {
    return db
      .select()
      .from(worldDayReminders)
      .where(eq(worldDayReminders.worldDayId, worldDayId))
      .orderBy(desc(worldDayReminders.createdAt));
  }

  async getPendingReminders(): Promise<WorldDayReminder[]> {
    const now = new Date();
    return db
      .select()
      .from(worldDayReminders)
      .where(and(
        eq(worldDayReminders.status, 'pending'),
        lte(worldDayReminders.scheduledFor, now)
      ))
      .orderBy(asc(worldDayReminders.scheduledFor));
  }

  async createWorldDayReminder(data: InsertWorldDayReminder): Promise<WorldDayReminder> {
    const [reminder] = await db
      .insert(worldDayReminders)
      .values({
        id: nanoid(),
        ...data,
      })
      .returning();
    return reminder;
  }

  async updateWorldDayReminderStatus(id: string, status: string, sentAt?: Date, errorMessage?: string): Promise<void> {
    await db
      .update(worldDayReminders)
      .set({
        status,
        sentAt,
        errorMessage,
      })
      .where(eq(worldDayReminders.id, id));
  }

  // World Day Suggestions
  async getWorldDaySuggestions(worldDayId: string): Promise<WorldDaySuggestion[]> {
    return db
      .select()
      .from(worldDaySuggestions)
      .where(eq(worldDaySuggestions.worldDayId, worldDayId))
      .orderBy(desc(worldDaySuggestions.createdAt));
  }

  async createWorldDaySuggestion(data: InsertWorldDaySuggestion): Promise<WorldDaySuggestion> {
    const [suggestion] = await db
      .insert(worldDaySuggestions)
      .values({
        id: nanoid(),
        ...data,
      })
      .returning();
    return suggestion;
  }

  async updateWorldDaySuggestionStatus(id: string, status: string, acceptedBy?: string): Promise<void> {
    await db
      .update(worldDaySuggestions)
      .set({
        status,
        acceptedBy,
        acceptedAt: acceptedBy ? new Date() : undefined,
      })
      .where(eq(worldDaySuggestions.id, id));
  }

  // Breaking Ticker operations
  async getActiveBreakingTicker(): Promise<{ topic: BreakingTickerTopic; headlines: BreakingTickerHeadline[] } | null> {
    const now = new Date();
    const [activeTopic] = await db
      .select()
      .from(breakingTickerTopics)
      .where(and(
        eq(breakingTickerTopics.isActive, true),
        or(
          isNull(breakingTickerTopics.expiresAt),
          gte(breakingTickerTopics.expiresAt, now)
        )
      ))
      .limit(1);
    
    if (!activeTopic) return null;
    
    const headlines = await db
      .select()
      .from(breakingTickerHeadlines)
      .where(eq(breakingTickerHeadlines.topicId, activeTopic.id))
      .orderBy(asc(breakingTickerHeadlines.orderIndex));
    
    return { topic: activeTopic, headlines };
  }

  async getAllBreakingTickerTopics(): Promise<BreakingTickerTopic[]> {
    return db
      .select()
      .from(breakingTickerTopics)
      .orderBy(desc(breakingTickerTopics.createdAt));
  }

  async getBreakingTickerTopic(id: string): Promise<BreakingTickerTopic | undefined> {
    const [topic] = await db
      .select()
      .from(breakingTickerTopics)
      .where(eq(breakingTickerTopics.id, id));
    return topic;
  }

  async getBreakingTickerHeadlines(topicId: string): Promise<BreakingTickerHeadline[]> {
    return db
      .select()
      .from(breakingTickerHeadlines)
      .where(eq(breakingTickerHeadlines.topicId, topicId))
      .orderBy(asc(breakingTickerHeadlines.orderIndex));
  }

  async createBreakingTickerTopic(data: InsertBreakingTickerTopic): Promise<BreakingTickerTopic> {
    const [topic] = await db
      .insert(breakingTickerTopics)
      .values({
        ...data,
      })
      .returning();
    return topic;
  }

  async updateBreakingTickerTopic(id: string, data: Partial<InsertBreakingTickerTopic>): Promise<BreakingTickerTopic> {
    const [topic] = await db
      .update(breakingTickerTopics)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(breakingTickerTopics.id, id))
      .returning();
    return topic;
  }

  async deleteBreakingTickerTopic(id: string): Promise<void> {
    await db
      .delete(breakingTickerTopics)
      .where(eq(breakingTickerTopics.id, id));
  }

  async createBreakingTickerHeadline(data: InsertBreakingTickerHeadline): Promise<BreakingTickerHeadline> {
    const [headline] = await db
      .insert(breakingTickerHeadlines)
      .values({
        ...data,
      })
      .returning();
    return headline;
  }

  async updateBreakingTickerHeadline(id: string, data: Partial<InsertBreakingTickerHeadline>): Promise<BreakingTickerHeadline> {
    const [headline] = await db
      .update(breakingTickerHeadlines)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(breakingTickerHeadlines.id, id))
      .returning();
    return headline;
  }

  async deleteBreakingTickerHeadline(id: string): Promise<void> {
    await db
      .delete(breakingTickerHeadlines)
      .where(eq(breakingTickerHeadlines.id, id));
  }

  async activateBreakingTickerTopic(id: string): Promise<BreakingTickerTopic> {
    await db
      .update(breakingTickerTopics)
      .set({ isActive: false, updatedAt: new Date() })
      .where(ne(breakingTickerTopics.id, id));
    
    const [topic] = await db
      .update(breakingTickerTopics)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(breakingTickerTopics.id, id))
      .returning();
    return topic;
  }

  async deactivateBreakingTickerTopic(id: string): Promise<BreakingTickerTopic> {
    const [topic] = await db
      .update(breakingTickerTopics)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(breakingTickerTopics.id, id))
      .returning();
    return topic;
  }
}

export const storage = new DatabaseStorage();
