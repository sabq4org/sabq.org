/**
 * Privacy Policy — /en/privacy
 * Layout parity with Arabic PrivacyPage (single-column document + AI band).
 */
import { useEffect } from "react";
import {
  ArrowUpRight,
  Brain,
  Mail,
  Mic,
  Newspaper,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishFooter } from "@/components/en/EnglishFooter";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";

const AI_FEATURES = [
  {
    icon: Sparkles,
    title: "Recommendations & personalization",
    body: "Recommendations, the daily brief, and notification digests are computed mainly from your interaction and interest data inside Sabq. To improve article similarity, editorial article text (not your account data) may be processed via embedding services such as OpenAI.",
  },
  {
    icon: Shield,
    title: "Comment moderation",
    body: "When you post a comment, its text may be analyzed automatically for safety and quality. Comment text may be sent to contracted model providers such as OpenAI, with fallback via Anthropic or Google Gemini depending on configuration. There is no separate opt-out because this is part of community protection.",
  },
  {
    icon: Newspaper,
    title: "Smart email newsletter",
    body: "If you subscribe, we may use language models (e.g. OpenAI) to draft personalized intros or headlines from category interests and newsletter content. Delivery may sync with a contracted ESP (e.g. MailerLite). Unsubscribe anytime via the email link.",
  },
  {
    icon: Volume2,
    title: "Audio & listen features",
    body: "If you request article-summary or newsletter audio, editorial text is converted to speech via providers such as ElevenLabs and/or Google Cloud TTS and/or OpenAI as configured. Listen analytics are stored on Sabq systems and are not sent to the TTS provider as a personal profile.",
  },
  {
    icon: Mic,
    title: "In-browser voice assistant",
    body: "If you enable voice commands, speech recognition typically runs via your browser/OS. You can disable the feature and revoke microphone permission in the browser.",
  },
] as const;

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

