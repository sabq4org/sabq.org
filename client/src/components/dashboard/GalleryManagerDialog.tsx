import { useState, useMemo, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  X,
  Loader2,
  ImagePlus,
  GripVertical,
  Eye,
  Trash2,
  Check,
  CheckCircle2,
  Paperclip,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MediaLibraryPicker } from "@/components/dashboard/MediaLibraryPicker";
import type { MediaFile } from "@shared/schema";

/**
 * Full-screen gallery manager modal — phase 2 of the album manager
 * overhaul. Where the sidebar card is a quick-glance + reorder surface,
 * this dialog is the editorial command centre: every image at 200pt+
 * thumbnail size, inline alt/caption/source fields right under the
 * image, multi-select for batch operations, and an internal lightbox
 * for full-resolution review. Reuses the same backend endpoints as the
 * sidebar so there's no data divergence.
 */
interface GalleryManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  articleId: string | undefined;
  articleTitle?: string;
  articleContent?: string;
  mediaAssets: any[];
  onRefetch: () => void;
}

interface AssetDraft {
  altText: string;
  captionPlain: string;
  sourceName: string;
  sourceUrl: string;
  rightsStatement: string;
}

const emptyDraft: AssetDraft = {
  altText: "",
  captionPlain: "",
  sourceName: "",
  sourceUrl: "",
  rightsStatement: "",
};

