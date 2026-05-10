import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Link as LinkIcon, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SmartEntity {
  id: string;
  name: string;
  aliases: string[];
  typeId: number;
  description?: string;
  imageUrl?: string;
  slug: string;
  importanceScore: number;
  usageCount: number;
  status: string;
}

interface SmartTerm {
  id: string;
  term: string;
  aliases: string[];
  description?: string;
  category?: string;
  usageCount: number;
  status: string;
}

interface SmartLinkSuggestion {
  text: string;
  type: "entity" | "term";
  entityId?: string;
  termId?: string;
  entity?: SmartEntity;
  term?: SmartTerm;
  position: number;
  length: number;
  confidence: number;
  context: string;
}

interface AnalyzeResponse {
  suggestions: SmartLinkSuggestion[];
  entities: string[];
  terms: string[];
  processingTime: number;
}

interface SmartLinksPanelProps {
  articleContent: string;
  articleId?: string;
  onAddLink: (suggestion: SmartLinkSuggestion, url: string) => void;
}

export function SmartLinksPanel({ articleContent, articleId, onAddLink }: SmartLinksPanelProps) {
  const { toast } = useToast();
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/smart-links/analyze", {
        method: "POST",
        body: JSON.stringify({
          content: articleContent,
          articleId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      }) as AnalyzeResponse;
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast({
        title: "تم التحليل بنجاح",
        description: `تم العثور على ${data.suggestions.length} اقتراح للروابط الذكية`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في التحليل",
        description: error.message || "حدث خطأ أثناء تحليل المحتوى",
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = () => {
    if (!articleContent || articleContent.trim().length === 0) {
      toast({
        title: "تنبيه",
        description: "الرجاء كتابة محتوى المقال أولاً",
        variant: "destructive",
      });
      return;
    }
    analyzeMutation.mutate();
  };

  const handleAddLink = (suggestion: SmartLinkSuggestion) => {
    let url = "";
    if (suggestion.type === "entity" && suggestion.entity) {
      url = `/entity/${suggestion.entity.slug}`;
    } else if (suggestion.type === "term" && suggestion.term) {
      url = `/term/${suggestion.term.term.toLowerCase().replace(/\s+/g, "-")}`;
    }
    
    if (url) {
      onAddLink(suggestion, url);
      toast({
        title: "تم إضافة الرابط",
        description: `تم إضافة رابط "${suggestion.text}"`,
      });
    }
  };

  // Group entities by type
  const groupedEntities = analysisResult?.suggestions
    .filter(s => s.type === "entity" && s.entity)
    .reduce((acc, suggestion) => {
      const entity = suggestion.entity!;
      const typeName = getEntityTypeName(entity.typeId);
      if (!acc[typeName]) {
        acc[typeName] = [];
      }
      acc[typeName].push(suggestion);
      return acc;
    }, {} as Record<string, SmartLinkSuggestion[]>) || {};

  // Group terms by category
  const groupedTerms = analysisResult?.suggestions
    .filter(s => s.type === "term" && s.term)
    .reduce((acc, suggestion) => {
      const term = suggestion.term!;
      const category = term.category || "عام";
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(suggestion);
      return acc;
    }, {} as Record<string, SmartLinkSuggestion[]>) || {};

  // Count frequency of each entity/term
  const getFrequency = (suggestions: SmartLinkSuggestion[], targetText: string) => {
    return suggestions.filter(s => s.text.toLowerCase() === targetText.toLowerCase()).length;
  };

  // Get unique suggestions by text
  const getUniqueSuggestions = (suggestions: SmartLinkSuggestion[]) => {
    const seen = new Set<string>();
    return suggestions.filter(s => {
      const key = s.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  return (
    <Card className="h-full flex flex-col" dir="rtl">
      <CardHeader className="flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            الروابط الذكية
          </CardTitle>
          <Button
            onClick={handleAnalyze}
            disabled={analyzeMutation.isPending}
            size="sm"
            data-testid="button-analyze-content"
          >
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                جاري التحليل...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 ml-2" />
                تحليل المحتوى
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {!analysisResult && !analyzeMutation.isPending && (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2" data-testid="text-empty-state">
              اضغط على "تحليل المحتوى" لاستخراج الكيانات والمصطلحات
            </p>
            <p className="text-sm text-muted-foreground">
              سيتم تحليل المحتوى باستخدام الذكاء الاصطناعي لاقتراح روابط ذكية
            </p>
          </div>
        )}

        {analyzeMutation.isPending && (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <Loader2 className="h-12 w-12 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground" data-testid="text-loading-state">
              جاري تحليل المحتوى...
            </p>
          </div>
        )}

        {analysisResult && analysisResult.suggestions.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground" data-testid="text-no-results">
              لم يتم العثور على كيانات أو مصطلحات في المحتوى
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              جرب إضافة المزيد من المحتوى أو تحليل مقال آخر
            </p>
          </div>
        )}

        {analysisResult && analysisResult.suggestions.length > 0 && (
          <Tabs defaultValue="entities" className="h-full flex flex-col" dir="rtl">
            <TabsList className="mx-4 mt-4" data-testid="tabs-smart-links">
              <TabsTrigger value="entities" data-testid="tab-entities">
                الكيانات ({Object.values(groupedEntities).flat().length})
              </TabsTrigger>
              <TabsTrigger value="terms" data-testid="tab-terms">
                المصطلحات ({Object.values(groupedTerms).flat().length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="entities" className="flex-1 overflow-hidden mt-0 p-4">
              <ScrollArea className="h-full" data-testid="scroll-entities">
                {Object.keys(groupedEntities).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    لم يتم العثور على كيانات
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedEntities).map(([typeName, suggestions]) => {
                      const uniqueSuggestions = getUniqueSuggestions(suggestions);
                      return (
                        <div key={typeName} data-testid={`entity-group-${typeName}`}>
                          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                            {typeName}
                          </h3>
                          <div className="space-y-2">
                            {uniqueSuggestions.map((suggestion, idx) => {
                              const frequency = getFrequency(suggestions, suggestion.text);
                              return (
                                <div
                                  key={`${suggestion.entityId}-${idx}`}
                                  className="flex items-start justify-between gap-3 p-3 rounded-md border hover-elevate"
                                  data-testid={`entity-item-${suggestion.entityId}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-medium text-sm" data-testid={`entity-name-${suggestion.entityId}`}>
                                        {suggestion.entity!.name}
                                      </p>
                                      <Badge variant="secondary" className="text-xs" data-testid={`entity-confidence-${suggestion.entityId}`}>
                                        {Math.round(suggestion.confidence * 100)}%
                                      </Badge>
                                      {frequency > 1 && (
                                        <Badge variant="outline" className="text-xs" data-testid={`entity-frequency-${suggestion.entityId}`}>
                                          {frequency}×
                                        </Badge>
                                      )}
                                    </div>
                                    {suggestion.entity!.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {suggestion.entity!.description}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleAddLink(suggestion)}
                                    className="flex-shrink-0"
                                    data-testid={`button-add-link-${suggestion.entityId}`}
                                  >
                                    <LinkIcon className="h-3 w-3 ml-1" />
                                    إضافة رابط
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="terms" className="flex-1 overflow-hidden mt-0 p-4">
              <ScrollArea className="h-full" data-testid="scroll-terms">
                {Object.keys(groupedTerms).length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    لم يتم العثور على مصطلحات
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(groupedTerms).map(([category, suggestions]) => {
                      const uniqueSuggestions = getUniqueSuggestions(suggestions);
                      return (
                        <div key={category} data-testid={`term-group-${category}`}>
                          <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                            {category}
                          </h3>
                          <div className="space-y-2">
                            {uniqueSuggestions.map((suggestion, idx) => {
                              const frequency = getFrequency(suggestions, suggestion.text);
                              return (
                                <div
                                  key={`${suggestion.termId}-${idx}`}
                                  className="flex items-start justify-between gap-3 p-3 rounded-md border hover-elevate"
                                  data-testid={`term-item-${suggestion.termId}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-medium text-sm" data-testid={`term-name-${suggestion.termId}`}>
                                        {suggestion.term!.term}
                                      </p>
                                      <Badge variant="secondary" className="text-xs" data-testid={`term-confidence-${suggestion.termId}`}>
                                        {Math.round(suggestion.confidence * 100)}%
                                      </Badge>
                                      {frequency > 1 && (
                                        <Badge variant="outline" className="text-xs" data-testid={`term-frequency-${suggestion.termId}`}>
                                          {frequency}×
                                        </Badge>
                                      )}
                                    </div>
                                    {suggestion.term!.description && (
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {suggestion.term!.description}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleAddLink(suggestion)}
                                    className="flex-shrink-0"
                                    data-testid={`button-add-link-${suggestion.termId}`}
                                  >
                                    <LinkIcon className="h-3 w-3 ml-1" />
                                    إضافة رابط
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function to get entity type name from typeId
function getEntityTypeName(typeId: number): string {
  const typeNames: Record<number, string> = {
    1: "شخصيات",
    2: "مؤسسات",
    3: "أماكن",
    4: "فعاليات",
    5: "منتجات",
    6: "مشاريع",
  };
  return typeNames[typeId] || "أخرى";
}
