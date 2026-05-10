import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  User, 
  Link2, 
  ArrowRight, 
  Award, 
  Calendar,
  MapPin,
  Building2,
  Globe,
  TrendingUp,
  FileText,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface SmartEntity {
  id: string;
  name: string;
  aliases: string[];
  typeId: number;
  description: string | null;
  imageUrl: string | null;
  slug: string;
  importanceScore: number;
  usageCount: number;
  status: string;
  metadata?: {
    birthDate?: string;
    position?: string;
    organization?: string;
    location?: string;
    website?: string;
    social?: {
      twitter?: string;
      linkedin?: string;
      instagram?: string;
    };
  };
  createdAt: string;
}

interface ArticleWithDetails {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  summary: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

export default function EntityDetail() {
  const params = useParams();
  const slug = params.slug || "";

  const { data: entity, isLoading: entityLoading } = useQuery<SmartEntity>({
    queryKey: [`/api/smart-entities/${encodeURIComponent(slug)}`],
    enabled: !!slug,
  });

  const { data: relatedArticles, isLoading: articlesLoading } = useQuery<{ 
    articles: ArticleWithDetails[]; 
    total: number 
  }>({
    queryKey: [`/api/smart-entities/${encodeURIComponent(slug)}/articles`],
    enabled: !!slug && !!entity,
  });

  if (entityLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <Skeleton className="h-8 w-32 mb-6" />
          <Skeleton className="h-64 w-full mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-destructive">الكيان غير موجود</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              عذراً، لم نتمكن من العثور على الكيان المطلوب
            </p>
            <Button asChild variant="outline">
              <Link href="/">
                <a className="gap-2">
                  <ArrowRight className="h-4 w-4" />
                  العودة للرئيسية
                </a>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const importancePercentage = Math.round(entity.importanceScore * 100);
  const firstAppearance = entity.createdAt ? format(new Date(entity.createdAt), "d MMMM yyyy", { locale: ar }) : "غير محدد";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative bg-gradient-to-br from-primary/10 via-background to-accent/10 border-b"
      >
        <div className="container mx-auto px-4 py-12 max-w-6xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link href="/">
              <a className="hover:text-foreground transition-colors">الرئيسية</a>
            </Link>
            <span>/</span>
            <span>كيان ذكي</span>
            <span>/</span>
            <span className="text-foreground font-medium">{entity.name}</span>
          </div>

          {/* Entity Header */}
          <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
            {/* Avatar */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
                <AvatarImage src={entity.imageUrl || undefined} alt={entity.name} />
                <AvatarFallback className="text-4xl bg-primary/20">
                  <User className="h-16 w-16 text-primary" />
                </AvatarFallback>
              </Avatar>
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex-1"
            >
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-4xl md:text-5xl font-bold">{entity.name}</h1>
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  ذكي
                </Badge>
              </div>

              {entity.metadata?.position && (
                <p className="text-xl text-muted-foreground mb-2">
                  {entity.metadata.position}
                </p>
              )}

              {entity.metadata?.organization && (
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <Building2 className="h-4 w-4" />
                  <span>{entity.metadata.organization}</span>
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                {/* Importance Score */}
                <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
                  <Award className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    درجة الأهمية: {importancePercentage}%
                  </span>
                </div>

                {/* Usage Count */}
                <div className="flex items-center gap-2 bg-accent/10 px-3 py-1.5 rounded-full">
                  <TrendingUp className="h-4 w-4 text-accent-foreground" />
                  <span className="text-sm font-medium">
                    {entity.usageCount.toLocaleString('en-US')} إشارة
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            {entity.description && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      نبذة تعريفية
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg leading-relaxed">{entity.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Related Articles */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      المقالات ذات العلاقة
                    </span>
                    {relatedArticles && relatedArticles.total > 0 && (
                      <Badge variant="secondary">
                        {relatedArticles.total.toLocaleString('en-US')} مقال
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {articlesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full" />
                      ))}
                    </div>
                  ) : relatedArticles && relatedArticles.articles.length > 0 ? (
                    <div className="space-y-4">
                      {relatedArticles?.articles?.map((article, index) => (
                        <motion.div
                          key={article.id}
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: 0.6 + index * 0.1 }}
                        >
                          <Link href={`/article/${article.englishSlug || article.slug}`}>
                            <a className="block group hover-elevate active-elevate-2 rounded-lg border p-4 transition-all">
                              <div className="flex gap-4">
                                {article.imageUrl && (
                                  <img
                                    src={article.imageUrl}
                                    alt={article.title}
                                    className="w-24 h-24 object-cover rounded-md flex-shrink-0"
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-bold text-lg mb-1 group-hover:text-primary transition-colors line-clamp-2">
                                    {article.title}
                                  </h3>
                                  {article.summary && (
                                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                      {article.summary}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    {article.category && (
                                      <Badge variant="outline" className="text-xs">
                                        {article.category.name}
                                      </Badge>
                                    )}
                                    {article.publishedAt && (
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(article.publishedAt), "d MMMM yyyy", { locale: ar })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </a>
                          </Link>
                          {index < relatedArticles.articles.length - 1 && <Separator className="mt-4" />}
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      لا توجد مقالات مرتبطة بهذا الكيان حالياً
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Info */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">معلومات سريعة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Aliases */}
                  {entity.aliases && entity.aliases.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">الأسماء المستعارة</p>
                      <div className="flex flex-wrap gap-2">
                        {entity.aliases.map((alias, index) => (
                          <Badge key={index} variant="outline">
                            {alias}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Metadata */}
                  {entity.metadata?.birthDate && (
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">تاريخ الميلاد</p>
                        <p className="font-medium">{entity.metadata.birthDate}</p>
                      </div>
                    </div>
                  )}

                  {entity.metadata?.location && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">الموقع</p>
                        <p className="font-medium">{entity.metadata.location}</p>
                      </div>
                    </div>
                  )}

                  {entity.metadata?.website && (
                    <div className="flex items-start gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-muted-foreground mb-1">الموقع الإلكتروني</p>
                        <a 
                          href={entity.metadata.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1 text-sm break-all"
                        >
                          زيارة الموقع
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* First Appearance */}
                  <div className="flex items-start gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-muted-foreground">أول ظهور في سبق</p>
                      <p className="font-medium">{firstAppearance}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Social Media */}
            {entity.metadata?.social && Object.keys(entity.metadata.social).length > 0 && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">وسائل التواصل</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {entity.metadata.social.twitter && (
                      <a 
                        href={entity.metadata.social.twitter} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2"
                      >
                        <Link2 className="h-4 w-4" />
                        <span className="text-sm">تويتر</span>
                        <ExternalLink className="h-3 w-3 mr-auto" />
                      </a>
                    )}
                    {entity.metadata.social.linkedin && (
                      <a 
                        href={entity.metadata.social.linkedin} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2"
                      >
                        <Link2 className="h-4 w-4" />
                        <span className="text-sm">لينكد إن</span>
                        <ExternalLink className="h-3 w-3 mr-auto" />
                      </a>
                    )}
                    {entity.metadata.social.instagram && (
                      <a 
                        href={entity.metadata.social.instagram} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2"
                      >
                        <Link2 className="h-4 w-4" />
                        <span className="text-sm">انستغرام</span>
                        <ExternalLink className="h-3 w-3 mr-auto" />
                      </a>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Statistics */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">الإحصائيات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-primary/5 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-primary mb-1">
                      {entity.usageCount.toLocaleString('en-US')}
                    </div>
                    <div className="text-sm text-muted-foreground">إجمالي الاستخدامات</div>
                  </div>
                  
                  <div className="bg-accent/5 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-accent-foreground mb-1">
                      {relatedArticles?.total.toLocaleString('en-US') || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">مقالات مرتبطة</div>
                  </div>
                  
                  <div className="bg-secondary/5 p-4 rounded-lg text-center">
                    <div className="text-3xl font-bold text-secondary-foreground mb-1">
                      {entity.aliases?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">اسم مستعار</div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>

        {/* Back Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-8 text-center"
        >
          <Button asChild variant="outline" size="lg">
            <Link href="/">
              <a className="gap-2">
                <ArrowRight className="h-4 w-4" />
                العودة للرئيسية
              </a>
            </Link>
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
