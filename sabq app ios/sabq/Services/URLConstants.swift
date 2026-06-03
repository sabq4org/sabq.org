import Foundation

/// Single source of truth for every sabq.org URL the app constructs.
/// Use these instead of inlining `"https://sabq.org/..."` literals so a
/// future env switch (staging, preview, locale-specific subdomain) is a
/// one-file change.
nonisolated enum URLConstants {
    /// The bare web origin — used for "open the homepage" links and as
    /// the base for share URLs we hand to the system share sheet. Stays on
    /// the canonical `sabq.org` so shared/opened links are user-facing.
    static let webOrigin = "https://sabq.org"

    /// API origin for the app. We hit the headless backend host
    /// (`api.sabq.org`) DIRECTLY instead of `sabq.org` because the Cloudflare
    /// edge layer in front of `sabq.org` collapses the visitor's real IP for
    /// `/api/*` subrequests: every client ends up sharing ONE rate-limit
    /// bucket (writeLimiter, 1000 / 15 min — see server/index.ts), which on a
    /// high-traffic site is permanently exhausted, so EVERY write (login,
    /// OAuth, comments, reactions) returns HTTP 429 "تم تجاوز حد الطلبات".
    /// `api.sabq.org` is the same backend with no edge proxy in between, so
    /// `cf-connecting-ip` reaches Express and each device gets its own bucket.
    private static let apiOrigin = "https://api.sabq.org"

    /// `https://api.sabq.org/api/v1` — Bearer-token / `appMemberSessions`
    /// endpoints. Reserved for mobile-specific routes.
    static let mobileAPI = "\(apiOrigin)/api/v1"

    /// `https://api.sabq.org/api` — most public reads (homepage, articles,
    /// opinions). Same backend as the web's `/api/*`.
    static let publicAPI = "\(apiOrigin)/api"

    /// CSRF token endpoint — separate constant because it lives outside
    /// `/api/v1` *and* `/api/*` resource buckets.
    static let csrfToken = "\(apiOrigin)/api/csrf-token"

    /// Build a canonical share URL for an Arabic article slug.
    static func articleURL(slug: String) -> String { "\(webOrigin)/article/\(slug)" }

    /// Build a canonical share URL for an opinion slug.
    static func opinionURL(slug: String) -> String { "\(webOrigin)/opinion/\(slug)" }

    /// Resolve an API-returned relative path (e.g. `/uploads/x.jpg`) into
    /// an absolute URL string. Pass-through if the input already has a
    /// scheme.
    static func absolutize(_ raw: String) -> String {
        if raw.hasPrefix("http://") || raw.hasPrefix("https://") { return raw }
        return webOrigin + (raw.hasPrefix("/") ? "" : "/") + raw
    }
}
