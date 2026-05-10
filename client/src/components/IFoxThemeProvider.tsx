/**
 * iFox Dashboard Theme Provider
 * Applies OKLCH-based modern SaaS dashboard theme
 * Only for iFox admin dashboard (/admin/ifox/*)
 */

interface IFoxThemeProviderProps {
  children: React.ReactNode;
}

export function IFoxThemeProvider({ children }: IFoxThemeProviderProps) {
  return (
    <div className="ifox-theme min-h-screen" data-testid="ifox-theme-wrapper">
      {children}
    </div>
  );
}
