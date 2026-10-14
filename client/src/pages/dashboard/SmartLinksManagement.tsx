import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Link2,
  Database,
  Tag,
  ExternalLink,
  CheckCircle2,
  TrendingUp,
  Layers,
  X,
  Globe,
  Sparkles,
  Hash,
  ArrowUpRight,
} from "lucide-react";
import type { InsertEntityTypeDb, InsertSmartEntityDb, InsertSmartTermDb } from "@shared/schema";

interface EntityType {
  id: number;
  nameAr: string;
  nameEn: string;
  slug: string;
  description: string | null;
  status?: string | null;
  displayOrder?: number | null;
}

interface SmartEntity {
  id: string;
  name: string;
  typeId: number;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  aliases: string[];
  importanceScore?: number | null;
  status?: string | null;
  usageCount?: number | null;
  metadata?: {
    birthDate?: string;
    position?: string;
    organization?: string;
    location?: string;
    website?: string;
    social?: {
      twitter?: string;
      linkedin?: string;
      instagram?: string;
    };
  };
  entityTypeName?: string;
}

interface SmartTerm {
  id: string;
  term: string;
  description: string | null;
  category: string | null;
  status?: string | null;
  usageCount?: number | null;
  aliases?: string[] | null;
}

function getPriorityInfo(score?: number | null) {
  const val = typeof score === "number" ? score : 0.5;
  const pct = Math.round(Math.max(0, Math.min(1, val)) * 100);
  if (val >= 0.75) {
    return {
      label: "أولوية عالية",
      pct,
      badgeClass:
        "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
      barClass: "bg-amber-500",
    };
  }
  if (val >= 0.45) {
    return {
      label: "أولوية متوسطة",
      pct,
      badgeClass:
        "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300",
      barClass: "bg-sky-500",
    };
  }
  return {
    label: "أولوية عادية",
    pct,
    badgeClass:
      "border-border bg-muted/60 text-muted-foreground",
    barClass: "bg-muted-foreground/60",
  };
}

