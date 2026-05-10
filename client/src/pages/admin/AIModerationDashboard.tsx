import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Brain,
  Eye,
  Check,
  X,
  AlertTriangle,
  MessageCircle,
  User,
  Calendar,
  Loader2,
  RefreshCw,
  TrendingUp,
  BarChart3,
  ChevronRight,
  Sparkles,
  Zap,
  Target,
  Filter,
  Pencil,
  Trash2,
  FileText,
  ExternalLink,
  History,
  UserCircle,
  MessageSquare,
  CheckCircle,
  XCircle,
  ChevronLeft,
  Clock,
} from "lucide-react";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { arSA } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ModerationAdvancedSearch } from "@/components/ModerationAdvancedSearch";

interface ModerationResult {
  commentId: string;
  moderationScore: number;
  aiClassification: 'safe' | 'flagged' | 'spam' | 'harmful';
  detectedIssues: string[];
  aiModerationAnalyzedAt: string;
  comment: {
    id: string;
    content: string;
    status: string;
    createdAt: string;
    user: {
      id: string;
      firstName?: string;
      lastName?: string;
      email: string;
    };
    articleId: string;
    articleTitle?: string;
    articleSlug?: string;
  };
}

interface ModerationStats {
  total: number;
  safe: number;
  flagged: number;
  spam: number;
  harmful: number;
  pending: number;
  averageScore: number;
}

interface MemberComment {
  id: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  articleId: string;
  articleTitle?: string;
  articleSlug?: string;
  moderationScore?: number;
  aiClassification?: 'safe' | 'flagged' | 'spam' | 'harmful';
}

interface MemberProfile {
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
    profileImage?: string;
    createdAt: string;
  };
  stats: {
    totalComments: number;
    approvedComments: number;
    rejectedComments: number;
    pendingComments: number;
    aiSafetyScore: number;
  };
  aiAnalysis: {
    overallBehavior: 'excellent' | 'good' | 'moderate' | 'concerning' | 'high_risk';
    behaviorScore: number;
    topClassifications: {
      classification: string;
      count: number;
      percentage: number;
    }[];
  };
  comments?: MemberComment[];
  totalPages?: number;
}

const behaviorColors: Record<string, { bg: string; text: string }> = {
  excellent: { bg: "bg-green-500/10", text: "text-green-600" },
  good: { bg: "bg-blue-500/10", text: "text-blue-600" },
  moderate: { bg: "bg-yellow-500/10", text: "text-yellow-600" },
  concerning: { bg: "bg-orange-500/10", text: "text-orange-600" },
  high_risk: { bg: "bg-red-500/10", text: "text-red-600" },
};

const behaviorLabels: Record<string, string> = {
  excellent: "ممتاز",
  good: "جيد",
  moderate: "متوسط",
  concerning: "مقلق",
  high_risk: "خطر عالي",
};

const classificationColors: Record<string, { bg: string; text: string; icon: typeof Shield }> = {
  safe: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", icon: ShieldCheck },
  flagged: { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", icon: ShieldAlert },
  spam: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", icon: Shield },
  harmful: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: ShieldX },
};

const classificationLabels: Record<string, string> = {
  safe: "آمن",
  flagged: "مشكوك فيه",
  spam: "سبام",
  harmful: "ضار",
};

const issueLabels: Record<string, string> = {
  hate_speech: "خطاب كراهية",
  profanity: "ألفاظ نابية",
  harassment: "تحرش",
  spam: "محتوى مزعج",
  misinformation: "معلومات مضللة",
  adult_content: "محتوى للبالغين",
  violence: "عنف",
  personal_attack: "هجوم شخصي",
  off_topic: "خارج الموضوع",
  self_promotion: "ترويج ذاتي",
};

const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="flex items-center gap-3 px-1">
    <div className={`h-8 w-1 ${color} rounded-full`}></div>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
  </div>
);