export function GalleryManagerDialog({
  isOpen,
  onClose,
  articleId,
  articleTitle,
  articleContent,
  mediaAssets,
  onRefetch,
}: GalleryManagerDialogProps) {
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({});
  const [lightboxAsset, setLightboxAsset] = useState<any | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);

  // Clear local state whenever the dialog closes so a re-open starts fresh.
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds(new Set());
      setExpandedId(null);
      setDrafts({});
      setLightboxAsset(null);
    }
  }, [isOpen]);

  const sortedAssets = useMemo(
    () =>
      mediaAssets
        .filter((a: any) => a.mediaFile?.url || a.url)
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)),
    [mediaAssets],
  );

  // ─── Mutations ─────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/media-assets/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "تم الحذف" });
      onRefetch();
    },
    onError: () => toast({ title: "فشل الحذف", variant: "destructive" }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (assetIds: string[]) => {
      return apiRequest(`/api/articles/${articleId}/media-assets/reorder`, {
        method: "POST",
        body: JSON.stringify({ assetIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => onRefetch(),
    onError: () =>
      toast({ title: "فشل إعادة الترتيب", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/media-assets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "تم الحفظ" });
      onRefetch();
    },
    onError: () => toast({ title: "فشل الحفظ", variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async (mediaFile: MediaFile) => {
      const maxOrder = mediaAssets.reduce(
        (max: number, a: any) => Math.max(max, a.displayOrder ?? 0),
        0,
      );
      return apiRequest(`/api/articles/${articleId}/media-assets`, {
        method: "POST",
        body: JSON.stringify({
          mediaFileId: mediaFile.id,
          altText: mediaFile.altText || mediaFile.title || "مرفق جديد",
          displayOrder: maxOrder + 1,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({ title: "تمت إضافة الصورة" });
      onRefetch();
      setShowLibrary(false);
    },
    onError: () =>
      toast({ title: "فشل إضافة الصورة", variant: "destructive" }),
  });

  // ─── DnD ─────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedAssets.findIndex((a: any) => a.id === active.id);
    const newIndex = sortedAssets.findIndex((a: any) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(sortedAssets, oldIndex, newIndex);
    reorderMutation.mutate(newOrder.map((a: any) => a.id));
  };

  // ─── Selection ─────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === sortedAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAssets.map((a: any) => a.id)));
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`حذف ${count} مرفقاً؟ لا يمكن التراجع.`)) return;
    // Sequential deletes so the UI/refetch stays consistent. With small
    // batches (<50) the round-trip cost is acceptable; if this becomes a
    // pain point we add a bulk delete endpoint.
    for (const id of Array.from(selectedIds)) {
      // eslint-disable-next-line no-await-in-loop
      await deleteMutation.mutateAsync(id).catch(() => {});
    }
    setSelectedIds(new Set());
  };

  // ─── Inline edit ─────────────────────────────────────────────

  const draftFor = (asset: any): AssetDraft => {
    if (drafts[asset.id]) return drafts[asset.id];
    return {
      altText: asset.altText || "",
      captionPlain: asset.captionPlain || "",
      sourceName: asset.sourceName || "",
      sourceUrl: asset.sourceUrl || "",
      rightsStatement: asset.rightsStatement || "",
    };
  };

  const updateDraft = (id: string, patch: Partial<AssetDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...draftFor({ id, ...prev[id] }), ...patch } as AssetDraft,
    }));
  };

  const saveDraft = (asset: any) => {
    const d = draftFor(asset);
    if (!d.altText.trim()) {
      toast({
        title: "النص البديل مطلوب",
        description: "alt يستخدمه قارئ الشاشة ومحركات البحث.",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate(
      {
        id: asset.id,
        data: {
          altText: d.altText.trim(),
          captionPlain: d.captionPlain.trim() || null,
          sourceName: d.sourceName.trim() || null,
          sourceUrl: d.sourceUrl.trim() || null,
          rightsStatement: d.rightsStatement.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setDrafts((prev) => {
            const next = { ...prev };
            delete next[asset.id];
            return next;
          });
          setExpandedId(null);
        },
      },
    );
  };

  // ─── Render ─────────────────────────────────────────────

  const hasSelection = selectedIds.size > 0;
  const allSelected =
    selectedIds.size > 0 && selectedIds.size === sortedAssets.length;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          className="max-w-7xl w-[95vw] max-h-[95vh] overflow-hidden flex flex-col p-0"
          dir="rtl"
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-xl">إدارة ألبوم المقال</DialogTitle>
                <DialogDescription className="mt-1">
                  {sortedAssets.length === 0
                    ? "لا توجد صور بعد — اضغط «إضافة صورة» لبدء الألبوم."
                    : `${sortedAssets.length} ${
                        sortedAssets.length === 1 ? "صورة" : "صور"
                      }. اسحب لإعادة الترتيب • انقر على بطاقة لتعديل بياناتها • انقر الصورة لمعاينة كاملة.`}
                </DialogDescription>
              </div>
              <Button
                onClick={() => setShowLibrary(true)}
                className="gap-2"
                data-testid="button-gallery-add"
              >
                <ImagePlus className="h-4 w-4" />
                إضافة صورة
              </Button>
            </div>

            {/* Toolbar — appears once anything is selected */}
            {sortedAssets.length > 0 && (
              <div className="flex items-center justify-between gap-3 pt-3 text-sm">
                <button
                  type="button"
                  onClick={selectAll}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                  data-testid="button-gallery-select-all"
                >
                  <Checkbox checked={allSelected} className="pointer-events-none" />
                  <span>
                    {allSelected ? "إلغاء التحديد" : "تحديد الكل"}
                    {hasSelection && ` (${selectedIds.size})`}
                  </span>
                </button>
                {hasSelection && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBulkDelete}
                    className="gap-2"
                    disabled={deleteMutation.isPending}
                    data-testid="button-gallery-bulk-delete"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    حذف {selectedIds.size}
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {sortedAssets.length === 0 ? (
              <EmptyState onAdd={() => setShowLibrary(true)} />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedAssets.map((a: any) => a.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sortedAssets.map((asset: any, index: number) => (
                      <SortableGalleryCard
                        key={asset.id}
                        asset={asset}
                        index={index}
                        isSelected={selectedIds.has(asset.id)}
                        isExpanded={expandedId === asset.id}
                        draft={draftFor(asset)}
                        onToggleSelect={() => toggleSelect(asset.id)}
                        onToggleExpand={() =>
                          setExpandedId((prev) =>
                            prev === asset.id ? null : asset.id,
                          )
                        }
                        onChangeDraft={(patch) => updateDraft(asset.id, patch)}
                        onSave={() => saveDraft(asset)}
                        onCancelEdit={() => {
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[asset.id];
                            return next;
                          });
                          setExpandedId(null);
                        }}
                        onDelete={() => deleteMutation.mutate(asset.id)}
                        onPreview={() => setLightboxAsset(asset)}
                        isSaving={updateMutation.isPending}
                        isDeleting={deleteMutation.isPending}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Internal lightbox — full-screen preview at native aspect ratio */}
      {lightboxAsset && (
        <Dialog open onOpenChange={() => setLightboxAsset(null)}>
          <DialogContent
            className="max-w-5xl w-[95vw] max-h-[95vh] p-0 bg-black"
            dir="rtl"
          >
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={lightboxAsset.mediaFile?.url || lightboxAsset.url}
                alt={lightboxAsset.altText || ""}
                className="max-w-full max-h-[90vh] object-contain"
              />
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-3 left-3 h-9 w-9"
                onClick={() => setLightboxAsset(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              {(lightboxAsset.captionPlain || lightboxAsset.sourceName) && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/85 text-white text-sm p-4 text-center">
                  {lightboxAsset.captionPlain && (
                    <p className="mb-1">{lightboxAsset.captionPlain}</p>
                  )}
                  {lightboxAsset.sourceName && (
                    <p className="text-xs text-white/70">
                      المصدر: {lightboxAsset.sourceName}
                    </p>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Media library picker — nested so the existing upload flow works
       * unchanged. The picker calls onSelect with the chosen MediaFile,
       * which we then turn into an article_media_assets row. */}
      <MediaLibraryPicker
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        onSelect={(media: MediaFile) => addMutation.mutate(media)}
        articleTitle={articleTitle}
        articleContent={articleContent?.substring(0, 500)}
      />
    </>
  );
}

// ─── Empty state ─────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16">
      <div className="rounded-full bg-muted p-6 mb-4">
        <Paperclip className="h-10 w-10 text-muted-foreground/60" />
      </div>
      <h3 className="text-lg font-medium mb-1">لا توجد صور في الألبوم</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        أضف صوراً من مكتبة الوسائط أو ارفع جديدة. كل صورة يمكن أن يكون لها نص بديل + تعريف + مصدر.
      </p>
      <Button onClick={onAdd} className="gap-2">
        <ImagePlus className="h-4 w-4" />
        إضافة أول صورة
      </Button>
    </div>
  );
}

// ─── Sortable card ─────────────────────────────────────────────

interface SortableGalleryCardProps {
  asset: any;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  draft: AssetDraft;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onChangeDraft: (patch: Partial<AssetDraft>) => void;
  onSave: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  isSaving: boolean;
  isDeleting: boolean;
}

function SortableGalleryCard({
  asset,
  index,
  isSelected,
  isExpanded,
  draft,
  onToggleSelect,
  onToggleExpand,
  onChangeDraft,
  onSave,
  onCancelEdit,
  onDelete,
  onPreview,
  isSaving,
  isDeleting,
}: SortableGalleryCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: asset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const imageUrl = asset.mediaFile?.url || asset.url;
  const hasCaption = !!asset.captionPlain;
  const hasAlt = !!asset.altText;
  const hasSource = !!asset.sourceName;
  const isComplete = hasCaption && hasAlt;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden flex flex-col transition-all ${
        isDragging ? "ring-2 ring-primary shadow-xl" : ""
      } ${isSelected ? "ring-2 ring-primary" : ""} ${
        isExpanded ? "shadow-lg" : ""
      }`}
      data-testid={`gallery-card-${index}`}
    >
      {/* Thumbnail with overlays */}
      <div className="relative aspect-[4/3] bg-muted/30 group">
        <img
          src={imageUrl}
          alt={asset.altText || `صورة ${index + 1}`}
          className="w-full h-full object-cover cursor-zoom-in"
          loading="lazy"
          onClick={onPreview}
        />

        {/* Top-left: selection checkbox + index badge */}
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            className={`h-7 w-7 rounded-md flex items-center justify-center border-2 transition-colors ${
              isSelected
                ? "bg-primary border-primary text-primary-foreground"
                : "bg-white/90 border-white/70 hover:bg-white"
            }`}
            data-testid={`gallery-select-${index}`}
          >
            {isSelected && <Check className="h-4 w-4" />}
          </button>
          <div className="bg-black/70 text-white text-xs font-medium px-2 py-1 rounded-md">
            {index + 1}
          </div>
        </div>

        {/* Top-right: drag handle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              {...attributes}
              {...listeners}
              className="absolute top-2 left-2 bg-black/70 text-white p-1.5 rounded-md cursor-grab active:cursor-grabbing hover:bg-black/90"
              data-testid={`gallery-drag-${index}`}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">اسحب لإعادة الترتيب</TooltipContent>
        </Tooltip>

        {/* Bottom: preview + delete on hover */}
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex justify-between items-center pointer-events-none">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="pointer-events-auto bg-white/95 hover:bg-white text-foreground text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5"
            data-testid={`gallery-preview-${index}`}
          >
            <Eye className="h-3.5 w-3.5" />
            معاينة
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("حذف هذه الصورة؟")) onDelete();
            }}
            disabled={isDeleting}
            className="pointer-events-auto bg-destructive/95 hover:bg-destructive text-destructive-foreground text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5"
            data-testid={`gallery-delete-${index}`}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            حذف
          </button>
        </div>
      </div>

      {/* Card body — toggles between "summary chips" and "edit fields" */}
      <div className="p-3 space-y-2 flex-1">
        {!isExpanded ? (
          <>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant={hasAlt ? "secondary" : "destructive"}
                className="text-[10px]"
              >
                {hasAlt ? "alt ✓" : "alt مفقود"}
              </Badge>
              <Badge
                variant={hasCaption ? "secondary" : "outline"}
                className="text-[10px]"
              >
                {hasCaption ? "تعريف ✓" : "بدون تعريف"}
              </Badge>
              {hasSource && (
                <Badge variant="secondary" className="text-[10px]">
                  مصدر ✓
                </Badge>
              )}
              {isComplete && hasSource && (
                <Badge className="text-[10px] bg-emerald-600">
                  <CheckCircle2 className="h-2.5 w-2.5 ml-0.5" />
                  مكتمل
                </Badge>
              )}
            </div>
            <p
              className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5rem]"
              title={asset.captionPlain || asset.altText || ""}
            >
              {asset.captionPlain ||
                asset.altText ||
                "اضغط «تعديل» لإضافة النص البديل والتعريف"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onToggleExpand}
              data-testid={`gallery-edit-${index}`}
            >
              تعديل
            </Button>
          </>
        ) : (
          <div className="space-y-2.5">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                النص البديل <span className="text-destructive">*</span>
              </label>
              <Input
                value={draft.altText}
                onChange={(e) => onChangeDraft({ altText: e.target.value })}
                placeholder="وصف موجز للصورة"
                className="text-xs h-8"
                data-testid={`gallery-input-alt-${index}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                التعريف (Caption)
              </label>
              <Textarea
                value={draft.captionPlain}
                onChange={(e) => onChangeDraft({ captionPlain: e.target.value })}
                placeholder="النص الذي يظهر تحت الصورة"
                rows={2}
                className="text-xs"
                data-testid={`gallery-input-caption-${index}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                المصدر
              </label>
              <Input
                value={draft.sourceName}
                onChange={(e) => onChangeDraft({ sourceName: e.target.value })}
                placeholder="مثلاً: واس"
                className="text-xs h-8"
                data-testid={`gallery-input-source-${index}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                رابط المصدر
              </label>
              <Input
                value={draft.sourceUrl}
                onChange={(e) => onChangeDraft({ sourceUrl: e.target.value })}
                placeholder="https://..."
                type="url"
                className="text-xs h-8"
                data-testid={`gallery-input-source-url-${index}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">
                حقوق النشر
              </label>
              <Input
                value={draft.rightsStatement}
                onChange={(e) =>
                  onChangeDraft({ rightsStatement: e.target.value })
                }
                placeholder="© 2026 ..."
                className="text-xs h-8"
                data-testid={`gallery-input-rights-${index}`}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                className="flex-1"
                onClick={onSave}
                disabled={isSaving}
                data-testid={`gallery-save-${index}`}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "حفظ"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={onCancelEdit}
                data-testid={`gallery-cancel-${index}`}
              >
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
