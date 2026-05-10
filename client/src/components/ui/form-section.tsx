import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface FormSectionProps {
  title: string
  description?: string
  icon?: LucideIcon
  children: React.ReactNode
  className?: string
}

export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: FormSectionProps) {
  return (
    <div className={cn("form-section", className)}>
      <div className="form-section-header">
        {Icon && (
          <div className="form-section-icon">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <h3 className="form-section-title">{title}</h3>
          {description && (
            <p className="form-section-description">{description}</p>
          )}
        </div>
      </div>
      <div className="form-field-group">
        {children}
      </div>
    </div>
  )
}

interface FormFieldRowProps {
  children: React.ReactNode
  columns?: 1 | 2 | 3 | 4
  className?: string
}

export function FormFieldRow({
  children,
  columns = 2,
  className,
}: FormFieldRowProps) {
  const colsClass = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 md:grid-cols-4",
  }

  return (
    <div className={cn("grid gap-4", colsClass[columns], className)}>
      {children}
    </div>
  )
}

interface FormHelperTextProps {
  children: React.ReactNode
  className?: string
  inline?: boolean
}

export function FormHelperText({
  children,
  className,
  inline = false,
}: FormHelperTextProps) {
  return (
    <span
      className={cn(
        inline ? "form-helper-text-inline" : "form-helper-text",
        className
      )}
    >
      {children}
    </span>
  )
}
