import { useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AdminPublisherNav } from "@/components/admin/publishers/AdminPublisherNav";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { AddCreditPackageDialog } from "@/components/admin/publishers/AddCreditPackageDialog";
import { CreatePublisherDialog } from "@/components/admin/publishers/CreatePublisherDialog";
import { PublisherMembersCard } from "@/components/admin/publishers/PublisherMembersCard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDate, formatDateShort, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Edit,
  Building2,
  CreditCard,
  FileText,
  Mail,
  Phone,
  Calendar,
  MapPin,
  FileCheck,
  FileClock,
  FileX,
  Plus,
  CheckCircle,
  XCircle,
  Zap,
  Infinity as InfinityIcon,
} from "lucide-react";
import type { Publisher, PublisherCredit, Article } from "@shared/schema";

interface PublisherStats {
  totalArticles: number;
  publishedArticles: number;
  pendingArticles: number;
  rejectedArticles: number;
  remainingCredits: number;
  usedCredits: number;
  totalCreditsUsed: number;
  totalCreditsPurchased: number;
}

function StatTile({
  label,
  value,
  icon: Icon,
  valueClass,
  testId,
}: {
  label: string;
  value: ReactNode;
  icon: ComponentType<{ className?: string }>;
  valueClass?: string;
  testId?: string;
}) {
  return (
    <Card className="border-border/60 shadow-none">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn("mt-0.5 text-xl font-bold tracking-tight", valueClass)} data-testid={testId}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminPublisherDetails() {
  useRoleProtection("admin");
  const [, params] = useRoute("/dashboard/admin/publishers/:id");
  const publisherId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddPackageDialog, setShowAddPackageDialog] = useState(false);
  const [articlesPage, setArticlesPage] = useState(1);
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false);

  const { data: publisher, isLoading: isLoadingPublisher } = useQuery<Publisher>({
    queryKey: [`/api/admin/publishers/${publisherId}`],
    enabled: !!publisherId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: credits, isLoading: isLoadingCredits } = useQuery<PublisherCredit[]>({
    queryKey: [`/api/admin/publishers/${publisherId}/credits`],
    enabled: !!publisherId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: statsData } = useQuery<{
    publisher: Publisher;
    stats: PublisherStats;
    credits: PublisherCredit[];
    activeCredit: PublisherCredit | null;
  }>({
    queryKey: [`/api/admin/publisher-reports/${publisherId}`],
    enabled: !!publisherId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const articlesLimit = 10;
  const { data: articlesDataRaw } = useQuery<{
    articles: Array<
      Pick<
        Article,
        | "id"
        | "title"
        | "slug"
        | "englishSlug"
        | "status"
        | "publisherStatus"
        | "views"
        | "createdAt"
        | "publishedAt"
      >
    >;
    total: number;
  }>({
    queryKey: [`/api/admin/publishers/${publisherId}/articles`, { page: articlesPage, limit: articlesLimit }],
    enabled: !!publisherId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const articlesData = Array.isArray(articlesDataRaw?.articles) ? articlesDataRaw!.articles : [];
  const articlesTotal = Number(articlesDataRaw?.total) || 0;
  const articlesTotalPages = Math.max(1, Math.ceil(articlesTotal / articlesLimit));

  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      return apiRequest(`/api/admin/publishers/${publisherId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (_result, isActive) => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/publishers/${publisherId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers/rich-list"] });
      toast({
        title: isActive ? "تم التفعيل" : "تم التعليق",
        description: isActive
          ? "عادت الوكالة نشطة ويمكن لأعضائها الدخول والنشر"
          : "عُلقت الوكالة — لن يدخل أعضاؤها البوابة ولن تصلها تنبيهات",
      });
      setShowSuspendConfirm(false);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث حالة الوكالة",
        variant: "destructive",
      });
      setShowSuspendConfirm(false);
    },
  });

  const deactivateCreditMutation = useMutation({
    mutationFn: async (creditId: string) => {
      return apiRequest(`/api/admin/publishers/${publisherId}/credits/${creditId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: false }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/publishers/${publisherId}/credits`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/publisher-reports/${publisherId}`] });
      toast({
        title: "تم التعطيل",
        description: "تم تعطيل الباقة بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في تعطيل الباقة",
        variant: "destructive",
      });
    },
  });

  if (isLoadingPublisher) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[1600px] space-y-5 pb-10" dir="rtl">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  if (!publisher) {
    return (
      <DashboardLayout>
        <div className="py-16 text-center text-muted-foreground">الناشر غير موجود</div>
      </DashboardLayout>
    );
  }

  const stats = statsData?.stats;
  const activeCredit = statsData?.activeCredit;
  const hasActiveUnlimited = (credits || []).some(
    (c) => c.isActive && c.isUnlimited && (!c.expiryDate || new Date(c.expiryDate) >= new Date()),
  );
  const totalRemainingCredits =
    credits?.filter((c) => c.isActive && !c.isUnlimited).reduce((sum, c) => sum + c.remainingCredits, 0) ||
    0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-5 pb-10" dir="rtl">
        <AdminPublisherNav />

        {/* رأس الوكالة */}
        <header className="relative overflow-hidden rounded-2xl border bg-card p-5 shadow-none sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-primary/[0.04] to-transparent"
          />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <Link href="/dashboard/admin/publishers">
                <Button variant="ghost" size="icon" className="mt-1 shrink-0" data-testid="button-back">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              {publisher.logoUrl ? (
                <img
                  src={publisher.logoUrl}
                  alt={publisher.agencyName}
                  className="h-14 w-14 shrink-0 rounded-xl border bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-muted">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-bold tracking-tight" data-testid="text-page-title">
                  {publisher.agencyName}
                </h1>
                {publisher.agencyNameEn && (
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    {publisher.agencyNameEn}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {publisher.isActive && !publisher.suspendedUntil ? (
                    <Badge className="gap-1" variant="default">
                      <CheckCircle className="h-3 w-3" />
                      نشط
                    </Badge>
                  ) : (
                    <Badge className="gap-1" variant="destructive">
                      <XCircle className="h-3 w-3" />
                      معلقة
                    </Badge>
                  )}
                  {publisher.autoPublish && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                    >
                      <Zap className="h-3 w-3" />
                      نشر فوري
                    </Badge>
                  )}
                  {activeCredit && (
                    <Badge variant="secondary" className="gap-1">
                      <CreditCard className="h-3 w-3" />
                      {activeCredit.packageName}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={publisher.isActive ? "destructive" : "default"}
                onClick={() => setShowSuspendConfirm(true)}
                disabled={toggleActiveMutation.isPending}
                data-testid="button-toggle-active"
              >
                {publisher.isActive ? (
                  <>
                    <XCircle className="ml-2 h-4 w-4" />
                    تعليق الوكالة
                  </>
                ) : (
                  <>
                    <CheckCircle className="ml-2 h-4 w-4" />
                    تفعيل الوكالة
                  </>
                )}
              </Button>
              <Button onClick={() => setShowEditDialog(true)} data-testid="button-edit">
                <Edit className="ml-2 h-4 w-4" />
                تعديل البيانات
              </Button>
            </div>
          </div>
        </header>

        {!publisher.isActive && (
          <div
            className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
            data-testid="banner-suspended"
          >
            <XCircle className="h-4 w-4 shrink-0" />
            <span>
              الوكالة معلقة: بوابتها محجوبة عن كل أعضائها، ولا تصلها تنبيهات الرصيد ولا التقارير الشهرية،
              والنشر متوقف.
            </span>
          </div>
        )}

        {/* مؤشرات سريعة */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          <StatTile
            label="الرصيد المتبقي"
            value={
              hasActiveUnlimited ? (
                <span className="inline-flex items-center gap-1">
                  مفتوح <InfinityIcon className="h-4 w-4" />
                </span>
              ) : (
                formatNumber(totalRemainingCredits)
              )
            }
            icon={CreditCard}
            testId="text-total-credits"
          />
          <StatTile
            label="إجمالي المقالات"
            value={formatNumber(stats?.totalArticles ?? 0)}
            icon={FileText}
          />
          <StatTile
            label="المنشور"
            value={formatNumber(stats?.publishedArticles ?? 0)}
            icon={FileCheck}
            valueClass="text-emerald-600"
          />
          <StatTile
            label="قيد المراجعة"
            value={formatNumber(stats?.pendingArticles ?? 0)}
            icon={FileClock}
            valueClass="text-amber-600"
          />
          <StatTile
            label="المرفوض"
            value={formatNumber(stats?.rejectedArticles ?? 0)}
            icon={FileX}
            valueClass="text-red-600"
          />
          <StatTile
            label="الرصيد المستخدم"
            value={formatNumber(stats?.totalCreditsUsed ?? 0)}
            icon={FileText}
          />
          <StatTile
            label="إجمالي المشترى"
            value={formatNumber(stats?.totalCreditsPurchased ?? 0)}
            icon={CreditCard}
          />
        </div>

        {/* معلومات + مستخدمون */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <Card className="border-border/60 xl:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4" />
                معلومات الناشر
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground">الشخص المسؤول</p>
                <p className="font-medium">{publisher.contactPerson}</p>
                {publisher.contactPersonEn && (
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    {publisher.contactPersonEn}
                  </p>
                )}
              </div>

              <Separator />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">البريد</p>
                    <a
                      href={`mailto:${publisher.email}`}
                      className="block truncate text-sm text-primary hover:underline"
                      dir="ltr"
                    >
                      {publisher.email}
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">الهاتف</p>
                    <a href={`tel:${publisher.phoneNumber}`} className="text-sm hover:underline" dir="ltr">
                      {publisher.phoneNumber}
                    </a>
                  </div>
                </div>
              </div>

              {(publisher.commercialRegistration || publisher.taxNumber) && (
                <>
                  <Separator />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {publisher.commercialRegistration && (
                      <div>
                        <p className="text-xs text-muted-foreground">السجل التجاري</p>
                        <p className="font-medium" dir="ltr">
                          {publisher.commercialRegistration}
                        </p>
                      </div>
                    )}
                    {publisher.taxNumber && (
                      <div>
                        <p className="text-xs text-muted-foreground">الرقم الضريبي</p>
                        <p className="font-medium" dir="ltr">
                          {publisher.taxNumber}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {publisher.address && (
                <>
                  <Separator />
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">العنوان</p>
                      <p className="text-sm">{publisher.address}</p>
                    </div>
                  </div>
                </>
              )}

              {publisher.notes && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground">ملاحظات الإدارة</p>
                    <p className="mt-1 rounded-lg bg-muted p-3 text-sm" dir="rtl">
                      {publisher.notes}
                    </p>
                  </div>
                </>
              )}

              <Separator />
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                تاريخ الإنشاء: {formatDate(publisher.createdAt)}
              </div>
            </CardContent>
          </Card>

          <div className="xl:col-span-3">
            <PublisherMembersCard publisherId={publisherId!} />
          </div>
        </div>

        {/* باقات الرصيد */}
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="h-4 w-4" />
                باقات الرصيد
              </CardTitle>
              <Button onClick={() => setShowAddPackageDialog(true)} data-testid="button-add-package">
                <Plus className="ml-2 h-4 w-4" />
                إضافة باقة جديدة
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingCredits ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : credits && credits.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اسم الباقة</TableHead>
                      <TableHead className="text-right">الفترة</TableHead>
                      <TableHead className="text-right">إجمالي الرصيد</TableHead>
                      <TableHead className="text-right">المستخدم</TableHead>
                      <TableHead className="text-right">المتبقي</TableHead>
                      <TableHead className="text-right">تاريخ البداية</TableHead>
                      <TableHead className="text-right">تاريخ الانتهاء</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credits.map((credit) => {
                      const isExpired = credit.expiryDate && new Date(credit.expiryDate) < new Date();

                      return (
                        <TableRow key={credit.id} data-testid={`row-credit-${credit.id}`}>
                          <TableCell className="font-medium">
                            {credit.packageName}
                            {credit.isUnlimited && (
                              <Badge
                                variant="outline"
                                className="mr-2 border-blue-300 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                              >
                                مفتوحة
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {credit.period === "monthly" && "شهرية"}
                            {credit.period === "quarterly" && "ربع سنوية"}
                            {credit.period === "yearly" && "سنوية"}
                            {credit.period === "one-time" && "مرة واحدة"}
                          </TableCell>
                          <TableCell>
                            {credit.isUnlimited ? "مفتوح ∞" : formatNumber(credit.totalCredits)}
                          </TableCell>
                          <TableCell>{formatNumber(credit.usedCredits)}</TableCell>
                          <TableCell className="font-medium">
                            {credit.isUnlimited ? "مفتوح" : formatNumber(credit.remainingCredits)}
                          </TableCell>
                          <TableCell>{formatDateShort(credit.startDate)}</TableCell>
                          <TableCell>
                            {credit.expiryDate ? formatDateShort(credit.expiryDate) : "—"}
                          </TableCell>
                          <TableCell>
                            {!credit.isActive ? (
                              <Badge variant="outline">معطل</Badge>
                            ) : isExpired ? (
                              <Badge variant="destructive">منتهي</Badge>
                            ) : !credit.isUnlimited && credit.remainingCredits === 0 ? (
                              <Badge variant="secondary">مكتمل</Badge>
                            ) : (
                              <Badge variant="default">نشط</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {credit.isActive && !isExpired && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deactivateCreditMutation.mutate(credit.id)}
                                data-testid={`button-deactivate-${credit.id}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground">لا توجد باقات رصيد حالياً</div>
            )}
          </CardContent>
        </Card>

        {/* أخبار الوكالة */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              أخبار الوكالة
              {articlesTotal > 0 && <Badge variant="secondary">{formatNumber(articlesTotal)}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {articlesData.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">العنوان</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">المشاهدات</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {articlesData.map((article) => (
                        <TableRow key={article.id}>
                          <TableCell className="max-w-md font-medium">
                            <p className="line-clamp-2">{article.title}</p>
                          </TableCell>
                          <TableCell>
                            {article.status === "published" ? (
                              <Badge
                                className="border-0 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                                variant="outline"
                              >
                                منشور
                              </Badge>
                            ) : article.status === "archived" ||
                              article.publisherStatus === "rejected" ? (
                              <Badge variant="destructive">مرفوض</Badge>
                            ) : article.publisherStatus === "needs_changes" ? (
                              <Badge
                                className="border-orange-300 bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200"
                                variant="outline"
                              >
                                أُعيدت للناشر
                              </Badge>
                            ) : article.publisherStatus === "pending" ? (
                              <Badge
                                className="border-amber-300 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                variant="outline"
                              >
                                بانتظار المراجعة
                              </Badge>
                            ) : (
                              <Badge variant="secondary">مسودة</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {article.status === "published"
                              ? formatNumber(Number(article.views) || 0)
                              : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDateShort(article.publishedAt || article.createdAt)}
                          </TableCell>
                          <TableCell>
                            {article.status === "published" && (
                              <Link href={`/article/${article.englishSlug || article.slug}`}>
                                <Button variant="ghost" size="sm">
                                  عرض
                                </Button>
                              </Link>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {articlesTotalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground" data-testid="text-articles-pagination">
                      صفحة {formatNumber(articlesPage)} من {formatNumber(articlesTotalPages)} · إجمالي{" "}
                      {formatNumber(articlesTotal)} مادة
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArticlesPage((p) => Math.max(1, p - 1))}
                        disabled={articlesPage === 1}
                        data-testid="button-articles-prev"
                      >
                        السابق
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArticlesPage((p) => Math.min(articlesTotalPages, p + 1))}
                        disabled={articlesPage >= articlesTotalPages}
                        data-testid="button-articles-next"
                      >
                        التالي
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground">لا توجد مقالات لهذا الناشر</div>
            )}
          </CardContent>
        </Card>

        {showEditDialog && (
          <CreatePublisherDialog
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            publisher={publisher}
            mode="edit"
          />
        )}

        {showAddPackageDialog && publisherId && (
          <AddCreditPackageDialog
            open={showAddPackageDialog}
            onOpenChange={setShowAddPackageDialog}
            publisherId={publisherId}
          />
        )}

        <AlertDialog open={showSuspendConfirm} onOpenChange={setShowSuspendConfirm}>
          <AlertDialogContent data-testid="dialog-toggle-active">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {publisher.isActive ? "تعليق الوكالة" : "تفعيل الوكالة"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {publisher.isActive
                  ? `سيُحجب دخول كل أعضاء «${publisher.agencyName}» إلى بوابة الناشر فوراً، ويتوقف النشر، ولن تصلهم أي تنبيهات أو تقارير حتى إعادة التفعيل.`
                  : `ستعود «${publisher.agencyName}» نشطة: يدخل أعضاؤها البوابة وينشرون حسب باقتهم، وتصلهم التنبيهات والتقارير.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={toggleActiveMutation.isPending}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => toggleActiveMutation.mutate(!publisher.isActive)}
                disabled={toggleActiveMutation.isPending}
                className={
                  publisher.isActive
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : undefined
                }
              >
                {publisher.isActive ? "تأكيد التعليق" : "تأكيد التفعيل"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
