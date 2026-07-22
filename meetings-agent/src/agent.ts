// ----------------------------------------------------------------------------
// «أمين المحضر» — عامل تفريغ اجتماعات سبق
//
// خدمة مستقلة (Railway) تسجَّل لدى LiveKit Cloud باسم sabq-minutes-agent
// وتُستدعى حصراً عبر Agent Dispatch من خادم سبق عند بدء اجتماع مفعَّل
// المحضر (metadata تحمل meetingId). تشترك في مسار صوت كل متحدث على حدة
// — فهوية المتحدث معروفة من المسار بلا نماذج فصل — وتبث المقاطع النهائية
// دفعات إلى مسار الاستقبال الداخلي في خادم سبق.
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
        console.error(`[Agent] upload failed ${res.status} — requeueing ${batch.length}`);
        this.queue.unshift(...batch);
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

    // تفريغ مسار صوتي واحد: STT بثّي، والمقاطع النهائية فقط تُرفع
    const transcribeTrack = (
      track: RemoteTrack,
      participant: RemoteParticipant,
    ): void => {
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

    // البقاء حتى تُغلق الغرفة (ينهي الخادم الاجتماع → تُحذف الغرفة)
    await new Promise<void>((resolve) => {
      ctx.room.on("disconnected", () => resolve());
    });

    console.log(`[Agent] room closed — flushing transcript for ${meetingId}`);
    await Promise.allSettled([...activeStreams]);
    await uploader.close();
  },
});

cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);
