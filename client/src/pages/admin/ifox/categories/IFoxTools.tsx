import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { IFoxCategoryTemplate } from "@/components/admin/ifox/IFoxCategoryTemplate";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Wrench,
  Plus,
  Star,
  ExternalLink,
  DollarSign,
  Image as ImageIcon,
  Edit,
  Trash2,
  Eye,
  Sparkles,
  MessageSquare,
  FileText,
  Video,
  Mic,
  Code,
  Palette,
  Shield,
  Zap,
  TrendingUp,
  Users,
  Check,
  X,
  Upload
} from "lucide-react";

const toolCategories = [
  { id: "text", label: "توليد النص", icon: FileText },
  { id: "image", label: "توليد الصور", icon: Palette },
  { id: "video", label: "توليد الفيديو", icon: Video },
  { id: "audio", label: "توليد الصوت", icon: Mic },
  { id: "code", label: "مساعد البرمجة", icon: Code },
  { id: "chat", label: "محادثة", icon: MessageSquare },
  { id: "productivity", label: "الإنتاجية", icon: Zap },
  { id: "security", label: "الأمان", icon: Shield },
];

const toolSchema = z.object({
  name: z.string().min(3, "اسم الأداة يجب أن يكون 3 أحرف على الأقل"),
  shortDescription: z.string().min(20, "الوصف المختصر يجب أن يكون 20 حرف على الأقل"),
  fullDescription: z.string().min(50, "الوصف التفصيلي يجب أن يكون 50 حرف على الأقل"),
  category: z.string().min(1, "يرجى اختيار فئة الأداة"),
  pricing: z.enum(["free", "freemium", "paid"]),
  price: z.string().optional(),
  url: z.string().url("يرجى إدخال رابط صالح"),
  rating: z.number().min(1).max(5),
  pros: z.array(z.string()).min(1, "أضف ميزة واحدة على الأقل"),
  cons: z.array(z.string()).min(1, "أضف عيباً واحداً على الأقل"),
  images: z.array(z.string()).optional(),
  featured: z.boolean().default(false),
});

type ToolFormData = z.infer<typeof toolSchema>;

interface AITool {
  id: string;
  name: string;
  shortDescription: string;
  category: string;
  pricing: "free" | "freemium" | "paid";
  price?: string;
  url: string;
  rating: number;
  users: number;
  featured: boolean;
  image?: string;
}

