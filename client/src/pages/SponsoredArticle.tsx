import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import DOMPurify from "isomorphic-dompurify";
import {
  DmsLeaderboardAd,
  DmsMpuAd,
  resetAdsTriggerFlag,
  updateSignalDataLayer,
  triggerAdsWhenReady,
} from "@/components/DmsAdSlot";
import { SocialShareBar } from "@/components/SocialShareBar";

interface SponsoredData {
  experience: {
    unique_hash?: string;
    title: string;
    pubDate: string;
    article: {
      content: Array<{ data: string; type?: string; embed?: Record<string, any> }>;
    };
  };
  sponsor: {
    logo: { href: string } | null;
  };
  custom_fields: {
    presponsor: string;
  };
  primaryMedia: {
    content: { href: string };
  } | null;
  cta: Array<{
    id: string;
    type: string;
    destUrl: string;
    text?: string;
    image?: { href: string };
  }>;
}

const POLAR_CDN_BASE = "https://polarcdn-terrax.com";

function formatArabicDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ar-SA-u-ca-gregory", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function SponsoredArticle() {
  const [data, setData] = useState<SponsoredData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const mvi = searchParams.get("mvi");

  const { data: user } = useQuery<{ id: string; name?: string; email?: string; role?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    const previousDir = document.documentElement.dir;
    const previousLang = document.documentElement.lang;
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    return () => {
      document.documentElement.dir = previousDir || "ltr";
      document.documentElement.lang = previousLang || "en";
    };
  }, []);

  useEffect(() => {
    document.title = "محتوى مُموّل — سبق";
    return () => {
      document.title = "سبق - صحيفة إلكترونية سعودية";
    };
  }, []);

  useEffect(() => {
    if (!mvi) return;
    const canonicalHref = `https://sabq.org/sponsored?mvi=${mvi}`;
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (link) {
      link.href = canonicalHref;
    } else {
      link = document.createElement("link");
      link.rel = "canonical";
      link.href = canonicalHref;
      document.head.appendChild(link);
    }
    return () => {
      const existing = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (existing && existing.href === canonicalHref) {
        existing.remove();
      }
    };
  }, [mvi]);

  useEffect(() => {
    resetAdsTriggerFlag();
    updateSignalDataLayer({
      channelLevel1: "Sponsored_Page",
      articleId: mvi || "",
    });
    triggerAdsWhenReady();
  }, [mvi]);

  useEffect(() => {
    if (!mvi) {
      setError("لا يوجد محتوى مُموّل للعرض");
      setLoading(false);
      return;
    }

    const fetchSponsored = async () => {
      try {
        const response = await fetch(
          `${POLAR_CDN_BASE}/nativeads/v1.4.0/json/creative/${mvi}`
        );
        if (!response.ok) {
          throw new Error("فشل في تحميل المحتوى المُموّل");
        }
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        setError(err.message || "حدث خطأ أثناء تحميل المحتوى");
      } finally {
        setLoading(false);
      }
    };

    fetchSponsored();
  }, [mvi]);

  useEffect(() => {
    if (!data || !contentRef.current) return;

    const container = contentRef.current;

    const phoenixImages = container.querySelectorAll(".phoenix-inline-image");
    phoenixImages.forEach((el) => {
      const dataSrc = el.getAttribute("data-src");
      if (dataSrc) {
        const wrapper = document.createElement("div");
        wrapper.style.textAlign = "center";

        const img = document.createElement("img");
        img.src = dataSrc.startsWith("http")
          ? dataSrc
          : `${POLAR_CDN_BASE}${dataSrc}`;
        img.style.width = "500px";
        img.style.maxWidth = "100%";
        img.style.margin = "0 auto";
        img.style.height = "auto";
        img.style.borderRadius = "0.5rem";
        img.alt = "";

        wrapper.appendChild(img);
        el.innerHTML = "";
        el.appendChild(wrapper);
      }
    });

    const iframes = container.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
      iframe.style.width = "100%";
      iframe.style.height = "315px";
    });

    const allLinks = container.querySelectorAll("a");
    allLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
        link.target = "_blank";
        link.rel = "noopener noreferrer sponsored";
      }
    });

    if (data.cta && data.cta.length > 0) {
      const ctaSpans = container.querySelectorAll("span[data-cta]");
      ctaSpans.forEach((span) => {
        const ctaId = span.getAttribute("data-cta");
        if (!ctaId) return;

        const ctaItem = data.cta.find((c) => c.id === ctaId);
        if (!ctaItem) return;

        if (ctaItem.type === "textlink" && ctaItem.text && ctaItem.destUrl) {
          const parentEl = span.parentElement;
          if (parentEl && parentEl.tagName === "A") {
            (parentEl as HTMLAnchorElement).href = ctaItem.destUrl;
            (parentEl as HTMLAnchorElement).target = "_blank";
            (parentEl as HTMLAnchorElement).rel = "noopener noreferrer sponsored";
            span.textContent = ctaItem.text;
          } else {
            span.innerHTML = `<a href="${ctaItem.destUrl}" target="_blank" rel="noopener noreferrer sponsored">${ctaItem.text}</a>`;
          }
        } else if (ctaItem.type === "imagelink" && ctaItem.destUrl) {
          const parentEl = span.parentElement;
          if (ctaItem.image?.href) {
            const imgSrc = ctaItem.image.href.startsWith("http")
              ? ctaItem.image.href
              : `${POLAR_CDN_BASE}${ctaItem.image.href}`;
            if (parentEl && parentEl.tagName === "A") {
              (parentEl as HTMLAnchorElement).href = ctaItem.destUrl;
              (parentEl as HTMLAnchorElement).target = "_blank";
              (parentEl as HTMLAnchorElement).rel = "noopener noreferrer sponsored";
              span.innerHTML = `<img src="${imgSrc}" style="max-width:100%;width:500px;height:auto;border-radius:0.5rem;margin:0 auto" />`;
              parentEl.setAttribute("style", "display:block;text-align:center");
            } else {
              span.innerHTML = `<a href="${ctaItem.destUrl}" target="_blank" rel="noopener noreferrer sponsored" style="display:block;text-align:center"><img src="${imgSrc}" style="max-width:100%;width:500px;height:auto;border-radius:0.5rem;margin:0 auto" /></a>`;
            }
          } else {
            if (parentEl && parentEl.tagName === "A") {
              (parentEl as HTMLAnchorElement).href = ctaItem.destUrl;
              (parentEl as HTMLAnchorElement).target = "_blank";
              (parentEl as HTMLAnchorElement).rel = "noopener noreferrer sponsored";
              span.textContent = ctaItem.text || ctaItem.destUrl;
            } else {
              span.innerHTML = `<a href="${ctaItem.destUrl}" target="_blank" rel="noopener noreferrer sponsored">${ctaItem.text || ctaItem.destUrl}</a>`;
            }
          }
        }
      });
    }
  }, [data]);

  const sponsorLogoLink = data?.cta?.find(
    (c) => c.type === "sponsorlogolink"
  );
  const sponsorLogoUrl = data?.sponsor?.logo?.href
    ? `${POLAR_CDN_BASE}${data.sponsor.logo.href}`
    : null;
  const primaryImageUrl = data?.primaryMedia?.content?.href
    ? `${POLAR_CDN_BASE}${data.primaryMedia.content.href}`
    : null;

  const hasSponsorLogo = data?.sponsor?.logo !== null && data?.sponsor?.logo !== undefined;

  const articleHtml = data?.experience?.article?.content
    ?.map((c) => c.data)
    .join("") || "";
  const sanitizedHtml = DOMPurify.sanitize(articleHtml, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "scrolling",
      "data-src",
      "data-cta",
      "target",
      "rel",
      "class",
      "id",
    ],
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background/95 relative z-10" dir="rtl">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card border rounded-lg p-6 space-y-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-[400px] w-full rounded-lg" />
              </div>
              <div className="bg-card border rounded-lg p-6">
                <Skeleton className="h-4 w-full mb-3" />
                <Skeleton className="h-4 w-full mb-3" />
                <Skeleton className="h-4 w-3/4 mb-3" />
                <Skeleton className="h-4 w-full mb-3" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            </div>
            <div className="space-y-6">
              <Skeleton className="h-[250px] w-full" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background/95 relative z-10" dir="rtl">
        <Header user={user} />
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
          <div className="flex items-center justify-center min-h-[50vh]">
            <div className="text-center space-y-4">
              <p className="text-lg text-muted-foreground">
                {error || "لا يوجد محتوى مُموّل للعرض"}
              </p>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background/95 relative z-10" dir="rtl">
      <Header user={user} />

      <DmsLeaderboardAd />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border rounded-lg p-6 space-y-4">
              <Badge
                data-testid="badge-sponsored"
                className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate"
              >
                محتوى مُموّل
              </Badge>

              <h1
                data-testid="text-sponsored-title"
                className="text-2xl sm:text-3xl font-bold leading-tight"
              >
                {data.experience.title}
              </h1>

              {hasSponsorLogo && (
                <div className="flex items-center gap-4 flex-wrap">
                  {data.custom_fields?.presponsor && (
                    <span className="text-sm font-medium text-muted-foreground">
                      {data.custom_fields.presponsor}
                    </span>
                  )}

                  {sponsorLogoUrl && (
                    <div className="flex items-center gap-3">
                      {sponsorLogoLink ? (
                        <a
                          href={sponsorLogoLink.destUrl}
                          target="_blank"
                          rel="noopener noreferrer sponsored"
                          data-testid="link-sponsor-logo"
                        >
                          <img
                            data-testid="img-sponsor-logo"
                            src={sponsorLogoUrl}
                            alt={data.custom_fields?.presponsor || ""}
                            className="h-10 w-10 rounded-full object-contain bg-white border"
                          />
                        </a>
                      ) : (
                        <img
                          data-testid="img-sponsor-logo"
                          src={sponsorLogoUrl}
                          alt={data.custom_fields?.presponsor || ""}
                          className="h-10 w-10 rounded-full object-contain bg-white border"
                        />
                      )}
                    </div>
                  )}

                  {data.experience.pubDate && (
                    <span
                      data-testid="text-sponsored-date"
                      className="text-sm text-muted-foreground"
                    >
                      {formatArabicDate(data.experience.pubDate)}
                    </span>
                  )}
                </div>
              )}

              {primaryImageUrl && (
                <img
                  data-testid="img-sponsored-primary"
                  src={primaryImageUrl}
                  alt={data.experience.title}
                  className="w-full rounded-lg object-cover max-h-[500px]"
                />
              )}
            </div>

            <div className="bg-card border rounded-lg p-6">
              <div
                ref={contentRef}
                data-testid="content-sponsored-body"
                className="prose prose-lg dark:prose-invert max-w-none leading-loose text-justify"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />

              <div className="mt-8 pt-6 border-t">
                <SocialShareBar
                  title={data.experience.title}
                  url={"https://sabq.org/sponsored?mvi=" + mvi}
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <DmsMpuAd className="!block md:!block" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
