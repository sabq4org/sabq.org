import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useResolvedLanguage } from "@/hooks/useResolvedLanguage";

type FontSize = "normal" | "large" | "x-large";

type AccessibilitySettings = {
  fontSize: FontSize;
  highContrast: boolean;
  reduceMotion: boolean;
  readingMode: boolean;
};

type AccessibilityProviderProps = {
  children: React.ReactNode;
  defaultSettings?: Partial<AccessibilitySettings>;
};

type AccessibilityProviderState = {
  settings: AccessibilitySettings;
  setFontSize: (size: FontSize) => void;
  setHighContrast: (enabled: boolean) => void;
  setReduceMotion: (enabled: boolean) => void;
  setReadingMode: (enabled: boolean) => void;
  resetSettings: () => void;
};

const defaultAccessibilitySettings: AccessibilitySettings = {
  fontSize: "normal",
  highContrast: false,
  reduceMotion: false,
  readingMode: false,
};

const AccessibilityContext = createContext<AccessibilityProviderState | undefined>(
  undefined
);

export function AccessibilityProvider({
  children,
  defaultSettings,
}: AccessibilityProviderProps) {
  const [location] = useLocation();
  const currentLang = useResolvedLanguage();
  
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    // SSR/SSG guard - only access localStorage in browser
    if (typeof window === 'undefined') {
      return { ...defaultAccessibilitySettings, ...defaultSettings };
    }
    
    // Load from localStorage
    const stored = localStorage.getItem("accessibility-settings");
    if (stored) {
      try {
        return { ...defaultAccessibilitySettings, ...JSON.parse(stored) };
      } catch {
        return { ...defaultAccessibilitySettings, ...defaultSettings };
      }
    }
    return { ...defaultAccessibilitySettings, ...defaultSettings };
  });

  // Track accessibility event
  const trackEvent = useCallback(async (
    eventType: string,
    eventAction: string,
    eventValue?: string
  ) => {
    // Only track in browser
    if (typeof window === 'undefined') return;
    
    try {
      await fetch('/api/accessibility/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          eventAction,
          eventValue,
          language: currentLang,
          pageUrl: location,
        }),
      });
    } catch (error) {
      // Silently fail - don't disrupt user experience
      console.debug('Accessibility tracking failed:', error);
    }
  }, [currentLang, location]);

  // Apply settings to documentElement
  useEffect(() => {
    const root = document.documentElement;

    // Apply font size
    root.classList.remove("font-normal", "font-large", "font-x-large");
    root.classList.add(`font-${settings.fontSize}`);
    root.setAttribute("data-font-size", settings.fontSize);

    // Apply high contrast
    if (settings.highContrast) {
      root.classList.add("high-contrast");
      root.setAttribute("data-high-contrast", "true");
    } else {
      root.classList.remove("high-contrast");
      root.removeAttribute("data-high-contrast");
    }

    // Apply reduce motion
    if (settings.reduceMotion) {
      root.classList.add("reduce-motion");
      root.setAttribute("data-reduce-motion", "true");
    } else {
      root.classList.remove("reduce-motion");
      root.removeAttribute("data-reduce-motion");
    }

    // Apply reading mode with dynamic font loading using FontFace API
    if (settings.readingMode) {
      root.classList.add("reading-mode");
      root.setAttribute("data-reading-mode", "true");
      
      // Dynamically load OpenDyslexic font only when needed (saves ~1.7MB from initial bundle)
      // Using FontFace API for efficient loading of just the WOFF2 file
      if (!document.fonts.check('16px OpenDyslexic')) {
        const font = new FontFace(
          'OpenDyslexic',
          'url(https://fonts.cdnfonts.com/s/12937/OpenDyslexic-Regular.woff) format("woff")'
        );
        font.load().then((loadedFont) => {
          document.fonts.add(loadedFont);
        }).catch((error) => {
          console.debug('OpenDyslexic font loading failed, falling back to system font:', error);
        });
      }
    } else {
      root.classList.remove("reading-mode");
      root.removeAttribute("data-reading-mode");
    }

    // Save to localStorage (browser only)
    if (typeof window !== 'undefined') {
      localStorage.setItem("accessibility-settings", JSON.stringify(settings));
    }
  }, [settings]);

  const setFontSize = useCallback((fontSize: FontSize) => {
    setSettings((prev) => ({ ...prev, fontSize }));
    trackEvent('fontSize', 'changed', fontSize);
  }, [trackEvent]);

  const setHighContrast = useCallback((highContrast: boolean) => {
    setSettings((prev) => ({ ...prev, highContrast }));
    trackEvent('highContrast', highContrast ? 'enabled' : 'disabled', String(highContrast));
  }, [trackEvent]);

  const setReduceMotion = useCallback((reduceMotion: boolean) => {
    setSettings((prev) => ({ ...prev, reduceMotion }));
    trackEvent('reduceMotion', reduceMotion ? 'enabled' : 'disabled', String(reduceMotion));
  }, [trackEvent]);

  const setReadingMode = useCallback((readingMode: boolean) => {
    setSettings((prev) => ({ ...prev, readingMode }));
    trackEvent('readingMode', readingMode ? 'enabled' : 'disabled', String(readingMode));
  }, [trackEvent]);

  const resetSettings = useCallback(() => {
    setSettings(defaultAccessibilitySettings);
    trackEvent('settings', 'reset', 'all');
  }, [trackEvent]);

  return (
    <AccessibilityContext.Provider
      value={{
        settings,
        setFontSize,
        setHighContrast,
        setReduceMotion,
        setReadingMode,
        resetSettings,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within AccessibilityProvider");
  }
  return context;
};
