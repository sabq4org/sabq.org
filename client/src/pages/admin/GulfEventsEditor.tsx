import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Edit, Trash2, Pin, PinOff, Send, Save, History, Zap, Shield,
  AlertTriangle, Clock, RefreshCw, Link2, FileText,
} from "lucide-react";

const COUNTRIES = [
  { value: "saudi_arabia", label: "السعودية", flag: "🇸🇦" },
  { value: "uae", label: "الإمارات", flag: "🇦🇪" },
  { value: "bahrain", label: "البحرين", flag: "🇧🇭" },
  { value: "kuwait", label: "الكويت", flag: "🇰🇼" },
  { value: "qatar", label: "قطر", flag: "🇶🇦" },
  { value: "oman", label: "عُمان", flag: "🇴🇲" },
  { value: "yemen", label: "اليمن", flag: "🇾🇪" },
];

const EVENT_TYPES = [
  { value: "drone_intercepted", label: "صد مسيّرة" },
  { value: "ballistic_intercepted", label: "صد صاروخ باليستي" },
  { value: "cruise_intercepted", label: "صد صاروخ كروز" },
  { value: "ballistic_and_drone", label: "صد صاروخ باليستي ومسيّرة" },
  { value: "debris_fallen", label: "سقوط شظايا" },
  { value: "no_damage", label: "لا أضرار" },
  { value: "injuries", label: "إصابات" },
  { value: "martyrdom", label: "استشهاد" },
  { value: "official_statement", label: "بيان رسمي" },
  { value: "official_comment", label: "تصريح مسؤول" },
  { value: "military_action", label: "تحرك عسكري" },
  { value: "international_condemnation", label: "إدانة دولية" },
];

const SOURCES = [
  { value: "official_statement", label: "بيان رسمي" },
  { value: "official_news_agency", label: "وكالة أنباء رسمية" },
  { value: "sabq_correspondent", label: "مراسل سبق" },
  { value: "international_agencies", label: "وكالات دولية" },
  { value: "informed_sources", label: "مصادر مطلعة" },
  { value: "other", label: "أخرى" },
];

