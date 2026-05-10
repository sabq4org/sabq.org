import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, RotateCcw, Eye, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FocalPoint {
  x: number; // percentage 0-100 from left
  y: number; // percentage 0-100 from top
}

interface ImageFocalPointPickerProps {
  imageUrl: string;
  currentFocalPoint?: FocalPoint;
  onFocalPointChange: (focalPoint: FocalPoint) => void;
}

export function ImageFocalPointPicker({
  imageUrl,
  currentFocalPoint,
  onFocalPointChange,
}: ImageFocalPointPickerProps) {
  const [focalPoint, setFocalPoint] = useState<FocalPoint>(
    currentFocalPoint || { x: 50, y: 50 }
  );
  const [showPreview, setShowPreview] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (currentFocalPoint) {
      setFocalPoint(currentFocalPoint);
    }
  }, [currentFocalPoint]);

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newFocalPoint = {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };

    setFocalPoint(newFocalPoint);
    onFocalPointChange(newFocalPoint);
  };

  const handleReset = () => {
    const defaultPoint = { x: 50, y: 50 };
    setFocalPoint(defaultPoint);
    onFocalPointChange(defaultPoint);
  };

  const getObjectPosition = () => {
    return `${focalPoint.x}% ${focalPoint.y}%`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">نقطة التركيز في الصورة</CardTitle>
              <Badge variant="secondary" className="text-xs">
                اختياري
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                data-testid="button-toggle-preview"
              >
                <Eye className="h-4 w-4 ml-1" />
                {showPreview ? "إخفاء المعاينة" : "عرض المعاينة"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReset}
                data-testid="button-reset-focal-point"
              >
                <RotateCcw className="h-4 w-4 ml-1" />
                إعادة تعيين
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              انقر على الجزء الأهم في الصورة ليظهر في بطاقات الأخبار المصغرة. 
              هذا مفيد خصوصاً للصور العمودية أو الأفقية الواسعة.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <p className="text-sm font-medium">الصورة الأصلية - انقر لتحديد نقطة التركيز</p>
            <div className="relative inline-block border-2 border-dashed border-primary/30 rounded-lg overflow-hidden">
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Original"
                className="max-w-full max-h-96 cursor-crosshair"
                onClick={handleImageClick}
                data-testid="img-focal-point-selector"
              />
              {/* Focal point indicator */}
              <div
                className="absolute w-6 h-6 -ml-3 -mt-3 pointer-events-none"
                style={{
                  left: `${focalPoint.x}%`,
                  top: `${focalPoint.y}%`,
                }}
              >
                <div className="relative w-full h-full">
                  {/* Outer ring */}
                  <div className="absolute inset-0 rounded-full border-4 border-white shadow-lg animate-ping" />
                  {/* Inner dot */}
                  <div className="absolute inset-0 rounded-full border-4 border-primary bg-primary/50" />
                  {/* Center dot */}
                  <div className="absolute inset-2 rounded-full bg-primary" />
                </div>
              </div>

              {/* Crosshair lines */}
              <div
                className="absolute top-0 bottom-0 w-px bg-primary/30 pointer-events-none"
                style={{ left: `${focalPoint.x}%` }}
              />
              <div
                className="absolute left-0 right-0 h-px bg-primary/30 pointer-events-none"
                style={{ top: `${focalPoint.y}%` }}
              />
            </div>

            <p className="text-xs text-muted-foreground" data-testid="text-focal-coordinates">
              الإحداثيات: X = {focalPoint.x.toFixed(1)}%, Y = {focalPoint.y.toFixed(1)}%
            </p>
          </div>

          {/* Preview Section */}
          {showPreview && (
            <div className="space-y-3 pt-4 border-t">
              <p className="text-sm font-medium">معاينة في البطاقات المصغرة</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Horizontal Card Preview */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">بطاقة أفقية</p>
                  <div className="relative h-32 overflow-hidden rounded-lg border">
                    <img
                      src={imageUrl}
                      alt="Horizontal preview"
                      className="w-full h-full object-cover"
                      style={{ objectPosition: getObjectPosition() }}
                      data-testid="preview-horizontal"
                    />
                  </div>
                </div>

                {/* Square Card Preview */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">بطاقة مربعة</p>
                  <div className="relative aspect-square overflow-hidden rounded-lg border">
                    <img
                      src={imageUrl}
                      alt="Square preview"
                      className="w-full h-full object-cover"
                      style={{ objectPosition: getObjectPosition() }}
                      data-testid="preview-square"
                    />
                  </div>
                </div>

                {/* Vertical Card Preview */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">بطاقة عمودية</p>
                  <div className="relative h-48 overflow-hidden rounded-lg border">
                    <img
                      src={imageUrl}
                      alt="Vertical preview"
                      className="w-full h-full object-cover"
                      style={{ objectPosition: getObjectPosition() }}
                      data-testid="preview-vertical"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
