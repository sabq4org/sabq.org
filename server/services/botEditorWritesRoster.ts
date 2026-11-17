import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { roles, userRoles, users } from "@shared/schema";
import { SABQ_NEWSPAPER_ACCOUNT_ID } from "@shared/sabqNewspaper";

/** Active newsroom users eligible for either public author or reporter attribution. */
export function botEditorAssignableStaff() {
  const editorialRoles = ["admin", "editor", "content_manager", "reporter"];
  return and(eq(users.status, "active"), isNull(users.deletedAt), or(
    eq(users.id, SABQ_NEWSPAPER_ACCOUNT_ID),
    and(inArray(users.role, editorialRoles), sql`not exists (select 1 from ${userRoles} where ${userRoles.userId} = ${users.id})`),
    sql`exists (select 1 from ${userRoles} inner join ${roles} on ${roles.id} = ${userRoles.roleId} where ${userRoles.userId} = ${users.id} and ${roles.status} = 'active' and ${roles.name} in ('admin','editor','content_manager','reporter'))`,
  ));
}
