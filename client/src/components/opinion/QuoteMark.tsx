// علامة الاقتباس العربية «» مرسومة: لا تنعكس بخوارزمية الاتجاه ولا يتغير شكلها بالخط.
export function QuoteMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 40" className={className} aria-hidden focusable="false" style={{ marginInlineStart: 0 }}>
      <path d="M27 3 L9 20 L27 37" fill="none" stroke="#1E9BE6" strokeWidth="9" strokeLinejoin="miter" />
      <path d="M52 3 L34 20 L52 37" fill="none" stroke="#1E9BE6" strokeWidth="9" strokeLinejoin="miter" />
    </svg>
  );
}
