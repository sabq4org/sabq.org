import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ChevronLeft, Save, Tags } from "lucide-react";
import type { Category } from "@shared/schema";

interface UserInterest {
  id: string;
  nameAr: string;
  nameEn?: string;
  slug?: string;
}

export function InterestsSection() {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: userInterestsRaw, isLoading: interestsLoading } = useQuery<UserInterest[]>({
    queryKey: ["/api/interests"],
  });
  const userInterests = Array.isArray(userInterestsRaw) ? userInterestsRaw : [];

  const { data: categoriesRaw, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  useEffect(() => {
    if (userInterests.length > 0) {
      setSelected(new Set(userInterests.map((i) => i.id)));
    }
  }, [userInterests]);

  const saveMutation = useMutation({
    mutationFn: async (interestIds: string[]) => {
      return apiRequest("/api/interests", {
        method: "POST",
        body: JSON.stringify({ interestIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/interests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "تم الحفظ", description: "تم تحديث اهتماماتك" });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "تعذّر حفظ الاهتمامات",
      });
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (interestsLoading || categoriesLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 rounded bg-muted" />
        <div className="h-48 rounded bg-muted" />
      </div>
    );
  }

  const progress = Math.min((selected.size / 3) * 100, 100);

  return (
    <div className="space-y-6" data-testid="interests-section">
      <Card>
        <CardHeader>
          <CardTitle>اهتماماتي</CardTitle>
          <CardDescription>
            اختر التصنيفات التي تهمّك — تُستخدم لتخصيص الخلاصة والإشعارات والتوصيات
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">اختر 3 على الأقل</span>
              <span className="font-medium tabular-nums">{selected.size} محدد</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => {
              const active = selected.has(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggle(cat.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors min-h-[44px] ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-muted/60"
                  }`}
                  data-testid={`chip-interest-${cat.slug || cat.id}`}
                >
                  {active ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                  {cat.nameAr}
                </button>
              );
            })}
          </div>
          <Button
            onClick={() => saveMutation.mutate(Array.from(selected))}
            disabled={saveMutation.isPending || selected.size < 3}
            className="gap-2"
            data-testid="button-save-interests-settings"
          >
            <Save className="h-4 w-4" />
            حفظ الاهتمامات
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Tags className="h-5 w-5" />
            كلمات وقصص أتابعها
          </CardTitle>
          <CardDescription>إدارة المتابعات التي تغذّي إشعاراتك</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/my-keywords">
              كلماتي
              <ChevronLeft className="mr-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/my-follows">
              قصصي المتابعة
              <ChevronLeft className="mr-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/interests/edit">
              الصفحة الكاملة للاهتمامات
              <ChevronLeft className="mr-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {userInterests.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {userInterests.map((i) => (
            <Badge key={i.id} variant="secondary">
              {i.nameAr}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
