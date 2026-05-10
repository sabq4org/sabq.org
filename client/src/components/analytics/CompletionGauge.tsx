import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from "recharts";
import { cn } from "@/lib/utils";

interface CompletionGaugeProps {
  value: number; // 0-100
  title?: string;
  description?: string;
  loading?: boolean;
  className?: string;
  size?: number;
  showLabel?: boolean;
  threshold?: {
    good: number;
    warning: number;
  };
}

export function CompletionGauge({
  value,
  title,
  description,
  loading,
  className,
  size = 200,
  showLabel = true,
  threshold = { good: 75, warning: 50 }
}: CompletionGaugeProps) {
  const getColor = () => {
    if (value >= threshold.good) return "hsl(var(--success))";
    if (value >= threshold.warning) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  const data = [
    { name: "completed", value: value },
    { name: "remaining", value: 100 - value }
  ];

  const renderLabel = () => {
    if (!showLabel) return null;
    return (
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground"
      >
        <tspan className="text-3xl font-bold">{value.toFixed(0)}</tspan>
        <tspan className="text-lg">%</tspan>
      </text>
    );
  };

  return (
    <Card className={cn("hover-elevate", className)}>
      {title && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </CardHeader>
      )}
      <CardContent className="flex items-center justify-center">
        {loading ? (
          <div
            className="animate-pulse rounded-full bg-muted"
            style={{ width: size, height: size }}
          />
        ) : (
          <ResponsiveContainer width={size} height={size}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                startAngle={90}
                endAngle={-270}
                innerRadius="70%"
                outerRadius="90%"
                dataKey="value"
              >
                <Cell fill={getColor()} />
                <Cell fill="hsl(var(--muted))" opacity={0.3} />
                <Label content={renderLabel} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}