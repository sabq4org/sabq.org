import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AccessibilityProvider } from "@/contexts/AccessibilityContext";
import { LiveRegionProvider } from "@/contexts/LiveRegionContext";
import { VoiceAssistantProvider } from "@/contexts/VoiceAssistantContext";
import { SkipLinks } from "@/components/SkipLinks";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { lazy, Suspense, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { useVoiceCommands } from "@/hooks/useVoiceCommands";
import { useAnalytics } from "@/hooks/use-analytics";
import { resetAdsTriggerFlag } from "@/components/DmsAdSlot";
import { needsAccountCompletion, useAuth } from "@/hooks/useAuth";
import {
  consumePostAuthReturn,
  peekPostAuthReturn,
  rememberPostAuthReturnIfAbsent,
} from "@/lib/postAuthRedirect";
import { setReadingHistoryAuth } from "@/lib/readingHistory";
import { useWebMCP } from "@/hooks/useWebMCP";
import { syncGuestFocusSessionsToUser } from "@/hooks/useFocusSession";
import { attemptChunkRecoveryReload, forceDeployRecoveryReload } from "@/lib/deployRecovery";
import { isChunkErrorMessage, retryImport } from "@/lib/retryImport";

function WebMCPProvider() {
  useWebMCP();
  return null;
}

function ReadingHistorySync() {
  const { user, isAuthenticated } = useAuth();
  useEffect(() => {
    setReadingHistoryAuth(isAuthenticated, (user as any)?.id);
  }, [isAuthenticated, (user as any)?.id]);
  return null;
}

// Push any focus reading sessions saved while the user was a guest into their
// account once they sign in. Runs on the auth-state transition only.
function FocusSessionSync() {
  const { isAuthenticated, isLoading } = useAuth();
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    void syncGuestFocusSessionsToUser();
  }, [isAuthenticated, isLoading]);
  return null;
}

/**
 * OAuth يعود من الخادم إلى /dashboard أو onboarding، لذلك لا تمر الرحلة بمكوّن
 * Login الذي يستأنف الوجهة عادةً. هذا الحارس يلتقط الوجهة المحفوظة بعد اكتمال
 * الحساب فقط؛ الحارس الأمني داخل helper يمنع أي نطاق خارجي.
 */
function PostAuthResumeGuard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (needsAccountCompletion(user) || user.isProfileComplete === false) return;
    const pending = peekPostAuthReturn();
    if (!pending) return;

    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === pending) {
      consumePostAuthReturn();
      return;
    }

    const path = location.split("?")[0] || "/";
    const oauthLanding = path === "/" || path === "/dashboard" || path === "/onboarding/personalize";
    if (oauthLanding) setLocation(consumePostAuthReturn("/"));
  }, [user, isAuthenticated, isLoading, location, setLocation]);

  return null;
}

/** حسابات الجوال الناقصة (اسم مفقود، بريد اصطناعي/مفقود، أو بلا كلمة مرور) —
 *  توجيه إلزامي لشاشة استكمال الحساب (جلسات قديمة وجديدة). */
function NameCompletionGuard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if (!needsAccountCompletion(user)) return;

    const path = location.split("?")[0] || "/";
    const exempt =
      path === "/complete-name" ||
      path === "/login" ||
      path === "/logout" ||
      path === "/register" ||
      path === "/forgot-password" ||
      path.startsWith("/reset-password") ||
      path === "/verify-email" ||
      path === "/set-password" ||
      path === "/two-factor" ||
      path === "/admin-login" ||
      path.startsWith("/survey/");
    if (exempt) return;

    rememberPostAuthReturnIfAbsent(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    setLocation("/complete-name");
  }, [user, isAuthenticated, isLoading, location, setLocation]);

  return null;
}

/** روابط sabq:// العميقة داخل غلاف كابسيتور (أندرويد): intent-filter يسلّم
 *  الرابط لحدث appUrlOpen، ونحوّله هنا لمسار SPA. لا يعمل خارج التطبيق. */
function CapacitorDeepLinks() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const capacitor = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (!capacitor?.isNativePlatform?.()) return;
    let removed = false;
    let removeListener: (() => void) | undefined;
    import("@capacitor/app").then(({ App: CapacitorApp }) => {
      CapacitorApp.addListener("appUrlOpen", ({ url }) => {
        const surveyMatch = url.match(/^sabq:\/\/survey\/([\w-]+)/);
        if (surveyMatch) setLocation(`/survey/${surveyMatch[1]}`);
      }).then((handle) => {
        if (removed) handle.remove();
        else removeListener = () => handle.remove();
      });
    }).catch(() => { /* الغلاف بدون الإضافة — تجاهل */ });
    return () => {
      removed = true;
      removeListener?.();
    };
  }, [setLocation]);

  return null;
}

// Lazy load non-critical components
const VoiceCommandsHelp = lazy(() => retryImport(() => import("@/components/VoiceCommandsHelp").then(m => ({ default: m.VoiceCommandsHelp }))));

// === LAZY IMPORTS (Critical Path - Code split for faster initial load) ===
const Home = lazy(() => retryImport(() => import("@/pages/Home")));
const ArticleDetail = lazy(() => retryImport(() => import("@/pages/ArticleDetail")));
const ArticlePassport = lazy(() => retryImport(() => import("@/pages/ArticlePassport")));
const EnglishArticlePassport = lazy(() => retryImport(() => import("@/pages/en/EnglishArticlePassport")));
const UrduArticlePassport = lazy(() => retryImport(() => import("@/pages/ur/UrduArticlePassport")));
const FocusWeeklyReport = lazy(() => retryImport(() => import("@/pages/FocusWeeklyReport")));
const FocusSessionShare = lazy(() => retryImport(() => import("@/pages/FocusSessionShare")));
const SponsoredArticle = lazy(() => retryImport(() => import("@/pages/SponsoredArticle")));
const CategoryPage = lazy(() => retryImport(() => import("@/pages/CategoryPage")));
const Login = lazy(() => retryImport(() => import("@/pages/Login")));
const Register = lazy(() => retryImport(() => import("@/pages/Register")));
// Static pages - lazy loaded
const AboutPage = lazy(() => retryImport(() => import("@/pages/AboutPage")));
const PrivacyPage = lazy(() => retryImport(() => import("@/pages/PrivacyPage")));
const TermsPage = lazy(() => retryImport(() => import("@/pages/TermsPage")));
const ContactPage = lazy(() => retryImport(() => import("@/pages/ContactPage")));
const AccessibilityStatement = lazy(() => retryImport(() => import("@/pages/AccessibilityStatement")));
const DevelopersPage = lazy(() => retryImport(() => import("@/pages/DevelopersPage")));
const AIPolicy = lazy(() => retryImport(() => import("@/pages/AIPolicy")));
const RssPage = lazy(() => retryImport(() => import("@/pages/RssPage")));

// === LAZY IMPORTS (Auth) ===
const VerifyEmail = lazy(() => retryImport(() => import("@/pages/VerifyEmail")));
const ForgotPassword = lazy(() => retryImport(() => import("@/pages/ForgotPassword")));
const ResetPassword = lazy(() => retryImport(() => import("@/pages/ResetPassword")));
const SetPassword = lazy(() => retryImport(() => import("@/pages/SetPassword")));
const TwoFactorVerify = lazy(() => retryImport(() => import("@/pages/TwoFactorVerify")));
const AdminLogin = lazy(() => retryImport(() => import("@/pages/AdminLogin")));

// === LAZY IMPORTS (Public Pages) ===
const KeywordPage = lazy(() => retryImport(() => import("@/pages/KeywordPage")));
const NewsPage = lazy(() => retryImport(() => import("@/pages/NewsPage")));
const CategoriesListPage = lazy(() => retryImport(() => import("@/pages/CategoriesListPage")));
const OpinionPage = lazy(() => retryImport(() => import("@/pages/OpinionPage")));
const OpinionDetailPage = lazy(() => retryImport(() => import("@/pages/OpinionDetailPage")));
const AuthorArticlesPage = lazy(() => retryImport(() => import("@/pages/AuthorArticlesPage")));
// AboutPage, TermsPage, PrivacyPage, AccessibilityStatement, DevelopersPage, AIPolicy - moved to eager imports
const AIPublisher = lazy(() => retryImport(() => import("@/pages/AIPublisher")));
// ContactPage - moved to eager imports above
const NewsletterPage = lazy(() => retryImport(() => import("@/pages/NewsletterPage")));
const ShortsPage = lazy(() => retryImport(() => import("@/pages/ShortsPage")));
const ReporterProfile = lazy(() => retryImport(() => import("@/pages/ReporterProfile")));
const DailyBrief = lazy(() => retryImport(() => import("@/pages/DailyBrief")));
const MomentByMoment = lazy(() => retryImport(() => import("@/pages/MomentByMoment")));
// RssPage - moved to eager imports above
const NotFound = lazy(() => retryImport(() => import("@/pages/not-found")));
const ArchivePage = lazy(() => retryImport(() => import("@/pages/ArchivePage")));

// === LAZY IMPORTS (Dashboard Core) ===
const Dashboard = lazy(() => retryImport(() => import("@/pages/Dashboard")));
const AnalyticsDashboard = lazy(() => retryImport(() => import("@/pages/AnalyticsDashboard")));
const ArticleEditor = lazy(() => retryImport(() => import("@/pages/ArticleEditor")));
const ArticlePreview = lazy(() => retryImport(() => import("@/pages/ArticlePreview")));
const ArticlesManagement = lazy(() => retryImport(() => import("@/pages/ArticlesManagement")));
const CategoriesManagement = lazy(() => retryImport(() => import("@/pages/CategoriesManagement")));
const UsersManagement = lazy(() => retryImport(() => import("@/pages/UsersManagement")));
const RolesManagement = lazy(() => retryImport(() => import("@/pages/RolesManagement")));
const TagsManagement = lazy(() => retryImport(() => import("@/pages/TagsManagement")));

// === LAZY IMPORTS (Profile & User) ===
const Profile = lazy(() => retryImport(() => import("@/pages/Profile")));
const ProfileSegmentRouter = lazy(() => retryImport(() => import("@/pages/ProfileSegmentRouter")));
const PreferencesCenter = lazy(() => retryImport(() => import("@/pages/PreferencesCenter")));
const SettingsCenter = lazy(() => retryImport(() => import("@/pages/settings/SettingsCenter")));
const OfficialLetters = lazy(() => retryImport(() => import("@/pages/dashboard/OfficialLetters")));
const MyServicesPage = lazy(() => retryImport(() => import("@/pages/dashboard/MyServicesPage")));
const VerifyLetter = lazy(() => retryImport(() => import("@/pages/VerifyLetter")));
const PublicProfile = lazy(() => retryImport(() => import("@/pages/PublicProfile")));
const DiscoverUsers = lazy(() => retryImport(() => import("@/pages/DiscoverUsers")));
const CompleteName = lazy(() => retryImport(() => import("@/pages/CompleteName")));
const EditInterests = lazy(() => retryImport(() => import("@/pages/EditInterests")));
const NotificationSettings = lazy(() => retryImport(() => import("@/pages/NotificationSettings")));
const MyFollows = lazy(() => retryImport(() => import("@/pages/MyFollows")));
const MyKeywords = lazy(() => retryImport(() => import("@/pages/MyKeywords")));

