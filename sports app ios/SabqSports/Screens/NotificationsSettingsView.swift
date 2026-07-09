import SwiftUI
import UserNotifications
import UIKit

/// صفحة إعدادات الإشعارات — مصدر الحقيقة الواضح للمستخدم:
/// 1) إذن النظام  2) من أين تصلك (فِرق + مبارياتي)  3) أنواع الأحداث  4) الانتقالات
struct NotificationsSettingsView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(SpMatchFollows.self) private var matchFollows
    @Environment(SpAppRouter.self) private var router
    @Environment(\.openURL) private var openURL
    @AppStorage("vara.smartSnaps.visible") private var showSmartSnaps = true

    @State private var pushStatus: UNAuthorizationStatus = .notDetermined
    @State private var selectedTeam: IDBox?
    @State private var selectedMatch: IDBox?

    private var followedTeams: [SpFollow] { auth.follows.filter { $0.kind == "team" } }
    private var followedMatches: [SpFixture] { matchFollows.visibleItems }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                howItWorksCard
                systemPermissionCard
                sourcesCard
                if auth.isLoggedIn {
                    matchEventsCard
                    transfersCard
                } else {
                    signInPromptCard
                }
            }
            .padding(16)
        }
        .autoHideTabBar()
        .background(SpAmbientBackground())
        .navigationTitle(L("الإشعارات"))
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $selectedTeam) { box in SpTeamPage(teamId: box.id) }
        .navigationDestination(item: $selectedMatch) { box in
            SpMatchCenter(fixtureId: box.id, preview: followedMatches.first { $0.id == box.id })
        }
        .task { await refreshPushStatus() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            Task { await refreshPushStatus() }
        }
    }

    // MARK: - كيف تعمل

    private var howItWorksCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                iconTile("bell.badge.fill", SpTheme.green)
                Text(L("كيف تصلك الإشعارات؟"))
                    .font(SportsFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SpTheme.onDark)
            }
            Text(L("تصلك إشعارات مباريات الفِرق التي تتابعها، والمباريات في «مبارياتي». فعّل أنواع الأحداث أدناه، وتأكد أن إذن النظام مسموح."))
                .font(SportsFonts.app(size: 13, weight: .regular))
                .foregroundStyle(SpTheme.onDarkDim)
                .fixedSize(horizontal: false, vertical: true)
            Text(L("الفريق المفضّل يخصّص واجهتك فقط ولا يفعّل الإشعارات بمفرده."))
                .font(SportsFonts.app(size: 12, weight: .regular))
                .foregroundStyle(SpTheme.onDarkFaint)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(cardBg)
    }

    // MARK: - إذن النظام

    private var systemPermissionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("إذن النظام"))
            settingsCard {
                HStack(spacing: 12) {
                    iconTile("iphone", pushAllowed ? SpTheme.green : SpTheme.crimson)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(L("إشعارات الجهاز"))
                            .font(SportsFonts.app(size: 14.5, weight: .bold))
                            .foregroundStyle(SpTheme.onDark)
                        Text(pushStatusLabel)
                            .font(SportsFonts.app(size: 12, weight: .regular))
                            .foregroundStyle(pushAllowed ? SpTheme.green : SpTheme.crimson)
                    }
                    Spacer(minLength: 0)
                    if pushStatus == .notDetermined {
                        Button {
                            Task {
                                await auth.enablePushNotifications()
                                await refreshPushStatus()
                            }
                        } label: {
                            Text(L("تفعيل"))
                                .font(SportsFonts.app(size: 13, weight: .heavy))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(SpTheme.green))
                        }
                        .buttonStyle(SpPressStyle())
                    } else if !pushAllowed {
                        Button(L("فتح الإعدادات")) { openSystemSettings() }
                            .font(SportsFonts.app(size: 13, weight: .heavy))
                            .foregroundStyle(SpTheme.green)
                            .buttonStyle(SpPressStyle())
                    }
                }
                .padding(.horizontal, 14).padding(.vertical, 14)
            }
            if !pushAllowed {
                hint(L("بدون إذن النظام لن تصل الإشعارات حتى لو كانت المفاتيح مفعّلة داخل التطبيق."))
            }
        }
    }

    // MARK: - المصادر (فِرق + مبارياتي)

    private var sourcesCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("من أين تصلك؟"))
            settingsCard {
                teamsSourceBlock
                rowDivider
                matchesSourceBlock
            }
            hint(L("أضف فريقًا من صفحة النادي («تابع التنبيهات»)، أو أضف مباراة بنجمة ⭐ في جدول المباريات."))
        }
    }

    private var teamsSourceBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                iconTile("heart.fill", SpTheme.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("الفِرق المتابَعة"))
                        .font(SportsFonts.app(size: 14.5, weight: .bold))
                        .foregroundStyle(SpTheme.onDark)
                    Text(teamsSubtitle)
                        .font(SportsFonts.app(size: 11.5, weight: .regular))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
                Spacer(minLength: 0)
                Text("\(followedTeams.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                    .monospacedDigit()
            }

            if auth.isLoggedIn, !followedTeams.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 14) {
                        ForEach(followedTeams) { f in
                            Button { if let id = Int(f.refId) { selectedTeam = IDBox(id: id) } } label: {
                                VStack(spacing: 6) {
                                    SpTeamLogo(logo: f.refLogo ?? "", size: 42)
                                    Text(f.refName)
                                        .font(SportsFonts.app(size: 11, weight: .regular))
                                        .foregroundStyle(SpTheme.onDark)
                                        .lineLimit(1).frame(width: 56)
                                }
                            }
                            .buttonStyle(SpPressStyle())
                        }
                    }
                }
            } else if !auth.isLoggedIn {
                Text(L("سجّل الدخول لمتابعة فِرق وتلقّي تنبيهاتها على كل أجهزتك."))
                    .font(SportsFonts.app(size: 12, weight: .regular))
                    .foregroundStyle(SpTheme.onDarkFaint)
            } else {
                Text(L("لا فِرق متابَعة بعد — افتح صفحة نادٍ واضغط «تابع التنبيهات»."))
                    .font(SportsFonts.app(size: 12, weight: .regular))
                    .foregroundStyle(SpTheme.onDarkFaint)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    private var matchesSourceBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                iconTile("star.fill", SpTheme.green)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("مبارياتي"))
                        .font(SportsFonts.app(size: 14.5, weight: .bold))
                        .foregroundStyle(SpTheme.onDark)
                    Text(matchesSubtitle)
                        .font(SportsFonts.app(size: 11.5, weight: .regular))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
                Spacer(minLength: 0)
                Text("\(followedMatches.count)")
                    .font(SportsFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                    .monospacedDigit()
            }

            if followedMatches.isEmpty {
                Text(L("لا مباريات في «مبارياتي» — اضغط النجمة ⭐ على أي مباراة في الجدول."))
                    .font(SportsFonts.app(size: 12, weight: .regular))
                    .foregroundStyle(SpTheme.onDarkFaint)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(followedMatches.prefix(6).enumerated()), id: \.element.id) { idx, f in
                        if idx > 0 { Rectangle().fill(SpTheme.outline.opacity(0.45)).frame(height: 1) }
                        Button { selectedMatch = IDBox(id: f.id) } label: {
                            HStack(spacing: 10) {
                                SpTeamLogo(logo: f.home.logo, size: 22)
                                Text("\(f.home.name) × \(f.away.name)")
                                    .font(SportsFonts.app(size: 13, weight: .regular))
                                    .foregroundStyle(SpTheme.onDark)
                                    .lineLimit(1)
                                Spacer(minLength: 4)
                                Text(matchStatusLabel(f))
                                    .font(SportsFonts.app(size: 11, weight: .bold))
                                    .foregroundStyle(f.status.live ? SpTheme.crimson : SpTheme.onDarkFaint)
                                Image(systemName: "chevron.backward")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(SpTheme.onDarkFaint)
                            }
                            .padding(.vertical, 10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(SpPressStyle())
                    }
                    if followedMatches.count > 6 {
                        Text(String(format: L("و%d مباريات أخرى في الرئيسية"), followedMatches.count - 6))
                            .font(SportsFonts.app(size: 11.5, weight: .regular))
                            .foregroundStyle(SpTheme.onDarkFaint)
                            .padding(.top, 4)
                    }
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
    }

    // MARK: - أنواع أحداث المباراة

    private var matchEventsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("أحداث المباراة"))
            settingsCard {
                alertRow(L("بداية المباراة"), "play.circle.fill", \.kickoff)
                rowDivider
                alertRow(L("الأهداف"), "soccerball", \.goals)
                rowDivider
                alertRow(L("البطاقات"), "rectangle.portrait.fill", \.cards)
                rowDivider
                alertRow(L("حالات الفار (VAR)"), "tv.fill", \.varReview)
                rowDivider
                alertRow(L("نهاية المباراة"), "flag.checkered", \.fulltime)
                rowDivider
                alertRow(L("لقطات ذكية"), "sparkles", \.smartSnaps)
                rowDivider
                localSmartSnapsRow
            }
            hint(L("هذه المفاتيح عامّة: تنطبق على كل فِرقك المتابَعة وكل مبارياتك في «مبارياتي»."))
        }
    }

    // MARK: - انتقالات

    private var transfersCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("تنبيهات الانتقالات"))
            settingsCard {
                alertRow(L("انتقالات سعودية"), "flag.fill", \.transfersSaudi)
                rowDivider
                alertRow(L("انتقالات عالمية بارزة"), "globe", \.transfersGlobal)
            }
            hint(L("تصلك الصفقات المؤكّدة فور تأكيدها — تنبيهات سوق عامّة لا تتطلّب متابعة فريق."))
        }
    }

    // MARK: - دخول

    private var signInPromptCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(L("تفعيل التنبيهات"))
            settingsCard {
                Button { router.requestLogin() } label: {
                    HStack(spacing: 12) {
                        iconTile("person.crop.circle.badge.plus", SpTheme.green)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(L("سجّل الدخول لتفعيل التنبيهات"))
                                .font(SportsFonts.app(size: 14.5, weight: .bold))
                                .foregroundStyle(SpTheme.onDark)
                            Text(L("تذكير «مبارياتي» المحلي يعمل بلا دخول. الإشعارات اللحظية (أهداف وبطاقات) تحتاج عضوية سبق."))
                                .font(SportsFonts.app(size: 12, weight: .regular))
                                .foregroundStyle(SpTheme.onDarkFaint)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.backward")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(SpTheme.onDarkFaint)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 14)
                    .contentShape(Rectangle())
                }
                .buttonStyle(SpPressStyle())
            }
        }
    }

    // MARK: - صفوف التبديل

    private func alertRow(_ title: String, _ icon: String, _ keyPath: WritableKeyPath<SpAlertPrefs, Bool>) -> some View {
        let active = auth.alertPrefs[keyPath: keyPath]
        return Button {
            var p = auth.alertPrefs
            p[keyPath: keyPath].toggle()
            Task { await auth.setAlertPrefs(p) }
        } label: {
            HStack(spacing: 12) {
                iconTile(icon, active ? SpTheme.green : SpTheme.onDarkFaint)
                Text(title)
                    .font(SportsFonts.app(size: 14.5, weight: .semibold))
                    .foregroundStyle(SpTheme.onDark)
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Circle()
                        .fill(active ? SpTheme.green : SpTheme.onDarkFaint)
                        .frame(width: 7, height: 7)
                    Text(active ? L("مفعّل") : L("متوقف"))
                        .font(SportsFonts.app(size: 11.5, weight: .bold))
                }
                .foregroundStyle(active ? SpTheme.green : SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    private var localSmartSnapsRow: some View {
        Button { showSmartSnaps.toggle() } label: {
            HStack(spacing: 12) {
                iconTile("eye", showSmartSnaps ? SpTheme.green : SpTheme.onDarkFaint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L("إظهار اللقطات داخل التطبيق"))
                        .font(SportsFonts.app(size: 14.5, weight: .semibold))
                        .foregroundStyle(SpTheme.onDark)
                    Text(L("عرض البطاقات داخل الشاشات — منفصل عن إشعار الدفع."))
                        .font(SportsFonts.app(size: 11, weight: .regular))
                        .foregroundStyle(SpTheme.onDarkFaint)
                }
                Spacer(minLength: 0)
                HStack(spacing: 6) {
                    Circle()
                        .fill(showSmartSnaps ? SpTheme.green : SpTheme.onDarkFaint)
                        .frame(width: 7, height: 7)
                    Text(showSmartSnaps ? L("ظاهر") : L("مخفي"))
                        .font(SportsFonts.app(size: 11.5, weight: .bold))
                }
                .foregroundStyle(showSmartSnaps ? SpTheme.green : SpTheme.onDarkFaint)
            }
            .padding(.horizontal, 14).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(SpPressStyle())
    }

    // MARK: - مساعدات

    private var pushAllowed: Bool {
        pushStatus == .authorized || pushStatus == .provisional || pushStatus == .ephemeral
    }

    private var pushStatusLabel: String {
        switch pushStatus {
        case .authorized, .provisional, .ephemeral: return L("مسموح")
        case .denied: return L("مرفوض — افتح إعدادات الجهاز")
        case .notDetermined: return L("لم يُطلب بعد")
        @unknown default: return L("غير معروف")
        }
    }

    private var teamsSubtitle: String {
        if !auth.isLoggedIn { return L("يتطلّب تسجيل الدخول") }
        if followedTeams.isEmpty { return L("لا فِرق بعد") }
        return L("إشعارات كل مباريات هذه الفِرق")
    }

    private var matchesSubtitle: String {
        if followedMatches.isEmpty { return L("لا مباريات بعد") }
        return L("إشعارات هذه المباريات فقط + تذكير قبل 10 دقائق")
    }

    /// منسّقا موعد المباراة — مرة واحدة لكل لغة (كان يُنشأ منسّق جديد لكل صفّ)،
    /// والاختيار وقت النداء بلغة الواجهة الحالية بدل «ar» المثبّتة التي كانت
    /// تتجاهل الوضع الإنجليزي.
    private static func makeKickoffFormatter(_ locale: String) -> DateFormatter {
        let df = DateFormatter()
        df.locale = Locale(identifier: locale)
        df.dateFormat = "d MMM · HH:mm"
        return df
    }
    private static let kickoffFormatterAr = makeKickoffFormatter("ar")
    private static let kickoffFormatterEn = makeKickoffFormatter("en")

    private func matchStatusLabel(_ f: SpFixture) -> String {
        if f.status.live { return L("مباشر") }
        if f.status.finished { return L("انتهت") }
        let formatter = SpLanguage.shared.isEnglish ? Self.kickoffFormatterEn : Self.kickoffFormatterAr
        return formatter.string(from: f.kickoff)
    }

    private func refreshPushStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        pushStatus = settings.authorizationStatus
    }

    private func openSystemSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        openURL(url)
    }

    private func sectionHeader(_ t: String) -> some View {
        Text(t)
            .font(SportsFonts.app(size: 13, weight: .semibold))
            .foregroundStyle(SpTheme.onDarkDim)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func settingsCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) { content() }
            .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card))
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous))
    }

    private var rowDivider: some View {
        Rectangle().fill(SpTheme.outline.opacity(0.6)).frame(height: 1).padding(.leading, 56)
    }

    private func iconTile(_ name: String, _ tint: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 30, height: 30)
            .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint.opacity(0.12)))
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(SportsFonts.app(size: 11.5, weight: .regular))
            .foregroundStyle(SpTheme.onDarkFaint)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var cardBg: some View {
        RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
            .fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1))
    }
}
