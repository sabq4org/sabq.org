import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
  ListOrdered
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

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
  const [formData, setFormData] = useState({
    title: "",
    subject: "",
    contentHtml: "",
    audienceType: "roles" as "groups" | "roles" | "custom",
    targetGroups: [] as string[],
    targetRoles: [] as string[],
    targetUserIds: [] as string[],
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
      scheduleEnabled: false,
      scheduledAt: "",
    });
    setEditingCampaign(null);
    setIsCreateOpen(false);
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      title: campaign.title,
      subject: campaign.subject,
      contentHtml: campaign.contentHtml,
      audienceType: campaign.audienceType,
      targetGroups: campaign.targetGroups || [],
      targetRoles: campaign.targetRoles || [],
      targetUserIds: campaign.targetUserIds || [],
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
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold" data-testid="text-campaigns-title">حملات الرسائل</h2>
        <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-campaign">
          <Plus className="h-4 w-4 ml-2" />
          إنشاء حملة جديدة
        </Button>
      </div>

      {!campaigns?.length ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-campaigns">
          لا توجد حملات حتى الآن
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center justify-between p-4 border rounded-md hover-elevate"
              data-testid={`campaign-item-${campaign.id}`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium" data-testid={`text-campaign-title-${campaign.id}`}>
                    {campaign.title}
                  </h3>
                  <Badge variant={statusBadgeConfig[campaign.status].variant} data-testid={`badge-status-${campaign.id}`}>
                    {statusBadgeConfig[campaign.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground" data-testid={`text-campaign-subject-${campaign.id}`}>
                  {campaign.subject}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    {campaign.audienceType === "roles" && "حسب الأدوار"}
                    {campaign.audienceType === "groups" && "حسب المجموعات"}
                    {campaign.audienceType === "custom" && "مخصص"}
                  </span>
                  {campaign.sentAt && (
                    <span>
                      أُرسلت: {format(new Date(campaign.sentAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                    </span>
                  )}
                  {campaign.scheduledAt && campaign.status === "scheduled" && (
                    <span>
                      مجدولة: {format(new Date(campaign.scheduledAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {campaign.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => sendMutation.mutate(campaign.id)}
                    disabled={sendMutation.isPending}
                    data-testid={`button-send-${campaign.id}`}
                  >
                    <Send className="h-4 w-4 ml-1" />
                    إرسال الآن
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
                      <DropdownMenuItem onClick={() => handleEdit(campaign)} data-testid={`menu-edit-${campaign.id}`}>
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
            </div>
          ))}
        </div>
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

            {formData.audienceType === "roles" && roles && (
              <div className="space-y-2">
                <Label>اختر الأدوار</Label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role) => (
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

            {formData.audienceType === "groups" && groups && (
              <div className="space-y-2">
                <Label>اختر المجموعات</Label>
                <div className="flex flex-wrap gap-2">
                  {groups.map((group) => (
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
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
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

  const { data: roleUsers, isLoading: isLoadingRoleUsers } = useQuery<RoleUser[]>({
    queryKey: ["/api/admin/staff-communications/roles", selectedRoleId, "users", { groupId: managingGroup?.id }],
    enabled: !!selectedRoleId && !!managingGroup,
  });

  const { data: groupMembers, refetch: refetchMembers } = useQuery<GroupMember[]>({
    queryKey: ["/api/admin/staff-communications/groups", managingGroup?.id, "members"],
    enabled: !!managingGroup,
  });

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
      queryClient.invalidateQueries({ queryKey: ["/api/admin/staff-communications/roles", selectedRoleId, "users", { groupId: managingGroup?.id }] });
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
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h2 className="text-lg font-semibold" data-testid="text-groups-title">مجموعات التواصل</h2>
        <div className="flex gap-2">
          {!groups?.length && (
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

      {!groups?.length ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-groups">
          لا توجد مجموعات حتى الآن
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.map((group) => (
            <Card
              key={group.id}
              className="p-4 hover-elevate"
              data-testid={`group-card-${group.id}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: group.color + "20" }}
                  >
                    <Users className="h-5 w-5" style={{ color: group.color }} />
                  </div>
                  <div>
                    <h3 className="font-medium" data-testid={`text-group-name-${group.id}`}>
                      {group.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {group.memberCount} عضو
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
                    <DropdownMenuItem onClick={() => setManagingGroup(group)} data-testid={`menu-manage-${group.id}`}>
                      <UserPlus className="h-4 w-4 ml-2" />
                      إدارة الأعضاء
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleEdit(group)} data-testid={`menu-edit-group-${group.id}`}>
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
              {group.description && (
                <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                  {group.description}
                </p>
              )}
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
              {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : editingGroup ? "حفظ التغييرات" : "إنشاء المجموعة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managingGroup} onOpenChange={(open) => { 
        if (!open) {
          setManagingGroup(null);
          setSelectedRoleId("");
          setSelectedUserIds(new Set());
        }
      }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="text-manage-members-title">
              إدارة أعضاء {managingGroup?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اختر الدور لعرض المستخدمين</Label>
              <Select value={selectedRoleId} onValueChange={(val) => {
                setSelectedRoleId(val);
                setSelectedUserIds(new Set());
              }}>
                <SelectTrigger data-testid="select-role-filter">
                  <SelectValue placeholder="اختر الدور..." />
                </SelectTrigger>
                <SelectContent>
                  {availableRoles?.map((role) => (
                    <SelectItem key={role.id} value={role.id} data-testid={`role-option-${role.id}`}>
                      {role.nameAr || role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRoleId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    المستخدمون في هذا الدور ({roleUsers?.filter(u => !u.isAlreadyMember).length || 0} متاح)
                  </Label>
                  <div className="flex gap-2">
                    {roleUsers && roleUsers.filter(u => !u.isAlreadyMember).length > 0 && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const available = roleUsers.filter(u => !u.isAlreadyMember);
                            if (selectedUserIds.size === available.length) {
                              setSelectedUserIds(new Set());
                            } else {
                              setSelectedUserIds(new Set(available.map(u => u.id)));
                            }
                          }}
                          data-testid="button-select-all"
                        >
                          {selectedUserIds.size === roleUsers.filter(u => !u.isAlreadyMember).length
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
                
                <ScrollArea className="h-48 border rounded-md">
                  {isLoadingRoleUsers ? (
                    <div className="p-3 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-10 w-full" />
                      ))}
                    </div>
                  ) : !roleUsers?.length ? (
                    <p className="p-3 text-sm text-muted-foreground text-center">لا يوجد مستخدمون في هذا الدور</p>
                  ) : (
                    roleUsers.map((user) => (
                      <div
                        key={user.id}
                        className={`flex items-center justify-between p-2 border-b last:border-0 ${
                          user.isAlreadyMember ? "opacity-50 bg-muted" : "cursor-pointer hover:bg-muted"
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
                        <div className="flex items-center gap-2">
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
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{user.displayName?.[0]?.toUpperCase() || "?"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{user.displayName}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                        {user.isAlreadyMember && (
                          <Badge variant="secondary">عضو بالفعل</Badge>
                        )}
                      </div>
                    ))
                  )}
                </ScrollArea>
              </div>
            )}

            <div className="space-y-2">
              <Label>الأعضاء الحاليون ({groupMembers?.length || 0})</Label>
              <ScrollArea className="h-48 border rounded-md">
                {!groupMembers?.length ? (
                  <p className="p-3 text-sm text-muted-foreground text-center">لا يوجد أعضاء</p>
                ) : (
                  groupMembers.map((member) => {
                    const displayName = member.user 
                      ? `${member.user.firstName || ''} ${member.user.lastName || ''}`.trim() || member.user.username
                      : 'مستخدم';
                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-2 border-b last:border-0"
                        data-testid={`member-${member.userId}`}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{displayName}</p>
                            <p className="text-xs text-muted-foreground">{member.user?.email}</p>
                          </div>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            managingGroup && removeMemberMutation.mutate({ groupId: managingGroup.id, userId: member.userId })
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
            <Button variant="outline" onClick={() => {
              setManagingGroup(null);
              setSelectedRoleId("");
              setSelectedUserIds(new Set());
            }} data-testid="button-close-members">
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

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/staff-communications/campaigns"],
    select: (data) => data?.filter((c) => c.status === "sent" || c.status === "sending"),
  });

  const { data: deliveries } = useQuery<CampaignDelivery[]>({
    queryKey: [`/api/admin/staff-communications/campaigns/${selectedCampaign?.id}/deliveries`],
    enabled: !!selectedCampaign,
  });

  const getCampaignStats = (campaign?: Campaign | null) => {
    if (!campaign) return { sent: 0, failed: 0, pending: 0, total: 0 };
    const pending = (campaign.recipientCount || 0) - (campaign.sentCount || 0) - (campaign.failedCount || 0);
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
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold" data-testid="text-history-title">سجل الحملات المرسلة</h2>

      {!campaigns?.length ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-history">
          لا توجد حملات مرسلة
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => (
            <div
              key={campaign.id}
              className="flex items-center justify-between p-4 border rounded-md hover-elevate cursor-pointer"
              onClick={() => setSelectedCampaign(campaign)}
              data-testid={`history-item-${campaign.id}`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium">{campaign.title}</h3>
                  <Badge variant={statusBadgeConfig[campaign.status].variant}>
                    {statusBadgeConfig[campaign.status].label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                {campaign.sentAt && (
                  <p className="text-xs text-muted-foreground">
                    أُرسلت: {format(new Date(campaign.sentAt), "dd MMMM yyyy, HH:mm", { locale: ar })}
                  </p>
                )}
              </div>
              <Eye className="h-5 w-5 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle data-testid="text-delivery-details-title">
              تفاصيل الإرسال: {selectedCampaign?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-500/10 rounded-md">
                <div className="flex items-center justify-center gap-1 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-xl font-bold">{getCampaignStats(selectedCampaign).sent}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">تم الإرسال</p>
              </div>
              <div className="text-center p-3 bg-red-500/10 rounded-md">
                <div className="flex items-center justify-center gap-1 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span className="text-xl font-bold">{getCampaignStats(selectedCampaign).failed}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">فشل</p>
              </div>
              <div className="text-center p-3 bg-yellow-500/10 rounded-md">
                <div className="flex items-center justify-center gap-1 text-yellow-600">
                  <Clock className="h-4 w-4" />
                  <span className="text-xl font-bold">{getCampaignStats(selectedCampaign).pending}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">قيد الانتظار</p>
              </div>
            </div>

            <ScrollArea className="h-64 border rounded-md">
              {!deliveries?.length ? (
                <p className="p-3 text-sm text-muted-foreground text-center">لا توجد بيانات</p>
              ) : (
                deliveries.map((delivery) => {
                  const displayName = delivery.user 
                    ? `${delivery.user.firstName || ''} ${delivery.user.lastName || ''}`.trim() || delivery.user.username
                    : 'مستخدم';
                  const email = delivery.email || delivery.user?.email || '';
                  return (
                    <div
                      key={delivery.id}
                      className="flex items-center justify-between p-3 border-b last:border-0"
                      data-testid={`delivery-${delivery.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{displayName}</p>
                          <p className="text-xs text-muted-foreground">{email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {delivery.status === "sent" && <CheckCircle className="h-4 w-4 text-green-600" />}
                        {delivery.status === "failed" && (
                          <div className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-red-600" />
                            {delivery.failureReason && (
                              <span className="text-xs text-red-600">{delivery.failureReason}</span>
                            )}
                          </div>
                        )}
                        {delivery.status === "pending" && <AlertCircle className="h-4 w-4 text-yellow-600" />}
                      </div>
                    </div>
                  );
                })
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedCampaign(null)} data-testid="button-close-delivery">
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

  if (!user || !["admin", "system_admin", "manager"].includes(user.role || "")) {
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

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" dir="rtl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold" data-testid="text-page-title">
                التواصل مع فريق العمل
              </h1>
              <p className="text-muted-foreground mt-1">
                إرسال رسائل وحملات تواصل لأعضاء الفريق
              </p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList className="grid w-full max-w-md grid-cols-3">
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
