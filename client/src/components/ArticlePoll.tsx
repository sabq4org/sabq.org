import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, BarChart3, Users, Sparkles, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import confetti from "canvas-confetti";

interface PollOption {
  id: number;
  text: string;
  votesCount: number;
  percentage?: number;
}

interface Poll {
  id: number;
  question: string;
  options: PollOption[];
  totalVotes: number;
  isActive: boolean;
  userVote?: number | null;
  hasVoted?: boolean;
}

interface ArticlePollProps {
  articleId: string;
}

export function ArticlePoll({ articleId }: ArticlePollProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [voteJustSubmitted, setVoteJustSubmitted] = useState(false);

  const { data: poll, isLoading, refetch, isFetching } = useQuery<Poll>({
    queryKey: ["/api/polls/article", articleId],
    enabled: !!articleId,
  });

  useEffect(() => {
    if (poll?.userVote || poll?.hasVoted) {
      setHasVoted(true);
      setSelectedOption(poll.userVote ?? null);
      setShowResults(true);
    }
  }, [poll?.userVote, poll?.hasVoted]);

  useEffect(() => {
    if (!hasVoted) return;
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [hasVoted, refetch]);

  // Reset voteJustSubmitted when fresh data arrives after voting
  useEffect(() => {
    if (voteJustSubmitted && !isFetching) {
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setVoteJustSubmitted(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [voteJustSubmitted, isFetching]);

  const voteMutation = useMutation({
    mutationFn: async (optionId: number) => {
      return apiRequest(`/api/polls/${poll?.id}/vote`, {
        method: "POST",
        body: JSON.stringify({ optionId }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      setHasVoted(true);
      setShowResults(true);
      setVoteJustSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ["/api/polls/article", articleId] });
      triggerConfetti();
    },
  });

  const triggerConfetti = () => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#10b981", "#3b82f6", "#8b5cf6"],
    });
  };

  if (isLoading) {
    return (
      <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-200 dark:bg-slate-700 rounded"></div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (!poll || !poll.isActive) return null;

  const getPercentage = (option: PollOption) => {
    if (!poll.totalVotes) return 0;
    return Math.round((option.votesCount / poll.totalVotes) * 100);
  };

  const isWinningOption = (option: PollOption) => {
    // Need at least 2 votes to determine a "majority"
    if (poll.totalVotes < 2) return false;
    
    const maxVotes = Math.max(...poll.options.map((o) => o.votesCount));
    if (maxVotes === 0) return false; // No votes yet
    
    const winnersCount = poll.options.filter((o) => o.votesCount === maxVotes).length;
    // Only consider it winning if there's a clear winner (not a tie between all with same votes)
    if (winnersCount >= poll.options.length) return false; // All options have same votes = no clear winner
    
    return option.votesCount === maxVotes;
  };

  const handleVote = () => {
    if (!selectedOption) return;
    voteMutation.mutate(selectedOption);
  };

  const isUserWithMajority = () => {
    const userVoteId = poll.userVote || selectedOption;
    if (!userVoteId) return false;
    const userOption = poll.options.find((o) => o.id === userVoteId);
    return userOption && isWinningOption(userOption);
  };

  return (
    <Card className="overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-sky-500/5 to-indigo-500/5"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.1),transparent_50%)]"></div>
      
      <div className="relative p-6 space-y-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 shadow-lg">
            <Vote className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-foreground">شارك برأيك</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{poll.totalVotes.toLocaleString("en-US")} مشارك</span>
            </p>
          </div>
        </div>

        <p className="text-lg font-semibold text-foreground leading-relaxed">
          {poll.question}
        </p>

        <div className="space-y-3">
          <AnimatePresence mode="wait">
            {poll.options.map((option, index) => {
              const percentage = getPercentage(option);
              const isSelected = selectedOption === option.id;
              const isWinner = isWinningOption(option) && showResults;
              
              return (
                <motion.div
                  key={option.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <button
                    onClick={() => !hasVoted && setSelectedOption(option.id)}
                    disabled={hasVoted || voteMutation.isPending}
                    className={`w-full relative rounded-xl overflow-hidden transition-all duration-300 ${
                      hasVoted 
                        ? "cursor-default" 
                        : "cursor-pointer hover-elevate"
                    } ${
                      isSelected && !hasVoted
                        ? "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900"
                        : ""
                    }`}
                    data-testid={`poll-option-${option.id}`}
                  >
                    <div className={`absolute inset-0 ${
                      isWinner 
                        ? "bg-gradient-to-r from-blue-500/20 to-sky-500/20" 
                        : "bg-slate-100 dark:bg-slate-800"
                    }`} />
                    
                    {showResults && (
                      <motion.div
                        className={`absolute inset-y-0 right-0 ${
                          isWinner 
                            ? "bg-gradient-to-l from-blue-500/30 to-sky-500/30" 
                            : "bg-gradient-to-l from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-800"
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    )}
                    
                    <div className="relative px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                          isSelected 
                            ? "border-blue-500 bg-blue-500" 
                            : "border-slate-300 dark:border-slate-600"
                        }`}>
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: "spring", stiffness: 300 }}
                            >
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            </motion.div>
                          )}
                        </div>
                        <span className={`font-medium ${
                          isWinner && showResults ? "text-blue-700 dark:text-blue-400" : "text-foreground"
                        }`}>
                          {option.text}
                        </span>
                        {isWinner && showResults && (
                          <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200 }}
                          >
                            <Sparkles className="w-4 h-4 text-amber-500" />
                          </motion.div>
                        )}
                      </div>
                      
                      {showResults && (
                        <motion.div
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-center gap-2"
                        >
                          <span className={`text-sm font-bold ${
                            isWinner ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"
                          }`}>
                            {percentage}%
                          </span>
                        </motion.div>
                      )}
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {!hasVoted && (
          <Button
            onClick={handleVote}
            disabled={!selectedOption || voteMutation.isPending}
            className="w-full bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white shadow-lg"
            size="lg"
            data-testid="button-submit-vote"
          >
            {voteMutation.isPending ? (
              <span className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
                جارٍ التصويت...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                صوّت الآن
              </span>
            )}
          </Button>
        )}

        {hasVoted && !voteJustSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-center p-4 rounded-xl ${
              isUserWithMajority()
                ? "bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-200 dark:border-blue-800"
                : "bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800"
            }`}
          >
            <p className={`font-semibold text-lg ${
              isUserWithMajority()
                ? "text-blue-700 dark:text-blue-400"
                : "text-purple-700 dark:text-purple-400"
            }`}>
              {isUserWithMajority() ? (
                <span className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  أنت مع الأغلبية!
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  رأيك مميز!
                </span>
              )}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              شكراً لمشاركتك في الاستطلاع
            </p>
          </motion.div>
        )}
        
        {/* Show loading state while fetching fresh results after voting */}
        {hasVoted && voteJustSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full"
              />
              <span>جارٍ تحميل النتائج...</span>
            </div>
          </motion.div>
        )}
      </div>
    </Card>
  );
}
