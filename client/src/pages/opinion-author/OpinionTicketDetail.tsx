import { useRoute, useLocation } from "wouter";
import { ArrowRight } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { TicketThread } from "@/components/opinion-tickets/TicketThread";

export default function OpinionTicketDetail() {
  const [, params] = useRoute("/dashboard/opinion-author/tickets/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 md:p-6 max-w-4xl mx-auto" dir="rtl">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard/opinion-author/tickets")}
          className="gap-2 text-foreground"
          data-testid="button-back"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى الاستفسارات
        </Button>
        {id ? (
          <TicketThread ticketId={id} viewerRole="writer" />
        ) : (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center text-sm text-muted-foreground">
            معرّف الاستفسار غير صالح
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
