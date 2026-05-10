import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

interface UserWithRoles extends User {
  roles?: string[];
}

export function useRoleProtection(requiredRole: string) {
  const { data: user, isLoading } = useQuery<UserWithRoles>({ 
    queryKey: ['/api/auth/user'],
    retry: false,
  });
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (isLoading) return;

    // Check if user exists and has the required role
    const hasRequiredRole = user && (
      // Check new RBAC roles array first
      (user.roles && user.roles.includes(requiredRole)) ||
      // Fallback to legacy role field
      user.role === requiredRole
    );

    if (!hasRequiredRole) {
      toast({ 
        variant: "destructive",
        title: "غير مصرح", 
        description: "ليس لديك صلاحية لعرض هذه الصفحة" 
      });
      navigate('/');
    }
  }, [user, isLoading, requiredRole, navigate, toast]);

  return { user, isLoading };
}
