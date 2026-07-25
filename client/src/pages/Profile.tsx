import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Redirect, useLocation, useRoute, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { LoyaltyBlock } from "@/components/loyalty/LoyaltyBlock";
import { LoyaltyCard } from "@/components/loyalty/LoyaltyCard";
import { computeTier, nextTier } from "@shared/loyalty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { 
  Heart,
  Bookmark,
  FileText,
  Shield,
  Loader2,
  Upload,
  TrendingUp,
  LayoutDashboard,
  Trophy,
  Star,
  Sparkles,
  Tag,
  X,
  AlertCircle,
  Mail,
  Users,
  UserMinus,
  IdCard,
  Check,
  Download,
  Edit,
  Clock,
  Eye,
  Lock,
  ChevronDown,
  Newspaper,
  CreditCard,
} from "lucide-react";
import { ArticleCard } from "@/components/ArticleCard";
import { SmartInterestsBlock } from "@/components/SmartInterestsBlock";
import type { ArticleWithDetails, User as UserType, UserPointsTotal } from "@shared/schema";
import { hasRole } from "@/hooks/useAuth";

const updateUserSchema = z.object({
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").optional(),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").optional(),
  bio: z.string().max(500, "النبذة يجب أن لا تزيد عن 500 حرف").optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional(),
  profileImageUrl: z.string().url("رابط الصورة غير صحيح").optional().or(z.literal("")),
});

type UpdateUserFormData = z.infer<typeof updateUserSchema>;

/**
 * Compact, information-dense list used by the "محفوظاتي" tab for bookmarks,
 * likes and reading history. Uses the existing horizontal `list` variant of
 * ArticleCard (small thumbnail + title + category + date) so the cards are
 * much smaller than the default grid card, and renders in a clean responsive
 * grid with no horizontal scroll. Loading + empty states are unified here.
 */
function SavedArticlesList({
  articles,
  isLoading,
  emptyIcon: EmptyIcon,
  emptyText,
  emptyHint,
}: {
  articles: ArticleWithDetails[];
  isLoading: boolean;
  emptyIcon: typeof Bookmark;
  emptyText: string;
  emptyHint?: string;
}) {
  const initialVisibleCount = 10;
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="py-14 text-center">
        <EmptyIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
        <p className="font-medium text-muted-foreground">{emptyText}</p>
        {emptyHint && <p className="mt-1 text-sm text-muted-foreground/70">{emptyHint}</p>}
      </div>
    );
  }

  const visibleArticles = articles.slice(0, visibleCount);
  const remainingCount = Math.max(0, articles.length - visibleCount);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{articles.length.toLocaleString("en-US")} مادة</span>
        {remainingCount > 0 && (
          <span>
            عرض {visibleArticles.length.toLocaleString("en-US")} من {articles.length.toLocaleString("en-US")}
          </span>
        )}
      </div>
      <div className="divide-y divide-border/60 rounded-none border-y border-border/50">
        {visibleArticles.map((article) => (
          <div key={article.id} className="py-2 first:pt-0 last:pb-0">
            <ArticleCard article={article} variant="list" />
          </div>
        ))}
      </div>
      {remainingCount > 0 && (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-center gap-2 sm:w-auto"
          onClick={() => setVisibleCount((count) => count + initialVisibleCount)}
          data-testid="button-show-more-saved"
        >
          عرض المزيد
          <span className="text-xs text-muted-foreground">({Math.min(initialVisibleCount, remainingCount)})</span>
        </Button>
      )}
      {visibleCount > initialVisibleCount && (
        <button
          type="button"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => {
            setVisibleCount(initialVisibleCount);
            window.requestAnimationFrame(() => {
              document.querySelector('[data-testid="profile-saved-heading"]')?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            });
          }}
        >
          العودة إلى البداية
        </button>
      )}
    </div>
  );
}


const PROFILE_TABS = [
  { id: "overview", label: "نظرة عامة", icon: Eye, legacy: [] as string[] },
  { id: "saved", label: "محفوظاتي", icon: Bookmark, legacy: ["bookmarks"] },
  { id: "activity", label: "نشاطي", icon: TrendingUp, legacy: ["journey"] },
  { id: "network", label: "متابعاتي", icon: Users, legacy: ["followers"] },
  { id: "cards", label: "بطاقاتي", icon: CreditCard, legacy: ["wallet"] },
] as const;

type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

function normalizeProfileTab(raw: string | null | undefined): ProfileTabId | "settings" | null {
  if (!raw) return null;
  if (raw === "settings") return "settings";
  for (const tab of PROFILE_TABS) {
    if (tab.id === raw || (tab.legacy as readonly string[]).includes(raw)) {
      return tab.id;
    }
  }
  return null;
}

