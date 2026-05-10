import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Interest } from "@shared/schema";

export default function SelectInterests() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const { data: user, isLoading: userLoading, error: userError } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: interests, isLoading, isError, error } = useQuery<Interest[]>({
    queryKey: ["/api/interests"],
  });

  const saveInterestsMutation = useMutation({
    mutationFn: async (interestIds: string[]) => {
      return await apiRequest("/api/user/interests", {
        method: "POST",
        body: JSON.stringify({ interestIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم حفظ اهتماماتك",
      });
      setLocation("/");
    },
    onError: (error: any) => {
      toast({
        title: "حدث خطأ",
        description: error.message || "فشل في حفظ الاهتمامات",
        variant: "destructive",
      });
    },
  });

  const toggleInterest = (interestId: string) => {
    setSelectedInterests((prev) => {
      if (prev.includes(interestId)) {
        return prev.filter((id) => id !== interestId);
      } else if (prev.length < 5) {
        return [...prev, interestId];
      }
      return prev;
    });
  };

  const handleSubmit = () => {
    if (selectedInterests.length < 3) {
      toast({
        title: "تنبيه",
        description: "يجب اختيار 3 اهتمامات على الأقل",
        variant: "destructive",
      });
      return;
    }
    saveInterestsMutation.mutate(selectedInterests);
  };

  const isUnauthorized = userError && isUnauthorizedError(userError as Error);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (isUnauthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-2xl font-bold mb-3">يجب تسجيل الدخول</h2>
          <p className="text-muted-foreground mb-6">
            سجل الدخول لإكمال ملفك الشخصي واختيار اهتماماتك
          </p>
          <Button 
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-login-to-select"
          >
            تسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  if (userError || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-2xl font-bold text-destructive mb-3">حدث خطأ</h2>
          <p className="text-muted-foreground mb-6">
            {(userError as Error)?.message || "فشل في تحميل بيانات المستخدم"}
          </p>
          <Button onClick={() => setLocation("/")} data-testid="button-go-home-error">
            العودة للصفحة الرئيسية
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-2xl font-bold text-destructive mb-3">حدث خطأ</h2>
          <p className="text-muted-foreground mb-6">
            {(error as Error)?.message || "فشل في تحميل الاهتمامات"}
          </p>
          <Button onClick={() => setLocation("/")} data-testid="button-go-home">
            العودة للصفحة الرئيسية
          </Button>
        </div>
      </div>
    );
  }

  if (!interests || interests.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-2xl font-bold mb-3">لا توجد اهتمامات متاحة</h2>
          <p className="text-muted-foreground mb-6">
            لم نتمكن من العثور على اهتمامات متاحة حالياً
          </p>
          <Button onClick={() => setLocation("/")} data-testid="button-skip-empty">
            تخطي للصفحة الرئيسية
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3" data-testid="heading-select-interests">
            اختر اهتماماتك
          </h1>
          <p className="text-lg text-muted-foreground mb-2">
            ساعدنا في تخصيص تجربتك الإخبارية
          </p>
          <p className="text-sm text-muted-foreground">
            اختر من 3 إلى 5 اهتمامات لنبني لك تجربة مخصصة
          </p>
          <div className="mt-4">
            <span className="text-sm font-medium">
              اخترت {selectedInterests.length} من 5
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {interests.map((interest) => {
            const isSelected = selectedInterests.includes(interest.id);
            const canSelect = selectedInterests.length < 5 || isSelected;

            return (
              <Card
                key={interest.id}
                onClick={() => canSelect && toggleInterest(interest.id)}
                className={`
                  cursor-pointer transition-all duration-200
                  hover-elevate active-elevate-2
                  ${isSelected ? "border-primary bg-primary/5" : ""}
                  ${!canSelect ? "opacity-50 cursor-not-allowed" : ""}
                `}
                data-testid={`card-interest-${interest.slug}`}
              >
                <div className="p-6 text-center">
                  <div className="text-4xl mb-3">{interest.icon}</div>
                  <h3 className="font-semibold text-base mb-1">{interest.nameAr}</h3>
                  {interest.description && (
                    <p className="text-xs text-muted-foreground">{interest.description}</p>
                  )}
                  {isSelected && (
                    <div className="mt-3">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs">
                        ✓
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-center gap-4">
          <Button
            variant="outline"
            onClick={() => setLocation("/")}
            data-testid="button-skip"
          >
            تخطي الآن
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedInterests.length < 3 || saveInterestsMutation.isPending}
            data-testid="button-continue"
          >
            {saveInterestsMutation.isPending ? "جاري الحفظ..." : "متابعة"}
          </Button>
        </div>
      </div>
    </div>
  );
}
