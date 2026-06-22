import SwiftUI

/// شاشة اختيار أنواع تنبيهات المباريات (عامّة) — أيّ الأحداث تصلك دفعيًّا عن
/// الفِرق التي تتابعها: انطلاق المباراة، الأهداف، البطاقات، حالات الفار، النهاية.
/// تدور عبر `GET` / `PUT /api/v1/sports/alert-prefs`. تطفئة نوع تكتمه فورًا.
/// تتبع نمط NotificationPreferencesView (تحميل عند الظهور + حفظ عند كل تبديل).
struct WCMatchEventNotificationsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var prefs: SportsAlertPreferences = .allOn
    @State private var loaded = false
    @State private var saving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                introCard

                SurfaceCard {
                    VStack(spacing: 4) {
                        toggleRow(
                            icon: "sportscourt.fill",
                            tint: SabqTheme.sky,
                            title: "انطلاق المباراة",
                            subtitle: "إشعار عند صافرة بداية مباراة فريقك",
                            isOn: $prefs.kickoff
                        )
                        Divider()
                        toggleRow(
                            icon: "soccerball",
                            tint: SabqTheme.leaf,
                            title: "الأهداف",
                            subtitle: "كل هدف فور تسجيله (يشمل ركلات الجزاء)",
                            isOn: $prefs.goals
                        )
                        Divider()
                        toggleRow(
                            icon: "rectangle.portrait.fill",
                            tint: .orange,
                            title: "البطاقات",
                            subtitle: "البطاقات الصفراء والحمراء",
                            isOn: $prefs.cards
                        )
                        Divider()
                        toggleRow(
                            icon: "tv.fill",
                            tint: .indigo,
                            title: "حالات الفار (VAR)",
                            subtitle: "إلغاء هدف، احتساب ركلة جزاء، أو تسلل بعد المراجعة",
                            isOn: $prefs.varReview
                        )
                        Divider()
                        toggleRow(
                            icon: "flag.checkered",
                            tint: SabqTheme.coral,
                            title: "نهاية المباراة",
                            subtitle: "النتيجة النهائية عند صافرة النهاية",
                            isOn: $prefs.fulltime
                        )
                    }
                }

                if saving {
                    HStack(spacing: 6) {
                        ProgressView().controlSize(.small)
                        Text("جاري الحفظ...")
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 20)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
            }
            ToolbarItem(placement: .principal) {
                Text("تنبيهات المباريات")
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
        .task {
            if let p = try? await APIClient.shared.fetchSportsAlertPreferences() {
                prefs = p
                loaded = true
            }
        }
        .onChange(of: prefs) { _, newPrefs in
            guard loaded else { return }
            Task { await save(newPrefs) }
        }
    }

    private var introCard: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "bell.badge")
                        .font(SabqFonts.app(size: 18, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text("تنبيهات أحداث المباريات")
                        .font(SabqFonts.app(size: 16, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                Text("تصلك هذه التنبيهات عن الفِرق التي تتابعها فقط. اختر الأنواع التي تهمّك — تطبَّق على كل مبارياتها (المونديال وغيره).")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(3)
            }
        }
    }

    private func toggleRow(icon: String, tint: Color, title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.14))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(tint)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Text(subtitle)
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(tint)
        }
        .padding(.vertical, 8)
    }

    private func save(_ newPrefs: SportsAlertPreferences) async {
        saving = true
        defer { saving = false }
        try? await APIClient.shared.updateSportsAlertPreferences(newPrefs)
    }
}
