import SwiftUI

struct MyKeywordsRoute: Hashable {}

/// «كلماتي» — الكلمات التي يتابعها القارئ (نظير /my-keywords في الويب).
/// للمسجّل تأتي من حسابه مع عدد الأخبار، وللزائر من الجهاز مع دعوة للدخول
/// كي تُحفظ في حسابه. النقر يفتح أخبار الكلمة، والسحب يلغي المتابعة.
struct MyKeywordsView: View {
    @Environment(FollowedKeywordsStore.self) private var followedKeywords
    @Environment(AuthStore.self) private var authStore
    @State private var showLogin = false

    var body: some View {
        List {
            Section {
                ForEach(followedKeywords.followed, id: \.self) { keyword in
                    NavigationLink(value: KeywordRoute(keyword: keyword)) {
                        row(keyword)
                    }
                    .listRowBackground(SabqTheme.background)
                }
                .onDelete { offsets in
                    for keyword in offsets.map({ followedKeywords.followed[$0] }) {
                        followedKeywords.remove(keyword)
                    }
                }
            } footer: {
                if !followedKeywords.followed.isEmpty {
                    Text(authStore.isLoggedIn
                         ? "كلماتك محفوظة في حسابك وتظهر نفسها على sabq.org، وتصلك أخبارها الجديدة في إشعارات حسابك على الموقع."
                         : "كلماتك محفوظة على هذا الجهاز فقط. سجّل الدخول لتُحفظ في حسابك.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                        // هامش ذيل القائمة الافتراضي ~10 نقاط على شاشة Duo المطوية
                        .padding(.horizontal, SabqLayout.space8)
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(SabqTheme.background)
        .overlay {
            if followedKeywords.followed.isEmpty {
                EmptyStateView(
                    icon: "tag",
                    tint: SabqTheme.secondaryInk,
                    title: "لا تتابع أي كلمة بعد",
                    subtitle: "افتح أي كلمة مفتاحية أسفل الخبر واضغط «متابعة الوسم» لتجدها هنا."
                )
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !authStore.isLoggedIn && !followedKeywords.followed.isEmpty {
                Button { showLogin = true } label: {
                    Text("سجّل الدخول لحفظ كلماتك")
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
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.bottom, 96)
            }
        }
        .sabqRTL()
        .navigationTitle("كلماتي")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !followedKeywords.followed.isEmpty { EditButton() }
        }
        .task(id: authStore.isLoggedIn) { followedKeywords.syncFromServer() }
        .refreshable { followedKeywords.syncFromServer() }
        .sheet(isPresented: $showLogin) { LoginSheet() }
    }

    private func row(_ keyword: String) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Image(systemName: "number")
                .font(SabqFonts.app(size: 15, weight: .semibold))
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 36, height: 36)
                .background(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous).fill(SabqTheme.surfaceMuted))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(keyword)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                if let count = followedKeywords.articleCounts[keyword], count > 0 {
                    Text("\(count.formatted()) خبر")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, SabqLayout.space4)
    }
}
