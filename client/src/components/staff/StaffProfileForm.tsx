// ----------------------------------------------------------------------------
// فورم ملف المنسوب الموحّد — التصميم المعتمد (2026-07-21)
//
// وضعان بنفس المكوّن:
//   mode="page"   → تبويبات أفقية لاصقة (داخل اللوحة، لا تزاحم قائمتها)
//   mode="dialog" → تبويبات جانبية عمودية (البوب أب يغطي الشاشة فلا مزاحمة)
//
// الحقول الملزمة تُعلَّم بنجمة وتُبرز حمراء عند النقص، وشريط الحفظ يعدّد
// النواقص بالاسم. الهوية الوطنية مقنّعة وكشفها عبر صلاحية الوثائق.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/components/ImageUpload";
import { DateField } from "@/components/staff/DateField";
import {
  IdCard, Briefcase, Newspaper, Phone, Globe, FolderLock, Eye, Loader2, Plus, Upload, ExternalLink,
} from "lucide-react";

type Lookups = {
  departments: { id: string; nameAr: string }[];
  jobTitles: { id: string; nameAr: string }[];
  employmentTypes: { value: string; labelAr: string }[];
};

type ProfileResponse = {
  user: {
    id: string; firstName: string | null; lastName: string | null;
    email: string; phoneNumber: string | null; profileImageUrl: string | null; role: string;
  };
  profile: (Record<string, unknown> & {
    employeeNumber?: string | null;
    completionPercent?: number;
    missingFields?: string[];
    nationalIdLast4?: string | null;
    hasNationalId?: boolean;
    officialPhotoUrl?: string | null;
    profileReviewStatus?: "draft" | "pending_review" | "approved" | "needs_correction" | null;
    officialFullNameAr?: string | null;
  }) | null;
  requiredFields: { key: string; labelAr: string }[];
  missingLabels?: string[];
  suggestedEmploymentType?: "opinion_writer" | "field_reporter" | null;
};

const SECTIONS = [
  { id: "identity", labelAr: "الهوية الرسمية", icon: IdCard },
  { id: "job", labelAr: "الوظيفة", icon: Briefcase },
  { id: "press", labelAr: "الاعتماد الصحفي", icon: Newspaper },
  { id: "contact", labelAr: "التواصل والطوارئ", icon: Phone },
  { id: "public", labelAr: "الحضور العام", icon: Globe },
  { id: "docs", labelAr: "الوثائق", icon: FolderLock },
] as const;

const SECTION_FIELDS: Record<string, string[]> = {
  identity: ["officialFullNameAr", "firstName", "lastName", "phoneNumber", "nationalId", "nationality", "officialBirthDate", "officialPhotoUrl"],
  job: ["jobTitleId", "departmentId", "employmentType", "joinedAt", "workRegion"],
  press: ["pressIdNumber", "pressCardValidUntil", "mediaLicenseNumber", "mediaLicenseExpiresAt"],
  contact: ["officialPhone", "officialEmail", "emergencyContactName", "emergencyContactRelation", "emergencyContactPhone", "bloodType"],
  public: ["bioAr", "specializations", "yearsOfExperience", "socialX", "socialLinkedin", "personalWebsite", "previousEmployers"],
  docs: [],
};

const DOC_KINDS_ADMIN = [
  { kind: "cv", labelAr: "السيرة الذاتية", keyField: "cvFileKey", icon: "📄" },
  { kind: "nationalId", labelAr: "صورة الهوية", keyField: "nationalIdFileKey", icon: "🪪" },
  { kind: "license", labelAr: "الترخيص المهني", keyField: "mediaLicenseFileKey", icon: "📜" },
  { kind: "contract", labelAr: "العقد", keyField: "contractFileKey", icon: "📑" },
] as const;

const DOC_KINDS_SELF = DOC_KINDS_ADMIN.filter((d) => d.kind !== "contract");

const dateInput = (value: unknown): string =>
  typeof value === "string" && value ? value.slice(0, 10) : "";