// === LAZY IMPORTS (Themes) ===
const LoyaltyAccount = lazy(() => retryImport(() => import("@/pages/LoyaltyAccount")));
const LoyaltyAdminDashboard = lazy(() => retryImport(() => import("@/pages/dashboard/LoyaltyAdminDashboard")));
const LoyaltyPreview = lazy(() => retryImport(() => import("@/pages/LoyaltyPreview")));
const SabqPlusPreview = lazy(() => retryImport(() => import("@/pages/SabqPlusPreview")));
const NationalDay96HeaderPreview = lazy(() => retryImport(() => import("@/pages/NationalDay96HeaderPreview")));
const LoyaltyTermsPage = lazy(() => retryImport(() => import("@/pages/LoyaltyTermsPage")));
const HajjBlockSettings = lazy(() => retryImport(() => import("@/pages/dashboard/HajjBlockSettings")));
const NationalDayBlockSettings = lazy(() => retryImport(() => import("@/pages/dashboard/NationalDayBlockSettings")));
const SahraaTvBlockSettings = lazy(() => retryImport(() => import("@/pages/dashboard/SahraaTvBlockSettings")));
const ThemeManager = lazy(() => retryImport(() => import("@/pages/ThemeManager")));
const ThemeEditor = lazy(() => retryImport(() => import("@/pages/ThemeEditor")));
const ThemeSwitcher = lazy(() => retryImport(() => import("@/pages/dashboard/ThemeSwitcher")));
const DashboardAppearancePage = lazy(() => retryImport(() => import("@/pages/dashboard/DashboardAppearancePage")));

// === LAZY IMPORTS (Onboarding) ===
const Welcome = lazy(() => retryImport(() => import("@/pages/onboarding/Welcome")));
const OnboardingInterests = lazy(() => retryImport(() => import("@/pages/onboarding/SelectInterests")));
const Personalize = lazy(() => retryImport(() => import("@/pages/onboarding/Personalize")));

// === LAZY IMPORTS (Muqtarab) ===
const Muqtarab = lazy(() => retryImport(() => import("@/pages/Muqtarab")));
const MuqtarabDetail = lazy(() => retryImport(() => import("@/pages/MuqtarabDetail")));
const MuqtarabWriter = lazy(() => retryImport(() => import("@/pages/MuqtarabWriter")));
const MuqtarabSubmit = lazy(() => retryImport(() => import("@/pages/MuqtarabSubmit")));
const TopicDetail = lazy(() => retryImport(() => import("@/pages/TopicDetail")));
const DashboardMuqtarab = lazy(() => retryImport(() => import("@/pages/dashboard/DashboardMuqtarab")));
const TopicsManagement = lazy(() => retryImport(() => import("@/pages/dashboard/TopicsManagement")));
const AngleSubmissionsManagement = lazy(() => retryImport(() => import("@/pages/dashboard/AngleSubmissionsManagement")));
const MyAngle = lazy(() => retryImport(() => import("@/pages/dashboard/MyAngle")));
const MuqtarabReview = lazy(() => retryImport(() => import("@/pages/dashboard/MuqtarabReview")));

// === LAZY IMPORTS (Smart Features) ===
const SmartLinksManagement = lazy(() => retryImport(() => import("@/pages/dashboard/SmartLinksManagement")));
const TermDetail = lazy(() => retryImport(() => import("@/pages/TermDetail")));
const EntityDetail = lazy(() => retryImport(() => import("@/pages/EntityDetail")));
const SmartBlocksPage = lazy(() => retryImport(() => import("@/pages/dashboard/SmartBlocksPage")));
const QuadCategoriesBlockSettings = lazy(() => retryImport(() => import("@/pages/QuadCategoriesBlockSettings")));
const SmartCategoriesManagement = lazy(() => retryImport(() => import("@/pages/SmartCategoriesManagement")));

// === LAZY IMPORTS (Analytics) ===
const ComingSoon = lazy(() => retryImport(() => import("@/pages/ComingSoon")));
const UserBehavior = lazy(() => retryImport(() => import("@/pages/UserBehavior")));
const AdvancedAnalytics = lazy(() => retryImport(() => import("@/pages/AdvancedAnalytics")));
const NewsletterAnalytics = lazy(() => retryImport(() => import("@/pages/dashboard/NewsletterAnalytics")));
const ArticleAnalyticsDashboard = lazy(() => retryImport(() => import("@/pages/dashboard/ArticleAnalyticsDashboard")));
const SocialPublishingPage = lazy(() => retryImport(() => import("@/pages/dashboard/SocialPublishingPage")));

// === LAZY IMPORTS (Notifications) ===
const Notifications = lazy(() => retryImport(() => import("@/pages/Notifications")));
const NotificationAdmin = lazy(() => retryImport(() => import("@/pages/NotificationAdmin")));
const RecommendationSettings = lazy(() => retryImport(() => import("@/pages/recommendation-settings")));
const UserNotifications = lazy(() => retryImport(() => import("@/pages/UserNotifications")));
// === LAZY IMPORTS (Admin) ===
const AIModerationDashboard = lazy(() => retryImport(() => import("@/pages/admin/AIModerationDashboard")));
const SentimentInsights = lazy(() => retryImport(() => import("@/pages/admin/SentimentInsights")));
const PaymentsDashboard = lazy(() => retryImport(() => import("@/pages/admin/PaymentsDashboard")));
const MediaStoreOrders = lazy(() => retryImport(() => import("@/pages/admin/MediaStoreOrders")));
const StaffMembers = lazy(() => retryImport(() => import("@/pages/admin/StaffMembers")));
const StaffProfilesDirectory = lazy(() => retryImport(() => import("@/pages/dashboard/StaffProfilesDirectory")));
const StaffProfilePage = lazy(() => retryImport(() => import("@/pages/dashboard/StaffProfilePage")));
const MeetingsHub = lazy(() => retryImport(() => import("@/pages/dashboard/MeetingsHub")));
const MeetingDetailPage = lazy(() => retryImport(() => import("@/pages/dashboard/MeetingDetail")));
const MeetingRoomPage = lazy(() => retryImport(() => import("@/pages/dashboard/MeetingRoom")));
const MeetingInvite = lazy(() => retryImport(() => import("@/pages/MeetingInvite")));
const AccessibilityInsights = lazy(() => retryImport(() => import("@/pages/admin/AccessibilityInsights")));
const CorrespondentApplications = lazy(() => retryImport(() => import("@/pages/admin/CorrespondentApplications")));
const OpinionAuthorApplications = lazy(() => retryImport(() => import("@/pages/admin/OpinionAuthorApplications")));
const EmailTemplatesPage = lazy(() => retryImport(() => import("@/pages/admin/EmailTemplatesPage")));
const PushNotifications = lazy(() => retryImport(() => import("@/pages/admin/PushNotifications")));
const SuspiciousWordsManagement = lazy(() => retryImport(() => import("@/pages/admin/SuspiciousWordsManagement")));

// === LAZY IMPORTS (System Settings) ===
const StoryAdmin = lazy(() => retryImport(() => import("@/pages/StoryAdmin")));
const SystemSettings = lazy(() => retryImport(() => import("@/pages/SystemSettings")));
const SportsTournamentsAdmin = lazy(() => retryImport(() => import("@/pages/dashboard/SportsTournamentsAdmin")));
const Wc2026NumbersReportPage = lazy(() => retryImport(() => import("@/pages/dashboard/Wc2026NumbersReportPage")));
const AutoImageSettings = lazy(() => retryImport(() => import("@/pages/AutoImageSettings")));
const FocalPointDashboard = lazy(() => retryImport(() => import("@/pages/dashboard/FocalPointDashboard")));
const EditorAlertsSettings = lazy(() => retryImport(() => import("@/pages/dashboard/EditorAlertsSettings")));
const ActivityLogsPage = lazy(() => retryImport(() => import("@/pages/dashboard/ActivityLogsPage")));
const ContactMessagesManagement = lazy(() => retryImport(() => import("@/pages/dashboard/ContactMessagesManagement")));
const SystemAnnouncementsManagement = lazy(() => retryImport(() => import("@/pages/dashboard/AnnouncementsManagement")));
const ContactMessageDetail = lazy(() => retryImport(() => import("@/pages/ContactMessageDetail")));

// === LAZY IMPORTS (Audio) ===

// === LAZY IMPORTS (Surveys) ===
const SurveyRespond = lazy(() => retryImport(() => import("@/pages/SurveyRespond")));
const SurveysAdmin = lazy(() => retryImport(() => import("@/pages/dashboard/Surveys")));
const SurveyEditor = lazy(() => retryImport(() => import("@/pages/dashboard/SurveyEditor")));
const SurveyResults = lazy(() => retryImport(() => import("@/pages/dashboard/SurveyResults")));

// === LAZY IMPORTS (Announcements) ===
const AnnouncementsList = lazy(() => retryImport(() => import("@/pages/AnnouncementsList")));
const AnnouncementDetail = lazy(() => retryImport(() => import("@/pages/AnnouncementDetail")));
const AnnouncementEditor = lazy(() => retryImport(() => import("@/pages/AnnouncementEditor")));
const AnnouncementsArchive = lazy(() => retryImport(() => import("@/pages/AnnouncementsArchive")));
const AnnouncementVersions = lazy(() => retryImport(() => import("@/pages/AnnouncementVersions")));
const AnnouncementAnalytics = lazy(() => retryImport(() => import("@/pages/AnnouncementAnalytics")));

// === LAZY IMPORTS (Shorts) ===
const ShortsManagement = lazy(() => retryImport(() => import("@/pages/ShortsManagement")));
const ShortsEditor = lazy(() => retryImport(() => import("@/pages/ShortsEditor")));

// === LAZY IMPORTS (Opinion) ===
const OpinionManagement = lazy(() => retryImport(() => import("@/pages/dashboard/OpinionManagement")));
const OpinionWritersPage = lazy(() => retryImport(() => import("@/pages/dashboard/OpinionWritersPage")));
const ReportersPage = lazy(() => retryImport(() => import("@/pages/dashboard/ReportersPage")));
const QuizManagement = lazy(() => retryImport(() => import("@/pages/dashboard/QuizManagement")));

// === LAZY IMPORTS (Dashboard Tools) ===
const BreakingTickerManager = lazy(() => retryImport(() => import("@/pages/dashboard/BreakingTickerManager")));
const WorldDaysManagement = lazy(() => retryImport(() => import("@/pages/dashboard/WorldDaysManagement")));
const SmartRadar = lazy(() => retryImport(() => import("@/pages/dashboard/SmartRadar")));
const RssFeedsManager = lazy(() => retryImport(() => import("@/pages/dashboard/RssFeedsManager")));
const SportmonksNewsImporter = lazy(() => retryImport(() => import("@/pages/dashboard/SportmonksNewsImporter")));
const SportsNamesManager = lazy(() => retryImport(() => import("@/pages/dashboard/SportsNamesManager")));
const MediaLibrary = lazy(() => retryImport(() => import("@/pages/dashboard/MediaLibrary")));
const PromptStudio = lazy(() => retryImport(() => import("@/pages/PromptStudio")));
const PromptStudioPublic = lazy(() => retryImport(() => import("@/pages/PromptStudioPublic")));
const DeepAnalysis = lazy(() => retryImport(() => import("@/pages/dashboard/DeepAnalysis")));
const DeepAnalysisList = lazy(() => retryImport(() => import("@/pages/dashboard/DeepAnalysisList")));
const TasksPage = lazy(() => retryImport(() => import("@/pages/dashboard/TasksPage")));
const DashboardProfile = lazy(() => retryImport(() => import("@/pages/dashboard/DashboardProfile")));
const AdminTools = lazy(() => retryImport(() => import("@/pages/dashboard/AdminTools")));
const VoiceManagement = lazy(() => retryImport(() => import("@/pages/dashboard/VoiceManagement")));

