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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  PenLine,
  Plus,
  User,
  Calendar,
  Eye,
  MessageCircle,
  Heart,
  Share2,
  Twitter,
  Linkedin,
  Github,
  Globe,
  Mail,
  Edit,
  Trash2,
  Star,
  TrendingUp,
  Award,
  BookOpen,
  Tag,
  ThumbsUp,
  Clock,
  Send,
  Save,
  X,
  UserCheck,
  Briefcase,
  GraduationCap,
  Quote
} from "lucide-react";
import { SiTwitter, SiLinkedin, SiGithub } from "react-icons/si";

const opinionSchema = z.object({
  title: z.string().min(10, "العنوان يجب أن يكون 10 أحرف على الأقل"),
  content: z.string().min(100, "المحتوى يجب أن يكون 100 حرف على الأقل"),
  excerpt: z.string().min(20, "المقتطف يجب أن يكون 20 حرف على الأقل"),
  authorId: z.string().min(1, "يرجى اختيار الكاتب"),
  category: z.enum(["technology", "ethics", "future", "education", "business", "society"]),
  tags: z.array(z.string()).min(1, "أضف وسماً واحداً على الأقل"),
  featuredImage: z.string().optional(),
  allowComments: z.boolean().default(true),
  isPinned: z.boolean().default(false),
  status: z.enum(["draft", "published", "scheduled"]).default("draft"),
});

const authorSchema = z.object({
  name: z.string().min(3, "الاسم يجب أن يكون 3 أحرف على الأقل"),
  title: z.string().min(5, "المسمى الوظيفي يجب أن يكون 5 أحرف على الأقل"),
  bio: z.string().min(50, "السيرة الذاتية يجب أن تكون 50 حرف على الأقل"),
  avatar: z.string().optional(),
  email: z.string().email("بريد إلكتروني غير صالح"),
  specialization: z.string(),
  experience: z.string(),
  socialLinks: z.object({
    twitter: z.string().url().optional().or(z.literal("")),
    linkedin: z.string().url().optional().or(z.literal("")),
    github: z.string().url().optional().or(z.literal("")),
    website: z.string().url().optional().or(z.literal("")),
  }),
  isVerified: z.boolean().default(false),
});

type OpinionFormData = z.infer<typeof opinionSchema>;
type AuthorFormData = z.infer<typeof authorSchema>;

interface Opinion {
  id: string;
  title: string;
  excerpt: string;
  author: {
    name: string;
    title: string;
    avatar?: string;
    isVerified: boolean;
  };
  category: string;
  views: number;
  likes: number;
  comments: number;
  publishDate: string;
  status: "draft" | "published" | "scheduled";
  isPinned: boolean;
}

interface Author {
  id: string;
  name: string;
  title: string;
  avatar?: string;
  specialization: string;
  articles: number;
  followers: number;
  isVerified: boolean;
}

const categories = [
  { value: "technology", label: "التكنولوجيا", color: "bg-blue-500/20 text-blue-400" },
  { value: "ethics", label: "الأخلاقيات", color: "bg-purple-500/20 text-purple-400" },
  { value: "future", label: "المستقبل", color: "bg-green-500/20 text-green-400" },
  { value: "education", label: "التعليم", color: "bg-amber-500/20 text-amber-400" },
  { value: "business", label: "الأعمال", color: "bg-red-500/20 text-red-400" },
  { value: "society", label: "المجتمع", color: "bg-pink-500/20 text-pink-400" },
];

