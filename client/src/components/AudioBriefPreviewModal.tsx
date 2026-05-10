import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AudioPlayer } from "./AudioPlayer";
import { Badge } from "@/components/ui/badge";
import type { AudioNewsBrief } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { Clock } from "lucide-react";

interface AudioBriefPreviewModalProps {
  brief: AudioNewsBrief | null;
  open: boolean;
  onClose: () => void;
  onPublish?: (briefId: string) => void;
  isPublishing?: boolean;
}

export function AudioBriefPreviewModal({
  brief,
  open,
  onClose,
  onPublish,
  isPublishing,
}: AudioBriefPreviewModalProps) {
  if (!brief) return null;

  const canPublish = brief.audioUrl && brief.generationStatus === 'completed' && brief.status !== 'published' && onPublish;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <div className="flex items-start gap-3 justify-between">
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold mb-2">{brief.title}</DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge 
                  variant={
                    brief.status === 'published' ? 'default' :
                    brief.status === 'completed' ? 'secondary' :
                    brief.status === 'processing' ? 'outline' :
                    brief.status === 'failed' ? 'destructive' :
                    'outline'
                  }
                  data-testid="badge-brief-status"
                >
                  {brief.status === 'published' ? 'منشور' :
                   brief.status === 'completed' ? 'مكتمل' :
                   brief.status === 'processing' ? 'جاري المعالجة' :
                   brief.status === 'failed' ? 'فشل' :
                   'مسودة'}
                </Badge>
                {brief.duration && (
                  <Badge variant="outline" className="gap-1" data-testid="badge-duration">
                    <Clock className="h-3 w-3" />
                    {Math.floor(brief.duration / 60)}:{(brief.duration % 60).toString().padStart(2, '0')}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap" data-testid="text-brief-content">
              {brief.content}
            </p>
          </div>

          {brief.audioUrl ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">المقطع الصوتي</h3>
              <AudioPlayer
                newsletterId={brief.id}
                audioUrl={brief.audioUrl}
                title={brief.title}
                duration={brief.duration || undefined}
                data-testid="audio-player-preview"
              />
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              لم يتم توليد الصوت بعد
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
            <div data-testid="text-voice-info">
              <span className="font-medium">الصوت:</span> {brief.voiceName}
            </div>
            {brief.createdAt && (
              <div data-testid="text-created-at">
                <span className="font-medium">تم الإنشاء:</span>{" "}
                {formatDistanceToNow(new Date(brief.createdAt), {
                  addSuffix: true,
                  locale: ar,
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            data-testid="button-close"
          >
            إغلاق
          </Button>
          {canPublish && (
            <Button
              onClick={() => onPublish(brief.id)}
              disabled={brief.generationStatus !== 'completed' || isPublishing}
              data-testid="button-publish-to-homepage"
            >
              {isPublishing ? "جاري النشر..." : "نشر في الصفحة الرئيسية"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
