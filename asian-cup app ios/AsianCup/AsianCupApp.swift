import SwiftUI

@main
struct AsianCupApp: App {
    @UIApplicationDelegateAdaptor(AcAppDelegate.self) private var appDelegate
    @State private var auth = AcAuthStore.shared

    init() {
        // سجّل خط IBM Plex Sans Arabic قبل أي واجهة تستعمله.
        FontRegistration.registerAll()
        // كاش أكبر لصور الشعارات والأعلام المتكررة (AsyncImage يمرّ عبر URLCache.shared) —
        // بدونه تُعاد التحميلات مرئيًّا في القوائم الطويلة وعند ضعف الشبكة.
        URLCache.shared = URLCache(
            memoryCapacity: 40 * 1024 * 1024,
            diskCapacity: 200 * 1024 * 1024
        )
    }

    // المظهر وحجم الخط يتحكم بهما المستخدم من «حسابي › التحكم» —
    // الافتراضي فاتح (هوية البطولة)، والثيم الداكن جاهز في AcTheme عبر dyn().
    @AppStorage("ac.appearance") private var appearanceRaw = "light"
    @AppStorage("ac.textScale") private var textScaleRaw = "system"

    private var preferredScheme: ColorScheme? {
        switch appearanceRaw {
        case "dark": return .dark
        case "light": return .light
        default: return nil // يتبع النظام
        }
    }

    private var dynamicSize: DynamicTypeSize? {
        switch textScaleRaw {
        case "normal": return .large       // الأساس النظامي
        case "large": return .xLarge
        case "xlarge": return .xxLarge
        default: return nil // يتبع إعداد النظام
        }
    }

    var body: some Scene {
        WindowGroup {
            if let dynamicSize {
                root.dynamicTypeSize(dynamicSize)
            } else {
                root
            }
        }
    }

    private var root: some View {
        AsianCupView()
            .environment(auth)
            .asianCupRTL()
            .preferredColorScheme(preferredScheme)
            .task {
                await auth.restore()
                await AcFollowsStore.shared.reload()
                await AcPushManager.shared.syncWithSession()
            }
    }
}
