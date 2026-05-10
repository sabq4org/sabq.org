import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Rss, 
  Copy, 
  Check, 
  Search, 
  Filter,
  Newspaper,
  Headphones,
  Folder,
  ExternalLink,
  Download,
  Share2,
  Bell,
  ChevronDown,
  ArrowRight,
  Sparkles,
  Globe,
  Clock,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/Footer";
import sabqLogo from "@assets/sabq-logo.png";

interface CategoryFeed {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  slug: string;
  rss: string;
  icon: string;
  color: string | null;
}

interface FeedsData {
  main: {
    title: string;
    description: string;
    rss: string;
    json: string;
    icon: string;
  };
  audio: {
    title: string;
    description: string;
    rss: string;
    json: string;
    icon: string;
  };
  categories: CategoryFeed[];
}

const iconMap: Record<string, any> = {
  newspaper: Newspaper,
  headphones: Headphones,
  folder: Folder,
};

function FeedCard({ 
  title, 
  description, 
  rssUrl, 
  jsonUrl,
  icon,
  color,
  featured = false
}: { 
  title: string; 
  description: string; 
  rssUrl: string;
  jsonUrl?: string;
  icon: string;
  color?: string | null;
  featured?: boolean;
}) {
  const [copied, setCopied] = useState<'rss' | 'json' | null>(null);
  const { toast } = useToast();
  const IconComponent = iconMap[icon] || Folder;

  const copyToClipboard = async (url: string, type: 'rss' | 'json') => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(type);
      toast({
        title: "تم النسخ",
        description: "تم نسخ رابط الخلاصة إلى الحافظة",
      });
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast({
        title: "فشل النسخ",
        description: "لم نتمكن من نسخ الرابط",
        variant: "destructive"
      });
    }
  };

  const shareUrl = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${title} - RSS Feed`,
          text: description,
          url: rssUrl
        });
      } catch {
        // User cancelled sharing
      }
    } else {
      copyToClipboard(rssUrl, 'rss');
    }
  };

  return (
    <Card className={`group relative overflow-hidden transition-all duration-300 hover-elevate ${featured ? 'border-primary/30 bg-primary/5' : ''}`}>
      {featured && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-primary/80 to-primary/60" />
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div 
              className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
              style={{ 
                backgroundColor: color ? `${color}20` : 'hsl(var(--primary) / 0.1)',
                color: color || 'hsl(var(--primary))'
              }}
            >
              <IconComponent className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              <CardDescription className="text-sm mt-0.5 line-clamp-1">{description}</CardDescription>
            </div>
          </div>
          {featured && (
            <Badge variant="secondary" className="flex-shrink-0">
              <Sparkles className="h-3 w-3 ml-1" />
              رئيسي
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(rssUrl, 'rss')}
            className="flex-1 min-w-[120px]"
            data-testid={`copy-rss-${title}`}
          >
            {copied === 'rss' ? (
              <Check className="h-4 w-4 ml-1.5 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 ml-1.5" />
            )}
            نسخ RSS
          </Button>
          
          {jsonUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(jsonUrl, 'json')}
              className="flex-1 min-w-[120px]"
              data-testid={`copy-json-${title}`}
            >
              {copied === 'json' ? (
                <Check className="h-4 w-4 ml-1.5 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 ml-1.5" />
              )}
              JSON Feed
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" data-testid={`more-options-${title}`}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={shareUrl}>
                <Share2 className="h-4 w-4 ml-2" />
                مشاركة
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={rssUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 ml-2" />
                  فتح الخلاصة
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

function FeedCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1">
            <Skeleton className="h-5 w-32 mb-1" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-9" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function RssPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const { toast } = useToast();

  const { data: feeds, isLoading, error } = useQuery<FeedsData>({
    queryKey: ['/api/rss/feeds'],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const filteredCategories = useMemo(() => {
    if (!feeds?.categories) return [];
    if (!searchQuery.trim()) return feeds.categories;
    
    const query = searchQuery.toLowerCase();
    return feeds.categories.filter(cat => 
      cat.title.toLowerCase().includes(query) ||
      cat.titleEn.toLowerCase().includes(query) ||
      cat.description.toLowerCase().includes(query)
    );
  }, [feeds?.categories, searchQuery]);

  const downloadOpml = () => {
    const opmlUrl = '/api/rss/feeds.opml';
    const link = document.createElement('a');
    link.href = opmlUrl;
    link.download = 'sabq-feeds.opml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "تم التحميل",
      description: "تم تحميل ملف OPML بنجاح",
    });
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <Link href="/">
              <img 
                src={sabqLogo} 
                alt="سبق الذكية" 
                className="h-8 w-auto cursor-pointer hover:opacity-80 transition-opacity"
              />
            </Link>
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="back-home">
                العودة للرئيسية
                <ArrowRight className="h-4 w-4 mr-1.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-12 md:py-16 lg:py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
              <Rss className="h-4 w-4" />
              <span className="text-sm font-medium">خلاصات RSS</span>
            </div>
            
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
              ابقَ على اطلاع دائم
            </h1>
            
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              اشترك في خلاصات RSS لتلقي آخر الأخبار والتحديثات مباشرة في قارئ الخلاصات المفضل لديك
            </p>

            {/* Quick Stats */}
            <div className="flex flex-wrap justify-center gap-6 mb-8">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                <span>تحديث كل 15 دقيقة</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4 text-primary" />
                <span>متوافق مع جميع القارئات</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4 text-primary" />
                <span>خلاصات فورية</span>
              </div>
            </div>

            {/* Download OPML Button */}
            <Button 
              onClick={downloadOpml}
              size="lg"
              className="gap-2"
              data-testid="download-opml"
            >
              <Download className="h-5 w-5" />
              تحميل جميع الخلاصات (OPML)
            </Button>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Featured Feeds */}
          <div className="mb-10">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              الخلاصات الرئيسية
            </h2>
            
            {isLoading ? (
              <div className="grid md:grid-cols-2 gap-4">
                <FeedCardSkeleton />
                <FeedCardSkeleton />
              </div>
            ) : feeds ? (
              <div className="grid md:grid-cols-2 gap-4">
                <FeedCard
                  title={feeds.main.title}
                  description={feeds.main.description}
                  rssUrl={feeds.main.rss}
                  jsonUrl={feeds.main.json}
                  icon={feeds.main.icon}
                  featured
                />
                <FeedCard
                  title={feeds.audio.title}
                  description={feeds.audio.description}
                  rssUrl={feeds.audio.rss}
                  jsonUrl={feeds.audio.json}
                  icon={feeds.audio.icon}
                  featured
                />
              </div>
            ) : null}
          </div>

          {/* Category Feeds */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Folder className="h-5 w-5 text-primary" />
                خلاصات التصنيفات
              </h2>
              
              <div className="relative max-w-sm">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث عن تصنيف..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                  data-testid="search-categories"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <FeedCardSkeleton key={i} />
                ))}
              </div>
            ) : error ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">حدث خطأ في تحميل الخلاصات</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => window.location.reload()}
                >
                  إعادة المحاولة
                </Button>
              </Card>
            ) : filteredCategories.length === 0 ? (
              <Card className="p-8 text-center">
                <Filter className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {searchQuery ? "لا توجد تصنيفات تطابق بحثك" : "لا توجد تصنيفات متاحة"}
                </p>
              </Card>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCategories.map((category) => (
                  <FeedCard
                    key={category.id}
                    title={category.title}
                    description={category.description}
                    rssUrl={category.rss}
                    icon={category.icon}
                    color={category.color}
                  />
                ))}
              </div>
            )}
          </div>

          {/* How to Subscribe Section */}
          <div className="mt-16">
            <Card className="overflow-hidden">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  كيفية الاشتراك في خلاصات RSS
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid md:grid-cols-3 gap-6">
                  <div className="text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                      <span className="text-xl font-bold">1</span>
                    </div>
                    <h3 className="font-semibold mb-2">اختر قارئ RSS</h3>
                    <p className="text-sm text-muted-foreground">
                      استخدم تطبيقًا مثل Feedly أو Inoreader أو أي قارئ RSS تفضله
                    </p>
                  </div>
                  
                  <div className="text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                      <span className="text-xl font-bold">2</span>
                    </div>
                    <h3 className="font-semibold mb-2">انسخ رابط الخلاصة</h3>
                    <p className="text-sm text-muted-foreground">
                      اختر الخلاصة المناسبة وانسخ الرابط باستخدام زر "نسخ RSS"
                    </p>
                  </div>
                  
                  <div className="text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                      <span className="text-xl font-bold">3</span>
                    </div>
                    <h3 className="font-semibold mb-2">أضف الخلاصة</h3>
                    <p className="text-sm text-muted-foreground">
                      الصق الرابط في قارئ RSS الخاص بك وابدأ بتلقي التحديثات
                    </p>
                  </div>
                </div>

                {/* Popular RSS Readers */}
                <div className="mt-8 pt-6 border-t">
                  <h4 className="font-medium mb-4 text-center">قارئات RSS الشهيرة</h4>
                  <div className="flex flex-wrap justify-center gap-3">
                    <a 
                      href="https://feedly.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-muted hover-elevate transition-colors text-sm"
                    >
                      Feedly
                    </a>
                    <a 
                      href="https://www.inoreader.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-muted hover-elevate transition-colors text-sm"
                    >
                      Inoreader
                    </a>
                    <a 
                      href="https://newsblur.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-muted hover-elevate transition-colors text-sm"
                    >
                      NewsBlur
                    </a>
                    <a 
                      href="https://www.theoldreader.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-muted hover-elevate transition-colors text-sm"
                    >
                      The Old Reader
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
