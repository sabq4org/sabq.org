// Extracted from pages/ArticleEditor.tsx (refactor: article-editor-split).
// Article edit-lock management: one editor at a time per article.
//
// Behavior preserved verbatim from the original inline implementation, with
// two deliberate changes:
// 1. The two raw fetch() calls now wrap their URL in apiUrl() so the lock
//    works in DIRECT mode (VITE_API_URL set). Raw fetch itself is kept on
//    purpose: the status check needs manual 404 handling, and the
//    beforeunload release needs { keepalive: true } — neither is supported
//    by apiRequest().
// 2. Debug console.log lines were dropped (they were stripped from prod
//    builds anyway); console.error lines are kept.
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface LockStatus {
  locked: boolean;
  lockedBy: { id: string; name: string } | null;
  isOwner: boolean;
  acquiredAt: string | null;
  expiresAt: string | null;
}

interface UseArticleEditLockArgs {
  /** Article id from the route (may be undefined or "new"). */
  articleId: string | undefined;
  isNewArticle: boolean;
  /** Current user — lock acquisition waits for auth to resolve. */
  user: unknown;
  isUserLoading: boolean;
}

export function useArticleEditLock({
  articleId: id,
  isNewArticle,
  user,
  isUserLoading,
}: UseArticleEditLockArgs) {
  const { toast } = useToast();
  const [lockStatus, setLockStatus] = useState<LockStatus | null>(null);
  const [isLockedByOther, setIsLockedByOther] = useState(false);
  const lockHeartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Check lock status query (only for existing articles)
  // Note: Don't gate on user - let the query run as soon as we have an article ID
  // The server will validate authentication via session
  const lockStatusQuery = useQuery<LockStatus>({
    queryKey: ["/api/admin/articles", id, "lock"],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/admin/articles/${id}/lock`), { credentials: "include" });
      if (!res.ok) {
        // If 404, article has no lock
        if (res.status === 404) {
          return { locked: false, lockedBy: null, isOwner: false, acquiredAt: null, expiresAt: null };
        }
        throw new Error("Failed to check lock status");
      }
      return await res.json();
    },
    enabled: !isNewArticle && !!id && id !== 'new',
    refetchInterval: false,
    staleTime: 0,
  });
  const initialLockStatus = lockStatusQuery.data;

  // Acquire lock mutation
  const acquireLockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/admin/articles/${id}/lock`, {
        method: "POST",
      });
    },
    onSuccess: (data: LockStatus) => {
      setLockStatus(data);
      setIsLockedByOther(false);
    },
    onError: async (error: Error) => {
      console.error('[Lock] Failed to acquire lock:', error);
      // Refetch lock status to check if another user has the lock
      const result = await lockStatusQuery.refetch();
      if (result.data?.locked && !result.data?.isOwner) {
        setLockStatus(result.data);
        setIsLockedByOther(true);
        toast({
          title: "المقالة مقفلة للتحرير",
          description: `يقوم ${result.data.lockedBy?.name || 'مستخدم آخر'} بتحرير هذه المقالة حالياً`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "خطأ في القفل",
          description: "تعذر الحصول على قفل التحرير. يرجى المحاولة مرة أخرى.",
          variant: "destructive",
        });
      }
    },
  });

  // Release lock mutation
  const releaseLockMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/admin/articles/${id}/lock`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      setLockStatus(null);
    },
    onError: (error: Error) => {
      console.error('[Lock] Failed to release lock:', error);
      toast({
        title: "تحذير",
        description: "تعذر تحرير قفل المقالة. قد يتم تحريره تلقائياً.",
        variant: "destructive",
      });
    },
  });

  // Heartbeat mutation — POST لمطابقة مسار الخادم (PATCH كان يسقط في 404 HTML)
  const heartbeatMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/admin/articles/${id}/lock/heartbeat`, {
        method: "POST",
      });
    },
    onSuccess: (data: LockStatus) => {
      setLockStatus(data);
    },
    onError: async (error: Error) => {
      console.error('[Lock] Heartbeat failed:', error);
      // Refetch lock status to check if we lost the lock
      const result = await lockStatusQuery.refetch();
      if (result.data?.locked && !result.data?.isOwner) {
        setLockStatus(result.data);
        setIsLockedByOther(true);
        toast({
          title: "فقدت قفل التحرير",
          description: `المقالة مقفلة الآن بواسطة ${result.data.lockedBy?.name || 'مستخدم آخر'}`,
          variant: "destructive",
        });
      }
    },
  });

  // Handle lock acquisition on mount and cleanup on unmount
  useEffect(() => {
    // Skip for new articles
    if (isNewArticle || !id || id === 'new') return;

    // Wait for user authentication to complete
    if (isUserLoading) return;

    // Need user to be logged in
    if (!user) return;

    // Process initial lock status once it's loaded
    if (initialLockStatus !== undefined) {
      if (initialLockStatus.locked && !initialLockStatus.isOwner) {
        // Locked by another user
        setLockStatus(initialLockStatus);
        setIsLockedByOther(true);
        toast({
          title: "المقالة مقفلة للتحرير",
          description: `يقوم ${initialLockStatus.lockedBy?.name || 'مستخدم آخر'} بتحرير هذه المقالة حالياً`,
          variant: "destructive",
        });
      } else if (!initialLockStatus.locked || initialLockStatus.isOwner) {
        // Not locked or locked by current user - try to acquire
        acquireLockMutation.mutate();
      }
    }
    // deps preserved verbatim from the original inline effect
  }, [isNewArticle, id, user, isUserLoading, initialLockStatus]);

  // Setup heartbeat interval (every 45 seconds)
  useEffect(() => {
    if (isNewArticle || !id || id === 'new' || isLockedByOther || !lockStatus?.isOwner) return;

    // Send heartbeat every 45 seconds
    lockHeartbeatRef.current = setInterval(() => {
      heartbeatMutation.mutate();
    }, 45000);

    return () => {
      if (lockHeartbeatRef.current) {
        clearInterval(lockHeartbeatRef.current);
        lockHeartbeatRef.current = null;
      }
    };
    // deps preserved verbatim from the original inline effect
  }, [isNewArticle, id, isLockedByOther, lockStatus?.isOwner]);

  // Release lock on unmount
  useEffect(() => {
    if (isNewArticle || !id || id === 'new') return;

    // Handle browser close/refresh - use fetch with keepalive for DELETE support
    const handleBeforeUnload = () => {
      // Use fetch with keepalive: true for reliable lock release on page close
      // Note: navigator.sendBeacon only supports POST, so we use fetch with keepalive instead
      fetch(apiUrl(`/api/admin/articles/${id}/lock`), {
        method: 'DELETE',
        keepalive: true,
        credentials: 'include',
      });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Clean up heartbeat
      if (lockHeartbeatRef.current) {
        clearInterval(lockHeartbeatRef.current);
        lockHeartbeatRef.current = null;
      }
      // Release lock on unmount (navigation within the app)
      if (lockStatus?.isOwner) {
        releaseLockMutation.mutate();
      }
    };
    // deps preserved verbatim from the original inline effect
  }, [isNewArticle, id, lockStatus?.isOwner]);

  return { lockStatus, isLockedByOther };
}
