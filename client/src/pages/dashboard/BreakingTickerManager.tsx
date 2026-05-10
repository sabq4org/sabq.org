import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Plus,
  Trash2,
  Loader2,
  GripVertical,
  Power,
  PowerOff,
  Link as LinkIcon,
  X,
  ChevronUp,
  ChevronDown,
  Newspaper,
  Zap,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type TickerTopic = {
  id: string;
  topicTitle: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type TickerHeadline = {
  id: string;
  topicId: string;
  headline: string;
  linkedArticleId?: string | null;
  linkedArticleTitle?: string | null;
  linkedArticleSlug?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
};

type ArticleSearchResult = {
  id: string;
  title: string;
  slug: string;
};

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

function SortableHeadlineRow({
  headline,
  onUpdate,
  onDelete,
  isUpdating,
}: {
  headline: TickerHeadline;
  onUpdate: (id: string, data: Partial<TickerHeadline>) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
}) {
  const [headlineText, setHeadlineText] = useState(headline.headline);
  const [articleSearchTerm, setArticleSearchTerm] = useState("");
  const [showArticleDropdown, setShowArticleDropdown] = useState(false);
  const debouncedSearch = useDebounce(articleSearchTerm, 300);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: headline.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const { data: articleResults, isLoading: isSearching } = useQuery<ArticleSearchResult[]>({
    queryKey: ['/api/articles/search-simple', debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) return [];
      const res = await fetch(`/api/articles/search-simple?q=${encodeURIComponent(debouncedSearch)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedSearch.length >= 2,
  });

  const handleHeadlineBlur = () => {
    if (headlineText !== headline.headline) {
      onUpdate(headline.id, { headline: headlineText });
    }
  };

  const handleSelectArticle = (article: ArticleSearchResult) => {
    onUpdate(headline.id, {
      linkedArticleId: article.id,
      linkedArticleTitle: article.title,
      linkedArticleSlug: article.slug,
    });
    setArticleSearchTerm("");
    setShowArticleDropdown(false);
  };

  const handleClearLink = () => {
    onUpdate(headline.id, {
      linkedArticleId: null,
      linkedArticleTitle: null,
      linkedArticleSlug: null,
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 border rounded-md bg-card mb-2"
      data-testid={`headline-row-${headline.id}`}
    >
      <div
        className="cursor-grab active:cursor-grabbing text-muted-foreground"
        {...attributes}
        {...listeners}
        data-testid={`drag-handle-${headline.id}`}
      >
        <GripVertical className="h-5 w-5" />
      </div>

      <div className="flex-1 space-y-2">
        <Input
          value={headlineText}
          onChange={(e) => setHeadlineText(e.target.value)}
          onBlur={handleHeadlineBlur}
          placeholder="نص العنوان العاجل..."
          className="text-right"
          disabled={isUpdating}
          data-testid={`input-headline-text-${headline.id}`}
        />

        <div className="relative">
          {headline.linkedArticleId ? (
            <div className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
              <LinkIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 truncate text-right" data-testid={`text-linked-article-${headline.id}`}>
                {headline.linkedArticleTitle || headline.linkedArticleId}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleClearLink}
                disabled={isUpdating}
                data-testid={`button-clear-link-${headline.id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                value={articleSearchTerm}
                onChange={(e) => {
                  setArticleSearchTerm(e.target.value);
                  setShowArticleDropdown(true);
                }}
                onFocus={() => setShowArticleDropdown(true)}
                placeholder="ربط بمقال... (اكتب للبحث)"
                className="text-right"
                disabled={isUpdating}
                data-testid={`input-article-search-${headline.id}`}
              />
              {showArticleDropdown && articleSearchTerm.length >= 2 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {isSearching ? (
                    <div className="p-3 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    </div>
                  ) : articleResults && articleResults.length > 0 ? (
                    articleResults.map((article) => (
                      <button
                        key={article.id}
                        onClick={() => handleSelectArticle(article)}
                        className="w-full p-2 text-right hover:bg-accent text-sm"
                        data-testid={`article-option-${article.id}`}
                      >
                        {article.title}
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-center text-muted-foreground text-sm">
                      لا توجد نتائج
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Button
        size="icon"
        variant="ghost"
        onClick={() => onDelete(headline.id)}
        disabled={isUpdating}
        className="text-destructive hover:text-destructive"
        data-testid={`button-delete-headline-${headline.id}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function BreakingTickerManager() {
  useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [deletingTopic, setDeletingTopic] = useState<TickerTopic | null>(null);
  const [deletingHeadline, setDeletingHeadline] = useState<TickerHeadline | null>(null);
  const [localHeadlines, setLocalHeadlines] = useState<TickerHeadline[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const { data: topics, isLoading: isLoadingTopics } = useQuery<TickerTopic[]>({
    queryKey: ['/api/admin/breaking-ticker/topics'],
  });

  const { data: selectedTopic, isLoading: isLoadingTopic } = useQuery<{
    topic: TickerTopic;
    headlines: TickerHeadline[];
  }>({
    queryKey: ['/api/admin/breaking-ticker/topics', selectedTopicId],
    enabled: !!selectedTopicId,
  });

  useEffect(() => {
    if (selectedTopic?.headlines) {
      setLocalHeadlines([...selectedTopic.headlines].sort((a, b) => a.orderIndex - b.orderIndex));
    }
  }, [selectedTopic]);

  const createTopicMutation = useMutation({
    mutationFn: async (topicTitle: string) => {
      return await apiRequest('/api/admin/breaking-ticker/topics', {
        method: 'POST',
        body: JSON.stringify({ topicTitle }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics'] });
      setIsCreateDialogOpen(false);
      setNewTopicTitle("");
      toast({ title: "تم إنشاء الموضوع بنجاح" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الموضوع",
        variant: "destructive",
      });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/topics/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics'] });
      if (selectedTopicId === deletingTopic?.id) {
        setSelectedTopicId(null);
      }
      setDeletingTopic(null);
      toast({ title: "تم حذف الموضوع بنجاح" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الموضوع",
        variant: "destructive",
      });
    },
  });

  const activateTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/topics/${id}/activate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics'] });
      toast({ title: "تم تفعيل الموضوع" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تفعيل الموضوع",
        variant: "destructive",
      });
    },
  });

  const deactivateTopicMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/topics/${id}/deactivate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics'] });
      toast({ title: "تم إيقاف الموضوع" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إيقاف الموضوع",
        variant: "destructive",
      });
    },
  });

  const createHeadlineMutation = useMutation({
    mutationFn: async (topicId: string) => {
      return await apiRequest('/api/admin/breaking-ticker/headlines', {
        method: 'POST',
        body: JSON.stringify({
          topicId,
          headline: "عنوان جديد",
          orderIndex: localHeadlines.length,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics', selectedTopicId] });
      toast({ title: "تم إضافة العنوان" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إضافة العنوان",
        variant: "destructive",
      });
    },
  });

  const updateHeadlineMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TickerHeadline> }) => {
      return await apiRequest(`/api/admin/breaking-ticker/headlines/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics', selectedTopicId] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث العنوان",
        variant: "destructive",
      });
    },
  });

  const deleteHeadlineMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/breaking-ticker/headlines/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics', selectedTopicId] });
      setDeletingHeadline(null);
      toast({ title: "تم حذف العنوان" });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف العنوان",
        variant: "destructive",
      });
    },
  });

  const reorderHeadlinesMutation = useMutation({
    mutationFn: async (headlines: { id: string; orderIndex: number }[]) => {
      await Promise.all(
        headlines.map((h) =>
          apiRequest(`/api/admin/breaking-ticker/headlines/${h.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ orderIndex: h.orderIndex }),
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/breaking-ticker/topics', selectedTopicId] });
    },
  });

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = localHeadlines.findIndex((h) => h.id === active.id);
        const newIndex = localHeadlines.findIndex((h) => h.id === over.id);

        const newHeadlines = arrayMove(localHeadlines, oldIndex, newIndex);
        setLocalHeadlines(newHeadlines);

        const reorderedData = newHeadlines.map((h, idx) => ({
          id: h.id,
          orderIndex: idx,
        }));
        reorderHeadlinesMutation.mutate(reorderedData);
      }
    },
    [localHeadlines, reorderHeadlinesMutation]
  );

  const handleUpdateHeadline = (id: string, data: Partial<TickerHeadline>) => {
    updateHeadlineMutation.mutate({ id, data });
  };

  const handleDeleteHeadline = (id: string) => {
    const headline = localHeadlines.find((h) => h.id === id);
    if (headline) {
      setDeletingHeadline(headline);
    }
  };

  const canAddMoreHeadlines = localHeadlines.length < 5;

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">
                إدارة شريط الأخبار العاجلة
              </h1>
              <p className="text-muted-foreground text-sm">
                إدارة مواضيع وعناوين الأخبار العاجلة
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            data-testid="button-create-topic"
          >
            <Plus className="h-4 w-4 ml-2" />
            موضوع جديد
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              المواضيع
            </h2>

            {isLoadingTopics ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !topics || topics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-md">
                لا توجد مواضيع. أنشئ موضوعاً جديداً للبدء.
              </div>
            ) : (
              <div className="space-y-2">
                {topics.map((topic) => (
                  <div
                    key={topic.id}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      selectedTopicId === topic.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedTopicId(topic.id)}
                    data-testid={`topic-row-${topic.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-medium truncate" data-testid={`text-topic-title-${topic.id}`}>
                          {topic.topicTitle}
                        </span>
                        {topic.isActive && (
                          <Badge variant="default" className="shrink-0 bg-green-600" data-testid={`badge-active-${topic.id}`}>
                            مفعّل
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {topic.isActive ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deactivateTopicMutation.mutate(topic.id);
                            }}
                            disabled={deactivateTopicMutation.isPending}
                            title="إيقاف"
                            data-testid={`button-deactivate-${topic.id}`}
                          >
                            <PowerOff className="h-4 w-4 text-orange-500" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              activateTopicMutation.mutate(topic.id);
                            }}
                            disabled={activateTopicMutation.isPending}
                            title="تفعيل"
                            data-testid={`button-activate-${topic.id}`}
                          >
                            <Power className="h-4 w-4 text-green-500" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingTopic(topic);
                          }}
                          className="text-destructive hover:text-destructive"
                          data-testid={`button-delete-topic-${topic.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-3">العناوين</h2>

            {!selectedTopicId ? (
              <div className="text-center py-12 text-muted-foreground border rounded-md">
                اختر موضوعاً من القائمة لإدارة عناوينه
              </div>
            ) : isLoadingTopic ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {localHeadlines.length} / 5 عناوين
                  </span>
                  <Button
                    size="sm"
                    onClick={() => selectedTopicId && createHeadlineMutation.mutate(selectedTopicId)}
                    disabled={!canAddMoreHeadlines || createHeadlineMutation.isPending}
                    data-testid="button-add-headline"
                  >
                    <Plus className="h-4 w-4 ml-1" />
                    إضافة عنوان
                  </Button>
                </div>

                {localHeadlines.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-md">
                    لا توجد عناوين. أضف عنواناً للبدء.
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localHeadlines.map((h) => h.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localHeadlines.map((headline) => (
                        <SortableHeadlineRow
                          key={headline.id}
                          headline={headline}
                          onUpdate={handleUpdateHeadline}
                          onDelete={handleDeleteHeadline}
                          isUpdating={updateHeadlineMutation.isPending}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            )}
          </div>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="text-create-dialog-title">موضوع جديد</DialogTitle>
              <DialogDescription>
                أدخل عنوان الموضوع الجديد للأخبار العاجلة
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={newTopicTitle}
                onChange={(e) => setNewTopicTitle(e.target.value)}
                placeholder="عنوان الموضوع..."
                className="text-right"
                data-testid="input-new-topic-title"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                data-testid="button-cancel-create"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => createTopicMutation.mutate(newTopicTitle)}
                disabled={!newTopicTitle.trim() || createTopicMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createTopicMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                إنشاء
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deletingTopic} onOpenChange={() => setDeletingTopic(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="text-delete-topic-dialog-title">
                تأكيد الحذف
              </AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف الموضوع "{deletingTopic?.topicTitle}"؟ سيتم حذف جميع العناوين المرتبطة به.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete-topic">
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingTopic && deleteTopicMutation.mutate(deletingTopic.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-topic"
              >
                {deleteTopicMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!deletingHeadline} onOpenChange={() => setDeletingHeadline(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="text-delete-headline-dialog-title">
                تأكيد حذف العنوان
              </AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا العنوان؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete-headline">
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingHeadline && deleteHeadlineMutation.mutate(deletingHeadline.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-headline"
              >
                {deleteHeadlineMutation.isPending && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