export function StaffProfileForm({
  userId,
  mode,
  access = "admin",
  onSaved,
}: {
  userId: string;
  mode: "page" | "dialog";
  /** admin = HR · self = الكاتب/المراسل يستكمل ملفه عبر /me */
  access?: "admin" | "self";
  onSaved?: () => void;
}) {
  const { toast } = useToast();
  const isSelf = access === "self";
  const apiBase = isSelf ? "/api/staff-profiles/me" : `/api/staff-profiles/${userId}`;
  const lookupsKey = isSelf ? "/api/staff-profiles/me/lookups" : "/api/staff-profiles/lookups";
  const docKinds = isSelf ? DOC_KINDS_SELF : DOC_KINDS_ADMIN;
  // الاعتماد الصحفي للإدارة فقط — الكاتب/المراسل يستخدمان بطاقة الترخيص المنفصلة
  const visibleSections = isSelf
    ? SECTIONS.filter((s) => s.id !== "press")
    : SECTIONS;

  const [activeSection, setActiveSection] = useState<string>("identity");
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [nationalIdInput, setNationalIdInput] = useState("");
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const { data: dataRaw, isLoading } = useQuery({ queryKey: [apiBase] });
  const { data: lookupsRaw } = useQuery({ queryKey: [lookupsKey] });
  const data = (dataRaw ?? null) as ProfileResponse | null;
  const lookups = (lookupsRaw ?? null) as Lookups | null;

  useEffect(() => {
    if (isSelf && activeSection === "press") setActiveSection("identity");
  }, [isSelf, activeSection]);

  useEffect(() => {
    if (!data) return;
    // إسقاط قيم null القادمة من الملفات المرحّلة — إرسالها كما هي كان
    // يفشل الحفظ («Expected string, received null»)
    const base: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data.profile ?? {})) {
      if (value !== null && value !== undefined) base[key] = value;
    }
    // سحب الصورة الرسمية تلقائياً من صورة الحساب إن لم تُرفع صورة مستقلة
    if (!base.officialPhotoUrl && data.user.profileImageUrl) {
      base.officialPhotoUrl = data.user.profileImageUrl;
    }
    // الاسم والجوال من users — ملزمان للاكتمال
    base.firstName = data.user.firstName ?? "";
    base.lastName = data.user.lastName ?? "";
    base.phoneNumber = data.user.phoneNumber ?? "";
    if (!base.employmentType && data.suggestedEmploymentType) {
      base.employmentType = data.suggestedEmploymentType;
    }
    setForm(base);
  }, [data]);

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const missingKeys = useMemo(() => {
    const fromServer = (data?.profile?.missingFields ?? []) as string[];
    return new Set(fromServer);
  }, [data?.profile?.missingFields]);

  const requiredLabelByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const rule of data?.requiredFields ?? []) map.set(rule.key, rule.labelAr);
    return map;
  }, [data?.requiredFields]);

  const sectionMissingCount = (sectionId: string) =>
    SECTION_FIELDS[sectionId].filter((k) => missingKeys.has(k)).length;

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      const sectionsToSave = isSelf
        ? Object.entries(SECTION_FIELDS).filter(([id]) => id !== "press")
        : Object.entries(SECTION_FIELDS);
      const editable = sectionsToSave.flatMap(([, keys]) => keys);
      for (const key of editable) {
        if (key === "nationalId") continue;
        if (form[key] !== undefined) {
          payload[key] = key === "yearsOfExperience"
            ? (form[key] === "" || form[key] === null ? undefined : Number(form[key]))
            : form[key];
        }
      }
      if (nationalIdInput.trim()) payload.nationalId = nationalIdInput.trim();
      return apiRequest(apiBase, {
        method: "PUT",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (result: {
      completionPercent: number;
      missingFields: { labelAr: string }[];
      profileReviewStatus?: string;
    }) => {
      setNationalIdInput("");
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      queryClient.invalidateQueries({ queryKey: ["/api/staff-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/official-letters/my-readiness"] });
      const remaining = result.missingFields?.length ?? 0;
      const pending = isSelf && result.profileReviewStatus === "pending_review";
      toast({
        title: `حُفظ الملف — الاكتمال ${result.completionPercent}%`,
        description: remaining
          ? `النواقص المتبقية: ${result.missingFields.map((m) => m.labelAr).join("، ")}`
          : pending
            ? "بياناتك مكتملة وهي تحت مراجعة الإدارة"
            : "الملف مكتمل ✓",
      });
      onSaved?.();
    },
    onError: (err: Error) =>
      toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" }),
  });

  const reveal = async () => {
    try {
      const res = await apiRequest(`${apiBase}/national-id`, { method: "GET" });
      setRevealedId(res.nationalId);
    } catch (err: unknown) {
      toast({
        title: "تعذر الكشف",
        description: err instanceof Error ? err.message : "غير مصرح",
        variant: "destructive",
      });
    }
  };

  const uploadDoc = async (kind: string, file: File) => {
    setUploadingDoc(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiRequest(`${apiBase}/documents/${kind}`, { method: "POST", body: fd, isFormData: true });
      queryClient.invalidateQueries({ queryKey: [apiBase] });
      toast({ title: "رُفعت الوثيقة بنجاح" });
    } catch (err: unknown) {
      toast({ title: "تعذر رفع الوثيقة", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setUploadingDoc(null);
    }
  };

  const addLookup = async (type: "departments" | "job-titles") => {
    const nameAr = window.prompt(type === "departments" ? "اسم الإدارة الجديدة:" : "المسمى الوظيفي الجديد:");
    if (!nameAr?.trim()) return;
    await apiRequest(`/api/staff-profiles/${type}`, {
      method: "POST",
      body: JSON.stringify({ nameAr: nameAr.trim() }),
      headers: { "Content-Type": "application/json" },
    });
    queryClient.invalidateQueries({ queryKey: [lookupsKey] });
  };

  if (isLoading || !data) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const reviewStatus = data.profile?.profileReviewStatus ?? "draft";
  const hasOfficialFullName = Boolean(String(data.profile?.officialFullNameAr ?? "").trim());
  /** قيد المراجعة مقفل؛ المعتمد مقفل إلا لتعبئة الاسم الرباعي لأول مرة */
  const selfLocked =
    isSelf &&
    (reviewStatus === "pending_review" ||
      (reviewStatus === "approved" && hasOfficialFullName));

  const lockMessage =
    reviewStatus === "approved"
      ? "ملفك معتمد من الإدارة — التعديل مقفل. لإصدار الشهادة استخدم بطاقة «شهاداتي الرسمية» بالأسفل. إن احتجت تعديلاً فاطلب من الإدارة فتح التصحيح."
      : "ملفك قيد مراجعة الإدارة — التعديل مقفل حالياً. إن طُلب منك تصحيح ستُفتح الحقول مجدداً";

  const missingLabels = (data.profile?.missingFields ?? [])
    .map((k) => requiredLabelByKey.get(k) ?? k);

  const field = (
    key: string,
    label: string,
    input: React.ReactNode,
    opts?: { required?: boolean; hint?: string; wide?: boolean },
  ) => (
    <div className={opts?.wide ? "sm:col-span-2 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}>
      <label className="text-xs font-bold text-muted-foreground">
        {label} {opts?.required && <span className="text-red-500">*</span>}
      </label>
      {input}
      {opts?.hint && <span className="text-[10px] text-muted-foreground">{opts.hint}</span>}
    </div>
  );

  const missingClass = (key: string) => (missingKeys.has(key) ? "border-red-400" : "");

  const employmentOptions = (lookups?.employmentTypes ?? []).filter((t) => {
    if (!isSelf) return true;
    const suggested = data.suggestedEmploymentType;
    if (suggested === "opinion_writer") return t.value === "opinion_writer" || t.value === "collaborator";
    if (suggested === "field_reporter") return t.value === "field_reporter" || t.value === "collaborator";
    return true;
  });

  const tabs = (
    <nav
      className={
        mode === "page"
          ? "sticky top-2 z-10 flex flex-nowrap gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 shadow-sm [-webkit-overflow-scrolling:touch]"
          : "flex flex-col gap-1 rounded-xl border bg-card p-1.5 min-w-[190px]"
      }
    >
      {visibleSections.map((s) => {
        const missing = sectionMissingCount(s.id);
        const active = activeSection === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(s.id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-bold transition-colors ${
              active ? "bg-sky-500/10 text-sky-600" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <s.icon className="h-4 w-4" />
            {s.labelAr}
            {missing > 0 ? (
              <span className="rounded-full bg-red-500/10 px-1.5 text-[10px] font-extrabold text-red-500">{missing}</span>
            ) : (
              <span className="text-[10px] font-extrabold text-emerald-600">✓</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  const panels = (
    <div className="flex-1 rounded-xl border bg-card p-5">
      {activeSection === "identity" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {field("officialFullNameAr", "الاسم الرباعي (للشهادات الرسمية)",
            <Input
              className={missingClass("officialFullNameAr")}
              value={String(form.officialFullNameAr ?? "")}
              onChange={(e) => set("officialFullNameAr", e.target.value)}
              placeholder="مثال: علي محمد أحمد الحازمي"
              data-testid="input-official-full-name"
            />,
            {
              required: true,
              wide: true,
              hint: "يُطبع على شهادة التعريف فقط كما في الهوية — لا يظهر في المقالات ولا في اسم العرض بالموقع",
            })}
          {field("firstName", "اسم العرض — الاسم الأول",
            <Input className={missingClass("firstName")} value={String(form.firstName ?? "")} onChange={(e) => set("firstName", e.target.value)} />,
            { required: true, hint: "يظهر في المقالات والملف العام فقط" })}
          {field("lastName", "اسم العرض — اسم العائلة",
            <Input className={missingClass("lastName")} value={String(form.lastName ?? "")} onChange={(e) => set("lastName", e.target.value)} />,
            { required: true, hint: "يظهر في المقالات والملف العام فقط" })}
          {field("phoneNumber", "رقم الجوال",
            <Input dir="ltr" className={missingClass("phoneNumber")} value={String(form.phoneNumber ?? "")} onChange={(e) => set("phoneNumber", e.target.value)} />,
            { required: true })}
          {field("nationalId", "الهوية الوطنية / الإقامة",
            <div className="flex gap-2">
              <Input
                dir="ltr"
                className={`tracking-[3px] ${missingClass("nationalId")}`}
                placeholder={data.profile?.hasNationalId ? `•••••• ${data.profile?.nationalIdLast4 ?? ""}` : "10 أرقام"}
                value={revealedId ?? nationalIdInput}
                onChange={(e) => { setRevealedId(null); setNationalIdInput(e.target.value.replace(/\D/g, "").slice(0, 10)); }}
              />
              {data.profile?.hasNationalId && !revealedId && (
                <Button type="button" variant="outline" size="sm" onClick={reveal}><Eye className="h-4 w-4" /></Button>
              )}
            </div>,
            {
              required: true,
              hint: isSelf
                ? "مشفّرة — يمكنك رؤيتها وتعديلها في ملفك فقط"
                : "مشفّرة — الكشف لصلاحية الموارد البشرية ويُسجَّل",
            })}
          {field("nationality", "الجنسية",
            <Input value={String(form.nationality ?? "")} onChange={(e) => set("nationality", e.target.value)} />)}
          {field("officialBirthDate", "تاريخ الميلاد الرسمي",
            <DateField value={dateInput(form.officialBirthDate)} onChange={(v) => set("officialBirthDate", v)} toYear={new Date().getFullYear() - 15} />)}
          {field("officialPhotoUrl", "الصورة الرسمية",
            <ImageUpload value={(form.officialPhotoUrl as string) ?? null} onChange={(url) => set("officialPhotoUrl", url)} />,
            { required: true, hint: data?.profile?.officialPhotoUrl ? "تُستخدم في البطاقة الصحفية" : "مسحوبة تلقائياً من صورة الحساب — استبدلها إن أردت صورة رسمية مختلفة", wide: true })}
        </div>
      )}

      {activeSection === "job" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {field("jobTitleId", "المسمى الوظيفي",
            <div className="flex gap-2">
              <Select value={(form.jobTitleId as string) ?? ""} onValueChange={(v) => set("jobTitleId", v)}>
                <SelectTrigger className={`flex-1 ${missingClass("jobTitleId")}`}><SelectValue placeholder="— اختر —" /></SelectTrigger>
                <SelectContent>{(lookups?.jobTitles ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.nameAr}</SelectItem>)}</SelectContent>
              </Select>
              {!isSelf && (
                <Button type="button" variant="outline" size="icon" onClick={() => addLookup("job-titles")}><Plus className="h-4 w-4" /></Button>
              )}
            </div>, { required: true })}
          {field("departmentId", "الإدارة",
            <div className="flex gap-2">
              <Select value={(form.departmentId as string) ?? ""} onValueChange={(v) => set("departmentId", v)}>
                <SelectTrigger className={`flex-1 ${missingClass("departmentId")}`}><SelectValue placeholder="— اختر —" /></SelectTrigger>
                <SelectContent>{(lookups?.departments ?? []).map((d) => <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>)}</SelectContent>
              </Select>
              {!isSelf && (
                <Button type="button" variant="outline" size="icon" onClick={() => addLookup("departments")}><Plus className="h-4 w-4" /></Button>
              )}
            </div>, { required: true })}
          {field("employmentType", "نوع العلاقة",
            <Select value={(form.employmentType as string) ?? ""} onValueChange={(v) => set("employmentType", v)}>
              <SelectTrigger className={missingClass("employmentType")}><SelectValue placeholder="— اختر —" /></SelectTrigger>
              <SelectContent>{employmentOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.labelAr}</SelectItem>)}</SelectContent>
            </Select>, { required: true })}
          {field("joinedAt", "تاريخ الالتحاق",
            <DateField value={dateInput(form.joinedAt)} onChange={(v) => set("joinedAt", v)} fromYear={2005} toYear={new Date().getFullYear()} className={missingClass("joinedAt")} />,
            { required: true })}
          {field("workRegion", "مقر العمل / المنطقة",
            <Input className={missingClass("workRegion")} value={String(form.workRegion ?? "")} onChange={(e) => set("workRegion", e.target.value)} />,
            { hint: "ملزم للمراسل الميداني" })}
        </div>
      )}

      {activeSection === "press" && !isSelf && (
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="sm:col-span-2 rounded-lg bg-sky-500/5 px-3 py-2 text-xs text-muted-foreground">
            هذه الحقول تغذي بطاقة Apple Wallet الصحفية مباشرة، وتُزامَن تلقائياً مع النظام القديم.
          </p>
          {field("pressIdNumber", "رقم البطاقة الصحفية",
            <Input className={missingClass("pressIdNumber")} value={String(form.pressIdNumber ?? "")} onChange={(e) => set("pressIdNumber", e.target.value)} />)}
          {field("pressCardValidUntil", "صلاحية البطاقة",
            <DateField value={dateInput(form.pressCardValidUntil)} onChange={(v) => set("pressCardValidUntil", v)} fromYear={new Date().getFullYear()} toYear={new Date().getFullYear() + 6} />)}
          {field("mediaLicenseNumber", "رقم الترخيص المهني",
            <Input className={missingClass("mediaLicenseNumber")} value={String(form.mediaLicenseNumber ?? "")} onChange={(e) => set("mediaLicenseNumber", e.target.value)} />,
            { hint: "اختياري هنا — يُدار عبر بطاقة الترخيص المهنية بعد الحصول عليه" })}
          {field("mediaLicenseExpiresAt", "انتهاء الترخيص",
            <DateField value={dateInput(form.mediaLicenseExpiresAt)} onChange={(v) => set("mediaLicenseExpiresAt", v)} fromYear={new Date().getFullYear() - 1} toYear={new Date().getFullYear() + 6} className={missingClass("mediaLicenseExpiresAt")} />,
            { hint: "اختياري — ليس شرطاً لشهادة التعريف" })}
        </div>
      )}

      {activeSection === "contact" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {field("officialPhone", "الجوال الرسمي",
            <Input dir="ltr" value={String(form.officialPhone ?? "")} onChange={(e) => set("officialPhone", e.target.value)} />)}
          {field("officialEmail", "البريد الرسمي",
            <Input dir="ltr" value={String(form.officialEmail ?? "")} onChange={(e) => set("officialEmail", e.target.value)} />)}
          {field("emergencyContactName", "اسم جهة الطوارئ",
            <Input value={String(form.emergencyContactName ?? "")} onChange={(e) => set("emergencyContactName", e.target.value)} />)}
          {field("emergencyContactRelation", "صلة القرابة",
            <Input value={String(form.emergencyContactRelation ?? "")} onChange={(e) => set("emergencyContactRelation", e.target.value)} />)}
          {field("emergencyContactPhone", "جوال الطوارئ",
            <Input dir="ltr" value={String(form.emergencyContactPhone ?? "")} onChange={(e) => set("emergencyContactPhone", e.target.value)} />)}
          {field("bloodType", "فصيلة الدم",
            <Select value={(form.bloodType as string) ?? ""} onValueChange={(v) => set("bloodType", v)}>
              <SelectTrigger><SelectValue placeholder="اختياري" /></SelectTrigger>
              <SelectContent>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>)}
        </div>
      )}

      {activeSection === "public" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {field("bioAr", "نبذة عربية",
            <Textarea rows={3} value={String(form.bioAr ?? "")} onChange={(e) => set("bioAr", e.target.value)} />, { wide: true })}
          {field("specializations", "التخصصات",
            <Input
              placeholder="افصل بفاصلة: شؤون محلية، تقنية"
              value={Array.isArray(form.specializations) ? (form.specializations as string[]).join("، ") : ""}
              onChange={(e) => set("specializations", e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean))}
            />)}
          {field("yearsOfExperience", "سنوات الخبرة",
            <Input type="number" min={0} value={form.yearsOfExperience == null ? "" : String(form.yearsOfExperience)} onChange={(e) => set("yearsOfExperience", e.target.value)} />)}
          {field("socialX", "حساب X",
            <Input dir="ltr" placeholder="@handle" value={String(form.socialX ?? "")} onChange={(e) => set("socialX", e.target.value)} />)}
          {field("socialLinkedin", "LinkedIn",
            <Input dir="ltr" value={String(form.socialLinkedin ?? "")} onChange={(e) => set("socialLinkedin", e.target.value)} />)}
          {field("personalWebsite", "موقع شخصي",
            <Input dir="ltr" value={String(form.personalWebsite ?? "")} onChange={(e) => set("personalWebsite", e.target.value)} />)}
          {field("previousEmployers", "جهات العمل السابقة",
            <Textarea rows={2} value={String(form.previousEmployers ?? "")} onChange={(e) => set("previousEmployers", e.target.value)} />, { wide: true })}
        </div>
      )}

      {activeSection === "docs" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="sm:col-span-2 rounded-lg bg-sky-500/5 px-3 py-2 text-xs text-muted-foreground">
            {isSelf
              ? "تخزين خاص — يمكنك رفع السيرة وصورة الهوية والترخيص. العقد يبقى لدى الموارد البشرية."
              : "تخزين خاص — الاطلاع لصلاحية الموارد البشرية فقط، والتنزيل برابط موقّت."}
          </p>
          {docKinds.map((doc) => {
            const filled = Boolean(form[doc.keyField]);
            return (
              <div key={doc.kind} className={`rounded-xl border-2 p-4 text-center ${filled ? "border-emerald-500/40" : "border-dashed"}`}>
                <div className="text-xl">{doc.icon}</div>
                <div className="mt-1 text-sm font-bold">{doc.labelAr}</div>
                <div className={`text-[11px] ${filled ? "font-semibold text-emerald-600" : "text-muted-foreground"}`}>
                  {filled ? "✓ مرفوعة" : "لم تُرفع بعد"}
                </div>
                <div className="mt-2 flex justify-center gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => e.target.files?.[0] && uploadDoc(doc.kind, e.target.files[0])}
                    />
                    <span className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold text-sky-600">
                      {uploadingDoc === doc.kind ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                      {filled ? "استبدال" : "رفع"}
                    </span>
                  </label>
                  {filled && (
                    <a
                      href={apiUrl(`${apiBase}/documents/${doc.kind}`)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold text-muted-foreground"
                    >
                      <ExternalLink className="h-3 w-3" /> عرض
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      {selfLocked && (
        <p
          className="rounded-xl border border-sky-300/70 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100"
          data-testid="text-profile-locked-pending"
        >
          {lockMessage}
        </p>
      )}
      {isSelf && reviewStatus === "approved" && !hasOfficialFullName && !selfLocked && (
        <p
          className="rounded-xl border border-amber-300/70 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
          data-testid="text-fill-official-full-name"
        >
          أكمل <b>الاسم الرباعي</b> كما في الهوية لإصدار شهادة التعريف. هذا الاسم للشهادة فقط ولن يظهر في مقالاتك.
        </p>
      )}
      <div className={mode === "dialog" ? "flex gap-3 items-start" : "flex flex-col gap-3"}>
        {tabs}
        <div
          className={selfLocked ? "pointer-events-none select-none opacity-70" : undefined}
          aria-disabled={selfLocked || undefined}
        >
          {panels}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
        {!data.profile ? (
          <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-600">
            الملف لم يُنشأ بعد — الحفظ الأول ينشئه برقم وظيفي
          </Badge>
        ) : selfLocked ? (
          <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-600">
            {reviewStatus === "approved" ? "معتمد — التعديل مقفل" : "قيد المراجعة — التعديل مقفل"}
          </Badge>
        ) : missingLabels.length > 0 ? (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600">
            ⚠ {missingLabels.length} نواقص ملزمة: {missingLabels.slice(0, 4).join("، ")}{missingLabels.length > 4 ? "…" : ""}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600">✓ الملف مكتمل</Badge>
        )}
        {!selfLocked && (
          <Button className="mr-auto" disabled={save.isPending} onClick={() => save.mutate()} data-testid="button-save-staff-profile">
            {save.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />} حفظ الملف
          </Button>
        )}
      </div>
    </div>
  );
}
