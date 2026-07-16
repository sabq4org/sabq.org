import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface HourlyActivityPoint {
  hour: number;
  count: number;
}

interface HourlyActivityChartProps {
  data: HourlyActivityPoint[];
  /** عكس محور X (true في العربية). */
  reversed: boolean;
  /** اتجاه الـ tooltip ومحاذاته. حاوية الرسم تبقى dir="ltr" دائماً. */
  isRTL: boolean;
  formatHour: (hour: number) => string;
  tooltipTitle: (hour: number) => string;
  seriesName: string;
  valueSuffix: string;
}

/** رسم النشاط على مدار 24 ساعة — مواصفة التصميم §10. */
export function HourlyActivityChart({
  data,
  reversed,
  isRTL,
  formatHour,
  tooltipTitle,
  seriesName,
  valueSuffix,
}: HourlyActivityChartProps) {
  return (
    <div className="h-72 md:h-80 w-full" dir="ltr" data-testid="chart-hourly-activity">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis
            dataKey="hour"
            tickFormatter={formatHour}
            tickLine={false}
            axisLine={false}
            interval={3}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            reversed={reversed}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
            tick={{
              fill: "hsl(var(--muted-foreground))",
              fontSize: 11,
              style: { fontVariantNumeric: "tabular-nums" },
            }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
              direction: isRTL ? "rtl" : "ltr",
              textAlign: isRTL ? "right" : "left",
              fontSize: 12,
            }}
            labelStyle={{ color: "hsl(var(--foreground))" }}
            labelFormatter={(label) => tooltipTitle(Number(label))}
            formatter={(value) => [`${value} ${valueSuffix}`, seriesName]}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="hsl(var(--primary))"
            fillOpacity={0.15}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
