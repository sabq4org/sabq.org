import { useQuery } from "@tanstack/react-query";
import type { EmailWebhookLog, TrustedEmailSender } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

// استعلامات تشترك فيها ترويسة الصفحة وشاشتا الوارد والمرسلين، بمفتاح واحد حتى لا تُجلب مرتين.

export function useTrustedSenders(enabled: boolean) {
  return useQuery<TrustedEmailSender[]>({
    queryKey: ["/api/email-agent/senders"],
    enabled,
    retry: 1,
    staleTime: 30000,
  });
}

/** الرسائل الفاشلة (حتى 50) لقسم «تحتاجك الآن»، مستقلة عن مرشّح الوارد وصفحته. */
export function useFailedEmailLogs(enabled: boolean) {
  return useQuery<{ logs: EmailWebhookLog[]; total: number }>({
    queryKey: ["/api/email-agent/logs", "attention"],
    enabled,
    retry: 1,
    staleTime: 30000,
    queryFn: () => apiRequest("/api/email-agent/logs?page=1&limit=50&status=failed"),
  });
}
