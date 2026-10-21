import * as React from "react"

/**
 * لوحي باللمس (آيباد وما يشبهه): مؤشر لمسي وعرض 768px فأكثر وارتفاع 600px فأكثر
 * (الجوال الأفقي أقصر من ذلك). الجوال وسطح المكتب لا يطابقانه. يطابق شرط `mobile.css`.
 */
export const TOUCH_TABLET_QUERY = "(pointer: coarse) and (min-width: 768px) and (min-height: 600px)"

export function useIsTouchTablet(query: string = TOUCH_TABLET_QUERY) {
  const [matches, setMatches] = React.useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  )

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener("change", onChange)
    onChange()
    return () => mql.removeEventListener("change", onChange)
  }, [query])

  return matches
}
