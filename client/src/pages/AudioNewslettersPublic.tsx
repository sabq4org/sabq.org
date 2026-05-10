import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import {
  Grid3X3,
  List,
  Search,
  Play,
  Clock,
  Calendar,
  Headphones,
  Download,
  Share2,
  Rss,
  Filter,
  SortDesc,
  Eye,
  Heart
} from 'lucide-react';
import { formatDistanceToNow, format, startOfWeek, endOfWeek, subDays } from 'date-fns';
import { ar } from 'date-fns/locale';
import type { AudioNewsletter } from '@shared/schema';

interface FilterOptions {
  search: string;
  template: string;
  dateRange: string;
  sortBy: 'latest' | 'popular' | 'duration';
}

export default function AudioNewslettersPublic() {
  const { user } = useAuth();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedNewsletter, setSelectedNewsletter] = useState<AudioNewsletter | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    search: '',
    template: 'all',
    dateRange: 'all',
    sortBy: 'latest'
  });
  const [showFilters, setShowFilters] = useState(false);

  // Fetch newsletters
  const { data, isLoading, error } = useQuery<{
    newsletters: AudioNewsletter[];
    total: number;
    categories: Array<{ template: string; count: number }>;
  }>({
    queryKey: ['/api/audio-newsletters/public', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('status', 'published');
      params.append('limit', '50');
      
      if (filters.search) {
        params.append('search', filters.search);
      }
      if (filters.template !== 'all') {
        params.append('template', filters.template);
      }
      if (filters.sortBy === 'popular') {
        params.append('orderBy', 'listenCount');
      } else if (filters.sortBy === 'duration') {
        params.append('orderBy', 'duration');
      }
      
      // Handle date range
      if (filters.dateRange !== 'all') {
        const now = new Date();
        let startDate: Date;
        
        switch (filters.dateRange) {
          case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            break;
          case 'week':
            startDate = startOfWeek(now, { locale: ar });
            break;
          case 'month':
            startDate = subDays(now, 30);
            break;
          default:
            startDate = subDays(now, 365);
        }
        
        params.append('startDate', startDate.toISOString());
      }
      
      const res = await fetch(`/api/audio-newsletters/public?${params}`);
      if (!res.ok) throw new Error('Failed to fetch newsletters');
      return res.json();
    }
  });

  // Filter newsletters based on client-side filters
  const filteredNewsletters = useMemo(() => {
    if (!data?.newsletters) return [];
    
    let filtered = [...data.newsletters];
    
    // Sort
    if (filters.sortBy === 'popular') {
      filtered.sort((a, b) => (b.listenCount || 0) - (a.listenCount || 0));
    } else if (filters.sortBy === 'duration') {
      filtered.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else {
      filtered.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    }
    
    return filtered;
  }, [data?.newsletters, filters.sortBy]);

  // Template options
  const templateOptions = [
    { value: 'all', label: 'جميع الأنواع' },
    { value: 'morning_brief', label: 'النشرة الصباحية' },
    { value: 'evening_digest', label: 'النشرة المسائية' },
    { value: 'weekly_analysis', label: 'التحليل الأسبوعي' },
    { value: 'breaking_news', label: 'الأخبار العاجلة' },
    { value: 'tech_update', label: 'أخبار التقنية' },
    { value: 'business_report', label: 'التقرير الاقتصادي' },
    { value: 'sport_highlights', label: 'أبرز الأحداث الرياضية' }
  ];

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'غير محدد';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTemplateLabel = (template: string) => {
    const option = templateOptions.find(t => t.value === template);
    return option?.label || template;
  };

  const getTemplateColor = (template: string) => {
    const colors: Record<string, string> = {
      'morning_brief': 'bg-yellow-100 text-yellow-800',
      'evening_digest': 'bg-blue-100 text-blue-800',
      'weekly_analysis': 'bg-purple-100 text-purple-800',
      'breaking_news': 'bg-red-100 text-red-800',
      'tech_update': 'bg-green-100 text-green-800',
      'business_report': 'bg-orange-100 text-orange-800',
      'sport_highlights': 'bg-indigo-100 text-indigo-800'
    };
    return colors[template] || 'bg-gray-100 text-gray-800';
  };

  const handleShare = (newsletter: AudioNewsletter) => {
    if (navigator.share) {
      navigator.share({
        title: newsletter.title,
        text: newsletter.description || '',
        url: `${window.location.origin}/audio/${newsletter.id}`
      });
    } else {
      // Copy to clipboard
      navigator.clipboard.writeText(`${window.location.origin}/audio/${newsletter.id}`);
    }
  };

  const handleDownload = (newsletter: AudioNewsletter) => {
    if (newsletter.audioUrl) {
      const a = document.createElement('a');
      a.href = newsletter.audioUrl;
      a.download = `${newsletter.title}.mp3`;
      a.click();
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col" dir="rtl">
        <Header user={user} />
        <main className="flex-1 bg-background">
          <div className="container mx-auto px-4 py-16">
            <div className="text-center">
              <p className="text-destructive text-lg mb-4">حدث خطأ في تحميل النشرات الصوتية</p>
              <Button onClick={() => window.location.reload()}>إعادة المحاولة</Button>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      <Header user={user} />
      {/* Header */}
      <div className="bg-gradient-to-l from-primary/10 to-accent/10 border-b">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                <Headphones className="h-8 w-8 text-primary" />
                النشرات الصوتية
              </h1>
              <p className="text-muted-foreground">
                استمع إلى أحدث الأخبار والتحليلات الصوتية من سبق
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open('/api/rss/audio-newsletters', '_blank')}
              data-testid="button-rss"
            >
              <Rss className="h-4 w-4 ml-2" />
              RSS Feed
            </Button>
          </div>

          {/* Stats */}
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Headphones className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">{data.total}</p>
                      <p className="text-sm text-muted-foreground">نشرة صوتية</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">
                        {Math.floor((data?.newsletters?.reduce((acc, n) => acc + (n.duration || 0), 0)) / 3600)}
                      </p>
                      <p className="text-sm text-muted-foreground">ساعة من المحتوى</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">
                        {data?.newsletters?.reduce((acc, n) => acc + (n.listenCount || 0), 0)}
                      </p>
                      <p className="text-sm text-muted-foreground">مرة استماع</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-2xl font-bold">يومياً</p>
                      <p className="text-sm text-muted-foreground">نشرات جديدة</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث في النشرات الصوتية..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pr-10"
                data-testid="input-search"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                data-testid="button-filters"
              >
                <Filter className="h-4 w-4 ml-2" />
                فلاتر
              </Button>
              <Select
                value={filters.sortBy}
                onValueChange={(value) => setFilters(prev => ({ ...prev, sortBy: value as any }))}
              >
                <SelectTrigger className="w-[140px]" data-testid="select-sort">
                  <SortDesc className="h-4 w-4 ml-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">الأحدث</SelectItem>
                  <SelectItem value="popular">الأكثر استماعاً</SelectItem>
                  <SelectItem value="duration">الأطول مدة</SelectItem>
                </SelectContent>
              </Select>
              <Tabs value={view} onValueChange={(v) => setView(v as any)}>
                <TabsList>
                  <TabsTrigger value="grid" data-testid="view-grid">
                    <Grid3X3 className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="list" data-testid="view-list">
                    <List className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <Card className="mt-4">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">النوع</label>
                    <Select
                      value={filters.template}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, template: value }))}
                    >
                      <SelectTrigger data-testid="filter-template">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {templateOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">الفترة الزمنية</label>
                    <Select
                      value={filters.dateRange}
                      onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
                    >
                      <SelectTrigger data-testid="filter-date">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع الأوقات</SelectItem>
                        <SelectItem value="today">اليوم</SelectItem>
                        <SelectItem value="week">هذا الأسبوع</SelectItem>
                        <SelectItem value="month">آخر 30 يوم</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => setFilters({
                        search: '',
                        template: 'all',
                        dateRange: 'all',
                        sortBy: 'latest'
                      })}
                      className="w-full"
                      data-testid="button-reset-filters"
                    >
                      إعادة تعيين
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className={cn(
            view === 'grid' 
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "space-y-4"
          )}>
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className={view === 'grid' ? "h-64" : "h-32"} />
            ))}
          </div>
        ) : filteredNewsletters.length === 0 ? (
          <div className="text-center py-16">
            <Headphones className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg text-muted-foreground mb-4">لا توجد نشرات صوتية متاحة</p>
            {filters.search || filters.template !== 'all' || filters.dateRange !== 'all' ? (
              <Button
                variant="outline"
                onClick={() => setFilters({
                  search: '',
                  template: 'all',
                  dateRange: 'all',
                  sortBy: 'latest'
                })}
              >
                إعادة تعيين الفلاتر
              </Button>
            ) : null}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNewsletters.map((newsletter) => (
              <Card
                key={newsletter.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedNewsletter(newsletter)}
                data-testid={`newsletter-card-${newsletter.id}`}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <Badge className={getTemplateColor(newsletter.template)}>
                      {getTemplateLabel(newsletter.template)}
                    </Badge>
                    <Button
                      size="icon"
                      variant="default"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNewsletter(newsletter);
                      }}
                      data-testid={`button-play-${newsletter.id}`}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <h3 className="font-semibold mb-2 line-clamp-2">{newsletter.title}</h3>
                  
                  {newsletter.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">
                      {newsletter.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(newsletter.duration)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {newsletter.listenCount || 0}
                    </span>
                    <span>
                      {newsletter.createdAt && formatDistanceToNow(new Date(newsletter.createdAt), {
                        addSuffix: true,
                        locale: ar
                      })}
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="p-4 pt-0 flex justify-between">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(newsletter);
                    }}
                    data-testid={`button-download-${newsletter.id}`}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShare(newsletter);
                    }}
                    data-testid={`button-share-${newsletter.id}`}
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredNewsletters.map((newsletter) => (
              <Card
                key={newsletter.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedNewsletter(newsletter)}
                data-testid={`newsletter-item-${newsletter.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Button
                      size="icon"
                      variant="default"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedNewsletter(newsletter);
                      }}
                      data-testid={`button-play-${newsletter.id}`}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold line-clamp-1">{newsletter.title}</h3>
                        <Badge className={cn("ml-2 shrink-0", getTemplateColor(newsletter.template))}>
                          {getTemplateLabel(newsletter.template)}
                        </Badge>
                      </div>
                      
                      {newsletter.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {newsletter.description}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(newsletter.duration)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {newsletter.listenCount || 0} استماع
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {newsletter.createdAt && format(new Date(newsletter.createdAt), 'dd/MM/yyyy', { locale: ar })}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(newsletter);
                        }}
                        data-testid={`button-download-${newsletter.id}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(newsletter);
                        }}
                        data-testid={`button-share-${newsletter.id}`}
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Player Dialog */}
      {selectedNewsletter && (
        <Dialog open={!!selectedNewsletter} onOpenChange={() => setSelectedNewsletter(null)}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-xl">{selectedNewsletter.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {selectedNewsletter.description && (
                <p className="text-muted-foreground">{selectedNewsletter.description}</p>
              )}
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Badge className={getTemplateColor(selectedNewsletter.template)}>
                  {getTemplateLabel(selectedNewsletter.template)}
                </Badge>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {formatDuration(selectedNewsletter.duration)}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {selectedNewsletter.listenCount || 0} استماع
                </span>
              </div>
              
              <AudioPlayer
                newsletterId={selectedNewsletter.id}
                audioUrl={selectedNewsletter.audioUrl!}
                title={selectedNewsletter.title}
                duration={selectedNewsletter.duration || undefined}
              />
              
              <div className="flex justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => handleDownload(selectedNewsletter)}
                  data-testid="button-download-dialog"
                >
                  <Download className="h-4 w-4 ml-2" />
                  تحميل
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleShare(selectedNewsletter)}
                  data-testid="button-share-dialog"
                >
                  <Share2 className="h-4 w-4 ml-2" />
                  مشاركة
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Footer />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}