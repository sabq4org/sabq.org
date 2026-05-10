import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[100px] w-full rounded-lg border-2 border-border bg-background/80 px-3 py-3 text-base transition-all duration-200",
        "ring-offset-background",
        "placeholder:text-muted-foreground/70 placeholder:italic placeholder:text-sm",
        "hover:border-primary/40 hover:bg-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:border-primary focus-visible:bg-background",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/30",
        "md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
