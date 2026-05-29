import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Returns whether the viewport is narrower than `breakpoint` (default 768px).
 *
 * The initial state is read synchronously from `window` so the very first
 * render is already correct on the client. This matters for viewport-gated
 * rendering (e.g. choosing the mobile vs desktop layout): a wrong first value
 * would briefly mount the desktop tree on a phone — and any eager images in it
 * would start downloading before the corrective re-render. This app is a
 * client-only SPA (no SSR hydration), so reading `window` at init is safe.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return isMobile
}
