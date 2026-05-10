import { MobileOptimizedKpiCard } from "./MobileOptimizedKpiCard";
import { Mail, FileCheck, FileEdit, XCircle, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "./ui/skeleton";

export interface EmailAgentStatsData {
  emailsReceived: number;
  emailsPublished: number;
  emailsDrafted: number;
  emailsRejected: number;
  emailsFailed: number;
  arabicCount: number;
  englishCount: number;
  urduCount: number;
  trends?: {
    received?: number;
    published?: number;
    drafted?: number;
    rejected?: number;
    failed?: number;
  };
}

interface EmailAgentStatsProps {
  data?: EmailAgentStatsData;
  isLoading?: boolean;
}

export function EmailAgentStats({ data, isLoading }: EmailAgentStatsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  // Default values if data is not available
  const stats: EmailAgentStatsData = data || {
    emailsReceived: 0,
    emailsPublished: 0,
    emailsDrafted: 0,
    emailsRejected: 0,
    emailsFailed: 0,
    arabicCount: 0,
    englishCount: 0,
    urduCount: 0,
  };

  const getTrendIndicator = (value?: number) => {
    if (!value || value === 0) return null;
    if (value > 0) {
      return <TrendingUp className="h-3 w-3 text-green-500 inline mr-1" />;
    }
    return <TrendingDown className="h-3 w-3 text-red-500 inline mr-1" />;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        <MobileOptimizedKpiCard
          label="رسائل مستلمة"
          value={stats.emailsReceived.toLocaleString('en-US')}
          icon={Mail}
          iconColor="text-indigo-600 dark:text-indigo-400"
          iconBgColor="bg-indigo-50 dark:bg-indigo-950"
          testId="stat-emails-received"
          ariaLive
        />

        <MobileOptimizedKpiCard
          label="منشورة"
          value={stats.emailsPublished.toLocaleString('en-US')}
          icon={FileCheck}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBgColor="bg-emerald-50 dark:bg-emerald-950"
          testId="stat-emails-published"
          ariaLive
        />

        <MobileOptimizedKpiCard
          label="مسودات"
          value={stats.emailsDrafted.toLocaleString('en-US')}
          icon={FileEdit}
          iconColor="text-amber-600 dark:text-amber-400"
          iconBgColor="bg-amber-50 dark:bg-amber-950"
          testId="stat-emails-drafted"
        />

        <MobileOptimizedKpiCard
          label="مرفوضة"
          value={stats.emailsRejected.toLocaleString('en-US')}
          icon={XCircle}
          iconColor="text-red-600 dark:text-red-400"
          iconBgColor="bg-red-50 dark:bg-red-950"
          testId="stat-emails-rejected"
        />

        <MobileOptimizedKpiCard
          label="فاشلة"
          value={stats.emailsFailed.toLocaleString('en-US')}
          icon={AlertCircle}
          iconColor="text-slate-600 dark:text-slate-400"
          iconBgColor="bg-slate-50 dark:bg-slate-950"
          testId="stat-emails-failed"
        />
      </div>

      {/* Language Breakdown */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        <MobileOptimizedKpiCard
          label="عربية"
          value={stats.arabicCount.toLocaleString('en-US')}
          icon={Mail}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          testId="stat-arabic"
        />

        <MobileOptimizedKpiCard
          label="إنجليزية"
          value={stats.englishCount.toLocaleString('en-US')}
          icon={Mail}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          testId="stat-english"
        />

        <MobileOptimizedKpiCard
          label="أردية"
          value={stats.urduCount.toLocaleString('en-US')}
          icon={Mail}
          iconColor="text-primary"
          iconBgColor="bg-primary/10"
          testId="stat-urdu"
        />
      </div>
    </div>
  );
}
