import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";

const MASCOT_COOLDOWN_KEY = "ifox_mascot_last_shown";
const COOLDOWN_MINUTES = 20;

export default function HeaderMascot() {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Check if mascot should be shown based on cooldown period
    const checkCooldown = () => {
      try {
        const lastShown = localStorage.getItem(MASCOT_COOLDOWN_KEY);
        
        if (!lastShown) {
          // First time - show the mascot
          return true;
        }
        
        const lastShownTime = parseInt(lastShown, 10);
        const currentTime = Date.now();
        const minutesPassed = (currentTime - lastShownTime) / (1000 * 60);
        
        // Show only if 20 minutes have passed
        return minutesPassed >= COOLDOWN_MINUTES;
      } catch (error) {
        console.error("Error checking mascot cooldown:", error);
        return false;
      }
    };

    const shouldShow = checkCooldown();
    
    if (!shouldShow) {
      return; // Don't show the mascot if cooldown hasn't passed
    }

    // Show mascot after 1 second
    const showTimer = setTimeout(() => {
      setIsVisible(true);
      // Save current timestamp to localStorage
      try {
        localStorage.setItem(MASCOT_COOLDOWN_KEY, Date.now().toString());
      } catch (error) {
        console.error("Error saving mascot timestamp:", error);
      }
    }, 1000);

    // Hide mascot after 10 seconds (increased time for movement)
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 10000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <Link href="/ai">
          <motion.div
            className="fixed left-4 top-20 z-40 cursor-pointer group"
            initial={{ x: -200, opacity: 0 }}
            animate={{ 
              x: [0, 350, 350], // Move from left to center-right and stay
              opacity: [0, 1, 1]
            }}
            exit={{ x: 800, opacity: 0 }} // Exit to the right
            transition={{ 
              x: {
                duration: 9,
                times: [0, 0.67, 1],
                ease: "easeInOut"
              },
              opacity: {
                duration: 0.8,
                ease: "easeIn"
              }
            }}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
            data-testid="mascot-ai-link"
          >
          <motion.div
            className="relative w-24 h-24"
            animate={{ 
              y: [0, -8, 0],
              rotate: [0, 5, -5, 0],
              scale: isHovered ? 1.1 : 1,
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {/* Outer Ring - Cyan/Blue */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-cyan-500/40"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.4, 0.7, 0.4],
                rotate: [0, 360],
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            
            {/* Middle Ring - Purple */}
            <motion.div
              className="absolute inset-2 rounded-full border-2 border-purple-500/50"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0.8, 0.5],
                rotate: [0, -360],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* Inner Glow */}
            <motion.div
              className="absolute inset-4 rounded-full bg-gradient-to-br from-cyan-500/30 via-blue-500/30 to-purple-600/30 backdrop-blur-sm"
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.6, 0.9, 0.6],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* AI Mascot */}
            <motion.div className="absolute inset-0 flex items-center justify-center">
              <motion.img 
                src={mascotImage} 
                alt="iFox AI Mascot" 
                className="w-20 h-20 drop-shadow-2xl relative z-10"
                animate={{
                  filter: [
                    "drop-shadow(0 0 12px rgba(34, 197, 94, 0.5))",
                    "drop-shadow(0 0 25px rgba(34, 197, 94, 0.8))",
                    "drop-shadow(0 0 12px rgba(34, 197, 94, 0.5))",
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>

            {/* Particle Effects */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: "2px",
                  height: "2px",
                  left: "50%",
                  top: "50%",
                  background: i % 3 === 0 
                    ? "rgba(34, 197, 94, 0.9)" 
                    : i % 3 === 1 
                    ? "rgba(59, 130, 246, 0.9)" 
                    : "rgba(139, 92, 246, 0.9)"
                }}
                animate={{
                  x: [0, Math.cos((i * 60) * Math.PI / 180) * 40, 0],
                  y: [0, Math.sin((i * 60) * Math.PI / 180) * 40, 0],
                  opacity: [0, 0.9, 0],
                  scale: [0.4, 1.3, 0.4],
                }}
                transition={{
                  duration: 3.5,
                  delay: i * 0.25,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            ))}

            {/* Energy Pulse */}
            <motion.div
              className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/30 via-blue-500/30 to-purple-500/30"
              animate={{
                scale: [1, 1.7, 1.7],
                opacity: [0.6, 0, 0],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />

            {/* Green Pulse for Eyes */}
            <motion.div
              className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500/40 to-emerald-500/40"
              animate={{
                scale: [1, 1.5, 1.5],
                opacity: [0.5, 0, 0],
              }}
              transition={{
                duration: 2,
                delay: 0.4,
                repeat: Infinity,
                ease: "easeOut",
              }}
            />
          </motion.div>
        </motion.div>
        </Link>
      )}
    </AnimatePresence>
  );
}
