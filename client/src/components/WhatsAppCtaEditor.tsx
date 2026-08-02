import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SiWhatsapp } from "react-icons/si";
import { MapPin, AlignEndVertical } from "lucide-react";
import type { WhatsAppCta } from "@shared/whatsappCta";
import {
  buildWhatsAppUrl,
  formatWhatsAppPhoneDisplay,
  normalizeWhatsAppPhone,
} from "@shared/whatsappCta";
import { useToast } from "@/hooks/use-toast";

export type WhatsAppCtaData = WhatsAppCta;

interface WhatsAppCtaEditorProps {
  value: WhatsAppCtaData | null;
  onChange: (value: WhatsAppCtaData | null) => void;
  onInsertInline?: (cta: WhatsAppCtaData) => boolean;
  disabled?: boolean;
}

const DEFAULT_PHRASE = "تواصل معنا عبر واتساب";

export function WhatsAppCtaEditor({
  value,
  onChange,
  onInsertInline,
  disabled = false,
}: WhatsAppCtaEditorProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(value?.enabled ?? false);
  const [phone, setPhone] = useState(value?.phone ?? "");
  const [phrase, setPhrase] = useState(value?.phrase ?? DEFAULT_PHRASE);
  const [message, setMessage] = useState(value?.message ?? "");
  const [placement, setPlacement] = useState<"end" | "inline">(value?.placement ?? "end");

  useEffect(() => {
    setEnabled(value?.enabled ?? false);
    setPhone(value?.phone ?? "");
    setPhrase(value?.phrase ?? DEFAULT_PHRASE);
    setMessage(value?.message ?? "");
    setPlacement(value?.placement ?? "end");
  }, [value]);

  const emit = (next: {
    enabled: boolean;
    phone: string;
    phrase: string;
    message: string;
    placement: "end" | "inline";
  }) => {
    if (!next.enabled) {
      onChange(null);
      return;
    }
    const digits = normalizeWhatsAppPhone(next.phone);
    onChange({
      enabled: true,
      phone: digits || next.phone.trim(),
      phrase: (next.phrase || DEFAULT_PHRASE).trim().slice(0, 120),
      message: next.message.trim() ? next.message.trim().slice(0, 500) : undefined,
      placement: next.placement,
    });
  };

  const handleToggle = (checked: boolean) => {
    setEnabled(checked);
    emit({ enabled: checked, phone, phrase, message, placement });
  };

  const previewUrl =
    enabled && normalizeWhatsAppPhone(phone)
      ? buildWhatsAppUrl(phone, message || undefined)
      : null;

  const handleInsert = () => {
    if (!onInsertInline) return;
    const digits = normalizeWhatsAppPhone(phone);
    if (!digits) {
      toast({
        title: "رقم غير صالح",
        description: "أدخل رقم واتساب صحيح (مثال: 0501234567)",
        variant: "destructive",
      });
      return;
    }
    const cta: WhatsAppCtaData = {
      enabled: true,
      phone: digits,
      phrase: (phrase || DEFAULT_PHRASE).trim().slice(0, 120),
      message: message.trim() ? message.trim().slice(0, 500) : undefined,
      placement: "inline",
    };
    setEnabled(true);
    setPlacement("inline");
    onChange(cta);
    const ok = onInsertInline(cta);
    if (ok) {
      toast({
        title: "تم الإدراج",
        description: "وُضع زر واتساب عند موضع المؤشر في النص",
      });
    } else {
      toast({
        title: "تعذّر الإدراج",
        description: "ضع المؤشر داخل المحرر ثم حاول مجدداً",
        variant: "destructive",
      });
    }
  };

  return (
    <Card data-testid="block-whatsapp-cta-editor">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base gap-3">
          <span className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
              <SiWhatsapp className="h-4 w-4 text-white" />
            </span>
            زر واتساب
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={disabled}
            data-testid="switch-whatsapp-cta"
          />
        </CardTitle>
      </CardHeader>
      {enabled && (
        <CardContent className="space-y-4 pt-0">
          <div className="space-y-2">
            <Label htmlFor="wa-phone">رقم الواتساب</Label>
            <Input
              id="wa-phone"
              dir="ltr"
              className="text-left"
              placeholder="0501234567 أو +966501234567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                emit({ enabled, phone: e.target.value, phrase, message, placement });
              }}
              disabled={disabled}
              data-testid="input-whatsapp-phone"
            />
            {normalizeWhatsAppPhone(phone) && (
              <p className="text-xs text-muted-foreground dir-ltr text-left">
                {formatWhatsAppPhoneDisplay(phone)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-phrase">العبارة الظاهرة</Label>
            <Input
              id="wa-phrase"
              placeholder={DEFAULT_PHRASE}
              value={phrase}
              maxLength={120}
              onChange={(e) => {
                setPhrase(e.target.value);
                emit({ enabled, phone, phrase: e.target.value, message, placement });
              }}
              disabled={disabled}
              data-testid="input-whatsapp-phrase"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-message">رسالة افتتاحية (اختياري)</Label>
            <Textarea
              id="wa-message"
              placeholder="مرحباً، تواصل بخصوص…"
              value={message}
              maxLength={500}
              rows={2}
              onChange={(e) => {
                setMessage(e.target.value);
                emit({ enabled, phone, phrase, message: e.target.value, placement });
              }}
              disabled={disabled}
              data-testid="input-whatsapp-message"
            />
            <p className="text-xs text-muted-foreground">
              تُفتح جاهزة في محادثة واتساب عند الضغط على الزر
            </p>
          </div>

          <div className="space-y-2">
            <Label>موضع الظهور</Label>
            <RadioGroup
              value={placement}
              onValueChange={(v) => {
                const next = v === "inline" ? "inline" : "end";
                setPlacement(next);
                emit({ enabled, phone, phrase, message, placement: next });
              }}
              disabled={disabled}
              className="gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="end" id="wa-place-end" data-testid="radio-whatsapp-end" />
                <AlignEndVertical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">نهاية الخبر</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/40">
                <RadioGroupItem value="inline" id="wa-place-inline" data-testid="radio-whatsapp-inline" />
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">داخل النص (عند المؤشر)</span>
              </label>
            </RadioGroup>
          </div>

          {placement === "inline" && onInsertInline && (
            <Button
              type="button"
              variant="outline"
              className="w-full border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10"
              onClick={handleInsert}
              disabled={disabled}
              data-testid="button-insert-whatsapp-cta"
            >
              <SiWhatsapp className="h-4 w-4 ml-2" />
              إدراج الزر عند موضع المؤشر
            </Button>
          )}

          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="whatsapp-cta-card block no-underline"
              data-testid="preview-whatsapp-cta"
            >
              <span className="whatsapp-cta-link">
                <span className="whatsapp-cta-glyph" aria-hidden="true" />
                <span className="whatsapp-cta-text">{phrase || DEFAULT_PHRASE}</span>
              </span>
            </a>
          )}
        </CardContent>
      )}
    </Card>
  );
}
