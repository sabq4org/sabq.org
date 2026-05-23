import Foundation
import SwiftUI

/// Drives the seasonal Eid-Al-Adha theme overlay across the iOS app.
/// Mirrors the web `useHajjSeason` hook 1:1:
///   - Window: 9 → 13 Dhu al-Hijjah inclusive (يوم عرفة → آخر أيام التشريق).
///   - Calendar: `islamic-umalqura`, time zone `Asia/Riyadh`.
///   - User can toggle the theme off via Settings; the choice is
///     scoped to the current Hijri year, so dismissal automatically
///     resets when next year's window opens.
///   - Outside the window the theme is a no-op regardless of the
///     toggle — the brand returns to its default look automatically.
@Observable
final class EidThemeManager {
    static let shared = EidThemeManager()

    /// The Hijri month for ذو الحجة.
    private static let dhuAlHijjah = 12

    /// 9 = يوم عرفة, 10 = العيد, 11–13 = أيام التشريق.
    private static let windowStart = 9
    private static let windowEnd = 13

    /// Per-Hijri-year UserDefaults key prefix. Includes the year so a
    /// user who hid the theme in 1446 still sees it in 1447 unless
    /// they hide it again — same model as the web banner.
    private static let dismissalKeyPrefix = "sabq.eid.theme.disabled."

    /// Force-on for design review + PR screenshots outside the real
    /// window. Toggled via the hidden long-press gesture on the
    /// Settings "ثيم العيد" row (see `SettingsView`).
    private static let forceKey = "sabq.eid.theme.force"

    /// Cached Hijri snapshot computed once per app launch — the
    /// window doesn't change mid-session and the calendar conversion
    /// is non-trivial work. Refreshed lazily after midnight if the
    /// observed state ever needs to recompute.
    private(set) var todayHijri: (day: Int, month: Int, year: Int)?

    /// Driven by the toggle in Settings; published so views react.
    private(set) var userDisabled: Bool = false

    /// True when *today* sits inside the Hijri window. The toggle is
    /// orthogonal — this just tells you "is it currently the season."
    private(set) var inSeason: Bool = false

    /// True when the force-on debug flag is set.
    private(set) var forcedOn: Bool = false

    /// What the rest of the app reads: should the Eid skin be drawn
    /// right now? `inSeason && !userDisabled`, or `forcedOn` regardless.
    var isActive: Bool {
        if forcedOn { return true }
        return inSeason && !userDisabled
    }

    private init() {
        recompute()
    }

    // MARK: - Hijri conversion

    /// Convert the current moment in Riyadh to a Hijri (Umm al-Qura)
    /// day/month/year triple. Foundation's `Calendar(identifier:
    /// .islamicUmmAlQura)` handles the math; we just bolt on the
    /// time zone so the day flips at Saudi midnight, not the device
    /// locale's midnight.
    private static func currentHijri(now: Date = Date()) -> (day: Int, month: Int, year: Int)? {
        var calendar = Calendar(identifier: .islamicUmmAlQura)
        guard let tz = TimeZone(identifier: "Asia/Riyadh") else { return nil }
        calendar.timeZone = tz
        let comps = calendar.dateComponents([.day, .month, .year], from: now)
        guard let d = comps.day, let m = comps.month, let y = comps.year else { return nil }
        return (d, m, y)
    }

    private static func isInWindow(_ hijri: (day: Int, month: Int, year: Int)) -> Bool {
        guard hijri.month == dhuAlHijjah else { return false }
        return hijri.day >= windowStart && hijri.day <= windowEnd
    }

    // MARK: - Public API

    /// Re-read calendar + UserDefaults and update `inSeason` /
    /// `userDisabled` / `forcedOn`. Called on init and whenever the
    /// app foregrounds (so a user who left the app open across the
    /// season boundary still sees the right state).
    func recompute() {
        let hijri = Self.currentHijri()
        let within = hijri.map(Self.isInWindow) ?? false
        self.todayHijri = hijri
        self.inSeason = within
        self.forcedOn = UserDefaults.standard.bool(forKey: Self.forceKey)
        if let year = hijri?.year {
            let key = Self.dismissalKeyPrefix + String(year)
            self.userDisabled = UserDefaults.standard.bool(forKey: key)
        } else {
            self.userDisabled = false
        }
    }

    /// Set/clear the user's per-year dismissal. Off-by-default;
    /// flipping `disabled = true` hides the theme until next year's
    /// window opens. Settings UI flips this.
    func setUserDisabled(_ disabled: Bool) {
        userDisabled = disabled
        guard let year = todayHijri?.year else { return }
        let key = Self.dismissalKeyPrefix + String(year)
        if disabled {
            UserDefaults.standard.set(true, forKey: key)
        } else {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    /// Developer-only toggle to preview the theme outside the real
    /// Hijri window. Bound to a hidden long-press gesture on the
    /// Settings row so users can't stumble into it.
    func setForcedOn(_ on: Bool) {
        forcedOn = on
        UserDefaults.standard.set(on, forKey: Self.forceKey)
    }

    // MARK: - Palette

    /// Brand colors for the season, matching the web Eid theme.
    /// Kept on the manager so views reach them through the same
    /// entry point that gates their visibility.
    enum Palette {
        /// Deep green — primary background tint.
        static let greenDeep = Color(red: 26/255,  green: 92/255,  blue: 42/255)   // #1A5C2A
        /// Brand gold — accent + card borders + shadow tint.
        static let gold      = Color(red: 201/255, green: 168/255, blue: 76/255)   // #C9A84C
        /// Cream — surface highlight against deep green.
        static let cream     = Color(red: 245/255, green: 240/255, blue: 232/255)  // #F5F0E8

        /// Gold @ 15% — the spec for the card shadow in Eid mode.
        static let goldShadow = Color(red: 201/255, green: 168/255, blue: 76/255, opacity: 0.15)
        /// Gold @ 70% — the 1-pt accent border on cards.
        static let goldBorder = Color(red: 201/255, green: 168/255, blue: 76/255, opacity: 0.55)
    }
}
