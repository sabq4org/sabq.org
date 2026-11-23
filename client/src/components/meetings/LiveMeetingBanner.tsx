// شريط «بدأ اجتماع» يظهر للمنسوب المدعو في أي صفحة (لوحة التحكم وموقع الصحيفة) خلال دقيقة
// من بدء الاجتماع. القائمة من /api/meetings (مرشّحة بالأهلية على الخادم)، ولا يُطلب إلا لمن
// يملك meetings.view، فالقارئ العادي لا يرسل أي طلب. يختفي داخل غرفة الاجتماع، وبالإغلاق لهذا الاجتماع.

import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasPermission, useAuth } from "@/hooks/useAuth";

type LiveMeeting = { id: string; title: string; status: string; hostName: string };

const DISMISS_PREFIX = "live-meeting-dismissed-";

function wasDismissed(id: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_PREFIX + id) === "1";
  } catch {
    return false;
  }
}

export function LiveMeetingBanner() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const canSee = hasPermission(user, "meetings.view") || hasPermission(user, "meetings.manage");
  const [dismissed, setDismissed] = useState<string[]>([]);

  const { data: raw } = useQuery({
    queryKey: ["/api/meetings"],
    enabled: canSee,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  if (!canSee) return null;
  if (location.startsWith("/dashboard/meetings/room/")) return null;

  const data = raw as { live?: LiveMeeting[] } | null | undefined;
  const live = Array.isArray(data?.live) ? data!.live! : [];
  const meeting = live.find((m) => m.status === "live" && !dismissed.includes(m.id) && !wasDismissed(m.id));
  if (!meeting) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_PREFIX + meeting.id, "1");
    } catch {
      /* التخزين غير متاح: الإغلاق يبقى لهذه الصفحة فقط */
    }
    setDismissed((d) => [...d, meeting.id]);
  };

  return (
    <div
      dir="rtl"
      role="status"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-red-500/30 bg-white p-3 shadow-lg sm:inset-x-auto sm:left-1/2 sm:w-[560px] sm:-translate-x-1/2"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      data-testid="live-meeting-banner"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-500/10 text-red-600">
        <Radio className="h-5 w-5 animate-pulse" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-red-600">بدأ الاجتماع الآن</p>
        <p className="truncate text-sm font-bold text-slate-900">{meeting.title}</p>
      </div>
      <Button
        size="sm"
        className="shrink-0 rounded-full"
        onClick={() => setLocation(`/dashboard/meetings/room/${meeting.id}`)}
        data-testid="button-live-banner-join"
      >
        انضم الآن
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إخفاء"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
        data-testid="button-live-banner-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
