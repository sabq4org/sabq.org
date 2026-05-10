import { useLanguage, type Language } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function LanguageSwitcher() {
  const { setLanguage } = useLanguage();
  const [location, navigate] = useLocation();

  // Detect current language from URL path
  const isEnglish = location.startsWith('/en');
  const isUrdu = location.startsWith('/ur');
  const isArabic = !isEnglish && !isUrdu;

  const handleSwitch = () => {
    if (isArabic) {
      // From Arabic -> go to English
      setLanguage('en');
      navigate('/en');
    } else {
      // From English/Urdu -> go to Arabic
      setLanguage('ar');
      navigate('/');
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSwitch}
      className="gap-2"
      data-testid="button-language-switcher"
    >
      {isArabic ? (
        <span>EN</span>
      ) : (
        <span>AR</span>
      )}
    </Button>
  );
}
