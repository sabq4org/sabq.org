// Extracted verbatim from pages/ArticleEditor.tsx (refactor: article-editor-split).
// Sortable Attachment Item component for drag-and-drop reordering.
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GripVertical, ImageOff, Loader2, X } from "lucide-react";
import { isOrphanMediaAsset, mediaAssetUrl } from "./mediaAssetHelpers";

interface SortableAttachmentItemProps {
  asset: any;
  index: number;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

export function SortableAttachmentItem({ asset, index, onDelete, isDeleting }: SortableAttachmentItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  const imageUrl = mediaAssetUrl(asset);
  const orphan = isOrphanMediaAsset(asset);
  const label =
    asset.altText ||
    asset.captionPlain ||
    asset.sourceName ||
    (orphan ? "مرفق يتيم بلا صورة" : `مرفق ${index + 1}`);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group rounded-lg border bg-muted/30 ${
        isDragging ? "ring-2 ring-primary scale-105" : ""
      } ${orphan ? "border-amber-400/70 border-dashed" : ""}`}
      data-testid={`attachment-image-${index}`}
      data-orphan={orphan ? "true" : "false"}
    >
      <div className="aspect-square rounded-lg overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={label}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-amber-50 px-2 text-center dark:bg-amber-950/30">
            <ImageOff className="h-6 w-6 text-amber-600" />
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200">مرجع بلا صورة</p>
            <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80 line-clamp-2">{label}</p>
          </div>
        )}
      </div>
      {/* Drag handle — معطّل لليتيم بلا حاجة ترتيب */}
      {!orphan && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              {...attributes}
              {...listeners}
              className="absolute bottom-2 right-2 bg-black/70 text-white p-1.5 rounded-md cursor-grab active:cursor-grabbing shadow-lg hover:bg-black/90 transition-colors"
              data-testid={`drag-handle-${index}`}
            >
              <GripVertical className="h-4 w-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            اسحب لإعادة الترتيب
          </TooltipContent>
        </Tooltip>
      )}
      {/* Delete button - always visible with high contrast */}
      <Button
        variant="destructive"
        size="icon"
        className="absolute top-2 left-2 h-8 w-8 shadow-lg border border-white/30"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(asset.id);
        }}
        disabled={isDeleting}
        data-testid={`button-delete-attachment-${index}`}
        title={orphan ? "حذف المرجع اليتيم" : "حذف المرفق"}
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
      </Button>
      {/* Image number badge */}
      <div className="absolute top-2 right-2 bg-black/70 text-white text-xs font-medium px-2 py-1 rounded-full shadow-md">
        {orphan ? "!" : index + 1}
      </div>
      {/* Alt text tooltip */}
      {asset.altText && imageUrl && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-white text-xs p-2 truncate rounded-b-lg">
          {asset.altText}
        </div>
      )}
    </div>
  );
}
