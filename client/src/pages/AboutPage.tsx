import { motion } from "framer-motion";
import { 
  Sparkles, 
  Target, 
  Zap, 
  Shield, 
  TrendingUp, 
  Brain,
  Cpu,
  MessageSquare,
  BarChart3,
  Clock,
  Award,
  Users,
  Rocket
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { useQuery } from "@tanstack/react-query";

export default function AboutPage() {
  // Fetch current user
  const { data: user } = useQuery<{ name?: string | null; email?: string; role?: string; profileImageUrl?: string | null }>({
    queryKey: ["/api/auth/user"],
  });

  const timelineEvents = [
    {
      year: "2007",
      title: "تأسيس صحيفة سبق",
      description: "انطلاقة رحلة الإعلام الرقمي السعودي على يد الأستاذ علي الحازمي",
      icon: Rocket,
      color: "from-blue-500 to-cyan-500"
    },
    {
      year: "2012",
      title: "مليون متابع",
      description: "تحقيق إنجاز تاريخي بالوصول للمليون متابع الأول",
      icon: Users,
      color: "from-purple-500 to-pink-500"
    },
    {
      year: "2018",
      title: "جوائز التميز",
      description: "حصد جوائز محلية ودولية في مجال الإعلام الرقمي",
      icon: Award,
      color: "from-amber-500 to-orange-500"
    },
    {
      year: "2024",
      title: "سبق الذكية",
      description: "نقلة نوعية نحو مستقبل الإعلام بالذكاء الاصطناعي",
      icon: Brain,
      color: "from-emerald-500 to-teal-500"
    },
    {
      year: "المستقبل",
      title: "التوسع والابتكار",
      description: "تطبيقات جديدة وتوسع في المحتوى المدعوم بالذكاء الاصطناعي",
      icon: Sparkles,
      color: "from-violet-500 to-purple-500"
    }
  ];

  const coreValues = [
    {
      title: "المصداقية أولاً",
      description: "التزامنا بالحقيقة والدقة في كل ما ننشر",
      icon: Shield,
      gradient: "from-blue-500/10 to-cyan-500/10",
      iconColor: "text-blue-500"
    },
    {
      title: "الابتكار التقني",
      description: "شغفنا بتسخير التكنولوجيا لخدمة المحتوى",
      icon: Cpu,
      gradient: "from-purple-500/10 to-pink-500/10",
      iconColor: "text-purple-500"
    },
    {
      title: "القارئ في الصميم",
      description: "تصميم تجربة تتمحور حول احتياجات المستخدم",
      icon: Target,
      gradient: "from-emerald-500/10 to-teal-500/10",
      iconColor: "text-emerald-500"
    },
    {
      title: "السرعة والعمق",
      description: "الموازنة بين سرعة الخبر وعمق التحليل",
      icon: Zap,
      gradient: "from-amber-500/10 to-orange-500/10",
      iconColor: "text-amber-500"
    }
  ];

  const aiFeatures = [
    {
      title: "التوصيات الذكية",
      description: "نظام ذكي يتعلم من تفاعلاتك ليقدم محتوى مخصص لاهتماماتك",
      icon: Brain
    },
    {
      title: "الملخصات الآلية",
      description: "تقنيات GPT-5.1 لتوليد ملخصات دقيقة وعناوين جذابة",
      icon: MessageSquare
    },
    {
      title: "تحليل المصداقية",
      description: "تقييم ذكي لمصداقية المحتوى بناءً على معايير صحفية متقدمة",
      icon: BarChart3
    },
    {
      title: "لحظة بلحظة",
      description: "متابعة حية للأحداث مع تحليلات AI فورية",
      icon: Clock
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
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/10 py-20 md:py-32">
        <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,transparent,black)]"></div>
        
        <div className="container mx-auto px-4 relative z-10">

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6"
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">إعلام المستقبل</span>
            </motion.div>

            <h1 
              className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-l from-primary via-foreground to-primary bg-clip-text text-transparent"
              data-testid="heading-hero-title"
            >
              سبق الذكية
            </h1>
            
            <p 
              className="text-xl md:text-2xl text-muted-foreground mb-8"
              data-testid="text-hero-subtitle"
            >
              إرث من المصداقية.. برؤية مستقبلية
            </p>

            <div className="flex flex-wrap gap-4 justify-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link href="/register">
                  <Button size="lg" className="gap-2" data-testid="button-join">
                    <TrendingUp className="w-4 h-4" />
                    انضم إلينا الآن
                  </Button>
                </Link>
              </motion.div>
              
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link href="/news">
                  <Button variant="outline" size="lg" className="gap-2" data-testid="button-explore">
                    استكشف الأخبار
                  </Button>
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Vision & Mission */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-6"
          >
            <motion.div variants={itemVariants}>
              <Card className="h-full hover-elevate" data-testid="card-vision">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
                    <Target className="w-6 h-6 text-blue-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4" data-testid="heading-vision">رؤيتنا</h3>
                  <p className="text-muted-foreground leading-relaxed" data-testid="text-vision-content">
                    من قلب "سبق"، المؤسسة الإعلامية الرائدة منذ 2007، تنطلق "سبق الذكية" لتكون الجيل الجديد للصحافة الرقمية في المملكة. نحن نجمع بين إرثنا الراسخ في تقديم المحتوى الموثوق، وأحدث ما توصل إليه الذكاء الاصطناعي. هدفنا ليس فقط مواكبة التحول الرقمي، بل قيادته عبر الانتقال من النشر الإخباري التقليدي إلى تجربة إعلامية ذكية وتفاعلية.
                  </p>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
              <Card className="h-full hover-elevate" data-testid="card-mission">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4">
                    <Zap className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-bold mb-4" data-testid="heading-mission">رسالتنا</h3>
                  <p className="text-muted-foreground leading-relaxed" data-testid="text-mission-content">
                    نلتزم بتقديم محتوى إخباري دقيق وسريع، معزز بتقنيات الذكاء الاصطناعي التي تضمن وصول المعلومة الموثوقة بأسلوب مبتكر. رسالتنا هي الحفاظ على قيم الصحافة الأصيلة، وفي الوقت نفسه، تسخير قوة التكنولوجيا لتقديم توصيات مخصصة تجعل كل قارئ يعيش تجربة فريدة ومصممة خصيصًا له.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="heading-timeline">رحلة النجاح</h2>
            <p className="text-muted-foreground text-lg" data-testid="text-timeline-subtitle">من التأسيس إلى الريادة في الإعلام الذكي</p>
          </motion.div>

          <div className="max-w-5xl mx-auto relative">
            {/* Timeline Line */}
            <div className="absolute right-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-primary to-primary/50 hidden md:block"></div>

            <div className="space-y-12">
              {timelineEvents.map((event, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: index % 2 === 0 ? 50 : -50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`flex items-center gap-8 ${
                    index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                  } flex-col`}
                >
                  {/* Content */}
                  <div className={`flex-1 ${index % 2 === 0 ? 'md:text-left' : 'md:text-right'} text-center`}>
                    <Card className="hover-elevate" data-testid={`card-timeline-${event.year}`}>
                      <CardContent className="p-6">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${event.color} flex items-center justify-center flex-shrink-0`}>
                            <event.icon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-primary" data-testid={`text-year-${event.year}`}>{event.year}</div>
                            <h4 className="font-bold text-lg" data-testid={`heading-event-${index}`}>{event.title}</h4>
                          </div>
                        </div>
                        <p className="text-muted-foreground" data-testid={`text-event-description-${index}`}>{event.description}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Timeline Dot */}
                  <div className="relative flex-shrink-0 hidden md:block">
                    <div className="w-4 h-4 rounded-full bg-primary border-4 border-background shadow-lg"></div>
                  </div>

                  {/* Spacer */}
                  <div className="flex-1 hidden md:block"></div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Core Values */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="heading-values">قيمنا الأساسية</h2>
            <p className="text-muted-foreground text-lg" data-testid="text-values-subtitle">المبادئ التي تحكم عملنا وتوجه مسيرتنا</p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {coreValues.map((value, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="h-full hover-elevate text-center" data-testid={`card-value-${index}`}>
                  <CardContent className="p-8">
                    <div className={`w-16 h-16 mx-auto rounded-xl bg-gradient-to-br ${value.gradient} flex items-center justify-center mb-4`}>
                      <value.icon className={`w-8 h-8 ${value.iconColor}`} />
                    </div>
                    <h4 className="font-bold text-lg mb-3" data-testid={`heading-value-${index}`}>{value.title}</h4>
                    <p className="text-muted-foreground text-sm leading-relaxed" data-testid={`text-value-description-${index}`}>
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* AI Features */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Powered by AI</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="heading-ai-features">قوة الذكاء الاصطناعي</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto" data-testid="text-ai-subtitle">
              تقنيات متقدمة تعمل خلف الكواليس لتقديم تجربة إعلامية ذكية ومخصصة
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto"
          >
            {aiFeatures.map((feature, index) => (
              <motion.div key={index} variants={itemVariants}>
                <Card className="h-full hover-elevate active-elevate-2" data-testid={`card-ai-feature-${index}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                        <feature.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-lg mb-2" data-testid={`heading-ai-feature-${index}`}>{feature.title}</h4>
                        <p className="text-muted-foreground text-sm leading-relaxed" data-testid={`text-ai-feature-description-${index}`}>
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Team & Leadership */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6" data-testid="heading-team">فريق من المبدعين</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8" data-testid="text-team-intro">
              يقف خلف "سبق الذكية" فريق سعودي شغوف، يضم نخبة من الصحفيين والمطورين بقيادة رائد الإعلام الأستاذ <span className="font-semibold text-foreground">علي الحازمي</span>. نحن لسنا مجرد فريق عمل، بل عائلة من المبتكرين الذين يوحدهم هدف واحد: إهداء المستقبل للإعلام العربي.
            </p>
            <p className="text-muted-foreground leading-relaxed" data-testid="text-team-description">
              في غرفة أخبارنا، يعمل الصحفيون والمطورون معًا لتقديم محتوى يتجاوز التوقعات. نحن نؤمن بأن الجمع بين الخبرة البشرية والقدرات التقنية المتقدمة هو مفتاح النجاح في عصر المعلومات.
            </p>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gradient-to-br from-primary to-primary/80">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center text-primary-foreground"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6" data-testid="heading-cta">
              انضم إلى رحلة المستقبل
            </h2>
            <p className="text-lg mb-8 opacity-90" data-testid="text-cta-description">
              "سبق الذكية" ليست مجرد منصة، بل هي شريكك المعرفي اليومي. إنها تجربة إعلامية حية تتطور معك، وتتعلم منك، وتفهمك. استعد لتجربة إخبارية تتحدث لغتك وتنمو مع اهتماماتك.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link href="/register">
                  <Button 
                    size="lg" 
                    variant="secondary"
                    className="gap-2"
                    data-testid="button-cta-register"
                  >
                    <Sparkles className="w-4 h-4" />
                    ابدأ الآن مجاناً
                  </Button>
                </Link>
              </motion.div>
              
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link href="/daily-brief">
                  <Button 
                    size="lg" 
                    variant="outline"
                    className="gap-2 bg-white/10 border-white/20 text-white"
                    data-testid="button-cta-brief"
                  >
                    <Brain className="w-4 h-4" />
                    جرب الملخص اليومي
                  </Button>
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
