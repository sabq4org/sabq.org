import { QuickActionCard } from "./QuickActionCard";
import {
  Newspaper,
  CheckSquare,
  TrendingUp,
  Blocks,
  Zap,
} from "lucide-react";
import { useAuth, hasAnyPermission } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      title: "إضافة خبر",
      description: "إنشاء خبر جديد",
      icon: Newspaper,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBgColor: "bg-emerald-100 dark:bg-emerald-900/50",
      href: "/dashboard/article/new",
      testId: "quick-action-add-article",
      permissions: ["articles.create"],
    },
    {
      id: "add-task",
      title: "إضافة مهمة",
      description: "مهمة جديدة للفريق",
      icon: CheckSquare,
      iconColor: "text-indigo-600 dark:text-indigo-400",
      iconBgColor: "bg-indigo-100 dark:bg-indigo-900/50",
      href: "/dashboard/tasks",
      testId: "quick-action-add-task",
      permissions: ["tasks.manage"],
    },
    {
      id: "add-analysis",
      title: "تحليل عميق",
      description: "تحليل بالذكاء الاصطناعي",
      icon: TrendingUp,
      iconColor: "text-purple-600 dark:text-purple-400",
      iconBgColor: "bg-purple-100 dark:bg-purple-900/50",
      href: "/dashboard/ai/deep",
      testId: "quick-action-add-analysis",
      permissions: ["analysis.create", "omq.create"],
    },
    {
      id: "add-block",
      title: "بلوك ذكي",
      description: "محتوى قابل للاستخدام",
      icon: Blocks,
      iconColor: "text-cyan-600 dark:text-cyan-400",
      iconBgColor: "bg-cyan-100 dark:bg-cyan-900/50",
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
    <Card className="h-full overflow-visible border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-transparent" data-testid="section-quick-actions">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span>إجراءات سريعة</span>
            <p className="text-xs font-normal text-muted-foreground mt-0.5">
              إضافة محتوى جديد بنقرة واحدة
            </p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
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
