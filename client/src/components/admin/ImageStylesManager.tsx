/**
 * إدارة أنماط توليد الصور — قسم داخل صفحة «التوليد التلقائي للصور»
 *
 * يدير سجلّ الأنماط المركزي (GET/PUT /api/admin/image-styles):
 * إضافة/تعديل/تعطيل/ترتيب/تعيين الافتراضي + النموذج الافتراضي للتوليد
 * + التوجيهات السياقية (مثل الواقعية الغذائية/الطبية).
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Loader2,
  Save,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Star,
  Sparkles,
} from "lucide-react";
import { STYLE_ICONS } from "@/components/ImageStyleSelector";
import {
  KNOWN_IMAGE_MODELS,
  imageAspectRatios,
  imageSizes,
  type ImageStyle,
  type ImageStyleContextVariant,
  type ImageStyleSettings,
} from "@shared/imageStyles";

const ICON_OPTIONS = Object.keys(STYLE_ICONS);

const EMPTY_STYLE: ImageStyle = {
  slug: "",
  nameAr: "",
  description: "",
  icon: "sparkles",
  enabled: true,
  sortOrder: 0,
  isDefault: false,
  stylePrompt: "",
  contextVariants: [],
};

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-8 w-1 rounded-full bg-border" />
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
    </div>
  );
}

export function ImageStylesManager() {
  const { data: settingsRaw, isLoading } = useQuery<ImageStyleSettings>({
    queryKey: ["/api/admin/image-styles"],
  });

  const [settings, setSettings] = useState<ImageStyleSettings | null>(null);
  // فهرس النمط قيد التحرير في القائمة المحلية، أو "new" لنمط جديد
  const [editing, setEditing] = useState<{ index: number | "new" } | null>(null);
  const [draft, setDraft] = useState<ImageStyle>(EMPTY_STYLE);

  useEffect(() => {
    if (settingsRaw && Array.isArray(settingsRaw.styles)) {
      setSettings(settingsRaw);
    }
  }, [settingsRaw]);

  const saveMutation = useMutation({
    mutationFn: async (payload: ImageStyleSettings) => {
      return apiRequest("/api/admin/image-styles", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data: any) => {
      toast({ title: "تم حفظ أنماط توليد الصور" });
      if (data?.settings) setSettings(data.settings);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/image-styles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/image-styles"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في حفظ الأنماط",
        description: error.message || "تحقق من اكتمال حقول الأنماط",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !settings) {
    return (
      <Card className="border-border/70 bg-card">
        <CardContent className="flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const styles = settings.styles;
  const enabledCount = styles.filter((s) => s.enabled).length;

  const updateStyles = (next: ImageStyle[]) => {
    setSettings({ ...settings, styles: next });
  };

  const moveStyle = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= styles.length) return;
    const next = [...styles];
    [next[index], next[target]] = [next[target], next[index]];
    updateStyles(next.map((s, i) => ({ ...s, sortOrder: i + 1 })));
  };

  const toggleStyle = (index: number, enabled: boolean) => {
    if (!enabled && enabledCount <= 1 && styles[index].enabled) {
      toast({
        title: "لا يمكن تعطيل آخر نمط مفعّل",
        description: "يجب أن يبقى نمط واحد على الأقل متاحًا للمحررين",
        variant: "destructive",
      });
      return;
    }
    const next = styles.map((s, i) => (i === index ? { ...s, enabled } : s));
    // تعطيل النمط الافتراضي ينقل الوسم لأول مفعّل (الخادم يطبّع أيضًا)
    if (!enabled && styles[index].isDefault) {
      const firstEnabled = next.findIndex((s) => s.enabled);
      updateStyles(next.map((s, i) => ({ ...s, isDefault: i === firstEnabled })));
      return;
    }
    updateStyles(next);
  };

  const setDefaultStyle = (index: number) => {
    if (!styles[index].enabled) {
      toast({ title: "فعّل النمط أولًا قبل جعله الافتراضي", variant: "destructive" });
      return;
    }
    updateStyles(styles.map((s, i) => ({ ...s, isDefault: i === index })));
  };

  const deleteStyle = (index: number) => {
    if (styles.length <= 1) {
      toast({
        title: "لا يمكن حذف آخر نمط",
        description: "أضف نمطًا بديلًا أولًا",
        variant: "destructive",
      });
      return;
    }
    const next = styles.filter((_, i) => i !== index);
    if (styles[index].isDefault) {
      const firstEnabled = next.findIndex((s) => s.enabled);
      next.forEach((s, i) => (s.isDefault = i === (firstEnabled === -1 ? 0 : firstEnabled)));
    }
    updateStyles(next);
  };

  const openEditor = (index: number | "new") => {
    if (index === "new") {
      setDraft({ ...EMPTY_STYLE, sortOrder: styles.length + 1, contextVariants: [] });
    } else {
      setDraft(JSON.parse(JSON.stringify(styles[index])));
    }
    setEditing({ index });
  };

  const commitDraft = () => {
    if (!draft.slug.trim() || !draft.nameAr.trim() || !draft.stylePrompt.trim()) {
      toast({
        title: "حقول ناقصة",
        description: "المعرّف والاسم ونص الأسلوب حقول إلزامية",
        variant: "destructive",
      });
      return;
    }
    if (!/^[a-z0-9-]+$/.test(draft.slug)) {
      toast({
        title: "معرّف غير صالح",
        description: "المعرّف بأحرف لاتينية صغيرة وأرقام وشرطات فقط (مثل: cinematic)",
        variant: "destructive",
      });
      return;
    }
    const duplicate = styles.some(
      (s, i) => s.slug === draft.slug && (editing?.index === "new" || i !== editing?.index)
    );
    if (duplicate) {
      toast({ title: "المعرّف مستخدم لنمط آخر", variant: "destructive" });
      return;
    }

    if (editing?.index === "new") {
      updateStyles([...styles, draft]);
    } else if (editing) {
      updateStyles(styles.map((s, i) => (i === editing.index ? draft : s)));
    }
    setEditing(null);
  };

  const updateDraftVariant = (
    vIndex: number,
    patch: Partial<ImageStyleContextVariant>
  ) => {
    setDraft({
      ...draft,
      contextVariants: draft.contextVariants.map((v, i) =>
        i === vIndex ? { ...v, ...patch } : v
      ),
    });
  };

  return (
    <Card className="border-border/70 bg-card">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionHeader title="أنماط توليد الصور" />
            <p className="-mt-2 mb-4 text-sm text-muted-foreground">
              الأنماط التي يختار منها المحرر عند توليد صورة (واقعية، رسومية، توضيحية…)
              — تُطبّق على التوليد اليدوي من المحرر والتوليد التلقائي معًا.
            </p>
          </div>
          <Button
            onClick={() => saveMutation.mutate(settings)}
            disabled={saveMutation.isPending}
            className="gap-2 shrink-0"
            data-testid="button-save-image-styles"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ الأنماط
          </Button>
        </div>

        {/* النموذج الافتراضي للتوليد */}
        <div className="mb-6 max-w-md space-y-2">
          <Label className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            نموذج التوليد الافتراضي
          </Label>
          <Select
            value={settings.defaultModel}
            onValueChange={(value) => setSettings({ ...settings, defaultModel: value })}
          >
            <SelectTrigger data-testid="select-default-model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KNOWN_IMAGE_MODELS.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
              {!KNOWN_IMAGE_MODELS.some((m) => m.id === settings.defaultModel) && (
                <SelectItem value={settings.defaultModel}>{settings.defaultModel}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            يُستخدم لكل التوليد ما لم يحدد النمط نموذجًا خاصًا. عند تعذّر النموذج
            يتراجع النظام تلقائيًا إلى Nano Banana Pro.
          </p>
        </div>

        <Separator className="mb-6" />

        {/* قائمة الأنماط */}
        <div className="space-y-3">
          {styles.map((style, index) => {
            const Icon = STYLE_ICONS[style.icon || ""] || Sparkles;
            return (
              <div
                key={style.slug}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                  style.enabled ? "bg-muted/20" : "bg-muted/50 opacity-70"
                }`}
                data-testid={`image-style-row-${style.slug}`}
              >
                <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{style.nameAr}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]" dir="ltr">
                      {style.slug}
                    </code>
                    {style.isDefault && (
                      <Badge className="gap-1 text-[10px]">
                        <Star className="h-3 w-3" /> افتراضي
                      </Badge>
                    )}
                    {!style.enabled && (
                      <Badge variant="secondary" className="text-[10px]">
                        معطّل
                      </Badge>
                    )}
                    {style.contextVariants.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {style.contextVariants.length} توجيه سياقي
                      </Badge>
                    )}
                  </div>
                  {style.description && (
                    <p className="truncate text-xs text-muted-foreground">{style.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveStyle(index, -1)}
                    disabled={index === 0}
                    aria-label="تقديم النمط"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => moveStyle(index, 1)}
                    disabled={index === styles.length - 1}
                    aria-label="تأخير النمط"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  {!style.isDefault && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDefaultStyle(index)}
                      aria-label="تعيين كافتراضي"
                      title="تعيين كافتراضي"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditor(index)}
                    aria-label="تعديل النمط"
                    data-testid={`button-edit-style-${style.slug}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteStyle(index)}
                    aria-label="حذف النمط"
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Switch
                    checked={style.enabled}
                    onCheckedChange={(checked) => toggleStyle(index, checked)}
                    aria-label="تفعيل النمط"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <Button
          variant="outline"
          className="mt-4 gap-2"
          onClick={() => openEditor("new")}
          data-testid="button-add-style"
        >
          <Plus className="h-4 w-4" /> إضافة نمط جديد
        </Button>

        <p className="mt-3 text-xs text-muted-foreground">
          التغييرات محلية حتى الضغط على «حفظ الأنماط». الحذف والتعطيل محميان:
          يبقى دائمًا نمط مفعّل وافتراضي واحد على الأقل.
        </p>

        {/* حوار تحرير/إضافة نمط */}
        <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {editing?.index === "new" ? "إضافة نمط جديد" : `تعديل النمط: ${draft.nameAr}`}
              </DialogTitle>
              <DialogDescription>
                نص الأسلوب بالإنجليزية موجّه للنموذج — وصف «كيف تبدو الصورة» لا مضمونها.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>المعرّف الداخلي (slug)</Label>
                  <Input
                    dir="ltr"
                    value={draft.slug}
                    disabled={editing?.index !== "new"}
                    onChange={(e) => setDraft({ ...draft, slug: e.target.value.trim() })}
                    placeholder="cinematic"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الاسم الظاهر للمحرر</Label>
                  <Input
                    value={draft.nameAr}
                    onChange={(e) => setDraft({ ...draft, nameAr: e.target.value })}
                    placeholder="سينمائي"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الوصف القصير</Label>
                  <Input
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="إضاءة درامية وكادر سينمائي"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الأيقونة</Label>
                  <Select
                    value={draft.icon || "sparkles"}
                    onValueChange={(value) => setDraft({ ...draft, icon: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map((icon) => (
                        <SelectItem key={icon} value={icon}>
                          {icon}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>نص الأسلوب (Style Prompt)</Label>
                <Textarea
                  dir="ltr"
                  className="min-h-[100px] font-mono text-xs"
                  value={draft.stylePrompt}
                  onChange={(e) => setDraft({ ...draft, stylePrompt: e.target.value })}
                  placeholder="cinematic photography, dramatic lighting, anamorphic lens..."
                />
              </div>

              <div className="space-y-1.5">
                <Label>Negative Prompt (اختياري)</Label>
                <Textarea
                  dir="ltr"
                  className="min-h-[60px] font-mono text-xs"
                  value={draft.negativePrompt || ""}
                  onChange={(e) =>
                    setDraft({ ...draft, negativePrompt: e.target.value || undefined })
                  }
                  placeholder="cartoon, low quality, blurry..."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>نسبة العرض المبدئية</Label>
                  <Select
                    value={draft.params?.aspectRatio || "inherit"}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        params: {
                          ...draft.params,
                          aspectRatio: value === "inherit" ? undefined : (value as any),
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">حسب اختيار المحرر</SelectItem>
                      {imageAspectRatios.map((ratio) => (
                        <SelectItem key={ratio} value={ratio}>
                          {ratio}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>الدقة المبدئية</Label>
                  <Select
                    value={draft.params?.imageSize || "inherit"}
                    onValueChange={(value) =>
                      setDraft({
                        ...draft,
                        params: {
                          ...draft.params,
                          imageSize: value === "inherit" ? undefined : (value as any),
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">حسب اختيار المحرر</SelectItem>
                      {imageSizes.map((size) => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>نموذج خاص بالنمط (اختياري)</Label>
                  <Input
                    dir="ltr"
                    className="font-mono text-xs"
                    value={draft.params?.model || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        params: { ...draft.params, model: e.target.value || undefined },
                      })
                    }
                    placeholder="يرث النموذج الافتراضي"
                  />
                </div>
              </div>

              <Separator />

              {/* التوجيهات السياقية */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">توجيهات سياقية حسب تصنيف الخبر</Label>
                    <p className="text-xs text-muted-foreground">
                      عندما يطابق تصنيف الخبر إحدى القوائم يُستبدل نص الأسلوب بنص متخصص
                      (مثال: الواقعية الغذائية/الطبية).
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        contextVariants: [
                          ...draft.contextVariants,
                          {
                            slug: `variant-${draft.contextVariants.length + 1}`,
                            label: "",
                            enabled: true,
                            categories: [],
                            stylePrompt: "",
                          },
                        ],
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> إضافة توجيه
                  </Button>
                </div>

                {draft.contextVariants.map((variant, vIndex) => (
                  <div key={vIndex} className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Input
                        className="max-w-[220px]"
                        value={variant.label}
                        onChange={(e) => updateDraftVariant(vIndex, { label: e.target.value })}
                        placeholder="اسم التوجيه (أطعمة وصحة وطب)"
                      />
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={variant.enabled}
                          onCheckedChange={(checked) =>
                            updateDraftVariant(vIndex, { enabled: checked })
                          }
                          aria-label="تفعيل التوجيه"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              contextVariants: draft.contextVariants.filter(
                                (_, i) => i !== vIndex
                              ),
                            })
                          }
                          aria-label="حذف التوجيه"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        التصنيفات المطابقة (slug أو اسم عربي، مفصولة بفواصل)
                      </Label>
                      <Input
                        value={variant.categories.join("، ")}
                        onChange={(e) =>
                          updateDraftVariant(vIndex, {
                            categories: e.target.value
                              .split(/[,،]/)
                              .map((c) => c.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="health، الصحة، تغذية"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">نص الأسلوب المتخصص</Label>
                      <Textarea
                        dir="ltr"
                        className="min-h-[80px] font-mono text-xs"
                        value={variant.stylePrompt}
                        onChange={(e) =>
                          updateDraftVariant(vIndex, { stylePrompt: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Negative Prompt متخصص (اختياري)</Label>
                      <Textarea
                        dir="ltr"
                        className="min-h-[50px] font-mono text-xs"
                        value={variant.negativePrompt || ""}
                        onChange={(e) =>
                          updateDraftVariant(vIndex, {
                            negativePrompt: e.target.value || undefined,
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                إلغاء
              </Button>
              <Button onClick={commitDraft} data-testid="button-commit-style">
                {editing?.index === "new" ? "إضافة النمط" : "تطبيق التعديل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
