import Foundation
import Observation

/// تفضيلات محلية للمستخدم — تبقى على الجهاز وتتفاعل فورًا مع الواجهة.
@MainActor
@Observable
final class GcUserPreferences {
    static let shared = GcUserPreferences()

    private enum Key {
        static let liveAlerts = "gc.prefs.liveAlerts"
        static let predictionReminders = "gc.prefs.predictionReminders"
        static let haptics = "gc.prefs.haptics"
        static let favoriteTeam = "gc.prefs.favoriteTeamId"
    }

    var liveMatchAlerts: Bool {
        didSet { UserDefaults.standard.set(liveMatchAlerts, forKey: Key.liveAlerts) }
    }

    var predictionReminders: Bool {
        didSet { UserDefaults.standard.set(predictionReminders, forKey: Key.predictionReminders) }
    }

    var hapticsEnabled: Bool {
        didSet { UserDefaults.standard.set(hapticsEnabled, forKey: Key.haptics) }
    }

    /// المنتخب المفضل — تُقدَّم مبارياته في ترتيب الجدول (إلى جانب الأخضر).
    var favoriteTeamId: Int? {
        didSet {
            if let id = favoriteTeamId {
                UserDefaults.standard.set(id, forKey: Key.favoriteTeam)
            } else {
                UserDefaults.standard.removeObject(forKey: Key.favoriteTeam)
            }
        }
    }

    private init() {
        let d = UserDefaults.standard
        liveMatchAlerts = d.object(forKey: Key.liveAlerts) as? Bool ?? true
        predictionReminders = d.object(forKey: Key.predictionReminders) as? Bool ?? true
        hapticsEnabled = d.object(forKey: Key.haptics) as? Bool ?? true
        favoriteTeamId = d.object(forKey: Key.favoriteTeam) as? Int
    }
}
