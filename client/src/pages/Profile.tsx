// صفحة الملف الشخصي — إعادة تصميم 2026-06-10.
// المبادئ: معلومة واحدة = مكان واحد (نقاط الولاء تظهر في شريط الولاء فقط)،
// 4 تبويبات بدل 6، الإعدادات خلف أيقونة الترس، لا محتوى موصى به هنا،
// لون الولاء موحّد (ذهبي #c9963f) والألوان الأخرى بياناتية فقط.
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { computeTier, nextTier } from "@shared/loyalty";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
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
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import {
  Heart,
  Bookmark,
  FileText,
  Settings,
  Bell,
  Shield,
  Loader2,
  Upload,
  TrendingUp,
  LayoutDashboard,
  Trophy,
  Coins,
  Star,
  Tag,
  X,
  AlertCircle,
  Mail,
  Users,
  UserMinus,
  IdCard,
  Check,
  Download,
  Wallet,
  Edit,
  Clock,
  Eye,
  Lock,
  CalendarDays,
} from "lucide-react";
import { ArticleCard } from "@/components/ArticleCard";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import type { ArticleWithDetails, User as UserType, UserPointsTotal } from "@shared/schema";
import { hasRole } from "@/hooks/useAuth";

// اللون الموحّد لهوية الولاء في الصفحة (P3 — توحيد الألوان)
const GOLD = "#c9963f";

const updateUserSchema = z.object({
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").optional(),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").optional(),
  bio: z.string().max(500, "النبذة يجب أن لا تزيد عن 500 حرف").optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional(),
  profileImageUrl: z.string().url("رابط الصورة غير صحيح").optional().or(z.literal("")),
});

type UpdateUserFormData = z.infer<typeof updateUserSchema>;

function formatJoinDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "long",
  });
}

