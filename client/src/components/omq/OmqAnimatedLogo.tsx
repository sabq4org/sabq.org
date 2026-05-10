import { motion } from "framer-motion";
import { Brain, Layers, Zap } from "lucide-react";

export default function OmqAnimatedLogo() {
  return (
    <motion.div
      className="relative w-40 h-40"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ 
        type: "spring",
        stiffness: 260,
        damping: 20
      }}
    >
      {/* Outer Ring - Indigo */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-indigo-500/30"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.7, 0.3],
          rotate: [0, 360],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      
      {/* Middle Ring - Purple */}
      <motion.div
        className="absolute inset-4 rounded-full border-2 border-purple-500/40"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.4, 0.8, 0.4],
          rotate: [0, -360],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Inner Ring - Violet */}
      <motion.div
        className="absolute inset-8 rounded-full border-2 border-violet-500/50"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.5, 0.9, 0.5],
          rotate: [0, 180, 360],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "linear",
        }}
      />

      {/* Inner Glow Circle */}
      <motion.div
        className="absolute inset-10 rounded-full bg-gradient-to-br from-indigo-600/30 via-purple-600/30 to-violet-600/30 backdrop-blur-sm"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.6, 0.9, 0.6],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Central Brain Icon */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          y: [0, -8, 0],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <div className="relative">
          <motion.div
            className="w-20 h-20 bg-gradient-to-br from-indigo-600 via-purple-600 to-violet-700 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/50"
            animate={{
              boxShadow: [
                "0 25px 50px -12px rgba(99, 102, 241, 0.5)",
                "0 25px 50px -12px rgba(139, 92, 246, 0.7)",
                "0 25px 50px -12px rgba(99, 102, 241, 0.5)",
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Brain className="w-10 h-10 text-white" />
          </motion.div>
          
          {/* Floating Icons */}
          <motion.div
            className="absolute -top-3 -right-3 w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg"
            animate={{
              y: [0, -5, 0],
              rotate: [0, 10, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          >
            <Layers className="w-4 h-4 text-white" />
          </motion.div>
          
          <motion.div
            className="absolute -bottom-2 -left-3 w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg flex items-center justify-center shadow-lg"
            animate={{
              y: [0, 5, 0],
              rotate: [0, -10, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          >
            <Zap className="w-4 h-4 text-white" />
          </motion.div>
        </div>
      </motion.div>

      {/* Neural Network Particles */}
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: i % 3 === 0 ? "4px" : "3px",
            height: i % 3 === 0 ? "4px" : "3px",
            left: "50%",
            top: "50%",
            background: i % 4 === 0 
              ? "rgba(99, 102, 241, 0.9)" // Indigo
              : i % 4 === 1 
              ? "rgba(139, 92, 246, 0.9)" // Purple
              : i % 4 === 2
              ? "rgba(124, 58, 237, 0.9)" // Violet
              : "rgba(59, 130, 246, 0.9)" // Blue
          }}
          animate={{
            x: [0, Math.cos((i * 30) * Math.PI / 180) * 60, 0],
            y: [0, Math.sin((i * 30) * Math.PI / 180) * 60, 0],
            opacity: [0, 0.9, 0],
            scale: [0.5, 1.3, 0.5],
          }}
          transition={{
            duration: 4,
            delay: i * 0.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Energy Pulse Effect */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-violet-500/20"
        animate={{
          scale: [1, 2, 2],
          opacity: [0.6, 0, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />

      {/* Secondary Pulse */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/20 to-indigo-500/20"
        animate={{
          scale: [1, 1.8, 1.8],
          opacity: [0.4, 0, 0],
        }}
        transition={{
          duration: 2.5,
          delay: 0.5,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
    </motion.div>
  );
}
