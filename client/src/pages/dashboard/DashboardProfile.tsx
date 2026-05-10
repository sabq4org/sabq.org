import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  User,
  Shield,
  Loader2,
  Upload,
  Edit,
  Clock,
  Activity,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Briefcase,
  Building2,
  Mail,
  Phone,
  CalendarDays,
  History,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings,
  Tag,
  AlertCircle,
  Camera,
  RefreshCcw,
} from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { User as UserType } from "@shared/schema";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { getActionPresentation, getEntityTypeLabel } from "@/lib/activityUtils";

const optionalStringWithMin = (minLength: number, errorMsg: string) =>
  z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().min(minLength, errorMsg).optional()
  );

const updateProfileSchema = z.object({
  firstName: optionalStringWithMin(2, "الاسم الأول يجب أن يكون حرفين على الأقل"),
  lastName: optionalStringWithMin(2, "اسم العائلة يجب أن يكون حرفين على الأقل"),
  bio: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().max(500, "النبذة يجب أن لا تزيد عن 500 حرف").optional()
  ),
  phoneNumber: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().regex(/^[0-9+\-\s()]*$/, "رقم الهاتف غير صحيح").optional()
  ),
});

type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

interface UserRolesData {
  rbacRoles: Array<{
    roleId: string;
    roleName: string;
    roleDescription: string | null;
    assignedAt: string;
  }>;
  legacyRole: string;
  jobTitle: string | null;
  department: string | null;
}

interface ActivityLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  entityTitle: string | null;
  entityUrl: string | null;
  oldValue: Record<string, any> | null;
  newValue: Record<string, any> | null;
  metadata: { ip?: string; userAgent?: string; reason?: string } | null;
  createdAt: string;
}

interface ActivityLogsResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const roleLabels: Record<string, string> = {
  system_admin: "مدير النظام",
  admin: "مسؤول",
  editor: "محرر",
  reporter: "مراسل",
  reader: "قارئ",
  comments_moderator: "مشرف تعليقات",
  opinion_author: "كاتب رأي",
  media_manager: "مدير وسائط",
  publisher: "ناشر",
  superadmin: "المدير العام",
  content_manager: "مدير محتوى",
  chief_editor: "رئيس التحرير",
};

const roleDescriptions: Record<string, string> = {
  system_admin: "وصول كامل للنظام مع جميع الصلاحيات",
  admin: "وصول إداري لمعظم المميزات",
  editor: "إنشاء وتعديل ونشر المحتوى",
  reporter: "إنشاء وتعديل المقالات الخاصة",
  reader: "وصول قارئ أساسي",
  comments_moderator: "إشراف على التعليقات",
  opinion_author: "كتابة وإدارة مقالات الرأي",
  media_manager: "إدارة ملفات الوسائط",
  publisher: "نشر المحتوى",
  superadmin: "صلاحيات المدير العام الكاملة",
  content_manager: "إدارة المحتوى والمقالات",
  chief_editor: "رئاسة التحرير وإدارة المحتوى",
};

