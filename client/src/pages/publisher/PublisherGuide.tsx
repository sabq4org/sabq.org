import { useQuery } from "@tanstack/react-query";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen } from "lucide-react";

interface GuideSection {
  id: string;
  title: string;
  content: string;
  displayOrder: number;
  updatedAt: string;
}

/** دليل الناشر: صفحات إرشادية تحررها إدارة سبق (سياسات، حقوق صور، آلية الرصيد). */
export default function PublisherGuide() {
  usePublisherAccess();

  const { data, isLoading } = useQuery<{ sections: GuideSection[] }>({
    queryKey: ["/api/publisher/portal/guide"],
  });
  const sections = Array.isArray(data?.sections) ? data!.sections : [];

  return (
    <PublisherLayout>
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">دليل الناشر</h1>
          <p className="text-muted-foreground mt-1">
            كل ما تحتاج معرفته للنشر في سبق: السياسات، الحقوق، وآلية عمل الباقات
          </p>
        </div>

        <Card data-testid="card-guide">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              الأقسام
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : sections.length === 0 ? (
              <p className="text-muted-foreground text-center py-10" data-testid="text-no-sections">
                لم تُنشر أقسام الدليل بعد — تابعونا قريباً
              </p>
            ) : (
              <Accordion type="single" collapsible className="w-full" defaultValue={sections[0]?.id}>
                {sections.map((section) => (
                  <AccordionItem key={section.id} value={section.id} data-testid={`guide-section-${section.id}`}>
                    <AccordionTrigger className="text-right font-bold">{section.title}</AccordionTrigger>
                    <AccordionContent>
                      <p className="whitespace-pre-wrap leading-8 text-foreground/90">{section.content}</p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </PublisherLayout>
  );
}
