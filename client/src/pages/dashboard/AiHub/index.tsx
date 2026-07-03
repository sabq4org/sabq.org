// AI Hub — central control panel for all AI usage (issue #589, Phase 2).
// Overview / Features / Models / Logs. Design: "editorial light" (approved
// mockup B) with full dark-mode support via theme tokens.

import { lazy, Suspense, useState } from "react";
import { BrainCircuit, LayoutDashboard, ListChecks, ScrollText, Server } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth, hasPermission } from "@/hooks/useAuth";

const OverviewTab = lazy(() => import("./OverviewTab"));
const FeaturesTab = lazy(() => import("./FeaturesTab"));
const ModelsTab = lazy(() => import("./ModelsTab"));
const LogsTab = lazy(() => import("./LogsTab"));

function TabLoader() {
  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

export default function AiHubPage() {
  const { user, isLoading } = useAuth();
  const [tab, setTab] = useState("overview");

  if (isLoading) {
    return (
      <DashboardLayout>
        <TabLoader />
      </DashboardLayout>
    );
  }

  if (!hasPermission(user, "ai_hub.view")) {
    return (
      <DashboardLayout>
        <Card className="max-w-lg mx-auto mt-16">
          <CardContent className="py-10 text-center space-y-2">
            <BrainCircuit className="w-10 h-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-bold">مركز التحكم بالذكاء الاصطناعي</h2>
            <p className="text-sm text-muted-foreground">لا تملك صلاحية الوصول إلى هذه الصفحة</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-5 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/25">
                <BrainCircuit className="w-5 h-5" />
              </span>
              مركز التحكم بالذكاء الاصطناعي
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              إدارة موحّدة للنماذج والاستهلاك والتحويل التلقائي — كل استدعاء AI في سبق يمر من هنا
            </p>
          </div>
        </div>

        {/* Radix defaults to dir="ltr" on its root regardless of document dir —
            without this prop the whole tabs subtree renders LTR. */}
        <Tabs value={tab} onValueChange={setTab} dir="rtl" className="space-y-4">
          <TabsList className="bg-card border shadow-sm p-1 h-auto rounded-xl">
            <TabsTrigger value="overview" className="gap-2 rounded-lg px-4 py-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <LayoutDashboard className="w-4 h-4" />
              نظرة عامة
            </TabsTrigger>
            <TabsTrigger value="features" className="gap-2 rounded-lg px-4 py-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <ListChecks className="w-4 h-4" />
              الميزات
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-2 rounded-lg px-4 py-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Server className="w-4 h-4" />
              النماذج والمزودون
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2 rounded-lg px-4 py-2 data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <ScrollText className="w-4 h-4" />
              السجل
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Suspense fallback={<TabLoader />}>{tab === "overview" && <OverviewTab />}</Suspense>
          </TabsContent>
          <TabsContent value="features">
            <Suspense fallback={<TabLoader />}>{tab === "features" && <FeaturesTab />}</Suspense>
          </TabsContent>
          <TabsContent value="models">
            <Suspense fallback={<TabLoader />}>{tab === "models" && <ModelsTab />}</Suspense>
          </TabsContent>
          <TabsContent value="logs">
            <Suspense fallback={<TabLoader />}>{tab === "logs" && <LogsTab />}</Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
