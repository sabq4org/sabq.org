import { ReactNode } from "react";

interface UserContentProps {
  children: ReactNode;
  as?: "div" | "p" | "span" | "article" | "section";
  className?: string;
  "data-testid"?: string;
  [key: string]: any;
}

/**
 * Wrapper component for user-generated content
 * Automatically handles bidirectional text (dir="auto") for mixed-language content
 * 
 * Use this for:
 * - Comments
 * - User bios
 * - Article content (if multilingual)
 * - Any text input from users
 */
export function UserContent({ 
  children, 
  as: Component = "div",
  className = "",
  "data-testid": testId,
  ...props
}: UserContentProps) {
  return (
    <Component
      dir="auto"
      className={className}
      data-testid={testId}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Detect if text contains RTL characters
 */
export function isRTL(text: string): boolean {
  const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlChars.test(text);
}

/**
 * Get text direction for a given string
 */
export function getTextDirection(text: string): "ltr" | "rtl" | "auto" {
  if (!text || text.trim().length === 0) return "auto";
  
  const firstChar = text.trim()[0];
  const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  
  if (rtlChars.test(firstChar)) {
    return "rtl";
  }
  
  // Check if text is predominantly RTL
  const rtlCount = (text.match(rtlChars) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  
  if (rtlCount / totalChars > 0.3) {
    return "rtl";
  }
  
  return "ltr";
}