export default function IFoxOpinions() {
  useRoleProtection("admin");
  const { toast } = useToast();

  const [showOpinionDialog, setShowOpinionDialog] = useState(false);
  const [showAuthorDialog, setShowAuthorDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState("published");
  const [tagInput, setTagInput] = useState("");
  const [selectedOpinion, setSelectedOpinion] = useState<Opinion | null>(null);

  const opinionForm = useForm<OpinionFormData>({
    resolver: zodResolver(opinionSchema),
    defaultValues: {
      title: "",
      content: "",
      excerpt: "",
      authorId: "",
      category: "technology",
      tags: [],
      allowComments: true,
      isPinned: false,
      status: "draft",
    },
  });

  const authorForm = useForm<AuthorFormData>({
    resolver: zodResolver(authorSchema),
    defaultValues: {
      name: "",
      title: "",
      bio: "",
      email: "",
      specialization: "",
      experience: "",
      socialLinks: {
        twitter: "",
        linkedin: "",
        github: "",
        website: "",
      },
      isVerified: false,
    },
  });

  // Fetch opinions
  const { data: opinions } = useQuery<Opinion[]>({
    queryKey: ["/api/admin/ifox/opinions", selectedTab],
    queryFn: async () => {
      // Mock data
      return [
        {
          id: "1",
          title: "لماذا يجب على الشركات العربية الاستثمار في الذكاء الاصطناعي الآن",
          excerpt: "تحليل عميق للفرص المتاحة والتحديات التي تواجه الشركات العربية في تبني تقنيات AI",
          author: {
            name: "د. محمد الشمري",
            title: "خبير استراتيجيات الذكاء الاصطناعي",
            avatar: "#",
            isVerified: true,
          },
          category: "business",
          views: 2341,
          likes: 234,
          comments: 56,
          publishDate: "2024-01-15",
          status: "published",
          isPinned: true,
        },
        {
          id: "2",
          title: "أخلاقيات الذكاء الاصطناعي: بين الابتكار والمسؤولية",
          excerpt: "نظرة نقدية على التحديات الأخلاقية في تطوير واستخدام تقنيات AI",
          author: {
            name: "أ. سارة الكعبي",
            title: "باحثة في أخلاقيات التكنولوجيا",
            isVerified: true,
          },
          category: "ethics",
          views: 1856,
          likes: 189,
          comments: 42,
          publishDate: "2024-01-14",
          status: "published",
          isPinned: false,
        },
        {
          id: "3",
          title: "مستقبل التعليم مع AI: رؤية 2030",
          excerpt: "كيف ستغير تقنيات الذكاء الاصطناعي طريقة التعليم والتعلم",
          author: {
            name: "د. فاطمة العلي",
            title: "أستاذة تكنولوجيا التعليم",
            isVerified: false,
          },
          category: "education",
          views: 1234,
          likes: 156,
          comments: 28,
          publishDate: "2024-01-13",
          status: "draft",
          isPinned: false,
        },
      ];
    },
  });

  // Fetch authors
  const { data: authors } = useQuery<Author[]>({
    queryKey: ["/api/admin/ifox/opinions/authors"],
    queryFn: async () => {
      // Mock data
      return [
        {
          id: "1",
          name: "د. محمد الشمري",
          title: "خبير استراتيجيات الذكاء الاصطناعي",
          avatar: "#",
          specialization: "AI Strategy & Business Transformation",
          articles: 23,
          followers: 5432,
          isVerified: true,
        },
        {
          id: "2",
          name: "أ. سارة الكعبي",
          title: "باحثة في أخلاقيات التكنولوجيا",
          specialization: "AI Ethics & Responsible Innovation",
          articles: 18,
          followers: 3210,
          isVerified: true,
        },
        {
          id: "3",
          name: "د. فاطمة العلي",
          title: "أستاذة تكنولوجيا التعليم",
          specialization: "EdTech & AI in Education",
          articles: 12,
          followers: 2156,
          isVerified: false,
        },
      ];
    },
  });

  // Save opinion mutation
  const saveOpinionMutation = useMutation({
    mutationFn: async (data: OpinionFormData) => {
      return apiRequest("/api/admin/ifox/opinions", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ المقال الرأيي بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/opinions"] });
      setShowOpinionDialog(false);
      opinionForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ المقال",
        variant: "destructive",
      });
    },
  });

  // Save author mutation
  const saveAuthorMutation = useMutation({
    mutationFn: async (data: AuthorFormData) => {
      return apiRequest("/api/admin/ifox/opinions/authors", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تمت إضافة الكاتب بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/opinions/authors"] });
      setShowAuthorDialog(false);
      authorForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إضافة الكاتب",
        variant: "destructive",
      });
    },
  });

  const handleAddTag = () => {
    if (tagInput.trim()) {
      const currentTags = opinionForm.getValues("tags") || [];
      opinionForm.setValue("tags", [...currentTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    const currentTags = opinionForm.getValues("tags") || [];
    opinionForm.setValue("tags", currentTags.filter((t) => t !== tag));
  };

  const stats = [
    { label: "المقالات المنشورة", value: opinions?.filter(o => o.status === "published").length || 0, icon: PenLine, trend: { value: 8, isPositive: true } },
    { label: "الكُتّاب", value: authors?.length || 0, icon: User },
    { label: "إجمالي المشاهدات", value: "8.9K", icon: Eye, trend: { value: 15, isPositive: true } },
    { label: "التفاعلات", value: "1.2K", icon: Heart, trend: { value: 22, isPositive: true } },
  ];

  const actions = [
    {
      label: "مقال جديد",
      icon: Plus,
      onClick: () => setShowOpinionDialog(true),
      variant: "default" as const,
    },
    {
      label: "إضافة كاتب",
      icon: UserCheck,
      onClick: () => setShowAuthorDialog(true),
      variant: "outline" as const,
    },
  ];

  return (
    <IFoxCategoryTemplate
      title="AI Opinions - الآراء"
      description="مقالات رأيية وتحليلات من خبراء الذكاء الاصطناعي"
      icon={PenLine}
      gradient="bg-gradient-to-br from-red-500 to-orange-600"
      iconColor="text-[hsl(var(--ifox-text-primary))]"
      stats={stats}
      actions={actions}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardContent className="p-0">
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
                <TabsList className="w-full bg-[hsl(var(--ifox-surface-overlay)/.1)] rounded-t-lg rounded-b-none">
                  <TabsTrigger value="published" className="flex-1">منشور</TabsTrigger>
                  <TabsTrigger value="drafts" className="flex-1">مسودات</TabsTrigger>
                  <TabsTrigger value="scheduled" className="flex-1">مجدول</TabsTrigger>
                </TabsList>

                <TabsContent value="published" className="p-6 space-y-4">
                  {opinions?.filter(o => o.status === "published").map((opinion, index) => {
                    const categoryConfig = categories.find(c => c.value === opinion.category);
                    return (
                      <motion.div
                        key={opinion.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-colors">
                          <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={opinion.author.avatar} />
                                <AvatarFallback className="bg-red-500/20 text-red-400">
                                  {opinion.author.name[0]}
                                </AvatarFallback>
                              </Avatar>
                              
                              <div className="flex-1">
                                <div className="flex items-start justify-between mb-3">
                                  <div>
                                    <h3 className="text-lg font-bold text-[hsl(var(--ifox-text-primary))] mb-1 line-clamp-2">
                                      {opinion.isPinned && <Star className="inline h-4 w-4 text-amber-400 mr-2" />}
                                      {opinion.title}
                                    </h3>
                                    <p className="text-[hsl(var(--ifox-text-secondary))] text-sm line-clamp-2">
                                      {opinion.excerpt}
                                    </p>
                                  </div>
                                  {categoryConfig && (
                                    <Badge className={categoryConfig.color}>
                                      {categoryConfig.label}
                                    </Badge>
                                  )}
                                </div>

                                {/* Author Info */}
                                <div className="flex items-center gap-2 mb-3">
                                  <span className="text-[hsl(var(--ifox-text-primary))] font-medium text-sm">
                                    {opinion.author.name}
                                  </span>
                                  {opinion.author.isVerified && (
                                    <UserCheck className="h-3 w-3 text-blue-400" />
                                  )}
                                  <span className="text-[hsl(var(--ifox-text-secondary))] text-xs">•</span>
                                  <span className="text-[hsl(var(--ifox-text-secondary))] text-xs">
                                    {opinion.author.title}
                                  </span>
                                </div>

                                {/* Stats & Actions */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4 text-xs text-[hsl(var(--ifox-text-secondary))]">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(opinion.publishDate).toLocaleDateString("ar")}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      {opinion.views}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3" />
                                      {opinion.likes}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <MessageCircle className="h-3 w-3" />
                                      {opinion.comments}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-primary))]">
                                      <Share2 className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-primary))]">
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-[hsl(var(--ifox-text-secondary))] hover:text-red-400">
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </TabsContent>

                <TabsContent value="drafts" className="p-6 space-y-4">
                  {opinions?.filter(o => o.status === "draft").map((opinion, index) => (
                    <motion.div
                      key={opinion.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-[hsl(var(--ifox-text-primary))] font-medium">{opinion.title}</h4>
                            <Badge className="bg-amber-500/20 text-amber-400">مسودة</Badge>
                          </div>
                          <p className="text-sm text-[hsl(var(--ifox-text-secondary))] mb-3">{opinion.excerpt}</p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-[hsl(var(--ifox-text-secondary))]">
                              آخر تعديل: {new Date(opinion.publishDate).toLocaleDateString("ar")}
                            </span>
                            <Button size="sm" variant="outline" className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]">
                              <Edit className="h-3 w-3 mr-2" />
                              تعديل
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </TabsContent>

                <TabsContent value="scheduled" className="p-6">
                  <div className="text-center py-8">
                    <Calendar className="h-12 w-12 text-[hsl(var(--ifox-text-secondary))] mx-auto mb-3" />
                    <p className="text-[hsl(var(--ifox-text-secondary))]">لا توجد مقالات مجدولة</p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Featured Opinion */}
          {opinions?.find(o => o.isPinned) && (
            <Card className="bg-gradient-to-br from-red-500/20 to-orange-500/10 border-red-500/30">
              <CardHeader>
                <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-400" />
                  مقال مميز
                </CardTitle>
              </CardHeader>
              <CardContent>
                <h3 className="text-xl font-bold text-[hsl(var(--ifox-text-primary))] mb-2">
                  {opinions.find(o => o.isPinned)?.title}
                </h3>
                <p className="text-[hsl(var(--ifox-text-primary))] mb-4">
                  {opinions.find(o => o.isPinned)?.excerpt}
                </p>
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={opinions.find(o => o.isPinned)?.author.avatar} />
                    <AvatarFallback className="bg-red-500/20 text-red-400">
                      {opinions.find(o => o.isPinned)?.author.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-[hsl(var(--ifox-text-primary))] font-medium">{opinions.find(o => o.isPinned)?.author.name}</p>
                    <p className="text-[hsl(var(--ifox-text-secondary))] text-sm">{opinions.find(o => o.isPinned)?.author.title}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Top Authors */}
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <Award className="h-5 w-5 text-red-400" />
                كُتّاب مميزون
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {authors?.slice(0, 3).map((author) => (
                  <div key={author.id} className="flex items-start gap-3">
                    <Avatar>
                      <AvatarImage src={author.avatar} />
                      <AvatarFallback className="bg-red-500/20 text-red-400">
                        {author.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-1">
                        <h4 className="text-sm font-medium text-[hsl(var(--ifox-text-primary))]">{author.name}</h4>
                        {author.isVerified && <UserCheck className="h-3 w-3 text-blue-400" />}
                      </div>
                      <p className="text-xs text-[hsl(var(--ifox-text-secondary))]">{author.specialization}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[hsl(var(--ifox-text-secondary))]">
                        <span>{author.articles} مقال</span>
                        <span>{author.followers} متابع</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Popular Categories */}
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <Tag className="h-5 w-5 text-red-400" />
                التصنيفات الشائعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categories.map((cat) => {
                  const count = opinions?.filter(o => o.category === cat.value).length || 0;
                  return (
                    <div
                      key={cat.value}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-[hsl(var(--ifox-surface-overlay)/.05)] transition-colors"
                    >
                      <Badge className={cat.color}>{cat.label}</Badge>
                      <span className="text-xs text-[hsl(var(--ifox-text-secondary))]">{count} مقال</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Quote of the Day */}
          <Card className="bg-gradient-to-br from-red-500/20 to-orange-500/10 border-red-500/30">
            <CardContent className="p-6">
              <Quote className="h-8 w-8 text-red-400 mb-3" />
              <blockquote className="text-[hsl(var(--ifox-text-primary))] italic mb-3">
                "الذكاء الاصطناعي ليس مجرد أداة، بل شريك في بناء المستقبل"
              </blockquote>
              <cite className="text-[hsl(var(--ifox-text-secondary))] text-sm">— د. محمد الشمري</cite>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Opinion Dialog */}
      <Dialog open={showOpinionDialog} onOpenChange={setShowOpinionDialog}>
        <DialogContent className="max-w-3xl bg-slate-900 border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl">إضافة مقال رأيي جديد</DialogTitle>
            <DialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              اكتب مقالاً رأيياً حول موضوع في الذكاء الاصطناعي
            </DialogDescription>
          </DialogHeader>

          <Form {...opinionForm}>
            <form onSubmit={opinionForm.handleSubmit(data => saveOpinionMutation.mutate(data))} className="space-y-6">
              <Tabs defaultValue="content" className="w-full">
                <TabsList className="w-full bg-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <TabsTrigger value="content" className="flex-1">المحتوى</TabsTrigger>
                  <TabsTrigger value="metadata" className="flex-1">البيانات</TabsTrigger>
                  <TabsTrigger value="settings" className="flex-1">الإعدادات</TabsTrigger>
                </TabsList>

                <TabsContent value="content" className="space-y-4 mt-6">
                  <FormField
                    control={opinionForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>عنوان المقال *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="عنوان جذاب ومعبر"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={opinionForm.control}
                    name="excerpt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>المقتطف *</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={3}
                            placeholder="مقتطف قصير يظهر في البطاقة"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                        <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                          سيظهر هذا في معاينة المقال
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={opinionForm.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>المحتوى *</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={10}
                            placeholder="اكتب محتوى المقال هنا..."
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))] font-mono"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="metadata" className="space-y-4 mt-6">
                  <FormField
                    control={opinionForm.control}
                    name="authorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الكاتب *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                              <SelectValue placeholder="اختر الكاتب" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {authors?.map((author) => (
                              <SelectItem key={author.id} value={author.id}>
                                {author.name} - {author.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={opinionForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>التصنيف *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.value} value={cat.value}>
                                {cat.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Tags */}
                  <div className="space-y-2">
                    <Label>الوسوم *</Label>
                    <div className="flex gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="أضف وسماً"
                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                      <Button
                        type="button"
                        onClick={handleAddTag}
                        variant="outline"
                        className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {opinionForm.watch("tags")?.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="bg-red-500/20 text-[hsl(var(--ifox-text-primary))] border-red-500/30"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 hover:text-red-400"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 mt-6">
                  <FormField
                    control={opinionForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الحالة</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">مسودة</SelectItem>
                            <SelectItem value="published">منشور</SelectItem>
                            <SelectItem value="scheduled">مجدول</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={opinionForm.control}
                    name="allowComments"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border border-[hsl(var(--ifox-surface-overlay)/.1)] p-4 bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                        <div className="space-y-0.5">
                          <FormLabel>السماح بالتعليقات</FormLabel>
                          <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                            السماح للقراء بالتعليق على المقال
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="border-[hsl(var(--ifox-surface-overlay)/.2)]"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={opinionForm.control}
                    name="isPinned"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border border-[hsl(var(--ifox-surface-overlay)/.1)] p-4 bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                        <div className="space-y-0.5">
                          <FormLabel>تثبيت المقال</FormLabel>
                          <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                            عرض المقال في القسم المميز
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="border-[hsl(var(--ifox-surface-overlay)/.2)]"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-[hsl(var(--ifox-surface-overlay)/.1)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowOpinionDialog(false)}
                  className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    opinionForm.setValue("status", "draft");
                    opinionForm.handleSubmit(data => saveOpinionMutation.mutate(data))();
                  }}
                  className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  <Save className="h-4 w-4 mr-2" />
                  حفظ كمسودة
                </Button>
                <Button
                  type="submit"
                  disabled={saveOpinionMutation.isPending}
                  className="bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {saveOpinionMutation.isPending ? "جاري النشر..." : "نشر المقال"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Author Dialog */}
      <Dialog open={showAuthorDialog} onOpenChange={setShowAuthorDialog}>
        <DialogContent className="max-w-2xl bg-slate-900 border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl">إضافة كاتب جديد</DialogTitle>
            <DialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              أضف كاتباً أو خبيراً جديداً للمساهمة في المقالات
            </DialogDescription>
          </DialogHeader>

          <Form {...authorForm}>
            <form onSubmit={authorForm.handleSubmit(data => saveAuthorMutation.mutate(data))} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={authorForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم الكامل *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="د. محمد أحمد"
                          className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>البريد الإلكتروني *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="email@example.com"
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
                control={authorForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المسمى الوظيفي *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="خبير في الذكاء الاصطناعي"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={authorForm.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>السيرة الذاتية *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        placeholder="نبذة عن الكاتب وخبراته..."
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={authorForm.control}
                  name="specialization"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>التخصص *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: NLP, Computer Vision"
                          className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorForm.control}
                  name="experience"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>سنوات الخبرة *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: 10 سنوات"
                          className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Social Links */}
              <div className="space-y-3">
                <Label>روابط التواصل الاجتماعي</Label>
                
                <FormField
                  control={authorForm.control}
                  name="socialLinks.twitter"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-3">
                        <SiTwitter className="h-5 w-5 text-blue-400" />
                        <FormControl>
                          <Input
                            {...field}
                            type="url"
                            placeholder="https://twitter.com/username"
                            dir="ltr"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorForm.control}
                  name="socialLinks.linkedin"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-3">
                        <SiLinkedin className="h-5 w-5 text-blue-600" />
                        <FormControl>
                          <Input
                            {...field}
                            type="url"
                            placeholder="https://linkedin.com/in/username"
                            dir="ltr"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorForm.control}
                  name="socialLinks.github"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-3">
                        <SiGithub className="h-5 w-5 text-[hsl(var(--ifox-text-primary))]" />
                        <FormControl>
                          <Input
                            {...field}
                            type="url"
                            placeholder="https://github.com/username"
                            dir="ltr"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={authorForm.control}
                  name="socialLinks.website"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-3">
                        <Globe className="h-5 w-5 text-green-400" />
                        <FormControl>
                          <Input
                            {...field}
                            type="url"
                            placeholder="https://example.com"
                            dir="ltr"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                      </div>
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={authorForm.control}
                name="isVerified"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-[hsl(var(--ifox-surface-overlay)/.1)] p-4 bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                    <div className="space-y-0.5">
                      <FormLabel>حساب موثق</FormLabel>
                      <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                        إظهار علامة التوثيق بجانب اسم الكاتب
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="border-[hsl(var(--ifox-surface-overlay)/.2)]"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-[hsl(var(--ifox-surface-overlay)/.1)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAuthorDialog(false)}
                  className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={saveAuthorMutation.isPending}
                  className="bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700"
                >
                  {saveAuthorMutation.isPending ? "جاري الحفظ..." : "إضافة الكاتب"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </IFoxCategoryTemplate>
  );
}