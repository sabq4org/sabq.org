import { BadgeCheck, BarChart2, Heart, MessageCircle, Play, Repeat2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * محاكاة تقريبية لشكل التغريدة على حساب سبق في X: النص، الرابط المختصر،
 * شبكة حتى 4 صور أو فيديو، أو بطاقة الرابط حين لا توجد وسائط.
 */
export function TweetPreview({
  text,
  linkUrl,
  images,
  videoUrl,
  linkCardImage,
  handle = "sabqorg",
}: {
  text: string;
  linkUrl: string | null;
  images: string[];
  videoUrl: string | null;
  linkCardImage: string | null;
  handle?: string;
}) {
  const shownLink = linkUrl ? linkUrl.replace(/^https?:\/\//, "") : null;
  const parts = text.split(/(#[\p{L}\p{N}_]+)/u);
  const count = Math.min(images.length, 4);

  return (
    <article
      className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-[15px] leading-relaxed text-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-100"
      dir="rtl"
      aria-label="معاينة التغريدة"
      data-testid="tweet-preview"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-bold text-white">
        سبق
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          <span className="font-bold">صحيفة سبق</span>
          <BadgeCheck className="h-4 w-4 text-amber-500" aria-hidden />
          <span className="text-zinc-500" dir="ltr">
            @{handle} · الآن
          </span>
        </div>
        <p className="whitespace-pre-wrap break-words">
          {parts.map((part, i) =>
            part.startsWith("#") ? (
              <span key={i} className="text-sky-500">
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
          {shownLink ? (
            <>
              {"\n"}
              <bdi dir="ltr" className="text-sky-500">
                {shownLink.length > 28 ? `${shownLink.slice(0, 26)}…` : shownLink}
              </bdi>
            </>
          ) : null}
        </p>

        {videoUrl ? (
          <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-black dark:border-zinc-800">
            <video src={videoUrl} preload="metadata" muted className="max-h-72 w-full object-contain" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-sky-500 p-3 text-white">
                <Play className="h-5 w-5" />
              </span>
            </span>
          </div>
        ) : count > 0 ? (
          <div
            className={cn(
              "grid gap-0.5 overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800",
              count === 1 ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {images.slice(0, 4).map((src, i) => (
              <img
                key={`${src}-${i}`}
                src={src}
                alt=""
                className={cn(
                  "h-full w-full object-cover",
                  count === 1 ? "aspect-video" : count === 3 && i === 0 ? "row-span-2 aspect-auto" : "aspect-square",
                )}
              />
            ))}
          </div>
        ) : linkUrl && linkCardImage ? (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="relative">
              <img src={linkCardImage} alt="" className="aspect-[1.91/1] w-full object-cover" />
              <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 text-xs text-white" dir="ltr">
                sabq.org
              </span>
            </div>
          </div>
        ) : null}

        <div className="flex max-w-sm justify-between pt-1 text-zinc-500" aria-hidden>
          <MessageCircle className="h-4 w-4" />
          <Repeat2 className="h-4 w-4" />
          <Heart className="h-4 w-4" />
          <BarChart2 className="h-4 w-4" />
        </div>
      </div>
    </article>
  );
}
