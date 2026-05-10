import { Fragment } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Home } from "lucide-react";
import { useNav } from "@/nav/useNav";
import type { UserRole } from "@/nav/types";

interface AppBreadcrumbsProps {
  role: UserRole;
  flags: Record<string, boolean>;
}

/**
 * مكون مسار التنقل المتزامن مع شجرة القائمة
 * Breadcrumbs component synchronized with navigation tree
 */
export function AppBreadcrumbs({ role, flags }: AppBreadcrumbsProps) {
  const [pathname] = useLocation();
  const { activeItem, parents } = useNav({ role, flags, pathname });

  // لا تعرض شيء إذا لم يكن هناك عنصر نشط
  // Don't show anything if no active item
  if (!activeItem) {
    return null;
  }

  // Determine language from pathname
  const isUrdu = pathname.startsWith('/ur/');
  const isEnglish = pathname.startsWith('/en/');
  const isArabic = !isUrdu && !isEnglish; // Default to Arabic

  // Get appropriate label based on language
  const getLabel = (item: any) => {
    if (isUrdu) return item.labelUr || item.labelEn || item.labelKey;
    if (isEnglish) return item.labelEn || item.labelKey;
    return item.labelAr || item.labelKey;
  };

  // Home label in different languages
  const homeLabel = isUrdu ? "ہوم" : isEnglish ? "Home" : "الرئيسية";
  const homePath = isUrdu ? "/ur/dashboard" : isEnglish ? "/en/dashboard" : "/dashboard";

  // بناء المسار: الصفحة الرئيسية + الآباء + العنصر النشط
  // Build path: Home + Parents + Active Item
  const breadcrumbItems = [
    { id: "home", label: homeLabel, path: homePath, icon: Home },
    ...parents.map(parent => ({
      id: parent.id,
      label: getLabel(parent),
      path: parent.path,
    })),
    {
      id: activeItem.id,
      label: getLabel(activeItem),
      path: activeItem.path,
    },
  ];

  return (
    <nav aria-label="مسار التنقل" className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
      {breadcrumbItems.map((item, index) => {
        const isLast = index === breadcrumbItems.length - 1;
        const Icon = index === 0 ? Home : null;

        return (
          <Fragment key={item.id}>
            {index > 0 && (
              <ChevronLeft className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            )}
            {isLast ? (
              <span 
                className="font-medium text-foreground flex items-center gap-2"
                aria-current="page"
              >
                {Icon && <Icon className="h-4 w-4" />}
                {item.label}
              </span>
            ) : (
              <Link 
                href={item.path || homePath}
                className="hover:text-foreground transition-colors flex items-center gap-2"
              >
                {Icon && <Icon className="h-4 w-4" />}
                {item.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
