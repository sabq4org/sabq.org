import type { ArticleItem } from "@/lib/publishing/types";
import { Image } from "lucide-react";

interface NativeStoryProps {
  item: ArticleItem;
  accent?: string;
  onView?: () => void;
}

export default function NativeStory({ item, accent, onView }: NativeStoryProps) {
  return (
    <section
      dir="rtl"
      className="w-full p-8 rounded-lg border-2 border-dashed border-border bg-muted/30"
      data-testid="template-native-story"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <Image className="w-12 h-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            قريباً: القصص التفاعلية
          </h3>
          <p className="text-sm text-muted-foreground">
            هذا التمبلت قيد التطوير حالياً
          </p>
        </div>
      </div>
    </section>
  );
}
