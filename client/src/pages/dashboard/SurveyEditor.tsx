import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Plus, Send, Trash2, Users } from "lucide-react";

type QuestionDraft = {
  type: "single" | "multi" | "short_text" | "long_text" | "stars" | "scale";
  text: string;
  hint: string;
  required: boolean;
  optionsText: string;
  maxChoices: number;
  minLabel: string;
  maxLabel: string;
};

type SelectedUser = { id: string; name: string; email: string | null };

const QUESTION_TYPES: { value: QuestionDraft["type"]; label: string }[] = [
  { value: "single", label: "اختيار واحد" },
  { value: "multi", label: "اختيار متعدد" },
  { value: "short_text", label: "نص قصير" },
  { value: "long_text", label: "نص طويل" },
  { value: "stars", label: "تقييم نجوم (1-5)" },
  { value: "scale", label: "مقياس 0-10" },
];

const ROLE_OPTIONS = [
  { value: "opinion_author", label: "كتّاب الرأي" },
  { value: "reporter", label: "المراسلون" },
  { value: "editor", label: "المحررون" },
];

const EMPTY_QUESTION: QuestionDraft = {
  type: "single",
  text: "",
  hint: "",
  required: true,
  optionsText: "",
  maxChoices: 3,
  minLabel: "",
  maxLabel: "",
};

function toApiQuestion(draft: QuestionDraft) {
  const options = draft.optionsText.split("\n").map((line) => line.trim()).filter(Boolean);
  const isChoice = draft.type === "single" || draft.type === "multi";
  return {
    type: draft.type,
    text: draft.text.trim(),
    hint: draft.hint.trim() || null,
    required: draft.required,
    options: isChoice ? options : null,
    settings: draft.type === "multi"
      ? { maxChoices: draft.maxChoices }
      : draft.type === "scale"
        ? { scaleMin: 0, scaleMax: 10, minLabel: draft.minLabel.trim() || undefined, maxLabel: draft.maxLabel.trim() || undefined }
        : null,
  };
}