export default function AIModerationDashboard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [scoreFilter, setScoreFilter] = useState<string>("all");
  const [selectedComment, setSelectedComment] = useState<ModerationResult | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<ModerationResult | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editReason, setEditReason] = useState("");
  
  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingComment, setDeletingComment] = useState<ModerationResult | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  // Member profile dialog state
  const [memberProfileOpen, setMemberProfileOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [memberStatusFilter, setMemberStatusFilter] = useState<string>("all");
  const [memberCommentPage, setMemberCommentPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useQuery<ModerationStats>({
    queryKey: ["/api/moderation/stats"],
  });

  const { data: results, isLoading: resultsLoading, refetch } = useQuery<ModerationResult[]>({
    queryKey: ["/api/moderation/results", activeTab, scoreFilter],
    queryFn: async () => {
      let url = "/api/moderation/results?";
      if (activeTab !== "all") {
        url += `classification=${activeTab}&`;
      }
      if (scoreFilter !== "all") {
        const [min, max] = scoreFilter.split("-").map(Number);
        url += `minScore=${min}&maxScore=${max}&`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch results");
      return response.json();
    },
  });

  // Member profile query
  const { data: memberProfile, isLoading: memberProfileLoading } = useQuery<MemberProfile>({
    queryKey: ["/api/moderation/member", selectedMemberId],
    queryFn: async () => {
      if (!selectedMemberId) throw new Error("No member selected");
      const response = await fetch(`/api/moderation/member/${selectedMemberId}`);
      if (!response.ok) throw new Error("Failed to fetch member profile");
      return response.json();
    },
    enabled: !!selectedMemberId && memberProfileOpen,
  });

  // Member comments query
  const { data: memberCommentsData, isLoading: memberCommentsLoading } = useQuery<{ comments: MemberComment[]; totalPages: number }>({
    queryKey: ["/api/moderation/member", selectedMemberId, "comments", memberStatusFilter, memberCommentPage],
    queryFn: async () => {
      if (!selectedMemberId) throw new Error("No member selected");
      let url = `/api/moderation/member/${selectedMemberId}/comments?page=${memberCommentPage}`;
      if (memberStatusFilter !== "all") {
        url += `&status=${memberStatusFilter}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch member comments");
      return response.json();
    },
    enabled: !!selectedMemberId && memberProfileOpen,
  });

  const analyzeAllMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/moderation/analyze-all", {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "تم بدء التحليل",
        description: `جاري تحليل ${data.count || 0} تعليق`,
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/moderation"] });
        refetch();
      }, 2000);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل بدء التحليل",
        variant: "destructive",
      });
    },
  });

  const analyzeSingleMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest(`/api/moderation/analyze/${commentId}`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم التحليل",
        description: "تم تحليل التعليق بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation"] });
      refetch();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحليل التعليق",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest(`/api/moderation/approve/${commentId}`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الاعتماد",
        description: "تم اعتماد التعليق بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation"] });
      refetch();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل اعتماد التعليق",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest(`/api/moderation/reject/${commentId}`, {
        method: "POST",
        body: JSON.stringify({ reason: "AI Moderation: تم الرفض بناءً على تحليل الذكاء الاصطناعي" }),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الرفض",
        description: "تم رفض التعليق بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation"] });
      refetch();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل رفض التعليق",
        variant: "destructive",
      });
    },
  });

  // Edit comment mutation
  const editMutation = useMutation({
    mutationFn: async ({ commentId, content, reason }: { commentId: string; content: string; reason?: string }) => {
      return await apiRequest(`/api/moderation/edit/${commentId}`, {
        method: "PUT",
        body: JSON.stringify({ content, reason }),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم التعديل",
        description: "تم تعديل التعليق بنجاح",
      });
      setEditDialogOpen(false);
      setEditingComment(null);
      setEditContent("");
      setEditReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/moderation"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل تعديل التعليق",
        variant: "destructive",
      });
    },
  });

  // Delete comment mutation
  const deleteMutation = useMutation({
    mutationFn: async ({ commentId, reason }: { commentId: string; reason?: string }) => {
      return await apiRequest(`/api/moderation/delete/${commentId}`, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف التعليق بنجاح",
      });
      setDeleteDialogOpen(false);
      setDeletingComment(null);
      setDeleteReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/moderation"] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حذف التعليق",
        variant: "destructive",
      });
    },
  });

  // Bulk action mutation for member profile (using filter-based endpoint)
  const bulkActionByFilterMutation = useMutation({
    mutationFn: async ({ memberId, action, filter, reason }: { 
      memberId: string; 
      action: 'approve' | 'reject'; 
      filter: 'pending' | 'flagged'; 
      reason?: string 
    }) => {
      return await apiRequest(`/api/moderation/member/${memberId}/bulk-action-by-filter`, {
        method: "POST",
        body: JSON.stringify({ action, filter, reason }),
      });
    },
    onSuccess: (data: any, variables) => {
      toast({
        title: variables.action === 'approve' ? "تم الاعتماد" : "تم الرفض",
        description: data.message || (variables.action === 'approve' 
          ? "تم اعتماد جميع التعليقات المعلقة بنجاح" 
          : "تم رفض التعليقات المشكوك فيها بنجاح"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moderation/member", selectedMemberId] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل تنفيذ الإجراء",
        variant: "destructive",
      });
    },
  });

  // Handle opening edit dialog
  const handleEditClick = (result: ModerationResult) => {
    setEditingComment(result);
    setEditContent(result.comment.content);
    setEditReason("");
    setEditDialogOpen(true);
  };

  // Handle opening delete dialog
  const handleDeleteClick = (result: ModerationResult) => {
    setDeletingComment(result);
    setDeleteReason("");
    setDeleteDialogOpen(true);
  };

  // Handle edit submit
  const handleEditSubmit = () => {
    if (!editingComment || !editContent.trim()) return;
    editMutation.mutate({
      commentId: editingComment.commentId,
      content: editContent.trim(),
      reason: editReason.trim() || undefined,
    });
  };

  // Handle delete confirm
  const handleDeleteConfirm = () => {
    if (!deletingComment) return;
    deleteMutation.mutate({
      commentId: deletingComment.commentId,
      reason: deleteReason.trim() || undefined,
    });
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-red-500";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-yellow-500";
    if (score >= 40) return "bg-orange-500";
    return "bg-red-500";
  };

  const getUserName = (user: ModerationResult["comment"]["user"]) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email.split("@")[0];
  };

  const handleViewDetails = (result: ModerationResult) => {
    setSelectedComment(result);
    setDetailsOpen(true);
  };

  // Handle opening member profile dialog
  const handleMemberProfileClick = (memberId: string) => {
    setSelectedMemberId(memberId);
    setMemberStatusFilter("all");
    setMemberCommentPage(1);
    setMemberProfileOpen(true);
  };

  // Handle bulk actions from member profile (works on ALL member's comments, not just current page)
  const handleBulkApprove = () => {
    if (!selectedMemberId || !memberProfile?.stats.pendingComments) {
      toast({
        title: "لا توجد تعليقات معلقة",
        description: "لا توجد تعليقات معلقة لاعتمادها",
      });
      return;
    }
    bulkActionByFilterMutation.mutate({
      memberId: selectedMemberId,
      action: 'approve',
      filter: 'pending',
    });
  };

  const handleBulkReject = () => {
    if (!selectedMemberId) return;
    // Check if there are any flagged/spam/harmful comments based on AI analysis
    const hasFlaggedComments = memberProfile?.aiAnalysis.topClassifications?.some(
      cls => ['flagged', 'spam', 'harmful'].includes(cls.classification)
    );
    if (!hasFlaggedComments) {
      toast({
        title: "لا توجد تعليقات مشكوك فيها",
        description: "لا توجد تعليقات مشكوك فيها لرفضها",
      });
      return;
    }
    bulkActionByFilterMutation.mutate({
      memberId: selectedMemberId,
      action: 'reject',
      filter: 'flagged',
      reason: "تم الرفض الجماعي بناءً على تحليل الذكاء الاصطناعي",
    });
  };

  // Get initials for avatar fallback
  const getMemberInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName && lastName) {
      return `${firstName?.[0]}${lastName?.[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "??";
  };

  if (statsLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-accent-purple/30">
              <Brain className="h-6 w-6 text-accent-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">الرقابة الذكية</h1>
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  GPT-4o-mini
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                تحليل وفلترة التعليقات تلقائياً باستخدام الذكاء الاصطناعي
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/admin/comments/suspicious-words">
              <Button variant="outline" className="gap-2" data-testid="link-suspicious-words">
                <ShieldAlert className="h-4 w-4" />
                الكلمات المشبوهة
              </Button>
            </Link>
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="icon"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={() => analyzeAllMutation.mutate()}
              disabled={analyzeAllMutation.isPending}
              className="gap-2"
              data-testid="button-analyze-all"
            >
              {analyzeAllMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري التحليل...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" />
                  تحليل الكل
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeader title="إحصائيات التحليل" color="bg-blue-500" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
            <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي المحلل</CardTitle>
                <div className="p-2 rounded-md bg-accent-blue/30">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.total || 0}</div>
                <p className="text-xs text-muted-foreground">تعليق محلل</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">آمن</CardTitle>
                <div className="p-2 rounded-md bg-accent-green/30">
                  <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.safe || 0}</div>
                <p className="text-xs text-muted-foreground">تعليق آمن</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-amber-950/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">مشكوك فيه</CardTitle>
                <div className="p-2 rounded-md bg-accent-blue/30">
                  <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.flagged || 0}</div>
                <p className="text-xs text-muted-foreground">تعليق مشكوك</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all bg-orange-50 dark:bg-orange-950/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">سبام</CardTitle>
                <div className="p-2 rounded-md bg-accent-blue/30">
                  <Shield className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.spam || 0}</div>
                <p className="text-xs text-muted-foreground">تعليق سبام</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all bg-red-50 dark:bg-red-950/30">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ضار</CardTitle>
                <div className="p-2 rounded-md bg-accent-blue/30">
                  <ShieldX className="h-4 w-4 text-red-600 dark:text-red-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.harmful || 0}</div>
                <p className="text-xs text-muted-foreground">تعليق ضار</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {stats && stats.total > 0 && (
          <Card className="hover-elevate active-elevate-2 transition-all bg-violet-50 dark:bg-violet-950/30">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">متوسط نقاط الأمان</CardTitle>
              <div className="p-2 rounded-md bg-accent-purple/30">
                <Target className="h-4 w-4 text-accent-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Progress
                  value={stats.averageScore}
                  className="h-3 flex-1"
                />
                <span className={`text-2xl font-bold ${getScoreColor(stats.averageScore)}`}>
                  {stats.averageScore.toFixed(1)}%
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Advanced Search Section */}
        <div className="space-y-3">
          <SectionHeader title="البحث المتقدم" color="bg-violet-500" />
          <Card className="hover-elevate active-elevate-2 transition-all">
            <ModerationAdvancedSearch
            onSelectComment={(commentId) => {
              const foundResult = results?.find(r => r.commentId === commentId);
              if (foundResult) {
                setSelectedComment(foundResult);
                setDetailsOpen(true);
              }
            }}
            onSelectArticle={(articleId) => {
              window.open(`/admin/articles/${articleId}`, '_blank');
            }}
          />
          </Card>
        </div>

        <div className="space-y-3">
          <SectionHeader title="نتائج التحليل" color="bg-orange-500" />
          <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select
              value={scoreFilter}
              onValueChange={setScoreFilter}
              data-testid="select-score-filter"
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="نقاط الأمان" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع النقاط</SelectItem>
                <SelectItem value="80-100">80-100 (آمن جداً)</SelectItem>
                <SelectItem value="60-79">60-79 (مقبول)</SelectItem>
                <SelectItem value="40-59">40-59 (مشكوك فيه)</SelectItem>
                <SelectItem value="0-39">0-39 (خطر)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
          <TabsList className="grid w-full md:w-auto grid-cols-5 gap-2" dir="rtl">
            <TabsTrigger value="all" data-testid="tab-all">
              الكل ({stats?.total || 0})
            </TabsTrigger>
            <TabsTrigger value="safe" data-testid="tab-safe">
              آمن ({stats?.safe || 0})
            </TabsTrigger>
            <TabsTrigger value="flagged" data-testid="tab-flagged">
              مشكوك ({stats?.flagged || 0})
            </TabsTrigger>
            <TabsTrigger value="spam" data-testid="tab-spam">
              سبام ({stats?.spam || 0})
            </TabsTrigger>
            <TabsTrigger value="harmful" data-testid="tab-harmful">
              ضار ({stats?.harmful || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-6">
            {resultsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : !results || results.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">لا توجد نتائج تحليل</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    اضغط على "تحليل الكل" لبدء تحليل التعليقات
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {results.map((result) => {
                  const classification = classificationColors[result.aiClassification] || classificationColors.safe;
                  const ClassIcon = classification.icon;

                  return (
                    <Card key={result.commentId} data-testid={`moderation-result-${result.commentId}`} dir="rtl">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-lg ${classification.bg}`}>
                            <ClassIcon className={`h-6 w-6 ${classification.text}`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge
                                variant="secondary"
                                className={`${classification.bg} ${classification.text} border-0`}
                              >
                                {classificationLabels[result.aiClassification]}
                              </Badge>
                              <span className={`text-sm font-medium ${getScoreColor(result.moderationScore)}`}>
                                {result.moderationScore}%
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {result.comment.status === "pending" ? "معلق" : 
                                 result.comment.status === "approved" ? "معتمد" : "مرفوض"}
                              </Badge>
                            </div>

                            <p className="text-sm mb-3 line-clamp-2">{result.comment.content}</p>

                            {(result?.detectedIssues?.length ?? 0) > 0 && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {result?.detectedIssues?.map((issue) => (
                                  <Badge
                                    key={issue}
                                    variant="destructive"
                                    className="text-xs"
                                  >
                                    {issueLabels[issue] || issue}
                                  </Badge>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center flex-wrap gap-4 text-xs text-muted-foreground">
                              <button
                                onClick={() => handleMemberProfileClick(result.comment.user.id)}
                                className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                                data-testid={`button-member-profile-${result.comment.user.id}`}
                              >
                                <User className="h-3 w-3" />
                                {getUserName(result.comment.user)}
                              </button>
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDistanceToNow(new Date(result.aiModerationAnalyzedAt), {
                                  addSuffix: true,
                                  locale: arSA,
                                })}
                              </div>
                              {result.comment.articleTitle && (
                                <a
                                  href={`/article/${result.comment.articleSlug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-primary hover:underline"
                                  data-testid={`link-article-${result.commentId}`}
                                >
                                  <FileText className="h-3 w-3" />
                                  <span className="truncate max-w-[150px]">{result.comment.articleTitle}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewDetails(result)}
                              className="gap-1"
                              data-testid={`button-view-details-${result.commentId}`}
                            >
                              <Eye className="h-4 w-4" />
                              تفاصيل
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditClick(result)}
                              className="gap-1"
                              data-testid={`button-edit-${result.commentId}`}
                            >
                              <Pencil className="h-4 w-4" />
                              تعديل
                            </Button>
                            {result.comment.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => approveMutation.mutate(result.commentId)}
                                  disabled={approveMutation.isPending}
                                  className="gap-1"
                                  data-testid={`button-approve-${result.commentId}`}
                                >
                                  <Check className="h-4 w-4" />
                                  اعتماد
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => rejectMutation.mutate(result.commentId)}
                                  disabled={rejectMutation.isPending}
                                  className="gap-1"
                                  data-testid={`button-reject-${result.commentId}`}
                                >
                                  <X className="h-4 w-4" />
                                  رفض
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteClick(result)}
                              className="gap-1 text-destructive hover:text-destructive"
                              data-testid={`button-delete-${result.commentId}`}
                            >
                              <Trash2 className="h-4 w-4" />
                              حذف
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
        </div>

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                تفاصيل تحليل الذكاء الاصطناعي
              </DialogTitle>
              <DialogDescription>
                تحليل شامل للتعليق بواسطة GPT-4o-mini
              </DialogDescription>
            </DialogHeader>

            {selectedComment && (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <MessageCircle className="h-4 w-4" />
                        محتوى التعليق
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm">{selectedComment.comment.content}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        نتائج التحليل
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">التصنيف:</span>
                        <Badge
                          className={`${classificationColors[selectedComment.aiClassification]?.bg} ${classificationColors[selectedComment.aiClassification]?.text} border-0`}
                        >
                          {classificationLabels[selectedComment.aiClassification]}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">نقاط الأمان:</span>
                          <span className={`font-bold ${getScoreColor(selectedComment.moderationScore)}`}>
                            {selectedComment.moderationScore}%
                          </span>
                        </div>
                        <Progress
                          value={selectedComment.moderationScore}
                          className="h-2"
                        />
                      </div>

                      {selectedComment.detectedIssues.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-sm text-muted-foreground">المشاكل المكتشفة:</span>
                          <div className="flex flex-wrap gap-2">
                            {selectedComment.detectedIssues.map((issue) => (
                              <Badge key={issue} variant="destructive">
                                <AlertTriangle className="h-3 w-3 ml-1" />
                                {issueLabels[issue] || issue}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <Separator />

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">تم التحليل:</span>
                        <span>
                          {format(new Date(selectedComment.aiModerationAnalyzedAt), "PPpp", { locale: arSA })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                إغلاق
              </Button>
              {selectedComment && selectedComment.comment.status === "pending" && (
                <>
                  <Button
                    onClick={() => {
                      approveMutation.mutate(selectedComment.commentId);
                      setDetailsOpen(false);
                    }}
                    disabled={approveMutation.isPending}
                    className="gap-1"
                  >
                    <Check className="h-4 w-4" />
                    اعتماد
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      rejectMutation.mutate(selectedComment.commentId);
                      setDetailsOpen(false);
                    }}
                    disabled={rejectMutation.isPending}
                    className="gap-1"
                  >
                    <X className="h-4 w-4" />
                    رفض
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Comment Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                تعديل التعليق
              </DialogTitle>
              <DialogDescription>
                قم بتعديل محتوى التعليق. سيتم حفظ التعديل في سجل التغييرات.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-content">محتوى التعليق</Label>
                <Textarea
                  id="edit-content"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[120px] resize-none"
                  dir="rtl"
                  data-testid="textarea-edit-content"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-reason">سبب التعديل (اختياري)</Label>
                <Input
                  id="edit-reason"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="مثال: تصحيح إملائي، إزالة محتوى غير مناسب..."
                  dir="rtl"
                  data-testid="input-edit-reason"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button 
                variant="outline" 
                onClick={() => setEditDialogOpen(false)}
                data-testid="button-cancel-edit"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleEditSubmit}
                disabled={editMutation.isPending || !editContent.trim()}
                className="gap-1"
                data-testid="button-confirm-edit"
              >
                {editMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    حفظ التعديلات
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                تأكيد حذف التعليق
              </AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا التعليق؟ لا يمكن التراجع عن هذا الإجراء.
                سيتم حفظ سجل الحذف للمراجعة.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {deletingComment && (
              <div className="my-4 p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground mb-2">التعليق المراد حذفه:</p>
                <p className="line-clamp-3">{deletingComment.comment.content}</p>
              </div>
            )}

            <div className="space-y-2 mb-4">
              <Label htmlFor="delete-reason">سبب الحذف (اختياري)</Label>
              <Input
                id="delete-reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="مثال: محتوى مخالف، سبام..."
                dir="rtl"
                data-testid="input-delete-reason"
              />
            </div>

            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1"
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جاري الحذف...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    تأكيد الحذف
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Member Profile Dialog */}
        <Dialog open={memberProfileOpen} onOpenChange={setMemberProfileOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]" dir="rtl" data-testid="dialog-member-profile">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5" />
                ملف العضو
              </DialogTitle>
              <DialogDescription>
                عرض معلومات العضو وسجل التعليقات
              </DialogDescription>
            </DialogHeader>

            {memberProfileLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <div className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
                <Skeleton className="h-32 w-full" />
              </div>
            ) : memberProfile ? (
              <ScrollArea className="max-h-[calc(90vh-180px)]">
                <div className="space-y-6 pl-4">
                  {/* User Info Section */}
                  <Card data-testid="card-user-info">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16" data-testid="avatar-member">
                          <AvatarImage 
                            src={memberProfile.user.profileImage} 
                            alt={getUserName(memberProfile.user as any)} 
                          />
                          <AvatarFallback className="text-lg">
                            {getMemberInitials(
                              memberProfile.user.firstName,
                              memberProfile.user.lastName,
                              memberProfile.user.email
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold" data-testid="text-member-name">
                            {memberProfile.user.firstName && memberProfile.user.lastName
                              ? `${memberProfile.user.firstName} ${memberProfile.user.lastName}`
                              : memberProfile.user.email.split('@')[0]}
                          </h3>
                          <p className="text-sm text-muted-foreground" data-testid="text-member-email">
                            {memberProfile.user.email}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1" data-testid="text-member-since">
                              <Calendar className="h-3 w-3" />
                              عضو منذ {format(new Date(memberProfile.user.createdAt), "PP", { locale: arSA })}
                            </div>
                            <div className="flex items-center gap-1" data-testid="text-days-active">
                              <History className="h-3 w-3" />
                              {differenceInDays(new Date(), new Date(memberProfile.user.createdAt))} يوم نشط
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stats Cards Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card data-testid="card-stat-total">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">إجمالي التعليقات</p>
                            <p className="text-2xl font-bold">{memberProfile.stats.totalComments}</p>
                          </div>
                          <div className="p-2 rounded-full bg-primary/10">
                            <MessageSquare className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-stat-approved">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">التعليقات المعتمدة</p>
                            <p className="text-2xl font-bold text-green-600">{memberProfile.stats.approvedComments}</p>
                          </div>
                          <div className="p-2 rounded-full bg-green-500/10">
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-stat-rejected">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">التعليقات المرفوضة</p>
                            <p className="text-2xl font-bold text-red-600">{memberProfile.stats.rejectedComments}</p>
                          </div>
                          <div className="p-2 rounded-full bg-red-500/10">
                            <XCircle className="h-5 w-5 text-red-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-stat-safety">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">نقاط الأمان AI</p>
                            <p className={`text-2xl font-bold ${getScoreColor(memberProfile.stats.aiSafetyScore)}`}>
                              {memberProfile.stats.aiSafetyScore}%
                            </p>
                          </div>
                          <div className="p-2 rounded-full bg-primary/10">
                            <Shield className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* AI Behavior Analysis Section */}
                  <Card data-testid="card-ai-analysis">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        تحليل سلوك AI
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">السلوك العام:</span>
                        <Badge
                          className={`${behaviorColors[memberProfile.aiAnalysis.overallBehavior]?.bg} ${behaviorColors[memberProfile.aiAnalysis.overallBehavior]?.text} border-0`}
                          data-testid="badge-behavior"
                        >
                          {behaviorLabels[memberProfile.aiAnalysis.overallBehavior]}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">نقاط السلوك:</span>
                          <span className={`font-bold ${getScoreColor(memberProfile.aiAnalysis.behaviorScore)}`}>
                            {memberProfile.aiAnalysis.behaviorScore}%
                          </span>
                        </div>
                        <Progress
                          value={memberProfile.aiAnalysis.behaviorScore}
                          className="h-2"
                          data-testid="progress-behavior-score"
                        />
                      </div>

                      {memberProfile.aiAnalysis.topClassifications.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-sm text-muted-foreground">أعلى التصنيفات:</span>
                          <div className="space-y-2">
                            {memberProfile.aiAnalysis.topClassifications.map((cls) => (
                              <div key={cls.classification} className="flex items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className={`${classificationColors[cls.classification]?.bg} ${classificationColors[cls.classification]?.text} border-0`}
                                >
                                  {classificationLabels[cls.classification] || cls.classification}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {cls.count} ({(cls.percentage ?? 0).toFixed(1)}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Comment History Section */}
                  <Card data-testid="card-comment-history">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <MessageCircle className="h-4 w-4" />
                          سجل التعليقات
                        </CardTitle>
                        <Select
                          value={memberStatusFilter}
                          onValueChange={(value) => {
                            setMemberStatusFilter(value);
                            setMemberCommentPage(1);
                          }}
                          data-testid="select-member-status-filter"
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="الحالة" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">الكل</SelectItem>
                            <SelectItem value="pending">معلق</SelectItem>
                            <SelectItem value="approved">معتمد</SelectItem>
                            <SelectItem value="rejected">مرفوض</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {memberCommentsLoading ? (
                        <div className="space-y-2">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-16" />
                          ))}
                        </div>
                      ) : memberCommentsData?.comments && memberCommentsData.comments.length > 0 ? (
                        <div className="space-y-3">
                          {memberCommentsData.comments.map((comment) => (
                            <div
                              key={comment.id}
                              className="p-4 bg-muted/50 rounded-lg border border-border/50"
                              data-testid={`member-comment-${comment.id}`}
                            >
                              {/* Comment Header with Status */}
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <p className="text-sm leading-relaxed flex-1">{comment.content}</p>
                                <Badge
                                  variant="outline"
                                  className={`shrink-0 ${
                                    comment.status === 'approved'
                                      ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                      : comment.status === 'rejected'
                                      ? 'bg-red-500/10 text-red-600 border-red-500/20'
                                      : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                                  }`}
                                >
                                  {comment.status === 'approved' ? 'معتمد' : comment.status === 'rejected' ? 'مرفوض' : 'معلق'}
                                </Badge>
                              </div>
                              
                              {/* Article Link - Prominent Display */}
                              {comment.articleTitle && (
                                <a
                                  href={`/article/${comment.articleSlug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 p-2 mb-3 rounded-md bg-primary/5 hover:bg-primary/10 transition-colors group"
                                  data-testid={`link-article-${comment.id}`}
                                >
                                  <FileText className="h-4 w-4 text-primary shrink-0" />
                                  <span className="text-sm text-primary group-hover:underline truncate">
                                    {comment.articleTitle}
                                  </span>
                                  <ExternalLink className="h-3 w-3 text-primary/60 mr-auto" />
                                </a>
                              )}
                              
                              {/* Comment Meta Info */}
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDistanceToNow(new Date(comment.createdAt), {
                                    addSuffix: true,
                                    locale: arSA,
                                  })}
                                </span>
                                {comment.aiClassification && (
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${classificationColors[comment.aiClassification]?.bg} ${classificationColors[comment.aiClassification]?.text} border-0`}
                                  >
                                    {classificationLabels[comment.aiClassification] || comment.aiClassification}
                                  </Badge>
                                )}
                                {comment.moderationScore !== undefined && (
                                  <span className={`font-medium ${getScoreColor(comment.moderationScore)}`}>
                                    نقاط الأمان: {comment.moderationScore}%
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Pagination */}
                          {memberCommentsData.totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMemberCommentPage((p) => Math.max(1, p - 1))}
                                disabled={memberCommentPage === 1}
                                data-testid="button-prev-page"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                              <span className="text-sm text-muted-foreground">
                                صفحة {memberCommentPage} من {memberCommentsData.totalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setMemberCommentPage((p) => Math.min(memberCommentsData.totalPages, p + 1))}
                                disabled={memberCommentPage === memberCommentsData.totalPages}
                                data-testid="button-next-page"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>لا توجد تعليقات</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <UserCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>فشل تحميل ملف العضو</p>
              </div>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setMemberProfileOpen(false)} data-testid="button-close-profile">
                إغلاق
              </Button>
              {memberProfile && memberProfile.stats.pendingComments > 0 && (
                <Button
                  onClick={handleBulkApprove}
                  disabled={bulkActionByFilterMutation.isPending}
                  className="gap-1"
                  data-testid="button-bulk-approve"
                >
                  {bulkActionByFilterMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  اعتماد كل المعلق ({memberProfile.stats.pendingComments})
                </Button>
              )}
              {memberProfile && memberCommentsData?.comments?.some(c => c.aiClassification && ['flagged', 'spam', 'harmful'].includes(c.aiClassification)) && (
                <Button
                  variant="destructive"
                  onClick={handleBulkReject}
                  disabled={bulkActionByFilterMutation.isPending}
                  className="gap-1"
                  data-testid="button-bulk-reject"
                >
                  {bulkActionByFilterMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  رفض المشكوك فيه
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
