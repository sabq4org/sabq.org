import type { ReactNode } from "react";
import { Link } from "wouter";
import { Check, ExternalLink, Palette, Sparkles } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useDashboardTheme } from "@/dashboard-themes/DashboardThemeProvider";
import type { DashboardThemeId, DashboardThemePreset } from "@/dashboard-themes/presets";
import { useOrgDashboardTheme } from "@/hooks/useOrgDashboardTheme";
import { usePersonalDashboardTheme } from "@/hooks/usePersonalDashboardTheme";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { PERMISSION_CODES } from "@shared/rbac-constants";

/** بلوك معاينة داخل الاستوديو — طبقة وسطى أوضح من خلفية البطاقة. */
function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border/80 bg-muted/45 p-4 shadow-[inset_0_1px_0_0_hsl(var(--background)/0.55)] sm:p-5 dark:bg-muted/30">
      <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

function ColorGrid({ colors }: { colors: DashboardThemePreset["colors"] }) {
  return (
    <PreviewBlock title="الألوان">
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {colors.map((color) => (
          <div key={color.key} className="flex flex-col items-center gap-1.5">
            <span
              className="h-10 w-10 rounded-full border border-border/80 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
              style={{ backgroundColor: color.hex }}
              title={color.hex}
            />
            <span className="text-[10px] text-muted-foreground">{color.labelAr}</span>
          </div>
        ))}
      </div>
    </PreviewBlock>
  );
}

function FrameOptionsPreview() {
  return (
    <PreviewBlock title="الإطارات">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="theme-frame-option p-4 text-start shadow-sm"
          data-active="true"
          aria-pressed="true"
        >
          <p className="text-sm font-semibold text-foreground">Starter Plan</p>
          <p className="mt-1 text-xs text-primary">For freelancers & startups</p>
        </button>
        <button
          type="button"
          className="theme-frame-option p-4 text-start shadow-sm"
          data-active="false"
          aria-pressed="false"
        >
          <p className="text-sm font-semibold text-foreground">Pro Plan</p>
          <p className="mt-1 text-xs text-muted-foreground">For growing businesses</p>
        </button>
      </div>
    </PreviewBlock>
  );
}

function ComponentsPreview() {
  return (
    <PreviewBlock title="المكوّنات">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="secondary">Secondary</Button>
          <Button size="sm" variant="outline">Outline</Button>
          <Button size="sm" variant="ghost">Ghost</Button>
          <Button size="sm" variant="destructive">Delete</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Badge</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Error</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/60 bg-background/70 px-3 py-2.5">
          <Input className="max-w-xs bg-background" placeholder="Email" type="email" />
          <div className="flex items-center gap-2">
            <Switch defaultChecked id="theme-preview-switch" />
            <Checkbox defaultChecked id="theme-preview-check" />
          </div>
        </div>
      </div>
    </PreviewBlock>
  );
}

