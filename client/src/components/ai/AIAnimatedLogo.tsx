import { motion } from "framer-motion";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";

export default function AIAnimatedLogo() {
  return (
    <motion.div
      className="relative w-32 h-32"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ 
        type: "spring",
        stiffness: 260,
        damping: 20
      }}
    >
      {/* Outer Ring - Cyan/Blue */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-cyan-500/30"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.7, 0.3],
          rotate: [0, 360],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Middle Ring - Purple */}
      <motion.div
        className="absolute inset-3 rounded-full border-2 border-purple-500/40"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.4, 0.8, 0.4],
          rotate: [0, -360],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Inner Glow Circle */}
      <motion.div
        className="absolute inset-6 rounded-full bg-gradient-to-br from-cyan-500/20 via-blue-500/20 to-purple-600/20 backdrop-blur-sm"
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

      {/* AI Mascot */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          y: [0, -10, 0],
          rotate: [0, 3, -3, 0],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <motion.img 
          src={mascotImage} 
          alt="iFox AI Mascot" 
          className="w-24 h-24 drop-shadow-2xl relative z-10"
          animate={{
            filter: [
              "drop-shadow(0 0 15px rgba(34, 197, 94, 0.4))",
              "drop-shadow(0 0 30px rgba(34, 197, 94, 0.7))",
              "drop-shadow(0 0 15px rgba(34, 197, 94, 0.4))",
            ],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>

      {/* Circuit Board Particles - Tech Theme */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: i % 2 === 0 ? "3px" : "2px",
            height: i % 2 === 0 ? "3px" : "2px",
            left: "50%",
            top: "50%",
            background: i % 3 === 0 
              ? "rgba(34, 197, 94, 0.8)" // Green - eyes color
              : i % 3 === 1 
              ? "rgba(59, 130, 246, 0.8)" // Blue 
              : "rgba(139, 92, 246, 0.8)" // Purple
          }}
          animate={{
            x: [0, Math.cos((i * 45) * Math.PI / 180) * 50, 0],
            y: [0, Math.sin((i * 45) * Math.PI / 180) * 50, 0],
            opacity: [0, 0.8, 0],
            scale: [0.5, 1.2, 0.5],
          }}
          transition={{
            duration: 4,
            delay: i * 0.3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Energy Pulse Effect */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20"
        animate={{
          scale: [1, 1.8, 1.8],
          opacity: [0.6, 0, 0],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />

      {/* Secondary Pulse - Green for Eyes */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500/30 to-emerald-500/30"
        animate={{
          scale: [1, 1.6, 1.6],
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