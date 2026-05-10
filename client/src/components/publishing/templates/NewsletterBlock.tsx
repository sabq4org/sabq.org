import { Mail } from "lucide-react";

interface NewsletterBlockProps {
  title?: string;
  description?: string;
  accent?: string;
  buttonText?: string;
}

export default function NewsletterBlock({ title, description, accent, buttonText }: NewsletterBlockProps) {
  return (
    <section
      dir="rtl"
      className="w-full p-8 rounded-lg border-2 border-dashed border-border bg-muted/30"
      data-testid="template-newsletter-block"
    >
      <div className="flex flex-col items-center justify-center gap-4 text-center">
        <Mail className="w-12 h-12 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {title || "قريباً: نموذج النشرة البريدية"}
          </h3>
          <p className="text-sm text-muted-foreground">
            هذا التمبلت قيد التطوير حالياً
          </p>
        </div>
      </div>
    </section>
  );
}
