import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Camera, Loader2, CheckCircle, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const registrationSchema = z.object({
  arabicName: z.string().min(3, "الاسم بالعربية يجب أن يكون 3 أحرف على الأقل"),
  englishName: z.string().min(3, "الاسم بالإنجليزية يجب أن يكون 3 أحرف على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  phone: z.string().min(10, "رقم الهاتف يجب أن يكون 10 أرقام على الأقل"),
  jobTitle: z.string().default("مراسل صحفي"),
  bio: z.string().optional(),
  city: z.string().min(2, "المدينة مطلوبة"),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;

export default function CorrespondentRegister() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      arabicName: "",
      englishName: "",
      email: "",
      phone: "",
      jobTitle: "مراسل صحفي",
      bio: "",
      city: "",
    },
  });

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          variant: "destructive",
          title: "حجم الملف كبير",
          description: "يجب أن يكون حجم الصورة أقل من 10 ميجابايت",
        });
        return;
      }
      setProfilePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: RegistrationFormData) => {
    if (!profilePhoto) {
      toast({
        variant: "destructive",
        title: "الصورة مطلوبة",
        description: "يرجى رفع صورة شخصية",
      });
      return;
    }

    try {
      setIsLoading(true);

      const formData = new FormData();
      formData.append("profilePhoto", profilePhoto);
      formData.append("arabicName", data.arabicName);
      formData.append("englishName", data.englishName);
      formData.append("email", data.email);
      formData.append("phone", data.phone);
      formData.append("jobTitle", data.jobTitle || "مراسل صحفي");
      if (data.bio) {
        formData.append("bio", data.bio);
      }
      formData.append("city", data.city);

      const response = await fetch("/api/correspondent-applications", {
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
                <p className="text-xs text-muted-foreground mt-2">الصورة الشخصية (مطلوبة - أقصى حجم 10 ميجابايت)</p>
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

              <Alert>
                <AlertDescription className="text-sm text-muted-foreground">
                  بتقديم هذا الطلب، أنت توافق على شروط الخدمة وسياسة الخصوصية. سيتم مراجعة طلبك خلال 48 ساعة عمل.
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
