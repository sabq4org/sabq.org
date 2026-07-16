import { useState } from "react";
import { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, Loader2, ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface InlineHeadlineSuggestionsProps {
  language: 'ar' | 'en' | 'ur';
  editorInstance: Editor | null;
  currentTitle: string;
  onTitleChange: (newTitle: string) => void;
  onSlugChange?: (newSlug: string) => void;
}

interface HeadlineSuggestion {
  provider: string;
  model: string;
  title: string;
  error?: string;
}

const LABELS = {
  ar: {
    button: "اقترح عناوين ذكية",
    error: "فشل في توليد العناوين",
    slugGenerated: "تم توليد الرابط الدائم تلقائياً",
  },
  en: {
    button: "Suggest Smart Headlines",
    error: "Failed to generate headlines",
    slugGenerated: "Slug automatically generated",
  },
  ur: {
    button: "سمارٹ عنوانات تجویز کریں",
    error: "عنوانات بنانے میں ناکامی",
    slugGenerated: "slug خودکار طور پر تیار کیا گیا",
  },
};

// Helper function to generate slug from title
const generateSlug = (text: string): string => {
  if (!text || typeof text !== 'string') return "";
  
  const slug = text
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "") // Keep Arabic, English, numbers, spaces, hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, "") // Remove leading/trailing hyphens
    .substring(0, 150); // Limit to 150 characters
  
  return slug;
};

export function InlineHeadlineSuggestions({
  language,
  editorInstance,
  currentTitle,
  onTitleChange,
  onSlugChange,
}: InlineHeadlineSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<HeadlineSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const { toast } = useToast();

  const isRTL = language === 'ar' || language === 'ur';
  const labels = LABELS[language];

  const hasContent = (editorInstance?.getText() || '').trim().length > 0;

  const handleSuggest = async () => {
    if (!editorInstance) return;

    const content = editorInstance.getText() || '';
    if (!content.trim()) return;

    setLoading(true);
    try {
      const response = await apiRequest<{ suggestions: HeadlineSuggestion[] }>(
        "/api/ai/compare-headlines",
        {
          method: "POST",
          body: JSON.stringify({ 
            language, 
            currentTitle, 
            content 
          }),
        }
      );

      const validSuggestions = response?.suggestions?.filter(s => !s.error);
      setSuggestions(validSuggestions);
      setResultsOpen(false);

      if (validSuggestions.length === 0) {
        toast({
          title: labels.error,
          description: "No valid suggestions were generated",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: labels.error,
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    // Update title
    onTitleChange(suggestion);
    
    // Auto-generate and update slug if callback is provided
    if (onSlugChange) {
      const newSlug = generateSlug(suggestion);
      onSlugChange(newSlug);
      console.log('[InlineHeadlineSuggestions] Auto-generated slug:', newSlug);
      
      // Show toast notification
      toast({
        title: suggestion,
        description: labels.slugGenerated,
      });
    }
    
    setSuggestions([]);
  };

  const suggestionsCount = suggestions.length;
  const showSuggestionsLabel =
    language === "ar"
      ? `عرض الاقتراحات (${suggestionsCount})`
      : language === "ur"
        ? `تجاویز دکھائیں (${suggestionsCount})`
        : `Show suggestions (${suggestionsCount})`;

  return (
    <div className="space-y-2" dir={isRTL ? 'rtl' : 'ltr'}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleSuggest}
        disabled={!hasContent || loading}
        data-testid="button-suggest-headlines"
        className="h-8 gap-1.5 px-2.5 text-xs"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {isRTL ? "جاري التوليد..." : "Generating..."}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {labels.button}
          </>
        )}
      </Button>

      {suggestionsCount > 0 && (
        <Collapsible open={resultsOpen} onOpenChange={setResultsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs w-full justify-between"
              data-testid="button-toggle-headline-suggestions"
            >
              <span>{showSuggestionsLabel}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${resultsOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <AnimatePresence>
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="border">
                  <CardContent className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.1 }}
                        >
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover-elevate active-elevate-2 py-2 px-3 text-sm"
                            onClick={() => handleSelectSuggestion(suggestion.title)}
                            data-testid={`headline-suggestion-${index}`}
                          >
                            {suggestion.title}
                          </Badge>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </AnimatePresence>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
