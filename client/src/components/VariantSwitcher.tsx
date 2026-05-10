import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme, type Variant } from "./ThemeProvider";

type VariantOption = {
  value: Variant;
  label: string;
  description: string;
  sample: string;
};

const VARIANT_OPTIONS: VariantOption[] = [
  {
    value: "ai-first",
    label: "ذكي (افتراضي)",
    description: "المظهر العصري المعتاد",
    sample: "سبق",
  },
  {
    value: "magazine",
    label: "مجلة",
    description: "خطوط كبيرة، زوايا حادة",
    sample: "سبق",
  },
  {
    value: "classic",
    label: "كلاسيكي",
    description: "جريدة تقليدية بلون أحمر",
    sample: "سبق",
  },
  {
    value: "terminal",
    label: "تيرمنال",
    description: "خط أحادي المسافة",
    sample: "سبق",
  },
];

export function VariantSwitcher() {
  const { variant, setVariant } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hover-elevate active-elevate-2"
          data-testid="button-variant-switcher"
          aria-label="تبديل النمط البصري"
        >
          <Palette className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">تبديل النمط البصري</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>النمط البصري</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {VARIANT_OPTIONS.map((option) => {
          const isActive = variant === option.value;
          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={(event) => {
                event.preventDefault();
                setVariant(option.value);
              }}
              data-variant={option.value}
              data-testid={`menu-variant-${option.value}`}
              className="flex items-start gap-3 py-2 cursor-pointer"
            >
              <VariantPreview sample={option.sample} />
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium truncate"
                  data-testid={`text-variant-label-${option.value}`}
                >
                  {option.label}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {option.description}
                </div>
              </div>
              <Check
                className={`mt-0.5 h-4 w-4 flex-shrink-0 text-primary ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden="true"
                data-testid={`icon-variant-active-${option.value}`}
              />
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VariantPreview({ sample }: { sample: string }) {
  return (
    <div
      className="flex items-center gap-1.5 shrink-0"
      data-testid="preview-variant"
      aria-hidden="true"
    >
      <span
        className="inline-block h-5 w-5 rounded-full border border-border"
        style={{ background: "hsl(var(--variant-primary))" }}
        data-testid="preview-variant-color"
      />
      <span
        className="inline-block min-w-[1.75rem] text-center text-sm leading-5"
        style={{
          fontFamily: "var(--variant-font-family)",
          color: "hsl(var(--variant-primary))",
        }}
        data-testid="preview-variant-font"
      >
        {sample}
      </span>
      <span
        className="inline-block h-5 w-5 border border-border bg-muted"
        style={{ borderRadius: "var(--variant-radius)" }}
        data-testid="preview-variant-radius"
      />
    </div>
  );
}

export default VariantSwitcher;
