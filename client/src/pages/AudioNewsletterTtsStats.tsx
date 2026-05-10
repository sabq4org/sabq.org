import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, DollarSign, FileText, Clock, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth, hasRole } from "@/hooks/useAuth";

type Provider = "openai" | "elevenlabs" | "google";

interface Stats {
  days: number;
  byProvider: Array<{
    provider: Provider;
    count: number;
    successCount: number;
    successRate: number;
    totalChars: number;
    estimatedCostUsd: number;
    avgDurationMs: number;
  }>;
  totals: { count: number; totalChars: number; estimatedCostUsd: number };
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI (gpt-4o-mini-tts)",
  elevenlabs: "ElevenLabs",
  google: "Google Cloud TTS",
};

export default function AudioNewsletterTtsStats() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const [days, setDays] = useState("30");

  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["/api/audio-newsletters/tts-usage-stats", { days }],
  });

  if (isUserLoading || !user) return <DashboardLayout><Skeleton className="h-96" /></DashboardLayout>;
  if (!hasRole(user, "admin", "system_admin")) {
    return (
      <DashboardLayout>
        <Card><CardHeader><CardTitle>غير مصرح</CardTitle></CardHeader>
          <CardContent>هذه الصفحة متاحة للمدراء فقط.</CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-tts-stats">إحصائيات استخدام TTS</h1>
              <p className="text-sm text-muted-foreground mt-1">
                مقارنة استخدام المزودين الثلاثة، التكلفة، نسبة النجاح ومتوسط زمن التوليد
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">المدة</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[150px]" data-testid="select-stats-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">آخر 7 أيام</SelectItem>
                <SelectItem value="30">آخر 30 يوم</SelectItem>
                <SelectItem value="90">آخر 90 يوم</SelectItem>
                <SelectItem value="365">آخر سنة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-4">
              <Card data-testid="card-totals-count">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> إجمالي الطلبات
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{(data?.totals.count || 0).toLocaleString("ar-SA")}</p>
                </CardContent>
              </Card>
              <Card data-testid="card-totals-chars">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <FileText className="h-4 w-4" /> إجمالي الأحرف
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{(data?.totals.totalChars || 0).toLocaleString("ar-SA")}</p>
                </CardContent>
              </Card>
              <Card data-testid="card-totals-cost">
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" /> التكلفة التقديرية
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">${(data?.totals.estimatedCostUsd || 0).toFixed(4)}</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {(["openai", "elevenlabs", "google"] as Provider[]).map(name => {
                const row = data?.byProvider.find(r => r.provider === name);
                return (
                  <Card key={name} data-testid={`card-provider-stats-${name}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">{PROVIDER_LABELS[name]}</CardTitle>
                      <CardDescription>
                        {row ? `${row.count.toLocaleString("ar-SA")} طلب` : "لا يوجد استخدام"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" /> نسبة النجاح
                        </span>
                        <Badge variant={row && row.successRate >= 95 ? "default" : row && row.successRate >= 80 ? "secondary" : "destructive"}>
                          {row ? `${row.successRate.toFixed(1)}%` : "—"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-4 w-4" /> متوسط الزمن
                        </span>
                        <span className="font-medium">
                          {row ? `${(row.avgDurationMs / 1000).toFixed(2)} ث` : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <FileText className="h-4 w-4" /> الأحرف
                        </span>
                        <span className="font-medium">
                          {row ? row.totalChars.toLocaleString("ar-SA") : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-4 w-4" /> التكلفة
                        </span>
                        <span className="font-medium">
                          {row ? `$${row.estimatedCostUsd.toFixed(4)}` : "—"}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
