import { useToast } from "@/hooks/use-toast"
import { useAnnounce } from "@/contexts/LiveRegionContext"
import { useEffect, useRef } from "react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastSuccessIcon,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

// Arabic toasts follow a very consistent convention: completion/success
// messages contain تمّ/تمت/نجح/بنجاح/اكتمل (or ✓/✅), while failures contain
// خطأ/فشل/تعذّر/❌. So instead of editing ~640 success callsites, we detect
// success centrally and render the green "تم بنجاح" style + check badge.
// Explicit `variant` always wins, and destructive (errors) is never touched.
const ERROR_HINT = /فشل|خطأ|تعذّر|تعذر|لم يتم|لم تتم|غير صالح|غير صحيح|❌|⚠️/;
const SUCCESS_HINT = /تمّ|تمت|(?:^|\s)تم(?:\s|$)|نجح|بنجاح|اكتمل|أُضيف|✅|✓|☑/;

function resolveToastVariant(
  variant: string | null | undefined,
  title: unknown,
  description: unknown,
): "default" | "success" | "destructive" {
  if (variant === "destructive") return "destructive";
  if (variant === "success") return "success";
  if (variant && variant !== "default") return "default";
  const text = [
    typeof title === "string" ? title : "",
    typeof description === "string" ? description : "",
  ].join(" ");
  if (!ERROR_HINT.test(text) && SUCCESS_HINT.test(text)) return "success";
  return "default";
}

export function Toaster() {
  const { toasts } = useToast()
  const { announce } = useAnnounce()
  const announcedToastIds = useRef<Set<string>>(new Set())

  // Announce new toasts to screen readers (only once per toast)
  useEffect(() => {
    toasts.forEach((toast) => {
      // Only announce if toast is open AND hasn't been announced before
      if (toast.open && !announcedToastIds.current.has(toast.id)) {
        const message = [
          toast.title,
          toast.description,
        ]
          .filter(Boolean)
          .join(". ");
        
        if (message) {
          // Use assertive for destructive toasts, polite for others
          const priority = toast.variant === "destructive" ? "assertive" : "polite";
          announce(message, priority);
          
          // Mark this toast as announced
          announcedToastIds.current.add(toast.id);
        }
      }
      
      // Clean up closed toasts from tracking
      if (!toast.open && announcedToastIds.current.has(toast.id)) {
        announcedToastIds.current.delete(toast.id);
      }
    });
  }, [toasts, announce]);

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const resolvedVariant = resolveToastVariant(variant, title, description)
        return (
          <Toast key={id} variant={resolvedVariant} {...props}>
            <div className="flex items-start gap-3">
              {resolvedVariant === "success" && <ToastSuccessIcon />}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
