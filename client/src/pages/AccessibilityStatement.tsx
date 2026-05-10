import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  Mail, 
  Calendar, 
  Eye, 
  Keyboard, 
  Mouse, 
  Volume2,
  FileText,
  Shield,
  BookOpen
} from "lucide-react";
import { useLocation } from "wouter";

// Translation dictionary for the Accessibility Statement page
const translations = {
  ar: {
    // Header
    pageTitle: "بيان إمكانية الوصول",
    pageSubtitle: "التزامنا بجعل صبق متاحاً للجميع",
    lastUpdated: "آخر تحديث:",
    
    // Compliance Level
    complianceTitle: "مستوى الامتثال",
    complianceDescription: "نلتزم بأعلى معايير الوصول الرقمي",
    complianceContent: "منصة صبق سمارت متوافقة مع <strong>إرشادات الوصول إلى محتوى الويب (WCAG) 2.1</strong> على مستوى AA. هذا يعني أن الموقع يلبي معايير الوصول المعترف بها عالمياً لضمان إمكانية استخدامه من قبل جميع الأشخاص، بما في ذلك ذوي الإعاقة.",
    
    // Accessibility Features
    featuresTitle: "الميزات المتاحة",
    featuresDescription: "تم تصميم المنصة لتكون سهلة الاستخدام للجميع",
    
    // Visual Features
    visualTitle: "الوصول البصري",
    visualFeature1: "إمكانية تكبير حجم الخط (عادي، كبير، كبير جداً)",
    visualFeature2: "وضع التباين العالي لتسهيل القراءة",
    visualFeature3: "تصميم متجاوب يعمل على جميع الأجهزة",
    visualFeature4: "نسبة تباين ألوان تلبي معايير WCAG AA",
    visualFeature5: "وضع القراءة المحسّن باستخدام خط OpenDyslexic",
    
    // Keyboard Navigation
    keyboardTitle: "التنقل بلوحة المفاتيح",
    keyboardFeature1: "جميع الوظائف متاحة عبر لوحة المفاتيح فقط",
    keyboardFeature2: "مؤشرات تركيز واضحة ومرئية",
    keyboardFeature3: "روابط تخطي للوصول السريع إلى المحتوى الرئيسي",
    
    // Touch Accessibility
    touchTitle: "الوصول عبر اللمس",
    touchFeature1: "أزرار وعناصر تفاعلية بحجم لا يقل عن 44×44 بكسل على الأجهزة المحمولة",
    touchFeature2: "تباعد كافٍ بين العناصر لمنع الضغط الخاطئ",
    
    // Screen Reader Support
    screenReaderTitle: "دعم قارئات الشاشة",
    screenReaderFeature1: "توافق كامل مع NVDA، JAWS، VoiceOver، وTalkBack",
    screenReaderFeature2: "إعلانات حيّة (ARIA Live Regions) للتحديثات الديناميكية",
    screenReaderFeature3: "تسميات وصفية شاملة باللغة العربية",
    screenReaderFeature4: "مساعد صوتي مدمج يدعم اللغة العربية",
    
    // Motion & Animation
    motionTitle: "الحركة والرسوم المتحركة",
    motionFeature1: "خيار تقليل الحركة للمستخدمين الذين يعانون من حساسية للحركة",
    motionFeature2: "عدم وجود محتوى وامض قد يسبب نوبات",
    
    // Reading Mode
    readingTitle: "وضع القراءة المحسّن",
    readingFeature1: "خط OpenDyslexic المصمم خصيصاً لذوي صعوبات القراءة والديسلكسيا",
    readingFeature2: "تباعد محسّن بين الأحرف والكلمات (0.12em و 0.16em)",
    readingFeature3: "ارتفاع سطر محسّن (1.8) لتحسين قابلية القراءة",
    readingFeature4: "تمييز الأسطر عند التمرير فوقها لتسهيل التتبع",
    
    // Testing & Compliance
    testingTitle: "الاختبار والامتثال",
    testingDescription: "نلتزم باختبار المنصة بشكل مستمر",
    testingIntro: "يتم اختبار منصة صبق سمارت بشكل دوري باستخدام:",
    testingMethod1: "أدوات اختبار آلية (axe-core، WAVE، Lighthouse)",
    testingMethod2: "اختبار يدوي مع قارئات الشاشة المختلفة",
    testingMethod3: "اختبار التنقل بلوحة المفاتيح",
    testingMethod4: "اختبار التوافق مع الأجهزة المساعدة",
    
    // Contact & Feedback
    contactTitle: "تواصل معنا",
    contactDescription: "نحن نرحب بملاحظاتك واقتراحاتك",
    contactIntro: "نسعى باستمرار لتحسين إمكانية الوصول على منصة صبق. إذا واجهت أي صعوبات في استخدام الموقع أو لديك اقتراحات لتحسين تجربة الوصول، يرجى التواصل معنا:",
    emailLabel: "البريد الإلكتروني:",
    responseTime: "سنرد على استفساراتك في أقرب وقت ممكن، عادةً خلال 2-3 أيام عمل.",
    sendFeedbackButton: "إرسال ملاحظات حول إمكانية الوصول",
    
    // Known Issues
    knownIssuesTitle: "المشكلات المعروفة والتحسينات المستقبلية",
    knownIssuesDescription: "نعمل باستمرار على تحسين تجربة الوصول",
    knownIssuesIntro: "نحن ملتزمون بتحسين تجربة الوصول بشكل مستمر. حالياً نعمل على:",
    knownIssue1: "توسيع دعم المساعد الصوتي ليشمل لهجات عربية إضافية",
    knownIssue2: "إضافة نصوص بديلة (alt text) ذكية للصور باستخدام الذكاء الاصطناعي",
    knownIssue3: "تحسين وضع القراءة للمستخدمين ذوي صعوبات التعلم",
    
    // Footer
    footerAppliesTo: "بيان إمكانية الوصول هذا ينطبق على منصة صبق سمارت (sabq.org)",
    footerLastReview: "آخر مراجعة:",
  },
  en: {
    // Header
    pageTitle: "Accessibility Statement",
    pageSubtitle: "Our Commitment to Making Sabq Accessible to Everyone",
    lastUpdated: "Last Updated:",
    
    // Compliance Level
    complianceTitle: "Compliance Level",
    complianceDescription: "We are committed to the highest digital accessibility standards",
    complianceContent: "Sabq Smart platform is compliant with <strong>Web Content Accessibility Guidelines (WCAG) 2.1</strong> at Level AA. This means the website meets internationally recognized accessibility standards to ensure it can be used by all people, including those with disabilities.",
    
    // Accessibility Features
    featuresTitle: "Accessibility Features",
    featuresDescription: "The platform is designed to be easy to use for everyone",
    
    // Visual Features
    visualTitle: "Visual Access",
    visualFeature1: "Font size adjustment (normal, large, extra large)",
    visualFeature2: "High contrast mode for easier reading",
    visualFeature3: "Responsive design that works on all devices",
    visualFeature4: "Color contrast ratios that meet WCAG AA standards",
    visualFeature5: "Enhanced reading mode with OpenDyslexic font",
    
    // Keyboard Navigation
    keyboardTitle: "Keyboard Navigation",
    keyboardFeature1: "All functionality available via keyboard only",
    keyboardFeature2: "Clear and visible focus indicators",
    keyboardFeature3: "Skip links for quick access to main content",
    
    // Touch Accessibility
    touchTitle: "Touch Access",
    touchFeature1: "Interactive buttons and elements at least 44×44 pixels on mobile devices",
    touchFeature2: "Adequate spacing between elements to prevent accidental taps",
    
    // Screen Reader Support
    screenReaderTitle: "Screen Reader Support",
    screenReaderFeature1: "Full compatibility with NVDA, JAWS, VoiceOver, and TalkBack",
    screenReaderFeature2: "Live announcements (ARIA Live Regions) for dynamic updates",
    screenReaderFeature3: "Comprehensive descriptive labels in Arabic",
    screenReaderFeature4: "Integrated voice assistant with Arabic language support",
    
    // Motion & Animation
    motionTitle: "Motion and Animation",
    motionFeature1: "Reduced motion option for users with motion sensitivity",
    motionFeature2: "No flashing content that could cause seizures",
    
    // Reading Mode
    readingTitle: "Enhanced Reading Mode",
    readingFeature1: "OpenDyslexic font designed specifically for users with dyslexia and reading difficulties",
    readingFeature2: "Enhanced letter and word spacing (0.12em and 0.16em)",
    readingFeature3: "Enhanced line height (1.8) for improved readability",
    readingFeature4: "Line highlighting on hover for easier tracking",
    
    // Testing & Compliance
    testingTitle: "Testing and Compliance",
    testingDescription: "We are committed to continuous platform testing",
    testingIntro: "Sabq Smart platform is regularly tested using:",
    testingMethod1: "Automated testing tools (axe-core, WAVE, Lighthouse)",
    testingMethod2: "Manual testing with various screen readers",
    testingMethod3: "Keyboard navigation testing",
    testingMethod4: "Compatibility testing with assistive devices",
    
    // Contact & Feedback
    contactTitle: "Contact Us",
    contactDescription: "We welcome your feedback and suggestions",
    contactIntro: "We are constantly working to improve accessibility on the Sabq platform. If you encounter any difficulties using the site or have suggestions for improving the access experience, please contact us:",
    emailLabel: "Email:",
    responseTime: "We will respond to your inquiries as soon as possible, typically within 2-3 business days.",
    sendFeedbackButton: "Send Accessibility Feedback",
    
    // Known Issues
    knownIssuesTitle: "Known Issues and Future Improvements",
    knownIssuesDescription: "We are constantly working to improve the access experience",
    knownIssuesIntro: "We are committed to continuously improving the access experience. We are currently working on:",
    knownIssue1: "Expanding voice assistant support to include additional Arabic dialects",
    knownIssue2: "Adding intelligent alt text for images using artificial intelligence",
    knownIssue3: "Improving reading mode for users with learning difficulties",
    
    // Footer
    footerAppliesTo: "This accessibility statement applies to Sabq Smart platform (sabq.org)",
    footerLastReview: "Last Review:",
  }
};

