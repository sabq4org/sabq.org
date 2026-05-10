import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Circle, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import type { Category } from "@shared/schema";

interface UserInterest {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  heroImageUrl?: string;
}

export default function SelectInterests() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const [selectedInterests, setSelectedInterests] = useState<Set<string>>(new Set());

  // Fetch user's current interests
  const { data: userInterestsRaw, isLoading: userInterestsLoading } = useQuery<UserInterest[]>({
    queryKey: ["/api/interests"],
    enabled: !!user,
  });
  const userInterests = Array.isArray(userInterestsRaw) ? userInterestsRaw : [];

  // Check if editing existing interests
  const isEditingInterests = userInterests.length > 0;

  // Pre-select user's current interests
  useEffect(() => {
    if (userInterests.length > 0) {
      setSelectedInterests(new Set(userInterests.map(i => i.id)));
    }
  }, [userInterests]);

  // Fetch categories as interests
  const { data: categoriesRaw, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const toggleInterest = (categoryId: string) => {
    const newSelected = new Set(selectedInterests);
    if (newSelected.has(categoryId)) {
      newSelected.delete(categoryId);
    } else {
      newSelected.add(categoryId);
    }
    setSelectedInterests(newSelected);
  };

  // Save interests mutation
  const saveInterestsMutation = useMutation({
    mutationFn: async (interestIds: string[]) => {
      return await apiRequest("/api/interests", {
        method: "POST",
        body: JSON.stringify({ interestIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/interests"] });
      
      // If editing, go back to profile; if onboarding, go to personalize
      if (isEditingInterests) {
        toast({
          title: "تم التحديث بنجاح ✅",
          description: "تم تحديث اهتماماتك الذكية بنجاح.",
        });
        setLocation("/profile");
      } else {
        setLocation("/onboarding/personalize");
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "حدث خطأ",
        description: "تعذر حفظ اهتماماتك. حاول مرة أخرى.",
      });
    },
  });

  const handleContinue = () => {
    if (selectedInterests.size < 3) {
      toast({
        variant: "destructive",
        title: "اختر المزيد",
        description: "اختر على الأقل 3 اهتمامات لنبني لك تجربة أكثر ذكاءً.",
      });
      return;
    }
    saveInterestsMutation.mutate(Array.from(selectedInterests));
  };

  const progress = Math.min((selectedInterests.size / 3) * 100, 100);

  if (isUserLoading || categoriesLoading || userInterestsLoading) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h1 className="text-3xl md:text-4xl font-bold">
            {isEditingInterests ? "✏️ تعديل اهتماماتك" : "🧭 اختر اهتماماتك"}
          </h1>
          <p className="text-muted-foreground text-lg">
            {isEditingInterests 
              ? "عدّل اهتماماتك لتكتشف محتوى أكثر قربًا لك"
              : <>اختر على الأقل <strong>3 اهتمامات</strong> لنبني لك تجربة أكثر ذكاءً</>
            }
          </p>
        </motion.div>

        {/* Progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-2"
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {selectedInterests.size} من 3 (على الأقل)
            </span>
            <Badge variant={selectedInterests.size >= 3 ? "default" : "secondary"}>
              {selectedInterests.size >= 3 ? "جاهز للمتابعة" : "اختر المزيد"}
            </Badge>
          </div>
          <Progress value={progress} className="h-2" />
        </motion.div>

        {/* Categories Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
        >
          {categories.map((category, index) => {
            const isSelected = selectedInterests.has(category.id);
            return (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className={`cursor-pointer transition-all duration-200 hover-elevate active-elevate-2 ${
                    isSelected ? "border-primary border-2 bg-primary/5" : ""
                  }`}
                  onClick={() => toggleInterest(category.id)}
                  data-testid={`interest-card-${category.id}`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Icon/Image */}
                    {category.heroImageUrl ? (
                      <div className="aspect-video rounded-md overflow-hidden bg-muted">
                        <img
                          src={category.heroImageUrl}
                          alt={category.nameAr}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="aspect-video rounded-md bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                        <span className="text-3xl font-bold text-primary">
                          {category.nameAr.charAt(0)}
                        </span>
                      </div>
                    )}

                    {/* Category Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{category.nameAr}</h3>
                        {category.nameEn && (
                          <p className="text-xs text-muted-foreground truncate">
                            {category.nameEn}
                          </p>
                        )}
                      </div>
                      {isSelected ? (
                        <CheckCircle2 className="w-6 h-6 text-primary flex-shrink-0 ml-2" />
                      ) : (
                        <Circle className="w-6 h-6 text-muted-foreground flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center gap-4"
        >
          {!isEditingInterests && (
            <Button
              variant="outline"
              onClick={() => setLocation("/onboarding/welcome")}
              data-testid="button-back"
            >
              رجوع
            </Button>
          )}
          {isEditingInterests && (
            <Button
              variant="outline"
              onClick={() => setLocation("/profile")}
              data-testid="button-cancel"
            >
              إلغاء
            </Button>
          )}
          <Button
            onClick={handleContinue}
            disabled={selectedInterests.size < 3 || saveInterestsMutation.isPending}
            size="lg"
            className="px-12"
            data-testid="button-confirm-interests"
          >
            {saveInterestsMutation.isPending ? (
              "جاري الحفظ..."
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                {isEditingInterests ? "حفظ التغييرات" : "تأكيد الاهتمامات"}
              </>
            )}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
