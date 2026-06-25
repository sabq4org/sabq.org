/**
 * أخبار SportMonks في لوحة التحكم — استعراض واستيراد كمسودّات عربية.
 *
 * يتصفّح المحرّر معاينات المباريات القادمة أو تقارير ما بعد المباراة من
 * SportMonks، يعاينها، ويستورد المختار. كل مادة تمرّ على محرّر سبق (ترجمة +
 * إعادة صياغة) وتُحفظ مسودّة في المقالات. كل شيء عبر /api/admin/sportmonks-news/*.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trophy,
  RefreshCw,
  Download,
  CheckCircle2,
  XCircle,
  Globe,
  CalendarClock,
} from "lucide-react";
import type { Category } from "@shared/schema";

type SmKind = "prematch" | "postmatch";

interface SmNewsListItem {
  id: number;
  fixtureId: number;
  kind: SmKind;
  title: string;
  matchName: string;
  matchNameAr: string;
  kickoff: string | null;
  kickoffLabel: string;
  leagueName: string;
  resultInfo: string | null;
  isArab: boolean;
  isSaudi: boolean;
  alreadyImported: boolean;
}

interface SmStatus {
  configured: boolean;
  connected: boolean;
  prematchCount: number;
  postmatchCount: number;
  error?: string;
}

export default function SportmonksNewsImporter() {
  const { toast } = useToast();
  const [kind, setKind] = useState<SmKind>("prematch");
  const [categoryId, setCategoryId] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // حالة الخدمة
  const { data: status } = useQuery<SmStatus>({
    queryKey: ["/api/admin/sportmonks-news/status"],
  });

  // أقسام سبق (وجهة الاستيراد — اختياري، الافتراضي الرياضة)
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const sabqCategories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // الأخبار المتاحة للنوع الحالي
  const {
    data: newsData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<{ kind: SmKind; items: SmNewsListItem[] }>({
    queryKey: ["/api/admin/sportmonks-news/news", { kind }],
  });
  const items = useMemo(
    () => (Array.isArray(newsData?.items) ? newsData!.items : []),
    [newsData]
  );

  const importable = items.filter((i) => !i.alreadyImported);
  const allSelected = importable.length > 0 && selected.size === importable.length;
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(importable.map((i) => i.id)));
  };
  const toggleOne = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const importMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ imported: number; skipped: number; failed: number }>(
        "/api/admin/sportmonks-news/import",
        {
          method: "POST",
          body: JSON.stringify({
            kind,
            ids: Array.from(selected),
            ...(categoryId ? { categoryId } : {}),
          }),
          headers: { "Content-Type": "application/json" },
        }
      ),
    onSuccess: (res) => {
      toast({
        title: "تم الاستيراد",
        description: `أُضيفت ${res?.imported ?? 0} مسودّة${
          res?.skipped ? ` · تُخطّيت ${res.skipped} مكرّرة` : ""
        }${res?.failed ? ` · فشلت ${res.failed}` : ""}`,
      });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sportmonks-news/news", { kind }] });
    },
    onError: (e: any) => {
      toast({
        title: "فشل الاستيراد",
        description: e?.message || "تعذّر استيراد المواد",
        variant: "destructive",
      });
    },
  });

  const canImport = selected.size > 0 && !importMutation.isPending;

  const switchKind = (k: SmKind) => {
    setKind(k);
    setSelected(new Set());
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* الترويسة + الحالة */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Trophy className="h-5 w-5 text-primary" />
                  أخبار SportMonks (المونديال)
                </CardTitle>
                <CardDescription className="mt-1">
                  معاينات وتقارير المباريات من SportMonks — تُترجم وتُعاد صياغتها بأسلوب سبق وتُحفظ
                  مسودّات للمراجعة.
                </CardDescription>
              </div>
              {status ? (
                status.connected ? (
                  <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> متصل · {status.prematchCount} معاينة ·{" "}
                    {status.postmatchCount} تقرير
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-red-300 text-red-700">
                    <XCircle className="h-3.5 w-3.5" />
                    {status.configured ? "تعذّر الاتصال" : "غير مهيأة"}
                  </Badge>
                )
              ) : (
                <Skeleton className="h-6 w-24" />
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* النوع: معاينات/تقارير */}
              <div className="space-y-2">
                <Label>نوع المادة</Label>
                <div className="flex rounded-md border p-0.5">
                  {(
                    [
                      { k: "prematch", label: "معاينات (قبل المباراة)" },
                      { k: "postmatch", label: "تقارير (بعد المباراة)" },
                    ] as { k: SmKind; label: string }[]
                  ).map(({ k, label }) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => switchKind(k)}
                      className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition ${
                        kind === k
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                      data-testid={`button-sm-kind-${k}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* قسم الوجهة في سبق (اختياري) */}
              <div className="space-y-2">
                <Label>قسم الوجهة في سبق (اختياري — الافتراضي: الرياضة)</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger data-testid="select-sabq-category">
                    <SelectValue placeholder="القسم الرياضي (افتراضي)" />
                  </SelectTrigger>
                  <SelectContent>
                    {sabqCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nameAr || c.nameEn || c.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* شريط الإجراءات */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    disabled={importable.length === 0}
                    data-testid="checkbox-sm-select-all"
                  />
                  تحديد الكل
                </label>
                <span className="text-sm text-muted-foreground">
                  محدّد: {selected.size} / {importable.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  data-testid="button-sm-refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                  تحديث
                </Button>
              </div>
              <Button
                onClick={() => importMutation.mutate()}
                disabled={!canImport}
                data-testid="button-sm-import"
              >
                <Download className="h-4 w-4" />
                {importMutation.isPending
                  ? "جارٍ التوليد والاستيراد…"
                  : `استيراد المختار (${selected.size})`}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              كل مسودّة تُولّد بالذكاء الاصطناعي (Sonnet 4.6) ترجمةً وصياغةً — قد يستغرق الاستيراد
              ثوانيَ لكل مادة.
            </p>
          </CardContent>
        </Card>

        {/* قائمة المواد */}
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Globe className="h-8 w-8" />
                لا توجد {kind === "prematch" ? "معاينات" : "تقارير"} متاحة حاليًا.
              </CardContent>
            </Card>
          ) : (
            items.map((a) => {
              const isSel = selected.has(a.id);
              const disabled = a.alreadyImported;
              return (
                <Card
                  key={a.id}
                  className={`transition ${
                    disabled
                      ? "opacity-60"
                      : `cursor-pointer ${
                          isSel
                            ? "border-primary ring-1 ring-primary"
                            : "hover:border-muted-foreground/30"
                        }`
                  }`}
                  onClick={() => !disabled && toggleOne(a.id)}
                  data-testid={`card-sm-news-${a.id}`}
                >
                  <CardContent className="flex items-start gap-3 p-3">
                    <Checkbox
                      checked={isSel}
                      disabled={disabled}
                      onCheckedChange={() => toggleOne(a.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold leading-snug">{a.matchNameAr}</h3>
                        {a.isSaudi ? (
                          <Badge className="h-4 bg-green-600 px-1.5 text-[10px] hover:bg-green-600">
                            الأخضر
                          </Badge>
                        ) : a.isArab ? (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            عربي
                          </Badge>
                        ) : null}
                        {a.alreadyImported && (
                          <Badge variant="outline" className="h-4 border-blue-300 px-1.5 text-[10px] text-blue-700">
                            مستوردة
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{a.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {a.kickoffLabel && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" /> {a.kickoffLabel}
                          </span>
                        )}
                        {a.resultInfo && (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                            {a.resultInfo}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
