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
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Users2,
  Plus,
  MessageSquare,
  HelpCircle,
  Calendar,
  Award,
  Crown,
  Shield,
  Star,
  Heart,
  ThumbsUp,
  MessageCircle,
  Share2,
  Eye,
  TrendingUp,
  UserPlus,
  Check,
  X,
  Hash,
  Edit,
  Trash2,
  Pin,
  Flag,
  UserCheck,
  Zap,
  Trophy,
  Target,
  Sparkles
} from "lucide-react";

const topicSchema = z.object({
  title: z.string().min(5, "العنوان يجب أن يكون 5 أحرف على الأقل"),
  description: z.string().min(20, "الوصف يجب أن يكون 20 حرف على الأقل"),
  category: z.enum(["discussion", "question", "event", "announcement"]),
  tags: z.array(z.string()).optional(),
  isPinned: z.boolean().default(false),
  allowComments: z.boolean().default(true),
});

const expertSchema = z.object({
  name: z.string().min(3, "الاسم يجب أن يكون 3 أحرف على الأقل"),
  title: z.string().min(5, "المسمى الوظيفي يجب أن يكون 5 أحرف على الأقل"),
  bio: z.string().min(20, "السيرة الذاتية يجب أن تكون 20 حرف على الأقل"),
  specialization: z.string(),
  avatar: z.string().optional(),
  socialLinks: z.object({
    twitter: z.string().url().optional().or(z.literal("")),
    linkedin: z.string().url().optional().or(z.literal("")),
    github: z.string().url().optional().or(z.literal("")),
  }).optional(),
  badges: z.array(z.string()).optional(),
  isVerified: z.boolean().default(false),
});

type TopicFormData = z.infer<typeof topicSchema>;
type ExpertFormData = z.infer<typeof expertSchema>;

interface Topic {
  id: string;
  title: string;
  description: string;
  category: "discussion" | "question" | "event" | "announcement";
  author: {
    name: string;
    avatar?: string;
    badge?: string;
  };
  views: number;
  replies: number;
  likes: number;
  createdAt: string;
  isPinned: boolean;
  isHot: boolean;
}

interface Expert {
  id: string;
  name: string;
  title: string;
  avatar?: string;
  specialization: string;
  contributions: number;
  followers: number;
  badges: string[];
  isVerified: boolean;
}

interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  type: "webinar" | "workshop" | "meetup";
  attendees: number;
  maxAttendees: number;
  speaker?: string;
}

const badges = [
  { id: "pioneer", name: "رائد", icon: Zap, color: "text-purple-400", bgColor: "bg-purple-500/20" },
  { id: "expert", name: "خبير", icon: Crown, color: "text-amber-400", bgColor: "bg-amber-500/20" },
  { id: "contributor", name: "مساهم", icon: Star, color: "text-blue-400", bgColor: "bg-blue-500/20" },
  { id: "helper", name: "مساعد", icon: Heart, color: "text-pink-400", bgColor: "bg-pink-500/20" },
  { id: "moderator", name: "مشرف", icon: Shield, color: "text-green-400", bgColor: "bg-green-500/20" },
  { id: "achiever", name: "منجز", icon: Trophy, color: "text-yellow-400", bgColor: "bg-yellow-500/20" },
];

