import { useState } from "react";
import { Clock, Calendar, Coffee, Moon, Star, Zap, TrendingUp, Users, CheckCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface NewsletterTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  sections: {
    intro: string;
    outro: string;
    categoryOrder?: string[];
    articleCount?: number;
    duration?: "short" | "medium" | "long";
  };
  schedule?: {
    type: "daily" | "weekly" | "custom";
    time?: string;
    days?: number[];
  };
  isCustom?: boolean;
}

const defaultTemplates: NewsletterTemplate[] = [
  {
    id: "morning",
    name: "نشرة الصباح",
    description: "ابدأ يومك مع أهم الأخبار والتحديثات",
    icon: Coffee,
    color: "bg-orange-500",
    sections: {
      intro: "صباح الخير، نبدأ يومنا معكم بأهم الأخبار والتطورات:",
      outro: "كانت هذه نشرتكم الصباحية، نتمنى لكم يوماً موفقاً.",
      articleCount: 10,
      duration: "medium",
      categoryOrder: ["محلية", "سياسة", "اقتصاد", "رياضة"],
    },
    schedule: {
      type: "daily",
      time: "06:00",
    },
  },
  {
    id: "evening",
    name: "نشرة المساء",
    description: "ملخص شامل لأحداث اليوم",
    icon: Moon,
    color: "bg-indigo-500",
    sections: {
      intro: "مساء الخير، إليكم ملخص لأهم أحداث اليوم:",
      outro: "شكراً لاستماعكم، تابعونا غداً في نشرة جديدة.",
      articleCount: 15,
      duration: "long",
      categoryOrder: ["محلية", "دولية", "اقتصاد", "ثقافة", "تقنية"],
    },
    schedule: {
      type: "daily",
      time: "20:00",
    },
  },
  {
    id: "weekly",
    name: "النشرة الأسبوعية",
    description: "ملخص أسبوعي شامل لأهم الأحداث",
    icon: Calendar,
    color: "bg-purple-500",
    sections: {
      intro: "أهلاً بكم في النشرة الأسبوعية، حيث نستعرض معكم أبرز أحداث الأسبوع:",
      outro: "كانت هذه نشرتكم الأسبوعية، نلقاكم الأسبوع المقبل بنشرة جديدة.",
      articleCount: 25,
      duration: "long",
    },
    schedule: {
      type: "weekly",
      days: [5], // Friday
      time: "18:00",
    },
  },
  {
    id: "breaking",
    name: "نشرة عاجلة",
    description: "للأخبار العاجلة والتطورات المهمة",
    icon: Zap,
    color: "bg-red-500",
    sections: {
      intro: "خبر عاجل:",
      outro: "سنوافيكم بالمزيد من التفاصيل فور ورودها.",
      articleCount: 5,
      duration: "short",
    },
  },
  {
    id: "trending",
    name: "الأكثر تداولاً",
    description: "أكثر الأخبار تداولاً وتفاعلاً",
    icon: TrendingUp,
    color: "bg-green-500",
    sections: {
      intro: "إليكم الأخبار الأكثر تداولاً وتفاعلاً:",
      outro: "تابعونا للمزيد من الأخبار الرائجة.",
      articleCount: 8,
      duration: "medium",
    },
    schedule: {
      type: "daily",
      time: "14:00",
    },
  },
  {
    id: "special",
    name: "نشرة خاصة",
    description: "للمناسبات والأحداث الخاصة",
    icon: Star,
    color: "bg-yellow-500",
    sections: {
      intro: "نشرة خاصة بمناسبة:",
      outro: "شكراً لاستماعكم لنشرتنا الخاصة.",
      articleCount: 12,
      duration: "medium",
    },
  },
];

interface NewsletterTemplatesProps {
  selectedTemplate?: NewsletterTemplate;
  onSelectTemplate: (template: NewsletterTemplate) => void;
  customTemplates?: NewsletterTemplate[];
  onSaveCustomTemplate?: (template: NewsletterTemplate) => void;
  onDeleteCustomTemplate?: (templateId: string) => void;
}

