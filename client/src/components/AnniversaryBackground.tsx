import { useMemo } from "react";

interface AnniversaryBackgroundProps {
  years?: number;
  className?: string;
}

// Mixed celebration colors
const CELEBRATION_COLORS = [
  "text-primary",
  "text-red-500",
  "text-emerald-500",
  "text-amber-500",
  "text-blue-500",
  "text-purple-500",
  "text-pink-500",
  "text-cyan-500",
];

export function AnniversaryBackground({ years = 19, className = "" }: AnniversaryBackgroundProps) {
  const floatingNumbers = useMemo(() => {
    const numbers: Array<{
      id: number;
      x: number;
      y: number;
      size: number;
      opacity: number;
      rotation: number;
      delay: number;
      colorClass: string;
    }> = [];
    
    // More small numbers (60 total for denser effect)
    for (let i = 0; i < 60; i++) {
      numbers.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        // Smaller sizes: 8-28px (more small ones)
        size: 8 + Math.random() * 20,
        opacity: 0.04 + Math.random() * 0.08,
        rotation: -30 + Math.random() * 60,
        delay: Math.random() * 5,
        colorClass: CELEBRATION_COLORS[Math.floor(Math.random() * CELEBRATION_COLORS.length)],
      });
    }
    return numbers;
  }, []);

  return (
    <div 
      className={`fixed inset-0 pointer-events-none overflow-hidden z-0 ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] via-transparent to-primary/[0.03]" />
      
      {floatingNumbers.map((num) => (
        <div
          key={num.id}
          className={`absolute font-bold select-none animate-pulse ${num.colorClass}`}
          style={{
            left: `${num.x}%`,
            top: `${num.y}%`,
            fontSize: `${num.size}px`,
            opacity: num.opacity,
            transform: `rotate(${num.rotation}deg)`,
            animationDelay: `${num.delay}s`,
            animationDuration: `${3 + Math.random() * 4}s`,
          }}
        >
          {years}
        </div>
      ))}
      
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div 
          className="text-[20rem] font-black text-primary/[0.04] select-none leading-none"
          style={{ 
            textShadow: '0 0 100px rgba(var(--primary), 0.1)',
          }}
        >
          {years}
        </div>
      </div>
      
      <div className="absolute top-10 right-10 opacity-[0.06]">
        <div className="text-6xl font-bold text-red-500">{years}</div>
      </div>
      <div className="absolute bottom-20 left-10 opacity-[0.05]">
        <div className="text-5xl font-bold text-emerald-500 rotate-12">{years}</div>
      </div>
      <div className="absolute top-1/4 left-1/4 opacity-[0.04]">
        <div className="text-4xl font-bold text-amber-500 -rotate-6">{years}</div>
      </div>
      <div className="absolute bottom-1/3 right-1/4 opacity-[0.06]">
        <div className="text-7xl font-bold text-blue-500 rotate-[-15deg]">{years}</div>
      </div>
      <div className="absolute top-1/3 right-1/3 opacity-[0.05]">
        <div className="text-5xl font-bold text-purple-500 rotate-[8deg]">{years}</div>
      </div>
      <div className="absolute bottom-1/4 left-1/3 opacity-[0.04]">
        <div className="text-4xl font-bold text-pink-500 rotate-[-10deg]">{years}</div>
      </div>
      <div className="absolute top-2/3 right-1/5 opacity-[0.05]">
        <div className="text-5xl font-bold text-cyan-500 rotate-[15deg]">{years}</div>
      </div>
      
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-background/50" />
    </div>
  );
}