export default function IFoxCommunity() {
  useRoleProtection("admin");
  const { toast } = useToast();

  const [showTopicDialog, setShowTopicDialog] = useState(false);
  const [showExpertDialog, setShowExpertDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState("discussions");
  const [tagInput, setTagInput] = useState("");
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);

  const topicForm = useForm<TopicFormData>({
    resolver: zodResolver(topicSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "discussion",
      tags: [],
      isPinned: false,
      allowComments: true,
    },
  });

  const expertForm = useForm<ExpertFormData>({
    resolver: zodResolver(expertSchema),
    defaultValues: {
      name: "",
      title: "",
      bio: "",
      specialization: "",
      socialLinks: {
        twitter: "",
        linkedin: "",
        github: "",
      },
      badges: [],
      isVerified: false,
    },
  });

  // Fetch topics
  const { data: topics } = useQuery<Topic[]>({
    queryKey: ["/api/admin/ifox/community/topics", selectedTab],
    queryFn: async () => {
      // Mock data
      return [
        {
          id: "1",
          title: "كيف أبدأ في استخدام GPT-4 Vision؟",
          description: "أريد أن أتعلم كيفية استخدام ميزة الرؤية في GPT-4",
          category: "question",
          author: { name: "أحمد علي", avatar: "#", badge: "contributor" },
          views: 234,
          replies: 12,
          likes: 45,
          createdAt: "منذ ساعتين",
          isPinned: true,
          isHot: true,
        },
        {
          id: "2",
          title: "مناقشة: مستقبل AI في العالم العربي",
          description: "دعونا نناقش التحديات والفرص لتطوير AI في المنطقة العربية",
          category: "discussion",
          author: { name: "سارة محمد", badge: "expert" },
          views: 567,
          replies: 34,
          likes: 123,
          createdAt: "منذ 5 ساعات",
          isPinned: false,
          isHot: true,
        },
      ];
    },
  });

  // Fetch experts
  const { data: experts } = useQuery<Expert[]>({
    queryKey: ["/api/admin/ifox/community/experts"],
    queryFn: async () => {
      // Mock data
      return [
        {
          id: "1",
          name: "د. خالد الأحمد",
          title: "خبير في معالجة اللغات الطبيعية",
          avatar: "#",
          specialization: "NLP & Machine Learning",
          contributions: 156,
          followers: 2341,
          badges: ["expert", "contributor", "pioneer"],
          isVerified: true,
        },
        {
          id: "2",
          name: "م. فاطمة السعيد",
          title: "مهندسة ذكاء اصطناعي",
          specialization: "Computer Vision",
          contributions: 89,
          followers: 1234,
          badges: ["contributor", "helper"],
          isVerified: true,
        },
      ];
    },
  });

  // Fetch events
  const { data: events } = useQuery<Event[]>({
    queryKey: ["/api/admin/ifox/community/events"],
    queryFn: async () => {
      // Mock data
      return [
        {
          id: "1",
          title: "ورشة عمل: بناء تطبيقات ChatGPT",
          date: "2024-01-25",
          time: "18:00",
          type: "workshop",
          attendees: 45,
          maxAttendees: 100,
          speaker: "د. خالد الأحمد",
        },
        {
          id: "2",
          title: "ندوة: أخلاقيات الذكاء الاصطناعي",
          date: "2024-01-28",
          time: "19:00",
          type: "webinar",
          attendees: 234,
          maxAttendees: 500,
        },
      ];
    },
  });

  // Save topic mutation
  const saveTopicMutation = useMutation({
    mutationFn: async (data: TopicFormData) => {
      return apiRequest("/api/admin/ifox/community/topics", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ الموضوع بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/community/topics"] });
      setShowTopicDialog(false);
      topicForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ الموضوع",
        variant: "destructive",
      });
    },
  });

  // Save expert mutation
  const saveExpertMutation = useMutation({
    mutationFn: async (data: ExpertFormData) => {
      return apiRequest("/api/admin/ifox/community/experts", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تمت إضافة الخبير بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/community/experts"] });
      setShowExpertDialog(false);
      expertForm.reset();
      setSelectedBadges([]);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إضافة الخبير",
        variant: "destructive",
      });
    },
  });

  const handleAddTag = () => {
    if (tagInput.trim()) {
      const currentTags = topicForm.getValues("tags") || [];
      topicForm.setValue("tags", [...currentTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    const currentTags = topicForm.getValues("tags") || [];
    topicForm.setValue("tags", currentTags.filter((t) => t !== tag));
  };

  const toggleBadge = (badgeId: string) => {
    setSelectedBadges(prev =>
      prev.includes(badgeId)
        ? prev.filter(id => id !== badgeId)
        : [...prev, badgeId]
    );
    expertForm.setValue("badges", 
      selectedBadges.includes(badgeId)
        ? selectedBadges.filter(id => id !== badgeId)
        : [...selectedBadges, badgeId]
    );
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "question": return HelpCircle;
      case "discussion": return MessageSquare;
      case "event": return Calendar;
      case "announcement": return Sparkles;
      default: return MessageSquare;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "question": return "bg-blue-500/20 text-blue-400";
      case "discussion": return "bg-purple-500/20 text-purple-400";
      case "event": return "bg-green-500/20 text-green-400";
      case "announcement": return "bg-amber-500/20 text-amber-400";
      default: return "bg-[hsl(var(--ifox-neutral)/.2)] text-[hsl(var(--ifox-text-secondary))]";
    }
  };

  const stats = [
    { label: "الأعضاء النشطون", value: "3,456", icon: Users2, trend: { value: 12, isPositive: true } },
    { label: "المناقشات", value: topics?.length || 0, icon: MessageSquare, trend: { value: 8, isPositive: true } },
    { label: "الخبراء", value: experts?.length || 0, icon: Crown },
    { label: "الأحداث القادمة", value: events?.length || 0, icon: Calendar },
  ];

  const actions = [
    {
      label: "موضوع جديد",
      icon: Plus,
      onClick: () => setShowTopicDialog(true),
      variant: "default" as const,
    },
    {
      label: "إضافة خبير",
      icon: UserPlus,
      onClick: () => setShowExpertDialog(true),
      variant: "outline" as const,
    },
  ];

  return (
    <IFoxCategoryTemplate
      title="AI Community - المجتمع"
      description="منصة تواصل وتبادل المعرفة لمجتمع الذكاء الاصطناعي"
      icon={Users2}
      gradient="bg-gradient-to-br from-pink-500 to-purple-600"
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
                  <TabsTrigger value="discussions" className="flex-1">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    النقاشات
                  </TabsTrigger>
                  <TabsTrigger value="questions" className="flex-1">
                    <HelpCircle className="h-4 w-4 mr-2" />
                    الأسئلة
                  </TabsTrigger>
                  <TabsTrigger value="events" className="flex-1">
                    <Calendar className="h-4 w-4 mr-2" />
                    الأحداث
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="discussions" className="p-6 space-y-4">
                  {topics?.filter(t => t.category === "discussion").map((topic, index) => {
                    const CategoryIcon = getCategoryIcon(topic.category);
                    return (
                      <motion.div
                        key={topic.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <Avatar>
                                <AvatarImage src={topic.author.avatar} />
                                <AvatarFallback className="bg-purple-500/20 text-purple-400">
                                  {topic.author.name[0]}
                                </AvatarFallback>
                              </Avatar>
                              
                              <div className="flex-1">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <h4 className="font-semibold text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                                      {topic.isPinned && <Pin className="h-4 w-4 text-amber-400" />}
                                      {topic.title}
                                      {topic.isHot && (
                                        <Badge className="bg-red-500/20 text-red-400">
                                          <Zap className="h-3 w-3 mr-1" />
                                          ساخن
                                        </Badge>
                                      )}
                                    </h4>
                                    <p className="text-sm text-[hsl(var(--ifox-text-secondary))] mt-1">
                                      {topic.description}
                                    </p>
                                  </div>
                                  <Badge className={getCategoryColor(topic.category)}>
                                    <CategoryIcon className="h-3 w-3 mr-1" />
                                    نقاش
                                  </Badge>
                                </div>

                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4 text-xs text-[hsl(var(--ifox-text-secondary))]">
                                    <span className="flex items-center gap-1">
                                      {topic.author.name}
                                      {topic.author.badge && (
                                        <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                                          {badges.find(b => b.id === topic.author.badge)?.name}
                                        </Badge>
                                      )}
                                    </span>
                                    <span>{topic.createdAt}</span>
                                    <span className="flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      {topic.views}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <MessageCircle className="h-3 w-3" />
                                      {topic.replies}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3" />
                                      {topic.likes}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-primary))]">
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-[hsl(var(--ifox-text-secondary))] hover:text-red-400">
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

                <TabsContent value="questions" className="p-6 space-y-4">
                  {topics?.filter(t => t.category === "question").map((topic, index) => {
                    const CategoryIcon = getCategoryIcon(topic.category);
                    return (
                      <motion.div
                        key={topic.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className="p-3 rounded-lg bg-blue-500/20">
                                <HelpCircle className="h-6 w-6 text-blue-400" />
                              </div>
                              
                              <div className="flex-1">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <h4 className="font-semibold text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                                      {topic.isPinned && <Pin className="h-4 w-4 text-amber-400" />}
                                      {topic.title}
                                    </h4>
                                    <p className="text-sm text-[hsl(var(--ifox-text-secondary))] mt-1">
                                      {topic.description}
                                    </p>
                                  </div>
                                  <Badge className="bg-green-500/20 text-green-400">
                                    <Check className="h-3 w-3 mr-1" />
                                    تم الحل
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-4 text-xs text-[hsl(var(--ifox-text-secondary))]">
                                  <span className="flex items-center gap-1">
                                    {topic.author.name}
                                  </span>
                                  <span>{topic.createdAt}</span>
                                  <span className="flex items-center gap-1">
                                    <MessageCircle className="h-3 w-3" />
                                    {topic.replies} إجابة
                                  </span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </TabsContent>

                <TabsContent value="events" className="p-6 space-y-4">
                  {events?.map((event, index) => (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-colors">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="text-center bg-gradient-to-br from-pink-500/20 to-purple-500/20 rounded-lg p-3">
                              <div className="text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">
                                {new Date(event.date).getDate()}
                              </div>
                              <div className="text-xs text-[hsl(var(--ifox-text-secondary))]">
                                {new Date(event.date).toLocaleDateString("ar", { month: "short" })}
                              </div>
                            </div>
                            
                            <div className="flex-1">
                              <h4 className="font-semibold text-[hsl(var(--ifox-text-primary))] mb-1">
                                {event.title}
                              </h4>
                              <div className="flex items-center gap-4 text-sm text-[hsl(var(--ifox-text-secondary))]">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {event.time}
                                </span>
                                {event.speaker && (
                                  <span className="flex items-center gap-1">
                                    <UserCheck className="h-3 w-3" />
                                    {event.speaker}
                                  </span>
                                )}
                                <span className="flex items-center gap-1">
                                  <Users2 className="h-3 w-3" />
                                  {event.attendees}/{event.maxAttendees}
                                </span>
                              </div>
                            </div>

                            <Badge 
                              className={cn(
                                event.type === "webinar" 
                                  ? "bg-blue-500/20 text-blue-400"
                                  : event.type === "workshop"
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-purple-500/20 text-purple-400"
                              )}
                            >
                              {event.type === "webinar" ? "ندوة" : event.type === "workshop" ? "ورشة عمل" : "لقاء"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Top Contributors */}
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-400" />
                أفضل المساهمين
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {experts?.slice(0, 3).map((expert, index) => (
                  <div key={expert.id} className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar>
                        <AvatarImage src={expert.avatar} />
                        <AvatarFallback className="bg-purple-500/20 text-purple-400">
                          {expert.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      {expert.isVerified && (
                        <div className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-0.5">
                          <Check className="h-2 w-2 text-[hsl(var(--ifox-text-primary))]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-[hsl(var(--ifox-text-primary))]">{expert.name}</h4>
                      <p className="text-xs text-[hsl(var(--ifox-text-secondary))]">{expert.contributions} مساهمة</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {index === 0 && <Trophy className="h-4 w-4 text-yellow-400" />}
                      {index === 1 && <Trophy className="h-4 w-4 text-[hsl(var(--ifox-text-secondary))]" />}
                      {index === 2 && <Trophy className="h-4 w-4 text-amber-600" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Trending Tags */}
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <Hash className="h-5 w-5 text-pink-400" />
                الوسوم الشائعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {["ChatGPT", "Midjourney", "AI Ethics", "NLP", "Computer Vision", "Prompt Engineering"].map((tag) => (
                  <Badge 
                    key={tag}
                    variant="secondary" 
                    className="bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 cursor-pointer"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Community Stats */}
          <Card className="bg-gradient-to-br from-pink-500/20 to-purple-500/10 border-pink-500/30">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[hsl(var(--ifox-text-secondary))]">نمو المجتمع</span>
                  <span className="text-2xl font-bold text-pink-400">+23%</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[hsl(var(--ifox-text-secondary))]">أعضاء جدد اليوم</span>
                    <span className="text-[hsl(var(--ifox-text-primary))]">47</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[hsl(var(--ifox-text-secondary))]">منشورات اليوم</span>
                    <span className="text-[hsl(var(--ifox-text-primary))]">123</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[hsl(var(--ifox-text-secondary))]">تفاعلات اليوم</span>
                    <span className="text-[hsl(var(--ifox-text-primary))]">892</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Topic Dialog */}
      <Dialog open={showTopicDialog} onOpenChange={setShowTopicDialog}>
        <DialogContent className="max-w-2xl bg-slate-900 border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl">إضافة موضوع جديد</DialogTitle>
            <DialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              أنشئ موضوعاً جديداً في مجتمع AI
            </DialogDescription>
          </DialogHeader>

          <Form {...topicForm}>
            <form onSubmit={topicForm.handleSubmit(data => saveTopicMutation.mutate(data))} className="space-y-6">
              <FormField
                control={topicForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>العنوان *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="عنوان الموضوع"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={topicForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الوصف *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        placeholder="اكتب وصفاً للموضوع"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={topicForm.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الفئة *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="discussion">نقاش</SelectItem>
                        <SelectItem value="question">سؤال</SelectItem>
                        <SelectItem value="event">حدث</SelectItem>
                        <SelectItem value="announcement">إعلان</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tags */}
              <div className="space-y-2">
                <Label>الوسوم</Label>
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
                  {topicForm.watch("tags")?.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="bg-purple-500/20 text-[hsl(var(--ifox-text-primary))] border-purple-500/30"
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

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-[hsl(var(--ifox-surface-overlay)/.1)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowTopicDialog(false)}
                  className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={saveTopicMutation.isPending}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
                >
                  {saveTopicMutation.isPending ? "جاري الحفظ..." : "نشر الموضوع"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Expert Dialog */}
      <Dialog open={showExpertDialog} onOpenChange={setShowExpertDialog}>
        <DialogContent className="max-w-2xl bg-slate-900 border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl">إضافة خبير جديد</DialogTitle>
            <DialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              أضف خبيراً جديداً إلى مجتمع AI
            </DialogDescription>
          </DialogHeader>

          <Form {...expertForm}>
            <form onSubmit={expertForm.handleSubmit(data => saveExpertMutation.mutate(data))} className="space-y-6">
              <FormField
                control={expertForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="الاسم الكامل"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={expertForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>المسمى الوظيفي *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="مثال: خبير في معالجة اللغات الطبيعية"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={expertForm.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>السيرة الذاتية *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={4}
                        placeholder="نبذة عن الخبير وخبراته"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={expertForm.control}
                name="specialization"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>التخصص *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="مثال: NLP, Computer Vision, ML"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Badges */}
              <div className="space-y-2">
                <Label>الشارات</Label>
                <div className="grid grid-cols-3 gap-3">
                  {badges.map((badge) => {
                    const BadgeIcon = badge.icon;
                    const isSelected = selectedBadges.includes(badge.id);
                    return (
                      <button
                        key={badge.id}
                        type="button"
                        onClick={() => toggleBadge(badge.id)}
                        className={cn(
                          "p-3 rounded-lg border transition-all",
                          isSelected
                            ? "bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.3)]"
                            : "bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                        )}
                      >
                        <BadgeIcon className={cn("h-6 w-6 mx-auto mb-1", badge.color)} />
                        <p className="text-xs text-[hsl(var(--ifox-text-primary))]">{badge.name}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-[hsl(var(--ifox-surface-overlay)/.1)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowExpertDialog(false)}
                  className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={saveExpertMutation.isPending}
                  className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
                >
                  {saveExpertMutation.isPending ? "جاري الحفظ..." : "إضافة الخبير"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </IFoxCategoryTemplate>
  );
}