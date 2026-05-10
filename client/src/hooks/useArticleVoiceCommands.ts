import { useState, useEffect, useCallback } from "react";
import { useVoiceAssistant } from "@/contexts/VoiceAssistantContext";
import { useResolvedLanguage } from "@/hooks/useResolvedLanguage";
import { useToast } from "@/hooks/use-toast";

/**
 * useArticleVoiceCommands - Article reading voice commands
 * 
 * Provides voice commands for reading articles aloud with start/stop controls.
 * Automatically strips HTML tags and provides reading status.
 * 
 * IMPORTANT: All feedback uses current UI language, not command phrase language.
 * 
 * @param articleContent - HTML content of the article
 * @param articleTitle - Title of the article
 * @returns Reading state and control functions
 */
export function useArticleVoiceCommands(
  articleContent?: string,
  articleTitle?: string
) {
  const { registerCommand, unregisterCommand, speak, stopSpeaking } = useVoiceAssistant();
  const currentLang = useResolvedLanguage(); // Use unified hook
  const { toast } = useToast();
  const [isReading, setIsReading] = useState(false);

  const stripHTML = useCallback((html: string): string => {
    // Create a temporary div element to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Remove script and style elements
    const scripts = temp.getElementsByTagName('script');
    const styles = temp.getElementsByTagName('style');
    
    Array.from(scripts).forEach(script => script.remove());
    Array.from(styles).forEach(style => style.remove());
    
    // Get text content and clean up whitespace
    return temp.textContent || temp.innerText || '';
  }, []);

  const startReading = useCallback(async () => {
    if (!articleContent || !articleTitle) {
      // CRITICAL: Use current UI language for toast
      toast({
        title: currentLang === 'ar' ? 'لا يوجد محتوى' : currentLang === 'ur' ? 'کوئی مواد نہیں' : 'No content',
        description: currentLang === 'ar' 
          ? 'لا يوجد محتوى متاح للقراءة'
          : currentLang === 'ur'
          ? 'پڑھنے کے لیے کوئی مواد دستیاب نہیں'
          : 'No content available to read',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Strip HTML tags from content
      const plainText = stripHTML(articleContent);
      
      // Prepare reading text
      const readingText = `${articleTitle}. ${plainText}`;
      
      // Start speaking
      const lang = currentLang === 'ar' ? 'ar-SA' : currentLang === 'ur' ? 'ur-PK' : 'en-US';
      await speak(readingText, lang);
      
      setIsReading(true);
      
      // CRITICAL: Use current UI language for toast
      toast({
        title: currentLang === 'ar' ? 'بدء القراءة' : currentLang === 'ur' ? 'پڑھنا شروع' : 'Reading started',
        description: currentLang === 'ar' 
          ? 'جاري قراءة المقالة'
          : currentLang === 'ur'
          ? 'مضمون پڑھا جا رہا ہے'
          : 'Reading article aloud',
      });
    } catch (error) {
      console.error('Failed to start reading:', error);
      
      // CRITICAL: Use current UI language for toast
      toast({
        title: currentLang === 'ar' ? 'خطأ في القراءة' : currentLang === 'ur' ? 'پڑھنے میں خرابی' : 'Reading error',
        description: currentLang === 'ar' 
          ? 'فشل بدء قراءة المقالة'
          : currentLang === 'ur'
          ? 'مضمون پڑھنا شروع کرنے میں ناکامی'
          : 'Failed to start reading article',
        variant: 'destructive',
      });
      setIsReading(false);
    }
  }, [articleContent, articleTitle, speak, toast, currentLang, stripHTML]);

  const stopReading = useCallback(() => {
    stopSpeaking();
    setIsReading(false);
    
    // CRITICAL: Use current UI language for toast
    toast({
      title: currentLang === 'ar' ? 'إيقاف القراءة' : currentLang === 'ur' ? 'پڑھنا بند' : 'Reading stopped',
      description: currentLang === 'ar' 
        ? 'تم إيقاف قراءة المقالة'
        : currentLang === 'ur'
        ? 'مضمون پڑھنا بند کر دیا گیا'
        : 'Article reading stopped',
    });
  }, [stopSpeaking, toast, currentLang]);

  useEffect(() => {
    // CRITICAL: Guard on BOTH content AND title before registering
    if (!articleContent || !articleTitle) {
      return; // Don't register commands if article data is incomplete
    }

    const commands = [
      // Arabic commands
      {
        phrase: 'اقرأ المقالة',
        description: 'قراءة المقالة بصوت عالٍ',
        action: startReading,
      },
      {
        phrase: 'اقرأ',
        description: 'قراءة المقالة',
        action: startReading,
      },
      {
        phrase: 'توقف عن القراءة',
        description: 'إيقاف قراءة المقالة',
        action: stopReading,
      },
      {
        phrase: 'توقف',
        description: 'إيقاف القراءة',
        action: stopReading,
      },
      {
        phrase: 'أوقف القراءة',
        description: 'إيقاف القراءة',
        action: stopReading,
      },
      
      // English commands
      {
        phrase: 'read article',
        description: 'Read article aloud',
        action: startReading,
      },
      {
        phrase: 'read this',
        description: 'Read this article',
        action: startReading,
      },
      {
        phrase: 'start reading',
        description: 'Start reading',
        action: startReading,
      },
      {
        phrase: 'stop reading',
        description: 'Stop reading article',
        action: stopReading,
      },
      {
        phrase: 'stop',
        description: 'Stop reading',
        action: stopReading,
      },
      
      // Urdu commands
      {
        phrase: 'مضمون پڑھیں',
        description: 'مضمون کو بلند آواز میں پڑھیں',
        action: startReading,
      },
      {
        phrase: 'پڑھیں',
        description: 'مضمون پڑھیں',
        action: startReading,
      },
      {
        phrase: 'پڑھنا بند کریں',
        description: 'مضمون پڑھنا بند کریں',
        action: stopReading,
      },
      {
        phrase: 'رکیں',
        description: 'پڑھنا بند کریں',
        action: stopReading,
      },
    ];

    // Register all commands
    commands.forEach(cmd => {
      registerCommand({
        command: cmd.phrase.toLowerCase(),
        description: cmd.description,
        action: cmd.action,
      });
    });

    // Cleanup
    return () => {
      commands.forEach(cmd => unregisterCommand(cmd.phrase.toLowerCase()));
      stopReading();
    };
  }, [articleContent, registerCommand, unregisterCommand, startReading, stopReading]);

  // Listen for speaking end event
  useEffect(() => {
    const handleSpeakingEnd = () => {
      setIsReading(false);
    };

    window.addEventListener('voice:speaking-end', handleSpeakingEnd);
    return () => window.removeEventListener('voice:speaking-end', handleSpeakingEnd);
  }, []);

  return {
    isReading,
    startReading,
    stopReading,
  };
}
