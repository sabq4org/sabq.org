// ملفي وخدماتي — صفحة موحّدة للكاتب والمراسل:
// الملف الشخصي، شهادة التعريف، الترخيص المهني، وامتدادات مستقبلية.

import { Link } from "wouter";
import { Briefcase, FileText } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { MyStaffProfileCard } from "@/components/staff/MyStaffProfileCard";
import { MyOfficialLettersCard } from "@/components/officialLetters/MyOfficialLettersCard";
import { WriterMediaLicenseCard } from "@/pages/opinion-author/WriterMediaLicenseCard";
import { useAuth } from "@/hooks/useAuth";

export default function MyServicesPage() {
  const { user } = useAuth();
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const isReporter =
    roles.includes("reporter") ||
    user?.role === "reporter";
  const licenseEndpoint = isReporter
    ? "/api/reporter/media-license"
    : "/api/opinion-author/media-license";

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-3xl" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={Briefcase}
          title="ملفي وخدماتي"
          description="ملفك المعتمد، شهادة التعريف، والترخيص المهني — في مكان واحد بلا ازدحام على النظرة العامة"
          titleTestId="text-my-services-title"
        />

        <div className="space-y-4" dir="rtl">
          <section className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
              <FileText className="h-4 w-4 text-primary" />
              الملف الشخصي
            </h2>
            <MyStaffProfileCard />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-foreground">شهادة التعريف</h2>
            <MyOfficialLettersCard />
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-foreground">الترخيص المهني</h2>
            <WriterMediaLicenseCard endpoint={licenseEndpoint} />
          </section>

          <p className="text-center text-xs text-muted-foreground">
            للعودة إلى{" "}
            <Link href={isReporter ? "/dashboard/reporter/articles" : "/dashboard/opinion-author"} className="text-primary underline-offset-2 hover:underline">
              مساحة العمل
            </Link>
          </p>
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
