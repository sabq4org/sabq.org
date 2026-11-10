import { Check } from "lucide-react";
import { PERMISSION_TRACKS, type StepState } from "@shared/userAdmin";
import { cn } from "@/lib/utils";
import type { OverrideMap } from "./profileState";
import { changedOverrideCodes, stepSource } from "./profileState";
import type { ProfileRole } from "./types";

type Choice = "role" | "allow" | "deny";

const CHOICES: Array<{ value: Choice; label: string }> = [
  { value: "role", label: "حسب الدور" },
  { value: "allow", label: "منح" },
  { value: "deny", label: "حجب" },
];

interface Props {
  steps: StepState[];
  baseSteps: StepState[];
  roles: ProfileRole[];
  overrides: OverrideMap;
  baseOverrides: OverrideMap;
  disabled: boolean;
  onChange: (code: string, choice: Choice) => void;
}

export function PermissionTracks({ steps, baseSteps, roles, overrides, baseOverrides, disabled, onChange }: Props) {
  const byCode = new Map(steps.map((s) => [s.code, s]));
  const baseByCode = new Map(baseSteps.map((s) => [s.code, s]));
  const overrideDirty = new Set(changedOverrideCodes(baseOverrides, overrides));

  return (
    <div className="space-y-3.5">
      {PERMISSION_TRACKS.map((track) => {
        const granted = track.steps.filter((s) => byCode.get(s.code)?.granted).length;
        return (
          <div key={track.key} className="overflow-hidden rounded-lg border bg-card" data-testid={`track-${track.key}`}>
            <h3 className="flex flex-wrap justify-between gap-2 border-b bg-muted/50 px-4 py-2.5 text-sm font-semibold">
              <span>{track.label}</span>
              <span className="text-xs font-normal tabular-nums text-muted-foreground">
                {granted} من {track.steps.length}
              </span>
            </h3>
            {track.steps.map((def) => {
              const step = byCode.get(def.code);
              if (!step) return null;
              const dirty = overrideDirty.has(def.code) || baseByCode.get(def.code)?.granted !== step.granted;
              const src = stepSource(step, roles);
              const value: Choice = overrides[def.code] ?? "role";
              const lockedAllow = step.lockedBy.length > 0 && step.viaRoles.length === 0;
              return (
                <div
                  key={def.code}
                  className={cn(
                    "relative grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b px-4 py-3 last:border-b-0 md:grid-cols-[28px_minmax(0,1fr)_auto]",
                    dirty && "bg-warning/10",
                  )}
                >
                  {dirty && <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] bg-warning" />}
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-[22px] w-[22px] place-items-center rounded-full border-[1.5px]",
                      step.granted ? "border-success bg-success text-success-foreground" : "border-border text-transparent",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className={cn("text-sm font-semibold", !step.granted && "text-muted-foreground")}>
                      {def.label}
                      <span className="sr-only">{step.granted ? " (ممنوحة)" : " (غير ممنوحة)"}</span>
                      {def.hint && <span className="ms-2 text-xs font-normal text-muted-foreground">· {def.hint}</span>}
                    </div>
                    <div className={cn("text-[12.5px]", src.locked ? "text-warning-foreground/80 dark:text-warning" : "text-muted-foreground")}>
                      {src.locked && <span className="font-semibold text-warning">محجوب. </span>}
                      {src.text}
                    </div>
                  </div>
                  <div
                    role="group"
                    aria-label={def.label}
                    className="col-start-2 inline-flex w-fit overflow-hidden rounded-md border md:col-start-auto"
                  >
                    {CHOICES.map((c, i) => {
                      const pressed = value === c.value;
                      const off = disabled || step.superuser || (c.value === "allow" && lockedAllow);
                      return (
                        <button
                          key={c.value}
                          type="button"
                          aria-pressed={pressed}
                          disabled={off}
                          title={c.value === "allow" && lockedAllow ? "محجوب دائمًا لهذا الدور" : undefined}
                          onClick={() => onChange(def.code, c.value)}
                          className={cn(
                            "min-h-[40px] whitespace-nowrap px-3 text-[12.5px] font-medium md:min-h-8",
                            i > 0 && "border-s",
                            pressed
                              ? c.value === "allow"
                                ? "bg-success text-success-foreground"
                                : c.value === "deny"
                                  ? "bg-destructive text-destructive-foreground"
                                  : "bg-foreground text-background"
                              : "bg-background hover:bg-muted",
                            off && "cursor-not-allowed bg-muted text-muted-foreground opacity-70 hover:bg-muted",
                            off && pressed && "opacity-50",
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
