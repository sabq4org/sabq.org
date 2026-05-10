// RBAC seed data - Roles and Permissions
import { db } from "./db";
import { roles, permissions, rolePermissions, userRoles } from "@shared/schema";

export async function seedRBAC() {
  console.log("🔐 Seeding RBAC (Roles & Permissions)...");

  // 1. Define all permissions
  const permissionsData = [
    // Articles permissions
    { code: "articles.view", label: "View Articles", labelAr: "عرض المقالات", module: "articles" },
    { code: "articles.create", label: "Create Articles", labelAr: "إنشاء المقالات", module: "articles" },
    { code: "articles.edit_own", label: "Edit Own Articles", labelAr: "تعديل المقالات الخاصة", module: "articles" },
    { code: "articles.edit_any", label: "Edit Any Article", labelAr: "تعديل أي مقال", module: "articles" },
    { code: "articles.publish", label: "Publish Articles", labelAr: "نشر المقالات", module: "articles" },
    { code: "articles.unpublish", label: "Unpublish Articles", labelAr: "إلغاء نشر المقالات", module: "articles" },
    { code: "articles.delete", label: "Delete Articles", labelAr: "حذف المقالات", module: "articles" },
    { code: "articles.archive", label: "Archive Articles", labelAr: "أرشفة المقالات", module: "articles" },
    { code: "articles.feature", label: "Feature Articles", labelAr: "تمييز المقالات", module: "articles" },

    // Categories permissions
    { code: "categories.view", label: "View Categories", labelAr: "عرض التصنيفات", module: "categories" },
    { code: "categories.create", label: "Create Categories", labelAr: "إنشاء التصنيفات", module: "categories" },
    { code: "categories.update", label: "Update Categories", labelAr: "تعديل التصنيفات", module: "categories" },
    { code: "categories.delete", label: "Delete Categories", labelAr: "حذف التصنيفات", module: "categories" },

    // Users permissions
    { code: "users.view", label: "View Users", labelAr: "عرض المستخدمين", module: "users" },
    { code: "users.create", label: "Create Users", labelAr: "إنشاء المستخدمين", module: "users" },
    { code: "users.update", label: "Update Users", labelAr: "تعديل المستخدمين", module: "users" },
    { code: "users.delete", label: "Delete Users", labelAr: "حذف المستخدمين", module: "users" },
    { code: "users.suspend", label: "Suspend Users", labelAr: "تعليق المستخدمين", module: "users" },
    { code: "users.ban", label: "Ban Users", labelAr: "حظر المستخدمين", module: "users" },
    { code: "users.change_role", label: "Change User Roles", labelAr: "تغيير أدوار المستخدمين", module: "users" },

    // Comments permissions
    { code: "comments.view", label: "View Comments", labelAr: "عرض التعليقات", module: "comments" },
    { code: "comments.approve", label: "Approve Comments", labelAr: "الموافقة على التعليقات", module: "comments" },
    { code: "comments.reject", label: "Reject Comments", labelAr: "رفض التعليقات", module: "comments" },
    { code: "comments.delete", label: "Delete Comments", labelAr: "حذف التعليقات", module: "comments" },
    { code: "comments.restore", label: "Restore Comments", labelAr: "استعادة التعليقات", module: "comments" },

    // Staff permissions
    { code: "staff.view", label: "View Staff", labelAr: "عرض الكادر", module: "staff" },
    { code: "staff.create", label: "Create Staff", labelAr: "إضافة أعضاء الكادر", module: "staff" },
    { code: "staff.update", label: "Update Staff", labelAr: "تعديل الكادر", module: "staff" },
    { code: "staff.delete", label: "Delete Staff", labelAr: "حذف أعضاء الكادر", module: "staff" },

    // System permissions
    { code: "system.manage_roles", label: "Manage Roles", labelAr: "إدارة الأدوار", module: "system" },
    { code: "system.manage_settings", label: "Manage Settings", labelAr: "إدارة الإعدادات", module: "system" },
    { code: "system.view_logs", label: "View Activity Logs", labelAr: "عرض سجلات النشاط", module: "system" },
    { code: "system.manage_themes", label: "Manage Themes", labelAr: "إدارة الثيمات", module: "system" },

    // Muqtarab permissions
    { code: "muqtarab.manage", label: "Manage Muqtarab Angles", labelAr: "إدارة زوايا مُقترب", module: "muqtarab" },
    { code: "muqtarab.publish", label: "Publish Muqtarab Angles", labelAr: "نشر زوايا مُقترب", module: "muqtarab" },

    // Mirqab permissions (المرقاب - Future Forecasting)
    { code: "mirqab.view", label: "View Mirqab", labelAr: "عرض المرقاب", module: "mirqab" },
    { code: "mirqab.create", label: "Create Mirqab Content", labelAr: "إنشاء محتوى المرقاب", module: "mirqab" },
    { code: "mirqab.edit", label: "Edit Mirqab Content", labelAr: "تعديل محتوى المرقاب", module: "mirqab" },
    { code: "mirqab.delete", label: "Delete Mirqab Content", labelAr: "حذف محتوى المرقاب", module: "mirqab" },
    { code: "mirqab.publish", label: "Publish Mirqab Content", labelAr: "نشر محتوى المرقاب", module: "mirqab" },
    { code: "mirqab.manage_settings", label: "Manage Mirqab Settings", labelAr: "إدارة إعدادات المرقاب", module: "mirqab" },

    // Shorts permissions (سبق قصير - Vertical Video Reels)
    { code: "shorts:view", label: "View Shorts", labelAr: "عرض الشورتس", module: "shorts" },
    { code: "shorts:create", label: "Create Shorts", labelAr: "إنشاء الشورتس", module: "shorts" },
    { code: "shorts:edit", label: "Edit Shorts", labelAr: "تعديل الشورتس", module: "shorts" },
    { code: "shorts:delete", label: "Delete Shorts", labelAr: "حذف الشورتس", module: "shorts" },
    { code: "shorts:manage", label: "Manage Shorts", labelAr: "إدارة الشورتس", module: "shorts" },

    // Calendar permissions (تقويم سبق - Editorial Calendar)
    { code: "calendar:view", label: "View Calendar", labelAr: "عرض التقويم", module: "calendar" },
    { code: "calendar:create", label: "Create Calendar Events", labelAr: "إنشاء أحداث التقويم", module: "calendar" },
    { code: "calendar:edit", label: "Edit Calendar Events", labelAr: "تعديل أحداث التقويم", module: "calendar" },
    { code: "calendar:delete", label: "Delete Calendar Events", labelAr: "حذف أحداث التقويم", module: "calendar" },
    { code: "calendar:assign_tasks", label: "Assign Calendar Tasks", labelAr: "تعيين مهام التقويم", module: "calendar" },
    { code: "calendar:generate_ai", label: "Generate AI Content", labelAr: "توليد محتوى ذكي", module: "calendar" },

    // Task Management permissions (مركز المهام - Task Center)
    { code: "tasks.view_all", label: "View All Tasks", labelAr: "عرض جميع المهام", module: "tasks" },
    { code: "tasks.view_own", label: "View Own Tasks", labelAr: "عرض المهام الخاصة فقط", module: "tasks" },
    { code: "tasks.create", label: "Create Tasks", labelAr: "إنشاء مهام جديدة", module: "tasks" },
    { code: "tasks.edit_own", label: "Edit Own Tasks", labelAr: "تعديل المهام الخاصة", module: "tasks" },
    { code: "tasks.edit_any", label: "Edit Any Task", labelAr: "تعديل أي مهمة", module: "tasks" },
    { code: "tasks.delete_own", label: "Delete Own Tasks", labelAr: "حذف المهام الخاصة", module: "tasks" },
    { code: "tasks.delete_any", label: "Delete Any Task", labelAr: "حذف أي مهمة", module: "tasks" },
    { code: "tasks.assign", label: "Assign Tasks", labelAr: "تعيين مهام للآخرين", module: "tasks" },
    { code: "tasks.view_analytics", label: "View Task Analytics", labelAr: "عرض تحليلات المهام", module: "tasks" },
  ];

  const insertedPermissions = await db
    .insert(permissions)
    .values(permissionsData)
    .onConflictDoNothing()
    .returning();

  console.log(`✅ Created ${insertedPermissions.length} permissions`);

  // Get all permissions for mapping
  const allPermissions = await db.select().from(permissions);

  // 2. Define roles
  const rolesData = [
    {
      name: "system_admin",
      nameAr: "مدير النظام",
      description: "Full system access with all permissions",
      isSystem: true,
    },
    {
      name: "admin",
      nameAr: "مدير عام",
      description: "Administrative access to most features",
      isSystem: false,
    },
    {
      name: "editor",
      nameAr: "محرر",
      description: "Can create, edit, and publish content",
      isSystem: false,
    },
    {
      name: "reporter",
      nameAr: "مراسل",
      description: "Can create and edit own articles",
      isSystem: false,
    },
    {
      name: "comments_moderator",
      nameAr: "مشرف تعليقات",
      description: "Can moderate comments",
      isSystem: false,
    },
    {
      name: "opinion_author",
      nameAr: "كاتب مقال رأي",
      description: "Can write and manage opinion articles",
      isSystem: false,
    },
    {
      name: "reader",
      nameAr: "قارئ",
      description: "Basic reader access",
      isSystem: false,
    },
  ];

  const insertedRoles = await db
    .insert(roles)
    .values(rolesData)
    .onConflictDoNothing()
    .returning();

  console.log(`✅ Created ${insertedRoles.length} roles`);

  // Get all roles for mapping
  const allRoles = await db.select().from(roles);

  // 3. Map roles to permissions
  const rolePermissionsMap: Record<string, string[]> = {
    system_admin: allPermissions.map(p => p.code), // All permissions
    
    admin: [
      "articles.view", "articles.create", "articles.edit_any", "articles.publish", 
      "articles.unpublish", "articles.delete", "articles.archive", "articles.feature",
      "categories.view", "categories.create", "categories.update", "categories.delete",
      "users.view", "users.update", "users.suspend", "users.change_role",
      "comments.view", "comments.approve", "comments.reject", "comments.delete",
      "staff.view", "staff.create", "staff.update", "staff.delete",
      "system.view_logs", "system.manage_themes",
      "muqtarab.manage", "muqtarab.publish",
      "mirqab.view", "mirqab.create", "mirqab.edit", "mirqab.delete", "mirqab.publish", "mirqab.manage_settings",
      "shorts:view", "shorts:create", "shorts:edit", "shorts:delete", "shorts:manage",
      "calendar:view", "calendar:create", "calendar:edit", "calendar:delete", "calendar:assign_tasks", "calendar:generate_ai",
      "tasks.view_all", "tasks.create", "tasks.edit_any", "tasks.delete_any", "tasks.assign", "tasks.view_analytics",
    ],
    
    editor: [
      "articles.view", "articles.create", "articles.edit_any", "articles.publish",
      "articles.unpublish", "articles.archive", "articles.feature",
      "categories.view", "categories.create", "categories.update", "categories.delete",
      "users.view",
      "comments.view", "comments.approve", "comments.reject",
      "staff.view",
      "muqtarab.manage", "muqtarab.publish",
      "mirqab.view", "mirqab.create", "mirqab.edit", "mirqab.publish",
      "shorts:view", "shorts:create", "shorts:edit", "shorts:manage",
      "calendar:view", "calendar:create", "calendar:edit", "calendar:assign_tasks", "calendar:generate_ai",
      "tasks.view_all", "tasks.create", "tasks.edit_any", "tasks.assign", "tasks.view_analytics",
    ],
    
    reporter: [
      "articles.view", "articles.create", "articles.edit_own",
      "tasks.view_own", "tasks.create", "tasks.edit_own",
    ],
    
    comments_moderator: [
      "comments.view", "comments.approve", "comments.reject", "comments.delete", "comments.restore",
      "articles.view",
    ],
    
    opinion_author: [
      "articles.view", "articles.create", "articles.edit_own",
      "categories.view",
      "tasks.view_own", "tasks.create", "tasks.edit_own",
    ],
    
    reader: [
      "articles.view",
      "categories.view",
    ],
  };

  // Insert role-permission mappings
  const rolePermissionValues: { roleId: string; permissionId: string }[] = [];

  for (const [roleName, permissionCodes] of Object.entries(rolePermissionsMap)) {
    const role = allRoles.find(r => r.name === roleName);
    if (!role) continue;

    for (const permCode of permissionCodes) {
      const permission = allPermissions.find(p => p.code === permCode);
      if (permission) {
        rolePermissionValues.push({
          roleId: role.id,
          permissionId: permission.id,
        });
      }
    }
  }

  if (rolePermissionValues.length > 0) {
    await db
      .insert(rolePermissions)
      .values(rolePermissionValues)
      .onConflictDoNothing();

    console.log(`✅ Created ${rolePermissionValues.length} role-permission mappings`);
  }

  return { allRoles, allPermissions };
}
