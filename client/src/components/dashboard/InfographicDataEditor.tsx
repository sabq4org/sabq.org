import { Plus, Trash2, BarChart3, TrendingUp, Clock, CreditCard, Quote, PieChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface InfographicDataEditorProps {
  value: any;
  onChange: (data: any) => void;
  disabled?: boolean;
}

const COLOR_OPTIONS = [
  { value: "primary", label: "أساسي", className: "bg-primary" },
  { value: "success", label: "نجاح", className: "bg-green-500" },
  { value: "warning", label: "تحذير", className: "bg-yellow-500" },
  { value: "danger", label: "خطر", className: "bg-red-500" },
  { value: "info", label: "معلومات", className: "bg-blue-500" },
  { value: "accent", label: "مميز", className: "bg-accent" },
];

export function InfographicDataEditor({ value, onChange, disabled }: InfographicDataEditorProps) {
  const data = value || {};

  const updateData = (key: string, newValue: any) => {
    onChange({ ...data, [key]: newValue });
  };

  const updateKeyInsight = (field: string, fieldValue: any) => {
    updateData("keyInsight", { ...(data.keyInsight || {}), [field]: fieldValue });
  };

  const addBigNumber = () => {
    const current = data.bigNumbers || [];
    updateData("bigNumbers", [...current, { value: 0, label: "", suffix: "", prefix: "", color: "primary" }]);
  };

  const updateBigNumber = (index: number, field: string, fieldValue: any) => {
    const current = [...(data.bigNumbers || [])];
    current[index] = { ...current[index], [field]: fieldValue };
    updateData("bigNumbers", current);
  };

  const removeBigNumber = (index: number) => {
    const current = [...(data.bigNumbers || [])];
    current.splice(index, 1);
    updateData("bigNumbers", current);
  };

  const addProgressBar = () => {
    const current = data.progressBars || [];
    updateData("progressBars", [...current, { label: "", value: 0, max: 100, color: "primary" }]);
  };

  const updateProgressBar = (index: number, field: string, fieldValue: any) => {
    const current = [...(data.progressBars || [])];
    current[index] = { ...current[index], [field]: fieldValue };
    updateData("progressBars", current);
  };

  const removeProgressBar = (index: number) => {
    const current = [...(data.progressBars || [])];
    current.splice(index, 1);
    updateData("progressBars", current);
  };

  const updateDonutChart = (field: string, fieldValue: any) => {
    updateData("donutChart", { ...(data.donutChart || { segments: [] }), [field]: fieldValue });
  };

  const addDonutSegment = () => {
    const current = data.donutChart?.segments || [];
    updateDonutChart("segments", [...current, { label: "", value: 0, color: "primary" }]);
  };

  const updateDonutSegment = (index: number, field: string, fieldValue: any) => {
    const current = [...(data.donutChart?.segments || [])];
    current[index] = { ...current[index], [field]: fieldValue };
    updateDonutChart("segments", current);
  };

  const removeDonutSegment = (index: number) => {
    const current = [...(data.donutChart?.segments || [])];
    current.splice(index, 1);
    updateDonutChart("segments", current);
  };

  const addTimelineEvent = () => {
    const current = data.timeline || [];
    updateData("timeline", [...current, { year: "", title: "", description: "" }]);
  };

  const updateTimelineEvent = (index: number, field: string, fieldValue: any) => {
    const current = [...(data.timeline || [])];
    current[index] = { ...current[index], [field]: fieldValue };
    updateData("timeline", current);
  };

  const removeTimelineEvent = (index: number) => {
    const current = [...(data.timeline || [])];
    current.splice(index, 1);
    updateData("timeline", current);
  };

  const addDataCard = () => {
    const current = data.dataCards || [];
    updateData("dataCards", [...current, { title: "", value: "", description: "" }]);
  };

  const updateDataCard = (index: number, field: string, fieldValue: any) => {
    const current = [...(data.dataCards || [])];
    current[index] = { ...current[index], [field]: fieldValue };
    updateData("dataCards", current);
  };

  const removeDataCard = (index: number) => {
    const current = [...(data.dataCards || [])];
    current.splice(index, 1);
    updateData("dataCards", current);
  };

  return (
    <div dir="rtl" className="space-y-4">
      <Accordion type="multiple" defaultValue={["keyInsight"]} className="w-full">
        <AccordionItem value="keyInsight">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Quote className="h-4 w-4" />
              <span>الرسالة الرئيسية</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="keyInsight-text">النص</Label>
                  <Input
                    id="keyInsight-text"
                    data-testid="input-keyinsight-text"
                    placeholder="أدخل الرسالة الرئيسية..."
                    value={data.keyInsight?.text || ""}
                    onChange={(e) => updateKeyInsight("text", e.target.value)}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="keyInsight-variant">النمط</Label>
                  <Select
                    value={data.keyInsight?.variant || "highlight"}
                    onValueChange={(val) => updateKeyInsight("variant", val)}
                    disabled={disabled}
                  >
                    <SelectTrigger id="keyInsight-variant" data-testid="select-keyinsight-variant">
                      <SelectValue placeholder="اختر النمط" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="highlight">تمييز</SelectItem>
                      <SelectItem value="quote">اقتباس</SelectItem>
                      <SelectItem value="gradient">تدرج</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="bigNumbers">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>الأرقام الكبيرة ({(data.bigNumbers || []).length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {(data.bigNumbers || []).map((item: any, index: number) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span>رقم {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeBigNumber(index)}
                        disabled={disabled}
                        data-testid={`button-remove-bignumber-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>القيمة</Label>
                        <Input
                          type="number"
                          placeholder="100"
                          value={item.value || ""}
                          onChange={(e) => updateBigNumber(index, "value", parseFloat(e.target.value) || 0)}
                          disabled={disabled}
                          data-testid={`input-bignumber-value-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>التسمية</Label>
                        <Input
                          placeholder="مليون مستخدم"
                          value={item.label || ""}
                          onChange={(e) => updateBigNumber(index, "label", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-bignumber-label-${index}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>البادئة</Label>
                        <Input
                          placeholder="+"
                          value={item.prefix || ""}
                          onChange={(e) => updateBigNumber(index, "prefix", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-bignumber-prefix-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>اللاحقة</Label>
                        <Input
                          placeholder="%"
                          value={item.suffix || ""}
                          onChange={(e) => updateBigNumber(index, "suffix", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-bignumber-suffix-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>اللون</Label>
                        <Select
                          value={item.color || "primary"}
                          onValueChange={(val) => updateBigNumber(index, "color", val)}
                          disabled={disabled}
                        >
                          <SelectTrigger data-testid={`select-bignumber-color-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLOR_OPTIONS.map((color) => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${color.className}`} />
                                  <span>{color.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                variant="outline"
                onClick={addBigNumber}
                disabled={disabled}
                className="w-full"
                data-testid="button-add-bignumber"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة رقم
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="progressBars">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span>أشرطة التقدم ({(data.progressBars || []).length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {(data.progressBars || []).map((item: any, index: number) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span>شريط {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProgressBar(index)}
                        disabled={disabled}
                        data-testid={`button-remove-progressbar-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label>التسمية</Label>
                      <Input
                        placeholder="نسبة الإنجاز"
                        value={item.label || ""}
                        onChange={(e) => updateProgressBar(index, "label", e.target.value)}
                        disabled={disabled}
                        data-testid={`input-progressbar-label-${index}`}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>القيمة</Label>
                        <Input
                          type="number"
                          placeholder="75"
                          value={item.value || ""}
                          onChange={(e) => updateProgressBar(index, "value", parseFloat(e.target.value) || 0)}
                          disabled={disabled}
                          data-testid={`input-progressbar-value-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>الحد الأقصى</Label>
                        <Input
                          type="number"
                          placeholder="100"
                          value={item.max || 100}
                          onChange={(e) => updateProgressBar(index, "max", parseFloat(e.target.value) || 100)}
                          disabled={disabled}
                          data-testid={`input-progressbar-max-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>اللون</Label>
                        <Select
                          value={item.color || "primary"}
                          onValueChange={(val) => updateProgressBar(index, "color", val)}
                          disabled={disabled}
                        >
                          <SelectTrigger data-testid={`select-progressbar-color-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLOR_OPTIONS.map((color) => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${color.className}`} />
                                  <span>{color.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                variant="outline"
                onClick={addProgressBar}
                disabled={disabled}
                className="w-full"
                data-testid="button-add-progressbar"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة شريط تقدم
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="donutChart">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <PieChart className="h-4 w-4" />
              <span>الرسم الدائري ({(data.donutChart?.segments || []).length} شرائح)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <Label>عنوان الرسم</Label>
                    <Input
                      placeholder="توزيع النسب"
                      value={data.donutChart?.title || ""}
                      onChange={(e) => updateDonutChart("title", e.target.value)}
                      disabled={disabled}
                      data-testid="input-donutchart-title"
                    />
                  </div>
                </CardContent>
              </Card>
              
              {(data.donutChart?.segments || []).map((segment: any, index: number) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span>شريحة {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDonutSegment(index)}
                        disabled={disabled}
                        data-testid={`button-remove-donutsegment-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label>التسمية</Label>
                        <Input
                          placeholder="الفئة أ"
                          value={segment.label || ""}
                          onChange={(e) => updateDonutSegment(index, "label", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-donutsegment-label-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>القيمة</Label>
                        <Input
                          type="number"
                          placeholder="25"
                          value={segment.value || ""}
                          onChange={(e) => updateDonutSegment(index, "value", parseFloat(e.target.value) || 0)}
                          disabled={disabled}
                          data-testid={`input-donutsegment-value-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>اللون</Label>
                        <Select
                          value={segment.color || "primary"}
                          onValueChange={(val) => updateDonutSegment(index, "color", val)}
                          disabled={disabled}
                        >
                          <SelectTrigger data-testid={`select-donutsegment-color-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COLOR_OPTIONS.map((color) => (
                              <SelectItem key={color.value} value={color.value}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${color.className}`} />
                                  <span>{color.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                variant="outline"
                onClick={addDonutSegment}
                disabled={disabled}
                className="w-full"
                data-testid="button-add-donutsegment"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة شريحة
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="timeline">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>الجدول الزمني ({(data.timeline || []).length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {(data.timeline || []).map((event: any, index: number) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span>حدث {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTimelineEvent(index)}
                        disabled={disabled}
                        data-testid={`button-remove-timeline-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>السنة / التاريخ</Label>
                        <Input
                          placeholder="2024"
                          value={event.year || ""}
                          onChange={(e) => updateTimelineEvent(index, "year", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-timeline-year-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>العنوان</Label>
                        <Input
                          placeholder="إطلاق المشروع"
                          value={event.title || ""}
                          onChange={(e) => updateTimelineEvent(index, "title", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-timeline-title-${index}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>الوصف (اختياري)</Label>
                      <Input
                        placeholder="وصف مختصر للحدث..."
                        value={event.description || ""}
                        onChange={(e) => updateTimelineEvent(index, "description", e.target.value)}
                        disabled={disabled}
                        data-testid={`input-timeline-description-${index}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                variant="outline"
                onClick={addTimelineEvent}
                disabled={disabled}
                className="w-full"
                data-testid="button-add-timeline"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة حدث
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="dataCards">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span>بطاقات البيانات ({(data.dataCards || []).length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              {(data.dataCards || []).map((card: any, index: number) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between gap-2">
                      <span>بطاقة {index + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeDataCard(index)}
                        disabled={disabled}
                        data-testid={`button-remove-datacard-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>العنوان</Label>
                        <Input
                          placeholder="إجمالي المبيعات"
                          value={card.title || ""}
                          onChange={(e) => updateDataCard(index, "title", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-datacard-title-${index}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>القيمة</Label>
                        <Input
                          placeholder="1,234,567"
                          value={card.value || ""}
                          onChange={(e) => updateDataCard(index, "value", e.target.value)}
                          disabled={disabled}
                          data-testid={`input-datacard-value-${index}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>الوصف (اختياري)</Label>
                      <Input
                        placeholder="زيادة بنسبة 15% عن العام السابق"
                        value={card.description || ""}
                        onChange={(e) => updateDataCard(index, "description", e.target.value)}
                        disabled={disabled}
                        data-testid={`input-datacard-description-${index}`}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button
                variant="outline"
                onClick={addDataCard}
                disabled={disabled}
                className="w-full"
                data-testid="button-add-datacard"
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة بطاقة
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="source">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <span>المصدر والإسناد</span>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <Card>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="source-text">المصدر</Label>
                  <Input
                    id="source-text"
                    placeholder="وزارة المالية - التقرير السنوي 2024"
                    value={data.source || ""}
                    onChange={(e) => updateData("source", e.target.value)}
                    disabled={disabled}
                    data-testid="input-source"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastUpdated">آخر تحديث</Label>
                  <Input
                    id="lastUpdated"
                    type="date"
                    value={data.lastUpdated || ""}
                    onChange={(e) => updateData("lastUpdated", e.target.value)}
                    disabled={disabled}
                    data-testid="input-lastupdated"
                  />
                </div>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
