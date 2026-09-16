import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { hasRole, type User } from "@/hooks/useAuth";

/**
 * Page-level role gate (legacy). Prefer ProtectedRoute + permissions where
 * possible. Must use hasRole so system_admin / superadmin satisfy requiredRole
 * "admin" the same way ProtectedRoute and the sidebar do.
 */
export function useRoleProtection(requiredRole: string) {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (isLoading) return;

    if (!hasRole(user, requiredRole)) {
      toast({
        variant: "destructive",
        title: "غير مصرح",
        description: "ليس لديك صلاحية لعرض هذه الصفحة",
      });
      navigate("/");
    }
  }, [user, isLoading, requiredRole, navigate, toast]);

  return { user, isLoading };
}
