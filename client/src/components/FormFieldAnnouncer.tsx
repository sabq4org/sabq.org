import { useEffect, useRef } from "react";
import { useAnnounce } from "@/contexts/LiveRegionContext";

type FormFieldAnnouncerProps = {
  error?: string;
  success?: string;
  loading?: boolean;
  fieldName?: string;
};

/**
 * FormFieldAnnouncer - Announces form field states to screen readers
 * 
 * Usage:
 * ```tsx
 * <FormField>
 *   <FormControl>
 *     <Input {...field} />
 *   </FormControl>
 *   <FormFieldAnnouncer 
 *     error={form.formState.errors.email?.message}
 *     fieldName="البريد الإلكتروني"
 *   />
 *   <FormMessage />
 * </FormField>
 * ```
 */
export function FormFieldAnnouncer({
  error,
  success,
  loading,
  fieldName,
}: FormFieldAnnouncerProps) {
  const { announcePolite, announceAssertive } = useAnnounce();
  const previousError = useRef<string | undefined>();
  const previousSuccess = useRef<string | undefined>();

  useEffect(() => {
    // Announce errors assertively (interrupts screen reader)
    if (error && error !== previousError.current) {
      const message = fieldName 
        ? `خطأ في ${fieldName}: ${error}`
        : `خطأ: ${error}`;
      announceAssertive(message);
      previousError.current = error;
    }
  }, [error, fieldName, announceAssertive]);

  useEffect(() => {
    // Announce success messages politely (doesn't interrupt)
    if (success && success !== previousSuccess.current) {
      const message = fieldName
        ? `${fieldName}: ${success}`
        : success;
      announcePolite(message);
      previousSuccess.current = success;
    }
  }, [success, fieldName, announcePolite]);

  useEffect(() => {
    // Announce loading states
    if (loading && fieldName) {
      announcePolite(`جاري التحقق من ${fieldName}...`);
    }
  }, [loading, fieldName, announcePolite]);

  return null; // This component doesn't render anything
}
