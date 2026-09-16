import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X, Search, Loader2 } from "lucide-react";
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
import {
  SABQ_NEWSPAPER_ACCOUNT_ID,
  SABQ_NEWSPAPER_DISPLAY_NAME,
} from "@shared/sabqNewspaper";

interface Reporter {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  /** بعد مهلة الترخيص: false = مطفي وغير قابل للاختيار */
  licenseSelectable?: boolean;
}

interface ReporterSelectProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

const SABQ_NEWSPAPER_REPORTER: Reporter = {
  id: SABQ_NEWSPAPER_ACCOUNT_ID,
  name: SABQ_NEWSPAPER_DISPLAY_NAME,
  email: "admin@sabq.org",
};

// Arabic text normalization for better search
function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[\u064B-\u065F]/g, "") // Remove tashkeel
    .toLowerCase()
    .trim();
}

// Client-side fuzzy match for Arabic names
function fuzzyMatch(searchTerm: string, text: string): boolean {
  if (!searchTerm || !text) return true;
  const normalizedSearch = normalizeArabic(searchTerm);
  const normalizedText = normalizeArabic(text);

  if (normalizedText.includes(normalizedSearch)) return true;

  const searchWords = normalizedSearch.split(/\s+/);
  const textWords = normalizedText.split(/\s+/);

  return searchWords.every((sw) =>
    textWords.some((tw) => tw.includes(sw) || sw.includes(tw)),
  );
}

function collectUserRoles(user: {
  role?: string | null;
  roles?: Array<string | { name?: string }> | null;
}): string[] {
  const userRoles: string[] = [];
  if (user.role) userRoles.push(user.role);
  if (user.roles) {
    user.roles.forEach((r) => {
      if (typeof r === "string") userRoles.push(r);
      else if (r?.name) userRoles.push(r.name);
    });
  }
  return userRoles;
}

