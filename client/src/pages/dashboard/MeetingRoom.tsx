// غرفة الاجتماع للمنسوبين — /dashboard/meetings/room/:id
// يطلب الانضمام؛ إن كانت الموافقة مطلوبة يعرض غرفة الانتظار ويستطلع القرار،
// وعند القبول يستلم تذكرة LiveKit ويسلّمها لواجهة الغرفة المشتركة.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MeetingRoomView } from "@/components/meetings/MeetingRoomView";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Clock, Headphones, Loader2, XCircle } from "lucide-react";

type MeetingDetail = {
  id: string;
  title: string;
  status: string;
  isHost: boolean;
  isLocked: boolean;
  requireApproval: boolean;
  muteOnJoin: boolean;
  minutesEnabled: boolean;
  startedAt: string | null;
  inviteToken: string | null;
};

type Phase =
  | { name: "joining" }
  | { name: "waiting"; participantId: string }
  | { name: "connected"; token: string; url: string; muteOnJoin: boolean }
  | { name: "denied" }
  | { name: "ended" }
  | { name: "removed" }
  | { name: "error"; message: string };

export default function MeetingRoom() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const [, setLocation] = useLocation();
  const [phase, setPhase] = useState<Phase>({ name: "joining" });
  const joinAttempted = useRef(false);

  const { data: meetingRaw, error: meetingError } = useQuery({
    queryKey: [`/api/meetings/${meetingId}`],
  });
  const meeting = (meetingRaw ?? null) as MeetingDetail | null;

  const join = useCallback(async () => {
    try {
      const result = await apiRequest<{
        admitted: boolean;
        participantId: string;
        token?: string;
        url?: string;
        muteOnJoin?: boolean;
      }>(`/api/meetings/${meetingId}/join`, { method: "POST" });
      if (result.admitted && result.token && result.url) {
        setPhase({
          name: "connected",
          token: result.token,
          url: result.url,
          muteOnJoin: result.muteOnJoin ?? true,
        });
      } else {
        setPhase({ name: "waiting", participantId: result.participantId });
      }
    } catch (e) {
      setPhase({ name: "error", message: (e as Error).message || "تعذر الانضمام للاجتماع" });
    }
  }, [meetingId]);

  useEffect(() => {
    if (!meeting || joinAttempted.current) return;
    joinAttempted.current = true;
    if (meeting.status === "ended" || meeting.status === "cancelled") {
      setPhase({ name: "ended" });
      return;
    }
    join();
  }, [meeting, join]);

  // غرفة الانتظار: استطلاع قرار المضيف كل 3 ثوانٍ
  useEffect(() => {
    if (phase.name !== "waiting") return;
    const participantId = phase.participantId;
    const t = setInterval(async () => {
      try {
        const status = await apiRequest<{
          status: string;
          token?: string;
          url?: string;
          muteOnJoin?: boolean;
        }>(
          `/api/meetings/${meetingId}/my-request?participantId=${encodeURIComponent(participantId)}`,
          { silent: true },
        );
        if (status.status === "admitted" && status.token && status.url) {
          setPhase({
            name: "connected",
            token: status.token,
            url: status.url,
            muteOnJoin: status.muteOnJoin ?? true,
          });
        } else if (status.status === "denied") {
          setPhase({ name: "denied" });
        } else if (status.status === "ended" || status.status === "removed") {
          setPhase({ name: "ended" });
        }
      } catch {
        /* محاولة تالية */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [phase, meetingId]);

  const backToHub = () => setLocation("/dashboard/meetings");

  if (meetingError) {
    return (
      <CenteredNotice
        icon={<XCircle className="h-10 w-10 text-red-500" />}
        title="هذا الاجتماع غير متاح لك"
        subtitle="تحقق من صلاحيتك أو اطلب دعوة من المضيف"
        onBack={backToHub}
      />
    );
  }

  if (!meeting || phase.name === "joining") {
    return (
      <CenteredNotice
        icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />}
        title="جارٍ الانضمام…"
        subtitle="نجهّز غرفة الاجتماع"
      />
    );
  }

  switch (phase.name) {
    case "waiting":
      return (
        <CenteredNotice
          icon={<Clock className="h-10 w-10 animate-pulse text-amber-500" />}
          title="بانتظار موافقة المضيف"
          subtitle={`طلبك للانضمام إلى «${meeting.title}» وصل للمضيف — ستدخل فور الموافقة`}
          onBack={backToHub}
          backLabel="إلغاء الطلب"
        />
      );
    case "denied":
      return (
        <CenteredNotice
          icon={<XCircle className="h-10 w-10 text-red-500" />}
          title="لم تتم الموافقة على دخولك"
          subtitle="يمكنك التواصل مع مضيف الاجتماع"
          onBack={backToHub}
        />
      );
    case "ended":
      return (
        <CenteredNotice
          icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
          title="انتهى الاجتماع"
          subtitle="شكراً لمشاركتك"
          onBack={backToHub}
        />
      );
    case "removed":
      return (
        <CenteredNotice
          icon={<XCircle className="h-10 w-10 text-red-500" />}
          title="أخرجك المضيف من الاجتماع"
          onBack={backToHub}
        />
      );
    case "error":
      return (
        <CenteredNotice
          icon={<XCircle className="h-10 w-10 text-red-500" />}
          title="تعذر الانضمام"
          subtitle={phase.message}
          onBack={backToHub}
        />
      );
    case "connected":
      return (
        <div className="fixed inset-0 z-50">
          <MeetingRoomView
            mode="staff"
            meetingId={meeting.id}
            meetingTitle={meeting.title}
            livekitUrl={phase.url}
            token={phase.token}
            muteOnJoin={phase.muteOnJoin}
            isHost={meeting.isHost}
            minutesEnabled={meeting.minutesEnabled}
            isLockedInitial={meeting.isLocked}
            startedAt={meeting.startedAt ?? new Date().toISOString()}
            inviteToken={meeting.inviteToken}
            onLeft={(reason) => {
              if (reason === "removed") setPhase({ name: "removed" });
              else if (reason === "ended") setPhase({ name: "ended" });
              else backToHub();
            }}
          />
        </div>
      );
  }
}

function CenteredNotice({
  icon, title, subtitle, onBack, backLabel = "العودة للاجتماعات",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        {icon}
      </div>
      <div>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {onBack ? (
        <Button variant="outline" onClick={onBack}>
          <Headphones className="ml-1.5 h-4 w-4" />
          {backLabel}
        </Button>
      ) : null}
    </div>
  );
}
