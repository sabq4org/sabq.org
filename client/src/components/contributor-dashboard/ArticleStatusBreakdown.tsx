import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { FileText } from "lucide-react";

interface ArticleStatusBreakdownProps {
  published: number;
  draft: number;
  pending: number;
  needsChanges: number;
  rejected: number;
  loading?: boolean;
}

const STATUS_CONFIG = [
  { key: "published", label: "منشور", color: "#22c55e" },
  { key: "draft", label: "مسودة", color: "#eab308" },
  { key: "pending", label: "قيد المراجعة", color: "#3b82f6" },
  { key: "needsChanges", label: "يحتاج تعديل", color: "#f97316" },
  { key: "rejected", label: "مرفوض", color: "#ef4444" },
];

export function ArticleStatusBreakdown({
  published,
  draft,
  pending,
  needsChanges,
  rejected,
  loading,
}: ArticleStatusBreakdownProps) {
  const total = published + draft + pending + needsChanges + rejected;
  const values: Record<string, number> = { published, draft, pending, needsChanges, rejected };
  const data = STATUS_CONFIG
    .map((s) => ({ name: s.label, value: values[s.key], color: s.color }))
    .filter((d) => d.value > 0);

  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          توزيع المقالات
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-[140px] w-full animate-pulse rounded bg-muted" />
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">لا توجد مقالات</p>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-[120px] h-[120px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={55}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [v, ""]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {data.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span>{d.name}</span>
                  </div>
                  <span className="font-medium tabular-nums">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
