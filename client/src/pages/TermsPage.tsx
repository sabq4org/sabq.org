import { motion } from "framer-motion";
import { Shield, FileText, User, AlertTriangle, Scale, RefreshCw, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { useQuery } from "@tanstack/react-query";

export default function TermsPage() {
  // Fetch current user
  const { data: user } = useQuery<{ name?: string | null; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
  });

  const sections = [
    {
      icon: FileText,
      title: "1. استخدام المنصة",
      content: [
        "تلتزم باستخدام المنصة لأغراض مشروعة وبما لا ينتهك حقوق الآخرين أو يحد من استخدامهم للمنصة.",
        "المحتوى المنشور على \"سبق الذكية\" (نصوص، صور، فيديوهات) هو ملك فكري للمنصة ومحمي بموجب قوانين حقوق النشر، ولا يجوز نسخه أو إعادة نشره دون إذن خطي مسبق."
      ]
    },
    {
      icon: Shield,
      title: "2. المحتوى والخدمات الذكية",
      content: [
        "تستخدم \"سبق الذكية\" تقنيات الذكاء الاصطناعي لتحليل المحتوى وتقديم توصيات مخصصة لتحسين تجربتك.",
        "نحن نسعى لتقديم محتوى دقيق وموثوق، لكننا لا نضمن خلوه من الأخطاء بشكل مطلق. المحتوى المقدم لا يُعد استشارة قانونية أو مهنية."
      ]
    },
    {
      icon: User,
      title: "3. حساب المستخدم",
      content: [
        "قد يتطلب الوصول إلى بعض الميزات إنشاء حساب شخصي. أنت مسؤول عن الحفاظ على سرية معلومات حسابك وعن جميع الأنشطة التي تحدث من خلاله.",
        "يجب أن تكون البيانات المقدمة عند التسجيل صحيحة ودقيقة."
      ]
    },
    {
      icon: AlertTriangle,
      title: "4. إخلاء المسؤولية",
      content: [
        "\"سبق الذكية\" لا تتحمل مسؤولية أي أضرار مباشرة أو غير مباشرة قد تنشأ عن استخدامك للمنصة أو اعتمادك على محتواها.",
        "الروابط الخارجية التي قد تظهر في محتوانا لا تخضع لسيطرتنا، ولسنا مسؤولين عن محتوى تلك المواقع."
      ]
    },
    {
      icon: RefreshCw,
      title: "5. تعديل الشروط",
      content: [
        "نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم نشر النسخة المحدثة على هذه الصفحة، ويعتبر استمرارك في استخدام المنصة بعد التعديل موافقة على الشروط الجديدة."
      ]
    },
    {
      icon: Scale,
      title: "6. القانون الواجب التطبيق",
      content: [
        "تخضع هذه الشروط والأحكام وتُفسر وفقًا للأنظمة والقوانين المعمول بها في المملكة العربية السعودية."
      ]
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5
      }
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <Header user={user} />

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 via-background to-purple-500/10 py-16 md:py-24 border-b">
        <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6"
            >
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium text-blue-500">الشروط القانونية</span>
            </motion.div>

            <h1 
              className="text-4xl md:text-5xl font-bold mb-6"
              data-testid="heading-terms-title"
            >
              الشروط والأحكام
            </h1>
            
            <p 
              className="text-lg text-muted-foreground mb-4"
              data-testid="text-terms-subtitle"
            >
              لمنصة "سبق الذكية"
            </p>

            <p className="text-sm text-muted-foreground" data-testid="text-last-updated">
              آخر تحديث: <span className="font-medium">أكتوبر 2025</span>
            </p>
          </motion.div>
        </div>
      </section>

      {/* Introduction */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <Card className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border-blue-500/20" data-testid="card-intro">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <Globe className="w-6 h-6 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-3" data-testid="heading-intro">مقدمة</h2>
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-intro-content">
                      مرحبًا بكم في "سبق الذكية"، المنصة الإعلامية التابعة لمؤسسة سبق للإعلام. باستخدامك لمنصتنا، فإنك توافق على الالتزام بهذه الشروط والأحكام. نرجو قراءتها بعناية. إن استمرارك في استخدام المنصة يُعد قبولاً ضمنيًا بهذه الشروط.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Terms Sections */}
      <section className="py-12 md:py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="max-w-4xl mx-auto space-y-6"
          >
            {sections.map((section, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="hover-elevate" data-testid={`card-section-${index}`}>
                  <CardContent className="p-6 md:p-8">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                        <section.icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="text-xl font-bold flex-1 pt-2" data-testid={`heading-section-${index}`}>
                        {section.title}
                      </h3>
                    </div>
                    <div className="mr-16 space-y-3">
                      {section.content.map((paragraph, pIndex) => (
                        <p 
                          key={pIndex} 
                          className="text-muted-foreground leading-relaxed"
                          data-testid={`text-section-${index}-p-${pIndex}`}
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Footer Note */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto text-center"
          >
            <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20" data-testid="card-footer-note">
              <CardContent className="p-8">
                <p className="text-muted-foreground mb-4" data-testid="text-footer-note">
                  إذا كان لديك أي أسئلة حول هذه الشروط والأحكام، يُرجى التواصل معنا عبر قنوات الدعم المتاحة.
                </p>
                <p className="text-sm text-muted-foreground">
                  شكراً لاستخدامك <span className="font-semibold text-foreground">سبق الذكية</span>
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