// === LAZY IMPORTS (Omq) ===
const Omq = lazy(() => retryImport(() => import("@/pages/Omq")));
const OmqDetail = lazy(() => retryImport(() => import("@/pages/OmqDetail")));
const OmqStats = lazy(() => retryImport(() => import("@/pages/OmqStats")));

// === LAZY IMPORTS (Calendar) ===
const CalendarPage = lazy(() => retryImport(() => import("@/pages/CalendarPage")));
const CalendarEventDetail = lazy(() => retryImport(() => import("@/pages/CalendarEventDetail")));
const CalendarEventForm = lazy(() => retryImport(() => import("@/pages/CalendarEventForm")));

// === LAZY IMPORTS (English Version) ===
const EnglishHome = lazy(() => retryImport(() => import("@/pages/en/EnglishHome")));
const EnglishArticleDetail = lazy(() => retryImport(() => import("@/pages/en/EnglishArticleDetail")));
const EnglishKeywordPage = lazy(() => retryImport(() => import("@/pages/en/EnglishKeywordPage")));
const EnglishArticleEditor = lazy(() => retryImport(() => import("@/pages/en/EnglishArticleEditor")));
const EnglishDashboard = lazy(() => retryImport(() => import("@/pages/en/EnglishDashboard")));
const EnglishNewsPage = lazy(() => retryImport(() => import("@/pages/en/EnglishNewsPage")));
const EnglishCategoriesPage = lazy(() => retryImport(() => import("@/pages/en/EnglishCategoriesPage")));
const EnglishCategoriesListPage = lazy(() => retryImport(() => import("@/pages/en/EnglishCategoriesListPage")));
const EnglishCategoryPage = lazy(() => retryImport(() => import("@/pages/en/EnglishCategoryPage")));
const EnglishUsersPage = lazy(() => retryImport(() => import("@/pages/en/EnglishUsersPage")));
const EnglishArticlesPage = lazy(() => retryImport(() => import("@/pages/en/EnglishArticlesPage")));
const EnglishProfile = lazy(() => retryImport(() => import("@/pages/en/EnglishProfile")));
const EnglishDailyBrief = lazy(() => retryImport(() => import("@/pages/en/EnglishDailyBrief")));
const EnglishNotificationSettings = lazy(() => retryImport(() => import("@/pages/en/EnglishNotificationSettings")));
const EnglishSmartBlocksPage = lazy(() => retryImport(() => import("@/pages/en/EnglishSmartBlocksPage")));
const EnglishQuadCategoriesBlockSettings = lazy(() => retryImport(() => import("@/pages/en/EnglishQuadCategoriesBlockSettings")));
const EnglishReporterProfile = lazy(() => retryImport(() => import("@/pages/en/EnglishReporterProfile")));
const EnglishMomentByMoment = lazy(() => retryImport(() => import("@/pages/en/EnglishMomentByMoment")));
const EnglishPrivacyPage = lazy(() => retryImport(() => import("@/pages/en/EnglishPrivacyPage")));
const EnglishTermsPage = lazy(() => retryImport(() => import("@/pages/en/EnglishTermsPage")));
const EnglishAboutPage = lazy(() => retryImport(() => import("@/pages/en/EnglishAboutPage")));

// === LAZY IMPORTS (Urdu Version) ===
const UrduHome = lazy(() => retryImport(() => import("@/pages/ur/Home")));
const UrduCategoryPage = lazy(() => retryImport(() => import("@/pages/ur/CategoryPage")));
const UrduArticleDetail = lazy(() => retryImport(() => import("@/pages/ur/ArticleDetail")));
const UrduCategoriesListPage = lazy(() => retryImport(() => import("@/pages/ur/UrduCategoriesListPage")));
const UrduNewsPage = lazy(() => retryImport(() => import("@/pages/ur/UrduNewsPage")));
const UrduDashboard = lazy(() => retryImport(() => import("@/pages/ur/dashboard/Dashboard")));
const UrduArticlesPage = lazy(() => retryImport(() => import("@/pages/ur/dashboard/ArticlesPage")));
const UrduArticleEditor = lazy(() => retryImport(() => import("@/pages/ur/dashboard/ArticleEditor")));
const UrduCategoriesPage = lazy(() => retryImport(() => import("@/pages/ur/dashboard/CategoriesPage")));
const UrduSmartBlocksPage = lazy(() => retryImport(() => import("@/pages/ur/dashboard/UrduSmartBlocksPage")));
const UrduQuadCategoriesPage = lazy(() => retryImport(() => import("@/pages/ur/dashboard/UrduQuadCategoriesPage")));

// === LAZY IMPORTS (Communications) ===
const CommunicationsManagement = lazy(() => retryImport(() => import("@/pages/dashboard/CommunicationsManagement")));
const StaffCommunicationsPage = lazy(() => retryImport(() => import("@/pages/dashboard/StaffCommunicationsPage")));
const StaffProductivity = lazy(() => retryImport(() => import("@/pages/dashboard/StaffProductivity")));

// === LAZY IMPORTS (Advertising) ===
const AdvertiserDashboard = lazy(() => retryImport(() => import("@/pages/dashboard/AdvertiserDashboard")));
const CampaignsList = lazy(() => retryImport(() => import("@/pages/dashboard/ads/CampaignsList")));
const CampaignDetail = lazy(() => retryImport(() => import("@/pages/dashboard/ads/CampaignDetail")));
const CampaignEditor = lazy(() => retryImport(() => import("@/pages/dashboard/ads/CampaignEditor")));
const AdAccountPage = lazy(() => retryImport(() => import("@/pages/dashboard/ads/AdAccountPage")));
const CreativesManagement = lazy(() => retryImport(() => import("@/pages/dashboard/ads/CreativesManagement")));
const InventorySlotsManagement = lazy(() => retryImport(() => import("@/pages/dashboard/ads/InventorySlotsManagement")));
const PlacementsManagement = lazy(() => retryImport(() => import("@/pages/dashboard/ads/PlacementsManagement")));
const AdAnalyticsPage = lazy(() => retryImport(() => import("@/pages/dashboard/ads/AdAnalyticsPage")));
const NativeAdsManagement = lazy(() => retryImport(() => import("@/pages/dashboard/NativeAdsManagement")));
const AdvertiserLanding = lazy(() => retryImport(() => import("@/pages/AdvertiserLanding")));
const AdvertiserCreate = lazy(() => retryImport(() => import("@/pages/AdvertiserCreate")));
const AdvertiserLogin = lazy(() => retryImport(() => import("@/pages/AdvertiserLogin")));
const AdvertiserRegister = lazy(() => retryImport(() => import("@/pages/AdvertiserRegister")));
const AdvertiserPortalDashboard = lazy(() => retryImport(() => import("@/pages/AdvertiserPortalDashboard")));
const AdvertiserPaymentCallback = lazy(() => retryImport(() => import("@/pages/AdvertiserPaymentCallback")));
const PaymentCallback = lazy(() => retryImport(() => import("@/pages/PaymentCallback")));
const MediaStore = lazy(() => retryImport(() => import("@/pages/MediaStore")));

// === LAZY IMPORTS (Publisher) ===
const PublisherDashboard = lazy(() => retryImport(() => import("@/pages/publisher/PublisherDashboard")));
const PublisherArticles = lazy(() => retryImport(() => import("@/pages/publisher/PublisherArticles")));
const PublisherArticleEditor = lazy(() => retryImport(() => import("@/pages/publisher/PublisherArticleEditor")));
const PublisherCredits = lazy(() => retryImport(() => import("@/pages/publisher/PublisherCredits")));
const PublisherGuide = lazy(() => retryImport(() => import("@/pages/publisher/PublisherGuide")));
const AdminPublisherGuide = lazy(() => retryImport(() => import("@/pages/admin/publishers/AdminPublisherGuide")));
const AdminPublishers = lazy(() => retryImport(() => import("@/pages/admin/publishers/AdminPublishers")));
const AdminPublisherDetails = lazy(() => retryImport(() => import("@/pages/admin/publishers/AdminPublisherDetails")));
const AdminPublisherArticles = lazy(() => retryImport(() => import("@/pages/admin/publishers/AdminPublisherArticles")));
const AdminPublisherAnalytics = lazy(() => retryImport(() => import("@/pages/admin/publishers/AdminPublisherAnalytics")));

// === LAZY IMPORTS (Correspondent & Opinion Author) ===
const CorrespondentRegister = lazy(() => retryImport(() => import("@/pages/correspondent/CorrespondentRegister")));
const OpinionAuthorRegister = lazy(() => retryImport(() => import("@/pages/opinion-author/OpinionAuthorRegister")));
const OpinionAuthorDashboard = lazy(() => retryImport(() => import("@/pages/opinion-author/OpinionAuthorDashboard")));
const WriterGuidePage = lazy(() => retryImport(() => import("@/pages/opinion-author/WriterGuidePage")));
const ReporterMyArticlesPage = lazy(() => retryImport(() => import("@/pages/reporter/ReporterMyArticlesPage")));
const OpinionTicketsList = lazy(() => retryImport(() => import("@/pages/opinion-author/OpinionTicketsList")));
const OpinionTicketDetail = lazy(() => retryImport(() => import("@/pages/opinion-author/OpinionTicketDetail")));
const OpinionTicketsAdmin = lazy(() => retryImport(() => import("@/pages/dashboard/OpinionTicketsAdmin")));
const OpinionTicketAdminDetail = lazy(() => retryImport(() => import("@/pages/dashboard/OpinionTicketAdminDetail")));

