import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { useAngleDetail } from "@/lib/muqtarab";
import { ArrowRight, ChevronRight, Share2, Calendar, FileText } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Circle } from "lucide-react";
import type { Topic } from "@shared/schema";

function getIconComponent(iconKey: string) {
  const iconName = iconKey as keyof typeof LucideIcons;
  const IconComponent = LucideIcons[iconName];
  
  if (IconComponent && typeof IconComponent === 'function') {
    return IconComponent as React.ComponentType<{ className?: string }>;
  }
  
  return Circle;
}

export default function MuqtarabDetail() {
  const { slug } = useParams<{ slug: string }>();
  
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
      const res = await fetch(`/api/muqtarab/angles/${slug}/topics?limit=10`);
      if (!res.ok) throw new Error("Failed to fetch topics");
      return res.json();
    },
    enabled: !!slug,
  });

  const topics = topicsData?.topics || [];

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
      } catch (err) {
        console.log("Share failed:", err);
      }
    }
  };

  // Loading state
  if (isLoadingAngle) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
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
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Error or not found state
  if (angleError || !angle) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
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

        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
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
      </div>
    );
  }

  const Icon = getIconComponent(angle.iconKey || 'Circle');

  return (
    <div className="min-h-screen bg-background" dir="rtl">
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
        className="relative overflow-hidden"
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
        
        {/* Gradient overlay for text readability */}
        <div 
          className="absolute inset-0"
          style={{
            background: angle.coverImageUrl 
              ? `linear-gradient(135deg, ${angle.colorHex}cc 0%, ${angle.colorHex}99 50%, rgba(0,0,0,0.7) 100%)`
              : `linear-gradient(135deg, ${angle.colorHex} 0%, ${angle.colorHex}dd 100%)`
          }}
        />
        
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
            className="gap-2"
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
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-2" data-testid="heading-topics">
            <FileText className="h-6 w-6" />
            المواضيع
          </h2>
          <Separator />
        </div>

        {/* Loading state for topics */}
        {isLoadingTopics ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-topics-loading">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-48 w-full" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/4" />
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-topics">
            {topics.map((topic: Topic) => (
              <Link key={topic.id} href={`/muqtarab/${slug}/topic/${topic.slug}`}>
                <Card 
                  className="overflow-hidden hover-elevate cursor-pointer group h-full"
                  data-testid={`card-topic-${topic.id}`}
                >
                  {/* Hero Image */}
                  {topic.heroImageUrl && (
                    <div className="relative h-48 overflow-hidden">
                      <img 
                        src={topic.heroImageUrl} 
                        alt={topic.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    </div>
                  )}
                  
                  <CardContent className="p-4 space-y-3">
                    {/* Title */}
                    <h3 
                      className="font-bold text-lg line-clamp-2 group-hover:text-primary transition-colors"
                      data-testid={`text-topic-title-${topic.id}`}
                    >
                      {topic.title}
                    </h3>
                    
                    {/* Excerpt */}
                    {topic.excerpt && (
                      <p 
                        className="text-muted-foreground text-sm line-clamp-2"
                        data-testid={`text-topic-excerpt-${topic.id}`}
                      >
                        {topic.excerpt}
                      </p>
                    )}
                    
                    {/* Published Date */}
                    {topic.publishedAt && (
                      <div 
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                        data-testid={`text-topic-date-${topic.id}`}
                      >
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(topic.publishedAt).toLocaleDateString('ar-SA-u-ca-gregory', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