export function NewsletterTemplates({
  selectedTemplate,
  onSelectTemplate,
  customTemplates = [],
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
}: NewsletterTemplatesProps) {
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customTemplate, setCustomTemplate] = useState<Partial<NewsletterTemplate>>({});
  const [searchQuery, setSearchQuery] = useState("");

  const allTemplates = [...defaultTemplates, ...customTemplates];
  const filteredTemplates = allTemplates.filter(
    (template) =>
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCustomize = (template: NewsletterTemplate) => {
    setCustomTemplate({ ...template, isCustom: true });
    setIsCustomizing(true);
  };

  const handleSaveCustomTemplate = () => {
    if (onSaveCustomTemplate && customTemplate.name) {
      const newTemplate: NewsletterTemplate = {
        ...customTemplate,
        id: `custom-${Date.now()}`,
        icon: Users,
        color: "bg-blue-500",
        isCustom: true,
      } as NewsletterTemplate;
      onSaveCustomTemplate(newTemplate);
      setIsCustomizing(false);
      setCustomTemplate({});
    }
  };

  const getDurationLabel = (duration?: "short" | "medium" | "long") => {
    const labels = {
      short: "قصيرة (5-10 دقائق)",
      medium: "متوسطة (10-20 دقيقة)",
      long: "طويلة (20+ دقيقة)",
    };
    return labels[duration || "medium"];
  };

  const getScheduleLabel = (schedule?: NewsletterTemplate["schedule"]) => {
    if (!schedule) return "يدوي";
    
    if (schedule.type === "daily") {
      return `يومياً في ${schedule.time}`;
    } else if (schedule.type === "weekly") {
      const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
      const dayNames = schedule.days?.map(d => days[d]).join(", ") || "";
      return `أسبوعياً (${dayNames}) في ${schedule.time}`;
    }
    return "مخصص";
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Input
          type="text"
          placeholder="البحث في القوالب..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-10"
          data-testid="input-search-templates"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Templates Grid */}
      <ScrollArea className="h-[500px] w-full rounded-md border p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTemplates.map((template) => {
            const Icon = template.icon;
            const isSelected = selectedTemplate?.id === template.id;
            
            return (
              <Card
                key={template.id}
                className={cn(
                  "cursor-pointer transition-all hover-elevate",
                  isSelected && "ring-2 ring-primary"
                )}
                onClick={() => onSelectTemplate(template)}
                data-testid={`card-template-${template.id}`}
              >
                <CardHeader className="space-y-1 pb-3">
                  <div className="flex items-start justify-between">
                    <div className={cn("p-2 rounded-lg inline-block", template.color)}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    {isSelected && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {template.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {template.sections.duration && (
                      <Badge variant="secondary" className="text-xs">
                        <Clock className="h-3 w-3 ml-1" />
                        {getDurationLabel(template.sections.duration)}
                      </Badge>
                    )}
                    {template.schedule && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 ml-1" />
                        {getScheduleLabel(template.schedule)}
                      </Badge>
                    )}
                    {template.isCustom && (
                      <Badge className="text-xs">مخصص</Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCustomize(template);
                      }}
                      className="flex-1"
                      data-testid={`button-customize-${template.id}`}
                    >
                      تخصيص
                    </Button>
                    {template.isCustom && onDeleteCustomTemplate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCustomTemplate(template.id);
                        }}
                        className="px-2"
                        data-testid={`button-delete-${template.id}`}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Customize Dialog */}
      <Dialog open={isCustomizing} onOpenChange={setIsCustomizing}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>تخصيص القالب</DialogTitle>
            <DialogDescription>
              قم بتعديل إعدادات القالب حسب احتياجاتك
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid gap-4">
              <div>
                <Label htmlFor="template-name">اسم القالب</Label>
                <Input
                  id="template-name"
                  value={customTemplate.name || ""}
                  onChange={(e) => setCustomTemplate({ ...customTemplate, name: e.target.value })}
                  placeholder="أدخل اسم القالب"
                  data-testid="input-template-name"
                />
              </div>
              
              <div>
                <Label htmlFor="template-description">الوصف</Label>
                <Input
                  id="template-description"
                  value={customTemplate.description || ""}
                  onChange={(e) => setCustomTemplate({ ...customTemplate, description: e.target.value })}
                  placeholder="وصف مختصر للقالب"
                  data-testid="input-template-description"
                />
              </div>
              
              <div>
                <Label htmlFor="template-intro">المقدمة</Label>
                <Textarea
                  id="template-intro"
                  value={customTemplate.sections?.intro || ""}
                  onChange={(e) => setCustomTemplate({
                    ...customTemplate,
                    sections: { ...customTemplate.sections!, intro: e.target.value },
                  })}
                  placeholder="نص المقدمة"
                  rows={3}
                  data-testid="textarea-template-intro"
                />
              </div>
              
              <div>
                <Label htmlFor="template-outro">الخاتمة</Label>
                <Textarea
                  id="template-outro"
                  value={customTemplate.sections?.outro || ""}
                  onChange={(e) => setCustomTemplate({
                    ...customTemplate,
                    sections: { ...customTemplate.sections!, outro: e.target.value },
                  })}
                  placeholder="نص الخاتمة"
                  rows={3}
                  data-testid="textarea-template-outro"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCustomizing(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveCustomTemplate} data-testid="button-save-custom">
              حفظ القالب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}