import { QuickActionCard } from "./QuickActionCard";
import {
  Newspaper,
  CheckSquare,
  TrendingUp,
  Blocks,
  Zap,
} from "lucide-react";
import { useAuth, hasAnyPermission } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: typeof Newspaper;
  iconColor: string;
  iconBgColor: string;
  href: string;
  testId: string;
  permissions: string[];
}

export function QuickActionsSection() {
  const { user } = useAuth();

  const allActions: QuickAction[] = [
    {
      id: "add-article",
      title: "إضافة خبر جديد",
      description: "تحرير ونشر مادة صحفية",
      icon: Newspaper,
      iconColor: "text-primary",
      iconBgColor: "bg-primary/10 border-primary/20",
      href: "/dashboard/article/new",
      testId: "quick-action-add-article",
      permissions: ["articles.create"],
    },
    {
      id: "add-task",
      title: "إسناد مهمة",
      description: "مهمة جديدة لفريق التحرير",
      icon: CheckSquare,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBgColor: "bg-emerald-500/10 border-emerald-500/20",
      href: "/dashboard/tasks",
      testId: "quick-action-add-task",
      permissions: ["tasks.manage"],
    },
    {
      id: "add-analysis",
      title: "تحليل عميق",
      description: "توليد تحليل معمق بالذكاء الاصطناعي",
      icon: TrendingUp,
      iconColor: "text-violet-600 dark:text-violet-400",
      iconBgColor: "bg-violet-500/10 border-violet-500/20",
      href: "/dashboard/ai/deep",
      testId: "quick-action-add-analysis",
      permissions: ["analysis.create", "omq.create"],
    },
    {
      id: "add-block",
      title: "بلوك ذكي",
      description: "إدارة قوالب العرض الذكية",
      icon: Blocks,
      iconColor: "text-amber-600 dark:text-amber-400",
      iconBgColor: "bg-amber-500/10 border-amber-500/20",
      href: "/dashboard/smart-blocks",
      testId: "quick-action-add-block",
      permissions: ["blocks.manage"],
    },
  ];

  const visibleActions = allActions.filter((action) =>
    hasAnyPermission(user, ...action.permissions)
  );

  if (visibleActions.length === 0) {
    return null;
  }

  return (
    <Card className="h-full overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm" data-testid="section-quick-actions">
      <CardHeader className="pb-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-base font-bold">إجراءات غرفة الأخبار السريعة</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              إطلاق المهام التحريرية والذكية بنقرة واحدة
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {visibleActions.map((action) => (
            <QuickActionCard
              key={action.id}
              title={action.title}
              description={action.description}
              icon={action.icon}
              iconColor={action.iconColor}
              iconBgColor={action.iconBgColor}
              href={action.href}
              testId={action.testId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
