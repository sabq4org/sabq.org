// نداء الاجتماع المباشر — بطاقة عائمة لطيفة تظهر في كل صفحات لوحة التحكم
// لكل منسوب مؤهل عندما يكون هناك اجتماع مباشر يخصه، مع زر انضمام فوري.
// تختفي بالتجاهل (لكل اجتماع على حدة)، وعند انتهاء الاجتماع، وداخل صفحات
// الاجتماعات نفسها (المركز يعرضه أصلاً والغرفة لا تحتاج تذكيراً).

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Headphones, Radio, X } from "lucide-react";

type LiveMeeting = {
  id: string;
  title: string;
  hostName: string;
  participantCount: number;
  isLocked: boolean;
};

export function MeetingCallAlert() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const canView =
    user?.permissions?.includes("*") ||
    user?.permissions?.includes("meetings.view") ||
    user?.permissions?.includes("meetings.manage");

  const inMeetingsArea = location.startsWith("/dashboard/meetings");

  const { data: dataRaw } = useQuery({
    queryKey: ["/api/meetings"],
    enabled: Boolean(canView) && !inMeetingsArea,
    refetchInterval: 45_000,
    staleTime: 30_000,
  });
  const live = Array.isArray((dataRaw as { live?: LiveMeeting[] } | null)?.live)
    ? ((dataRaw as { live: LiveMeeting[] }).live)
    : [];

  const meeting = live.find((m) => !dismissed.has(m.id) && !m.isLocked);
  if (!canView || inMeetingsArea || !meeting) return null;

  return (
    <div
      dir="rtl"
      className={cn(
        "fixed bottom-4 left-4 z-50 w-[calc(100vw-2rem)] max-w-sm",
        "animate-in slide-in-from-bottom-4 fade-in duration-300",
      )}
      data-testid="meeting-call-alert"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-red-500/30 bg-card p-3.5 shadow-lg">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
          <Headphones className="h-5 w-5 text-red-500" />
          <span className="absolute -left-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-red-600 dark:text-red-400">
            <Radio className="h-3 w-3" /> اجتماع مباشر الآن
          </div>
          <div className="truncate text-sm font-bold text-foreground">{meeting.title}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            يستضيفه {meeting.hostName}
            {meeting.participantCount > 0 ? ` · ${meeting.participantCount} مشاركاً` : ""}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(meeting.id))}
            className="text-muted-foreground/60 hover:text-foreground"
            aria-label="تجاهل التنبيه"
            data-testid="button-dismiss-call-alert"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <Button
            size="sm"
            className="h-8 px-4 text-xs font-bold"
            onClick={() => setLocation(`/dashboard/meetings/room/${meeting.id}`)}
            data-testid="button-call-alert-join"
          >
            انضمام
          </Button>
        </div>
      </div>
    </div>
  );
}
