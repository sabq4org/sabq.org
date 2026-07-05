/**
 * لوحة الأسماء الرياضية الموحّدة — الاعتماد التحريري فوق الترجمة الآلية.
 *
 * كل اسم رياضي (فريق/بطولة/ملعب/مدينة/مدرب/حكم/مصدر/لاعب) يعرَّب آليًا مرة
 * واحدة ويُحفظ في sports_name_translations. هنا يراجعه المحرّر: يصحّح ويعتمد
 * (auto → verified)، والطابور مرتّب بعدد مرات الظهور فالأكثر مشاهدة أولًا.
 * التعديل يسري على الطلبات الجديدة فورًا وعلى المخزون المؤقت خلال دقائق.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Languages, RefreshCw, Check, Trash2, Search, Sparkles } from "lucide-react";

interface NameRow {
  id: number;
  entityType: string;
  provider: string;
  providerId: string | null;
  source: string;
  arabic: string;
  status: "pending" | "auto" | "verified";
  origin: string;
  hits: number;
}

interface StatRow {
  entityType: string;
  status: string;
  total: number;
}

const TYPE_AR: Record<string, string> = {
  team: "فريق",
  league: "بطولة",
  venue: "ملعب",
  city: "مدينة",
  coach: "مدرب",
  referee: "حكم",
  source: "مصدر صحفي",
  player: "لاعب",
};

const STATUS_AR: Record<string, { label: string; cls: string }> = {
  pending: { label: "بانتظار الترجمة", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  auto: { label: "آلية", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  verified: { label: "معتمدة", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
};

export default function SportsNamesManager() {
  const { toast } = useToast();
  const [type, setType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [page, setPage] = useState(1);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (status !== "all") params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  params.set("page", String(page));
  params.set("pageSize", "50");
  const listUrl = `/api/admin/sports-names?${params.toString()}`;

  const { data: listRaw, isLoading, isFetching, refetch } = useQuery<{
    rows: NameRow[];
    total: number;
  }>({ queryKey: [listUrl] });
  const rows = Array.isArray(listRaw?.rows) ? listRaw!.rows : [];
  const total = listRaw?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  const { data: statsRaw } = useQuery<{ stats: StatRow[] }>({
    queryKey: ["/api/admin/sports-names/stats"],
  });
  const stats = Array.isArray(statsRaw?.stats) ? statsRaw!.stats : [];
  const sum = (st?: string) =>
    stats.filter((s) => (st ? s.status === st : true)).reduce((a, s) => a + s.total, 0);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [listUrl] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sports-names/stats"] });
  };

  const patchMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: { arabic?: string; status?: string } }) =>
      apiRequest<NameRow>(`/api/admin/sports-names/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_row, vars) => {
      setDrafts((d) => {
        const next = { ...d };
        delete next[vars.id];
        return next;
      });
      invalidate();
      toast({ title: "حُفظ", description: "سيسري على الطلبات الجديدة فورًا" });
    },
    onError: () => toast({ title: "تعذر الحفظ", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest(`/api/admin/sports-names/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "حُذف", description: "سيُعاد حلّه تلقائيًا عند أول ظهور تالٍ" });
    },
    onError: () => toast({ title: "تعذر الحذف", variant: "destructive" }),
  });

  const processMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ translated: number; remaining: number }>(
        "/api/admin/sports-names/process-pending",
        { method: "POST" },
      ),
    onSuccess: (r) => {
      invalidate();
      toast({
        title: `تُرجم ${r.translated} اسمًا`,
        description: r.remaining > 0 ? `يتبقى ${r.remaining} معلّقًا` : "لا معلّق متبقٍ",
      });
    },
    onError: () => toast({ title: "تعذرت المعالجة", variant: "destructive" }),
  });

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Languages className="h-6 w-6 text-primary" />
              الأسماء الرياضية
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              مراجعة واعتماد التعريب الآلي لأسماء الفرق والبطولات والملاعب واللاعبين
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => processMutation.mutate()}
              disabled={processMutation.isPending}
            >
              <Sparkles className="ml-1 h-4 w-4" />
              {processMutation.isPending ? "يترجم…" : "ترجم المعلّق الآن"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>إجمالي الأسماء</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{sum()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>معتمدة تحريريًا</CardDescription>
              <CardTitle className="text-2xl tabular-nums text-emerald-600 dark:text-emerald-400">
                {sum("verified")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>ترجمة آلية</CardDescription>
              <CardTitle className="text-2xl tabular-nums text-sky-600 dark:text-sky-400">
                {sum("auto")}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>بانتظار الترجمة</CardDescription>
              <CardTitle className="text-2xl tabular-nums text-amber-600 dark:text-amber-400">
                {sum("pending")}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue placeholder="النوع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {Object.entries(TYPE_AR).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-40"><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="auto">آلية (للمراجعة)</SelectItem>
                  <SelectItem value="verified">معتمدة</SelectItem>
                  <SelectItem value="pending">بانتظار الترجمة</SelectItem>
                </SelectContent>
              </Select>
              <form
                className="flex items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  setQ(qInput);
                  setPage(1);
                }}
              >
                <Input
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="بحث بالاسم الإنجليزي أو العربي…"
                  className="w-56"
                />
                <Button type="submit" variant="outline" size="icon">
                  <Search className="h-4 w-4" />
                </Button>
              </form>
              <span className="mr-auto text-xs text-muted-foreground tabular-nums">
                {total} صفًّا — الأكثر ظهورًا أولًا
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">لا نتائج بهذه الفلاتر</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-right text-xs text-muted-foreground">
                      <th className="py-2 pl-2 font-medium">النوع</th>
                      <th className="py-2 pl-2 font-medium">الاسم من المزوّد</th>
                      <th className="py-2 pl-2 font-medium">التعريب</th>
                      <th className="py-2 pl-2 font-medium">الحالة</th>
                      <th className="py-2 pl-2 font-medium">الظهور</th>
                      <th className="py-2 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const draft = drafts[row.id] ?? row.arabic;
                      const dirty = draft !== row.arabic;
                      const st = STATUS_AR[row.status] ?? STATUS_AR.auto;
                      return (
                        <tr key={row.id} className="border-b last:border-0 hover:bg-muted/40">
                          <td className="py-2 pl-2 whitespace-nowrap">
                            <Badge variant="outline">{TYPE_AR[row.entityType] ?? row.entityType}</Badge>
                          </td>
                          <td className="py-2 pl-2 max-w-52 truncate" dir="ltr" title={row.source}>
                            {row.source}
                          </td>
                          <td className="py-2 pl-2">
                            <Input
                              value={draft}
                              onChange={(e) =>
                                setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                              }
                              className={`h-8 min-w-44 ${dirty ? "border-primary" : ""}`}
                            />
                          </td>
                          <td className="py-2 pl-2 whitespace-nowrap">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>
                              {st.label}
                            </span>
                          </td>
                          <td className="py-2 pl-2 tabular-nums text-muted-foreground">{row.hits}</td>
                          <td className="py-2 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant={dirty || row.status !== "verified" ? "default" : "ghost"}
                                className="h-7 px-2 text-xs"
                                disabled={patchMutation.isPending || (!dirty && row.status === "verified")}
                                onClick={() =>
                                  patchMutation.mutate({
                                    id: row.id,
                                    body: dirty
                                      ? { arabic: draft, status: "verified" }
                                      : { status: "verified" },
                                  })
                                }
                              >
                                <Check className="ml-1 h-3.5 w-3.5" />
                                {dirty ? "حفظ واعتماد" : "اعتماد"}
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(row.id)}
                                title="حذف — يُعاد حلّه تلقائيًا لاحقًا"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  السابق
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  التالي
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