export default function AccessibilityStatement() {
  const [location] = useLocation();
  
  // Determine language from URL path
  const language = location.startsWith('/en') ? 'en' : 'ar';
  const isRTL = language === 'ar';
  const t = translations[language];

  // Format date based on language
  const locale = language === 'ar' ? 'ar-SA' : 'en-US';
  const lastUpdated = new Date('2025-11-18').toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl" dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2" data-testid="text-page-title">
            {t.pageTitle}
          </h1>
          <p className="text-muted-foreground text-lg" data-testid="text-page-subtitle">
            {t.pageSubtitle}
          </p>
          <div className="flex items-center gap-2 mt-4">
            <Calendar className="w-4 h-4" aria-hidden="true" />
            <span className="text-sm text-muted-foreground" aria-label={`${t.lastUpdated} ${lastUpdated}`}>
              {t.lastUpdated} {lastUpdated}
            </span>
          </div>
        </div>

        {/* Compliance Level */}
        <Card className="mb-6" data-testid="card-compliance-level">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" aria-hidden="true" />
                  {t.complianceTitle}
                </CardTitle>
                <CardDescription>
                  {t.complianceDescription}
                </CardDescription>
              </div>
              <Badge variant="default" className="text-lg px-4 py-2" data-testid="badge-wcag-level">
                WCAG 2.1 AA
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: t.complianceContent }} />
          </CardContent>
        </Card>

        {/* Accessibility Features */}
        <Card className="mb-6" data-testid="card-features">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-primary" aria-hidden="true" />
              {t.featuresTitle}
            </CardTitle>
            <CardDescription>
              {t.featuresDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Visual Features */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t.visualTitle}
                </h3>
                <ul className="space-y-2 text-foreground" role="list">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.visualFeature1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.visualFeature2}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.visualFeature3}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.visualFeature4}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.visualFeature5}</span>
                  </li>
                </ul>
              </div>

              {/* Keyboard Navigation */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t.keyboardTitle}
                </h3>
                <ul className="space-y-2 text-foreground" role="list">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.keyboardFeature1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.keyboardFeature2}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.keyboardFeature3}</span>
                  </li>
                </ul>
              </div>

              {/* Touch Accessibility */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Mouse className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t.touchTitle}
                </h3>
                <ul className="space-y-2 text-foreground" role="list">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.touchFeature1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.touchFeature2}</span>
                  </li>
                </ul>
              </div>

              {/* Screen Reader Support */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t.screenReaderTitle}
                </h3>
                <ul className="space-y-2 text-foreground" role="list">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.screenReaderFeature1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.screenReaderFeature2}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.screenReaderFeature3}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.screenReaderFeature4}</span>
                  </li>
                </ul>
              </div>

              {/* Motion & Animation */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t.motionTitle}
                </h3>
                <ul className="space-y-2 text-foreground" role="list">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.motionFeature1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.motionFeature2}</span>
                  </li>
                </ul>
              </div>

              {/* Reading Mode */}
              <div>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" aria-hidden="true" />
                  {t.readingTitle}
                </h3>
                <ul className="space-y-2 text-foreground" role="list">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.readingFeature1}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.readingFeature2}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.readingFeature3}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                    <span>{t.readingFeature4}</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Testing & Compliance */}
        <Card className="mb-6" data-testid="card-testing">
          <CardHeader>
            <CardTitle>{t.testingTitle}</CardTitle>
            <CardDescription>
              {t.testingDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-foreground">
              <p className="leading-relaxed">
                {t.testingIntro}
              </p>
              <ul className={`space-y-2 ${isRTL ? 'mr-6' : 'ml-6'}`} role="list">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                  <span>{t.testingMethod1}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                  <span>{t.testingMethod2}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                  <span>{t.testingMethod3}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-1 text-primary flex-shrink-0" aria-hidden="true" />
                  <span>{t.testingMethod4}</span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Contact & Feedback */}
        <Card data-testid="card-contact">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
              {t.contactTitle}
            </CardTitle>
            <CardDescription>
              {t.contactDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-foreground leading-relaxed">
                {t.contactIntro}
              </p>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-primary" aria-hidden="true" />
                  <span className="font-medium">{t.emailLabel}</span>
                </div>
                <a 
                  href="mailto:info@sabq.org" 
                  className={`text-primary hover:underline block ${isRTL ? 'mr-6' : 'ml-6'}`}
                  data-testid="link-email-contact"
                >
                  info@sabq.org
                </a>
              </div>

              <p className="text-sm text-muted-foreground">
                {t.responseTime}
              </p>

              <Button 
                variant="default" 
                className="w-full sm:w-auto"
                asChild
                data-testid="button-send-feedback"
              >
                <a href="mailto:info@sabq.org">
                  <Mail className={`w-4 h-4 ${isRTL ? 'ml-2' : 'mr-2'}`} aria-hidden="true" />
                  {t.sendFeedbackButton}
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Known Issues */}
        <Card className="mb-6" data-testid="card-known-issues">
          <CardHeader>
            <CardTitle>{t.knownIssuesTitle}</CardTitle>
            <CardDescription>
              {t.knownIssuesDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-foreground leading-relaxed mb-3">
              {t.knownIssuesIntro}
            </p>
            <ul className="space-y-2 text-foreground" role="list">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{t.knownIssue1}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{t.knownIssue2}</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">•</span>
                <span>{t.knownIssue3}</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>
            {t.footerAppliesTo}
          </p>
          <p className="mt-2">
            {t.footerLastReview} {lastUpdated}
          </p>
        </div>
      </div>
    </div>
  );
}
