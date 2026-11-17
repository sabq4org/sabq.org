// ----------------------------------------------------------------------------
// «مُدوِّن سبق AI» — عامل تفريغ اجتماعات سبق (الهوية التقنية: sabq-minutes-agent)
//
// خدمة مستقلة (Railway) تسجَّل لدى LiveKit Cloud باسم sabq-minutes-agent
// وتُستدعى حصراً عبر Agent Dispatch من خادم سبق عند بدء اجتماع مفعَّل
// المحضر (metadata تحمل meetingId). تشترك في مسار صوت كل متحدث على حدة
// — فهوية المتحدث معروفة من المسار بلا نماذج فصل — وتبث المقاطع النهائية
// دفعات إلى مسار الاستقبال الداخلي في خادم سبق.
//
// metadata الاستدعاء: { meetingId, keyterms? } — keyterms أسماء الأقسام
// والمنسوبين المعروضة (غير حساسة) تُبنى في الخادم وتُمرَّر للـprompt ولا تُطبع.
//
// المتغيرات المطلوبة:
//   LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
//   OPENAI_API_KEY            — للتفريغ (gpt-4o-transcribe)
//   SABQ_API_URL              — مثال: https://api.sabq.org
//   MEETINGS_AGENT_SECRET     — نفس قيمة الخادم الرئيسي
// ----------------------------------------------------------------------------

