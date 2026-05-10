import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { 
  ROLE_PERMISSIONS_MAP, 
  PERMISSION_LABELS_AR,
  PERMISSION_CODES
} from "@shared/rbac-constants";

interface PermissionMatrixProps {
  selectedRoleIds: string[];
}

interface Role {
  id: string;
  name: string;
  nameAr: string;
}

export function PermissionMatrix({ selectedRoleIds }: PermissionMatrixProps) {
  const { data: rolesRaw, isLoading } = useQuery<Role[]>({
    queryKey: ["/api/admin/roles"],
    enabled: selectedRoleIds.length > 0,
    queryFn: async () => {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
  const roles = Array.isArray(rolesRaw) ? rolesRaw : [];

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="permission-matrix-loading">
        <p className="text-sm text-muted-foreground">جاري تحميل الصلاحيات...</p>
      </div>
    );
  }

  if (selectedRoleIds.length === 0) {
    return (
      <div className="space-y-2" data-testid="permission-matrix-empty">
        <p className="text-sm text-muted-foreground">
          لا توجد أدوار محددة
        </p>
      </div>
    );
  }

  const selectedRoles = roles?.filter(role => selectedRoleIds.includes(role.id)) || [];
  
  const allPermissions = new Set<string>();
  for (const role of selectedRoles) {
    const permissions = ROLE_PERMISSIONS_MAP[role.name] || [];
    
    if (permissions.includes("*")) {
      Object.values(PERMISSION_CODES).forEach(p => allPermissions.add(p));
      break;
    }
    
    permissions.forEach(p => allPermissions.add(p));
  }

  if (allPermissions.size === 0) {
    return (
      <div className="space-y-2" data-testid="permission-matrix-no-permissions">
        <p className="text-sm text-muted-foreground">
          لا توجد صلاحيات لهذه الأدوار
        </p>
      </div>
    );
  }

  const permissionsByModule: Record<string, string[]> = {};
  
  allPermissions.forEach(permission => {
    const module = permission.split('.')[0];
    if (!permissionsByModule[module]) {
      permissionsByModule[module] = [];
    }
    permissionsByModule[module].push(permission);
  });

  const moduleLabels: Record<string, string> = {
    articles: "المقالات",
    categories: "التصنيفات",
    users: "المستخدمون",
    comments: "التعليقات",
    media: "الوسائط",
    settings: "الإعدادات",
    analytics: "التحليلات",
    tags: "الوسوم",
    system: "النظام",
  };

  return (
    <div className="space-y-4" data-testid="permission-matrix" dir="rtl">
      <div className="space-y-3">
        <h4 className="text-sm font-medium" data-testid="permission-matrix-title">
          الصلاحيات المجمّعة ({allPermissions.size})
        </h4>
        
        {Object.entries(permissionsByModule).map(([module, permissions]) => (
          <div key={module} className="space-y-2" data-testid={`permission-module-${module}`}>
            <h5 className="text-xs font-semibold text-muted-foreground">
              {moduleLabels[module] || module}
            </h5>
            <div className="flex flex-wrap gap-2">
              {permissions.map(permission => (
                <Badge 
                  key={permission} 
                  variant="secondary"
                  className="gap-1"
                  data-testid={`permission-badge-${permission}`}
                >
                  <Check className="h-3 w-3" data-testid={`permission-icon-${permission}`} />
                  <span>{PERMISSION_LABELS_AR[permission] || permission}</span>
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