// === LAZY IMPORTS (AI/iFox) ===
// عقل سبق — صفحة تعريفية عامة بمنظومة الذكاء الاصطناعي (غير /ai الخاص بأخبار آي سبق)
const SabqAI = lazy(() => retryImport(() => import("@/pages/SabqAI")));
const AIHomePage = lazy(() => retryImport(() => import("@/pages/ai/AIHomePage")));
const AICategoryPage = lazy(() => retryImport(() => import("@/pages/ai/AICategoryPage")));
const AIArticleDetail = lazy(() => retryImport(() => import("@/pages/ai/AIArticleDetail")));
const IFoxArticlesPage = lazy(() => retryImport(() => import("@/pages/IFoxArticles")));
const IFoxDashboard = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxDashboard")));
const IFoxContentGenerator = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxContentGenerator")));
const IFoxArticles = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxArticles")));
const IFoxArticleEditor = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxArticleEditor")));
const IFoxMedia = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxMedia")));
const IFoxSchedule = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxSchedule")));
const IFoxCategory = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxCategory")));
const IFoxAnalytics = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxAnalytics")));
const IFoxSettings = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxSettings")));
const IFoxAITasks = lazy(() => retryImport(() => import("@/pages/admin/ifox/IFoxAITasks")));
const AIManagementDashboard = lazy(() => retryImport(() => import("@/pages/admin/ifox/ai-management")));
const AiHubPage = lazy(() => retryImport(() => import("@/pages/dashboard/AiHub")));
const AiStaffPage = lazy(() => retryImport(() => import("@/pages/dashboard/AiStaff")));
const AiStaffProfilePage = lazy(() => retryImport(() => import("@/pages/dashboard/AiStaff/Profile")));
const OpsRoomPage = lazy(() => retryImport(() => import("@/pages/dashboard/OpsRoom")));
const IntegrationsSettingsPage = lazy(() => retryImport(() => import("@/pages/dashboard/IntegrationsSettings")));
const SystemsCatalogPage = lazy(() => retryImport(() => import("@/pages/dashboard/SystemsCatalogPage")));
const ImageStudio = lazy(() => retryImport(() => import("@/pages/ifox/ImageStudio")));
const InfographicStudio = lazy(() => retryImport(() => import("@/pages/InfographicStudio")));
const DataInfographicDemo = lazy(() => retryImport(() => import("@/pages/DataInfographicDemo")));
const LiteFeedPage = lazy(() => retryImport(() => import("@/pages/lite/LiteFeedPage")));
const GulfLiveCoverage = lazy(() => retryImport(() => import("@/pages/GulfLiveCoverage")));
const WorldCup = lazy(() => retryImport(() => import("@/pages/WorldCup")));
const WorldCupTeam = lazy(() => retryImport(() => import("@/pages/WorldCupTeam")));
const WorldCupPredictions = lazy(() => retryImport(() => import("@/pages/WorldCupPredictions")));
const AsianCup = lazy(() => retryImport(() => import("@/pages/AsianCup")));
const AsianCupMatch = lazy(() => retryImport(() => import("@/pages/AsianCupMatch")));
const AsianCupTeam = lazy(() => retryImport(() => import("@/pages/AsianCupTeam")));
const AsianCupPlayer = lazy(() => retryImport(() => import("@/pages/AsianCupPlayer")));
const AsianCupVenues = lazy(() => retryImport(() => import("@/pages/AsianCupVenues")));
const GulfCup = lazy(() => retryImport(() => import("@/pages/GulfCup")));
const PredictionCenter = lazy(() => retryImport(() => import("@/pages/PredictionCenter")));
const GulfCupMajlis = lazy(() => retryImport(() => import("@/pages/GulfCupMajlis")));
const KingsCup = lazy(() => retryImport(() => import("@/pages/KingsCup")));
const KingsCupTeam = lazy(() => retryImport(() => import("@/pages/KingsCupTeam")));
const KingsCupPlayer = lazy(() => retryImport(() => import("@/pages/KingsCupPlayer")));
// البوابة الرياضية المعتمدة على /sports (تصميم Dashboard بعمودين)
const SportsDashboard = lazy(() => retryImport(() => import("@/pages/SportsDashboard")));
const EconomyLive = lazy(() => retryImport(() => import("@/pages/EconomyLive")));
// لوحة "مباريات اليوم" (مجمّعة حسب البطولة + فلترة) على /sports/matches
const SportsMatchesBoard = lazy(() => retryImport(() => import("@/pages/SportsMatchesBoard")));
// البث المباشر · العالم (كل مباريات العالم المباشرة، مجمّعة حسب الدولة) على /sports/live
const SportsLive = lazy(() => retryImport(() => import("@/pages/SportsLive")));
// صفحة البطولة المستقلة — /sports/competition/:slug
const SportsCompetition = lazy(() => retryImport(() => import("@/pages/SportsCompetition")));
const SportsTeam = lazy(() => retryImport(() => import("@/pages/SportsTeam")));
const SportsPlayer = lazy(() => retryImport(() => import("@/pages/SportsPlayer")));
// صفحة المباراة المستقلة (مركز مباراة كامل قابل للمشاركة) — /sports/match/:id
const SportsMatch = lazy(() => retryImport(() => import("@/pages/SportsMatch")));
// مركز انتقالات الدوري السعودي — موجز موحّد للصفقات على /sports/transfers
const SportsTransfers = lazy(() => retryImport(() => import("@/pages/SportsTransfers")));
// قصة انتقال لاعب (خط زمني للإشاعات بتطوّر الاحتمال) — /sports/transfers/story/:playerId
const TransferStory = lazy(() => retryImport(() => import("@/pages/TransferStory")));
// هب دوري روشن السعودي الفاخر — تجربة الدخول الرئيسية للبطولات السعودية على /roshn
const RoshnHub = lazy(() => retryImport(() => import("@/pages/RoshnHub")));
// البوابة الرياضية بستايل «سعودي سبورت» مربوطة بمباريات دوري روشن — /sports55
const Sports55 = lazy(() => retryImport(() => import("@/pages/Sports55")));
const GulfEventsEditor = lazy(() => retryImport(() => import("@/pages/admin/GulfEventsEditor")));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    // A failed lazy chunk can surface HERE as a React.lazy render error
    // (Safari: "undefined is not an object (evaluating 'f._result.default')")
    // rather than as an import rejection — the case that previously left a
    // permanent white screen (only a tab close recovered it). Attempt one
    // cache-busting reload; the shared cooldown prevents loops, and if it's
    // already spent, render() falls back to the friendly manual-refresh UI.
    if (isChunkErrorMessage(error?.message)) {
      attemptChunkRecoveryReload('errorboundary-chunk');
    }
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = isChunkErrorMessage(this.state.error?.message);
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center" dir="rtl">
          <h1 className="text-2xl font-bold mb-4">حدث خطأ</h1>
          <p className="text-muted-foreground mb-4">
            {isChunkError
              ? "تعذر تحميل الصفحة. حاول تحديث الصفحة من المتصفح (Ctrl+Shift+R)."
              : (this.state.error?.message || "خطأ غير معروف")}
          </p>
          <div className="flex gap-3 flex-wrap justify-center">
            <button
              onClick={() =>
                isChunkError
                  ? forceDeployRecoveryReload()
                  : this.setState({ hasError: false, error: null })
              }
              className="px-4 py-2 bg-primary text-primary-foreground rounded"
              data-testid={isChunkError ? "button-error-reload" : "button-error-retry"}
            >
              {isChunkError ? "إعادة تحميل الصفحة" : "إعادة المحاولة"}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LazyRoute({ component: Component }: { component: React.LazyExoticComponent<any> }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

function ScrollRestoration() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

function AdsTriggerResetter() {
  const [location] = useLocation();

  useEffect(() => {
    // Reset the ads trigger flag whenever the route changes
    resetAdsTriggerFlag();
  }, [location]);

  return null;
}

function VoiceCommandsManager() {
  const { showHelp, setShowHelp } = useVoiceCommands();
  
  return (
    <Suspense fallback={null}>
      <VoiceCommandsHelp 
        open={showHelp} 
        onOpenChange={setShowHelp} 
      />
    </Suspense>
  );
}

function Router() {
  useAnalytics();
  
  return (
    <>
      <ScrollRestoration />
      <AdsTriggerResetter />
      <Switch>
        {/* English Version Routes */}
        <Route path="/en">{() => <LazyRoute component={EnglishHome} />}</Route>
        <Route path="/en/news">{() => <LazyRoute component={EnglishNewsPage} />}</Route>
        <Route path="/en/moment-by-moment">{() => <LazyRoute component={EnglishMomentByMoment} />}</Route>
        <Route path="/en/categories">{() => <LazyRoute component={EnglishCategoriesListPage} />}</Route>
        <Route path="/en/category/:slug">{() => <LazyRoute component={EnglishCategoryPage} />}</Route>
        <Route path="/en/keyword/:keyword">{() => <LazyRoute component={EnglishKeywordPage} />}</Route>
        <Route path="/en/article/:slug/passport">{() => <LazyRoute component={EnglishArticlePassport} />}</Route>
        <Route path="/en/article/:slug">{() => <LazyRoute component={EnglishArticleDetail} />}</Route>
        <Route path="/en/dashboard/articles/new">{() => <LazyRoute component={EnglishArticleEditor} />}</Route>
        <Route path="/en/dashboard/articles/:id/edit">{() => <LazyRoute component={EnglishArticleEditor} />}</Route>
        <Route path="/en/dashboard/articles">{() => <LazyRoute component={EnglishArticlesPage} />}</Route>
        <Route path="/en/dashboard/categories">{() => <LazyRoute component={EnglishCategoriesPage} />}</Route>
        <Route path="/en/dashboard/smart-blocks">{() => <LazyRoute component={EnglishSmartBlocksPage} />}</Route>
        <Route path="/en/dashboard/quad-categories">{() => <LazyRoute component={EnglishQuadCategoriesBlockSettings} />}</Route>
        <Route path="/en/dashboard/users">{() => <LazyRoute component={EnglishUsersPage} />}</Route>
        <Route path="/en/dashboard">{() => <LazyRoute component={EnglishDashboard} />}</Route>
        <Route path="/en/profile">{() => <LazyRoute component={EnglishProfile} />}</Route>
        <Route path="/en/daily-brief">{() => <LazyRoute component={EnglishDailyBrief} />}</Route>
        <Route path="/en/notification-settings">{() => <LazyRoute component={EnglishNotificationSettings} />}</Route>
        <Route path="/en/settings/:section">{() => <Redirect to="/settings/notifications" />}</Route>
        <Route path="/en/settings">{() => <Redirect to="/settings" />}</Route>
        <Route path="/en/reporter/:slug">{() => <LazyRoute component={EnglishReporterProfile} />}</Route>
        
        {/* Urdu Version Routes */}
        <Route path="/ur">{() => <LazyRoute component={UrduHome} />}</Route>
        <Route path="/ur/news">{() => <LazyRoute component={UrduNewsPage} />}</Route>
        <Route path="/ur/categories">{() => <LazyRoute component={UrduCategoriesListPage} />}</Route>
        <Route path="/ur/category/:slug">{() => <LazyRoute component={UrduCategoryPage} />}</Route>
        <Route path="/ur/article/:slug/passport">{() => <LazyRoute component={UrduArticlePassport} />}</Route>
        <Route path="/ur/article/:slug">{() => <LazyRoute component={UrduArticleDetail} />}</Route>
        <Route path="/ur/dashboard/articles/new">{() => <LazyRoute component={UrduArticleEditor} />}</Route>
        <Route path="/ur/dashboard/articles/:id/edit">{() => <LazyRoute component={UrduArticleEditor} />}</Route>
        <Route path="/ur/dashboard/articles">{() => <LazyRoute component={UrduArticlesPage} />}</Route>
        <Route path="/ur/dashboard/categories">{() => <LazyRoute component={UrduCategoriesPage} />}</Route>
        <Route path="/ur/dashboard/smart-blocks">{() => <LazyRoute component={UrduSmartBlocksPage} />}</Route>
        <Route path="/ur/dashboard/quad-categories">{() => <LazyRoute component={UrduQuadCategoriesPage} />}</Route>
        <Route path="/ur/dashboard">{() => <LazyRoute component={UrduDashboard} />}</Route>
        
        {/* Arabic Version Routes - Core Pages (Lazy - Code Split) */}
        <Route path="/">{() => <LazyRoute component={Home} />}</Route>
        <Route path="/ar">{() => <LazyRoute component={Home} />}</Route>
        <Route path="/category/:slug">{() => <LazyRoute component={CategoryPage} />}</Route>
        <Route path="/sponsored">{() => <LazyRoute component={SponsoredArticle} />}</Route>
        <Route path="/article/:slug/passport">{() => <LazyRoute component={ArticlePassport} />}</Route>
        <Route path="/article/:slug">{() => <LazyRoute component={ArticleDetail} />}</Route>

        {/* Focus Mode (Task #80) */}
        <Route path="/focus/weekly">
          {() => (
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <FocusWeeklyReport language="ar" />
              </Suspense>
            </ErrorBoundary>
          )}
        </Route>
        <Route path="/en/focus/weekly">
          {() => (
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <FocusWeeklyReport language="en" />
              </Suspense>
            </ErrorBoundary>
          )}
        </Route>
        <Route path="/ur/focus/weekly">
          {() => (
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <FocusWeeklyReport language="ur" />
              </Suspense>
            </ErrorBoundary>
          )}
        </Route>
        <Route path="/focus/session/:slug">{() => <LazyRoute component={FocusSessionShare} />}</Route>
        <Route path="/login">{() => <LazyRoute component={Login} />}</Route>
        <Route path="/register">{() => <LazyRoute component={Register} />}</Route>
        
        {/* Static Pages - Lazy loaded */}
        <Route path="/about">{() => <LazyRoute component={AboutPage} />}</Route>
        <Route path="/loyalty-preview">{() => <LazyRoute component={LoyaltyPreview} />}</Route>
        <Route path="/plus-preview">{() => <LazyRoute component={SabqPlusPreview} />}</Route>
        <Route path="/nd96-preview">{() => <LazyRoute component={NationalDay96HeaderPreview} />}</Route>
        <Route path="/loyalty-terms">{() => <LazyRoute component={LoyaltyTermsPage} />}</Route>
        <Route path="/ar/loyalty-terms">{() => <LazyRoute component={LoyaltyTermsPage} />}</Route>
        <Route path="/contact">{() => <LazyRoute component={ContactPage} />}</Route>
        <Route path="/terms">{() => <LazyRoute component={TermsPage} />}</Route>
        <Route path="/ar/terms">{() => <LazyRoute component={TermsPage} />}</Route>
        <Route path="/en/terms">{() => <LazyRoute component={EnglishTermsPage} />}</Route>
        <Route path="/en/about">{() => <LazyRoute component={EnglishAboutPage} />}</Route>
        <Route path="/privacy">{() => <LazyRoute component={PrivacyPage} />}</Route>
        <Route path="/ar/privacy">{() => <LazyRoute component={PrivacyPage} />}</Route>
        <Route path="/en/privacy">{() => <LazyRoute component={EnglishPrivacyPage} />}</Route>
        
        <Route path="/accessibility-statement">{() => <LazyRoute component={AccessibilityStatement} />}</Route>
        <Route path="/ar/accessibility-statement">{() => <LazyRoute component={AccessibilityStatement} />}</Route>
        <Route path="/en/accessibility-statement">{() => <LazyRoute component={AccessibilityStatement} />}</Route>
        <Route path="/developers">{() => <LazyRoute component={DevelopersPage} />}</Route>
        <Route path="/ai-policy">{() => <LazyRoute component={AIPolicy} />}</Route>
        <Route path="/rss">{() => <LazyRoute component={RssPage} />}</Route>
        
        {/* Arabic Version Routes - LAZY */}
        <Route path="/ai-publisher">{() => <LazyRoute component={AIPublisher} />}</Route>
        <Route path="/newsletter">{() => <LazyRoute component={NewsletterPage} />}</Route>
        <Route path="/news">{() => <LazyRoute component={NewsPage} />}</Route>
        <Route path="/opinion">{() => <LazyRoute component={OpinionPage} />}</Route>
        <Route path="/opinion/:slug">{() => <LazyRoute component={OpinionDetailPage} />}</Route>
        <Route path="/categories">{() => <LazyRoute component={CategoriesListPage} />}</Route>
        <Route path="/shorts">{() => <LazyRoute component={ShortsPage} />}</Route>
        <Route path="/lite">{() => <LazyRoute component={LiteFeedPage} />}</Route>
        <Route path="/prompt-studio">{() => <LazyRoute component={PromptStudioPublic} />}</Route>
        <Route path="/admin/login">{() => <LazyRoute component={AdminLogin} />}</Route>
        <Route path="/dashboard/payment-analytics">{() => <LazyRoute component={PaymentsDashboard} />}</Route>
        <Route path="/dashboard/media-store-orders">{() => <LazyRoute component={MediaStoreOrders} />}</Route>
        <Route path="/verify-email">{() => <LazyRoute component={VerifyEmail} />}</Route>
        <Route path="/forgot-password">{() => <LazyRoute component={ForgotPassword} />}</Route>
        <Route path="/reset-password">{() => <LazyRoute component={ResetPassword} />}</Route>
        <Route path="/set-password">{() => <LazyRoute component={SetPassword} />}</Route>
        <Route path="/2fa-verify">{() => <LazyRoute component={TwoFactorVerify} />}</Route>
        <Route path="/keyword/:keyword">{() => <LazyRoute component={KeywordPage} />}</Route>
        <Route path="/muqtarab/submit">{() => <LazyRoute component={MuqtarabSubmit} />}</Route>
        <Route path="/muqtarab/:angleSlug/topic/:topicSlug">{() => <LazyRoute component={TopicDetail} />}</Route>
        <Route path="/muqtarab/writer/:id">{() => <LazyRoute component={MuqtarabWriter} />}</Route>
        <Route path="/muqtarab/:slug">{() => <LazyRoute component={MuqtarabDetail} />}</Route>
        <Route path="/muqtarab">{() => <LazyRoute component={Muqtarab} />}</Route>
        
        {/* Omq (Deep Analysis) public pages */}
        <Route path="/omq/stats">{() => <LazyRoute component={OmqStats} />}</Route>
        <Route path="/omq/:id">{() => <LazyRoute component={OmqDetail} />}</Route>
        <Route path="/omq">{() => <LazyRoute component={Omq} />}</Route>
        
        <Route path="/payment/callback">{() => <LazyRoute component={PaymentCallback} />}</Route>
        
        {/* Advertiser self-service routes */}
        <Route path="/advertise/dashboard">{() => <LazyRoute component={AdvertiserPortalDashboard} />}</Route>
        <Route path="/advertise/payment/callback">{() => <LazyRoute component={AdvertiserPaymentCallback} />}</Route>
        <Route path="/advertise/login">{() => <LazyRoute component={AdvertiserLogin} />}</Route>
        <Route path="/advertise/register">{() => <LazyRoute component={AdvertiserRegister} />}</Route>
        <Route path="/advertise/create">{() => <LazyRoute component={AdvertiserCreate} />}</Route>
        <Route path="/advertise">{() => <LazyRoute component={AdvertiserLanding} />}</Route>
        
        {/* Media Store */}
        <Route path="/media-store">{() => <LazyRoute component={MediaStore} />}</Route>
        
        {/* AI/iFox Routes */}
        <Route path="/ai">{() => <LazyRoute component={AIHomePage} />}</Route>
        <Route path="/ai/category/:category">{() => <LazyRoute component={AICategoryPage} />}</Route>
        <Route path="/ai/article/:slug">{() => <LazyRoute component={AIArticleDetail} />}</Route>
        <Route path="/ifox">{() => <LazyRoute component={IFoxArticlesPage} />}</Route>
        
        {/* Data Infographic Demo */}
        <Route path="/infographic-demo">{() => <LazyRoute component={DataInfographicDemo} />}</Route>
        
        {/* iFox Admin Dashboard Routes */}
        <Route path="/admin">{() => <LazyRoute component={IFoxDashboard} />}</Route>
        <Route path="/admin/ai/infographic/studio">{() => <LazyRoute component={InfographicStudio} />}</Route>
        <Route path="/admin/ifox/dashboard">{() => <LazyRoute component={IFoxDashboard} />}</Route>
        <Route path="/admin/ifox/articles">{() => <LazyRoute component={IFoxArticles} />}</Route>
        <Route path="/admin/ifox/articles/new">{() => <LazyRoute component={IFoxArticleEditor} />}</Route>
        <Route path="/admin/ifox/articles/:id/edit">{() => <LazyRoute component={IFoxArticleEditor} />}</Route>
        <Route path="/admin/ifox/media">{() => <LazyRoute component={IFoxMedia} />}</Route>
        <Route path="/admin/ifox/schedule">{() => <LazyRoute component={IFoxSchedule} />}</Route>
        <Route path="/admin/ifox/categories">{() => <LazyRoute component={IFoxCategory} />}</Route>
        <Route path="/admin/ifox/analytics">{() => <LazyRoute component={IFoxAnalytics} />}</Route>
        <Route path="/admin/ifox/settings">{() => <LazyRoute component={IFoxSettings} />}</Route>
        <Route path="/admin/ifox/image-studio">{() => <LazyRoute component={ImageStudio} />}</Route>
        <Route path="/admin/ifox/ai-tasks">{() => <LazyRoute component={IFoxAITasks} />}</Route>
        <Route path="/admin/ifox/ai-management">{() => <LazyRoute component={AIManagementDashboard} />}</Route>
        <Route path="/admin/ai-hub">{() => <LazyRoute component={AiHubPage} />}</Route>
        <Route path="/admin/ai/staff/:slug">{() => <LazyRoute component={AiStaffProfilePage} />}</Route>
        <Route path="/admin/ai/staff">{() => <LazyRoute component={AiStaffPage} />}</Route>
        <Route path="/admin/ops-room">{() => <LazyRoute component={OpsRoomPage} />}</Route>

        <Route path="/reporter/:slug">{() => <LazyRoute component={ReporterProfile} />}</Route>
        <Route path="/author/:name">{() => <LazyRoute component={AuthorArticlesPage} />}</Route>
        
        {/* Smart Links pages */}
        <Route path="/term/:identifier">{() => <LazyRoute component={TermDetail} />}</Route>
        <Route path="/entity/:slug">{() => <LazyRoute component={EntityDetail} />}</Route>
        
        {/* Audio Newsletters public pages */}
        
        <Route path="/dashboard/muqtarab">{() => <LazyRoute component={DashboardMuqtarab} />}</Route>
        <Route path="/dashboard/muqtarab/angles/:angleId/topics">{() => <LazyRoute component={TopicsManagement} />}</Route>
        <Route path="/dashboard/muqtarab/submissions">{() => <LazyRoute component={AngleSubmissionsManagement} />}</Route>
        <Route path="/dashboard/muqtarab/review">{() => <LazyRoute component={MuqtarabReview} />}</Route>
        <Route path="/dashboard/my-angle">{() => <LazyRoute component={MyAngle} />}</Route>
        <Route path="/dashboard/smart-blocks">{() => <LazyRoute component={SmartBlocksPage} />}</Route>
        
        {/* Audio Newsletters dashboard */}
        
        {/* Audio Briefs dashboard */}
        
        {/* Internal Announcements dashboard */}
        <Route path="/dashboard/announcements">{() => <LazyRoute component={AnnouncementsList} />}</Route>
        <Route path="/dashboard/announcements/new">{() => <LazyRoute component={AnnouncementEditor} />}</Route>
        <Route path="/dashboard/announcements/archive">{() => <LazyRoute component={AnnouncementsArchive} />}</Route>
        <Route path="/dashboard/announcements/:id/edit">{() => <LazyRoute component={AnnouncementEditor} />}</Route>
        <Route path="/dashboard/announcements/:id/versions">{() => <LazyRoute component={AnnouncementVersions} />}</Route>
        <Route path="/dashboard/announcements/:id/analytics">{() => <LazyRoute component={AnnouncementAnalytics} />}</Route>
        <Route path="/dashboard/announcements/:id">{() => <LazyRoute component={AnnouncementDetail} />}</Route>
        
        {/* Shorts dashboard - restricted from reporters */}
        <Route path="/dashboard/shorts">
          {() => (
            <ProtectedRoute requireStaff={true} excludeRoles={["reporter"]}>
              <Suspense fallback={<PageLoader />}>
                <ShortsManagement />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/shorts/new">
          {() => (
            <ProtectedRoute requireStaff={true} excludeRoles={["reporter"]}>
              <Suspense fallback={<PageLoader />}>
                <ShortsEditor />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/shorts/:id">
          {() => (
            <ProtectedRoute requireStaff={true} excludeRoles={["reporter"]}>
              <Suspense fallback={<PageLoader />}>
                <ShortsEditor />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        
        {/* Quad Categories Block Settings */}
        <Route path="/dashboard/blocks/quad-categories">{() => <LazyRoute component={QuadCategoriesBlockSettings} />}</Route>
        
        {/* Smart Categories Management */}
        <Route path="/dashboard/smart-categories">{() => <LazyRoute component={SmartCategoriesManagement} />}</Route>
        
        {/* Calendar */}
        <Route path="/dashboard/calendar">{() => <LazyRoute component={CalendarPage} />}</Route>
        <Route path="/dashboard/calendar/:action">{() => <LazyRoute component={CalendarEventForm} />}</Route>
        <Route path="/dashboard/calendar/events/:id">{() => <LazyRoute component={CalendarEventDetail} />}</Route>
        <Route path="/dashboard/calendar/events/:id/edit">{() => <LazyRoute component={CalendarEventForm} />}</Route>
        
        {/* World Days Management */}
        <Route path="/dashboard/world-days">{() => <LazyRoute component={WorldDaysManagement} />}</Route>

        {/* Smart Radar — رادار سبق الذكي (مسؤول النظام فقط) */}
        <Route path="/dashboard/radar">
          {() => (
            <ProtectedRoute
              requireStaff={true}
              requireRoles={["system_admin", "system.admin", "superadmin", "super_admin"]}
            >
              <Suspense fallback={<PageLoader />}>
                <SmartRadar />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        
        <Route path="/dashboard">{() => <LazyRoute component={Dashboard} />}</Route>
        <Route path="/dashboard/analytics">{() => <LazyRoute component={AnalyticsDashboard} />}</Route>
        {/* Article Analytics - requires analytics.view permission */}
        <Route path="/dashboard/article-analytics">
          {() => (
            <ProtectedRoute requireStaff={true} requireAnyPermission={["analytics.view"]}>
              <Suspense fallback={<PageLoader />}>
                <ArticleAnalyticsDashboard />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/articles">{() => <LazyRoute component={ArticlesManagement} />}</Route>
        <Route path="/dashboard/articles/new">{() => <LazyRoute component={ArticleEditor} />}</Route>
        <Route path="/dashboard/article/new">{() => <LazyRoute component={ArticleEditor} />}</Route>
        <Route path="/dashboard/article/:id/preview">{() => <LazyRoute component={ArticlePreview} />}</Route>
        <Route path="/dashboard/articles/:id/preview">{() => <LazyRoute component={ArticlePreview} />}</Route>
        <Route path="/dashboard/articles/:id/edit">{() => <LazyRoute component={ArticleEditor} />}</Route>
        <Route path="/dashboard/articles/:id">{() => <LazyRoute component={ArticleEditor} />}</Route>
        {/* النشر الاجتماعي (X) — social_publish.view */}
        <Route path="/dashboard/social-publishing">
          {() => (
            <ProtectedRoute requireStaff={true} requireAnyPermission={["social_publish.view"]}>
              <Suspense fallback={<PageLoader />}>
                <SocialPublishingPage />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/quizzes">{() => <LazyRoute component={QuizManagement} />}</Route>
        <Route path="/dashboard/opinion">{() => <LazyRoute component={OpinionManagement} />}</Route>
        <Route path="/dashboard/opinion-writers">{() => <LazyRoute component={OpinionWritersPage} />}</Route>
        {/* إدارة المراسلين — مسؤول النظام فقط */}
        <Route path="/dashboard/reporters">
          {() => (
            <ProtectedRoute
              requireStaff={true}
              requireRoles={["system_admin", "system.admin", "superadmin", "super_admin"]}
            >
              <Suspense fallback={<PageLoader />}>
                <ReportersPage />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/categories">{() => <LazyRoute component={CategoriesManagement} />}</Route>
        <Route path="/dashboard/media-library">{() => <LazyRoute component={MediaLibrary} />}</Route>
        {/* Infographic Studio - restricted from reporters */}
        <Route path="/dashboard/infographic-studio">
          {() => (
            <ProtectedRoute requireStaff={true} excludeRoles={["reporter"]}>
              <Suspense fallback={<PageLoader />}>
                <InfographicStudio />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/users">{() => <LazyRoute component={UsersManagement} />}</Route>
        <Route path="/dashboard/staff">{() => <LazyRoute component={StaffMembers} />}</Route>
        <Route path="/dashboard/staff-profiles">{() => <LazyRoute component={StaffProfilesDirectory} />}</Route>
        <Route path="/dashboard/official-letters">{() => <LazyRoute component={OfficialLetters} />}</Route>
        <Route path="/dashboard/my-services">{() => <LazyRoute component={MyServicesPage} />}</Route>
        <Route path="/verify/:code">{() => <LazyRoute component={VerifyLetter} />}</Route>
        <Route path="/dashboard/staff-profiles/:userId">{() => <LazyRoute component={StaffProfilePage} />}</Route>
        <Route path="/dashboard/meetings">{() => <LazyRoute component={MeetingsHub} />}</Route>
        <Route path="/dashboard/meetings/room/:id">{() => <LazyRoute component={MeetingRoomPage} />}</Route>
        <Route path="/dashboard/meetings/:id">{() => <LazyRoute component={MeetingDetailPage} />}</Route>
        <Route path="/dashboard/roles">{() => <LazyRoute component={RolesManagement} />}</Route>
        <Route path="/dashboard/push-notifications">{() => <LazyRoute component={PushNotifications} />}</Route>
        
        {/* Advertising Dashboard - Arabic only */}
        <Route path="/dashboard/ads">{() => <LazyRoute component={AdvertiserDashboard} />}</Route>
        <Route path="/dashboard/ads/campaigns">{() => <LazyRoute component={CampaignsList} />}</Route>
        <Route path="/dashboard/ads/campaigns/new">{() => <LazyRoute component={CampaignEditor} />}</Route>
        <Route path="/dashboard/ads/campaigns/:id/edit">{() => <LazyRoute component={CampaignEditor} />}</Route>
        <Route path="/dashboard/ads/campaigns/:campaignId/placements">{() => <LazyRoute component={PlacementsManagement} />}</Route>
        <Route path="/dashboard/ads/campaigns/:id">{() => <LazyRoute component={CampaignDetail} />}</Route>
        <Route path="/dashboard/ads/creatives">{() => <LazyRoute component={CreativesManagement} />}</Route>
        <Route path="/dashboard/ads/inventory-slots">{() => <LazyRoute component={InventorySlotsManagement} />}</Route>
        <Route path="/dashboard/ads/analytics">{() => <LazyRoute component={AdAnalyticsPage} />}</Route>
        <Route path="/dashboard/ads/account">{() => <LazyRoute component={AdAccountPage} />}</Route>
        <Route path="/dashboard/native-ads">
          {() => (
            <ProtectedRoute requireStaff={true} requireRoles={["admin", "editor"]}>
              <Suspense fallback={<PageLoader />}>
                <NativeAdsManagement />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/themes/switcher">{() => <LazyRoute component={ThemeSwitcher} />}</Route>
        <Route path="/dashboard/themes/:id">{() => <LazyRoute component={ThemeEditor} />}</Route>
        <Route path="/dashboard/themes">{() => <LazyRoute component={ThemeManager} />}</Route>
        <Route path="/dashboard/appearance">{() => <LazyRoute component={DashboardAppearancePage} />}</Route>
        <Route path="/profile/:segment">{() => <LazyRoute component={ProfileSegmentRouter} />}</Route>
        <Route path="/profile">{() => <LazyRoute component={Profile} />}</Route>
        {/* محفظة العضو — مسار عام خارج لوحة التحكم */}
        <Route path="/loyalty">{() => <LazyRoute component={LoyaltyAccount} />}</Route>
        <Route path="/dashboard/loyalty">{() => <Redirect to="/loyalty" />}</Route>
        <Route path="/dashboard/loyalty-admin">{() => <LazyRoute component={LoyaltyAdminDashboard} />}</Route>
        <Route path="/dashboard/hajj-block">{() => <LazyRoute component={HajjBlockSettings} />}</Route>
        <Route path="/dashboard/national-day-block">{() => <LazyRoute component={NationalDayBlockSettings} />}</Route>
        <Route path="/dashboard/sahraa-tv-block">{() => <LazyRoute component={SahraaTvBlockSettings} />}</Route>
        <Route path="/settings/:section">{() => <LazyRoute component={SettingsCenter} />}</Route>
        <Route path="/settings">{() => <LazyRoute component={SettingsCenter} />}</Route>
        <Route path="/preferences">{() => <LazyRoute component={PreferencesCenter} />}</Route>
        {/* discover-users hidden */}
        {/* F-28: /complete-profile (unreachable, saved nothing) and /select-interests
            (POSTed to a non-existent route + read the wrong endpoint) removed —
            onboarding lives at /onboarding/* and interests at /interests/edit. */}
        <Route path="/complete-name">{() => <LazyRoute component={CompleteName} />}</Route>
        <Route path="/interests/edit">{() => <LazyRoute component={EditInterests} />}</Route>
        <Route path="/notification-settings">{() => <LazyRoute component={NotificationSettings} />}</Route>
        <Route path="/ur/notification-settings">{() => <Redirect to="/settings/notifications" />}</Route>
        
        {/* Publisher Dashboard Routes */}
        <Route path="/dashboard/publisher">{() => <LazyRoute component={PublisherDashboard} />}</Route>
        <Route path="/dashboard/publisher/articles">{() => <LazyRoute component={PublisherArticles} />}</Route>
        <Route path="/dashboard/publisher/article/new">{() => <LazyRoute component={PublisherArticleEditor} />}</Route>
        <Route path="/dashboard/publisher/article/:id/edit">{() => <LazyRoute component={PublisherArticleEditor} />}</Route>
        <Route path="/dashboard/publisher/credits">{() => <LazyRoute component={PublisherCredits} />}</Route>
        <Route path="/dashboard/publisher/guide">{() => <LazyRoute component={PublisherGuide} />}</Route>
        
        {/* Admin Publisher Management Routes */}
        <Route path="/dashboard/admin/publishers">{() => <LazyRoute component={AdminPublishers} />}</Route>
        <Route path="/dashboard/admin/publishers/:id">{() => <LazyRoute component={AdminPublisherDetails} />}</Route>
        <Route path="/dashboard/admin/publisher-articles">{() => <LazyRoute component={AdminPublisherArticles} />}</Route>
        <Route path="/dashboard/admin/publisher-analytics">{() => <LazyRoute component={AdminPublisherAnalytics} />}</Route>
        <Route path="/dashboard/admin/publisher-guide">{() => <LazyRoute component={AdminPublisherGuide} />}</Route>
        
        {/* Correspondent Registration Routes */}
        <Route path="/correspondent/register">{() => <LazyRoute component={CorrespondentRegister} />}</Route>
        <Route path="/dashboard/correspondents">{() => <LazyRoute component={CorrespondentApplications} />}</Route>
        
        {/* Opinion Author Routes */}
        <Route path="/opinion-author/register">{() => <LazyRoute component={OpinionAuthorRegister} />}</Route>
        <Route path="/dashboard/opinion-author-applications">{() => <LazyRoute component={OpinionAuthorApplications} />}</Route>
        <Route path="/dashboard/reporter/articles">{() => <LazyRoute component={ReporterMyArticlesPage} />}</Route>
        <Route path="/dashboard/opinion-author">{() => <LazyRoute component={OpinionAuthorDashboard} />}</Route>
        <Route path="/dashboard/opinion-author/guide">{() => <LazyRoute component={WriterGuidePage} />}</Route>
        <Route path="/dashboard/opinion-author/tickets/:id">{() => <LazyRoute component={OpinionTicketDetail} />}</Route>
        <Route path="/dashboard/opinion-author/tickets">{() => <LazyRoute component={OpinionTicketsList} />}</Route>
        <Route path="/dashboard/opinion-tickets/:id">{() => <LazyRoute component={OpinionTicketAdminDetail} />}</Route>
        <Route path="/dashboard/opinion-tickets">{() => <LazyRoute component={OpinionTicketsAdmin} />}</Route>

        {/* Surveys Platform Routes */}
        <Route path="/survey/:token">{() => <LazyRoute component={SurveyRespond} />}</Route>
        <Route path="/dashboard/surveys/new">{() => <LazyRoute component={SurveyEditor} />}</Route>
        <Route path="/dashboard/surveys/:id/edit">{() => <LazyRoute component={SurveyEditor} />}</Route>
        <Route path="/dashboard/surveys/:id/results">{() => <LazyRoute component={SurveyResults} />}</Route>
        <Route path="/dashboard/surveys">{() => <LazyRoute component={SurveysAdmin} />}</Route>
        
        {/* iFox Admin Dashboard Routes */}
        <Route path="/dashboard/admin/ifox">{() => <LazyRoute component={IFoxDashboard} />}</Route>
        <Route path="/dashboard/admin/ifox/content-generator">{() => <LazyRoute component={IFoxContentGenerator} />}</Route>
        <Route path="/dashboard/admin/ifox/articles">{() => <LazyRoute component={IFoxArticles} />}</Route>
        <Route path="/dashboard/admin/ifox/articles/new">{() => <LazyRoute component={IFoxArticleEditor} />}</Route>
        <Route path="/dashboard/admin/ifox/articles/edit/:id">{() => <LazyRoute component={IFoxArticleEditor} />}</Route>
        <Route path="/dashboard/admin/ifox/categories/:slug">{() => <LazyRoute component={IFoxCategory} />}</Route>
        <Route path="/dashboard/admin/ifox/media">{() => <LazyRoute component={IFoxMedia} />}</Route>
        <Route path="/dashboard/admin/ifox/image-studio">{() => <LazyRoute component={ImageStudio} />}</Route>
        <Route path="/dashboard/admin/ifox/schedule">{() => <LazyRoute component={IFoxSchedule} />}</Route>
        <Route path="/dashboard/admin/ifox/analytics">{() => <LazyRoute component={IFoxAnalytics} />}</Route>
        <Route path="/dashboard/admin/ifox/settings">{() => <LazyRoute component={IFoxSettings} />}</Route>
        <Route path="/dashboard/admin/ifox/ai-management">{() => <LazyRoute component={AIManagementDashboard} />}</Route>
        <Route path="/dashboard/ai-hub">{() => <LazyRoute component={AiHubPage} />}</Route>
        <Route path="/dashboard/ai/staff/:slug">{() => <LazyRoute component={AiStaffProfilePage} />}</Route>
        <Route path="/dashboard/ai/staff">{() => <LazyRoute component={AiStaffPage} />}</Route>
        <Route path="/dashboard/ops-room">{() => <LazyRoute component={OpsRoomPage} />}</Route>
        <Route path="/dashboard/integrations">{() => <LazyRoute component={IntegrationsSettingsPage} />}</Route>
        <Route path="/dashboard/admin/ifox/ai-tasks">{() => <LazyRoute component={IFoxAITasks} />}</Route>
        
        {/* Onboarding routes - Arabic */}
        <Route path="/ar/onboarding/welcome">{() => <LazyRoute component={Welcome} />}</Route>
        <Route path="/ar/onboarding/interests">{() => <LazyRoute component={OnboardingInterests} />}</Route>
        <Route path="/ar/onboarding/personalize">{() => <LazyRoute component={Personalize} />}</Route>
        
        {/* Onboarding routes - Legacy (without /ar/) */}
        <Route path="/onboarding/welcome">{() => <LazyRoute component={Welcome} />}</Route>
        <Route path="/onboarding/interests">{() => <LazyRoute component={OnboardingInterests} />}</Route>
        <Route path="/onboarding/personalize">{() => <LazyRoute component={Personalize} />}</Route>
        
        <Route path="/daily-brief">{() => <LazyRoute component={DailyBrief} />}</Route>
        <Route path="/moment-by-moment">{() => <LazyRoute component={MomentByMoment} />}</Route>
        <Route path="/live">{() => <LazyRoute component={MomentByMoment} />}</Route>
        <Route path="/gulf-live">{() => <LazyRoute component={GulfLiveCoverage} />}</Route>
        {/* رابط دعوة اجتماعات سبق — عام: الضيوف يدخلون بلا حساب بعد موافقة المضيف */}
        <Route path="/meet/:token">{() => <LazyRoute component={MeetingInvite} />}</Route>
        {/* عقل سبق — التعريف بمنظومة الذكاء الاصطناعي؛ /about-ai تحويلة إليه */}
        <Route path="/sabq-ai">{() => <LazyRoute component={SabqAI} />}</Route>
        <Route path="/about-ai">{() => <Redirect to="/sabq-ai" />}</Route>
        <Route path="/world-cup/predictions">{() => <LazyRoute component={WorldCupPredictions} />}</Route>
        <Route path="/world-cup/team/:teamId">{() => <LazyRoute component={WorldCupTeam} />}</Route>
        <Route path="/world-cup">{() => <LazyRoute component={WorldCup} />}</Route>
        <Route path="/asian-cup/predictions">{() => <Redirect to="/predictions?competition=asian-cup-2027" />}</Route>
        <Route path="/asian-cup/match/:id">{() => <LazyRoute component={AsianCupMatch} />}</Route>
        <Route path="/asian-cup/team/:id">{() => <LazyRoute component={AsianCupTeam} />}</Route>
        <Route path="/asian-cup/player/:id">{() => <LazyRoute component={AsianCupPlayer} />}</Route>
        <Route path="/asian-cup/scorers">{() => <Redirect to="/asian-cup#ac-races" />}</Route>
        <Route path="/asian-cup/bracket">{() => <Redirect to="/asian-cup#ac-knockout" />}</Route>
        <Route path="/asian-cup/venues">{() => <LazyRoute component={AsianCupVenues} />}</Route>
        <Route path="/asian-cup">{() => <LazyRoute component={AsianCup} />}</Route>
        <Route path="/gulf-cup/majlis/:id">{() => <LazyRoute component={GulfCupMajlis} />}</Route>
        <Route path="/gulf-cup/majlis">{() => <LazyRoute component={GulfCupMajlis} />}</Route>
        <Route path="/gulf-cup/predictions">{() => <Redirect to="/predictions?competition=gulf-cup-27" />}</Route>
        <Route path="/gulf-cup">{() => <LazyRoute component={GulfCup} />}</Route>

        {/* المنصة المركزية للتوقعات — كل البطولات ما عدا مونديال 2026 */}
        <Route path="/predictions">{() => <LazyRoute component={PredictionCenter} />}</Route>

        <Route path="/kings-cup/predictions">{() => <Redirect to="/predictions?competition=kings-cup-2026" />}</Route>
        <Route path="/super-cup/predictions">{() => <Redirect to="/predictions?competition=super-cup-2026" />}</Route>
        <Route path="/kings-cup/team/:teamId">{() => <LazyRoute component={KingsCupTeam} />}</Route>
        <Route path="/kings-cup/player/:id">{() => <LazyRoute component={KingsCupPlayer} />}</Route>
        <Route path="/kings-cup">{() => <LazyRoute component={KingsCup} />}</Route>
        {/* مركز دوري روشن السعودي بنظام تصميم المونديال — /rsl يحوّل إليه */}
        <Route path="/roshn/predictions">{() => <Redirect to="/predictions?competition=rsl-2026" />}</Route>
        <Route path="/roshn">{() => <LazyRoute component={RoshnHub} />}</Route>
        {/* البوابة الرياضية بستايل «سعودي سبورت» مربوطة بمباريات دوري روشن الحيّة */}
        <Route path="/sports55">{() => <LazyRoute component={Sports55} />}</Route>
        <Route path="/rsl/predictions">{() => <Redirect to="/predictions?competition=rsl-2026" />}</Route>
        <Route path="/rsl">{() => <Redirect to="/roshn" />}</Route>
        {/* توحيد البوابة الرياضية: التجارب القديمة (/sports10، /sports22) اندمجت في
            /sports — رفّ موجز البطولات + الغلاف الذكي، وقالب البطولة موحّد على
            /sports/competition/:slug. نحوّل مساراتها القديمة حفاظًا على الروابط. */}
        <Route path="/sports10">{() => <Redirect to="/sports" />}</Route>
        <Route path="/sports22/competition/:slug">{(p) => <Redirect to={`/sports/competition/${p.slug}`} />}</Route>
        <Route path="/sports22">{() => <Redirect to="/sports" />}</Route>
        {/* البطولات الكبرى ذات الهاب الفاخر المخصّص: يُعتمد الهاب في الرابط، ويُحوّل
            القالب العام /sports/competition/:slug إليها حتى لا تظهر نسخة باهتة مكرّرة.
            تُسجّل قبل المسار الديناميكي ليفوز التطابق الأخص. */}
        <Route path="/sports/competition/pro-league">{() => <Redirect to="/roshn" />}</Route>
        <Route path="/sports/competition/world-cup">{() => <Redirect to="/world-cup" />}</Route>
        <Route path="/sports/competition/gulf-cup">{() => <Redirect to="/gulf-cup" />}</Route>
        <Route path="/sports/competition/kings-cup">{() => <Redirect to="/kings-cup" />}</Route>
        <Route path="/sports/competition/asian-cup">{() => <Redirect to="/asian-cup" />}</Route>
        {/* البوابة الرياضية المعتمدة على /sports — تُسجّل قبل /sports/:id الأرشيفي ولا تتعارض مع /category/sports */}
        <Route path="/sports/competition/:slug">{() => <LazyRoute component={SportsCompetition} />}</Route>
        <Route path="/sports/team/:id">{() => <LazyRoute component={SportsTeam} />}</Route>
        <Route path="/sports/player/:id">{() => <LazyRoute component={SportsPlayer} />}</Route>
        <Route path="/sports/match/:id">{() => <LazyRoute component={SportsMatch} />}</Route>
        <Route path="/sports/matches">{() => <LazyRoute component={SportsMatchesBoard} />}</Route>
        <Route path="/sports/live">{() => <LazyRoute component={SportsLive} />}</Route>
        <Route path="/sports/sm-today">{() => <Redirect to="/sports/matches" />}</Route>
        <Route path="/sports/transfers/story/:playerId">{() => <LazyRoute component={TransferStory} />}</Route>
        <Route path="/sports/transfers">{() => <LazyRoute component={SportsTransfers} />}</Route>
        <Route path="/sports">{() => <LazyRoute component={SportsDashboard} />}</Route>
        <Route path="/economy">{() => <LazyRoute component={EconomyLive} />}</Route>
        {/* تحويلات من المسارات التجريبية القديمة (/sports2../sports5) إلى /sports */}
        <Route path="/sports2/competition/:slug">{(p) => <Redirect to={`/sports/competition/${p.slug}`} />}</Route>
        <Route path="/sports2/team/:id">{(p) => <Redirect to={`/sports/team/${p.id}`} />}</Route>
        <Route path="/sports2/player/:id">{(p) => <Redirect to={`/sports/player/${p.id}`} />}</Route>
        <Route path="/sports2">{() => <Redirect to="/sports" />}</Route>
        <Route path="/sports3/matches">{() => <Redirect to="/sports/matches" />}</Route>
        <Route path="/sports3">{() => <Redirect to="/sports" />}</Route>
        <Route path="/sports4">{() => <Redirect to="/sports" />}</Route>
        <Route path="/sports5">{() => <Redirect to="/sports" />}</Route>
        
        {/* Coming Soon Pages - Routes defined in nav.config.ts but not implemented yet */}
        <Route path="/dashboard/tags">{() => <LazyRoute component={TagsManagement} />}</Route>
        <Route path="/dashboard/smart-links">{() => <LazyRoute component={SmartLinksManagement} />}</Route>
        <Route path="/dashboard/ai-moderation">{() => <LazyRoute component={AIModerationDashboard} />}</Route>
        <Route path="/dashboard/sentiment-insights">{() => <LazyRoute component={SentimentInsights} />}</Route>
        <Route path="/admin/comments/suspicious-words">{() => <LazyRoute component={SuspiciousWordsManagement} />}</Route>
        <Route path="/dashboard/prompt-studio">{() => <LazyRoute component={PromptStudio} />}</Route>
        <Route path="/dashboard/tasks">{() => <LazyRoute component={TasksPage} />}</Route>
        <Route path="/dashboard/ai/summaries">{() => <LazyRoute component={ComingSoon} />}</Route>
        <Route path="/dashboard/ai/deep-analysis-list">{() => <LazyRoute component={DeepAnalysisList} />}</Route>
        <Route path="/dashboard/ai/deep">{() => <LazyRoute component={DeepAnalysis} />}</Route>
        <Route path="/dashboard/ai/headlines">{() => <LazyRoute component={ComingSoon} />}</Route>
        <Route path="/dashboard/permissions">{() => <LazyRoute component={ComingSoon} />}</Route>
        <Route path="/dashboard/templates">{() => <LazyRoute component={ComingSoon} />}</Route>
        <Route path="/dashboard/analytics/trending">{() => <LazyRoute component={ComingSoon} />}</Route>
        <Route path="/dashboard/analytics/behavior">{() => <LazyRoute component={UserBehavior} />}</Route>
        <Route path="/dashboard/analytics/advanced">{() => <LazyRoute component={AdvancedAnalytics} />}</Route>
        <Route path="/dashboard/newsletter-analytics">{() => <LazyRoute component={NewsletterAnalytics} />}</Route>
        <Route path="/dashboard/rss-feeds">{() => <LazyRoute component={RssFeedsManager} />}</Route>
        <Route path="/dashboard/sportmonks-news">{() => <LazyRoute component={SportmonksNewsImporter} />}</Route>
        <Route path="/dashboard/sports-names">{() => <LazyRoute component={SportsNamesManager} />}</Route>
        <Route path="/dashboard/integrations">{() => <LazyRoute component={ComingSoon} />}</Route>
        <Route path="/dashboard/storage">{() => <LazyRoute component={ComingSoon} />}</Route>
        <Route path="/dashboard/audit-logs">{() => <LazyRoute component={ActivityLogsPage} />}</Route>
        <Route path="/dashboard/contact-messages/:id">
          {() => (
            <ProtectedRoute requireStaff={true} requireRoles={["admin", "editor"]}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <ContactMessageDetail />
                </Suspense>
              </ErrorBoundary>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/contact-messages">
          {() => (
            <ProtectedRoute requireStaff={true} requireRoles={["admin", "editor"]}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <ContactMessagesManagement />
                </Suspense>
              </ErrorBoundary>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/system-announcements">
          {() => (
            <ProtectedRoute requireStaff={true} requireRoles={["admin"]}>
              <Suspense fallback={<PageLoader />}>
                <SystemAnnouncementsManagement />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        <Route path="/dashboard/profile">{() => <LazyRoute component={DashboardProfile} />}</Route>
        <Route path="/dashboard/admin-tools">{() => <LazyRoute component={AdminTools} />}</Route>
        <Route path="/dashboard/systems-catalog">{() => <LazyRoute component={SystemsCatalogPage} />}</Route>
        <Route path="/dashboard/notifications">{() => <LazyRoute component={Notifications} />}</Route>
        <Route path="/dashboard/notification-admin">{() => <LazyRoute component={NotificationAdmin} />}</Route>
        <Route path="/dashboard/email-templates">{() => <LazyRoute component={EmailTemplatesPage} />}</Route>
        <Route path="/notifications">{() => <LazyRoute component={UserNotifications} />}</Route>
        <Route path="/recommendation-settings">{() => <Redirect to="/settings/notifications" />}</Route>
        <Route path="/my-follows">{() => <LazyRoute component={MyFollows} />}</Route>
        <Route path="/my-keywords">{() => <LazyRoute component={MyKeywords} />}</Route>
        <Route path="/dashboard/story-admin">{() => <LazyRoute component={StoryAdmin} />}</Route>
        <Route path="/dashboard/system-settings">{() => <LazyRoute component={SystemSettings} />}</Route>
        <Route path="/dashboard/sports-tournaments">{() => <LazyRoute component={SportsTournamentsAdmin} />}</Route>
        <Route path="/dashboard/wc-2026-numbers-report">{() => <LazyRoute component={Wc2026NumbersReportPage} />}</Route>
        <Route path="/dashboard/auto-image-settings">{() => <LazyRoute component={AutoImageSettings} />}</Route>
        <Route path="/dashboard/focal-points">{() => <LazyRoute component={FocalPointDashboard} />}</Route>
        <Route path="/dashboard/editor-alerts">{() => <LazyRoute component={EditorAlertsSettings} />}</Route>
        <Route path="/dashboard/communications">{() => <LazyRoute component={CommunicationsManagement} />}</Route>
        <Route path="/dashboard/staff-communications">{() => <LazyRoute component={StaffCommunicationsPage} />}</Route>
        <Route path="/dashboard/productivity">
          {() => (
            <ProtectedRoute requireStaff={true} requireAnyPermission={["staff.view_productivity"]}>
              <Suspense fallback={<PageLoader />}>
                <StaffProductivity />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        {/* Gulf Live Coverage Editor */}
        <Route path="/dashboard/gulf-events">
          {() => (
            <ProtectedRoute requireStaff={true}>
              <Suspense fallback={<PageLoader />}>
                <GulfEventsEditor />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        {/* Breaking Ticker - requires breaking_ticker.manage permission */}
        <Route path="/dashboard/breaking-ticker">
          {() => (
            <ProtectedRoute requireStaff={true} requireAnyPermission={["breaking_ticker.manage"]}>
              <Suspense fallback={<PageLoader />}>
                <BreakingTickerManager />
              </Suspense>
            </ProtectedRoute>
          )}
        </Route>
        
        {/* Legacy redirects */}
        <Route path="/dashboard/email-agent">{() => <LazyRoute component={CommunicationsManagement} />}</Route>
        <Route path="/dashboard/voice-management">{() => <LazyRoute component={VoiceManagement} />}</Route>
        <Route path="/admin/whatsapp">{() => <LazyRoute component={CommunicationsManagement} />}</Route>
        
        {/* Admin Routes */}
        <Route path="/admin/accessibility-insights">{() => <LazyRoute component={AccessibilityInsights} />}</Route>
        
        {/* Legacy Archive Routes - Old URL patterns from previous platform */}
        <Route path="/saudia/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/world/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/mylife/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/stations/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/sports/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/tourism/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/business/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/technology/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/cars/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/media/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/articles/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        {/* Additional legacy patterns */}
        <Route path="/local/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/sport/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/economy/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/tech/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/health/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/culture/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/entertainment/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/politics/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/saudi/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/gulf/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/arab/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/society/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/accidents/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        <Route path="/breaking/:id">{() => <LazyRoute component={ArchivePage} />}</Route>
        
        <Route>{() => <LazyRoute component={NotFound} />}</Route>
      </Switch>
    </>
  );
}

function App() {

  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider defaultTheme="light">
          <AccessibilityProvider>
            <LiveRegionProvider>
              <VoiceAssistantProvider>
                <TooltipProvider>
                  <SkipLinks />
                  <Toaster />
                  <VoiceCommandsManager />
                  <ReadingHistorySync />
                  <FocusSessionSync />
                  <PostAuthResumeGuard />
                  <NameCompletionGuard />
                  <CapacitorDeepLinks />
                  <WebMCPProvider />
                  <ErrorBoundary>
                    <div id="main-content" tabIndex={-1}>
                      <Router />
                    </div>
                  </ErrorBoundary>
                </TooltipProvider>
              </VoiceAssistantProvider>
            </LiveRegionProvider>
          </AccessibilityProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
