import { useQuery } from "@tanstack/react-query";
import sahraaLogo from "@assets/al-sahraa-channel-logo.png";

export type SahraaTvBlockResponse =
  | { isVisible: false }
  | {
      isVisible: true;
      title: string;
      description: string;
      videoUrl: string;
      posterUrl?: string;
      updatedAt?: string | null;
    };

/**
 * بلوك قناة الصحراء — أسفل الهيرو.
 * يعرض الفيديو فقط + الوصف التحريري (بدون واجهة تغريدة إكس).
 */
export function SahraaTvBlock() {
  const { data } = useQuery<SahraaTvBlockResponse>({
    queryKey: ["/api/sahraa-tv-block"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (!data?.isVisible || !data.videoUrl) return null;

  return (
    <section
      dir="rtl"
      className="relative my-4 overflow-hidden border-y border-[#B01E23]/25"
      style={{
        background:
          "linear-gradient(120deg, #6E1014 0%, #B01E23 42%, #8B1519 72%, #4A0C0F 100%)",
      }}
      data-testid="block-sahraa-tv"
      aria-label="قناة الصحراء"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.35) 0 1px, transparent 1.5px), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.2) 0 1px, transparent 1.5px)",
          backgroundSize: "28px 28px, 40px 40px",
        }}
      />
      <div
        className="pointer-events-none absolute -left-16 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-white/5 blur-2xl motion-safe:animate-pulse"
        aria-hidden
      />

      <div className="relative container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-stretch">
          <header className="lg:w-[36%] flex flex-col justify-center gap-4">
            <div className="flex items-center gap-3">
              <img
                src={sahraaLogo}
                alt="شعار قناة الصحراء"
                width={64}
                height={64}
                className="h-14 w-14 md:h-16 md:w-16 rounded-full object-cover ring-2 ring-white/90 shadow-md motion-safe:animate-[sahraa-glow_3.5s_ease-in-out_infinite]"
                data-testid="sahraa-logo"
              />
              <div>
                <p className="text-[11px] md:text-xs tracking-wide text-white/70">
                  بالشراكة مع
                </p>
                <h2
                  className="text-xl md:text-2xl font-bold text-white leading-tight"
                  data-testid="sahraa-title"
                >
                  {data.title}
                </h2>
              </div>
            </div>

            {data.description ? (
              <p
                className="text-sm md:text-base text-white/90 leading-relaxed max-w-md"
                data-testid="sahraa-description"
              >
                {data.description}
              </p>
            ) : null}
          </header>

          <div className="lg:flex-1 min-w-0 flex items-center">
            <div
              className="w-full overflow-hidden rounded-xl bg-black/40 shadow-lg ring-1 ring-white/20"
              data-testid="sahraa-video-wrap"
            >
              <video
                key={data.videoUrl}
                className="w-full aspect-video max-h-[min(70vh,520px)] bg-black object-contain"
                controls
                playsInline
                preload="metadata"
                poster={data.posterUrl || undefined}
                data-testid="sahraa-video"
              >
                <source src={data.videoUrl} type="video/mp4" />
                متصفحك لا يدعم تشغيل الفيديو.
              </video>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sahraa-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.15); }
          50% { box-shadow: 0 0 0 6px rgba(255,255,255,0.08); }
        }
      `}</style>
    </section>
  );
}

export default SahraaTvBlock;
