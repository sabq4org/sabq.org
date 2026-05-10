import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle2, Circle, Save, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import type { Category } from "@shared/schema";

interface UserInterest {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  heroImageUrl?: string;
}

export default function EditInterests() {
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
      
      toast({
        title: "تم التحديث بنجاح ✅",
        description: "تم تحديث اهتماماتك بنجاح.",
      });
      setLocation("/profile");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "حدث خطأ",
        description: "تعذر حفظ اهتماماتك. حاول مرة أخرى.",
      });
    },
  });

  const handleSave = () => {
    if (selectedInterests.size < 3) {
      toast({
        variant: "destructive",
        title: "اختر المزيد",
        description: "اختر على الأقل 3 اهتمامات.",
      });
      return;
    }
    saveInterestsMutation.mutate(Array.from(selectedInterests));
  };

  const progress = Math.min((selectedInterests.size / 3) * 100, 100);

  if (isUserLoading || categoriesLoading || userInterestsLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header user={user || undefined} />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header user={user || undefined} />
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-5xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 mb-8"
        >
          <h1 className="text-3xl md:text-4xl font-bold" data-testid="text-page-title">
            تعديل اهتماماتي
          </h1>
          <p className="text-muted-foreground text-lg">
            عدّل اهتماماتك لتكتشف محتوى أكثر قربًا لك
          </p>
        </motion.div>

        {/* Progress */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-2 mb-8"
        >
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground" data-testid="text-selection-count">
              {selectedInterests.size} من 3 (على الأقل)
            </span>
            <Badge variant={selectedInterests.size >= 3 ? "default" : "secondary"} data-testid="badge-status">
              {selectedInterests.size >= 3 ? "جاهز للحفظ" : "اختر المزيد"}
            </Badge>
          </div>
          <Progress value={progress} className="h-2" data-testid="progress-interests" />
        </motion.div>

        {/* Categories Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
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
                  data-testid={`interest-card-${category.slug}`}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Icon/Image */}
                    {category.heroImageUrl ? (
                      <div className="aspect-video rounded-md overflow-hidden bg-muted">
                        <img
                          src={category.heroImageUrl}
                          alt={category.nameAr}
                          className="w-full h-full object-cover"
                          data-testid={`img-category-${category.slug}`}
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
                        <h3 className="font-semibold truncate" data-testid={`text-category-${category.slug}`}>
                          {category.nameAr}
                        </h3>
                        {category.nameEn && (
                          <p className="text-xs text-muted-foreground truncate">
                            {category.nameEn}
                          </p>
                        )}
                      </div>
                      {isSelected ? (
                        <CheckCircle2 
                          className="w-6 h-6 text-primary flex-shrink-0 ml-2" 
                          data-testid={`icon-selected-${category.slug}`}
                        />
                      ) : (
                        <Circle 
                          className="w-6 h-6 text-muted-foreground flex-shrink-0 ml-2" 
                          data-testid={`icon-unselected-${category.slug}`}
                        />
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
          className="flex flex-col sm:flex-row justify-center gap-4"
        >
          <Button
            variant="outline"
            onClick={() => setLocation("/profile")}
            data-testid="button-cancel"
            className="gap-2"
          >
            <ArrowRight className="h-4 w-4" />
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={selectedInterests.size < 3 || saveInterestsMutation.isPending}
            size="lg"
            className="px-12 gap-2"
            data-testid="button-save-interests"
          >
            {saveInterestsMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                حفظ التغييرات
              </>
            )}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
