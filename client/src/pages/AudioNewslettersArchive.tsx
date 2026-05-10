import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Podcast, Clock, Headphones, Rss, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AudioNewsletter {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  coverImageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  totalListens: number;
  publishedAt: string;
}

export default function AudioNewslettersArchive() {
  const [selectedNewsletter, setSelectedNewsletter] = useState<AudioNewsletter | null>(null);
  const [page, setPage] = useState(1);
  const limit = 12;

  const { data: newslettersRaw, isLoading } = useQuery<AudioNewsletter[]>({
    queryKey: ["/api/audio-newsletters", { status: "published", limit, offset: (page - 1) * limit }],
  });
  const newsletters = Array.isArray(newslettersRaw) ? newslettersRaw : [];

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getGradientBg = (index: number) => {
    const gradients = [
      "from-blue-500 to-purple-600",
      "from-green-500 to-teal-600",
      "from-orange-500 to-pink-600",
      "from-indigo-500 to-blue-600",
      "from-red-500 to-orange-600",
      "from-purple-500 to-pink-600",
    ];
    return gradients[index % gradients.length];
  };

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header />

      <main className="flex-1 bg-background">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-primary/10 to-primary/5 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center space-y-6">
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Podcast className="h-8 w-8 text-primary" />
                </div>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold" data-testid="heading-archive">
                النشرات الصوتية
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-subtitle">
                استمع إلى أهم الأخبار والمقالات في نشراتنا الصوتية المختارة بعناية
              </p>
              <div className="flex items-center justify-center gap-4 mt-8">
                <Button
                  variant="outline"
                  asChild
                  className="gap-2"
                  data-testid="button-rss-feed"
                >
                  <a
                    href={`${window.location.origin}/api/audio-newsletters/feed.xml`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Rss className="h-4 w-4" />
                    اشترك في RSS Feed
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Newsletters Grid */}
        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="overflow-hidden">
                    <Skeleton className="h-48 w-full" />
                    <CardHeader>
                      <Skeleton className="h-6 w-3/4" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : newsletters.length === 0 ? (
              <div className="text-center py-16" data-testid="text-no-newsletters">
                <Podcast className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-xl text-muted-foreground">لا توجد نشرات صوتية بعد</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {newsletters.map((newsletter, index) => (
                    <Card
                      key={newsletter.id}
                      className="overflow-hidden hover-elevate group"
                      data-testid={`card-newsletter-${newsletter.id}`}
                    >
                      {/* Cover Image */}
                      <div className="relative h-48 overflow-hidden">
                        {newsletter.coverImageUrl ? (
                          <img
                            src={newsletter.coverImageUrl}
                            alt={newsletter.title}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div
                            className={cn(
                              "w-full h-full bg-gradient-to-br flex items-center justify-center",
                              getGradientBg(index)
                            )}
                          >
                            <Podcast className="h-16 w-16 text-white opacity-50" />
                          </div>
                        )}
                        {/* Play Button Overlay */}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button
                            size="icon"
                            className="h-14 w-14 rounded-full"
                            onClick={() => setSelectedNewsletter(newsletter)}
                            data-testid={`button-play-${newsletter.id}`}
                          >
                            <Play className="h-6 w-6" />
                          </Button>
                        </div>
                      </div>

                      {/* Content */}
                      <CardHeader>
                        <CardTitle className="line-clamp-2" data-testid={`text-title-${newsletter.id}`}>
                          <Link
                            href={`/audio-newsletters/${newsletter.slug}`}
                            className="hover:text-primary transition-colors"
                          >
                            {newsletter.title}
                          </Link>
                        </CardTitle>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        {newsletter.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {newsletter.description}
                          </p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {newsletter.duration && (
                            <div className="flex items-center gap-1" data-testid={`text-duration-${newsletter.id}`}>
                              <Clock className="h-3 w-3" />
                              {formatDuration(newsletter.duration)}
                            </div>
                          )}
                          <div className="flex items-center gap-1" data-testid={`text-listens-${newsletter.id}`}>
                            <Headphones className="h-3 w-3" />
                            {newsletter.totalListens.toLocaleString("ar-EG")}
                          </div>
                        </div>
                      </CardContent>

                      <CardFooter className="text-xs text-muted-foreground border-t pt-4">
                        <span data-testid={`text-published-${newsletter.id}`}>
                          {formatDistanceToNow(new Date(newsletter.publishedAt), {
                            addSuffix: true,
                            locale: arSA,
                          })}
                        </span>
                      </CardFooter>
                    </Card>
                  ))}
                </div>

                {/* Load More */}
                {newsletters.length >= limit && (
                  <div className="flex justify-center mt-12">
                    <Button
                      variant="outline"
                      onClick={() => setPage(page + 1)}
                      data-testid="button-load-more"
                    >
                      عرض المزيد
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      <Footer />

      {/* Player Modal */}
      <Dialog open={!!selectedNewsletter} onOpenChange={() => setSelectedNewsletter(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="text-modal-title">{selectedNewsletter?.title}</DialogTitle>
          </DialogHeader>
          {selectedNewsletter?.audioUrl && (
            <AudioPlayer
              newsletterId={selectedNewsletter.id}
              audioUrl={selectedNewsletter.audioUrl}
              title={selectedNewsletter.title}
              duration={selectedNewsletter.duration || undefined}
              autoPlay
            />
          )}
          <div className="mt-4">
            <Button asChild variant="outline" className="w-full" data-testid="button-view-details">
              <Link href={`/audio-newsletters/${selectedNewsletter?.slug}`}>
                عرض التفاصيل الكاملة
              </Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