export default function SmartLinksManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("entity-types");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [termCategoryFilter, setTermCategoryFilter] = useState<string>("all");

  // Entity Types state
  const [entityTypeDialogOpen, setEntityTypeDialogOpen] = useState(false);
  const [editingEntityType, setEditingEntityType] = useState<EntityType | null>(null);
  const [deleteEntityTypeId, setDeleteEntityTypeId] = useState<number | null>(null);

  // Smart Entities state
  const [entityDialogOpen, setEntityDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<SmartEntity | null>(null);
  const [deleteEntityId, setDeleteEntityId] = useState<string | null>(null);

  // Smart Terms state
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [editingTerm, setEditingTerm] = useState<SmartTerm | null>(null);
  const [deleteTermId, setDeleteTermId] = useState<string | null>(null);

  // Fetch Entity Types
  const { data: entityTypesRaw, isLoading: entityTypesLoading } = useQuery<EntityType[]>({
    queryKey: ["/api/entity-types"],
  });
  const entityTypes = Array.isArray(entityTypesRaw) ? entityTypesRaw : [];

  // Fetch Smart Entities
  const { data: smartEntitiesRaw, isLoading: entitiesLoading } = useQuery<SmartEntity[]>({
    queryKey: ["/api/smart-entities"],
  });
  const smartEntities = Array.isArray(smartEntitiesRaw) ? smartEntitiesRaw : [];

  // Fetch Smart Terms
  const { data: smartTermsRaw, isLoading: termsLoading } = useQuery<SmartTerm[]>({
    queryKey: ["/api/smart-terms"],
  });
  const smartTerms = Array.isArray(smartTermsRaw) ? smartTermsRaw : [];

  const entityTypeMap = useMemo(() => {
    const map = new Map<number, EntityType>();
    entityTypes.forEach((t) => map.set(t.id, t));
    return map;
  }, [entityTypes]);

  const entityCountByType = useMemo(() => {
    const counts = new Map<number, number>();
    smartEntities.forEach((e) => {
      counts.set(e.typeId, (counts.get(e.typeId) || 0) + 1);
    });
    return counts;
  }, [smartEntities]);

  const termCategories = useMemo(() => {
    const set = new Set<string>();
    smartTerms.forEach((t) => {
      if (t.category && t.category.trim()) set.add(t.category.trim());
    });
    return Array.from(set);
  }, [smartTerms]);

  // KPI calculations
  const kpiStats = useMemo(() => {
    const totalLinksAndTerms = smartEntities.length + smartTerms.length;
    const activeEntities = smartEntities.filter((e) => (e.status || "active") === "active").length;
    const inactiveEntities = smartEntities.length - activeEntities;
    const activeTerms = smartTerms.filter((t) => (t.status || "active") === "active").length;
    const inactiveTerms = smartTerms.length - activeTerms;
    const highPriorityEntities = smartEntities.filter((e) => (e.importanceScore ?? 0.5) >= 0.75).length;
    const entitiesWithAliases = smartEntities.filter((e) => Array.isArray(e.aliases) && e.aliases.length > 0).length;
    const categorizedTerms = smartTerms.filter((t) => Boolean(t.category && t.category.trim())).length;

    return {
      totalLinksAndTerms,
      activeEntities,
      inactiveEntities,
      activeTerms,
      inactiveTerms,
      totalActive: activeEntities + activeTerms,
      totalInactive: inactiveEntities + inactiveTerms,
      highPriorityEntities,
      entitiesWithAliases,
      categorizedTerms,
    };
  }, [smartEntities, smartTerms]);

  // Entity Type Mutations
  const createEntityTypeMutation = useMutation({
    mutationFn: async (data: InsertEntityTypeDb) => {
      return await apiRequest("/api/entity-types", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-types"] });
      setEntityTypeDialogOpen(false);
      toast({ title: "تم إنشاء نوع الكيان بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء إنشاء نوع الكيان", variant: "destructive" });
    },
  });

  const updateEntityTypeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertEntityTypeDb> }) => {
      return await apiRequest(`/api/entity-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-types"] });
      setEntityTypeDialogOpen(false);
      setEditingEntityType(null);
      toast({ title: "تم تحديث نوع الكيان بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء تحديث نوع الكيان", variant: "destructive" });
    },
  });

  const deleteEntityTypeMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/entity-types/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entity-types"] });
      setDeleteEntityTypeId(null);
      toast({ title: "تم حذف نوع الكيان بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء حذف نوع الكيان", variant: "destructive" });
    },
  });

  // Smart Entity Mutations
  const createEntityMutation = useMutation({
    mutationFn: async (data: InsertSmartEntityDb) => {
      return await apiRequest("/api/smart-entities", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-entities"] });
      setEntityDialogOpen(false);
      toast({ title: "تم إنشاء الكيان بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء إنشاء الكيان", variant: "destructive" });
    },
  });

  const updateEntityMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSmartEntityDb> }) => {
      return await apiRequest(`/api/smart-entities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-entities"] });
      setEntityDialogOpen(false);
      setEditingEntity(null);
      toast({ title: "تم تحديث الكيان بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء تحديث الكيان", variant: "destructive" });
    },
  });

  const deleteEntityMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/smart-entities/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-entities"] });
      setDeleteEntityId(null);
      toast({ title: "تم حذف الكيان بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء حذف الكيان", variant: "destructive" });
    },
  });

  // Smart Term Mutations
  const createTermMutation = useMutation({
    mutationFn: async (data: InsertSmartTermDb) => {
      return await apiRequest("/api/smart-terms", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-terms"] });
      setTermDialogOpen(false);
      toast({ title: "تم إنشاء المصطلح بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء إنشاء المصطلح", variant: "destructive" });
    },
  });

  const updateTermMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSmartTermDb> }) => {
      return await apiRequest(`/api/smart-terms/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-terms"] });
      setTermDialogOpen(false);
      setEditingTerm(null);
      toast({ title: "تم تحديث المصطلح بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء تحديث المصطلح", variant: "destructive" });
    },
  });

  const deleteTermMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/smart-terms/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smart-terms"] });
      setDeleteTermId(null);
      toast({ title: "تم حذف المصطلح بنجاح" });
    },
    onError: () => {
      toast({ title: "حدث خطأ أثناء حذف المصطلح", variant: "destructive" });
    },
  });

  // Filter data based on search and quick filter pills
  const q = searchQuery.trim().toLowerCase();

  const filteredEntityTypes = entityTypes.filter((type) => {
    const matchesSearch =
      !q ||
      type.nameAr.toLowerCase().includes(q) ||
      type.nameEn.toLowerCase().includes(q) ||
      type.slug.toLowerCase().includes(q) ||
      (type.description && type.description.toLowerCase().includes(q));
    const isActive = (type.status || "active") === "active";
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);
    return matchesSearch && matchesStatus;
  });

  const filteredEntities = smartEntities.filter((entity) => {
    const resolvedTypeName = entity.entityTypeName || entityTypeMap.get(entity.typeId)?.nameAr || "";
    const matchesSearch =
      !q ||
      entity.name.toLowerCase().includes(q) ||
      entity.slug.toLowerCase().includes(q) ||
      resolvedTypeName.toLowerCase().includes(q) ||
      (entity.description && entity.description.toLowerCase().includes(q)) ||
      (Array.isArray(entity.aliases) && entity.aliases.some((a) => a.toLowerCase().includes(q)));

    const isActive = (entity.status || "active") === "active";
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);

    const matchesType =
      entityTypeFilter === "all" || entity.typeId.toString() === entityTypeFilter;

    const score = entity.importanceScore ?? 0.5;
    const matchesPriority =
      priorityFilter === "all" ||
      (priorityFilter === "high" && score >= 0.75) ||
      (priorityFilter === "medium" && score >= 0.45 && score < 0.75) ||
      (priorityFilter === "low" && score < 0.45);

    return matchesSearch && matchesStatus && matchesType && matchesPriority;
  });

  const filteredTerms = smartTerms.filter((term) => {
    const matchesSearch =
      !q ||
      term.term.toLowerCase().includes(q) ||
      (term.category && term.category.toLowerCase().includes(q)) ||
      (term.description && term.description.toLowerCase().includes(q));

    const isActive = (term.status || "active") === "active";
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && isActive) ||
      (statusFilter === "inactive" && !isActive);

    const matchesCategory =
      termCategoryFilter === "all" ||
      (termCategoryFilter === "uncategorized" && !term.category?.trim()) ||
      term.category?.trim() === termCategoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        {/* Unified Editorial Header */}
        <DashboardPageHeader
          icon={Link2}
          title="الروابط الذكية والكيانات"
          description="إدارة منظومة الكيانات الذكية والمصطلحات التحريرية والربط التلقائي داخل الأخبار والمقالات."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveTab("terms");
                  setEditingTerm(null);
                  setTermDialogOpen(true);
                }}
                className="gap-1.5"
              >
                <Tag className="h-4 w-4 text-primary" />
                <span>مصطلح جديد</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setActiveTab("entities");
                  setEditingEntity(null);
                  setEntityDialogOpen(true);
                }}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>إضافة كيان ذكي</span>
              </Button>
            </div>
          }
        />

        {/* Top KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="kpi-strip-smart-links">
          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">إجمالي الروابط والمصطلحات</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                    {kpiStats.totalLinksAndTerms}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Link2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0">
                  {smartEntities.length} كيان
                </Badge>
                <span>·</span>
                <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0">
                  {smartTerms.length} مصطلح
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">الحالة (نشط / غير نشط)</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {kpiStats.totalActive}
                    </p>
                    <span className="text-xs text-muted-foreground">نشط</span>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                  ● {kpiStats.activeEntities} كيان نشط
                </span>
                <span>·</span>
                <span>{kpiStats.totalInactive} غير نشط</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">أنواع الكيانات</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                    {entityTypes.length}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Layers className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{kpiStats.entitiesWithAliases} كيان بمرادفات بحث</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">الأولوية والتصنيف</p>
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums">
                    {kpiStats.highPriorityEntities}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>كيان ذو أولوية عالية · {kpiStats.categorizedTerms} مصطلح مصنّف</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-5" dir="rtl">
          <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-card p-3 sm:p-4 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <TabsList className="grid h-auto w-full lg:w-auto grid-cols-3 gap-1 bg-muted/60 p-1" dir="rtl">
                <TabsTrigger
                  value="entity-types"
                  className="no-min-touch-size gap-1.5 py-2 px-3 text-xs sm:text-sm"
                  data-testid="tab-entity-types"
                >
                  <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span className="truncate">أنواع الكيانات</span>
                  <Badge variant="secondary" className="mr-1 h-5 px-1.5 text-[11px] tabular-nums">
                    {entityTypes.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="entities"
                  className="no-min-touch-size gap-1.5 py-2 px-3 text-xs sm:text-sm"
                  data-testid="tab-entities"
                >
                  <Link2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span className="truncate">الكيانات الذكية</span>
                  <Badge variant="secondary" className="mr-1 h-5 px-1.5 text-[11px] tabular-nums">
                    {smartEntities.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger
                  value="terms"
                  className="no-min-touch-size gap-1.5 py-2 px-3 text-xs sm:text-sm"
                  data-testid="tab-terms"
                >
                  <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                  <span className="truncate">المصطلحات</span>
                  <Badge variant="secondary" className="mr-1 h-5 px-1.5 text-[11px] tabular-nums">
                    {smartTerms.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Search Bar */}
              <div className="relative flex-1 max-w-full lg:max-w-md">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث بالاسم، المعرّف (Slug)، المرادفات أو الوصف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-9 pl-9 h-9 sm:h-10 text-sm"
                  data-testid="input-search"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
              <span className="text-xs font-medium text-muted-foreground ml-1">الحالة:</span>
              {(
                [
                  { id: "all", label: "الكل" },
                  { id: "active", label: "نشط" },
                  { id: "inactive", label: "غير نشط" },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  className={`no-min-touch-size inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === pill.id
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {pill.label}
                </button>
              ))}

              {activeTab === "entities" && (
                <>
                  <span className="mx-1 h-4 w-px bg-border/70 hidden sm:inline-block" />
                  <span className="text-xs font-medium text-muted-foreground ml-1">النوع:</span>
                  <button
                    type="button"
                    onClick={() => setEntityTypeFilter("all")}
                    className={`no-min-touch-size inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      entityTypeFilter === "all"
                        ? "bg-sky-600 text-white"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    الكل ({smartEntities.length})
                  </button>
                  {entityTypes.map((type) => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setEntityTypeFilter(type.id.toString())}
                      className={`no-min-touch-size inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        entityTypeFilter === type.id.toString()
                          ? "bg-sky-600 text-white"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span>{type.nameAr}</span>
                      <span className="opacity-75 tabular-nums">({entityCountByType.get(type.id) || 0})</span>
                    </button>
                  ))}

                  <span className="mx-1 h-4 w-px bg-border/70 hidden sm:inline-block" />
                  <span className="text-xs font-medium text-muted-foreground ml-1">الأولوية:</span>
                  {(
                    [
                      { id: "all", label: "الكل" },
                      { id: "high", label: "عالية" },
                      { id: "medium", label: "متوسطة" },
                      { id: "low", label: "عادية" },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriorityFilter(p.id)}
                      className={`no-min-touch-size inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        priorityFilter === p.id
                          ? "bg-amber-600 text-white"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </>
              )}

              {activeTab === "terms" && termCategories.length > 0 && (
                <>
                  <span className="mx-1 h-4 w-px bg-border/70 hidden sm:inline-block" />
                  <span className="text-xs font-medium text-muted-foreground ml-1">الفئة:</span>
                  <button
                    type="button"
                    onClick={() => setTermCategoryFilter("all")}
                    className={`no-min-touch-size inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      termCategoryFilter === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    كل الفئات
                  </button>
                  {termCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTermCategoryFilter(cat)}
                      className={`no-min-touch-size inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        termCategoryFilter === cat
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Entity Types Tab */}
          <TabsContent value="entity-types" className="space-y-4 mt-0">
            <Card className="border-border/70 shadow-xs">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Database className="h-5 w-5 text-primary" />
                      أنواع الكيانات ({filteredEntityTypes.length})
                    </CardTitle>
                    <CardDescription className="mt-1">
                      إدارة التصنيفات الأساسية للكيانات المستخدمة في نظام الروابط الذكية
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingEntityType(null);
                      setEntityTypeDialogOpen(true);
                    }}
                    className="gap-2 w-full sm:w-auto"
                    data-testid="button-add-entity-type"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة نوع جديد
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {entityTypesLoading ? (
                  <div className="text-center py-12 text-muted-foreground">جاري تحميل أنواع الكيانات...</div>
                ) : filteredEntityTypes.length === 0 ? (
                  <div className="text-center py-12 px-4 text-muted-foreground space-y-2">
                    <Database className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="font-medium text-foreground">لا توجد أنواع كيانات مطابقة</p>
                    <p className="text-xs">جرّب تعديل معايير البحث أو أضف نوع كيان جديد.</p>
                  </div>
                ) : (
                  <Table dir="rtl" className="block md:table">
                    <TableHeader className="hidden md:table-header-group">
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-right">النوع (عربي / إنجليزي)</TableHead>
                        <TableHead className="text-right">معاينة الرابط / المعرّف</TableHead>
                        <TableHead className="text-right">الكيانات المرتبطة</TableHead>
                        <TableHead className="text-right">الوصف</TableHead>
                        <TableHead className="w-28 text-left">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="block md:table-row-group p-3 sm:p-0 space-y-3 md:space-y-0">
                      {filteredEntityTypes.map((type) => {
                        const linkedCount = entityCountByType.get(type.id) || 0;
                        const isActive = (type.status || "active") === "active";
                        return (
                          <TableRow
                            key={type.id}
                            className="flex flex-col md:table-row rounded-xl border border-border/70 md:rounded-none md:border-0 md:border-b p-4 md:p-0 bg-card hover:bg-muted/30 transition-colors gap-2.5 md:gap-0"
                          >
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <div className="flex items-center justify-between md:justify-start gap-2">
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                                    {type.nameAr.slice(0, 2)}
                                  </span>
                                  <div>
                                    <div className="font-semibold text-foreground flex items-center gap-2">
                                      <span>{type.nameAr}</span>
                                      <Badge
                                        variant="outline"
                                        className={
                                          isActive
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 text-[10px] px-1.5 py-0"
                                            : "text-[10px] px-1.5 py-0"
                                        }
                                      >
                                        {isActive ? "نشط" : "غير نشط"}
                                      </Badge>
                                    </div>
                                    <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                                      {type.nameEn}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <div className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-mono text-muted-foreground" dir="ltr">
                                <Link2 className="h-3 w-3 text-primary shrink-0" />
                                <span>/entity-type/{type.slug}</span>
                              </div>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <Badge variant="secondary" className="gap-1 font-normal">
                                <span className="font-semibold tabular-nums">{linkedCount}</span>
                                <span>كيان ذكي</span>
                              </Badge>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 md:p-4 text-muted-foreground text-right text-xs sm:text-sm max-w-md">
                              <p className="line-clamp-2">{type.description || "—"}</p>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 pt-2 md:pt-4 md:p-4 border-t border-border/40 md:border-0 text-left">
                              <div className="flex gap-1.5 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingEntityType(type);
                                    setEntityTypeDialogOpen(true);
                                  }}
                                  title="تعديل نوع الكيان"
                                  data-testid={`button-edit-entity-type-${type.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteEntityTypeId(type.id)}
                                  title="حذف نوع الكيان"
                                  data-testid={`button-delete-entity-type-${type.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Smart Entities Tab */}
          <TabsContent value="entities" className="space-y-4 mt-0">
            <Card className="border-border/70 shadow-xs">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-primary" />
                      الكيانات الذكية ({filteredEntities.length})
                    </CardTitle>
                    <CardDescription className="mt-1">
                      إدارة الكيانات الذكية وأولويات الربط التلقائي ومعاينة الروابط الهدف
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingEntity(null);
                      setEntityDialogOpen(true);
                    }}
                    className="gap-2 w-full sm:w-auto"
                    data-testid="button-add-entity"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة كيان جديد
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {entitiesLoading ? (
                  <div className="text-center py-12 text-muted-foreground">جاري تحميل الكيانات الذكية...</div>
                ) : filteredEntities.length === 0 ? (
                  <div className="text-center py-12 px-4 text-muted-foreground space-y-2">
                    <Link2 className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="font-medium text-foreground">لا توجد كيانات ذكية مطابقة</p>
                    <p className="text-xs">جرّب تغيير الفلتر أو البحث أو أضف كياناً ذكياً جديداً.</p>
                  </div>
                ) : (
                  <Table dir="rtl" className="block md:table">
                    <TableHeader className="hidden md:table-header-group">
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-right">الكيان والمرادفات</TableHead>
                        <TableHead className="text-right">نوع الكيان</TableHead>
                        <TableHead className="text-right">الأولوية والحالة</TableHead>
                        <TableHead className="text-right">معاينة الرابط الهدف</TableHead>
                        <TableHead className="text-right">الوصف</TableHead>
                        <TableHead className="w-28 text-left">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="block md:table-row-group p-3 sm:p-0 space-y-3 md:space-y-0">
                      {filteredEntities.map((entity) => {
                        const resolvedType =
                          entity.entityTypeName ||
                          entityTypeMap.get(entity.typeId)?.nameAr ||
                          "غير مصنف";
                        const priority = getPriorityInfo(entity.importanceScore);
                        const isActive = (entity.status || "active") === "active";
                        const targetPath = `/entity/${entity.slug}`;
                        const externalWebsite = entity.metadata?.website;

                        return (
                          <TableRow
                            key={entity.id}
                            className="flex flex-col md:table-row rounded-xl border border-border/70 md:rounded-none md:border-0 md:border-b p-4 md:p-0 bg-card hover:bg-muted/30 transition-colors gap-2.5 md:gap-0"
                          >
                            {/* Entity Name & Aliases */}
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <div className="flex items-start gap-3">
                                {entity.imageUrl ? (
                                  <img
                                    src={entity.imageUrl}
                                    alt={entity.name}
                                    className="h-10 w-10 shrink-0 rounded-lg object-cover border border-border/60"
                                  />
                                ) : (
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-sm">
                                    {entity.name.slice(0, 2)}
                                  </span>
                                )}
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="font-semibold text-foreground flex flex-wrap items-center gap-1.5">
                                    <span>{entity.name}</span>
                                  </div>
                                  {(entity.metadata?.position || entity.metadata?.organization) && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {[entity.metadata?.position, entity.metadata?.organization]
                                        .filter(Boolean)
                                        .join(" — ")}
                                    </p>
                                  )}
                                  {Array.isArray(entity.aliases) && entity.aliases.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                      {entity.aliases.slice(0, 3).map((alias, idx) => (
                                        <span
                                          key={idx}
                                          className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                        >
                                          {alias}
                                        </span>
                                      ))}
                                      {entity.aliases.length > 3 && (
                                        <span className="text-[11px] text-muted-foreground">
                                          +{entity.aliases.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            {/* Entity Type Badge */}
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <Badge
                                variant="outline"
                                className="gap-1.5 border-primary/25 bg-primary/5 text-primary font-medium"
                              >
                                <Database className="h-3 w-3" />
                                <span>{resolvedType}</span>
                              </Badge>
                            </TableCell>

                            {/* Priority Indicator & Status */}
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <div className="flex flex-wrap md:flex-col items-center md:items-start gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="outline" className={`text-[11px] font-medium ${priority.badgeClass}`}>
                                    {priority.label} ({priority.pct}%)
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={
                                      isActive
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 text-[11px]"
                                        : "text-[11px] text-muted-foreground"
                                    }
                                  >
                                    {isActive ? "نشط" : "غير نشط"}
                                  </Badge>
                                </div>
                                <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                                  <div
                                    className={`h-full rounded-full ${priority.barClass}`}
                                    style={{ width: `${priority.pct}%` }}
                                  />
                                </div>
                              </div>
                            </TableCell>

                            {/* Target Link Preview */}
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <div className="flex flex-col items-start gap-1">
                                <a
                                  href={targetPath}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="no-min-touch-size inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 hover:bg-muted px-2.5 py-1 text-xs font-mono text-foreground transition-colors max-w-[220px]"
                                  dir="ltr"
                                  title="معاينة صفحة الكيان"
                                >
                                  <Link2 className="h-3 w-3 text-primary shrink-0" />
                                  <span className="truncate">{targetPath}</span>
                                  <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                </a>
                                {externalWebsite && (
                                  <a
                                    href={externalWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="no-min-touch-size inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors max-w-[220px]"
                                    dir="ltr"
                                  >
                                    <Globe className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{externalWebsite.replace(/^https?:\/\//, "")}</span>
                                  </a>
                                )}
                              </div>
                            </TableCell>

                            {/* Description */}
                            <TableCell className="block md:table-cell p-0 md:p-4 text-muted-foreground text-right text-xs sm:text-sm max-w-xs">
                              <p className="line-clamp-2">
                                {entity.description || "—"}
                              </p>
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="block md:table-cell p-0 pt-2 md:pt-4 md:p-4 border-t border-border/40 md:border-0 text-left">
                              <div className="flex gap-1.5 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingEntity(entity);
                                    setEntityDialogOpen(true);
                                  }}
                                  title="تعديل الكيان"
                                  data-testid={`button-edit-entity-${entity.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteEntityId(entity.id)}
                                  title="حذف الكيان"
                                  data-testid={`button-delete-entity-${entity.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Smart Terms Tab */}
          <TabsContent value="terms" className="space-y-4 mt-0">
            <Card className="border-border/70 shadow-xs">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      المصطلحات الذكية ({filteredTerms.length})
                    </CardTitle>
                    <CardDescription className="mt-1">
                      إدارة المصطلحات والكلمات الدلالية المرتبطة بالكيانات والروابط التلقائية
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingTerm(null);
                      setTermDialogOpen(true);
                    }}
                    className="gap-2 w-full sm:w-auto"
                    data-testid="button-add-term"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة مصطلح جديد
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {termsLoading ? (
                  <div className="text-center py-12 text-muted-foreground">جاري تحميل المصطلحات الذكية...</div>
                ) : filteredTerms.length === 0 ? (
                  <div className="text-center py-12 px-4 text-muted-foreground space-y-2">
                    <Tag className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="font-medium text-foreground">لا توجد مصطلحات ذكية مطابقة</p>
                    <p className="text-xs">جرّب تعديل البحث أو الفئة أو أضف مصطلحاً ذكياً جديداً.</p>
                  </div>
                ) : (
                  <Table dir="rtl" className="block md:table">
                    <TableHeader className="hidden md:table-header-group">
                      <TableRow className="bg-muted/40">
                        <TableHead className="text-right">المصطلح</TableHead>
                        <TableHead className="text-right">الفئة / التصنيف</TableHead>
                        <TableHead className="text-right">الحالة والأولوية</TableHead>
                        <TableHead className="text-right">معاينة الرابط الهدف</TableHead>
                        <TableHead className="text-right">الوصف</TableHead>
                        <TableHead className="w-28 text-left">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="block md:table-row-group p-3 sm:p-0 space-y-3 md:space-y-0">
                      {filteredTerms.map((term) => {
                        const isActive = (term.status || "active") === "active";
                        const targetUrl = `/keyword/${encodeURIComponent(term.term)}`;
                        return (
                          <TableRow
                            key={term.id}
                            className="flex flex-col md:table-row rounded-xl border border-border/70 md:rounded-none md:border-0 md:border-b p-4 md:p-0 bg-card hover:bg-muted/30 transition-colors gap-2.5 md:gap-0"
                          >
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <Hash className="h-4 w-4" />
                                </span>
                                <div>
                                  <div className="font-semibold text-foreground">{term.term}</div>
                                  {Array.isArray(term.aliases) && term.aliases.length > 0 && (
                                    <div className="text-[11px] text-muted-foreground">
                                      مرادفات: {term.aliases.slice(0, 3).join("، ")}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <Badge variant="outline" className="gap-1 border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/40 dark:text-sky-300">
                                <Tag className="h-3 w-3" />
                                <span>{term.category || "عام"}</span>
                              </Badge>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className={
                                    isActive
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 text-[11px]"
                                      : "text-[11px] text-muted-foreground"
                                  }
                                >
                                  {isActive ? "نشط" : "غير نشط"}
                                </Badge>
                                <Badge variant="secondary" className="text-[11px] font-normal">
                                  ربط تلقائي
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 md:p-4 text-right">
                              <a
                                href={targetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="no-min-touch-size inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 hover:bg-muted px-2.5 py-1 text-xs text-foreground transition-colors max-w-[220px]"
                                title="معاينة صفحة الكلمة المفتاحية"
                              >
                                <ExternalLink className="h-3 w-3 text-primary shrink-0" />
                                <span className="truncate">/keyword/{term.term}</span>
                              </a>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 md:p-4 text-muted-foreground text-right text-xs sm:text-sm max-w-xs">
                              <p className="line-clamp-2">
                                {term.description || "—"}
                              </p>
                            </TableCell>
                            <TableCell className="block md:table-cell p-0 pt-2 md:pt-4 md:p-4 border-t border-border/40 md:border-0 text-left">
                              <div className="flex gap-1.5 justify-end">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingTerm(term);
                                    setTermDialogOpen(true);
                                  }}
                                  title="تعديل المصطلح"
                                  data-testid={`button-edit-term-${term.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteTermId(term.id)}
                                  title="حذف المصطلح"
                                  data-testid={`button-delete-term-${term.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Entity Type Dialog */}
        <EntityTypeDialog
          open={entityTypeDialogOpen}
          onOpenChange={setEntityTypeDialogOpen}
          entityType={editingEntityType}
          onSave={(data) => {
            if (editingEntityType) {
              updateEntityTypeMutation.mutate({ id: editingEntityType.id, data });
            } else {
              createEntityTypeMutation.mutate(data as InsertEntityTypeDb);
            }
          }}
          isPending={createEntityTypeMutation.isPending || updateEntityTypeMutation.isPending}
        />

        {/* Smart Entity Dialog */}
        <SmartEntityDialog
          open={entityDialogOpen}
          onOpenChange={setEntityDialogOpen}
          entity={editingEntity}
          entityTypes={entityTypes}
          onSave={(data) => {
            if (editingEntity) {
              updateEntityMutation.mutate({ id: editingEntity.id, data });
            } else {
              createEntityMutation.mutate(data as InsertSmartEntityDb);
            }
          }}
          isPending={createEntityMutation.isPending || updateEntityMutation.isPending}
        />

        {/* Smart Term Dialog */}
        <SmartTermDialog
          open={termDialogOpen}
          onOpenChange={setTermDialogOpen}
          term={editingTerm}
          onSave={(data) => {
            if (editingTerm) {
              updateTermMutation.mutate({ id: editingTerm.id, data });
            } else {
              createTermMutation.mutate(data as InsertSmartTermDb);
            }
          }}
          isPending={createTermMutation.isPending || updateTermMutation.isPending}
        />

        {/* Delete Confirmations */}
        <AlertDialog open={!!deleteEntityTypeId} onOpenChange={() => setDeleteEntityTypeId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف نوع الكيان وجميع الكيانات المرتبطة به. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteEntityTypeId && deleteEntityTypeMutation.mutate(deleteEntityTypeId)}
                className="bg-destructive hover:bg-destructive/90"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteEntityId} onOpenChange={() => setDeleteEntityId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف الكيان وجميع المصطلحات المرتبطة به. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteEntityId && deleteEntityMutation.mutate(deleteEntityId)}
                className="bg-destructive hover:bg-destructive/90"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deleteTermId} onOpenChange={() => setDeleteTermId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم حذف المصطلح. لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteTermId && deleteTermMutation.mutate(deleteTermId)}
                className="bg-destructive hover:bg-destructive/90"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

// Entity Type Dialog Component
function EntityTypeDialog({
  open,
  onOpenChange,
  entityType,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: EntityType | null;
  onSave: (data: Partial<InsertEntityTypeDb>) => void;
  isPending: boolean;
}) {
  const [nameAr, setNameAr] = useState(entityType?.nameAr || "");
  const [nameEn, setNameEn] = useState(entityType?.nameEn || "");
  const [slug, setSlug] = useState(entityType?.slug || "");
  const [description, setDescription] = useState(entityType?.description || "");

  // Reset form when dialog opens or entityType changes
  useEffect(() => {
    if (open) {
      setNameAr(entityType?.nameAr || "");
      setNameEn(entityType?.nameEn || "");
      setSlug(entityType?.slug || "");
      setDescription(entityType?.description || "");
    }
  }, [open, entityType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ 
      nameAr, 
      nameEn, 
      slug,
      description: description || undefined,
      displayOrder: 0,
      status: "active"
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {entityType ? "تعديل نوع الكيان" : "إضافة نوع كيان جديد"}
            </DialogTitle>
            <DialogDescription>
              أضف معلومات نوع الكيان أدناه
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nameAr">الاسم العربي *</Label>
              <Input
                id="nameAr"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                placeholder="مثال: شخصية، منظمة، مكان"
                required
                data-testid="input-entity-type-name-ar"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameEn">الاسم الإنجليزي *</Label>
              <Input
                id="nameEn"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="Example: Person, Organization, Location"
                dir="ltr"
                required
                data-testid="input-entity-type-name-en"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">المعرّف (Slug) *</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="person-organization-location"
                dir="ltr"
                required
                data-testid="input-entity-type-slug"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف نوع الكيان (اختياري)"
                rows={3}
                data-testid="input-entity-type-description"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-entity-type">
              {isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Smart Entity Dialog Component
function SmartEntityDialog({
  open,
  onOpenChange,
  entity,
  entityTypes,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: SmartEntity | null;
  entityTypes: EntityType[];
  onSave: (data: Partial<InsertSmartEntityDb>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(entity?.name || "");
  const [typeId, setTypeId] = useState<string>(entity?.typeId?.toString() || "");
  const [slug, setSlug] = useState(entity?.slug || "");
  const [description, setDescription] = useState(entity?.description || "");
  const [imageUrl, setImageUrl] = useState(entity?.imageUrl || "");
  const [aliases, setAliases] = useState(entity?.aliases?.join(", ") || "");
  const [importanceScore, setImportanceScore] = useState<number>(entity?.importanceScore ?? 0.5);
  
  // Metadata fields
  const [position, setPosition] = useState("");
  const [organization, setOrganization] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");

  // Reset form when dialog opens or entity changes
  useEffect(() => {
    if (open) {
      setName(entity?.name || "");
      setTypeId(entity?.typeId?.toString() || "");
      setSlug(entity?.slug || "");
      setDescription(entity?.description || "");
      setImageUrl(entity?.imageUrl || "");
      setAliases(entity?.aliases?.join(", ") || "");
      setImportanceScore(entity?.importanceScore ?? 0.5);
      
      // Load metadata if exists
      const meta = entity?.metadata as any;
      setPosition(meta?.position || "");
      setOrganization(meta?.organization || "");
      setBirthDate(meta?.birthDate || "");
      setLocation(meta?.location || "");
      setWebsite(meta?.website || "");
      setTwitter(meta?.social?.twitter || "");
      setLinkedin(meta?.social?.linkedin || "");
      setInstagram(meta?.social?.instagram || "");
    } else {
      // Reset form when dialog closes
      setName("");
      setTypeId("");
      setSlug("");
      setDescription("");
      setImageUrl("");
      setAliases("");
      setImportanceScore(0.5);
      setPosition("");
      setOrganization("");
      setBirthDate("");
      setLocation("");
      setWebsite("");
      setTwitter("");
      setLinkedin("");
      setInstagram("");
    }
  }, [open, entity]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Build metadata object
    const metadata: any = {};
    if (position) metadata.position = position;
    if (organization) metadata.organization = organization;
    if (birthDate) metadata.birthDate = birthDate;
    if (location) metadata.location = location;
    if (website) metadata.website = website;
    
    // Add social media if any field is filled
    if (twitter || linkedin || instagram) {
      metadata.social = {};
      if (twitter) metadata.social.twitter = twitter;
      if (linkedin) metadata.social.linkedin = linkedin;
      if (instagram) metadata.social.instagram = instagram;
    }
    
    onSave({
      name,
      typeId: parseInt(typeId),
      slug,
      description: description || null,
      imageUrl: imageUrl || null,
      aliases: aliases ? aliases.split(",").map((a: string) => a.trim()).filter(Boolean) : [],
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      importanceScore,
      status: "active",
    });
  };

  const { toast } = useToast();
  const [generatingDescription, setGeneratingDescription] = useState(false);

  const generateDescription = async () => {
    if (!name || !typeId) {
      toast({ title: "الرجاء إدخال الاسم والنوع أولاً", variant: "destructive" });
      return;
    }

    setGeneratingDescription(true);
    try {
      const entityType = entityTypes.find(t => t.id.toString() === typeId);
      const context = {
        name,
        type: entityType?.nameAr,
        position,
        organization,
        location,
      };
      
      const response = await apiRequest("/api/ai/generate-entity-description", {
        method: "POST",
        body: JSON.stringify(context),
      });
      
      setDescription(response.description);
      toast({ title: "تم توليد التعريف بنجاح" });
    } catch (error) {
      toast({ title: "فشل توليد التعريف", variant: "destructive" });
    } finally {
      setGeneratingDescription(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {entity ? "تعديل الكيان الذكي" : "إضافة كيان ذكي جديد"}
            </DialogTitle>
            <DialogDescription>
              أضف معلومات الكيان الذكي أدناه. الحقول المطلوبة مشارة بـ *
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Basic Info Section */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold text-sm">المعلومات الأساسية</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entity-name">الاسم *</Label>
                  <Input
                    id="entity-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: محمد بن سلمان، أرامكو"
                    required
                    data-testid="input-entity-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="entity-type">النوع *</Label>
                  <Select value={typeId} onValueChange={setTypeId} required>
                    <SelectTrigger data-testid="select-entity-type">
                      <SelectValue placeholder="اختر نوع الكيان" />
                    </SelectTrigger>
                    <SelectContent>
                      {entityTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {type.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entity-slug">المعرّف (Slug) *</Label>
                  <Input
                    id="entity-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="mohammed-bin-salman"
                    dir="ltr"
                    required
                    data-testid="input-entity-slug"
                  />
                </div>

                <div className="space-y-2">
                  <Label>أولوية الربط التلقائي</Label>
                  <div className="flex items-center gap-1.5 pt-1">
                    {(
                      [
                        { val: 0.85, label: "عالية (85%)" },
                        { val: 0.5, label: "متوسطة (50%)" },
                        { val: 0.25, label: "عادية (25%)" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setImportanceScore(opt.val)}
                        className={`no-min-touch-size flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          Math.abs(importanceScore - opt.val) < 0.15
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="entity-aliases">الأسماء المستعارة (مفصولة بفواصل)</Label>
                <Input
                  id="entity-aliases"
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  placeholder="مثال: MBS, ولي العهد، الأمير محمد"
                  data-testid="input-entity-aliases"
                />
                <p className="text-xs text-muted-foreground">
                  اكتب الأسماء المستعارة مفصولة بفواصل
                </p>
              </div>
            </div>

            {/* Description Section with AI */}
            <div className="space-y-4 p-4 border rounded-lg bg-accent/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h3 className="font-semibold text-sm">التعريف والوصف</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={generateDescription}
                  disabled={generatingDescription || !name || !typeId}
                  data-testid="button-generate-description"
                >
                  <Sparkles className="h-3.5 w-3.5 ml-1.5 text-primary" />
                  {generatingDescription ? "جاري التوليد..." : "توليد تلقائي بالذكاء الاصطناعي"}
                </Button>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="entity-description">الوصف والتعريف</Label>
                <Textarea
                  id="entity-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف وتعريف الكيان (اختياري) - أو استخدم التوليد التلقائي"
                  rows={4}
                  data-testid="input-entity-description"
                />
              </div>
            </div>

            {/* Media Section */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold text-sm">الصورة</h3>
              
              <div className="space-y-2">
                <Label htmlFor="entity-image-file">رفع صورة</Label>
                <Input
                  id="entity-image-file"
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    // رفع الصورة
                    const formData = new FormData();
                    formData.append('image', file);
                    
                    try {
                      const response = await fetch(apiUrl("/api/smart-entities/upload-image"), {
                        method: "POST",
                        body: formData,
                        credentials: "include",
                      });
                      
                      if (!response.ok) {
                        throw new Error("فشل رفع الصورة");
                      }
                      
                      const data = await response.json();
                      setImageUrl(data.imageUrl);
                      toast({ title: "تم رفع الصورة بنجاح" });
                    } catch (error) {
                      toast({ title: "فشل رفع الصورة", variant: "destructive" });
                    }
                  }}
                  data-testid="input-entity-image-file"
                />
                <p className="text-xs text-muted-foreground">
                  اختر صورة بصيغة JPG, PNG, أو GIF
                </p>
                {imageUrl && (
                  <div className="mt-2">
                    <img src={imageUrl} alt="معاينة" className="h-24 w-24 object-cover rounded-lg border" />
                  </div>
                )}
              </div>
            </div>

            {/* Metadata Section */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold text-sm">معلومات إضافية</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entity-position">المنصب / الوظيفة</Label>
                  <Input
                    id="entity-position"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="مثال: ولي العهد، الرئيس التنفيذي"
                    data-testid="input-entity-position"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="entity-organization">المنظمة / الجهة</Label>
                  <Input
                    id="entity-organization"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="مثال: الحكومة السعودية، أرامكو"
                    data-testid="input-entity-organization"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="entity-birthdate">تاريخ الميلاد / التأسيس</Label>
                  <Input
                    id="entity-birthdate"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    placeholder="مثال: 31 أغسطس 1985"
                    data-testid="input-entity-birthdate"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="entity-location">الموقع / المقر</Label>
                  <Input
                    id="entity-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="مثال: الرياض، السعودية"
                    data-testid="input-entity-location"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="entity-website">الموقع الإلكتروني</Label>
                <Input
                  id="entity-website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  dir="ltr"
                  type="url"
                  data-testid="input-entity-website"
                />
              </div>
            </div>

            {/* Social Media Section */}
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-semibold text-sm">وسائل التواصل الاجتماعي</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entity-twitter">تويتر / X</Label>
                  <Input
                    id="entity-twitter"
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder="@username"
                    dir="ltr"
                    data-testid="input-entity-twitter"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="entity-linkedin">لينكد إن</Label>
                  <Input
                    id="entity-linkedin"
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                    dir="ltr"
                    data-testid="input-entity-linkedin"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="entity-instagram">انستغرام</Label>
                  <Input
                    id="entity-instagram"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@username"
                    dir="ltr"
                    data-testid="input-entity-instagram"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-entity">
              {isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Smart Term Dialog Component
function SmartTermDialog({
  open,
  onOpenChange,
  term,
  onSave,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: SmartTerm | null;
  onSave: (data: Partial<InsertSmartTermDb>) => void;
  isPending: boolean;
}) {
  const [termText, setTermText] = useState(term?.term || "");
  const [category, setCategory] = useState(term?.category || "");
  const [description, setDescription] = useState(term?.description || "");

  // Reset form when dialog opens or term changes
  useEffect(() => {
    if (open) {
      setTermText(term?.term || "");
      setCategory(term?.category || "");
      setDescription(term?.description || "");
    }
  }, [open, term]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      term: termText,
      category: category || null,
      description: description || null,
      aliases: [],
      status: "active",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {term ? "تعديل المصطلح" : "إضافة مصطلح جديد"}
            </DialogTitle>
            <DialogDescription>
              أضف معلومات المصطلح أدناه
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="term-text">المصطلح *</Label>
              <Input
                id="term-text"
                value={termText}
                onChange={(e) => setTermText(e.target.value)}
                placeholder="مثال: الذكاء الاصطناعي، الطاقة المتجددة"
                required
                data-testid="input-term-text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-category">الفئة</Label>
              <Input
                id="term-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="مثال: تقنية، اقتصاد، سياسة"
                data-testid="input-term-category"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-description">الوصف</Label>
              <Textarea
                id="term-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="وصف المصطلح (اختياري)"
                rows={3}
                data-testid="input-term-description"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isPending} data-testid="button-save-term">
              {isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