export default function SurveyEditor() {
  const [, navigate] = useLocation();
  const [, editParams] = useRoute("/dashboard/surveys/:id/edit");
  const surveyId = editParams?.id;
  const { toast } = useToast();

  const { data: existingRaw } = useQuery({
    queryKey: [`/api/surveys/${surveyId}`],
    enabled: Boolean(surveyId),
  });

  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [welcomeTitle, setWelcomeTitle] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [thankYouTitle, setThankYouTitle] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [audienceRoles, setAudienceRoles] = useState<string[]>(["opinion_author"]);
  const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
  const [channels, setChannels] = useState<string[]>(["email", "dashboard"]);
  const [showRecipientStats, setShowRecipientStats] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ ...EMPTY_QUESTION }]);
  const [status, setStatus] = useState<string>("draft");
  const [userSearch, setUserSearch] = useState("");
  const [loadedFromServer, setLoadedFromServer] = useState(false);

  useEffect(() => {
    const existing = existingRaw as { survey: Record<string, unknown>; questions: Record<string, unknown>[] } | null | undefined;
    if (!existing?.survey || loadedFromServer) return;
    const survey = existing.survey as {
      title: string; purpose: string | null; welcomeTitle: string | null; welcomeMessage: string | null;
      thankYouTitle: string | null; thankYouMessage: string | null; audienceRoles: string[] | null;
      audienceUserIds: string[] | null; channels: string[]; showRecipientStats: boolean; status: string;
    };
    setTitle(survey.title);
    setPurpose(survey.purpose ?? "");
    setWelcomeTitle(survey.welcomeTitle ?? "");
    setWelcomeMessage(survey.welcomeMessage ?? "");
    setThankYouTitle(survey.thankYouTitle ?? "");
    setThankYouMessage(survey.thankYouMessage ?? "");
    setAudienceRoles(survey.audienceRoles ?? []);
    setSelectedUsers((survey.audienceUserIds ?? []).map((id) => ({ id, name: id, email: null })));
    setChannels(survey.channels ?? ["email", "dashboard"]);
    setShowRecipientStats(survey.showRecipientStats);
    setStatus(survey.status);
    setQuestions(
      (existing.questions as {
        type: QuestionDraft["type"]; text: string; hint: string | null; required: boolean;
        options: string[] | null; settings: { maxChoices?: number; minLabel?: string; maxLabel?: string } | null;
      }[]).map((question) => ({
        type: question.type,
        text: question.text,
        hint: question.hint ?? "",
        required: question.required,
        optionsText: (question.options ?? []).join("\n"),
        maxChoices: question.settings?.maxChoices ?? 3,
        minLabel: question.settings?.minLabel ?? "",
        maxLabel: question.settings?.maxLabel ?? "",
      })),
    );
    setLoadedFromServer(true);
  }, [existingRaw, loadedFromServer]);

  const { data: searchResultsRaw } = useQuery({
    queryKey: [`/api/surveys/users/search?q=${encodeURIComponent(userSearch)}`],
    enabled: userSearch.trim().length >= 2,
  });
  const searchResults: (SelectedUser & { role?: string })[] = Array.isArray(searchResultsRaw) ? searchResultsRaw : [];

  const payload = useMemo(() => ({
    title: title.trim(),
    purpose: purpose.trim() || null,
    welcomeTitle: welcomeTitle.trim() || null,
    welcomeMessage: welcomeMessage.trim() || null,
    thankYouTitle: thankYouTitle.trim() || null,
    thankYouMessage: thankYouMessage.trim() || null,
    audienceRoles: audienceRoles.length > 0 ? audienceRoles : null,
    audienceUserIds: selectedUsers.length > 0 ? selectedUsers.map((user) => user.id) : null,
    channels,
    showRecipientStats,
    questions: questions.map(toApiQuestion),
  }), [title, purpose, welcomeTitle, welcomeMessage, thankYouTitle, thankYouMessage, audienceRoles, selectedUsers, channels, showRecipientStats, questions]);

  const previewMutation = useMutation({
    mutationFn: () => apiRequest("/api/surveys/audience/preview", {
      method: "POST",
      body: JSON.stringify({ audienceRoles: payload.audienceRoles, audienceUserIds: payload.audienceUserIds }),
    }),
  });

  const saveMutation = useMutation({
    mutationFn: async (): Promise<{ survey: { id: string } }> => {
      if (surveyId) {
        return apiRequest(`/api/surveys/${surveyId}`, { method: "PATCH", body: JSON.stringify(payload) });
      }
      return apiRequest("/api/surveys", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: "تم الحفظ", description: "حُفظ الاستطلاع بنجاح" });
      if (!surveyId) navigate(`/dashboard/surveys/${saved.survey.id}/edit`);
    },
    onError: (error: Error) => toast({ title: "تعذر الحفظ", description: error.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const saved: { survey: { id: string } } = surveyId
        ? await apiRequest(`/api/surveys/${surveyId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiRequest("/api/surveys", { method: "POST", body: JSON.stringify(payload) });
      const result: { invited: number; emailsSent: number; notified: number } = await apiRequest(
        `/api/surveys/${saved.survey.id}/send`,
        { method: "POST" },
      );
      return { id: saved.survey.id, ...result };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({
        title: "أُرسلت الدعوات 🎉",
        description: `دُعي ${result.invited} شخصًا (${result.emailsSent} إيميل، ${result.notified} إشعار لوحة)`,
      });
      navigate(`/dashboard/surveys/${result.id}/results`);
    },
    onError: (error: Error) => toast({ title: "تعذر الإرسال", description: error.message, variant: "destructive" }),
  });

  const updateQuestion = (index: number, patch: Partial<QuestionDraft>) => {
    setQuestions((current) => current.map((question, questionIndex) => (questionIndex === index ? { ...question, ...patch } : question)));
  };
  const moveQuestion = (index: number, direction: -1 | 1) => {
    setQuestions((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const canSubmit = title.trim().length >= 3
    && questions.length > 0
    && questions.every((question) => {
      if (question.text.trim().length < 3) return false;
      if (question.type === "single" || question.type === "multi") {
        return question.optionsText.split("\n").filter((line) => line.trim()).length >= 2;
      }
      return true;
    })
    && (audienceRoles.length > 0 || selectedUsers.length > 0);

  const isDraft = status === "draft";

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-5" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{surveyId ? "تحرير الاستطلاع" : "استطلاع جديد"}</h1>
            {!isDraft && surveyId && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                هذا الاستطلاع أُرسل بالفعل — تعديل الأسئلة متوقف حفاظًا على اتساق الإجابات، ويمكن توسيع الجمهور وإعادة الإرسال للجدد فقط.
              </p>
            )}
          </div>
          <Badge variant={isDraft ? "secondary" : "default"}>{isDraft ? "مسودة" : status === "active" ? "نشط" : "مغلق"}</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">الأساسيات</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1.5 block">عنوان الاستطلاع *</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثال: تطوير قسم الرأي" data-testid="input-survey-title" />
            </div>
            <div>
              <Label className="mb-1.5 block">الهدف (يظهر للمدعو كشارة أعلى الترحيب)</Label>
              <Input value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="مثال: تطوير قسم الرأي" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block">عنوان الترحيب — اكتب {"{name}"} ليُستبدل باسم المدعو</Label>
                <Input value={welcomeTitle} onChange={(event) => setWelcomeTitle(event.target.value)} placeholder={"أهلًا بك يا {name}، رأيك يصنع الخطوة القادمة"} />
              </div>
              <div>
                <Label className="mb-1.5 block">نص الترحيب</Label>
                <Input value={welcomeMessage} onChange={(event) => setWelcomeMessage(event.target.value)} placeholder="نعمل على تطوير القسم، ولا أحد أقدر منك على إخبارنا بما يستحق التطوير." />
              </div>
              <div>
                <Label className="mb-1.5 block">عنوان الشكر</Label>
                <Input value={thankYouTitle} onChange={(event) => setThankYouTitle(event.target.value)} placeholder={"وصلت إجاباتك يا {name} 🌟"} />
              </div>
              <div>
                <Label className="mb-1.5 block">نص الشكر</Label>
                <Input value={thankYouMessage} onChange={(event) => setThankYouMessage(event.target.value)} placeholder="شكرًا لوقتك وصراحتك؛ كل إجابة ستُقرأ باهتمام." />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={showRecipientStats} onCheckedChange={setShowRecipientStats} id="show-stats" />
              <Label htmlFor="show-stats">عرض إحصاءات أعمال المدعو في الترحيب (مواده المنشورة وقراءاتها)</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">الأسئلة ({questions.length})</CardTitle>
            {!isDraft && <Badge variant="outline">مجمّدة بعد الإرسال</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((question, index) => (
              <div key={index} className="rounded-xl border border-border p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-muted-foreground tabular-nums">س{index + 1}</span>
                  <Select value={question.type} onValueChange={(value) => updateQuestion(index, { type: value as QuestionDraft["type"] })} disabled={!isDraft}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 mr-auto">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={question.required} onCheckedChange={(checked) => updateQuestion(index, { required: checked })} disabled={!isDraft} id={`required-${index}`} />
                      <Label htmlFor={`required-${index}`} className="text-xs">إلزامي</Label>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveQuestion(index, -1)} disabled={!isDraft || index === 0}><ArrowUp className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveQuestion(index, 1)} disabled={!isDraft || index === questions.length - 1}><ArrowDown className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index))} disabled={!isDraft || questions.length === 1}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
                <Input value={question.text} onChange={(event) => updateQuestion(index, { text: event.target.value })} placeholder="نص السؤال" disabled={!isDraft} data-testid={`input-question-${index}`} />
                <Input value={question.hint} onChange={(event) => updateQuestion(index, { hint: event.target.value })} placeholder="تلميح اختياري يظهر تحت السؤال" disabled={!isDraft} />
                {(question.type === "single" || question.type === "multi") && (
                  <div className="space-y-2">
                    <Textarea
                      value={question.optionsText}
                      onChange={(event) => updateQuestion(index, { optionsText: event.target.value })}
                      placeholder={"اكتب الخيارات، خيار في كل سطر\nراضٍ جدًا\nراضٍ\nمحايد"}
                      rows={4}
                      disabled={!isDraft}
                    />
                    {question.type === "multi" && (
                      <div className="flex items-center gap-2 text-sm">
                        <Label>أقصى عدد اختيارات:</Label>
                        <Input
                          type="number" min={1} max={12}
                          value={question.maxChoices}
                          onChange={(event) => updateQuestion(index, { maxChoices: Math.max(1, Number(event.target.value) || 1) })}
                          className="w-20"
                          disabled={!isDraft}
                        />
                      </div>
                    )}
                  </div>
                )}
                {question.type === "scale" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Input value={question.minLabel} onChange={(event) => updateQuestion(index, { minLabel: event.target.value })} placeholder="وصف أدنى قيمة (مستبعد جدًا)" disabled={!isDraft} />
                    <Input value={question.maxLabel} onChange={(event) => updateQuestion(index, { maxLabel: event.target.value })} placeholder="وصف أعلى قيمة (مؤكد جدًا)" disabled={!isDraft} />
                  </div>
                )}
              </div>
            ))}
            {isDraft && (
              <Button variant="outline" className="w-full border-dashed" onClick={() => setQuestions((current) => [...current, { ...EMPTY_QUESTION }])} data-testid="button-add-question">
                <Plus className="w-4 h-4 ml-1" />
                إضافة سؤال
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4" /> الجمهور وقنوات الدعوة</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">أدوار مستهدفة</Label>
              <div className="flex flex-wrap gap-4">
                {ROLE_OPTIONS.map((role) => (
                  <div key={role.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`role-${role.value}`}
                      checked={audienceRoles.includes(role.value)}
                      onCheckedChange={(checked) => {
                        setAudienceRoles((current) => checked === true
                          ? [...current, role.value]
                          : current.filter((value) => value !== role.value));
                      }}
                    />
                    <Label htmlFor={`role-${role.value}`}>{role.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">أو مدعوون محددون (بحث بالاسم أو الإيميل)</Label>
              <Input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="اكتب حرفين على الأقل للبحث…" />
              {searchResults.length > 0 && userSearch.trim().length >= 2 && (
                <div className="mt-2 rounded-lg border border-border divide-y divide-border max-h-48 overflow-y-auto">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="w-full text-right px-3 py-2 text-sm hover:bg-muted/40 flex justify-between items-center"
                      onClick={() => {
                        setSelectedUsers((current) => current.some((selected) => selected.id === user.id) ? current : [...current, user]);
                        setUserSearch("");
                      }}
                    >
                      <span>{user.name}</span>
                      <span className="text-muted-foreground text-xs">{user.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedUsers.map((user) => (
                    <Badge key={user.id} variant="secondary" className="gap-1">
                      {user.name}
                      <button type="button" onClick={() => setSelectedUsers((current) => current.filter((selected) => selected.id !== user.id))} aria-label="إزالة">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label className="mb-2 block">قنوات الدعوة</Label>
              <div className="flex flex-wrap gap-4">
                {[
                  { value: "email", label: "بريد إلكتروني برابط شخصي" },
                  { value: "dashboard", label: "رسالة في لوحة الكاتب" },
                ].map((channel) => (
                  <div key={channel.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`channel-${channel.value}`}
                      checked={channels.includes(channel.value)}
                      onCheckedChange={(checked) => {
                        setChannels((current) => checked === true
                          ? [...current, channel.value]
                          : current.filter((value) => value !== channel.value));
                      }}
                    />
                    <Label htmlFor={`channel-${channel.value}`}>{channel.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                حساب عدد المدعوين
              </Button>
              {previewMutation.data != null && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  سيُدعى {(previewMutation.data as { count: number }).count} شخصًا
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between gap-3 pb-10">
          <Button variant="outline" onClick={() => navigate("/dashboard/surveys")}>رجوع</Button>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => saveMutation.mutate()} disabled={!canSubmit || saveMutation.isPending} data-testid="button-save-survey">
              {saveMutation.isPending ? "جارٍ الحفظ…" : "حفظ"}
            </Button>
            <Button
              onClick={() => {
                if (channels.length === 0) {
                  toast({ title: "اختر قناة دعوة واحدة على الأقل", variant: "destructive" });
                  return;
                }
                sendMutation.mutate();
              }}
              disabled={!canSubmit || sendMutation.isPending}
              data-testid="button-send-survey"
            >
              <Send className="w-4 h-4 ml-1" />
              {sendMutation.isPending ? "جارٍ الإرسال…" : isDraft ? "اعتماد وإرسال الدعوات" : "إرسال للمدعوين الجدد"}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
