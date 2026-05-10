import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe } from "lucide-react";

interface SeoPreviewProps {
  title?: string;
  description?: string;
  slug?: string;
}

export function SeoPreview({ title, description, slug }: SeoPreviewProps) {
  const baseUrl = window.location.origin;
  const fullUrl = slug ? `${baseUrl}/article/${slug}` : `${baseUrl}/article/...`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe className="h-4 w-4" />
          معاينة في محركات البحث
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Badge variant="outline" className="text-xs">
          Google Search Preview
        </Badge>
        
        <div className="space-y-1 p-4 bg-muted/30 rounded-lg border">
          {/* Title */}
          <h3 className="text-[#1a0dab] dark:text-[#8ab4f8] text-xl font-normal hover:underline cursor-pointer line-clamp-1">
            {title || "عنوان المقال"}
          </h3>
          
          {/* URL */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-[#006621] dark:text-[#94d194]">
              {fullUrl}
            </span>
          </div>
          
          {/* Description */}
          <p className="text-[#545454] dark:text-[#bdc1c6] text-sm line-clamp-2">
            {description || "وصف المقال سيظهر هنا. هذا النص هو مثال على كيفية ظهور الوصف في نتائج البحث."}
          </p>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-semibold">العنوان:</span> {title?.length || 0}/70 حرف
            {title && title.length > 70 && (
              <span className="text-destructive mr-1">- طويل جداً!</span>
            )}
          </p>
          <p>
            <span className="font-semibold">الوصف:</span> {description?.length || 0}/160 حرف
            {description && description.length > 160 && (
              <span className="text-destructive mr-1">- طويل جداً!</span>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
