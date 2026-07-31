import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth, getHighestRole } from "@/hooks/useAuth";
import { resolveUserRole } from "@/lib/roleMapping";
import { WRITER_MEDIA_LICENSE_ANCHOR } from "@/lib/mediaLicenseAnchor";
import {
  MEDIA_LICENSE_DASHBOARD_WARNING,
  MEDIA_LICENSE_PENDING_REVIEW_WARNING,
} from "@shared/mediaLicense";

export type MediaLicenseGateStatus = {
  submitted?: boolean;
  valid?: boolean;
  expired?: boolean;
  expiringSoon?: boolean;
  needsCorrection?: boolean;
  pendingReview?: boolean;
  enforcementActive?: boolean;
  submissionBlocked?: boolean;
};

function mediaLicenseEndpointForRole(role: string | null | undefined): string | null {
  if (role === "opinion_author") return "/api/opinion-author/media-license";
  if (role === "reporter") return "/api/reporter/media-license";
  return null;
}

/**
 * بوابة الترخيص المهني لكتّاب الرأي والمراسلين:
 * تحذير + تعطيل إنشاء مقال/خبر لمن بلا ترخيص ساري معتمد، أو منتهٍ، أو تحت المراجعة، أو يحتاج تصحيحاً.
 */
export function useMediaLicenseGate() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const role = user ? resolveUserRole(getHighestRole(user)) : null;
  const endpoint = mediaLicenseEndpointForRole(role);
  const enabled = Boolean(user && endpoint);

  const { data, isFetched } = useQuery<MediaLicenseGateStatus>({
    queryKey: [endpoint],
    enabled,
    staleTime: 60_000,
  });

  const unlicensed = enabled && isFetched && !data?.submitted && !data?.valid;
  const expired = enabled && isFetched && Boolean(data?.expired);
  const needsCorrection = enabled && isFetched && Boolean(data?.needsCorrection);
  const pendingReview = enabled && isFetched && Boolean(data?.pendingReview);

  /** بلا ترخيص أو منتهٍ أو تحت المراجعة أو يحتاج تصحيحاً/تحديثاً */
  const needsLicenseAction = unlicensed || expired || needsCorrection || pendingReview;

  const mediaLicenseFormPath =
    role === "opinion_author" || role === "reporter"
      ? "/dashboard/my-services"
      : null;

  const openMediaLicenseForm = useCallback(() => {
    if (!mediaLicenseFormPath) return;
    const hash = `#${WRITER_MEDIA_LICENSE_ANCHOR}`;
    const basePath = window.location.pathname.split("?")[0].split("#")[0];
    if (basePath === mediaLicenseFormPath) {
      if (window.location.hash !== hash) {
        window.location.hash = WRITER_MEDIA_LICENSE_ANCHOR;
      } else {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
      document
        .getElementById(WRITER_MEDIA_LICENSE_ANCHOR)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate(`${mediaLicenseFormPath}${hash}`);
  }, [mediaLicenseFormPath, navigate]);

  return {
    role,
    endpoint,
    mediaLicense: data,
    mediaLicenseFetched: isFetched,
    enabled,
    unlicensed,
    expired,
    needsCorrection,
    pendingReview,
    needsLicenseAction,
    showWarningBanner: needsLicenseAction,
    /** تعطيل أزرار «إنشاء / ابدأ الكتابة» لنفس جمهور التحذير */
    createBlocked: needsLicenseAction,
    createBlockedReason: pendingReview
      ? MEDIA_LICENSE_PENDING_REVIEW_WARNING
      : MEDIA_LICENSE_DASHBOARD_WARNING,
    openMediaLicenseForm,
    isMediaLicensed: Boolean(data?.valid) && !data?.expiringSoon,
    showExpiringSoonBadge: enabled && isFetched && Boolean(data?.expiringSoon),
    showExpiredBadge: expired,
    showUnlicensedBadge: unlicensed,
  };
}
