import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, ChevronRight, Share2, Calendar, Home, Circle } from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { angleTheme, withAlpha } from "@/lib/angleTheme";
import type { Topic, Angle } from "@shared/schema";

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function renderContentBlock(block: {
  type: "text" | "image" | "video" | "link" | "embed" | "quote" | "heading";
  content?: string;
  url?: string;
  alt?: string;
  caption?: string;
  level?: number;
  metadata?: Record<string, any>;
}, index: number) {
  switch (block.type) {
    case "heading":
      const HeadingTag = `h${block.level || 2}` as keyof JSX.IntrinsicElements;
      const headingClasses = {
        1: "text-3xl font-bold mb-4",
        2: "text-2xl font-bold mb-3",
        3: "text-xl font-semibold mb-2",
        4: "text-lg font-semibold mb-2",
        5: "text-base font-semibold mb-2",
        6: "text-sm font-semibold mb-2",
      };
      return (
        <HeadingTag 
          key={index} 
          className={headingClasses[block.level as keyof typeof headingClasses || 2]}
          data-testid={`content-heading-${index}`}
        >
          {block.content}
        </HeadingTag>
      );
    
    case "text":
      return (
        <p 
          key={index} 
          className="text-foreground leading-relaxed mb-4"
          data-testid={`content-text-${index}`}
        >
          {block.content}
        </p>
      );
    
    case "image":
      return (
        <figure key={index} className="my-6" data-testid={`content-image-${index}`}>
          <img 
            src={block.url} 
            alt={block.alt || ""} 
            className="w-full rounded-lg"
          />
          {block.caption && (
            <figcaption className="text-sm text-muted-foreground mt-2 text-center">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    
    case "quote":
      return (
        <blockquote 
          key={index} 
          className="border-r-4 border-[color:var(--angle,#6366f1)] pr-4 my-6 italic text-muted-foreground"
          data-testid={`content-quote-${index}`}
        >
          {block.content}
        </blockquote>
      );
    
    case "video":
      return (
        <div key={index} className="my-6" data-testid={`content-video-${index}`}>
          <video 
            src={block.url} 
            controls 
            className="w-full rounded-lg"
          >
            Your browser does not support the video tag.
          </video>
          {block.caption && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              {block.caption}
            </p>
          )}
        </div>
      );
    
    case "link":
      return (
        <a 
          key={index}
          href={block.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[color:var(--angle,#6366f1)] hover:underline inline-block my-2"
          data-testid={`content-link-${index}`}
        >
          {block.content || block.url}
        </a>
      );
    
    case "embed":
      return (
        <div 
          key={index}
          className="my-6"
          data-testid={`content-embed-${index}`}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.content || "") }}
        />
      );
    
    default:
      return (
        <p key={index} className="mb-4" data-testid={`content-default-${index}`}>
          {block.content}
        </p>
      );
  }
}

export default function TopicDetail() {
  const { angleSlug, topicSlug } = useParams<{ angleSlug: string; topicSlug: string }>();

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { 
    data: topicData, 
    isLoading: isLoadingTopic, 
    error: topicError 
  } = useQuery<{ topic: Topic; angle: Angle }>({
    queryKey: ["/api/muqtarab/angles", angleSlug, "topics", topicSlug],
    queryFn: async () => {
      const res = await fetch(`/api/muqtarab/angles/${angleSlug}/topics/${topicSlug}`);
      if (!res.ok) throw new Error("Failed to fetch topic");
      return res.json();
    },
    enabled: !!angleSlug && !!topicSlug,
  });

  const topic = topicData?.topic;
  const angle = topicData?.angle;

  // تسجيل مشاهدة مرة واحدة لكل موضوع (الخادم يَعُدّ المنشور فقط؛ عام بلا CSRF)
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (topic?.id && viewedRef.current !== topic.id) {
      viewedRef.current = topic.id;
      fetch(`/api/muqtarab/topics/${topic.id}/view`, {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }
  }, [topic?.id]);

  useEffect(() => {
    if (topic && angle) {
      document.title = `${topic.title} - ${angle.nameAr} | مُقترب | سبق`;

      const metaDescription = document.querySelector('meta[name="description"]');
      const description = topic.excerpt || topic.title;

      if (metaDescription) {
        metaDescription.setAttribute("content", description);
      } else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = description;
        document.head.appendChild(meta);
      }

      const setOgTag = (property: string, content: string) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (tag) {
          tag.setAttribute("content", content);
        } else {
          tag = document.createElement("meta");
          tag.setAttribute("property", property);
          tag.setAttribute("content", content);
          document.head.appendChild(tag);
        }
      };

      setOgTag("og:title", `${topic.title} - ${angle.nameAr} | مُقترب`);
      setOgTag("og:description", description);
      setOgTag("og:type", "article");
      if (topic.heroImageUrl) {
        setOgTag("og:image", topic.heroImageUrl);
      }
    }
  }, [topic, angle]);

  const handleShare = async () => {
    if (navigator.share && topic) {
      try {
        await navigator.share({
          title: topic.title,
          text: topic.excerpt || "",
          url: window.location.href,
        });
      } catch (err) {
        console.log("Share failed:", err);
      }
    }
  };

  const isLoading = isLoadingTopic;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />

        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <Skeleton className="h-4 w-64" />
          </div>
        </div>

        <Skeleton className="w-full h-64 md:h-96" />

        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Separator />
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (topicError || !topic || !angle) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />

        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-home">
                  <Home className="h-4 w-4" />
                </a>
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link href="/muqtarab">
                <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-muqtarab">
                  مُقترب
                </a>
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="text-foreground">غير موجود</span>
            </div>
          </div>
        </div>

        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4" data-testid="text-error-title">
              الموضوع غير موجود
            </h1>
            <p className="text-muted-foreground mb-8" data-testid="text-error-description">
              عذراً، لم نتمكن من العثور على الموضوع المطلوب
            </p>
            <Button asChild data-testid="button-back-to-muqtarab">
              <Link href="/muqtarab">
                <a className="gap-2">
                  <ArrowRight className="h-4 w-4" />
                  العودة إلى مُقترب
                </a>
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const contentBlocks = topic.content?.blocks || [];
  const hasContent = contentBlocks.length > 0 || topic.content?.rawHtml || topic.content?.plainText;
  const theme = angleTheme(angle.colorHex);
  const AngleIcon = getLucideIcon(angle.iconKey, Circle);

  return (
    <div className="relative min-h-screen bg-background" dir="rtl" style={theme.vars}>
      {/* Glassmorphism — هالة ملوّنة بلون الزاوية خلف المحتوى */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 -left-24 h-96 w-96 rounded-full blur-3xl opacity-30"
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
        />
      </div>

      {/* شريط هوية الزاوية العلوي */}
      <div className="h-1.5 w-full" style={{ background: theme.gradient }} />

      <div className="relative z-10">
      <Header user={user} />

      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
            <Link href="/">
              <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-home">
                <Home className="h-4 w-4" />
              </a>
            </Link>
            <ChevronRight className="h-4 w-4" />
            <Link href="/muqtarab">
              <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-muqtarab">
                مُقترب
              </a>
            </Link>
            <ChevronRight className="h-4 w-4" />
            <Link href={`/muqtarab/${angleSlug}`}>
              <a className="transition-colors hover:text-[color:var(--angle)]" data-testid="link-breadcrumb-angle">
                {angle.nameAr}
              </a>
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground line-clamp-1" data-testid="text-breadcrumb-topic">
              {topic.title}
            </span>
          </div>
        </div>
      </div>

      {topic.heroImageUrl && (
        <div className="relative w-full h-64 md:h-96 overflow-hidden" data-testid="section-hero-image">
          <img
            src={topic.heroImageUrl}
            alt={topic.title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10">
            <div className="container mx-auto max-w-4xl">
              <Link href={`/muqtarab/${angleSlug}`}>
                <a
                  className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white backdrop-blur-sm"
                  style={{ backgroundColor: withAlpha(angle.colorHex, 0.85) }}
                  data-testid="chip-angle"
                >
                  <AngleIcon className="h-4 w-4" />
                  {angle.nameAr}
                </a>
              </Link>
              <h1 
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4"
                data-testid="heading-topic-title"
              >
                {topic.title}
              </h1>
              {topic.publishedAt && (
                <div className="flex items-center gap-2 text-white/80 text-sm">
                  <Calendar className="h-4 w-4" />
                  <span data-testid="text-published-date">
                    {formatDate(topic.publishedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto">
          {!topic.heroImageUrl && (
            <div className="mb-8">
              <Link href={`/muqtarab/${angleSlug}`}>
                <a
                  className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium"
                  style={{ backgroundColor: theme.soft, color: theme.color }}
                  data-testid="chip-angle"
                >
                  <AngleIcon className="h-4 w-4" />
                  {angle.nameAr}
                </a>
              </Link>
              <h1 
                className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4"
                data-testid="heading-topic-title"
              >
                {topic.title}
              </h1>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {topic.publishedAt && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="h-4 w-4" />
                    <span data-testid="text-published-date">
                      {formatDate(topic.publishedAt)}
                    </span>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  className="gap-2 border-[color:var(--angle-border)] text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
                  data-testid="button-share"
                >
                  <Share2 className="h-4 w-4" />
                  مشاركة
                </Button>
              </div>
              <Separator className="mt-6" />
            </div>
          )}

          {topic.heroImageUrl && (
            <div className="flex items-center justify-between gap-4 mb-6">
              <div />
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="gap-2 border-[color:var(--angle-border)] text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
                data-testid="button-share"
              >
                <Share2 className="h-4 w-4" />
                مشاركة
              </Button>
            </div>
          )}

          {topic.excerpt && (
            <p 
              className="text-xl text-muted-foreground mb-8 leading-relaxed"
              data-testid="text-excerpt"
            >
              {topic.excerpt}
            </p>
          )}

          <article className="prose prose-lg max-w-none" data-testid="section-content">
            {contentBlocks.length > 0 ? (
              contentBlocks.map((block, index) => renderContentBlock(block, index))
            ) : topic.content?.rawHtml ? (
              <div 
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(topic.content.rawHtml) }} 
                data-testid="content-raw-html"
              />
            ) : topic.content?.plainText ? (
              <p data-testid="content-plain-text">{topic.content.plainText}</p>
            ) : !hasContent && (
              <p className="text-muted-foreground text-center py-8" data-testid="text-no-content">
                لا يوجد محتوى متاح لهذا الموضوع
              </p>
            )}
          </article>

          <Separator className="my-8" />

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Button
              variant="ghost"
              asChild
              className="gap-2 text-[color:var(--angle)] hover:text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)]"
              data-testid="button-back-to-angle"
            >
              <Link href={`/muqtarab/${angleSlug}`}>
                <a className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  العودة إلى {angle.nameAr}
                </a>
              </Link>
            </Button>
            <Button variant="outline" asChild className="gap-2" data-testid="button-explore-angles">
              <Link href="/muqtarab">
                <a>استكشف المزيد من الزوايا</a>
              </Link>
            </Button>
          </div>
        </div>
      </main>
      </div>
    </div>
  );
}
