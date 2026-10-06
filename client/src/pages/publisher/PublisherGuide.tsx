import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PublisherPageHeader } from "@/components/publisher/PublisherPageHeader";
import { parseGuideContent } from "@/lib/publisherGuideContent";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  CreditCard,
  FileText,
  Hand,
  ImageIcon,
  Info,
  Lightbulb,
  MessageCircle,
  Route,
  X,
  XCircle,
} from "lucide-react";

interface GuideSection {
  id: string;
  title: string;
  content: string;
  displayOrder: number;
  updatedAt: string;
}

/** أيقونة القسم من عنوانه؛ الأقسام نص تحرره الإدارة فلا حقل أيقونة لها. */
function sectionIcon(title: string) {
  if (/مرحب/.test(title)) return Hand;
  if (/صور|وسائط/.test(title)) return ImageIcon;
  if (/رصيد|باق/.test(title)) return CreditCard;
  if (/دورة|رحلة|مسار/.test(title)) return Route;
  if (/يُ?رفض|رفض|تعديل/.test(title)) return XCircle;
  if (/تواصل|دعم/.test(title)) return MessageCircle;
  if (/سياس|معايير/.test(title)) return FileText;
  return CircleHelp;
}

function GuideContent({ content }: { content: string }) {
  const blocks = parseGuideContent(content);
  const out: JSX.Element[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "list" && b.tone !== "plain") {
      // صندوقان متجاوران حين تتبع قائمةُ «تجنّبوا» قائمةَ «افعلوا»
      const pair = blocks[i + 1];
      const group = pair && pair.kind === "list" && pair.tone !== "plain" && pair.tone !== b.tone ? [b, pair] : [b];
      if (group.length === 2) i++;
      out.push(
        <div key={i} className={cn("grid gap-3", group.length === 2 && "md:grid-cols-2")}>
          {group.map((g, j) => {
            if (g.kind !== "list") return null;
            const dont = g.tone === "dont";
            return (
              <div
                key={j}
                className={cn(
                  "space-y-2 rounded-xl p-4",
                  dont ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/30",
                )}
              >
                {g.heading ? (
                  <h3
                    className={cn(
                      "flex items-center gap-1.5 text-sm font-semibold",
                      dont ? "text-red-800 dark:text-red-200" : "text-emerald-800 dark:text-emerald-200",
                    )}
                  >
                    {dont ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    {g.heading.replace(/[:：]\s*$/, "")}
                  </h3>
                ) : null}
                <ul className="list-disc space-y-1 ps-5 text-sm leading-7 text-foreground/90">
                  {g.items.map((item, k) => (
                    <li key={k}>{item}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>,
      );
    } else if (b.kind === "list") {
      out.push(
        <ul key={i} className="list-disc space-y-1 ps-5 text-[15px] leading-8 text-foreground/90">
          {b.items.map((item, k) => (
            <li key={k}>{item}</li>
          ))}
        </ul>,
      );
    } else if (b.kind === "tip") {
      out.push(
        <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/70 px-4 py-3 text-sm leading-7">
          <Lightbulb className="mt-1 h-4 w-4 shrink-0 text-primary" />
          <p className="whitespace-pre-wrap">{b.text}</p>
        </div>,
      );
    } else {
      out.push(
        <p
          key={i}
          className={cn(
            "max-w-[70ch] whitespace-pre-wrap",
            b.kind === "lead" ? "text-base font-medium leading-8" : "text-[15px] leading-8 text-foreground/90",
          )}
        >
          {b.text}
        </p>,
      );
    }
  }
  if (out.length === 0) {
    out.push(
      <p key="empty" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4" />
        لا يوجد محتوى في هذا القسم بعد.
      </p>,
    );
  }
  return <div className="space-y-4">{out}</div>;
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
  const activeIndex = activeSection ? sections.findIndex((s) => s.id === activeSection.id) : -1;
  const prevSection = activeIndex > 0 ? sections[activeIndex - 1] : null;
  const nextSection = activeIndex >= 0 && activeIndex < sections.length - 1 ? sections[activeIndex + 1] : null;

  return (
    <PublisherLayout>
      <div className="space-y-5" dir="rtl">
        <PublisherPageHeader
          icon={BookOpen}
          eyebrow="دليل الناشر"
          title="كيف تنشرون في سبق"
          description="السياسات، وحقوق الوسائط، والرصيد، ورحلة الخبر من الإرسال حتى النشر."
        />

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
            <nav className="h-fit overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm lg:sticky lg:top-4">
              <ul className="flex gap-1 overflow-x-auto p-1.5 lg:flex-col">
                {sections.map((section) => {
                  const selected = activeSection?.id === section.id;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(section.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-start transition-colors lg:whitespace-normal",
                          selected
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
                        )}
                        data-testid={`guide-section-${section.id}`}
                      >
                        {(() => {
                          const Icon = sectionIcon(section.title);
                          return <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />;
                        })()}
                        <span className="line-clamp-2 text-sm leading-5">
                          {section.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {activeSection && (
              <article className="space-y-4 rounded-xl border border-border/60 bg-card p-5 shadow-sm sm:p-6">
                <h2 className="text-xl font-bold leading-snug tracking-tight">{activeSection.title}</h2>
                <GuideContent content={activeSection.content} />
                {sections.length > 1 ? (
                  <div className="flex flex-wrap justify-between gap-2 border-t border-border/60 pt-4">
                    {prevSection ? (
                      <Button variant="ghost" size="sm" onClick={() => setActiveId(prevSection.id)} className="gap-1.5">
                        <ArrowRight className="h-4 w-4" />
                        {prevSection.title}
                      </Button>
                    ) : (
                      <span />
                    )}
                    {nextSection ? (
                      <Button variant="outline" size="sm" onClick={() => setActiveId(nextSection.id)} className="gap-1.5 rounded-lg">
                        التالي: {nextSection.title}
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            )}
          </div>
        )}
      </div>
    </PublisherLayout>
  );
}
