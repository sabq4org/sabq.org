import SwiftUI

// حسابي — تسجيل دخول Apple + تفضيلات التنبيهات + الفِرق المتابَعة (v1.1).
// النسخة الأولى تصفّح فقط، فهذه واجهة تعريفية + روابط ثابتة.
struct AccountView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    SpComingSoon(
                        icon: "person.crop.circle",
                        title: "حسابك قريبًا",
                        subtitle: "سجّل الدخول عبر Apple لحفظ توقّعاتك، متابعة فِرقك، وتلقّي تنبيهات المباريات."
                    )

                    linkRow(icon: "globe", title: "موقع سبق", value: "sabq.org")
                    linkRow(icon: "sportscourt", title: "القسم الرياضي", value: "sabq.org/sports")
                    linkRow(icon: "info.circle", title: "الإصدار", value: "1.0 (تجريبي)")
                }
                .padding(16)
            }
            .background(SpAmbientBackground())
            .navigationTitle("حسابي")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    private func linkRow(icon: String, title: String, value: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(SpTheme.greenSoft)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(SpTheme.greenSoft.opacity(0.12)))
            Text(title).font(SportsFonts.app(size: 14, weight: .semibold)).foregroundStyle(SpTheme.onDark)
            Spacer(minLength: 0)
            Text(value).font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }
}
