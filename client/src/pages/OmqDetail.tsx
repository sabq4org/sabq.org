import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import OmqHeader from "@/components/omq/OmqHeader";
import {
  ArrowRight,
  Calendar,
  Clock,
  Folder,
  User,
  Eye,
  Share2,
  Download,
  FileText,
  FileDown,
  Brain,
  TrendingUp,
  Sparkles,
  Bot,
  Layers,
  Zap,
  Home,
} from "lucide-react";

interface DeepAnalysis {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  status: string;
  createdAt: string;
  category?: string;
  categoryName?: string;
  authorId?: string;
  authorName?: string;
  viewsCount?: number;
  sharesCount?: number;
  downloadsCount?: number;
  exportsPdfCount?: number;
  exportsDocxCount?: number;
  generationTime?: number;
  gptAnalysis: string | null;
  geminiAnalysis: string | null;
  claudeAnalysis: string | null;
  mergedAnalysis: string | null;
  executiveSummary: string | null;
  recommendations: string | null;
}

const aiModels = [
  { id: "gpt", name: "GPT-5.1", color: "#22C55E", icon: Bot },
  { id: "gemini", name: "Gemini 3", color: "#8B5CF6", icon: Sparkles },
  { id: "claude", name: "Claude", color: "#F59E0B", icon: Brain },
];

const cleanTitle = (rawTitle: string | null | undefined): string => {
  if (!rawTitle) return "تحليل عميق";
  
  let title = rawTitle;
  
  if (title.includes("📌 العنوان الرئيسي:")) {
    const startIndex = title.indexOf("📌 العنوان الرئيسي:") + "📌 العنوان الرئيسي:".length;
    let endIndex = title.length;
    
    const separatorIndex = title.indexOf("⸻", startIndex);
    const subtitlesIndex = title.indexOf("📰", startIndex);
    const newlineIndex = title.indexOf("\n\n", startIndex);
    
    if (separatorIndex > -1 && separatorIndex < endIndex) endIndex = separatorIndex;
    if (subtitlesIndex > -1 && subtitlesIndex < endIndex) endIndex = subtitlesIndex;
    if (newlineIndex > -1 && newlineIndex < endIndex) endIndex = newlineIndex;
    
    title = title.substring(startIndex, endIndex).trim();
  }
  
  if (title.includes("📰 العناوين الفرعية:")) {
    title = title.split("📰 العناوين الفرعية:")[0].trim();
  }
  if (title.includes("⸻")) {
    title = title.split("⸻")[0].trim();
  }
  
  title = title.replace(/^📌\s*/, "").replace(/العنوان الرئيسي:\s*/gi, "").trim();
  
  if (title.length > 200) {
    title = title.substring(0, 200) + "...";
  }
  
  return title || "تحليل عميق";
};

const formatAnalysisContent = (content: string | null | undefined): string => {
  if (!content) return '';
  
  let html = content;
  
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold text-indigo-400 mt-6 mb-3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold text-purple-400 mt-8 mb-4 pb-2 border-b border-slate-700">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4">$1</h1>');
  
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="text-white font-bold italic">$1</strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em class="text-indigo-300">$1</em>');
  
  html = html.replace(/^(\d+)\.\s+\*\*(.+?)\*\*:?\s*(.*)$/gm, 
    '<div class="flex gap-3 my-3 p-3 bg-slate-800/50 rounded-lg border-r-4 border-indigo-500"><span class="text-indigo-400 font-bold text-lg">$1.</span><div><span class="text-white font-semibold">$2</span><span class="text-gray-300"> $3</span></div></div>');
  
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, 
    '<div class="flex gap-3 my-2"><span class="text-indigo-400 font-bold">$1.</span><span class="text-gray-300">$2</span></div>');
  
  html = html.replace(/^[-•]\s+\*\*(.+?)\*\*:?\s*(.*)$/gm, 
    '<div class="flex gap-3 my-2 pr-4"><span class="text-emerald-400 mt-1">●</span><div><span class="text-white font-semibold">$1</span><span class="text-gray-300"> $2</span></div></div>');
  
  html = html.replace(/^[-•]\s+(.+)$/gm, 
    '<div class="flex gap-3 my-2 pr-4"><span class="text-emerald-400 mt-1">●</span><span class="text-gray-300">$1</span></div>');
  
  html = html.replace(/^[⸻─━]+$/gm, '<hr class="my-6 border-slate-700" />');
  
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inParagraph = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (!trimmed) {
      if (inParagraph) {
        processedLines.push('</p>');
        inParagraph = false;
      }
      processedLines.push('');
      continue;
    }
    
    if (trimmed.startsWith('<h') || trimmed.startsWith('<div') || trimmed.startsWith('<hr')) {
      if (inParagraph) {
        processedLines.push('</p>');
        inParagraph = false;
      }
      processedLines.push(trimmed);
      continue;
    }
    
    if (!inParagraph) {
      processedLines.push('<p class="text-gray-300 leading-relaxed my-3">');
      inParagraph = true;
    }
    processedLines.push(trimmed);
  }
  
  if (inParagraph) {
    processedLines.push('</p>');
  }
  
  return processedLines.join('\n');
};

