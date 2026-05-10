/**
 * Smart Newsletter Subscription Form
 * نموذج الاشتراك في النشرة الذكية مع MailerLite
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail, Sparkles, Check, Loader2, Bell } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

const subscribeSchema = z.object({
  email: z.string().email('يرجى إدخال بريد إلكتروني صحيح'),
  firstName: z.string().optional(),
  interests: z.array(z.string()).optional().default([]),
});

type SubscribeFormData = z.infer<typeof subscribeSchema>;

interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  icon?: string;
  color?: string;
}

interface SmartNewsletterFormProps {
  variant?: 'compact' | 'full';
  source?: string;
  className?: string;
}

export function SmartNewsletterForm({ 
  variant = 'full', 
  source = 'website',
  className = '' 
}: SmartNewsletterFormProps) {
  const { toast } = useToast();
  const [isSubscribed, setIsSubscribed] = useState(false);

  const form = useForm<SubscribeFormData>({
    resolver: zodResolver(subscribeSchema),
    defaultValues: {
      email: '',
      firstName: '',
      interests: [],
    },
  });

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<{ categories: Category[] }>({
    queryKey: ['/api/smart-newsletter/categories'],
  });

  const subscribeMutation = useMutation({
    mutationFn: async (data: SubscribeFormData) => {
      const response = await apiRequest('/api/smart-newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          source,
          language: 'ar',
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      setIsSubscribed(true);
      toast({
        title: 'تم الاشتراك بنجاح!',
        description: data.message || 'ستصلك أخبار مخصصة حسب اهتماماتك.',
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'خطأ في الاشتراك',
        description: error.message || 'يرجى المحاولة لاحقاً',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: SubscribeFormData) => {
    subscribeMutation.mutate(data);
  };

  const categories = Array.isArray(categoriesData?.categories) ? categoriesData.categories : (Array.isArray(categoriesData) ? categoriesData : []);

  if (isSubscribed) {
    return (
      <Card className={`bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border-green-200 dark:border-green-800 ${className}`}>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-xl font-bold text-green-800 dark:text-green-200 mb-2">
            مرحباً بك في النشرة الذكية!
          </h3>
          <p className="text-green-700 dark:text-green-300">
            ستصلك أخبار مخصصة حسب اهتماماتك قريباً
          </p>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'compact') {
    return (
      <Card className={`bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20 ${className}`}>
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold text-foreground">النشرة الذكية</h4>
                  <p className="text-sm text-muted-foreground">أخبار مخصصة لك</p>
                </div>
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          {...field}
                          type="email"
                          placeholder="بريدك الإلكتروني"
                          className="pr-10"
                          dir="ltr"
                          data-testid="input-newsletter-email"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="interests"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex flex-wrap gap-2">
                      {categoriesLoading ? (
                        <div className="text-sm text-muted-foreground">جاري التحميل...</div>
                      ) : (
                        categories.slice(0, 6).map((category) => {
                          const categoryIdStr = String(category.id);
                          const isSelected = field.value.includes(categoryIdStr);
                          return (
                            <Badge
                              key={category.id}
                              variant={isSelected ? 'default' : 'outline'}
                              className="cursor-pointer transition-all hover-elevate"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newValue = isSelected
                                  ? field.value.filter((id: string) => id !== categoryIdStr)
                                  : [...field.value, categoryIdStr];
                                field.onChange(newValue);
                              }}
                              data-testid={`badge-category-${category.slug}`}
                            >
                              {category.nameAr}
                            </Badge>
                          );
                        })
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={subscribeMutation.isPending}
                data-testid="button-subscribe-newsletter"
              >
                {subscribeMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري الاشتراك...
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4 ml-2" />
                    اشترك الآن
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-xl">النشرة الذكية</CardTitle>
            <CardDescription className="text-primary-foreground/80">
              اشترك لتصلك أخبار مخصصة حسب اهتماماتك
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم (اختياري)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="اسمك"
                        data-testid="input-newsletter-name"
                      />
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
                    <FormLabel>البريد الإلكتروني</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          {...field}
                          type="email"
                          placeholder="your@email.com"
                          className="pr-10"
                          dir="ltr"
                          data-testid="input-newsletter-email-full"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="interests"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اختر الأقسام التي تهمك</FormLabel>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                    {categoriesLoading ? (
                      <div className="col-span-full text-center text-muted-foreground py-4">
                        <Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />
                        جاري تحميل الأقسام...
                      </div>
                    ) : (
                      categories.map((category) => {
                        const categoryIdStr = String(category.id);
                        const isSelected = field.value.includes(categoryIdStr);
                        return (
                          <div
                            key={category.id}
                            className={`
                              flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all
                              ${isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                              }
                            `}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const newValue = isSelected
                                ? field.value.filter((id: string) => id !== categoryIdStr)
                                : [...field.value, categoryIdStr];
                              field.onChange(newValue);
                            }}
                            data-testid={`checkbox-category-${category.slug}`}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => {}}
                              className="pointer-events-none"
                            />
                            <span className="text-sm font-medium">{category.nameAr}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
              <p>
                بالاشتراك، أنت توافق على تلقي رسائل بريدية مخصصة حسب اهتماماتك.
                يمكنك إلغاء الاشتراك في أي وقت.
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={subscribeMutation.isPending}
              data-testid="button-subscribe-newsletter-full"
            >
              {subscribeMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  جاري الاشتراك...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 ml-2" />
                  اشترك في النشرة الذكية
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default SmartNewsletterForm;
