import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Home, User } from "lucide-react";
import { motion } from "framer-motion";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Category } from "@shared/schema";
import { consumePostAuthReturn, peekPostAuthReturn } from "@/lib/postAuthRedirect";

const SMART_MESSAGES = [
  "الذكاء يعرف ذوقك، وسبق تفهمك.",
  "رحلتك الذكية تبدأ بخبر يلامسك.",
  "كل قراءة الآن مصمّمة خصيصًا لك.",
  "ذكاؤك هو اللي يوجّه تجربتك.",
  "تجربة جديدة.. أكثر وعيًا وأكثر متعة.",
];

export default function Personalize() {
  const [, setLocation] = useLocation();
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const [smartMessage] = useState(() => 
    SMART_MESSAGES[Math.floor(Math.random() * SMART_MESSAGES.length)]
  );

  // Fetch user interests
  const { data: userInterestsRaw } = useQuery<Category[]>({
    queryKey: ["/api/interests"],
    enabled: !!user,
  });
  const userInterests = Array.isArray(userInterestsRaw) ? userInterestsRaw : [];

  // Complete profile mutation
  const completeProfileMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation(consumePostAuthReturn("/"));
    },
  });

  // Redirect if no interests selected or profile already complete
  useEffect(() => {
    if (!isUserLoading && user) {
      if (user.isProfileComplete) {
        setLocation(peekPostAuthReturn() ? consumePostAuthReturn("/") : "/");
      } else if (userInterests.length === 0) {
        setLocation("/onboarding/interests");
      }
    }
  }, [isUserLoading, user, userInterests, setLocation]);

  const handleStartReading = () => {
    completeProfileMutation.mutate();
  };

  const handleGoToProfile = () => {
    completeProfileMutation.mutate();
    setTimeout(() => setLocation("/profile"), 100);
  };

  if (isUserLoading || userInterests.length === 0) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl w-full text-center space-y-8"
      >
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="flex justify-center"
        >
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="w-12 h-12 text-primary" />
            </div>
          </div>
        </motion.div>

        {/* Main Heading */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          <h1 className="text-4xl md:text-5xl font-bold">
            ✨ رائع! هذه هي اهتماماتك الذكية
          </h1>
          <p className="text-xl text-primary font-semibold">
            {smartMessage}
          </p>
        </motion.div>

        {/* Selected Interests */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="space-y-4"
        >
          <p className="text-muted-foreground">اهتماماتك المختارة:</p>
          <div className="flex flex-wrap justify-center gap-3">
            {userInterests.map((interest, index) => (
              <motion.div
                key={interest.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
              >
                <Badge
                  variant="outline"
                  className="px-4 py-2 text-base border-primary/30 bg-primary/5"
                  data-testid={`selected-interest-${interest.id}`}
                >
                  {interest.nameAr}
                </Badge>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Motivational Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="p-6 rounded-lg bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20"
        >
          <p className="text-lg font-medium">
            🎯 ستصلك الآن أخبار وتحليلات مخصصة تماماً لاهتماماتك
          </p>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col sm:flex-row justify-center gap-4 pt-4"
        >
          <Button
            onClick={handleStartReading}
            size="lg"
            className="px-10 py-6 text-lg rounded-full"
            disabled={completeProfileMutation.isPending}
            data-testid="button-start-reading"
          >
            {completeProfileMutation.isPending ? (
              "جاري التحضير..."
            ) : (
              <>
                <Home className="mr-2 h-5 w-5" />
                ابدأ رحلتي الذكية
              </>
            )}
          </Button>
          <Button
            onClick={handleGoToProfile}
            variant="outline"
            size="lg"
            className="px-10 py-6 text-lg rounded-full"
            disabled={completeProfileMutation.isPending}
            data-testid="button-go-to-profile"
          >
            <User className="mr-2 h-5 w-5" />
            انتقل إلى ملفي الشخصي
          </Button>
        </motion.div>

        {/* Edit Interests Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <button
            onClick={() => setLocation("/onboarding/interests")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
            data-testid="link-edit-interests"
          >
            تعديل الاهتمامات
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
