import { useEffect, useState } from "react";
import { Check, ChevronDown, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PresenceStatus } from "./types";

export const STATUS_META: Record<
  PresenceStatus,
  { label: string; dotClass: string; ringClass: string }
> = {
  available: {
    label: "متاح",
    dotClass: "bg-green-500",
    ringClass: "ring-green-500/30",
  },
  busy: {
    label: "مشغول",
    dotClass: "bg-red-500",
    ringClass: "ring-red-500/30",
  },
  away: {
    label: "بعيد",
    dotClass: "bg-amber-500",
    ringClass: "ring-amber-500/30",
  },
  invisible: {
    label: "مخفي",
    dotClass: "bg-gray-400",
    ringClass: "ring-gray-400/30",
  },
};

const STORAGE_KEY = "sabq.chat.myStatus";

interface StatusPickerProps {
  compact?: boolean;
}

export function StatusPicker({ compact = false }: StatusPickerProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<PresenceStatus>(() => {
    if (typeof window === "undefined") return "available";
    const cached = window.localStorage.getItem(STORAGE_KEY) as PresenceStatus | null;
    return cached && cached in STATUS_META ? cached : "available";
  });
  const [saving, setSaving] = useState(false);

  // Pull the authoritative status once on mount.
  useEffect(() => {
    let cancelled = false;
    apiRequest<{ status: PresenceStatus }>("/api/chat/me/presence")
      .then((res) => {
        if (cancelled) return;
        if (res?.status && res.status in STATUS_META) {
          setStatus(res.status);
          window.localStorage.setItem(STORAGE_KEY, res.status);
        }
      })
      .catch(() => { /* default stays */ });
    return () => { cancelled = true; };
  }, []);

  const change = async (next: PresenceStatus) => {
    if (next === status || saving) return;
    const prev = status;
    setStatus(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    setSaving(true);
    try {
      await apiRequest("/api/chat/me/presence", {
        method: "PUT",
        body: JSON.stringify({ status: next }),
      });
    } catch (err: any) {
      setStatus(prev);
      window.localStorage.setItem(STORAGE_KEY, prev);
      toast({
        title: "تعذّر تغيير الحالة",
        description: err?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const meta = STATUS_META[status];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`gap-2 ${compact ? "h-7 px-2" : "h-8 px-3"}`}
          data-testid="chat-status-trigger"
        >
          <span className={`h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
          {!compact && <span className="text-xs">{meta.label}</span>}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {(Object.keys(STATUS_META) as PresenceStatus[]).map((s) => {
          const m = STATUS_META[s];
          const active = s === status;
          return (
            <DropdownMenuItem
              key={s}
              onClick={() => void change(s)}
              disabled={saving}
              className="gap-2"
              data-testid={`chat-status-option-${s}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${m.dotClass}`} />
              <span className="flex-1 text-xs">{m.label}</span>
              {active && <Check className="h-3.5 w-3.5 opacity-70" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface PresenceDotProps {
  online: boolean;
  status: PresenceStatus;
  size?: "sm" | "md";
}

/**
 * Combined online/status dot used next to avatars. Logic:
 *   - offline (no WS connection)            → empty (no dot)
 *   - online + available                    → green
 *   - online + busy                         → red
 *   - online + away                         → yellow
 *   - online + invisible (own UI only)      → gray
 */
export function PresenceDot({ online, status, size = "md" }: PresenceDotProps) {
  if (!online) return null;
  const meta = STATUS_META[status] ?? STATUS_META.available;
  const dim = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <span
      className={`absolute bottom-0 left-0 ${dim} rounded-full ${meta.dotClass} border-2 border-background`}
      aria-label={meta.label}
    />
  );
}
