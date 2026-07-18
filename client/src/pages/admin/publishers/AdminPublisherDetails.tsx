import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { AddCreditPackageDialog } from "@/components/admin/publishers/AddCreditPackageDialog";
import { CreatePublisherDialog } from "@/components/admin/publishers/CreatePublisherDialog";
import { PublisherMembersCard } from "@/components/admin/publishers/PublisherMembersCard";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
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
  Clock,
  TrendingUp,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
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

export default function AdminPublisherDetails() {
  useRoleProtection('admin');
  const [, params] = useRoute("/dashboard/admin/publishers/:id");
  const publisherId = params?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddPackageDialog, setShowAddPackageDialog] = useState(false);
  const [articlesPage, setArticlesPage] = useState(1);

  const { data: publisher, isLoading: isLoadingPublisher } = useQuery<Publisher>({
    queryKey: [`/api/admin/publishers/${publisherId}`],
    enabled: !!publisherId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: credits, isLoading: isLoadingCredits } = useQuery<PublisherCredit[]>({
    queryKey: [`/api/admin/publishers/${publisherId}/credits`],
    enabled: !!publisherId,
    staleTime: 0,
    refetchOnMount: 'always',
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
    refetchOnMount: 'always',
  });

  // مواد الوكالة كاملة (المالك + الموظفون عبر publisherId) بترقيم فعلي من الخادم
  const articlesLimit = 10;
  const { data: articlesDataRaw } = useQuery<{
    articles: Array<Pick<Article, "id" | "title" | "slug" | "englishSlug" | "status" | "publisherStatus" | "views" | "createdAt" | "publishedAt">>;
    total: number;
  }>({
    queryKey: [`/api/admin/publishers/${publisherId}/articles`, { page: articlesPage, limit: articlesLimit }],
    enabled: !!publisherId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const articlesData = Array.isArray(articlesDataRaw?.articles) ? articlesDataRaw!.articles : [];
  const articlesTotal = Number(articlesDataRaw?.total) || 0;
  const articlesTotalPages = Math.max(1, Math.ceil(articlesTotal / articlesLimit));

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
        <div className="text-center py-12">جاري التحميل...</div>
      </DashboardLayout>
    );
  }

  if (!publisher) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">الناشر غير موجود</div>
      </DashboardLayout>
    );
  }

  const stats = statsData?.stats;
  const activeCredit = statsData?.activeCredit;
  const hasActiveUnlimited = (credits || []).some(
    (c) => c.isActive && c.isUnlimited && (!c.expiryDate || new Date(c.expiryDate) >= new Date()),
  );
  const totalRemainingCredits = credits
    ?.filter((c) => c.isActive && !c.isUnlimited)
    .reduce((sum, c) => sum + c.remainingCredits, 0) || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/admin/publishers">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              {publisher.agencyName}
            </h1>
            {publisher.agencyNameEn && (
              <p className="text-muted-foreground">{publisher.agencyNameEn}</p>
            )}
          </div>
        </div>
        <Button onClick={() => setShowEditDialog(true)} data-testid="button-edit">
          <Edit className="ml-2 h-4 w-4" />
          تعديل البيانات
        </Button>
      </div>

      {/* Publisher Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              معلومات الناشر
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">الشخص المسؤول</p>
                <p className="font-medium">{publisher.contactPerson}</p>
                {publisher.contactPersonEn && (
                  <p className="text-sm text-muted-foreground">{publisher.contactPersonEn}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">الحالة</p>
                {publisher.isActive && !publisher.suspendedUntil ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    نشط
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    معطل
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <Mail className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                  <a href={`mailto:${publisher.email}`} className="text-primary hover:underline">
                    {publisher.email}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                  <a href={`tel:${publisher.phoneNumber}`} className="hover:underline">
                    {publisher.phoneNumber}
                  </a>
                </div>
              </div>
            </div>

            {(publisher.commercialRegistration || publisher.taxNumber) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  {publisher.commercialRegistration && (
                    <div>
                      <p className="text-sm text-muted-foreground">السجل التجاري</p>
                      <p className="font-medium">{publisher.commercialRegistration}</p>
                    </div>
                  )}
                  {publisher.taxNumber && (
                    <div>
                      <p className="text-sm text-muted-foreground">الرقم الضريبي</p>
                      <p className="font-medium">{publisher.taxNumber}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {publisher.address && (
              <>
                <Separator />
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm text-muted-foreground">العنوان</p>
                    <p className="text-sm">{publisher.address}</p>
                  </div>
                </div>
              </>
            )}

            {publisher.notes && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">ملاحظات الإدارة</p>
                  <p className="text-sm mt-1 p-3 bg-muted rounded-md" dir="rtl">{publisher.notes}</p>
                </div>
              </>
            )}

            <Separator />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              تاريخ الإنشاء: {format(new Date(publisher.createdAt), "PPP", { locale: ar })}
            </div>
          </CardContent>
        </Card>

        {/* Stats Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              إحصائيات سريعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">الرصيد المتبقي</span>
                <span className="text-2xl font-bold" data-testid="text-total-credits">
                  {hasActiveUnlimited ? "مفتوح ∞" : totalRemainingCredits}
                </span>
              </div>
              <Separator />
            </div>

            {stats && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">إجمالي المقالات</span>
                    </div>
                    <span className="font-medium">{stats.totalArticles}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-green-600" />
                      <span className="text-sm">المنشور</span>
                    </div>
                    <span className="font-medium text-green-600">{stats.publishedArticles}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileClock className="h-4 w-4 text-orange-600" />
                      <span className="text-sm">قيد المراجعة</span>
                    </div>
                    <span className="font-medium text-orange-600">{stats.pendingArticles}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileX className="h-4 w-4 text-red-600" />
                      <span className="text-sm">المرفوض</span>
                    </div>
                    <span className="font-medium text-red-600">{stats.rejectedArticles}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">الرصيد المستخدم</span>
                    <span className="font-medium">{stats.totalCreditsUsed}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">إجمالي الرصيد المشترى</span>
                    <span className="font-medium">{stats.totalCreditsPurchased}</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agency Members */}
      <PublisherMembersCard publisherId={publisherId!} />

      {/* Credit Packages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
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
            <div className="text-center py-8">جاري التحميل...</div>
          ) : credits && credits.length > 0 ? (
            <div className="rounded-md border">
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
                            <Badge variant="outline" className="mr-2 bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-200">
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
                        <TableCell>{credit.isUnlimited ? "مفتوح ∞" : credit.totalCredits}</TableCell>
                        <TableCell>{credit.usedCredits}</TableCell>
                        <TableCell className="font-medium">
                          {credit.isUnlimited ? "مفتوح" : credit.remainingCredits}
                        </TableCell>
                        <TableCell>
                          {format(new Date(credit.startDate), "dd/MM/yyyy", { locale: ar })}
                        </TableCell>
                        <TableCell>
                          {credit.expiryDate
                            ? format(new Date(credit.expiryDate), "dd/MM/yyyy", { locale: ar })
                            : "-"}
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
            <div className="text-center py-8 text-muted-foreground">
              لا توجد باقات رصيد حالياً
            </div>
          )}
        </CardContent>
      </Card>

      {/* Publisher Articles — كل مواد الوكالة (المالك والموظفون) بترقيم */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            أخبار الوكالة
            {articlesTotal > 0 && <Badge variant="secondary">{articlesTotal}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {articlesData && articlesData.length > 0 ? (
            <div className="space-y-4">
              <div className="rounded-md border">
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
                        <TableCell className="font-medium max-w-md">
                          <p className="line-clamp-2">{article.title}</p>
                        </TableCell>
                        <TableCell>
                          {article.status === "published" ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" variant="outline">منشور</Badge>
                          ) : article.status === "archived" || article.publisherStatus === "rejected" ? (
                            <Badge variant="destructive">مرفوض</Badge>
                          ) : article.publisherStatus === "needs_changes" ? (
                            <Badge className="bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200" variant="outline">أُعيدت للناشر</Badge>
                          ) : article.publisherStatus === "pending" ? (
                            <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200" variant="outline">بانتظار المراجعة</Badge>
                          ) : (
                            <Badge variant="secondary">مسودة</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {article.status === "published" ? (Number(article.views) || 0) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(article.publishedAt || article.createdAt), "dd/MM/yyyy", { locale: ar })}
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
                    صفحة {articlesPage} من {articlesTotalPages} · إجمالي {articlesTotal} مادة
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
            <div className="text-center py-8 text-muted-foreground">
              لا توجد مقالات لهذا الناشر
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
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
      </div>
    </DashboardLayout>
  );
}
