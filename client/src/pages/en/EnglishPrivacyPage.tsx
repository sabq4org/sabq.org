import { motion } from "framer-motion";
import { Shield, Database, Lock, Cookie, UserCheck, RefreshCw, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishFooter } from "@/components/en/EnglishFooter";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function EnglishPrivacyPage() {
  const sections = [
    {
      icon: Database,
      title: "1. Information We Collect",
      subsections: [
        {
          subtitle: "Information You Provide:",
          content: "Such as your name and email address when creating an account or subscribing to our newsletter."
        },
        {
          subtitle: "Information We Collect Automatically (Usage Data):",
          content: null,
          points: [
            {
              label: "Interaction Data:",
              text: "The articles you read, topics you prefer, and time spent on the platform. This data is used to power our smart recommendation system and deliver personalized content to you."
            },
            {
              label: "Technical Data:",
              text: "Device type, operating system, IP address, and browser type. This data is used to improve platform performance and ensure its security."
            }
          ]
        }
      ]
    },
    {
      icon: UserCheck,
      title: "2. How We Use Your Information",
      points: [
        {
          label: "To Personalize Your Experience:",
          text: "We use interaction data to provide you with news recommendations and content tailored to your interests."
        },
        {
          label: "To Improve Our Services:",
          text: "We analyze usage data to understand how readers interact with the platform and develop new features."
        },
        {
          label: "To Communicate With You:",
          text: "To send important notifications about your account, platform updates, or our newsletters (with your consent)."
        }
      ]
    },
    {
      icon: Lock,
      title: "3. How We Protect Your Information",
      content: [
        "We use advanced technical and organizational security measures (such as encryption and security protocols) to protect your data from unauthorized access.",
        "We do not sell, rent, or share your personal information with third parties for marketing purposes without your explicit consent."
      ]
    },
    {
      icon: Cookie,
      title: "4. Cookies",
      content: [
        "We use cookies to store your preferences and improve your browsing experience. You can control the use of cookies through your browser settings."
      ]
    },
    {
      icon: Shield,
      title: "5. Your Rights",
      content: [
        "You have the right to access, correct, or request deletion of your personal information that we hold.",
        "You can unsubscribe from our emails at any time."
      ]
    },
    {
      icon: RefreshCw,
      title: "6. Changes to Privacy Policy",
      content: [
        "We may update this policy from time to time. We will notify you of any significant changes by posting the new policy on this page."
      ]
    },
    {
      icon: Mail,
      title: "7. Contact Us",
      content: [
        "If you have any questions about this privacy policy, please contact us at: privacy@sabq.org or through our Contact Us page."
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
    <EnglishLayout>
      <div className="min-h-screen bg-background" dir="ltr">
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
                <span className="text-sm font-medium text-emerald-500">Data Protection</span>
              </motion.div>

              <h1 
                className="text-4xl md:text-5xl font-bold mb-6"
                data-testid="en-heading-privacy-title"
              >
                Privacy Policy
              </h1>
              
              <p 
                className="text-lg text-muted-foreground mb-4"
                data-testid="en-text-privacy-subtitle"
              >
                At Sabq Smart
              </p>

              <p className="text-sm text-muted-foreground" data-testid="en-text-last-updated">
                Last Updated: <span className="font-medium">October 2025</span>
              </p>
            </motion.div>
          </div>
        </section>

        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto"
            >
              <Card className="bg-gradient-to-br from-emerald-500/5 to-blue-500/5 border-emerald-500/20" data-testid="en-card-intro">
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Lock className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold mb-3" data-testid="en-heading-intro">Introduction</h2>
                      <p className="text-muted-foreground leading-relaxed" data-testid="en-text-intro-content">
                        Your privacy is at the heart of our priorities at Sabq Smart. This policy explains how we collect, use, and protect your personal information when you use our platform. We are committed to protecting your data in accordance with best practices and local and international regulations.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

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
                  <Card className="hover-elevate" data-testid={`en-card-section-${index}`}>
                    <CardContent className="p-6 md:p-8">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                          <section.icon className="w-6 h-6 text-primary" />
                        </div>
                        <h3 className="text-xl font-bold flex-1 pt-2" data-testid={`en-heading-section-${index}`}>
                          {section.title}
                        </h3>
                      </div>
                      
                      <div className="ml-16 space-y-4">
                        {section.content?.map((paragraph, pIndex) => (
                          <p 
                            key={pIndex} 
                            className="text-muted-foreground leading-relaxed"
                            data-testid={`en-text-section-${index}-p-${pIndex}`}
                          >
                            {paragraph}
                          </p>
                        ))}

                        {section.points?.map((point, pIndex) => (
                          <div key={pIndex} className="space-y-2" data-testid={`en-point-section-${index}-${pIndex}`}>
                            <p className="text-muted-foreground leading-relaxed">
                              <span className="font-semibold text-foreground">{point.label}</span> {point.text}
                            </p>
                          </div>
                        ))}

                        {section.subsections?.map((subsection, sIndex) => (
                          <div key={sIndex} className="space-y-3" data-testid={`en-subsection-${index}-${sIndex}`}>
                            <p className="font-semibold text-foreground">{subsection.subtitle}</p>
                            {subsection.content && (
                              <p className="text-muted-foreground leading-relaxed">{subsection.content}</p>
                            )}
                            {subsection.points?.map((point, pIndex) => (
                              <p key={pIndex} className="text-muted-foreground leading-relaxed ml-4">
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

        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto"
            >
              <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20" data-testid="en-card-cta">
                <CardContent className="p-8 text-center">
                  <Shield className="w-12 h-12 mx-auto mb-4 text-primary" />
                  <h3 className="text-xl font-bold mb-3" data-testid="en-heading-cta">
                    We Respect Your Privacy
                  </h3>
                  <p className="text-muted-foreground mb-6" data-testid="en-text-cta-description">
                    If you have any questions about how we process your data, please don't hesitate to contact us.
                  </p>
                  <div className="flex flex-wrap gap-4 justify-center">
                    <Link href="/en/notification-settings">
                      <Button variant="default" className="gap-2" data-testid="en-button-manage-preferences">
                        <Shield className="w-4 h-4" />
                        Manage Your Preferences
                      </Button>
                    </Link>
                    <Link href="/en/contact">
                      <Button variant="outline" className="gap-2" data-testid="en-button-contact-privacy">
                        <Mail className="w-4 h-4" />
                        Contact Us
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        <EnglishFooter />
      </div>
    </EnglishLayout>
  );
}
