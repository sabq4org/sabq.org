import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { useTheme } from "@/components/ThemeProvider";

interface ChartData {
  views?: number[];
  users?: number[];
  articles?: number[];
}

export default function AnalyticsChart() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Fetch chart data
  const { data: chartData, isLoading } = useQuery<ChartData>({
    queryKey: ['/api/analytics/chart'],
  });

  const series = [
    {
      name: "المشاهدات",
      data: chartData?.views || [30, 40, 35, 50, 49, 60, 70, 91, 85, 95, 105, 110]
    },
    {
      name: "المستخدمون",
      data: chartData?.users || [10, 15, 12, 20, 25, 30, 35, 40, 38, 42, 45, 48]
    },
    {
      name: "المقالات",
      data: chartData?.articles || [5, 8, 10, 12, 15, 18, 20, 25, 28, 30, 35, 40]
    }
  ];

  const options: ApexOptions = {
    chart: {
      type: 'area',
      height: 350,
      toolbar: {
        show: false
      },
      background: 'transparent',
      fontFamily: 'Tajawal, sans-serif'
    },
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    xaxis: {
      categories: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
      labels: {
        style: {
          colors: isDark ? '#94a3b8' : '#64748b'
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: isDark ? '#94a3b8' : '#64748b'
        }
      }
    },
    colors: ['#3b82f6', '#10b981', '#8b5cf6'],
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.1,
        stops: [0, 90, 100]
      }
    },
    grid: {
      borderColor: isDark ? '#334155' : '#e2e8f0',
      strokeDashArray: 5
    },
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      labels: {
        colors: isDark ? '#94a3b8' : '#64748b'
      }
    },
    tooltip: {
      theme: isDark ? 'dark' : 'light',
      x: {
        format: 'dd/MM/yy'
      }
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="h-6 w-32 bg-muted rounded animate-pulse"></div>
          <div className="h-4 w-48 bg-muted rounded animate-pulse mt-2"></div>
        </CardHeader>
        <CardContent>
          <div className="h-[350px] bg-muted rounded animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>إحصائيات النشاط</CardTitle>
        <CardDescription>نظرة شاملة على أداء المنصة خلال العام</CardDescription>
      </CardHeader>
      <CardContent>
        <ReactApexChart
          options={options}
          series={series}
          type="area"
          height={350}
        />
      </CardContent>
    </Card>
  );
}
