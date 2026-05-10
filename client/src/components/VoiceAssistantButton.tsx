import { Mic, MicOff, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

type VoiceAssistantButtonProps = {
  className?: string;
  variant?: "default" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
};

/**
 * VoiceAssistantButton - Floating button to control voice assistant
 * 
 * Features:
 * - Start/stop voice recognition
 * - Visual feedback for listening/speaking states
 * - Accessible keyboard controls
 * - Tooltip with status
 */
export function VoiceAssistantButton({
  className,
  variant = "default",
  size = "icon",
}: VoiceAssistantButtonProps) {
  const {
    isListening,
    isSpeaking,
    isSupported,
    startListening,
    stopListening,
  } = useVoiceAssistant();
  const { toast } = useToast();
  const { language } = useLanguage();

  // Localized messages
  const messages = {
    ar: {
      error: "خطأ في المساعد الصوتي",
      unexpected: "حدث خطأ غير متوقع",
      notSupported: "المساعد الصوتي غير مدعوم",
      noSupport: "المتصفح الخاص بك لا يدعم تقنية التعرف على الصوت",
      listening: "جاري الاستماع... اضغط للإيقاف",
      speaking: "جاري القراءة...",
      pressToSpeak: "اضغط للتحدث",
      // Error-specific messages
      httpsRequired: "المساعد الصوتي يتطلب اتصال آمن (HTTPS). يرجى الوصول إلى الموقع عبر HTTPS.",
      permissionDenied: "يرجى السماح بالوصول إلى الميكروفون من إعدادات المتصفح.",
      failedToStart: "فشل بدء المساعد الصوتي. يرجى المحاولة مرة أخرى.",
    },
    en: {
      error: "Voice Assistant Error",
      unexpected: "An unexpected error occurred",
      notSupported: "Voice Assistant Not Supported",
      noSupport: "Your browser does not support speech recognition",
      listening: "Listening... Click to stop",
      speaking: "Speaking...",
      pressToSpeak: "Click to speak",
      // Error-specific messages
      httpsRequired: "Voice assistant requires a secure connection (HTTPS). Please access the site via HTTPS.",
      permissionDenied: "Please allow microphone access from browser settings.",
      failedToStart: "Failed to start voice assistant. Please try again.",
    }
  };

  const t = messages[language];

  // Map error codes to localized messages
  const getErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
      case 'https-required':
        return t.httpsRequired;
      case 'not-allowed':
      case 'service-not-allowed':
        return t.permissionDenied;
      case 'InvalidStateError':
      case 'unknown':
        return t.failedToStart;
      default:
        return t.unexpected;
    }
  };

  // Listen for voice assistant errors
  useEffect(() => {
    const handleVoiceError = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        error: string; 
        userMessage?: string;
      }>;
      
      const { error, userMessage } = customEvent.detail;
      
      // Use provided userMessage, or map error code to localized message
      const description = userMessage || getErrorMessage(error);
      
      toast({
        title: t.error,
        description,
        variant: "destructive",
      });
    };

    window.addEventListener('voice:error', handleVoiceError);
    return () => window.removeEventListener('voice:error', handleVoiceError);
  }, [toast, t]);

  // Show toast if not supported
  useEffect(() => {
    if (!isSupported) {
      toast({
        title: t.notSupported,
        description: t.noSupport,
        variant: "destructive",
      });
    }
  }, [isSupported, toast, t]);

  if (!isSupported) {
    return null; // Don't render if browser doesn't support voice
  }

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const getTooltipText = () => {
    if (isListening) return t.listening;
    if (isSpeaking) return t.speaking;
    return t.pressToSpeak;
  };

  const getIcon = () => {
    if (isSpeaking) return <Volume2 className="h-4 w-4" />;
    if (isListening) return <Mic className="h-4 w-4 animate-pulse" />;
    return <MicOff className="h-4 w-4" />;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size={size}
          onClick={handleClick}
          disabled={isSpeaking}
          className={cn(
            "transition-all",
            isListening && "ring-2 ring-primary ring-offset-2",
            isSpeaking && "opacity-50 cursor-not-allowed",
            className
          )}
          aria-label={getTooltipText()}
          aria-pressed={isListening}
          data-testid="button-voice-assistant"
        >
          {getIcon()}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">
        <p>{getTooltipText()}</p>
      </TooltipContent>
    </Tooltip>
  );
}
