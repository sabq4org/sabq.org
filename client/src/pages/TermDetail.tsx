import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  BookOpen, 
  Tag, 
  ArrowRight, 
  TrendingUp,
  FileText,
  Calendar,
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface SmartTerm {
  id: string;
  term: string;
  aliases: string[];
  description: string | null;
  category: string | null;
  usageCount: number;
  status: string;
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

export default function TermDetail() {
  const params = useParams();
  const termIdentifier = params.identifier || "";

  const { data: term, isLoading: termLoading } = useQuery<SmartTerm>({
    queryKey: [`/api/smart-terms/${encodeURIComponent(termIdentifier)}`],
    enabled: !!termIdentifier,
  });

  const { data: relatedArticles, isLoading: articlesLoading } = useQuery<{ 
    articles: ArticleWithDetails[]; 
    total: number 
  }>({
    queryKey: [`/api/smart-terms/${encodeURIComponent(termIdentifier)}/articles`],
    enabled: !!termIdentifier && !!term,
  });

  if (termLoading) {
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

  if (!term) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-center text-destructive">المصطلح غير موجود</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-4">
              عذراً، لم نتمكن من العثور على المصطلح المطلوب
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

  const firstAppearance = term.createdAt ? format(new Date(term.createdAt), "d MMMM yyyy", { locale: ar }) : "غير محدد";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="relative bg-gradient-to-br from-accent/10 via-background to-primary/10 border-b"
      >
        <div className="container mx-auto px-4 py-12 max-w-6xl">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link href="/">
              <a className="hover:text-foreground transition-colors">الرئيسية</a>
            </Link>
            <span>/</span>
            <span>مصطلح ذكي</span>
            <span>/</span>
            <span className="text-foreground font-medium">{term.term}</span>
          </div>

          {/* Term Header */}
          <div className="flex items-start gap-6">
            {/* Icon */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="p-6 bg-gradient-to-br from-accent to-primary rounded-2xl shadow-xl"
            >
              <BookOpen className="h-16 w-16 text-white" />
            </motion.div>

            {/* Info */}
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex-1"
            >
              <div className="flex items-center gap-3 mb-3">
                <h1 className="text-4xl md:text-5xl font-bold">{term.term}</h1>
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  ذكي
                </Badge>
              </div>

              {term.category && (
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline" className="text-base">
                    {term.category}
                  </Badge>
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                {/* Usage Count */}
                <div className="flex items-center gap-2 bg-primary/10 px-3 py-1.5 rounded-full">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">
                    {term.usageCount.toLocaleString('en-US')} استخدام
                  </span>
                </div>

                {/* Aliases Count */}
                {term.aliases && term.aliases.length > 0 && (
                  <div className="flex items-center gap-2 bg-accent/10 px-3 py-1.5 rounded-full">
                    <Tag className="h-4 w-4 text-accent-foreground" />
                    <span className="text-sm font-medium">
                      {term.aliases.length} اسم مستعار
                    </span>
                  </div>
                )}
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
            {/* Definition */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-primary" />
                    التعريف
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {term.description ? (
                    <p className="text-lg leading-relaxed">{term.description}</p>
                  ) : (
                    <p className="text-muted-foreground italic">
                      لا يوجد تعريف متاح لهذا المصطلح حالياً
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

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
                      لا توجد مقالات مرتبطة بهذا المصطلح حالياً
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Info */}
            {term.aliases && term.aliases.length > 0 && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">الأسماء المستعارة</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {term.aliases.map((alias, index) => (
                        <Badge key={index} variant="outline" className="text-sm">
                          {alias}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Info Card */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">معلومات إضافية</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {term.category && (
                    <div className="flex items-start gap-2">
                      <Tag className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-muted-foreground">التصنيف</p>
                        <p className="font-medium">{term.category}</p>
                      </div>
                    </div>
                  )}

                  <Separator />

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
                      {term.usageCount.toLocaleString('en-US')}
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
                      {term.aliases?.length || 0}
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
