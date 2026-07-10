import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiUrl } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, ChevronLeft, Inbox, Clock, CheckCheck } from "lucide-react";

interface ContactMessage {
  id: string;
  name: string;
  email: string;
  subject: string;
  status: "pending" | "read" | "replied";
  createdAt: string;
}

interface ContactMessagesResponse {
  messages: ContactMessage[];
  total: number;
}

interface ContactMessagesWidgetProps {
  canViewDetails?: boolean;
  deferLoading?: boolean;
}

export function ContactMessagesWidget({ canViewDetails = true, deferLoading = false }: ContactMessagesWidgetProps) {
  const { data, isLoading } = useQuery<ContactMessagesResponse>({
    queryKey: ["/api/admin/contact-messages", "pending-count"],
    queryFn: async () => {
      const response = await fetch(apiUrl("/api/admin/contact-messages?limit=5"), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch contact messages");
      }
      return response.json();
    },
    // Only fetch when the user can actually access the data. The backend
    // endpoint is gated by requireRole("admin","editor"); firing it for staff
    // without `dashboard.view_messages` (e.g. reporters) returned 403 on every
    // dashboard load — amplified ~4x because the generic thrown Error couldn't
    // be classified as a non-retryable 4xx. Gating on the permission the
    // Dashboard already computes (passed as canViewDetails) removes the noise.
    enabled: !deferLoading && canViewDetails, // Defer until initial stats load AND user can view messages
    retry: false, // 403/auth failures won't recover on retry
    refetchInterval: 300000, // Refetch every 5 minutes (optimized from 30 seconds)
  });

  const messages = Array.isArray(data?.messages) ? data.messages : [];
  const pendingCount = messages.filter((m) => m.status === "pending").length;
  const readCount = messages.filter((m) => m.status === "read").length;
  const repliedCount = messages.filter((m) => m.status === "replied").length;

  if (isLoading) {
    return (
      <Card className="h-full" data-testid="contact-messages-widget-loading">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className="h-full bg-gradient-to-br from-orange-500/5 via-transparent to-transparent dark:from-transparent border-orange-200/50 dark:border-border"
      data-testid="contact-messages-widget"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <Mail className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            </div>
            <span>رسائل التواصل</span>
          </div>
          {pendingCount > 0 && (
            <Badge 
              className="bg-orange-500 hover:bg-orange-600 text-white text-xs px-2"
              data-testid="badge-pending-count"
            >
              {pendingCount} جديدة
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 dark:bg-muted/40 dark:border-border">
            <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mb-1" />
            <span className="text-lg font-bold" data-testid="text-pending-count">
              {pendingCount.toLocaleString("en-US")}
            </span>
            <span className="text-[10px] text-muted-foreground">بانتظار الرد</span>
          </div>
          
          <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 dark:bg-muted/40 dark:border-border">
            <Inbox className="h-4 w-4 text-blue-600 dark:text-blue-400 mb-1" />
            <span className="text-lg font-bold" data-testid="text-read-count">
              {readCount.toLocaleString("en-US")}
            </span>
            <span className="text-[10px] text-muted-foreground">تمت القراءة</span>
          </div>
          
          <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-green-500/10 border border-green-500/20 dark:bg-muted/40 dark:border-border">
            <CheckCheck className="h-4 w-4 text-green-600 dark:text-green-400 mb-1" />
            <span className="text-lg font-bold" data-testid="text-replied-count">
              {repliedCount.toLocaleString("en-US")}
            </span>
            <span className="text-[10px] text-muted-foreground">تم الرد</span>
          </div>
        </div>

        <div className="pt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
            <span>إجمالي الرسائل</span>
            <span className="font-semibold text-foreground" data-testid="text-total-messages">
              {(data?.total || 0).toLocaleString("en-US")}
            </span>
          </div>
          
          {canViewDetails ? (
            <Link href="/dashboard/contact-messages">
              <Button 
                variant="outline" 
                className="w-full gap-2 border-orange-200 dark:border-border hover:bg-orange-50 dark:hover:bg-accent/50"
                data-testid="button-view-messages"
              >
                <Mail className="h-4 w-4" />
                عرض جميع الرسائل
                <ChevronLeft className="h-4 w-4 mr-auto" />
              </Button>
            </Link>
          ) : (
            <div className="text-xs text-center text-muted-foreground py-2">
              عرض فقط - لا يوجد صلاحية للتفاصيل
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
