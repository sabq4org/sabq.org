// صفحة رابط الدعوة — /meet/:token
// منسوب مسجَّل الدخول يدخل بهويته الحقيقية؛ الزائر يكتب اسمه ويدخل كضيف.
// الجميع يمر بغرفة الانتظار متى كانت موافقة المضيف مفعّلة (الضيوف دائماً).

import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { MeetingRoomView } from "@/components/meetings/MeetingRoomView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Clock, Headphones, Loader2, Radio, XCircle } from "lucide-react";

type InviteInfo = {
  meetingId: string;
  title: string;
  description: string | null;
  status: string;
  scheduledAt: string | null;
  isLocked: boolean;
  isAuthenticated: boolean;
};

type Phase =
  | { name: "landing" }
  | { name: "waiting"; participantId: string; guestKey?: string }
  | { name: "connected"; token: string; url: string; muteOnJoin: boolean }
  | { name: "denied" }
  | { name: "ended" }
  | { name: "error"; message: string };

export default function MeetingInvite() {
  const params = useParams<{ token: string }>();
  const inviteToken = params.token;
  const [phase, setPhase] = useState<Phase>({ name: "landing" });
  const [guestName, setGuestName] = useState("");
  const [joining, setJoining] = useState(false);

  const { data: infoRaw, error: infoError, refetch } = useQuery({
    queryKey: [`/api/meetings/invite/${inviteToken}`],
    refetchInterval: (q) =>
      ((q.state.data as InviteInfo | undefined)?.status === "scheduled" ? 15_000 : false),
  });
  const info = (infoRaw ?? null) as InviteInfo | null;

  const join = async () => {
    if (!info) return;
    setJoining(true);
    try {
      const result = await apiRequest<{
        admitted: boolean;
        participantId: string;
        guestKey?: string;
        token?: string;
        url?: string;
        muteOnJoin?: boolean;
      }>(`/api/meetings/invite/${inviteToken}/join`, {
        method: "POST",
        body: JSON.stringify(info.isAuthenticated ? {} : { guestName: guestName.trim() }),
      });
      if (result.admitted && result.token && result.url) {
        setPhase({ name: "connected", token: result.token, url: result.url, muteOnJoin: result.muteOnJoin ?? true });
      } else {
        setPhase({ name: "waiting", participantId: result.participantId, guestKey: result.guestKey });
      }
    } catch (e) {
      setPhase({ name: "error", message: (e as Error).message || "تعذر الانضمام" });
    } finally {
      setJoining(false);
    }
  };

  // استطلاع قرار المضيف
  useEffect(() => {
    if (phase.name !== "waiting") return;
    const { participantId, guestKey } = phase;
    const t = setInterval(async () => {
      try {
        const qs = new URLSearchParams({ participantId });
        if (guestKey) qs.set("guestKey", guestKey);
        const status = await apiRequest<{
          status: string;
          token?: string;
          url?: string;
          muteOnJoin?: boolean;
        }>(`/api/meetings/invite/${inviteToken}/status?${qs}`, { silent: true });
        if (status.status === "admitted" && status.token && status.url) {
          setPhase({ name: "connected", token: status.token, url: status.url, muteOnJoin: status.muteOnJoin ?? true });
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
  }, [phase, inviteToken]);

  if (infoError) {
    return <InviteShell icon={<XCircle className="h-10 w-10 text-red-500" />} title="رابط الدعوة غير صالح" subtitle="تأكد من الرابط أو اطلب دعوة جديدة من المضيف" />;
  }
  if (!info) {
    return <InviteShell icon={<Loader2 className="h-10 w-10 animate-spin text-primary" />} title="جارٍ التحميل…" />;
  }

  if (phase.name === "connected") {
    return (
      <div className="fixed inset-0 z-50">
        <MeetingRoomView
          mode="guest"
          meetingId={info.meetingId}
          meetingTitle={info.title}
          livekitUrl={phase.url}
          token={phase.token}
          muteOnJoin={phase.muteOnJoin}
          isHost={false}
          startedAt={null}
          onLeft={() => setPhase({ name: "ended" })}
        />
      </div>
    );
  }

  if (phase.name === "waiting") {
    return (
      <InviteShell
        icon={<Clock className="h-10 w-10 animate-pulse text-amber-500" />}
        title="بانتظار موافقة المضيف"
        subtitle={`طلبك للانضمام إلى «${info.title}» وصل — ستدخل فور الموافقة. أبقِ هذه الصفحة مفتوحة.`}
      />
    );
  }
  if (phase.name === "denied") {
    return <InviteShell icon={<XCircle className="h-10 w-10 text-red-500" />} title="لم تتم الموافقة على دخولك" />;
  }
  if (phase.name === "ended") {
    return <InviteShell icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />} title="انتهى الاجتماع" subtitle="شكراً لمشاركتك" />;
  }
  if (phase.name === "error") {
    return (
      <InviteShell icon={<XCircle className="h-10 w-10 text-red-500" />} title="تعذر الانضمام" subtitle={phase.message}>
        <Button variant="outline" onClick={() => { setPhase({ name: "landing" }); refetch(); }}>
          إعادة المحاولة
        </Button>
      </InviteShell>
    );
  }

  // صفحة الهبوط
  const scheduled = info.status === "scheduled";
  const ended = info.status === "ended" || info.status === "cancelled";
  return (
    <InviteShell
      icon={
        ended ? (
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        ) : scheduled ? (
          <Clock className="h-10 w-10 text-amber-500" />
        ) : (
          <Radio className="h-10 w-10 animate-pulse text-red-500" />
        )
      }
      title={info.title}
      subtitle={
        ended
          ? "انتهى هذا الاجتماع"
          : scheduled
            ? "لم يبدأ الاجتماع بعد — ستتحدث هذه الصفحة تلقائياً عند بدئه"
            : info.description || "اجتماع صوتي مباشر عبر سبق"
      }
    >
      {!ended && !scheduled ? (
        <div className="w-full max-w-xs space-y-3">
          {!info.isAuthenticated ? (
            <Input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="اكتب اسمك للانضمام كضيف"
              className="text-center"
              data-testid="input-guest-name"
            />
          ) : null}
          <Button
            className="w-full"
            onClick={join}
            disabled={joining || (!info.isAuthenticated && guestName.trim().length < 2)}
            data-testid="button-invite-join"
          >
            {joining ? <Loader2 className="ml-1.5 h-4 w-4 animate-spin" /> : <Headphones className="ml-1.5 h-4 w-4" />}
            انضمام للاجتماع
          </Button>
          <p className="text-[11px] leading-5 text-muted-foreground">
            بالانضمام سيظهر اسمك لبقية المشاركين. الميكروفون يبقى مغلقاً حتى تفتحه بنفسك.
          </p>
        </div>
      ) : null}
    </InviteShell>
  );
}

function InviteShell({
  icon, title, subtitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">{icon}</div>
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {subtitle ? <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
      <p className="mt-4 text-[11px] text-muted-foreground/70">اجتماعات سبق</p>
    </div>
  );
}
