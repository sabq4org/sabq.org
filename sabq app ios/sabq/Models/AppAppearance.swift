import SwiftUI

/// The three colour-scheme modes the reader can pick from in Settings:
/// follow the iOS system setting (default for new installs), force
/// light, or force dark. Persisted in UserDefaults under
/// `appAppearance`; the legacy `isDarkMode` Bool is migrated to this
/// key on first read so users who explicitly set light/dark before
/// the picker landed keep their preference.
enum AppAppearance: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    /// `nil` means "follow whatever iOS reports" — pass this to
    /// `.preferredColorScheme(_:)`.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }

    /// Arabic label for the picker rows in Settings.
    var arabicLabel: String {
        switch self {
        case .system: return "نظام الجهاز"
        case .light:  return "فاتح"
        case .dark:   return "داكن"
        }
    }

    /// SF Symbol used by the home-header quick-toggle.
    var iconName: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .light:  return "sun.max.fill"
        case .dark:   return "moon.fill"
        }
    }

    /// Cycles the home-header icon: system → light → dark → system.
    var next: AppAppearance {
        switch self {
        case .system: return .light
        case .light:  return .dark
        case .dark:   return .system
        }
    }

    /// One-shot migration from the legacy `isDarkMode` Bool. Called
    /// from `sabqApp.init()` so the first read of `appAppearance`
    /// reflects the user's prior choice instead of silently flipping
    /// them onto "system".
    static func migrateLegacyIfNeeded() {
        let defaults = UserDefaults.standard
        guard defaults.object(forKey: "appAppearance") == nil else { return }
        // Only migrate when the legacy key actually exists: `bool(forKey:)`
        // returns false for a missing key, which used to stamp fresh installs
        // with "light" and stop them from ever following the system setting.
        guard defaults.object(forKey: "isDarkMode") != nil else { return }
        let wasDark = defaults.bool(forKey: "isDarkMode")
        defaults.set(wasDark ? AppAppearance.dark.rawValue : AppAppearance.light.rawValue,
                     forKey: "appAppearance")
    }
}
