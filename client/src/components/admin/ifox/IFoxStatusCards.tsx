import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Brain, Clock, FileEdit, Archive, TrendingUp, Sparkles, Cpu, Zap } from "lucide-react";

type StatusKey = "published" | "scheduled" | "draft" | "archived";

interface StatusCardsProps {
  metrics: {
    published: number;
    scheduled: number;
    draft: number;
    archived: number;
  };
  activeStatus?: StatusKey;
  onSelect?: (status: StatusKey) => void;
  loading?: boolean;
}

const statusConfigs = {
  published: {
    icon: Brain,
    label: "مقالات منشورة",
    labelEn: "Published Articles",
    gradient: "from-violet-400 via-purple-400 to-indigo-400",
    bgGradient: "from-violet-500/30 via-purple-500/20 to-indigo-500/30",
    iconBg: "bg-violet-500/30 dark:bg-violet-400/30",
    iconColor: "text-violet-300 dark:text-violet-200",
    glowColor: "shadow-violet-500/50",
  },
  scheduled: {
    icon: Clock,
    label: "مقالات مجدولة",
    labelEn: "Scheduled Articles",
    gradient: "from-cyan-400 via-blue-400 to-indigo-400",
    bgGradient: "from-cyan-500/30 via-blue-500/20 to-indigo-500/30",
    iconBg: "bg-cyan-500/30 dark:bg-cyan-400/30",
    iconColor: "text-cyan-300 dark:text-cyan-200",
    glowColor: "shadow-cyan-500/50",
  },
  draft: {
    icon: FileEdit,
    label: "مسودات",
    labelEn: "Drafts",
    gradient: "from-amber-400 via-orange-400 to-pink-400",
    bgGradient: "from-amber-500/30 via-orange-500/20 to-pink-500/30",
    iconBg: "bg-amber-500/30 dark:bg-amber-400/30",
    iconColor: "text-amber-300 dark:text-amber-200",
    glowColor: "shadow-amber-500/50",
  },
  archived: {
    icon: Archive,
    label: "مؤرشفة",
    labelEn: "Archived",
    gradient: "from-slate-400 via-gray-400 to-zinc-400",
    bgGradient: "from-slate-500/30 via-gray-500/20 to-zinc-500/30",
    iconBg: "bg-slate-500/30 dark:bg-slate-400/30",
    iconColor: "text-slate-300 dark:text-slate-200",
    glowColor: "shadow-slate-500/50",
  },
};

const SkeletonLoader = () => (
  <div className="animate-pulse">
    <div className="h-6 w-24 bg-white/10 rounded mb-2"></div>
    <div className="h-10 w-16 bg-white/10 rounded"></div>
  </div>
);

const FloatingIcon = ({ Icon, color }: { Icon: any; color: string }) => {
  return (
    <motion.div
      className="absolute top-0 right-0 opacity-20"
      animate={{
        y: [0, -10, 0],
        rotate: [0, 5, -5, 0],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <Icon className={`w-24 h-24 ${color}`} />
    </motion.div>
  );
};

export function IFoxStatusCards({ metrics, activeStatus, onSelect, loading = false }: StatusCardsProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100,
      },
    },
  };

  return (
    <motion.div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {(Object.keys(statusConfigs) as StatusKey[]).map((status) => {
        const config = statusConfigs[status];
        const Icon = config.icon;
        const isActive = activeStatus === status;
        const count = metrics[status];

        return (
          <motion.div
            key={status}
            variants={cardVariants}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Card
              className={`
                relative p-6 cursor-pointer transition-all duration-300 overflow-hidden
                bg-gradient-to-br ${config.bgGradient}
                backdrop-blur-lg border-white/20
                dark:border-white/10
                ${isActive ? "ring-2 ring-white/30 shadow-2xl " + config.glowColor : ""}
                hover:shadow-lg hover:shadow-white/10
              `}
              onClick={() => onSelect?.(status)}
              data-testid={`ifox-card-status-${status}`}
            >
              <FloatingIcon Icon={Icon} color={config.iconColor} />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${config.iconBg} backdrop-blur-sm`}>
                    <Icon className={`w-6 h-6 ${config.iconColor}`} />
                  </div>
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring" }}
                    >
                      <Sparkles className="w-5 h-5 text-yellow-300" />
                    </motion.div>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">
                    {config.label}
                  </p>
                  <p className="text-xs text-gray-100">
                    {config.labelEn}
                  </p>
                </div>

                {loading ? (
                  <SkeletonLoader />
                ) : (
                  <motion.div
                    className="mt-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <span 
                      className={`text-3xl font-bold bg-gradient-to-r ${config.gradient} bg-clip-text text-transparent`}
                      data-testid={`ifox-status-count-${status}`}
                    >
                      {count.toLocaleString('ar-SA')}
                    </span>
                  </motion.div>
                )}

                {/* Animated trend indicator */}
                <motion.div
                  className="flex items-center gap-1 mt-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <TrendingUp className="w-3 h-3 text-green-300" />
                  <span className="text-xs font-semibold text-green-300">
                    +{Math.floor(Math.random() * 20 + 5)}%
                  </span>
                  <span className="text-xs text-gray-100">هذا الأسبوع</span>
                </motion.div>
              </div>

              {/* Animated background decoration */}
              <motion.div
                className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-10"
                style={{
                  background: `radial-gradient(circle, ${config.iconColor} 0%, transparent 70%)`,
                }}
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.1, 0.2, 0.1],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}