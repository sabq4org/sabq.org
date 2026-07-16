/* eslint-disable no-console, no-restricted-syntax -- legacy debt, predates the
   guardrails: 93 console.log (stripped from prod by vite esbuild.pure) and 14
   raw fetch('/api') callsites. Both get fixed properly as pieces are extracted
   during the article-editor-split refactor; remove this disable at the end. */
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import DatePicker, { registerLocale } from "react-datepicker";
import { ar } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

registerLocale("ar", ar);
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Save,
  Send,
  ArrowRight,
  Sparkles,
  FileText,
  ImagePlus,
  Loader2,
  Upload,
  Zap,
  AlertCircle,
  Calendar,
  Hash,
  Eye,
  EyeOff,
  Image as ImageIcon,
  LayoutGrid,
  Share2,
  Layers,
  X,
  BarChart3,
  CheckCircle2,
  Check,
  Wand2,
  Clock,
  RotateCcw,
  Trash2,
  ChevronDown,
  Focus,
  Link2,
  ImageDown,
  Download,
  ExternalLink,
  Play,
  Paperclip,
  Star,
  Lock,
  RefreshCw,
  Mail,
  User,
  SpellCheck,
  Frame,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SeoPreview } from "@/components/SeoPreview";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useAuth, hasAnyPermission, hasPermission } from "@/hooks/useAuth";
import { useArticleAiTools } from "@/hooks/useArticleAiTools";
import { TitleProofreadDialog } from "@/components/article-editor/TitleProofreadDialog";
import { ProofreadDialog } from "@/components/article-editor/ProofreadDialog";
import { useArticleEditLock } from "@/hooks/useArticleEditLock";
import { useEditorPresence } from "@/hooks/useEditorPresence";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { apiRequest, apiUrl, queryClient, getCsrfToken } from "@/lib/queryClient";
import {
  markArticleSubmittedInAnalyticsCache,
  invalidateContributorAnalytics,
} from "@/lib/contributorAnalyticsCache";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Category, ArticleWithDetails } from "@shared/schema";
import { RichTextEditor } from "@/components/RichTextEditor";
import { TagInput } from "@/components/TagInput";
import { ReporterSelect } from "@/components/ReporterSelect";
import { OpinionAuthorSelect } from "@/components/OpinionAuthorSelect";
import {
  WriterEditorialNoticesAside,
  WriterEditorialNoticesMobile,
} from "@/components/WriterEditorialNotices";
import { ImageFocalPointPicker } from "@/components/ImageFocalPointPicker";
import { SmartLinksPanel } from "@/components/SmartLinksPanel";
import { MediaLibraryPicker } from "@/components/dashboard/MediaLibraryPicker";
import { HeroImageSuggestions } from "@/components/dashboard/HeroImageSuggestions";
import { HeroRightsDialog } from "@/components/dashboard/HeroRightsDialog";
import { InlineHeadlineSuggestions } from "@/components/InlineHeadlineSuggestions";
import { PollEditor, type PollData } from "@/components/PollEditor";
import { WeeklyPhotosEditor } from "@/components/WeeklyPhotosEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AIImageGeneratorDialog } from "@/components/AIImageGeneratorDialog";
import { InfographicGeneratorDialog } from "@/components/InfographicGeneratorDialog";
import { InfographicAiDialog } from "@/components/InfographicAiDialog";
import { InfographicDataEditor } from "@/components/dashboard/InfographicDataEditor";
import { StoryCardsGenerator } from "@/components/StoryCardsGenerator";
import { AutoImageGenerator } from "@/components/AutoImageGenerator";
import { ThumbnailGenerator } from "@/components/ThumbnailGenerator";
import { ImageUploadDialog } from "@/components/ImageUploadDialog";
import { LogoComposerDialog } from "@/components/LogoComposerDialog";
import { Progress } from "@/components/ui/progress";
import { ArticleTimeline } from "@/components/dashboard/ArticleTimeline";
import type { Editor } from "@tiptap/react";
import type { MediaFile } from "@shared/schema";
import { SortableAttachmentItem } from "@/components/article-editor/SortableAttachmentItem";
import { ImageCaptionForm } from "@/components/article-editor/ImageCaptionForm";
import { generateSlug } from "@/lib/slug";

