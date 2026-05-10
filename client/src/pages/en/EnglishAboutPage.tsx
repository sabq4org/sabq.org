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
import { EnglishLayout } from "@/components/en/EnglishLayout";
import { EnglishFooter } from "@/components/en/EnglishFooter";

export default function EnglishAboutPage() {
  const timelineEvents = [
    {
      year: "2007",
      title: "Sabq Newspaper Founded",
      description: "The beginning of Saudi digital media journey led by Mr. Ali Al-Hazmi",
      icon: Rocket,
      color: "from-blue-500 to-cyan-500"
    },
    {
      year: "2012",
      title: "One Million Followers",
      description: "A historic achievement reaching the first million followers",
      icon: Users,
      color: "from-purple-500 to-pink-500"
    },
    {
      year: "2018",
      title: "Excellence Awards",
      description: "Winning local and international awards in digital media",
      icon: Award,
      color: "from-amber-500 to-orange-500"
    },
    {
      year: "2024",
      title: "Sabq Smart",
      description: "A quantum leap towards the future of media with artificial intelligence",
      icon: Brain,
      color: "from-emerald-500 to-teal-500"
    },
    {
      year: "Future",
      title: "Expansion and Innovation",
      description: "New applications and expansion in AI-powered content",
      icon: Sparkles,
      color: "from-violet-500 to-purple-500"
    }
  ];

  const coreValues = [
    {
      title: "Credibility First",
      description: "Our commitment to truth and accuracy in everything we publish",
      icon: Shield,
      gradient: "from-blue-500/10 to-cyan-500/10",
      iconColor: "text-blue-500"
    },
    {
      title: "Technical Innovation",
      description: "Our passion for harnessing technology to serve content",
      icon: Cpu,
      gradient: "from-purple-500/10 to-pink-500/10",
      iconColor: "text-purple-500"
    },
    {
      title: "Reader-Centric",
      description: "Designing an experience centered around user needs",
      icon: Target,
      gradient: "from-emerald-500/10 to-teal-500/10",
      iconColor: "text-emerald-500"
    },
    {
      title: "Speed and Depth",
      description: "Balancing breaking news speed with analytical depth",
      icon: Zap,
      gradient: "from-amber-500/10 to-orange-500/10",
      iconColor: "text-amber-500"
    }
  ];

  const aiFeatures = [
    {
      title: "Smart Recommendations",
      description: "An intelligent system that learns from your interactions to deliver personalized content tailored to your interests",
      icon: Brain
    },
    {
      title: "Automated Summaries",
      description: "GPT-5.1 technologies for generating accurate summaries and engaging headlines",
      icon: MessageSquare
    },
    {
      title: "Credibility Analysis",
      description: "Smart evaluation of content credibility based on advanced journalistic standards",
      icon: BarChart3
    },
    {
      title: "Moment by Moment",
      description: "Live event coverage with instant AI analytics",
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
    <EnglishLayout>
      <div className="min-h-screen bg-background" dir="ltr">
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
                <span className="text-sm font-medium text-primary">The Future of Media</span>
              </motion.div>

              <h1 
                className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-foreground to-primary bg-clip-text text-transparent"
                data-testid="en-heading-hero-title"
              >
                Sabq Smart
              </h1>
              
              <p 
                className="text-xl md:text-2xl text-muted-foreground mb-8"
                data-testid="en-text-hero-subtitle"
              >
                A Legacy of Credibility... With a Future Vision
              </p>

              <div className="flex flex-wrap gap-4 justify-center">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link href="/en/register">
                    <Button size="lg" className="gap-2" data-testid="en-button-join">
                      <TrendingUp className="w-4 h-4" />
                      Join Us Now
                    </Button>
                  </Link>
                </motion.div>
                
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link href="/en/news">
                    <Button variant="outline" size="lg" className="gap-2" data-testid="en-button-explore">
                      Explore News
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

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
                <Card className="h-full hover-elevate" data-testid="en-card-vision">
                  <CardContent className="p-8">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mb-4">
                      <Target className="w-6 h-6 text-blue-500" />
                    </div>
                    <h3 className="text-2xl font-bold mb-4" data-testid="en-heading-vision">Our Vision</h3>
                    <p className="text-muted-foreground leading-relaxed" data-testid="en-text-vision-content">
                      From the heart of Sabq, the leading media organization since 2007, Sabq Smart emerges as the new generation of digital journalism in the Kingdom. We combine our established legacy of delivering trusted content with the latest advancements in artificial intelligence. Our goal is not just to keep pace with digital transformation, but to lead it by transitioning from traditional news publishing to a smart and interactive media experience.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={itemVariants}>
                <Card className="h-full hover-elevate" data-testid="en-card-mission">
                  <CardContent className="p-8">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center mb-4">
                      <Zap className="w-6 h-6 text-emerald-500" />
                    </div>
                    <h3 className="text-2xl font-bold mb-4" data-testid="en-heading-mission">Our Mission</h3>
                    <p className="text-muted-foreground leading-relaxed" data-testid="en-text-mission-content">
                      We are committed to delivering accurate and fast news content, enhanced by artificial intelligence technologies that ensure reliable information reaches you in an innovative way. Our mission is to preserve the values of authentic journalism while harnessing the power of technology to provide personalized recommendations that make every reader experience unique and tailored specifically to them.
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="en-heading-timeline">Journey of Success</h2>
              <p className="text-muted-foreground text-lg" data-testid="en-text-timeline-subtitle">From founding to leadership in smart media</p>
            </motion.div>

            <div className="max-w-5xl mx-auto relative">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-primary to-primary/50 hidden md:block"></div>

              <div className="space-y-12">
                {timelineEvents.map((event, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: index % 2 === 0 ? -50 : 50 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className={`flex items-center gap-8 ${
                      index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                    } flex-col`}
                  >
                    <div className={`flex-1 ${index % 2 === 0 ? 'md:text-right' : 'md:text-left'} text-center`}>
                      <Card className="hover-elevate" data-testid={`en-card-timeline-${event.year}`}>
                        <CardContent className="p-6">
                          <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${event.color} flex items-center justify-center flex-shrink-0`}>
                              <event.icon className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <div className="text-2xl font-bold text-primary" data-testid={`en-text-year-${event.year}`}>{event.year}</div>
                              <h4 className="font-bold text-lg" data-testid={`en-heading-event-${index}`}>{event.title}</h4>
                            </div>
                          </div>
                          <p className="text-muted-foreground" data-testid={`en-text-event-description-${index}`}>{event.description}</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="relative flex-shrink-0 hidden md:block">
                      <div className="w-4 h-4 rounded-full bg-primary border-4 border-background shadow-lg"></div>
                    </div>

                    <div className="flex-1 hidden md:block"></div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="en-heading-values">Our Core Values</h2>
              <p className="text-muted-foreground text-lg" data-testid="en-text-values-subtitle">The principles that govern our work and guide our journey</p>
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
                  <Card className="h-full hover-elevate text-center" data-testid={`en-card-value-${index}`}>
                    <CardContent className="p-8">
                      <div className={`w-16 h-16 mx-auto rounded-xl bg-gradient-to-br ${value.gradient} flex items-center justify-center mb-4`}>
                        <value.icon className={`w-8 h-8 ${value.iconColor}`} />
                      </div>
                      <h4 className="font-bold text-lg mb-3" data-testid={`en-heading-value-${index}`}>{value.title}</h4>
                      <p className="text-muted-foreground text-sm leading-relaxed" data-testid={`en-text-value-description-${index}`}>
                        {value.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

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
              <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="en-heading-ai-features">The Power of Artificial Intelligence</h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto" data-testid="en-text-ai-subtitle">
                Advanced technologies working behind the scenes to deliver a smart and personalized media experience
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
                  <Card className="h-full hover-elevate active-elevate-2" data-testid={`en-card-ai-feature-${index}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                          <feature.icon className="w-6 h-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-lg mb-2" data-testid={`en-heading-ai-feature-${index}`}>{feature.title}</h4>
                          <p className="text-muted-foreground text-sm leading-relaxed" data-testid={`en-text-ai-feature-description-${index}`}>
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

        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto text-center"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6" data-testid="en-heading-team">A Team of Innovators</h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8" data-testid="en-text-team-intro">
                Behind Sabq Smart stands a passionate Saudi team, comprising elite journalists and developers led by media pioneer <span className="font-semibold text-foreground">Mr. Ali Al-Hazmi</span>. We are not just a team, but a family of innovators united by one goal: gifting the future to Arab media.
              </p>
              <p className="text-muted-foreground leading-relaxed" data-testid="en-text-team-description">
                In our newsroom, journalists and developers work together to deliver content that exceeds expectations. We believe that combining human expertise with advanced technical capabilities is the key to success in the information age.
              </p>
            </motion.div>
          </div>
        </section>

        <section className="py-16 md:py-24 bg-gradient-to-br from-primary to-primary/80">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="max-w-3xl mx-auto text-center text-primary-foreground"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6" data-testid="en-heading-cta">
                Join the Journey to the Future
              </h2>
              <p className="text-lg mb-8 opacity-90" data-testid="en-text-cta-description">
                Sabq Smart is not just a platform, it's your daily knowledge partner. It's a living media experience that evolves with you, learns from you, and understands you. Get ready for a news experience that speaks your language and grows with your interests.
              </p>
              <div className="flex flex-wrap gap-4 justify-center">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link href="/en/register">
                    <Button 
                      size="lg" 
                      variant="secondary"
                      className="gap-2"
                      data-testid="en-button-cta-register"
                    >
                      <Sparkles className="w-4 h-4" />
                      Start Free Now
                    </Button>
                  </Link>
                </motion.div>
                
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link href="/en/daily-brief">
                    <Button 
                      size="lg" 
                      variant="outline"
                      className="gap-2 bg-white/10 border-white/20 text-white"
                      data-testid="en-button-cta-brief"
                    >
                      <Brain className="w-4 h-4" />
                      Try the Daily Brief
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        <EnglishFooter />
      </div>
    </EnglishLayout>
  );
}
