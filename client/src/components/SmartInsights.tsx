import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Loader2, MessageSquare, Send, Bot, User, AlertCircle } from "lucide-react";

interface SmartInsightsProps {
  articleId: string;
  articleTitle: string;
  /** When true, hides the built-in primary trigger button and auto-starts analysis on mount. */
  autoStart?: boolean;
}

interface InsightsData {
  insights: string[];
  contextToken: string;
  model: string;
  generatedAt: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function SmartInsights({ articleId, articleTitle, autoStart = false }: SmartInsightsProps) {
  const { toast } = useToast();
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);

  const insightsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/articles/${articleId}/smart-insights`, {
        method: "POST",
      });
      return response as { success: boolean; data: InsightsData };
    },
    onSuccess: (data) => {
      if (data.success) {
        setInsights(data.data);
      }
    },
    onError: (error: any) => {
      toast({
        title: "فشل التحليل",
        description: error.message || "حدث خطأ أثناء توليد التحليل الذكي",
        variant: "destructive",
      });
    },
  });

  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest(`/api/articles/${articleId}/smart-insights/chat`, {
        method: "POST",
        body: JSON.stringify({
          message,
          chatHistory: chatHistory.slice(-10),
        }),
      });
      return response as { success: boolean; data: { response: string; model: string } };
    },
    onSuccess: (data, variables) => {
      if (data.success) {
        setChatHistory((prev) => [
          ...prev,
          { role: "user", content: variables },
          { role: "assistant", content: data.data.response },
        ]);
        setChatInput("");
      }
    },
    onError: (error: any) => {
      toast({
        title: "فشل الإجابة",
        description: error.message || "حدث خطأ أثناء الحصول على الإجابة",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!chatInput.trim() || chatMutation.isPending) return;
    chatMutation.mutate(chatInput.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const hasAutoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !hasAutoStartedRef.current && !insights && !insightsMutation.isPending) {
      hasAutoStartedRef.current = true;
      insightsMutation.mutate();
    }
  }, [autoStart, insights, insightsMutation]);

  return (
    <div className="w-full space-y-4" dir="rtl">
      {!autoStart && (
        <Button
          onClick={() => insightsMutation.mutate()}
          disabled={insightsMutation.isPending}
          variant="default"
          className="w-full font-medium py-3 px-6 rounded-xl shadow-sm"
          data-testid="button-smart-insights"
        >
          {insightsMutation.isPending ? (
            <>
              <Loader2 className="ml-2 h-5 w-5 animate-spin" />
              جاري التحليل...
            </>
          ) : (
            <>
              <Sparkles className="ml-2 h-5 w-5 animate-pulse" />
              تحليل ذكي للخبر
            </>
          )}
        </Button>
      )}

      {autoStart && insightsMutation.isPending && !insights && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid="status-insights-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          جاري التحليل...
        </div>
      )}

      <AnimatePresence>
        {insights && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <Card className="rounded-xl border p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-full bg-primary/10 dark:bg-primary/20">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <h3 className="font-semibold text-lg text-foreground">رؤى ذكية</h3>
              </div>

              <ul className="space-y-4">
                {insights?.insights?.map((insight, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.15 }}
                    className="flex gap-3"
                    data-testid={`text-insight-${index}`}
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 dark:bg-primary/20 text-primary flex items-center justify-center text-sm font-medium">
                      {index + 1}
                    </span>
                    <p className="text-muted-foreground italic leading-relaxed text-sm" data-testid={`text-insight-content-${index}`}>
                      {insight}
                    </p>
                  </motion.li>
                ))}
              </ul>

              {/* Temporarily disabled: Ask AI feature
              <div className="mt-6 pt-4 border-t">
                <Sheet open={isChatOpen} onOpenChange={setIsChatOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full"
                      data-testid="button-ask-ai"
                    >
                      <MessageSquare className="ml-2 h-4 w-4" />
                      اسأل الذكاء الاصطناعي
                    </Button>
                  </SheetTrigger> */}
              {false && <div className="mt-6 pt-4 border-t">
                <Sheet open={isChatOpen} onOpenChange={setIsChatOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full"
                      data-testid="button-ask-ai"
                    >
                      <MessageSquare className="ml-2 h-4 w-4" />
                      اسأل الذكاء الاصطناعي
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-full sm:max-w-lg" dir="rtl">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-indigo-600" />
                        محادثة ذكية حول الخبر
                      </SheetTitle>
                    </SheetHeader>
                    
                    <div className="flex flex-col h-[calc(100vh-8rem)] mt-4">
                      <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 mb-4">
                        <strong>الخبر:</strong> {articleTitle}
                      </div>

                      <ScrollArea className="flex-1 pr-4">
                        <div className="space-y-4">
                          {chatHistory.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
                              <p>اطرح سؤالك حول الخبر وسأساعدك في فهمه بشكل أعمق</p>
                            </div>
                          )}
                          
                          {chatHistory.map((msg, index) => (
                            <motion.div
                              key={index}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                            >
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                msg.role === "user" 
                                  ? "bg-blue-100 dark:bg-blue-900/50" 
                                  : "bg-indigo-100 dark:bg-indigo-900/50"
                              }`}>
                                {msg.role === "user" ? (
                                  <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                )}
                              </div>
                              <div className={`flex-1 rounded-2xl px-4 py-3 ${
                                msg.role === "user"
                                  ? "bg-blue-600 text-white"
                                  : "bg-muted"
                              }`}>
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                                  {msg.content}
                                </p>
                              </div>
                            </motion.div>
                          ))}

                          {chatMutation.isPending && (
                            <div className="flex gap-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                              </div>
                              <div className="bg-muted rounded-2xl px-4 py-3">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                      </ScrollArea>

                      <div className="flex gap-2 mt-4 pt-4 border-t">
                        <Input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyPress={handleKeyPress}
                          placeholder="اكتب سؤالك هنا..."
                          disabled={chatMutation.isPending}
                          className="flex-1"
                          data-testid="input-chat-message"
                        />
                        <Button
                          onClick={handleSendMessage}
                          disabled={!chatInput.trim() || chatMutation.isPending}
                          size="icon"
                          className="bg-indigo-600 hover:bg-indigo-700"
                          data-testid="button-send-chat"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {insightsMutation.isError && !insights && (
        <Card className="rounded-xl border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap text-red-600 dark:text-red-400">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <p className="text-sm">فشل توليد التحليل. يرجى المحاولة مرة أخرى.</p>
            </div>
            {autoStart && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => insightsMutation.mutate()}
                disabled={insightsMutation.isPending}
                data-testid="button-retry-insights"
                className="gap-2"
              >
                {insightsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                إعادة المحاولة
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
