import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TrendChartProps {
  data: Array<{
    date: string;
    value: number;
    [key: string]: any;
  }>;
  title?: string;
  description?: string;
  loading?: boolean;
  className?: string;
  type?: "line" | "area";
  height?: number;
  period?: "daily" | "weekly" | "monthly";
  onPeriodChange?: (period: string) => void;
  valueKey?: string;
  additionalLines?: Array<{
    key: string;
    color: string;
    name: string;
  }>;
  formatValue?: (value: number) => string;
}

export function TrendChart({
  data,
  title,
  description,
  loading,
  className,
  type = "line",
  height = 300,
  period,
  onPeriodChange,
  valueKey = "value",
  additionalLines = [],
  formatValue = (value) => value.toLocaleString()
}: TrendChartProps) {
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (period === "monthly") {
        return format(date, "MMM yyyy");
      }
      if (period === "weekly") {
        return format(date, "MMM dd");
      }
      return format(date, "MMM dd");
    } catch {
      return dateStr;
    }
  };

  const ChartComponent = type === "area" ? AreaChart : LineChart;
  const DataComponent = type === "area" ? Area : Line;

  const chartColors = {
    primary: "hsl(var(--primary))",
    secondary: "hsl(var(--secondary))",
    accent: "hsl(var(--accent))",
    muted: "hsl(var(--muted-foreground))",
  };

  return (
    <Card className={cn("hover-elevate", className)}>
      {(title || period) && (
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            {title && <CardTitle>{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {period && onPeriodChange && (
            <Select value={period} onValueChange={onPeriodChange}>
              <SelectTrigger className="w-32" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">يومي</SelectItem>
                <SelectItem value="weekly">أسبوعي</SelectItem>
                <SelectItem value="monthly">شهري</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CardHeader>
      )}
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="h-full w-full animate-pulse rounded bg-muted" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
            لا توجد بيانات للعرض
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <ChartComponent
              data={data}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickFormatter={formatValue}
                className="text-xs"
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <Tooltip
                formatter={(value: number) => formatValue(value)}
                labelFormatter={(label) => formatDate(label as string)}
                contentStyle={{
                  backgroundColor: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px"
                }}
              />
              {additionalLines.length > 0 && <Legend />}
              
              <DataComponent
                type="monotone"
                dataKey={valueKey}
                stroke={chartColors.primary}
                fill={type === "area" ? chartColors.primary : undefined}
                fillOpacity={type === "area" ? 0.2 : undefined}
                strokeWidth={2}
                name="القيمة"
              />
              
              {additionalLines.map((line) => (
                <DataComponent
                  key={line.key}
                  type="monotone"
                  dataKey={line.key}
                  stroke={line.color || chartColors.secondary}
                  fill={type === "area" ? line.color || chartColors.secondary : undefined}
                  fillOpacity={type === "area" ? 0.2 : undefined}
                  strokeWidth={2}
                  name={line.name}
                />
              ))}
            </ChartComponent>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}