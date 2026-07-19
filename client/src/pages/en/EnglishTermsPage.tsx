/**
 * Terms — /en/terms
 * Layout parity with Arabic TermsPage / PrivacyPage document style.
 */
import { useEffect } from "react";
import { ArrowUpRight, Mail } from "lucide-react";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishFooter } from "@/components/en/EnglishFooter";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";

function SectionHeading({
  id,
  number,
  title,
}: {
  id: string;
  number: string;
  title: string;
}) {
  return (
    <header id={id} className="scroll-mt-28 mb-5 md:mb-6">
      <div className="border-b border-border pb-3">
        <p className="text-[11px] font-medium tabular-nums tracking-wide text-muted-foreground mb-1">
          {number}
        </p>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">{title}</h2>
      </div>
    </header>
  );
}

export default function EnglishTermsPage() {
  useEffect(() => {
    document.title = "Terms and Conditions | Sabq";
  }, []);
  useCanonical("https://sabq.org/en/terms");

  return (
    <EnglishLayout>
      <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="ltr">
        <section className="relative border-b border-border">
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.12),_transparent_55%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-10 md:pt-16 md:pb-14">
            <p className="text-sm font-bold text-primary mb-3" data-testid="en-text-terms-subtitle">
              Sabq
            </p>
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.2]"
              data-testid="en-heading-terms-title"
            >
              Terms and Conditions
            </h1>
            <p
              className="mt-4 max-w-2xl text-muted-foreground text-base md:text-lg leading-relaxed"
              data-testid="en-text-intro-content"
            >
              By using Sabq, you agree to these terms. Please read them carefully — continued use
              constitutes acceptance.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span data-testid="en-text-last-updated">
                Last updated: <b className="text-foreground font-semibold">July 2026</b>
              </span>
              <span className="hidden sm:inline text-border">|</span>
              <span>Governed by the laws of the Kingdom of Saudi Arabia</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/en/privacy">
                <Button variant="outline" size="sm" data-testid="en-button-privacy-link">
                  Privacy Policy
                </Button>
              </Link>
              <Link href="/sabq-ai">
                <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="en-button-sabq-ai-link">
                  Sabq AI
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14 flex-1">
          <article className="min-w-0 space-y-12 md:space-y-14">
            <section>
              <SectionHeading id="usage" number="01" title="Platform usage" />
              <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                <p>
                  You agree to use the platform for lawful purposes and in a manner that does not
                  infringe the rights of others or limit their use of the platform.
                </p>
                <p>
                  Content published on Sabq (text, images, videos, and similar) is the platform’s
                  intellectual property and protected by copyright law. It may not be copied or
                  republished without prior written permission — subject to the AI content-use policy
                  at{" "}
                  <Link href="/ai-policy" className="text-primary font-semibold hover:underline underline-offset-2">
                    /ai-policy
                  </Link>
                  .
                </p>
              </div>
            </section>

            <section>
              <SectionHeading id="ai-services" number="02" title="Smart content and services" />
              <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                <p>
                  Sabq uses artificial intelligence to analyze content, personalize recommendations,
                  and improve the experience — including features such as digests, personalization,
                  comment moderation, and audio, as described in our{" "}
                  <Link href="/en/privacy" className="text-primary font-semibold hover:underline underline-offset-2">
                    Privacy Policy
                  </Link>
                  .
                </p>
                <p>
                  We strive for accurate and reliable content, but we do not guarantee it is
                  completely error-free. Content does not constitute legal, medical, financial, or
                  professional advice.
                </p>
                <p>
                  Where AI contributes to producing or drafting materials, human editorial
                  responsibility applies before publication as applicable, and Sabq remains
                  responsible for what it publishes on the platform.
                </p>
              </div>
            </section>

            <section>
              <SectionHeading id="account" number="03" title="User account" />
              <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                <p>
                  Some features may require creating an account. You are responsible for keeping
                  your account credentials confidential and for all activity under your account.
                </p>
                <p>Registration information must be accurate and kept up to date.</p>
              </div>
            </section>

            <section>
              <SectionHeading id="conduct" number="04" title="User conduct and comments" />
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                When interacting with the platform (including comments and sharing), you must not
                post abusive, unlawful, or rights-infringing content. Sabq may review user-submitted
                content — including automated review — and hide, remove, or restrict accounts for
                violations.
              </p>
            </section>

            <section>
              <SectionHeading id="disclaimer" number="05" title="Disclaimer" />
              <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                <p>
                  To the extent permitted by applicable law, Sabq is not liable for direct or
                  indirect damages arising from your use of the platform or reliance on its content.
                </p>
                <p>
                  External links in our content are not under our control, and we are not
                  responsible for those sites or their policies.
                </p>
              </div>
            </section>

            <section>
              <SectionHeading id="changes" number="06" title="Changes to these terms" />
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                We may modify these terms at any time. The updated version will be posted on this
                page with a revised “Last updated” date. Continued use after changes constitutes
                acceptance of the new terms.
              </p>
            </section>

            <section>
              <SectionHeading id="law" number="07" title="Applicable law" />
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                These terms are governed by and interpreted in accordance with the laws and
                regulations of the Kingdom of Saudi Arabia.
              </p>
            </section>

            <section>
              <SectionHeading id="contact" number="08" title="Contact us" />
              <div className="rounded-2xl border border-border bg-muted/30 px-5 py-6 sm:px-7">
                <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
                  Questions about these terms:
                </p>
                <a
                  href="mailto:privacy@sabq.org"
                  className="inline-flex items-center gap-2 text-lg font-extrabold text-foreground hover:text-primary"
                  data-testid="en-link-terms-email"
                >
                  <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
                  privacy@sabq.org
                </a>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/en/contact">
                    <Button variant="default" className="gap-2" data-testid="en-button-contact-terms">
                      Contact page
                      <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </Link>
                  <Link href="/en/privacy">
                    <Button variant="outline" data-testid="en-button-privacy-footer">
                      Privacy Policy
                    </Button>
                  </Link>
                </div>
              </div>
            </section>
          </article>
        </div>

        <EnglishFooter />
      </div>
    </EnglishLayout>
  );
}
