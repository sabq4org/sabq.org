import { useToast } from "@/hooks/use-toast"
import { useAnnounce } from "@/contexts/LiveRegionContext"
import { useEffect, useRef } from "react"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

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
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
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
