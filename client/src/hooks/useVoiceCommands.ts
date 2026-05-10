import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { useToast } from "@/hooks/use-toast";
import { useResolvedLanguage } from "@/hooks/useResolvedLanguage";

interface VoiceCommandConfig {
  id: string;
  arabic: string[];
  english: string[];
  urdu: string[]; // Urdu phrases
  getRoute: (lang: 'ar' | 'en' | 'ur') => string | null;
  getDescription: () => { ar: string; en: string; ur: string };
  priority?: number;
}

/**
 * useVoiceCommands - Global voice commands hook
 * 
 * Registers global bilingual voice commands for navigation, search, and help.
 * Automatically provides speech and toast feedback for executed commands.
 * 
 * IMPORTANT: All feedback uses current UI language, not command phrase language.
 */
export function useVoiceCommands() {
  const { registerCommand, unregisterCommand, speak } = useVoiceAssistant();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const currentLang = useResolvedLanguage(); // Use unified hook instead of LanguageContext
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const globalCommands: VoiceCommandConfig[] = [
      // Navigation - Home
      {
        id: 'home',
        arabic: ['الرئيسية', 'اذهب إلى الرئيسية', 'اذهب للرئيسية', 'الصفحة الرئيسية'],
        english: ['home', 'go to home', 'go home', 'homepage'],
        urdu: ['گھر', 'گھر جائیں', 'ہوم'],
        getRoute: (lang) => {
          if (lang === 'en') return '/en';
          if (lang === 'ur') return '/ur';
          return '/';  // Arabic default
        },
        getDescription: () => ({
          ar: 'الانتقال إلى الصفحة الرئيسية',
          en: 'Go to homepage',
          ur: 'ہوم پیج پر جائیں'
        }),
      },
      
      // Navigation - News
      {
        id: 'news',
        arabic: ['الأخبار', 'اذهب إلى الأخبار', 'صفحة الأخبار'],
        english: ['news', 'go to news', 'news page'],
        urdu: ['خبریں', 'خبروں پر جائیں'],
        getRoute: (lang) => {
          if (lang === 'en') return '/en/news';
          if (lang === 'ur') return '/ur/news';
          return '/news';  // Arabic
        },
        getDescription: () => ({
          ar: 'الانتقال إلى صفحة الأخبار',
          en: 'Go to news page',
          ur: 'خبروں کے صفحے پر جائیں'
        }),
      },
      
      // Navigation - Opinion
      {
        id: 'opinion',
        arabic: ['الرأي', 'اذهب إلى الرأي', 'مقالات الرأي'],
        english: ['opinion', 'go to opinion', 'opinion articles'],
        urdu: [], // No Urdu - route doesn't exist
        getRoute: (lang) => {
          if (lang === 'en') return '/en/opinion';
          if (lang === 'ur') return null; // NO URDU ROUTE
          return '/opinion';  // Arabic
        },
        getDescription: () => ({
          ar: 'الانتقال إلى صفحة الرأي',
          en: 'Go to opinion page',
          ur: '' // Empty - not supported
        }),
      },
      
      // Navigation - Categories
      {
        id: 'categories',
        arabic: ['التصنيفات', 'اذهب إلى التصنيفات', 'الأقسام'],
        english: ['categories', 'go to categories', 'sections'],
        urdu: ['زمرے', 'زمروں پر جائیں'],
        getRoute: (lang) => {
          if (lang === 'en') return '/en/categories';
          if (lang === 'ur') return '/ur/categories';
          return '/categories';  // Arabic
        },
        getDescription: () => ({
          ar: 'الانتقال إلى صفحة التصنيفات',
          en: 'Go to categories page',
          ur: 'زمروں کے صفحے پر جائیں'
        }),
      },
      
      // Navigation - Dashboard
      {
        id: 'dashboard',
        arabic: ['لوحة التحكم', 'اذهب إلى لوحة التحكم'],
        english: ['dashboard', 'go to dashboard', 'control panel'],
        urdu: ['ڈیش بورڈ', 'ڈیش بورڈ پر جائیں'],
        getRoute: (lang) => {
          if (lang === 'en') return '/en/dashboard';
          if (lang === 'ur') return '/ur/dashboard';
          return '/dashboard';  // Arabic
        },
        getDescription: () => ({
          ar: 'الانتقال إلى لوحة التحكم',
          en: 'Go to dashboard',
          ur: 'ڈیش بورڈ پر جائیں'
        }),
      },
      
      // Navigation - Profile
      {
        id: 'profile',
        arabic: ['الملف الشخصي', 'اذهب إلى الملف الشخصي', 'حسابي'],
        english: ['profile', 'go to profile', 'my account'],
        urdu: [], // No Urdu - route doesn't exist
        getRoute: (lang) => {
          if (lang === 'en') return '/en/profile';
          if (lang === 'ur') return null; // NO URDU ROUTE
          return '/profile';  // Arabic
        },
        getDescription: () => ({
          ar: 'الانتقال إلى الملف الشخصي',
          en: 'Go to profile',
          ur: '' // Empty - not supported
        }),
      },
      
      // Navigation - Daily Brief
      {
        id: 'daily-brief',
        arabic: ['الموجز اليومي', 'اذهب إلى الموجز اليومي'],
        english: ['daily brief', 'go to daily brief'],
        urdu: [], // No Urdu - route doesn't exist
        getRoute: (lang) => {
          if (lang === 'en') return '/en/daily-brief';
          if (lang === 'ur') return null; // NO URDU ROUTE
          return '/daily-brief';  // Arabic
        },
        getDescription: () => ({
          ar: 'الانتقال إلى الموجز اليومي',
          en: 'Go to daily brief',
          ur: '' // Empty - not supported
        }),
      },
      
      // Navigation - Back
      {
        id: 'back',
        arabic: ['رجوع', 'ارجع', 'عودة'],
        english: ['back', 'go back'],
        urdu: ['واپس', 'واپس جائیں'],
        getRoute: () => '', // Special case - uses browser history
        getDescription: () => ({
          ar: 'العودة للصفحة السابقة',
          en: 'Go back to previous page',
          ur: 'پچھلے صفحے پر واپس جائیں'
        }),
      },
      
      // Help
      {
        id: 'help',
        arabic: ['مساعدة', 'ما الأوامر', 'أوامر الصوت', 'ساعدني'],
        english: ['help', 'what can i do', 'voice commands', 'show commands'],
        urdu: ['مدد', 'کمانڈز'],
        getRoute: () => '', // Special case - shows help dialog
        getDescription: () => ({
          ar: 'عرض الأوامر الصوتية المتاحة',
          en: 'Show available voice commands',
          ur: 'صوتی کمانڈز کی مدد دکھائیں'
        }),
      },
    ];

    // Helper for command action
    const handleCommandAction = (cmd: VoiceCommandConfig, route: string | null, descriptions: { ar: string; en: string; ur: string }) => {
      try {
        // Execute navigation action
        if (cmd.id === 'back') {
          window.history.back();
        } else if (cmd.id === 'help') {
          setShowHelp(true);
        } else if (route) {
          navigate(route);
        }
        
        // CRITICAL: Use current UI language for feedback
        const feedbackText = currentLang === 'ar' ? descriptions.ar : 
                             currentLang === 'ur' ? (descriptions.ur || descriptions.en) :
                             descriptions.en;
        const speechLang = currentLang === 'ar' ? 'ar-SA' : currentLang === 'ur' ? 'ur-PK' : 'en-US';
        
        speak(feedbackText, speechLang);
        toast({
          title: feedbackText,
        });
      } catch (error) {
        console.error('Voice command error:', error);
        const errorTitle = currentLang === 'ar' ? 'خطأ في تنفيذ الأمر' : 
                           currentLang === 'ur' ? 'کمانڈ میں خرابی' :
                           'Command Error';
        const errorDesc = currentLang === 'ar' 
          ? 'حدث خطأ أثناء تنفيذ الأمر الصوتي'
          : currentLang === 'ur'
          ? 'صوتی کمانڈ پر عمل درآمد کے دوران خرابی'
          : 'An error occurred while executing the voice command';
        
        toast({
          title: errorTitle,
          description: errorDesc,
          variant: 'destructive',
        });
      }
    };

    // Register all command variants
    globalCommands.forEach(cmd => {
      const route = cmd.getRoute(currentLang); // Now uses 'ar' | 'en' | 'ur'
      const descriptions = cmd.getDescription();
      
      // Skip if route doesn't exist for current language
      if (route === null && cmd.id !== 'back' && cmd.id !== 'help') {
        return;
      }
      
      // Register Arabic variants
      cmd.arabic.forEach(phrase => {
        registerCommand({
          command: phrase.toLowerCase(),
          description: descriptions.ar,
          action: async () => handleCommandAction(cmd, route, descriptions),
        });
      });
      
      // Register English variants
      cmd.english.forEach(phrase => {
        registerCommand({
          command: phrase.toLowerCase(),
          description: descriptions.en,
          action: async () => handleCommandAction(cmd, route, descriptions),
        });
      });
      
      // Register Urdu variants (if exist and route available)
      if (cmd.urdu && cmd.urdu.length > 0 && (route || cmd.id === 'back' || cmd.id === 'help')) {
        cmd.urdu.forEach(phrase => {
          registerCommand({
            command: phrase.toLowerCase(),
            description: descriptions.ur || descriptions.en,
            action: async () => handleCommandAction(cmd, route, descriptions),
          });
        });
      }
    });

    // Cleanup function
    return () => {
      globalCommands.forEach(cmd => {
        cmd.arabic.forEach(phrase => unregisterCommand(phrase.toLowerCase()));
        cmd.english.forEach(phrase => unregisterCommand(phrase.toLowerCase()));
        if (cmd.urdu && cmd.urdu.length > 0) {
          cmd.urdu.forEach(phrase => unregisterCommand(phrase.toLowerCase()));
        }
      });
    };
  }, [registerCommand, unregisterCommand, navigate, speak, toast, currentLang]);

  return {
    showHelp,
    setShowHelp,
  };
}
