import { Link } from "wouter";
import { Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface SuggestionCardProps {
  title: string;
  categoryName: string;
  imageUrl?: string | null;
  href: string;
  index: number;
}

/** بطاقة مقال مقترح: صورة 16:9 + شارة الفئة + عنوان بسطرين. */
export function SuggestionCard({ title, categoryName, imageUrl, href, index }: SuggestionCardProps) {
  return (
    <Link href={href} data-testid={`link-suggested-article-${index}`} className="block h-full">
      <Card className="hover-elevate cursor-pointer h-full overflow-hidden border-0 shadow-sm dark:border dark:border-card-border">
        <div className="aspect-[16/9] w-full overflow-hidden bg-primary/10">
          {imageUrl ? (
            <img
              src={imageUrl}
              className="h-full w-full object-cover"
              loading="lazy"
              alt=""
              data-testid={`img-suggestion-${index}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Newspaper className="h-8 w-8 text-primary/40" />
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <Badge variant="secondary" className="mb-2" data-testid={`badge-suggestion-category-${index}`}>
            {categoryName}
          </Badge>
          <h4
            className="font-semibold text-sm md:text-base leading-snug line-clamp-2"
            data-testid={`text-suggestion-title-${index}`}
          >
            {title}
          </h4>
        </CardContent>
      </Card>
    </Link>
  );
}
