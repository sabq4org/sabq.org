import { useState, KeyboardEvent, useId } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  maxTags?: number;
  testId?: string;
}

export function TagInput({
  tags,
  onTagsChange,
  label,
  placeholder = "اكتب كلمة واضغط Enter...",
  className,
  maxTags,
  testId = "input-tags",
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const inputId = useId();
  const labelId = useId();

  const announceAction = (message: string) => {
    setAnnouncement(message);
    setTimeout(() => setAnnouncement(""), 1000);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      const removedTag = tags[tags.length - 1];
      removeTag(tags.length - 1);
      announceAction(`تم حذف الكلمة: ${removedTag}`);
    }
  };

  const handleInputChange = (value: string) => {
    if (value.includes(",") || value.includes("،")) {
      const parts = value.split(/[,،]/);
      const tagToAdd = parts[0].trim();
      const remaining = parts.slice(1).join(",");
      
      if (tagToAdd) {
        addTag(tagToAdd);
      }
      
      setInputValue(remaining);
    } else {
      setInputValue(value);
    }
  };

  const addTag = (valueToAdd?: string) => {
    const trimmedValue = (valueToAdd || inputValue).trim().replace(/\s+/g, " ");
    
    if (!trimmedValue) return;
    
    const normalizedTags = tags.map(tag => tag.toLowerCase());
    if (normalizedTags.includes(trimmedValue.toLowerCase())) {
      setInputValue("");
      return;
    }
    
    if (maxTags && tags.length >= maxTags) {
      announceAction(`الحد الأقصى ${maxTags} كلمات`);
      return;
    }

    onTagsChange([...tags, trimmedValue]);
    announceAction(`تمت إضافة الكلمة: ${trimmedValue}`);
    setInputValue("");
  };

  const removeTag = (index: number) => {
    const removedTag = tags[index];
    onTagsChange(tags.filter((_, i) => i !== index));
    announceAction(`تم حذف الكلمة: ${removedTag}`);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label id={labelId} htmlFor={inputId}>
          {label}
        </Label>
      )}
      <div
        role="group"
        aria-labelledby={label ? labelId : undefined}
        className="flex flex-wrap gap-2 min-h-[36px] p-2 border rounded-md bg-background"
      >
        <ul role="list" className="contents">
          {tags.map((tag, index) => (
            <li key={index} role="listitem" className="contents">
              <Badge
                variant="secondary"
                className="gap-1 no-default-hover-elevate"
                data-testid={`badge-tag-${index}`}
              >
                <span>{tag}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeTag(index)}
                  className="h-4 w-4 p-0"
                  aria-label={`حذف الكلمة ${tag}`}
                  data-testid={`button-remove-tag-${index}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            </li>
          ))}
        </ul>
        <Input
          id={inputId}
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
          data-testid={testId}
          aria-describedby={`${inputId}-hint`}
        />
      </div>
      <div className="flex items-center justify-between">
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          اضغط Enter أو الفاصلة لإضافة، Backspace لحذف آخر كلمة
          {maxTags && ` (${tags.length}/${maxTags})`}
        </p>
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
