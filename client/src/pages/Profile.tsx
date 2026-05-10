import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { queryClient, apiRequest } from "@/lib/queryClient";
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
  UserPlus,
  UserMinus,
  IdCard,
  Check,
  Download,
  Plus,
  Wallet,
  Edit,
  Clock,
  Eye,
} from "lucide-react";
import { ArticleCard } from "@/components/ArticleCard";
import { SmartInterestsBlock } from "@/components/SmartInterestsBlock";
import { ObjectUploader } from "@/components/ObjectUploader";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import type { ArticleWithDetails, User as UserType, UserPointsTotal } from "@shared/schema";
import { hasRole } from "@/hooks/useAuth";
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";

const updateUserSchema = z.object({
  firstName: z.string().min(2, "الاسم الأول يجب أن يكون حرفين على الأقل").optional(),
  lastName: z.string().min(2, "اسم العائلة يجب أن يكون حرفين على الأقل").optional(),
  bio: z.string().max(500, "النبذة يجب أن لا تزيد عن 500 حرف").optional(),
  phoneNumber: z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional(),
  profileImageUrl: z.string().url("رابط الصورة غير صحيح").optional().or(z.literal("")),
});

type UpdateUserFormData = z.infer<typeof updateUserSchema>;

export default function Profile() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("activity");
  const [isEditingProfile, setIsEditingProfile] = useState(false);

  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
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

  const handleAvatarUploadComplete = async (result: any) => {
    try {
      const uploadedUrl = result.successful?.[0]?.uploadURL;
      if (!uploadedUrl) {
        throw new Error('لم يتم الحصول على رابط الصورة');
      }

      const response = await apiRequest("/api/profile/image", {
        method: "PUT",
        body: JSON.stringify({ profileImageUrl: uploadedUrl }),
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
    }
  };

  const getUploadUrl = async () => {
    const response = await apiRequest("/api/profile/image/upload", {
      method: "POST",
    });
    return {
      method: "PUT" as const,
      url: response.uploadURL,
    };
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
      const res = await fetch(`/api/social/followers/${user?.id}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch followers');
      return res.json();
    },
    enabled: !!user && activeTab === 'followers',
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
      const res = await fetch(`/api/social/following/${user?.id}?limit=50`);
      if (!res.ok) throw new Error('Failed to fetch following');
      return res.json();
    },
    enabled: !!user && activeTab === 'following',
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
      const response = await fetch('/api/wallet/press/issue', {
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
      const response = await fetch('/api/wallet/loyalty/issue', {
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
      admin: "مدير",
      editor: "محرر",
      reporter: "صحفي",
      reader: "قارئ",
    };
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      system_admin: "default",
      admin: "default",
      editor: "secondary",
      reporter: "secondary",
      reader: "outline",
    };
    return (
      <Badge variant={variants[role || "reader"] || "outline"} data-testid="badge-user-role">
        {labels[role || "reader"] || role}
      </Badge>
    );
  };

  const getRankIcon = (rank?: string) => {
    switch (rank) {
      case "سفير سبق":
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case "العضو الذهبي":
        return <Star className="h-5 w-5 text-amber-500" />;
      case "المتفاعل":
        return <TrendingUp className="h-5 w-5 text-blue-500" />;
      default:
        return <Coins className="h-5 w-5 text-gray-500" />;
    }
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
    <div className="min-h-screen bg-background">
      <Header user={user} />

      {/* Email Verification Alert */}
      {user && !user.emailVerified && (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-4" dir="rtl">
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

      {/* Modern Profile Header */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8" dir="rtl">
        <Card className="mb-6">
          <CardContent className="p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              {/* Avatar */}
              <div className="relative shrink-0">
                <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
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
                
                <div className="absolute -bottom-2 -right-2">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={5 * 1024 * 1024}
                    allowedFileTypes={['.jpg', '.jpeg', '.png', '.webp']}
                    onGetUploadParameters={getUploadUrl}
                    onComplete={handleAvatarUploadComplete}
                    variant="default"
                    size="icon"
                    buttonClassName="h-10 w-10 rounded-full shadow-lg"
                  >
                    <Upload className="h-4 w-4" />
                  </ObjectUploader>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <h1 className="text-3xl font-bold" data-testid="text-profile-name">
                      {getUserDisplayName()}
                    </h1>
                    <div className="flex items-center gap-2">
                      {getRoleBadge(user.role)}
                      {user.hasPressCard && (
                        <Badge variant="outline" className="gap-1" data-testid="badge-press-card">
                          <IdCard className="h-3 w-3" />
                          صحفي معتمد
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-muted-foreground" data-testid="text-profile-email">
                    {user.email}
                  </p>
                  {user.bio && !isEditingProfile && (
                    <p className="text-foreground/80 max-w-2xl leading-relaxed">
                      {user.bio}
                    </p>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-2"
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    data-testid="button-edit-profile"
                  >
                    <Edit className="h-4 w-4" />
                    {isEditingProfile ? "إلغاء" : "تعديل الملف الشخصي"}
                  </Button>
                  
                  {hasRole(user, "editor", "admin", "system_admin") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
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
              </div>
            </div>

            {/* Edit Profile Form */}
            <AnimatePresence>
              {isEditingProfile && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 pt-6 border-t"
                >
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>الاسم الأول</FormLabel>
                              <FormControl>
                                <Input {...field} data-testid="input-first-name" />
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
                                <Input {...field} data-testid="input-last-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

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

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-6">
          <MobileOptimizedKpiCard
            label="متابع"
            value={(followStats?.followersCount || 0).toLocaleString('en-US')}
            icon={Users}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            testId="text-stat-followers"
          />

          <MobileOptimizedKpiCard
            label="إعجاب"
            value={likedArticles.length.toLocaleString('en-US')}
            icon={Heart}
            iconColor="text-red-500"
            iconBgColor="bg-red-500/10"
            testId="text-stat-likes"
          />

          <MobileOptimizedKpiCard
            label="محفوظ"
            value={bookmarkedArticles.length.toLocaleString('en-US')}
            icon={Bookmark}
            iconColor="text-blue-500"
            iconBgColor="bg-blue-500/10"
            testId="text-stat-bookmarks"
          />

          <MobileOptimizedKpiCard
            label="قراءة"
            value={readingHistory.length.toLocaleString('en-US')}
            icon={Eye}
            iconColor="text-green-500"
            iconBgColor="bg-green-500/10"
            testId="text-stat-reads"
          />

          <MobileOptimizedKpiCard
            label="نقطة"
            value={(loyaltyPoints?.totalPoints || 0).toLocaleString('en-US')}
            icon={Coins}
            iconColor="text-amber-500"
            iconBgColor="bg-amber-500/10"
            testId="text-stat-points"
          />
        </div>

        {/* Main Content with Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          <Card>
            <CardContent className="p-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList dir="rtl" className="rounded-lg bg-muted p-1 flex flex-wrap w-full mb-6">
                  <TabsTrigger value="activity" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-activity">
                    <TrendingUp className="h-4 w-4 hidden sm:block" />
                    <span>نشاطي</span>
                  </TabsTrigger>
                  
                  <TabsTrigger value="bookmarks" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-bookmarks">
                    <Bookmark className="h-4 w-4 hidden sm:block" />
                    <span>المحفوظات</span>
                  </TabsTrigger>
                  
                  <TabsTrigger value="followers" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-followers">
                    <Users className="h-4 w-4 hidden sm:block" />
                    <span>المتابعون</span>
                  </TabsTrigger>
                  
                  <TabsTrigger value="settings" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-settings">
                    <Settings className="h-4 w-4 hidden sm:block" />
                    <span>الإعدادات</span>
                  </TabsTrigger>
                  
                  <TabsTrigger value="wallet" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md" data-testid="tab-wallet">
                    <Wallet className="h-4 w-4 hidden sm:block" />
                    <span>المحفظة</span>
                  </TabsTrigger>
                </TabsList>

                {/* Activity Tab */}
                <TabsContent value="activity" className="space-y-6" dir="rtl">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Heart className="h-5 w-5 text-red-500" />
                      المقالات المفضلة
                    </h3>
                    {isLoadingLiked ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} className="h-64" />
                        ))}
                      </div>
                    ) : likedArticles.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {likedArticles.map((article) => (
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

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-blue-500" />
                      سجل القراءة
                    </h3>
                    {isLoadingHistory ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4].map((i) => (
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
                </TabsContent>

                {/* Bookmarks Tab */}
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

                {/* Followers Tab */}
                <TabsContent value="followers" className="space-y-4" dir="rtl">
                  <div className="flex gap-4 border-b">
                    <Button
                      variant="ghost"
                      className="pb-3 relative"
                      onClick={() => setActiveTab('followers')}
                      data-testid="button-show-followers"
                    >
                      المتابعون ({followStats?.followersCount || 0})
                    </Button>
                    <Button
                      variant="ghost"
                      className="pb-3"
                      onClick={() => setActiveTab('following')}
                      data-testid="button-show-following"
                    >
                      المتابَعون ({followStats?.followingCount || 0})
                    </Button>
                  </div>

                  {isLoadingFollowers ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-20" />
                      ))}
                    </div>
                  ) : followers.length > 0 ? (
                    <div className="space-y-3">
                      {followers.map((follower) => (
                        <Card key={follower.id} className="hover-elevate">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={follower.profileImageUrl || ""} />
                                <AvatarFallback>
                                  {getFollowerInitials(follower)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="font-medium">
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
                                  عرض الملف الشخصي
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
                  )}
                </TabsContent>

                {/* Following Tab */}
                <TabsContent value="following" className="space-y-4" dir="rtl">
                  <div className="flex gap-4 border-b">
                    <Button
                      variant="ghost"
                      className="pb-3"
                      onClick={() => setActiveTab('followers')}
                      data-testid="button-show-followers-2"
                    >
                      المتابعون ({followStats?.followersCount || 0})
                    </Button>
                    <Button
                      variant="ghost"
                      className="pb-3 relative"
                      onClick={() => setActiveTab('following')}
                      data-testid="button-show-following-2"
                    >
                      المتابَعون ({followStats?.followingCount || 0})
                    </Button>
                  </div>

                  {isLoadingFollowing ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-20" />
                      ))}
                    </div>
                  ) : following.length > 0 ? (
                    <div className="space-y-3">
                      {following.map((followed) => (
                        <Card key={followed.id} className="hover-elevate">
                          <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                              <Avatar>
                                <AvatarImage src={followed.profileImageUrl || ""} />
                                <AvatarFallback>
                                  {getFollowerInitials(followed)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1">
                                <p className="font-medium">
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
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-6" dir="rtl">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Bell className="h-5 w-5" />
                      إعدادات الإشعارات
                    </h3>
                    <Card>
                      <CardContent className="p-6">
                        <p className="text-muted-foreground">
                          قريبًا: خيارات تخصيص الإشعارات
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      الخصوصية والأمان
                    </h3>
                    <Card>
                      <CardContent className="p-6">
                        <TwoFactorSettings />
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Wallet Tab */}
                <TabsContent value="wallet" className="space-y-6" dir="rtl">
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Wallet className="h-5 w-5" />
                      Apple Wallet
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Loyalty Card */}
                      <Card>
                        <CardContent className="p-6">
                          <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center shrink-0">
                              <Trophy className="h-6 w-6 text-blue-500" />
                            </div>
                            <div className="flex-1 space-y-3">
                              <div>
                                <h4 className="font-semibold">بطاقة العضوية</h4>
                                <p className="text-sm text-muted-foreground mt-1">
                                  احصل على بطاقة عضوية رقمية تعرض نقاط الولاء ورتبتك
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="gap-1">
                                  <Coins className="h-3 w-3" />
                                  {loyaltyPoints?.totalPoints || 0} نقطة
                                </Badge>
                                <Badge variant="outline">
                                  {loyaltyPoints?.currentRank || "القارئ الجديد"}
                                </Badge>
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

                      {/* Press Card (if eligible) */}
                      {user.hasPressCard && (
                        <Card>
                          <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center shrink-0">
                                <IdCard className="h-6 w-6 text-green-500" />
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
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <aside className="space-y-6">
            {/* Smart Interests */}
            <div>
              <SmartInterestsBlock userId={user.id} />
            </div>

            {/* Followed Keywords */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  كلماتي المتابعة
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingKeywords ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-8" />
                    ))}
                  </div>
                ) : followedKeywords.length > 0 ? (
                  <div className="space-y-2">
                    {followedKeywords.slice(0, 5).map((keyword) => (
                      <div
                        key={keyword.tagId}
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate"
                      >
                        <Link href={`/keyword/${keyword.tagName}`}>
                          <span className="flex items-center gap-2 flex-1 cursor-pointer" data-testid={`link-keyword-${keyword.tagId}`}>
                            <Tag className="h-3.5 w-3.5 text-primary" />
                            <span className="text-sm font-medium">{keyword.tagName}</span>
                            <Badge variant="secondary" className="text-xs">
                              {keyword.articleCount}
                            </Badge>
                          </span>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => unfollowKeywordMutation.mutate(keyword.tagId)}
                          disabled={unfollowKeywordMutation.isPending}
                          data-testid={`button-unfollow-keyword-${keyword.tagId}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Tag className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      لم تتابع أي كلمات بعد
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Loyalty Points */}
            <Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-200 dark:border-amber-900">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {getRankIcon(loyaltyPoints?.currentRank)}
                    برنامج الولاء
                  </CardTitle>
                  <Badge variant="secondary" className="gap-1">
                    <Coins className="h-3 w-3" />
                    {loyaltyPoints?.totalPoints || 0}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">رتبتك الحالية</p>
                  <p className="font-semibold text-lg" data-testid="text-loyalty-rank">
                    {loyaltyPoints?.currentRank || "القارئ الجديد"}
                  </p>
                </div>
                
                <Separator />
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">النقاط الكلية</span>
                    <span className="font-semibold" data-testid="text-loyalty-lifetime">
                      {loyaltyPoints?.lifetimePoints || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">النقاط المتاحة</span>
                    <span className="font-semibold text-primary" data-testid="text-loyalty-available">
                      {loyaltyPoints?.totalPoints || 0}
                    </span>
                  </div>
                </div>
                
                <Button
                  variant="default"
                  className="w-full gap-2"
                  asChild
                  data-testid="button-view-rewards"
                >
                  <a href="/loyalty">
                    <Trophy className="h-4 w-4" />
                    استبدل النقاط
                  </a>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
