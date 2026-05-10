import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Sparkles,
  Send,
  User,
  Phone,
  Mail,
  MapPin,
  PenTool,
  Tag,
  FileText,
  Lightbulb,
  Briefcase,
  Link as LinkIcon,
  Calendar,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const submissionSchema = z.object({
  fullName: z.string().min(3, "الاسم يجب أن يكون 3 أحرف على الأقل"),
  phone: z.string().min(10, "رقم الجوال غير صالح"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  city: z.string().optional(),
  angleName: z.string().min(3, "اسم الزاوية يجب أن يكون 3 أحرف على الأقل"),
  angleCategory: z.string().min(1, "اختر تصنيف الزاوية"),
  angleDescription: z.string().min(50, "الوصف يجب أن يكون 50 حرف على الأقل"),
  uniquePoints: z.string().optional(),
  writingExperience: z.string().optional(),
  previousArticlesUrl: z.string().url("رابط غير صالح").optional().or(z.literal("")),
  expectedArticlesPerMonth: z.coerce.number().min(1).max(30).optional(),
});

type SubmissionFormData = z.infer<typeof submissionSchema>;

const categories = [
  { value: "political", label: "سياسي" },
  { value: "social", label: "اجتماعي" },
  { value: "sports", label: "رياضي" },
  { value: "tech", label: "تقني" },
  { value: "cultural", label: "ثقافي" },
  { value: "economic", label: "اقتصادي" },
  { value: "health", label: "صحي" },
  { value: "education", label: "تعليمي" },
  { value: "entertainment", label: "ترفيهي" },
  { value: "other", label: "أخرى" },
];

export default function MuqtarabSubmit() {
  const { toast } = useToast();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const form = useForm<SubmissionFormData>({
    resolver: zodResolver(submissionSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      city: "",
      angleName: "",
      angleCategory: "",
      angleDescription: "",
      uniquePoints: "",
      writingExperience: "",
      previousArticlesUrl: "",
      expectedArticlesPerMonth: 4,
    },
  });

  useEffect(() => {
    document.title = "اقترح زاويتك - مُقترب | سبق";
  }, []);

  const submitMutation = useMutation({
    mutationFn: async (data: SubmissionFormData) => {
      const response = await apiRequest("/api/angle-submissions", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return response;
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "تم إرسال طلبك بنجاح",
        description: "سيتم مراجعة طلبك والتواصل معك قريباً",
      });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: error instanceof Error ? error.message : "فشل في إرسال الطلب",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SubmissionFormData) => {
    submitMutation.mutate(data);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <main className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-background to-teal-500/5" />
          <div className="absolute top-20 right-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 left-20 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse" />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative z-10 text-center px-4"
          >
            <div className="w-24 h-24 mx-auto mb-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <h1 className="text-4xl md:text-5xl font-black mb-4 text-foreground">
              تم استلام طلبك!
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-md mx-auto">
              شكراً لاهتمامك بالكتابة في مُقترب. سيقوم فريقنا بمراجعة طلبك والتواصل معك قريباً.
            </p>
            <Button
              size="lg"
              onClick={() => window.location.href = "/muqtarab"}
              className="gap-2"
              data-testid="button-back-muqtarab"
            >
              استكشف زوايا مُقترب
              <ArrowRight className="w-4 h-4" />
            </Button>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />
      
      <main className="relative overflow-hidden">
        {/* Animated Background with geometric patterns */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
          
          {/* Floating geometric shapes */}
          <div className="absolute top-20 right-[10%] w-64 h-64 border border-primary/10 rounded-full animate-pulse" />
          <div className="absolute top-40 left-[15%] w-32 h-32 border border-accent/10 rounded-lg rotate-45 animate-bounce" style={{ animationDuration: '3s' }} />
          <div className="absolute bottom-40 right-[20%] w-48 h-48 border border-primary/5 rounded-xl rotate-12" />
          <div className="absolute bottom-20 left-[10%] w-56 h-56 bg-gradient-to-br from-primary/5 to-transparent rounded-full blur-2xl" />
          
          {/* Decorative dots grid */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-32 right-32 w-2 h-2 bg-primary/30 rounded-full" />
            <div className="absolute top-48 right-64 w-1.5 h-1.5 bg-accent/30 rounded-full" />
            <div className="absolute top-64 right-40 w-2 h-2 bg-primary/20 rounded-full" />
            <div className="absolute top-40 left-48 w-1.5 h-1.5 bg-accent/40 rounded-full" />
            <div className="absolute top-56 left-32 w-2 h-2 bg-primary/30 rounded-full" />
            <div className="absolute bottom-48 left-56 w-1.5 h-1.5 bg-accent/30 rounded-full" />
          </div>

          {/* Gradient orbs */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-radial from-primary/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-radial from-accent/10 to-transparent rounded-full blur-3xl" />
        </div>

        {/* Hero Section */}
        <section className="relative pt-16 pb-12 px-4" data-testid="section-hero">
          <div className="container max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <Sparkles className="w-4 h-4" />
                <span>شاركنا إبداعك</span>
              </div>
              
              <h1 className="text-4xl md:text-6xl font-black mb-6" data-testid="heading-title">
                <span className="bg-gradient-to-l from-primary via-foreground to-accent bg-clip-text text-transparent">
                  اقترح زاويتك
                </span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed" data-testid="text-tagline">
                هل لديك فكرة مميزة لزاوية كتابية؟ شاركنا رؤيتك وانضم إلى كتّاب مُقترب
              </p>
            </motion.div>
          </div>
        </section>

        {/* Form Section */}
        <section className="relative container max-w-4xl mx-auto px-4 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Card className="border-none shadow-2xl bg-card/80 backdrop-blur-sm">
              <CardContent className="p-6 md:p-10">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    
                    {/* Personal Information */}
                    <div className="space-y-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold">المعلومات الشخصية</h2>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>الاسم الكامل *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    placeholder="أدخل اسمك الكامل"
                                    className="pr-10"
                                    data-testid="input-fullName"
                                    {...field}
                                  />
                                </div>
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
                              <FormLabel>رقم الجوال *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    placeholder="05XXXXXXXX"
                                    className="pr-10"
                                    dir="ltr"
                                    data-testid="input-phone"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>البريد الإلكتروني *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    type="email"
                                    placeholder="example@email.com"
                                    className="pr-10"
                                    dir="ltr"
                                    data-testid="input-email"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>المدينة</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    placeholder="المدينة التي تقيم فيها"
                                    className="pr-10"
                                    data-testid="input-city"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Angle Information */}
                    <div className="space-y-6 pt-6 border-t">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                          <PenTool className="w-5 h-5 text-accent-foreground" />
                        </div>
                        <h2 className="text-xl font-bold">معلومات الزاوية المقترحة</h2>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="angleName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>اسم الزاوية *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <PenTool className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    placeholder="اسم الزاوية المقترحة"
                                    className="pr-10"
                                    data-testid="input-angleName"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="angleCategory"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>تصنيف الزاوية *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-angleCategory">
                                    <SelectValue placeholder="اختر التصنيف" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {categories.map((cat) => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                      {cat.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="angleDescription"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>وصف فكرة الزاوية *</FormLabel>
                            <FormDescription>
                              اشرح فكرة زاويتك بالتفصيل: ما المواضيع التي ستتناولها؟ ما الرسالة التي تريد إيصالها؟
                            </FormDescription>
                            <FormControl>
                              <Textarea
                                placeholder="اكتب وصفاً تفصيلياً لفكرة زاويتك..."
                                className="min-h-[120px] resize-none"
                                data-testid="textarea-angleDescription"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="uniquePoints"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ما الذي يميز زاويتك؟</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Lightbulb className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
                                <Textarea
                                  placeholder="ما الذي يجعل زاويتك فريدة ومختلفة عن غيرها؟"
                                  className="pr-10 min-h-[80px] resize-none"
                                  data-testid="textarea-uniquePoints"
                                  {...field}
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Experience */}
                    <div className="space-y-6 pt-6 border-t">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <Briefcase className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <h2 className="text-xl font-bold">الخبرة (اختياري)</h2>
                      </div>
                      
                      <FormField
                        control={form.control}
                        name="writingExperience"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>خبرتك في الكتابة</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="حدثنا عن خبرتك في الكتابة والصحافة..."
                                className="min-h-[80px] resize-none"
                                data-testid="textarea-writingExperience"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="previousArticlesUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>رابط لمقالات سابقة</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    placeholder="https://..."
                                    className="pr-10"
                                    dir="ltr"
                                    data-testid="input-previousArticlesUrl"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={form.control}
                          name="expectedArticlesPerMonth"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>عدد المقالات المتوقع شهرياً</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    type="number"
                                    min={1}
                                    max={30}
                                    placeholder="4"
                                    className="pr-10"
                                    data-testid="input-expectedArticlesPerMonth"
                                    {...field}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-6 border-t">
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full md:w-auto min-w-[200px] gap-2"
                        disabled={submitMutation.isPending}
                        data-testid="button-submit"
                      >
                        {submitMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            جاري الإرسال...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            إرسال الطلب
                          </>
                        )}
                      </Button>
                      <p className="text-sm text-muted-foreground mt-4">
                        بإرسال هذا النموذج، فإنك توافق على سياسة الخصوصية وشروط الاستخدام
                      </p>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </main>
      
      <Footer />
    </div>
  );
}
