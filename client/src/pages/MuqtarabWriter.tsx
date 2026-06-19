import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronRight, Calendar, Eye, FileText, Circle, ArrowRight } from "lucide-react";
import { getLucideIcon } from "@/lib/lucideIconMap";
import { angleTheme } from "@/lib/angleTheme";
import { formatNumber, formatDate } from "@/lib/format";
import { apiUrl } from "@/lib/queryClient";

type WriterAngle = {
  slug: string;
  nameAr: string;
  colorHex: string;
  iconKey: string;
  coverImageUrl: string | null;
};

type WriterTopic = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  heroImageUrl: string | null;
  publishedAt: string | null;
  viewCount: number;
  angleSlug: string;
  angleName: string;
  colorHex: string;
};

type WriterProfile = {
  writer: { id: string; name: string; avatar: string | null; bio: string | null };
  angles: WriterAngle[];
  topics: WriterTopic[];
};

function getIconComponent(iconKey: string) {
  return getLucideIcon(iconKey, Circle);
}

export default function MuqtarabWriter() {
  const { id } = useParams<{ id: string }>();

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery<WriterProfile>({
    queryKey: ["/api/muqtarab/writers", id],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/muqtarab/writers/${id}`));
      if (!res.ok) throw new Error("Failed to fetch writer");
      return res.json();
    },
    enabled: !!id,
  });

  // SEO / meta (الزواحف يخدمها معالج الحافة؛ هذا للـ SPA)
  useEffect(() => {
    if (!profile) return;
    const { writer } = profile;
    document.title = `${writer.name} — كاتب في مُقترب | سبق`;
    const description =
      writer.bio || `${writer.name} — كاتب في منصة مُقترب من صحيفة سبق الإلكترونية`;
    const setMeta = (selector: string, attr: string, key: string, content: string) => {
      let tag = document.querySelector(selector);
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", content);
    };
    setMeta('meta[name="description"]', "name", "description", description);
    setMeta('meta[property="og:title"]', "property", "og:title", `${writer.name} — كاتب في مُقترب | سبق`);
    setMeta('meta[property="og:description"]', "property", "og:description", description);
    setMeta('meta[property="og:type"]', "property", "og:type", "profile");
    if (writer.avatar) {
      setMeta('meta[property="og:image"]', "property", "og:image", writer.avatar);
    }
  }, [profile]);

  const theme = angleTheme(profile?.angles?.[0]?.colorHex);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-28 w-28 rounded-full" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Not found / error
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background flex flex-col" dir="rtl">
        <Header user={user} />
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-2">الكاتب غير موجود</h1>
          <p className="text-muted-foreground mb-6">
            لم نتمكّن من العثور على صفحة هذا الكاتب في مُقترب.
          </p>
          <Link href="/muqtarab">
            <a className="inline-flex items-center gap-2 text-primary hover:underline" data-testid="link-back-muqtarab">
              <ArrowRight className="h-4 w-4" />
              العودة إلى مُقترب
            </a>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const { writer, angles, topics } = profile;

  return (
    <div className="relative min-h-screen bg-background flex flex-col" dir="rtl" style={theme.vars}>
      {/* هالات ملوّنة بلون الزاوية */}
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
              <span className="text-foreground line-clamp-1" data-testid="text-breadcrumb-writer">
                {writer.name}
              </span>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div
          className="relative overflow-hidden"
          style={{ background: theme.gradient }}
          data-testid="section-writer-hero"
        >
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20 relative z-10">
            <div className="max-w-3xl mx-auto text-center text-white">
              <Avatar className="h-28 w-28 md:h-32 md:w-32 mx-auto mb-5 ring-4 ring-white/30">
                {writer.avatar && (
                  <AvatarImage src={writer.avatar} alt={writer.name} className="object-cover" />
                )}
                <AvatarFallback className="bg-white/20 text-white text-3xl font-bold">
                  {writer.name.charAt(0)}
                </AvatarFallback>
              </Avatar>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2" data-testid="heading-writer-name">
                {writer.name}
              </h1>
              <p className="text-white/75 text-sm md:text-base mb-5" data-testid="text-writer-role">
                كاتب في مُقترب
              </p>

              {writer.bio && (
                <p
                  className="text-white/90 text-base md:text-lg leading-relaxed max-w-2xl mx-auto"
                  data-testid="text-writer-bio"
                >
                  {writer.bio}
                </p>
              )}

              {/* الزوايا التي يكتبها */}
              {angles.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-2 mt-6" data-testid="writer-angles">
                  {angles.map((a) => {
                    const Icon = getIconComponent(a.iconKey || "Circle");
                    return (
                      <Link key={a.slug} href={`/muqtarab/${a.slug}`}>
                        <a
                          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm"
                          data-testid={`link-writer-angle-${a.slug}`}
                        >
                          <Icon className="h-4 w-4" />
                          {a.nameAr}
                        </a>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Topics */}
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-xl md:text-2xl font-bold" data-testid="heading-writer-topics">
              مواضيع الكاتب
            </h2>
            <span
              className="text-sm font-semibold rounded-full px-2.5 py-0.5"
              style={{ backgroundColor: theme.soft, color: theme.color }}
              data-testid="text-writer-topics-count"
            >
              {formatNumber(topics.length)}
            </span>
          </div>

          {topics.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-muted-foreground bg-muted">
                <FileText className="w-8 h-8" />
              </div>
              <p className="text-lg text-muted-foreground" data-testid="text-writer-topics-empty">
                لا توجد مواضيع منشورة لهذا الكاتب حتى الآن
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="grid-writer-topics">
              {topics.map((topic) => (
                <Link key={topic.id} href={`/muqtarab/${topic.angleSlug}/topic/${topic.slug}`}>
                  <Card
                    className="overflow-hidden hover-elevate cursor-pointer group h-full border-t-2"
                    style={{ borderTopColor: topic.colorHex }}
                    data-testid={`card-topic-${topic.id}`}
                  >
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
                      <span
                        className="inline-block text-xs font-semibold rounded-full px-2 py-0.5"
                        style={{ backgroundColor: `${topic.colorHex}1f`, color: topic.colorHex }}
                        data-testid={`text-topic-angle-${topic.id}`}
                      >
                        {topic.angleName}
                      </span>

                      <h3
                        className="font-bold text-lg line-clamp-2 transition-colors group-hover:text-[color:var(--angle)]"
                        data-testid={`text-topic-title-${topic.id}`}
                      >
                        {topic.title}
                      </h3>

                      {topic.excerpt && (
                        <p className="text-muted-foreground text-sm line-clamp-2" data-testid={`text-topic-excerpt-${topic.id}`}>
                          {topic.excerpt}
                        </p>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                        {topic.publishedAt && (
                          <span className="flex items-center gap-1.5" data-testid={`text-topic-date-${topic.id}`}>
                            <Calendar className="h-3 w-3" />
                            {formatDate(topic.publishedAt)}
                          </span>
                        )}
                        {topic.viewCount > 0 && (
                          <span className="flex items-center gap-1.5" data-testid={`text-topic-views-${topic.id}`}>
                            <Eye className="h-3 w-3" />
                            {formatNumber(topic.viewCount)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </main>

        <Footer />
      </div>
    </div>
  );
}
