import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { IFoxCategoryTemplate } from "@/components/admin/ifox/IFoxCategoryTemplate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  TrendingUp,
  Plus,
  FileText,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Download,
  Share2,
  Eye,
  Edit,
  Trash2,
  Calendar,
  DollarSign,
  Users,
  Zap,
  Target,
  ArrowUp,
  ArrowDown,
  Filter,
  FileDown,
  Layers,
  Globe,
  Cpu,
  Database,
  Cloud,
  Shield,
  Sparkles,
  GraduationCap
} from "lucide-react";

const reportSchema = z.object({
  title: z.string().min(5, "العنوان يجب أن يكون 5 أحرف على الأقل"),
  description: z.string().min(20, "الوصف يجب أن يكون 20 حرف على الأقل"),
  type: z.enum(["analysis", "market", "technical", "research"]),
  template: z.string().optional(),
  dataSource: z.string(),
  charts: z.array(z.object({
    type: z.enum(["line", "bar", "pie", "area"]),
    title: z.string(),
    data: z.any(),
  })).optional(),
  insights: z.array(z.string()).min(1, "أضف رؤية واحدة على الأقل"),
  tags: z.array(z.string()).optional(),
  isPublished: z.boolean().default(false),
});

type ReportFormData = z.infer<typeof reportSchema>;

interface Report {
  id: string;
  title: string;
  description: string;
  type: "analysis" | "market" | "technical" | "research";
  views: number;
  createdAt: string;
  isPublished: boolean;
  author: string;
}

interface ChartData {
  name: string;
  value: number;
  growth?: number;
}

// Mock data for charts
const marketData = [
  { month: "يناير", ai_tools: 1200, users: 4000, revenue: 2400 },
  { month: "فبراير", ai_tools: 1398, users: 4500, revenue: 2210 },
  { month: "مارس", ai_tools: 1800, users: 5200, revenue: 2290 },
  { month: "أبريل", ai_tools: 2100, users: 5900, revenue: 2700 },
  { month: "مايو", ai_tools: 2400, users: 6800, revenue: 3200 },
  { month: "يونيو", ai_tools: 2780, users: 7500, revenue: 3800 },
];

const categoryData = [
  { name: "توليد النص", value: 35, color: "hsl(var(--ifox-accent-primary))" },
  { name: "توليد الصور", value: 28, color: "hsl(var(--ifox-accent-secondary))" },
  { name: "البرمجة", value: 20, color: "hsl(var(--ifox-info))" },
  { name: "المحادثة", value: 12, color: "hsl(var(--ifox-success))" },
  { name: "أخرى", value: 5, color: "hsl(var(--ifox-warning))" },
];

const growthData = [
  { category: "ChatGPT", growth: 45, users: 100000000 },
  { category: "Midjourney", growth: 38, users: 15000000 },
  { category: "Claude", growth: 32, users: 10000000 },
  { category: "Stable Diffusion", growth: 28, users: 5000000 },
  { category: "GitHub Copilot", growth: 25, users: 1000000 },
];

const templates = [
  { id: "market", name: "تحليل السوق", icon: TrendingUp },
  { id: "technical", name: "تقرير تقني", icon: Cpu },
  { id: "research", name: "بحث متقدم", icon: FileText },
  { id: "infographic", name: "انفوجرافيك", icon: Layers },
];