function MetricPreview() {
  return (
    <PreviewBlock title="لوحة تجريبية">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-border/80 bg-background/90 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>إجمالي الإيرادات</CardDescription>
            <CardTitle className="text-2xl tabular-nums tracking-tight">$15,231.89</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-medium text-primary">+20.1% عن الشهر الماضي</p>
            <div className="mt-4 flex h-10 items-end gap-1">
              {[40, 55, 48, 70, 62, 78, 85].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-muted-foreground/25"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/80 bg-background/90 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription>الاشتراكات</CardDescription>
            <CardTitle className="text-2xl tabular-nums tracking-tight">+2,350</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs font-medium text-primary">+180.1% عن الشهر الماضي</p>
            <div className="mt-4 flex h-10 items-end gap-1">
              {[30, 45, 52, 48, 65, 72, 90].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-primary/35"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PreviewBlock>
  );
}

function ActiveThemeStudio({ preset }: { preset: DashboardThemePreset }) {
  return (
    <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border/80 bg-gradient-to-l from-muted/50 via-card to-card pb-4 dark:from-muted/25">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              السمة النشطة
            </p>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg tracking-tight">
              {preset.nameAr}
              <Badge variant="outline" className="font-normal">
                {preset.nameEn}
              </Badge>
            </CardTitle>
            <CardDescription className="text-[13px]">
              {preset.fontLabel} · نصف القطر {preset.radiusLabel}
            </CardDescription>
          </div>
          {preset.source && (
            <Button asChild size="sm" variant="outline" className="bg-background/80 shadow-sm">
              <a href={preset.source} target="_blank" rel="noreferrer" className="gap-1.5">
                المصدر على 21st
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 bg-card p-5 sm:space-y-5 sm:p-6">
        <ColorGrid colors={preset.colors} />
        <FrameOptionsPreview />
        <ComponentsPreview />
        <MetricPreview />
      </CardContent>
    </Card>
  );
}

function DashboardAppearanceContent() {
  const { themeId, presets, setThemeId, preset, personalThemeId, orgThemeId } = useDashboardTheme();
  const { setOrgThemeId, isSaving: isOrgSaving } = useOrgDashboardTheme();
  const { setPersonalThemeId, isSaving: isPersonalSaving } = usePersonalDashboardTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const canManageOrg = hasPermission(user, PERMISSION_CODES.SYSTEM_MANAGE_SETTINGS);
  const isSaving = isOrgSaving || isPersonalSaving;
  const followsOrg = personalThemeId === null;

  const activatePersonal = async (id: DashboardThemeId) => {
    try {
      setThemeId(id);
      await setPersonalThemeId(id);
      const next = presets.find((item) => item.id === id);
      toast({
        title: "تم حفظ سمتك الشخصية",
        description: next ? `تُطبَّق عليك فقط: ${next.nameAr}` : undefined,
      });
    } catch {
      toast({
        title: "تعذر الحفظ",
        description: "فشل حفظ سمتك الشخصية. حاول مرة أخرى.",
        variant: "destructive",
      });
    }
  };

  const followOrgDefault = async () => {
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

  const activateOrg = async (id: DashboardThemeId) => {
    if (!canManageOrg) return;
    try {
      await setOrgThemeId(id);
      if (followsOrg) setThemeId(id);
      const next = presets.find((item) => item.id === id);
      toast({
        title: "تم تحديث افتراضي المنظمة",
        description: next
          ? `${next.nameAr} — لمن لم يختر سمة شخصية.`
          : undefined,
      });
    } catch {
      toast({
        title: "تعذر الحفظ",
        description: "فشل حفظ افتراضي المنظمة.",
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardPageShell
      className="dashboard-appearance-page bg-muted/35 dark:bg-background"
      contentClassName="space-y-8"
    >
      <DashboardPageHeader
        className="shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]"
        icon={Palette}
        title="مركز سمات اللوحة"
        description="اختر سمتك الشخصية من هنا أو من أيقونة الألوان في ترويسة اللوحة. افتراضي المنظمة نقطة بداية فقط — لا يُفرض على من اختار سمة خاصة به."
      />

      <ActiveThemeStudio preset={preset} />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/80 bg-gradient-to-l from-muted/40 via-card to-card px-5 py-4 sm:px-6 dark:from-muted/20">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              المكتبة
            </p>
            <h2 className="text-lg font-bold tracking-tight text-foreground">الثيمات</h2>
            {canManageOrg ? (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                اختر سمتك الشخصية، أو عيّن افتراضي المنظمة لمن لم يختر سمة خاصة.
              </p>
            ) : (
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                اختر سمتك الشخصية — تُحفظ لك فقط ولا تغيّر بقية الفريق.
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="bg-background/80 shadow-sm"
            disabled={followsOrg || isSaving}
            onClick={() => followOrgDefault()}
            data-testid="dashboard-theme-follow-org-page"
          >
            {followsOrg ? "تتبع افتراضي المنظمة" : "العودة لافتراضي المنظمة"}
          </Button>
        </div>

        <div className="bg-muted/25 p-4 sm:p-5 dark:bg-muted/15">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {presets.map((item) => {
              const personalActive = !followsOrg && themeId === item.id;
              const orgActive = orgThemeId === item.id;
              const cardActive = personalActive || (followsOrg && orgActive);
              return (
                <Card
                  key={item.id}
                  className={cn(
                    "theme-frame-option overflow-hidden shadow-sm transition-all duration-200",
                    cardActive
                      ? "border-primary bg-card ring-2 ring-primary/25"
                      : "border-border/80 bg-card hover:border-border hover:shadow-md",
                  )}
                  data-active={cardActive ? "true" : "false"}
                >
                  <CardHeader className="space-y-3 border-b border-border/50 bg-gradient-to-b from-muted/30 to-card pb-3 dark:from-muted/15">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base tracking-tight">
                      {item.nameAr}
                      {item.source && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <Sparkles className="h-3 w-3" /> من 21st.dev
                        </Badge>
                      )}
                      {orgActive && (
                        <Badge variant="outline" className="text-[10px]">
                          افتراضي المنظمة
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="leading-6">{item.descriptionAr}</CardDescription>
                    <div className="flex gap-1.5 rounded-lg border border-border/50 bg-background/70 px-2.5 py-2">
                      {item.colors.slice(0, 5).map((color) => (
                        <span
                          key={color.key}
                          className="h-6 w-6 rounded-full border border-border/70 shadow-sm"
                          style={{ backgroundColor: color.hex }}
                        />
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2 bg-card pt-3">
                    <Button
                      size="sm"
                      className="gap-1.5"
                      variant={personalActive ? "secondary" : "default"}
                      disabled={personalActive || isSaving}
                      onClick={() => activatePersonal(item.id)}
                      data-testid={`dashboard-theme-personal-${item.id}`}
                    >
                      {personalActive ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          سمتي الآن
                        </>
                      ) : (
                        "اختيار لنفسي"
                      )}
                    </Button>
                    {canManageOrg && (
                      <Button
                        size="sm"
                        variant={orgActive ? "secondary" : "outline"}
                        disabled={orgActive || isSaving}
                        onClick={() => activateOrg(item.id)}
                        data-testid={`dashboard-theme-org-${item.id}`}
                      >
                        {orgActive ? "افتراضي المنظمة" : "جعله افتراضي المنظمة"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              الملخص
            </p>
            <p className="text-muted-foreground">
              الظاهر لك الآن:{" "}
              <strong className="font-semibold text-foreground">{preset.nameAr}</strong>
              {followsOrg ? " (من افتراضي المنظمة)" : " (شخصي)"}
              {" · "}
              أو استخدم أيقونة الألوان في أعلى اللوحة
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="bg-background/80 shadow-sm">
            <Link href="/dashboard">فتح اللوحة</Link>
          </Button>
        </CardContent>
      </Card>
    </DashboardPageShell>
  );
}

export default function DashboardAppearancePage() {
  return (
    <DashboardLayout>
      <DashboardAppearanceContent />
    </DashboardLayout>
  );
}
