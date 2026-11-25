// تسجيل صوت من الميكروفون في المتصفح لـ«صوتي»: فحص ضجيج الغرفة، ثم تسجيل مع قياس
// مستوى الصوت لحظيًا، وإرجاع الملف ومدته ونتائج القياس. لا يرسل شيئًا للخادم.
import { useCallback, useEffect, useRef, useState } from "react";
import { WRITER_VOICE_MAX_SECONDS, WRITER_VOICE_ROOM_CHECK_SECONDS, rmsToDbfs } from "@shared/writerVoice";

export type RecordingResult = {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  speechDbfs: number;
  clippedRatio: number;
};

export type RecorderPhase = "idle" | "checking" | "recording" | "done" | "error";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];
const HISTORY = 28;

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported?.(m)) ?? "";
}

export function isVoiceRecordingSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export function useVoiceRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(HISTORY).fill(0));
  const [liveDbfs, setLiveDbfs] = useState(-100);
  const [noiseDbfs, setNoiseDbfs] = useState<number | null>(null);
  const [result, setResult] = useState<RecordingResult | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const rafRef = useRef<number | null>(null);
  const statsRef = useRef({ speechSum: 0, speechFrames: 0, clipped: 0, frames: 0, noiseSum: 0, noiseFrames: 0 });
  const startedAtRef = useRef(0);
  const modeRef = useRef<"check" | "record" | null>(null);
  const lastUiRef = useRef(0);

  const stopLoop = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const release = useCallback(() => {
    stopLoop();
    modeRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => () => release(), [release]);

  const ensureStream = useCallback(async () => {
    if (streamRef.current && analyserRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
    });
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    streamRef.current = stream;
    ctxRef.current = ctx;
    analyserRef.current = analyser;
  }, []);

  const loop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < buf.length; i += 1) {
        const v = buf[i];
        sum += v * v;
        const a = Math.abs(v);
        if (a > peak) peak = a;
      }
      const db = rmsToDbfs(Math.sqrt(sum / buf.length));
      const s = statsRef.current;
      const secs = (performance.now() - startedAtRef.current) / 1000;
      if (modeRef.current === "check") {
        s.noiseSum += db;
        s.noiseFrames += 1;
      } else if (modeRef.current === "record") {
        s.frames += 1;
        if (peak >= 0.99) s.clipped += 1;
        if (db > -45) {
          s.speechSum += db;
          s.speechFrames += 1;
        }
      }
      const now = performance.now();
      if (now - lastUiRef.current > 90) {
        lastUiRef.current = now;
        setLiveDbfs(db);
        setElapsed(secs);
        setLevels((prev) => [...prev.slice(1), Math.min(1, Math.max(0, (db + 60) / 50))]);
      }
      if (modeRef.current === "check" && secs >= WRITER_VOICE_ROOM_CHECK_SECONDS) {
        modeRef.current = null;
        setNoiseDbfs(s.noiseFrames ? s.noiseSum / s.noiseFrames : -100);
        setPhase("idle");
        stopLoop();
        return;
      }
      if (modeRef.current === "record" && secs >= WRITER_VOICE_MAX_SECONDS) {
        recorderRef.current?.stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    stopLoop();
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const fail = useCallback((err: unknown) => {
    const name = (err as { name?: string })?.name;
    setError(
      name === "NotAllowedError"
        ? "لم يُسمح باستخدام الميكروفون. اسمح به من إعدادات المتصفح ثم حاول مرة أخرى."
        : name === "NotFoundError"
          ? "لم نجد ميكروفونًا متصلًا بجهازك."
          : "تعذر تشغيل الميكروفون. حاول مرة أخرى.",
    );
    setPhase("error");
    release();
  }, [release]);

  const checkRoom = useCallback(async () => {
    try {
      setError(null);
      setNoiseDbfs(null);
      await ensureStream();
      await ctxRef.current?.resume();
      statsRef.current = { speechSum: 0, speechFrames: 0, clipped: 0, frames: 0, noiseSum: 0, noiseFrames: 0 };
      startedAtRef.current = performance.now();
      modeRef.current = "check";
      setPhase("checking");
      loop();
    } catch (err) {
      fail(err);
    }
  }, [ensureStream, loop, fail]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setResult(null);
      await ensureStream();
      await ctxRef.current?.resume();
      const mimeType = pickMime();
      const recorder = new MediaRecorder(streamRef.current as MediaStream, mimeType ? { mimeType, audioBitsPerSecond: 128_000 } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const s = statsRef.current;
        const durationSeconds = (performance.now() - startedAtRef.current) / 1000;
        const type = recorder.mimeType || mimeType || "audio/webm";
        setResult({
          blob: new Blob(chunks, { type }),
          mimeType: type,
          durationSeconds,
          speechDbfs: s.speechFrames ? s.speechSum / s.speechFrames : -100,
          clippedRatio: s.frames ? s.clipped / s.frames : 0,
        });
        setPhase("done");
        release();
      };
      statsRef.current = { speechSum: 0, speechFrames: 0, clipped: 0, frames: 0, noiseSum: 0, noiseFrames: 0 };
      recorderRef.current = recorder;
      recorder.start(1000);
      startedAtRef.current = performance.now();
      modeRef.current = "record";
      setElapsed(0);
      setPhase("recording");
      loop();
    } catch (err) {
      fail(err);
    }
  }, [ensureStream, loop, fail, release]);

  const stopRecording = useCallback(() => {
    modeRef.current = null;
    stopLoop();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    release();
    setResult(null);
    setElapsed(0);
    setError(null);
    setPhase("idle");
  }, [release]);

  return { phase, error, elapsed, levels, liveDbfs, noiseDbfs, result, checkRoom, startRecording, stopRecording, reset };
}