export default function Profile() {
  const { toast } = useToast();
  const [, params] = useRoute("/profile/:segment");
  const search = useSearch();
  const [, setLocation] = useLocation();
  const queryTab = useMemo(() => {
    try {
      return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
    } catch {
      return null;
    }
  }, [search]);

  const routeTab = normalizeProfileTab(params?.segment) ?? normalizeProfileTab(queryTab);
  const [activeTab, setActiveTabState] = useState<ProfileTabId>(
    routeTab && routeTab !== "settings" ? routeTab : "overview",
  );
  const [savedView, setSavedView] = useState<"bookmarks" | "likes" | "history">("bookmarks");
  const [networkView, setNetworkView] = useState<"followers" | "following">("followers");
  const [isLoyaltyCardExpanded, setIsLoyaltyCardExpanded] = useState(false);

  useEffect(() => {
    if (routeTab === "settings") return;
    if (routeTab && routeTab !== activeTab) {
      setActiveTabState(routeTab);
    }
  }, [routeTab, activeTab]);

  const setActiveTab = (tab: string) => {
    const normalized = normalizeProfileTab(tab) ?? "overview";
    if (normalized === "settings") {
      setLocation("/settings");
      return;
    }
    setActiveTabState(normalized);
    const path = normalized === "overview" ? "/profile" : `/profile/${normalized}`;
    setLocation(path);
  };

  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  const { data: activitySummary } = useQuery<any>({
    queryKey: ["/api/user/activity-summary"],
    enabled: !!user,
  });

  const { data: categoriesAll } = useQuery<any[]>({
    queryKey: ["/api/categories/all"],
  });

  const { data: recommendations } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/recommendations"],
    enabled: !!user,
  });



  const form = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    values: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      bio: user?.bio || "",
      phoneNumber: user?.phoneNumber || "",
      profileImageUrl: user?.profileImageUrl || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateUserFormData) => {
      return apiRequest("/api/auth/user", {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "تم التحديث بنجاح",
        description: "تم حفظ بياناتك الشخصية",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في تحديث البيانات. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/auth/resend-verification", {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الإرسال بنجاح",
        description: "تم إرسال رسالة التحقق إلى بريدك الإلكتروني. يرجى التحقق من صندوق الوارد.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال رسالة التحقق. حاول مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "خطأ", description: "الرجاء اختيار ملف صورة فقط", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "خطأ", description: "حجم الصورة يجب أن يكون أقل من 5 ميجابايت", variant: "destructive" });
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "profile-avatar");
      const uploaded = (await apiRequest("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      })) as { url: string };

      await apiRequest("/api/profile/image", {
        method: "PUT",
        body: JSON.stringify({ profileImageUrl: uploaded.url }),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      toast({
        title: "تم التحديث بنجاح",
        description: "تم تحديث صورتك الشخصية",
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ الصورة. حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const onSubmit = (data: UpdateUserFormData) => {
    updateMutation.mutate(data);
  };

  const { data: likedArticlesRaw, isLoading: isLoadingLiked } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/profile/liked"],
    enabled: !!user,
  });
  const likedArticles = Array.isArray(likedArticlesRaw) ? likedArticlesRaw : [];

  const { data: bookmarkedArticlesRaw, isLoading: isLoadingBookmarks } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/profile/bookmarks"],
    enabled: !!user,
  });
  const bookmarkedArticles = Array.isArray(bookmarkedArticlesRaw) ? bookmarkedArticlesRaw : [];

  const { data: readingHistoryRaw, isLoading: isLoadingHistory } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/profile/history"],
    enabled: !!user,
  });
  const readingHistory = Array.isArray(readingHistoryRaw) ? readingHistoryRaw : [];

  const { data: loyaltyPoints } = useQuery<UserPointsTotal>({
    queryKey: ["/api/loyalty/points"],
    enabled: !!user,
  });

  // Computed values for Journey Dashboard (Moved below query declarations to avoid TDZ error)
  const lifetime = loyaltyPoints?.lifetimePoints ?? 0;
  const currentTier = computeTier(lifetime);
  const nextTierInfo = nextTier(currentTier.level);
  
  // Calculate percentage progress to next tier
  let progressPercentage = 100;
  let pointsToNext = 0;
  if (nextTierInfo) {
    const range = nextTierInfo.minLifetimePoints - currentTier.minLifetimePoints;
    const earned = lifetime - currentTier.minLifetimePoints;
    progressPercentage = Math.min(100, Math.max(0, (earned / range) * 100));
    pointsToNext = nextTierInfo.minLifetimePoints - lifetime;
  }

  // Fraction (0..1) of the distance travelled along the 5-node tier path:
  // 0 = sitting on tier 1, 1 = reached tier 5. Each completed tier adds 1/4,
  // and the in-progress segment toward the next tier adds a fractional 1/4.
  // The timeline track widths/heights below are derived purely from this —
  // no magic pixel offsets — so the active bar always lands on circle centers.
  const tierFloor = currentTier.level - 1; // 0..4 completed segments
  const segmentProgress = nextTierInfo ? progressPercentage / 100 : 0; // 0..1 within current segment
  const pathProgress = Math.min(1, Math.max(0, (tierFloor + segmentProgress) / 4));

  // Tier path nodes — single source for both the desktop (horizontal) and
  // mobile (vertical) timelines. Thresholds mirror @shared/loyalty LOYALTY_TIERS.
  const tierNodes = [
    { level: 1, threshold: 0 },
    { level: 2, threshold: 100 },
    { level: 3, threshold: 500 },
    { level: 4, threshold: 2000 },
    { level: 5, threshold: 10000 },
  ];

  // Map categories read statistics
  let topCategoriesData = (activitySummary?.topCategories || []).map((tc: any) => {
    const cat = categoriesAll?.find(c => c.id === tc.categoryId);
    return {
      name: cat ? (cat.nameAr || cat.name) : "تصنيف آخر",
      value: tc.count,
      weight: tc.weight,
      color: cat?.color || "#6B7280",
      icon: cat?.icon
    };
  });

  // Client-side fallback if the API summary is empty but we have local reading history
  if (topCategoriesData.length === 0 && readingHistory.length > 0) {
    const counts: Record<string, { count: number; name: string; color: string }> = {};
    readingHistory.forEach((art) => {
      const catId = art.categoryId || art.category?.id;
      if (!catId) return;
      const fullCat = categoriesAll?.find(c => c.id === catId);
      const name = fullCat ? (fullCat.nameAr || fullCat.name) : (art.category?.nameAr || "تصنيف آخر");
      const color = fullCat?.color || art.category?.color || "#6B7280";
      if (!counts[catId]) {
        counts[catId] = { count: 0, name, color };
      }
      counts[catId].count += 1;
    });

    const total = readingHistory.length;
    topCategoriesData = Object.entries(counts).map(([_, data]) => ({
      name: data.name,
      value: data.count,
      weight: data.count / total,
      color: data.color,
      icon: null
    })).sort((a, b) => b.value - a.value);
  }
  // Calculate stats
  const totalReads = activitySummary?.totalArticlesRead ?? readingHistory.length ?? 0;
  const estimatedReadTime = Math.round(totalReads * 3);
  const totalEngagement = (activitySummary?.totalComments ?? 0) + (activitySummary?.totalReactions ?? 0) + (activitySummary?.totalBookmarks ?? 0);
  const userPoints = loyaltyPoints?.totalPoints ?? 0;

  const { data: followedKeywordsRaw, isLoading: isLoadingKeywords } = useQuery<
    Array<{ tagId: string; tagName: string; notify: boolean; articleCount: number }>
  >({
    queryKey: ["/api/user/followed-keywords"],
    enabled: !!user,
  });
  const followedKeywords = Array.isArray(followedKeywordsRaw) ? followedKeywordsRaw : [];

  const unfollowKeywordMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return await apiRequest(`/api/keywords/unfollow/${tagId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/followed-keywords"] });
      toast({
        title: "تم إلغاء المتابعة",
        description: "لن تتلقى إشعارات عن هذه الكلمة",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إلغاء المتابعة",
        variant: "destructive",
      });
    },
  });

  const { data: followStats, isLoading: isLoadingFollowStats } = useQuery<{
    followersCount: number;
    followingCount: number;
  }>({
    queryKey: ['/api/social/stats', user?.id],
    enabled: !!user,
  });

  const { data: followersRaw, isLoading: isLoadingFollowers } = useQuery<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      bio: string | null;
      profileImageUrl: string | null;
    }>
  >({
    queryKey: ['/api/social/followers', user?.id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/social/followers/${user?.id}?limit=50`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch followers');
      return res.json();
    },
    enabled: !!user && activeTab === 'network' && networkView === 'followers',
  });
  const followers = Array.isArray(followersRaw) ? followersRaw : [];

  const { data: followingRaw, isLoading: isLoadingFollowing } = useQuery<
    Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      bio: string | null;
      profileImageUrl: string | null;
    }>
  >({
    queryKey: ['/api/social/following', user?.id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/social/following/${user?.id}?limit=50`), {
        credentials: "include",
      });
      if (!res.ok) throw new Error('Failed to fetch following');
      return res.json();
    },
    enabled: !!user && activeTab === 'network' && networkView === 'following',
  });
  const following = Array.isArray(followingRaw) ? followingRaw : [];

  const unfollowUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/social/unfollow/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, unfollowedUserId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/social/followers', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/following', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/stats', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/stats', unfollowedUserId] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/followers', unfollowedUserId] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      
      toast({
        title: "تم إلغاء المتابعة",
        description: "لم تعد تتابع هذا المستخدم",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إلغاء المتابعة",
        variant: "destructive",
      });
    },
  });

  // Press Card Status Query
  const { data: pressCardStatus, isLoading: isLoadingPressCard } = useQuery({
    queryKey: ['/api/wallet/press/status'],
    enabled: !!user,
  });

  // Loyalty Card Status Query
  const { data: loyaltyCardStatus, isLoading: isLoadingLoyaltyCard } = useQuery({
    queryKey: ['/api/wallet/loyalty/status'],
    enabled: !!user,
  });

  // Press Card Issuance Mutation
  const issuePressCardMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiUrl('/api/wallet/press/issue'), {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to issue press card');
      }
      
      const contentType = response.headers.get('Content-Type');
      if (contentType === 'application/vnd.apple.pkpass') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sabq-press-card.pkpass';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true, downloaded: true };
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/press/status'] });
      toast({
        title: "تم التحميل",
        description: "تم تحميل البطاقة الصحفية. افتح الملف لإضافتها إلى Apple Wallet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "تعذر إصدار البطاقة الصحفية",
        variant: "destructive",
      });
    },
  });

  // Loyalty Card Issuance Mutation
  const issueLoyaltyCardMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(apiUrl('/api/wallet/loyalty/issue'), {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to issue loyalty card');
      }
      
      const contentType = response.headers.get('Content-Type');
      if (contentType === 'application/vnd.apple.pkpass') {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sabq-loyalty-card.pkpass';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return { success: true, downloaded: true };
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/loyalty/status'] });
      toast({
        title: "تم التحميل",
        description: "تم تحميل بطاقة العضوية. افتح الملف لإضافتها إلى Apple Wallet.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "تعذر إصدار بطاقة العضوية",
        variant: "destructive",
      });
    },
  });

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName?.[0]}${user.lastName?.[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user?.email?.[0].toUpperCase();
    }
    return 'م';
  };

  const getUserDisplayName = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) {
      return user.firstName;
    }
    if (user?.lastName) {
      return user.lastName;
    }
    return "مستخدم";
  };

  const getRoleBadge = (role?: string) => {
    // Full role→Arabic-label map. Previously this only covered five
    // roles which meant writers/columnists/editor-in-chief/etc. fell
    // through to either the raw English key or — when role was nil —
    // the "reader" fallback, surfacing as "قارئ" for non-reader users.
    // The 2026-05-20 fix to /api/auth/user now also ships `roleLabel`
    // directly from the DB; this client-side map is the fallback for
    // sessions cached before that backend deploy reached the edge.
    const labels: Record<string, string> = {
      system_admin: "مدير النظام",
      superadmin: "المدير العام",
      admin: "مسؤول",
      editor: "محرر",
      editor_in_chief: "رئيس التحرير",
      chief_editor: "رئيس التحرير",
      senior_editor: "محرر أول",
      managing_editor: "مدير تحرير",
      editorial_manager: "مدير تحرير",
      content_manager: "مدير محتوى",
      reporter: "مراسل",
      correspondent: "مراسل",
      journalist: "صحفي",
      writer: "كاتب",
      author: "كاتب",
      article_writer: "كاتب مقال",
      article_author: "كاتب مقال",
      opinion_author: "كاتب مقال رأي",
      columnist: "كاتب عمود",
      comments_moderator: "مشرف تعليقات",
      moderator: "مشرف",
      media_manager: "مدير وسائط",
      publisher: "ناشر",
      photographer: "مصور",
      contributor: "مساهم",
      reader: "قارئ",
    };
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      system_admin: "default",
      superadmin: "default",
      admin: "default",
      editor: "secondary",
      editor_in_chief: "default",
      chief_editor: "default",
      senior_editor: "secondary",
      managing_editor: "default",
      editorial_manager: "default",
      content_manager: "default",
      reporter: "secondary",
      correspondent: "secondary",
      journalist: "secondary",
      writer: "secondary",
      author: "secondary",
      article_writer: "secondary",
      article_author: "secondary",
      opinion_author: "secondary",
      columnist: "secondary",
      comments_moderator: "secondary",
      moderator: "secondary",
      media_manager: "secondary",
      publisher: "secondary",
      photographer: "outline",
      contributor: "outline",
      reader: "outline",
    };
    // Prefer the server-supplied roleLabel (Arabic, single source of
    // truth in the DB roles.name_ar column). Fall back to the local
    // map for sessions cached before the backend update propagated.
    const label = (user as any)?.roleLabel
      || labels[role || "reader"]
      || role
      || "قارئ";
    return (
      <Badge variant={variants[role || "reader"] || "outline"} data-testid="badge-user-role">
        {label}
      </Badge>
    );
  };

  const getFollowerDisplayName = (follower: { firstName: string | null; lastName: string | null; email: string | null }) => {
    if (follower.firstName || follower.lastName) {
      return `${follower.firstName || ''} ${follower.lastName || ''}`.trim();
    }
    return follower.email || 'مستخدم';
  };

  const getFollowerInitials = (follower: { firstName: string | null; lastName: string | null; email: string | null }) => {
    if (follower.firstName) return follower.firstName?.[0].toUpperCase();
    if (follower.email) return follower?.email?.[0].toUpperCase();
    return 'م';
  };

  if (routeTab === "settings") {
    return <Redirect to="/settings" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={user} />
        <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">يجب تسجيل الدخول</h1>
            <p className="text-muted-foreground mb-8">
              سجل الدخول لعرض ملفك الشخصي
            </p>
            <Button 
              onClick={() => window.location.href = "/api/login"} 
              data-testid="button-login-profile"
            >
              تسجيل الدخول
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />

      {user && !user.emailVerified && (
        <div className="container mx-auto max-w-5xl px-4 pt-4 sm:px-6" dir="rtl">
          <Alert className="border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20" data-testid="alert-email-verification">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            <AlertTitle className="text-right text-amber-900 dark:text-amber-300">
              يرجى تفعيل حسابك عبر البريد الإلكتروني
            </AlertTitle>
            <AlertDescription className="text-amber-800 dark:text-amber-400">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-right text-sm">
                  للوصول الكامل لجميع الميزات، يرجى التحقق من بريدك الإلكتروني.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resendVerificationMutation.mutate()}
                  disabled={resendVerificationMutation.isPending}
                  className="shrink-0 border-amber-300 dark:border-amber-800"
                  data-testid="button-resend-verification"
                >
                  {resendVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Mail className="ml-2 h-4 w-4" />
                      إعادة إرسال رسالة التحقق
                    </>
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {(() => {
        const heroLifetime = loyaltyPoints?.lifetimePoints ?? 0;
        const heroTier = computeTier(heroLifetime);
        const heroLevel = loyaltyPoints?.rankLevel ?? heroTier.level;
        const navItems = PROFILE_TABS;

        return (
          <>
            {/* Atmospheric brand plane — not a card */}
            <section
              className="relative overflow-hidden border-b border-border/40"
              style={{
                background: `radial-gradient(1200px 420px at 100% -10%, ${heroTier.color}22, transparent 55%), linear-gradient(180deg, hsl(var(--primary) / 0.06) 0%, transparent 70%)`,
              }}
              dir="rtl"
            >
              <div className="pointer-events-none absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "repeating-linear-gradient(-12deg, currentColor 0 1px, transparent 1px 14px)" }} />
              <div className="container relative mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-10">
                <div className="flex flex-col gap-5 sm:gap-8 lg:flex-row lg:items-end lg:justify-between">
                  {/* Identity — editorial masthead */}
                  <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center sm:gap-5">
                    <div className="relative shrink-0">
                      <div
                        className="rounded-full p-[3px]"
                        style={{ background: `linear-gradient(145deg, ${heroTier.color}, ${heroTier.color}55)` }}
                      >
                        <Avatar className="h-20 w-20 border-[3px] border-background sm:h-24 sm:w-24">
                          <AvatarImage
                            src={user.profileImageUrl || ""}
                            alt={getUserDisplayName()}
                            className="object-cover"
                            data-testid="img-profile-avatar"
                          />
                          <AvatarFallback className="bg-primary text-xl text-primary-foreground sm:text-2xl">
                            {getInitials()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <input
                        id="avatar-file-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        onChange={handleAvatarFileChange}
                        disabled={isUploadingAvatar}
                        data-testid="input-avatar-file"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute -bottom-1 -left-1 h-8 w-8 rounded-full border border-border/60 shadow-sm"
                        disabled={isUploadingAvatar}
                        onClick={() => document.getElementById("avatar-file-input")?.click()}
                        data-testid="button-upload-avatar"
                        aria-label="تغيير الصورة الشخصية"
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5 text-right sm:space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                        سبق · ملفي
                      </p>
                      <h1
                        className="truncate text-2xl font-black tracking-tight sm:text-4xl"
                        data-testid="text-profile-name"
                      >
                        {getUserDisplayName()}
                      </h1>
                      <p className="truncate text-sm text-muted-foreground" data-testid="text-profile-email">
                        {user.email}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {getRoleBadge(user.role)}
                        {user.hasPressCard && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="badge-press-card">
                            <IdCard className="h-3.5 w-3.5" />
                            صحفي معتمد
                          </span>
                        )}
                      </div>
                      {user.bio && (
                        <p className="max-w-xl text-sm leading-relaxed text-foreground/75">
                          {user.bio}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          variant="default"
                          size="sm"
                          className="min-w-0 flex-1 gap-2 sm:flex-none"
                          asChild
                          data-testid="button-edit-profile"
                        >
                          <Link href="/settings/account">
                            <Edit className="h-4 w-4" />
                            تعديل بياناتي
                          </Link>
                        </Button>
                        {hasRole(user, "editor", "admin", "system_admin") && (
                          <Button variant="ghost" size="sm" className="gap-2" asChild data-testid="button-go-to-dashboard">
                            <Link href="/dashboard">
                              <LayoutDashboard className="h-4 w-4" />
                              لوحة التحكم
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Desktop loyalty card */}
                  <div className="mx-auto hidden w-full max-w-md shrink-0 lg:mx-0 lg:block lg:w-[380px]">
                    <LoyaltyCard
                      userName={getUserDisplayName()}
                      userId={user.id}
                      lifetimePoints={heroLifetime}
                      memberSince={user.createdAt}
                      rankLevel={heroLevel}
                    />
                  </div>

                  {/* Compact mobile summary keeps the profile content within easy reach. */}
                  <div className="w-full lg:hidden">
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-right shadow-sm backdrop-blur transition-colors hover:bg-muted/40"
                      onClick={() => setIsLoyaltyCardExpanded((expanded) => !expanded)}
                      aria-expanded={isLoyaltyCardExpanded}
                      aria-controls="mobile-loyalty-card"
                      data-testid="button-toggle-loyalty-card"
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: heroTier.color }}
                      >
                        <Trophy className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{heroTier.nameAr}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {heroLifetime.toLocaleString("en-US")} نقطة تاريخية
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        {isLoyaltyCardExpanded ? "إخفاء البطاقة" : "عرض البطاقة"}
                        <ChevronDown
                          className={cn("h-4 w-4 transition-transform", isLoyaltyCardExpanded && "rotate-180")}
                        />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isLoyaltyCardExpanded && (
                        <motion.div
                          id="mobile-loyalty-card"
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: "auto", marginTop: 12 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          className="mx-auto max-w-md overflow-hidden"
                        >
                          <LoyaltyCard
                            userName={getUserDisplayName()}
                            userId={user.id}
                            lifetimePoints={heroLifetime}
                            memberSince={user.createdAt}
                            rankLevel={heroLevel}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Slim tier progress — no card */}
                <div className="mt-5 space-y-2 sm:mt-8">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">{currentTier.nameAr}</span>
                    <span className="text-muted-foreground">
                      {nextTierInfo
                        ? `${pointsToNext.toLocaleString("en-US")} نقطة للرتبة التالية`
                        : "أعلى رتبة — سفير سبق"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-l from-amber-500 to-amber-400 transition-all duration-700"
                      style={{ width: `${nextTierInfo ? progressPercentage : 100}%` }}
                    />
                  </div>
                </div>

                {/* Flat metrics strip */}
                <div
                  className="mt-5 grid grid-cols-5 items-stretch border-y border-border/50 py-3 text-center sm:mt-6 sm:py-4"
                  data-testid="profile-metrics-strip"
                >
                  {[
                    { label: "متابع", value: followStats?.followersCount || 0, testId: "text-stat-followers" },
                    { label: "إعجاب", value: likedArticles.length, testId: "text-stat-likes" },
                    { label: "محفوظ", value: bookmarkedArticles.length, testId: "text-stat-bookmarks" },
                    { label: "قراءة", value: readingHistory.length, testId: "text-stat-reads" },
                    { label: "نقطة", value: loyaltyPoints?.totalPoints || 0, testId: "text-stat-points" },
                  ].map((m, i) => (
                    <div
                      key={m.label}
                      className={cn(
                        "min-w-0 px-1 sm:px-2",
                        i > 0 && "border-r border-border/40",
                      )}
                    >
                      <p className="truncate text-base font-black tabular-nums tracking-tight sm:text-2xl" data-testid={m.testId}>
                        {Number(m.value).toLocaleString("en-US")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{m.label}</p>
                    </div>
                  ))}
                </div>

                <AnimatePresence>
                  {false && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-6 overflow-hidden border-t border-border/50 pt-6"
                    >
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                          {(() => {
                            const firstNameLocked = !!user?.firstName?.trim();
                            const lastNameLocked = !!user?.lastName?.trim();
                            return (
                              <>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                  <FormField
                                    control={form.control}
                                    name="firstName"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>الاسم الأول</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            readOnly={firstNameLocked}
                                            disabled={firstNameLocked}
                                            className={firstNameLocked ? "cursor-not-allowed opacity-70" : ""}
                                            data-testid="input-first-name"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                  <FormField
                                    control={form.control}
                                    name="lastName"
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>اسم العائلة</FormLabel>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            readOnly={lastNameLocked}
                                            disabled={lastNameLocked}
                                            className={lastNameLocked ? "cursor-not-allowed opacity-70" : ""}
                                            data-testid="input-last-name"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                                {(firstNameLocked || lastNameLocked) && (
                                  <p className="-mt-2 text-xs text-muted-foreground">
                                    لا يمكن تعديل الاسم بعد التسجيل لاعتبارات أمنية ومصداقية التعليقات
                                  </p>
                                )}
                              </>
                            );
                          })()}
                          <FormField
                            control={form.control}
                            name="phoneNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>رقم الهاتف</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-phone-number" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="bio"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>نبذة عنك</FormLabel>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    rows={3}
                                    placeholder="اكتب نبذة مختصرة عنك..."
                                    data-testid="input-bio"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="flex gap-2">
                            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-profile">
                              {updateMutation.isPending ? (
                                <>
                                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                                  جاري الحفظ...
                                </>
                              ) : (
                                "حفظ التغييرات"
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                form.reset();
                              }}
                              data-testid="button-cancel-edit"
                            >
                              إلغاء
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Editorial navigation + content — no wrapping Card */}
            <main className="container mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8" dir="rtl" data-testid="profile-account-band">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div
                  className="sticky top-0 z-20 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border/60 bg-background/95 px-4 pb-px backdrop-blur sm:static sm:mx-0 sm:mb-8 sm:bg-transparent sm:px-0 sm:backdrop-blur-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  role="tablist"
                  aria-label="أقسام الملف الشخصي"
                >
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveTab(item.id)}
                        role="tab"
                        aria-selected={active}
                        aria-controls={`profile-panel-${item.id}`}
                        data-testid={`tab-${item.id === "network" ? "followers" : item.id === "saved" ? "bookmarks" : item.id}`}
                        className={cn(
                          "relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
                          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                        {active && (
                          <motion.span
                            layoutId="profile-nav-underline"
                            className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>


                <TabsContent id="profile-panel-overview" value="overview" className="mt-0 space-y-6 focus-visible:outline-none">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">نظرة عامة</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">هويتك ونشاطك السريع في سبق</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Link href="/profile/saved" className="rounded-xl border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors">
                      <Bookmark className="h-5 w-5 text-primary mb-2" />
                      <p className="font-semibold">محفوظاتي</p>
                      <p className="text-xs text-muted-foreground mt-1">{bookmarkedArticles.length.toLocaleString("en-US")} مادة محفوظة</p>
                    </Link>
                    <Link href="/daily-brief" className="rounded-xl border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors">
                      <Newspaper className="h-5 w-5 text-primary mb-2" />
                      <p className="font-semibold">ملخص اليوم</p>
                      <p className="text-xs text-muted-foreground mt-1">تحليل ذكي لنشاطك خلال 24 ساعة</p>
                    </Link>
                    <Link href="/focus/weekly" className="rounded-xl border border-border/60 bg-card p-4 hover:border-primary/40 transition-colors">
                      <Eye className="h-5 w-5 text-primary mb-2" />
                      <p className="font-semibold">تقرير التركيز الأسبوعي</p>
                      <p className="text-xs text-muted-foreground mt-1">جلسات القراءة المركّزة لآخر 7 أيام</p>
                    </Link>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold">آخر ما حفظتَه</h3>
                      <Link href="/profile/saved" className="text-xs font-medium text-primary">عرض الكل</Link>
                    </div>
                    <SavedArticlesList
                      articles={bookmarkedArticles.slice(0, 4)}
                      isLoading={isLoadingBookmarks}
                      emptyIcon={Bookmark}
                      emptyText="لم تحفظ أي مقالات بعد"
                      emptyHint="احفظ المقالات المهمة لقراءتها لاحقًا"
                    />
                  </div>
                </TabsContent>

                {/* محفوظاتي أولاً */}
                <TabsContent id="profile-panel-saved" value="saved" className="mt-0 space-y-5 focus-visible:outline-none">
                  <div className="space-y-4" data-testid="profile-saved-heading">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">محفوظاتي</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">ما حفظتَه وأعجبتَ به وما قرأتَه مؤخراً</p>
                    </div>
                    <div className="grid w-full grid-cols-3 rounded-xl bg-muted/60 p-1 text-xs text-muted-foreground sm:w-fit sm:min-w-[360px]" role="tablist" aria-label="نوع المواد المحفوظة">
                      {(
                        [
                          ["bookmarks", "المحفوظات", bookmarkedArticles.length, "button-saved-bookmarks"],
                          ["likes", "الإعجابات", likedArticles.length, "tab-activity"],
                          ["history", "سجل القراءة", readingHistory.length, "button-saved-history"],
                        ] as const
                      ).map(([id, label, count, testId]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setSavedView(id)}
                          data-testid={testId}
                          role="tab"
                          aria-selected={savedView === id}
                          className={cn(
                            "flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-medium transition-all",
                            savedView === id
                              ? "bg-background text-foreground shadow-sm"
                              : "hover:text-foreground",
                          )}
                        >
                          <span className="truncate">{label}</span>
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                              savedView === id ? "bg-primary/10 text-primary" : "bg-background/70",
                            )}
                          >
                            {count.toLocaleString("en-US")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {savedView === "bookmarks" && (
                    <SavedArticlesList
                      key="bookmarks"
                      articles={bookmarkedArticles}
                      isLoading={isLoadingBookmarks}
                      emptyIcon={Bookmark}
                      emptyText="لم تحفظ أي مقالات بعد"
                      emptyHint="احفظ المقالات المهمة لقراءتها لاحقًا"
                    />
                  )}
                  {savedView === "likes" && (
                    <SavedArticlesList
                      key="likes"
                      articles={likedArticles}
                      isLoading={isLoadingLiked}
                      emptyIcon={Heart}
                      emptyText="لم تعجبك أي مقالات بعد"
                      emptyHint="ستظهر هنا المقالات التي أعجبت بها"
                    />
                  )}
                  {savedView === "history" && (
                    <SavedArticlesList
                      key="history"
                      articles={readingHistory}
                      isLoading={isLoadingHistory}
                      emptyIcon={Clock}
                      emptyText="لم تقرأ أي مقالات بعد"
                      emptyHint="ستظهر هنا آخر المقالات التي قرأتها"
                    />
                  )}
                </TabsContent>

                <TabsContent id="profile-panel-activity" value="activity" className="mt-0 space-y-10 focus-visible:outline-none">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">نشاطي</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      قراءة · تفاعل · تقدّم الولاء والتقارير
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Link href="/daily-brief" className="flex items-start gap-3 rounded-xl border border-border/60 p-4 hover:border-primary/40 transition-colors">
                      <Newspaper className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">ملخصي اليومي</p>
                        <p className="text-xs text-muted-foreground mt-0.5">تحليل AI لنشاط قراءتك خلال اليوم</p>
                      </div>
                    </Link>
                    <Link href="/focus/weekly" className="flex items-start gap-3 rounded-xl border border-border/60 p-4 hover:border-primary/40 transition-colors">
                      <Eye className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">تقرير التركيز الأسبوعي</p>
                        <p className="text-xs text-muted-foreground mt-0.5">ملخص جلسات وضع التركيز لآخر سبعة أيام</p>
                      </div>
                    </Link>
                  </div>

                  {/* Compact stats as newspaper figures */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                    {[
                      { label: "مقالات مقروءة", value: totalReads, hint: `${activitySummary?.articlesReadLast7Days ?? 0} هذا الأسبوع` },
                      { label: "نقاط الولاء", value: userPoints, hint: `من ${lifetime.toLocaleString("en-US")} تاريخية` },
                      { label: "وقت القراءة", value: `${estimatedReadTime}`, hint: "دقيقة تقديرية" },
                      { label: "التفاعل", value: totalEngagement, hint: `${activitySummary?.totalComments ?? 0} تعليق` },
                    ].map((s) => (
                      <div key={s.label} className="space-y-1 border-r border-border/40 pr-4 last:border-0">
                        <p className="text-[11px] text-muted-foreground">{s.label}</p>
                        <p className="text-2xl font-black tabular-nums tracking-tight">{typeof s.value === "number" ? s.value.toLocaleString("en-US") : s.value}</p>
                        <p className="text-[10px] text-muted-foreground/80">{s.hint}</p>
                      </div>
                    ))}
                  </div>

                  {/* Tier nodes — compact horizontal only */}
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      مسار الرتب
                    </h3>
                    <div className="relative flex max-w-2xl items-start">
                      <div className="absolute top-4 h-0.5 bg-muted" style={{ insetInlineStart: "10%", insetInlineEnd: "10%" }} />
                      <div
                        className="absolute top-4 h-0.5 bg-gradient-to-l from-amber-500 to-amber-400 transition-all duration-700"
                        style={{ insetInlineStart: "10%", width: `calc(80% * ${pathProgress})` }}
                      />
                      {tierNodes.map(({ level, threshold }) => {
                        const tierInfo = computeTier(threshold);
                        const isCurrent = currentTier.level === level;
                        const isUnlocked = currentTier.level >= level;
                        return (
                          <div key={level} className="relative z-10 flex flex-1 flex-col items-center gap-1.5">
                            <div
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-all",
                                isCurrent
                                  ? "scale-110 border-amber-500 bg-background text-amber-600 ring-4 ring-amber-500/15 dark:text-amber-400"
                                  : isUnlocked
                                    ? "border-amber-500 bg-amber-500 text-white"
                                    : "border-muted bg-background text-muted-foreground",
                              )}
                            >
                              {level}
                            </div>
                            <span className={cn("text-[10px] leading-tight", isCurrent ? "font-bold text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                              {tierInfo.nameAr}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interests — bars, no pie card */}
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      اهتماماتك من القراءة
                    </h3>
                    {topCategoriesData.length > 0 ? (
                      <div className="space-y-3">
                        {topCategoriesData.slice(0, 6).map((item: any, idx: number) => (
                          <div key={idx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-2 font-medium">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                                {item.name}
                              </span>
                              <span className="tabular-nums text-muted-foreground">
                                {item.value} · {Math.round(item.weight * 100)}%
                              </span>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full" style={{ backgroundColor: item.color, width: `${item.weight * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">ابدأ بالقراءة لرؤية توزيع اهتماماتك.</p>
                    )}
                  </div>

                  {/* Achievements as icon strip */}
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      الأوسمة
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { id: "welcome", title: "شارة البداية", icon: Trophy, unlocked: true },
                        { id: "reader", title: "القارئ النهم", icon: Eye, unlocked: totalReads >= 20 },
                        { id: "commenter", title: "معلق متميز", icon: FileText, unlocked: (activitySummary?.totalComments ?? 0) >= 5 },
                        { id: "supporter", title: "المساند", icon: Heart, unlocked: (activitySummary?.totalReactions ?? 0) >= 10 },
                        { id: "passionate", title: "شغوف", icon: Star, unlocked: lifetime >= 500 },
                        { id: "ambassador", title: "سفير سبق", icon: Shield, unlocked: currentTier.level === 5 },
                      ].map((badge) => {
                        const IconComponent = badge.icon;
                        return (
                          <div
                            key={badge.id}
                            title={badge.title}
                            className={cn(
                              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
                              badge.unlocked
                                ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                                : "bg-muted/40 text-muted-foreground/60",
                            )}
                          >
                            <IconComponent className="h-3.5 w-3.5" />
                            {badge.title}
                            {badge.unlocked ? <Check className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Recommendations — list density */}
                  <div>
                    <h3 className="mb-4 flex items-center gap-2 text-sm font-bold">
                      <Sparkles className="h-4 w-4 text-primary" />
                      ترشيحات لك
                    </h3>
                    {recommendations && recommendations.length > 0 ? (
                      <div className="divide-y divide-border/60 border-y border-border/50">
                        {recommendations.slice(0, 4).map((article) => (
                          <div key={article.id} className="py-2">
                            <ArticleCard article={article} variant="list" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">نجهّز ترشيحات مخصصة بعد مزيد من القراءات.</p>
                    )}
                  </div>

                  {/* Interests + keywords inline */}
                  <div className="grid gap-8 border-t border-border/50 pt-8 md:grid-cols-2">
                    <div>
                      <SmartInterestsBlock userId={user.id} />
                    </div>
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
                        <Tag className="h-4 w-4" />
                        كلماتي المتابعة
                      </h3>
                      {isLoadingKeywords ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-7 w-40" />
                          ))}
                        </div>
                      ) : followedKeywords.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {followedKeywords.slice(0, 12).map((keyword) => (
                            <span
                              key={keyword.tagId}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2.5 py-1 text-xs"
                            >
                              <Link
                                href={`/keyword/${keyword.tagName}`}
                                className="font-medium hover:text-primary"
                                data-testid={`link-keyword-${keyword.tagId}`}
                              >
                                {keyword.tagName}
                              </Link>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => unfollowKeywordMutation.mutate(keyword.tagId)}
                                disabled={unfollowKeywordMutation.isPending}
                                data-testid={`button-unfollow-keyword-${keyword.tagId}`}
                                aria-label="إلغاء المتابعة"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">لم تتابع أي كلمات بعد</p>
                      )}
                      <div className="mt-6">
                        <LoyaltyBlock />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent id="profile-panel-network" value="network" className="mt-0 space-y-5 focus-visible:outline-none">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">متابعاتي</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">من يتابعك ومن تتابع</p>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <button
                        type="button"
                        onClick={() => setNetworkView("followers")}
                        data-testid="button-show-followers"
                        className={cn(
                          "border-b-2 pb-1 transition-colors",
                          networkView === "followers" ? "border-primary font-semibold" : "border-transparent text-muted-foreground",
                        )}
                      >
                        المتابِعون ({followStats?.followersCount || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => setNetworkView("following")}
                        data-testid="button-show-following"
                        className={cn(
                          "border-b-2 pb-1 transition-colors",
                          networkView === "following" ? "border-primary font-semibold" : "border-transparent text-muted-foreground",
                        )}
                      >
                        المتابَعون ({followStats?.followingCount || 0})
                      </button>
                    </div>
                  </div>

                  {networkView === "followers" ? (
                    isLoadingFollowers ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-14 w-full" />
                        ))}
                      </div>
                    ) : followers.length > 0 ? (
                      <ul className="divide-y divide-border/60 border-y border-border/50">
                        {followers.map((follower) => (
                          <li key={follower.id} className="flex items-center gap-3 py-3">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={follower.profileImageUrl || ""} />
                              <AvatarFallback>{getFollowerInitials(follower)}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{getFollowerDisplayName(follower)}</p>
                              {follower.bio && (
                                <p className="line-clamp-1 text-xs text-muted-foreground">{follower.bio}</p>
                              )}
                            </div>
                            <Button variant="ghost" size="sm" asChild data-testid={`button-view-profile-${follower.id}`}>
                              <Link href={`/profile/${follower.id}`}>عرض</Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="py-12 text-center text-sm text-muted-foreground">لا يوجد متابعون بعد</p>
                    )
                  ) : isLoadingFollowing ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-14 w-full" />
                      ))}
                    </div>
                  ) : following.length > 0 ? (
                    <ul className="divide-y divide-border/60 border-y border-border/50">
                      {following.map((followed) => (
                        <li key={followed.id} className="flex items-center gap-3 py-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={followed.profileImageUrl || ""} />
                            <AvatarFallback>{getFollowerInitials(followed)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{getFollowerDisplayName(followed)}</p>
                            {followed.bio && (
                              <p className="line-clamp-1 text-xs text-muted-foreground">{followed.bio}</p>
                            )}
                          </div>
                          <Button variant="ghost" size="sm" asChild data-testid={`button-view-profile-${followed.id}`}>
                            <Link href={`/profile/${followed.id}`}>عرض</Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => unfollowUserMutation.mutate(followed.id)}
                            disabled={unfollowUserMutation.isPending}
                            data-testid={`button-unfollow-user-${followed.id}`}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="py-12 text-center text-sm text-muted-foreground">لا تتابع أحدًا بعد</p>
                  )}
                </TabsContent>

                <TabsContent id="profile-panel-cards" value="cards" className="mt-0 space-y-8 focus-visible:outline-none">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">بطاقاتي</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">بطاقات رقمية لـ Apple Wallet</p>
                  </div>
                  <div className="divide-y divide-border/60 border-y border-border/50">
                    <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                        <div>
                          <h4 className="font-semibold">بطاقة العضوية</h4>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            بطاقة رقمية تعرض نقاط الولاء ورتبتك
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {(loyaltyPoints?.totalPoints || 0).toLocaleString("en-US")} نقطة · {loyaltyPoints?.currentRank || "القارئ الجديد"}
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => issueLoyaltyCardMutation.mutate()}
                        disabled={issueLoyaltyCardMutation.isPending}
                        className="gap-2 shrink-0"
                        data-testid="button-download-loyalty-card"
                      >
                        {issueLoyaltyCardMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            جاري الإصدار...
                          </>
                        ) : (
                          <>
                            <Download className="h-4 w-4" />
                            تحميل البطاقة
                          </>
                        )}
                      </Button>
                    </div>
                    {user.hasPressCard && (
                      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <IdCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          <div>
                            <h4 className="font-semibold">البطاقة الصحفية</h4>
                            <p className="mt-0.5 text-sm text-muted-foreground">بطاقة صحفية رقمية معتمدة من سبق</p>
                          </div>
                        </div>
                        <Button
                          onClick={() => issuePressCardMutation.mutate()}
                          disabled={issuePressCardMutation.isPending}
                          className="gap-2 shrink-0"
                          data-testid="button-download-press-card"
                        >
                          {issuePressCardMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              جاري الإصدار...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4" />
                              تحميل البطاقة
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>

              </Tabs>
            </main>
          </>
        );
      })()}
    </div>
  );
}
