import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { 
  Settings, 
  BookTemplate, 
  Workflow, 
  CheckCircle2, 
  Lightbulb,
  Calendar,
  TrendingUp,
  DollarSign 
} from "lucide-react";
import AiPreferencesTab from "./tabs/AiPreferencesTab";
// @ts-ignore
import ContentTemplatesTab from "./tabs/ContentTemplatesTab";
// @ts-ignore
import WorkflowRulesTab from "./tabs/WorkflowRulesTab";
// @ts-ignore
import QualityChecksTab from "./tabs/QualityChecksTab";
// @ts-ignore
import StrategyInsightsTab from "./tabs/StrategyInsightsTab";
// @ts-ignore
import EditorialCalendarTab from "./tabs/EditorialCalendarTab";
// @ts-ignore
import PerformanceAnalyticsTab from "./tabs/PerformanceAnalyticsTab";
// @ts-ignore
import BudgetManagerTab from "./tabs/BudgetManagerTab";

export default function AIManagementDashboard() {
  const [activeTab, setActiveTab] = useState("preferences");

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-ai-management">
          نظام إدارة الذكاء الاصطناعي
        </h1>
        <p className="text-muted-foreground">
          إعدادات وتحكم شامل في الذكاء الاصطناعي لإنتاج المحتوى
        </p>
      </div>

      {/* Main Dashboard */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 gap-2 bg-background p-2 h-auto">
          <TabsTrigger 
            value="preferences" 
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-preferences"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">الإعدادات</span>
          </TabsTrigger>

          <TabsTrigger 
            value="templates"
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-templates"
          >
            <BookTemplate className="w-4 h-4" />
            <span className="hidden sm:inline">القوالب</span>
          </TabsTrigger>

          <TabsTrigger 
            value="workflows"
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-workflows"
          >
            <Workflow className="w-4 h-4" />
            <span className="hidden sm:inline">القواعد</span>
          </TabsTrigger>

          <TabsTrigger 
            value="quality"
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-quality"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span className="hidden sm:inline">الجودة</span>
          </TabsTrigger>

          <TabsTrigger 
            value="strategy"
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-strategy"
          >
            <Lightbulb className="w-4 h-4" />
            <span className="hidden sm:inline">الاستراتيجية</span>
          </TabsTrigger>

          <TabsTrigger 
            value="calendar"
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-calendar"
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">التقويم</span>
          </TabsTrigger>

          <TabsTrigger 
            value="performance"
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-performance"
          >
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">الأداء</span>
          </TabsTrigger>

          <TabsTrigger 
            value="budget"
            className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            data-testid="tab-budget"
          >
            <DollarSign className="w-4 h-4" />
            <span className="hidden sm:inline">الميزانية</span>
          </TabsTrigger>
        </TabsList>

        {/* AI Preferences Tab */}
        <TabsContent value="preferences">
          <AiPreferencesTab />
        </TabsContent>

        {/* Content Templates Tab */}
        <TabsContent value="templates">
          <ContentTemplatesTab />
        </TabsContent>

        {/* Workflow Rules Tab */}
        <TabsContent value="workflows">
          <WorkflowRulesTab />
        </TabsContent>

        {/* Quality Checks Tab */}
        <TabsContent value="quality">
          <QualityChecksTab />
        </TabsContent>

        {/* Strategy Insights Tab */}
        <TabsContent value="strategy">
          <StrategyInsightsTab />
        </TabsContent>

        {/* Editorial Calendar Tab */}
        <TabsContent value="calendar">
          <EditorialCalendarTab />
        </TabsContent>

        {/* Performance Analytics Tab */}
        <TabsContent value="performance">
          <PerformanceAnalyticsTab />
        </TabsContent>

        {/* Budget Manager Tab */}
        <TabsContent value="budget">
          <BudgetManagerTab />
        </TabsContent>
      </Tabs>
        </div>
      </ScrollArea>
    </IFoxLayout>
  );
}