export function ReporterSelect({ value, onChange, disabled }: ReporterSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data: user } = useQuery<{
    id?: string;
    role?: string | null;
    roles?: string[];
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    email?: string | null;
    profileImageUrl?: string | null;
    linkedPublisherId?: string | null;
    publisherAccount?: { id: string; agencyName: string } | null;
  }>({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const userRoles = useMemo(() => (user ? collectUserRoles(user) : []), [user]);

  // وكالة ناشري (مالك publishers أو linkedPublisherId أو دور publisher)
  const isPublisherAccount = useMemo(() => {
    if (!user) return false;
    return Boolean(
      user.publisherAccount?.id ||
        user.linkedPublisherId ||
        user.role === "publisher" ||
        userRoles.includes("publisher"),
    );
  }, [user, userRoles]);

  // مراسل فقط — بدون صلاحية اختيار الآخرين وبدون حساب ناشر
  const isReporterOnly = useMemo(() => {
    if (!user || isPublisherAccount) return false;
    const staffRoles = [
      "admin",
      "system_admin",
      "super_admin",
      "superadmin",
      "editor",
      "chief_editor",
      "content_manager",
    ];
    const canSelectOthers = userRoles.some((role) => staffRoles.includes(role));
    return userRoles.includes("reporter") && !canSelectOthers;
  }, [user, userRoles, isPublisherAccount]);

  const lockedToSingle = isPublisherAccount || isReporterOnly;

  // الناشر → صحيفة سبق دائماً؛ المراسل → نفسه
  useEffect(() => {
    if (!user?.id) return;
    if (isPublisherAccount) {
      if (value !== SABQ_NEWSPAPER_ACCOUNT_ID) {
        onChange(SABQ_NEWSPAPER_ACCOUNT_ID);
      }
      return;
    }
    if (isReporterOnly && !value) {
      onChange(user.id);
    }
  }, [isPublisherAccount, isReporterOnly, user?.id, value, onChange]);

  const { data: reportersData, isLoading, isFetching } = useQuery<{ items: Reporter[] }>({
    queryKey: ["/api/admin/users", { role: "reporter", query: debouncedSearch, limit: 100 }],
    queryFn: async () => {
      const params = new URLSearchParams({
        role: "reporter",
        limit: "100",
        ...(debouncedSearch && { query: debouncedSearch }),
      });
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("فشل في جلب المراسلين");
      return res.json();
    },
    enabled: !lockedToSingle,
    staleTime: 30000,
  });

  // مراسل مقفول على نفسه: نعرف إن كان إرساله ممنوعاً بعد المهلة
  const { data: ownLicense } = useQuery<{
    submissionBlocked?: boolean;
    valid?: boolean;
  }>({
    queryKey: ["/api/reporter/media-license"],
    enabled: Boolean(isReporterOnly && user?.id),
    staleTime: 60_000,
  });

  const { data: selectedReporterData, isLoading: isLoadingSelected } = useQuery<{
    items: Reporter[];
  }>({
    queryKey: ["/api/admin/users", "byId", value],
    queryFn: async () => {
      if (!value) return { items: [] };
      const res = await fetch(`/api/admin/users?ids=${encodeURIComponent(value)}`);
      if (!res.ok) throw new Error("فشل في جلب بيانات المراسل");
      return res.json();
    },
    enabled: !!value && !lockedToSingle,
    staleTime: 60000,
    retry: 2,
  });

  const reporters = useMemo(() => {
    if (isPublisherAccount) {
      return [{ ...SABQ_NEWSPAPER_REPORTER, licenseSelectable: true }];
    }

    if (isReporterOnly && user) {
      return [
        {
          id: user.id!,
          name:
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            user.name ||
            user.email ||
            "المراسل",
          email: user.email || "",
          avatarUrl: user.profileImageUrl || null,
          licenseSelectable: ownLicense ? !ownLicense.submissionBlocked : undefined,
        },
      ];
    }

    let results = reportersData?.items || [];
    const selected = selectedReporterData?.items?.[0];

    if (selected && !results.find((r) => r.id === selected.id)) {
      results = [selected, ...results];
    }

    if (searchQuery && results.length > 0) {
      results = results.filter(
        (reporter) =>
          fuzzyMatch(searchQuery, reporter.name) || fuzzyMatch(searchQuery, reporter.email),
      );
    }

    results.sort((a, b) => {
      if (a.id === value) return -1;
      if (b.id === value) return 1;
      return a.name.localeCompare(b.name, "ar");
    });

    return results;
  }, [
    reportersData,
    selectedReporterData,
    isPublisherAccount,
    isReporterOnly,
    user,
    searchQuery,
    value,
    ownLicense,
  ]);

  const selectedReporter = useMemo(() => {
    return reporters.find((r) => r.id === value);
  }, [reporters, value]);

  const getInitials = (name: string) => {
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleSelect = useCallback(
    (reporter: Reporter) => {
      if (reporter.licenseSelectable === false) return;
      onChange(reporter.id === value ? null : reporter.id);
      setOpen(false);
      setSearchQuery("");
    },
    [value, onChange],
  );

  const selectedBlocked = selectedReporter?.licenseSelectable === false;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" data-testid="label-reporter">
        المراسل
      </label>

      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
              disabled={disabled || lockedToSingle}
              data-testid="button-reporter-select"
            >
              {selectedReporter ? (
                <div className={cn("flex items-center gap-2", selectedBlocked && "opacity-40")}>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={selectedReporter.avatarUrl || undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(selectedReporter.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">{selectedReporter.name}</span>
                </div>
              ) : value && isLoadingSelected ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جاري التحميل...</span>
                </div>
              ) : (
                <span className="text-muted-foreground">اختر المراسل...</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start" dir="rtl">
            <Command shouldFilter={false} dir="rtl">
              <div className="relative">
                <CommandInput
                  placeholder="اكتب اسم المراسل للبحث..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  data-testid="input-reporter-search"
                  className="pr-10"
                />
                {(isLoading || isFetching) && (
                  <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <CommandList className="max-h-[300px]">
                {isLoading ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
                    جاري التحميل...
                  </div>
                ) : reporters.length === 0 ? (
                  <CommandEmpty data-testid="text-no-reporters">
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Search className="h-8 w-8 text-muted-foreground/50" />
                      <p>لا يوجد نتائج لـ "{searchQuery}"</p>
                      <p className="text-xs text-muted-foreground">جرّب كتابة جزء من الاسم</p>
                    </div>
                  </CommandEmpty>
                ) : (
                  <CommandGroup heading={`${reporters.length} مراسل`}>
                    {reporters.map((reporter) => {
                      const blocked = reporter.licenseSelectable === false;
                      return (
                      <CommandItem
                        key={reporter.id}
                        value={reporter.id}
                        disabled={blocked}
                        onSelect={() => handleSelect(reporter)}
                        className={cn(
                          "cursor-pointer",
                          blocked && "opacity-40 cursor-not-allowed pointer-events-none",
                        )}
                        data-testid={`item-reporter-${reporter.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <Avatar className={cn("h-8 w-8", blocked && "grayscale")}>
                            <AvatarImage src={reporter.avatarUrl || undefined} />
                            <AvatarFallback className="text-xs bg-primary/10">
                              {getInitials(reporter.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col items-start min-w-0 flex-1">
                            <span className="text-sm font-medium truncate w-full">
                              {reporter.name}
                            </span>
                            <span className="text-xs text-muted-foreground truncate w-full">
                              {blocked ? "بلا ترخيص مهني ساري — غير متاح" : reporter.email}
                            </span>
                          </div>
                        </div>
                        <Check
                          className={cn(
                            "ml-auto h-4 w-4 shrink-0",
                            value === reporter.id ? "opacity-100 text-primary" : "opacity-0",
                          )}
                        />
                      </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {value && !disabled && !lockedToSingle && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onChange(null);
              setSearchQuery("");
            }}
            className="shrink-0"
            data-testid="button-clear-reporter"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground" data-testid="text-reporter-helper">
        {selectedBlocked
          ? "هذا المراسل بلا ترخيص مهني ساري — اختر مراسلاً مرخّصاً أو جدّد الترخيص قبل الإرسال."
          : isPublisherAccount
            ? "أخبار الوكالة تُنشر باسم صحيفة سبق فقط."
            : isReporterOnly
              ? "سيتم نشر الخبر باسمك كمراسل."
              : "اكتب اسم المراسل للبحث السريع، أو اختر من القائمة."}
      </p>
    </div>
  );
}
