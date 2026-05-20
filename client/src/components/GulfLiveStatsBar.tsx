import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatNumber } from "@/lib/format";

import { Card } from "@/components/ui/card";
import {
  Shield,
  Rocket,
  Plane,
  Target,
  Flame,
  HeartPulse,
  Cross,
  BarChart3,
} from "lucide-react";

interface StatsData {
  totalAttacks: number;
  intercepted: number;
  droneIntercepted: number;
  ballisticIntercepted: number;
  cruiseIntercepted: number;
  debris: number;
  injuries: number;
  martyrdom: number;
  byCountry: Record<string, number>;
}

function useCountUp(target: number, duration = 1500): number {
  const [current, setCurrent] = useState(0);
  const prevTarget = useRef(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    if (target === prevTarget.current) return;
    const start = prevTarget.current;
    prevTarget.current = target;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.round(start + (target - start) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    }

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return current;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  colorClass: string;
  testId: string;
}

function StatCard({ icon, label, value, colorClass, testId }: StatCardProps) {
  const displayValue = useCountUp(value);

  return (
    <Card
      className="flex flex-col items-center gap-1.5 p-3 sm:p-4 text-center"
      data-testid={testId}
    >
      <div
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center ${colorClass}`}
      >
        {icon}
      </div>
      <span
        className="text-xl sm:text-2xl font-bold tabular-nums"
        data-testid={`${testId}-value`}
      >
        {formatNumber(displayValue)}
      </span>
      <span className="text-[11px] sm:text-xs text-muted-foreground leading-tight">
        {label}
      </span>
    </Card>
  );
}

export default function GulfLiveStatsBar() {
  const { data: stats } = useQuery<StatsData>({
    queryKey: ["/api/gulf-events/stats"],
    refetchInterval: 300000, // 5 min (component currently hidden)
  });

  const statItems = [
    {
      icon: <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "إجمالي الاعتداءات",
      value: stats?.totalAttacks ?? 0,
      colorClass: "bg-slate-600 dark:bg-slate-500",
      testId: "stat-total-attacks",
    },
    {
      icon: <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "باليستي مُعترض",
      value: stats?.ballisticIntercepted ?? 0,
      colorClass: "bg-green-600 dark:bg-green-500",
      testId: "stat-ballistic-intercepted",
    },
    {
      icon: <Plane className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "مسيّرات مُعترضة",
      value: stats?.droneIntercepted ?? 0,
      colorClass: "bg-emerald-600 dark:bg-emerald-500",
      testId: "stat-drone-intercepted",
    },
    {
      icon: <Target className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "كروز مُعترض",
      value: stats?.cruiseIntercepted ?? 0,
      colorClass: "bg-teal-600 dark:bg-teal-500",
      testId: "stat-cruise-intercepted",
    },
    {
      icon: <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "سقوط شظايا",
      value: stats?.debris ?? 0,
      colorClass: "bg-yellow-600 dark:bg-yellow-500",
      testId: "stat-debris",
    },
    {
      icon: <HeartPulse className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "إصابات",
      value: stats?.injuries ?? 0,
      colorClass: "bg-orange-600 dark:bg-orange-500",
      testId: "stat-injuries",
    },
    {
      icon: <Cross className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "حالات استشهاد",
      value: stats?.martyrdom ?? 0,
      colorClass: "bg-red-600 dark:bg-red-500",
      testId: "stat-martyrdom",
    },
    {
      icon: <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />,
      label: "إجمالي الاعتراضات",
      value: stats?.intercepted ?? 0,
      colorClass: "bg-blue-600 dark:bg-blue-500",
      testId: "stat-intercepted",
    },
  ];

  return (
    <div className="border-b" data-testid="gulf-live-stats-bar">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 md:py-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-2 sm:gap-3">
          {statItems.map((item) => (
            <StatCard key={item.testId} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}