export default function Profile() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("activity");
  const [communityView, setCommunityView] = useState<"followers" | "following">("followers");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

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
      setIsEditingProfile(false);
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

  // قيم الولاء المحسوبة — تُعرض في شريط الولاء (Zone 2) ومسار الرتب (إنجازاتي) فقط
  const lifetime = loyaltyPoints?.lifetimePoints ?? 0;
  const currentTier = computeTier(lifetime);
  const nextTierInfo = nextTier(currentTier.level);

  let progressPercentage = 100;
  let pointsToNext = 0;
  if (nextTierInfo) {
    const range = nextTierInfo.minLifetimePoints - currentTier.minLifetimePoints;
    const earned = lifetime - currentTier.minLifetimePoints;
    progressPercentage = Math.min(100, Math.max(0, (earned / range) * 100));
    pointsToNext = nextTierInfo.minLifetimePoints - lifetime;
  }

  // توزيع القراءة حسب الأقسام (يُعرض داخل تبويب نشاطي)
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

  const totalReads = activitySummary?.totalArticlesRead ?? readingHistory.length ?? 0;

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

  const { data: followStats } = useQuery<{
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
      const res = await fetch(apiUrl(`/api/social/followers/${user?.id}?limit=50`));
      if (!res.ok) throw new Error('Failed to fetch followers');
      return res.json();
    },
    enabled: !!user && activeTab === 'community' && communityView === 'followers',
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
      const res = await fetch(apiUrl(`/api/social/following/${user?.id}?limit=50`));
      if (!res.ok) throw new Error('Failed to fetch following');
      return res.json();
    },
    enabled: !!user && activeTab === 'community' && communityView === 'following',
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

  // إصدار البطاقة الصحفية (Apple Wallet) — داخل الإعدادات
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

  // إصدار بطاقة العضوية (Apple Wallet) — داخل الإعدادات
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
    const label = (user as any)?.roleLabel
      || labels[role || "reader"]
      || role
      || "قارئ";
    return (
      <Badge variant="secondary" className="font-normal" data-testid="badge-user-role">
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

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
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
    <div className="min-h-screen bg-[#f8f5f0] dark:bg-background">
      <Header user={user} />

      {/* تنبيه تفعيل البريد */}
      {user && !user.emailVerified && (
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-4" dir="rtl">
          <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900" data-testid="alert-email-verification">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-300 text-right">
              يرجى تفعيل حسابك عبر البريد الإلكتروني
            </AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-400">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-right">
                  للوصول الكامل لجميع الميزات، يرجى التحقق من بريدك الإلكتروني وتفعيل حسابك.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resendVerificationMutation.mutate()}
                  disabled={resendVerificationMutation.isPending}
                  className="shrink-0 border-yellow-300 dark:border-yellow-800 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
                  data-testid="button-resend-verification"
                >
                  {resendVerificationMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جاري الإرسال...
                    </>
                  ) : (
                    <>
                      <Mail className="h-4 w-4 ml-2" />
                      إعادة إرسال رسالة التحقق
                    </>
                  )}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8 space-y-6" dir="rtl">
        {/* ════════ Zone 1 — Hero ════════ */}
        <Card className="relative bg-white dark:bg-card shadow-sm border-border/50 overflow-visible">
          {/* أيقونة الإعدادات — في الزاوية */}
          <Button
            variant="ghost"
            size="icon"
            className={`absolute top-3 left-3 h-9 w-9 rounded-full text-muted-foreground hover:text-foreground ${activeTab === "settings" ? "bg-muted text-foreground" : ""}`}
            onClick={() => setActiveTab(activeTab === "settings" ? "activity" : "settings")}
            aria-label="الإعدادات"
            data-testid="button-open-settings"
          >
            <Settings className="h-5 w-5" />
          </Button>

          <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center">
            {/* الصورة المركزية */}
            <div className="relative">
              <div
                className="rounded-full p-1"
                style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD}55)` }}
              >
                <Avatar className="h-28 w-28 sm:h-32 sm:w-32 border-4 border-background shadow-lg">
                  <AvatarImage
                    src={user.profileImageUrl || ""}
                    alt={getUserDisplayName()}
                    className="object-cover"
                    data-testid="img-profile-avatar"
                  />
                  <AvatarFallback className="bg-primary text-primary-foreground text-3xl">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute bottom-0 left-0">
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
                  variant="default"
                  size="icon"
                  className="h-8 w-8 rounded-full shadow-md"
                  disabled={isUploadingAvatar}
                  onClick={() => document.getElementById("avatar-file-input")?.click()}
                  data-testid="button-upload-avatar"
                  aria-label="تغيير الصورة الشخصية"
                >
                  {isUploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>

            {/* الاسم + الرتبة + تاريخ الانضمام */}
            <h1 className="mt-4 text-2xl sm:text-3xl font-bold leading-tight" data-testid="text-profile-name">
              {getUserDisplayName()}
            </h1>

            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              <Badge
                className="gap-1 border-transparent font-semibold"
                style={{ backgroundColor: `${GOLD}1f`, color: GOLD }}
                data-testid="badge-loyalty-tier"
              >
                <Trophy className="h-3 w-3" />
                {currentTier.nameAr}
              </Badge>
              {getRoleBadge(user.role)}
              {user.hasPressCard && (
                <Badge variant="outline" className="gap-1 font-normal" data-testid="badge-press-card">
                  <IdCard className="h-3 w-3" />
                  صحفي معتمد
                </Badge>
              )}
            </div>

            {user.createdAt && (
              <p className="mt-2 text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-join-date">
                <CalendarDays className="h-3.5 w-3.5" />
                عضو منذ {formatJoinDate(user.createdAt)}
              </p>
            )}

            {user.bio && !isEditingProfile && (
              <p className="mt-3 text-sm text-foreground/80 max-w-xl leading-relaxed">
                {user.bio}
              </p>
            )}

            {/* 3 أرقام فقط */}
            <div className="mt-6 grid grid-cols-3 gap-0 w-full max-w-md divide-x divide-x-reverse divide-border/60">
              <div className="px-2" data-testid="text-stat-reads">
                <p className="text-[28px] sm:text-[32px] font-bold leading-none tabular-nums">
                  {totalReads.toLocaleString("en-US")}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">مقال مقروء</p>
              </div>
              <div className="px-2" data-testid="text-stat-likes">
                <p className="text-[28px] sm:text-[32px] font-bold leading-none tabular-nums">
                  {likedArticles.length.toLocaleString("en-US")}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">إعجاب</p>
              </div>
              <div className="px-2" data-testid="text-stat-followers">
                <p className="text-[28px] sm:text-[32px] font-bold leading-none tabular-nums">
                  {(followStats?.followersCount || 0).toLocaleString("en-US")}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">متابع</p>
              </div>
            </div>

            {/* زر رئيسي واحد */}
            <div className="mt-6 flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Button
                variant="default"
                className="gap-2 w-full sm:w-auto"
                onClick={() => setIsEditingProfile(!isEditingProfile)}
                data-testid="button-edit-profile"
              >
                <Edit className="h-4 w-4" />
                {isEditingProfile ? "إلغاء التعديل" : "تعديل الملف"}
              </Button>
              {hasRole(user, "editor", "admin", "system_admin") && (
                <Button
                  variant="outline"
                  className="gap-2 w-full sm:w-auto"
                  asChild
                  data-testid="button-go-to-dashboard"
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="h-4 w-4" />
                    لوحة التحكم
                  </Link>
                </Button>
              )}
            </div>

            {/* نموذج تعديل الملف */}
            <AnimatePresence>
              {isEditingProfile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 pt-6 border-t w-full max-w-xl text-right"
                >
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      {/* الأسماء تُكتب مرة واحدة لمصداقية التعليقات — راجع PR الأمان */}
                      {(() => {
                        const firstNameLocked = !!user?.firstName?.trim();
                        const lastNameLocked = !!user?.lastName?.trim();
                        return (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                                        className={firstNameLocked ? "opacity-70 cursor-not-allowed" : ""}
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
                                        className={lastNameLocked ? "opacity-70 cursor-not-allowed" : ""}
                                        data-testid="input-last-name"
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            {(firstNameLocked || lastNameLocked) && (
                              <p className="text-xs text-muted-foreground -mt-2">
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
                                rows={4}
                                placeholder="اكتب نبذة مختصرة عنك..."
                                data-testid="input-bio"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          disabled={updateMutation.isPending}
                          data-testid="button-save-profile"
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 ml-2 animate-spin" />
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
                            setIsEditingProfile(false);
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
          </CardContent>
        </Card>

        {/* ════════ Zone 2 — شريط الولاء (المصدر الوحيد للنقاط) ════════ */}
        <Card
          className="bg-white dark:bg-card shadow-sm border-border/50 overflow-hidden"
          data-testid="loyalty-strip"
        >
          <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${GOLD}, ${GOLD}33)` }} />
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8">
              {/* النقاط */}
              <div className="flex items-center gap-3 shrink-0">
                <div
                  className="h-11 w-11 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${GOLD}1f`, color: GOLD }}
                >
                  <Coins className="h-5 w-5" />
                </div>
                <div className="text-right">
                  <p className="text-[28px] font-bold leading-none tabular-nums" style={{ color: GOLD }} data-testid="text-loyalty-points">
                    {(loyaltyPoints?.totalPoints || 0).toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">نقطة ولاء</p>
                </div>
              </div>

              <Separator orientation="vertical" className="hidden sm:block h-10" />

              {/* التقدم للرتبة التالية */}
              <div className="flex-1 w-full min-w-0">
                {nextTierInfo ? (
                  <>
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold" style={{ color: GOLD }}>{currentTier.nameAr}</span>
                      <span className="text-muted-foreground">
                        تبقى {pointsToNext.toLocaleString("en-US")} نقطة → {nextTierInfo.nameAr}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${progressPercentage}%`, background: `linear-gradient(90deg, ${GOLD}, ${GOLD}aa)` }}
                        data-testid="loyalty-progress-bar"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-sm font-bold flex items-center gap-2" style={{ color: GOLD }}>
                    <Trophy className="h-4 w-4" />
                    وصلت إلى الرتبة الأعلى: {currentTier.nameAr} 🎉
                  </p>
                )}
              </div>

              {/* رابط المسار الكامل */}
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-xs"
                style={{ color: GOLD }}
                onClick={() => setActiveTab("achievements")}
                data-testid="button-view-loyalty-path"
              >
                مسار الرتب ←
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ════════ Zone 3 + 4 — التبويبات والمحتوى ════════ */}
        <Card className="bg-white dark:bg-card shadow-sm border-border/50">
          <CardContent className="p-4 sm:p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList dir="rtl" className="rounded-lg bg-muted p-1 grid grid-cols-4 w-full mb-6">
                <TabsTrigger value="activity" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-activity">
                  <TrendingUp className="h-4 w-4 hidden sm:block" />
                  <span>نشاطي</span>
                </TabsTrigger>
                <TabsTrigger value="bookmarks" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-bookmarks">
                  <Bookmark className="h-4 w-4 hidden sm:block" />
                  <span>محفوظاتي</span>
                </TabsTrigger>
                <TabsTrigger value="community" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-community">
                  <Users className="h-4 w-4 hidden sm:block" />
                  <span>مجتمعي</span>
                </TabsTrigger>
                <TabsTrigger value="achievements" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-achievements">
                  <Trophy className="h-4 w-4 hidden sm:block" />
                  <span>إنجازاتي</span>
                </TabsTrigger>
              </TabsList>

              {/* ───── نشاطي ───── */}
              <TabsContent value="activity" className="space-y-6" dir="rtl">
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    سجل القراءة
                  </h3>
                  {isLoadingHistory ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64" />
                      ))}
                    </div>
                  ) : readingHistory.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {readingHistory.slice(0, 6).map((article) => (
                        <ArticleCard key={article.id} article={article} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-muted/30 rounded-lg">
                      <Clock className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-muted-foreground">لم تقرأ أي مقالات بعد</p>
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Heart className="h-5 w-5 text-muted-foreground" />
                    المقالات المفضلة
                  </h3>
                  {isLoadingLiked ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64" />
                      ))}
                    </div>
                  ) : likedArticles.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {likedArticles.slice(0, 6).map((article) => (
                        <ArticleCard key={article.id} article={article} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-muted/30 rounded-lg">
                      <Heart className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-muted-foreground">لم تعجبك أي مقالات بعد</p>
                    </div>
                  )}
                </div>

                {/* توزيع الاهتمامات — بيانات قراءة، ألوانها بياناتية من ألوان الأقسام */}
                {topCategoriesData.length > 0 && (
                  <>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <Card className="md:col-span-1 border border-border/50 shadow-none">
                        <CardHeader className="text-right">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                            توزيع اهتماماتك
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[220px] flex items-center justify-center p-2 relative">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={topCategoriesData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={75}
                                innerRadius={55}
                                paddingAngle={3}
                              >
                                {topCategoriesData.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <ChartTooltip formatter={(val: any) => [`${val} مقال`, 'قراءات']} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-6">
                            <span className="text-xl font-bold text-foreground">{totalReads}</span>
                            <span className="text-[10px] text-muted-foreground">مقالاً مقروءاً</span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="md:col-span-2 border border-border/50 shadow-none">
                        <CardHeader className="text-right">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            تفاصيل القراءة حسب الأقسام
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {topCategoriesData.map((item: any, idx: number) => (
                              <div key={idx} className="space-y-1.5 text-right">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="flex items-center gap-2 font-medium">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: item.color }}
                                    />
                                    {item.name}
                                  </span>
                                  <span className="text-muted-foreground font-mono">
                                    {item.value} مقال ({Math.round(item.weight * 100)}%)
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      backgroundColor: item.color,
                                      width: `${item.weight * 100}%`
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ───── محفوظاتي ───── */}
              <TabsContent value="bookmarks" dir="rtl">
                {isLoadingBookmarks ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-64" />
                    ))}
                  </div>
                ) : bookmarkedArticles.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {bookmarkedArticles.map((article) => (
                      <ArticleCard key={article.id} article={article} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-muted/30 rounded-lg">
                    <Bookmark className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">لم تحفظ أي مقالات بعد</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      احفظ المقالات المهمة لقراءتها لاحقًا
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ───── مجتمعي ───── */}
              <TabsContent value="community" className="space-y-5" dir="rtl">
                {/* مفتاح التبديل بين المتابعين والمتابَعين */}
                <div className="inline-flex rounded-lg bg-muted p-1 gap-1">
                  <Button
                    variant={communityView === "followers" ? "secondary" : "ghost"}
                    size="sm"
                    className={communityView === "followers" ? "bg-background shadow-sm" : ""}
                    onClick={() => setCommunityView("followers")}
                    data-testid="button-show-followers"
                  >
                    المتابعون ({(followStats?.followersCount || 0).toLocaleString("en-US")})
                  </Button>
                  <Button
                    variant={communityView === "following" ? "secondary" : "ghost"}
                    size="sm"
                    className={communityView === "following" ? "bg-background shadow-sm" : ""}
                    onClick={() => setCommunityView("following")}
                    data-testid="button-show-following"
                  >
                    المتابَعون ({(followStats?.followingCount || 0).toLocaleString("en-US")})
                  </Button>
                </div>

                {communityView === "followers" ? (
                  isLoadingFollowers ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-20" />
                      ))}
                    </div>
                  ) : followers.length > 0 ? (
                    <div className="space-y-3">
                      {followers.map((follower) => (
                        <Card key={follower.id} className="hover-elevate shadow-none border-border/50">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={follower.profileImageUrl || ""} />
                                <AvatarFallback>
                                  {getFollowerInitials(follower)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                  {getFollowerDisplayName(follower)}
                                </p>
                                {follower.bio && (
                                  <p className="text-sm text-muted-foreground line-clamp-1">
                                    {follower.bio}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                data-testid={`button-view-profile-${follower.id}`}
                              >
                                <Link href={`/user/${follower.id}`}>
                                  عرض الملف
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-muted/30 rounded-lg">
                      <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-muted-foreground">لا يوجد متابعون بعد</p>
                    </div>
                  )
                ) : isLoadingFollowing ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-20" />
                    ))}
                  </div>
                ) : following.length > 0 ? (
                  <div className="space-y-3">
                    {following.map((followed) => (
                      <Card key={followed.id} className="hover-elevate shadow-none border-border/50">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={followed.profileImageUrl || ""} />
                              <AvatarFallback>
                                {getFollowerInitials(followed)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {getFollowerDisplayName(followed)}
                              </p>
                              {followed.bio && (
                                <p className="text-sm text-muted-foreground line-clamp-1">
                                  {followed.bio}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                asChild
                                data-testid={`button-view-profile-${followed.id}`}
                              >
                                <Link href={`/user/${followed.id}`}>
                                  عرض
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => unfollowUserMutation.mutate(followed.id)}
                                disabled={unfollowUserMutation.isPending}
                                data-testid={`button-unfollow-user-${followed.id}`}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-muted/30 rounded-lg">
                    <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">لا تتابع أحدًا بعد</p>
                  </div>
                )}

                {/* كلماتي المتابعة */}
                <Separator />
                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    كلماتي المتابعة
                  </h3>
                  {isLoadingKeywords ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-8" />
                      ))}
                    </div>
                  ) : followedKeywords.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {followedKeywords.map((keyword) => (
                        <span
                          key={keyword.tagId}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 pr-3 pl-1.5 py-1 text-sm"
                        >
                          <Link href={`/keyword/${keyword.tagName}`}>
                            <span className="cursor-pointer font-medium hover:underline" data-testid={`link-keyword-${keyword.tagId}`}>
                              #{keyword.tagName}
                            </span>
                          </Link>
                          <span className="text-xs text-muted-foreground">{keyword.articleCount}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 rounded-full"
                            onClick={() => unfollowKeywordMutation.mutate(keyword.tagId)}
                            disabled={unfollowKeywordMutation.isPending}
                            data-testid={`button-unfollow-keyword-${keyword.tagId}`}
                            aria-label={`إلغاء متابعة ${keyword.tagName}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">لم تتابع أي كلمات بعد</p>
                  )}
                </div>
              </TabsContent>

              {/* ───── إنجازاتي — مسار الرتب والشارات (هنا فقط) ───── */}
              <TabsContent value="achievements" className="space-y-6" dir="rtl">
                <Card className="border border-border/50 shadow-none">
                  <CardHeader className="pb-3 text-right">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="h-5 w-5" style={{ color: GOLD }} />
                      مسار تقدم رتبة الولاء
                    </CardTitle>
                    <CardDescription>
                      كلما تفاعلت وقرأت أكثر في سبق، كلما ارتفعت رتبتك لتحصل على مزايا خاصة وأوسمة حصرية.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="space-y-6">
                      <div className="relative py-4" dir="rtl">
                        {/* المسار الأفقي (شاشات كبيرة) */}
                        <div className="hidden md:flex relative items-center justify-between max-w-3xl mx-auto py-8 px-4">
                          <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-muted rounded-full z-0" />
                          <div
                            className="absolute right-4 top-1/2 -translate-y-1/2 h-1 rounded-full z-0 transition-all duration-500"
                            style={{
                              background: `linear-gradient(270deg, ${GOLD}, ${GOLD}66)`,
                              width: `calc(${(currentTier.level - 1) * 25 + (nextTierInfo ? (progressPercentage / 4) : 25)}% - 32px)`
                            }}
                          />

                          {[1, 2, 3, 4, 5].map((lvl) => {
                            const tierInfo = computeTier(lvl === 1 ? 0 : lvl === 2 ? 100 : lvl === 3 ? 500 : lvl === 4 ? 2000 : 10000);
                            const isCurrent = currentTier.level === lvl;
                            const isUnlocked = currentTier.level >= lvl;

                            return (
                              <div key={lvl} className="flex flex-col items-center z-10 relative">
                                <div
                                  className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-md ${
                                    isCurrent
                                      ? "bg-background scale-125 font-bold"
                                      : isUnlocked
                                        ? "text-white"
                                        : "bg-background border-muted text-muted-foreground"
                                  }`}
                                  style={
                                    isCurrent
                                      ? { borderColor: GOLD, color: GOLD, boxShadow: `0 0 0 4px ${GOLD}33` }
                                      : isUnlocked
                                        ? { backgroundColor: GOLD, borderColor: GOLD }
                                        : undefined
                                  }
                                  title={tierInfo.nameAr}
                                >
                                  {lvl}
                                </div>
                                <span
                                  className={`text-[11px] font-bold mt-2 text-center absolute -bottom-6 whitespace-nowrap ${
                                    isCurrent ? "scale-105" : isUnlocked ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                  style={isCurrent ? { color: GOLD } : undefined}
                                >
                                  {tierInfo.nameAr}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* المسار العمودي (جوال) */}
                        <div className="flex md:hidden flex-col gap-6 relative pr-8 pl-4 py-4 max-w-xs mx-auto">
                          <div className="absolute right-[17px] top-6 bottom-6 w-0.5 bg-muted rounded-full z-0" />
                          <div
                            className="absolute right-[17px] top-6 w-0.5 rounded-full z-0 transition-all duration-500"
                            style={{
                              background: `linear-gradient(180deg, ${GOLD}, ${GOLD}66)`,
                              height: `calc(${((currentTier.level - 1) / 4) * 100}% - 12px)`
                            }}
                          />

                          {[1, 2, 3, 4, 5].map((lvl) => {
                            const tierInfo = computeTier(lvl === 1 ? 0 : lvl === 2 ? 100 : lvl === 3 ? 500 : lvl === 4 ? 2000 : 10000);
                            const isCurrent = currentTier.level === lvl;
                            const isUnlocked = currentTier.level >= lvl;

                            return (
                              <div key={lvl} className="flex items-center gap-4 z-10 relative">
                                <div
                                  className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center border-2 transition-all duration-500 shadow-sm font-bold ${
                                    isCurrent
                                      ? "bg-background scale-110"
                                      : isUnlocked
                                        ? "text-white"
                                        : "bg-background border-muted text-muted-foreground"
                                  }`}
                                  style={
                                    isCurrent
                                      ? { borderColor: GOLD, color: GOLD, boxShadow: `0 0 0 4px ${GOLD}33` }
                                      : isUnlocked
                                        ? { backgroundColor: GOLD, borderColor: GOLD }
                                        : undefined
                                  }
                                >
                                  {lvl}
                                </div>
                                <div className="flex flex-col text-right">
                                  <span
                                    className={`text-xs font-bold ${isUnlocked && !isCurrent ? "text-foreground" : !isUnlocked ? "text-muted-foreground" : ""}`}
                                    style={isCurrent ? { color: GOLD } : undefined}
                                  >
                                    {tierInfo.nameAr}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {lvl === 1 ? "من 0 نقطة" : lvl === 2 ? "من 100 نقطة" : lvl === 3 ? "من 500 نقطة" : lvl === 4 ? "من 2000 نقطة" : "من 10000 نقطة"}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-8 text-center bg-muted/30 border border-border/30 rounded-lg p-3 max-w-md mx-auto text-xs">
                        {nextTierInfo ? (
                          <p className="leading-relaxed">
                            أنت الآن برتبة <strong style={{ color: GOLD }}>{currentTier.nameAr}</strong>.
                            تحتاج إلى <strong style={{ color: GOLD }}>{pointsToNext.toLocaleString("en-US")}</strong> نقطة إضافية للترقية إلى رتبة <strong>{nextTierInfo.nameAr}</strong>.
                          </p>
                        ) : (
                          <p className="font-bold leading-relaxed" style={{ color: GOLD }}>
                            تهانينا! لقد وصلت إلى الرتبة الأعلى: {currentTier.nameAr} (سفير سبق) 🎉
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* الأوسمة */}
                <Card className="border border-border/50 shadow-none">
                  <CardHeader className="text-right">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star className="h-5 w-5" style={{ color: GOLD }} />
                      الأوسمة والإنجازات المعرفية
                    </CardTitle>
                    <CardDescription>
                      أكمل المهام المختلفة لفتح أوسمة الإنجاز وتثبيتها في ملفك الشخصي.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                      {[
                        {
                          id: "welcome",
                          title: "شارة البداية",
                          description: "عضو جديد في عائلة سبق",
                          icon: Trophy,
                          unlocked: true,
                        },
                        {
                          id: "reader",
                          title: "القارئ النهم",
                          description: "قرأت أكثر من 20 مقالاً",
                          icon: Eye,
                          unlocked: totalReads >= 20,
                        },
                        {
                          id: "commenter",
                          title: "معلق متميز",
                          description: "شاركت بـ 5 تعليقات أو أكثر",
                          icon: FileText,
                          unlocked: (activitySummary?.totalComments ?? 0) >= 5,
                        },
                        {
                          id: "supporter",
                          title: "المساند المتفاعل",
                          description: "أضفت 10 تفاعلات أو إعجابات",
                          icon: Heart,
                          unlocked: (activitySummary?.totalReactions ?? 0) >= 10,
                        },
                        {
                          id: "passionate",
                          title: "شغوف بالمعرفة",
                          description: "جمعت 500 نقطة ولاء",
                          icon: Star,
                          unlocked: lifetime >= 500,
                        },
                        {
                          id: "ambassador",
                          title: "سفير سبق",
                          description: "الوصول إلى الرتبة الأعلى في سبق",
                          icon: Shield,
                          unlocked: currentTier.level === 5,
                        },
                      ].map((badge) => {
                        const IconComponent = badge.icon;
                        return (
                          <motion.div
                            key={badge.id}
                            whileHover={badge.unlocked ? { scale: 1.05, y: -4 } : {}}
                            transition={{ type: "spring", stiffness: 300, damping: 15 }}
                            className="relative h-full"
                          >
                            <Card
                              className={`h-full p-4 flex flex-col items-center justify-between text-center gap-3 transition-all duration-300 relative overflow-hidden border ${
                                badge.unlocked
                                  ? "border-border/60 bg-card shadow-sm hover:shadow-md"
                                  : "border-dashed border-border/60 bg-muted/5 opacity-50"
                              }`}
                            >
                              <div
                                className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-transform duration-500 ${
                                  badge.unlocked ? "text-white" : "bg-muted/20 text-muted-foreground border border-muted/30"
                                }`}
                                style={
                                  badge.unlocked
                                    ? {
                                        background: `linear-gradient(135deg, ${GOLD}, ${GOLD}99)`,
                                        boxShadow: `0 8px 16px -4px ${GOLD}55`,
                                      }
                                    : undefined
                                }
                              >
                                <IconComponent className="h-5 w-5" />
                              </div>

                              <div className="space-y-1 z-10 flex-1 flex flex-col justify-center">
                                <h5 className={`text-[11px] font-bold leading-tight ${badge.unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                                  {badge.title}
                                </h5>
                                <p className="text-[9px] text-muted-foreground leading-normal max-w-[100px] mx-auto">
                                  {badge.description}
                                </p>
                              </div>

                              {badge.unlocked ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[9px] px-1.5 py-0">
                                  مكتمل
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-muted/20 text-muted-foreground/60 border-transparent text-[9px] px-1.5 py-0 gap-1">
                                  <Lock className="h-2 w-2" />
                                  مغلق
                                </Badge>
                              )}

                              {badge.unlocked ? (
                                <div className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500 border border-emerald-500/30">
                                  <Check className="h-2.5 w-2.5" />
                                </div>
                              ) : (
                                <div className="absolute top-1.5 right-1.5 text-muted-foreground/60">
                                  <Lock className="h-3 w-3" />
                                </div>
                              )}
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ───── الإعدادات (تُفتح من أيقونة الترس) ───── */}
              <TabsContent value="settings" className="space-y-6" dir="rtl">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  الإعدادات
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    الخصوصية والأمان
                  </h3>
                  <Card className="shadow-none border-border/50">
                    <CardContent className="p-6">
                      <TwoFactorSettings />
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    Apple Wallet
                  </h3>
                  <div className="space-y-4">
                    <Card className="shadow-none border-border/50">
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div
                            className="h-12 w-12 rounded-full flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${GOLD}1f`, color: GOLD }}
                          >
                            <Trophy className="h-6 w-6" />
                          </div>
                          <div className="flex-1 space-y-3">
                            <div>
                              <h4 className="font-semibold">بطاقة العضوية</h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                احصل على بطاقة عضوية رقمية تعرض نقاط الولاء ورتبتك
                              </p>
                            </div>
                            <Button
                              onClick={() => issueLoyaltyCardMutation.mutate()}
                              disabled={issueLoyaltyCardMutation.isPending}
                              className="gap-2"
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
                                  تحميل بطاقة العضوية
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {user.hasPressCard && (
                      <Card className="shadow-none border-border/50">
                        <CardContent className="p-6">
                          <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
                              <IdCard className="h-6 w-6" />
                            </div>
                            <div className="flex-1 space-y-3">
                              <div>
                                <h4 className="font-semibold">البطاقة الصحفية</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  بطاقة صحفية رقمية معتمدة من سبق للصحفيين
                                </p>
                              </div>
                              <Badge variant="default" className="gap-1">
                                <Check className="h-3 w-3" />
                                صحفي معتمد
                              </Badge>
                              <Button
                                onClick={() => issuePressCardMutation.mutate()}
                                disabled={issuePressCardMutation.isPending}
                                className="gap-2"
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
                                    تحميل البطاقة الصحفية
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    إعدادات الإشعارات
                  </h3>
                  <Card className="shadow-none border-border/50">
                    <CardContent className="p-6">
                      <p className="text-muted-foreground text-sm">
                        قريبًا: خيارات تخصيص الإشعارات
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
