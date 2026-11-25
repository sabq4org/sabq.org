// «صوتي» — يسجّل كاتب الرأي صوته نحو دقيقة لننشئ منه نسخة في ElevenLabs تُستخدم لمقالاته فقط وباختياره.
// النموذج المعتمد 2026-11-25: https://claude.ai/artifact/9SvF7QGvWf1u86Zbu9sErz
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Clock, Lock, Mic, MessageSquare, Pause, Play, RefreshCw, Volume2 } from "lucide-react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { isVoiceRecordingSupported, setAudioSessionType, useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useNewFeature } from "@/hooks/useNewFeatures";
import {
  WRITER_VOICE_CONSENT_TEXT,
  WRITER_VOICE_CONSENT_VERSION,
  WRITER_VOICE_MAX_SECONDS,
  WRITER_VOICE_MIN_SECONDS,
  WRITER_VOICE_SCRIPT,
  WRITER_VOICE_TARGET_SECONDS,
  activeScriptIndex,
  checkWriterVoiceDuration,
  classifyRoomNoise,
  classifySpeechLevel,
  type WriterVoiceStateDto,
} from "@shared/writerVoice";

const VOICE_QUERY = "/api/opinion-author/voice";
type Step = "home" | "intro" | "room" | "record" | "review";

function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric", numberingSystem: "latn" });
  } catch {
    return "";
  }
}

function Bars({ levels, className }: { levels: number[]; className?: string }) {
  return (
    <div className={cn("flex h-11 flex-1 items-center gap-[3px] overflow-hidden", className)} dir="ltr" aria-hidden>
      {levels.map((v, i) => (
        <i key={i} className="block w-1 rounded-sm bg-[#4CBCFD]" style={{ height: `${6 + v * 38}px` }} />
      ))}
    </div>
  );
}

