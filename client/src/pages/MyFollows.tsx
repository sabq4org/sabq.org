import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen, Bell } from "lucide-react";
import FollowStoryButton from "@/components/FollowStoryButton";

interface StoryFollow {
  id: string;
  storyId: string;
  level: string;
  channels: string[];
  isActive: boolean;
  story: {
    id: string;
    slug: string;
    title: string;
    articlesCount: number;
    followersCount: number;
    rootArticle?: {
      title: string;
      slug: string;
      imageUrl?: string;
    };
  };
}

export default function MyFollows() {
  const { data: follows, isLoading } = useQuery<StoryFollow[]>({
    queryKey: ["/api/stories/my-follows"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeFollows = follows?.filter(f => f.isActive) || [];

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
          متابعاتي
        </h1>
        <p className="text-muted-foreground">
          القصص التي تتابعها وتتلقى إشعارات عنها
        </p>
      </div>

      {activeFollows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bell className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">لا توجد متابعات بعد</h3>
            <p className="text-muted-foreground text-center mb-4">
              ابدأ بمتابعة القصص المهمة لتتلقى تحديثات عنها
            </p>
            <Link href="/">
              <Button data-testid="button-browse-stories">
                <BookOpen className="h-4 w-4 ml-2" />
                تصفح الأخبار
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {activeFollows.map((follow) => (
            <Card key={follow.id} className="hover-elevate" data-testid={`card-story-${follow.storyId}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link href={`/story/${follow.story.slug}`}>
                      <CardTitle className="text-xl hover:text-primary transition-colors cursor-pointer line-clamp-2" data-testid={`text-story-title-${follow.storyId}`}>
                        {follow.story.title}
                      </CardTitle>
                    </Link>
                    {follow.story.rootArticle && (
                      <CardDescription className="mt-2 line-clamp-1">
                        بدأت بـ: {follow.story.rootArticle.title}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <FollowStoryButton 
                      storyId={follow.storyId} 
                      storyTitle={follow.story.title}
                    />
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="secondary" data-testid={`badge-level-${follow.storyId}`}>
                    {follow.level === 'all' && 'جميع التحديثات'}
                    {follow.level === 'breaking' && 'عاجل فقط'}
                    {follow.level === 'analysis' && 'تحليلات فقط'}
                    {follow.level === 'official' && 'رسمي فقط'}
                  </Badge>
                  {follow.channels.includes('inapp') && (
                    <Badge variant="outline">
                      <Bell className="h-3 w-3 ml-1" />
                      داخل التطبيق
                    </Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span data-testid={`text-articles-count-${follow.storyId}`}>
                    {follow.story.articlesCount} مقال
                  </span>
                  <span data-testid={`text-followers-count-${follow.storyId}`}>
                    {follow.story.followersCount} متابع
                  </span>
                </div>

                <Link href={`/story/${follow.story.slug}`}>
                  <Button variant="outline" className="w-full" data-testid={`button-view-timeline-${follow.storyId}`}>
                    عرض Timeline القصة
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
