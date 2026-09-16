import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

interface UserWithRoles extends User {
  roles?: string[];
}

/**
 * حراسة بوابة الناشر: يدخلها من يحمل دور publisher، أو أي حساب مرتبط
 * بوكالة عبر linkedPublisherId (حسابات الوكالات التاريخية بدور
 * content_manager مثل أحمد بديوي)، إضافة إلى الأدمن للمعاينة.
 */
export function usePublisherAccess() {
  const { data: user, isLoading } = useQuery<UserWithRoles>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const roles = Array.isArray(user?.roles) ? user!.roles! : [];
  const hasAccess = Boolean(
    user &&
      (roles.includes("publisher") ||
        user.role === "publisher" ||
        user.role === "admin" ||
        user.role === "system_admin" ||
        (user as any).linkedPublisherId ||
        (user as any).publisherAccount?.id),
  );

  useEffect(() => {
    if (isLoading) return;
    if (!hasAccess) {
      toast({
        variant: "destructive",
        title: "غير مصرح",
        description: "هذه الصفحة خاصة بحسابات الناشرين",
      });
      navigate("/");
    }
  }, [hasAccess, isLoading, navigate, toast]);

  return { user, isLoading, hasAccess };
}
