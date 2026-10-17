import SwiftUI
import UserNotifications

struct ReaderNotificationSettingsRoute: Hashable {}

/// إعدادات إشعارات القارئ — نفس حساب الويب (/settings/notifications)، لكن
/// الخيارات التي يقرؤها خادم الإرسال فعلًا فقط (انظر readerInboxService.ts):
/// الملخص اليومي، وأنواع التوصيات، وساعات الهدوء. إذن الإشعارات على الجهاز
/// يُدار من إعدادات النظام، فنعرض حالته وزرًا إليه.
struct ReaderNotificationSettingsView: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase
    // حالة غير اختيارية + علم التحميل (نمط شاشات الإعدادات الأخرى): ربط
    // Binding($prefs) على قيمة اختيارية لم يكن يكتب تغييرات المفاتيح.
    @State private var prefs = APIReaderNotificationPrefs.defaults
    @State private var saved = APIReaderNotificationPrefs.defaults
    @State private var loaded = false
    @State private var systemStatus: UNAuthorizationStatus = .notDetermined
    @State private var loadError = false
    @State private var saving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                deviceSection
                if loaded {
                    group(title: "الملخص اليومي", footer: "إشعار واحد مساءً في صندوق إشعاراتك بأهم ما نُشر في اهتماماتك.") {
                        toggle("الملخص اليومي", icon: "newspaper", isOn: $prefs.dailyDigest)
                    }
                    group(title: "توصيات لك", footer: "تصل إلى صندوق إشعاراتك، بحد أقصى ثلاث في اليوم.") {
                        toggle("محتوى مخصص", subtitle: "مقالات مشابهة لما قرأته سابقًا", icon: "sparkles", isOn: $prefs.becauseYouLiked)
                        WCRowSeparator()
                        toggle("الأكثر رواجًا", subtitle: "المقالات الشائعة في مجالات اهتمامك", icon: "flame", isOn: $prefs.trendingForYou)
                        WCRowSeparator()
                        toggle("اكتشاف محتوى جديد", subtitle: "مقالات من أقسام أخرى قد تثير اهتمامك", icon: "safari", isOn: $prefs.similarToSaved)
                    }
                    group(title: "أوقات الهدوء", footer: "لا تصلك التوصيات بين هذين الوقتين.") {
                        timeRow("من", value: $prefs.quietHoursStart)
                        WCRowSeparator()
                        timeRow("إلى", value: $prefs.quietHoursEnd)
                    }
                } else if loadError {
                    ErrorStateView(message: "تعذر تحميل الإعدادات") { Task { await load() } }
                } else {
                    ProgressView().frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.vertical, SabqLayout.space24)
            .padding(.bottom, 96)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("إعدادات الإشعارات")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await refreshSystemStatus() } }
        }
        .onChange(of: prefs) { _, newValue in
            guard loaded, newValue != saved else { return }
            Task { await save(newValue) }
        }
    }

    // MARK: - Sections

    private var deviceSection: some View {
        let enabled = systemStatus == .authorized || systemStatus == .provisional || systemStatus == .ephemeral
        return group(title: "على هذا الجهاز", footer: enabled
                     ? "العاجل والتنبيهات المهمة تصلك على شاشة القفل."
                     : "الإشعارات متوقفة لتطبيق سبق، فلن يصلك العاجل على شاشة القفل.") {
            HStack(spacing: SabqLayout.space12) {
                rowIcon(enabled ? "bell.badge.fill" : "bell.slash")
                Text(enabled ? "الإشعارات مفعّلة" : "الإشعارات متوقفة")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Spacer(minLength: 0)
                Button(systemStatus == .notDetermined ? "تفعيل" : "الإعدادات") {
                    Task {
                        if systemStatus == .notDetermined {
                            _ = await NotificationsStore.shared.requestPermission()
                            await refreshSystemStatus()
                        } else if let url = URL(string: UIApplication.openNotificationSettingsURLString) {
                            openURL(url)
                        }
                    }
                }
                .sabqText(SabqType.button)
                .foregroundStyle(SabqTheme.primary)
            }
            .padding(.vertical, SabqLayout.space12)
        }
    }

    private func group<Content: View>(title: String, footer: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text(title)
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
            VStack(spacing: 0) { content() }
            Text(footer)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)
        }
    }

    private func toggle(_ title: String, subtitle: String? = nil, icon: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: SabqLayout.space12) {
            rowIcon(icon)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            Spacer(minLength: 0)
            Toggle(title, isOn: isOn).labelsHidden().tint(SabqTheme.primary)
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func timeRow(_ label: String, value: Binding<String>) -> some View {
        HStack(spacing: SabqLayout.space12) {
            rowIcon("moon")
            Text(label)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Spacer(minLength: 0)
            DatePicker(label, selection: Self.dateBinding(value), displayedComponents: .hourAndMinute)
                .labelsHidden()
                .environment(\.locale, Locale(identifier: "ar-SA-u-nu-latn"))
        }
        .padding(.vertical, SabqLayout.space8)
    }

    private func rowIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(SabqFonts.app(size: 15, weight: .semibold))
            .foregroundStyle(SabqTheme.textSecondary)
            .frame(width: 36, height: 36)
            .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
            .accessibilityHidden(true)
    }

    /// "HH:mm" ⇄ Date لمنتقي الوقت (التاريخ نفسه لا يهم).
    static func dateBinding(_ hhmm: Binding<String>) -> Binding<Date> {
        Binding(
            get: {
                let parts = hhmm.wrappedValue.split(separator: ":").compactMap { Int($0) }
                var c = DateComponents()
                c.hour = parts.first ?? 22
                c.minute = parts.count > 1 ? parts[1] : 0
                return Calendar.current.date(from: c) ?? Date()
            },
            set: { date in
                let c = Calendar.current.dateComponents([.hour, .minute], from: date)
                hhmm.wrappedValue = String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
            }
        )
    }

    // MARK: - Data

    private func load() async {
        await refreshSystemStatus()
        do {
            let p = try await APIClient.shared.fetchReaderNotificationPrefs()
            saved = p
            prefs = p
            loaded = true
            loadError = false
        } catch {
            loadError = !loaded
        }
    }

    private func refreshSystemStatus() async {
        systemStatus = await NotificationsStore.shared.currentAuthorizationStatus()
    }

    private func save(_ value: APIReaderNotificationPrefs) async {
        saving = true
        defer { saving = false }
        if let result = try? await APIClient.shared.updateReaderNotificationPrefs(value) {
            saved = result
            if result != prefs { prefs = result }
        } else {
            prefs = saved // فشل الحفظ: أعد المفتاح لحالته المحفوظة
        }
    }
}
