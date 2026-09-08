/**
 * Schema.org helpers for creator/reporter profiles — feeds Google Search Profiles
 * and rich-result Person markup on articles and Muqtarab angle pages.
 */

export function buildPersonJsonLd(opts: {
  name: string;
  url?: string;
  image?: string;
  description?: string;
  jobTitle?: string;
  sameAs?: string[];
  worksFor?: { name: string; url: string };
}): Record<string, unknown> {
  const person: Record<string, unknown> = {
    "@type": "Person",
    name: opts.name,
  };
  if (opts.url) person.url = opts.url;
  if (opts.image) person.image = opts.image;
  if (opts.description) person.description = opts.description;
  if (opts.jobTitle) person.jobTitle = opts.jobTitle;
  if (opts.sameAs?.length) person.sameAs = opts.sameAs;
  if (opts.worksFor) {
    person.worksFor = {
      "@type": "NewsMediaOrganization",
      name: opts.worksFor.name,
      url: opts.worksFor.url,
    };
  }
  return person;
}

export function buildProfilePageJsonLd(opts: {
  name: string;
  url: string;
  description?: string;
  image?: string;
  person: Record<string, unknown>;
}): object {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: opts.name,
    url: opts.url,
    description: opts.description,
    ...(opts.image ? { image: opts.image } : {}),
    mainEntity: opts.person,
  };
}

export function reporterProfileUrl(
  baseUrl: string,
  slugOrId: string,
  lang: "ar" | "en" = "ar",
): string {
  return `${baseUrl}${lang === "en" ? "/en" : ""}/reporter/${encodeURIComponent(slugOrId)}`;
}

function authorProfileUrl(baseUrl: string, name: string, lang: "ar" | "en"): string {
  // The public author route is Arabic-only today; do not invent /en/author.
  return `${baseUrl}/author/${encodeURIComponent(name)}`;
}

export function muqtarabAngleUrl(baseUrl: string, slug: string): string {
  return `${baseUrl}/muqtarab/${encodeURIComponent(slug)}`;
}

export function muqtarabWriterUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/muqtarab/writer/${encodeURIComponent(id)}`;
}

/** Strip empty / invalid URLs before emitting sameAs */
export function cleanSameAs(urls: Array<string | null | undefined>): string[] {
  return urls.filter((u): u is string => !!u && (u.startsWith("http://") || u.startsWith("https://")));
}

export const SABQ_ORG_AR = { name: "صحيفة سبق الإلكترونية", url: "https://sabq.org" };
export const SABQ_ORG_EN = { name: "Sabq News", url: "https://sabq.org" };

/** Person markup for article bylines — prefers reporter profile, falls back to author. */
export function buildArticleAuthorPerson(
  baseUrl: string,
  opts: {
    reporterName: string;
    editorName: string;
    reporterId?: string | null;
    reporterStaffSlug?: string | null;
    authorId?: string | null;
    authorStaffSlug?: string | null;
    /** A verified public profile URL supplied by the data layer, when one exists. */
    reporterProfileUrl?: string | null;
    authorProfileUrl?: string | null;
    lang?: "ar" | "en";
    fallbackName?: string;
  },
): Record<string, unknown> {
  const lang = opts.lang || "ar";
  const fallbackName = opts.fallbackName || (lang === "en" ? "Sabq News" : "صحيفة سبق الإلكترونية");
  const useReporter = !!opts.reporterName;
  // A user id is not itself a public profile.  Only a staff slug proves that
  // the /reporter route exists; otherwise use the public name route below.
  const staffSlug = useReporter ? opts.reporterStaffSlug : opts.authorStaffSlug;
  const name = (useReporter ? opts.reporterName : opts.editorName) || fallbackName;
  const explicitUrl = useReporter ? opts.reporterProfileUrl : opts.authorProfileUrl;
  const url = explicitUrl || (staffSlug
    ? reporterProfileUrl(baseUrl, staffSlug, lang)
    : name !== fallbackName
      ? authorProfileUrl(baseUrl, name, lang)
      : undefined);

  // A corporate byline is an Organization, not a fabricated Person.  This
  // keeps publisher/byline identity consistent when an article has no named
  // reporter or author.
  const corporateNames = new Set([
    fallbackName,
    "صحيفة سبق الإلكترونية",
    "صحيفة سبق",
    "سبق",
    "Sabq News",
    "SABQ",
  ]);
  if (corporateNames.has(name.trim())) {
    const org = lang === "en" ? SABQ_ORG_EN : SABQ_ORG_AR;
    return { "@type": "NewsMediaOrganization", name: name.trim(), url: org.url };
  }

  return buildPersonJsonLd({ name, url, worksFor: lang === "en" ? SABQ_ORG_EN : SABQ_ORG_AR });
}
