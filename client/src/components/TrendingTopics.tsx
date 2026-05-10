import { TrendingUp, FileText, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TrendingTopicsProps {
  topics: Array<{ topic: string; count: number; views: number; articles: number; comments: number }>;
}

export function TrendingTopics({ topics }: TrendingTopicsProps) {
  if (!topics || topics.length === 0) return null;

  const maxCount = Math.max(...topics.map(t => t.count));

  const getSizeClass = (count: number) => {
    const ratio = count / maxCount;
    if (ratio > 0.7) return "text-xl font-bold";
    if (ratio > 0.4) return "text-lg font-semibold";
    return "text-base font-medium";
  };

  const formatNumber = (num: number) => {
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6 text-primary" />
        <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-trending-topics">
          موضوعات صاعدة
        </h2>
      </div>
      
      <p className="text-muted-foreground">
        أكثر المواضيع تداولاً بناءً على المشاهدات والتفاعل الفعلي
      </p>

      <div className="flex flex-wrap gap-3 p-6 bg-card rounded-lg border">
        <TooltipProvider delayDuration={200}>
          {topics.map((topic, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <div>
                  <Badge
                    variant="secondary"
                    className={`cursor-pointer hover-elevate ${getSizeClass(topic.count)}`}
                    data-testid={`badge-topic-${index}`}
                  >
                    {topic.topic}
                    <span className="mr-2 text-xs opacity-70">
                      ({formatNumber(topic.articles)})
                    </span>
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs" dir="rtl" side="top">
                <div className="space-y-2">
                  <div className="font-semibold text-sm">{topic.topic}</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3 w-3" />
                      <span>{topic.articles} مقال</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-3 w-3" />
                      <span>{topic.comments} تعليق</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground border-t pt-1 mt-1">
                    نقاط التفاعل: {topic.count.toLocaleString('ar')}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </section>
  );
}