function CheckLine({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium", tone === "ok" ? "bg-[#E5F6EE] text-[#1F7A55]" : "bg-[#FDF3E2] text-[#8A5A12]")}>
      {tone === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

function Row({ icon: Icon, title, text, tone }: { icon: typeof Mic; title: React.ReactNode; text: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-start gap-3 border-b border-[#EEF2F6] px-4 py-3.5 last:border-b-0 sm:px-5">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone === "ok" ? "bg-[#E5F6EE] text-[#1F9D6B]" : tone === "warn" ? "bg-[#FDF3E2] text-[#B7791F]" : "bg-[#E6F4FD] text-[#0B6FA8]")}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <b className="block font-semibold">{title}</b>
        <span className="text-[13.5px] leading-6 text-[#6B7C8F]">{text}</span>
      </div>
    </div>
  );
}

function AudioPlayer({ src, label, knownDuration }: { src: string; label: string; knownDuration?: number }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // تسجيلات المتصفح كثيرًا ما تُرجع مدة غير معروفة، فنستعمل المدة المقيسة أثناء التسجيل.
  const total = duration || knownDuration || 0;
  const play = () => {
    setAudioSessionType("playback");
    const el = ref.current;
    if (!el) return;
    el.muted = false;
    el.volume = 1;
    void el.play().catch(() => {});
  };
  return (
    <div className="flex items-center gap-3.5 px-4 py-4 sm:px-5">
      <audio
        ref={ref}
        src={src}
        preload="auto"
        playsInline
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        aria-label={playing ? "إيقاف مؤقت" : label}
        onClick={() => (playing ? ref.current?.pause() : play())}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1E9BE6] text-white"
      >
        {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>
      <div className="relative h-1.5 flex-1 rounded-full bg-[#EEF2F6]" dir="ltr">
        <i className="absolute inset-y-0 left-0 rounded-full bg-[#1E9BE6]" style={{ width: total ? `${Math.min(100, (time / total) * 100)}%` : "0%" }} />
      </div>
      <span className="text-[13px] tabular-nums text-[#6B7C8F]" dir="ltr">{fmtTime(time)}{total ? ` / ${fmtTime(total)}` : ""}</span>
    </div>
  );
}

/** يفك الصوت بمحرك المتصفح ويكتبه WAV أحادي 16-bit (دقيقة ≈ 2.8MB عند 24kHz). */
async function toWavBlob(blob: Blob): Promise<Blob> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const rate = Math.min(decoded.sampleRate, 24000);
    const step = decoded.sampleRate / rate;
    const length = Math.floor(decoded.length / step);
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const out = new DataView(new ArrayBuffer(44 + length * 2));
    const text = (at: number, value: string) => { for (let i = 0; i < value.length; i += 1) out.setUint8(at + i, value.charCodeAt(i)); };
    text(0, "RIFF"); out.setUint32(4, 36 + length * 2, true); text(8, "WAVE"); text(12, "fmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    text(36, "data"); out.setUint32(40, length * 2, true);
    for (let i = 0; i < length; i += 1) {
      const at = Math.floor(i * step);
      let v = 0;
      for (const ch of channels) v += ch[at];
      v = Math.max(-1, Math.min(1, v / channels.length));
      out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return new Blob([out], { type: "audio/wav" });
  } finally {
    void ctx.close().catch(() => {});
  }
}

/** التسجيل الأصلي: يُقرأ كاملًا ثم يُشغَّل من الذاكرة، لأن سفاري يعجز عن بثّ تسجيل آيفون من رابط. */
function SampleFilePlayer({ knownDuration }: { knownDuration?: number | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetch(apiUrl(`${VOICE_QUERY}/sample-file`), { credentials: "include" })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(async (blob) => {
        // آيفون لا يشغّل ملف MP4 الذي سجّله سفاري عند إعادة فتحه، فنفكّه ونحوّله إلى WAV عادي.
        // إن تعذّر الفك نشغّل الملف كما هو (يعمل في متصفحات الحاسب).
        const playable = (await toWavBlob(blob).catch(() => null)) ?? blob;
        if (cancelled) return;
        url = URL.createObjectURL(playable);
        setSrc(url);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);
  if (failed) return <p className="px-4 py-3 text-[13.5px] text-[#B7791F] sm:px-5">تعذر تحميل التسجيل الأصلي. حدّث الصفحة وحاول مرة أخرى.</p>;
  if (!src) return <p className="px-4 py-3 text-[13.5px] text-[#6B7C8F] sm:px-5">جارٍ تحميل التسجيل…</p>;
  return <AudioPlayer src={src} label="تشغيل تسجيلك" knownDuration={knownDuration ?? undefined} />;
}

export default function WriterVoicePage() {
  const { toast } = useToast();
  const recorder = useVoiceRecorder();
  const supported = useMemo(() => isVoiceRecordingSupported(), []);
  const [step, setStep] = useState<Step>("home");
  const [agreed, setAgreed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<{ voice?: WriterVoiceStateDto }>({
    queryKey: [VOICE_QUERY],
    refetchInterval: (q) => ((q.state.data as { voice?: WriterVoiceStateDto } | undefined)?.voice?.status === "processing" ? 4000 : false),
  });
  const voice = data?.voice ?? null;
  const status = voice?.status ?? "none";
  const { markOpened } = useNewFeature("writer-voice");

  useEffect(() => {
    if (status === "processing" || status === "ready") markOpened();
  }, [status, markOpened]);

  useEffect(() => {
    if (step === "home" && !isLoading && (status === "none" || status === "failed")) setStep("intro");
  }, [step, status, isLoading]);

  const sampleUrl = useMemo(() => (recorder.result ? URL.createObjectURL(recorder.result.blob) : null), [recorder.result]);
  useEffect(() => () => { if (sampleUrl) URL.revokeObjectURL(sampleUrl); }, [sampleUrl]);

  useEffect(() => {
    if (recorder.phase === "done" && step === "record") setStep("review");
  }, [recorder.phase, step]);

  const submit = useMutation({
    mutationFn: async () => {
      const r = recorder.result;
      if (!r) throw new Error("لا يوجد تسجيل");
      const ext = r.mimeType.includes("mp4") ? "m4a" : r.mimeType.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("consent", "true");
      form.append("consentVersion", WRITER_VOICE_CONSENT_VERSION);
      form.append("durationSeconds", String(Math.round(r.durationSeconds)));
      form.append("file", new File([r.blob], `voice.${ext}`, { type: r.mimeType.split(";")[0] }));
      return apiRequest<{ voice: WriterVoiceStateDto }>(VOICE_QUERY, { method: "POST", body: form, isFormData: true, timeoutMs: 90_000 });
    },
    onSuccess: (res) => {
      queryClient.setQueryData([VOICE_QUERY], res);
      recorder.reset();
      setStep("home");
    },
    onError: (error: Error) => toast({ title: "تعذر إرسال التسجيل", description: error.message, variant: "destructive" }),
  });

  const withdraw = useMutation({
    mutationFn: () => apiRequest<{ voice: WriterVoiceStateDto }>(VOICE_QUERY, { method: "DELETE" }),
    onSuccess: (res) => {
      queryClient.setQueryData([VOICE_QUERY], res);
      setConfirmDelete(false);
      setAgreed(false);
      setStep("intro");
      toast({ title: "حذفنا صوتك", description: "أزلنا صوتك وتسجيلك نهائيًا، وسحبنا موافقتك." });
    },
    onError: (error: Error) => toast({ title: "تعذر حذف صوتك", description: error.message, variant: "destructive" }),
  });

  const startOver = () => {
    recorder.reset();
    setAgreed(false);
    setStep("intro");
  };

  // ── شاشات ──
  const intro = (
    <div className="flex flex-col gap-4">
      {status === "failed" && voice?.errorMessage ? <CheckLine tone="warn">{voice.errorMessage}</CheckLine> : null}
      <div className="flex flex-col gap-1.5 rounded-[22px] bg-gradient-to-br from-[#E3F3FE] to-[#EEEBFD] p-5">
        <b className="text-[17px]">دقيقة واحدة تكفي</b>
        <span className="text-[13.5px] leading-6 text-[#3D5266]">تقرأ نصًّا قصيرًا نعرضه أمامك، وتستمع إليه قبل الإرسال، وتعيده متى شئت.</span>
      </div>
      <WriterSurface>
        <Row icon={Volume2} title="اختر غرفة هادئة ومغلقة" text="بعيدًا عن المكيّف والتلفاز والشارع. الستائر والسجاد يقلّلان الصدى." />
        <Row icon={Mic} title="الجوال أو الميكروفون على بعد شبر" text="ثابت أمام فمك، لا في يدك. السماعة السلكية أفضل من سماعة البلوتوث." />
        <Row icon={MessageSquare} title="اقرأ بصوتك الطبيعي" text="كما تتحدث مع صديق، بإيقاع ثابت ودون تمثيل أو رفع للصوت." />
        <Row icon={Clock} title="نحو دقيقة، ونتوقف تلقائيًا عند دقيقتين" text="لا يضر التلعثم البسيط. أكمل القراءة ولا تبدأ من جديد." />
      </WriterSurface>
      <WriterSurface>
        <label htmlFor="writer-voice-consent" className="flex cursor-pointer items-start gap-3 p-4 sm:p-5">
          <input id="writer-voice-consent" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#1E9BE6]" />
          <span className="text-[15px] leading-7">
            {WRITER_VOICE_CONSENT_TEXT}
            <small className="mt-1.5 block text-[12.5px] leading-5 text-[#6B7C8F]">
              يُعالَج الصوت لدى ElevenLabs. التسجيل الأصلي محفوظ في مكان خاص لا يُنشر، ولا يسمعه إلا أنت ومسؤول المنصة، ويُحذف بعد 30 يومًا من تجهيز صوتك.
            </small>
          </span>
        </label>
      </WriterSurface>
      {!supported ? <CheckLine tone="warn">متصفحك لا يدعم التسجيل. افتح الصفحة من Safari أو Chrome بإصدار حديث.</CheckLine> : null}
      <Button className="h-12 rounded-full text-[15px] font-bold" disabled={!agreed || !supported} onClick={() => { setStep("room"); void recorder.checkRoom(); }}>
        ابدأ
      </Button>
      {status === "ready" ? <button type="button" className="text-sm text-[#0B6FA8]" onClick={() => setStep("home")}>رجوع إلى صوتي</button> : null}
    </div>
  );

  const noise = recorder.noiseDbfs == null ? null : classifyRoomNoise(recorder.noiseDbfs);
  const room = (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#6B7C8F]">الخطوة 1 من 3</p>
      <h2 className="text-2xl font-bold">نستمع إلى الغرفة 5 ثوانٍ</h2>
      <p className="text-[#6B7C8F]">ابقَ صامتًا قليلًا، نقيس الضوضاء من حولك قبل أن تبدأ.</p>
      <WriterSurface className="p-5"><Bars levels={recorder.levels} className="justify-center" /></WriterSurface>
      {recorder.error ? <CheckLine tone="warn">{recorder.error}</CheckLine> : null}
      {recorder.phase === "checking" ? <p className="text-center text-sm text-[#6B7C8F]" aria-live="polite">جارٍ القياس… <span className="tabular-nums">{Math.min(5, Math.ceil(recorder.elapsed))}</span></p> : null}
      {noise === "quiet" || noise === "acceptable" ? <CheckLine tone="ok">المكان هادئ، يمكنك البدء</CheckLine> : null}
      {noise === "noisy" ? <CheckLine tone="warn">نسمع ضجيجًا ثابتًا، ربما مكيّف أو تلفاز. أطفئه أو انتقل لغرفة أخرى ثم أعد الفحص.</CheckLine> : null}
      <Button className="h-12 rounded-full text-[15px] font-bold" disabled={noise == null || recorder.phase === "checking"} onClick={() => { setStep("record"); void recorder.startRecording(); }}>
        {noise === "noisy" ? "ابدأ رغم ذلك" : "ابدأ التسجيل"}
      </Button>
      <button type="button" className="text-sm text-[#0B6FA8]" disabled={recorder.phase === "checking"} onClick={() => void recorder.checkRoom()}>أعد الفحص</button>
    </div>
  );

  const idx = activeScriptIndex(recorder.elapsed);
  const ringOffset = 213.6 * (1 - Math.min(1, recorder.elapsed / WRITER_VOICE_TARGET_SECONDS));
  const liveLevel = classifySpeechLevel(recorder.liveDbfs, 0);
  const record = (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#6B7C8F]">الخطوة 2 من 3 · يسجَّل الآن</p>
      <WriterSurface className="p-5 text-[19px] leading-[2.05] text-[#A4B2C0] sm:p-6">
        {WRITER_VOICE_SCRIPT.map((s, i) => (
          <span key={i} className={cn(i < idx && "text-[#6B7C8F]", i === idx && "rounded-lg bg-[#E6F4FD] px-1 text-[#1B2B3A] [box-decoration-break:clone]")}>{s} </span>
        ))}
      </WriterSurface>
      <WriterSurface className="flex items-center gap-4 p-4">
        <div className="relative h-[78px] w-[78px] shrink-0">
          <svg viewBox="0 0 80 80" className="h-[78px] w-[78px] -rotate-90" aria-hidden>
            <circle cx="40" cy="40" r="34" fill="none" stroke="#EEF2F6" strokeWidth="7" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="#1E9BE6" strokeWidth="7" strokeLinecap="round" strokeDasharray="213.6" strokeDashoffset={ringOffset} />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-[17px] font-bold tabular-nums" dir="ltr" aria-live="off">{fmtTime(recorder.elapsed)}</span>
        </div>
        <Bars levels={recorder.levels} />
        <button type="button" aria-label="إيقاف التسجيل" disabled={recorder.elapsed < WRITER_VOICE_MIN_SECONDS} onClick={recorder.stopRecording}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#FDECEA] disabled:opacity-40">
          <span className="h-[18px] w-[18px] rounded-[5px] bg-[#C0392B]" />
        </button>
      </WriterSurface>
      {recorder.error ? <CheckLine tone="warn">{recorder.error}</CheckLine> : liveLevel === "low" && recorder.elapsed > 3 ? <CheckLine tone="warn">صوتك منخفض. اقترب قليلًا من الميكروفون.</CheckLine> : <CheckLine tone="ok">مستوى صوتك مناسب</CheckLine>}
      <p className="text-center text-[13px] text-[#6B7C8F]">
        {recorder.elapsed < WRITER_VOICE_MIN_SECONDS
          ? `الجملة المظللة هي التي تقرؤها الآن. يتاح الإيقاف بعد ${WRITER_VOICE_MIN_SECONDS} ثانية.`
          : `يمكنك الإيقاف الآن، ونتوقف تلقائيًا عند ${WRITER_VOICE_MAX_SECONDS / 60} دقيقة.`}
      </p>
      <button type="button" className="text-sm text-[#0B6FA8]" onClick={() => { recorder.reset(); setStep("room"); void recorder.checkRoom(); }}>ألغِ وابدأ من جديد</button>
    </div>
  );

  const r = recorder.result;
  const durationOk = r ? checkWriterVoiceDuration(r.durationSeconds) === "ok" : false;
  const level = r ? classifySpeechLevel(r.speechDbfs, r.clippedRatio) : "ok";
  const roomNoise = recorder.noiseDbfs == null ? "quiet" : classifyRoomNoise(recorder.noiseDbfs);
  const review = (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#6B7C8F]">الخطوة 3 من 3</p>
      <h2 className="text-2xl font-bold">استمع لتسجيلك قبل الإرسال</h2>
      {sampleUrl ? <WriterSurface><AudioPlayer src={sampleUrl} label="تشغيل تسجيلك" knownDuration={recorder.result?.durationSeconds} /></WriterSurface> : null}
      {r ? (
        <WriterSurface>
          <Row icon={durationOk ? Check : AlertTriangle} tone={durationOk ? "ok" : "warn"} title={<>المدة <span className="tabular-nums" dir="ltr">{fmtTime(r.durationSeconds)}</span></>}
            text={durationOk ? "مناسبة. المطلوب بين 45 ثانية ودقيقتين." : "المدة خارج المطلوب. أعد التسجيل بين 45 ثانية ودقيقتين."} />
          <Row icon={level === "ok" ? Check : AlertTriangle} tone={level === "ok" ? "ok" : "warn"} title="وضوح الصوت"
            text={level === "ok" ? "مستوى ثابت وواضح." : level === "low" ? "الصوت منخفض. اقترب من الميكروفون وأعد التسجيل." : "الصوت مرتفع حتى التشويش. ابتعد قليلًا وأعد التسجيل."} />
          <Row icon={roomNoise === "noisy" ? AlertTriangle : Check} tone={roomNoise === "noisy" ? "warn" : "ok"} title="هدوء الخلفية"
            text={roomNoise === "noisy" ? "في الخلفية ضجيج قد يظهر في صوتك المستنسخ." : "لا ضجيج يُذكر."} />
        </WriterSurface>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <Button variant="outline" className="h-12 flex-1 rounded-full border-[#D7E7F3] text-[15px] font-bold text-[#0B6FA8]" disabled={submit.isPending}
          onClick={() => { recorder.reset(); setStep("room"); void recorder.checkRoom(); }}>
          أعد التسجيل
        </Button>
        <Button className="h-12 flex-1 rounded-full text-[15px] font-bold" disabled={!durationOk || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? <RefreshCw className="ms-1 h-4 w-4 animate-spin" /> : null}
          اعتمد وأرسل
        </Button>
      </div>
      <p className="text-[13px] text-[#6B7C8F]">لن يُرسل شيء قبل أن تضغط «اعتمد وأرسل».</p>
    </div>
  );

  const processing = (
    <div className="flex flex-col gap-4">
      <WriterSurface className="flex flex-col items-center gap-2 px-5 py-8 text-center">
        <span className="h-14 w-14 animate-spin rounded-full border-[5px] border-[#E6F4FD] border-t-[#1E9BE6] motion-reduce:animate-none" aria-hidden />
        <h2 className="mt-2 text-[22px] font-bold">نجهّز صوتك</h2>
        <p className="max-w-md text-[#6B7C8F]">يستغرق عادة أقل من دقيقة. يمكنك مغادرة الصفحة، وسنرسل لك تنبيهًا حين يجهز.</p>
      </WriterSurface>
      <div className="flex items-center gap-2.5 rounded-[18px] bg-white px-4 py-3.5 text-[13px] text-[#6B7C8F]">
        <Lock className="h-4 w-4 shrink-0 text-[#0B6FA8]" /> تسجيلك محفوظ في مكان خاص، ولا يظهر في أي صفحة عامة.
      </div>
    </div>
  );

  const ready = voice ? (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-2xl font-bold">صوتك جاهز</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#E5F6EE] px-3 py-0.5 text-[13px] font-semibold text-[#1F9D6B]"><Check className="h-3.5 w-3.5" /> جاهز</span>
      </div>
      {voice.errorMessage ? <CheckLine tone="warn">{voice.errorMessage}</CheckLine> : null}
      {voice.hasPreview ? (
        <div className="flex flex-col gap-1 rounded-[22px] bg-gradient-to-br from-[#E3F3FE] to-[#EEEBFD] p-5 pb-1">
          <b>اسمع صوتك يقرأ فقرة من مقالك الأخير</b>
          <AudioPlayer src={apiUrl(`${VOICE_QUERY}/audio/preview`)} label="تشغيل الاستماع التجريبي" />
        </div>
      ) : null}
      <WriterSurface>
        <div className="flex items-center gap-3 border-b border-[#EEF2F6] px-4 py-3.5 sm:px-5">
          <div className="min-w-0 flex-1">
            <b className="block font-semibold">اقرأ مقالاتي بصوتي <span className="ms-1.5 rounded-full bg-[#E6F4FD] px-2.5 py-0.5 text-xs font-medium text-[#0B6FA8]">قريبًا</span></b>
            <span className="text-[13.5px] text-[#6B7C8F]">حين نطلقها، يظهر زر «استمع» على مقالاتك بصوتك بدل الصوت العام، وتختار تفعيلها بنفسك.</span>
          </div>
          <span className="relative h-[30px] w-[50px] shrink-0 rounded-full bg-[#D8E1EA]" aria-label="غير متاح بعد" role="img">
            <span className="absolute right-[3px] top-[3px] h-6 w-6 rounded-full bg-white shadow" />
          </span>
        </div>
        <div className="border-b border-[#EEF2F6] px-4 py-3.5 sm:px-5">
          <b className="block font-semibold">تاريخ الموافقة</b>
          <span className="text-[13.5px] text-[#6B7C8F]">{fmtDate(voice.consentedAt)}</span>
        </div>
        <div className="px-4 py-3.5 sm:px-5">
          <b className="block font-semibold">التسجيل الأصلي</b>
          {voice.hasSample ? (
            <>
              <span className="text-[13.5px] text-[#6B7C8F]">يُحذف تلقائيًا في {fmtDate(voice.sampleDeletesAt)}.</span>
              <SampleFilePlayer knownDuration={voice.sampleSeconds} />
            </>
          ) : (
            <span className="text-[13.5px] text-[#6B7C8F]">حُذف بعد تجهيز صوتك، ويبقى صوتك المستنسخ فقط.</span>
          )}
        </div>
      </WriterSurface>
      <Button variant="outline" className="h-12 rounded-full border-[#D7E7F3] text-[15px] font-bold text-[#0B6FA8]" onClick={startOver}>سجّل من جديد</Button>
      {confirmDelete ? (
        <WriterSurface className="flex flex-col gap-3 p-4 sm:p-5">
          <b>تأكيد الحذف</b>
          <p className="text-[13.5px] text-[#6B7C8F]">الحذف يزيل صوتك من ElevenLabs ومن سبق نهائيًا، ويسحب موافقتك، ولا يمكن التراجع عنه.</p>
          <div className="flex flex-wrap gap-2.5">
            <Button variant="outline" className="h-11 flex-1 rounded-full" onClick={() => setConfirmDelete(false)} disabled={withdraw.isPending}>تراجع</Button>
            <Button className="h-11 flex-1 rounded-full bg-[#C0392B] hover:bg-[#A93226]" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
              {withdraw.isPending ? <RefreshCw className="ms-1 h-4 w-4 animate-spin" /> : null} احذف نهائيًا
            </Button>
          </div>
        </WriterSurface>
      ) : (
        <button type="button" className="text-sm text-[#C0392B]" onClick={() => setConfirmDelete(true)}>احذف صوتي واسحب موافقتي</button>
      )}
    </div>
  ) : null;

  let content: React.ReactNode;
  if (isLoading) content = <WriterSurface className="p-8 text-center text-[#6B7C8F]">جارٍ التحميل…</WriterSurface>;
  else if (isError) content = (
    <WriterSurface className="flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-[#6B7C8F]">تعذر جلب حالة صوتك.</p>
      <Button variant="outline" className="rounded-full" onClick={() => void refetch()}>أعد المحاولة</Button>
    </WriterSurface>
  );
  else if (step === "room") content = room;
  else if (step === "record") content = record;
  else if (step === "review") content = review;
  else if (step === "intro") content = intro;
  else if (status === "processing") content = processing;
  else if (status === "ready") content = ready;
  else content = intro;

  return (
    <WriterPageFrame
      icon={Mic}
      title={step === "home" && status === "ready" ? "صوتي" : "سجّل صوتك مرة واحدة، ليكون جاهزًا لقراءة مقالاتك"}
      description={step === "home" && status === "ready" ? "صوتك المستنسخ لقراءة مقالاتك" : "قراءة مقالاتك بصوتك للقراء ميزة قادمة. صوتك لمقالاتك أنت فقط، وباختيارك"}
      titleTestId="writer-voice-title"
    >
      <div className="max-w-[720px]">{content}</div>
    </WriterPageFrame>
  );
}
