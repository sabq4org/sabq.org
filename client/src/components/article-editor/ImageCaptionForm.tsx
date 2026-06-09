// Extracted verbatim from pages/ArticleEditor.tsx (refactor: article-editor-split).
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";

interface ImageCaptionFormProps {
  imageUrl: string;
  mediaFileId: string | null;
  articleId?: string;
  locale: string;
  displayOrder: number;
  existingCaption?: any;
  onSave: (data: any) => void;
  onDelete?: (id: string) => void;
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
}: ImageCaptionFormProps) {
  const [altText, setAltText] = useState(existingCaption?.altText || "");
  const [captionPlain, setCaptionPlain] = useState(existingCaption?.captionPlain || "");
  const [sourceName, setSourceName] = useState(existingCaption?.sourceName || "");
  const [sourceUrl, setSourceUrl] = useState(existingCaption?.sourceUrl || "");
  const [keywordTags, setKeywordTags] = useState<string[]>(existingCaption?.keywordTags || []);

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
