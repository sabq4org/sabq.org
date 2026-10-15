import { useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Mail,
  Users,
  History,
  Plus,
  MoreVertical,
  Edit,
  Trash2,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Search,
  UserPlus,
  X,
  RefreshCw,
  Eye,
  Bold,
  Italic,
  List,
  ListOrdered,
  Filter,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface CommunicationGroup {
  id: string;
  name: string;
  description?: string;
  color: string;
  memberCount: number;
  members?: GroupMember[];
  createdAt: string;
  updatedAt: string;
}

interface GroupMember {
  id: string;
  userId: string;
  user?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  addedAt: string;
}

type LicenseFilter = "all" | "with_valid" | "without_valid";

interface Campaign {
  id: string;
  title: string;
  subject: string;
  contentHtml: string;
  status: "draft" | "scheduled" | "sending" | "sent";
  audienceType: "groups" | "roles" | "custom";
  targetGroups?: string[];
  targetRoles?: string[];
  targetUserIds?: string[];
  scheduledAt?: string;
  sentAt?: string;
  recipientCount?: number;
  sentCount?: number;
  failedCount?: number;
  metadata?: { licenseFilter?: LicenseFilter } | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const LICENSE_FILTER_LABELS: Record<LicenseFilter, string> = {
  all: "كل حالات الترخيص",
  with_valid: "يملكون ترخيصاً سارياً",
  without_valid: "بلا ترخيص ساري",
};

interface CampaignDelivery {
  id: string;
  campaignId: string;
  userId: string;
  email?: string;
  channel: string;
  status: "pending" | "sent" | "failed";
  sentAt?: string;
  failureReason?: string;
  user?: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

interface Role {
  id: string;
  name: string;
  nameAr?: string;
}

interface SearchUser {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  role?: string;
}

const statusBadgeConfig: Record<Campaign["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "مسودة", variant: "secondary" },
  scheduled: { label: "مجدولة", variant: "outline" },
  sending: { label: "قيد الإرسال", variant: "default" },
  sent: { label: "تم الإرسال", variant: "default" },
};

const colorOptions = [
  { value: "#3B82F6", label: "أزرق" },
  { value: "#10B981", label: "أخضر" },
  { value: "#F59E0B", label: "برتقالي" },
  { value: "#EF4444", label: "أحمر" },
  { value: "#8B5CF6", label: "بنفسجي" },
  { value: "#EC4899", label: "وردي" },
  { value: "#6B7280", label: "رمادي" },
  { value: "#14B8A6", label: "فيروزي" },
];

function RichTextEditor({ content, onChange }: { content: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "min-h-[200px] p-4 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring prose prose-sm max-w-none",
        dir: "rtl",
      },
    },
  });

  return (
    <div className="space-y-2">
      {editor && (
        <div className="flex gap-1 flex-wrap border-b pb-2 mb-2 bg-muted/50 p-2 rounded-md">
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("bold") ? "default" : "ghost"}
            onClick={() => editor.chain().focus().toggleBold().run()}
            data-testid="button-bold"
            title="غامق"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("italic") ? "default" : "ghost"}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            data-testid="button-italic"
            title="مائل"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("bulletList") ? "default" : "ghost"}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            data-testid="button-bullet-list"
            title="قائمة نقطية"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={editor.isActive("orderedList") ? "default" : "ghost"}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            data-testid="button-ordered-list"
            title="قائمة مرقمة"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>
      )}
      <EditorContent editor={editor} data-testid="editor-content" />
    </div>
  );
}

function CampaignsTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Campaign["status"]>("all");
  const [audienceFilter, setAudienceFilter] = useState<"all" | Campaign["audienceType"]>("all");
  const [formData, setFormData] = useState({
    title: "",
    subject: "",
    contentHtml: "",
    audienceType: "roles" as "groups" | "roles" | "custom",
    targetGroups: [] as string[],
    targetRoles: [] as string[],
    targetUserIds: [] as string[],
    licenseFilter: "all" as LicenseFilter,
    scheduleEnabled: false,
    scheduledAt: "",
  });

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/staff-communications/campaigns"],
  });

  const { data: groups } = useQuery<CommunicationGroup[]>({
    queryKey: ["/api/admin/staff-communications/groups"],
  });

  const { data: roles } = useQuery<Role[]>({
    queryKey: ["/api/admin/staff-communications/roles"],
  });

  const safeCampaigns = useMemo(
    () => (Array.isArray(campaigns) ? campaigns : []),
    [campaigns]
  );
  const safeGroups = useMemo(
    () => (Array.isArray(groups) ? groups : []),
    [groups]
  );
  const safeRoles = useMemo(
    () => (Array.isArray(roles) ? roles : []),
    [roles]
  );

  const statusCounts = useMemo(() => {
    return {
      all: safeCampaigns.length,
      draft: safeCampaigns.filter((c) => c.status === "draft").length,
      scheduled: safeCampaigns.filter((c) => c.status === "scheduled").length,
      sending: safeCampaigns.filter((c) => c.status === "sending").length,
      sent: safeCampaigns.filter((c) => c.status === "sent").length,
    };
  }, [safeCampaigns]);

  const filteredCampaigns = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return safeCampaigns.filter((campaign) => {
      if (statusFilter !== "all" && campaign.status !== statusFilter) return false;
      if (audienceFilter !== "all" && campaign.audienceType !== audienceFilter) return false;
      if (q) {
        const matchesTitle = (campaign.title || "").toLowerCase().includes(q);
        const matchesSubject = (campaign.subject || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubject) return false;
      }
      return true;
    });
  }, [safeCampaigns, statusFilter, audienceFilter, searchQuery]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("/api/admin/staff-communications/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title: data.title,
          subject: data.subject,
          contentHtml: data.contentHtml,
          audienceType: data.audienceType,
          targetGroups: data.audienceType === "groups" ? data.targetGroups : undefined,
          targetRoles: data.audienceType === "roles" ? data.targetRoles : undefined,
          targetUserIds: data.audienceType === "custom" ? data.targetUserIds : undefined,
          metadata: { licenseFilter: data.licenseFilter },
          scheduledAt: data.scheduleEnabled ? data.scheduledAt : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/campaigns"] });
      toast({ title: "تم إنشاء الحملة بنجاح" });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest(`/api/admin/staff-communications/campaigns/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: data.title,
          subject: data.subject,
          contentHtml: data.contentHtml,
          audienceType: data.audienceType,
          targetGroups: data.audienceType === "groups" ? data.targetGroups : undefined,
          targetRoles: data.audienceType === "roles" ? data.targetRoles : undefined,
          targetUserIds: data.audienceType === "custom" ? data.targetUserIds : undefined,
          metadata: { licenseFilter: data.licenseFilter },
          scheduledAt: data.scheduleEnabled ? data.scheduledAt : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/campaigns"] });
      toast({ title: "تم تحديث الحملة بنجاح" });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/staff-communications/campaigns/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/campaigns"] });
      toast({ title: "تم حذف الحملة" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/staff-communications/campaigns/${id}/send`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/campaigns"] });
      toast({ title: "تم إرسال الحملة بنجاح" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      subject: "",
      contentHtml: "",
      audienceType: "roles",
      targetGroups: [],
      targetRoles: [],
      targetUserIds: [],
      licenseFilter: "all",
      scheduleEnabled: false,
      scheduledAt: "",
    });
    setEditingCampaign(null);
    setIsCreateOpen(false);
  };

  const handleEdit = (campaign: Campaign) => {
    const licenseFilter = campaign.metadata?.licenseFilter;
    setEditingCampaign(campaign);
    setFormData({
      title: campaign.title,
      subject: campaign.subject,
      contentHtml: campaign.contentHtml,
      audienceType: campaign.audienceType,
      targetGroups: Array.isArray(campaign.targetGroups) ? campaign.targetGroups : [],
      targetRoles: Array.isArray(campaign.targetRoles) ? campaign.targetRoles : [],
      targetUserIds: Array.isArray(campaign.targetUserIds) ? campaign.targetUserIds : [],
      licenseFilter:
        licenseFilter === "with_valid" || licenseFilter === "without_valid"
          ? licenseFilter
          : "all",
      scheduleEnabled: !!campaign.scheduledAt,
      scheduledAt: campaign.scheduledAt || "",
    });
    setIsCreateOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.subject || !formData.contentHtml) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }

    if (editingCampaign) {
      updateMutation.mutate({ id: editingCampaign.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const toggleRole = (roleId: string) => {
    setFormData((prev) => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(roleId)
        ? prev.targetRoles.filter((r) => r !== roleId)
        : [...prev.targetRoles, roleId],
    }));
  };

  const toggleGroup = (groupId: string) => {
    setFormData((prev) => ({
      ...prev,
      targetGroups: prev.targetGroups.includes(groupId)
        ? prev.targetGroups.filter((g) => g !== groupId)
        : [...prev.targetGroups, groupId],
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const statusPills: Array<{ value: "all" | Campaign["status"]; label: string; count: number }> = [
    { value: "all", label: "الكل", count: statusCounts.all },
    { value: "draft", label: "مسودة", count: statusCounts.draft },
    { value: "scheduled", label: "مجدولة", count: statusCounts.scheduled },
    { value: "sending", label: "قيد الإرسال", count: statusCounts.sending },
    { value: "sent", label: "تم الإرسال", count: statusCounts.sent },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold" data-testid="text-campaigns-title">
            حملات الرسائل
          </h2>
          <Badge variant="secondary" className="tabular-nums">
            {filteredCampaigns.length}
          </Badge>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-campaign">
          <Plus className="h-4 w-4 ml-2" />
          إنشاء حملة جديدة
        </Button>
      </div>

      {/* Search & Quick Filter Toolbar */}
      <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بعنوان الحملة أو موضوع البريد..."
              className="pr-9"
              data-testid="input-search-campaigns"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="مسح البحث"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="w-full sm:w-48">
            <Select
              value={audienceFilter}
              onValueChange={(val: "all" | Campaign["audienceType"]) => setAudienceFilter(val)}
            >
              <SelectTrigger data-testid="select-filter-audience">
                <Filter className="h-4 w-4 ml-2 text-muted-foreground" />
                <SelectValue placeholder="نوع الجمهور" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الجماهير</SelectItem>
                <SelectItem value="roles">حسب الأدوار</SelectItem>
                <SelectItem value="groups">حسب المجموعات</SelectItem>
                <SelectItem value="custom">مخصص</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {statusPills.map((pill) => {
            const active = statusFilter === pill.value;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => setStatusFilter(pill.value)}
                data-testid={`filter-campaign-status-${pill.value}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span>{pill.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!filteredCampaigns.length ? (
        <Card className="rounded-xl border-border/60 bg-card">
          <div className="text-center py-12 text-muted-foreground" data-testid="text-no-campaigns">
            <Mail className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">لا توجد حملات حتى الآن</p>
            <p className="text-xs mt-1">يمكنك إنشاء حملة تواصل جديدة لإرسالها لأعضاء الفريق</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop Table View */}
          <Card className="hidden md:block rounded-xl border-border/60 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right">الحملة والموضوع</TableHead>
                  <TableHead className="text-right">الجمهور المستهدف</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">التوقيت</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => (
                  <TableRow
                    key={campaign.id}
                    data-testid={`campaign-item-${campaign.id}`}
                    className="hover:bg-muted/20"
                  >
                    <TableCell className="max-w-md">
                      <div className="space-y-1">
                        <h3
                          className="font-semibold text-foreground truncate"
                          data-testid={`text-campaign-title-${campaign.id}`}
                        >
                          {campaign.title}
                        </h3>
                        <p
                          className="text-xs text-muted-foreground truncate"
                          data-testid={`text-campaign-subject-${campaign.id}`}
                        >
                          {campaign.subject}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-xs font-normal">
                          {campaign.audienceType === "roles" && "حسب الأدوار"}
                          {campaign.audienceType === "groups" && "حسب المجموعات"}
                          {campaign.audienceType === "custom" && "مخصص"}
                        </Badge>
                        {campaign.metadata?.licenseFilter &&
                          campaign.metadata.licenseFilter !== "all" && (
                            <Badge
                              variant="secondary"
                              className="text-xs font-normal"
                              data-testid={`text-license-filter-${campaign.id}`}
                            >
                              {LICENSE_FILTER_LABELS[campaign.metadata.licenseFilter]}
                            </Badge>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusBadgeConfig[campaign.status]?.variant || "secondary"}
                        data-testid={`badge-status-${campaign.id}`}
                      >
                        {statusBadgeConfig[campaign.status]?.label || campaign.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {campaign.sentAt ? (
                        <span>
                          أُرسلت: {format(new Date(campaign.sentAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                        </span>
                      ) : campaign.scheduledAt && campaign.status === "scheduled" ? (
                        <span>
                          مجدولة: {format(new Date(campaign.scheduledAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                        </span>
                      ) : campaign.createdAt ? (
                        <span>
                          أُنشئت: {format(new Date(campaign.createdAt), "dd MMMM yyyy", { locale: ar })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {(campaign.status === "draft" || campaign.status === "scheduled") && (
                          <Button
                            size="sm"
                            onClick={() => sendMutation.mutate(campaign.id)}
                            disabled={sendMutation.isPending}
                            data-testid={`button-send-${campaign.id}`}
                          >
                            <Send className="h-4 w-4 ml-1" />
                            {campaign.status === "scheduled" ? "إرسال الآن بدل الجدولة" : "إرسال الآن"}
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" data-testid={`button-menu-${campaign.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(campaign.status === "draft" || campaign.status === "scheduled") && (
                              <DropdownMenuItem
                                onClick={() => handleEdit(campaign)}
                                data-testid={`menu-edit-${campaign.id}`}
                              >
                                <Edit className="h-4 w-4 ml-2" />
                                تعديل
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => deleteMutation.mutate(campaign.id)}
                              className="text-destructive"
                              data-testid={`menu-delete-${campaign.id}`}
                            >
                              <Trash2 className="h-4 w-4 ml-2" />
                              حذف
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile Stacked Cards View */}
          <div className="space-y-3 md:hidden">
            {filteredCampaigns.map((campaign) => (
              <Card
                key={campaign.id}
                className="rounded-xl border-border/60 bg-card p-4 space-y-3"
                data-testid={`campaign-item-${campaign.id}-mobile`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className="font-semibold text-foreground truncate"
                        data-testid={`text-campaign-title-${campaign.id}-mobile`}
                      >
                        {campaign.title}
                      </h3>
                      <Badge
                        variant={statusBadgeConfig[campaign.status]?.variant || "secondary"}
                        data-testid={`badge-status-${campaign.id}-mobile`}
                      >
                        {statusBadgeConfig[campaign.status]?.label || campaign.status}
                      </Badge>
                    </div>
                    <p
                      className="text-sm text-muted-foreground line-clamp-2"
                      data-testid={`text-campaign-subject-${campaign.id}-mobile`}
                    >
                      {campaign.subject}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`button-menu-${campaign.id}-mobile`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {(campaign.status === "draft" || campaign.status === "scheduled") && (
                        <DropdownMenuItem
                          onClick={() => handleEdit(campaign)}
                          data-testid={`menu-edit-${campaign.id}-mobile`}
                        >
                          <Edit className="h-4 w-4 ml-2" />
                          تعديل
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => deleteMutation.mutate(campaign.id)}
                        className="text-destructive"
                        data-testid={`menu-delete-${campaign.id}-mobile`}
                      >
                        <Trash2 className="h-4 w-4 ml-2" />
                        حذف
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs font-normal">
                    {campaign.audienceType === "roles" && "حسب الأدوار"}
                    {campaign.audienceType === "groups" && "حسب المجموعات"}
                    {campaign.audienceType === "custom" && "مخصص"}
                  </Badge>
                  {campaign.metadata?.licenseFilter &&
                    campaign.metadata.licenseFilter !== "all" && (
                      <Badge
                        variant="secondary"
                        className="text-xs font-normal"
                        data-testid={`text-license-filter-${campaign.id}-mobile`}
                      >
                        {LICENSE_FILTER_LABELS[campaign.metadata.licenseFilter]}
                      </Badge>
                    )}
                  {campaign.sentAt && (
                    <span className="tabular-nums">
                      أُرسلت: {format(new Date(campaign.sentAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                    </span>
                  )}
                  {campaign.scheduledAt && campaign.status === "scheduled" && (
                    <span className="tabular-nums">
                      مجدولة: {format(new Date(campaign.scheduledAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                    </span>
                  )}
                </div>

                {(campaign.status === "draft" || campaign.status === "scheduled") && (
                  <div className="pt-2 border-t border-border/50">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => sendMutation.mutate(campaign.id)}
                      disabled={sendMutation.isPending}
                      data-testid={`button-send-${campaign.id}-mobile`}
                    >
                      <Send className="h-4 w-4 ml-1.5" />
                      {campaign.status === "scheduled" ? "إرسال الآن بدل الجدولة" : "إرسال الآن"}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingCampaign ? "تعديل الحملة" : "إنشاء حملة جديدة"}
            </DialogTitle>
            <DialogDescription>
              أنشئ حملة رسائل جديدة للتواصل مع فريق العمل
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">عنوان الحملة *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="مثال: تحديث سياسة التحرير"
                data-testid="input-campaign-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="subject">موضوع البريد *</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                placeholder="مثال: تحديثات مهمة بخصوص..."
                data-testid="input-campaign-subject"
              />
            </div>

            <div className="space-y-2">
              <Label>محتوى الرسالة *</Label>
              <RichTextEditor
                content={formData.contentHtml}
                onChange={(html) => setFormData((prev) => ({ ...prev, contentHtml: html }))}
              />
            </div>

            <div className="space-y-2">
              <Label>الجمهور المستهدف</Label>
              <Select
                value={formData.audienceType}
                onValueChange={(value: "groups" | "roles" | "custom") =>
                  setFormData((prev) => ({ ...prev, audienceType: value }))
                }
              >
                <SelectTrigger data-testid="select-audience-type">
                  <SelectValue placeholder="اختر نوع الجمهور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="roles">حسب الأدوار</SelectItem>
                  <SelectItem value="groups">حسب المجموعات</SelectItem>
                  <SelectItem value="custom">مخصص</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.audienceType === "roles" && safeRoles.length > 0 && (
              <div className="space-y-2">
                <Label>اختر الأدوار</Label>
                <div className="flex flex-wrap gap-2">
                  {safeRoles.map((role) => (
                    <Badge
                      key={role.id}
                      variant={formData.targetRoles.includes(role.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleRole(role.id)}
                      data-testid={`badge-role-${role.id}`}
                    >
                      {role.nameAr || role.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {formData.audienceType === "groups" && safeGroups.length > 0 && (
              <div className="space-y-2">
                <Label>اختر المجموعات</Label>
                <div className="flex flex-wrap gap-2">
                  {safeGroups.map((group) => (
                    <Badge
                      key={group.id}
                      variant={formData.targetGroups.includes(group.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      style={{
                        backgroundColor: formData.targetGroups.includes(group.id) ? group.color : undefined,
                        borderColor: group.color,
                      }}
                      onClick={() => toggleGroup(group.id)}
                      data-testid={`badge-group-${group.id}`}
                    >
                      {group.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>الترخيص المهني</Label>
              <Select
                value={formData.licenseFilter}
                onValueChange={(value: LicenseFilter) =>
                  setFormData((prev) => ({ ...prev, licenseFilter: value }))
                }
              >
                <SelectTrigger data-testid="select-license-filter">
                  <SelectValue placeholder="فلتر الترخيص" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{LICENSE_FILTER_LABELS.all}</SelectItem>
                  <SelectItem value="with_valid">{LICENSE_FILTER_LABELS.with_valid}</SelectItem>
                  <SelectItem value="without_valid">{LICENSE_FILTER_LABELS.without_valid}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                «بلا ترخيص ساري» يشمل من لم يرفع ملفاً، أو منتهياً، أو تحت المراجعة، أو يحتاج تصحيحاً — مناسب لحث الكتاب والمراسلين على استخراج الترخيص.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="schedule"
                checked={formData.scheduleEnabled}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, scheduleEnabled: checked }))}
                data-testid="switch-schedule"
              />
              <Label htmlFor="schedule">جدولة الإرسال</Label>
            </div>

            {formData.scheduleEnabled && (
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">تاريخ ووقت الإرسال</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData((prev) => ({ ...prev, scheduledAt: e.target.value }))}
                  data-testid="input-scheduled-at"
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingCampaign
                  ? "حفظ التغييرات"
                  : formData.scheduleEnabled
                    ? "جدولة الحملة"
                    : "إنشاء الحملة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface RoleUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profileImageUrl: string | null;
  displayName: string;
  isAlreadyMember: boolean;
}

function GroupsTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CommunicationGroup | null>(null);
  const [managingGroup, setManagingGroup] = useState<CommunicationGroup | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>("none");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [groupSearch, setGroupSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
  });

  const { data: groups, isLoading } = useQuery<CommunicationGroup[]>({
    queryKey: ["/api/admin/staff-communications/groups"],
  });

  const { data: availableRoles } = useQuery<Role[]>({
    queryKey: ["/api/admin/staff-communications/roles"],
  });

  const activeRoleId = selectedRoleId === "none" ? "" : selectedRoleId;

  const { data: roleUsers, isLoading: isLoadingRoleUsers } = useQuery<RoleUser[]>({
    queryKey: ["/api/admin/staff-communications/roles", activeRoleId, "users", { groupId: managingGroup?.id }],
    enabled: !!activeRoleId && !!managingGroup,
  });

  const { data: groupMembers, refetch: refetchMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/admin/staff-communications/groups", managingGroup?.id, "members"],
    enabled: !!managingGroup,
  });

  const safeGroups = useMemo(
    () => (Array.isArray(groups) ? groups : []),
    [groups]
  );
  const safeAvailableRoles = useMemo(
    () => (Array.isArray(availableRoles) ? availableRoles : []),
    [availableRoles]
  );
  const safeRoleUsers = useMemo(
    () => (Array.isArray(roleUsers) ? roleUsers : []),
    [roleUsers]
  );
  const safeGroupMembers = useMemo(
    () => (Array.isArray(groupMembers) ? groupMembers : []),
    [groupMembers]
  );

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return safeGroups;
    return safeGroups.filter(
      (g) =>
        (g.name || "").toLowerCase().includes(q) ||
        (g.description || "").toLowerCase().includes(q)
    );
  }, [safeGroups, groupSearch]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("/api/admin/staff-communications/groups", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/groups"] });
      toast({ title: "تم إنشاء المجموعة بنجاح" });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      return apiRequest(`/api/admin/staff-communications/groups/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/groups"] });
      toast({ title: "تم تحديث المجموعة بنجاح" });
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/staff-communications/groups/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/groups"] });
      toast({ title: "تم حذف المجموعة" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const initializeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/admin/staff-communications/groups/initialize", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/groups"] });
      toast({ title: "تم إنشاء المجموعات الافتراضية" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const batchAddMembersMutation = useMutation({
    mutationFn: async ({ groupId, userIds }: { groupId: string; userIds: string[] }) => {
      return apiRequest(`/api/admin/staff-communications/groups/${groupId}/members/batch`, {
        method: "POST",
        body: JSON.stringify({ userIds }),
      });
    },
    onSuccess: (data: { added: number; skipped: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/groups"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/admin/staff-communications/roles", activeRoleId, "users", { groupId: managingGroup?.id }],
      });
      refetchMembers();
      toast({ title: `تم إضافة ${data.added} عضو` });
      setSelectedUserIds(new Set());
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      return apiRequest(`/api/admin/staff-communications/groups/${groupId}/members/${userId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/groups"] });
      refetchMembers();
      toast({ title: "تمت إزالة العضو" });
    },
    onError: (error: Error) => {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ name: "", description: "", color: "#3B82F6" });
    setEditingGroup(null);
    setIsCreateOpen(false);
  };

  const handleEdit = (group: CommunicationGroup) => {
    setEditingGroup(group);
    setFormData({
      name: group.name,
      description: group.description || "",
      color: group.color,
    });
    setIsCreateOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: "خطأ", description: "يرجى إدخال اسم المجموعة", variant: "destructive" });
      return;
    }

    if (editingGroup) {
      updateMutation.mutate({ id: editingGroup.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const availableRoleUsers = safeRoleUsers.filter((u) => !u.isAlreadyMember);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold" data-testid="text-groups-title">
            مجموعات التواصل
          </h2>
          <Badge variant="secondary" className="tabular-nums">
            {filteredGroups.length}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {!safeGroups.length && (
            <Button
              variant="outline"
              onClick={() => initializeMutation.mutate()}
              disabled={initializeMutation.isPending}
              data-testid="button-initialize-groups"
            >
              <RefreshCw className="h-4 w-4 ml-2" />
              إنشاء مجموعات افتراضية
            </Button>
          )}
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-group">
            <Plus className="h-4 w-4 ml-2" />
            مجموعة جديدة
          </Button>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="ابحث باسم المجموعة أو الوصف..."
            className="pr-9"
            data-testid="input-search-groups"
          />
          {groupSearch && (
            <button
              type="button"
              onClick={() => setGroupSearch("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="مسح البحث"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {!filteredGroups.length ? (
        <Card className="rounded-xl border-border/60 bg-card">
          <div className="text-center py-12 text-muted-foreground" data-testid="text-no-groups">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">لا توجد مجموعات حتى الآن</p>
            <p className="text-xs mt-1">أنشئ مجموعات تواصل مخصصة لتسهيل إرسال الحملات للفرق</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredGroups.map((group) => (
            <Card
              key={group.id}
              className="rounded-xl border-border/60 bg-card p-4 transition-all hover:shadow-sm"
              data-testid={`group-card-${group.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: group.color + "20" }}
                  >
                    <Users className="h-5 w-5" style={{ color: group.color }} />
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="font-semibold text-foreground truncate"
                      data-testid={`text-group-name-${group.id}`}
                    >
                      {group.name}
                    </h3>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {group.memberCount || 0} عضو
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" data-testid={`button-group-menu-${group.id}`}>
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setManagingGroup(group)}
                      data-testid={`menu-manage-${group.id}`}
                    >
                      <UserPlus className="h-4 w-4 ml-2" />
                      إدارة الأعضاء
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleEdit(group)}
                      data-testid={`menu-edit-group-${group.id}`}
                    >
                      <Edit className="h-4 w-4 ml-2" />
                      تعديل
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => deleteMutation.mutate(group.id)}
                      className="text-destructive"
                      data-testid={`menu-delete-group-${group.id}`}
                    >
                      <Trash2 className="h-4 w-4 ml-2" />
                      حذف
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {group.description ? (
                <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                  {group.description}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/60 mt-3 italic">بدون وصف</p>
              )}
              <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {group.createdAt
                    ? format(new Date(group.createdAt), "dd/MM/yyyy", { locale: ar })
                    : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setManagingGroup(group)}
                >
                  <UserPlus className="h-3.5 w-3.5 ml-1" />
                  الأعضاء
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCreateOpen} onOpenChange={(open) => !open && resetForm()}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="text-group-dialog-title">
              {editingGroup ? "تعديل المجموعة" : "إنشاء مجموعة جديدة"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="groupName">اسم المجموعة *</Label>
              <Input
                id="groupName"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="مثال: فريق التحرير"
                data-testid="input-group-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="groupDesc">الوصف</Label>
              <Input
                id="groupDesc"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="وصف مختصر للمجموعة"
                data-testid="input-group-description"
              />
            </div>

            <div className="space-y-2">
              <Label>اللون</Label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 ${
                      formData.color === color.value ? "border-foreground" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setFormData((prev) => ({ ...prev, color: color.value }))}
                    title={color.label}
                    data-testid={`color-option-${color.value}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel-group">
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-group"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "جاري الحفظ..."
                : editingGroup
                  ? "حفظ التغييرات"
                  : "إنشاء المجموعة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!managingGroup}
        onOpenChange={(open) => {
          if (!open) {
            setManagingGroup(null);
            setSelectedRoleId("none");
            setSelectedUserIds(new Set());
          }
        }}
      >
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="text-manage-members-title">
              إدارة أعضاء {managingGroup?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اختر الدور لعرض المستخدمين</Label>
              <Select
                value={selectedRoleId}
                onValueChange={(val) => {
                  setSelectedRoleId(val);
                  setSelectedUserIds(new Set());
                }}
              >
                <SelectTrigger data-testid="select-role-filter">
                  <SelectValue placeholder="اختر الدور..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">اختر الدور...</SelectItem>
                  {safeAvailableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id} data-testid={`role-option-${role.id}`}>
                      {role.nameAr || role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {activeRoleId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label className="tabular-nums">
                    المستخدمون في هذا الدور ({availableRoleUsers.length} متاح)
                  </Label>
                  <div className="flex gap-2">
                    {availableRoleUsers.length > 0 && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (selectedUserIds.size === availableRoleUsers.length) {
                              setSelectedUserIds(new Set());
                            } else {
                              setSelectedUserIds(new Set(availableRoleUsers.map((u) => u.id)));
                            }
                          }}
                          data-testid="button-select-all"
                        >
                          {selectedUserIds.size === availableRoleUsers.length
                            ? "إلغاء التحديد"
                            : "تحديد الكل"}
                        </Button>
                        <Button
                          size="sm"
                          disabled={selectedUserIds.size === 0 || batchAddMembersMutation.isPending}
                          onClick={() => {
                            if (managingGroup && selectedUserIds.size > 0) {
                              batchAddMembersMutation.mutate({
                                groupId: managingGroup.id,
                                userIds: Array.from(selectedUserIds),
                              });
                            }
                          }}
                          data-testid="button-add-selected"
                        >
                          {batchAddMembersMutation.isPending
                            ? "جاري الإضافة..."
                            : `إضافة المحدد (${selectedUserIds.size})`}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <ScrollArea className="h-48 border rounded-xl">
                  {isLoadingRoleUsers ? (
                    <div className="p-3 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : !safeRoleUsers.length ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">
                      لا يوجد مستخدمون في هذا الدور
                    </p>
                  ) : (
                    safeRoleUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`flex items-center justify-between p-2 border-b last:border-0 ${
                          user.isAlreadyMember
                            ? "opacity-50 bg-muted"
                            : "cursor-pointer hover:bg-muted"
                        }`}
                        onClick={() => {
                          if (!user.isAlreadyMember) {
                            const newSet = new Set(selectedUserIds);
                            if (newSet.has(user.id)) {
                              newSet.delete(user.id);
                            } else {
                              newSet.add(user.id);
                            }
                            setSelectedUserIds(newSet);
                          }
                        }}
                        data-testid={`role-user-${user.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={user.isAlreadyMember || selectedUserIds.has(user.id)}
                            disabled={user.isAlreadyMember}
                            onCheckedChange={(checked) => {
                              if (!user.isAlreadyMember) {
                                const newSet = new Set(selectedUserIds);
                                if (checked) {
                                  newSet.add(user.id);
                                } else {
                                  newSet.delete(user.id);
                                }
                                setSelectedUserIds(newSet);
                              }
                            }}
                            data-testid={`checkbox-user-${user.id}`}
                          />
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback>{user.displayName?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{user.displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                        </div>
                        {user.isAlreadyMember && <Badge variant="secondary">عضو بالفعل</Badge>}
                      </div>
                    ))
                  )}
                </ScrollArea>
              </div>
            )}

            <div className="space-y-2">
              <Label className="tabular-nums">الأعضاء الحاليون ({safeGroupMembers.length})</Label>
              <ScrollArea className="h-48 border rounded-xl">
                {!safeGroupMembers.length ? (
                  <p className="p-3 text-sm text-muted-foreground text-center">لا يوجد أعضاء</p>
                ) : (
                  safeGroupMembers.map((member) => {
                    const displayName = member.user
                      ? `${member.user.firstName || ""} ${member.user.lastName || ""}`.trim() ||
                        member.user.username
                      : "مستخدم";
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2 border-b last:border-0"
                        data-testid={`member-${member.userId}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {member.user?.email}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            managingGroup &&
                            removeMemberMutation.mutate({
                              groupId: managingGroup.id,
                              userId: member.userId,
                            })
                          }
                          data-testid={`button-remove-member-${member.userId}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setManagingGroup(null);
                setSelectedRoleId("none");
                setSelectedUserIds(new Set());
              }}
              data-testid="button-close-members"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistoryTab() {
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "sent" | "sending">("all");

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/staff-communications/campaigns"],
    select: (data) =>
      (Array.isArray(data) ? data : []).filter(
        (c) => c.status === "sent" || c.status === "sending"
      ),
  });

  const { data: deliveries } = useQuery<CampaignDelivery[]>({
    queryKey: [`/api/admin/staff-communications/campaigns/${selectedCampaign?.id}/deliveries`],
    enabled: !!selectedCampaign,
  });

  const safeCampaigns = useMemo(
    () => (Array.isArray(campaigns) ? campaigns : []),
    [campaigns]
  );
  const safeDeliveries = useMemo(
    () => (Array.isArray(deliveries) ? deliveries : []),
    [deliveries]
  );

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return safeCampaigns.filter((c) => {
      if (historyStatus !== "all" && c.status !== historyStatus) return false;
      if (q) {
        const matchesTitle = (c.title || "").toLowerCase().includes(q);
        const matchesSubject = (c.subject || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesSubject) return false;
      }
      return true;
    });
  }, [safeCampaigns, historyStatus, historySearch]);

  const getCampaignStats = (campaign?: Campaign | null) => {
    if (!campaign) return { sent: 0, failed: 0, pending: 0, total: 0 };
    const pending =
      (campaign.recipientCount || 0) -
      (campaign.sentCount || 0) -
      (campaign.failedCount || 0);
    return {
      sent: campaign.sentCount || 0,
      failed: campaign.failedCount || 0,
      pending: pending > 0 ? pending : 0,
      total: campaign.recipientCount || 0,
    };
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold" data-testid="text-history-title">
            سجل الحملات المرسلة
          </h2>
          <Badge variant="secondary" className="tabular-nums">
            {filteredHistory.length}
          </Badge>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-xl border border-border/60 bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="ابحث في سجل الحملات المرسلة..."
            className="pr-9"
            data-testid="input-search-history"
          />
          {historySearch && (
            <button
              type="button"
              onClick={() => setHistorySearch("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="مسح البحث"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { value: "all" as const, label: "الكل", count: safeCampaigns.length },
            {
              value: "sent" as const,
              label: "تم الإرسال",
              count: safeCampaigns.filter((c) => c.status === "sent").length,
            },
            {
              value: "sending" as const,
              label: "قيد الإرسال",
              count: safeCampaigns.filter((c) => c.status === "sending").length,
            },
          ].map((pill) => {
            const active = historyStatus === pill.value;
            return (
              <button
                key={pill.value}
                type="button"
                onClick={() => setHistoryStatus(pill.value)}
                data-testid={`filter-history-status-${pill.value}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span>{pill.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {pill.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {!filteredHistory.length ? (
        <Card className="rounded-xl border-border/60 bg-card">
          <div className="text-center py-12 text-muted-foreground" data-testid="text-no-history">
            <History className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium">لا توجد حملات مرسلة</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden md:block rounded-xl border-border/60 bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right">الحملة والموضوع</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إحصائيات التسليم</TableHead>
                  <TableHead className="text-right">تاريخ الإرسال</TableHead>
                  <TableHead className="text-left">التفاصيل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.map((campaign) => {
                  const stats = getCampaignStats(campaign);
                  return (
                    <TableRow
                      key={campaign.id}
                      onClick={() => setSelectedCampaign(campaign)}
                      data-testid={`history-item-${campaign.id}`}
                      className="cursor-pointer hover:bg-muted/20"
                    >
                      <TableCell className="max-w-md">
                        <div className="space-y-1">
                          <h3 className="font-semibold text-foreground truncate">
                            {campaign.title}
                          </h3>
                          <p className="text-xs text-muted-foreground truncate">
                            {campaign.subject}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeConfig[campaign.status]?.variant || "default"}>
                          {statusBadgeConfig[campaign.status]?.label || campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3 text-xs tabular-nums">
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <CheckCircle className="h-3.5 w-3.5" />
                            {stats.sent}
                          </span>
                          <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                            <XCircle className="h-3.5 w-3.5" />
                            {stats.failed}
                          </span>
                          <span className="text-muted-foreground">
                            من {stats.total}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {campaign.sentAt
                          ? format(new Date(campaign.sentAt), "dd MMMM yyyy, HH:mm", { locale: ar })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-left">
                        <Button size="sm" variant="ghost" className="gap-1.5">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs">عرض</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile Stacked Cards */}
          <div className="space-y-3 md:hidden">
            {filteredHistory.map((campaign) => {
              const stats = getCampaignStats(campaign);
              return (
                <Card
                  key={campaign.id}
                  onClick={() => setSelectedCampaign(campaign)}
                  data-testid={`history-item-${campaign.id}-mobile`}
                  className="rounded-xl border-border/60 bg-card p-4 space-y-3 cursor-pointer hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground truncate">
                          {campaign.title}
                        </h3>
                        <Badge variant={statusBadgeConfig[campaign.status]?.variant || "default"}>
                          {statusBadgeConfig[campaign.status]?.label || campaign.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {campaign.subject}
                      </p>
                    </div>
                    <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs tabular-nums">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {stats.sent}
                      </span>
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                        <XCircle className="h-3.5 w-3.5" />
                        {stats.failed}
                      </span>
                    </div>
                    {campaign.sentAt && (
                      <span className="text-muted-foreground">
                        {format(new Date(campaign.sentAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="text-delivery-details-title">
              تفاصيل الإرسال: {selectedCampaign?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <div className="flex items-center justify-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-xl font-bold tabular-nums">
                    {getCampaignStats(selectedCampaign).sent}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">تم الإرسال</p>
              </div>
              <div className="text-center p-3 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <div className="flex items-center justify-center gap-1 text-rose-600 dark:text-rose-400">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xl font-bold tabular-nums">
                    {getCampaignStats(selectedCampaign).failed}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">فشل</p>
              </div>
              <div className="text-center p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <div className="flex items-center justify-center gap-1 text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                  <span className="text-xl font-bold tabular-nums">
                    {getCampaignStats(selectedCampaign).pending}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">قيد الانتظار</p>
              </div>
            </div>

            <ScrollArea className="h-64 border rounded-xl">
              {!safeDeliveries.length ? (
                <p className="p-3 text-sm text-muted-foreground text-center">لا توجد بيانات</p>
              ) : (
                safeDeliveries.map((delivery) => {
                  const displayName = delivery.user
                    ? `${delivery.user.firstName || ""} ${delivery.user.lastName || ""}`.trim() ||
                      delivery.user.username
                    : "مستخدم";
                  const email = delivery.email || delivery.user?.email || "";
                  return (
                    <div
                      key={delivery.id}
                      className="flex items-center justify-between p-3 border-b last:border-0"
                      data-testid={`delivery-${delivery.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">{email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {delivery.status === "sent" && (
                          <CheckCircle className="h-4 w-4 text-emerald-600" />
                        )}
                        {delivery.status === "failed" && (
                          <div className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-rose-600" />
                            {delivery.failureReason && (
                              <span className="text-xs text-rose-600">{delivery.failureReason}</span>
                            )}
                          </div>
                        )}
                        {delivery.status === "pending" && (
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedCampaign(null)}
              data-testid="button-close-delivery"
            >
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function StaffCommunicationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("campaigns");

  const isAuthorized = !!user && ["admin", "system_admin", "manager"].includes(user.role || "");

  const { data: campaigns, isFetching: isFetchingCampaigns } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/staff-communications/campaigns"],
    enabled: isAuthorized,
  });

  const { data: groups, isFetching: isFetchingGroups } = useQuery<CommunicationGroup[]>({
    queryKey: ["/api/admin/staff-communications/groups"],
    enabled: isAuthorized,
  });

  const safeCampaigns = useMemo(
    () => (Array.isArray(campaigns) ? campaigns : []),
    [campaigns]
  );
  const safeGroups = useMemo(
    () => (Array.isArray(groups) ? groups : []),
    [groups]
  );

  const kpis = useMemo(() => {
    const totalCampaigns = safeCampaigns.length;
    const sentCampaigns = safeCampaigns.filter(
      (c) => c.status === "sent" || c.status === "sending"
    ).length;
    const pendingCampaigns = safeCampaigns.filter(
      (c) => c.status === "draft" || c.status === "scheduled"
    ).length;
    const totalDelivered = safeCampaigns.reduce((acc, c) => acc + (c.sentCount || 0), 0);
    const totalGroups = safeGroups.length;
    const totalGroupMembers = safeGroups.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    return {
      totalCampaigns,
      sentCampaigns,
      pendingCampaigns,
      totalDelivered,
      totalGroups,
      totalGroupMembers,
    };
  }, [safeCampaigns, safeGroups]);

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/groups"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/roles"] });
  };

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="text-center py-20">
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAuthorized) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="text-center py-20">
            <p className="text-destructive text-lg">غير مصرح لك بالوصول إلى هذه الصفحة</p>
            <p className="text-muted-foreground text-sm mt-2">
              يتطلب الوصول إلى هذه الصفحة صلاحيات إدارية
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isRefreshing = isFetchingCampaigns || isFetchingGroups;

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
          <DashboardPageHeader
            icon={Mail}
            title="التواصل مع فريق العمل"
            description="إرسال رسائل وحملات تواصل لأعضاء الفريق وإدارة المجموعات البريدية"
            titleTestId="text-page-title"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="py-1 px-2.5 text-xs tabular-nums">
                  {kpis.totalCampaigns} حملة
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshAll}
                  disabled={isRefreshing}
                  data-testid="button-refresh-communications"
                >
                  <RefreshCw className={cn("h-4 w-4 ml-1.5", isRefreshing && "animate-spin")} />
                  تحديث
                </Button>
              </div>
            }
          />

          {/* 4-Card KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="kpi-total-campaigns">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    إجمالي الحملات
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Mail className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {kpis.totalCampaigns}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  جميع الحملات المسجلة
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="kpi-sent-campaigns">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    الحملات المرسلة
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Send className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {kpis.sentCampaigns}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {kpis.totalDelivered} رسالة مستلمة
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="kpi-pending-campaigns">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    مسودات ومجدولة
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Clock className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {kpis.pendingCampaigns}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  بانتظار الإرسال أو الموعد
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60 bg-card shadow-none" data-testid="kpi-total-groups">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    مجموعات التواصل
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Users className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                  {kpis.totalGroups}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {kpis.totalGroupMembers} عضو في المجموعات
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl sm:max-w-md">
              <TabsTrigger value="campaigns" data-testid="tab-campaigns" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                حملات الرسائل
              </TabsTrigger>
              <TabsTrigger value="groups" data-testid="tab-groups" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                المجموعات
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                السجل
              </TabsTrigger>
            </TabsList>

            <TabsContent value="campaigns" className="space-y-6 mt-6">
              <CampaignsTab />
            </TabsContent>

            <TabsContent value="groups" className="space-y-6 mt-6">
              <GroupsTab />
            </TabsContent>

            <TabsContent value="history" className="space-y-6 mt-6">
              <HistoryTab />
            </TabsContent>
          </Tabs>
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
