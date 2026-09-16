/** خط شرارة صغير (SVG خام — أخف من recharts لبطاقة). */
export function Sparkline({ values, width = 88, height = 30, className, stroke = "currentColor" }: { values: number[]; width?: number; height?: number; className?: string; stroke?: string }) {
  if (!values || values.length < 2) return null;
  const mn = Math.min(...values), mx = Math.max(...values);
  const span = mx - mn || 1;
  const pts = values.map((v, i) => [i * (width / (values.length - 1)), height - 4 - ((v - mn) / span) * (height - 8)] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={stroke} />
    </svg>
  );
}
