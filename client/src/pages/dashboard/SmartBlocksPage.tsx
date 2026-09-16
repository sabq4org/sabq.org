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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-3 backdrop-blur-sm transition-all",
        isDragging && "z-20 scale-[1.02] shadow-xl ring-2 ring-sky-400/40",
        !block.isActive && "opacity-60",
      )}
      data-testid={`stage-card-${block.id}`}
    >
      <button
        type="button"
        className="mt-1 cursor-grab text-slate-400 hover:text-slate-200 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label="سحب لإعادة الترتيب"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div
        className="w-1.5 self-stretch rounded-full"
        style={{ backgroundColor: block.color }}
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-50">{block.title}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="bg-slate-800 text-slate-200">
                {sourceTypeLabels[block.sourceType || "keyword"] || block.sourceType}
              </Badge>
              <Badge variant="outline" className="border-slate-600 text-slate-300">
                {layoutStyleOptions.find((l) => l.value === block.layoutStyle)?.label ||
                  block.layoutStyle}
              </Badge>
              {block.playbook ? (
                <Badge className="bg-amber-500/20 text-amber-200">{block.playbook}</Badge>
              ) : null}
              {block.scheduleStartAt || block.scheduleEndAt ? (
                <Badge className="bg-sky-500/15 text-sky-200">
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
              ? `مصدر: ${block.keyword}`
              : `${block.limitCount} مقالات · ${block.minArticles || 1} حد أدنى`)}
        </p>

        <div className="flex gap-1 opacity-90 transition-opacity group-hover:opacity-100">
          <Button size="sm" variant="ghost" className="h-8 text-slate-200" onClick={onEdit}>
            <Pencil className="ml-1 h-3.5 w-3.5" />
            تحرير
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-rose-300 hover:text-rose-200"
            onClick={onDelete}
          >
            <Trash2 className="ml-1 h-3.5 w-3.5" />
            حذف
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SmartBlocksPage() {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<SmartBlock | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewArticles, setPreviewArticles] = useState<PreviewArticle[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

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
      <div
        className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6"
        dir="rtl"
      >
        <DashboardPageHeader
          icon={Clapperboard}
          title="مسرح الصفحة الرئيسية"
          description="إدارة المشاهد التحريرية الحية على الصفحة الرئيسية — ترتيب، جدولة، ومخرج يقترح التركيب"
          titleTestId="heading-smart-blocks"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setDirectorOpen(true)}
                data-testid="button-director-suggest"
              >
                <Sparkles className="ml-2 h-4 w-4" />
                اقترح مشهد الليلة
              </Button>
              <Button onClick={() => openCreate()} data-testid="button-create-smart-block">
                <Plus className="ml-2 h-4 w-4" />
                مشهد جديد
              </Button>
            </div>
          }
        />

        {/* Pulse strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "إجمالي المشاهد", value: summary?.total ?? blocks.length, testId: "stat-total" },
            { label: "حية الآن", value: summary?.active ?? 0, testId: "stat-active", accent: "text-emerald-600" },
            { label: "مجدولة", value: summary?.scheduled ?? 0, testId: "stat-scheduled", accent: "text-sky-600" },
            { label: "متوقفة", value: summary?.inactive ?? 0, testId: "stat-inactive" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border bg-gradient-to-br from-slate-50 to-white p-4 dark:from-slate-900 dark:to-slate-950"
              data-testid={s.testId}
            >
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("mt-1 text-3xl font-bold tracking-tight", s.accent)}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Playbooks */}
        {(summary?.playbooks?.length || 0) > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-amber-50/60 p-3 dark:bg-amber-950/20">
            <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
              سيناريوهات الصفحة:
            </span>
            {summary!.playbooks.map((pb) => (
              <Button
                key={pb.key}
                size="sm"
                variant="outline"
                className="border-amber-300"
                onClick={() => activatePlaybookMutation.mutate(pb.key)}
                disabled={activatePlaybookMutation.isPending}
              >
                <Power className="ml-1 h-3.5 w-3.5" />
                {pb.key}
                <Badge variant="secondary" className="mr-2">
                  {pb.activeCount}/{pb.blockCount}
                </Badge>
              </Button>
            ))}
          </div>
        )}

        {/* Homepage Stage */}
        <section
          className="overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(ellipse_at_top,_#0f2744_0%,_#020617_55%,_#000_100%)] p-4 text-slate-100 shadow-2xl sm:p-6"
          data-testid="homepage-stage"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-sky-300/80">
                Homepage Stage
              </p>
              <h2 className="text-xl font-bold text-white">خريطة الصفحة من الأعلى للأسفل</h2>
            </div>
            <Blocks className="h-6 w-6 text-sky-300/70" />
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-slate-400">جاري تحميل المسرح…</p>
          ) : (
            <div className="space-y-5">
              {placementOptions.map((placement, idx) => {
                const shelfBlocks = blocksByPlacement[placement.value] || [];
                return (
                  <div key={placement.value} className="relative">
                    {idx > 0 && (
                      <div className="absolute -top-3 right-6 h-3 w-px bg-gradient-to-b from-transparent via-sky-400/40 to-transparent" />
                    )}
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-xs text-sky-200">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">{placement.label}</p>
                          <p className="text-[11px] text-slate-400">رف «{placement.shelf}»</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-sky-200 hover:bg-sky-500/10 hover:text-white"
                        onClick={() => openCreate(placement.value)}
                      >
                        <Plus className="ml-1 h-3.5 w-3.5" />
                        أضف هنا
                      </Button>
                    </div>

                    <div className="min-h-[72px] rounded-2xl border border-dashed border-slate-600/70 bg-slate-950/30 p-3">
                      {shelfBlocks.length === 0 ? (
                        <p className="py-6 text-center text-sm text-slate-500">
                          رف فارغ — اسحب مشهداً أو أنشئ واحداً جديداً
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
                            <div className="space-y-2">
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
                                "rounded-full border px-3 py-1 text-xs transition-colors",
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
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-y-auto">
                {(directorData?.suggestions || []).map((s, i) => (
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
      </div>
    </DashboardLayout>
  );
}
