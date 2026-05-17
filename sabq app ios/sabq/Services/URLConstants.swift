import Foundation

/// Single source of truth for every sabq.org URL the app constructs.
/// Use these instead of inlining `"https://sabq.org/..."` literals so a
/// future env switch (staging, preview, locale-specific subdomain) is a
/// one-file change.
enum URLConstants {
    /// The bare web origin — used for "open the homepage" links and as
    /// the base for share URLs we hand to the system share sheet.
    static let webOrigin = "https://sabq.org"

    /// `https://sabq.org/api/v1` — Bearer-token / `appMemberSessions`
    /// endpoints. Reserved for mobile-specific routes.
    static let mobileAPI = "https://sabq.org/api/v1"

    /// `https://sabq.org/api` — Passport-session endpoints. Most public
    /// reads (homepage, articles, opinions) live here.
    static let publicAPI = "https://sabq.org/api"

    /// CSRF token endpoint — separate constant because it lives outside
    /// `/api/v1` *and* `/api/*` resource buckets.
    static let csrfToken = "https://sabq.org/api/csrf-token"

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
