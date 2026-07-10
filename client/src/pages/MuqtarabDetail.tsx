import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAngleDetail } from "@/lib/muqtarab";
import { apiUrl } from "@/lib/queryClient";
import { ArrowRight, ChevronLeft, ChevronRight, Share2, Calendar, FileText, Circle } from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { angleTheme } from "@/lib/angleTheme";
import { formatDate } from "@/lib/format";
import type { Topic } from "@shared/schema";

const TOPICS_PER_PAGE = 16;
const TOPICS_FETCH_LIMIT = 500;

function getIconComponent(iconKey: string) {
  return getLucideIcon(iconKey, Circle);
}

export default function MuqtarabDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [currentPage, setCurrentPage] = useState(1);
  
  // Fetch current user
  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Fetch angle details
  const { 
    data: angle, 
    isLoading: isLoadingAngle, 
    error: angleError 
  } = useAngleDetail(slug || "");

  // Fetch published topics for this angle
  const { 
    data: topicsData, 
    isLoading: isLoadingTopics 
  } = useQuery<{ topics: Topic[] }>({
    queryKey: ["/api/muqtarab/angles", slug, "topics"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/angles/${slug}/topics?limit=${TOPICS_FETCH_LIMIT}`));
      if (!res.ok) throw new Error("Failed to fetch topics");
      return res.json();
    },
    enabled: !!slug,
  });

  const topics = topicsData?.topics || [];
  const totalPages = Math.max(1, Math.ceil(topics.length / TOPICS_PER_PAGE));
  const pageStart = (currentPage - 1) * TOPICS_PER_PAGE;
  const paginatedTopics = topics.slice(pageStart, pageStart + TOPICS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [slug]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const goToPage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalPages);
    setCurrentPage(nextPage);
    requestAnimationFrame(() => {
      document.getElementById("muqtarab-topics")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  // Set page title and meta tags for SEO
  useEffect(() => {
    if (angle) {
      document.title = `${angle.nameAr} - مُقترب | سبق`;
      
      // Set meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      const description = angle.shortDesc || `استكشف ${angle.nameAr} - زاوية متخصصة في مُقترب تقدم تحليلات عميقة ومنظورات فريدة`;
      
      if (metaDescription) {
        metaDescription.setAttribute('content', description);
      } else {
        const meta = document.createElement('meta');
        meta.name = 'description';
        meta.content = description;
        document.head.appendChild(meta);
      }

      // Set Open Graph tags
      const setOgTag = (property: string, content: string) => {
        let tag = document.querySelector(`meta[property="${property}"]`);
        if (tag) {
          tag.setAttribute('content', content);
        } else {
          tag = document.createElement('meta');
          tag.setAttribute('property', property);
          tag.setAttribute('content', content);
          document.head.appendChild(tag);
        }
      };

      setOgTag('og:title', `${angle.nameAr} - مُقترب | سبق`);
      setOgTag('og:description', description);
      setOgTag('og:type', 'website');
    }
  }, [angle]);

  const handleShare = async () => {
    if (navigator.share && angle) {
      try {
        await navigator.share({
          title: `${angle.nameAr} - مُقترب`,
          text: angle.shortDesc || '',
          url: window.location.href,
        });
      } catch {
        // المستخدم ألغى المشاركة أو المتصفح لا يدعمها — تجاهل بصمت
      }
    }
  };

  // Loading state
  if (isLoadingAngle) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        
        {/* Breadcrumbs skeleton */}
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <Skeleton className="h-4 w-48" />
          </div>
        </div>

        {/* Hero skeleton */}
        <div className="relative overflow-hidden bg-muted animate-pulse" style={{ height: '400px' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="h-24 w-24 rounded-full" />
          </div>
        </div>

        {/* Content skeleton */}
        <main id="muqtarab-topics" className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 scroll-mt-24">
          <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }, (_, index) => index + 1).map((i) => (
                <Skeleton key={i} className="h-56" />
              ))}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Error or not found state
  if (angleError || !angle) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        
        {/* Breadcrumbs */}
        <div className="border-b bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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

        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4" data-testid="text-error-title">
              الزاوية غير موجودة
            </h1>
            <p className="text-muted-foreground mb-8" data-testid="text-error-description">
              عذراً، لم نتمكن من العثور على الزاوية المطلوبة
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
        <Footer />
      </div>
    );
  }

  const Icon = getIconComponent(angle.iconKey || 'Circle');
  const theme = angleTheme(angle.colorHex);
  const writer = angle.writer ?? null;

  return (
    <div className="relative min-h-screen bg-background flex flex-col" dir="rtl" style={theme.vars}>
      {/* Glassmorphism — هالات ملوّنة بلون الزاوية في خلفية الصفحة */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-32 -right-24 h-96 w-96 rounded-full blur-3xl opacity-40"
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
        />
        <div
          className="absolute top-1/3 -left-24 h-80 w-80 rounded-full blur-3xl opacity-30"
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
        />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
      <Header user={user} />

      {/* Breadcrumbs */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/muqtarab">
              <a className="hover:text-foreground transition-colors" data-testid="link-breadcrumb-muqtarab">
                مُقترب
              </a>
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground line-clamp-1" data-testid="text-breadcrumb-angle">
              {angle.nameAr}
            </span>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div 
        className={`relative overflow-hidden${angle.coverImageUrl ? "" : " angle-animated-cover"}`}
        style={{ 
          backgroundColor: angle.colorHex,
        }}
        data-testid="section-hero"
      >
        {/* Cover Image Background */}
        {angle.coverImageUrl && (
          <img 
            src={angle.coverImageUrl} 
            alt={angle.nameAr}
            className="absolute inset-0 w-full h-full object-cover"
            data-testid="img-cover"
          />
        )}
        
        {/* Gradient overlay for text readability (للصور فقط؛ التدرّج المتحرّك يكفي بلا صورة) */}
        {angle.coverImageUrl && (
          <div 
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${angle.colorHex}cc 0%, ${angle.colorHex}99 50%, rgba(0,0,0,0.7) 100%)`
            }}
          />
        )}
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 relative z-10">
          <div className="max-w-4xl mx-auto text-center text-white">
            {/* Icon */}
            <div 
              className="w-24 h-24 md:w-32 md:h-32 rounded-full mx-auto mb-6 flex items-center justify-center"
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)'
              }}
              data-testid="icon-container"
            >
              <Icon className="w-12 h-12 md:w-16 md:h-16 text-white" data-testid="icon-angle" />
            </div>

            {/* Title */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4" data-testid="heading-angle-name">
              {angle.nameAr}
            </h1>

            {/* Writer */}
            {writer && (
              <div
                className="flex items-center justify-center gap-3 mb-5"
                data-testid="writer-byline"
              >
                {writer.id ? (
                  <Link href={`/muqtarab/writer/${writer.id}`}>
                    <Avatar className="h-12 w-12 ring-2 ring-white/30 cursor-pointer hover:ring-white/50 transition-all">
                      {writer.avatar && (
                        <AvatarImage src={writer.avatar} alt={writer.name} className="object-cover" />
                      )}
                      <AvatarFallback className="bg-white/20 text-white text-sm font-bold">
                        {writer.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                ) : (
                  <Avatar className="h-12 w-12 ring-2 ring-white/30">
                    {writer.avatar && (
                      <AvatarImage src={writer.avatar} alt={writer.name} className="object-cover" />
                    )}
                    <AvatarFallback className="bg-white/20 text-white text-sm font-bold">
                      {writer.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="text-right">
                  {writer.id ? (
                    <Link href={`/muqtarab/writer/${writer.id}`}>
                      <a
                        className="font-bold text-lg text-white hover:text-white/90 transition-colors"
                        data-testid="text-writer-name"
                      >
                        {writer.name}
                      </a>
                    </Link>
                  ) : (
                    <p className="font-bold text-lg text-white" data-testid="text-writer-name">
                      {writer.name}
                    </p>
                  )}
                  <p className="text-sm text-white/75" data-testid="text-writer-role">
                    كاتب الزاوية
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            {angle.shortDesc && (
              <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl mx-auto leading-relaxed" data-testid="text-angle-description">
                {angle.shortDesc}
              </p>
            )}

            {/* Stats & Actions */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Badge 
                variant="secondary" 
                className="bg-white/20 text-white border-white/30 backdrop-blur-sm"
                data-testid="badge-topic-count"
              >
                {topics.length} موضوع
              </Badge>

              <Button
                variant="outline"
                className="gap-2 bg-white/10 text-white border-white/30 hover:bg-white/20 backdrop-blur-sm"
                onClick={handleShare}
                data-testid="button-share"
              >
                <Share2 className="h-4 w-4" />
                مشاركة
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button 
            variant="ghost" 
            asChild
            className="gap-2 text-[color:var(--angle)] hover:text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)]"
            data-testid="button-back"
          >
            <Link href="/muqtarab">
              <a className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                العودة إلى الزوايا
              </a>
            </Link>
          </Button>
        </div>
      </div>

      {/* Topics Section */}
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2" data-testid="heading-topics">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: theme.soft, color: theme.color }}
            >
              <FileText className="h-5 w-5" />
            </span>
            المواضيع
          </h2>
          <div className="h-1 w-16 rounded-full" style={{ backgroundColor: theme.color }} />
        </div>

        {/* Loading state for topics */}
        {isLoadingTopics ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-topics-loading">
            {Array.from({ length: 8 }, (_, index) => index + 1).map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-40 w-full" />
                <CardContent className="p-3 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : topics.length === 0 ? (
          // Empty state for topics
          <div className="text-center py-12">
            <div 
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ 
                backgroundColor: `${angle.colorHex}15`,
                color: angle.colorHex 
              }}
            >
              <FileText className="w-8 h-8" />
            </div>
            <p className="text-lg text-muted-foreground" data-testid="text-topics-empty">
              لا توجد مواضيع مرتبطة بهذه الزاوية حتى الآن
            </p>
          </div>
        ) : (
          // Topics grid
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-topics">
            {paginatedTopics.map((topic: Topic) => (
              <Link key={topic.id} href={`/muqtarab/${slug}/topic/${topic.slug}`}>
                <Card 
                  className="overflow-hidden hover-elevate cursor-pointer group h-full border-t-2"
                  style={{ borderTopColor: theme.color }}
                  data-testid={`card-topic-${topic.id}`}
                >
                  {/* Hero Image */}
                  {topic.heroImageUrl && (
                    <div className="relative h-40 overflow-hidden">
                      <img 
                        src={topic.heroImageUrl} 
                        alt={topic.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    </div>
                  )}
                  
                  <CardContent className="p-3 space-y-2">
                    {/* Title */}
                    <h3 
                      className="font-bold text-base line-clamp-2 transition-colors group-hover:text-[color:var(--angle)]"
                      data-testid={`text-topic-title-${topic.id}`}
                    >
                      {topic.title}
                    </h3>
                    
                    {/* Excerpt */}
                    {topic.excerpt && (
                      <p 
                        className="text-muted-foreground text-xs line-clamp-2"
                        data-testid={`text-topic-excerpt-${topic.id}`}
                      >
                        {topic.excerpt}
                      </p>
                    )}
                    
                    {/* Published Date */}
                    {topic.publishedAt && (
                      <div 
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                        data-testid={`text-topic-date-${topic.id}`}
                      >
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(topic.publishedAt)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-8 flex flex-wrap items-center justify-center gap-2"
              aria-label="صفحات مواضيع الزاوية"
              data-testid="topics-pagination"
            >
              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="الصفحة السابقة"
                data-testid="button-page-previous"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>

              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="icon"
                  onClick={() => goToPage(page)}
                  aria-current={page === currentPage ? "page" : undefined}
                  data-testid={`button-page-${page}`}
                  style={page === currentPage ? { backgroundColor: theme.color } : undefined}
                >
                  {page}
                </Button>
              ))}

              <Button
                variant="outline"
                size="icon"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                aria-label="الصفحة التالية"
                data-testid="button-page-next"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="w-full text-center text-xs text-muted-foreground mt-1">
                صفحة {currentPage} من {totalPages} · {topics.length} موضوع
              </span>
            </nav>
          )}
          </>
        )}
      </main>

      <Footer />
      </div>
    </div>
  );
}
