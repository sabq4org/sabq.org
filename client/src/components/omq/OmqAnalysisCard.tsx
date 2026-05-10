import { motion } from "framer-motion";
import { Link } from "wouter";
import { 
  Brain, 
  Eye, 
  Share2, 
  Download, 
  Calendar, 
  Clock,
  Sparkles,
  ArrowLeft
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DeepAnalysis {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  status: string;
  createdAt: string;
  category?: string;
  viewsCount?: number;
  sharesCount?: number;
  downloadsCount?: number;
  generationTime?: number;
}

interface OmqAnalysisCardProps {
  analysis: DeepAnalysis;
  index?: number;
}

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
  
  if (title.length > 150) {
    title = title.substring(0, 150) + "...";
  }
  
  return title || "تحليل عميق";
};

export default function OmqAnalysisCard({ analysis, index = 0 }: OmqAnalysisCardProps) {
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
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString('en-US');
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('ar-SA-u-ca-gregory', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const statusStyle = getStatusColor(analysis.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      whileHover={{ y: -4 }}
    >
      <Link href={`/omq/${analysis.id}`}>
        <Card 
          className="group bg-slate-900/50 border-slate-800/50 hover:border-indigo-500/30 hover:bg-slate-900/70 transition-all duration-300 cursor-pointer overflow-hidden"
          data-testid={`card-analysis-${analysis.id}`}
        >
          {/* Gradient Top Border */}
          <div className="h-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 opacity-0 group-hover:opacity-100 transition-opacity" />
          
          <CardContent className="p-5">
            {/* Header Row */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Badge 
                  className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border`}
                  data-testid={`badge-status-${analysis.id}`}
                >
                  {getStatusLabel(analysis.status)}
                </Badge>
                {analysis.category && (
                  <Badge 
                    variant="outline" 
                    className="border-slate-700 text-slate-400"
                    data-testid={`badge-category-${analysis.id}`}
                  >
                    {analysis.category}
                  </Badge>
                )}
              </div>
              <motion.div
                className="p-2 rounded-lg bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                whileHover={{ scale: 1.1 }}
              >
                <Brain className="w-4 h-4 text-indigo-400" />
              </motion.div>
            </div>

            {/* Title */}
            <h3 
              className="text-lg font-bold text-white mb-2 line-clamp-2 group-hover:text-indigo-300 transition-colors"
              data-testid={`text-title-${analysis.id}`}
            >
              {cleanTitle(analysis.title)}
            </h3>

            {/* Topic/Description */}
            <p 
              className="text-sm text-gray-400 line-clamp-2 mb-4"
              data-testid={`text-topic-${analysis.id}`}
            >
              {cleanTitle(analysis.topic)}
            </p>

            {/* Keywords */}
            {analysis.keywords && analysis.keywords.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-4">
                {analysis.keywords.slice(0, 3).map((keyword, idx) => (
                  <span 
                    key={idx} 
                    className="text-xs px-2 py-1 rounded-full bg-slate-800/70 text-slate-400 border border-slate-700/50"
                    data-testid={`badge-keyword-${analysis.id}-${idx}`}
                  >
                    {keyword}
                  </span>
                ))}
                {analysis.keywords.length > 3 && (
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-800/70 text-slate-500">
                    +{analysis.keywords.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Metrics Row */}
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
              <div className="flex items-center gap-1.5" data-testid={`metric-views-${analysis.id}`}>
                <Eye className="w-3.5 h-3.5" />
                <span>{formatNumber(analysis.viewsCount)}</span>
              </div>
              <div className="flex items-center gap-1.5" data-testid={`metric-shares-${analysis.id}`}>
                <Share2 className="w-3.5 h-3.5" />
                <span>{formatNumber(analysis.sharesCount)}</span>
              </div>
              <div className="flex items-center gap-1.5" data-testid={`metric-downloads-${analysis.id}`}>
                <Download className="w-3.5 h-3.5" />
                <span>{formatNumber(analysis.downloadsCount)}</span>
              </div>
            </div>

            {/* Footer Row */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800/50">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {analysis.generationTime && (
                  <div className="flex items-center gap-1" data-testid={`metric-time-${analysis.id}`}>
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>{analysis.generationTime}ث</span>
                  </div>
                )}
                <div className="flex items-center gap-1" data-testid={`text-date-${analysis.id}`}>
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(analysis.createdAt)}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-1 text-indigo-400 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <span>عرض التحليل</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
