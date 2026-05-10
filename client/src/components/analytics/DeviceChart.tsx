import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { Smartphone, Monitor, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeviceChartProps {
  data: Array<{
    type: string;
    count: number;
    percentage: number;
  }>;
  title?: string;
  description?: string;
  loading?: boolean;
  className?: string;
  height?: number;
  showLegend?: boolean;
}

const deviceIcons: Record<string, any> = {
  mobile: Smartphone,
  desktop: Monitor,
  tablet: Tablet,
};

const deviceColors: Record<string, string> = {
  mobile: "hsl(var(--primary))",
  desktop: "hsl(var(--secondary))",
  tablet: "hsl(var(--accent))",
  unknown: "hsl(var(--muted-foreground))"
};

const deviceLabels: Record<string, string> = {
  mobile: "موبايل",
  desktop: "كمبيوتر",
  tablet: "تابلت",
  unknown: "غير معروف"
};

export function DeviceChart({
  data,
  title = "توزيع الأجهزة",
  description,
  loading,
  className,
  height = 300,
  showLegend = true
}: DeviceChartProps) {
  const chartData = data.map(item => ({
    name: deviceLabels[item.type] || item.type,
    value: item.count,
    percentage: item.percentage,
    type: item.type
  }));

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percentage }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percentage > 5 ? (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        className="text-sm font-medium"
      >
        {`${percentage.toFixed(0)}%`}
      </text>
    ) : null;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      const Icon = deviceIcons[data.payload.type];
      return (
        <div className="rounded-lg border bg-background p-2 shadow-md">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4" />}
            <span className="font-medium">{data.name}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            <div>{data.value.toLocaleString()} استماع</div>
            <div>{data.payload.percentage.toFixed(1)}%</div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className={cn("hover-elevate", className)}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="h-48 w-48 animate-pulse rounded-full bg-muted" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
            لا توجد بيانات للعرض
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={CustomLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={deviceColors[entry.type] || deviceColors.unknown} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              {showLegend && (
                <Legend
                  formatter={(value: string) => value}
                  wrapperStyle={{ paddingTop: "20px" }}
                />
              )}
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}