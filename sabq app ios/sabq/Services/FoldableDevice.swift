import UIKit

/// هل هذا الجهاز هاتف قابل للطيّ (iPhone Duo)؟
///
/// المسار «الحاوية الثابتة» في `SabqTabNavigation` يُفعَّل لهذه الأجهزة فقط،
/// بقرار المالك (2026-09-19): لا تأثير على أي جهاز آخر. الآيفون العادي وiPad
/// يبقيان على مسار التبديل السابق حرفيًا.
///
/// الكشف بطريقتين، أيهما تحقق:
/// 1. معرّف الطراز المعروف (`iPhone19,4` هو iPhone Duo في ملف تعريف المحاكي).
/// 2. ملاحظة مُتعلَّمة: نافذة بـ idiom هاتف وضلعها الأقصر ≥ 600 نقطة لا تحدث إلا
///    على قابل للطيّ مفتوحًا (Max ≈ 440). تُحفظ في `UserDefaults` حتى تُعرف
///    الطرازات القادمة دون تحديث القائمة.
enum FoldableDevice {
    static let knownModelIdentifiers: Set<String> = ["iPhone19,4"]
    static let observedDefaultsKey = "sabqFoldableDeviceObserved"
    /// الضلع الأقصر الذي لا يبلغه أي آيفون غير قابل للطيّ.
    static let foldableShortSideMin: CGFloat = 600

    static var modelIdentifier: String {
        if let sim = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] { return sim }
        var system = utsname()
        uname(&system)
        return withUnsafePointer(to: &system.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: Int(_SYS_NAMELEN)) { String(cString: $0) }
        }
    }

    static var isPhoneIdiom: Bool { UIDevice.current.userInterfaceIdiom == .phone }

    static func isFoldable(observed: Bool) -> Bool {
        isPhoneIdiom && (observed || knownModelIdentifiers.contains(modelIdentifier))
    }

    /// هل هذا الحجم دليل على قابل للطيّ مفتوحًا؟ يُستدعى من `GeometryReader`.
    static func looksUnfolded(_ size: CGSize) -> Bool {
        isPhoneIdiom && min(size.width, size.height) >= foldableShortSideMin
    }
}
