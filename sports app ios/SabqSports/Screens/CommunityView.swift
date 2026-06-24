import SwiftUI

// المجتمع — توقّع النتائج + لوحة المتصدّرين + متابعاتي. يتطلّب تسجيل دخول
// (Apple Sign-In + Bearer عبر /api/v1/sports/*) فيُفعّل في v1.1. الآن واجهة
// «قريبًا» أنيقة تعرّف المستخدم بما سيأتي.
struct CommunityView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    SpComingSoon(
                        icon: "person.2.fill",
                        title: "المجتمع قريبًا",
                        subtitle: "توقّع نتائج مباريات روشن، نافِس الجمهور على لوحة المتصدّرين، وتابع فِرقك المفضّلة."
                    )
                    featureCard(icon: "soccerball", title: "توقّع النتيجة", desc: "نقاط على كل توقّع صحيح قبل انطلاق المباراة")
                    featureCard(icon: "trophy.fill", title: "لوحة المتصدّرين", desc: "ترتيب أسبوعي وشهري لأفضل المتوقّعين")
                    featureCard(icon: "bell.badge.fill", title: "متابعة وتنبيهات", desc: "إشعارات الأهداف والبطاقات والنهاية لفِرقك")
                }
                .padding(16)
            }
            .background(SpAmbientBackground())
            .navigationTitle("المجتمع")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    private func featureCard(icon: String, title: String, desc: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(SpTheme.gold)
                .frame(width: 44, height: 44)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SpTheme.gold.opacity(0.12)))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(SportsFonts.app(size: 15, weight: .bold)).foregroundStyle(SpTheme.onDark)
                Text(desc).font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.onDarkDim)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous)
                .fill(SpTheme.cardFill)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }
}

// واجهة «قريبًا» موحّدة.
struct SpComingSoon: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundStyle(SpTheme.goldTitleGradient)
            Text(title)
                .font(SportsFonts.app(size: 22, weight: .bold))
                .foregroundStyle(SpTheme.onDark)
            Text(subtitle)
                .font(SportsFonts.app(size: 13))
                .foregroundStyle(SpTheme.onDarkDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                .fill(SpTheme.surfaceRaised)
                .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1))
        )
    }
}
