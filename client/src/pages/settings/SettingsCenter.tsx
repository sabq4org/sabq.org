import { useEffect } from "react";
import { Link, Redirect, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { AccountSectionHeader } from "@/components/AccountSectionHeader";
import { cn } from "@/lib/utils";
import { Settings } from "lucide-react";
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_NAV,
  resolveSettingsSection,
  type SettingsSectionId,
} from "./settingsNav";
import { AccountSection } from "./sections/AccountSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { InterestsSection } from "./sections/InterestsSection";
import { SecuritySection } from "./sections/SecuritySection";
import { PrivacySection } from "./sections/PrivacySection";
import { AppearanceSection } from "./sections/AppearanceSection";

type AuthUser = {
  id: string;
  name?: string | null;
  email?: string;
  role?: string;
  profileImageUrl?: string | null;
  permissions?: string[];
};

function SectionBody({ section }: { section: SettingsSectionId }) {
  switch (section) {
    case "account":
      return <AccountSection />;
    case "notifications":
      return <NotificationsSection />;
    case "interests":
      return <InterestsSection />;
    case "security":
      return <SecuritySection />;
    case "privacy":
      return <PrivacySection />;
    case "appearance":
      return <AppearanceSection />;
    default:
      return <AccountSection />;
  }
}

export default function SettingsCenter() {
  const params = useParams<{ section?: string }>();
  const section = resolveSettingsSection(params.section);
  const navItem = SETTINGS_NAV.find((i) => i.id === section) ?? SETTINGS_NAV[0];

  const { data: user, isLoading, isError } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    document.title = `${navItem.labelAr} — الإعدادات | سبق`;
  }, [navItem.labelAr]);

  if (!isLoading && (isError || !user)) {
    return <Redirect to="/login" />;
  }

  // مسار /settings بلا قسم → الحساب
  if (!params.section) {
    return <Redirect to={`/settings/${DEFAULT_SETTINGS_SECTION}`} />;
  }

  // قسم غير معروف → الحساب
  if (params.section && params.section !== section) {
    return <Redirect to={`/settings/${DEFAULT_SETTINGS_SECTION}`} />;
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <Header user={user || undefined} />
      <div className="border-b border-primary/10 bg-ai-gradient-soft">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
          <AccountSectionHeader
            icon={Settings}
            title="الإعدادات"
            subtitle="مركز واحد لحسابك وإشعاراتك وأمانك ومظهرك"
            testId="text-settings-title"
          />
        </div>
      </div>

      <div className="container mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8">
        {/* شرائح الجوال */}
        <nav
          className="mb-6 flex gap-1 overflow-x-auto sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/95 backdrop-blur border-b border-border/60 lg:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="أقسام الإعدادات"
        >
          {SETTINGS_NAV.map((item) => {
            const Icon = item.icon;
            const active = item.id === section;
            return (
              <Link key={item.id} href={item.path}>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium min-h-[44px] transition-colors cursor-pointer",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`settings-chip-${item.id}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.labelAr}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
          {/* سكة الديسكتوب */}
          <aside className="hidden lg:block w-64 shrink-0">
            <nav
              className="sticky top-24 space-y-1"
              aria-label="أقسام الإعدادات"
            >
              {SETTINGS_NAV.map((item) => {
                const Icon = item.icon;
                const active = item.id === section;
                return (
                  <Link key={item.id} href={item.path}>
                    <span
                      className={cn(
                        "flex items-start gap-3 rounded-xl px-3 py-3 transition-colors cursor-pointer min-h-[44px]",
                        active
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                      data-testid={`settings-nav-${item.id}`}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={cn("h-5 w-5 mt-0.5 shrink-0", active && "text-primary")}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{item.labelAr}</span>
                        <span className="block text-xs text-muted-foreground mt-0.5 leading-snug">
                          {item.descriptionAr}
                        </span>
                      </span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mb-6">
              <h2 className="text-xl font-bold tracking-tight" data-testid="text-settings-section-title">
                {navItem.labelAr}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{navItem.descriptionAr}</p>
            </div>
            {isLoading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-32 rounded bg-muted" />
                <div className="h-48 rounded bg-muted" />
              </div>
            ) : (
              <SectionBody section={section} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
