import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface OpinionAuthor {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

interface OpinionAuthorSelectProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function OpinionAuthorSelect({ value, onChange, disabled }: OpinionAuthorSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: authorsData, isLoading } = useQuery<{ items: OpinionAuthor[] }>({
    queryKey: ["/api/admin/users", { role: "opinion_author", query: searchQuery, limit: 100 }],
    queryFn: async () => {
      const params = new URLSearchParams({
        role: "opinion_author",
        limit: "100",
        ...(searchQuery && { query: searchQuery }),
      });
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("فشل في جلب كتّاب الرأي");
      return res.json();
    },
  });

  const { data: selectedAuthorData } = useQuery<{ items: OpinionAuthor[] }>({
    queryKey: ["/api/admin/users", { ids: value ? [value] : [] }],
    queryFn: async () => {
      if (!value) return { items: [] };
      const res = await fetch(`/api/admin/users?ids=${value}`);
      if (!res.ok) throw new Error("فشل في جلب بيانات الكاتب");
      return res.json();
    },
    enabled: !!value,
  });

  const authors = useMemo(() => {
    const searchResults = authorsData?.items || [];
    const selected = selectedAuthorData?.items?.[0];
    
    if (selected && !searchResults.find(a => a.id === selected.id)) {
      return [selected, ...searchResults];
    }
    
    return searchResults;
  }, [authorsData, selectedAuthorData]);
  
  const selectedAuthor = useMemo(() => {
    return authors.find((a) => a.id === value);
  }, [authors, value]);

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" data-testid="label-opinion-author">
        كاتب المقال
      </label>
      
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
              disabled={disabled}
              data-testid="button-opinion-author-select"
            >
              {selectedAuthor ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={selectedAuthor.avatarUrl || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(selectedAuthor.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{selectedAuthor.name}</span>
                </div>
              ) : (
                "اختر كاتب المقال..."
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start" dir="rtl">
            <Command shouldFilter={false} dir="rtl">
              <CommandInput
                placeholder="ابحث باسم الكاتب أو البريد..."
                value={searchQuery}
                onValueChange={setSearchQuery}
                data-testid="input-opinion-author-search"
              />
              <CommandList>
                {isLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    جاري التحميل...
                  </div>
                ) : (
                  <>
                    <CommandEmpty data-testid="text-no-opinion-authors">
                      لا يوجد نتائج للكاتب "{searchQuery}"
                    </CommandEmpty>
                    <CommandGroup>
                      {authors.map((author) => (
                        <CommandItem
                          key={author.id}
                          value={author.id}
                          onSelect={() => {
                            onChange(author.id === value ? null : author.id);
                            setOpen(false);
                            setSearchQuery("");
                          }}
                          data-testid={`item-opinion-author-${author.id}`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={author.avatarUrl || undefined} />
                              <AvatarFallback className="text-xs">
                                {getInitials(author.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col items-start min-w-0">
                              <span className="text-sm font-medium truncate w-full">
                                {author.name}
                              </span>
                              <span className="text-xs text-muted-foreground truncate w-full">
                                {author.email}
                              </span>
                            </div>
                          </div>
                          <Check
                            className={cn(
                              "ml-auto h-4 w-4",
                              value === author.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {value && !disabled && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onChange(null);
              setSearchQuery("");
            }}
            className="shrink-0"
            data-testid="button-clear-opinion-author"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground" data-testid="text-opinion-author-helper">
        اختر كاتب مقال الرأي. سيتم إظهار اسمه في بطاقة المقال وصفحة التفاصيل.
      </p>
    </div>
  );
}