export default function EnglishPrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | Sabq";
  }, []);
  useCanonical("https://sabq.org/en/privacy");

  return (
    <EnglishLayout>
      <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="ltr">
        <section className="relative border-b border-border">
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.12),_transparent_55%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-10 md:pt-16 md:pb-14">
            <p className="text-sm font-bold text-primary mb-3" data-testid="en-text-privacy-subtitle">
              Sabq
            </p>
            <h1
              className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.2]"
              data-testid="en-heading-privacy-title"
            >
              Privacy Policy
            </h1>
            <p
              className="mt-4 max-w-2xl text-muted-foreground text-base md:text-lg leading-relaxed"
              data-testid="en-text-intro-content"
            >
              How we collect, use, and protect your personal information — including AI features
              such as recommendations, comment moderation, audio, and newsletters.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span data-testid="en-text-last-updated">
                Last updated: <b className="text-foreground font-semibold">July 2026</b>
              </span>
              <span className="hidden sm:inline text-border">|</span>
              <span>Aligned with Saudi Arabia’s Personal Data Protection Law</span>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/settings/notifications">
                <Button variant="outline" size="sm" className="gap-2" data-testid="en-button-manage-preferences-top">
                  <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                  Manage preferences
                </Button>
              </Link>
              <Link href="/sabq-ai">
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" data-testid="en-button-sabq-ai-top">
                  <Brain className="w-4 h-4" aria-hidden="true" />
                  Sabq AI
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <div className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14 flex-1">
            <article className="min-w-0 space-y-12 md:space-y-14">
              <section>
                <SectionHeading id="collect" number="01" title="Information we collect" />
                <div className="space-y-5 text-[15px] leading-relaxed text-muted-foreground">
                  <div>
                    <h3 className="text-foreground font-bold mb-1.5">Information you provide</h3>
                    <p>
                      Such as your name and email when creating an account or subscribing to our
                      newsletter, interests you select, and comments you post.
                    </p>
                  </div>
                  <div>
                    <h3 className="text-foreground font-bold mb-1.5">Usage data</h3>
                    <ul className="space-y-3 list-none">
                      <li className="ps-3 border-s-2 border-primary/40">
                        <b className="text-foreground">Interaction data:</b> articles you read,
                        topics you prefer, likes and saves, and time on the platform — to power
                        recommendations and digests.
                      </li>
                      <li className="ps-3 border-s-2 border-border">
                        <b className="text-foreground">Technical data:</b> device type, OS, IP
                        address, and browser — for performance and security; may be logged with some
                        audio-newsletter listen events.
                      </li>
                    </ul>
                  </div>
                </div>
              </section>

              <section>
                <SectionHeading id="use" number="02" title="How we use your information" />
                <ul className="grid sm:grid-cols-2 gap-3">
                  {[
                    {
                      t: "Personalize your experience",
                      d: "News recommendations, a daily brief, and personalized digests/notifications when enabled.",
                    },
                    {
                      t: "Protect the community",
                      d: "Automated comment review to help detect abusive or policy-violating content.",
                    },
                    {
                      t: "Improve our services",
                      d: "Understand how readers interact with the platform and develop new features.",
                    },
                    {
                      t: "Communicate with you",
                      d: "Account notices, platform updates, and newsletters with your consent or subscription.",
                    },
                  ].map((item) => (
                    <li
                      key={item.t}
                      className="rounded-xl border border-border bg-card/40 px-4 py-3.5"
                    >
                      <h3 className="text-sm font-extrabold text-foreground mb-1">{item.t}</h3>
                      <p className="text-[13.5px] text-muted-foreground leading-relaxed">{item.d}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section id="ai" className="scroll-mt-28">
                <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] px-4 py-6 sm:px-6 sm:py-8 md:px-8">
                  <div className="flex items-start gap-3 mb-5">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Brain className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-[11px] font-medium tabular-nums tracking-wide text-muted-foreground mb-1">
                        03
                      </p>
                      <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
                        Artificial intelligence and your data
                      </h2>
                    </div>
                  </div>

                  <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground mb-7">
                    <p>
                      We use AI to improve your experience and protect the platform — not to
                      commercially exploit your data. Reader data is used to serve readers on Sabq;
                      we do not sell your personal information.{" "}
                      <Link
                        href="/sabq-ai"
                        className="text-primary font-semibold underline-offset-2 hover:underline"
                      >
                        Learn about Sabq AI
                      </Link>
                      .
                    </p>
                    <p>
                      Some AI features run on Sabq systems; others use contracted providers for the
                      limited purposes below. We do not send your full personal profile to AI models
                      except as needed for a service you requested or for platform safety.
                    </p>
                  </div>

                  <h3 className="text-sm font-extrabold text-foreground mb-3">Where AI is used</h3>
                  <div className="space-y-3 mb-7">
                    {AI_FEATURES.map((f) => (
                      <div
                        key={f.title}
                        className="flex gap-3 rounded-xl bg-background/80 border border-border/80 px-3.5 py-3.5"
                      >
                        <f.icon className="w-5 h-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                        <div className="min-w-0">
                          <h4 className="text-sm font-extrabold text-foreground mb-1">{f.title}</h4>
                          <p className="text-[13.5px] text-muted-foreground leading-relaxed">{f.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mb-2">
                    <div className="rounded-xl border border-border bg-background/70 px-4 py-4">
                      <h3 className="text-sm font-extrabold text-foreground mb-2">Providers</h3>
                      <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                        We use service providers as contracted processors. We do not sell your data,
                        and we do not use your personal data to train public AI models that we own
                        and release. Where contractually available, we prefer settings that disallow
                        use of customer content to train public models.
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/70 px-4 py-4">
                      <h3 className="text-sm font-extrabold text-foreground mb-2">Your controls</h3>
                      <ul className="space-y-2.5 text-[13.5px] text-muted-foreground leading-relaxed">
                        <li>
                          <Link
                            href="/settings/notifications"
                            className="text-primary font-semibold hover:underline underline-offset-2"
                          >
                            Notification settings
                          </Link>
                          {" — "}personalization, recommendations, and daily digest.
                        </li>
                        <li>Newsletter: unsubscribe via the email link.</li>
                        <li>Audio: simply don’t use listen features if you prefer not to.</li>
                        <li>Data rights requests: via the contacts below under applicable law.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </section>

              <section>
                <SectionHeading id="protect" number="04" title="How we protect your information" />
                <ul className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                  <li className="ps-3 border-s-2 border-border">
                    Appropriate technical and organizational measures (encryption, secure transport,
                    access controls).
                  </li>
                  <li className="ps-3 border-s-2 border-border">
                    We do not sell or rent your personal information for marketing without your
                    explicit consent.
                  </li>
                  <li className="ps-3 border-s-2 border-border">
                    Staff and contractor access is limited to what is needed; providers are reviewed
                    when contracting.
                  </li>
                </ul>
              </section>

              <section>
                <SectionHeading id="cookies" number="05" title="Cookies" />
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  We use cookies and similar technologies for preferences, sessions, browsing
                  improvements, and performance. You can control many of them in your browser;
                  disabling some may affect how the platform works.
                </p>
              </section>

              <section>
                <SectionHeading id="rights" number="06" title="Your rights" />
                <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                  <p>
                    Under applicable law in the Kingdom of Saudi Arabia (including the Personal Data
                    Protection Law) and our practices, your rights may include access, correction,
                    deletion where legally applicable, and objection to certain processing or
                    withdrawal of consent when consent is the basis.
                  </p>
                  <p>
                    You may unsubscribe from marketing emails anytime and manage personalization
                    preferences in your account. To exercise your rights, contact us below or via
                    our Contact page.
                  </p>
                </div>
              </section>

              <section>
                <SectionHeading id="changes" number="07" title="Changes to this policy" />
                <p className="text-[15px] text-muted-foreground leading-relaxed">
                  We may update this policy as our services evolve — including AI features. Material
                  changes will be posted here with an updated “Last updated” date, and we may notify
                  you via the platform or email when appropriate.
                </p>
              </section>

              <section>
                <SectionHeading id="contact" number="08" title="Contact us" />
                <div className="rounded-2xl border border-border bg-muted/30 px-5 py-6 sm:px-7">
                  <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
                    For privacy questions or personal-data requests:
                  </p>
                  <a
                    href="mailto:privacy@sabq.org"
                    className="inline-flex items-center gap-2 text-lg font-extrabold text-foreground hover:text-primary"
                    data-testid="en-link-privacy-email"
                  >
                    <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
                    privacy@sabq.org
                  </a>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link href="/en/contact">
                      <Button variant="default" className="gap-2" data-testid="en-button-contact-privacy">
                        Contact page
                        <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                      </Button>
                    </Link>
                    <Link href="/settings/notifications">
                      <Button variant="outline" className="gap-2" data-testid="en-button-manage-preferences">
                        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                        Manage preferences
                      </Button>
                    </Link>
                    <Link href="/ai-policy">
                      <Button variant="ghost" className="gap-2 text-muted-foreground" data-testid="en-button-ai-policy">
                        AI content use policy
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
