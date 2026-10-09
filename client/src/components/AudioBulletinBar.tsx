import { useCallback, type KeyboardEvent, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Pause, Play } from "lucide-react";
import {
  audioBulletinPlayer,
  chapterAt,
  formatClock,
  useAudioBulletinPlayer,
  type AudioBulletin,
} from "@/lib/audioBulletinPlayer";

function minutesLabel(n: number): string {
  if (n === 1) return "دقيقة";
  if (n === 2) return "دقيقتان";
  return n <= 10 ? `${n} دقائق` : `${n} دقيقة`;
}

const timeFormat = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh" });

/**
 * شريط «نشرة سَبْق» تحت الهيدر: يظهر في الرئيسية عند وجود نشرة حديثة، ويبقى في
 * بقية الصفحات ما دام القارئ يستمع. لا يظهر شيء إن لم تُعتمد نشرة خلال 6 ساعات.
 */
export function AudioBulletinBar() {
  const [location] = useLocation();
  const { data } = useQuery<{ bulletin: AudioBulletin | null } | null>({
    queryKey: ["/api/audio-bulletin/current"],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const bulletin = data?.bulletin ?? null;
  const player = useAudioBulletinPlayer();
  const isThis = Boolean(bulletin && player.bulletinId === bulletin.id);
  const playing = isThis && player.playing;
  const time = isThis ? player.currentTime : 0;
  const duration = (isThis && player.duration) || bulletin?.durationSec || 0;

  const seekBy = useCallback((target: number) => { if (bulletin) audioBulletinPlayer.seek(bulletin, target); }, [bulletin]);

  if (!bulletin || bulletin.chapters.length === 0) return null;
  if (location !== "/" && !(isThis && player.started)) return null;

  const index = chapterAt(bulletin.chapters, time);
  const chapter = bulletin.chapters[index];
  const storyCount = bulletin.chapters.length - 2;
  const position = index > 0 && index <= storyCount ? `${index} من ${storyCount}` : null;
  const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
  const minutes = Math.max(1, Math.round(bulletin.durationSec / 60));
  const published = timeFormat.format(new Date(bulletin.publishedAt));

  const onTrackClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    // RTL: the bulletin starts at the right edge.
    seekBy(((rect.right - event.clientX) / rect.width) * duration);
  };
  const onTrackKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); seekBy(time + 5); }
    if (event.key === "ArrowRight") { event.preventDefault(); seekBy(time - 5); }
  };
  const label = chapter.href
    ? <Link href={chapter.href} className="hover:text-primary hover:underline underline-offset-4">{chapter.label}</Link>
    : <span>{chapter.label}</span>;

  return (
    <div className="border-t border-border/60 bg-primary/10" data-testid="audio-bulletin-bar">
      <div className="container mx-auto flex items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => audioBulletinPlayer.toggle(bulletin)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          aria-label={playing ? "إيقاف نشرة سبق" : "استمع إلى نشرة سبق"}
          data-testid="button-audio-bulletin"
        >
          {playing ? <Pause className="h-4 w-4 fill-current" aria-hidden="true" /> : <Play className="h-4 w-4 fill-current ms-0.5" aria-hidden="true" />}
        </button>

        <div className="hidden shrink-0 flex-col leading-tight sm:flex">
          <span className="text-sm font-semibold">نشرة سبق</span>
          <span className="text-xs text-muted-foreground">{bulletin.title} · {published}</span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="shrink-0 font-semibold sm:hidden">نشرة سبق</span>
            {position && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{position}</span>}
            {player.error && isThis
              ? <span className="truncate text-xs text-destructive">تعذّر تشغيل النشرة. حاول مرة أخرى.</span>
              : <span className="truncate text-xs sm:text-sm">{time > 0 || playing ? label : <span className="text-muted-foreground">{minutesLabel(minutes)} لأهم الأخبار</span>}</span>}
          </div>
          <div
            role="slider"
            tabIndex={0}
            aria-label="موضع الاستماع في النشرة"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            aria-valuetext={`${formatClock(time)} من ${formatClock(duration)}`}
            onClick={onTrackClick}
            onKeyDown={onTrackKey}
            className="relative h-1.5 cursor-pointer rounded-full bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <div className="absolute inset-y-0 right-0 rounded-full bg-primary" style={{ width: `${progress}%` }} />
            {bulletin.chapters.slice(1, -1).map((c) => (
              <span
                key={c.start}
                aria-hidden="true"
                className="absolute -top-0.5 h-2.5 w-0.5 bg-background"
                style={{ right: `${duration > 0 ? (c.start / duration) * 100 : 0}%` }}
              />
            ))}
          </div>
        </div>

        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground md:inline" dir="ltr">
          {formatClock(time)} / {formatClock(duration)}
        </span>
      </div>
    </div>
  );
}
