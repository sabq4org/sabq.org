import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Brain } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Interest {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  heroImageUrl?: string;
}

interface SmartInterestsBlockProps {
  userId: string;
}

export function SmartInterestsBlock({ userId }: SmartInterestsBlockProps) {
  const [, navigate] = useLocation();

  const { data: interestsRaw } = useQuery<Interest[]>({
    queryKey: ["/api/interests"],
    enabled: !!userId,
  });
  const interests = Array.isArray(interestsRaw) ? interestsRaw : [];

  const handleNavigateToInterests = () => {
    navigate("/interests/edit");
  };

  if (interests.length === 0) {
    return (
      <Card className="bg-transparent">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <Brain className="h-16 w-16 text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">ما زالت رحلتك الذكية في بدايتها!</h3>
              <p className="text-sm text-muted-foreground">
                لتستمتع بتجربة مخصصة وغنية بالمحتوى الذي تحبه، اختر اهتماماتك الآن.
              </p>
            </div>
            <Button
              variant="default"
              onClick={handleNavigateToInterests}
              data-testid="button-select-interests"
            >
              اختر اهتماماتي
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>اهتماماتك الذكية 🧠</CardTitle>
        <CardDescription>
          هذه اهتماماتك التي تساعدنا في تخصيص تجربتك بشكل أدق. عدّلها في أي وقت لتكتشف محتوى أكثر قربًا لك.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {interests.map((interest) => (
            <Badge key={interest.id} variant="secondary">
              {interest.nameAr}
            </Badge>
          ))}
        </div>
        <Button
          variant="outline"
          onClick={handleNavigateToInterests}
          data-testid="button-edit-interests"
        >
          تعديل الاهتمامات
        </Button>
      </CardContent>
    </Card>
  );
}