export default function IFoxTools() {
  useRoleProtection("admin");
  const { toast } = useToast();
  
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [prosInput, setProsInput] = useState("");
  const [consInput, setConsInput] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);

  const form = useForm<ToolFormData>({
    resolver: zodResolver(toolSchema),
    defaultValues: {
      name: "",
      shortDescription: "",
      fullDescription: "",
      category: "",
      pricing: "free",
      price: "",
      url: "",
      rating: 4,
      pros: [],
      cons: [],
      images: [],
      featured: false,
    },
  });

  // Fetch tools
  const { data: tools, isLoading } = useQuery<AITool[]>({
    queryKey: ["/api/admin/ifox/tools", selectedCategory],
    queryFn: async () => {
      // Mock data for now
      return [
        {
          id: "1",
          name: "ChatGPT",
          shortDescription: "مساعد ذكاء اصطناعي متقدم للمحادثة والإنتاجية",
          category: "chat",
          pricing: "freemium",
          price: "$20/month",
          url: "https://chat.openai.com",
          rating: 4.8,
          users: 100000000,
          featured: true,
          image: "#",
        },
        {
          id: "2",
          name: "Midjourney",
          shortDescription: "توليد صور احترافية بالذكاء الاصطناعي",
          category: "image",
          pricing: "paid",
          price: "$10/month",
          url: "https://midjourney.com",
          rating: 4.9,
          users: 15000000,
          featured: true,
        },
        {
          id: "3",
          name: "GitHub Copilot",
          shortDescription: "مساعد برمجة بالذكاء الاصطناعي",
          category: "code",
          pricing: "paid",
          price: "$10/month",
          url: "https://github.com/features/copilot",
          rating: 4.6,
          users: 1000000,
          featured: false,
        },
        {
          id: "4",
          name: "Claude",
          shortDescription: "مساعد ذكاء اصطناعي من Anthropic",
          category: "chat",
          pricing: "freemium",
          price: "$20/month",
          url: "https://claude.ai",
          rating: 4.7,
          users: 10000000,
          featured: true,
        },
      ];
    },
  });

  // Save tool mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ToolFormData) => {
      return apiRequest("/api/admin/ifox/tools", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تمت إضافة الأداة بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/tools"] });
      setShowAddDialog(false);
      form.reset();
      setUploadedImages([]);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ الأداة",
        variant: "destructive",
      });
    },
  });

  const handleAddPro = () => {
    if (prosInput.trim()) {
      const currentPros = form.getValues("pros") || [];
      form.setValue("pros", [...currentPros, prosInput.trim()]);
      setProsInput("");
    }
  };

  const handleAddCon = () => {
    if (consInput.trim()) {
      const currentCons = form.getValues("cons") || [];
      form.setValue("cons", [...currentCons, consInput.trim()]);
      setConsInput("");
    }
  };

  const handleRemovePro = (pro: string) => {
    const currentPros = form.getValues("pros") || [];
    form.setValue("pros", currentPros.filter((p) => p !== pro));
  };

  const handleRemoveCon = (con: string) => {
    const currentCons = form.getValues("cons") || [];
    form.setValue("cons", currentCons.filter((c) => c !== con));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // In real implementation, upload to server and get URLs
      const newImages = Array.from(files).map((file) => URL.createObjectURL(file));
      setUploadedImages([...uploadedImages, ...newImages]);
      form.setValue("images", [...uploadedImages, ...newImages]);
    }
  };

  const onSubmit = (data: ToolFormData) => {
    saveMutation.mutate(data);
  };

  const stats = [
    { label: "إجمالي الأدوات", value: tools?.length || 0, icon: Wrench, trend: { value: 15, isPositive: true } },
    { label: "الأدوات المميزة", value: tools?.filter(t => t.featured).length || 0, icon: Star },
    { label: "المستخدمون", value: "2.5M", icon: Users, trend: { value: 22, isPositive: true } },
    { label: "التقييم المتوسط", value: "4.6", icon: TrendingUp },
  ];

  const actions = [
    {
      label: "إضافة أداة",
      icon: Plus,
      onClick: () => setShowAddDialog(true),
      variant: "default" as const,
    },
  ];

  const filteredTools = selectedCategory === "all" 
    ? tools 
    : tools?.filter((tool) => tool.category === selectedCategory);

  return (
    <IFoxCategoryTemplate
      title="AI Tools - الأدوات"
      description="دليل شامل لأدوات الذكاء الاصطناعي"
      icon={Wrench}
      gradient="bg-gradient-to-br from-green-500 to-cyan-600"
      iconColor="text-[hsl(var(--ifox-text-primary))]"
      stats={stats}
      actions={actions}
    >
      {/* Category Filter */}
      <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <Button
              variant={selectedCategory === "all" ? "default" : "ghost"}
              onClick={() => setSelectedCategory("all")}
              className={cn(
                "whitespace-nowrap",
                selectedCategory === "all" 
                  ? "bg-gradient-to-r from-green-500 to-cyan-600" 
                  : "text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
              )}
            >
              الكل
            </Button>
            {toolCategories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Button
                  key={cat.id}
                  variant={selectedCategory === cat.id ? "default" : "ghost"}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    "whitespace-nowrap gap-2",
                    selectedCategory === cat.id 
                      ? "bg-gradient-to-r from-green-500 to-cyan-600" 
                      : "text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {cat.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTools?.map((tool, index) => {
          const categoryData = toolCategories.find((c) => c.id === tool.category);
          const CategoryIcon = categoryData?.icon || Wrench;
          
          return (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg hover:from-[hsl(var(--ifox-surface-overlay)/.15)] hover:to-[hsl(var(--ifox-surface-overlay)/.1)] transition-all duration-300">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-3 rounded-lg bg-gradient-to-br from-green-500/20 to-cyan-500/20">
                        <CategoryIcon className="h-6 w-6 text-green-400" />
                      </div>
                      <div>
                        <CardTitle className="text-[hsl(var(--ifox-text-primary))] text-lg flex items-center gap-2">
                          {tool.name}
                          {tool.featured && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                              <Sparkles className="h-3 w-3 mr-1" />
                              مميز
                            </Badge>
                          )}
                        </CardTitle>
                        <Badge 
                          variant="secondary" 
                          className={cn(
                            "mt-1",
                            tool.pricing === "free" 
                              ? "bg-green-500/20 text-green-400" 
                              : tool.pricing === "freemium"
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-purple-500/20 text-purple-400"
                          )}
                        >
                          {tool.pricing === "free" ? "مجاني" : tool.pricing === "freemium" ? "مجاني محدود" : "مدفوع"}
                          {tool.price && ` - ${tool.price}`}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="text-[hsl(var(--ifox-text-secondary))] text-sm mt-3">
                    {tool.shortDescription}
                  </p>
                </CardHeader>
                
                <CardContent>
                  <div className="space-y-3">
                    {/* Rating */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "h-4 w-4",
                              i < Math.floor(tool.rating)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-[hsl(var(--ifox-text-secondary))]"
                            )}
                          />
                        ))}
                        <span className="text-[hsl(var(--ifox-text-secondary))] text-sm mr-2">
                          {tool.rating}
                        </span>
                      </div>
                      <span className="text-[hsl(var(--ifox-text-secondary))] text-sm">
                        {(tool.users / 1000000).toFixed(1)}M مستخدم
                      </span>
                    </div>

                    {/* Category Badge */}
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-secondary))]">
                        <CategoryIcon className="h-3 w-3 mr-1" />
                        {categoryData?.label}
                      </Badge>
                      <a
                        href={tool.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="pt-0">
                  <div className="flex items-center gap-2 w-full">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      عرض
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      تعديل
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Add Tool Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-3xl bg-slate-900 border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl">إضافة أداة AI جديدة</DialogTitle>
            <DialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              أضف أداة ذكاء اصطناعي جديدة إلى الدليل
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="w-full bg-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <TabsTrigger value="basic" className="flex-1">المعلومات الأساسية</TabsTrigger>
                  <TabsTrigger value="details" className="flex-1">التفاصيل</TabsTrigger>
                  <TabsTrigger value="media" className="flex-1">الوسائط</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4 mt-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>اسم الأداة *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="مثال: ChatGPT"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="shortDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>وصف مختصر *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="وصف قصير يظهر في البطاقة"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="fullDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>وصف تفصيلي *</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={4}
                            placeholder="شرح تفصيلي عن الأداة وإمكانياتها"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الفئة *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                                <SelectValue placeholder="اختر الفئة" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {toolCategories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="pricing"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>نوع السعر *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="free">مجاني</SelectItem>
                              <SelectItem value="freemium">مجاني محدود</SelectItem>
                              <SelectItem value="paid">مدفوع</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>السعر</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="مثال: $20/month"
                              dir="ltr"
                              className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                            />
                          </FormControl>
                          <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                            اتركه فارغاً للأدوات المجانية
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>رابط الأداة *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="url"
                              placeholder="https://..."
                              dir="ltr"
                              className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="rating"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>التقييم (1-5) *</FormLabel>
                        <div className="flex items-center gap-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              type="button"
                              onClick={() => field.onChange(star)}
                              className="focus:outline-none"
                            >
                              <Star
                                className={cn(
                                  "h-6 w-6 transition-colors",
                                  star <= field.value
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-secondary))]"
                                )}
                              />
                            </button>
                          ))}
                          <span className="text-[hsl(var(--ifox-text-secondary))] mr-2">{field.value}</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="details" className="space-y-4 mt-6">
                  {/* Pros */}
                  <div className="space-y-2">
                    <Label>المميزات *</Label>
                    <div className="flex gap-2">
                      <Input
                        value={prosInput}
                        onChange={(e) => setProsInput(e.target.value)}
                        placeholder="أضف ميزة"
                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddPro())}
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                      <Button
                        type="button"
                        onClick={handleAddPro}
                        variant="outline"
                        className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.watch("pros")?.map((pro, index) => (
                        <div key={index} className="flex items-center gap-2 bg-green-500/10 p-2 rounded">
                          <Check className="h-4 w-4 text-green-400" />
                          <span className="flex-1 text-[hsl(var(--ifox-text-primary))]">{pro}</span>
                          <button
                            type="button"
                            onClick={() => handleRemovePro(pro)}
                            className="text-[hsl(var(--ifox-text-secondary))] hover:text-red-400"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Cons */}
                  <div className="space-y-2">
                    <Label>العيوب *</Label>
                    <div className="flex gap-2">
                      <Input
                        value={consInput}
                        onChange={(e) => setConsInput(e.target.value)}
                        placeholder="أضف عيباً"
                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCon())}
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                      <Button
                        type="button"
                        onClick={handleAddCon}
                        variant="outline"
                        className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {form.watch("cons")?.map((con, index) => (
                        <div key={index} className="flex items-center gap-2 bg-red-500/10 p-2 rounded">
                          <X className="h-4 w-4 text-red-400" />
                          <span className="flex-1 text-[hsl(var(--ifox-text-primary))]">{con}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCon(con)}
                            className="text-[hsl(var(--ifox-text-secondary))] hover:text-red-400"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="featured"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border border-[hsl(var(--ifox-surface-overlay)/.1)] p-4 bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                        <div className="space-y-0.5">
                          <FormLabel>أداة مميزة</FormLabel>
                          <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                            سيتم عرض الأداة في قسم المميزات
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Button
                            type="button"
                            variant={field.value ? "default" : "outline"}
                            size="sm"
                            onClick={() => field.onChange(!field.value)}
                            className={field.value ? "bg-amber-500 hover:bg-amber-600" : "border-[hsl(var(--ifox-surface-overlay)/.2)]"}
                          >
                            <Sparkles className="h-4 w-4" />
                          </Button>
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="media" className="space-y-4 mt-6">
                  <div className="space-y-2">
                    <Label>صور الواجهة</Label>
                    <div className="border-2 border-dashed border-[hsl(var(--ifox-surface-overlay)/.2)] rounded-lg p-8 text-center cursor-pointer hover:border-green-400 transition-colors bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        className="hidden"
                        id="image-upload"
                      />
                      <label htmlFor="image-upload" className="cursor-pointer">
                        <Upload className="h-12 w-12 mx-auto text-[hsl(var(--ifox-text-secondary))] mb-3" />
                        <p className="text-[hsl(var(--ifox-text-secondary))]">اضغط لرفع صور الواجهة</p>
                        <p className="text-sm text-[hsl(var(--ifox-text-secondary))] mt-1">PNG, JPG (حد أقصى 10MB)</p>
                      </label>
                    </div>
                    {uploadedImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        {uploadedImages.map((img, index) => (
                          <div key={index} className="relative group">
                            <img
                              src={img}
                              alt={`Upload ${index + 1}`}
                              className="w-full h-24 object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newImages = uploadedImages.filter((_, i) => i !== index);
                                setUploadedImages(newImages);
                                form.setValue("images", newImages);
                              }}
                              className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-4 w-4 text-[hsl(var(--ifox-text-primary))] bg-red-500 rounded-full p-0.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-[hsl(var(--ifox-surface-overlay)/.1)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddDialog(false)}
                  className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="bg-gradient-to-r from-green-500 to-cyan-600 hover:from-green-600 hover:to-cyan-700"
                >
                  {saveMutation.isPending ? "جاري الحفظ..." : "حفظ الأداة"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </IFoxCategoryTemplate>
  );
}