import { SiWhatsapp } from "react-icons/si";
import type { WhatsAppCta } from "@shared/whatsappCta";
import {
  buildWhatsAppUrl,
  formatWhatsAppPhoneDisplay,
  normalizeWhatsAppPhone,
} from "@shared/whatsappCta";

interface ArticleWhatsAppCtaProps {
  cta: WhatsAppCta | null | undefined;
  /** إن وُجدت كتل مضمّنة في النص لا نكرّر البطاقة في النهاية */
  skipIfInlineInContent?: boolean;
  contentHtml?: string;
}

export function ArticleWhatsAppCta({
  cta,
  skipIfInlineInContent = true,
  contentHtml,
}: ArticleWhatsAppCtaProps) {
  if (!cta?.enabled) return null;
  if (cta.placement === "inline") return null;
  if (
    skipIfInlineInContent &&
    contentHtml &&
    contentHtml.includes("data-whatsapp-cta")
  ) {
    return null;
  }

  const digits = normalizeWhatsAppPhone(cta.phone);
  const href = digits ? buildWhatsAppUrl(digits, cta.message) : null;
  if (!digits || !href) return null;

  const phrase = (cta.phrase || "تواصل عبر واتساب").trim();

  return (
    <div className="my-8" data-testid="block-article-whatsapp-cta">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="whatsapp-cta-card group block no-underline"
        aria-label={phrase}
      >
        <span className="whatsapp-cta-link">
          <span className="whatsapp-cta-icon-wrap">
            <SiWhatsapp className="whatsapp-cta-icon" aria-hidden="true" />
          </span>
          <span className="whatsapp-cta-copy">
            <span className="whatsapp-cta-text">{phrase}</span>
            <span className="whatsapp-cta-phone dir-ltr">
              {formatWhatsAppPhoneDisplay(digits)}
            </span>
          </span>
          <span className="whatsapp-cta-chevron" aria-hidden="true">
            ‹
          </span>
        </span>
      </a>
    </div>
  );
}
