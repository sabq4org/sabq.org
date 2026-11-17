// ----------------------------------------------------------------------------
// «مُدوِّن سبق AI» — عامل تفريغ اجتماعات سبق (الهوية التقنية: sabq-minutes-agent)
//
// خدمة مستقلة (Render في الإنتاج، Railway للتجربة) تسجَّل لدى LiveKit Cloud باسم sabq-minutes-agent
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
  AudioStream,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  TrackKind,
} from "@livekit/rtc-node";
import { fileURLToPath } from "node:url";
import { SegmentClock, buildSttOptions, parseJobMetadata } from "./sttConfig.js";
import {
  MAX_STT_RESTARTS,
  SHUTDOWN_GRACE_MS,
  STT_RESTART_DELAY_MS,
  type TrackStats,
  describeEnvPresence,
  describeSttErrorEvent,
  diagnoseTrack,
  formatTrackSummary,
  newTrackStats,
  safeErrorMessage,
  settleWithin,
} from "./trackLifecycle.js";

const AGENT_NAME = "sabq-minutes-agent";
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 40;

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

  constructor(private meetingId: string) {
    this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  push(segment: Segment): void {
    this.queue.push(segment);
    if (this.queue.length >= MAX_BATCH) void this.flush();
  }

  /** إجمالي ما رُفع بنجاح — يُطبع عند الإغلاق ليجيب اللوج مباشرة: هل وصل التفريغ؟ */
  uploaded = 0;

  async flush(): Promise<void> {
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
        this.queue.unshift(...batch);
      } else {
        this.uploaded += batch.length;
        console.log(`[Agent] uploaded ${batch.length} segments (total ${this.uploaded})`);
      }
    } catch (e) {
      console.error("[Agent] upload error:", (e as Error).message);
      this.queue.unshift(...batch);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.timer);
    // محاولتان أخيرتان لتفريغ ما تبقى قبل الخروج
    await this.flush();
    if (this.queue.length) await this.flush();
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

    // وجود المتغيرات فقط (set/missing) — القيم لا تُطبع
    const env = describeEnvPresence(process.env);
    console.log(env.line);
    if (env.missing.includes("OPENAI_API_KEY")) {
      console.error("[Agent] OPENAI_API_KEY missing — transcription cannot run");
    }

    await ctx.connect();
    console.log(`[Agent] joined room ${ctx.room.name} for meeting ${meetingId}`);

    const startedAt = Date.now();
    const uploader = new TranscriptUploader(meetingId);
    const activeStreams = new Set<Promise<void>>();
    // مسار قد يصلنا مرتين (حدث الاشتراك + مسح المسارات القائمة) — تفريغ واحد فقط
    const seenTracks = new Set<string>();
    const stats = new Map<string, TrackStats>();
    // ما يُغلق قسراً عند انتهاء الغرفة (قارئ الصوت + جلسة STT) — بدونها تعلق المهمة
    const closers = new Set<() => void>();
    let roomClosed = false;

    // تفريغ مسار صوتي واحد: STT بثّي، والمقاطع النهائية فقط تُرفع
    const transcribeTrack = (
      track: RemoteTrack,
      participant: RemoteParticipant,
    ): void => {
      const sid = track.sid || `${participant.identity}:${track.name}`;
      if (seenTracks.has(sid)) return;
      seenTracks.add(sid);
      console.log(`[Agent] transcribing audio of ${participant.identity}`);
      const stat = newTrackStats(participant.identity);
      stats.set(sid, stat);
      const speakerName = (() => {
        try {
          const m = JSON.parse(participant.metadata || "{}");
          return m.name || participant.name || participant.identity;
        } catch {
          return participant.name || participant.identity;
        }
      })();

      // جلسة STT واحدة؛ تعيد true إن انتهت والغرفة ما زالت قائمة (تستحق إعادة)
      const runSession = async (): Promise<boolean> => {
        const sttImpl = new openai.STT(sttOptions);
        // بلا هذا المستمع يرمي EventEmitter الخطأ في مهمة خلفية فيضيع (debug فقط)
        sttImpl.on("error", (ev: unknown) => {
          const { message, recoverable } = describeSttErrorEvent(ev);
          stat.errors += 1;
          stat.lastError = message;
          console.error(
            `[Agent] stt error for ${participant.identity} (recoverable=${recoverable}): ${message}`,
          );
        });
        const sttStream = sttImpl.stream();
        const audio = new AudioStream(track, { sampleRate: 16000, numChannels: 1 });
        const reader = audio.getReader();
        const clock = new SegmentClock();
        const close = () => {
          reader.cancel().catch(() => {});
          try {
            sttStream.close();
          } catch {
            /* مغلق مسبقاً */
          }
        };
        closers.add(close);

        const feed = (async () => {
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (stat.frames === 0) console.log(`[Agent] audio flowing for ${participant.identity}`);
              stat.frames += 1;
              sttStream.pushFrame(value);
            }
          } catch {
            /* الجلسة أُغلقت أثناء الدفع */
          } finally {
            try {
              sttStream.endInput();
            } catch {
              /* مغلق مسبقاً */
            }
          }
        })();

        try {
          for await (const event of sttStream) {
            switch (event.type) {
              case stt.SpeechEventType.START_OF_SPEECH:
                stat.speechStarts += 1;
                clock.onStartOfSpeech();
                break;
              case stt.SpeechEventType.INTERIM_TRANSCRIPT:
                clock.onInterim();
                break;
              case stt.SpeechEventType.FINAL_TRANSCRIPT: {
                const startedSpeakingAt = clock.onFinal();
                const text = event.alternatives?.[0]?.text?.trim();
                if (text) {
                  if (stat.finals === 0) {
                    console.log(`[Agent] first transcript segment for ${participant.identity}`);
                  }
                  stat.finals += 1;
                  uploader.push({
                    speakerIdentity: participant.identity,
                    speakerName,
                    text,
                    startMs: Math.max(0, startedSpeakingAt - startedAt),
                  });
                } else {
                  stat.emptyFinals += 1;
                }
                break;
              }
              case stt.SpeechEventType.RECOGNITION_USAGE:
                clock.onSegmentDone();
                break;
            }
          }
        } finally {
          // انتهت جلسة STT (فشل أو إغلاق): أوقف قارئ الصوت حتى لا يعلق feed
          close();
          closers.delete(close);
          await feed;
        }
        if (!roomClosed) {
          console.error(
            `[Agent] stt stream for ${participant.identity} ended while room is open` +
              (stat.lastError ? ` (last error: ${stat.lastError})` : ""),
          );
        }
        // انتهاء الجلسة والغرفة قائمة = فشل صامت سابقاً → أعد المحاولة
        return !roomClosed;
      };

      const run = (async () => {
        for (let attempt = 0; ; attempt++) {
          const retry = await runSession();
          if (!retry || roomClosed || attempt >= MAX_STT_RESTARTS) break;
          stat.restarts += 1;
          console.log(`[Agent] restarting stt for ${participant.identity} (${stat.restarts}/${MAX_STT_RESTARTS})`);
          await new Promise((r) => setTimeout(r, STT_RESTART_DELAY_MS));
          if (roomClosed) break;
        }
      })().catch((e) => {
        stat.errors += 1;
        stat.lastError = safeErrorMessage(e);
        console.error(`[Agent] stt for ${participant.identity} failed:`, stat.lastError);
      });
      activeStreams.add(run);
      run.finally(() => activeStreams.delete(run));
    };

    ctx.room.on(
      "trackSubscribed",
      (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
        if (track.kind === TrackKind.KIND_AUDIO) transcribeTrack(track, participant);
      },
    );
    // تشخيص: هل نشر المشارك ميكروفوناً أصلاً؟ (مضيف بلا مسار = لا تفريغ له)
    ctx.room.on("trackPublished", (pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (pub.kind === TrackKind.KIND_AUDIO) {
        console.log(`[Agent] audio published by ${participant.identity} (muted=${Boolean(pub.muted)})`);
      }
    });
    ctx.room.on("participantConnected", (participant: RemoteParticipant) => {
      console.log(`[Agent] participant connected ${participant.identity}`);
    });

    // المسارات المشترَك بها قبل تركيب المستمع (مشاركون سبقونا للغرفة أو سباق
    // أثناء الاتصال) لا يصلها الحدث — مسح صريح يلتقطها، وseenTracks يمنع التكرار
    for (const participant of ctx.room.remoteParticipants.values()) {
      let audioPubs = 0;
      for (const pub of participant.trackPublications.values()) {
        if (pub.kind !== TrackKind.KIND_AUDIO) continue;
        audioPubs += 1;
        if (pub.track) transcribeTrack(pub.track as RemoteTrack, participant);
      }
      console.log(`[Agent] present at join: ${participant.identity} (audio publications=${audioPubs})`);
    }

    // البقاء حتى تُغلق الغرفة (ينهي الخادم الاجتماع → تُحذف الغرفة)
    await new Promise<void>((resolve) => {
      ctx.room.on("disconnected", () => resolve());
    });
    roomClosed = true;

    console.log(`[Agent] room closed — flushing transcript for ${meetingId}`);
    // AudioStream قد لا ينتهي بعد قطع الغرفة: أغلق القراءة والجلسات صراحة ثم انتظر بمهلة
    for (const close of [...closers]) close();
    const settled = await settleWithin([...activeStreams], SHUTDOWN_GRACE_MS);
    if (settled === "timeout") {
      console.error(`[Agent] ${activeStreams.size} stt stream(s) did not stop within ${SHUTDOWN_GRACE_MS}ms — continuing`);
    }
    await uploader.close();
    for (const s of stats.values()) console.log(`${formatTrackSummary(s)} diagnosis=${diagnoseTrack(s)}`);
    console.log(
      `[Agent] done — meeting ${meetingId}: ${uploader.uploaded} segments uploaded, ${seenTracks.size} audio tracks seen`,
    );
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);
