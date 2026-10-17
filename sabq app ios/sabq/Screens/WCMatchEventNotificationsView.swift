import SwiftUI

/// شاشة اختيار أنواع تنبيهات المباريات (عامّة) — أيّ الأحداث تصلك دفعيًّا عن
/// الفِرق التي تتابعها: انطلاق المباراة، الأهداف، البطاقات، حالات الفار، النهاية.
/// تدور عبر `GET` / `PUT /api/v1/sports/alert-prefs`. تطفئة نوع تكتمه فورًا.
/// تتبع نمط NotificationPreferencesView (تحميل عند الظهور + حفظ عند كل تبديل).
struct WCMatchEventNotificationsView: View {
    @State private var prefs: SportsAlertPreferences = .allOn
    @State private var loaded = false
    @State private var saving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                introCard

                // قائمة غير مؤطّرة: صفوف تفصلها خطوط رفيعة
                VStack(spacing: 0) {
                    toggleRow(
                        icon: "sportscourt.fill",
                        title: "انطلاق المباراة",
                        subtitle: "إشعار عند صافرة بداية مباراة فريقك",
                        isOn: $prefs.kickoff
                    )
                    WCRowSeparator()
                    toggleRow(
                        icon: "soccerball",
                        title: "الأهداف",
                        subtitle: "كل هدف فور تسجيله (يشمل ركلات الجزاء)",
                        isOn: $prefs.goals
                    )
                    WCRowSeparator()
                    toggleRow(
                        icon: "rectangle.portrait.fill",
                        title: "البطاقات",
                        subtitle: "البطاقات الصفراء والحمراء",
                        isOn: $prefs.cards
                    )
                    WCRowSeparator()
                    toggleRow(
                        icon: "tv.fill",
                        title: "حالات الفار (VAR)",
                        subtitle: "إلغاء هدف، احتساب ركلة جزاء، أو تسلل بعد المراجعة",
                        isOn: $prefs.varReview
                    )
                    WCRowSeparator()
                    toggleRow(
                        icon: "flag.checkered",
                        title: "نهاية المباراة",
                        subtitle: "النتيجة النهائية عند صافرة النهاية",
                        isOn: $prefs.fulltime
                    )
                }

                if saving {
                    HStack(spacing: SabqLayout.space8) {
                        ProgressView().controlSize(.small)
                        Text("جاري الحفظ...")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textTertiary)
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.vertical, SabqLayout.space24)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("تنبيهات المباريات")
        .navigationBarTitleDisplayMode(.inline)
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

    /// بلوك معلومة هادئ: surfaceMuted بلا حدّ، زاوية 12.
    private var introCard: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "bell.badge")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text("تنبيهات أحداث المباريات")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
            }
            Text("تصلك هذه التنبيهات عن الفِرق التي تتابعها فقط. اختر الأنواع التي تهمّك — تطبَّق على كل مبارياتها (المونديال وغيره).")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(SabqLayout.space16)
        .wcQuietBlock()
    }

    private func toggleRow(icon: String, title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: SabqLayout.space12) {
            // أيقونة بادئة في مربع هادئ صغير (بلا ألوان زخرفية)
            Image(systemName: icon)
                .font(SabqFonts.app(size: 15, weight: .semibold))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(subtitle)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Toggle(title, isOn: isOn)
                .labelsHidden()
                .tint(SabqTheme.primary)
        }
        .padding(.vertical, SabqLayout.space12)
    }

    private func save(_ newPrefs: SportsAlertPreferences) async {
        saving = true
        defer { saving = false }
        try? await APIClient.shared.updateSportsAlertPreferences(newPrefs)
    }
}
