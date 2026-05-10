import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Vote, Plus, Trash2, GripVertical, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { getCsrfToken } from "@/lib/queryClient";

export interface PollData {
  enabled: boolean;
  question: string;
  options: string[];
}

interface PollEditorProps {
  poll: PollData | null;
  onChange: (poll: PollData | null) => void;
  articleContent?: string;
  articleTitle?: string;
}

export function PollEditor({ poll, onChange, articleContent, articleTitle }: PollEditorProps) {
  const [enabled, setEnabled] = useState(poll?.enabled ?? false);
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [options, setOptions] = useState<string[]>(poll?.options ?? ["", ""]);
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const updatePoll = (newEnabled: boolean, newQuestion: string, newOptions: string[]) => {
    if (newEnabled) {
      onChange({
        enabled: true,
        question: newQuestion,
        options: newOptions.filter(o => o.trim() !== ""),
      });
    } else {
      onChange(null);
    }
  };

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    if (!checked) {
      onChange(null);
    } else {
      updatePoll(true, question, options);
    }
  };

  const handleQuestionChange = (value: string) => {
    setQuestion(value);
    updatePoll(enabled, value, options);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
    updatePoll(enabled, question, newOptions);
  };

  const addOption = () => {
    if (options.length < 7) {
      const newOptions = [...options, ""];
      setOptions(newOptions);
      updatePoll(enabled, question, newOptions);
    }
  };

  const removeOption = (index: number) => {
    if (options.length > 2) {
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      updatePoll(enabled, question, newOptions);
    }
  };

  const generateWithAI = async () => {
    if (!articleContent && !articleTitle) {
      toast({
        title: "لا يوجد محتوى",
        description: "يرجى إضافة محتوى للمقال أولاً",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const csrfToken = getCsrfToken();
      const response = await fetch("/api/polls/generate", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          content: articleContent,
          title: articleTitle,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "فشل التوليد");
      }

      const data = await response.json();
      
      setQuestion(data.question);
      setOptions(data.options);
      setEnabled(true);
      onChange({
        enabled: true,
        question: data.question,
        options: data.options,
      });

      toast({
        title: "تم التوليد بنجاح",
        description: "تم إنشاء استطلاع ذكي من محتوى المقال",
      });
    } catch (error: any) {
      toast({
        title: "خطأ في التوليد",
        description: error.message || "حدث خطأ أثناء توليد الاستطلاع",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card className="overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-blue-500/5 to-purple-500/5"></div>
      
      <div className="relative p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
              <Vote className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">استطلاع رأي</h3>
              <p className="text-sm text-muted-foreground">اسأل القراء عن رأيهم</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={generateWithAI}
              disabled={isGenerating}
              className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/30 hover:border-purple-500/50"
              data-testid="button-generate-ai-poll"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 ml-1 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 ml-1" />
              )}
              توليد ذكي
            </Button>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              data-testid="switch-poll-enabled"
            />
          </div>
        </div>

        <AnimatePresence>
          {enabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label className="text-foreground font-medium">السؤال</Label>
                <Input
                  value={question}
                  onChange={(e) => handleQuestionChange(e.target.value)}
                  placeholder="ما رأيك في...؟"
                  className="text-right"
                  dir="rtl"
                  data-testid="input-poll-question"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-foreground font-medium flex items-center justify-between">
                  <span>الخيارات</span>
                  <span className="text-xs text-muted-foreground">
                    {options.length}/7 خيارات
                  </span>
                </Label>
                
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="flex items-center gap-2"
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-muted-foreground">
                        <GripVertical className="w-4 h-4" />
                      </div>
                      <Input
                        value={option}
                        onChange={(e) => handleOptionChange(index, e.target.value)}
                        placeholder={`الخيار ${index + 1}`}
                        className="flex-1 text-right"
                        dir="rtl"
                        data-testid={`input-poll-option-${index}`}
                      />
                      {options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeOption(index)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          data-testid={`button-remove-option-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </motion.div>
                  ))}
                </div>

                {options.length < 7 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addOption}
                    className="w-full mt-2 border-dashed"
                    data-testid="button-add-option"
                  >
                    <Plus className="w-4 h-4 ml-2" />
                    إضافة خيار
                  </Button>
                )}
              </div>

              {options.filter(o => o.trim()).length < 2 && (
                <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  يجب إدخال خيارين على الأقل
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
