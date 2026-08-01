// ----------------------------------------------------------------------------
// «أمين المحضر» — عامل تفريغ اجتماعات سبق
//
// خدمة مستقلة (Railway) تسجَّل لدى LiveKit Cloud بالاسم المحدد في
// LIVEKIT_AGENT_NAME (والافتراضي للإنتاج sabq-minutes-agent)
// وتُستدعى حصراً عبر Agent Dispatch من خادم سبق عند بدء اجتماع مفعَّل
// المحضر (metadata تحمل meetingId). تشترك في مسار صوت كل متحدث على حدة
// — فهوية المتحدث معروفة من المسار بلا نماذج فصل — وتبث المقاطع النهائية
// دفعات إلى مسار الاستقبال الداخلي في خادم سبق.
//
// المتغيرات المطلوبة:
//   LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
//   LIVEKIT_AGENT_NAME        — اسم مستقل لكل بيئة
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

const DEFAULT_AGENT_NAME = "sabq-minutes-agent";
const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME?.trim() || DEFAULT_AGENT_NAME;

if (
  process.env.RAILWAY_ENVIRONMENT_NAME === "staging" &&
  AGENT_NAME === DEFAULT_AGENT_NAME
) {
  throw new Error(
    "LIVEKIT_AGENT_NAME must use a non-production name in the Railway staging environment",
  );
}
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
    const meta = (() => {
      try {
        return JSON.parse(ctx.job.metadata || "{}") as { meetingId?: string };
      } catch {
        return {};
      }
    })();
    const meetingId = meta.meetingId;
    if (!meetingId) {
      console.error("[Agent] job without meetingId metadata — aborting");
      return;
    }

    await ctx.connect();
    console.log(`[Agent] joined room ${ctx.room.name} for meeting ${meetingId}`);

    const startedAt = Date.now();
    const uploader = new TranscriptUploader(meetingId);
    const activeStreams = new Set<Promise<void>>();
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

      const run = (async () => {
        const sttImpl = new openai.STT({ model: "gpt-4o-transcribe", language: "ar" });
        const sttStream = sttImpl.stream();
        const audio = new AudioStream(track, { sampleRate: 16000, numChannels: 1 });

        const feed = (async () => {
          for await (const frame of audio) sttStream.pushFrame(frame);
          sttStream.endInput();
        })();

        for await (const event of sttStream) {
          if (event.type === stt.SpeechEventType.FINAL_TRANSCRIPT) {
            const text = event.alternatives?.[0]?.text?.trim();
            if (text) {
              uploader.push({
                speakerIdentity: participant.identity,
                speakerName,
                text,
                startMs: Date.now() - startedAt,
              });
            }
          }
        }
        await feed;
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
    await Promise.allSettled([...activeStreams]);
    await uploader.close();
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