import {
  type JobContext,
  WorkerOptions,
  cli,
  defineAgent,
  stt,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import {
  AudioFrame,
  AudioStream,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  TrackKind,
} from "@livekit/rtc-node";
import { fileURLToPath } from "node:url";
import { SegmentClock, buildSttOptions, parseJobMetadata } from "./sttConfig.js";
import {
  FINAL_GRACE_MS,
  FORCE_CLOSE_GRACE_MS,
  TrackMeter,
  UPLOAD_TIMEOUT_MS,
  diagnoseTrack,
  settleWithin,
  summarizeTracks,
} from "./shutdown.js";

const AGENT_NAME = "sabq-minutes-agent";
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 40;
/** سقف الطابور عند تعذر الرفع — يمنع تضخم الذاكرة إن بقي الخادم يرد بخطأ */
const MAX_QUEUE = 2_000;
const STT_SAMPLE_RATE = 16_000;

interface Segment {
  speakerIdentity: string;
  speakerName: string;
  text: string;
  startMs: number;
}

/** مخزن الدفعات + الإرسال الدوري لخادم سبق */
class TranscriptUploader {
  private queue: Segment[] = [];
  private timer: NodeJS.Timeout;
  /** الرفع الجاري — close() ينتظره حتى لا تسبق إشارة الاكتمال آخر دفعة */
  private inflight: Promise<void> | null = null;

  constructor(private meetingId: string) {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  push(segment: Segment): void {
    this.queue.push(segment);
    if (this.queue.length >= MAX_BATCH) void this.flush();
  }

  /** إجمالي ما رُفع بنجاح — يُطبع عند الإغلاق ليجيب اللوج مباشرة: هل وصل التفريغ؟ */
  uploaded = 0;

  /** رفع واحد في كل مرة: النداء أثناء رفع جارٍ ينتظره ثم يرفع ما تجمّع */
  async flush(): Promise<void> {
    while (this.inflight) await this.inflight;
    if (!this.queue.length) return;
    this.inflight = this.uploadBatch().finally(() => {
      this.inflight = null;
    });
    await this.inflight;
  }

  private async uploadBatch(): Promise<void> {
    if (!this.queue.length) return;
    const batch = this.queue.splice(0, this.queue.length);
    try {
      const res = await fetch(
        `${process.env.SABQ_API_URL}/api/internal/meetings-agent/${this.meetingId}/transcripts`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-secret": process.env.MEETINGS_AGENT_SECRET || "",
          },
          body: JSON.stringify({ segments: batch }),
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const snippet = body.replace(/\s+/g, " ").slice(0, 160);
        // 401/403 = config/auth (wrong secret or CSRF) — retrying forever
        // fills the queue and makes the LiveKit job "unresponsive".
        if (res.status === 401 || res.status === 403) {
          console.error(
            `[Agent] upload failed ${res.status} (permanent) — dropping ${batch.length}: ${snippet}`,
          );
          return;
        }
        console.error(
          `[Agent] upload failed ${res.status} — requeueing ${batch.length}: ${snippet}`,
        );
        this.requeue(batch);
      } else {
        this.uploaded += batch.length;
        console.log(`[Agent] uploaded ${batch.length} segments (total ${this.uploaded})`);
      }
    } catch (e) {
      console.error("[Agent] upload error:", (e as Error).message);
      this.requeue(batch);
    }
  }

  private requeue(batch: Segment[]): void {
    this.queue.unshift(...batch);
    if (this.queue.length > MAX_QUEUE) {
      const dropped = this.queue.length - MAX_QUEUE;
      this.queue.splice(0, dropped);
      console.error(`[Agent] upload queue full — dropped ${dropped} oldest segments`);
    }
  }

  /** إشعار الخادم باكتمال التفريغ — يولّد المحضر عندها بدل التخمين بمؤقت */
  async complete(summary: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch(
        `${process.env.SABQ_API_URL}/api/internal/meetings-agent/${this.meetingId}/complete`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agent-secret": process.env.MEETINGS_AGENT_SECRET || "",
          },
          body: JSON.stringify({ ...summary, uploaded: this.uploaded, pending: this.queue.length }),
          signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
        },
      );
      if (!res.ok) console.error(`[Agent] complete signal failed ${res.status}`);
    } catch (e) {
      console.error("[Agent] complete signal error:", (e as Error).message);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    // flush ينتظر أي رفع جارٍ أولاً؛ ثم محاولتان إضافيتان لما أُعيد للطابور بعد فشل
    await this.flush();
    for (let i = 0; i < 2 && this.queue.length; i++) await this.flush();
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const meta = parseJobMetadata(ctx.job.metadata);
    const meetingId = meta.meetingId;
    if (!meetingId) {
      console.error("[Agent] job without meetingId metadata — aborting");
      return;
    }
    // الأسماء لا تُطبع — العدد فقط
    const sttOptions = buildSttOptions(meta.keyterms);
    console.log(
      `[Agent] stt config: ${sttOptions.model} vad=${sttOptions.turnDetection.silence_duration_ms}ms ` +
        `noise=${sttOptions.noiseReductionType} keyterms=${meta.keyterms.length} prompt=${sttOptions.prompt.length}ch`,
    );

    await ctx.connect();
    console.log(`[Agent] joined room ${ctx.room.name} for meeting ${meetingId}`);

    const startedAt = Date.now();
    const uploader = new TranscriptUploader(meetingId);
    const activeStreams = new Set<Promise<void>>();
    // بثوث STT المفتوحة وعدّاداتها — تُغلق صراحة عند إغلاق الغرفة (لا تنتهي وحدها)
    const openStreams = new Set<{ endInput: () => void; close: () => void }>();
    const meters = new Map<string, TrackMeter>();
    // مسار قد يصلنا مرتين (حدث الاشتراك + مسح المسارات القائمة) — تفريغ واحد فقط
    const seenTracks = new Set<string>();

    // تفريغ مسار صوتي واحد: STT بثّي، والمقاطع النهائية فقط تُرفع
    const transcribeTrack = (
      track: RemoteTrack,
      participant: RemoteParticipant,
    ): void => {
      const sid = track.sid || `${participant.identity}:${track.name}`;
      if (seenTracks.has(sid)) return;
      seenTracks.add(sid);
      console.log(`[Agent] transcribing audio of ${participant.identity}`);
      const speakerName = (() => {
        try {
          const m = JSON.parse(participant.metadata || "{}");
          return m.name || participant.name || participant.identity;
        } catch {
          return participant.name || participant.identity;
        }
      })();

      const meter = new TrackMeter(STT_SAMPLE_RATE);
      meters.set(participant.identity + ":" + sid, meter);

      const run = (async () => {
        const sttImpl = new openai.STT(sttOptions);
        // بلا مستمع يتحول خطأ STT إلى استثناء غير ملتقط يسقط المهمة بصمت
        sttImpl.on("error", (ev: { error?: Error }) =>
          console.error(
            `[Agent] stt error for ${participant.identity}:`,
            ev?.error?.message ?? "unknown",
          ),
        );
        const sttStream = sttImpl.stream();
        const audio = new AudioStream(track, { sampleRate: STT_SAMPLE_RATE, numChannels: 1 });
        const clock = new SegmentClock();

        let inputEnded = false;
        const handle = {
          endInput: () => {
            if (inputEnded) return;
            inputEnded = true;
            try {
              // مع server_vad لا يُنهي endInput الجملة الجارية (لا commit) — صمت
              // أطول من سكتة VAD يجعل الخادم يختمها ويرسل نصها النهائي
              const silence = new Int16Array(STT_SAMPLE_RATE / 50);
              const frames = Math.ceil(
                (sttOptions.turnDetection.silence_duration_ms + 500) / 20,
              );
              for (let i = 0; i < frames; i++) {
                sttStream.pushFrame(new AudioFrame(silence, STT_SAMPLE_RATE, 1, silence.length));
              }
              sttStream.endInput();
            } catch {
              /* أُنهي مسبقاً */
            }
          },
          close: () => {
            try {
              sttStream.close();
            } catch {
              /* مغلق مسبقاً */
            }
          },
        };
        openStreams.add(handle);

        const feed = (async () => {
          for await (const frame of audio) {
            if (inputEnded) break;
            meter.onFrame(frame.data);
            sttStream.pushFrame(frame);
          }
          handle.endInput();
        })().catch((e) =>
          console.error(`[Agent] audio feed for ${participant.identity} failed:`, (e as Error).message),
        );

        for await (const event of sttStream) {
          switch (event.type) {
            case stt.SpeechEventType.START_OF_SPEECH:
              clock.onStartOfSpeech();
              meter.onSpeechStart();
              break;
            case stt.SpeechEventType.INTERIM_TRANSCRIPT:
              clock.onInterim();
              break;
            case stt.SpeechEventType.FINAL_TRANSCRIPT: {
              const startedSpeakingAt = clock.onFinal();
              const text = event.alternatives?.[0]?.text?.trim();
              if (text) {
                meter.onFinal();
                uploader.push({
                  speakerIdentity: participant.identity,
                  speakerName,
                  text,
                  startMs: Math.max(0, startedSpeakingAt - startedAt),
                });
              }
              break;
            }
            case stt.SpeechEventType.RECOGNITION_USAGE:
              clock.onSegmentDone();
              break;
          }
        }
        // انتهى البث (طبيعياً أو بخطأ): أوقف التغذية حتى لا تتراكم إطارات بلا مستهلك
        inputEnded = true;
        openStreams.delete(handle);
        void feed;
      })().catch((e) =>
        console.error(`[Agent] stt for ${participant.identity} failed:`, (e as Error).message),
      );
      activeStreams.add(run);
      run.finally(() => activeStreams.delete(run));
    };

    ctx.room.on(
      "trackSubscribed",
      (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === TrackKind.KIND_AUDIO) transcribeTrack(track, participant);
      },
    );

    // المسارات المشترَك بها قبل تركيب المستمع (مشاركون سبقونا للغرفة أو سباق
    // أثناء الاتصال) لا يصلها الحدث — مسح صريح يلتقطها، وseenTracks يمنع التكرار
    for (const participant of ctx.room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.kind === TrackKind.KIND_AUDIO && pub.track) {
          transcribeTrack(pub.track as RemoteTrack, participant);
        }
      }
    }

    // البقاء حتى تُغلق الغرفة (ينهي الخادم الاجتماع → تُحذف الغرفة)
    await new Promise<void>((resolve) => {
      ctx.room.on("disconnected", () => resolve());
    });

    console.log(`[Agent] room closed — flushing transcript for ${meetingId}`);
    // بث STT لا ينتهي وحده بعد توقف الصوت (ينتهي بإغلاق مقبسه): ننهي الإدخال،
    // نمهل المقاطع النهائية، ثم نغلق البثوث — وإلا علقت المهمة ولم يُرفع آخر التفريغ
    for (const s of openStreams) s.endInput();
    const settled = await settleWithin([...activeStreams], FINAL_GRACE_MS);
    if (!settled) {
      console.log(`[Agent] closing ${openStreams.size} stt stream(s) after final grace`);
      for (const s of openStreams) s.close();
      const closed = await settleWithin([...activeStreams], FORCE_CLOSE_GRACE_MS);
      if (!closed) console.error("[Agent] stt stream(s) did not end after close — continuing");
    }
    await uploader.close();

    const stats = [...meters.values()].map((m) => m.stats());
    for (const [key, m] of meters) {
      const st = m.stats();
      // المعرّف التقني فقط — لا أسماء ولا نصوص
      console.log(
        `[Agent] track ${key.split(":")[0]}: audio=${st.audioSeconds}s peak=${st.peak} ` +
          `audible=${st.audibleRatio} speech=${st.speechStarts} finals=${st.finals} → ${diagnoseTrack(st)}`,
      );
    }
    const summary = summarizeTracks(stats);
    await uploader.complete(summary);
    console.log(
      `[Agent] done — meeting ${meetingId}: ${uploader.uploaded} segments uploaded, ` +
        `${seenTracks.size} audio tracks seen, diagnosis=${summary.diagnosis}`,
    );
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);