export default function ArticleEditor() {
  const params = useParams<{ id: string }>();
  const [location, navigate] = useLocation();
  
  // Extract pathname without query string
  const pathname = location.split('?')[0];
  const isNewArticle = pathname.endsWith('/article/new') || pathname.endsWith('/articles/new');
  
  // Extract id from params or pathname
  const id = params.id || pathname.split('/').pop();
  
  // Extract query parameters from URL
  const queryParams = new URLSearchParams(location.split('?')[1] || '');
  const typeParam = queryParams.get('type') as "news" | "opinion" | "analysis" | "column" | "infographic" | "weekly_photos" | null;
  
  console.log('[ArticleEditor] params:', params);
  console.log('[ArticleEditor] location:', location);
  console.log('[ArticleEditor] pathname:', pathname);
  console.log('[ArticleEditor] extracted id:', id);
  console.log('[ArticleEditor] isNewArticle:', isNewArticle);
  console.log('[ArticleEditor] type query param:', typeParam);

  // Article fields
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [newsletterSubtitle, setNewsletterSubtitle] = useState("");
  const [newsletterExcerpt, setNewsletterExcerpt] = useState("");
  const [isGeneratingNewsletterContent, setIsGeneratingNewsletterContent] = useState(false);
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // 📰 Default reporter: صحيفة سبق (newspaper account) for new articles
  const NEWSPAPER_ACCOUNT_ID = 'RnP7eDOAl5T5rGpib9_8d';
  const [reporterId, setReporterId] = useState<string | null>(isNewArticle ? NEWSPAPER_ACCOUNT_ID : null);
  const [opinionAuthorId, setOpinionAuthorId] = useState<string | null>(null);
  const [articleType, setArticleType] = useState<"news" | "opinion" | "analysis" | "column" | "infographic" | "weekly_photos">(
    typeParam || "news"
  );
  
  // Weekly Photos data state
  const [weeklyPhotosData, setWeeklyPhotosData] = useState<{
    photos: Array<{ imageUrl: string; caption: string; credit?: string }>;
  }>({
    photos: Array(7).fill({ imageUrl: "", caption: "", credit: "" }),
  });
  const [previousArticleType, setPreviousArticleType] = useState<"news" | "opinion" | "analysis" | "column">("news");
  const [isInfographic, setIsInfographic] = useState(false);
  
  // Data Infographic fields
  const [infographicType, setInfographicType] = useState<"image" | "data">("image");
  const [infographicData, setInfographicData] = useState<any>(null);
  
  // Infographic Banner fields (horizontal 16:9 banner for card displays)
  const [infographicBannerUrl, setInfographicBannerUrl] = useState("");
  const [isAiGeneratedInfographicBanner, setIsAiGeneratedInfographicBanner] = useState(false);
  const [isUploadingInfographicBanner, setIsUploadingInfographicBanner] = useState(false);
  const [isGeneratingInfographicBanner, setIsGeneratingInfographicBanner] = useState(false);
  
  // Debug: Track reporterId changes
  useEffect(() => {
    console.log('[ArticleEditor] reporterId state changed to:', reporterId);
  }, [reporterId]);
  
  // Sync infographic state with articleType
  useEffect(() => {
    setIsInfographic(articleType === "infographic");
  }, [articleType]);
  const [imageUrl, setImageUrl] = useState("");
  const [isAiGeneratedImage, setIsAiGeneratedImage] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [thumbnailManuallyDeleted, setThumbnailManuallyDeleted] = useState(false);
  const [heroImageMediaId, setHeroImageMediaId] = useState<string | null>(null);
  const [imageFocalPoint, setImageFocalPoint] = useState<{ x: number; y: number } | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  
  // New fields
  const [newsType, setNewsType] = useState<"breaking" | "regular">("regular");
  const [isFeatured, setIsFeatured] = useState(false);
  const [publishType, setPublishType] = useState<"instant" | "scheduled">("instant");
  const [scheduledAt, setScheduledAt] = useState("");
  const [customPublishedAt, setCustomPublishedAt] = useState(""); // For admin backdating
  const [hideFromHomepage, setHideFromHomepage] = useState(false);
  
  // Video Template fields
  const [videoSourceType, setVideoSourceType] = useState<"url" | "upload">("url");
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isVideoTemplate, setIsVideoTemplate] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoThumbnailUrl, setVideoThumbnailUrl] = useState("");
  
  // SEO fields
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string | null>(null);
  const [reviewedAt, setReviewedAt] = useState<string | null>(null);
  const [articleUpdatedAt, setArticleUpdatedAt] = useState<string | null>(null);
  const [pollData, setPollData] = useState<PollData | null>(null);
  const [republish, setRepublish] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAnalyzingSEO, setIsAnalyzingSEO] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isGeneratingSocialCards, setIsGeneratingSocialCards] = useState(false);
  const [generatedSocialCards, setGeneratedSocialCards] = useState<{
    twitter?: string;
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    linkedin?: string;
  } | null>(null);
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showLogoComposer, setShowLogoComposer] = useState(false);
  const [showAIImageDialog, setShowAIImageDialog] = useState(false);
  const [showInfographicDialog, setShowInfographicDialog] = useState(false);
  const [showStoryCardsDialog, setShowStoryCardsDialog] = useState(false);
  const [showAlbumUploadDialog, setShowAlbumUploadDialog] = useState(false);
  const [showAttachmentUploadDialog, setShowAttachmentUploadDialog] = useState(false);
  const [showFeaturedImageHint, setShowFeaturedImageHint] = useState(true);
  const [albumImages, setAlbumImages] = useState<string[]>([]);
  const [isUploadingAlbumImage, setIsUploadingAlbumImage] = useState(false);
  const [uploadingAlbumProgress, setUploadingAlbumProgress] = useState(0);
  
  // Auto-save states
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [showDraftRecoveryDialog, setShowDraftRecoveryDialog] = useState(false);
  const [showProofreadDialog, setShowProofreadDialog] = useState(false);
  const [proofreadIssues, setProofreadIssues] = useState<Array<{
    original: string;
    suggestion: string;
    type: string;
    explanation: string;
  }>>([]);
  const [showTitleProofreadDialog, setShowTitleProofreadDialog] = useState(false);
  const [titleProofreadResult, setTitleProofreadResult] = useState<{
    original: string;
    suggestion: string;
    hasIssues: boolean;
    notes: Array<{ type?: string; explanation?: string }>;
  } | null>(null);
  const [recoveredDraft, setRecoveredDraft] = useState<any>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedArticleRef = useRef(false);
  
  // Collapsible sections states
  const [focalPointOpen, setFocalPointOpen] = useState(false);
  const [thumbnailOpen, setThumbnailOpen] = useState(false);
  const [smartLinksOpen, setSmartLinksOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [seoOptimizationOpen, setSeoOptimizationOpen] = useState(false);
  
  // Use ref for immediate lock with URL tracking (prevents concurrent uploads even in StrictMode)
  const savingMediaMapRef = useRef<Map<string, Promise<string | null>>>(new Map());
  
  // Request token to track and discard stale responses when hero image changes
  const imageRequestTokenRef = useRef<number>(0);

  // Reset all form state when creating a new article (prevents image/data overlap from previous article)
  useEffect(() => {
    if (!isNewArticle) return;
    setTitle("");
    setSubtitle("");
    setNewsletterSubtitle("");
    setNewsletterExcerpt("");
    setSlug("");
    setContent("");
    setExcerpt("");
    setCategoryId("");
    setReporterId(NEWSPAPER_ACCOUNT_ID);
    setOpinionAuthorId(null);
    setArticleType(typeParam || "news");
    setWeeklyPhotosData({ photos: Array(7).fill({ imageUrl: "", caption: "", credit: "" }) });
    setPreviousArticleType("news");
    setIsInfographic(false);
    setInfographicType("image");
    setInfographicData(null);
    setInfographicBannerUrl("");
    setIsAiGeneratedInfographicBanner(false);
    setImageUrl("");
    setIsAiGeneratedImage(false);
    setThumbnailUrl("");
    setThumbnailManuallyDeleted(false);
    setHeroImageMediaId(null);
    setImageFocalPoint(null);
    setKeywords([]);
    setNewsType("regular");
    setIsFeatured(false);
    setPublishType("instant");
    setScheduledAt("");
    setCustomPublishedAt("");
    setHideFromHomepage(false);
    setVideoSourceType("url");
    setIsVideoTemplate(false);
    setVideoUrl("");
    setVideoThumbnailUrl("");
    setMetaTitle("");
    setMetaDescription("");
    setStatus("draft");
    setPollData(null);
    setRepublish(false);
    setAlbumImages([]);
    setGeneratedSocialCards(null);
    hasLoadedArticleRef.current = false;
    if (editorInstance) {
      editorInstance.commands.setContent("");
    }
  }, [isNewArticle, id]);

  const { toast } = useToast();

  // Check authentication and redirect if needed
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });

  // Check if user is a reporter - reporters have restricted AI features
  const isReporter = user?.role === 'reporter' || (user?.roles && user.roles.some((r: any) => r.name === 'reporter' || r === 'reporter'));
  
  // Check if user is an opinion author - opinion authors have restricted editor interface
  const isOpinionAuthor = user?.role === 'opinion_author' || (user?.roles && user.roles.some((r: any) => r.name === 'opinion_author' || r === 'opinion_author'));

  // Opinion authors (and opinion/column pieces) write "مقال", everyone else "خبر".
  // Drives the editor header wording so a كاتب رأي doesn't see "خبر جديد".
  const isOpinionContext = isOpinionAuthor || articleType === 'opinion' || articleType === 'column';
  const contentNoun = isOpinionContext ? 'مقال' : 'خبر';
  const contentNounAccusative = isOpinionContext ? 'مقالاً' : 'خبراً';

  // Permission check: require articles.create for new articles, articles.edit/edit_any/edit_own for editing.
  // Opinion authors use opinion.* codes (ROLE_PERMISSIONS_MAP) — without them the editor redirects away
  // before the article query can run, which looks like "التعديل لا يجلب البيانات".
  const canAccessEditor = user && (
    hasAnyPermission(
      user,
      "articles.create",
      "articles.edit",
      "articles.edit_any",
      "articles.edit_own",
      "opinion.create",
      "opinion.edit_own",
      "opinion.edit_any",
      "opinion.view",
    )
  );
  
  // Check if user can publish directly (otherwise saves as draft)
  const canPublish = user && hasPermission(user, PERMISSION_CODES.ARTICLES_PUBLISH);
  const isContributorRole =
    user?.role === "reporter" ||
    user?.role === "opinion_author" ||
    (user?.roles?.includes("reporter") ?? false) ||
    (user?.roles?.includes("opinion_author") ?? false);

  const submitReviewMutation = useMutation({
    mutationFn: async (articleId?: string) => {
      const targetId = articleId || id;
      if (!targetId) throw new Error("معرّف المقال غير متوفر");
      return apiRequest(`/api/my/articles/${targetId}/submit-review`, { method: "POST" });
    },
    onSuccess: (data, articleId) => {
      const resolvedId = articleId || id;
      setReviewStatus("pending_review");
      if (resolvedId) {
        markArticleSubmittedInAnalyticsCache(queryClient, {
          id: resolvedId,
          reviewStatus: data?.reviewStatus ?? "pending_review",
          status: data?.status,
          updatedAt: data?.updatedAt ?? articleUpdatedAt,
        });
        invalidateContributorAnalytics(queryClient);
      }
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال المحتوى للمراجعة",
        variant: "destructive",
      });
    },
  });
  
  // Permission checks for article editor features
  const canUseAIGenerate = user && hasPermission(user, PERMISSION_CODES.ARTICLES_AI_GENERATE);
  const canSchedule = user && hasPermission(user, PERMISSION_CODES.ARTICLES_SCHEDULE);
  const canUsePolls = user && hasPermission(user, PERMISSION_CODES.ARTICLES_POLLS);
  const canUseSmartLinks = user && hasPermission(user, PERMISSION_CODES.ARTICLES_SMART_LINKS);
  const canGenerateImages = user && hasPermission(user, PERMISSION_CODES.ARTICLES_GENERATE_IMAGES);
  const canUseInfographics = user && hasPermission(user, PERMISSION_CODES.ARTICLES_INFOGRAPHICS);
  const canUseNewsType = user && hasPermission(user, PERMISSION_CODES.ARTICLES_NEWS_TYPE);
  const canUseComprehensiveEdit = user && hasPermission(user, PERMISSION_CODES.ARTICLES_COMPREHENSIVE_EDIT);
  const canUseContentTypeSelector = user && hasPermission(user, PERMISSION_CODES.ARTICLES_CONTENT_TYPE_SELECTOR);
  const canHideFromHomepage = user && hasPermission(user, PERMISSION_CODES.ARTICLES_HIDE_HOMEPAGE);
  
  // Check if user can backdate articles (superadmin, admin, chief_editor only)
  const canBackdateArticles = user && (
    user.role === 'superadmin' || 
    user.role === 'admin' || 
    user.role === 'chief_editor' ||
    (user.roles && user.roles.some((r: any) => 
      ['superadmin', 'admin', 'chief_editor'].includes(r.name || r)
    ))
  );
  
  // Redirect to dashboard if user doesn't have permission
  useEffect(() => {
    if (!isUserLoading && user && !canAccessEditor) {
      toast({
        title: "غير مصرح",
        description: "ليس لديك صلاحية الوصول إلى محرر المقالات",
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  }, [isUserLoading, user, canAccessEditor, navigate, toast]);

  // Live editor presence: heartbeat while this editor is open so other admins
  // can see who is currently writing what. Disabled for opinion authors who
  // edit in their own restricted flow.
  const presenceSummary = (() => {
    const fromExcerpt = (excerpt || "").trim();
    if (fromExcerpt) return fromExcerpt.slice(0, 80);
    const stripped = (content || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    return stripped.slice(0, 80);
  })();
  const presenceTitle = (title || "").trim().slice(0, 200) || "خبر بدون عنوان";
  const { coEditors } = useEditorPresence({
    enabled: !!user && !isUserLoading && !!canAccessEditor && !isOpinionAuthor,
    articleId: !isNewArticle && id ? id : null,
    articleTitle: presenceTitle,
    articleSummary: presenceSummary,
    currentUserId: user?.id ?? null,
  });

  // Opinion author restrictions: force articleType to "opinion" and auto-set author
  useEffect(() => {
    if (isOpinionAuthor && user) {
      // Force article type to opinion
      if (articleType !== "opinion") {
        setArticleType("opinion");
      }
      // Auto-set the opinion author to current user
      if (!opinionAuthorId && user.id) {
        setOpinionAuthorId(user.id);
      }
    }
  }, [isOpinionAuthor, user, articleType, opinionAuthorId]);

  // Reporter restrictions: force articleType to "news" if they don't have content type selector permission
  // Exception: if reporter also has opinion_author role, they can use opinion type
  useEffect(() => {
    if (isReporter && !isOpinionAuthor && !canUseContentTypeSelector && user) {
      // Force article type to news for reporters without content selector permission
      if (articleType !== "news" && articleType !== "infographic") {
        setArticleType("news");
      }
    }
  }, [isReporter, isOpinionAuthor, canUseContentTypeSelector, user, articleType]);

  const { data: allCategoriesRaw, isLoading: isCategoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const allCategories = Array.isArray(allCategoriesRaw) ? allCategoriesRaw : [];

  // Filter to show only core categories (exclude smart, dynamic, seasonal)
  // Opinion authors see all core categories just like other users
  const categories = allCategories.filter(cat => {
    const isCoreCategory = cat.type === "core" || !cat.type;
    return isCoreCategory;
  });

  // Load via /api/admin/articles/:id (same surface as save PATCH/POST) — the legacy
  // /api/dashboard/articles/:id path uses a heavier getArticleById join that can stall
  // and left the form empty with no loading/error UI.
  const {
    data: article,
    isLoading: isArticleLoading,
    isError: isArticleError,
    isFetched: isArticleFetched,
    refetch: refetchArticle,
    error: articleError,
  } = useQuery<ArticleWithDetails>({
    queryKey: isNewArticle ? ["article-editor-new"] : ["/api/admin/articles", id],
    enabled: !isNewArticle && !!user && !!id && !isUserLoading,
    refetchOnMount: true,
    staleTime: 0,
  });

  // Fetch media assets for this article
  const { data: mediaAssetsRaw, refetch: refetchMediaAssets } = useQuery<any[]>({
    queryKey: ["/api/articles", article?.id, "media-assets"],
    enabled: !isNewArticle && !!article?.id,
  });
  const mediaAssets = Array.isArray(mediaAssetsRaw) ? mediaAssetsRaw : [];

  // Fetch existing social cards for this article
  const { data: existingSocialCardsRaw } = useQuery<Array<{ platform: string; imageUrl: string }>>({
    queryKey: ["/api/visual-ai/social-cards/article", id],
    enabled: !isNewArticle && !!id,
  });
  const existingSocialCards = Array.isArray(existingSocialCardsRaw) ? existingSocialCardsRaw : [];

  // Load existing social cards into state when fetched
  useEffect(() => {
    if (existingSocialCards.length > 0 && !generatedSocialCards) {
      const cardsMap: {
        twitter?: string;
        instagram?: string;
        facebook?: string;
        whatsapp?: string;
        linkedin?: string;
      } = {};
      existingSocialCards.forEach(card => {
        if (card.platform === 'twitter' || card.platform === 'instagram' || 
            card.platform === 'facebook' || card.platform === 'whatsapp' || 
            card.platform === 'linkedin') {
          cardsMap[card.platform] = card.imageUrl;
        }
      });
      setGeneratedSocialCards(cardsMap);
    }
  }, [existingSocialCards]);

  // ===== Article Edit Lock Management =====
  // Extracted to hooks/useArticleEditLock.ts (refactor: article-editor-split)
  const { lockStatus, isLockedByOther } = useArticleEditLock({
    articleId: id,
    isNewArticle,
    user,
    isUserLoading,
  });

  // Load article data when editing
  useEffect(() => {
    // Guard: ignore list payloads / mismatched ids (can happen if queryKey briefly lacked id)
    if (!article || isNewArticle || Array.isArray(article) || !article.id || (id && article.id !== id)) {
      return;
    }
      console.log('[ArticleEditor] Loading article data:', {
        articleId: article.id,
        reporterId: article.reporterId,
        reporterIdType: typeof article.reporterId,
        authorId: article.authorId,
        author: article.author,
      });
      setTitle(article.title);
      setSubtitle(article.subtitle || "");
      setNewsletterSubtitle(article.newsletterSubtitle || "");
      setNewsletterExcerpt(article.newsletterExcerpt || "");
      setSlug(article.slug);
      setContent(article.content);
      setExcerpt(article.excerpt || "");
      setCategoryId(article.categoryId || "");
      // Use reporterId as is - system supports various ID formats (nanoid, UUID, etc.)
      const validReporterId = article.reporterId || null;
      console.log('[ArticleEditor] Setting reporterId:', {
        original: article.reporterId,
        validated: validReporterId,
      });
      setReporterId(validReporterId);
      // Set opinionAuthorId from article.authorId for opinion articles
      if (article.articleType === "opinion") {
        setOpinionAuthorId(article.authorId || null);
      }
      // Validate imageUrl - accept http/https URLs or relative paths starting with /
      const validImageUrl = article.imageUrl && (
        article.imageUrl.match(/^https?:\/\/.+/) || article.imageUrl.startsWith('/')
      ) ? article.imageUrl : "";
      setImageUrl(validImageUrl);
      // Set AI generated image flag from article data
      setIsAiGeneratedImage((article as any).isAiGeneratedImage || false);
      // Set thumbnailUrl if available
      const validThumbnailUrl = (article as any).thumbnailUrl && (
        (article as any).thumbnailUrl.match(/^https?:\/\/.+/) || (article as any).thumbnailUrl.startsWith('/')
      ) ? (article as any).thumbnailUrl : "";
      setThumbnailUrl(validThumbnailUrl);
      setThumbnailManuallyDeleted((article as any).thumbnailManuallyDeleted || false);
      setImageFocalPoint((article as any).imageFocalPoint || null);
      setAlbumImages(Array.isArray((article as any).albumImages) ? (article as any).albumImages : []);
      const loadedArticleType = (article.articleType as any) || "news";
      setArticleType(loadedArticleType);
      // Handle infographic type
      if (loadedArticleType === "infographic") {
        setIsInfographic(true);
        setPreviousArticleType("news"); // Default fallback
        // Load data infographic fields
        setInfographicType((article as any).infographicType || "image");
        setInfographicData((article as any).infographicData || null);
        // Load infographic banner fields
        const validBannerUrl = (article as any).infographicBannerUrl && (
          (article as any).infographicBannerUrl.match(/^https?:\/\/.+/) || (article as any).infographicBannerUrl.startsWith('/')
        ) ? (article as any).infographicBannerUrl : "";
        setInfographicBannerUrl(validBannerUrl);
        setIsAiGeneratedInfographicBanner((article as any).isAiGeneratedInfographicBanner || false);
      } else {
        setIsInfographic(false);
        setPreviousArticleType(loadedArticleType);
      }
      // Load weekly photos data if present
      if ((article as any).weeklyPhotosData?.photos) {
        setWeeklyPhotosData((article as any).weeklyPhotosData);
      }
      // Load newsType - convert "featured" to "regular" since isFeatured is now separate
      const loadedNewsType = (article.newsType as any) || "regular";
      setNewsType(loadedNewsType === "featured" ? "regular" : loadedNewsType);
      // Load isFeatured separately
      setIsFeatured(article.isFeatured || false);
      // For published articles, always reset publishType to "instant" to avoid re-scheduling
      // Only keep "scheduled" for articles that are still in scheduled status
      const savedPublishType = (article.publishType as any) || "instant";
      setPublishType(article.status === "published" ? "instant" : savedPublishType);
      if (article.scheduledAt && article.status !== "published") {
        const d = new Date(article.scheduledAt);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        setScheduledAt(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setScheduledAt("");
      }
      setHideFromHomepage(article.hideFromHomepage || false);
      // Video template fields
      setIsVideoTemplate((article as any).isVideoTemplate || false);
      setVideoUrl((article as any).videoUrl || "");
      setVideoThumbnailUrl((article as any).videoThumbnailUrl || "");
      // Validate SEO fields - truncate if too long (legacy data cleanup)
      const validMetaTitle = article.seo?.metaTitle 
        ? article.seo.metaTitle.substring(0, 70) 
        : "";
      const validMetaDescription = article.seo?.metaDescription 
        ? article.seo.metaDescription.substring(0, 160) 
        : "";
      setMetaTitle(validMetaTitle);
      setMetaDescription(validMetaDescription);
      setKeywords(article.seo?.keywords || []);
      setStatus(article.status as any);
      setReviewStatus((article as any).reviewStatus ?? null);
      setReviewNotes((article as any).reviewNotes ?? null);
      setReviewedAt((article as any).reviewedAt ?? null);
      setArticleUpdatedAt((article as any).updatedAt ?? null);
      hasLoadedArticleRef.current = true;
      
      // Load existing poll for this article
      if (article.id) {
        fetch(apiUrl(`/api/polls/article/${article.id}`), { credentials: "include" })
          .then(res => res.ok ? res.json() : null)
          .then(poll => {
            if (poll && poll.question) {
              setPollData({
                enabled: poll.isActive,
                question: poll.question,
                options: poll.options?.map((o: any) => o.text) || [],
              });
            }
          })
          .catch(err => console.error('[ArticleEditor] Error loading poll:', err));
      }
  }, [article, isNewArticle, id]);

  // Auto-save draft key - unique per article or "new" for new articles
  const autoSaveKey = `article-draft-${isNewArticle ? 'new' : id}`;

  // Function to save draft to localStorage
  const saveDraftToLocalStorage = useCallback(() => {
    // Only save if there's meaningful content
    if (!title && !content) {
      return;
    }

    const draftData = {
      title,
      subtitle,
      slug,
      content,
      excerpt,
      categoryId,
      reporterId,
      opinionAuthorId,
      articleType,
      imageUrl,
      thumbnailUrl,
      albumImages,
      imageFocalPoint,
      keywords,
      newsType,
      isFeatured,
      publishType,
      scheduledAt,
      hideFromHomepage,
      isVideoTemplate,
      videoUrl,
      videoThumbnailUrl,
      metaTitle,
      metaDescription,
      savedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(autoSaveKey, JSON.stringify(draftData));
      setAutoSaveStatus("saved");
      setLastAutoSaveTime(new Date());
      console.log('[Auto-save] Draft saved to localStorage');
    } catch (error) {
      console.error('[Auto-save] Failed to save draft:', error);
    }
  }, [
    autoSaveKey, title, subtitle, slug, content, excerpt, categoryId, 
    reporterId, opinionAuthorId, articleType, imageUrl, thumbnailUrl, 
    albumImages, imageFocalPoint, keywords, newsType, isFeatured, publishType, scheduledAt, 
    hideFromHomepage, isVideoTemplate, videoUrl, videoThumbnailUrl, metaTitle, metaDescription
  ]);

  // Function to clear draft from localStorage
  const clearDraftFromLocalStorage = useCallback(() => {
    try {
      localStorage.removeItem(autoSaveKey);
      console.log('[Auto-save] Draft cleared from localStorage');
    } catch (error) {
      console.error('[Auto-save] Failed to clear draft:', error);
    }
  }, [autoSaveKey]);

  // Function to restore draft from localStorage
  const restoreDraftFromLocalStorage = useCallback((draft: any) => {
    if (draft.title) setTitle(draft.title);
    if (draft.subtitle) setSubtitle(draft.subtitle);
    if (draft.slug) setSlug(draft.slug);
    if (draft.content) setContent(draft.content);
    if (draft.excerpt) setExcerpt(draft.excerpt);
    if (draft.categoryId) setCategoryId(draft.categoryId);
    if (draft.reporterId !== undefined) setReporterId(draft.reporterId);
    if (draft.opinionAuthorId !== undefined) setOpinionAuthorId(draft.opinionAuthorId);
    if (draft.articleType) setArticleType(draft.articleType);
    if (draft.imageUrl) setImageUrl(draft.imageUrl);
    if (draft.thumbnailUrl) setThumbnailUrl(draft.thumbnailUrl);
    if (draft.albumImages && Array.isArray(draft.albumImages)) setAlbumImages(draft.albumImages);
    if (draft.imageFocalPoint) setImageFocalPoint(draft.imageFocalPoint);
    if (draft.keywords) setKeywords(draft.keywords);
    if (draft.newsType) setNewsType(draft.newsType === "featured" ? "regular" : draft.newsType);
    if (draft.isFeatured !== undefined) setIsFeatured(draft.isFeatured);
    if (draft.publishType) setPublishType(draft.publishType);
    if (draft.scheduledAt) setScheduledAt(draft.scheduledAt);
    if (draft.hideFromHomepage !== undefined) setHideFromHomepage(draft.hideFromHomepage);
    if (draft.isVideoTemplate !== undefined) setIsVideoTemplate(draft.isVideoTemplate);
    if (draft.videoUrl) setVideoUrl(draft.videoUrl);
    if (draft.videoThumbnailUrl) setVideoThumbnailUrl(draft.videoThumbnailUrl);
    if (draft.metaTitle) setMetaTitle(draft.metaTitle);
    if (draft.metaDescription) setMetaDescription(draft.metaDescription);
    
    toast({
      title: "تم استعادة المسودة",
      description: "تم استعادة المحتوى المحفوظ تلقائياً",
    });
  }, [toast]);

  // Check for saved draft on mount (only for new articles or after article is loaded)
  useEffect(() => {
    // For new articles, check immediately
    // For existing articles, wait until the article is loaded
    if (isNewArticle || hasLoadedArticleRef.current) {
      try {
        const savedDraft = localStorage.getItem(autoSaveKey);
        if (savedDraft) {
          const draft = JSON.parse(savedDraft);
          const savedTime = new Date(draft.savedAt);
          const now = new Date();
          const hoursSinceSave = (now.getTime() - savedTime.getTime()) / (1000 * 60 * 60);
          
          // Only offer to restore if saved within last 24 hours
          if (hoursSinceSave < 24) {
            // For new articles, always show recovery dialog if there's content
            // For existing articles, only show if draft has more content than current article
            if (isNewArticle) {
              if (draft.title || draft.content) {
                setRecoveredDraft(draft);
                setShowDraftRecoveryDialog(true);
              }
            } else if (article) {
              // Check if draft has significant changes from saved article
              const hasDraftChanges = 
                (draft.content && draft.content !== article.content) ||
                (draft.title && draft.title !== article.title);
              
              if (hasDraftChanges) {
                setRecoveredDraft(draft);
                setShowDraftRecoveryDialog(true);
              }
            }
          } else {
            // Draft is too old, clear it
            clearDraftFromLocalStorage();
          }
        }
      } catch (error) {
        console.error('[Auto-save] Failed to check for saved draft:', error);
      }
    }
  }, [autoSaveKey, isNewArticle, article, clearDraftFromLocalStorage]);

  // Auto-save effect - save every 30 seconds when there are changes
  useEffect(() => {
    // Don't auto-save while loading or if nothing has been typed
    if (!title && !content) {
      return;
    }

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Set status to indicate pending save
    setAutoSaveStatus("saving");

    // Set new timeout to save after 5 seconds of inactivity
    autoSaveTimeoutRef.current = setTimeout(() => {
      saveDraftToLocalStorage();
    }, 5000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    title, subtitle, content, excerpt, categoryId, articleType,
    imageUrl, thumbnailUrl, keywords, newsType, metaTitle, metaDescription,
    saveDraftToLocalStorage
  ]);

  // حاجز الحقوق: معرّف الصورة التي أوقفت النشر، وتجاوزٌ لمرة واحدة بعد
  // قرار المحرر (توثيق أو نشر واعٍ بدون توثيق)
  const [rightsGateMediaId, setRightsGateMediaId] = useState<string | null>(null);
  const rightsGateBypassRef = useRef(false);

  // اختيار صورة من المكتبة (من المنتقي أو من شريط الاقتراحات): يضبط الحالة
  // ويُظهر تنبيهًا فقاعيًا بنواقص الصورة (نص بديل/حقوق/محتوى حسّاس) إن وُجدت
  const applyLibraryImage = (media: MediaFile) => {
    // Use url (display URL) which is either https:// or proxy URL —
    // originalUrl might be gs:// which browsers can't display
    setImageUrl(media.url);
    setIsAiGeneratedImage((media as any).isAiGenerated || false);
    setHeroImageMediaId(media.id);
    const mediaNotes: string[] = [];
    if (!media.altText) {
      mediaNotes.push("بلا نص بديل — بعد حفظ الخبر استخدم زر «وصف وتعليق ذكي»");
    }
    if (!media.rightsVerified && !media.creditText) {
      mediaNotes.push("حقوق الاستخدام غير موثّقة — يمكن توثيقها من مكتبة الوسائط");
    }
    if (media.aiHasSensitiveContent) {
      mediaNotes.push("قد تحتوي محتوى حسّاسًا بحسب التحليل الذكي");
    }
    if (mediaNotes.length > 0) {
      toast({
        title: "تم اختيار الصورة — يوجد تنبيه",
        description: mediaNotes.join(" · "),
        duration: 9000,
      });
    } else {
      toast({
        title: "تم اختيار الصورة",
        description: "تم إضافة الصورة من المكتبة",
      });
    }
  };

  // تذكير فقاعي (مرة واحدة لكل جلسة تحرير): كُتب عنوان ولا توجد صورة بارزة →
  // ذكّر المحرر بأن مكتبة الوسائط تعرض اقتراحات ذكية لهذا الخبر بدل رفع صورة جديدة
  const librarySuggestionToastShownRef = useRef(false);
  useEffect(() => {
    if (librarySuggestionToastShownRef.current || isOpinionAuthor) return;
    if (!title || title.trim().length < 20 || imageUrl) return;
    const timer = setTimeout(() => {
      if (librarySuggestionToastShownRef.current) return;
      librarySuggestionToastShownRef.current = true;
      toast({
        title: "💡 جرّب اقتراحات المكتبة",
        description: "مكتبة الوسائط تحتوي آلاف الصور — افتح «اقتراحات ذكية» لترى ما يناسب هذا الخبر قبل رفع صورة جديدة.",
        duration: 10000,
        action: (
          <ToastAction altText="فتح المكتبة" onClick={() => setShowMediaPicker(true)}>
            فتح المكتبة
          </ToastAction>
        ),
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [title, imageUrl, isOpinionAuthor, toast]);

  // Helper function to save uploaded images to media library (memoized to prevent duplicate uploads)
  const saveToMediaLibrary = useCallback(async (imageUrl: string): Promise<string | null> => {
    // If already saving this specific URL, return the existing promise
    const existingPromise = savingMediaMapRef.current.get(imageUrl);
    if (existingPromise) {
      console.log("[Media Library] Already saving this URL, returning existing promise");
      return existingPromise;
    }
    
    // Create new promise for this URL
    const savePromise = (async () => {
      try {
        const fileName = imageUrl.split('/').pop() || 'image.jpg';
        const mediaTitle = title || "صورة المقال";
        const description = (excerpt || content.substring(0, 100) || mediaTitle);
        
        const mediaFile = await apiRequest("/api/media/save-existing", {
          method: "POST",
          body: JSON.stringify({
            fileName,
            url: imageUrl,
            title: mediaTitle,
            description,
            category: "articles",
          }),
          headers: { "Content-Type": "application/json" },
        }) as MediaFile;
        
        console.log("[Media Library] Successfully saved image to library:", fileName, "ID:", mediaFile.id);
        return mediaFile.id;
      } catch (error) {
        console.error("Failed to save to media library:", error);
        // Don't show error to user - this is background operation
        return null;
      } finally {
        // Clear this URL's promise after completion
        savingMediaMapRef.current.delete(imageUrl);
      }
    })();
    
    // Store promise for potential concurrent callers of the same URL
    savingMediaMapRef.current.set(imageUrl, savePromise);
    return savePromise;
  }, [title, excerpt, content]);
  
  // Helper to fetch media ID from media library based on URL
  useEffect(() => {
    const fetchMediaIdForUrl = async (url: string, requestToken: number) => {
      try {
        const response = await apiRequest(`/api/media?url=${encodeURIComponent(url)}`, {
          method: "GET",
        }) as any;

        // GET /api/media returns an object { files, total, ... }, not an array.
        // The old code read response.length/response[0] (always undefined), so
        // it never matched and silently auto-saved a duplicate row on every edit.
        const matchedFiles = Array.isArray(response?.files) ? response.files : [];
        if (matchedFiles.length > 0) {
          const media = matchedFiles[0];
          
          // Only update state if this is still the current request
          if (imageRequestTokenRef.current === requestToken) {
            setHeroImageMediaId(media.id);
            console.log("[Media ID] Found media ID for URL:", media.id);
          } else {
            console.log("[Media ID] Discarding stale response - image changed");
          }
        } else {
          console.log("[Media ID] No media file found for URL, auto-saving to library...");
          // Auto-save image to media library if not found
          const mediaId = await saveToMediaLibrary(url);
          
          // Only update state if this is still the current request
          if (mediaId && imageRequestTokenRef.current === requestToken) {
            setHeroImageMediaId(mediaId);
            console.log("[Media ID] Auto-saved to library with ID:", mediaId);
          } else if (mediaId) {
            console.log("[Media ID] Discarding stale auto-save - image changed");
          } else {
            console.error("[Media ID] Failed to auto-save to library");
            
            // Only update state if this is still the current request
            if (imageRequestTokenRef.current === requestToken) {
              setHeroImageMediaId(null);
            }
          }
        }
      } catch (error) {
        console.error("[Media ID] Failed to fetch media ID:", error);
        
        // Only update state if this is still the current request
        if (imageRequestTokenRef.current === requestToken) {
          setHeroImageMediaId(null);
        }
      }
    };
    
    if (imageUrl && !heroImageMediaId && !isNewArticle) {
      // Increment token to invalidate any in-flight requests
      imageRequestTokenRef.current += 1;
      const currentToken = imageRequestTokenRef.current;
      
      fetchMediaIdForUrl(imageUrl, currentToken);
    }
  }, [imageUrl, heroImageMediaId, isNewArticle, saveToMediaLibrary]);

  const uploadFeaturedImageFile = async (file: File): Promise<boolean> => {
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "article");
      const uploaded = (await apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      })) as { id: string; url: string; duplicateOf?: { title?: string | null } | null };

      setImageUrl(uploaded.url);
      setIsAiGeneratedImage(false);
      setHeroImageMediaId(uploaded.id);

      if (uploaded.duplicateOf) {
        toast({
          title: "⚠️ صورة مطابقة موجودة مسبقًا في المكتبة",
          description: `الصورة مرفوعة سابقًا${uploaded.duplicateOf.title ? ` («${uploaded.duplicateOf.title}»)` : ""} — يُفضّل مستقبلًا اختيارها من المكتبة أو من شريط الاقتراحات بدل إعادة الرفع.`,
          duration: 9000,
        });
      } else {
        toast({
          title: "تم الرفع بنجاح",
          description: `الرابط: ${uploaded.url.substring(0, 50)}...`,
        });
      }
      return true;
    } catch (error) {
      console.error("Error uploading image:", error);
      toast({
        title: "خطأ",
        description: "فشل رفع الصورة",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "خطأ",
        description: "الرجاء اختيار ملف صورة فقط",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "خطأ",
        description: "حجم الصورة يجب أن يكون أقل من 5 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    await uploadFeaturedImageFile(file);
  };

  // Handler for uploading infographic banner image (horizontal 16:9 for card displays)
  const handleInfographicBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "خطأ",
        description: "الرجاء اختيار ملف صورة فقط",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "خطأ",
        description: "حجم الصورة يجب أن يكون أقل من 5 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingInfographicBanner(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "article-infographic-banner");
      const uploaded = (await apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      })) as { id: string; url: string };

      setInfographicBannerUrl(uploaded.url);
      setIsAiGeneratedInfographicBanner(false);

      toast({
        title: "تم رفع البانر بنجاح",
        description: "تم رفع بانر الإنفوجرافيك الأفقي",
      });
    } catch (error) {
      console.error("Error uploading infographic banner:", error);
      toast({
        title: "خطأ",
        description: "فشل رفع البانر",
        variant: "destructive",
      });
    } finally {
      setIsUploadingInfographicBanner(false);
    }
  };

  // Handler for AI-generating infographic banner image (horizontal 16:9 for card displays)
  const handleGenerateInfographicBanner = async () => {
    if (!title.trim()) {
      toast({
        title: "خطأ",
        description: "يجب إدخال عنوان المقال أولاً لتوليد البانر",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingInfographicBanner(true);

    try {
      // Extract clean text from content for context (remove HTML tags)
      const cleanContent = content 
        ? content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300)
        : '';
      
      // Build context-aware prompt using title and content
      const contextInfo = cleanContent 
        ? `\nموضوع المقال: ${cleanContent}...`
        : '';
      
      const bannerPrompt = `2.5D soft illustration, semi-3D smooth artistic banner for Arabic news infographic about: "${title}"${contextInfo}

Style: Soft 2.5D illustration with gentle shadows, smooth gradients, rounded shapes, pastel and vibrant colors, modern clean aesthetic, isometric elements, abstract visual metaphor representing the topic, professional news media quality, no text or letters, suitable as horizontal 16:9 thumbnail banner`;

      const response = await apiRequest<{ imageUrl: string; message?: string }>("/api/nano-banana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: bannerPrompt,
          aspectRatio: "16:9",
          imageSize: "2K",
          enableThinking: true,
          negativePrompt: "people, faces, humans, portraits, photographs, realistic photos, text, letters, words, Arabic text, English text, watermarks, logos, flat design, harsh shadows, photorealistic",
        }),
      });

      if (response.imageUrl) {
        setInfographicBannerUrl(response.imageUrl);
        setIsAiGeneratedInfographicBanner(true);

        toast({
          title: "تم توليد البانر بنجاح",
          description: "تم توليد بانر الإنفوجرافيك بأسلوب 2.5D",
        });
      } else {
        throw new Error(response.message || "فشل توليد البانر");
      }
    } catch (error: any) {
      console.error("Error generating infographic banner:", error);
      toast({
        title: "خطأ في التوليد",
        description: error.message || "فشل توليد البانر بالذكاء الاصطناعي",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingInfographicBanner(false);
    }
  };

  const saveArticleMutation = useMutation({
    mutationFn: async ({
      publishNow,
      skipNavigate: _skipNavigate,
      skipToast: _skipToast,
      submitForReview,
    }: {
      publishNow: boolean;
      skipNavigate?: boolean;
      skipToast?: boolean;
      submitForReview?: boolean;
    }) => {
      console.log('[Save Article] Starting save...', {
        isNewArticle,
        publishNow,
        title,
        slug,
        content: content?.substring(0, 50)
      });
      
      console.log('[Save Article] Current reporterId state:', {
        reporterId,
        reporterIdType: typeof reporterId,
        reporterIdIsNull: reporterId === null,
        reporterIdValue: JSON.stringify(reporterId)
      });

      // Use reporterId as is - no UUID validation needed since system uses various ID formats (nanoid, UUID, etc.)
      const validReporterId = reporterId || null;
      
      console.log('[Save Article] After validation:', {
        validReporterId,
        willSendAsNull: validReporterId === null
      });
      
      const albumSource = Array.isArray(albumImages) ? albumImages : [];
      const safeAlbumImages = albumSource.filter(url => typeof url === 'string' && url.trim().length > 0);
      const normalizedVideoUrl = typeof videoUrl === "string" ? videoUrl.trim() : "";
      const normalizedVideoThumbnailUrl = typeof videoThumbnailUrl === "string" ? videoThumbnailUrl.trim() : "";
      const effectiveSlug = slug?.trim() || generateSlug(title) || `opinion-${Date.now()}`;
      console.log('[Save Article] Album images count:', safeAlbumImages.length, 'original:', albumImages?.length);
      
      const articleData: any = {
        title,
        slug: isOpinionAuthor ? effectiveSlug : slug,
        content,
        excerpt,
        categoryId: categoryId || null,
        imageUrl: imageUrl || "",
        isAiGeneratedImage: isAiGeneratedImage,
        thumbnailUrl: thumbnailUrl || "",
        thumbnailManuallyDeleted: thumbnailManuallyDeleted,
        albumImages: safeAlbumImages,
        imageFocalPoint: imageFocalPoint || null,
        articleType,
        publishType,
        scheduledAt: publishType === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        hideFromHomepage,
        isVideoTemplate,
        videoUrl: isVideoTemplate && normalizedVideoUrl ? normalizedVideoUrl : null,
        videoThumbnailUrl: isVideoTemplate && normalizedVideoThumbnailUrl ? normalizedVideoThumbnailUrl : null,
        status: publishNow 
          ? (publishType === "scheduled" ? "scheduled" : "published")
          : "draft",
        ...(submitForReview ? { submitForReview: true } : {}),
        seo: {
          metaTitle: metaTitle ? metaTitle.substring(0, 70) : (title ? title.substring(0, 70) : ""),
          metaDescription: metaDescription ? metaDescription.substring(0, 160) : (excerpt ? excerpt.substring(0, 160) : ""),
          keywords: keywords,
        },
      };

      // Add weekly photos data for weekly_photos article type
      // Filter out empty photos (photos without imageUrl) before sending
      if (articleType === "weekly_photos") {
        const filteredPhotos = weeklyPhotosData.photos.filter(
          (photo) => photo.imageUrl && photo.imageUrl.trim() !== ""
        );
        if (filteredPhotos.length > 0) {
          articleData.weeklyPhotosData = { photos: filteredPhotos };
        }
      }
      
      // Add data infographic fields for infographic articles
      if (articleType === "infographic") {
        articleData.infographicType = infographicType;
        if (infographicType === "data" && infographicData) {
          articleData.infographicData = infographicData;
        }
        // Add infographic banner fields
        articleData.infographicBannerUrl = infographicBannerUrl || null;
        articleData.isAiGeneratedInfographicBanner = isAiGeneratedInfographicBanner;
      }
      
      // Add fields specific to news articles (not for opinion)
      if (articleType !== "opinion") {
        articleData.subtitle = subtitle;
        articleData.newsletterSubtitle = newsletterSubtitle;
        articleData.newsletterExcerpt = newsletterExcerpt;
        articleData.reporterId = validReporterId;
        articleData.newsType = newsType;
        articleData.isFeatured = isFeatured;
      } else {
        // Opinion articles always use regular newsType
        articleData.newsType = "regular";
        articleData.isFeatured = false;
        // Add opinionAuthorId for opinion articles
        if (!isOpinionAuthor && opinionAuthorId) {
          articleData.opinionAuthorId = opinionAuthorId;
        }
      }

      // For new articles, set publishedAt based on publish settings
      if (isNewArticle) {
        // Check for admin backdating first
        if (customPublishedAt && publishNow) {
          articleData.publishedAt = new Date(customPublishedAt).toISOString();
        } else if (publishNow && publishType === "instant") {
          articleData.publishedAt = new Date().toISOString();
        } else if (publishNow && publishType === "scheduled" && scheduledAt) {
          articleData.publishedAt = new Date(scheduledAt).toISOString();
        }
      } else {
        // For updates, check for admin backdating
        if (customPublishedAt) {
          articleData.publishedAt = new Date(customPublishedAt).toISOString();
          articleData.republish = false; // Don't republish when backdating
        } else {
          // Include republish flag - Backend will handle publishedAt based on this flag
          articleData.republish = republish;
        }
      }

      console.log('[Save Article] Article data prepared:', articleData);
      console.log('[Save Article] Detailed SEO data:', {
        metaTitle: articleData.seo.metaTitle,
        metaTitleLength: articleData.seo.metaTitle?.length,
        metaDescription: articleData.seo.metaDescription,
        metaDescLength: articleData.seo.metaDescription?.length,
        imageUrl: articleData.imageUrl,
        imageUrlType: typeof articleData.imageUrl,
        reporterId: articleData.reporterId,
        reporterIdType: typeof articleData.reporterId,
      });

      if (isNewArticle) {
        console.log('[Save Article] Creating NEW article via POST /api/admin/articles');
        const result = await apiRequest("/api/admin/articles", {
          method: "POST",
          body: JSON.stringify(articleData),
        });
        console.log('[Save Article] POST result:', result);
        return result;
      } else {
        console.log('[Save Article] Updating EXISTING article via PATCH /api/admin/articles/' + id);
        const result = await apiRequest(`/api/admin/articles/${id}`, {
          method: "PATCH",
          body: JSON.stringify(articleData),
        });
        console.log('[Save Article] PATCH result:', result);
        return result;
      }
    },
    onSuccess: async (data, variables) => {
      // Get the article ID (from response for new articles, or from params for existing)
      const savedArticleId = data?.id || id;

      if (data?.updatedAt) {
        setArticleUpdatedAt(
          typeof data.updatedAt === "string" ? data.updatedAt : new Date(data.updatedAt).toISOString(),
        );
      }

      // تذكير فقاعي بعد النشر: الصورة البارزة بلا نص بديل → اعرض زر التوليد الذكي
      // (غير مُعطِّل للنشر — الخبر منشور فعلًا، وهذا تحسين لاحق بضغطة واحدة)
      if (variables?.publishNow && imageUrl) {
        const heroAsset = (Array.isArray(mediaAssets) ? mediaAssets : []).find((a: any) => a?.displayOrder === 0);
        if (!heroAsset?.altText) {
          toast({
            title: "الصورة البارزة بلا نص بديل",
            description: "الخبر منشور، ويُنصح بتوليد الوصف الذكي للصورة لتحسين الوصول ونتائج البحث.",
            duration: 10000,
            action: (
              <ToastAction altText="توليد الوصف الذكي" onClick={() => { void handleGenerateHeroCaption(); }}>
                توليد الوصف
              </ToastAction>
            ),
          });
        }
      }

      // Create poll if enabled
      if (savedArticleId && pollData && pollData.enabled && pollData.question && pollData.options.filter(o => o.trim()).length >= 2) {
        try {
          const csrfToken = getCsrfToken();
          const pollRes = await fetch(apiUrl("/api/polls"), {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
            },
            credentials: "include",
            body: JSON.stringify({
              articleId: savedArticleId,
              question: pollData.question,
              options: pollData.options.filter(o => o.trim()),
            }),
          });
          if (!pollRes.ok) {
            console.error("Poll creation failed:", await pollRes.text());
          } else {
            console.log("Poll created successfully");
          }
        } catch (err) {
          console.error("Error creating poll:", err);
        }
      }
      
      // Invalidate all article-related queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage-lite"] });
      
      // If updating existing article, also invalidate its specific query
      if (!isNewArticle && id) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/articles", id] });
      }
      
      // Determine the correct success message
      const isUpdate = !isNewArticle && status === "published";
      const isScheduled = variables.publishNow && publishType === "scheduled";
      const scheduledLabel = isScheduled && scheduledAt
        ? new Date(scheduledAt).toLocaleString("ar-SA-u-ca-gregory", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "";
      const successTitle = isScheduled
        ? "تمت الجدولة بنجاح"
        : variables.publishNow
          ? (isUpdate ? "تم التحديث بنجاح" : "تم النشر بنجاح")
          : "تم الحفظ بنجاح";
      const successDescription = isScheduled
        ? (scheduledLabel ? `تمت جدولة المقال للنشر في ${scheduledLabel}` : "تمت جدولة المقال للنشر")
        : variables.publishNow
          ? (isUpdate ? "تم تحديث الخبر بنجاح" : "تم نشر المقال بنجاح")
          : "تم حفظ المقال كمسودة";
      
      if (!variables.skipToast) {
        toast({
          title: successTitle,
          description: successDescription,
        });
      }
      if (!variables.skipNavigate) {
        setTimeout(() => {
          navigate(isOpinionAuthor ? "/dashboard/opinion-author" : "/dashboard/articles");
        }, 1000);
      }
    },
    onError: (error: Error) => {
      console.error('[Save Article] Error:', error.message, error);
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ المقال",
        variant: "destructive",
      });
    },
  });

  // Clear draft after successful save to server
  useEffect(() => {
    if (saveArticleMutation.isSuccess) {
      clearDraftFromLocalStorage();
    }
  }, [saveArticleMutation.isSuccess, clearDraftFromLocalStorage]);

  // ===== AI tools =====
  // Extracted to hooks/useArticleAiTools.ts (refactor: article-editor-split)
  const {
    generateSummaryMutation,
    proofreadTitleMutation,
    proofreadMutation,
    generateTitlesMutation,
    autoClassifyMutation,
    generateSeoMutation,
    generateAllInOneMutation,
    editAndGenerateMutation,
    analyzeSEOMutation,
    generateSocialCardsMutation,
    generateSmartContentMutation,
  } = useArticleAiTools({
    id,
    isNewArticle,
    categories,
    title,
    subtitle,
    content,
    excerpt,
    categoryId,
    keywords,
    metaTitle,
    metaDescription,
    newsletterSubtitle,
    newsletterExcerpt,
    imageUrl,
    thumbnailUrl,
    status,
    generatedSocialCards,
    setTitle,
    setSubtitle,
    setSlug,
    setContent,
    setExcerpt,
    setCategoryId,
    setKeywords,
    setMetaTitle,
    setMetaDescription,
    setNewsletterSubtitle,
    setNewsletterExcerpt,
    setTitleProofreadResult,
    setShowTitleProofreadDialog,
    setProofreadIssues,
    setShowProofreadDialog,
    setIsClassifying,
    setIsAnalyzingSEO,
    setIsGeneratingSocialCards,
    setGeneratedSocialCards,
  });

  const handleTitleChange = (value: string) => {
    console.log('[handleTitleChange] Called with:', value);
    console.log('[handleTitleChange] isNewArticle:', isNewArticle);
    
    setTitle(value);
    
    // Always auto-generate slug for new articles as user types
    if (isNewArticle) {
      const generatedSlug = generateSlug(value);
      console.log('[Slug Generation] Title:', value, '-> Slug:', generatedSlug);
      setSlug(generatedSlug);
    } else {
      console.log('[Slug Generation] SKIPPED - not a new article');
    }
    
    if (!metaTitle) {
      setMetaTitle(value);
    }
  };

  const handleGenerateSummary = async () => {
    if (!content || typeof content !== 'string' || !content.trim()) return;
    generateSummaryMutation.mutate();
  };

  const handleGenerateTitle = async () => {
    if (!content || typeof content !== 'string' || !content.trim()) return;
    generateTitlesMutation.mutate();
  };

  const handleApplyInfographicSuggestions = (suggestions: any) => {
    // Apply title and subtitle
    if (suggestions.title) {
      setTitle(suggestions.title);
    }
    
    if (suggestions.subtitle) {
      setSubtitle(suggestions.subtitle);
    }
    
    // Apply keywords
    if (suggestions.keywords && Array.isArray(suggestions.keywords)) {
      setKeywords(suggestions.keywords);
    }
    
    // Apply description or bullet points to content or excerpt
    if (suggestions.description) {
      // If content is empty, set it, otherwise append to excerpt
      if (!content || content.trim() === '') {
        setContent(suggestions.description);
      } else {
        setExcerpt(suggestions.description);
      }
    }
  };

  const handleGenerateSmartContent = async () => {
    if (!content || typeof content !== 'string' || !content.trim()) {
      toast({
        title: "تنبيه",
        description: "يجب كتابة محتوى الخبر أولاً",
        variant: "destructive",
      });
      return;
    }
    generateSmartContentMutation.mutate();
  };

  const handleGenerateAllInOne = () => {
    // Only require content (title will be generated!)
    if (!content) {
      toast({
        title: "تنبيه",
        description: "يجب كتابة المحتوى أولاً",
        variant: "destructive",
      });
      return;
    }
    
    if (content.length < 100) {
      toast({
        title: "تنبيه",
        description: "المحتوى يجب أن يكون 100 حرف على الأقل",
        variant: "destructive",
      });
      return;
    }
    
    generateAllInOneMutation.mutate();
  };

  const handleSave = async (
    publishNow = false,
    options?: { skipNavigate?: boolean; skipToast?: boolean; submitForReview?: boolean },
  ): Promise<{ ok: true; articleId: string } | { ok: false }> => {
    console.log('[handleSave] Called with publishNow:', publishNow, 'albumImages:', albumImages?.length, 'isSaving:', isSaving, 'isLockedByOther:', isLockedByOther);

    if (isSaving) {
      console.warn('[handleSave] Already saving, ignoring click');
      return { ok: false };
    }

    const missingFields = [];

    if (!title || typeof title !== 'string' || !title.trim()) {
      missingFields.push("العنوان الرئيسي");
    }
    if (!isOpinionAuthor && (!slug || typeof slug !== 'string' || !slug.trim())) {
      missingFields.push("رابط المقال (Slug)");
    }
    if (!content || typeof content !== 'string' || !content.trim()) {
      missingFields.push("محتوى المقال");
    }
    if (!isOpinionAuthor && !categoryId) {
      missingFields.push("التصنيف");
    }

    if (missingFields.length > 0) {
      console.log('[handleSave] Missing fields:', missingFields);
      toast({
        title: "حقول مطلوبة",
        description: `الرجاء ملء: ${missingFields.join(" - ")}`,
        variant: "destructive",
      });
      return { ok: false };
    }

    // حاجز الحقوق (غير مانع): عند النشر بصورة بارزة بلا حقوق موثّقة، افتح
    // نموذج التوثيق السريع. فحص best-effort — أي فشل فيه لا يعطّل النشر.
    if (publishNow && !isOpinionAuthor && imageUrl && heroImageMediaId && !rightsGateBypassRef.current) {
      try {
        const gov = (await apiRequest(`/api/media/${heroImageMediaId}/governance`, {
          method: "GET",
        })) as { rightsVerified?: boolean; creditText?: string | null } | null;
        if (gov && !gov.rightsVerified && !gov.creditText) {
          setRightsGateMediaId(heroImageMediaId);
          return { ok: false };
        }
      } catch (error) {
        console.warn('[handleSave] rights check failed (non-blocking):', error);
      }
    }
    rightsGateBypassRef.current = false;

    let savedArticleIdForReview: string | null = null;
    try {
      console.log('[handleSave] Calling saveArticleMutation.mutateAsync');
      const saved = await saveArticleMutation.mutateAsync({
        publishNow,
        skipNavigate: options?.skipNavigate,
        skipToast: options?.skipToast,
        submitForReview: options?.submitForReview,
      });
      const articleId = saved?.id || id;
      if (!articleId) return { ok: false };
      savedArticleIdForReview = articleId;
      if (options?.submitForReview && savedArticleIdForReview) {
        // Some deployed server versions save the new row successfully but
        // ignore submitForReview on the create request. Never show a success
        // toast based on an optimistic client state: confirm the persisted
        // review status, with the dedicated submit endpoint as a safe fallback.
        const confirmed = saved?.reviewStatus === "pending_review"
          ? saved
          : await apiRequest(`/api/my/articles/${articleId}/submit-review`, { method: "POST" });

        if (confirmed?.reviewStatus !== "pending_review") {
          throw new Error("لم يؤكد الخادم استلام المقال للمراجعة");
        }

        setReviewStatus("pending_review");
        markArticleSubmittedInAnalyticsCache(queryClient, {
          id: articleId,
          reviewStatus: "pending_review",
          status: confirmed?.status ?? saved?.status,
          updatedAt: confirmed?.updatedAt ?? saved?.updatedAt,
        });
        invalidateContributorAnalytics(queryClient);
      }
      return { ok: true, articleId };
    } catch (err) {
      console.error('[handleSave] Save failed:', err);
      if (options?.submitForReview && savedArticleIdForReview) {
        toast({
          title: "لم يتم الإرسال",
          description: err instanceof Error ? err.message : "تعذر تأكيد وصول المقال إلى فريق التحرير",
          variant: "destructive",
        });
      }
      return { ok: false };
    }
  };

  const navigateAfterContributorSubmit = () => {
    setTimeout(() => {
      navigate(isOpinionAuthor ? "/dashboard/opinion-author" : "/dashboard/articles");
    }, 600);
  };

  /** Save + submit-for-review in one PATCH (no race with a follow-up POST). */
  const handleSaveAndSubmitForReview = async () => {
    const saveResult = await handleSave(false, {
      skipNavigate: true,
      skipToast: true,
      submitForReview: true,
    });
    if (!saveResult.ok) return;

    toast({
      title: "تم الإرسال",
      description: "عاد المحتوى إلى مسودات فريق التحرير للمراجعة",
    });
    navigateAfterContributorSubmit();
  };

  const handleAddLink = (suggestion: { text: string; position: number; length: number }, url: string) => {
    if (!editorInstance) {
      toast({
        title: "خطأ",
        description: "المحرر غير جاهز. الرجاء المحاولة مرة أخرى",
        variant: "destructive",
      });
      return;
    }

    // البحث عن النص في المحرر باستخدام regex للدقة
    const searchText = suggestion.text.trim();
    
    // استخدام findChildren للبحث في عقد المحرر
    let found = false;
    const { state } = editorInstance;
    
    state.doc.descendants((node, pos) => {
      if (found) return false; // توقف بعد إيجاد أول مطابقة
      
      if (node.isText && node.text) {
        // البحث عن النص في هذه العقدة
        const textContent = node.text;
        const index = textContent.indexOf(searchText);
        
        if (index !== -1) {
          // وجدنا النص! احسب الموقع الدقيق في المحرر
          const from = pos + index;
          const to = from + searchText.length;
          
          // تطبيق الرابط
          editorInstance
            .chain()
            .focus()
            .setTextSelection({ from, to })
            .setLink({ href: url })
            .run();
          
          found = true;
          
          toast({
            title: "تم إضافة الرابط بنجاح",
            description: `تم ربط "${searchText}" بالرابط المقترح`,
          });
          
          return false; // توقف عن البحث
        }
      }
      return true; // استمر في البحث
    });
    
    if (!found) {
      // إذا لم نجد النص، جرب البحث بطريقة أخرى
      const editorText = state.doc.textContent;
      const index = editorText.indexOf(searchText);
      
      if (index !== -1) {
        // حاول حساب الموقع بناءً على النص الكامل
        // هذه طريقة احتياطية قد لا تكون دقيقة 100%
        let charCount = 0;
        let targetFrom = -1;
        
        state.doc.descendants((node, pos) => {
          if (targetFrom !== -1) return false;
          
          if (node.isText && node.text) {
            const nodeLength = node.text.length;
            if (charCount + nodeLength > index) {
              // النص يبدأ في هذه العقدة
              const localIndex = index - charCount;
              targetFrom = pos + localIndex;
              return false;
            }
            charCount += nodeLength;
          }
          return true;
        });
        
        if (targetFrom !== -1) {
          const targetTo = targetFrom + searchText.length;
          
          editorInstance
            .chain()
            .focus()
            .setTextSelection({ from: targetFrom, to: targetTo })
            .setLink({ href: url })
            .run();
          
          toast({
            title: "تم إضافة الرابط بنجاح",
            description: `تم ربط "${searchText}" بالرابط المقترح`,
          });
        } else {
          toast({
            title: "لم يتم العثور على النص",
            description: `النص "${searchText}" غير موجود في المحتوى الحالي`,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "لم يتم العثور على النص",
          description: `النص "${searchText}" غير موجود في المحتوى الحالي`,
          variant: "destructive",
        });
      }
    }
  };

  // Create media asset caption
  const createCaptionMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest(`/api/articles/${article?.id}/media-assets`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "تم إضافة التعريف بنجاح" });
      refetchMediaAssets();
    },
    onError: () => {
      toast({ title: "فشل في إضافة التعريف", variant: "destructive" });
    },
  });

  // Update media asset caption
  const updateCaptionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/media-assets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "تم تحديث التعريف بنجاح" });
      refetchMediaAssets();
    },
    onError: () => {
      toast({ title: "فشل في تحديث التعريف", variant: "destructive" });
    },
  });

  // Delete media asset caption
  const deleteCaptionMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/media-assets/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({ title: "تم حذف التعريف بنجاح" });
      refetchMediaAssets();
    },
    onError: () => {
      toast({ title: "فشل في حذف التعريف", variant: "destructive" });
    },
  });

  // "وصف وتعليق ذكي": one-click AI alt text + caption for the hero image, saved
  // straight into the hero media asset (displayOrder 0). Requires a saved
  // article (article_media_assets needs an articleId) — the button is disabled
  // with a "متاح بعد حفظ الخبر" hint until then.
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const handleGenerateHeroCaption = async () => {
    if (!imageUrl || !article?.id) return;
    setGeneratingCaption(true);
    try {
      const r = (await apiRequest("/api/media/analyze", {
        method: "POST",
        body: JSON.stringify({ imageUrl, articleTitle: title, articleContent: content }),
        headers: { "Content-Type": "application/json" },
      })) as {
        altText: string;
        caption: string;
        keywords: string[];
        relevanceScore: number | null;
        qualityScore: number | null;
        hasSensitiveContent: boolean;
      };
      const data = {
        mediaFileId: heroImageMediaId || null,
        locale: "ar",
        altText: r.altText || null,
        captionPlain: r.caption || null,
        keywordTags: r.keywords?.length ? r.keywords : null,
        displayOrder: 0,
      };
      const existing = mediaAssets.find((a: any) => a.displayOrder === 0);
      if (existing?.id) {
        updateCaptionMutation.mutate({ id: existing.id, data });
      } else {
        createCaptionMutation.mutate(data);
      }
      const bits: string[] = [];
      if (r.relevanceScore != null) bits.push(`ملاءمة ${r.relevanceScore}%`);
      if (r.qualityScore != null) bits.push(`جودة ${r.qualityScore}%`);
      if (r.hasSensitiveContent) bits.push("⚠️ محتوى حسّاس");
      toast({ title: "تم توليد الوصف والتعليق", description: bits.join(" · ") || "تم حفظه في تعريف الصورة" });
    } catch (error: any) {
      toast({ title: "تعذّر التوليد", description: error.message || "حدث خطأ", variant: "destructive" });
    } finally {
      setGeneratingCaption(false);
    }
  };

  // Delete media attachment
  const deleteAttachmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/media-assets/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({ title: "تم حذف المرفق بنجاح" });
      refetchMediaAssets();
    },
    onError: () => {
      toast({ title: "فشل في حذف المرفق", variant: "destructive" });
    },
  });

  // Reorder media attachments
  const reorderAttachmentsMutation = useMutation({
    mutationFn: async (assetIds: string[]) => {
      return apiRequest(`/api/articles/${article?.id}/media-assets/reorder`, {
        method: "POST",
        body: JSON.stringify({ assetIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      refetchMediaAssets();
    },
    onError: () => {
      toast({ title: "فشل في إعادة ترتيب المرفقات", variant: "destructive" });
    },
  });

  // Drag and drop sensors for attachments reordering
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for attachments reordering
  const handleAttachmentDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const filteredAssets = mediaAssets
        .filter((a: any) => a.mediaFile?.url || a.url)
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      const oldIndex = filteredAssets.findIndex((a: any) => a.id === active.id);
      const newIndex = filteredAssets.findIndex((a: any) => a.id === over?.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(filteredAssets, oldIndex, newIndex);
        reorderAttachmentsMutation.mutate(newOrder.map((a: any) => a.id));
      }
    }
  };

  // Add new attachment
  const addAttachmentMutation = useMutation({
    mutationFn: async (data: { mediaFileId: string; altText?: string }) => {
      const maxOrder = mediaAssets.reduce((max: number, asset: any) => 
        Math.max(max, asset.displayOrder ?? 0), 0);
      return apiRequest(`/api/articles/${article?.id}/media-assets`, {
        method: "POST",
        body: JSON.stringify({
          mediaFileId: data.mediaFileId,
          altText: data.altText || "مرفق",
          displayOrder: maxOrder + 1,
          locale: "ar",
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "تم إضافة المرفق بنجاح" });
      refetchMediaAssets();
      setShowAttachmentUploadDialog(false);
    },
    onError: () => {
      toast({ title: "فشل في إضافة المرفق", variant: "destructive" });
    },
  });

  const isSaving = saveArticleMutation.isPending;
  const isGeneratingAI = 
    generateSummaryMutation.isPending || 
    generateTitlesMutation.isPending || 
    generateSmartContentMutation.isPending ||
    generateAllInOneMutation.isPending ||
    generateSeoMutation.isPending ||
    autoClassifyMutation.isPending;

  // Early return if user doesn't have permission
  if (!isUserLoading && user && !canAccessEditor) {
    return null;
  }

  // Editing an existing article: show loading / error instead of an empty form
  if (!isNewArticle && (isUserLoading || isArticleLoading)) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground" data-testid="article-editor-loading">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">جاري تحميل المقال...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!isNewArticle && (isArticleError || (isArticleFetched && !article?.id))) {
    const message =
      articleError instanceof Error && articleError.message
        ? articleError.message
        : "تعذر جلب بيانات المقال. تحقق من الصلاحيات أو أعد المحاولة.";
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-lg space-y-4 py-16 text-center" data-testid="article-editor-error">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold">تعذر تحميل المقال</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => refetchArticle()} data-testid="button-retry-load-article">
              <RefreshCw className="h-4 w-4 ml-2" />
              إعادة المحاولة
            </Button>
            <Button variant="ghost" asChild>
              <Link href={isOpinionAuthor ? "/dashboard/opinion-author" : "/dashboard/articles"}>
                العودة
              </Link>
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      {/* Draft Recovery Dialog */}
      {/* Title Proofread Dialog */}
      <TitleProofreadDialog
        open={showTitleProofreadDialog}
        onOpenChange={setShowTitleProofreadDialog}
        result={titleProofreadResult}
        onApplySuggestion={handleTitleChange}
      />

      {/* Proofread Dialog - Display spelling issues without auto-applying */}
      <ProofreadDialog
        open={showProofreadDialog}
        onOpenChange={setShowProofreadDialog}
        issues={proofreadIssues}
        setIssues={setProofreadIssues}
        content={content}
        setContent={setContent}
      />

      <AlertDialog open={showDraftRecoveryDialog} onOpenChange={setShowDraftRecoveryDialog}>
        <AlertDialogContent className="max-w-md" data-testid="dialog-draft-recovery">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-right">
              <RotateCcw className="h-5 w-5 text-blue-500" />
              استعادة المسودة المحفوظة
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              {recoveredDraft && (
                <div className="space-y-2">
                  <p>تم العثور على مسودة محفوظة تلقائياً:</p>
                  <div className="bg-muted p-3 rounded-md text-sm space-y-1">
                    {recoveredDraft.title && (
                      <p><strong>العنوان:</strong> {recoveredDraft.title.substring(0, 50)}...</p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      <Clock className="h-3 w-3 inline ml-1" />
                      {new Date(recoveredDraft.savedAt).toLocaleString('ar-SA-u-ca-gregory')}
                    </p>
                  </div>
                  <p className="text-amber-600 dark:text-amber-400 text-sm">
                    هل تريد استعادة هذه المسودة أم تجاهلها؟
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={() => {
                if (recoveredDraft) {
                  restoreDraftFromLocalStorage(recoveredDraft);
                }
                setShowDraftRecoveryDialog(false);
              }}
              className="gap-2"
              data-testid="button-restore-draft"
            >
              <RotateCcw className="h-4 w-4" />
              استعادة المسودة
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={() => {
                clearDraftFromLocalStorage();
                setShowDraftRecoveryDialog(false);
              }}
              className="gap-2"
              data-testid="button-discard-draft"
            >
              <Trash2 className="h-4 w-4" />
              تجاهل
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Scope wrapper for the per-card CSS below. Page background is
          deliberately left at the DashboardLayout default so this
          editor matches the rest of the dashboard. */}
      <div className="article-editor-stage" dir="rtl">
        <style>{`
          /* Flat, no-shadow cards with sharp 1px borders and a very
             faint cool tint. Inputs / selects / textareas / the
             editor surface stay white so they pop out of the card
             instead of blending into it. */
          .article-editor-stage .shadcn-card {
            box-shadow: none !important;
            border-width: 1px;
            border-color: hsl(var(--border));
          }

          /* Cool palette — sky / slate / mint / cyan / lavender / teal.
             Direct-child Cards of each grid column rotate through these.
             Opacity is tiny so the colour reads as "paper of a different
             stock" rather than a coloured panel. */
          .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+1) {
            background-color: hsl(210 40% 97.5%);  /* slate paper */
            border-color: hsl(210 25% 88%);
          }
          .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+2) {
            background-color: hsl(205 70% 97%);    /* sky paper */
            border-color: hsl(205 50% 88%);
          }
          .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+3) {
            background-color: hsl(160 45% 97%);    /* mint paper */
            border-color: hsl(160 30% 86%);
          }
          .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+4) {
            background-color: hsl(190 55% 97%);    /* cyan paper */
            border-color: hsl(190 40% 86%);
          }
          .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+5) {
            background-color: hsl(240 35% 97.5%);  /* lavender paper */
            border-color: hsl(240 25% 88%);
          }
          .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+6) {
            background-color: hsl(180 35% 97%);    /* teal paper */
            border-color: hsl(180 25% 86%);
          }

          /* Force every interactive surface inside a tinted card back to
             white so they read as distinct fields, not as part of the
             card itself. */
          .article-editor-stage .shadcn-card input:not([type="checkbox"]):not([type="radio"]),
          .article-editor-stage .shadcn-card textarea,
          .article-editor-stage .shadcn-card select,
          .article-editor-stage .shadcn-card [role="combobox"],
          .article-editor-stage .shadcn-card [role="textbox"],
          .article-editor-stage .shadcn-card .ProseMirror,
          .article-editor-stage .shadcn-card [contenteditable="true"] {
            background-color: hsl(var(--background)) !important;
          }
          /* The rich-text editor wrapper (toolbar + surface) — keep its
             outer wrapper neutral so the giant editor block doesn't
             flood the page with one tint. */
          .article-editor-stage .shadcn-card .tiptap,
          .article-editor-stage .shadcn-card .editor-shell,
          .article-editor-stage .shadcn-card [data-editor-shell] {
            background-color: hsl(var(--background)) !important;
            border-radius: 0.5rem;
          }

          /* Dark mode — cool tones at low lightness, sharp borders. */
          .dark .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+1) {
            background-color: hsl(210 25% 12%);
            border-color: hsl(210 15% 22%);
          }
          .dark .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+2) {
            background-color: hsl(205 30% 13%);
            border-color: hsl(205 20% 23%);
          }
          .dark .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+3) {
            background-color: hsl(160 20% 12%);
            border-color: hsl(160 15% 22%);
          }
          .dark .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+4) {
            background-color: hsl(190 25% 12%);
            border-color: hsl(190 18% 22%);
          }
          .dark .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+5) {
            background-color: hsl(240 20% 13%);
            border-color: hsl(240 15% 23%);
          }
          .dark .article-editor-stage > div > .grid > div > .shadcn-card:nth-of-type(6n+6) {
            background-color: hsl(180 20% 12%);
            border-color: hsl(180 15% 22%);
          }
        `}</style>
       <div className="container mx-auto">
        {/* Concurrent Editors Alert - Warns when other editors are working on the same article */}
        {coEditors.length > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 p-4 bg-amber-50 dark:bg-card border border-amber-500 dark:border-border rounded-lg"
            data-testid="alert-concurrent-editors"
          >
            <AlertCircle className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0" />
            <div className="flex-1 min-w-[200px] text-sm text-amber-800 dark:text-amber-200">
              <span className="font-medium">
                {coEditors.length === 1
                  ? `${coEditors[0].userName} يحرّر هذا الخبر الآن أيضاً`
                  : `${coEditors.length} محررين يعملون على هذا الخبر الآن أيضاً`}
              </span>
              {coEditors.length > 1 && (
                <span className="block text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {coEditors.map((e) => e.userName).join("، ")}
                </span>
              )}
              <span className="block text-xs text-amber-700 dark:text-amber-300 mt-1">
                تجنّب الكتابة فوق تعديلات زميلك. يُنصح بتحديث آخر نسخة قبل المتابعة.
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => {
                if (id) {
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/articles", id] });
                }
              }}
              data-testid="button-refresh-concurrent-editors"
            >
              <RefreshCw className="h-4 w-4" />
              تحديث الآن
            </Button>
          </div>
        )}

        {/* Lock Alert - When article is locked by another user */}
        {isLockedByOther && lockStatus?.lockedBy && (
          <div 
            className="mb-6 flex items-center gap-3 p-4 bg-red-50 dark:bg-card border border-red-500 dark:border-border rounded-lg"
            data-testid="lock-alert"
          >
            <Lock className="h-5 w-5 text-red-700 dark:text-red-400 shrink-0" />
            <span className="text-red-700 dark:text-red-400 font-medium">
              المقال تحت إجراء التعديل من قبل {lockStatus.lockedBy.name}
            </span>
          </div>
        )}

        {/* Lock Status Indicator - When current user owns the lock */}
        {!isNewArticle && lockStatus?.isOwner && (
          <div 
            className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"
            data-testid="lock-status"
          >
            <Lock className="h-3 w-3 text-green-500" />
            <span>لديك حق التحرير الحصري لهذا المقال</span>
          </div>
        )}

        {/* Page Header with Actions - Mobile Optimized */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 p-4 shadow-sm">
          {/* Title Row */}
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="shrink-0"
              data-testid="button-back"
            >
              <Link href={isOpinionAuthor ? "/dashboard/opinion-author" : "/dashboard/articles"}>
                <a className="gap-2">
                  <ArrowRight className="h-4 w-4" />
                  <span className="hidden sm:inline">العودة</span>
                </a>
              </Link>
            </Button>
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold truncate">
                {isNewArticle ? `${contentNoun} جديد` : `تحرير ال${contentNoun}`}
              </h1>
              <p className="hidden sm:block text-xs text-muted-foreground mt-0.5">
                {isNewArticle
                  ? isOpinionAuthor
                    ? "اكتب مقالك واحفظه أو أرسله إلى فريق التحرير"
                    : `اكتب ${contentNounAccusative} جديداً وحدد إعدادات النشر`
                  : `حدّث محتوى ال${contentNoun} وأعدّ إرساله`}
              </p>
            </div>
            {/* Auto-save indicator - visible on desktop */}
            {(autoSaveStatus === "saving" || autoSaveStatus === "saved") && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground shrink-0" data-testid="autosave-indicator">
                {autoSaveStatus === "saving" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>جاري الحفظ التلقائي...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span>تم الحفظ التلقائي</span>
                    {lastAutoSaveTime && (
                      <span className="text-muted-foreground/60">
                        ({lastAutoSaveTime.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Actions Row */}
          <div className={isOpinionAuthor ? "flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end" : "flex items-center justify-between gap-2 sm:justify-end"}>
            {/* Auto-save indicator - visible on mobile only */}
            {(autoSaveStatus === "saving" || autoSaveStatus === "saved") && (
              <div className="flex sm:hidden items-center gap-1.5 text-xs text-muted-foreground" data-testid="autosave-indicator-mobile">
                {autoSaveStatus === "saving" ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span>تم الحفظ</span>
                    {lastAutoSaveTime && (
                      <span className="text-muted-foreground/60">
                        ({lastAutoSaveTime.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
            <div className={isOpinionAuthor ? "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center" : "flex items-center gap-2"}>
              {!isNewArticle && id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/dashboard/article/${id}/preview`, '_blank')}
                  className="gap-1.5 sm:gap-2"
                  data-testid="button-preview"
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden xs:inline">معاينة</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(false)}
                disabled={isSaving || isLockedByOther}
                className="gap-1.5 sm:gap-2"
                data-testid="button-save-draft"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="hidden xs:inline">حفظ كمسودة</span>
                <span className="xs:hidden">حفظ</span>
              </Button>
              {reviewStatus === "needs_changes" && isContributorRole && !canPublish && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleSaveAndSubmitForReview()}
                  disabled={
                    submitReviewMutation.isPending ||
                    isSaving ||
                    isLockedByOther
                  }
                  className="gap-1.5 sm:gap-2"
                  data-testid="button-resubmit-review"
                >
                  {submitReviewMutation.isPending || isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  إرسال بعد التعديل
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  if (!canPublish) {
                    void handleSaveAndSubmitForReview();
                    return;
                  }
                  void handleSave(true);
                }}
                disabled={isSaving || submitReviewMutation.isPending || isLockedByOther}
                className="gap-1.5 sm:gap-2"
                data-testid="button-publish"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : !isNewArticle && status === "published" ? (
                  <RefreshCw className="h-4 w-4" />
                ) : publishType === "scheduled" && canPublish ? (
                  <Clock className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {canPublish 
                  ? (!isNewArticle && status === "published" ? "تحديث" : publishType === "scheduled" ? "جدولة" : "نشر")
                  : <span className="hidden xs:inline">إرسال للمراجعة</span>
                }
                {!canPublish && <span className="xs:hidden">إرسال</span>}
              </Button>
            </div>
          </div>
        </div>
        <div className={isOpinionAuthor ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start" : "grid grid-cols-1 lg:grid-cols-10 gap-6"}>
          {/* Main Content Area - 70% */}
          <div className={isOpinionAuthor ? "flex min-w-0 flex-col gap-6" : "lg:col-span-7 space-y-6"}>
            {isOpinionAuthor && (
              <div className="lg:hidden">
                <WriterEditorialNoticesMobile />
              </div>
            )}
            {reviewStatus === "needs_changes" && reviewNotes && isContributorRole && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-card dark:border-border p-4 space-y-3">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  يؤسفنا إبلاغكم بوجود بعض الملاحظات على {articleType === "opinion" ? "المقال" : "الخبر"}
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200/90 whitespace-pre-wrap leading-relaxed">
                  {reviewNotes}
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                  بعد إجراء التعديلات، احفظ ثم اضغط «إرسال بعد التعديل» ليعود المحتوى إلى مسودات فريق التحرير.
                </p>
              </div>
            )}
            {/* Reporter Info Banner - shows actual person who entered content */}
            {!isOpinionAuthor && (() => {
              const sourceMetadata = (article as any)?.sourceMetadata;
              const reporter = (article as any)?.reporter;
              const enteredBy = (article as any)?.enteredBy;
              
              // Priority: 1. sourceMetadata.senderName (email/WhatsApp) 
              //           2. reporter from users table (if not generic)
              //           3. author from users table (the person who entered via editor)
              let enteredByName = null;
              let sourceType = null;
              
              // Helper to check if name is generic (should be skipped)
              const isGenericName = (name: string) => {
                const genericNames = ['صحيفة سبق', 'سبق', 'صحيفة'];
                return genericNames.includes(name?.trim());
              };
              
              if (sourceMetadata?.senderName) {
                enteredByName = sourceMetadata.senderName;
                // Check both 'type' and 'source' fields for compatibility
                const entryMethod = sourceMetadata.type || sourceMetadata.source;
                sourceType = entryMethod === 'whatsapp' ? 'عبر الواتساب' : 
                             entryMethod === 'email' ? 'عبر البريد الذكي' : null;
              } else if (reporter?.firstName || reporter?.lastName) {
                const fullName = [reporter.firstName, reporter.lastName].filter(Boolean).join(' ');
                if (fullName && !isGenericName(fullName)) {
                  enteredByName = fullName;
                }
              }
              
              // Fallback to enteredBy (author) if no reporter name found
              if (!enteredByName && (enteredBy?.firstName || enteredBy?.lastName)) {
                const authorName = [enteredBy.firstName, enteredBy.lastName].filter(Boolean).join(' ');
                if (authorName && !isGenericName(authorName)) {
                  enteredByName = authorName;
                  sourceType = 'المحرر';
                }
              }
              
              if (!enteredByName) return null;
              
              return (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-card border border-blue-200 dark:border-border rounded-lg text-sm">
                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-blue-700 dark:text-blue-300">
                    تم إدخال الخبر بواسطة: <strong>{enteredByName}</strong>
                    {sourceType && <span className="text-blue-500 dark:text-blue-400 mr-2">({sourceType})</span>}
                  </span>
                </div>
              );
            })()}
            {/* Title with AI */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>العنوان الرئيسي</CardTitle>
                  {isInfographic && (
                    <InfographicAiDialog
                      content={content}
                      title={title}
                      category={categories?.find(c => c.id === categoryId)?.nameAr}
                      onApplySuggestions={handleApplyInfographicSuggestions}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="اكتب عنوان المقال..."
                    className="flex-1"
                    disabled={isLockedByOther}
                    data-testid="input-title"
                  />
                  {!isOpinionAuthor && <Button
                    variant="outline"
                    size="icon"
                    onClick={() => proofreadTitleMutation.mutate()}
                    disabled={proofreadTitleMutation.isPending || !title || !title.trim() || isLockedByOther}
                    title="تدقيق لغوي للعنوان"
                    data-testid="button-proofread-title"
                  >
                    {proofreadTitleMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SpellCheck className="h-4 w-4" />
                    )}
                  </Button>}
                  {!isOpinionAuthor && <Button
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateTitle}
                    disabled={isGeneratingAI || !content || typeof content !== 'string' || !content.trim()}
                    title="اقتراح من الذكاء الاصطناعي"
                    data-testid="button-ai-title"
                  >
                    {isGeneratingAI ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>}
                </div>
                {!isOpinionAuthor && <InlineHeadlineSuggestions
                  language="ar"
                  editorInstance={editorInstance}
                  currentTitle={title}
                  onTitleChange={setTitle}
                  onSlugChange={setSlug}
                />}
                <p className="text-xs text-muted-foreground">
                  {(title || "").length}/200 حرف
                </p>
              </CardContent>
            </Card>

            {/* Subtitle - Hidden for opinion articles */}
            {articleType !== "opinion" && !isOpinionAuthor && (
              <Card>
                <CardHeader>
                  <CardTitle>العنوان الفرعي</CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    value={subtitle}
                    onChange={(e) => setSubtitle(e.target.value)}
                    placeholder="عنوان فرعي (اختياري)..."
                    maxLength={120}
                    disabled={isLockedByOther}
                    data-testid="input-subtitle"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    {(subtitle || "").length}/120 حرف
                    {(subtitle || "").length > 100 && (
                      <span className="text-amber-500 mr-2">قريب من الحد الأقصى</span>
                    )}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Newsletter Content - البريد الذكي */}
            {articleType !== "opinion" && !isOpinionAuthor && (
              <Collapsible open={newsletterOpen} onOpenChange={setNewsletterOpen}>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid="collapsible-newsletter-content"
                      >
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            البريد الذكي
                          </CardTitle>
                          <p className="text-xs text-muted-foreground mt-1">
                            عنوان فرعي وملخص مخصص للنشرة الإخبارية
                          </p>
                        </div>
                        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${newsletterOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </CollapsibleTrigger>
                    <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!title || !content) {
                        toast({
                          title: "تنبيه",
                          description: "يجب إدخال العنوان والمحتوى أولاً",
                          variant: "destructive",
                        });
                        return;
                      }
                      setIsGeneratingNewsletterContent(true);
                      try {
                        // apiRequest يرفق رمز CSRF تلقائيًا — fetch الخام كان يُرفض 403
                        const data = await apiRequest("/api/smart-classification/newsletter-subtitle", {
                          method: "POST",
                          body: JSON.stringify({ title, content, excerpt }),
                        });
                        if (data.success) {
                          setNewsletterSubtitle(data.subtitle);
                          setNewsletterExcerpt(data.excerpt);
                          toast({
                            title: "تم التوليد بنجاح",
                            description: "تم إنشاء العنوان والملخص للنشرة الإخبارية",
                          });
                        } else {
                          throw new Error(data.message);
                        }
                      } catch (error: any) {
                        toast({
                          title: "خطأ",
                          description: error.message || "فشل توليد محتوى النشرة",
                          variant: "destructive",
                        });
                      } finally {
                        setIsGeneratingNewsletterContent(false);
                      }
                    }}
                    disabled={isGeneratingNewsletterContent || !title || !content}
                    data-testid="button-generate-newsletter-content"
                  >
                    {isGeneratingNewsletterContent ? (
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 ml-2" />
                    )}
                    توليد ذكي
                    </Button>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">العنوان الفرعي للنشرة</label>
                    <Input
                      value={newsletterSubtitle}
                      onChange={(e) => setNewsletterSubtitle(e.target.value)}
                      placeholder="عنوان جذاب للنشرة الإخبارية..."
                      maxLength={150}
                      disabled={isLockedByOther}
                      data-testid="input-newsletter-subtitle"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {(newsletterSubtitle || "").length}/150 حرف
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">ملخص النشرة</label>
                    <Textarea
                      value={newsletterExcerpt}
                      onChange={(e) => setNewsletterExcerpt(e.target.value)}
                      placeholder="ملخص مختصر يظهر في النشرة..."
                      rows={3}
                      maxLength={300}
                      disabled={isLockedByOther}
                      data-testid="input-newsletter-excerpt"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {(newsletterExcerpt || "").length}/300 حرف
                    </p>
                  </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* Featured Image */}
            {!isOpinionAuthor && showFeaturedImageHint && (
              <div
                className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
                role="note"
                data-testid="featured-image-guidance"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="min-w-0 flex-1 leading-6 text-muted-foreground">
                  بعد كتابة العنوان والمحتوى، ستظهر لك صور مقترحة من مكتبة الوسائط؛ اختر الأنسب أو ارفع صورة جديدة.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="-ml-2 -mt-1 h-8 w-8 shrink-0 text-muted-foreground"
                  onClick={() => setShowFeaturedImageHint(false)}
                  aria-label="إخفاء إرشاد الصورة البارزة"
                  data-testid="button-dismiss-featured-image-guidance"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            <Card>
              <CardHeader>
                <CardTitle>الصورة البارزة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* شريط الاقتراح التلقائي: لا صورة بعد + عنوان مكتوب → أفضل صور
                    الأرشيف ملاءمةً للخبر، باختيار بنقرة واحدة */}
                {!imageUrl && !isOpinionAuthor && (
                  <HeroImageSuggestions
                    articleTitle={title}
                    articleContent={content}
                    onPick={applyLibraryImage}
                    onOpenLibrary={() => setShowMediaPicker(true)}
                  />
                )}
                {imageUrl && (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                      data-testid="img-preview"
                    />
                  </div>
                )}
                {imageUrl && isOpinionAuthor && (
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setImageUrl("");
                        setIsAiGeneratedImage(false);
                        setThumbnailUrl("");
                        setHeroImageMediaId(null);
                        setImageFocalPoint(null);
                      }}
                      className="gap-2"
                      data-testid="button-delete-image"
                    >
                      <X className="h-4 w-4" />
                      حذف الصورة
                    </Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById("image-upload")?.click()}
                    disabled={isUploadingImage}
                    className={isOpinionAuthor ? "w-full gap-2 sm:w-auto" : "gap-2"}
                    data-testid="button-upload-image"
                  >
                    {isUploadingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    {imageUrl ? "تغيير الصورة" : "رفع صورة"}
                  </Button>
                  {!isOpinionAuthor && (
                    <Button
                      variant="outline"
                      onClick={() => setShowMediaPicker(true)}
                      className="gap-2"
                      data-testid="button-choose-from-library"
                    >
                      <ImageIcon className="h-4 w-4" />
                      اختر من المكتبة
                    </Button>
                  )}
                  {!isOpinionAuthor && imageUrl && (
                    <span title={!article?.id ? "متاح بعد حفظ الخبر" : undefined}>
                      <Button
                        variant="outline"
                        onClick={handleGenerateHeroCaption}
                        disabled={!article?.id || generatingCaption}
                        className="gap-2"
                        data-testid="button-ai-hero-caption"
                      >
                        {generatingCaption ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className="h-4 w-4 text-primary" />
                        )}
                        وصف وتعليق ذكي
                      </Button>
                    </span>
                  )}
                  {!isOpinionAuthor && (
                    <Button
                      variant="outline"
                      onClick={() => setShowLogoComposer(true)}
                      disabled={isUploadingImage}
                      className="gap-2"
                      data-testid="button-logo-composer"
                    >
                      <Frame className="h-4 w-4" />
                      أدوات الشعار
                    </Button>
                  )}
                  {!isOpinionAuthor && canGenerateImages && (
                    <Button
                      variant="outline"
                      onClick={() => setShowAIImageDialog(true)}
                      className="gap-2"
                      data-testid="button-generate-ai-image"
                    >
                      <Sparkles className="h-4 w-4 text-primary" />
                      توليد بالذكاء الاصطناعي
                    </Button>
                  )}
                  {!isOpinionAuthor && canUseInfographics && (
                    <Button
                      variant="outline"
                      onClick={() => setShowInfographicDialog(true)}
                      className="gap-2"
                      data-testid="button-generate-infographic"
                    >
                      <LayoutGrid className="h-4 w-4 text-primary" />
                      إنفوجرافيك
                    </Button>
                  )}
                  {!isOpinionAuthor && canGenerateImages && (
                    <Button
                      variant="outline"
                      onClick={() => setShowStoryCardsDialog(true)}
                      className="gap-2"
                      data-testid="button-generate-story-cards"
                    >
                      <Layers className="h-4 w-4 text-primary" />
                      قصص مصورة
                    </Button>
                  )}
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
                {/* Delete Image Button and AI Label Toggle - Show only when there's an image */}
                {imageUrl && !isOpinionAuthor && (
                  <div className="flex flex-col gap-3 mt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          id="ai-image-toggle"
                          checked={isAiGeneratedImage}
                          onCheckedChange={(checked) => {
                            setIsAiGeneratedImage(checked);
                            toast({
                              title: checked ? "تم تفعيل علامة الذكاء الاصطناعي" : "تم إزالة علامة الذكاء الاصطناعي",
                              description: checked 
                                ? "ستظهر علامة 'صورة مولدة بالذكاء الاصطناعي' على الصورة" 
                                : "تم إزالة علامة الذكاء الاصطناعي من الصورة",
                            });
                          }}
                          data-testid="switch-ai-image"
                        />
                        <Label htmlFor="ai-image-toggle" className="text-sm cursor-pointer flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-purple-500" />
                          صورة مولدة بالذكاء الاصطناعي
                        </Label>
                        {isAiGeneratedImage && (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            AI
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setImageUrl("");
                          setIsAiGeneratedImage(false);
                          setThumbnailUrl("");
                          setHeroImageMediaId(null);
                          setImageFocalPoint(null);
                          toast({
                            title: "تم حذف الصورة",
                            description: "تم حذف الصورة البارزة بنجاح",
                          });
                        }}
                        className="gap-2"
                        data-testid="button-delete-image"
                      >
                        <X className="h-4 w-4" />
                        حذف الصورة
                      </Button>
                    </div>
                    
                    {/* Image Caption Fields - Inline below image */}
                    {isNewArticle ? (
                      <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-border dark:bg-muted/40 dark:text-amber-200">
                        <strong>شرح الصورة البارزة:</strong> سيظهر حقل إضافة الشرح والمصدر للصورة بعد حفظ الخبر لأول مرة (سيتم حفظه تلقائياً خلال ثوانٍ).
                      </div>
                    ) : (
                      <ImageCaptionForm
                        imageUrl={imageUrl}
                        mediaFileId={heroImageMediaId}
                        articleId={article?.id}
                        locale="ar"
                        displayOrder={0}
                        articleTitle={title}
                        articleContent={content}
                        existingCaption={mediaAssets.find((asset: any) => asset.displayOrder === 0)}
                        onSave={(data) => {
                          const existingCaption = mediaAssets.find((asset: any) => asset.displayOrder === 0);
                          if (existingCaption?.id) {
                            updateCaptionMutation.mutate({ id: existingCaption.id, data });
                          } else {
                            createCaptionMutation.mutate({ ...data, displayOrder: 0 });
                          }
                        }}
                        onDelete={(id) => deleteCaptionMutation.mutate(id)}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Focal Point Picker - Collapsible */}
            {imageUrl && !isOpinionAuthor && (
              <Collapsible open={focalPointOpen} onOpenChange={setFocalPointOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors" data-testid="collapsible-focal-point">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <Focus className="h-4 w-4" />
                          نقطة التركيز في الصورة
                          {imageFocalPoint && (
                            <Badge variant="secondary" className="text-xs">محدد</Badge>
                          )}
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${focalPointOpen ? 'rotate-180' : ''}`} />
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <ImageFocalPointPicker
                        imageUrl={imageUrl}
                        currentFocalPoint={imageFocalPoint || undefined}
                        onFocalPointChange={(point) => setImageFocalPoint(point)}
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
            
            {/* Auto Image Generation - Hidden for infographics */}
            {!isOpinionAuthor && canGenerateImages && articleType !== "infographic" && (
              <AutoImageGenerator
                articleId={id}
                title={title}
                content={content}
                excerpt={excerpt}
                category={categories.find(c => c.id === categoryId)?.nameAr}
                language="ar"
                articleType={articleType}
                hasImage={!!imageUrl}
                onImageGenerated={(url, altText) => {
                  setImageUrl(url);
                  setIsAiGeneratedImage(true);
                  // Update alt text in SEO if needed
                  toast({
                    title: "تم توليد الصورة بنجاح",
                    description: `${altText}`,
                  });
                }}
              />
            )}
            
            {/* Thumbnail Generation - Collapsible - Hidden for infographics */}
            {imageUrl && !isOpinionAuthor && articleType !== "infographic" && (
              <Collapsible open={thumbnailOpen} onOpenChange={setThumbnailOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors" data-testid="collapsible-thumbnail">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <ImageDown className="h-4 w-4" />
                          صورة الغلاف المصغرة
                          {thumbnailUrl && (
                            <Badge variant="secondary" className="text-xs">متوفرة</Badge>
                          )}
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${thumbnailOpen ? 'rotate-180' : ''}`} />
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <ThumbnailGenerator
                        articleId={id}
                        imageUrl={imageUrl}
                        thumbnailUrl={thumbnailUrl}
                        thumbnailManuallyDeleted={thumbnailManuallyDeleted}
                        articleTitle={title}
                        articleExcerpt={excerpt}
                        onThumbnailGenerated={(url, manuallyDeleted) => {
                          setThumbnailUrl(url);
                          if (manuallyDeleted !== undefined) {
                            setThumbnailManuallyDeleted(manuallyDeleted);
                          }
                        }}
                      />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* Infographic Banner Section - Only for infographic articles */}
            {canUseInfographics && articleType === "infographic" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4" />
                    بانر الإنفوجرافيك (للبطاقات)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    صورة أفقية بنسبة 16:9 تُستخدم لعرض الإنفوجرافيك في البطاقات والصور المصغرة. 
                    الصورة الرئيسية تحتوي على الإنفوجرافيك الكامل (عمودي)، بينما هذا البانر للعرض في القوائم.
                  </p>
                  
                  {infographicBannerUrl && (
                    <div className="relative w-full overflow-hidden rounded-lg border" style={{ aspectRatio: '16/9' }}>
                      <img
                        src={infographicBannerUrl}
                        alt="بانر الإنفوجرافيك"
                        className="h-full w-full object-cover"
                        data-testid="img-infographic-banner-preview"
                      />
                      {isAiGeneratedInfographicBanner && (
                        <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
                          <Sparkles className="h-3 w-3 ml-1" />
                          مُولّد بالذكاء الاصطناعي
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById("infographic-banner-upload")?.click()}
                      disabled={isUploadingInfographicBanner || isGeneratingInfographicBanner}
                      className="gap-2"
                      data-testid="button-upload-infographic-banner"
                    >
                      {isUploadingInfographicBanner ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ImagePlus className="h-4 w-4" />
                      )}
                      {infographicBannerUrl ? "تغيير البانر" : "رفع بانر"}
                    </Button>
                    <input
                      id="infographic-banner-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleInfographicBannerUpload}
                      className="hidden"
                    />
                    {canGenerateImages && (
                      <Button
                        variant="outline"
                        onClick={handleGenerateInfographicBanner}
                        disabled={isGeneratingInfographicBanner || isUploadingInfographicBanner || !title.trim()}
                        className="gap-2"
                        data-testid="button-ai-generate-infographic-banner"
                        title={!title.trim() ? "يجب إدخال عنوان المقال أولاً" : "توليد بانر تجريدي باستخدام الذكاء الاصطناعي"}
                      >
                        {isGeneratingInfographicBanner ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        توليد بالذكاء الاصطناعي
                      </Button>
                    )}
                  </div>
                  
                  {infographicBannerUrl && (
                    <div className="flex justify-end">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setInfographicBannerUrl("");
                          setIsAiGeneratedInfographicBanner(false);
                          toast({
                            title: "تم حذف البانر",
                            description: "تم حذف بانر الإنفوجرافيك بنجاح",
                          });
                        }}
                        className="gap-2"
                        data-testid="button-delete-infographic-banner"
                      >
                        <X className="h-4 w-4" />
                        حذف البانر
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Content Editor */}
            <Card>
              <CardHeader className="space-y-3">
                <CardTitle>محتوى المقال</CardTitle>
                {/* AI Buttons - stacked on mobile, inline on desktop */}
                {!isOpinionAuthor && canUseAIGenerate && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2">
                      {/* Edit + Generate Button - Rewrites content then generates metadata - requires comprehensive_edit permission */}
                      {canUseComprehensiveEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editAndGenerateMutation.mutate()}
                        disabled={isGeneratingAI || editAndGenerateMutation.isPending || !content || content.length < 100}
                        className="gap-2 w-full sm:w-auto justify-center"
                        data-testid="button-edit-and-generate"
                        title={
                          !content 
                            ? "يجب كتابة المحتوى أولاً (100+ حرف)"
                            : content.length < 100
                            ? `المحتوى قصير جداً (${content.length}/100 حرف)`
                            : "إعادة تحرير المحتوى بأسلوب صحفي احترافي ثم توليد العنوان والكلمات المفتاحية والموجز وبيانات SEO"
                        }
                      >
                        {editAndGenerateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        تحرير وتوليد شامل
                      </Button>
                      )}
                      
                      {/* Proofread Button - Spell check only, no auto-modification */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => proofreadMutation.mutate()}
                        disabled={isGeneratingAI || proofreadMutation.isPending || !content || content.length < 20}
                        className="gap-2 w-full sm:w-auto justify-center"
                        data-testid="button-proofread"
                        title={
                          !content
                            ? "يجب كتابة المحتوى أولاً"
                            : content.length < 20
                            ? "النص قصير جداً للتدقيق"
                            : "تدقيق إملائي للنص — يعرض الأخطاء فقط دون تعديل المعنى"
                        }
                      >
                        {proofreadMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <SpellCheck className="h-4 w-4" />
                        )}
                        تدقيق لغوي
                      </Button>

                      {/* All-in-One AI Button - Only generates metadata */}
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleGenerateAllInOne}
                        disabled={isGeneratingAI || !content || content.length < 100}
                        className="gap-2 w-full sm:w-auto justify-center"
                        data-testid="button-generate-all-in-one"
                        title={
                          !content 
                            ? "يجب كتابة المحتوى أولاً (100+ حرف)"
                            : content.length < 100
                            ? `المحتوى قصير جداً (${content.length}/100 حرف)`
                            : "توليد جميع التوليدات الذكية دفعة واحدة: العناوين، التصنيف، SEO، والموجز"
                        }
                      >
                        {generateAllInOneMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        توليد ذكي شامل
                      </Button>
                    </div>
                    {(!content || content.length < 100) && (
                      <p className="text-xs text-muted-foreground text-center sm:text-end">
                        {!content 
                          ? "يجب كتابة المحتوى أولاً"
                          : `المحتوى: ${content.length}/100 حرف`
                        }
                      </p>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <RichTextEditor
                  content={content}
                  onChange={setContent}
                  placeholder="ابدأ بكتابة المقال..."
                  editorRef={setEditorInstance}
                  disabled={isLockedByOther}
                  imageUploadPurpose="article-inline"
                />
                {articleType === "weekly_photos" && (
                  <div className="border-t pt-6">
                    <WeeklyPhotosEditor
                      photos={weeklyPhotosData.photos}
                      onChange={(photos) => setWeeklyPhotosData({ photos })}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Excerpt */}
            {!isOpinionAuthor && <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>الملخص</CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingAI || !content || typeof content !== 'string' || !content.trim()}
                    className="gap-2"
                    data-testid="button-ai-summary"
                  >
                    <Sparkles className="h-4 w-4" />
                    توليد تلقائي
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={excerpt}
                  onChange={(e) => {
                    setExcerpt(e.target.value);
                    if (!metaDescription) {
                      setMetaDescription(e.target.value);
                    }
                  }}
                  placeholder="ملخص قصير للمقال..."
                  rows={4}
                  disabled={isLockedByOther}
                  data-testid="textarea-excerpt"
                />
              </CardContent>
            </Card>}

            {/* Poll Editor */}
            {!isOpinionAuthor && canUsePolls && (
              <PollEditor 
                poll={pollData} 
                onChange={setPollData}
                articleContent={content}
                articleTitle={title}
              />
            )}

            {/* Smart Links Panel - Collapsible - Hidden for infographics */}
            {!isOpinionAuthor && canUseSmartLinks && articleType !== "infographic" && (
              <Collapsible open={smartLinksOpen} onOpenChange={setSmartLinksOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors" data-testid="collapsible-smart-links">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <Link2 className="h-4 w-4" />
                          الروابط الذكية
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${smartLinksOpen ? 'rotate-180' : ''}`} />
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="h-[500px]" data-testid="smart-links-container">
                        <SmartLinksPanel
                          articleContent={content}
                          articleId={isNewArticle ? undefined : id}
                          onAddLink={handleAddLink}
                        />
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}

            {/* Article Timeline - Collapsible - Only shown when editing existing articles */}
            {!isOpinionAuthor && !isNewArticle && id && (
              <Collapsible open={timelineOpen} onOpenChange={setTimelineOpen}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors" data-testid="collapsible-timeline">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          السجل الزمني
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${timelineOpen ? 'rotate-180' : ''}`} />
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <ArticleTimeline articleId={id} />
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            )}
          </div>

          {isOpinionAuthor && <WriterEditorialNoticesAside />}

          {/* Settings Sidebar - 30% */}
          {!isOpinionAuthor && <div className="lg:col-span-3 space-y-6">
            {/* Article Type - Hidden for opinion authors and users without content type permission */}
            {!isOpinionAuthor && canUseContentTypeSelector && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    نوع المحتوى
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Select 
                    value={isInfographic ? previousArticleType : articleType} 
                    onValueChange={(value: any) => {
                      setArticleType(value);
                      setPreviousArticleType(value);
                    }}
                    disabled={isInfographic}
                  >
                    <SelectTrigger data-testid="select-article-type">
                      <SelectValue placeholder="اختر نوع المحتوى" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="news">خبر</SelectItem>
                      <SelectItem value="opinion">مقال رأي</SelectItem>
                      <SelectItem value="analysis">تحليل</SelectItem>
                      <SelectItem value="column">عمود</SelectItem>
                      <SelectItem value="weekly_photos">صور</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* Infographic Toggle */}
                  {canUseInfographics && (
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <Label htmlFor="infographic-toggle" className="cursor-pointer">
                        <div className="font-medium">إنفوجرافيك</div>
                        <div className="text-xs text-muted-foreground">
                          تصنيف المحتوى كإنفوجرافيك مصور
                        </div>
                      </Label>
                    </div>
                    <Switch
                      id="infographic-toggle"
                      checked={isInfographic}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // Save current type before switching to infographic
                          if (articleType !== "infographic") {
                            setPreviousArticleType(articleType as "news" | "opinion" | "analysis" | "column");
                          }
                          setArticleType("infographic");
                        } else {
                          // Restore previous type when unchecked
                          setArticleType(previousArticleType);
                        }
                        setIsInfographic(checked);
                      }}
                      data-testid="switch-infographic"
                    />
                  </div>
                )}
                
                {/* Infographic Type Selection - shown when isInfographic is true */}
                {canUseInfographics && isInfographic && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">نوع الإنفوجرافيك</Label>
                      <RadioGroup 
                        value={infographicType} 
                        onValueChange={(value: "image" | "data") => setInfographicType(value)}
                        className="flex gap-4"
                      >
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="image" id="infographic-image" data-testid="radio-infographic-image" />
                          <Label htmlFor="infographic-image" className="cursor-pointer">
                            <div className="font-medium">صوري</div>
                            <div className="text-xs text-muted-foreground">صورة إنفوجرافيك كاملة</div>
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2 space-x-reverse">
                          <RadioGroupItem value="data" id="infographic-data" data-testid="radio-infographic-data" />
                          <Label htmlFor="infographic-data" className="cursor-pointer">
                            <div className="font-medium">بياني</div>
                            <div className="text-xs text-muted-foreground">رسوم بيانية تفاعلية</div>
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )}
            
            {/* Data Infographic Editor - shown when infographic type is 'data' - hidden for opinion authors */}
            {!isOpinionAuthor && canUseInfographics && isInfographic && infographicType === "data" && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    محرر الإنفوجرافيك البياني
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfographicDataEditor
                    value={infographicData}
                    onChange={setInfographicData}
                    disabled={saveArticleMutation.isPending}
                  />
                </CardContent>
              </Card>
            )}

            {/* News Type - Hidden for opinion articles and users without news_type permission */}
            {articleType !== "opinion" && canUseNewsType && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    نوع الخبر
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup value={newsType} onValueChange={(value: any) => setNewsType(value)}>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="breaking" id="breaking" />
                      <Label htmlFor="breaking" className="flex items-center gap-2 cursor-pointer">
                        خبر عاجل
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <RadioGroupItem value="regular" id="regular" />
                      <Label htmlFor="regular" className="flex items-center gap-2 cursor-pointer">
                        خبر عادي
                      </Label>
                    </div>
                  </RadioGroup>
                  
                  {/* Featured Article Checkbox - Independent from newsType */}
                  <div className="pt-4 border-t mt-4">
                    <div className="flex items-center space-x-2 space-x-reverse">
                      <Checkbox 
                        id="isFeatured"
                        checked={isFeatured}
                        onCheckedChange={(checked) => setIsFeatured(checked as boolean)}
                        data-testid="checkbox-is-featured"
                      />
                      <Label htmlFor="isFeatured" className="flex items-center gap-2 cursor-pointer text-sm">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <div>
                          <div className="font-medium">خبر مميز</div>
                          <div className="text-xs text-muted-foreground">
                            سيظهر المقال في قسم الأخبار المميزة
                          </div>
                        </div>
                      </Label>
                    </div>
                  </div>
                  
                  {/* Hide from Homepage Option - Requires permission */}
                  {canHideFromHomepage && (
                    <div className="pt-4 border-t mt-4">
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <Checkbox 
                          id="hideFromHomepage"
                          checked={hideFromHomepage}
                          onCheckedChange={(checked) => setHideFromHomepage(checked as boolean)}
                          data-testid="checkbox-hide-from-homepage"
                        />
                        <Label htmlFor="hideFromHomepage" className="flex items-center gap-2 cursor-pointer text-sm">
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">إخفاء من الواجهة الرئيسية</div>
                            <div className="text-xs text-muted-foreground">
                              المقال سينشر لكن لن يظهر في الصفحة الرئيسية
                            </div>
                          </div>
                        </Label>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Video Template - Hidden for opinion authors */}
            {!isOpinionAuthor && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  قالب فيديو
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox 
                    id="isVideoTemplate"
                    checked={isVideoTemplate}
                    onCheckedChange={(checked) => setIsVideoTemplate(checked as boolean)}
                    data-testid="checkbox-video-template"
                  />
                  <Label htmlFor="isVideoTemplate" className="flex items-center gap-2 cursor-pointer text-sm">
                    <div>
                      <div className="font-medium">تفعيل قالب الفيديو</div>
                      <div className="text-xs text-muted-foreground">
                        عرض فيديو بدلاً من الصورة الرئيسية
                      </div>
                    </div>
                  </Label>
                </div>
                
                {isVideoTemplate && (
                  <div className="space-y-3 pt-3 border-t">
                    <RadioGroup
                      value={videoSourceType}
                      onValueChange={(value: "url" | "upload") => setVideoSourceType(value)}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <RadioGroupItem value="url" id="video-source-url" data-testid="radio-video-url" />
                        <Label htmlFor="video-source-url" className="text-sm cursor-pointer">رابط خارجي</Label>
                      </div>
                      <div className="flex items-center space-x-2 space-x-reverse">
                        <RadioGroupItem value="upload" id="video-source-upload" data-testid="radio-video-upload" />
                        <Label htmlFor="video-source-upload" className="text-sm cursor-pointer">رفع فيديو</Label>
                      </div>
                    </RadioGroup>

                    {videoSourceType === "url" ? (
                      <div className="space-y-2">
                        <Label htmlFor="videoUrl" className="text-sm">رابط الفيديو</Label>
                        <Input
                          id="videoUrl"
                          value={videoUrl}
                          onChange={(e) => setVideoUrl(e.target.value)}
                          placeholder="رابط YouTube أو Dailymotion أو رابط مباشر للفيديو"
                          className="text-sm"
                          dir="ltr"
                          data-testid="input-video-url"
                        />
                        <p className="text-xs text-muted-foreground">
                          يدعم: YouTube, Dailymotion, أو رابط مباشر (mp4)
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label className="text-sm">رفع ملف فيديو</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 100 * 1024 * 1024) {
                                toast({ title: "خطأ", description: "حجم الملف كبير جداً. الحد الأقصى 100MB", variant: "destructive" });
                                return;
                              }
                              setIsUploadingVideo(true);
                              try {
                                const formData = new FormData();
                                formData.append('file', file);
                                const csrfToken = getCsrfToken();
                                const response = await fetch(apiUrl('/api/upload/video'), {
                                  method: 'POST', 
                                  body: formData, 
                                  credentials: 'include',
                                  headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
                                });
                                if (!response.ok) {
                                  const error = await response.json();
                                  throw new Error(error.message || 'فشل رفع الفيديو');
                                }
                                const data = await response.json();
                                setVideoUrl(data.url);
                                toast({ title: "نجاح", description: "تم رفع الفيديو بنجاح" });
                              } catch (error: any) {
                                toast({ title: "خطأ", description: error.message || "فشل رفع الفيديو", variant: "destructive" });
                              } finally {
                                setIsUploadingVideo(false);
                              }
                            }}
                            disabled={isUploadingVideo}
                            className="text-sm"
                            data-testid="input-video-file"
                          />
                          {isUploadingVideo && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        </div>
                        <p className="text-xs text-muted-foreground">الأنواع المسموحة: MP4, WebM, MOV (الحد الأقصى: 100MB)</p>
                        {videoUrl && videoSourceType === "upload" && (
                          <div className="flex items-center gap-2 text-xs text-green-600">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>تم رفع الفيديو</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">صورة مصغرة للفيديو</Label>
                      <RadioGroup 
                        value={
                          videoThumbnailUrl === "" ? "auto" : 
                          videoThumbnailUrl === imageUrl && imageUrl ? "article" : 
                          "custom"
                        }
                        onValueChange={(value) => {
                          if (value === "auto") {
                            setVideoThumbnailUrl("");
                          } else if (value === "article" && imageUrl) {
                            setVideoThumbnailUrl(imageUrl);
                          }
                        }}
                        className="flex flex-wrap gap-3"
                      >
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="auto" id="thumb-auto" data-testid="radio-thumb-auto" />
                          <Label htmlFor="thumb-auto" className="text-xs cursor-pointer">
                            تلقائي (YouTube/Dailymotion)
                          </Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="article" id="thumb-article" disabled={!imageUrl} data-testid="radio-thumb-article" />
                          <Label htmlFor="thumb-article" className={`text-xs cursor-pointer ${!imageUrl ? 'text-muted-foreground' : ''}`}>
                            صورة المقال
                          </Label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <RadioGroupItem value="custom" id="thumb-custom" data-testid="radio-thumb-custom" />
                          <Label htmlFor="thumb-custom" className="text-xs cursor-pointer">مخصص</Label>
                        </div>
                      </RadioGroup>
                      
                      {(videoThumbnailUrl !== "" && videoThumbnailUrl !== imageUrl) && (
                        <div className="space-y-2 pt-2 border-t">
                          <div className="flex gap-2">
                            <Input
                              id="videoThumbnailUrl"
                              value={videoThumbnailUrl}
                              onChange={(e) => setVideoThumbnailUrl(e.target.value)}
                              placeholder="رابط الصورة المصغرة"
                              className="text-sm flex-1"
                              dir="ltr"
                              data-testid="input-video-thumbnail"
                            />
                            <div className="relative">
                              <Input
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  if (file.size > 5 * 1024 * 1024) {
                                    toast({ title: "خطأ", description: "حجم الصورة كبير جداً. الحد الأقصى 5MB", variant: "destructive" });
                                    return;
                                  }
                                  try {
                                    const formData = new FormData();
                                    formData.append('file', file);
                                    const response = await fetch(apiUrl('/api/upload/image'), { method: 'POST', body: formData, credentials: 'include' });
                                    if (!response.ok) {
                                      const error = await response.json();
                                      throw new Error(error.message || 'فشل رفع الصورة');
                                    }
                                    const data = await response.json();
                                    setVideoThumbnailUrl(data.url);
                                    toast({ title: "نجاح", description: "تم رفع الصورة المصغرة بنجاح" });
                                  } catch (error: any) {
                                    toast({ title: "خطأ", description: error.message || "فشل رفع الصورة", variant: "destructive" });
                                  }
                                }}
                                data-testid="input-video-thumbnail-file"
                              />
                              <Button type="button" variant="outline" size="sm" className="gap-1">
                                <Upload className="h-3.5 w-3.5" />
                                رفع
                              </Button>
                            </div>
                          </div>
                          {videoThumbnailUrl && (
                            <div className="relative rounded-md overflow-hidden border bg-muted aspect-video max-w-[200px]">
                              <img 
                                src={videoThumbnailUrl} 
                                alt="معاينة الصورة المصغرة" 
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-8 h-8 rounded-full bg-primary/80 flex items-center justify-center">
                                  <Play className="h-4 w-4 text-primary-foreground fill-current mr-[-1px]" />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <p className="text-xs text-muted-foreground">
                        {videoThumbnailUrl === "" 
                          ? "سيتم جلب الصورة تلقائياً من YouTube/Dailymotion، أو استخدام صورة المقال"
                          : videoThumbnailUrl === imageUrl 
                            ? "سيتم استخدام صورة المقال الرئيسية كصورة مصغرة"
                            : "صورة مخصصة للفيديو"}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {/* Category */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>التصنيف</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => autoClassifyMutation.mutate()}
                    disabled={isClassifying || !title || !content}
                    title={!title || !content ? "يجب إدخال العنوان والمحتوى أولاً" : "تصنيف ذكي بالذكاء الاصطناعي"}
                    data-testid="button-auto-classify"
                  >
                    <Sparkles className={`h-4 w-4 ml-1 ${isClassifying ? 'text-muted-foreground animate-pulse' : 'text-primary'}`} />
                    <span className="text-sm">{isClassifying ? 'جاري التصنيف...' : 'تصنيف ذكي'}</span>
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isCategoriesLoading ? (
                  <div className="flex items-center gap-2 h-9 px-3 border rounded-md text-sm text-muted-foreground" data-testid="select-category-loading">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جاري تحميل التصنيفات...</span>
                  </div>
                ) : (
                  <Select key={categories.length} value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="اختر تصنيف" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.icon && <span className="ml-2">{category.icon}</span>}
                          {category.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            {/* SEO Optimization */}
            <Collapsible open={seoOptimizationOpen} onOpenChange={setSeoOptimizationOpen}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="collapsible-seo-optimization"
                    >
                      <CardTitle>تحسين محركات البحث (SEO)</CardTitle>
                      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${seoOptimizationOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </CollapsibleTrigger>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => generateSeoMutation.mutate()}
                    disabled={generateSeoMutation.isPending || !title || !content}
                    title={!title || !content ? "يجب إدخال العنوان والمحتوى أولاً" : "توليد SEO ذكي بالذكاء الاصطناعي"}
                    data-testid="button-generate-seo"
                  >
                    <Sparkles className={`h-4 w-4 ml-1 ${generateSeoMutation.isPending ? 'text-muted-foreground animate-pulse' : 'text-primary'}`} />
                    <span className="text-sm">{generateSeoMutation.isPending ? 'جاري التوليد...' : 'توليد SEO'}</span>
                  </Button>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-3">
                <div>
                  <Label>عنوان Meta (50-60 حرف) - {metaTitle.length}/60</Label>
                  <Input
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    placeholder="عنوان محسّن لمحركات البحث"
                    maxLength={60}
                    data-testid="input-meta-title"
                  />
                </div>
                <div>
                  <Label>وصف Meta (140-160 حرف) - {metaDescription.length}/160</Label>
                  <Textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    placeholder="وصف مقنع لمحركات البحث"
                    maxLength={160}
                    rows={3}
                    data-testid="textarea-meta-description"
                  />
                </div>
                <div>
                  <Label>الكلمات المفتاحية</Label>
                  <Input
                    value={keywords.join(", ")}
                    onChange={(e) => setKeywords(e.target.value.split(",").map(k => k.trim()).filter(Boolean))}
                    placeholder="كلمة1, كلمة2, كلمة3"
                    data-testid="input-keywords"
                  />
                </div>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Reporter - Hidden for opinion articles */}
            {articleType !== "opinion" && (
              <Card>
                <CardHeader>
                  <CardTitle>المراسل</CardTitle>
                </CardHeader>
                <CardContent>
                  <ReporterSelect
                    value={reporterId}
                    onChange={setReporterId}
                  />
                </CardContent>
              </Card>
            )}

            {/* Opinion Author - Shown only for opinion articles */}
            {articleType === "opinion" && (
              <Card>
                <CardHeader>
                  <CardTitle>كاتب المقال</CardTitle>
                </CardHeader>
                <CardContent>
                  {isOpinionAuthor ? (
                    <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                      <span className="text-sm font-medium">{user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.email || 'كاتب المقال'}</span>
                    </div>
                  ) : (
                    <OpinionAuthorSelect
                      value={opinionAuthorId}
                      onChange={setOpinionAuthorId}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Publishing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  النشر
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {canPublish ? (
                  <>
                    {canSchedule && (
                      <>
                        <div className="flex items-center justify-between">
                          <Label htmlFor="publish-type">نشر مجدول</Label>
                          <Switch
                            id="publish-type"
                            checked={publishType === "scheduled"}
                            onCheckedChange={(checked) => setPublishType(checked ? "scheduled" : "instant")}
                          />
                        </div>
                        
                        {publishType === "scheduled" && (
                          <div className="space-y-2">
                            <Label>التاريخ والوقت</Label>
                            <DatePicker
                              selected={scheduledAt ? new Date(scheduledAt) : null}
                              onChange={(date: Date | null) => {
                                if (date) {
                                  const year = date.getFullYear();
                                  const month = String(date.getMonth() + 1).padStart(2, '0');
                                  const day = String(date.getDate()).padStart(2, '0');
                                  const hours = String(date.getHours()).padStart(2, '0');
                                  const minutes = String(date.getMinutes()).padStart(2, '0');
                                  setScheduledAt(`${year}-${month}-${day}T${hours}:${minutes}`);
                                } else {
                                  setScheduledAt("");
                                }
                              }}
                              showTimeSelect
                              timeFormat="HH:mm"
                              timeIntervals={15}
                              dateFormat="dd/MM/yyyy - HH:mm"
                              locale="ar"
                              placeholderText="اختر التاريخ والوقت"
                              minDate={new Date()}
                              className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-right"
                              calendarClassName="!font-sans"
                              wrapperClassName="w-full"
                              popperPlacement="bottom-end"
                              data-testid="input-scheduled-at"
                            />
                          </div>
                        )}
                      </>
                    )}

                    {(!canSchedule || publishType === "instant") && (
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        سيتم النشر فوراً
                      </div>
                    )}

                    {/* Republish Switch - Only show when editing a published article */}
                    {!isNewArticle && article?.status === "published" && (
                      <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="republish" className="cursor-pointer">
                            إعادة النشر بالتوقيت الحالي
                          </Label>
                          <Switch
                            id="republish"
                            checked={republish}
                            onCheckedChange={setRepublish}
                            data-testid="switch-republish"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          عند التفعيل، سيتم تحديث وقت النشر وسيظهر المقال في أعلى القائمة
                        </p>
                      </div>
                    )}

                    {/* Custom Publish Date - Only for admins to backdate articles */}
                    {canBackdateArticles && (
                      <div className="space-y-2 pt-2 border-t">
                        <Label className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                          <Calendar className="h-4 w-4" />
                          تاريخ نشر مخصص (قديم)
                        </Label>
                        <DatePicker
                          selected={customPublishedAt ? new Date(customPublishedAt) : null}
                          onChange={(date: Date | null) => {
                            if (date) {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              const hours = String(date.getHours()).padStart(2, '0');
                              const minutes = String(date.getMinutes()).padStart(2, '0');
                              setCustomPublishedAt(`${year}-${month}-${day}T${hours}:${minutes}`);
                              // Disable republish when using custom date
                              setRepublish(false);
                            } else {
                              setCustomPublishedAt("");
                            }
                          }}
                          showTimeSelect
                          timeFormat="HH:mm"
                          timeIntervals={15}
                          dateFormat="dd/MM/yyyy - HH:mm"
                          locale="ar"
                          placeholderText="اختر تاريخ قديم للنشر"
                          maxDate={new Date()}
                          className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-right"
                          calendarClassName="!font-sans"
                          wrapperClassName="w-full"
                          popperPlacement="bottom-end"
                          data-testid="input-custom-published-at"
                        />
                        <p className="text-xs text-muted-foreground">
                          يمكنك تحديد تاريخ قديم لنشر المقال (للمسؤولين فقط)
                        </p>
                        {customPublishedAt && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setCustomPublishedAt("")}
                            className="text-xs text-muted-foreground"
                            data-testid="button-clear-custom-date"
                          >
                            مسح التاريخ المخصص
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span>سيتم إرسال المقال للمراجعة</span>
                    </div>
                    <p className="text-xs">
                      المقال سيُحفظ كمسودة وسيراجعه المحرر قبل النشر
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Article Media Attachments - Visible in Sidebar for editing articles */}
            {!isNewArticle && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      المرفقات
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {mediaAssets?.filter((asset: any) => asset.mediaFile?.url || asset.url).length || 0}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    صور مرفقة من البريد الإلكتروني أو واتساب
                  </p>
                  
                  {/* Quick preview of attachments */}
                  {mediaAssets?.filter((asset: any) => asset.mediaFile?.url || asset.url).length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {mediaAssets
                        .filter((asset: any) => asset.mediaFile?.url || asset.url)
                        .slice(0, 6)
                        .map((asset: any, index: number) => {
                          const imageUrl = asset.mediaFile?.url || asset.url;
                          return (
                            <div 
                              key={asset.id} 
                              className="relative aspect-square rounded-md border bg-muted/30"
                            >
                              <img
                                src={imageUrl}
                                alt={asset.altText || `مرفق ${index + 1}`}
                                className="w-full h-full object-cover rounded-md"
                                loading="lazy"
                              />
                              <Button
                                variant="destructive"
                                size="icon"
                                className="absolute top-1 left-1 h-6 w-6 shadow-lg border border-white/30"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteAttachmentMutation.mutate(asset.id);
                                }}
                                disabled={deleteAttachmentMutation.isPending}
                                data-testid={`button-delete-attachment-sidebar-${index}`}
                              >
                                {deleteAttachmentMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground border-2 border-dashed rounded-lg bg-muted/20">
                      <Paperclip className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      <p className="text-xs">لا توجد مرفقات</p>
                    </div>
                  )}
                  
                  {/* Show more indicator if there are more than 6 */}
                  {mediaAssets?.filter((asset: any) => asset.mediaFile?.url || asset.url).length > 6 && (
                    <p className="text-xs text-center text-muted-foreground">
                      +{mediaAssets.filter((asset: any) => asset.mediaFile?.url || asset.url).length - 6} مرفق آخر
                    </p>
                  )}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setShowAttachmentUploadDialog(true)}
                    data-testid="button-add-attachment-sidebar"
                  >
                    <ImagePlus className="h-4 w-4" />
                    إضافة مرفق
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* SEO Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  إعدادات SEO
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="seo" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="seo">الحقول</TabsTrigger>
                    <TabsTrigger value="preview">المعاينة</TabsTrigger>
                    {!isNewArticle && (
                      <TabsTrigger value="media-captions">
                        <ImageIcon className="h-4 w-4 ml-2" />
                        ألبوم الصور
                      </TabsTrigger>
                    )}
                  </TabsList>
                  
                  <TabsContent value="seo" className="space-y-4">
                    {/* SEO AI Analysis Button */}
                    {!isNewArticle && (
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div>
                          <p className="text-sm font-medium">تحليل SEO بالذكاء الاصطناعي</p>
                          <p className="text-xs text-muted-foreground">
                            احصل على توصيات تلقائية لتحسين ظهور المقال في محركات البحث
                          </p>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => analyzeSEOMutation.mutate()}
                          disabled={isAnalyzingSEO || !id}
                          data-testid="button-analyze-seo"
                        >
                          {isAnalyzingSEO ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin ml-2" />
                              جاري التحليل...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 ml-2" />
                              تحليل SEO
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    
                    {/* Social Media Cards Generation Button */}
                    {!isNewArticle && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-lg">
                          <div>
                            <p className="text-sm font-medium">توليد بطاقات السوشال ميديا</p>
                            <p className="text-xs text-muted-foreground">
                              إنشاء بطاقات مُحسّنة لـ Twitter, Instagram, Facebook و WhatsApp
                            </p>
                          </div>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => generateSocialCardsMutation.mutate()}
                            disabled={isGeneratingSocialCards || !id}
                            data-testid="button-generate-social-cards"
                          >
                            {isGeneratingSocialCards ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                جاري التوليد...
                              </>
                            ) : (
                              <>
                                <Share2 className="h-4 w-4 ml-2" />
                                توليد البطاقات
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Generated Social Cards Display */}
                        {generatedSocialCards && Object.keys(generatedSocialCards).length > 0 && (
                          <div className="p-4 bg-muted/50 border rounded-lg space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">البطاقات المولدة</p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setGeneratedSocialCards(null)}
                                className="h-auto py-1 px-2 text-xs"
                              >
                                إخفاء
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {Object.entries(generatedSocialCards).map(([platform, url]) => url && (
                                <div key={platform} className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium capitalize">{platform}</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {platform === 'instagram' ? '1:1' : '16:9'}
                                    </Badge>
                                  </div>
                                  <div className="relative group">
                                    <img 
                                      src={url} 
                                      alt={`${platform} card`}
                                      className="w-full rounded-md border"
                                      data-testid={`img-social-card-${platform}`}
                                    />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-md">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => window.open(url, '_blank')}
                                        data-testid={`button-view-${platform}`}
                                      >
                                        <ExternalLink className="h-3 w-3 ml-1" />
                                        عرض
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                          const link = document.createElement('a');
                                          link.href = url;
                                          link.download = `${platform}-card.png`;
                                          link.click();
                                        }}
                                        data-testid={`button-download-${platform}`}
                                      >
                                        <Download className="h-3 w-3 ml-1" />
                                        تحميل
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>عنوان SEO</Label>
                      <Input
                        value={metaTitle}
                        onChange={(e) => setMetaTitle(e.target.value)}
                        placeholder={title || "عنوان للصفحة..."}
                        maxLength={70}
                        data-testid="input-meta-title"
                      />
                      <p className="text-xs text-muted-foreground">
                        {(metaTitle || "").length}/70 حرف
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>وصف SEO</Label>
                      <Textarea
                        value={metaDescription}
                        onChange={(e) => setMetaDescription(e.target.value)}
                        placeholder={excerpt || "وصف قصير..."}
                        rows={3}
                        maxLength={160}
                        data-testid="textarea-meta-description"
                      />
                      <p className="text-xs text-muted-foreground">
                        {(metaDescription || "").length}/160 حرف
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Slug (الرابط)</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSlug(generateSlug(title))}
                          className="h-auto py-1 px-2 text-xs"
                        >
                          توليد تلقائي
                        </Button>
                      </div>
                      <Input
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="article-slug"
                        dir="ltr"
                        maxLength={150}
                        data-testid="input-slug"
                      />
                      <p className="text-xs text-muted-foreground">
                        {(slug || "").length}/150 حرف
                      </p>
                    </div>

                    <TagInput
                      label="الكلمات المفتاحية"
                      tags={keywords}
                      onTagsChange={setKeywords}
                      placeholder="اكتب كلمة واضغط Enter..."
                      testId="input-keywords"
                    />
                  </TabsContent>

                  <TabsContent value="preview">
                    <SeoPreview
                      title={metaTitle || title}
                      description={metaDescription || excerpt}
                      slug={slug}
                    />
                  </TabsContent>

                  {!isNewArticle && (
                    <TabsContent value="media-captions" className="space-y-4">
                      {/* Album Images Section */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <Label className="text-base flex items-center gap-2">
                              <LayoutGrid className="h-4 w-4" />
                              ألبوم الصور
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              صور إضافية تظهر داخل المقال
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {albumImages.length} صورة
                            </Badge>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowAlbumUploadDialog(true)}
                              disabled={isUploadingAlbumImage}
                              className="gap-2"
                              data-testid="button-add-album-image"
                            >
                              {isUploadingAlbumImage ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <ImagePlus className="h-4 w-4" />
                              )}
                              إضافة صور
                            </Button>
                          </div>
                        </div>
                        
                        {/* Album Images Grid - preserve original image proportions */}
                        {albumImages.length > 0 ? (
                          <div className="grid grid-cols-2 gap-3">
                            {albumImages.map((url, index) => (
                              <div 
                                key={`album-${index}`} 
                                className="relative group rounded-lg overflow-hidden border bg-muted/30"
                                data-testid={`album-image-${index}`}
                              >
                                <img
                                  src={url}
                                  alt={`صورة الألبوم ${index + 1}`}
                                  className="block w-full max-w-full h-auto transition-transform group-hover:scale-105"
                                  loading="lazy"
                                />
                                {/* Overlay with delete button */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => {
                                      const newImages = albumImages.filter((_, i) => i !== index);
                                      setAlbumImages(newImages);
                                      toast({
                                        title: "تم حذف الصورة",
                                        description: "تم حذف الصورة من الألبوم",
                                      });
                                    }}
                                    data-testid={`button-delete-album-image-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                {/* Image number badge */}
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                                  {index + 1}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20">
                            <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground mb-2">
                              لا توجد صور في الألبوم
                            </p>
                            <p className="text-xs text-muted-foreground">
                              اضغط على "إضافة صور" لرفع صور جديدة
                            </p>
                          </div>
                        )}
                        
                        {/* Upload Progress */}
                        {isUploadingAlbumImage && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">جاري رفع الصور...</span>
                              <span className="font-medium">{uploadingAlbumProgress}%</span>
                            </div>
                            <Progress value={uploadingAlbumProgress} className="h-2" />
                          </div>
                        )}
                      </div>
                      
                      {/* Article Media Attachments Section - for images from Email/WhatsApp */}
                      {!isNewArticle && (
                        <div className="space-y-4 pt-6 border-t">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <Label className="text-base flex items-center gap-2">
                                <Paperclip className="h-4 w-4" />
                                المرفقات
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                صور مرفقة من البريد الإلكتروني أو واتساب
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {mediaAssets.filter((asset: any) => asset.mediaFile?.url || asset.url).length} مرفق
                              </Badge>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowAttachmentUploadDialog(true)}
                                className="gap-2"
                                data-testid="button-add-attachment"
                              >
                                <ImagePlus className="h-4 w-4" />
                                إضافة مرفق
                              </Button>
                            </div>
                          </div>
                          
                          {/* Media Attachments Grid with Drag-and-Drop Reordering */}
                          {mediaAssets.filter((asset: any) => asset.mediaFile?.url || asset.url).length > 0 ? (
                            <div className="max-h-[400px] overflow-y-auto rounded-lg border bg-muted/10 p-2" dir="rtl">
                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleAttachmentDragEnd}
                              >
                                <SortableContext
                                  items={mediaAssets
                                    .filter((asset: any) => asset.mediaFile?.url || asset.url)
                                    .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                                    .map((asset: any) => asset.id)}
                                  strategy={rectSortingStrategy}
                                >
                                  <div className="grid grid-cols-2 gap-3">
                                    {mediaAssets
                                      .filter((asset: any) => asset.mediaFile?.url || asset.url)
                                      .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
                                      .map((asset: any, index: number) => (
                                        <SortableAttachmentItem
                                          key={asset.id}
                                          asset={asset}
                                          index={index}
                                          onDelete={(id) => deleteAttachmentMutation.mutate(id)}
                                          isDeleting={deleteAttachmentMutation.isPending}
                                        />
                                      ))}
                                  </div>
                                </SortableContext>
                              </DndContext>
                            </div>
                          ) : (
                            <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20">
                              <Paperclip className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                              <p className="text-sm text-muted-foreground mb-2">
                                لا توجد مرفقات
                              </p>
                              <p className="text-xs text-muted-foreground">
                                اضغط على "إضافة مرفق" لرفع صور جديدة
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>
          </div>}
        </div>
       </div>
      </div>

      {/* Media Library Picker - Hidden for opinion authors */}
      {!isOpinionAuthor && (
        <MediaLibraryPicker
          isOpen={showMediaPicker}
          onClose={() => setShowMediaPicker(false)}
          onSelect={(media: MediaFile) => {
            applyLibraryImage(media);
            setShowMediaPicker(false);
          }}
          articleTitle={title}
          articleContent={content?.substring(0, 500)}
          currentImageUrl={imageUrl}
          uploadPurpose="article-library"
        />
      )}

      {/* حاجز الحقوق: توثيق سريع لحقوق الصورة البارزة قبل النشر */}
      <HeroRightsDialog
        open={!!rightsGateMediaId}
        mediaId={rightsGateMediaId}
        onContinue={() => {
          setRightsGateMediaId(null);
          rightsGateBypassRef.current = true;
          void handleSave(true);
        }}
        onCancel={() => setRightsGateMediaId(null)}
      />

      {/* Logo Composer Dialog - fit/merge logos on white 16:9 canvas */}
      <LogoComposerDialog
        open={showLogoComposer}
        onOpenChange={setShowLogoComposer}
        onImageReady={uploadFeaturedImageFile}
      />

      {/* AI Image Generator Dialog for Featured Image */}
      <AIImageGeneratorDialog
        open={showAIImageDialog}
        onClose={() => setShowAIImageDialog(false)}
        onImageGenerated={(generatedUrl, alt) => {
          // Set the generated image as the featured image
          setImageUrl(generatedUrl);
          setIsAiGeneratedImage(true);
          setShowAIImageDialog(false);
          toast({
            title: "تم توليد الصورة البارزة",
            description: "تم إضافة الصورة المولدة بالذكاء الاصطناعي كصورة بارزة للمقال",
          });
        }}
        initialPrompt={title ? `صورة بارزة احترافية لمقال بعنوان: ${title}` : ""}
      />

      {/* Infographic Generator Dialog */}
      <InfographicGeneratorDialog
        open={showInfographicDialog}
        onClose={() => setShowInfographicDialog(false)}
        onImageGenerated={(generatedUrl, altText) => {
          // Set the generated infographic as the featured image
          setImageUrl(generatedUrl);
          setIsAiGeneratedImage(true);
          setShowInfographicDialog(false);
          toast({
            title: "تم توليد الإنفوجرافيك!",
            description: "تم إضافة الإنفوجرافيك كصورة بارزة للمقال",
          });
        }}
        initialContent={content ? 
          // Extract key points from article content for infographic
          content
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .substring(0, 500) // Take first 500 chars
          : title || ""
        }
        language="ar"
      />

      {/* Story Cards Generator Dialog */}
      {showStoryCardsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">إنشاء القصص المصورة</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowStoryCardsDialog(false)}
                data-testid="button-close-story-cards"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <StoryCardsGenerator
              articleId={article?.id || "new"}
              articleTitle={title}
              articleContent={content}
              articleCategory={
                categories.find(c => c.id === categoryId)?.nameAr || "أخبار"
              }
              articleImage={imageUrl}
              articleAuthor={
                reporterId || 
                opinionAuthorId || 
                "سبق"
              }
              onComplete={() => {
                setShowStoryCardsDialog(false);
                toast({
                  title: "تم إنشاء القصص المصورة",
                  description: "تمت إضافة القصص المصورة للمقال بنجاح",
                });
              }}
            />
          </div>
        </div>
      )}

      {/* Album Image Upload Dialog */}
      <ImageUploadDialog
        open={showAlbumUploadDialog}
        onOpenChange={setShowAlbumUploadDialog}
        onImageUploaded={(url) => {
          console.log('[AlbumUpload] Single image uploaded:', url);
          setAlbumImages(prev => {
            const newImages = [...prev, url];
            console.log('[AlbumUpload] New album images state:', newImages);
            return newImages;
          });
          toast({
            title: "تمت إضافة الصورة",
            description: "تمت إضافة الصورة إلى الألبوم بنجاح",
          });
        }}
        onAllImagesUploaded={(urls) => {
          console.log('[AlbumUpload] All images uploaded:', urls);
          const validUrls = urls.filter(url => typeof url === 'string' && url.trim().length > 0);
          if (validUrls.length !== urls.length) {
            console.warn('[AlbumUpload] Filtered out invalid URLs:', urls.length - validUrls.length);
          }
          setAlbumImages(prev => {
            const newImages = [...prev, ...validUrls];
            console.log('[AlbumUpload] New album images state (all):', newImages);
            return newImages;
          });
          toast({
            title: "تم رفع الصور بنجاح",
            description: `تمت إضافة ${validUrls.length} صورة إلى الألبوم`,
          });
        }}
        multiple={true}
        maxFiles={10}
        uploadPurpose="article-album"
      />

      {/* Attachment Upload Dialog - uses MediaLibraryPicker for better integration */}
      <MediaLibraryPicker
        isOpen={showAttachmentUploadDialog}
        onClose={() => setShowAttachmentUploadDialog(false)}
        onSelect={(media: MediaFile) => {
          addAttachmentMutation.mutate({ 
            mediaFileId: media.id, 
            altText: media.altText || media.title || "مرفق جديد" 
          });
        }}
        articleTitle={title}
        articleContent={content?.substring(0, 500)}
        uploadPurpose="article-attachment"
      />
    </DashboardLayout>
  );
}
