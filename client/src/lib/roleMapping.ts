import type { UserRole } from "@/nav/types";

export const roleMapping: Record<string, UserRole> = {
  'system_admin': 'admin',
  'superadmin': 'admin',
  'super_admin': 'admin',
  'admin': 'admin',
  'content_manager': 'content_manager',
  'chief_editor': 'editor',
  'senior_editor': 'editor',
  'publisher': 'editor',
  'editor': 'editor',
  'writer': 'author',
  'content_creator': 'author',
  'author': 'author',
  'agency': 'author',
  'reporter': 'reporter',
  'opinion_author': 'opinion_author',
  'angle_writer': 'angle_writer',
  'moderator': 'reviewer',
  'comments_moderator': 'comments_moderator',
  'analyst': 'analyst',
  'advertiser': 'advertiser',
  'reviewer': 'reviewer',
  'reader': 'guest',
};

export function resolveUserRole(highestRole: string | null | undefined): UserRole {
  if (!highestRole) return 'guest';
  return roleMapping[highestRole] || 'guest';
}
