import { motion } from "framer-motion";
import { Shield, Database, Lock, Cookie, UserCheck, RefreshCw, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function PrivacyPage() {
  // Fetch current user
  const { data: user } = useQuery<{ name?: string | null; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
  });

  const sections = [
    {
      icon: Database,
      title: "1. المعلومات التي نجمعها",
      subsections: [
        {
          subtitle: "معلومات تقدمها أنت:",
          content: "مثل الاسم والبريد الإلكتروني عند إنشاء حساب أو الاشتراك في النشرة البريدية."
        },
        {
          subtitle: "معلومات نجمعها تلقائيًا (بيانات الاستخدام):",
          content: null,
          points: [
            {
              label: "بيانات التفاعل:",
              text: "المقالات التي تقرأها، المواضيع التي تفضلها، والوقت الذي تقضيه على المنصة. تُستخدم هذه البيانات لتشغيل نظام التوصيات الذكي وتقديم محتوى مخصص لك."
            },
            {
              label: "بيانات تقنية:",
              text: "نوع الجهاز، نظام التشغيل، عنوان IP، ونوع المتصفح. تُستخدم هذه البيانات لتحسين أداء المنصة وضمان أمانها."
            }
          ]
        }
      ]
    },
    {
      icon: UserCheck,
      title: "2. كيف نستخدم معلوماتك؟",
      points: [
        {
          label: "لتخصيص تجربتك:",
          text: "نستخدم بيانات التفاعل لتزويدك بتوصيات إخبارية ومحتوى يتناسب مع اهتماماتك."
        },
        {
          label: "لتحسين خدماتنا:",
          text: "نحلل بيانات الاستخدام لفهم كيفية تفاعل القراء مع المنصة وتطوير ميزات جديدة."
        },
        {
          label: "للتواصل معك:",
          text: "لإرسال إشعارات هامة حول حسابك أو تحديثات المنصة أو نشراتنا الإخبارية (بعد موافقتك)."
        }
      ]
    },
    {
      icon: Lock,
      title: "3. كيف نحمي معلوماتك؟",
      content: [
        "نستخدم تدابير أمنية تقنية وتنظيمية متقدمة (مثل التشفير وبروتوكولات الأمان) لحماية بياناتك من الوصول غير المصرح به.",
        "نحن لا نبيع أو نؤجر أو نشارك معلوماتك الشخصية مع أطراف ثالثة لأغراض تسويقية دون موافقتك الصريحة."
      ]
    },
    {
      icon: Cookie,
      title: "4. ملفات تعريف الارتباط (Cookies)",
      content: [
        "نستخدم ملفات تعريف الارتباط لتخزين تفضيلاتك وتحسين تجربة التصفح. يمكنك التحكم في استخدام هذه الملفات من خلال إعدادات المتصفح الخاص بك."
      ]
    },
    {
      icon: Shield,
      title: "5. حقوقك",
      content: [
        "لك الحق في الوصول إلى معلوماتك الشخصية التي نحتفظ بها وتصحيحها أو طلب حذفها.",
        "يمكنك إلغاء الاشتراك في أي وقت من رسائلنا البريدية."
      ]
    },
    {
      icon: RefreshCw,
      title: "6. التغييرات على سياسة الخصوصية",
      content: [
        "قد نقوم بتحديث هذه السياسة من وقت لآخر. سنقوم بإعلامك بأي تغييرات جوهرية عبر نشر السياسة الجديدة على هذه الصفحة."
      ]
    },
    {
      icon: Mail,
      title: "7. الاتصال بنا",
      content: [
        "إذا كان لديك أي أسئلة حول سياسة الخصوصية، يرجى التواصل معنا عبر: privacy@sabq.sa أو من خلال صفحة اتصل بنا."
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
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-background to-blue-500/10 py-16 md:py-24 border-b">
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6"
            >
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-500">حماية البيانات</span>
            </motion.div>

            <h1 
              className="text-4xl md:text-5xl font-bold mb-6"
              data-testid="heading-privacy-title"
            >
              سياسة الخصوصية
            </h1>
            
            <p 
              className="text-lg text-muted-foreground mb-4"
              data-testid="text-privacy-subtitle"
            >
              في "سبق الذكية"
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
            <Card className="bg-gradient-to-br from-emerald-500/5 to-blue-500/5 border-emerald-500/20" data-testid="card-intro">
              <CardContent className="p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-3" data-testid="heading-intro">مقدمة</h2>
                    <p className="text-muted-foreground leading-relaxed" data-testid="text-intro-content">
                      خصوصيتك تقع في صميم اهتماماتنا في "سبق الذكية". تشرح هذه السياسة كيفية جمعنا واستخدامنا وحمايتنا لمعلوماتك الشخصية عند استخدامك لمنصتنا. نحن ملتزمون بحماية بياناتك وفقًا لأفضل الممارسات والأنظمة المحلية والدولية.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Privacy Sections */}
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
                    
                    <div className="mr-16 space-y-4">
                      {/* Simple content paragraphs */}
                      {section.content?.map((paragraph, pIndex) => (
                        <p 
                          key={pIndex} 
                          className="text-muted-foreground leading-relaxed"
                          data-testid={`text-section-${index}-p-${pIndex}`}
                        >
                          {paragraph}
                        </p>
                      ))}

                      {/* Points with labels */}
                      {section.points?.map((point, pIndex) => (
                        <div key={pIndex} className="space-y-2" data-testid={`point-section-${index}-${pIndex}`}>
                          <p className="text-muted-foreground leading-relaxed">
                            <span className="font-semibold text-foreground">{point.label}</span> {point.text}
                          </p>
                        </div>
                      ))}

                      {/* Subsections */}
                      {section.subsections?.map((subsection, sIndex) => (
                        <div key={sIndex} className="space-y-3" data-testid={`subsection-${index}-${sIndex}`}>
                          <p className="font-semibold text-foreground">{subsection.subtitle}</p>
                          {subsection.content && (
                            <p className="text-muted-foreground leading-relaxed">{subsection.content}</p>
                          )}
                          {subsection.points?.map((point, pIndex) => (
                            <p key={pIndex} className="text-muted-foreground leading-relaxed mr-4">
                              <span className="font-semibold text-foreground">{point.label}</span> {point.text}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto"
          >
            <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20" data-testid="card-cta">
              <CardContent className="p-8 text-center">
                <Shield className="w-12 h-12 mx-auto mb-4 text-primary" />
                <h3 className="text-xl font-bold mb-3" data-testid="heading-cta">
                  نحن نحترم خصوصيتك
                </h3>
                <p className="text-muted-foreground mb-6" data-testid="text-cta-description">
                  إذا كان لديك أي استفسارات حول كيفية معالجة بياناتك، لا تتردد في التواصل معنا.
                </p>
                <div className="flex flex-wrap gap-4 justify-center">
                  <Link href="/notification-settings">
                    <Button variant="default" className="gap-2" data-testid="button-manage-preferences">
                      <Shield className="w-4 h-4" />
                      إدارة تفضيلاتك
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button variant="outline" className="gap-2" data-testid="button-contact-privacy">
                      <Mail className="w-4 h-4" />
                      تواصل معنا
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
