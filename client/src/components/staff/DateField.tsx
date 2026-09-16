// حقل تاريخ سلس — قوائم منسدلة سريعة للسنة والشهر (react-day-picker
// captionLayout) بدل تقويم المتصفح المتعب، ويعمل بنفس السلاسة على
// متصفحات الجوال. القيمة تدور كسلسلة yyyy-MM-dd.

import { useState } from "react";
import { format, parse } from "date-fns";
import { ar } from "date-fns/locale";
import { CalendarIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DateField({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  fromYear = 1940,
  toYear = 2040,
  className = "",
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  fromYear?: number;
  toYear?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parse(value.slice(0, 10), "yyyy-MM-dd", new Date()) : undefined;
  const valid = selected && !Number.isNaN(selected.getTime());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-start gap-2 font-normal ${!valid ? "text-muted-foreground" : ""} ${className}`}
        >
          <CalendarIcon className="h-4 w-4 opacity-60" />
          {valid ? format(selected!, "d MMMM yyyy", { locale: ar }) : placeholder}
          {valid && (
            <X
              className="mr-auto h-3.5 w-3.5 opacity-50 hover:opacity-100"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" dir="rtl">
        <Calendar
          mode="single"
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
          locale={ar}
          dir="rtl"
          selected={valid ? selected : undefined}
          defaultMonth={valid ? selected : undefined}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
