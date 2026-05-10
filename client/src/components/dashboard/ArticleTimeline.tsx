import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  Pencil,
  Globe,
  EyeOff,
  CheckCircle,
  XCircle,
  Trash,
  RotateCcw,
  Clock,
} from "lucide-react";

interface ArticleTimelineProps {
  articleId: string;
}

interface ArticleEvent {
  id: string;
  eventType: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorAvatarUrl: string | null;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const eventTypeConfig: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    variant: BadgeVariant;
  }
> = {
  created: {
    icon: Plus,
    label: "إنشاء",
    variant: "default",
  },
  updated: {
    icon: Pencil,
    label: "تعديل",
    variant: "secondary",
  },
  published: {
    icon: Globe,
    label: "نشر",
    variant: "default",
  },
  unpublished: {
    icon: EyeOff,
    label: "إلغاء النشر",
    variant: "outline",
  },
  approved: {
    icon: CheckCircle,
    label: "اعتماد",
    variant: "default",
  },
  rejected: {
    icon: XCircle,
    label: "رفض",
    variant: "destructive",
  },
  deleted: {
    icon: Trash,
    label: "حذف",
    variant: "destructive",
  },
  restored: {
    icon: RotateCcw,
    label: "استعادة",
    variant: "secondary",
  },
};

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getActorName(
  firstName: string | null,
  lastName: string | null
): string {
  if (!firstName && !lastName) {
    return "النظام";
  }
  return [firstName, lastName].filter(Boolean).join(" ");
}

function getActorInitials(
  firstName: string | null,
  lastName: string | null
): string {
  if (!firstName && !lastName) {
    return "س";
  }
  const first = firstName?.[0] || "";
  const last = lastName?.[0] || "";
  return (first + last) || "؟";
}

function TimelineSkeleton() {
  return (
    <div className="space-y-6" dir="rtl">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="w-0.5 flex-1 mt-2" />
          </div>
          <div className="flex-1 space-y-2 pb-6">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ArticleTimeline({ articleId }: ArticleTimelineProps) {
  const { data: events, isLoading } = useQuery<ArticleEvent[]>({
    queryKey: ["/api/articles", articleId, "events"],
  });

  if (isLoading) {
    return <TimelineSkeleton />;
  }

  if (!events || events.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-12 text-muted-foreground"
        dir="rtl"
        data-testid="timeline-empty-state"
      >
        <Clock className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">لا توجد أحداث مسجلة</p>
        <p className="text-sm">سيظهر سجل التغييرات هنا</p>
      </div>
    );
  }

  return (
    <div className="relative" dir="rtl">
      <div className="space-y-0">
        {events.map((event, index) => {
          const config = eventTypeConfig[event.eventType] || {
            icon: Clock,
            label: event.eventType,
            badgeClass: "bg-gray-500 text-white border-gray-500",
          };
          const IconComponent = config.icon;
          const isLast = index === events.length - 1;
          const actorName = getActorName(
            event.actorFirstName,
            event.actorLastName
          );
          const actorInitials = getActorInitials(
            event.actorFirstName,
            event.actorLastName
          );

          return (
            <div
              key={event.id}
              className="flex gap-4"
              data-testid={`timeline-event-${event.id}`}
            >
              <div className="flex flex-col items-center">
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background border-2 border-muted">
                  <IconComponent className="h-5 w-5 text-muted-foreground" />
                </div>
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-muted min-h-[24px]" />
                )}
              </div>

              <div className={`flex-1 pb-6 ${isLast ? "" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge variant={config.variant} data-testid={`badge-${event.eventType}`}>
                    {config.label}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      {event.actorAvatarUrl && (
                        <AvatarImage
                          src={event.actorAvatarUrl}
                          alt={actorName}
                        />
                      )}
                      <AvatarFallback className="text-xs">
                        {actorInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{actorName}</span>
                  </div>
                </div>

                <p className="text-sm text-foreground mb-1">{event.summary}</p>

                <p className="text-xs text-muted-foreground mb-2">
                  {formatDateTime(event.createdAt)}
                </p>

                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="metadata" className="border-none">
                      <AccordionTrigger
                        className="py-2 text-xs text-muted-foreground hover:no-underline"
                        data-testid={`accordion-trigger-${event.id}`}
                      >
                        عرض التفاصيل
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="rounded-md bg-muted p-3 text-xs">
                          <pre
                            className="whitespace-pre-wrap break-all text-muted-foreground"
                            dir="ltr"
                          >
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