const PRIORITIES = [
  { value: "urgent", label: "عاجل", color: "bg-red-500 text-white", icon: Zap },
  { value: "important", label: "مهم", color: "bg-yellow-500 text-white", icon: AlertTriangle },
  { value: "normal", label: "عادي", color: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200", icon: FileText },
];

function timeAgo(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `قبل ${diffMin} د`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `قبل ${diffHrs} س`;
  return `قبل ${Math.floor(diffHrs / 24)} يوم`;
}

interface EventFormData {
  country: string;
  eventType: string;
  priority: string;
  sourceType: string;
  sourceName: string;
  content: string;
  status: string;
  publishedAt?: string;
  parentEventId?: string;
  isUpdate?: boolean;
}

const defaultForm: EventFormData = {
  country: "saudi_arabia",
  eventType: "drone_intercepted",
  priority: "normal",
  sourceType: "official_statement",
  sourceName: "",
  content: "",
  status: "published",
  publishedAt: "",
};

export default function GulfEventsEditor() {
  const { toast } = useToast();
  const [form, setForm] = useState<EventFormData>({ ...defaultForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [parentEvent, setParentEvent] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: eventsData, isLoading } = useQuery<{ events: any[]; total: number }>({
    queryKey: ["/api/gulf-events"],
    queryFn: async () => {
      const res = await fetch("/api/gulf-events?limit=200");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const { data: drafts } = useQuery<any[]>({
    queryKey: ["/api/admin/gulf-events/drafts"],
  });

  const { data: logs } = useQuery<any[]>({
    queryKey: ["/api/admin/gulf-events/logs"],
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/gulf-events/stats"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      return apiRequest("/api/admin/gulf-events", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gulf-events/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gulf-events/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events/stats"] });
      toast({ title: "تم نشر الحدث بنجاح" });
      resetForm();
    },
    onError: () => {
      toast({ title: "فشل في نشر الحدث", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EventFormData> }) => {
      return apiRequest(`/api/admin/gulf-events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gulf-events/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events/stats"] });
      toast({ title: "تم تعديل الحدث" });
      resetForm();
    },
    onError: () => {
      toast({ title: "فشل في تعديل الحدث", variant: "destructive" });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/gulf-events/${id}/pin`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gulf-events/logs"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/gulf-events/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gulf-events/drafts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/gulf-events/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-events/stats"] });
      toast({ title: "تم حذف الحدث" });
      setDeleteConfirm(null);
    },
    onError: () => {
      toast({ title: "فشل في حذف الحدث", variant: "destructive" });
    },
  });

  function resetForm() {
    setForm({ ...defaultForm });
    setEditingId(null);
    setShowForm(false);
    setParentEvent(null);
  }

  function startEdit(event: any) {
    const pubDate = event.publishedAt ? new Date(event.publishedAt) : null;
    const pubLocal = pubDate ? `${pubDate.getFullYear()}-${String(pubDate.getMonth()+1).padStart(2,'0')}-${String(pubDate.getDate()).padStart(2,'0')}T${String(pubDate.getHours()).padStart(2,'0')}:${String(pubDate.getMinutes()).padStart(2,'0')}` : "";
    setForm({
      country: event.country,
      eventType: event.eventType,
      priority: event.priority,
      sourceType: event.sourceType,
      sourceName: event.sourceName || "",
      content: event.content,
      status: event.status,
      publishedAt: pubLocal,
    });
    setEditingId(event.id);
    setShowForm(true);
    setParentEvent(null);
  }

  function startUpdate(event: any) {
    setForm({
      ...defaultForm,
      country: event.country,
      parentEventId: event.id,
      isUpdate: true,
    });
    setParentEvent(event);
    setEditingId(null);
    setShowForm(true);
  }

  function handleSubmit() {
    if (!form.content.trim()) {
      toast({ title: "نص الخبر مطلوب", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  const events = eventsData?.events || [];
  const countryLabel = (c: string) => COUNTRIES.find(x => x.value === c)?.label || c;
  const countryFlag = (c: string) => COUNTRIES.find(x => x.value === c)?.flag || "";
  const eventTypeLabel = (t: string) => EVENT_TYPES.find(x => x.value === t)?.label || t;

  return (
    <DashboardLayout>
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-red-600" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-editor-title">لوحة تحكم البث الحي</h1>
            <p className="text-sm text-muted-foreground">الاعتداءات على دول الخليج</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats && (
            <Badge variant="secondary" className="text-sm">
              إجمالي: {stats.totalAttacks || 0} | صد: {stats.intercepted || 0}
            </Badge>
          )}
          <Button onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-event">
            <Plus className="w-4 h-4 ml-1" />
            حدث جديد
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {editingId ? "تعديل حدث" : parentEvent ? `إضافة تحديث على: "${parentEvent.content.slice(0, 40)}..."` : "إضافة حدث جديد"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>الدولة</Label>
                <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                  <SelectTrigger data-testid="select-country">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.flag} {c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>نوع الحدث</Label>
                <Select value={form.eventType} onValueChange={(v) => setForm({ ...form, eventType: v })}>
                  <SelectTrigger data-testid="select-event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>المصدر</Label>
                <Select value={form.sourceType} onValueChange={(v) => setForm({ ...form, sourceType: v })}>
                  <SelectTrigger data-testid="select-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.sourceType === "other" && (
              <div className="space-y-2">
                <Label>اسم المصدر</Label>
                <Input
                  value={form.sourceName}
                  onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                  placeholder="أدخل اسم المصدر"
                  data-testid="input-source-name"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>مستوى الأهمية</Label>
              <div className="flex gap-2">
                {PRIORITIES.map(p => {
                  const Icon = p.icon;
                  return (
                    <Button
                      key={p.value}
                      variant={form.priority === p.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setForm({ ...form, priority: p.value })}
                      className={form.priority === p.value ? p.color : ""}
                      data-testid={`button-priority-${p.value}`}
                    >
                      <Icon className="w-3 h-3 ml-1" />
                      {p.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>نص الخبر</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder='مثال: "الدفاع الجوي السعودي يعترض مسيّرة فوق جازان — لا إصابات"'
                rows={3}
                data-testid="input-event-content"
              />
            </div>

            <div className="space-y-2">
              <Label>وقت النشر</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="datetime-local"
                  value={form.publishedAt || ""}
                  onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
                  data-testid="input-published-at"
                  className="max-w-xs"
                />
                <span className="text-xs text-muted-foreground">اتركه فارغاً للنشر بالوقت الحالي</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-publish-event"
              >
                <Send className="w-4 h-4 ml-1" />
                {editingId ? "حفظ التعديل" : "نشر فوري"}
              </Button>
              {!editingId && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setForm({ ...form, status: "draft" });
                    createMutation.mutate({ ...form, status: "draft" });
                  }}
                  disabled={createMutation.isPending}
                  data-testid="button-save-draft"
                >
                  <Save className="w-4 h-4 ml-1" />
                  حفظ مسودة
                </Button>
              )}
              <Button variant="ghost" onClick={resetForm} data-testid="button-cancel">
                إلغاء
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="published" className="w-full">
        <TabsList>
          <TabsTrigger value="published" data-testid="tab-published">
            الأحداث المنشورة ({events.length})
          </TabsTrigger>
          <TabsTrigger value="drafts" data-testid="tab-drafts">
            المسودات ({drafts?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="logs" data-testid="tab-logs">
            <History className="w-4 h-4 ml-1" />
            سجل النشاط
          </TabsTrigger>
        </TabsList>

        <TabsContent value="published" className="space-y-3 mt-4">
          {isLoading ? (
            <Card className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
            </Card>
          ) : events.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">لا توجد أحداث منشورة</p>
            </Card>
          ) : (
            events.map((event: any) => (
              <Card key={event.id} className={`p-4 ${event.isPinned ? "border-primary/30" : ""}`} data-testid={`admin-event-${event.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-lg">{countryFlag(event.country)}</span>
                      <span className="text-sm font-semibold">{countryLabel(event.country)}</span>
                      <Badge variant="secondary" className="text-xs">{eventTypeLabel(event.eventType)}</Badge>
                      {event.priority === "urgent" && <Badge variant="destructive" className="text-xs">عاجل</Badge>}
                      {event.priority === "important" && <Badge className="bg-yellow-500 text-white text-xs">مهم</Badge>}
                      {event.isPinned && <Badge variant="outline" className="text-xs"><Pin className="w-3 h-3 ml-1" />مثبّت</Badge>}
                      {event.isUpdate && <Badge variant="outline" className="text-xs">تحديث</Badge>}
                      {event.editedAt && <Badge variant="outline" className="text-xs">معدّل</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed">{event.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {timeAgo(event.publishedAt)} · المصدر: {event.sourceName || SOURCES.find(s => s.value === event.sourceType)?.label}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startUpdate(event)}
                      title="إضافة تحديث"
                      data-testid={`button-add-update-${event.id}`}
                    >
                      <Link2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(event)}
                      data-testid={`button-edit-${event.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => pinMutation.mutate(event.id)}
                      data-testid={`button-pin-${event.id}`}
                    >
                      {event.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </Button>
                    <Dialog open={deleteConfirm === event.id} onOpenChange={(open) => setDeleteConfirm(open ? event.id : null)}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-delete-${event.id}`}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>تأكيد الحذف</DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground">هل تريد حذف هذا الحدث؟ سيبقى في الأرشيف الداخلي.</p>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setDeleteConfirm(null)}>إلغاء</Button>
                          <Button variant="destructive" onClick={() => deleteMutation.mutate(event.id)} data-testid="button-confirm-delete">
                            حذف
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="drafts" className="space-y-3 mt-4">
          {!drafts?.length ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">لا توجد مسودات</p>
            </Card>
          ) : (
            drafts.map((draft: any) => (
              <Card key={draft.id} className="p-4" data-testid={`draft-${draft.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span>{countryFlag(draft.country)}</span>
                      <span className="text-sm font-semibold">{countryLabel(draft.country)}</span>
                      <Badge variant="outline" className="text-xs">مسودة</Badge>
                    </div>
                    <p className="text-sm">{draft.content}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: draft.id, data: { status: "published", publishedAt: new Date().toISOString() } as any })}
                      data-testid={`button-publish-draft-${draft.id}`}
                    >
                      <Send className="w-3 h-3 ml-1" />
                      نشر
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(draft)}>
                      <Edit className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {!logs?.length ? (
                <p className="text-center text-muted-foreground py-4">لا توجد سجلات</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {logs.map((log: any) => (
                    <div key={log.id} className="flex items-center gap-3 py-2 border-b last:border-0" data-testid={`log-${log.id}`}>
                      <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">
                          <span className="font-semibold">{log.editorName}</span>
                          {" — "}
                          <span className="text-muted-foreground">{log.action === "create" ? "نشر" : log.action === "update" ? "تعديل" : log.action === "delete" ? "حذف" : log.action === "pin" ? "تثبيت" : log.action === "unpin" ? "إلغاء تثبيت" : log.action}</span>
                        </p>
                        {log.details && <p className="text-xs text-muted-foreground truncate">{log.details}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </DashboardLayout>
  );
}
