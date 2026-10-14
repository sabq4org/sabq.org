import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  HeartPulse,
  Ban,
} from "lucide-react";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { arSA } from "date-fns/locale";
import { queryClient, apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
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
    /** Source platform — set when the comment was posted. Drives the
     *  small platform pill rendered on each moderation row. */
    platform?: "web" | "ios" | "android" | string;
    /** Sentiment toward the article topic (from the unified AI pipeline). */
    sentiment?: "positive" | "neutral" | "negative" | string;
    sentimentConfidence?: number;
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

interface SentimentStats {
  analyzed: number;
  notAnalyzed: number;
  positive: number;
  neutral: number;
  negative: number;
  avgConfidence: number | null;
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
  excellent: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  good: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  moderate: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  concerning: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
  high_risk: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400" },
};

const behaviorLabels: Record<string, string> = {
  excellent: "ممتاز",
  good: "جيد",
  moderate: "متوسط",
  concerning: "مقلق",
  high_risk: "خطر عالي",
};

const classificationColors: Record<
  string,
  { bg: string; text: string; border: string; accent: string; icon: typeof Shield }
> = {
  safe: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20",
    accent: "border-r-emerald-500",
    icon: ShieldCheck,
  },
  flagged: {
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/20",
    accent: "border-r-amber-500",
    icon: ShieldAlert,
  },
  spam: {
    bg: "bg-orange-500/10",
    text: "text-orange-600 dark:text-orange-400",
    border: "border-orange-500/20",
    accent: "border-r-orange-500",
    icon: Shield,
  },
  harmful: {
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
    border: "border-rose-500/20",
    accent: "border-r-rose-500",
    icon: ShieldX,
  },
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

const SectionHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-center justify-between gap-2 px-1">
    <div className="flex items-center gap-2.5">
      <div className="h-6 w-1 rounded-full bg-primary" />
      <div>
        <h3 className="text-base font-bold text-foreground sm:text-lg">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

/** Sentiment pill — إيجابي / محايد / سلبي. Hidden when the comment has no
 *  sentiment yet (pre-rollout comments awaiting the backfill script). */
function SentimentBadge({ sentiment }: { sentiment?: string }) {
  if (!sentiment) return null;
  const config: Record<string, { label: string; cls: string }> = {
    positive: {
      label: "إيجابي",
      cls: "border-emerald-300/80 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    },
    neutral: {
      label: "محايد",
      cls: "border-slate-300/80 text-slate-600 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400",
    },
    negative: {
      label: "سلبي",
      cls: "border-rose-300/80 text-rose-700 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
    },
  };
  const c = config[sentiment];
  if (!c) return null;
  return (
    <Badge variant="outline" className={`px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </Badge>
  );
}

function PlatformBadge({ platform }: { platform?: string }) {
  const p = (platform || "web").toLowerCase();
  const config: Record<string, { label: string; cls: string }> = {
    web: {
      label: "ويب",
      cls: "border-slate-300/80 text-slate-600 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
    },
    ios: {
      label: "iOS",
      cls: "border-zinc-300/80 text-zinc-700 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300",
    },
    android: {
      label: "Android",
      cls: "border-border text-muted-foreground bg-muted/40",
    },
  };
  const c = config[p] || config.web;
  return (
    <Badge variant="outline" className={`px-2 py-0.5 text-xs font-medium ${c.cls}`}>
      {c.label}
    </Badge>
  );
}

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

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats,
  } = useQuery<ModerationStats>({
    queryKey: ["/api/moderation/stats"],
  });

  const { data: sentimentStats } = useQuery<SentimentStats>({
    queryKey: ["/api/moderation/sentiment-stats"],
  });

  const {
    data: resultsRaw,
    isLoading: resultsLoading,
    isError: resultsError,
    refetch,
  } = useQuery<ModerationResult[]>({
    queryKey: ["/api/moderation/results", activeTab, scoreFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab !== "all") {
        params.set("classification", activeTab);
      }
      if (scoreFilter !== "all") {
        const [min, max] = scoreFilter.split("-").map(Number);
        params.set("minScore", String(min));
        params.set("maxScore", String(max));
      }
      const qs = params.toString();
      const response = await fetch(apiUrl(`/api/moderation/results${qs ? `?${qs}` : ""}`), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch results");
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
  });
  const results = Array.isArray(resultsRaw) ? resultsRaw : [];

  // Member profile query
  const { data: memberProfile, isLoading: memberProfileLoading } = useQuery<MemberProfile>({
    queryKey: ["/api/moderation/member", selectedMemberId],
    queryFn: async () => {
      if (!selectedMemberId) throw new Error("No member selected");
      const response = await fetch(apiUrl(`/api/moderation/member/${selectedMemberId}`), {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch member profile");
      return response.json();
    },
    enabled: !!selectedMemberId && memberProfileOpen,
  });

  // Member comments query
  const { data: memberCommentsData, isLoading: memberCommentsLoading } = useQuery<{
    comments: MemberComment[];
    totalPages: number;
  }>({
    queryKey: [
      "/api/moderation/member",
      selectedMemberId,
      "comments",
      memberStatusFilter,
      memberCommentPage,
    ],
    queryFn: async () => {
      if (!selectedMemberId) throw new Error("No member selected");
      const params = new URLSearchParams({ page: String(memberCommentPage) });
      if (memberStatusFilter !== "all") {
        params.set("status", memberStatusFilter);
      }
      const response = await fetch(
        apiUrl(`/api/moderation/member/${selectedMemberId}/comments?${params.toString()}`),
        { credentials: "include" },
      );
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
    mutationFn: async (
      payload: string | { commentId: string; reason?: string }
    ) => {
      const commentId = typeof payload === "string" ? payload : payload.commentId;
      const reason =
        typeof payload === "string"
          ? "AI Moderation: تم الرفض بناءً على تحليل الذكاء الاصطناعي"
          : payload.reason || "AI Moderation: تم الرفض بناءً على تحليل الذكاء الاصطناعي";
      return await apiRequest(`/api/moderation/reject/${commentId}`, {
        method: "POST",
        body: JSON.stringify({
          reason,
        }),
      });
    },
    onSuccess: (_data, variables) => {
      const isSpam =
        typeof variables === "object" &&
        variables?.reason?.includes("سبام");
      toast({
        title: isSpam ? "تم تصنيفه كسبام ورفضه" : "تم الرفض",
        description: isSpam
          ? "تم رفض التعليق وتصنيفه كمحتوى سبام بنجاح"
          : "تم رفض التعليق بنجاح",
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
    mutationFn: async ({
      commentId,
      content,
      reason,
    }: {
      commentId: string;
      content: string;
      reason?: string;
    }) => {
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
    mutationFn: async ({
      memberId,
      action,
      filter,
      reason,
    }: {
      memberId: string;
      action: "approve" | "reject";
      filter: "pending" | "flagged";
      reason?: string;
    }) => {
      return await apiRequest(`/api/moderation/member/${memberId}/bulk-action-by-filter`, {
        method: "POST",
        body: JSON.stringify({ action, filter, reason }),
      });
    },
    onSuccess: (data: any, variables) => {
      toast({
        title: variables.action === "approve" ? "تم الاعتماد" : "تم الرفض",
        description:
          data.message ||
          (variables.action === "approve"
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
    if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (score >= 60) return "text-amber-600 dark:text-amber-400";
    if (score >= 40) return "text-orange-600 dark:text-orange-400";
    return "text-rose-600 dark:text-rose-400";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    if (score >= 40) return "bg-orange-500";
    return "bg-rose-500";
  };

  const getScoreRiskLabel = (score: number) => {
    if (score >= 80) return "آمن جداً";
    if (score >= 60) return "مقبول";
    if (score >= 40) return "مشكوك فيه";
    return "خطر عالٍ";
  };

  const getUserName = (user: ModerationResult["comment"]["user"]) => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user?.firstName) return user.firstName;
    const email = user?.email || "";
    return email.includes("@") ? email.split("@")[0] : email || "عضو";
  };

  const handleViewDetails = (result: ModerationResult) => {
    setSelectedComment(result);
    setDetailsOpen(true);
  };

  // Handle opening member profile dialog
  const handleMemberProfileClick = (memberId: string) => {
    if (!memberId) return;
    setSelectedMemberId(memberId);
    setMemberStatusFilter("all");
    setMemberCommentPage(1);
    setMemberProfileOpen(true);
  };

  // Handle bulk actions from member profile
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
      action: "approve",
      filter: "pending",
    });
  };

  const handleBulkReject = () => {
    if (!selectedMemberId) return;
    const topCls = Array.isArray(memberProfile?.aiAnalysis?.topClassifications)
      ? memberProfile.aiAnalysis.topClassifications
      : [];
    const hasFlaggedComments = topCls.some((cls) =>
      ["flagged", "spam", "harmful"].includes(cls.classification),
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
      action: "reject",
      filter: "flagged",
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

  const handleRefreshAll = () => {
    void refetchStats();
    void refetch();
  };

  const totalCount = stats?.total || 0;
  const safeCount = stats?.safe || 0;
  const flaggedCount = stats?.flagged || 0;
  const spamCount = stats?.spam || 0;
  const harmfulCount = stats?.harmful || 0;
  const averageScore = stats?.averageScore ?? 0;

  const pct = (part: number) => (totalCount > 0 ? Math.round((part / totalCount) * 100) : 0);

  const memberCommentsList = Array.isArray(memberCommentsData?.comments)
    ? memberCommentsData.comments
    : [];
  const memberTopClassifications = Array.isArray(memberProfile?.aiAnalysis?.topClassifications)
    ? memberProfile.aiAnalysis.topClassifications
    : [];
  const selectedCommentIssues = Array.isArray(selectedComment?.detectedIssues)
    ? selectedComment.detectedIssues
    : [];

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Brain}
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span>الرقابة الذكية على التعليقات</span>
              <Badge
                variant="secondary"
                className="gap-1 border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                <Sparkles className="h-3 w-3" />
                GPT-4o-mini
              </Badge>
            </span>
          }
          description="تحليل وفلترة التعليقات تلقائياً باستخدام الذكاء الاصطناعي مع مؤشرات الأمان والمشاعر الفورية"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/dashboard/sentiment-insights">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <HeartPulse className="h-4 w-4 text-rose-500" />
                  <span>نبض الجمهور</span>
                </Button>
              </Link>
              <Link href="/admin/comments/suspicious-words">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  data-testid="link-suspicious-words"
                >
                  <ShieldAlert className="h-4 w-4 text-amber-500" />
                  <span>الكلمات المشبوهة</span>
                </Button>
              </Link>
              <Button
                onClick={handleRefreshAll}
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                title="تحديث البيانات"
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => analyzeAllMutation.mutate()}
                disabled={analyzeAllMutation.isPending}
                size="sm"
                className="gap-2 font-semibold shadow-sm"
                data-testid="button-analyze-all"
              >
                {analyzeAllMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جاري التحليل...</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    <span>تحليل الكل</span>
                  </>
                )}
              </Button>
            </div>
          }
        />

        {(statsError || resultsError) && (
          <Card
            className="border-destructive/40 bg-destructive/5"
            data-testid="moderation-load-error"
          >
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-foreground">تعذّر تحميل بيانات الرقابة الذكية</p>
                  <p className="text-sm text-muted-foreground">
                    تحقق من صلاحية إشراف التعليقات ثم أعد المحاولة. إن استمرت المشكلة فغالباً رفض
                    الخادم الطلب (403).
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleRefreshAll}
                data-testid="button-retry-moderation"
              >
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
            </CardContent>
          </Card>
        )}

        {statsLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : (
          <>
            {/* Top KPI Summary Strip */}
            <div className="space-y-3">
              <SectionHeader
                title="ملخص الرقابة الذكية"
                subtitle="توزيع التعليقات المحللة حسب درجة الأمان والتصنيف الآلي"
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {/* Total Analyzed */}
                <Card className="relative overflow-hidden border-border/70 bg-card shadow-xs transition-all hover:border-primary/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">إجمالي المحلل</p>
                        <div className="mt-1.5 text-2xl font-bold tabular-nums text-foreground sm:text-3xl">
                          {totalCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                        <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>تعليق محلل</span>
                      {(stats?.pending ?? 0) > 0 && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-600 dark:text-amber-400"
                        >
                          {stats?.pending} معلق
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Safe */}
                <Card className="relative overflow-hidden border-border/70 bg-card shadow-xs transition-all hover:border-emerald-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">آمن</p>
                        <div className="mt-1.5 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 sm:text-3xl">
                          {safeCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-600 dark:text-emerald-400">
                        <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">نسبة الأمان</span>
                        <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {pct(safeCount)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${pct(safeCount)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Flagged */}
                <Card className="relative overflow-hidden border-border/70 bg-card shadow-xs transition-all hover:border-amber-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">مشكوك فيه</p>
                        <div className="mt-1.5 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400 sm:text-3xl">
                          {flaggedCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-amber-500/10 p-2.5 text-amber-600 dark:text-amber-400">
                        <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">يحتاج مراجعة</span>
                        <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                          {pct(flaggedCount)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all"
                          style={{ width: `${pct(flaggedCount)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Spam */}
                <Card className="relative overflow-hidden border-border/70 bg-card shadow-xs transition-all hover:border-orange-500/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">سبام</p>
                        <div className="mt-1.5 text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400 sm:text-3xl">
                          {spamCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-orange-500/10 p-2.5 text-orange-600 dark:text-orange-400">
                        <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">محتوى ترويجي/مزعج</span>
                        <span className="font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                          {pct(spamCount)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all"
                          style={{ width: `${pct(spamCount)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Harmful */}
                <Card className="col-span-2 overflow-hidden border-border/70 bg-card shadow-xs transition-all hover:border-rose-500/30 sm:col-span-1">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">ضار</p>
                        <div className="mt-1.5 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400 sm:text-3xl">
                          {harmfulCount}
                        </div>
                      </div>
                      <div className="rounded-lg bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400">
                        <ShieldX className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">مخالفة عالية</span>
                        <span className="font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                          {pct(harmfulCount)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-rose-500 transition-all"
                          style={{ width: `${pct(harmfulCount)}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Secondary Intelligence Strip: Safety Score + Sentiment Overview */}
            {stats && stats.total > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-border/70 bg-card shadow-xs">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-sm font-semibold">متوسط نقاط الأمان</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        مؤشر جودة وسلامة بيئة النقاش العامة
                      </p>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Target className="h-4 w-4" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 space-y-1.5">
                        <Progress value={averageScore} className="h-3" />
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>0% خطر</span>
                          <span>60% مقبول</span>
                          <span>100% آمن</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <span
                          className={`text-2xl font-bold tabular-nums ${getScoreColor(averageScore)}`}
                        >
                          {averageScore.toFixed(1)}%
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          {getScoreRiskLabel(averageScore)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/70 bg-card shadow-xs">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-sm font-semibold">مشاعر التعليقات</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        توزيع نبرة القراء تجاه الموضوعات المنشورة
                      </p>
                    </div>
                    <Link
                      href="/dashboard/sentiment-insights"
                      className="no-min-touch-size inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <span>التفاصيل</span>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Link>
                  </CardHeader>
                  <CardContent>
                    {sentimentStats && sentimentStats.analyzed > 0 ? (
                      <div className="space-y-3">
                        <div
                          className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                          dir="rtl"
                        >
                          <div
                            className="bg-emerald-500 transition-all"
                            style={{
                              width: `${(sentimentStats.positive / sentimentStats.analyzed) * 100}%`,
                            }}
                          />
                          <div
                            className="bg-slate-400 transition-all"
                            style={{
                              width: `${(sentimentStats.neutral / sentimentStats.analyzed) * 100}%`,
                            }}
                          />
                          <div
                            className="bg-rose-500 transition-all"
                            style={{
                              width: `${(sentimentStats.negative / sentimentStats.analyzed) * 100}%`,
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge
                            variant="outline"
                            className="border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400"
                          >
                            إيجابي {sentimentStats.positive}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-slate-500/20 bg-slate-500/10 px-2 py-0.5 text-slate-600 dark:text-slate-400"
                          >
                            محايد {sentimentStats.neutral}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-rose-700 dark:text-rose-400"
                          >
                            سلبي {sentimentStats.negative}
                          </Badge>
                          {sentimentStats.notAnalyzed > 0 && (
                            <span className="text-xs text-muted-foreground">
                              ({sentimentStats.notAnalyzed} بانتظار التحليل)
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        لا توجد تعليقات محللة المشاعر بعد — التحليل يعمل تلقائياً على التعليقات
                        الجديدة
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}

        {/* Advanced Search Section */}
        <div className="space-y-3">
          <SectionHeader
            title="البحث المتقدم"
            subtitle="ابحث في التعليقات حسب المحتوى أو الكاتب أو المقال"
          />
          <Card className="border-border/70 bg-card shadow-xs transition-all">
            <ModerationAdvancedSearch
              onSelectComment={(commentId) => {
                const foundResult = results.find((r) => r.commentId === commentId);
                if (foundResult) {
                  setSelectedComment(foundResult);
                  setDetailsOpen(true);
                }
              }}
              onSelectArticle={(articleId) => {
                window.open(`/admin/articles/${articleId}`, "_blank");
              }}
            />
          </Card>
        </div>

        {/* Moderation Results Section */}
        <div className="space-y-4">
          <SectionHeader
            title="نتائج التحليل"
            subtitle={`عرض ${results.length} تعليق ضمن الفلاتر المحددة`}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={scoreFilter}
                    onValueChange={setScoreFilter}
                    data-testid="select-score-filter"
                  >
                    <SelectTrigger className="h-9 w-[180px] text-xs sm:text-sm">
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
                {(activeTab !== "all" || scoreFilter !== "all") && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("all");
                      setScoreFilter("all");
                    }}
                    className="no-min-touch-size inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                    إعادة ضبط الفلاتر
                  </button>
                )}
              </div>
            }
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList
              className="flex h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-xl bg-muted/60 p-1.5 md:w-auto"
              dir="rtl"
            >
              <TabsTrigger
                value="all"
                className="no-min-touch-size gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
                data-testid="tab-all"
              >
                <span>الكل</span>
                <Badge variant="secondary" className="px-1.5 py-0.5 text-[11px] tabular-nums">
                  {stats?.total || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="safe"
                className="no-min-touch-size gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
                data-testid="tab-safe"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>آمن</span>
                <Badge variant="secondary" className="px-1.5 py-0.5 text-[11px] tabular-nums">
                  {stats?.safe || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="flagged"
                className="no-min-touch-size gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
                data-testid="tab-flagged"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>مشكوك</span>
                <Badge variant="secondary" className="px-1.5 py-0.5 text-[11px] tabular-nums">
                  {stats?.flagged || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="spam"
                className="no-min-touch-size gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
                data-testid="tab-spam"
              >
                <Shield className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                <span>سبام</span>
                <Badge variant="secondary" className="px-1.5 py-0.5 text-[11px] tabular-nums">
                  {stats?.spam || 0}
                </Badge>
              </TabsTrigger>
              <TabsTrigger
                value="harmful"
                className="no-min-touch-size gap-1.5 px-3 py-1.5 text-xs sm:text-sm"
                data-testid="tab-harmful"
              >
                <ShieldX className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                <span>ضار</span>
                <Badge variant="secondary" className="px-1.5 py-0.5 text-[11px] tabular-nums">
                  {stats?.harmful || 0}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab} className="mt-4">
              {resultsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-40 rounded-xl" />
                  ))}
                </div>
              ) : resultsError ? (
                <Card className="border-border/70">
                  <CardContent className="p-12 text-center">
                    <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                    <p className="font-medium text-foreground">تعذّر جلب نتائج التحليل</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      تحقق من الاتصال بالخادم ثم أعد المحاولة
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4 gap-2"
                      onClick={() => void refetch()}
                    >
                      <RefreshCw className="h-4 w-4" />
                      إعادة المحاولة
                    </Button>
                  </CardContent>
                </Card>
              ) : results.length === 0 ? (
                <Card className="border-border/70">
                  <CardContent className="p-12 text-center">
                    <Brain className="mx-auto mb-4 h-12 w-12 text-muted-foreground/60" />
                    <p className="font-medium text-foreground">لا توجد نتائج تحليل مطابقة</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      اضغط على "تحليل الكل" لبدء تحليل التعليقات أو غيّر فلاتر التصنيف
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {results.map((result) => {
                    const classification =
                      classificationColors[result.aiClassification] || classificationColors.safe;
                    const ClassIcon = classification.icon;
                    const detectedIssues = Array.isArray(result?.detectedIssues)
                      ? result.detectedIssues
                      : [];
                    const isPending = result.comment.status === "pending";

                    return (
                      <Card
                        key={result.commentId}
                        data-testid={`moderation-result-${result.commentId}`}
                        dir="rtl"
                        className={`overflow-hidden border-border/80 border-r-4 bg-card shadow-xs transition-all hover:border-border ${classification.accent}`}
                      >
                        <CardContent className="p-4 sm:p-5">
                          {/* Top Row: Classification, Status, Platform, Sentiment + AI Risk Score Meter */}
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${classification.bg}`}
                              >
                                <ClassIcon className={`h-4 w-4 ${classification.text}`} />
                              </div>

                              <Badge
                                variant="secondary"
                                className={`border px-2.5 py-0.5 text-xs font-semibold ${classification.bg} ${classification.text} ${classification.border}`}
                              >
                                {classificationLabels[result.aiClassification] ||
                                  result.aiClassification}
                              </Badge>

                              <Badge
                                variant="outline"
                                className={`px-2 py-0.5 text-xs font-medium ${
                                  result.comment.status === "approved"
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                    : result.comment.status === "rejected"
                                      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                }`}
                              >
                                {result.comment.status === "pending"
                                  ? "معلق للمراجعة"
                                  : result.comment.status === "approved"
                                    ? "معتمد"
                                    : "مرفوض"}
                              </Badge>

                              <PlatformBadge platform={result.comment.platform} />
                              <SentimentBadge sentiment={result.comment.sentiment} />
                            </div>

                            {/* AI Safety / Risk Score Meter */}
                            <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5">
                              <div className="text-right">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-muted-foreground">
                                    نقاط الأمان
                                  </span>
                                  <span
                                    className={`text-sm font-bold tabular-nums ${getScoreColor(
                                      result.moderationScore,
                                    )}`}
                                  >
                                    {result.moderationScore}%
                                  </span>
                                </div>
                                <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:w-28">
                                  <div
                                    className={`h-full rounded-full transition-all ${getProgressColor(
                                      result.moderationScore,
                                    )}`}
                                    style={{
                                      width: `${Math.min(100, Math.max(0, result.moderationScore))}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className={`px-2 py-0.5 text-[11px] font-medium ${getScoreColor(
                                  result.moderationScore,
                                )}`}
                              >
                                {getScoreRiskLabel(result.moderationScore)}
                              </Badge>
                            </div>
                          </div>

                          {/* Comment Content Box */}
                          <div className="mt-3 rounded-lg border border-border/50 bg-muted/25 p-3.5">
                            <p className="text-sm leading-relaxed text-foreground">
                              {result.comment.content}
                            </p>
                          </div>

                          {/* Detected Issues Tags */}
                          {detectedIssues.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">
                                المشاكل المرصودة:
                              </span>
                              {detectedIssues.map((issue) => (
                                <Badge
                                  key={issue}
                                  variant="destructive"
                                  className="gap-1 px-2 py-0.5 text-xs font-medium"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  {issueLabels[issue] || issue}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Bottom Row: Author + Article Context + Action Buttons */}
                          <div className="mt-4 flex flex-col gap-3 border-t border-border/60 pt-3 lg:flex-row lg:items-center lg:justify-between">
                            {/* Metadata & Article Link */}
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => handleMemberProfileClick(result.comment.user.id)}
                                className="no-min-touch-size inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-muted/60 px-2.5 py-0.5 font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                data-testid={`button-member-profile-${result.comment.user.id}`}
                              >
                                <User className="h-3.5 w-3.5 text-primary" />
                                <span>{getUserName(result.comment.user)}</span>
                              </button>

                              <div className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                <span>
                                  {formatDistanceToNow(new Date(result.aiModerationAnalyzedAt), {
                                    addSuffix: true,
                                    locale: arSA,
                                  })}
                                </span>
                              </div>

                              {result.comment.articleTitle && (
                                <a
                                  href={`/article/${result.comment.articleSlug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="no-min-touch-size inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary/5 px-2.5 py-0.5 font-medium text-primary transition-colors hover:bg-primary/10 hover:underline"
                                  data-testid={`link-article-${result.commentId}`}
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="max-w-[180px] truncate sm:max-w-[280px]">
                                    {result.comment.articleTitle}
                                  </span>
                                  <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                              )}
                            </div>

                            {/* One-Click Moderation & Utility Actions */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              {isPending && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => approveMutation.mutate(result.commentId)}
                                    disabled={approveMutation.isPending}
                                    className="no-min-touch-size h-8 gap-1 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700"
                                    data-testid={`button-approve-${result.commentId}`}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                    اعتماد
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => rejectMutation.mutate(result.commentId)}
                                    disabled={rejectMutation.isPending}
                                    className="no-min-touch-size h-8 gap-1 px-3 text-xs"
                                    data-testid={`button-reject-${result.commentId}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    رفض
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      rejectMutation.mutate({
                                        commentId: result.commentId,
                                        reason:
                                          "AI Moderation: تم الرفض وتصنيف التعليق كسبام (Spam)",
                                      })
                                    }
                                    disabled={rejectMutation.isPending}
                                    className="no-min-touch-size h-8 gap-1 border-orange-500/30 bg-orange-500/10 px-2.5 text-xs text-orange-700 hover:bg-orange-500/20 dark:text-orange-400"
                                    title="رفض وتصنيف كسبام"
                                    data-testid={`button-spam-${result.commentId}`}
                                  >
                                    <Ban className="h-3.5 w-3.5" />
                                    سبام
                                  </Button>
                                </>
                              )}

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewDetails(result)}
                                className="no-min-touch-size h-8 gap-1 px-2.5 text-xs"
                                data-testid={`button-view-details-${result.commentId}`}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                تفاصيل
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditClick(result)}
                                className="no-min-touch-size h-8 gap-1 px-2.5 text-xs"
                                data-testid={`button-edit-${result.commentId}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                تعديل
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => analyzeSingleMutation.mutate(result.commentId)}
                                disabled={analyzeSingleMutation.isPending}
                                className="no-min-touch-size h-8 gap-1 px-2.5 text-xs"
                                title="إعادة تحليل التعليق بالذكاء الاصطناعي"
                              >
                                <RefreshCw
                                  className={`h-3.5 w-3.5 ${
                                    analyzeSingleMutation.isPending ? "animate-spin" : ""
                                  }`}
                                />
                                <span className="hidden sm:inline">إعادة تحليل</span>
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteClick(result)}
                                className="no-min-touch-size h-8 gap-1 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                                data-testid={`button-delete-${result.commentId}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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

        {/* AI Analysis Details Dialog */}
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="max-w-2xl" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                تفاصيل تحليل الذكاء الاصطناعي
              </DialogTitle>
              <DialogDescription>تحليل شامل للتعليق بواسطة GPT-4o-mini</DialogDescription>
            </DialogHeader>

            {selectedComment && (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <MessageCircle className="h-4 w-4 text-primary" />
                        محتوى التعليق
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed">{selectedComment.comment.content}</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        نتائج التحليل
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">التصنيف:</span>
                        <Badge
                          className={`border-0 px-2.5 py-0.5 ${classificationColors[selectedComment.aiClassification]?.bg} ${classificationColors[selectedComment.aiClassification]?.text}`}
                        >
                          {classificationLabels[selectedComment.aiClassification]}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">نقاط الأمان:</span>
                          <span
                            className={`font-bold tabular-nums ${getScoreColor(selectedComment.moderationScore)}`}
                          >
                            {selectedComment.moderationScore}%
                          </span>
                        </div>
                        <Progress value={selectedComment.moderationScore} className="h-2" />
                      </div>

                      {selectedCommentIssues.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-sm text-muted-foreground">المشاكل المكتشفة:</span>
                          <div className="flex flex-wrap gap-2">
                            {selectedCommentIssues.map((issue) => (
                              <Badge key={issue} variant="destructive" className="py-0.5">
                                <AlertTriangle className="ml-1 h-3 w-3" />
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
                          {format(new Date(selectedComment.aiModerationAnalyzedAt), "PPpp", {
                            locale: arSA,
                          })}
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
                    className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
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
                هل أنت متأكد من حذف هذا التعليق؟ لا يمكن التراجع عن هذا الإجراء. سيتم حفظ سجل الحذف
                للمراجعة.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {deletingComment && (
              <div className="my-4 rounded-lg bg-muted p-3 text-sm">
                <p className="mb-2 text-muted-foreground">التعليق المراد حذفه:</p>
                <p className="line-clamp-3">{deletingComment.comment.content}</p>
              </div>
            )}

            <div className="mb-4 space-y-2">
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
                className="gap-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
          <DialogContent
            className="max-h-[90vh] max-w-3xl"
            dir="rtl"
            data-testid="dialog-member-profile"
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCircle className="h-5 w-5" />
                ملف العضو
              </DialogTitle>
              <DialogDescription>عرض معلومات العضو وسجل التعليقات</DialogDescription>
            </DialogHeader>

            {memberProfileLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                              memberProfile.user.email,
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold" data-testid="text-member-name">
                            {memberProfile.user.firstName && memberProfile.user.lastName
                              ? `${memberProfile.user.firstName} ${memberProfile.user.lastName}`
                              : memberProfile.user.email.split("@")[0]}
                          </h3>
                          <p
                            className="text-sm text-muted-foreground"
                            data-testid="text-member-email"
                          >
                            {memberProfile.user.email}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1" data-testid="text-member-since">
                              <Calendar className="h-3 w-3" />
                              عضو منذ{" "}
                              {format(new Date(memberProfile.user.createdAt), "PP", {
                                locale: arSA,
                              })}
                            </div>
                            <div className="flex items-center gap-1" data-testid="text-days-active">
                              <History className="h-3 w-3" />
                              {differenceInDays(
                                new Date(),
                                new Date(memberProfile.user.createdAt),
                              )}{" "}
                              يوم نشط
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Stats Cards Grid */}
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Card data-testid="card-stat-total">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">إجمالي التعليقات</p>
                            <p className="text-2xl font-bold tabular-nums">
                              {memberProfile.stats.totalComments}
                            </p>
                          </div>
                          <div className="rounded-full bg-primary/10 p-2">
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
                            <p className="text-2xl font-bold tabular-nums text-emerald-600">
                              {memberProfile.stats.approvedComments}
                            </p>
                          </div>
                          <div className="rounded-full bg-emerald-500/10 p-2">
                            <CheckCircle className="h-5 w-5 text-emerald-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-stat-rejected">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">التعليقات المرفوضة</p>
                            <p className="text-2xl font-bold tabular-nums text-rose-600">
                              {memberProfile.stats.rejectedComments}
                            </p>
                          </div>
                          <div className="rounded-full bg-rose-500/10 p-2">
                            <XCircle className="h-5 w-5 text-rose-500" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card data-testid="card-stat-safety">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground">نقاط الأمان AI</p>
                            <p
                              className={`text-2xl font-bold tabular-nums ${getScoreColor(memberProfile.stats.aiSafetyScore)}`}
                            >
                              {memberProfile.stats.aiSafetyScore}%
                            </p>
                          </div>
                          <div className="rounded-full bg-primary/10 p-2">
                            <Shield className="h-5 w-5 text-primary" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* AI Behavior Analysis Section */}
                  <Card data-testid="card-ai-analysis">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <Brain className="h-4 w-4" />
                        تحليل سلوك AI
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">السلوك العام:</span>
                        <Badge
                          className={`border-0 py-0.5 ${behaviorColors[memberProfile.aiAnalysis.overallBehavior]?.bg} ${behaviorColors[memberProfile.aiAnalysis.overallBehavior]?.text}`}
                          data-testid="badge-behavior"
                        >
                          {behaviorLabels[memberProfile.aiAnalysis.overallBehavior]}
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">نقاط السلوك:</span>
                          <span
                            className={`font-bold tabular-nums ${getScoreColor(memberProfile.aiAnalysis.behaviorScore)}`}
                          >
                            {memberProfile.aiAnalysis.behaviorScore}%
                          </span>
                        </div>
                        <Progress
                          value={memberProfile.aiAnalysis.behaviorScore}
                          className="h-2"
                          data-testid="progress-behavior-score"
                        />
                      </div>

                      {memberTopClassifications.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-sm text-muted-foreground">أعلى التصنيفات:</span>
                          <div className="space-y-2">
                            {memberTopClassifications.map((cls) => (
                              <div key={cls.classification} className="flex items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className={`border-0 py-0.5 ${classificationColors[cls.classification]?.bg} ${classificationColors[cls.classification]?.text}`}
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
                        <CardTitle className="flex items-center gap-2 text-sm">
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
                      ) : memberCommentsList.length > 0 ? (
                        <div className="space-y-3">
                          {memberCommentsList.map((comment) => (
                            <div
                              key={comment.id}
                              className="rounded-lg border border-border/50 bg-muted/50 p-4"
                              data-testid={`member-comment-${comment.id}`}
                            >
                              {/* Comment Header with Status */}
                              <div className="mb-3 flex items-start justify-between gap-3">
                                <p className="flex-1 text-sm leading-relaxed">{comment.content}</p>
                                <Badge
                                  variant="outline"
                                  className={`shrink-0 py-0.5 ${
                                    comment.status === "approved"
                                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                                      : comment.status === "rejected"
                                        ? "border-rose-500/20 bg-rose-500/10 text-rose-600"
                                        : "border-amber-500/20 bg-amber-500/10 text-amber-600"
                                  }`}
                                >
                                  {comment.status === "approved"
                                    ? "معتمد"
                                    : comment.status === "rejected"
                                      ? "مرفوض"
                                      : "معلق"}
                                </Badge>
                              </div>

                              {/* Article Link - Prominent Display */}
                              {comment.articleTitle && (
                                <a
                                  href={`/article/${comment.articleSlug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="no-min-touch-size group mb-3 flex items-center gap-2 rounded-md bg-primary/5 p-2 transition-colors hover:bg-primary/10"
                                  data-testid={`link-article-${comment.id}`}
                                >
                                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                                  <span className="truncate text-sm text-primary group-hover:underline">
                                    {comment.articleTitle}
                                  </span>
                                  <ExternalLink className="mr-auto h-3 w-3 text-primary/60" />
                                </a>
                              )}

                              {/* Comment Meta Info */}
                              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
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
                                    className={`border-0 py-0.5 text-xs ${classificationColors[comment.aiClassification]?.bg} ${classificationColors[comment.aiClassification]?.text}`}
                                  >
                                    {classificationLabels[comment.aiClassification] ||
                                      comment.aiClassification}
                                  </Badge>
                                )}
                                {comment.moderationScore !== undefined && (
                                  <span
                                    className={`font-medium tabular-nums ${getScoreColor(comment.moderationScore)}`}
                                  >
                                    نقاط الأمان: {comment.moderationScore}%
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}

                          {/* Pagination */}
                          {(memberCommentsData?.totalPages ?? 0) > 1 && (
                            <div className="mt-4 flex items-center justify-center gap-2">
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
                                صفحة {memberCommentPage} من {memberCommentsData?.totalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setMemberCommentPage((p) =>
                                    Math.min(memberCommentsData?.totalPages || 1, p + 1),
                                  )
                                }
                                disabled={memberCommentPage === memberCommentsData?.totalPages}
                                data-testid="button-next-page"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-muted-foreground">
                          <MessageSquare className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          <p>لا توجد تعليقات</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <UserCircle className="mx-auto mb-2 h-12 w-12 opacity-50" />
                <p>فشل تحميل ملف العضو</p>
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setMemberProfileOpen(false)}
                data-testid="button-close-profile"
              >
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
              {memberProfile &&
                memberCommentsList.some(
                  (c) =>
                    c.aiClassification &&
                    ["flagged", "spam", "harmful"].includes(c.aiClassification),
                ) && (
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
