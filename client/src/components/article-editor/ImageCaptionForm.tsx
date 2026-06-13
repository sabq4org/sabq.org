// Extracted verbatim from pages/ArticleEditor.tsx (refactor: article-editor-split).
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ImageCaptionFormProps {
  imageUrl: string;
  mediaFileId: string | null;
  articleId?: string;
  locale: string;
  displayOrder: number;
  existingCaption?: any;
  onSave: (data: any) => void;
  onDelete?: (id: string) => void;
  /** Optional article context — enables AI relevance scoring for the hero image. */
  articleTitle?: string;
  articleContent?: string;
}

interface AiMeta {
  relevanceScore: number | null;
  qualityScore: number | null;
  contentWarnings: string[];
  hasSensitiveContent: boolean;
}

export function ImageCaptionForm({
  imageUrl,
  mediaFileId,
  articleId,
  locale,
  displayOrder,
  existingCaption,
  onSave,
  onDelete,
  articleTitle,
  articleContent,
}: ImageCaptionFormProps) {
  const { toast } = useToast();
  const [altText, setAltText] = useState(existingCaption?.altText || "");
  const [captionPlain, setCaptionPlain] = useState(existingCaption?.captionPlain || "");
  const [sourceName, setSourceName] = useState(existingCaption?.sourceName || "");
  const [sourceUrl, setSourceUrl] = useState(existingCaption?.sourceUrl || "");
  const [keywordTags, setKeywordTags] = useState<string[]>(existingCaption?.keywordTags || []);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiMeta, setAiMeta] = useState<AiMeta | null>(null);

  // Update form fields when existingCaption changes (e.g., when data loads from API)
  useEffect(() => {
    if (existingCaption) {
      setAltText(existingCaption.altText || "");
      setCaptionPlain(existingCaption.captionPlain || "");
      setSourceName(existingCaption.sourceName || "");
      setSourceUrl(existingCaption.sourceUrl || "");
      setKeywordTags(existingCaption.keywordTags || []);
    }
  }, [existingCaption]);

  // "صورة جاهزة للخبر" — AI generates Arabic alt text + caption (+ keywords) and
  // reports relevance/quality/content-warnings. On-demand (writer clicks).
  const handleGenerate = async () => {
    if (!imageUrl) return;
    setAnalyzing(true);
    try {
      const r = (await apiRequest("/api/media/analyze", {
        method: "POST",
        body: JSON.stringify({ imageUrl, articleTitle, articleContent }),
        headers: { "Content-Type": "application/json" },
      })) as {
        altText: string;
        caption: string;
        keywords: string[];
        relevanceScore: number | null;
        qualityScore: number | null;
        contentWarnings: string[];
        hasSensitiveContent: boolean;
      };
      if (r.altText) setAltText(r.altText);
      if (r.caption) setCaptionPlain(r.caption);
      if (r.keywords?.length) setKeywordTags(r.keywords);
      setAiMeta({
        relevanceScore: r.relevanceScore,
        qualityScore: r.qualityScore,
        contentWarnings: r.contentWarnings || [],
        hasSensitiveContent: r.hasSensitiveContent,
      });
      toast({
        title: "تم التوليد بالذكاء",
        description: "تم ملء التعليق والنص البديل — راجِعهما وعدّلهما قبل الحفظ",
      });
    } catch (error: any) {
      toast({
        title: "تعذّر التوليد",
        description: error.message || "حدث خطأ أثناء تحليل الصورة",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = () => {
    onSave({
      mediaFileId: mediaFileId || null,
      locale,
      altText: altText || null,
      captionPlain: captionPlain || null,
      sourceName: sourceName || null,
      sourceUrl: sourceUrl || null,
      keywordTags: keywordTags.length > 0 ? keywordTags : null,
      displayOrder,
    });
  };

  const hasChanges = altText || captionPlain || sourceName;

  return (
    <div className="space-y-3 mt-3">
      {/* AI: صورة جاهزة للخبر */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleGenerate}
          disabled={!imageUrl || analyzing}
          className="gap-1.5"
          data-testid="button-ai-caption"
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-purple-500" />}
          {analyzing ? "جارٍ التحليل..." : "توليد تعليق ووصف بالذكاء"}
        </Button>

        {aiMeta?.relevanceScore != null && (
          <Badge variant="outline" className="text-xs" data-testid="badge-ai-relevance">
            ملاءمة {aiMeta.relevanceScore}%
          </Badge>
        )}
        {aiMeta?.qualityScore != null && (
          <Badge variant="outline" className="text-xs" data-testid="badge-ai-quality">
            جودة {aiMeta.qualityScore}%
          </Badge>
        )}
        {aiMeta?.hasSensitiveContent && (
          <Badge variant="destructive" className="text-xs gap-1" data-testid="badge-ai-warning">
            <AlertTriangle className="h-3 w-3" /> محتوى حسّاس
          </Badge>
        )}
      </div>

      {aiMeta?.contentWarnings && aiMeta.contentWarnings.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          تنبيه: {aiMeta.contentWarnings.join(" · ")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <Label htmlFor="altText" className="text-xs text-muted-foreground">النص البديل للصورة</Label>
          <Input
            id="altText"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="وصف دقيق للصورة..."
            className="text-sm"
            data-testid="input-caption-alt-text"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="captionPlain" className="text-xs text-muted-foreground">تعريف الصورة</Label>
          <Input
            id="captionPlain"
            value={captionPlain}
            onChange={(e) => setCaptionPlain(e.target.value)}
            placeholder="تعريف يظهر أسفل الصورة..."
            className="text-sm"
            data-testid="textarea-caption-plain"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="sourceName" className="text-xs text-muted-foreground">مصدر الصورة</Label>
          <Input
            id="sourceName"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            placeholder="وكالة الأنباء..."
            className="text-sm"
            data-testid="input-caption-source-name"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges}
          data-testid="button-save-caption"
        >
          <Save className="h-3 w-3 ml-1" />
          {existingCaption ? "تحديث" : "حفظ التعريف"}
        </Button>

        {existingCaption && onDelete && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onDelete(existingCaption.id)}
            data-testid="button-delete-caption"
          >
            حذف
          </Button>
        )}
      </div>
    </div>
  );
}
