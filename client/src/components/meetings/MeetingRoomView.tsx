// غرفة الاجتماع — واجهة LiveKit المشتركة بين لوحة المنسوبين وصفحة ضيوف الرابط.
// داكنة عمداً (قرار التصميم المعتمد) لتُبرز الشاشة المشاركة والمتحدث الآن.
//
// المنسوب يصلها من /dashboard/meetings/room/:id بعد تذكرة من الخادم،
// والضيف من /meet/:token بعد موافقة المضيف. mode يحدد ما يتاح:
//  - staff: قائمة المشاركين وطلبات الانتظار من API اللوحة + أدوات المضيف
//  - guest: البلاطات من غرفة LiveKit فقط، بلا أي نداء API مصادَق

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from "livekit-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Check, Link2, Loader2, Lock, LockOpen, LogOut, Mic, MicOff,
  MonitorUp, MonitorX, PhoneOff, Radio, ScreenShare, Users, X,
} from "lucide-react";

type ParticipantMeta = {
  name?: string;
  avatarUrl?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  isHost?: boolean;
  isGuest?: boolean;
};

type RosterEntry = {
  participantId: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  jobTitle: string | null;
  role: string;
  status: string;
  isGuest: boolean;
  identity: string | null;
};

export interface MeetingRoomViewProps {
  mode: "staff" | "guest";
  meetingId: string;
  meetingTitle: string;
  livekitUrl: string;
  token: string;
  muteOnJoin: boolean;
  isHost: boolean;
  isLockedInitial?: boolean;
  startedAt?: string | null;
  inviteToken?: string | null;
  /** يُستدعى بعد قطع الاتصال (مغادرة أو إنهاء أو طرد) */
  onLeft: (reason: "left" | "ended" | "removed" | "error") => void;
}

function parseMeta(p: Participant): ParticipantMeta {
  try {
    return p.metadata ? (JSON.parse(p.metadata) as ParticipantMeta) : {};
  } catch {
    return {};
  }
}

function initialsOf(name: string): string {
  return name.trim().slice(0, 2) || "؟";
}

