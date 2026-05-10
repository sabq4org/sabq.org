import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "../../shared/schema.js";

export async function bootstrapAdmin(db: NeonDatabase<typeof schema>) {
  const adminEmail = "admin@sabq.sa";
  const adminPassword = "admin123";
  const adminUserId = "admin-sabq";

  console.log(`[Bootstrap] Creating admin user: ${adminEmail}`);

  // Check if user already exists
  const existingUsers = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .limit(1);

  if (existingUsers.length > 0) {
    console.log("[Bootstrap] Admin user already exists");
  }

  // Hash password
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Create or update admin user
  const [adminUser] = await db
    .insert(schema.users)
    .values({
      id: adminUserId,
      email: adminEmail,
      passwordHash: passwordHash,
      firstName: "مسؤول",
      lastName: "النظام",
      status: "active",
      isProfileComplete: true,
      role: "admin",
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: {
        email: adminEmail,
        passwordHash: passwordHash,
        firstName: "مسؤول",
        lastName: "النظام",
        status: "active",
        isProfileComplete: true,
        role: "admin",
      },
    })
    .returning();

  console.log(`[Bootstrap] Admin user created/updated: ${adminUser.email}`);

  // Get all roles
  const allRoles = await db.select().from(schema.roles);

  // Assign system_admin role
  const systemAdminRole = allRoles.find(r => r.name === "system_admin");
  if (systemAdminRole) {
    await db
      .insert(schema.userRoles)
      .values({
        userId: adminUserId,
        roleId: systemAdminRole.id,
      })
      .onConflictDoNothing();
    console.log("[Bootstrap] Assigned system_admin role");
  }

  // Assign admin role
  const adminRole = allRoles.find(r => r.name === "admin");
  if (adminRole) {
    await db
      .insert(schema.userRoles)
      .values({
        userId: adminUserId,
        roleId: adminRole.id,
      })
      .onConflictDoNothing();
    console.log("[Bootstrap] Assigned admin role");
  }

  return {
    success: true,
    email: adminEmail,
    password: adminPassword,
  };
}
