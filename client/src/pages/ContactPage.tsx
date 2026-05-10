import { useState, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getCsrfToken } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  MessageSquare, 
  Phone, 
  Mail, 
  User, 
  Send,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Paperclip,
  FileText,
  Image as ImageIcon,
  X
} from "lucide-react";
import { SiWhatsapp } from "react-icons/si";

interface Attachment {
  name: string;
  size: number;
  type: string;
  url?: string;
  file?: File;
}

const contactFormSchema = z.object({
  name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  phone: z.string()
    .regex(/^\+966[0-9]{9}$/, "رقم الهاتف يجب أن يبدأ بـ +966 متبوعاً بـ 9 أرقام"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  subject: z.enum(["استفسار عام", "شراكات إعلامية", "شكوى", "اقتراح", "أخرى"], {
    required_error: "يرجى اختيار موضوع الرسالة",
  }),
  message: z.string().min(10, "الرسالة يجب أن تكون 10 أحرف على الأقل"),
  captchaAnswer: z.string().min(1, "يرجى الإجابة على سؤال التحقق"),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

const subjectOptions = [
  { value: "استفسار عام", label: "استفسار عام" },
  { value: "شراكات إعلامية", label: "شراكات إعلامية" },
  { value: "شكوى", label: "شكوى" },
  { value: "اقتراح", label: "اقتراح" },
  { value: "أخرى", label: "أخرى" },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain"
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return ImageIcon;
  return FileText;
}

export default function ContactPage() {
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: user } = useQuery<{ name?: string | null; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
  });

  const captcha = useMemo(() => {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    return { num1, num2, answer: num1 + num2 };
  }, [isSubmitted]);

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      phone: "+966",
      email: "",
      subject: undefined,
      message: "",
      captchaAnswer: "",
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
      }
      const response = await fetch("/api/contact/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "فشل رفع الملف");
      }
      return response.json();
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      if (parseInt(data.captchaAnswer) !== captcha.answer) {
        throw new Error("إجابة سؤال التحقق غير صحيحة");
      }
      const { captchaAnswer, ...submitData } = data;
      return apiRequest("/api/contact", {
        method: "POST",
        body: JSON.stringify({
          ...submitData,
          attachments: attachments.map(a => ({ name: a.name, size: a.size, type: a.type, url: a.url })),
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الإرسال بنجاح",
        description: "شكراً لتواصلك معنا. سنرد عليك في أقرب وقت ممكن.",
      });
      form.reset();
      setAttachments([]);
      setIsSubmitted(true);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في الإرسال",
        description: error.message || "حدث خطأ أثناء إرسال الرسالة. يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      toast({
        title: "نوع الملف غير مدعوم",
        description: "الأنواع المسموحة: صور، PDF، Word، Excel، ملفات نصية",
        variant: "destructive",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "حجم الملف كبير جداً",
        description: "الحد الأقصى لحجم الملف هو 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadMutation.mutateAsync(file);
      setAttachments([...attachments, {
        name: file.name,
        size: file.size,
        type: file.type,
        url: result.url,
      }]);
      toast({
        title: "تم رفع الملف",
        description: `تم رفع ${file.name} بنجاح`,
      });
    } catch (error: any) {
      toast({
        title: "خطأ في رفع الملف",
        description: error.message || "حدث خطأ أثناء رفع الملف",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const onSubmit = (data: ContactFormData) => {
    submitMutation.mutate(data);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Header user={user} />
        <main className="container mx-auto px-4 py-12">
          <Card className="max-w-lg mx-auto text-center">
            <CardContent className="pt-12 pb-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold mb-4" data-testid="text-success-title">
                تم استلام رسالتك بنجاح
              </h2>
              <p className="text-muted-foreground mb-6" data-testid="text-success-message">
                شكراً لتواصلك معنا. فريقنا سيقوم بمراجعة رسالتك والرد عليك في أقرب وقت ممكن.
              </p>
              <Button 
                onClick={() => setIsSubmitted(false)}
                data-testid="button-send-another"
              >
                إرسال رسالة أخرى
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />
      
      <main className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8 md:mb-12">
            <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="heading-contact-title">
              تواصل معنا
            </h1>
            <p className="text-muted-foreground text-lg" data-testid="text-contact-subtitle">
              نسعد بتواصلك معنا ونحرص على الرد على استفساراتك في أسرع وقت
            </p>
          </div>

          {/* Contact Methods - 2 Cards */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <a
              href="https://wa.me/966500226622"
              target="_blank"
              rel="noopener noreferrer"
              className="block"
              data-testid="link-whatsapp"
            >
              <Card className="hover-elevate cursor-pointer h-full border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                <CardContent className="pt-6 text-center">
                  <div className="w-14 h-14 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <SiWhatsapp className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">واتساب</h3>
                  <p className="text-muted-foreground text-sm mb-2">تواصل معنا مباشرة</p>
                  <p className="font-medium text-green-600 dark:text-green-400 dir-ltr">
                    +966 500 226 622
                  </p>
                </CardContent>
              </Card>
            </a>

            <a href="mailto:info@sabq.org" className="block" data-testid="link-email">
              <Card className="hover-elevate cursor-pointer h-full">
                <CardContent className="pt-6 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">البريد الإلكتروني</h3>
                  <p className="text-muted-foreground text-sm mb-2">راسلنا عبر الإيميل</p>
                  <p className="font-medium text-primary">
                    info@sabq.org
                  </p>
                </CardContent>
              </Card>
            </a>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                نموذج التواصل
              </CardTitle>
              <CardDescription>
                أرسل لنا رسالتك وسنقوم بالرد عليك في أقرب وقت ممكن
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الاسم الكامل</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input 
                                placeholder="أدخل اسمك الكامل" 
                                className="pr-10" 
                                {...field} 
                                data-testid="input-name"
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
                          <FormLabel>رقم الهاتف</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input 
                                placeholder="+966500000000" 
                                className="pr-10 dir-ltr text-right" 
                                {...field} 
                                data-testid="input-phone"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>البريد الإلكتروني</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input 
                                type="email"
                                placeholder="example@email.com" 
                                className="pr-10 dir-ltr text-right" 
                                {...field} 
                                data-testid="input-email"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>موضوع الرسالة</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-subject">
                                <SelectValue placeholder="اختر موضوع الرسالة" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {subjectOptions.map((option) => (
                                <SelectItem 
                                  key={option.value} 
                                  value={option.value}
                                  data-testid={`select-item-${option.value}`}
                                >
                                  {option.label}
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
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الرسالة</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="اكتب رسالتك هنا..." 
                            className="min-h-[120px] resize-none" 
                            {...field} 
                            data-testid="textarea-message"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Attachments Section */}
                  <div className="space-y-3">
                    <FormLabel>المرفقات (اختياري)</FormLabel>
                    
                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        {attachments.map((attachment, index) => {
                          const FileIcon = getFileIcon(attachment.type);
                          return (
                            <div 
                              key={index} 
                              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border"
                              data-testid={`attachment-item-${index}`}
                            >
                              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                                <FileIcon className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{attachment.name}</p>
                                <p className="text-xs text-muted-foreground">{formatFileSize(attachment.size)}</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveAttachment(index)}
                                className="flex-shrink-0 h-8 w-8"
                                data-testid={`button-remove-attachment-${index}`}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                      className="hidden"
                      data-testid="input-file"
                    />

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                      disabled={isUploading}
                      data-testid="button-add-attachment"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                          جاري رفع الملف...
                        </>
                      ) : (
                        <>
                          <Paperclip className="w-4 h-4 ml-2" />
                          إضافة مرفق
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center">
                      الحد الأقصى: 10 ميجابايت | الأنواع المسموحة: صور، PDF، Word، Excel
                    </p>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <FormField
                      control={form.control}
                      name="captchaAnswer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">
                            سؤال التحقق: ما نتيجة {captcha.num1} + {captcha.num2}؟
                          </FormLabel>
                          <FormControl>
                            <Input 
                              type="number"
                              placeholder="أدخل الإجابة" 
                              className="max-w-[150px]" 
                              {...field} 
                              data-testid="input-captcha"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={submitMutation.isPending}
                    data-testid="button-submit"
                  >
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 ml-2" />
                        إرسال الرسالة
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
