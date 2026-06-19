/**
 * Public Muqtarab writer profile — صفحة كاتب الزاوية.
 *
 * Angle writers are `users` with the `angle_writer` role (provisioned via the
 * Muqtarab self-service flow), not `staff` rows — so they have no reporter
 * slug and can't reuse /reporter/:slug. This service aggregates a writer's
 * public-facing identity (name/avatar/bio), the active angle(s) they manage,
 * and every published topic across those angles.
 *
 * Identity precedence mirrors storage.getAngleWriter: a `staff` row (if one
 * exists) overrides the bare `users` fields.
 *
 * Per ADR-001 all Drizzle access lives here; the route module is HTTP-only.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { angles, topics, users, staff } from "@shared/schema";

export type MuqtarabWriterAngle = {
  slug: string;
  nameAr: string;
  colorHex: string;
  iconKey: string;
  coverImageUrl: string | null;
};

export type MuqtarabWriterTopic = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  heroImageUrl: string | null;
  publishedAt: Date | null;
  viewCount: number;
  angleSlug: string;
  angleName: string;
  colorHex: string;
};

export type MuqtarabWriterProfile = {
  writer: { id: string; name: string; avatar: string | null; bio: string | null };
  angles: MuqtarabWriterAngle[];
  topics: MuqtarabWriterTopic[];
};

/**
 * Returns the writer profile, or null when the user does not exist or manages
 * no active angle (i.e. is not a public Muqtarab writer — no page for them).
 */
export async function getMuqtarabWriterProfile(
  writerUserId: string,
): Promise<MuqtarabWriterProfile | null> {
  // 1) Identity (staff row overrides the bare users fields).
  const [u] = await db
    .select({
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      bio: users.bio,
      staffNameAr: staff.nameAr,
      staffProfileImage: staff.profileImage,
      staffBioAr: staff.bioAr,
    })
    .from(users)
    .leftJoin(staff, eq(staff.userId, users.id))
    .where(eq(users.id, writerUserId))
    .limit(1);
  if (!u) return null;

  // 2) Active angles this writer manages.
  const writerAngles = await db
    .select({
      slug: angles.slug,
      nameAr: angles.nameAr,
      colorHex: angles.colorHex,
      iconKey: angles.iconKey,
      coverImageUrl: angles.coverImageUrl,
    })
    .from(angles)
    .where(and(eq(angles.managerUserId, writerUserId), eq(angles.isActive, true)))
    .orderBy(angles.sortOrder);

  // Not a public Muqtarab writer → no profile page.
  if (writerAngles.length === 0) return null;

  // 3) Published topics across those angles, newest first.
  const writerTopics = await db
    .select({
      id: topics.id,
      title: topics.title,
      slug: topics.slug,
      excerpt: topics.excerpt,
      heroImageUrl: topics.heroImageUrl,
      publishedAt: topics.publishedAt,
      viewCount: topics.viewCount,
      angleSlug: angles.slug,
      angleName: angles.nameAr,
      colorHex: angles.colorHex,
    })
    .from(topics)
    .innerJoin(angles, eq(topics.angleId, angles.id))
    .where(and(eq(angles.managerUserId, writerUserId), eq(topics.status, "published")))
    .orderBy(desc(topics.publishedAt));

  const name =
    (u.staffNameAr || [u.firstName, u.lastName].filter(Boolean).join(" ").trim()) ||
    "كاتب مُقترب";

  return {
    writer: {
      id: writerUserId,
      name,
      avatar: u.staffProfileImage || u.profileImageUrl || null,
      bio: u.staffBioAr || u.bio || null,
    },
    angles: writerAngles,
    topics: writerTopics,
  };
}