export default function DashboardProfile() {
  const { toast } = useToast();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: user, isLoading: isLoadingUser } = useQuery<UserType>({
    queryKey: ["/api/auth/user"],
  });

  const { data: rolesData, isLoading: isLoadingRoles } = useQuery<UserRolesData>({
    queryKey: ["/api/profile/roles"],
    enabled: !!user,
  });

  const { data: activityData, isLoading: isLoadingActivity } = useQuery<ActivityLogsResponse>({
    queryKey: ["/api/profile/activity", activityPage, activityFilter, entityTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: activityPage.toString(),
        limit: "15",
      });
      if (activityFilter && activityFilter !== "all") {
        params.append("action", activityFilter);
      }
      if (entityTypeFilter && entityTypeFilter !== "all") {
        params.append("entityType", entityTypeFilter);
      }
      const response = await fetch(`/api/profile/activity?${params}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch activity");
      return response.json();
    },
    enabled: !!user,
  });

  const form = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      bio: user?.bio || "",
      phoneNumber: user?.phoneNumber || "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateProfileFormData) => {
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

  const handleAvatarUploadComplete = async (result: any) => {
    try {
      const uploadedUrl = result.successful?.[0]?.uploadURL;
      if (!uploadedUrl) {
        throw new Error("لم يتم الحصول على رابط الصورة");
      }

      await apiRequest("/api/profile/image", {
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

  const onSubmit = (data: UpdateProfileFormData) => {
    updateMutation.mutate(data);
  };

  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName?.[0]}${user.lastName?.[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user?.email?.[0].toUpperCase();
    }
    return "م";
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

  const formatLastActivity = (date: string | Date | null) => {
    if (!date) return "غير محدد";
    try {
      return formatDistanceToNow(new Date(date), { locale: ar, addSuffix: true });
    } catch {
      return "غير محدد";
    }
  };

  if (isLoadingUser) {
    return (
      <DashboardLayout>
        <div className="p-6 space-y-6" dir="rtl">
          <div className="flex items-center gap-6">
            <Skeleton className="h-32 w-32 rounded-full" />
            <div className="space-y-3 flex-1">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">يجب تسجيل الدخول</h2>
              <p className="text-muted-foreground mb-4">سجل الدخول لعرض ملفك الشخصي</p>
              <Button onClick={() => (window.location.href = "/login")} data-testid="button-login">
                تسجيل الدخول
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const bioPreviewLength = 150;
  const shouldTruncateBio = (user.bio?.length || 0) > bioPreviewLength;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">الملف الشخصي</h1>
            <p className="text-muted-foreground">إدارة معلوماتك الشخصية ونشاطك</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card data-testid="card-profile-info">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-4">
                    <Avatar className="h-28 w-28 border-4 border-background shadow-lg">
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

                    <div className="absolute -bottom-1 -left-1">
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={5 * 1024 * 1024}
                        allowedFileTypes={[".jpg", ".jpeg", ".png", ".webp"]}
                        onGetUploadParameters={getUploadUrl}
                        onComplete={handleAvatarUploadComplete}
                        variant="outline"
                        size="icon"
                        buttonClassName="h-8 w-8 rounded-full bg-background/90 dark:bg-muted/60 border-muted-foreground/20 shadow-sm hover:bg-background dark:hover:bg-muted/80"
                      >
                        <Camera className="h-3.5 w-3.5 text-muted-foreground" />
                      </ObjectUploader>
                    </div>
                  </div>

                  <h2 className="text-xl font-bold mb-1" data-testid="text-user-name">
                    {getUserDisplayName()}
                  </h2>

                  {(rolesData?.jobTitle || rolesData?.department) && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                      {rolesData.jobTitle && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3.5 w-3.5" />
                          {rolesData.jobTitle}
                        </span>
                      )}
                      {rolesData.jobTitle && rolesData.department && <span>•</span>}
                      {rolesData.department && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {rolesData.department}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap justify-center gap-2 mb-4">
                    {isLoadingRoles ? (
                      <Skeleton className="h-6 w-20" />
                    ) : (
                      <>
                        {rolesData?.rbacRoles.map((role) => (
                          <Badge
                            key={role.roleId}
                            variant="default"
                            className="gap-1"
                            data-testid={`badge-role-${role.roleName}`}
                          >
                            <Shield className="h-3 w-3" />
                            {roleLabels[role.roleName] || role.roleName}
                          </Badge>
                        ))}
                        {rolesData?.rbacRoles.length === 0 && rolesData?.legacyRole && (
                          <Badge variant="secondary" data-testid="badge-legacy-role">
                            {roleLabels[rolesData.legacyRole] || rolesData.legacyRole}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>

                  <div className="w-full space-y-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span data-testid="text-user-email">{user.email}</span>
                    </div>

                    {user.phoneNumber && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        <span data-testid="text-user-phone">{user.phoneNumber}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarDays className="h-4 w-4" />
                      <span>
                        انضم {format(new Date(user.createdAt), "d MMMM yyyy", { locale: ar })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span data-testid="text-last-activity">
                        آخر نشاط: {formatLastActivity(user.lastActivityAt)}
                      </span>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="w-full">
                    {user.bio ? (
                      <Collapsible open={isBioExpanded} onOpenChange={setIsBioExpanded}>
                        <div className="text-right">
                          <p className="text-sm text-foreground/80 leading-relaxed">
                            {shouldTruncateBio && !isBioExpanded
                              ? `${user.bio.substring(0, bioPreviewLength)}...`
                              : user.bio}
                          </p>
                          {shouldTruncateBio && (
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-auto p-0 text-primary"
                                data-testid="button-expand-bio"
                              >
                                {isBioExpanded ? (
                                  <>
                                    <ChevronUp className="h-4 w-4 ml-1" />
                                    عرض أقل
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-4 w-4 ml-1" />
                                    قراءة المزيد
                                  </>
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          )}
                        </div>
                      </Collapsible>
                    ) : (
                      <p className="text-sm text-muted-foreground">لم تضف نبذة تعريفية بعد</p>
                    )}
                  </div>

                  <Button
                    className="w-full mt-4 gap-2"
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    data-testid="button-edit-profile"
                  >
                    <Edit className="h-4 w-4" />
                    {isEditingProfile ? "إلغاء التعديل" : "تعديل الملف الشخصي"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <AnimatePresence>
              {isEditingProfile && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card data-testid="card-edit-profile">
                    <CardHeader>
                      <CardTitle className="text-lg">تعديل المعلومات</CardTitle>
                      <CardDescription>قم بتحديث بياناتك الشخصية</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>الاسم الأول</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="الاسم الأول"
                                      {...field}
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
                                      placeholder="اسم العائلة"
                                      {...field}
                                      data-testid="input-last-name"
                                    />
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
                                  <Input
                                    type="tel"
                                    placeholder="+966 5x xxx xxxx"
                                    {...field}
                                    data-testid="input-phone"
                                  />
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
                                <FormLabel>النبذة التعريفية</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="اكتب نبذة مختصرة عنك..."
                                    className="resize-none min-h-[100px]"
                                    {...field}
                                    data-testid="input-bio"
                                  />
                                </FormControl>
                                <FormDescription>
                                  {field.value?.length || 0}/500 حرف
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              disabled={updateMutation.isPending}
                              className="flex-1 gap-2"
                              data-testid="button-save-profile"
                            >
                              {updateMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  جاري الحفظ...
                                </>
                              ) : (
                                <>
                                  <Save className="h-4 w-4" />
                                  حفظ التغييرات
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsEditingProfile(false)}
                              data-testid="button-cancel-edit"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {rolesData?.rbacRoles && rolesData.rbacRoles.length > 0 && (
              <Card data-testid="card-roles-details">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    الأدوار والصلاحيات
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rolesData.rbacRoles.map((role) => (
                    <div
                      key={role.roleId}
                      className="p-3 rounded-lg bg-muted/50"
                      data-testid={`role-card-${role.roleName}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {roleLabels[role.roleName] || role.roleName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {format(new Date(role.assignedAt), "d MMM yyyy", { locale: ar })}
                        </Badge>
                      </div>
                      {(roleDescriptions[role.roleName] || role.roleDescription) && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {roleDescriptions[role.roleName] || role.roleDescription}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            <Card className="h-full" data-testid="card-activity">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      سجل النشاط
                    </CardTitle>
                    <CardDescription>جميع أنشطتك في النظام</CardDescription>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={activityFilter} onValueChange={setActivityFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-action-filter">
                        <Filter className="h-4 w-4 ml-2" />
                        <SelectValue placeholder="العملية" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع العمليات</SelectItem>
                        <SelectItem value="create">إنشاء</SelectItem>
                        <SelectItem value="update">تعديل</SelectItem>
                        <SelectItem value="delete">حذف</SelectItem>
                        <SelectItem value="publish">نشر</SelectItem>
                        <SelectItem value="approve">اعتماد</SelectItem>
                        <SelectItem value="reject">رفض</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-entity-filter">
                        <Tag className="h-4 w-4 ml-2" />
                        <SelectValue placeholder="النوع" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع الأنواع</SelectItem>
                        <SelectItem value="article">مقالات</SelectItem>
                        <SelectItem value="comment">تعليقات</SelectItem>
                        <SelectItem value="user">مستخدمين</SelectItem>
                        <SelectItem value="category">تصنيفات</SelectItem>
                        <SelectItem value="media">وسائط</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setActivityFilter("all");
                        setEntityTypeFilter("all");
                        setActivityPage(1);
                      }}
                      data-testid="button-reset-filters"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingActivity ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-lg bg-muted/30">
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activityData?.logs.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">لا يوجد نشاط</h3>
                    <p className="text-muted-foreground">
                      {activityFilter !== "all" || entityTypeFilter !== "all"
                        ? "لا توجد نتائج تطابق الفلتر المحدد"
                        : "لم يتم تسجيل أي نشاط بعد"}
                    </p>
                  </div>
                ) : (
                  <>
                    <ScrollArea className="h-[500px]" dir="rtl">
                      <div className="space-y-3">
                        {(() => {
                          const seen = new Set<string>();
                          return activityData?.logs.filter((log) => {
                            const signature = `${log.action}-${log.entityType}-${log.entityId}-${log.metadata?.reason || ''}`;
                            if (seen.has(signature)) return false;
                            seen.add(signature);
                            return true;
                          });
                        })()?.map((log, index) => {
                          const actionPresentation = getActionPresentation(log.action);
                          const ActionIcon = actionPresentation.icon;
                          return (
                            <motion.div
                              key={log.id}
                              initial={{ opacity: 0, x: 20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="flex items-start gap-4 p-4 rounded-lg bg-muted/30 hover-elevate"
                              data-testid={`activity-item-${log.id}`}
                            >
                              <div
                                className={`p-2.5 rounded-full shrink-0 ${actionPresentation.bgColor} ${actionPresentation.textColor}`}
                              >
                                <ActionIcon className="h-4 w-4" />
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant={actionPresentation.badgeVariant}>
                                    {actionPresentation.label}
                                  </Badge>
                                  <Badge variant="outline">
                                    {getEntityTypeLabel(log.entityType)}
                                  </Badge>
                                </div>

                                {log.entityTitle ? (
                                  <p className="text-sm mt-1">
                                    {log.entityUrl ? (
                                      <a 
                                        href={log.entityUrl} 
                                        className="text-primary hover:underline font-medium"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        {log.entityTitle}
                                      </a>
                                    ) : (
                                      <span className="font-medium">{log.entityTitle}</span>
                                    )}
                                  </p>
                                ) : (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    المعرف:{" "}
                                    <code className="text-xs bg-muted px-1 py-0.5 rounded" dir="ltr">
                                      {log.entityId.substring(0, 12)}...
                                    </code>
                                  </p>
                                )}

                                {log.metadata?.reason && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    السبب: {log.metadata.reason}
                                  </p>
                                )}
                              </div>

                              <div className="shrink-0">
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(log.createdAt), "d MMM", { locale: ar })}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(log.createdAt), "HH:mm")}
                                </p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </ScrollArea>

                    {activityData && activityData.totalPages > 1 && (
                      <div className="flex items-center justify-between mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground">
                          صفحة {activityData.page} من {activityData.totalPages} ({activityData.total}{" "}
                          نتيجة)
                        </p>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActivityPage((p) => p + 1)}
                            disabled={activityPage >= activityData.totalPages}
                            data-testid="button-next-page"
                          >
                            التالي
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                            disabled={activityPage === 1}
                            data-testid="button-prev-page"
                          >
                            <ChevronRight className="h-4 w-4" />
                            السابق
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
