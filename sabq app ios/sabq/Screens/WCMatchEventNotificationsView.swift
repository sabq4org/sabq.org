import SwiftUI

/// تنبيهات المباريات في تطبيق سبق موقوفة: الخادم يرسلها لأجهزة فارا وحدها
/// (قرار المنتج 2026-07-10، `pushToUserDevices` في sportsAlertsService.ts)
/// كي لا يصل الإشعار نفسه مرتين لمن يملك التطبيقين. الشاشة تبقى بنفس الاسم
/// لأن الإعدادات وصفحتي فريق المونديال وكأس آسيا تفتحها، وتوجّه القارئ إلى فارا.
struct WCMatchEventNotificationsView: View {
    @Environment(\.openURL) private var openURL

    private static let varaScheme = URL(string: "sabqsports://")!

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: SabqLayout.space24) {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "bell.badge")
                            .font(SabqFonts.app(size: 18, weight: .semibold))
                            .foregroundStyle(SabqTheme.primary)
                            .accessibilityHidden(true)
                        Text("تنبيهات المباريات في تطبيق فارا")
                            .sabqText(SabqType.rowTitle)
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                    Text("انطلاق المباراة والأهداف والبطاقات وحالات الفار والنتيجة النهائية تصلك من تطبيق فارا، تطبيق سبق الرياضي. أوقفناها في تطبيق سبق حتى لا يصلك الإشعار نفسه مرتين.")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Text("تابع فرقك واختر أنواع التنبيهات من داخل فارا.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(SabqLayout.space16)
                .wcQuietBlock()

                Button {
                    // يفتح فارا إن كان مثبّتًا، وإلا صفحته في المتجر
                    openURL(Self.varaScheme) { accepted in
                        if !accepted { openURL(VaraApp.appStoreURL) }
                    }
                } label: {
                    Text("افتح تطبيق فارا")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, SabqLayout.space12)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(SabqTheme.primary)
                        )
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.vertical, SabqLayout.space24)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("تنبيهات المباريات")
        .navigationBarTitleDisplayMode(.inline)
    }
}
