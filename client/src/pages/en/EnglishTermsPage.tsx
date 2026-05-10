import { motion } from "framer-motion";
import { Shield, FileText, User, AlertTriangle, Scale, RefreshCw, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishFooter } from "@/components/en/EnglishFooter";

export default function EnglishTermsPage() {
  const sections = [
    {
      icon: FileText,
      title: "1. Platform Usage",
      content: [
        "You agree to use the platform for legitimate purposes and in a manner that does not infringe on the rights of others or limit their use of the platform.",
        "Content published on Sabq Smart (text, images, videos) is the intellectual property of the platform and is protected by copyright laws. It may not be copied or republished without prior written permission."
      ]
    },
    {
      icon: Shield,
      title: "2. Smart Content and Services",
      content: [
        "Sabq Smart uses artificial intelligence technologies to analyze content and provide personalized recommendations to enhance your experience.",
        "We strive to provide accurate and reliable content, but we cannot guarantee it is completely error-free. The content provided does not constitute legal or professional advice."
      ]
    },
    {
      icon: User,
      title: "3. User Account",
      content: [
        "Access to some features may require creating a personal account. You are responsible for maintaining the confidentiality of your account information and for all activities that occur through it.",
        "The information provided during registration must be accurate and correct."
      ]
    },
    {
      icon: AlertTriangle,
      title: "4. Disclaimer",
      content: [
        "Sabq Smart is not responsible for any direct or indirect damages that may arise from your use of the platform or reliance on its content.",
        "External links that may appear in our content are not under our control, and we are not responsible for the content of those websites."
      ]
    },
    {
      icon: RefreshCw,
      title: "5. Modification of Terms",
      content: [
        "We reserve the right to modify these terms and conditions at any time. The updated version will be posted on this page, and your continued use of the platform after the modification constitutes acceptance of the new terms."
      ]
    },
    {
      icon: Scale,
      title: "6. Applicable Law",
      content: [
        "These terms and conditions are governed by and interpreted in accordance with the laws and regulations applicable in the Kingdom of Saudi Arabia."
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
                <span className="text-sm font-medium text-blue-500">Legal Terms</span>
              </motion.div>

              <h1 
                className="text-4xl md:text-5xl font-bold mb-6"
                data-testid="en-heading-terms-title"
              >
                Terms and Conditions
              </h1>
              
              <p 
                className="text-lg text-muted-foreground mb-4"
                data-testid="en-text-terms-subtitle"
              >
                For the Sabq Smart Platform
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
              <Card className="bg-gradient-to-br from-blue-500/5 to-purple-500/5 border-blue-500/20" data-testid="en-card-intro">
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <h2 className="text-xl font-bold mb-3" data-testid="en-heading-intro">Introduction</h2>
                      <p className="text-muted-foreground leading-relaxed" data-testid="en-text-intro-content">
                        Welcome to Sabq Smart, the media platform affiliated with Sabq Media Organization. By using our platform, you agree to abide by these terms and conditions. Please read them carefully. Your continued use of the platform constitutes implicit acceptance of these terms.
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
                      <div className="ml-16 space-y-3">
                        {section.content.map((paragraph, pIndex) => (
                          <p 
                            key={pIndex} 
                            className="text-muted-foreground leading-relaxed"
                            data-testid={`en-text-section-${index}-p-${pIndex}`}
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

        <section className="py-12 md:py-16">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-4xl mx-auto text-center"
            >
              <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/20" data-testid="en-card-footer-note">
                <CardContent className="p-8">
                  <p className="text-muted-foreground mb-4" data-testid="en-text-footer-note">
                    If you have any questions about these terms and conditions, please contact us through available support channels.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Thank you for using <span className="font-semibold text-foreground">Sabq Smart</span>
                  </p>
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
