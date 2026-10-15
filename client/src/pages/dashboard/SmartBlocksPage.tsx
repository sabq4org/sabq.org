/**
 * مسرح الصفحة الرئيسية — لوحة البلوكات الذكية v3
 * محرر مشاهد تحريرية حية: رفوف مواضع + سحب/إفلات + معاينة + مخرج ذكي.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import {
  Blocks,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Sparkles,
  Clapperboard,
  Clock,
  Eye,
  Power,
  Search,
  X,
  CheckCircle2,
  CalendarClock,
  Layers,
  Newspaper,
  SlidersHorizontal,
  Pin,
  LayoutGrid,
} from "lucide-react";
import type { SmartBlock, InsertSmartBlock, Category } from "@shared/schema";
import { insertSmartBlockSchema, smartBlockSourceTypes } from "@shared/schema";
import { z } from "zod";
import { cn } from "@/lib/utils";

const placementOptions = [
  { value: "below_featured", label: "بعد البانر الرئيسي", shelf: "البانر" },
  { value: "above_all_news", label: "قبل جميع الأخبار", shelf: "الأخبار" },
  { value: "between_all_and_murqap", label: "بين الأخبار والمقترب", shelf: "المقترب" },
  { value: "above_footer", label: "قبل التذييل", shelf: "التذييل" },
] as const;

const layoutStyleOptions = [
  { value: "grid", label: "شبكة" },
  { value: "list", label: "قائمة" },
  { value: "featured", label: "مميز" },
  { value: "carousel", label: "كاروسيل" },
] as const;

const sourceTypeLabels: Record<string, string> = {
  keyword: "كلمة مفتاحية",
  topic_cluster: "تجمّع موضوعي",
  category_feed: "تغذية قسم",
  curated: "منسّق يدوياً",
  trending: "الأكثر قراءة",
  event_window: "نافذة حدث",
};

const sceneFormSchema = insertSmartBlockSchema.extend({
  keywordsText: z.string().optional(),
  pinnedIdsText: z.string().optional(),
  categoryIds: z.array(z.string()).optional(),
  scheduleStartLocal: z.string().optional(),
  scheduleEndLocal: z.string().optional(),
});

type SceneFormValues = z.infer<typeof sceneFormSchema>;

type DirectorSuggestion = {
  title: string;
  keyword: string;
  keywords: string[];
  sourceType: string;
  placement: string;
  layoutStyle: string;
  limitCount: number;
  color: string;
  rationale: string;
  lookbackHours?: number;
  _categoryId?: string;
};

type PreviewArticle = {
  id: string;
  title: string;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  pinned?: boolean;
};

type StageSummary = {
  total: number;
  active: number;
  inactive: number;
  scheduled: number;
  byPlacement: Record<string, number>;
  playbooks: Array<{ key: string; blockCount: number; activeCount: number }>;
};

function toLocalInput(value?: string | Date | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SortableSceneCard({
  block,
  onEdit,
  onDelete,
  onToggle,
}: {
  block: SmartBlock;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (active: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const pinnedCount = Array.isArray(block.pinnedArticleIds)
    ? block.pinnedArticleIds.length
    : 0;
  const keywordsCount = Array.isArray(block.keywords) ? block.keywords.length : 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex gap-3 rounded-xl border border-white/10 bg-slate-950/55 p-3.5 backdrop-blur-sm transition-all hover:border-sky-400/30 hover:bg-slate-900/70",
        isDragging && "z-20 scale-[1.02] shadow-xl ring-2 ring-sky-400/50",
        !block.isActive && "opacity-65",
      )}
      data-testid={`stage-card-${block.id}`}
    >
      <button
        type="button"
        className="no-min-touch-size mt-1 flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="سحب لإعادة الترتيب"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div
        className="w-1.5 self-stretch rounded-full shadow-xs"
        style={{ backgroundColor: block.color || "#0B6E4F" }}
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate font-semibold text-slate-50">{block.title}</h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                  block.isActive
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/25"
                    : "bg-slate-800 text-slate-400 border border-slate-700",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    block.isActive ? "bg-emerald-400" : "bg-slate-500",
                  )}
                />
                {block.isActive ? "نشط" : "متوقف"}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="bg-slate-800/90 text-slate-200 border border-slate-700/80 text-[11px]">
                {sourceTypeLabels[block.sourceType || "keyword"] || block.sourceType}
              </Badge>
              <Badge variant="outline" className="border-slate-600/80 text-slate-300 text-[11px]">
                <LayoutGrid className="ml-1 h-3 w-3 opacity-70" />
                {layoutStyleOptions.find((l) => l.value === block.layoutStyle)?.label ||
                  block.layoutStyle}
              </Badge>
              <Badge
                variant="outline"
                className="border-slate-700 bg-slate-900/60 text-slate-300 text-[11px] tabular-nums"
              >
                <Newspaper className="ml-1 h-3 w-3 opacity-70" />
                {block.limitCount} مقالات (أدنى {block.minArticles || 1})
              </Badge>
              {pinnedCount > 0 ? (
                <Badge className="bg-purple-500/20 text-purple-200 border border-purple-500/30 text-[11px] tabular-nums">
                  <Pin className="ml-1 h-3 w-3" />
                  {pinnedCount} مثبت
                </Badge>
              ) : null}
              {block.lookbackHours ? (
                <Badge className="bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 text-[11px] tabular-nums">
                  آخر {block.lookbackHours}س
                </Badge>
              ) : null}
              {block.playbook ? (
                <Badge className="bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[11px]">
                  {block.playbook}
                </Badge>
              ) : null}
              {block.scheduleStartAt || block.scheduleEndAt ? (
                <Badge className="bg-sky-500/15 text-sky-200 border border-sky-500/30 text-[11px]">
                  <Clock className="ml-1 h-3 w-3" />
                  مجدول
                </Badge>
              ) : null}
            </div>
          </div>
          <Switch
            checked={block.isActive}
            onCheckedChange={onToggle}
            data-testid={`switch-stage-${block.id}`}
          />
        </div>

        <p className="line-clamp-1 text-xs text-slate-400">
          {block.subtitle ||
            (block.keyword
              ? `مصدر الكلمة: ${block.keyword}${keywordsCount > 0 ? ` (+${keywordsCount} كلمات)` : ""}`
              : `${block.limitCount} مقالات · ${block.minArticles || 1} حد أدنى للإظهار`)}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex gap-1 opacity-90 transition-opacity group-hover:opacity-100">
            <Button
              size="sm"
              variant="ghost"
              className="no-min-touch-size h-7 px-2.5 text-xs text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={onEdit}
            >
              <Pencil className="ml-1 h-3.5 w-3.5" />
              تحرير
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="no-min-touch-size h-7 px-2.5 text-xs text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
              onClick={onDelete}
            >
              <Trash2 className="ml-1 h-3.5 w-3.5" />
              حذف
            </Button>
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums">
            ترتيب #{(block.sortOrder ?? 0) + 1}
          </span>
        </div>
      </div>
    </div>
  );
}

type PlacementFilter = "all" | (typeof placementOptions)[number]["value"];
type StatusFilter = "all" | "active" | "inactive" | "scheduled";

export default function SmartBlocksPage() {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<SmartBlock | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewArticles, setPreviewArticles] = useState<PreviewArticle[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [placementFilter, setPlacementFilter] = useState<PlacementFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const form = useForm<SceneFormValues>({
    resolver: zodResolver(sceneFormSchema),
    defaultValues: {
      title: "",
      keyword: "",
      color: "#0B6E4F",
      backgroundColor: "",
      placement: "below_featured",
      layoutStyle: "grid",
      limitCount: 6,
      isActive: true,
      sourceType: "keyword",
      subtitle: "",
      keywords: [],
      pinnedArticleIds: [],
      lookbackHours: undefined,
      minArticles: 1,
      playbook: "",
      keywordsText: "",
      pinnedIdsText: "",
      categoryIds: [],
      scheduleStartLocal: "",
      scheduleEndLocal: "",
      filters: {},
    },
  });

  const { data: blocksRaw, isLoading } = useQuery<SmartBlock[]>({
    queryKey: ["/api/smart-blocks"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/smart-blocks"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch blocks");
      return await res.json();
    },
  });
  const blocks = Array.isArray(blocksRaw) ? blocksRaw : [];

  const { data: summary } = useQuery<StageSummary>({
    queryKey: ["/api/smart-blocks/stage/summary"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/smart-blocks/stage/summary"), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
  });

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: directorData, isLoading: directorLoading } = useQuery<{
    suggestions: DirectorSuggestion[];
  }>({
    queryKey: ["/api/smart-blocks/director/suggest"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/smart-blocks/director/suggest"), {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: directorOpen,
  });

  const blocksByPlacement = useMemo(() => {
    const map: Record<string, SmartBlock[]> = {};
    for (const p of placementOptions) map[p.value] = [];
    for (const b of blocks) {
      if (!map[b.placement]) map[b.placement] = [];
      map[b.placement].push(b);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return map;
  }, [blocks]);

  const matchesFilters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (b: SmartBlock) => {
      if (statusFilter === "active" && !b.isActive) return false;
      if (statusFilter === "inactive" && b.isActive) return false;
      if (
        statusFilter === "scheduled" &&
        !b.scheduleStartAt &&
        !b.scheduleEndAt &&
        b.sourceType !== "event_window"
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        b.title,
        b.subtitle,
        b.keyword,
        b.playbook,
        ...(Array.isArray(b.keywords) ? b.keywords : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    };
  }, [searchQuery, statusFilter]);

  const filteredBlocksByPlacement = useMemo(() => {
    const map: Record<string, SmartBlock[]> = {};
    for (const p of placementOptions) {
      map[p.value] = (blocksByPlacement[p.value] || []).filter(matchesFilters);
    }
    return map;
  }, [blocksByPlacement, matchesFilters]);

  const visiblePlacements = useMemo(() => {
    if (placementFilter === "all") return placementOptions;
    return placementOptions.filter((p) => p.value === placementFilter);
  }, [placementFilter]);

  const totalBlocks = summary?.total ?? blocks.length;
  const activeBlocks = summary?.active ?? blocks.filter((b) => b.isActive).length;
  const inactiveBlocks = summary?.inactive ?? blocks.filter((b) => !b.isActive).length;
  const scheduledBlocks =
    summary?.scheduled ??
    blocks.filter(
      (b) => Boolean(b.scheduleStartAt || b.scheduleEndAt || b.sourceType === "event_window"),
    ).length;
  const activeArticlesCapacity = blocks
    .filter((b) => b.isActive)
    .reduce((sum, b) => sum + (b.limitCount || 0), 0);
  const totalArticlesCapacity = blocks.reduce((sum, b) => sum + (b.limitCount || 0), 0);
  const activeShelvesCount = placementOptions.filter((p) =>
    (blocksByPlacement[p.value] || []).some((b) => b.isActive),
  ).length;
  const playbooksList = Array.isArray(summary?.playbooks) ? summary.playbooks : [];
  const directorSuggestions = Array.isArray(directorData?.suggestions)
    ? directorData.suggestions
    : [];
  const hasActiveFilters =
    searchQuery.trim() !== "" || placementFilter !== "all" || statusFilter !== "all";

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/smart-blocks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/smart-blocks/stage/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/smart-blocks"], exact: false });
  };

  const createMutation = useMutation({
    mutationFn: async (data: InsertSmartBlock) =>
      apiRequest("/api/smart-blocks", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم الإنشاء", description: "أُضيف المشهد إلى المسرح" });
      closeEditor();
    },
    onError: () =>
      toast({ title: "خطأ", description: "فشل إنشاء المشهد", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertSmartBlock> }) =>
      apiRequest(`/api/smart-blocks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم التحديث", description: "حُفظت إعدادات المشهد" });
      closeEditor();
    },
    onError: () =>
      toast({ title: "خطأ", description: "فشل تحديث المشهد", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/smart-blocks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم الحذف" });
      setDeleteId(null);
    },
    onError: () =>
      toast({ title: "خطأ", description: "فشل الحذف", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/smart-blocks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => invalidate(),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({
      placement,
      orderedIds,
    }: {
      placement: string;
      orderedIds: string[];
    }) =>
      apiRequest("/api/smart-blocks/reorder", {
        method: "POST",
        body: JSON.stringify({ placement, orderedIds }),
      }),
    onSuccess: () => invalidate(),
  });

  const activatePlaybookMutation = useMutation({
    mutationFn: async (key: string) =>
      apiRequest(`/api/smart-blocks/playbooks/${encodeURIComponent(key)}/activate`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم تفعيل السيناريو" });
    },
  });

  const watched = form.watch();

  useEffect(() => {
    if (!editorOpen) return;
    const handle = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const keywords = (watched.keywordsText || "")
          .split(/[,،\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const pinnedArticleIds = (watched.pinnedIdsText || "")
          .split(/[,،\s\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const data = await apiRequest<{ items?: PreviewArticle[] }>("/api/smart-blocks/preview", {
          method: "POST",
          body: JSON.stringify({
            keyword: watched.keyword || "",
            keywords,
            sourceType: watched.sourceType || "keyword",
            limitCount: watched.limitCount || 6,
            lookbackHours: watched.lookbackHours,
            pinnedArticleIds,
            minArticles: watched.minArticles || 1,
            filters: {
              categories: watched.categoryIds?.length ? watched.categoryIds : undefined,
            },
          }),
        });
        setPreviewArticles(Array.isArray(data?.items) ? data.items : []);
      } catch {
        setPreviewArticles([]);
      } finally {
        setPreviewLoading(false);
      }
    }, 450);
    return () => clearTimeout(handle);
  }, [
    editorOpen,
    watched.keyword,
    watched.keywordsText,
    watched.sourceType,
    watched.limitCount,
    watched.lookbackHours,
    watched.pinnedIdsText,
    watched.minArticles,
    watched.categoryIds,
  ]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingBlock(null);
    setPreviewArticles([]);
    form.reset();
  };

  const openCreate = (placement?: string) => {
    setEditingBlock(null);
    form.reset({
      title: "",
      keyword: "",
      color: "#0B6E4F",
      backgroundColor: "",
      placement: placement || "below_featured",
      layoutStyle: "grid",
      limitCount: 6,
      isActive: true,
      sourceType: "keyword",
      subtitle: "",
      keywords: [],
      pinnedArticleIds: [],
      lookbackHours: undefined,
      minArticles: 1,
      playbook: "",
      keywordsText: "",
      pinnedIdsText: "",
      categoryIds: [],
      scheduleStartLocal: "",
      scheduleEndLocal: "",
      filters: {},
    });
    setEditorOpen(true);
  };

  const openEdit = (block: SmartBlock) => {
    setEditingBlock(block);
    form.reset({
      title: block.title,
      keyword: block.keyword || "",
      color: block.color,
      backgroundColor: block.backgroundColor || "",
      placement: block.placement as any,
      layoutStyle: (block.layoutStyle || "grid") as any,
      limitCount: block.limitCount,
      isActive: block.isActive,
      sourceType: (block.sourceType || "keyword") as any,
      subtitle: block.subtitle || "",
      keywords: block.keywords || [],
      pinnedArticleIds: block.pinnedArticleIds || [],
      lookbackHours: block.lookbackHours ?? undefined,
      minArticles: block.minArticles ?? 1,
      playbook: block.playbook || "",
      keywordsText: (block.keywords || []).join("، "),
      pinnedIdsText: (block.pinnedArticleIds || []).join("\n"),
      categoryIds: block.filters?.categories || [],
      scheduleStartLocal: toLocalInput(block.scheduleStartAt),
      scheduleEndLocal: toLocalInput(block.scheduleEndAt),
      filters: block.filters || {},
    });
    setEditorOpen(true);
  };

  const buildPayload = (values: SceneFormValues): InsertSmartBlock => {
    const keywords = (values.keywordsText || "")
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const pinnedArticleIds = (values.pinnedIdsText || "")
      .split(/[,،\s\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      title: values.title,
      keyword: values.keyword || keywords[0] || "",
      color: values.color,
      backgroundColor: values.backgroundColor || null,
      placement: values.placement,
      layoutStyle: values.layoutStyle,
      limitCount: values.limitCount,
      isActive: values.isActive,
      sourceType: values.sourceType || "keyword",
      subtitle: values.subtitle || null,
      keywords,
      pinnedArticleIds,
      lookbackHours: values.lookbackHours || null,
      minArticles: values.minArticles ?? 1,
      playbook: values.playbook?.trim() || null,
      scheduleStartAt: values.scheduleStartLocal
        ? new Date(values.scheduleStartLocal)
        : null,
      scheduleEndAt: values.scheduleEndLocal ? new Date(values.scheduleEndLocal) : null,
      filters: values.categoryIds?.length
        ? { categories: values.categoryIds }
        : null,
    } as InsertSmartBlock;
  };

  const onSubmit = (values: SceneFormValues) => {
    const payload = buildPayload(values);
    if (editingBlock) {
      updateMutation.mutate({ id: editingBlock.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const onDragEnd = (placement: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const list = blocksByPlacement[placement] || [];
    const oldIndex = list.findIndex((b) => b.id === active.id);
    const newIndex = list.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex);
    reorderMutation.mutate({
      placement,
      orderedIds: next.map((b) => b.id),
    });
  };

  const applySuggestion = (s: DirectorSuggestion) => {
    setDirectorOpen(false);
    setEditingBlock(null);
    form.reset({
      title: s.title,
      keyword: s.keyword || "",
      color: s.color,
      backgroundColor: "",
      placement: s.placement as any,
      layoutStyle: s.layoutStyle as any,
      limitCount: s.limitCount,
      isActive: true,
      sourceType: s.sourceType as any,
      subtitle: s.rationale.slice(0, 160),
      keywords: s.keywords || [],
      pinnedArticleIds: [],
      lookbackHours: s.lookbackHours,
      minArticles: 1,
      playbook: "",
      keywordsText: (s.keywords || []).join("، "),
      pinnedIdsText: "",
      categoryIds: s._categoryId ? [s._categoryId] : [],
      scheduleStartLocal: "",
      scheduleEndLocal: "",
      filters: {},
    });
    setEditorOpen(true);
  };

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-10 pt-2 sm:px-6"
      >
        <DashboardPageHeader
          icon={Clapperboard}
          title="مسرح الصفحة الرئيسية"
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>
                إدارة المشاهد التحريرية الحية على الصفحة الرئيسية — ترتيب الرفوف، الجدولة الزمنية، ومخرج ذكي يقترح التركيب
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {activeBlocks} مشاهد نشطة · {activeShelvesCount}/4 رفوف مفعّلة
              </span>
            </span>
          }
          titleTestId="heading-smart-blocks"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setDirectorOpen(true)}
                data-testid="button-director-suggest"
                className="border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
              >
                <Sparkles className="ml-2 h-4 w-4 text-amber-500" />
                اقترح مشهد الليلة
              </Button>
              <Button onClick={() => openCreate()} data-testid="button-create-smart-block">
                <Plus className="ml-2 h-4 w-4" />
                مشهد جديد
              </Button>
            </div>
          }
        />

        {/* Editorial 4-Card KPI Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 1. Total Blocks */}
          <div
            onClick={() => setStatusFilter("all")}
            className="cursor-pointer rounded-2xl border border-border/80 bg-gradient-to-br from-slate-50/90 via-card to-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:from-slate-900/80 dark:via-slate-950 dark:to-slate-950"
            data-testid="stat-total"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                إجمالي المشاهد
              </p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Layers className="h-4 w-4" />
              </span>
            </div>
            <p
              className="mt-2 text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-foreground"
              dir="ltr"
            >
              {totalBlocks}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span>موزعة على 4 رفوف رئيسية</span>
              <span className="font-semibold text-foreground tabular-nums">
                نشط {activeBlocks} · متوقف {inactiveBlocks}
              </span>
            </div>
          </div>

          {/* 2. Active on Stage */}
          <div
            onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
            className="cursor-pointer rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            data-testid="stat-active"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                حية الآن على المسرح
              </p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p
              className="mt-2 text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400"
              dir="ltr"
            >
              {activeBlocks}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span>تغطية المواضع الحية</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {activeShelvesCount} من 4 رفوف
              </span>
            </div>
          </div>

          {/* 3. Scheduled / Event Windows */}
          <div
            onClick={() => setStatusFilter(statusFilter === "scheduled" ? "all" : "scheduled")}
            className="cursor-pointer rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/[0.06] via-card to-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            data-testid="stat-scheduled"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                مجدولة ونوافذ أحداث
              </p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <CalendarClock className="h-4 w-4" />
              </span>
            </div>
            <p
              className="mt-2 text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-sky-600 dark:text-sky-400"
              dir="ltr"
            >
              {scheduledBlocks}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span>سيناريوهات الصفحة</span>
              <span className="font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
                {playbooksList.length} سيناريو
              </span>
            </div>
          </div>

          {/* 4. Director Suggestions / Total Articles & Inactive */}
          <div
            onClick={() => setDirectorOpen(true)}
            className="cursor-pointer rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.06] via-card to-card p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            data-testid="stat-inactive"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                سعة المقالات والمخرج الذكي
              </p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <Sparkles className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <p
                className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-amber-600 dark:text-amber-400"
                dir="ltr"
              >
                {activeArticlesCapacity || totalArticlesCapacity}
              </p>
              <span className="text-xs text-muted-foreground">
                مقال معروض · متوقفة: <b className="tabular-nums text-foreground">{inactiveBlocks}</b>
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span>اقتراحات المخرج لآخر 24س</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">
                استعرض المقترحات ←
              </span>
            </div>
          </div>
        </div>

        {/* Playbooks */}
        {playbooksList.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-50/60 p-3 dark:bg-amber-950/20">
            <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              سيناريوهات الصفحة الجاهزة:
            </span>
            {playbooksList.map((pb) => (
              <Button
                key={pb.key}
                size="sm"
                variant="outline"
                className="no-min-touch-size h-8 border-amber-300 dark:border-amber-700"
                onClick={() => activatePlaybookMutation.mutate(pb.key)}
                disabled={activatePlaybookMutation.isPending}
              >
                <Power className="ml-1 h-3.5 w-3.5" />
                {pb.key}
                <Badge variant="secondary" className="mr-2 tabular-nums">
                  {pb.activeCount}/{pb.blockCount}
                </Badge>
              </Button>
            ))}
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card/80 p-3.5 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <SlidersHorizontal className="h-4 w-4 text-primary" />
              <span>تصفية الرفوف والمشاهد</span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setPlacementFilter("all");
                    setStatusFilter("all");
                  }}
                  className="no-min-touch-size inline-flex items-center gap-1 rounded-lg border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                  إعادة ضبط
                </button>
              )}
            </div>

            {/* Search Input + Status Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:w-64 sm:flex-initial">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالعنوان، الكلمة المفتاحية، أو السيناريو…"
                  className="h-9 rounded-xl pr-9 pl-8 text-xs"
                  data-testid="input-search-smart-blocks"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="مسح البحث"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Status quick pills */}
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/70 bg-muted/50 p-1">
                {(
                  [
                    { key: "all", label: "الكل", count: totalBlocks },
                    { key: "active", label: "نشط", count: activeBlocks },
                    { key: "inactive", label: "متوقف", count: inactiveBlocks },
                    { key: "scheduled", label: "مجدول", count: scheduledBlocks },
                  ] as const
                ).map((item) => {
                  const active = statusFilter === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setStatusFilter(item.key)}
                      className={cn(
                        "no-min-touch-size inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
                        active
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                      )}
                      data-testid={`filter-status-${item.key}`}
                    >
                      <span>{item.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-background text-muted-foreground",
                        )}
                      >
                        {item.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Placement Shelf Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="ml-1 text-xs font-medium text-muted-foreground">رف العرض:</span>
            <button
              type="button"
              onClick={() => setPlacementFilter("all")}
              className={cn(
                "no-min-touch-size inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                placementFilter === "all"
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-border/70 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
              data-testid="filter-placement-all"
            >
              <span>الكل</span>
              <span className="tabular-nums text-[10px] opacity-85">({blocks.length})</span>
            </button>
            {placementOptions.map((p) => {
              const count = (blocksByPlacement[p.value] || []).length;
              const active = placementFilter === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPlacementFilter(active ? "all" : p.value)}
                  className={cn(
                    "no-min-touch-size inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border/70 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                  data-testid={`filter-placement-${p.value}`}
                >
                  <span>{p.label}</span>
                  <span className="tabular-nums text-[10px] opacity-85">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Homepage Stage */}
        <section
          className="overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(ellipse_at_top,_#0f2744_0%,_#020617_55%,_#000_100%)] p-4 text-slate-100 shadow-2xl sm:p-6"
          data-testid="homepage-stage"
        >
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
                Homepage Stage · مسرح الصفحة
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-white sm:text-xl">
                خريطة الصفحة من الأعلى للأسفل
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 tabular-nums">
                {visiblePlacements.length} رفوف معروضة
              </span>
              <Blocks className="h-6 w-6 text-sky-300/70" />
            </div>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-slate-400">جاري تحميل المسرح…</p>
          ) : (
            <div className="space-y-5">
              {visiblePlacements.map((placement, idx) => {
                const allShelfBlocks = blocksByPlacement[placement.value] || [];
                const shelfBlocks = filteredBlocksByPlacement[placement.value] || [];
                const activeInShelf = allShelfBlocks.filter((b) => b.isActive).length;
                const shelfIndex =
                  placementOptions.findIndex((p) => p.value === placement.value) + 1;
                return (
                  <div key={placement.value} className="relative">
                    {idx > 0 && (
                      <div className="absolute -top-3 right-6 h-3 w-px bg-gradient-to-b from-transparent via-sky-400/40 to-transparent" />
                    )}
                    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/20 text-xs font-bold text-sky-200 tabular-nums">
                          {shelfIndex}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-white">{placement.label}</p>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300 tabular-nums">
                              {activeInShelf} نشط / {allShelfBlocks.length} إجمالي
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            رف «{placement.shelf}» — اسحب المشاهد لترتيب أولوية الظهور
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="no-min-touch-size h-8 text-xs text-sky-200 hover:bg-sky-500/15 hover:text-white"
                        onClick={() => openCreate(placement.value)}
                      >
                        <Plus className="ml-1 h-3.5 w-3.5" />
                        أضف هنا
                      </Button>
                    </div>

                    <div className="min-h-[76px] rounded-2xl border border-dashed border-slate-600/70 bg-slate-950/35 p-3">
                      {shelfBlocks.length === 0 ? (
                        <p className="py-6 text-center text-sm text-slate-400">
                          {allShelfBlocks.length === 0
                            ? "رف فارغ — اسحب مشهداً أو أنشئ واحداً جديداً"
                            : "لا توجد مشاهد مطابقة للفلتر الحالي في هذا الرف"}
                        </p>
                      ) : (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={onDragEnd(placement.value)}
                        >
                          <SortableContext
                            items={shelfBlocks.map((b) => b.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2.5">
                              {shelfBlocks.map((block) => (
                                <SortableSceneCard
                                  key={block.id}
                                  block={block}
                                  onEdit={() => openEdit(block)}
                                  onDelete={() => setDeleteId(block.id)}
                                  onToggle={(isActive) =>
                                    toggleMutation.mutate({ id: block.id, isActive })
                                  }
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Scene editor */}
        <Sheet open={editorOpen} onOpenChange={(o) => (!o ? closeEditor() : setEditorOpen(o))}>
          <SheetContent
            side="left"
            className="w-full overflow-y-auto sm:max-w-3xl"
            dir="rtl"
          >
            <SheetHeader>
              <SheetTitle>
                {editingBlock ? "تحرير المشهد" : "مشهد تحريري جديد"}
              </SheetTitle>
              <SheetDescription>
                اضبط المصدر والشكل والجدولة — المعاينة تتحدث مباشرة من المقالات الحقيقية
              </SheetDescription>
            </SheetHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>عنوان المشهد</FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={60} data-testid="input-block-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subtitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>وصف مختصر (للقارئ)</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value || ""} maxLength={160} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="sourceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>مصدر المحتوى</FormLabel>
                        <Select value={field.value || "keyword"} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-source-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {smartBlockSourceTypes.map((t) => (
                              <SelectItem key={t} value={t}>
                                {sourceTypeLabels[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="placement"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الموضع على المسرح</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-block-placement">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {placementOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="keyword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الكلمة الأساسية (داخلية — لا تظهر للقارئ)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ""}
                          maxLength={100}
                          data-testid="input-block-keyword"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="keywordsText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمات إضافية (تجمّع موضوعي — افصل بفاصلة)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} placeholder="نيوم، البحر الأحمر، رؤية 2030" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="categoryIds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>فلتر الأقسام</FormLabel>
                      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-md border p-2">
                        {categories.map((cat) => {
                          const selected = field.value?.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              className={cn(
                                "no-min-touch-size rounded-full border px-3 py-1 text-xs transition-colors",
                                selected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "hover:bg-muted",
                              )}
                              onClick={() => {
                                const next = selected
                                  ? (field.value || []).filter((id) => id !== cat.id)
                                  : [...(field.value || []), cat.id];
                                field.onChange(next);
                              }}
                            >
                              {cat.nameAr}
                            </button>
                          );
                        })}
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pinnedIdsText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>مقالات مثبتة (معرّفات — سطر لكل مقال)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="uuid-article-1" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="layoutStyle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>شكل العرض</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-block-layout-style">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {layoutStyleOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="playbook"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>سيناريو الصفحة (اختياري)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ""}
                            placeholder="ramadan / match_day / hajj"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>لون العنوان</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              value={field.value}
                              onChange={field.onChange}
                              className="h-10 w-16 cursor-pointer"
                              data-testid="input-block-color"
                            />
                            <Input {...field} maxLength={7} />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="backgroundColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>لون الخلفية (اختياري)</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input
                              type="color"
                              value={field.value || "#ffffff"}
                              onChange={field.onChange}
                              className="h-10 w-16 cursor-pointer"
                            />
                            <Input
                              value={field.value || ""}
                              onChange={field.onChange}
                              placeholder="فارغ = بدون"
                            />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="limitCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>عدد المقالات ({field.value || 6})</FormLabel>
                      <FormControl>
                        <Slider
                          min={1}
                          max={24}
                          step={1}
                          value={[field.value || 6]}
                          onValueChange={([v]) => field.onChange(v)}
                          data-testid="slider-block-limit"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="lookbackHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>حداثة (ساعات)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === "" ? undefined : Number(e.target.value),
                              )
                            }
                            placeholder="مثلاً 48"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="minArticles"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>حد أدنى للإظهار</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={24}
                            value={field.value ?? 1}
                            onChange={(e) => field.onChange(Number(e.target.value) || 1)}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-col justify-end">
                        <FormLabel>تفعيل المشهد</FormLabel>
                        <FormControl>
                          <div className="flex h-10 items-center">
                            <Switch
                              checked={!!field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-block-active"
                            />
                          </div>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="scheduleStartLocal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>بداية الجدولة</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduleEndLocal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نهاية الجدولة</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Live preview */}
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Eye className="h-4 w-4" />
                    معاينة حية
                    {previewLoading ? (
                      <span className="text-xs text-muted-foreground">…تحديث</span>
                    ) : null}
                  </div>
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: watched.color }}
                    />
                    <span className="text-lg font-bold" style={{ color: watched.color }}>
                      {watched.title || "عنوان المشهد"}
                    </span>
                  </div>
                  {previewArticles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا مقالات مطابقة حالياً</p>
                  ) : (
                    <ul className="space-y-2">
                      {previewArticles.slice(0, 6).map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 rounded-lg border bg-background/80 p-2 text-sm"
                        >
                          {(a.imageUrl || a.thumbnailUrl) && (
                            <img
                              src={a.imageUrl || a.thumbnailUrl || ""}
                              alt=""
                              className="h-12 w-16 rounded object-cover"
                            />
                          )}
                          <span className="line-clamp-2 flex-1">{a.title}</span>
                          {a.pinned ? (
                            <Badge variant="secondary">مثبت</Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <SheetFooter className="gap-2 sm:justify-start">
                  <Button type="button" variant="outline" onClick={closeEditor}>
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit-smart-block"
                  >
                    {editingBlock ? "حفظ المشهد" : "إنشاء المشهد"}
                  </Button>
                </SheetFooter>
              </form>
            </Form>
          </SheetContent>
        </Sheet>

        {/* Director dialog */}
        <Dialog open={directorOpen} onOpenChange={setDirectorOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-500" />
                المخرج الذكي — اقتراحات الليلة
              </DialogTitle>
              <DialogDescription>
                مشاهد مقترحة من نشاط آخر 24 ساعة. اختر واحداً لمراجعته قبل النشر.
              </DialogDescription>
            </DialogHeader>
            {directorLoading ? (
              <p className="py-8 text-center text-muted-foreground">يحضّر الاقتراحات…</p>
            ) : directorSuggestions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                لا توجد اقتراحات جديدة في الوقت الحالي.
              </p>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                {directorSuggestions.map((s, i) => (
                  <button
                    key={`${s.title}-${i}`}
                    type="button"
                    onClick={() => applySuggestion(s)}
                    className="w-full rounded-xl border p-4 text-right transition hover:border-primary hover:bg-muted/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold" style={{ color: s.color }}>
                          {s.title}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{s.rationale}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="outline">
                            {sourceTypeLabels[s.sourceType] || s.sourceType}
                          </Badge>
                          <Badge variant="secondary">
                            {placementOptions.find((p) => p.value === s.placement)?.label}
                          </Badge>
                          <Badge variant="outline" className="tabular-nums">
                            {s.limitCount} مقالات
                          </Badge>
                        </div>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف المشهد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيختفي المشهد من الصفحة الرئيسية فوراً. لا يمكن التراجع.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
