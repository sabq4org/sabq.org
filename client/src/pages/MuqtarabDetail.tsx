import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAngleDetail } from "@/lib/muqtarab";
import { apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Share2,
  Calendar,
  FileText,
  Circle,
  Eye,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { angleTheme } from "@/lib/angleTheme";
import { formatDate } from "@/lib/format";
import type { Topic } from "@shared/schema";

type TopicWithViews = Topic & { viewsCount?: number | null };

function getTopicViews(topic: TopicWithViews): number {
  return topic.viewsCount ?? topic.viewCount ?? 0;
}

const TOPICS_PER_PAGE = 16;
const TOPICS_FETCH_LIMIT = 50;

function getIconComponent(iconKey: string) {
  return getLucideIcon(iconKey, Circle);
}

export default function MuqtarabDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"latest" | "popular">("latest");
  
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
  } = useQuery<{ topics: TopicWithViews[] }>({
    queryKey: ["/api/muqtarab/angles", slug, "topics"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/angles/${slug}/topics?limit=${TOPICS_FETCH_LIMIT}`));
      if (!res.ok) throw new Error("Failed to fetch topics");
      return res.json();
    },
    enabled: !!slug,
  });

  const topics = topicsData?.topics || [];

  const filteredTopics = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = normalizedQuery
      ? topics.filter(
          (t) =>
            t.title.toLowerCase().includes(normalizedQuery) ||
            (t.excerpt && t.excerpt.toLowerCase().includes(normalizedQuery))
        )
      : [...topics];

    if (sortBy === "popular") {
      filtered.sort((a, b) => getTopicViews(b) - getTopicViews(a));
    } else {
      filtered.sort((a, b) => {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      });
    }
    return filtered;
  }, [topics, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredTopics.length / TOPICS_PER_PAGE));
  const pageStart = (currentPage - 1) * TOPICS_PER_PAGE;
  const paginatedTopics = filteredTopics.slice(pageStart, pageStart + TOPICS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
    setSearchQuery("");
    setSortBy("latest");
  }, [slug]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

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
    if (!angle) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${angle.nameAr} - مُقترب`,
          text: angle.shortDesc || '',
          url: window.location.href,
        });
        return;
      } catch {
        // المستخدم ألغى المشاركة أو المتصفح لا يدعمها — ننتقل لنسخ الرابط
      }
    }
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "تم نسخ رابط الزاوية",
        description: "يمكنك الآن مشاركة الرابط في أي مكان",
      });
    } catch {
      // تجاهل بصمت
    }
  };

  // Loading state
  if (isLoadingAngle) {
    return (
      <div className="public-page min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        
        {/* Breadcrumbs skeleton */}
        <div className="border-b bg-muted/30">
          <div className="public-container container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
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
        <main id="muqtarab-topics" className="flex-1 container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 scroll-mt-24">
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
      <div className="public-page min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        
        {/* Breadcrumbs */}
        <div className="border-b bg-muted/30">
          <div className="public-container container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
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

        <main className="public-container flex-1 container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
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
    <div className="public-page relative min-h-screen bg-background flex flex-col" dir="rtl" style={theme.vars}>
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
      <div className="public-page-header border-b bg-muted/30">
        <div className="public-container container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
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
        
        <div className="public-container container relative z-10 mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-12 lg:px-8">
          <div className="mx-auto max-w-3xl text-center text-white">
            {/* Icon */}
            <div 
              className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full md:h-24 md:w-24"
              style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(10px)'
              }}
              data-testid="icon-container"
            >
              <Icon className="h-10 w-10 text-white md:h-12 md:w-12" data-testid="icon-angle" />
            </div>

            {/* Title */}
            <h1 className="mb-3 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl" data-testid="heading-angle-name">
              {angle.nameAr}
            </h1>

            {/* Writer */}
            {writer && (
              <div
                className="mb-4 flex items-center justify-center gap-3"
                data-testid="writer-byline"
              >
                {writer.id ? (
                  <Link href={`/muqtarab/writer/${writer.id}`}>
                    <Avatar className="h-11 w-11 cursor-pointer ring-2 ring-white/30 transition-all hover:ring-white/60">
                      {writer.avatar && (
                        <AvatarImage src={writer.avatar} alt={writer.name} className="object-cover" />
                      )}
                      <AvatarFallback className="bg-white/20 text-white text-sm font-bold">
                        {writer.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                ) : (
                  <Avatar className="h-11 w-11 ring-2 ring-white/30">
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
                        className="font-bold text-white transition-colors hover:text-white/90"
                        data-testid="text-writer-name"
                      >
                        {writer.name}
                      </a>
                    </Link>
                  ) : (
                    <p className="font-bold text-white" data-testid="text-writer-name">
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
              <p className="mx-auto mb-4 max-w-2xl text-base leading-7 text-white/90 md:text-lg" data-testid="text-angle-description">
                {angle.shortDesc}
              </p>
            )}

            {/* Writer bio / signature pill */}
            {(writer?.bio || angle.writerSignature) && (
              <div
                className="mx-auto mb-5 max-w-2xl rounded-2xl border border-white/20 bg-black/15 px-4 py-3 text-sm leading-relaxed text-white/90 backdrop-blur-md"
                data-testid="card-angle-writer-bio"
              >
                {writer?.bio && <p>{writer.bio}</p>}
                {angle.writerSignature && (
                  <p className="mt-1 whitespace-pre-line text-xs text-white/80">
                    {angle.writerSignature}
                  </p>
                )}
              </div>
            )}

            {/* Stats & Actions */}
            <div className="flex flex-wrap items-center justify-center gap-3">
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

      {/* Topics Section */}
      <main id="muqtarab-topics" className="container mx-auto flex-1 max-w-7xl scroll-mt-24 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold md:text-3xl" data-testid="heading-topics">
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

          <div className="flex flex-wrap items-center gap-2.5">
            {topics.length > 1 && (
              <>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث في مواضيع الزاوية..."
                    className="h-9 pr-9 pl-8 text-sm"
                    data-testid="input-search-angle-topics"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="مسح البحث"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div
                  className="inline-flex items-center rounded-lg border border-border/70 bg-muted/30 p-0.5 text-xs"
                  role="group"
                  aria-label="ترتيب المواضيع"
                >
                  <button
                    type="button"
                    onClick={() => setSortBy("latest")}
                    className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                      sortBy === "latest"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-sort-latest"
                  >
                    الأحدث
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy("popular")}
                    className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                      sortBy === "popular"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-sort-popular"
                  >
                    الأكثر قراءة
                  </button>
                </div>
              </>
            )}

            <Button
              variant="ghost"
              asChild
              className="gap-2 text-[color:var(--angle)] hover:bg-[color:var(--angle-soft)] hover:text-[color:var(--angle)]"
              data-testid="button-back"
            >
              <Link href="/muqtarab">
                <a className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4" />
                  جميع الزوايا
                </a>
              </Link>
            </Button>
          </div>
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
        ) : filteredTopics.length === 0 ? (
          <div className="py-12 text-center">
            <p className="mb-3 text-base text-muted-foreground" data-testid="text-topics-no-results">
              لا توجد مواضيع مطابقة لعبارة البحث «{searchQuery}»
            </p>
            <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
              إظهار جميع المواضيع
            </Button>
          </div>
        ) : (
          // Topics grid
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-topics">
            {paginatedTopics.map((topic: TopicWithViews, idx: number) => {
              const isLatestBadge =
                sortBy === "latest" && currentPage === 1 && idx === 0 && !searchQuery;
              const topicViews = getTopicViews(topic);
              return (
                <Link key={topic.id} href={`/muqtarab/${slug}/topic/${topic.slug}`} className="block h-full">
                  <Card 
                    className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border/70 border-t-2 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
                    style={{ borderTopColor: theme.color }}
                    data-testid={`card-topic-${topic.id}`}
                  >
                    {/* Hero Image or Themed Cover Header */}
                    {topic.heroImageUrl ? (
                      <div className="relative h-40 overflow-hidden">
                        <img 
                          src={topic.heroImageUrl} 
                          alt={topic.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                        {isLatestBadge && (
                          <span
                            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm"
                            style={{ backgroundColor: theme.color }}
                          >
                            <Sparkles className="h-3 w-3" />
                            الأحدث
                          </span>
                        )}
                      </div>
                    ) : (
                      <div
                        className="relative flex h-24 items-center justify-between overflow-hidden px-4"
                        style={{
                          background: `linear-gradient(135deg, ${theme.soft} 0%, transparent 100%)`,
                          borderBottom: `1px solid ${theme.border}`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-9 w-9 items-center justify-center rounded-lg"
                            style={{ backgroundColor: theme.soft, color: theme.color }}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-xs font-semibold" style={{ color: theme.color }}>
                            {angle.nameAr}
                          </span>
                        </div>
                        {isLatestBadge && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm"
                            style={{ backgroundColor: theme.color }}
                          >
                            <Sparkles className="h-3 w-3" />
                            الأحدث
                          </span>
                        )}
                      </div>
                    )}
                    
                    <CardContent className="flex flex-1 flex-col justify-between p-4 space-y-3">
                      <div className="space-y-2">
                        {/* Title */}
                        <h3 
                          className="public-card-title font-bold text-base leading-snug line-clamp-2 transition-colors group-hover:text-[color:var(--angle)]"
                          data-testid={`text-topic-title-${topic.id}`}
                        >
                          {topic.title}
                        </h3>
                        
                        {/* Excerpt */}
                        {topic.excerpt && (
                          <p 
                            className="public-card-excerpt text-muted-foreground text-xs leading-relaxed line-clamp-3"
                            data-testid={`text-topic-excerpt-${topic.id}`}
                          >
                            {topic.excerpt}
                          </p>
                        )}
                      </div>
                      
                      {/* Published Date & Views */}
                      <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                        {topic.publishedAt ? (
                          <div 
                            className="public-meta flex items-center gap-1.5"
                            data-testid={`text-topic-date-${topic.id}`}
                          >
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(topic.publishedAt)}</span>
                          </div>
                        ) : <span />}

                        {topicViews > 0 && (
                          <div className="flex items-center gap-1" data-testid={`text-topic-views-${topic.id}`}>
                            <Eye className="h-3 w-3" />
                            <span>{topicViews.toLocaleString("en-US")}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
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
                صفحة {currentPage} من {totalPages} · {filteredTopics.length} موضوع
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
