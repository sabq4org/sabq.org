import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, ClipboardList, PenLine, Plus } from "lucide-react";

type SurveyListItem = {
  id: string;
  title: string;
  purpose: string | null;
  status: "draft" | "active" | "closed";
  sentAt: string | null;
  createdAt: string;
  invitedCount: number;
  completedCount: number;
  questionsCount: number;
};

const STATUS_LABELS: Record<SurveyListItem["status"], { label: string; variant: "secondary" | "default" | "outline" }> = {
  draft: { label: "مسودة", variant: "secondary" },
  active: { label: "نشط", variant: "default" },
  closed: { label: "مغلق", variant: "outline" },
};

export default function Surveys() {
  const { data: surveysRaw, isLoading } = useQuery({ queryKey: ["/api/surveys"] });
  const surveys: SurveyListItem[] = Array.isArray(surveysRaw) ? surveysRaw : [];

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl mx-auto" dir="rtl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6 text-primary" />
              استطلاعات الرأي
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              استبيانات موجّهة برابط شخصي لكل مدعو — للكتّاب وأي فريق آخر
            </p>
          </div>
          <Link href="/dashboard/surveys/new">
            <Button data-testid="button-new-survey">
              <Plus className="w-4 h-4 ml-1" />
              استطلاع جديد
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((index) => <Skeleton key={index} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : surveys.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-bold mb-1">لا توجد استطلاعات بعد</p>
              <p className="text-sm text-muted-foreground mb-5">
                ابدأ باستطلاع لكتّاب الرأي: أسئلة قصيرة، رابط شخصي لكل كاتب، وتحليل ذكي للإجابات.
              </p>
              <Link href="/dashboard/surveys/new">
                <Button>إنشاء أول استطلاع</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {surveys.map((survey) => {
              const status = STATUS_LABELS[survey.status] ?? STATUS_LABELS.draft;
              const questionsCount = Number(survey.questionsCount) || 0;
              const invitedCount = Number(survey.invitedCount) || 0;
              const completedCount = Number(survey.completedCount) || 0;
              const completionRate = invitedCount > 0
                ? Math.round((completedCount / invitedCount) * 100)
                : 0;
              return (
                <Card key={survey.id} data-testid={`survey-row-${survey.id}`}>
                  <CardContent className="py-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-[220px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold">{survey.title}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                        <span>{questionsCount} أسئلة</span>
                        {survey.status !== "draft" && (
                          <>
                            <span>{invitedCount} مدعو</span>
                            <span>{completedCount} إجابة ({completionRate}٪)</span>
                          </>
                        )}
                        {survey.purpose && <span>الهدف: {survey.purpose}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {survey.status !== "draft" && (
                        <Link href={`/dashboard/surveys/${survey.id}/results`}>
                          <Button variant="outline" size="sm">
                            <BarChart3 className="w-4 h-4 ml-1" />
                            النتائج والتحليل
                          </Button>
                        </Link>
                      )}
                      <Link href={`/dashboard/surveys/${survey.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          <PenLine className="w-4 h-4 ml-1" />
                          {survey.status === "draft" ? "تحرير وإرسال" : "الإعدادات"}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
