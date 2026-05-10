import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Sparkles, Quote } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeyInsightProps {
  text: string;
  author?: string;
  variant?: "highlight" | "quote" | "gradient";
  delay?: number;
  className?: string;
}

export function KeyInsight({
  text,
  author,
  variant = "highlight",
  delay = 0,
  className,
}: KeyInsightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const variants = {
    highlight: (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.6, delay, ease: "easeOut" }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-8",
          "bg-gradient-to-br from-indigo-500/10 via-violet-500/10 to-purple-500/10",
          "border border-indigo-500/20",
          className
        )}
        data-testid="key-insight"
      >
        <motion.div
          initial={{ x: -20, opacity: 0 }}
          animate={isInView ? { x: 0, opacity: 1 } : {}}
          transition={{ delay: delay + 0.2 }}
          className="absolute top-4 right-4"
        >
          <Sparkles className="w-6 h-6 text-indigo-500" />
        </motion.div>

        <p className="text-xl md:text-2xl font-bold text-foreground leading-relaxed">
          {text}
        </p>
        
        {author && (
          <p className="text-sm text-muted-foreground mt-4">— {author}</p>
        )}
      </motion.div>
    ),

    quote: (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 30 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, delay, ease: "easeOut" }}
        className={cn(
          "relative py-8 px-6",
          "border-r-4 border-indigo-500",
          className
        )}
        data-testid="key-insight"
      >
        <Quote className="absolute top-0 right-0 w-12 h-12 text-indigo-500/20 transform rotate-180" />
        
        <p className="text-xl md:text-2xl font-medium text-foreground leading-relaxed italic">
          {text}
        </p>
        
        {author && (
          <p className="text-sm font-semibold text-indigo-500 mt-4">{author}</p>
        )}
      </motion.div>
    ),

    gradient: (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, delay, ease: "easeOut" }}
        className={cn(
          "relative overflow-hidden rounded-3xl p-10",
          "bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600",
          "text-white shadow-2xl shadow-indigo-500/30",
          className
        )}
        data-testid="key-insight"
      >
        {/* Decorative elements */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-0 w-40 h-40 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-60 h-60 bg-purple-500/30 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
        </div>

        <motion.div
          initial={{ scale: 0 }}
          animate={isInView ? { scale: 1 } : {}}
          transition={{ delay: delay + 0.3, type: "spring", stiffness: 200 }}
          className="relative mb-4"
        >
          <Sparkles className="w-8 h-8 text-white/80" />
        </motion.div>

        <p className="relative text-2xl md:text-3xl font-bold leading-relaxed">
          {text}
        </p>
        
        {author && (
          <p className="relative text-sm text-white/70 mt-6 font-medium">
            — {author}
          </p>
        )}
      </motion.div>
    ),
  };

  return variants[variant];
}
