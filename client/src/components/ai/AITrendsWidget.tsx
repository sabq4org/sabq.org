import { motion } from "framer-motion";
import { 
  TrendingUp, 
  Hash, 
  Zap,
  ArrowUpRight,
  Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

interface Trend {
  id: string;
  name: string;
  nameAr?: string;
  count: number;
  growth?: number;
  type: "topic" | "tool" | "technology";
}

interface AITrendsWidgetProps {
  trends?: Trend[];
}

const defaultTrends: Trend[] = [
  { id: "1", name: "GPT-5", nameAr: "جي بي تي 5", count: 234, growth: 45, type: "technology" },
  { id: "2", name: "Claude 3", nameAr: "كلود 3", count: 189, growth: 32, type: "technology" },
  { id: "3", name: "Midjourney V6", nameAr: "ميدجورني 6", count: 156, growth: 28, type: "tool" },
  { id: "4", name: "AI Agents", nameAr: "وكلاء الذكاء", count: 145, growth: 65, type: "topic" },
  { id: "5", name: "RAG Systems", nameAr: "أنظمة RAG", count: 132, growth: 41, type: "technology" },
  { id: "6", name: "AI Safety", nameAr: "أمان AI", count: 98, growth: 12, type: "topic" },
  { id: "7", name: "Gemini Pro", nameAr: "جيميني برو", count: 87, growth: 55, type: "technology" },
  { id: "8", name: "AI Ethics", nameAr: "أخلاقيات AI", count: 76, growth: 8, type: "topic" },
];

const typeColors = {
  topic: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  tool: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  technology: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
};

export default function AITrendsWidget({ trends = defaultTrends }: AITrendsWidgetProps) {
  const { language } = useLanguage();

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-500" />
          {language === "ar" ? "الأكثر رواجاً" : "Trending Now"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {trends.slice(0, 8).map((trend, index) => (
            <motion.div
              key={trend.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="group cursor-pointer"
            >
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-3">
                  {/* Rank */}
                  <div className="w-6 h-6 flex items-center justify-center">
                    {index < 3 ? (
                      <Zap className={`w-4 h-4 ${
                        index === 0 ? "text-yellow-500" :
                        index === 1 ? "text-gray-400" :
                        "text-orange-600"
                      }`} />
                    ) : (
                      <span className="text-xs text-gray-500 font-mono">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* Trend Name */}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <Hash className="w-3 h-3 text-gray-600" />
                      <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
                        {language === "ar" && trend.nameAr ? trend.nameAr : trend.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={`text-xs ${typeColors[trend.type].bg} ${typeColors[trend.type].text} ${typeColors[trend.type].border}`}>
                        {trend.type}
                      </Badge>
                      <span className="text-xs text-gray-500">
                        {trend.count} {language === "ar" ? "مشاركة" : "mentions"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Growth Indicator */}
                {trend.growth && (
                  <div className="flex items-center gap-1">
                    {trend.growth > 30 ? (
                      <Activity className="w-3 h-3 text-green-400" />
                    ) : (
                      <ArrowUpRight className="w-3 h-3 text-gray-400" />
                    )}
                    <span className={`text-xs font-mono ${
                      trend.growth > 30 ? "text-green-400" :
                      trend.growth > 10 ? "text-yellow-400" :
                      "text-gray-400"
                    }`}>
                      +{trend.growth}%
                    </span>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1 mx-2">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(trend.count / trends[0].count) * 100}%` }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className={`h-full ${
                    index === 0 ? "bg-gradient-to-r from-yellow-500 to-orange-500" :
                    index === 1 ? "bg-gradient-to-r from-gray-400 to-gray-500" :
                    index === 2 ? "bg-gradient-to-r from-orange-600 to-red-600" :
                    "bg-gradient-to-r from-blue-600 to-purple-600"
                  }`}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Live Update Indicator */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">
              {language === "ar" ? "تحديث مباشر كل 5 دقائق" : "Live updates every 5 minutes"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}