export default function OmqDetail() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [, params] = useRoute("/omq/:id");
  const analysisId = params?.id;
  const [activeTab, setActiveTab] = useState("unified");
  const [viewRecorded, setViewRecorded] = useState(false);

  const { data: analysis, isLoading, error } = useQuery<DeepAnalysis>({
    queryKey: ['/api/omq/detail', analysisId],
    queryFn: async () => {
      const response = await fetch(`/api/omq/${analysisId}`);
      if (!response.ok) {
        throw new Error('فشل في تحميل التحليل');
      }
      const result = await response.json();
      return result.data || result;
    },
    enabled: !!analysisId,
  });

  useEffect(() => {
    if (analysisId && !viewRecorded) {
      fetch(`/api/omq/${analysisId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ eventType: 'view' })
      }).catch(() => {});
      setViewRecorded(true);
    }
  }, [analysisId, viewRecorded]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'published':
        return { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" };
      case 'draft':
        return { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" };
      case 'archived':
        return { bg: "bg-slate-500/20", text: "text-slate-400", border: "border-slate-500/30" };
      default:
        return { bg: "bg-indigo-500/20", text: "text-indigo-400", border: "border-indigo-500/30" };
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'completed': return 'مكتمل';
      case 'published': return 'منشور';
      case 'draft': return 'مسودة';
      case 'archived': return 'مؤرشف';
      default: return status;
    }
  };

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('en-US');
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('ar-SA-u-ca-gregory', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const recordEvent = async (eventType: string) => {
    if (!analysisId) return;
    try {
      await fetch(`/api/omq/${analysisId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ eventType })
      });
    } catch (error) {}
  };

  const handleShare = async () => {
    await recordEvent('share');
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: analysis?.title,
          text: analysis?.topic,
          url: shareUrl
        });
      } catch (err) {}
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast({
        title: "تم النسخ",
        description: "تم نسخ رابط التحليل إلى الحافظة",
      });
    }
  };

  const handleDownload = async () => {
    await recordEvent('download');
    if (!analysis) return;
    
    const titleClean = cleanTitle(analysis.title);
    const content = `# ${titleClean}\n\n## الموضوع\n${cleanTitle(analysis.topic)}\n\n## الكلمات المفتاحية\n${analysis.keywords.join(', ')}\n\n## التحليل الموحد\n${analysis.mergedAnalysis || 'غير متوفر'}\n\n## تحليل GPT-5.1\n${analysis.gptAnalysis || 'غير متوفر'}\n\n## تحليل Gemini 3\n${analysis.geminiAnalysis || 'غير متوفر'}\n\n## تحليل Claude\n${analysis.claudeAnalysis || 'غير متوفر'}\n\n## الملخص التنفيذي\n${analysis.executiveSummary || 'غير متوفر'}\n\n## التوصيات\n${analysis.recommendations || 'غير متوفر'}`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titleClean.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "تم التنزيل",
      description: "تم تنزيل التحليل بنجاح",
    });
  };

  const handleExportPDF = async () => {
    await recordEvent('export_pdf');
    toast({
      title: "قريباً",
      description: "سيتم إضافة ميزة التصدير إلى PDF قريباً",
    });
  };

  const handleExportWord = async () => {
    await recordEvent('export_docx');
    toast({
      title: "قريباً",
      description: "سيتم إضافة ميزة التصدير إلى Word قريباً",
    });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="max-w-md w-full mx-4 bg-slate-900/50 border-slate-800">
            <CardContent className="py-16 text-center">
              <motion.div
                animate={{
                  y: [0, -10, 0],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-20 h-20 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4"
              >
                <Brain className="w-10 h-10 text-red-400" data-testid="icon-error" />
              </motion.div>
              <h3 className="text-xl font-semibold text-white mb-2" data-testid="text-error-title">
                حدث خطأ
              </h3>
              <p className="text-gray-400 mb-6" data-testid="text-error-description">
                لم نتمكن من تحميل التحليل المطلوب
              </p>
              <Button 
                onClick={() => navigate('/omq')} 
                data-testid="button-back-to-list"
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة للقائمة
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" dir="rtl">
        <OmqHeader />
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Skeleton className="h-10 w-32 mb-4 bg-slate-800" />
          <Skeleton className="h-12 w-3/4 mb-2 bg-slate-800" />
          <Skeleton className="h-6 w-1/2 mb-8 bg-slate-800" />
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[1, 2, 3, 4, 5].map(i => (
              <Card key={i} className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-4">
                  <Skeleton className="h-20 bg-slate-800" />
                </CardContent>
              </Card>
            ))}
          </div>

          <Skeleton className="h-96 w-full bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="max-w-md w-full mx-4 bg-slate-900/50 border-slate-800">
            <CardContent className="py-16 text-center">
              <motion.div
                animate={{
                  y: [0, -10, 0],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="w-20 h-20 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4"
              >
                <Brain className="w-10 h-10 text-indigo-400" data-testid="icon-not-found" />
              </motion.div>
              <h3 className="text-xl font-semibold text-white mb-2" data-testid="text-not-found-title">
                التحليل غير موجود
              </h3>
              <p className="text-gray-400 mb-6" data-testid="text-not-found-description">
                لم نتمكن من العثور على التحليل المطلوب
              </p>
              <Button 
                onClick={() => navigate('/omq')} 
                data-testid="button-back-to-list-notfound"
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
              >
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة للقائمة
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  const statusStyle = getStatusColor(analysis.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" dir="rtl" lang="ar">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-20 -right-20 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl"
          animate={{
            x: [0, 60, 0],
            y: [0, -40, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl"
          animate={{
            x: [0, -60, 0],
            y: [0, 40, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>

      {/* Header */}
      <OmqHeader />

      <div className="container mx-auto px-4 py-8 max-w-7xl relative">
        {/* Back Button & Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-8 gap-4"
        >
          <Button 
            variant="ghost" 
            onClick={() => navigate('/omq')}
            data-testid="button-back"
            className="text-gray-400 hover:text-white hover:bg-indigo-500/20 gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            العودة للقائمة
          </Button>
          
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleShare}
              data-testid="button-share"
              title="مشاركة"
              className="border-slate-700 text-gray-400 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-500/30"
            >
              <Share2 className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleDownload}
              data-testid="button-download"
              title="تنزيل كملف نصي"
              className="border-slate-700 text-gray-400 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-500/30"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleExportPDF}
              data-testid="button-export-pdf"
              title="تصدير PDF"
              className="border-slate-700 text-gray-400 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-500/30"
            >
              <FileText className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon"
              onClick={handleExportWord}
              data-testid="button-export-word"
              title="تصدير Word"
              className="border-slate-700 text-gray-400 hover:text-white hover:bg-indigo-500/20 hover:border-indigo-500/30"
            >
              <FileDown className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>

        {/* Title Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <Badge 
              className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border`}
              data-testid="badge-status"
            >
              {getStatusLabel(analysis.status)}
            </Badge>
            {analysis.categoryName && (
              <Badge 
                variant="outline" 
                className="border-slate-700 text-slate-400"
                data-testid="badge-category"
              >
                {analysis.categoryName}
              </Badge>
            )}
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3" data-testid="text-analysis-title">
            {cleanTitle(analysis.title)}
          </h1>
          <p className="text-lg text-gray-400" data-testid="text-analysis-topic">
            {cleanTitle(analysis.topic)}
          </p>
        </motion.div>

        {/* Metadata Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
        >
          <Card className="bg-slate-900/50 border-slate-800" data-testid="metadata-created">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">تاريخ الإنشاء</p>
                  <p className="text-sm font-medium text-white">{formatDate(analysis.createdAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {analysis.generationTime && (
            <Card className="bg-slate-900/50 border-slate-800" data-testid="metadata-generation-time">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">وقت التوليد</p>
                    <p className="text-sm font-medium text-white">{analysis.generationTime} ثانية</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {analysis.authorName && (
            <Card className="bg-slate-900/50 border-slate-800" data-testid="metadata-author">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">المراسل</p>
                    <p className="text-sm font-medium text-white">{analysis.authorName}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">نماذج AI</p>
                  <p className="text-sm font-medium text-white">3 نماذج</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Metrics Dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8"
        >
          <Card className="bg-slate-900/50 border-slate-800 hover:border-indigo-500/30 transition-colors" data-testid="metric-card-views">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <Eye className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white" data-testid="metric-views-count">
                    {formatNumber(analysis.viewsCount)}
                  </p>
                  <p className="text-xs text-gray-500">مشاهدة</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 hover:border-purple-500/30 transition-colors" data-testid="metric-card-shares">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white" data-testid="metric-shares-count">
                    {formatNumber(analysis.sharesCount)}
                  </p>
                  <p className="text-xs text-gray-500">مشاركة</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 hover:border-emerald-500/30 transition-colors" data-testid="metric-card-downloads">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <Download className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white" data-testid="metric-downloads-count">
                    {formatNumber(analysis.downloadsCount)}
                  </p>
                  <p className="text-xs text-gray-500">تنزيل</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 hover:border-amber-500/30 transition-colors" data-testid="metric-card-pdf">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white" data-testid="metric-pdf-count">
                    {formatNumber(analysis.exportsPdfCount)}
                  </p>
                  <p className="text-xs text-gray-500">PDF</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800 hover:border-cyan-500/30 transition-colors" data-testid="metric-card-word">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center">
                  <FileDown className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white" data-testid="metric-word-count">
                    {formatNumber(analysis.exportsDocxCount)}
                  </p>
                  <p className="text-xs text-gray-500">Word</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Keywords Section */}
        {analysis.keywords && analysis.keywords.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex gap-2 flex-wrap mb-8"
            data-testid="keywords-section"
          >
            {analysis.keywords.map((keyword, idx) => (
              <span 
                key={idx} 
                className="text-sm px-3 py-1.5 rounded-full bg-slate-800/70 text-slate-300 border border-slate-700/50"
                data-testid={`badge-keyword-${idx}`}
              >
                {keyword}
              </span>
            ))}
          </motion.div>
        )}

        {/* Main Content - Tabbed Interface */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl" data-testid="tabs-analysis">
            <TabsList className="bg-slate-900/50 border border-slate-800 mb-6">
              <TabsTrigger 
                value="unified" 
                data-testid="tab-trigger-unified"
                className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
              >
                <Brain className="w-4 h-4 ml-2" />
                التحليل الموحد
              </TabsTrigger>
              <TabsTrigger 
                value="models" 
                data-testid="tab-trigger-models"
                className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
              >
                <Sparkles className="w-4 h-4 ml-2" />
                نماذج AI
              </TabsTrigger>
              <TabsTrigger 
                value="summary" 
                data-testid="tab-trigger-summary"
                className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
              >
                <TrendingUp className="w-4 h-4 ml-2" />
                الملخص
              </TabsTrigger>
            </TabsList>

            {/* Unified Analysis Tab */}
            <TabsContent value="unified" data-testid="tab-content-unified">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="border-b border-slate-800">
                  <CardTitle className="flex items-center gap-2 text-white">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    التحليل الموحد العميق
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {analysis.mergedAnalysis ? (
                    <div 
                      className="prose prose-invert max-w-none"
                      data-testid="content-unified"
                      dangerouslySetInnerHTML={{ __html: formatAnalysisContent(analysis.mergedAnalysis) }}
                    />
                  ) : (
                    <div className="text-center py-16 text-gray-500" data-testid="empty-unified">
                      <Brain className="w-16 h-16 mx-auto mb-4 opacity-50 text-indigo-400/50" />
                      <p>لا يتوفر تحليل موحد</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI Models Tab */}
            <TabsContent value="models" data-testid="tab-content-models">
              <ModelTabs analysis={analysis} />
            </TabsContent>

            {/* Summary Tab */}
            <TabsContent value="summary" data-testid="tab-content-summary">
              <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader className="border-b border-slate-800">
                  <CardTitle className="flex items-center gap-2 text-white">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-cyan-600 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-white" />
                    </div>
                    الملخص التنفيذي
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {analysis.executiveSummary ? (
                    <div 
                      className="prose prose-invert max-w-none"
                      data-testid="content-summary"
                      dangerouslySetInnerHTML={{ __html: formatAnalysisContent(analysis.executiveSummary) }}
                    />
                  ) : (
                    <div className="text-center py-16 text-gray-500" data-testid="empty-summary">
                      <TrendingUp className="w-16 h-16 mx-auto mb-4 opacity-50 text-emerald-400/50" />
                      <p>لا يتوفر ملخص تنفيذي</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recommendations */}
              {analysis.recommendations && (
                <Card className="mt-6 bg-slate-900/50 border-slate-800" data-testid="card-recommendations">
                  <CardHeader className="border-b border-slate-800">
                    <CardTitle className="flex items-center gap-2 text-white">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-white" />
                      </div>
                      التوصيات
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div 
                      className="prose prose-invert max-w-none"
                      data-testid="content-recommendations"
                      dangerouslySetInnerHTML={{ __html: formatAnalysisContent(analysis.recommendations) }}
                    />
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}

function ModelTabs({ analysis }: { analysis: DeepAnalysis }) {
  const [modelTab, setModelTab] = useState("gpt");

  const models = [
    { 
      id: "gpt", 
      name: "GPT-5.1", 
      color: "#22C55E", 
      icon: Bot, 
      content: analysis.gptAnalysis,
      gradient: "from-green-600 to-emerald-600"
    },
    { 
      id: "gemini", 
      name: "Gemini 3", 
      color: "#8B5CF6", 
      icon: Sparkles, 
      content: analysis.geminiAnalysis,
      gradient: "from-purple-600 to-violet-600"
    },
    { 
      id: "claude", 
      name: "Claude", 
      color: "#F59E0B", 
      icon: Brain, 
      content: analysis.claudeAnalysis,
      gradient: "from-amber-600 to-orange-600"
    },
  ];

  const activeModel = models.find(m => m.id === modelTab) || models[0];

  return (
    <Tabs value={modelTab} onValueChange={setModelTab} dir="rtl" className="w-full" data-testid="tabs-models">
      <TabsList className="bg-slate-900/50 border border-slate-800 mb-6">
        {models.map(model => (
          <TabsTrigger 
            key={model.id}
            value={model.id} 
            data-testid={`tab-model-${model.id}`}
            className="data-[state=active]:text-white gap-2"
            style={{ 
              backgroundColor: modelTab === model.id ? model.color : 'transparent'
            }}
          >
            <model.icon className="w-4 h-4" />
            {model.name}
          </TabsTrigger>
        ))}
      </TabsList>

      {models.map(model => (
        <TabsContent key={model.id} value={model.id} data-testid={`tab-content-model-${model.id}`}>
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="border-b border-slate-800">
              <CardTitle className="flex items-center gap-2 text-white">
                <div 
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${model.gradient} flex items-center justify-center`}
                >
                  <model.icon className="w-4 h-4 text-white" />
                </div>
                تحليل {model.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {model.content ? (
                <div 
                  className="prose prose-invert max-w-none"
                  data-testid={`content-${model.id}`}
                  dangerouslySetInnerHTML={{ __html: formatAnalysisContent(model.content) }}
                />
              ) : (
                <div className="text-center py-16 text-gray-500" data-testid={`empty-${model.id}`}>
                  <model.icon className="w-16 h-16 mx-auto mb-4 opacity-50" style={{ color: `${model.color}50` }} />
                  <p>لا يتوفر تحليل من {model.name}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
