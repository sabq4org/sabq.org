import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BookOpen, FileText } from "lucide-react";

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
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId && sections[0]?.id) setActiveId(sections[0].id);
  }, [sections, activeId]);

  const activeSection = useMemo(
    () => sections.find((s) => s.id === activeId) ?? sections[0] ?? null,
    [sections, activeId],
  );

  return (
    <PublisherLayout>
      <div className="space-y-5" dir="rtl">
        <div className="rounded-2xl border bg-card px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <BookOpen className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
                دليل الناشر
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                السياسات، حقوق الوسائط، الرصيد، ومسار المادة من الإرسال حتى النشر
              </p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        ) : sections.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed bg-muted/20 px-6 py-14 text-center"
            data-testid="text-no-sections"
          >
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لم تُنشر أقسام الدليل بعد</p>
            <p className="mt-1 text-sm text-muted-foreground">تابع التحديثات من إدارة سبق قريباً</p>
          </div>
        ) : (
          <div
            className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]"
            data-testid="card-guide"
          >
            <nav className="h-fit overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-4">
              <div className="border-b px-3 py-2.5 text-xs font-semibold text-muted-foreground">
                فهرس الأقسام ({sections.length})
              </div>
              <ul className="p-1.5">
                {sections.map((section, index) => {
                  const selected = activeSection?.id === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(section.id)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-start transition-colors",
                          selected
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                        data-testid={`guide-section-${section.id}`}
                      >
                        <span className="mt-0.5 font-mono text-[10px] opacity-70">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="line-clamp-2 text-sm font-medium leading-5">
                          {section.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {activeSection && (
              <article className="rounded-2xl border bg-card">
                <header className="border-b px-5 py-4 sm:px-6">
                  <h2 className="text-xl font-bold leading-snug">{activeSection.title}</h2>
                </header>
                <div className="px-5 py-5 sm:px-6">
                  <p className="whitespace-pre-wrap text-[15px] leading-8 text-foreground/90">
                    {activeSection.content}
                  </p>
                </div>
              </article>
            )}
          </div>
        )}
      </div>
    </PublisherLayout>
  );
}
