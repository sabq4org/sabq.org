import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink, Share2 } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface AgencySocialPost {
  id: string;
  articleId: string | null;
  articleTitle: string | null;
  status: string;
  text: string;
  includeLink: boolean;
  imageSource: string;
  mediaKind: string;
  mediaUrls: string[];
  requestedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostUrl: string | null;
  createdAt: string;
  createdByName: string | null;
  withdrawn: boolean;
  note: string | null;
}

const STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "بانتظار الموافقة", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" },
  scheduled: { label: "مجدولة", className: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200" },
  processing: { label: "قيد النشر", className: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200" },
  published: { label: "نُشرت", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" },
  failed: { label: "تعذر النشر", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" },
  canceled: { label: "مرفوضة", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" },
};

function mediaLabel(p: AgencySocialPost) {
  const media =
    p.mediaKind === "video"
      ? "فيديو"
      : p.mediaKind === "image"
        ? p.mediaUrls.length > 1
          ? `${p.mediaUrls.length} صور`
          : "صورة"
        : p.imageSource === "article"
          ? "صورة الخبر"
          : "بلا وسائط";
  return `${media} · ${p.includeLink ? "برابط" : "بدون رابط"}`;
}

/** كل تغريدات الوكالة وحالتها: بانتظار الموافقة، مجدولة، منشورة، مرفوضة. */
export default function PublisherSocialPosts() {
  usePublisherAccess();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ posts: AgencySocialPost[] }>({
    queryKey: ["/api/publisher/portal/social/posts"],
  });
  const posts = Array.isArray(data?.posts) ? data!.posts : [];

  const withdraw = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/publisher/portal/social/posts/${id}/withdraw`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/social/posts"] });
      toast({ title: "سُحبت التغريدة" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "تعذر السحب", description: err.message }),
  });

  return (
    <PublisherLayout>
      <div className="w-full space-y-5" dir="rtl">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            النشر الاجتماعي
          </h1>
          <p className="mt-1 text-muted-foreground">
            تغريدات أخباركم على حساب سبق في X. لطلب تغريدة جديدة اضغطوا «نشر اجتماعي» بجانب الخبر في قائمة أخباري.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : posts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
              <Share2 className="h-8 w-8 opacity-60" />
              <p>لا توجد تغريدات بعد. يمكنكم طلب تغريدة لأي خبر خلال 48 ساعة من نشره.</p>
              <Link href="/dashboard/publisher/articles">
                <Button variant="outline">أخباري</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التغريدة</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الموعد</TableHead>
                    <TableHead className="text-right">أرسلها</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {posts.map((p) => {
                    const status = p.withdrawn
                      ? { label: "سحبتموها", className: "bg-muted text-muted-foreground" }
                      : STATUS[p.status] ?? STATUS.draft;
                    const when =
                      p.status === "published" && p.publishedAt
                        ? formatDateTime(p.publishedAt)
                        : p.status === "scheduled" && p.scheduledAt
                          ? formatDateTime(p.scheduledAt)
                          : p.status === "draft"
                            ? p.requestedAt
                              ? `تطلبون ${formatDateTime(p.requestedAt)}`
                              : "بعد الموافقة"
                            : "—";
                    return (
                      <TableRow key={p.id} data-testid={`row-social-${p.id}`}>
                        <TableCell className="min-w-[260px] max-w-[420px] align-top">
                          <p className="line-clamp-2 font-medium">{p.text}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {p.articleTitle ? `${p.articleTitle} · ` : ""}
                            {mediaLabel(p)}
                          </p>
                          {p.note ? <p className="mt-1 text-xs text-red-700 dark:text-red-300">ملاحظة سبق: {p.note}</p> : null}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant="outline" className={cn("border-0 font-semibold", status.className)}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-sm">{when}</TableCell>
                        <TableCell className="whitespace-nowrap align-top text-sm">{p.createdByName ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap align-top">
                          {p.status === "published" && p.externalPostUrl ? (
                            <a href={p.externalPostUrl} target="_blank" rel="noreferrer">
                              <Button variant="ghost" size="sm" className="gap-1">
                                <ExternalLink className="h-3.5 w-3.5" />
                                عرض على X
                              </Button>
                            </a>
                          ) : null}
                          {p.status === "draft" && p.articleId ? (
                            <Link href={`/dashboard/publisher/articles/${p.articleId}/social`}>
                              <Button variant="ghost" size="sm">
                                تعديل
                              </Button>
                            </Link>
                          ) : null}
                          {p.status === "scheduled" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={withdraw.isPending}
                              onClick={() => withdraw.mutate(p.id)}
                              data-testid={`button-withdraw-${p.id}`}
                            >
                              إلغاء
                            </Button>
                          ) : null}
                          {p.status === "canceled" && !p.withdrawn && p.articleId ? (
                            <Link href={`/dashboard/publisher/articles/${p.articleId}/social`}>
                              <Button variant="ghost" size="sm">
                                أعد الإرسال
                              </Button>
                            </Link>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </PublisherLayout>
  );
}
