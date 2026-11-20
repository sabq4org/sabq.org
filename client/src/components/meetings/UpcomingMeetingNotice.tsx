// تنبيه الاجتماع القادم في مساحة الكاتب (وأي صفحة رئيسية لا تمر بصفحة الاجتماعات):
// أقرب اجتماع مباشر أو مجدول خلال 14 يوماً دُعي إليه المستخدم، مع «سأحضر / لا أستطيع»
// أو «انضمام» إن كان مباشراً. القائمة نفسها من /api/meetings (تُرشَّح بالأهلية على الخادم)؛
// من لا يملك صلاحية الاجتماعات يأخذ 403 فلا يظهر شيء.

import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Headphones, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type NoticeMeeting = {
  id: string;
  title: string;
  status: "scheduled" | "live" | string;
  scheduledAt: string | null;
  startedAt: string | null;
  durationMinutes: number | null;
  hostUserId: string;
  hostName: string;
  myRsvp: "yes" | "no" | null;
};

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  });
}

export function UpcomingMeetingNotice() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: raw } = useQuery({
    queryKey: ["/api/meetings"],
    refetchInterval: 60_000,
    retry: false,
  });
  const data = raw as { live?: NoticeMeeting[]; upcoming?: NoticeMeeting[] } | null | undefined;
  const live = Array.isArray(data?.live) ? data!.live! : [];
  const upcoming = Array.isArray(data?.upcoming) ? data!.upcoming! : [];

  const now = Date.now();
  const meeting =
    live[0] ??
    upcoming
      .filter((m) => m.scheduledAt && new Date(m.scheduledAt).getTime() - now < WINDOW_MS)
      .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())[0];

  const rsvp = useMutation({
    mutationFn: (response: "yes" | "no") =>
      apiRequest(`/api/meetings/${meeting!.id}/rsvp`, { method: "POST", body: JSON.stringify({ response }) }),
    onSuccess: (_d, response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast(
        response === "yes"
          ? { title: "تم تأكيد حضورك", description: "بانتظارك في موعد الاجتماع" }
          : { title: "نعتذر عن غيابك", description: "الدعوة تبقى قائمة، وبإمكانك الانضمام متى زال ظرفك." },
      );
    },
    onError: () => toast({ title: "تعذر حفظ ردك", variant: "destructive" }),
  });

  if (!meeting) return null;
  const isLive = meeting.status === "live";
  const isHost = meeting.hostUserId === user?.id;
  const otherCount = live.length + upcoming.length - 1;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 sm:p-4",
        isLive ? "border-red-500/40" : "border-primary/30",
      )}
      dir="rtl"
      data-testid="upcoming-meeting-notice"
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
            isLive ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary",
          )}
        >
          {isLive ? <Radio className="h-5 w-5 animate-pulse" /> : <Headphones className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground">
            {isLive ? "اجتماع مباشر الآن" : isHost ? "اجتماعك القادم" : "دعوة لاجتماع"}
          </p>
          <p className="text-sm font-bold leading-6 sm:text-base">{meeting.title}</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {isLive
              ? `يستضيفه ${meeting.hostName}`
              : `${formatWhen(meeting.scheduledAt)}${meeting.durationMinutes ? ` · ${meeting.durationMinutes} دقيقة` : ""} · ${meeting.hostName}`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isLive ? (
          <Button size="sm" onClick={() => setLocation(`/dashboard/meetings/room/${meeting.id}`)} data-testid="button-notice-join">
            انضمام
          </Button>
        ) : !isHost ? (
          <>
            <Button
              size="sm"
              variant={meeting.myRsvp === "yes" ? "default" : "outline"}
              onClick={() => rsvp.mutate("yes")}
              disabled={rsvp.isPending}
              data-testid="button-notice-rsvp-yes"
            >
              <Check className="ml-1 h-3.5 w-3.5" /> سأحضر
            </Button>
            <Button
              size="sm"
              variant={meeting.myRsvp === "no" ? "secondary" : "outline"}
              onClick={() => rsvp.mutate("no")}
              disabled={rsvp.isPending}
              data-testid="button-notice-rsvp-no"
            >
              <X className="ml-1 h-3.5 w-3.5" /> لا أستطيع
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="gap-1"
          onClick={() => setLocation(otherCount > 0 ? "/dashboard/meetings" : `/dashboard/meetings/${meeting.id}`)}
        >
          {otherCount > 0 ? `كل الاجتماعات (${otherCount + 1})` : "التفاصيل"}
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
