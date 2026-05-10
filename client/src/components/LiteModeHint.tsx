import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { X, Smartphone, Sparkles, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const HINT_STORAGE_KEY = "sabq_lite_hint_dismissed";
const SHOW_DELAY_MS = 5000;

export function LiteModeHint() {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Check if device is mobile (screen width <= 768px)
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    // Only show on mobile devices
    if (!isMobile) return;
    
    const dismissed = localStorage.getItem(HINT_STORAGE_KEY);
    if (dismissed) {
      setIsDismissed(true);
      return;
    }

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isMobile]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(HINT_STORAGE_KEY, "true");
    setIsDismissed(true);
  };

  // Only render on mobile devices
  if (!isMobile || isDismissed) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.8 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50"
          dir="rtl"
          data-testid="lite-mode-hint"
        >
          <div className="relative bg-gradient-to-l from-cyan-500 to-blue-600 text-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-10 bg-white/5" />
            
            <button
              onClick={handleDismiss}
              className="absolute top-2 left-2 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              aria-label="إغلاق"
              data-testid="button-dismiss-lite-hint"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-4 pr-5">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                  <Smartphone className="h-6 w-6" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="h-4 w-4 text-yellow-300" />
                    <h3 className="font-bold text-lg">جرّب سبق لايت</h3>
                  </div>
                  
                  <p className="text-sm text-white/90 leading-relaxed mb-3">
                    تصفح الأخبار بطريقة سريعة وممتعة عبر السحب!
                    مثالي للجوال وتوفير البيانات.
                  </p>

                  <Link href="/lite">
                    <Button
                      size="sm"
                      className="bg-white text-blue-600 hover:bg-white/90 font-semibold gap-1"
                      onClick={handleDismiss}
                      data-testid="button-try-lite-mode"
                    >
                      جرّب الآن
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="h-1 bg-gradient-to-l from-yellow-400 via-orange-400 to-pink-400" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
