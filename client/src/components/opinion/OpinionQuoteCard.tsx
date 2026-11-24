// بطاقة «جملة المقال»: العبارة التي اختارها الكاتب، وتحتها صورته في دائرة واسمه
// ووصفه. المشاركة صورةً: الصورة تُرسم في الخادم (PNG 1080×1080) فيأخذها الجوال
// عبر ورقة المشاركة إلى واتساب وX، وعلى الحاسوب تُنزَّل أو يُشارك النص والرابط.
import { useState } from "react";
import { Download, Share2 } from "lucide-react";
import { SiWhatsapp, SiX } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { OPINION_WRITER_CARD_SUBTITLE } from "@shared/opinionReaderExtras";
import { quoteCardAbsoluteUrl, type OpinionExtrasView } from "./opinionExtrasApi";
import { QuoteMark } from "./QuoteMark";

export function OpinionQuoteCard({
  extras,
  articleUrl,
}: {
  extras: OpinionExtrasView | null | undefined;
  articleUrl: string;
}) {
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  if (!extras?.pullQuote || !extras.quoteCardUrl) return null;
  const quote = extras.pullQuote;
  const name = extras.author?.name ?? "كاتب رأي";
  const imageUrl = quoteCardAbsoluteUrl(extras.quoteCardUrl);
  const shareText = `«${quote}»\n— ${name}`;

  const shareImage = async () => {
    setSharing(true);
    try {
      const res = await fetch(imageUrl, { credentials: "omit" });
      if (!res.ok) throw new Error("image");
      const blob = await res.blob();
      const file = new File([blob], "sabq-quote.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], text: `${shareText}\n${articleUrl}` });
      } else {
        downloadBlob(blob);
        toast({ title: "نُزّلت الصورة", description: "أرفقها في واتساب أو X" });
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        toast({ title: "تعذرت مشاركة الصورة", variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  };

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${articleUrl}`)}`;
  const x = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(articleUrl)}`;

  return (
    <figure dir="rtl" className="my-10" data-testid="opinion-quote-card">
      <div className="relative overflow-hidden rounded-[28px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] px-6 pb-6 pt-5 sm:px-10 sm:pb-8 sm:pt-7">
        <QuoteMark className="mb-3 mt-2 h-8 w-12 sm:h-10 sm:w-[60px]" />
        <blockquote className="m-0 border-0 p-0 text-[22px] font-bold leading-[1.75] text-[#1B2B3A] sm:text-[28px]">
          {quote}
        </blockquote>
        <figcaption className="mt-6 flex items-center gap-3">
          <Avatar name={name} src={extras.author?.imageUrl ?? null} />
          <div className="min-w-0">
            <p className="m-0 truncate text-[16px] font-semibold text-[#1B2B3A]">{name}</p>
            <p className="m-0 text-[12px] text-[#55667A]">{OPINION_WRITER_CARD_SUBTITLE}</p>
          </div>
          <span className="ms-auto hidden h-1.5 w-12 rounded-full bg-[#1E9BE6] sm:block" aria-hidden />
        </figcaption>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={shareImage}
          disabled={sharing}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1E9BE6] px-5 text-[14px] font-semibold text-white shadow-[0_3px_8px_rgba(30,155,230,0.3)] hover:bg-[#178BD2] disabled:opacity-70"
          data-testid="button-share-quote-image"
        >
          <Share2 className="h-4 w-4" aria-hidden /> {sharing ? "جارٍ التجهيز…" : "شارك البطاقة صورةً"}
        </button>
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="شارك العبارة في واتساب"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#EEF2F6] bg-white text-[#1FA855] hover:bg-[#F4F7FB]"
        >
          <SiWhatsapp className="h-5 w-5" aria-hidden />
        </a>
        <a
          href={x}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="شارك العبارة في X"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#EEF2F6] bg-white text-[#1B2B3A] hover:bg-[#F4F7FB]"
        >
          <SiX className="h-4 w-4" aria-hidden />
        </a>
        <a
          href={imageUrl}
          download="sabq-quote.png"
          aria-label="نزّل البطاقة صورةً"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#EEF2F6] bg-white text-[#0B6FA8] hover:bg-[#F4F7FB]"
          data-testid="link-download-quote-image"
        >
          <Download className="h-4 w-4" aria-hidden />
        </a>
      </div>
    </figure>
  );
}

function Avatar({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className="h-12 w-12 shrink-0 rounded-full border-[3px] border-white object-cover"
      />
    );
  }
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] border-white bg-[#D6ECFB] text-[18px] font-bold text-[#1E9BE6]">
      {Array.from(name.trim())[0] ?? "س"}
    </span>
  );
}

function downloadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "sabq-quote.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
