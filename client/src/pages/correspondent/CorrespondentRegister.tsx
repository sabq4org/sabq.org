import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiUrl } from "@/lib/queryClient";
import { Camera, Loader2, CheckCircle, UserPlus, FileText, BadgeCheck, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const SAUDI_REGIONS = [
  "الرياض",
  "مكة المكرمة",
  "المدينة المنورة",
  "القصيم",
  "المنطقة الشرقية",
  "عسير",
  "تبوك",
  "حائل",
  "الحدود الشمالية",
  "جازان",
  "نجران",
  "الباحة",
  "الجوف",
];

const SPECIALIZATIONS = [
  "محليات",
  "سياسة",
  "اقتصاد",
  "رياضة",
  "تقنية",
  "ثقافة وفن",
  "صحة",
  "تعليم",
  "سياحة وسفر",
  "منوعات",
];

const registrationSchema = z.object({
  arabicName: z.string().min(3, "الاسم بالعربية يجب أن يكون 3 أحرف على الأقل"),
  englishName: z.string().min(3, "الاسم بالإنجليزية يجب أن يكون 3 أحرف على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  phone: z.string().min(10, "رقم الهاتف يجب أن يكون 10 أرقام على الأقل"),
  nationalId: z.string().regex(/^[12]\d{9}$/, "رقم الهوية/الإقامة يجب أن يكون 10 أرقام ويبدأ بـ 1 أو 2"),
  region: z.string().min(1, "المنطقة مطلوبة"),
  city: z.string().min(2, "المدينة مطلوبة"),
  jobTitle: z.string().default("مراسل صحفي"),
  licenseNumber: z.string().min(3, "رقم الترخيص المهني مطلوب"),
  licenseExpiresAt: z.string().optional(),
  specializations: z.array(z.string()).min(1, "اختر مجال تغطية واحداً على الأقل"),
  yearsOfExperience: z.string().optional(),
  currentEmployer: z.string().optional(),
  portfolioLinks: z.string().optional(),
  bio: z.string().optional(),
  consent: z.boolean().refine((v) => v === true, {
    message: "يجب الإقرار بصحة البيانات والموافقة على معالجتها",
  }),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function CorrespondentRegister() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      arabicName: "",
      englishName: "",
      email: "",
      phone: "",
      nationalId: "",
      region: "",
      city: "",
      jobTitle: "مراسل صحفي",
      licenseNumber: "",
      licenseExpiresAt: "",
      specializations: [],
      yearsOfExperience: "",
      currentEmployer: "",
      portfolioLinks: "",
      bio: "",
      consent: false,
    },
  });

  const validateSize = (file: File, maxMb: number, label: string): boolean => {
    if (file.size > maxMb * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "حجم الملف كبير",
        description: `${label} يجب أن يكون أقل من ${maxMb} ميجابايت`,
      });
      return false;
    }
    return true;
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateSize(file, 5, "حجم الصورة الشخصية")) {
      setProfilePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLicenseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "نوع الملف غير مدعوم", description: "الترخيص المهني يجب أن يكون صورة أو ملف PDF" });
      return;
    }
    if (validateSize(file, 10, "حجم ملف الترخيص")) setLicenseFile(file);
  };

  const handleCvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ variant: "destructive", title: "نوع الملف غير مدعوم", description: "السيرة الذاتية يجب أن تكون ملف PDF" });
      return;
    }
    if (validateSize(file, 10, "حجم السيرة الذاتية")) setCvFile(file);
  };

  const onSubmit = async (data: RegistrationFormData) => {
    if (!profilePhoto) {
      toast({ variant: "destructive", title: "الصورة مطلوبة", description: "يرجى رفع صورة شخصية" });
      return;
    }
    if (!licenseFile) {
      toast({ variant: "destructive", title: "الترخيص مطلوب", description: "يرجى إرفاق صورة الترخيص المهني" });
      return;
    }
    if (!cvFile) {
      toast({ variant: "destructive", title: "السيرة الذاتية مطلوبة", description: "يرجى إرفاق السيرة الذاتية (PDF)" });
      return;
    }

    try {
      setIsLoading(true);

      const formData = new FormData();
      formData.append("profilePhoto", profilePhoto);
      formData.append("licenseFile", licenseFile);
      formData.append("cvFile", cvFile);
      formData.append("arabicName", data.arabicName);
      formData.append("englishName", data.englishName);
      formData.append("email", data.email);
      formData.append("phone", data.phone);
      formData.append("nationalId", data.nationalId);
      formData.append("region", data.region);
      formData.append("city", data.city);
      formData.append("jobTitle", data.jobTitle || "مراسل صحفي");
      formData.append("licenseNumber", data.licenseNumber);
      if (data.licenseExpiresAt) formData.append("licenseExpiresAt", data.licenseExpiresAt);
      formData.append("specializations", data.specializations.join("، "));
      if (data.yearsOfExperience) formData.append("yearsOfExperience", data.yearsOfExperience);
      if (data.currentEmployer) formData.append("currentEmployer", data.currentEmployer);
      if (data.portfolioLinks) formData.append("portfolioLinks", data.portfolioLinks);
      if (data.bio) formData.append("bio", data.bio);
      formData.append("consent", "true");

      const response = await fetch(apiUrl("/api/correspondent-applications"), {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "حدث خطأ في تقديم الطلب");
      }

      setIsSubmitted(true);
      toast({
        title: "تم تقديم الطلب بنجاح",
        description: result.message,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "فشل في تقديم الطلب",
        description: error.message || "حدث خطأ غير متوقع",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold" data-testid="text-success-title">تم تقديم طلبك بنجاح</h2>
              <p className="text-muted-foreground" data-testid="text-success-message">
                شكراً لتقديم طلبك للانضمام كمراسل. سيتم مراجعة طلبك من قبل فريق الإدارة والرد عليك قريباً على البريد الإلكتروني المسجل.
              </p>
              <Button
                variant="outline"
                onClick={() => window.location.href = "/"}
                data-testid="button-go-home"
              >
                العودة للرئيسية
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30" dir="rtl">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
            <UserPlus className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-page-title">التسجيل كمراسل</CardTitle>
          <CardDescription data-testid="text-page-description">
            قم بتعبئة النموذج أدناه للتقدم بطلب الانضمام كمراسل صحفي
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex flex-col items-center mb-6">
                <div
                  className="relative w-32 h-32 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors"
                  onClick={() => document.getElementById('photo-upload')?.click()}
                  data-testid="button-upload-photo"
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="معاينة الصورة" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center text-muted-foreground">
                      <Camera className="w-8 h-8 mb-2" />
                      <span className="text-xs">اضغط لرفع صورة</span>
                    </div>
                  )}
                </div>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                  data-testid="input-photo"
                />
                <p className="text-xs text-muted-foreground mt-2">الصورة الشخصية (مطلوبة - أقصى حجم 5 ميجابايت)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="arabicName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالعربية *</FormLabel>
                      <FormControl>
                        <Input placeholder="محمد أحمد" {...field} data-testid="input-arabic-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="englishName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الاسم بالإنجليزية *</FormLabel>
                      <FormControl>
                        <Input placeholder="Mohammed Ahmed" {...field} data-testid="input-english-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>البريد الإلكتروني *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="email@example.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الهاتف *</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="+966 5xxxxxxxx" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="nationalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رقم الهوية / الإقامة *</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="1xxxxxxxxx"
                          {...field}
                          data-testid="input-national-id"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="jobTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المسمى الوظيفي</FormLabel>
                      <FormControl>
                        <Input placeholder="مراسل صحفي" {...field} data-testid="input-job-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المنطقة *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-region">
                            <SelectValue placeholder="اختر المنطقة" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SAUDI_REGIONS.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المدينة *</FormLabel>
                      <FormControl>
                        <Input placeholder="الرياض" {...field} data-testid="input-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* — الترخيص المهني — */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 font-medium">
                  <BadgeCheck className="w-4 h-4 text-primary" />
                  الترخيص المهني (هيئة تنظيم الإعلام)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="licenseNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>رقم الترخيص المهني *</FormLabel>
                        <FormControl>
                          <Input placeholder="رقم الترخيص" {...field} data-testid="input-license-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="licenseExpiresAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>تاريخ انتهاء الترخيص (اختياري)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-license-expiry" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div>
                  <input
                    id="license-upload"
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleLicenseChange}
                    data-testid="input-license-file"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => document.getElementById("license-upload")?.click()}
                    data-testid="button-upload-license"
                  >
                    <Upload className="w-4 h-4" />
                    {licenseFile ? licenseFile.name : "إرفاق صورة الترخيص المهني * (صورة أو PDF)"}
                  </Button>
                </div>
              </div>

              {/* — الخبرة المهنية — */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center gap-2 font-medium">
                  <FileText className="w-4 h-4 text-primary" />
                  الخبرة المهنية
                </div>

                <FormField
                  control={form.control}
                  name="specializations"
                  render={() => (
                    <FormItem>
                      <FormLabel>مجالات التغطية * (اختر مجالاً أو أكثر)</FormLabel>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {SPECIALIZATIONS.map((spec) => (
                          <FormField
                            key={spec}
                            control={form.control}
                            name="specializations"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(spec)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      field.onChange(
                                        checked
                                          ? [...current, spec]
                                          : current.filter((v) => v !== spec),
                                      );
                                    }}
                                    data-testid={`checkbox-spec-${spec}`}
                                  />
                                </FormControl>
                                <FormLabel className="text-sm font-normal cursor-pointer">{spec}</FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="yearsOfExperience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>سنوات الخبرة (اختياري)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} max={60} placeholder="5" {...field} data-testid="input-experience" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="currentEmployer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>جهة العمل الحالية / الأخيرة (اختياري)</FormLabel>
                        <FormControl>
                          <Input placeholder="اسم الجهة" {...field} data-testid="input-employer" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="portfolioLinks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>روابط أعمال منشورة (اختياري — رابط في كل سطر)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={"https://...\nhttps://..."}
                          className="min-h-[80px] resize-none"
                          dir="ltr"
                          {...field}
                          data-testid="input-portfolio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div>
                  <input
                    id="cv-upload"
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleCvChange}
                    data-testid="input-cv-file"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => document.getElementById("cv-upload")?.click()}
                    data-testid="button-upload-cv"
                  >
                    <Upload className="w-4 h-4" />
                    {cvFile ? cvFile.name : "إرفاق السيرة الذاتية * (PDF)"}
                  </Button>
                </div>
              </div>

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نبذة عنك (اختياري)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="اكتب نبذة مختصرة عن خبراتك وتخصصاتك..."
                        className="min-h-[100px] resize-none"
                        {...field}
                        data-testid="input-bio"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="consent"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex flex-row items-start gap-3 rounded-lg border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-consent"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-relaxed">
                        <FormLabel className="text-sm font-normal cursor-pointer">
                          أقر بأن جميع البيانات والمستندات المقدمة صحيحة، وأوافق على معالجتها والاحتفاظ بها لأغراض دراسة طلب الانضمام وفق سياسة الخصوصية وشروط الخدمة. *
                        </FormLabel>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Alert>
                <AlertDescription className="text-sm text-muted-foreground">
                  سيتم مراجعة طلبك خلال 48 ساعة عمل.
                  إذا كان لديك حساب قارئ مسجّل بنفس البريد الإلكتروني فستتم ترقيته تلقائياً إلى حساب مراسل عند قبول الطلب — لن تفقد بياناتك.
                </AlertDescription>
              </Alert>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري تقديم الطلب...
                  </>
                ) : (
                  "تقديم الطلب"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
