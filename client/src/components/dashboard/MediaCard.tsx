import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Download, Trash2, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import type { MediaFile } from "@shared/schema";

interface MediaCardProps {
  file: MediaFile;
  onPreview: (file: MediaFile) => void;
  onToggleFavorite: (file: MediaFile) => void;
  onDelete: (file: MediaFile) => void;
}

export function MediaCard({ file, onPreview, onToggleFavorite, onDelete }: MediaCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Card
      className="group hover-elevate active-elevate-2 cursor-pointer overflow-hidden"
      onClick={() => onPreview(file)}
      data-testid={`card-media-${file.id}`}
    >
      <div className="aspect-square relative bg-muted overflow-hidden">
        {file.type === "image" ? (
          <img
            src={file.thumbnailUrl || file.url}
            alt={file.altText || file.title || file.originalName}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        
        {/* Favorite Star */}
        <Button
          size="icon"
          variant={file.isFavorite ? "default" : "ghost"}
          className="absolute top-2 left-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(file);
          }}
          data-testid={`button-favorite-${file.id}`}
        >
          <Star className={`h-4 w-4 ${file.isFavorite ? 'fill-current' : ''}`} />
        </Button>

        {/* Usage Count Badge */}
        {file.usageCount > 0 && (
          <Badge
            variant="secondary"
            className="absolute bottom-2 right-2"
            data-testid={`badge-usage-count-${file.id}`}
          >
            استخدم {file.usageCount} مرة
          </Badge>
        )}
      </div>

      <CardContent className="p-3">
        <h3
          className="font-medium text-sm truncate mb-1"
          title={file.title || file.originalName}
          data-testid={`text-media-title-${file.id}`}
        >
          {file.title || file.originalName}
        </h3>
        
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span data-testid={`text-media-size-${file.id}`}>
            {formatFileSize(file.size)}
          </span>
          <span data-testid={`text-media-date-${file.id}`}>
            {format(new Date(file.createdAt), 'yyyy/MM/dd')}
          </span>
        </div>

        {file.category && (
          <Badge variant="outline" className="mt-2 text-xs">
            {file.category}
          </Badge>
        )}

        {/* Quick Actions (visible on hover) */}
        <div className="flex items-center gap-1 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              window.open(file.url, '_blank');
            }}
            data-testid={`button-download-${file.id}`}
          >
            <Download className="h-3 w-3 ml-1" />
            تحميل
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-7 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(file);
            }}
            data-testid={`button-delete-${file.id}`}
          >
            <Trash2 className="h-3 w-3 ml-1" />
            حذف
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
