import { useQuery } from "@tanstack/react-query";
import type {
  ContentDutyCardResponse,
  ContentDutyRoomResponse,
  ContentDutyRosterResponse,
  ContentDutyTeamResponse,
} from "@shared/contentDuty";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

export const DUTY_CARD_URL = "/api/admin/dashboard/content-duty";
export const DUTY_ROOM_URL = "/api/admin/content-duty/room";
export const DUTY_TEAM_URL = "/api/admin/content-duty/team";
export const DUTY_ROSTER_URL = "/api/admin/content-duty/roster";

export function useContentDutyCard() {
  const { user } = useAuth();
  return useQuery<ContentDutyCardResponse>({
    queryKey: [DUTY_CARD_URL, user?.id],
    queryFn: () => apiRequest<ContentDutyCardResponse>(DUTY_CARD_URL, { silent: true }),
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });
}

export function useContentDutyRoom(shiftKey: string | null, enabled: boolean) {
  const { user } = useAuth();
  const url = shiftKey ? `${DUTY_ROOM_URL}?shift=${encodeURIComponent(shiftKey)}` : DUTY_ROOM_URL;
  return useQuery<ContentDutyRoomResponse>({
    queryKey: [DUTY_ROOM_URL, user?.id, shiftKey],
    queryFn: () => apiRequest<ContentDutyRoomResponse>(url, { silent: true }),
    enabled: Boolean(user?.id) && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useContentDutyTeam(enabled: boolean) {
  const { user } = useAuth();
  return useQuery<ContentDutyTeamResponse>({
    queryKey: [DUTY_TEAM_URL, user?.id],
    queryFn: () => apiRequest<ContentDutyTeamResponse>(DUTY_TEAM_URL, { silent: true }),
    enabled: Boolean(user?.id) && enabled,
    staleTime: 60_000,
  });
}

export function useContentDutyRoster(week: string | null, enabled: boolean) {
  const { user } = useAuth();
  const url = week ? `${DUTY_ROSTER_URL}?week=${week}` : DUTY_ROSTER_URL;
  return useQuery<ContentDutyRosterResponse>({
    queryKey: [DUTY_ROSTER_URL, user?.id, week],
    queryFn: () => apiRequest<ContentDutyRosterResponse>(url, { silent: true }),
    enabled: Boolean(user?.id) && enabled,
    staleTime: 30_000,
  });
}
