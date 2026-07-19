import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, ArrowLeftRight, Eye, Copy, Check, Wrench, Clock, Percent } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export default function AdminTools() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Tool 1: Extract Article ID
  const [articleUrl, setArticleUrl] = useState("");
  const [articleId, setArticleId] = useState("");
  const [loadingId, setLoadingId] = useState(false);

  // Tool 2: Create Redirect
  const [oldPath, setOldPath] = useState("");
  const [newPath, setNewPath] = useState("");
  const [loadingRedirect, setLoadingRedirect] = useState(false);

  // Tool 3: Update View Count
  const [viewArticleUrl, setViewArticleUrl] = useState("");
  const [viewCount, setViewCount] = useState("");
  const [loadingViews, setLoadingViews] = useState(false);

  // Tool 4: Update Average Read Time
  const [readTimeArticleUrl, setReadTimeArticleUrl] = useState("");
  const [readTimeSeconds, setReadTimeSeconds] = useState("");
  const [loadingReadTime, setLoadingReadTime] = useState(false);

  // Tool 5: Update Completion Rate
  const [completionArticleUrl, setCompletionArticleUrl] = useState("");
  const [completionRate, setCompletionRate] = useState("");
  const [loadingCompletion, setLoadingCompletion] = useState(false);

  const extractSlugFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      // /article/:slug | /en/article/:slug | /ur/article/:slug
      const articleIdx = pathParts.findIndex((part) => part === 'article');
      if (articleIdx >= 0 && pathParts[articleIdx + 1]) {
        return pathParts[articleIdx + 1];
      }
      return pathParts[pathParts.length - 1] || '';
    } catch {
      const parts = url.split('/').filter(Boolean);
      const articleIdx = parts.findIndex((part) => part === 'article');
      if (articleIdx >= 0 && parts[articleIdx + 1]) {
        return parts[articleIdx + 1];
      }
      return parts[parts.length - 1] || '';
    }
  };

  const extractPathFromUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      if (url.startsWith('/')) return url;
      return '/' + url;
    }
  };

  const handleExtractId = async () => {
    if (!articleUrl.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال رابط الخبر", variant: "destructive" });
      return;
    }

    setLoadingId(true);
    setArticleId("");

    try {
      const slug = extractSlugFromUrl(articleUrl);
      const data = await apiRequest<{ id?: string; title?: string }>(`/api/admin/article-id/${encodeURIComponent(slug)}`);
      
      if (data.id) {
        setArticleId(data.id);
        toast({ title: "تم", description: "تم استخراج معرف الخبر بنجاح" });
      } else {
        toast({ title: "خطأ", description: "لم يتم العثور على الخبر", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في استخراج معرف الخبر", variant: "destructive" });
    } finally {
      setLoadingId(false);
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(articleId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "تم النسخ", description: "تم نسخ المعرف" });
  };

  const handleCreateRedirect = async () => {
    if (!oldPath.trim() || !newPath.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال الرابطين", variant: "destructive" });
      return;
    }

    setLoadingRedirect(true);

    try {
      const oldPathClean = extractPathFromUrl(oldPath);
      const newPathClean = extractPathFromUrl(newPath);

      await apiRequest("/api/admin/legacy-redirects", {
        method: "POST",
        body: JSON.stringify({
          oldPath: oldPathClean,
          newPath: newPathClean,
          redirectType: 301
        })
      });

      toast({ title: "تم", description: `تم إنشاء التحويل من ${oldPathClean} إلى ${newPathClean}` });
      setOldPath("");
      setNewPath("");
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في إنشاء التحويل", variant: "destructive" });
    } finally {
      setLoadingRedirect(false);
    }
  };

  const handleUpdateViews = async () => {
    if (!viewArticleUrl.trim() || !viewCount.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال الرابط وعدد المشاهدات", variant: "destructive" });
      return;
    }

    const views = parseInt(viewCount);
    if (isNaN(views) || views < 0) {
      toast({ title: "خطأ", description: "عدد المشاهدات يجب أن يكون رقماً صحيحاً", variant: "destructive" });
      return;
    }

    setLoadingViews(true);

    try {
      const slug = extractSlugFromUrl(viewArticleUrl);
      await apiRequest("/api/admin/update-views", {
        method: "POST",
        body: JSON.stringify({
          slug,
          viewCount: views
        })
      });

      toast({ title: "تم", description: `تم تحديث عدد المشاهدات إلى ${views.toLocaleString()}` });
      setViewArticleUrl("");
      setViewCount("");
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث عدد المشاهدات", variant: "destructive" });
    } finally {
      setLoadingViews(false);
    }
  };

  const handleUpdateReadTime = async () => {
    if (!readTimeArticleUrl.trim() || !readTimeSeconds.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال الرابط ومتوسط زمن القراءة", variant: "destructive" });
      return;
    }

    const seconds = parseInt(readTimeSeconds, 10);
    if (isNaN(seconds) || seconds < 0) {
      toast({ title: "خطأ", description: "متوسط زمن القراءة يجب أن يكون رقماً صحيحاً بالثواني", variant: "destructive" });
      return;
    }

    setLoadingReadTime(true);

    try {
      const slug = extractSlugFromUrl(readTimeArticleUrl);
      await apiRequest("/api/admin/update-read-time", {
        method: "POST",
        body: JSON.stringify({
          slug,
          avgReadTime: seconds
        })
      });

      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      const formatted = minutes > 0
        ? `${minutes}:${secs.toString().padStart(2, "0")} دقيقة`
        : `${secs} ثانية`;

      toast({ title: "تم", description: `تم تحديث متوسط زمن القراءة إلى ${formatted}` });
      setReadTimeArticleUrl("");
      setReadTimeSeconds("");
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث متوسط زمن القراءة", variant: "destructive" });
    } finally {
      setLoadingReadTime(false);
    }
  };

  const handleUpdateCompletionRate = async () => {
    if (!completionArticleUrl.trim() || !completionRate.trim()) {
      toast({ title: "خطأ", description: "الرجاء إدخال الرابط ونسبة الإكمال", variant: "destructive" });
      return;
    }

    const rate = parseInt(completionRate, 10);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast({ title: "خطأ", description: "نسبة الإكمال يجب أن تكون رقماً بين 0 و 100", variant: "destructive" });
      return;
    }

    setLoadingCompletion(true);

    try {
      const slug = extractSlugFromUrl(completionArticleUrl);
      await apiRequest("/api/admin/update-completion-rate", {
        method: "POST",
        body: JSON.stringify({
          slug,
          completionRate: rate
        })
      });

      toast({ title: "تم", description: `تم تحديث نسبة الإكمال إلى ${rate}%` });
      setCompletionArticleUrl("");
      setCompletionRate("");
    } catch (error) {
      toast({ title: "خطأ", description: "فشل في تحديث نسبة الإكمال", variant: "destructive" });
    } finally {
      setLoadingCompletion(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Wrench}
          title="أدوات الإدارة"
          description="أدوات سريعة لإدارة المحتوى والروابط"
        />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Tool 1: Extract Article ID */}
        <Card data-testid="card-extract-id">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              استخراج معرف الخبر
            </CardTitle>
            <CardDescription>
              أدخل رابط الخبر للحصول على معرفه (ID)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="articleUrl">رابط الخبر</Label>
              <Input
                id="articleUrl"
                placeholder="https://sabq.org/article/..."
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                dir="ltr"
                data-testid="input-article-url"
              />
            </div>
            <Button 
              onClick={handleExtractId} 
              disabled={loadingId}
              className="w-full"
              data-testid="button-extract-id"
            >
              {loadingId ? <Loader2 className="h-4 w-4 animate-spin" /> : "استخراج المعرف"}
            </Button>
            {articleId && (
              <div className="p-3 bg-muted rounded-lg space-y-2">
                <Label className="text-xs text-muted-foreground">معرف الخبر:</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-background p-2 rounded border font-mono break-all" data-testid="text-article-id">
                    {articleId}
                  </code>
                  <Button 
                    size="icon" 
                    variant="outline"
                    onClick={handleCopyId}
                    data-testid="button-copy-id"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tool 2: Create Redirect */}
        <Card data-testid="card-create-redirect">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              إنشاء تحويل
            </CardTitle>
            <CardDescription>
              تحويل رابط قديم إلى رابط جديد (301 Redirect)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="oldPath">الرابط القديم</Label>
              <Input
                id="oldPath"
                placeholder="/saudia/old-slug"
                value={oldPath}
                onChange={(e) => setOldPath(e.target.value)}
                dir="ltr"
                data-testid="input-old-path"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPath">الرابط الجديد</Label>
              <Input
                id="newPath"
                placeholder="/article/new-slug"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                dir="ltr"
                data-testid="input-new-path"
              />
            </div>
            <Button 
              onClick={handleCreateRedirect} 
              disabled={loadingRedirect}
              className="w-full"
              data-testid="button-create-redirect"
            >
              {loadingRedirect ? <Loader2 className="h-4 w-4 animate-spin" /> : "إنشاء التحويل"}
            </Button>
          </CardContent>
        </Card>

        {/* Tool 3: Update View Count */}
        <Card data-testid="card-update-views">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              تعديل المشاهدات
            </CardTitle>
            <CardDescription>
              تعديل عدد مشاهدات خبر معيّن (عربي / إنجليزي / أوردو)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="viewArticleUrl">رابط الخبر</Label>
              <Input
                id="viewArticleUrl"
                placeholder="https://sabq.org/article/... أو /en/article/..."
                value={viewArticleUrl}
                onChange={(e) => setViewArticleUrl(e.target.value)}
                dir="ltr"
                data-testid="input-view-article-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="viewCount">عدد المشاهدات</Label>
              <Input
                id="viewCount"
                type="number"
                placeholder="1000"
                value={viewCount}
                onChange={(e) => setViewCount(e.target.value)}
                dir="ltr"
                data-testid="input-view-count"
              />
            </div>
            <Button 
              onClick={handleUpdateViews} 
              disabled={loadingViews}
              className="w-full"
              data-testid="button-update-views"
            >
              {loadingViews ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحديث المشاهدات"}
            </Button>
          </CardContent>
        </Card>

        {/* Tool 4: Average Read Time */}
        <Card data-testid="card-update-read-time">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              متوسط زمن القراءة
            </CardTitle>
            <CardDescription>
              تعيين متوسط زمن القراءة لخبر معيّن بالثواني (عربي / إنجليزي / أوردو)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="readTimeArticleUrl">رابط الخبر</Label>
              <Input
                id="readTimeArticleUrl"
                placeholder="https://sabq.org/article/... أو /en/article/..."
                value={readTimeArticleUrl}
                onChange={(e) => setReadTimeArticleUrl(e.target.value)}
                dir="ltr"
                data-testid="input-read-time-article-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="readTimeSeconds">متوسط الزمن (ثانية)</Label>
              <Input
                id="readTimeSeconds"
                type="number"
                min={0}
                placeholder="90"
                value={readTimeSeconds}
                onChange={(e) => setReadTimeSeconds(e.target.value)}
                dir="ltr"
                data-testid="input-read-time-seconds"
              />
            </div>
            <Button
              onClick={handleUpdateReadTime}
              disabled={loadingReadTime}
              className="w-full"
              data-testid="button-update-read-time"
            >
              {loadingReadTime ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحديث زمن القراءة"}
            </Button>
          </CardContent>
        </Card>

        {/* Tool 5: Completion Rate */}
        <Card data-testid="card-update-completion-rate">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              نسبة الإكمال
            </CardTitle>
            <CardDescription>
              تعيين نسبة إكمال القراءة لخبر معيّن من 0 إلى 100 (عربي / إنجليزي / أوردو)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="completionArticleUrl">رابط الخبر</Label>
              <Input
                id="completionArticleUrl"
                placeholder="https://sabq.org/article/... أو /en/article/..."
                value={completionArticleUrl}
                onChange={(e) => setCompletionArticleUrl(e.target.value)}
                dir="ltr"
                data-testid="input-completion-article-url"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="completionRate">نسبة الإكمال (%)</Label>
              <Input
                id="completionRate"
                type="number"
                min={0}
                max={100}
                placeholder="75"
                value={completionRate}
                onChange={(e) => setCompletionRate(e.target.value)}
                dir="ltr"
                data-testid="input-completion-rate"
              />
            </div>
            <Button
              onClick={handleUpdateCompletionRate}
              disabled={loadingCompletion}
              className="w-full"
              data-testid="button-update-completion-rate"
            >
              {loadingCompletion ? <Loader2 className="h-4 w-4 animate-spin" /> : "تحديث نسبة الإكمال"}
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