function formatElapsed(fromIso: string | null | undefined, now: number): string {
  if (!fromIso) return "00:00";
  const secs = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function MeetingRoomView({
  mode,
  meetingId,
  meetingTitle,
  livekitUrl,
  token,
  muteOnJoin,
  isHost,
  isLockedInitial = false,
  startedAt,
  inviteToken,
  onLeft,
}: MeetingRoomViewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const roomRef = useRef<Room | null>(null);
  const audioContainerRef = useRef<HTMLDivElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const leftReasonRef = useRef<"left" | "ended" | "removed" | "error" | null>(null);

  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [, setTick] = useState(0); // إعادة رسم عند أي حدث غرفة — القراءة مباشرة من roomRef
  const [screenShareInfo, setScreenShareInfo] = useState<{ trackSid: string; ownerName: string; isLocal: boolean } | null>(null);
  const [isLocked, setIsLocked] = useState(isLockedInitial);
  const [panelOpen, setPanelOpen] = useState(true);
  const [now, setNow] = useState(Date.now());

  const bump = useCallback(() => setTick((t) => t + 1), []);

  // ── قائمة المشاركين من اللوحة (منسوبون فقط) ──
  const rosterQueryKey = `/api/meetings/${meetingId}/participants`;
  const { data: rosterRaw } = useQuery({
    queryKey: [rosterQueryKey],
    enabled: mode === "staff",
    refetchInterval: 20_000,
  });
  const roster = useMemo(() => {
    const r = (rosterRaw as { roster?: RosterEntry[] } | null)?.roster;
    return Array.isArray(r) ? r : [];
  }, [rosterRaw]);
  const pendingRequests = roster.filter((r) => r.status === "pending");
  const rosterByIdentity = useMemo(() => {
    const map = new Map<string, RosterEntry>();
    for (const r of roster) if (r.identity) map.set(r.identity, r);
    return map;
  }, [roster]);

  // ── قناة الأحداث اللحظية (منسوبون) ──
  useEffect(() => {
    if (mode !== "staff") return;
    const es = new EventSource(`/api/meetings/${meetingId}/events`);
    const invalidateRoster = () =>
      queryClient.invalidateQueries({ queryKey: [rosterQueryKey] });

    es.addEventListener("join_requested", (e) => {
      invalidateRoster();
      if (isHost) {
        try {
          const payload = JSON.parse((e as MessageEvent).data);
          toast({ title: "طلب دخول جديد", description: `${payload.name} ينتظر موافقتك` });
        } catch { /* حمولة غير متوقعة */ }
      }
    });
    es.addEventListener("request_resolved", invalidateRoster);
    es.addEventListener("participant_joined", invalidateRoster);
    es.addEventListener("participant_left", invalidateRoster);
    es.addEventListener("participant_removed", invalidateRoster);
    es.addEventListener("meeting_locked", (e) => {
      try {
        setIsLocked(Boolean(JSON.parse((e as MessageEvent).data).locked));
      } catch { /* تجاهل */ }
    });
    es.addEventListener("meeting_ended", () => {
      leftReasonRef.current = "ended";
      roomRef.current?.disconnect();
    });
    return () => es.close();
  }, [mode, meetingId, isHost, queryClient, rosterQueryKey, toast]);

  // ── مؤقّت المدة ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── الاتصال بغرفة LiveKit ──
  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    const recomputeScreenShare = () => {
      const everyone: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];
      for (const p of everyone) {
        const pub = p.getTrackPublication(Track.Source.ScreenShare);
        if (pub?.track && !pub.isMuted) {
          const meta = parseMeta(p);
          setScreenShareInfo({
            trackSid: pub.trackSid,
            ownerName: meta.name || p.name || p.identity,
            isLocal: p === room.localParticipant,
          });
          const el = screenVideoRef.current;
          if (el) pub.track.attach(el);
          return;
        }
      }
      setScreenShareInfo(null);
    };

    const onTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        audioContainerRef.current?.appendChild(el);
      }
      recomputeScreenShare();
      bump();
    };
    const onTrackUnsubscribed = (track: RemoteTrack) => {
      track.detach().forEach((el) => el.remove());
      recomputeScreenShare();
      bump();
    };
    const onAnyChange = () => {
      recomputeScreenShare();
      bump();
    };
    const onDisconnected = () => {
      if (cancelled) return;
      setConnected(false);
      onLeft(leftReasonRef.current ?? "ended");
    };

    room
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.ParticipantConnected, onAnyChange)
      .on(RoomEvent.ParticipantDisconnected, onAnyChange)
      .on(RoomEvent.LocalTrackPublished, onAnyChange)
      .on(RoomEvent.LocalTrackUnpublished, onAnyChange)
      .on(RoomEvent.TrackMuted, onAnyChange)
      .on(RoomEvent.TrackUnmuted, onAnyChange)
      .on(RoomEvent.ActiveSpeakersChanged, bump)
      .on(RoomEvent.ParticipantMetadataChanged, bump)
      .on(RoomEvent.Disconnected, onDisconnected);

    (async () => {
      try {
        await room.connect(livekitUrl, token);
        if (cancelled) return;
        await room.localParticipant.setMicrophoneEnabled(!muteOnJoin);
        await room.startAudio().catch(() => {
          /* سيُعاد تشغيله بأول نقرة */
        });
        setConnected(true);
        bump();
      } catch (e) {
        console.error("[MeetingRoom] connect failed:", e);
        if (!cancelled) setConnectError("تعذر الاتصال بغرفة الاجتماع — تحقق من الشبكة وحاول مجدداً");
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
    };
    // الاتصال مرة واحدة لكل تذكرة
  }, [livekitUrl, token]);

  const room = roomRef.current;
  const localMicOn = room?.localParticipant.isMicrophoneEnabled ?? false;
  const localSharing = Boolean(
    room?.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track,
  );

  const participants: Participant[] = room
    ? [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    : [];

  // ── إجراءات ──

  const toggleMic = async () => {
    if (!room) return;
    try {
      await room.startAudio().catch(() => {});
      await room.localParticipant.setMicrophoneEnabled(!localMicOn);
      bump();
    } catch {
      toast({ title: "تعذر الوصول للميكروفون", description: "تأكد من سماح المتصفح باستخدام الميكروفون", variant: "destructive" });
    }
  };

  const toggleScreenShare = async () => {
    if (!room) return;
    try {
      await room.localParticipant.setScreenShareEnabled(!localSharing, { audio: false });
      bump();
    } catch (e) {
      // المستخدم ألغى نافذة الاختيار — ليس خطأً يستحق إزعاجاً
      if ((e as Error)?.name !== "NotAllowedError") {
        toast({ title: "تعذر مشاركة الشاشة", variant: "destructive" });
      }
    }
  };

  const copyInvite = async () => {
    if (!inviteToken) return;
    await navigator.clipboard.writeText(`${window.location.origin}/meet/${inviteToken}`);
    toast({ title: "نُسخ رابط الدعوة" });
  };

  const leave = async () => {
    leftReasonRef.current = "left";
    if (mode === "staff") {
      apiRequest(`/api/meetings/${meetingId}/leave`, { method: "POST", silent: true }).catch(() => {});
    }
    roomRef.current?.disconnect();
  };

  const endForAll = async () => {
    try {
      leftReasonRef.current = "ended";
      await apiRequest(`/api/meetings/${meetingId}/end`, { method: "POST" });
    } catch {
      leftReasonRef.current = null;
      toast({ title: "تعذر إنهاء الاجتماع", variant: "destructive" });
    }
  };

  const toggleLock = async () => {
    try {
      const next = !isLocked;
      await apiRequest(`/api/meetings/${meetingId}/lock`, {
        method: "POST",
        body: JSON.stringify({ locked: next }),
      });
      setIsLocked(next);
    } catch {
      toast({ title: "تعذر تغيير قفل الغرفة", variant: "destructive" });
    }
  };

  const resolveRequest = async (participantId: string, action: "approve" | "deny") => {
    try {
      await apiRequest(`/api/meetings/${meetingId}/requests/${participantId}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      queryClient.invalidateQueries({ queryKey: [rosterQueryKey] });
    } catch {
      toast({ title: "تعذر حسم الطلب", variant: "destructive" });
    }
  };

  const muteParticipant = async (identity: string) => {
    try {
      await apiRequest(`/api/meetings/${meetingId}/participants/mute`, {
        method: "POST",
        body: JSON.stringify({ identity }),
      });
      toast({ title: "تم كتم المشارك" });
    } catch {
      toast({ title: "تعذر كتم المشارك", variant: "destructive" });
    }
  };

  const removeParticipant = async (participantId: string) => {
    try {
      await apiRequest(`/api/meetings/${meetingId}/participants/${participantId}/remove`, {
        method: "POST",
      });
      queryClient.invalidateQueries({ queryKey: [rosterQueryKey] });
    } catch {
      toast({ title: "تعذر إخراج المشارك", variant: "destructive" });
    }
  };

  // ── العرض ──

  if (connectError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center" dir="rtl">
        <p className="text-sm text-muted-foreground">{connectError}</p>
        <Button variant="outline" onClick={() => onLeft("error")}>رجوع</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex h-full min-h-[calc(100vh-0px)] flex-col bg-[#101820] text-[#e8eef4]">
      {/* حاوية الصوت البعيد — غير مرئية */}
      <div ref={audioContainerRef} className="hidden" />

      {/* الشريط العلوي */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2b3a48] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
            <Radio className="h-3 w-3 animate-pulse" /> مباشر
          </span>
          <h1 className="truncate text-sm font-bold">{meetingTitle}</h1>
          {isLocked ? <Lock className="h-3.5 w-3.5 shrink-0 text-amber-400" /> : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-[#8ba1b4]" dir="ltr">
            {formatElapsed(startedAt, now)}
          </span>
          {!connected ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[#8ba1b4]" /> : null}
        </div>
      </div>

      {/* الجسم */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* الشاشة المشاركة */}
          <div
            className={cn(
              "relative overflow-hidden rounded-xl border border-[#2b3a48] bg-[#1a2530]",
              screenShareInfo ? "flex-1" : "hidden lg:flex lg:flex-1 lg:items-center lg:justify-center",
            )}
          >
            <video
              ref={screenVideoRef}
              className={cn("h-full w-full object-contain", !screenShareInfo && "hidden")}
              autoPlay
              playsInline
              muted
            />
            {screenShareInfo ? (
              <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 text-[11px]">
                <ScreenShare className="h-3 w-3 text-sky-400" />
                {screenShareInfo.isLocal ? "أنت تشارك شاشتك" : `${screenShareInfo.ownerName} يشارك الشاشة`}
              </div>
            ) : (
              <div className="hidden flex-col items-center gap-2 text-[#8ba1b4] lg:flex">
                <ScreenShare className="h-8 w-8 opacity-40" />
                <p className="text-xs">لا شاشة مشاركة الآن — شارك متصفحك من الشريط بالأسفل</p>
              </div>
            )}
          </div>

          {/* بلاطات المشاركين */}
          <div className="grid shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {participants.map((p) => {
              const meta = parseMeta(p);
              const name = meta.name || p.name || p.identity;
              const speaking = p.isSpeaking;
              const micOn = p.isMicrophoneEnabled;
              const isLocal = room ? p === room.localParticipant : false;
              return (
                <div
                  key={p.identity}
                  className={cn(
                    "relative rounded-xl border bg-[#1a2530] px-2 pb-2.5 pt-3.5 text-center",
                    speaking ? "border-emerald-500 shadow-[0_0_0_1px_#10b981]" : "border-[#2b3a48]",
                  )}
                  data-testid={`tile-participant-${p.identity}`}
                >
                  {!micOn ? (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#3a2528] text-red-400">
                      <MicOff className="h-3 w-3" />
                    </span>
                  ) : null}
                  {speaking ? (
                    <span className="absolute left-2 top-2 rounded bg-emerald-400/90 px-1.5 text-[9px] font-bold text-emerald-950">
                      يتحدث
                    </span>
                  ) : null}
                  <Avatar className={cn("mx-auto h-12 w-12", speaking && "ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-[#1a2530]")}>
                    {meta.avatarUrl ? <AvatarImage src={meta.avatarUrl} alt="" /> : null}
                    <AvatarFallback className="bg-[#3d6fa8] text-sm font-bold text-white">
                      {initialsOf(name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="mt-1.5 truncate text-xs font-medium">
                    {name}
                    {isLocal ? <span className="text-[#8ba1b4]"> (أنت)</span> : null}
                  </div>
                  <div className="truncate text-[10px] text-[#8ba1b4]">
                    {meta.isHost ? "المضيف" : meta.department || meta.jobTitle || (meta.isGuest ? "ضيف" : "")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* اللوحة الجانبية — منسوبون فقط */}
        {mode === "staff" && panelOpen ? (
          <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-[#2b3a48] bg-[#1a2530] lg:w-[290px]">
            <div className="flex items-center justify-between border-b border-[#2b3a48] px-3 py-2">
              <span className="text-xs font-bold">
                المشاركون
                <span className="mr-1.5 rounded-full bg-[#2b3a48] px-1.5 text-[10px] tabular-nums">
                  {roster.filter((r) => r.status === "admitted").length}
                </span>
              </span>
              <button onClick={() => setPanelOpen(false)} className="text-[#8ba1b4] hover:text-white" aria-label="إغلاق اللوحة">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {isHost && pendingRequests.length ? (
              <div className="border-b border-[#2b3a48]">
                <div className="mx-3 mt-2 rounded-md bg-amber-500/15 px-2.5 py-1 text-[10px] font-bold text-amber-400">
                  ⏳ {pendingRequests.length} بانتظار موافقتك
                </div>
                <div className="p-2">
                  {pendingRequests.map((r) => (
                    <div key={r.participantId} className="flex items-center gap-2 px-1 py-1.5">
                      <Avatar className="h-7 w-7">
                        {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="bg-[#7a5aa6] text-[10px] font-bold text-white">
                          {initialsOf(r.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{r.name}</div>
                        <div className="truncate text-[10px] text-[#8ba1b4]">
                          {r.isGuest ? "عبر رابط دعوة" : r.department || "منسوب"}
                        </div>
                      </div>
                      <button
                        onClick={() => resolveRequest(r.participantId, "approve")}
                        className="rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-500"
                        aria-label={`قبول ${r.name}`}
                        data-testid={`button-approve-${r.participantId}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => resolveRequest(r.participantId, "deny")}
                        className="rounded-md border border-[#2b3a48] p-1.5 text-[#8ba1b4] hover:text-white"
                        aria-label={`رفض ${r.name}`}
                        data-testid={`button-deny-${r.participantId}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {roster
                .filter((r) => r.status === "admitted")
                .map((r) => {
                  const live = r.identity
                    ? participants.find((p) => p.identity === r.identity)
                    : undefined;
                  return (
                    <div key={r.participantId} className="flex items-center gap-2 px-1 py-1.5">
                      <Avatar className="h-7 w-7">
                        {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="bg-[#2e8f7a] text-[10px] font-bold text-white">
                          {initialsOf(r.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {r.name}
                          {r.role === "host" ? <span className="mr-1 text-[9px] text-sky-400">· المضيف</span> : null}
                        </div>
                        <div className="truncate text-[10px] text-[#8ba1b4]">
                          {live ? (live.isMicrophoneEnabled ? "متصل" : "متصل · مكتوم") : "غير متصل"}
                        </div>
                      </div>
                      {isHost && r.role !== "host" && live ? (
                        <>
                          {live.isMicrophoneEnabled ? (
                            <button
                              onClick={() => muteParticipant(r.identity!)}
                              className="rounded-md border border-[#2b3a48] px-2 py-1 text-[10px] text-[#8ba1b4] hover:text-white"
                            >
                              كتم
                            </button>
                          ) : null}
                          <button
                            onClick={() => removeParticipant(r.participantId)}
                            className="rounded-md border border-red-900/60 px-2 py-1 text-[10px] text-red-400 hover:bg-red-950"
                          >
                            إخراج
                          </button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          </div>
        ) : null}
      </div>

      {/* شريط التحكم */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[#2b3a48] px-3 py-3">
        <ControlButton
          onClick={toggleMic}
          active={localMicOn}
          label={localMicOn ? "الميكروفون" : "مكتوم"}
          icon={localMicOn ? Mic : MicOff}
          testId="button-toggle-mic"
        />
        <ControlButton
          onClick={toggleScreenShare}
          active={localSharing}
          label={localSharing ? "إيقاف المشاركة" : "مشاركة الشاشة"}
          icon={localSharing ? MonitorX : MonitorUp}
          testId="button-toggle-screenshare"
        />
        {mode === "staff" ? (
          <ControlButton
            onClick={() => setPanelOpen((v) => !v)}
            active={panelOpen}
            label="المشاركون"
            icon={Users}
            badge={isHost && pendingRequests.length ? pendingRequests.length : undefined}
            testId="button-toggle-panel"
          />
        ) : null}
        {isHost && inviteToken ? (
          <ControlButton onClick={copyInvite} label="نسخ الدعوة" icon={Link2} testId="button-copy-invite" />
        ) : null}
        {isHost ? (
          <ControlButton
            onClick={toggleLock}
            active={isLocked}
            label={isLocked ? "فتح الغرفة" : "قفل الغرفة"}
            icon={isLocked ? LockOpen : Lock}
            testId="button-toggle-lock"
          />
        ) : null}
        <button
          onClick={leave}
          className="flex min-w-[84px] flex-col items-center gap-0.5 rounded-xl bg-red-600 px-4 py-2 text-[11px] font-bold text-white hover:bg-red-500"
          data-testid="button-leave"
        >
          <LogOut className="h-4 w-4" />
          مغادرة
        </button>
        {isHost ? (
          <button
            onClick={endForAll}
            className="flex min-w-[84px] flex-col items-center gap-0.5 rounded-xl border border-red-800 px-4 py-2 text-[11px] font-bold text-red-400 hover:bg-red-950"
            data-testid="button-end-meeting"
          >
            <PhoneOff className="h-4 w-4" />
            إنهاء للجميع
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ControlButton({
  onClick, active, label, icon: Icon, badge, testId,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  testId?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex min-w-[76px] flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-[11px]",
        active
          ? "border-sky-500 bg-sky-600 text-white"
          : "border-[#2b3a48] bg-[#1a2530] text-[#e8eef4] hover:border-[#3d5266]",
      )}
      data-testid={testId}
    >
      {badge ? (
        <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white tabular-nums">
          {badge}
        </span>
      ) : null}
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
