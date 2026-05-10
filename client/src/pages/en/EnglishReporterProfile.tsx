import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { EnglishHeader } from "@/components/en/EnglishHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, ThumbsUp, Clock, TrendingUp, Calendar, CheckCircle2, FileText, Target } from "lucide-react";
import { Link } from "wouter";
import type { ReporterProfile as ReporterProfileType } from "@shared/schema";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';

export default function EnglishReporterProfile() {
  const { slug } = useParams<{ slug: string }>();

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: profile, isLoading, error } = useQuery<ReporterProfileType>({
    queryKey: ['/api/en/reporters', slug],
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background" dir="ltr">
        <EnglishHeader user={user} />
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-48 bg-muted rounded-lg"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-muted rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background" dir="ltr">
        <EnglishHeader user={user} />
        <div className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="p-8 text-center">
              <p className="text-lg text-muted-foreground">Reporter not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const {
    fullName,
    title,
    avatarUrl,
    bio,
    isVerified,
    tags,
    kpis,
    lastArticles,
    topCategories,
    timeseries,
    badges,
  } = profile;

  return (
    <div className="min-h-screen bg-background" dir="ltr">
      <EnglishHeader user={user} />

      {/* Hero Section */}
      <section 
        className="relative overflow-hidden py-12"
        style={{
          background: 'linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%)'
        }}
      >
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg" data-testid="avatar-reporter">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
              <AvatarFallback className="text-2xl">
                {fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center md:text-left space-y-3">
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-reporter-name">{fullName}</h1>
                {isVerified && <CheckCircle2 className="h-6 w-6 text-primary" data-testid="icon-verified" />}
              </div>
              {title && <p className="text-xl text-muted-foreground" data-testid="text-reporter-title">{title}</p>}
              {bio && <p className="text-base max-w-2xl" data-testid="text-reporter-bio">{bio}</p>}
              {tags && tags.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  {tags.map((tag, idx) => <Badge key={idx} variant="secondary" data-testid={`badge-tag-${idx}`}>{tag}</Badge>)}
                </div>
              )}
              {badges && badges.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                  {badges.map((badge) => <Badge key={badge.key} variant="outline" data-testid={`badge-achievement-${badge.key}`}>{badge.label}</Badge>)}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-8 space-y-8">

        {/* KPIs Section */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="shadow-sm border border-border dark:border-card-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">Articles</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-kpi-articles">{kpis.totalArticles}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-border dark:border-card-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">Views</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-kpi-views">{kpis.totalViews}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-border dark:border-card-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <ThumbsUp className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">Likes</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-kpi-likes">{kpis.totalLikes}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-border dark:border-card-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">Read Time</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-kpi-readtime">
                {kpis.avgReadTimeMin}
                <span className="text-base font-normal text-muted-foreground ml-1">min</span>
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border border-border dark:border-card-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <span className="text-sm text-muted-foreground">Completion Rate</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-kpi-completion">{kpis.avgCompletionRate}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Latest Articles */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xl font-bold">Latest Articles</h2>
            
            {lastArticles && lastArticles.length > 0 ? (
              <div className="space-y-3">
                {lastArticles.map((article) => (
                  <Card key={article.id} className="hover-elevate">
                    <CardContent className="p-4">
                      <Link 
                        href={`/en/article/${article.englishSlug || article.slug}`}
                        data-testid={`link-article-${article.id}`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-base leading-snug flex-1">
                              {article.title}
                            </h3>
                            {article.isBreaking && (
                              <Badge variant="destructive" className="shrink-0">
                                Breaking
                              </Badge>
                            )}
                          </div>

                          {article.category && (
                            <Badge 
                              variant="secondary"
                              style={{ 
                                backgroundColor: article.category.color || undefined,
                                color: '#fff'
                              }}
                              data-testid={`badge-category-${article.id}`}
                            >
                              {article.category.name}
                            </Badge>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {article.publishedAt && formatDistanceToNow(new Date(article.publishedAt), {
                                addSuffix: true,
                                locale: enUS,
                              })}
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {article.views}
                            </span>
                            {article.comments > 0 && (
                              <span>{article.comments} {article.comments === 1 ? 'comment' : 'comments'}</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No recent articles
                </CardContent>
              </Card>
            )}
          </div>

          {/* Top Categories */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Top Categories</h2>
            
            {topCategories && topCategories.length > 0 ? (
              <Card>
                <CardContent className="p-4 space-y-3">
                  {topCategories.map((cat, idx) => (
                    <div key={idx} className="space-y-2" data-testid={`category-${idx}`}>
                      {idx > 0 && <Separator />}
                      <div className="flex items-center justify-between">
                        <Badge 
                          variant="secondary"
                          style={{ 
                            backgroundColor: cat.color || undefined,
                            color: '#fff'
                          }}
                        >
                          {cat.name}
                        </Badge>
                        <span className="text-sm font-medium">
                          {cat.sharePct}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{cat.articles} {cat.articles === 1 ? 'article' : 'articles'}</span>
                        <span>{cat.views} {cat.views === 1 ? 'view' : 'views'}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No data available
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Timeline Chart */}
        {timeseries && timeseries.daily && timeseries.daily.length > 0 && (
          <Card>
            <CardHeader className="gap-1">
              <CardTitle>Views over the last {timeseries.windowDays} days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeseries.daily}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => {
                        const date = new Date(value);
                        return `${date.getMonth() + 1}/${date.getDate()}`;
                      }}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip 
                      labelFormatter={(value) => {
                        const date = new Date(value as string);
                        return date.toLocaleDateString('en-US');
                      }}
                      formatter={(value: number) => [value, '']}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="views" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      name="Views"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
