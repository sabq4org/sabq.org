import { useEffect, useRef } from "react";
import { useAnnounce } from "@/contexts/LiveRegionContext";

type LoadingAnnouncerProps = {
  isLoading: boolean;
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  children?: React.ReactNode;
};

/**
 * LoadingAnnouncer - Announces loading states to screen readers
 * 
 * Usage:
 * ```tsx
 * const { data, isLoading, isError } = useQuery({ ... });
 * 
 * return (
 *   <div>
 *     <LoadingAnnouncer
 *       isLoading={isLoading}
 *       loadingMessage="جاري تحميل المقالات..."
 *       successMessage="تم تحميل المقالات بنجاح"
 *       errorMessage={isError ? "حدث خطأ في تحميل المقالات" : undefined}
 *     />
 *     {isLoading ? <Skeleton /> : <ArticleList data={data} />}
 *   </div>
 * );
 * ```
 */
export function LoadingAnnouncer({
  isLoading,
  loadingMessage = "جاري التحميل...",
  successMessage,
  errorMessage,
  children,
}: LoadingAnnouncerProps) {
  const { announcePolite, announceAssertive } = useAnnounce();
  const previousLoadingState = useRef<boolean>(false);
  const hasAnnouncedSuccess = useRef<boolean>(false);

  useEffect(() => {
    // Announce when loading starts
    if (isLoading && !previousLoadingState.current) {
      announcePolite(loadingMessage);
      hasAnnouncedSuccess.current = false;
      previousLoadingState.current = true;
    }
    
    // Announce when loading completes successfully
    if (!isLoading && previousLoadingState.current && successMessage && !hasAnnouncedSuccess.current) {
      announcePolite(successMessage);
      hasAnnouncedSuccess.current = true;
      previousLoadingState.current = false;
    }
    
    // Reset when loading is complete
    if (!isLoading && previousLoadingState.current) {
      previousLoadingState.current = false;
    }
  }, [isLoading, loadingMessage, successMessage, announcePolite]);

  useEffect(() => {
    // Announce errors assertively
    if (errorMessage) {
      announceAssertive(errorMessage);
    }
  }, [errorMessage, announceAssertive]);

  return <>{children}</>;
}