export default function IFoxInsights() {
  useRoleProtection("admin");
  const { toast } = useToast();

  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [insightInput, setInsightInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [selectedChart, setSelectedChart] = useState<"line" | "bar" | "pie" | "area">("line");

  const form = useForm<ReportFormData>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "analysis",
      template: "",
      dataSource: "",
      charts: [],
      insights: [],
      tags: [],
      isPublished: false,
    },
  });

  // Fetch reports
  const { data: reports } = useQuery<Report[]>({
    queryKey: ["/api/admin/ifox/insights/reports"],
    queryFn: async () => {
      // Mock data
      return [
        {
          id: "1",
          title: "تحليل نمو أدوات الذكاء الاصطناعي في 2024",
          description: "دراسة شاملة لنمو وتطور أدوات AI خلال العام",
          type: "analysis",
          views: 1234,
          createdAt: "2024-01-15",
          isPublished: true,
          author: "فريق التحليل",
        },
        {
          id: "2",
          title: "تقرير السوق العربي للذكاء الاصطناعي",
          description: "رؤى حول اعتماد AI في المنطقة العربية",
          type: "market",
          views: 892,
          createdAt: "2024-01-14",
          isPublished: true,
          author: "قسم الأبحاث",
        },
        {
          id: "3",
          title: "مقارنة تقنية: GPT-4 vs Claude 3",
          description: "تحليل تقني مفصل لأحدث نماذج اللغة",
          type: "technical",
          views: 567,
          createdAt: "2024-01-13",
          isPublished: false,
          author: "الفريق التقني",
        },
      ];
    },
  });

  // Save report mutation
  const saveReportMutation = useMutation({
    mutationFn: async (data: ReportFormData) => {
      return apiRequest("/api/admin/ifox/insights/reports", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ التقرير بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/insights/reports"] });
      setShowReportDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ التقرير",
        variant: "destructive",
      });
    },
  });

  const handleAddInsight = () => {
    if (insightInput.trim()) {
      const current = form.getValues("insights") || [];
      form.setValue("insights", [...current, insightInput.trim()]);
      setInsightInput("");
    }
  };

  const handleRemoveInsight = (insight: string) => {
    const current = form.getValues("insights") || [];
    form.setValue("insights", current.filter((i) => i !== insight));
  };

  const handleAddTag = () => {
    if (tagInput.trim()) {
      const current = form.getValues("tags") || [];
      form.setValue("tags", [...current, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleExportPDF = () => {
    toast({
      title: "تصدير PDF",
      description: "جاري تصدير التقرير كملف PDF...",
    });
  };

  const stats = [
    { label: "التقارير المنشورة", value: reports?.filter(r => r.isPublished).length || 0, icon: FileText, trend: { value: 15, isPositive: true } },
    { label: "إجمالي المشاهدات", value: "3.6K", icon: Eye, trend: { value: 22, isPositive: true } },
    { label: "معدل التفاعل", value: "87%", icon: Activity },
    { label: "التقارير هذا الشهر", value: 12, icon: Calendar, trend: { value: 8, isPositive: true } },
  ];

  const actions = [
    {
      label: "تقرير جديد",
      icon: Plus,
      onClick: () => setShowReportDialog(true),
      variant: "default" as const,
    },
  ];

  return (
    <IFoxCategoryTemplate
      title="AI Insights - الرؤى"
      description="تحليلات وتقارير متقدمة حول الذكاء الاصطناعي"
      icon={TrendingUp}
      gradient="bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]"
      iconColor="text-[hsl(var(--ifox-text-primary))]"
      stats={stats}
      actions={actions}
    >
      <div className="space-y-6">
        {/* Live Dashboard */}
        <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-[hsl(var(--ifox-info))]" />
                لوحة التحليلات الحية
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                  onClick={handleExportPDF}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  تصدير PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  مشاركة
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="growth" className="w-full">
              <TabsList className="w-full bg-[hsl(var(--ifox-surface-overlay)/.1)] mb-6">
                <TabsTrigger value="growth" className="flex-1">نمو السوق</TabsTrigger>
                <TabsTrigger value="categories" className="flex-1">التصنيفات</TabsTrigger>
                <TabsTrigger value="comparison" className="flex-1">المقارنات</TabsTrigger>
                <TabsTrigger value="trends" className="flex-1">الاتجاهات</TabsTrigger>
              </TabsList>

              <TabsContent value="growth" className="space-y-4">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={marketData}>
                      <defs>
                        <linearGradient id="colorAI" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--ifox-accent-glow))" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="hsl(var(--ifox-accent-glow))" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--ifox-info-glow))" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="hsl(var(--ifox-info-glow))" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ifox-neutral) / 0.1)" />
                      <XAxis dataKey="month" stroke="hsl(var(--ifox-text-secondary))" />
                      <YAxis stroke="hsl(var(--ifox-text-secondary))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--ifox-surface-muted) / 0.9)', 
                          border: '1px solid hsl(var(--ifox-surface-overlay))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="ai_tools"
                        stroke="hsl(var(--ifox-accent-glow))"
                        fillOpacity={1}
                        fill="url(#colorAI)"
                        name="أدوات AI"
                      />
                      <Area
                        type="monotone"
                        dataKey="users"
                        stroke="hsl(var(--ifox-info-glow))"
                        fillOpacity={1}
                        fill="url(#colorUsers)"
                        name="المستخدمون"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "نمو شهري", value: "+23.5%", icon: TrendingUp, color: "text-[hsl(var(--ifox-success))]" },
                    { label: "مستخدمون جدد", value: "+45.2K", icon: Users, color: "text-[hsl(var(--ifox-info))]" },
                    { label: "إيرادات", value: "$2.3M", icon: DollarSign, color: "text-[hsl(var(--ifox-accent-primary))]" },
                  ].map((metric, index) => {
                    const MetricIcon = metric.icon;
                    return (
                      <Card key={index} className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm text-[hsl(var(--ifox-text-secondary))]">{metric.label}</p>
                              <p className={cn("text-2xl font-bold", metric.color)}>
                                {metric.value}
                              </p>
                            </div>
                            <MetricIcon className={cn("h-8 w-8", metric.color)} />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>

              <TabsContent value="categories" className="space-y-4">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}%`}
                        outerRadius={150}
                        fill="hsl(var(--ifox-info-glow))"
                        dataKey="value"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--ifox-surface-muted) / 0.9)', 
                          border: '1px solid hsl(var(--ifox-surface-overlay))',
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {categoryData.map((cat, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-[hsl(var(--ifox-text-primary))]">{cat.name}</span>
                      </div>
                      <span className="text-[hsl(var(--ifox-text-secondary))]">{cat.value}%</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="comparison" className="space-y-4">
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={growthData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ifox-neutral) / 0.1)" />
                      <XAxis dataKey="category" stroke="hsl(var(--ifox-text-secondary))" />
                      <YAxis stroke="hsl(var(--ifox-text-secondary))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--ifox-surface-muted) / 0.9)', 
                          border: '1px solid hsl(var(--ifox-surface-overlay))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="growth" fill="hsl(var(--ifox-info-glow))" name="النمو %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {growthData.map((tool, index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.05)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-colors">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">#{index + 1}</span>
                      <div>
                        <p className="text-[hsl(var(--ifox-text-primary))] font-medium">{tool.category}</p>
                        <p className="text-xs text-[hsl(var(--ifox-text-secondary))]">{(tool.users / 1000000).toFixed(1)}M مستخدم</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tool.growth > 30 ? (
                        <ArrowUp className="h-4 w-4 text-[hsl(var(--ifox-success))]" />
                      ) : (
                        <ArrowDown className="h-4 w-4 text-[hsl(var(--ifox-error))]" />
                      )}
                      <span className={cn(
                        "text-sm font-medium",
                        tool.growth > 30 ? "text-[hsl(var(--ifox-success))]" : "text-[hsl(var(--ifox-error))]"
                      )}>
                        {tool.growth}%
                      </span>
                    </div>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="trends" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { title: "AI في التعليم", trend: "+156%", icon: GraduationCap, color: "bg-[hsl(var(--ifox-accent-primary)/.2)] text-[hsl(var(--ifox-accent-primary))]" },
                    { title: "AI في الصحة", trend: "+89%", icon: Shield, color: "bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))]" },
                    { title: "AI في الأعمال", trend: "+234%", icon: Target, color: "bg-[hsl(var(--ifox-info)/.2)] text-[hsl(var(--ifox-info))]" },
                    { title: "AI في الإبداع", trend: "+178%", icon: Sparkles, color: "bg-[hsl(var(--ifox-accent-secondary)/.2)] text-[hsl(var(--ifox-accent-secondary))]" },
                  ].map((trend, index) => {
                    const TrendIcon = trend.icon;
                    return (
                      <Card key={index} className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3">
                            <div className={cn("p-3 rounded-lg", trend.color)}>
                              <TrendIcon className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-[hsl(var(--ifox-text-secondary))]">{trend.title}</p>
                              <p className="text-xl font-bold text-[hsl(var(--ifox-text-primary))]">{trend.trend}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-info)/.2)] to-[hsl(var(--ifox-accent-primary)/.1)] border-[hsl(var(--ifox-info)/.3)]">
                  <CardContent className="p-6">
                    <h3 className="text-[hsl(var(--ifox-text-primary))] font-bold mb-3 flex items-center gap-2">
                      <Zap className="h-5 w-5 text-[hsl(var(--ifox-info))]" />
                      توقعات 2024
                    </h3>
                    <ul className="space-y-2 text-[hsl(var(--ifox-text-primary))]">
                      <li className="flex items-start gap-2">
                        <span className="text-[hsl(var(--ifox-info))] mt-1">•</span>
                        نمو متوقع بنسبة 300% في استخدام AI في المنطقة العربية
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[hsl(var(--ifox-info))] mt-1">•</span>
                        ظهور 50+ أداة AI جديدة متخصصة باللغة العربية
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[hsl(var(--ifox-info))] mt-1">•</span>
                        استثمارات بقيمة $500M في شركات AI عربية
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Reports Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports?.map((report, index) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg hover:from-[hsl(var(--ifox-surface-overlay)/.15)] hover:to-[hsl(var(--ifox-surface-overlay)/.1)] transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-[hsl(var(--ifox-text-primary))] text-lg line-clamp-2">
                      {report.title}
                    </CardTitle>
                    <Badge 
                      className={cn(
                        report.isPublished 
                          ? "bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))]"
                          : "bg-[hsl(var(--ifox-warning)/.2)] text-[hsl(var(--ifox-warning))]"
                      )}
                    >
                      {report.isPublished ? "منشور" : "مسودة"}
                    </Badge>
                  </div>
                  <p className="text-sm text-[hsl(var(--ifox-text-secondary))] mt-2 line-clamp-2">
                    {report.description}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-xs text-[hsl(var(--ifox-text-secondary))] mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(report.createdAt).toLocaleDateString("ar")}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {report.views} مشاهدة
                    </span>
                  </div>
                  
                  <Badge 
                    variant="outline" 
                    className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-secondary))] mb-3"
                  >
                    {report.type === "analysis" ? "تحليل" : 
                     report.type === "market" ? "سوق" :
                     report.type === "technical" ? "تقني" : "بحث"}
                  </Badge>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1 bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] hover:from-[hsl(var(--ifox-accent-primary)/.9)] hover:to-[hsl(var(--ifox-accent-secondary)/.9)]"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      عرض
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[hsl(var(--ifox-error))] hover:bg-[hsl(var(--ifox-error)/.1)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Quick Templates */}
        <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
          <CardHeader>
            <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
              <Layers className="h-5 w-5 text-[hsl(var(--ifox-info))]" />
              قوالب سريعة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {templates.map((template) => {
                const TemplateIcon = template.icon;
                return (
                  <button
                    key={template.id}
                    onClick={() => {
                      setSelectedTemplate(template.id);
                      setShowReportDialog(true);
                    }}
                    className="p-4 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.05)] border border-[hsl(var(--ifox-surface-overlay)/.1)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-all group"
                  >
                    <TemplateIcon className="h-8 w-8 text-[hsl(var(--ifox-info))] mx-auto mb-2 group-hover:scale-110 transition-transform" />
                    <p className="text-[hsl(var(--ifox-text-primary))] text-sm">{template.name}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </IFoxCategoryTemplate>
  );
}