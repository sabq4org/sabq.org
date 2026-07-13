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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

function ColorGrid({ colors }: { colors: DashboardThemePreset["colors"] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">الألوان</p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {colors.map((color) => (
          <div key={color.key} className="flex flex-col items-center gap-1.5">
            <span
              className="h-10 w-10 rounded-full border border-border/70 shadow-sm"
              style={{ backgroundColor: color.hex }}
              title={color.hex}
            />
            <span className="text-[10px] text-muted-foreground">{color.labelAr}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrameOptionsPreview() {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">الإطارات</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="theme-frame-option p-4 text-start"
          data-active="true"
          aria-pressed="true"
        >
          <p className="text-sm font-semibold text-foreground">Starter Plan</p>
          <p className="mt-1 text-xs text-primary">For freelancers & startups</p>
        </button>
        <button
          type="button"
          className="theme-frame-option p-4 text-start"
          data-active="false"
          aria-pressed="false"
        >
          <p className="text-sm font-semibold text-foreground">Pro Plan</p>
          <p className="mt-1 text-xs text-muted-foreground">For growing businesses</p>
        </button>
      </div>
    </div>
  );
}

function ComponentsPreview() {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">المكوّنات</p>
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
      <div className="flex flex-wrap items-center gap-4">
        <Input className="max-w-xs" placeholder="Email" type="email" />
        <div className="flex items-center gap-2">
          <Switch defaultChecked id="theme-preview-switch" />
          <Checkbox defaultChecked id="theme-preview-check" />
        </div>
      </div>
    </div>
  );
}

function MetricPreview() {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">لوحة تجريبية</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardDescription>إجمالي الإيرادات</CardDescription>
            <CardTitle className="text-2xl tabular-nums">$15,231.89</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-primary">+20.1% عن الشهر الماضي</p>
            <div className="mt-4 flex h-10 items-end gap-1">
              {[40, 55, 48, 70, 62, 78, 85].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-muted"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardHeader className="pb-2">
            <CardDescription>الاشتراكات</CardDescription>
            <CardTitle className="text-2xl tabular-nums">+2,350</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-primary">+180.1% عن الشهر الماضي</p>
            <div className="mt-4 flex h-10 items-end gap-1">
              {[30, 45, 52, 48, 65, 72, 90].map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-sm bg-primary/25"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ActiveThemeStudio({ preset }: { preset: DashboardThemePreset }) {
  return (
    <Card className="overflow-hidden border-border shadow-none">
      <CardHeader className="border-b border-border bg-card pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {preset.nameAr}
              <Badge variant="outline" className="font-normal">{preset.nameEn}</Badge>
            </CardTitle>
            <CardDescription className="mt-1.5">
              {preset.fontLabel} · نصف القطر {preset.radiusLabel}
            </CardDescription>
          </div>
          {preset.source && (
            <Button asChild size="sm" variant="outline">
              <a href={preset.source} target="_blank" rel="noreferrer" className="gap-1.5">
                المصدر على 21st
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-8 p-5 sm:p-6">
        <ColorGrid colors={preset.colors} />
        <FrameOptionsPreview />
        <ComponentsPreview />
        <MetricPreview />
      </CardContent>
    </Card>
  );
}

function DashboardAppearanceContent() {
  const { themeId, presets, setThemeId, preset } = useDashboardTheme();
  const { toast } = useToast();

  const activate = (id: DashboardThemeId) => {
    setThemeId(id);
    const next = presets.find((item) => item.id === id);
    toast({
      title: "تم تطبيق ثيم اللوحة",
      description: next ? `الثيم النشط الآن: ${next.nameAr} — يطبَّق على كامل /dashboard` : undefined,
    });
  };

  return (
    <DashboardPageShell className="space-y-6">
      <DashboardPageHeader
        icon={Palette}
        title="مركز سمات اللوحة"
        description="اختر ثيماً ليطبَّق فوراً على كامل لوحة التحكم (الشريط، الترويسة، البطاقات، الأزرار، النماذج) دون المساس بالموقع العام."
      />

      <ActiveThemeStudio preset={preset} />

      <section className="space-y-3">
        <h2 className="text-base font-bold">الثيمات المتاحة</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {presets.map((item) => {
            const active = item.id === themeId;
            return (
              <Card
                key={item.id}
                className={cn(
                  "theme-frame-option overflow-hidden shadow-none transition",
                  active
                    ? "border-primary bg-primary/[0.06]"
                    : "border-border",
                )}
                data-active={active ? "true" : "false"}
              >
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        {item.nameAr}
                        {item.source && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Sparkles className="h-3 w-3" /> من 21st.dev
                          </Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-1.5 leading-6">{item.descriptionAr}</CardDescription>
                    </div>
                    {active && (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {item.colors.slice(0, 5).map((color) => (
                      <span
                        key={color.key}
                        className="h-6 w-6 rounded-full border border-border/60"
                        style={{ backgroundColor: color.hex }}
                      />
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    size="sm"
                    variant={active ? "secondary" : "default"}
                    disabled={active}
                    onClick={() => activate(item.id)}
                    data-testid={`dashboard-theme-activate-${item.id}`}
                  >
                    {active ? "مفعّل الآن" : "تطبيق على اللوحة"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="border-border/70 shadow-none">
        <CardContent className="flex flex-col gap-2 p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            الثيم النشط: <strong className="text-foreground">{preset.nameAr}</strong>
            {" · "}
            التجربة على <Link href="/dashboard" className="text-primary underline-offset-2 hover:underline">نظرة عامة</Link>
          </p>
          <Button asChild variant="outline" size="sm">
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
