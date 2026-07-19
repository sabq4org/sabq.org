import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth, hasRole, isStaff, hasAnyPermission, hasAllPermissions } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireStaff?: boolean;
  requireRoles?: string[];
  excludeRoles?: string[];
  requireAnyPermission?: string[];
  requireAllPermissions?: string[];
  redirectTo?: string;
  fallbackPath?: string;
}

export function ProtectedRoute({
  children,
  requireStaff = false,
  requireRoles = [],
  excludeRoles = [],
  requireAnyPermission = [],
  requireAllPermissions = [],
  redirectTo = "/login",
  fallbackPath = "/dashboard",
}: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const {
    user,
    isLoading,
    isAuthenticated,
    isUnavailable,
    isRetrying,
    retryAuth,
  } = useAuth();

  useEffect(() => {
    if (isLoading || isUnavailable) return;

    // Not authenticated - redirect to login
    if (!isAuthenticated || !user) {
      setLocation(redirectTo);
      return;
    }

    // Check staff requirement
    if (requireStaff && !isStaff(user)) {
      setLocation("/");
      return;
    }

    // Check excluded roles (user must NOT have any of these roles)
    if (excludeRoles.length > 0 && hasRole(user, ...excludeRoles)) {
      setLocation(fallbackPath);
      return;
    }

    // Check specific role requirements
    if (requireRoles.length > 0 && !hasRole(user, ...requireRoles)) {
      setLocation(fallbackPath);
      return;
    }

    // Check any permission requirement (user needs at least one of the specified permissions)
    if (requireAnyPermission.length > 0 && !hasAnyPermission(user, ...requireAnyPermission)) {
      setLocation(fallbackPath);
      return;
    }

    // Check all permissions requirement (user needs all of the specified permissions)
    if (requireAllPermissions.length > 0 && !hasAllPermissions(user, ...requireAllPermissions)) {
      setLocation(fallbackPath);
      return;
    }
  }, [user, isLoading, isUnavailable, isAuthenticated, requireStaff, requireRoles, excludeRoles, requireAnyPermission, requireAllPermissions, redirectTo, fallbackPath, setLocation]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // فشل 5xx/الشبكة ليس انتهاء جلسة. لا نعرض المحتوى المحمي قبل التحقق،
  // ولا نطرد المستخدم إلى login؛ نعطيه retry آمنًا في مكانه.
  if (isUnavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">تعذر الاتصال مؤقتًا</h1>
          <p className="text-sm text-muted-foreground">
            لم نتمكن من التحقق من الجلسة الآن. حسابك لم يُسجّل خروجه، وسنحاول مجددًا.
          </p>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            disabled={isRetrying}
            onClick={() => void retryAuth()}
          >
            {isRetrying ? "جارٍ إعادة المحاولة…" : "إعادة المحاولة"}
          </button>
        </div>
      </div>
    );
  }

  // Not authenticated - don't render children
  if (!isAuthenticated || !user) {
    return null;
  }

  // Staff check failed
  if (requireStaff && !isStaff(user)) {
    return null;
  }

  // Excluded role check failed (user has a denied role)
  if (excludeRoles.length > 0 && hasRole(user, ...excludeRoles)) {
    return null;
  }

  // Role check failed
  if (requireRoles.length > 0 && !hasRole(user, ...requireRoles)) {
    return null;
  }

  // Any permission check failed
  if (requireAnyPermission.length > 0 && !hasAnyPermission(user, ...requireAnyPermission)) {
    return null;
  }

  // All permissions check failed
  if (requireAllPermissions.length > 0 && !hasAllPermissions(user, ...requireAllPermissions)) {
    return null;
  }

  // All checks passed - render children
  return <>{children}</>;
}

// Convenience component for permission-only protection
export function PermissionRoute({
  children,
  anyOf,
  allOf,
  fallbackPath = "/dashboard",
}: {
  children: React.ReactNode;
  anyOf?: string[];
  allOf?: string[];
  fallbackPath?: string;
}) {
  return (
    <ProtectedRoute
      requireAnyPermission={anyOf}
      requireAllPermissions={allOf}
      fallbackPath={fallbackPath}
    >
      {children}
    </ProtectedRoute>
  );
}
