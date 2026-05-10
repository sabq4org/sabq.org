import { Camera, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";

interface WeeklyPhotoItem {
  imageUrl: string;
  caption: string;
  credit?: string;
}

interface WeeklyPhotosDisplayProps {
  photos: WeeklyPhotoItem[];
  title?: string;
}

export function WeeklyPhotosDisplay({ photos, title }: WeeklyPhotosDisplayProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const validPhotos = photos?.filter(p => p.imageUrl) || [];
  
  if (validPhotos.length === 0) {
    return null;
  }

  const goToPrevious = useCallback(() => {
    if (selectedIndex !== null) {
      setSelectedIndex(selectedIndex === 0 ? validPhotos.length - 1 : selectedIndex - 1);
    }
  }, [selectedIndex, validPhotos.length]);

  const goToNext = useCallback(() => {
    if (selectedIndex !== null) {
      setSelectedIndex(selectedIndex === validPhotos.length - 1 ? 0 : selectedIndex + 1);
    }
  }, [selectedIndex, validPhotos.length]);

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goToPrevious(); // RTL: right arrow goes to previous
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToNext(); // RTL: left arrow goes to next
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSelectedIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, goToPrevious, goToNext]);

  const selectedPhoto = selectedIndex !== null ? validPhotos[selectedIndex] : null;

  return (
    <div className="w-full" dir="rtl">
      {title && (
        <div className="flex items-center gap-3 mb-10">
          <div className="p-2 rounded-xl bg-primary/10">
            <Camera className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">{title}</h2>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-transparent" />
        </div>
      )}

      <div className="relative">
        <div className="absolute right-6 md:right-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/20 via-primary/40 to-primary/20" />

        <div className="space-y-8 md:space-y-12">
          {validPhotos.map((photo, index) => {
            const isEven = index % 2 === 0;
            
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className={`relative flex flex-col md:flex-row items-start gap-4 md:gap-8 ${
                  isEven ? "md:flex-row" : "md:flex-row-reverse"
                }`}
              >
                <div className="absolute right-4 md:right-1/2 md:-translate-x-1/2 w-4 h-4 rounded-full bg-primary border-4 border-background shadow-lg z-10" />

                <div className={`w-full md:w-1/2 pr-12 md:pr-0 ${isEven ? "md:pl-8" : "md:pr-8"}`}>
                  <button
                    onClick={() => setSelectedIndex(index)}
                    className="w-full group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-2xl"
                    aria-label={`عرض صورة ${index + 1}: ${photo.caption}`}
                    data-testid={`photo-card-${index}`}
                  >
                    <div className="relative overflow-hidden rounded-2xl shadow-lg">
                      <img
                        src={photo.imageUrl}
                        alt={photo.caption}
                        className="w-full aspect-[16/10] object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          whileHover={{ opacity: 1, scale: 1 }}
                          className="bg-white/90 dark:bg-black/90 px-4 py-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <span className="text-sm font-medium">عرض الصورة</span>
                        </motion.div>
                      </div>
                      <div className="absolute top-3 right-3">
                        <span className="bg-primary text-primary-foreground text-sm font-bold px-3 py-1.5 rounded-full shadow-lg">
                          {index + 1}
                        </span>
                      </div>
                    </div>
                  </button>
                </div>

                <div className={`w-full md:w-1/2 pr-12 md:pr-0 ${isEven ? "md:pr-8 md:text-right" : "md:pl-8 md:text-right"}`}>
                  <div className="bg-muted/40 dark:bg-muted/20 backdrop-blur-sm border border-border/50 rounded-2xl p-5 shadow-sm">
                    <p className="text-base md:text-lg leading-relaxed text-foreground">
                      {photo.caption}
                    </p>
                    {photo.credit && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                        <Camera className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{photo.credit}</span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="flex justify-center mt-8">
          <div className="w-3 h-3 rounded-full bg-primary" />
        </div>
      </div>

      <AnimatePresence>
        {selectedIndex !== null && selectedPhoto && (
          <motion.div 
            className="fixed inset-4 md:inset-8 z-50 flex items-center justify-center rounded-3xl overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="fullscreen-overlay"
          >
            <div 
              className="absolute inset-0 bg-black/90 backdrop-blur-md rounded-3xl"
              onClick={() => setSelectedIndex(null)}
            />
            
            <motion.div 
              className="relative z-10 w-full max-w-4xl max-h-full overflow-auto p-4"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25 }}
            >
              <div className="relative">
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-black">
                  {/* Navigation arrow - RIGHT side of image */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 backdrop-blur-md border-0 h-12 w-12 z-20 shadow-xl"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToPrevious();
                    }}
                    data-testid="button-previous-photo"
                  >
                    <ChevronRight className="h-7 w-7 text-white" />
                  </Button>

                  {/* Navigation arrow - LEFT side of image */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 backdrop-blur-md border-0 h-12 w-12 z-20 shadow-xl"
                    onClick={(e) => {
                      e.stopPropagation();
                      goToNext();
                    }}
                    data-testid="button-next-photo"
                  >
                    <ChevronLeft className="h-7 w-7 text-white" />
                  </Button>
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={selectedIndex}
                      src={selectedPhoto.imageUrl}
                      alt={selectedPhoto.caption}
                      className="w-full h-full object-contain"
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.3 }}
                    />
                  </AnimatePresence>
                </div>

                <div className="absolute top-4 right-4">
                  <span className="bg-primary text-primary-foreground font-bold px-4 py-2 rounded-full text-sm shadow-lg">
                    {selectedIndex + 1} / {validPhotos.length}
                  </span>
                </div>

                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-4 left-4 bg-white/10 hover:bg-white/20 backdrop-blur-sm border-0"
                  onClick={() => setSelectedIndex(null)}
                  data-testid="button-close-fullscreen"
                >
                  <X className="h-5 w-5 text-white" />
                </Button>
              </div>

              <motion.div 
                className="mt-6 bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <p className="text-white text-lg leading-relaxed text-center">
                  {selectedPhoto.caption}
                </p>
                {selectedPhoto.credit && (
                  <p className="text-white/50 text-sm mt-3 flex items-center justify-center gap-2">
                    <Camera className="h-4 w-4" />
                    {selectedPhoto.credit}
                  </p>
                )}
              </motion.div>

              <div className="flex justify-center gap-2 mt-6">
                {validPhotos.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedIndex(index)}
                    className={`transition-all duration-300 rounded-full ${
                      index === selectedIndex 
                        ? "w-8 h-2 bg-primary" 
                        : "w-2 h-2 bg-white/30 hover:bg-white/50"
                    }`}
                    data-testid={`indicator-${index}`}
                  />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
