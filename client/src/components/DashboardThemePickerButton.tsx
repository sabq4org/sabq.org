import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDashboardTheme } from "@/dashboard-themes/DashboardThemeProvider";
import { usePersonalDashboardTheme } from "@/hooks/usePersonalDashboardTheme";
import { useOrgDashboardTheme } from "@/hooks/useOrgDashboardTheme";
import { useToast } from "@/hooks/use-toast";
import type { DashboardThemeId } from "@shared/dashboard-theme";
import { cn } from "@/lib/utils";

/**
 * Header control: every signed-in dashboard user can pick a personal theme.
 * Choosing "افتراضي المنظمة" clears the personal override.
 */
export function DashboardThemePickerButton() {
  const { themeId, presets, setThemeId } = useDashboardTheme();
  const { personalThemeId, setPersonalThemeId, isSaving } = usePersonalDashboardTheme();
  const { themeId: orgThemeId } = useOrgDashboardTheme();
  const { toast } = useToast();
  const followsOrg = personalThemeId === null;

  const applyPersonal = async (id: DashboardThemeId) => {
    try {
      setThemeId(id);
      await setPersonalThemeId(id);
      const name = presets.find((p) => p.id === id)?.nameAr;
      toast({
        title: "تم حفظ سمتك الشخصية",
        description: name ? `السمة: ${name}` : undefined,
      });
    } catch {
      toast({
        title: "تعذر الحفظ",
        description: "حاول مرة أخرى.",
        variant: "destructive",
      });
    }
  };

  const followOrg = async () => {
    try {
      await setPersonalThemeId(null);
      setThemeId(orgThemeId);
      toast({
        title: "عدت لسمة المنظمة",
        description: "ستتبع السمة الافتراضية التي يحدّدها مسؤول النظام.",
      });
    } catch {
      toast({
        title: "تعذر الحفظ",
        description: "حاول مرة أخرى.",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={isSaving}
          data-testid="button-dashboard-theme-picker"
          className="hover-elevate active-elevate-2"
          title="سمة لوحة التحكم"
        >
          <Palette className="h-4 w-4" />
          <span className="sr-only">سمة لوحة التحكم</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>سمتي في اللوحة</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSaving}
          onClick={() => followOrg()}
          className={cn("flex items-center justify-between gap-2", followsOrg && "bg-accent")}
          data-testid="dashboard-theme-follow-org"
        >
          <span className="flex flex-col gap-0.5">
            <span>افتراضي المنظمة</span>
            <span className="text-[11px] text-muted-foreground">
              {presets.find((p) => p.id === orgThemeId)?.nameAr ?? orgThemeId}
            </span>
          </span>
          {followsOrg && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {presets.map((preset) => {
          const active = !followsOrg && themeId === preset.id;
          return (
            <DropdownMenuItem
              key={preset.id}
              disabled={isSaving}
              onClick={() => applyPersonal(preset.id)}
              className={cn("flex items-center justify-between gap-2", active && "bg-accent")}
              data-testid={`dashboard-theme-pick-${preset.id}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: preset.colors.find((c) => c.key === "primary")?.hex }}
                />
                <span className="truncate">{preset.nameAr}</span>
              </span>
              {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
