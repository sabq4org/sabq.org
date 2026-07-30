import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import sahraaLogo from "@assets/al-sahraa-channel-logo.png";

type TwttrWidgets = { widgets?: { load: (el?: HTMLElement) => void } };

function getTwttr(): TwttrWidgets | undefined {
  return (window as Window & { twttr?: TwttrWidgets }).twttr;
}

export type SahraaTvBlockResponse =
  | { isVisible: false }
  | {
      isVisible: true;
      title: string;
      description: string;
      xPostUrl: string;
      updatedAt?: string | null;
    };

/**
 * بلوك قناة الصحراء — أسفل الهيرو.
 * يظهر فقط عندما يعيد الـ API isVisible=true (مفعّل + رابط إكس صالح).
 */
export function SahraaTvBlock() {
  const { data } = useQuery<SahraaTvBlockResponse>({
    queryKey: ["/api/sahraa-tv-block"],
    queryFn: async () => {
      const res = await fetch("/api/sahraa-tv-block");
      if (!res.ok) return { isVisible: false };
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  if (!data?.isVisible) return null;

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
      {/* نسيج رملي خفيف */}
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
          <header className="lg:w-[38%] flex flex-col justify-center gap-4">
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

            <a
              href={data.xPostUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-white/75 hover:text-white transition-colors w-fit"
              data-testid="sahraa-x-link"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              مشاهدة المنشور على إكس
            </a>
          </header>

          <div className="lg:flex-1 min-w-0">
            <XPostEmbed url={data.xPostUrl} />
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

function XPostEmbed({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const loadWidgets = () => {
      getTwttr()?.widgets?.load(el);
    };

    const existing = document.querySelector(
      'script[src="https://platform.twitter.com/widgets.js"]',
    ) as HTMLScriptElement | null;

    if (existing && getTwttr()?.widgets) {
      loadWidgets();
      return;
    }

    if (existing) {
      existing.addEventListener("load", loadWidgets);
      return () => existing.removeEventListener("load", loadWidgets);
    }

    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.charset = "utf-8";
    script.onload = loadWidgets;
    document.body.appendChild(script);
  }, [url]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl bg-white/95 dark:bg-zinc-950/90 p-2 md:p-3 shadow-lg ring-1 ring-white/20 [&_.twitter-tweet]:mx-auto!"
      data-testid="sahraa-x-embed"
    >
      <blockquote className="twitter-tweet" data-lang="ar" data-dnt="true" data-theme="light">
        <a href={url}>عرض المنشور على إكس</a>
      </blockquote>
    </div>
  );
}

export default SahraaTvBlock;
