import SwiftUI

struct DailyBriefRoute: Hashable {}

/// Two-mode landing reached by tapping the homepage greeting block.
///
/// - **Guest**: the member-value-prop landing that explains what an account
///   unlocks (interests, daily brief, saved articles, reading stats). Has
///   register + login CTAs.
/// - **Member**: a personal dashboard built from `authStore.currentUser`
///   (name, avatar, role, interests). NO call to `/api/ai/daily-summary` —
///   that endpoint only exists in `en` flavour today, so we render the
///   profile-driven view instead and let the user manage their interests.
struct DailyBriefView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore
    @State private var showLogin = false
    @State private var loginInitialMode = false
    @State private var showInterestsPicker = false
    @State private var allCategories: [APICategory] = []
    @State private var bookmarksCount: Int = 0

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                if authStore.isLoggedIn, let user = authStore.currentUser {
                    memberDashboard(user: user)
                } else {
                    guestLanding
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .sheet(isPresented: $showLogin, onDismiss: { }) {
            LoginSheet(initialMode: loginInitialMode)
        }
        .sheet(isPresented: $showInterestsPicker) {
            InterestsPickerSheet(allCategories: allCategories, selectedIds: Set(authStore.currentUser?.interests.map(\.id) ?? []))
                .environment(authStore)
        }
        .task {
            // Categories list powers the interests-picker sheet; cheap to
            // prefetch even for guests since it's public.
            allCategories = await NewsService.fetchCategories()
        }
    }

    // MARK: - Member dashboard

    @ViewBuilder
    private func memberDashboard(user: APIUser) -> some View {
        memberHero(user: user)
        interestsCard(user: user)
        valueGrid
    }

    private func memberHero(user: APIUser) -> some View {
        HStack(alignment: .center, spacing: 14) {
            avatar(user: user)
            VStack(alignment: .leading, spacing: 6) {
                Text(user.displayName)
                    .font(.system(size: 18, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text(user.localizedRole)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .lineLimit(1)
                }
                if let email = user.email, !email.isEmpty {
                    Text(email)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(LinearGradient(
                            colors: [SabqTheme.primaryEnd.opacity(0.08), SabqTheme.sky.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
        )
    }

    private func avatar(user: APIUser) -> some View {
        Group {
            if let urlString = user.avatar, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    avatarPlaceholder(user: user)
                }
                .frame(width: 64, height: 64)
                .clipShape(Circle())
            } else {
                avatarPlaceholder(user: user)
            }
        }
        .overlay(Circle().stroke(SabqTheme.primaryEnd.opacity(0.3), lineWidth: 1.5))
    }

    private func avatarPlaceholder(user: APIUser) -> some View {
        Circle()
            .fill(SabqTheme.primaryEnd.opacity(0.15))
            .frame(width: 64, height: 64)
            .overlay {
                Text(String(user.displayName.prefix(1)))
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    @ViewBuilder
    private func interestsCard(user: APIUser) -> some View {
        let interests = user.interests
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("اهتماماتك")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
                Button {
                    showInterestsPicker = true
                } label: {
                    Text(interests.isEmpty ? "اختر اهتماماتك" : "تعديل")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
                .buttonStyle(.plain)
            }

            if interests.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("لم تختر بعد اهتماماتك. اختر بضع تصنيفات لنقترح عليك أهم الأخبار في كل زيارة.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(4)

                    Button {
                        showInterestsPicker = true
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 13, weight: .semibold))
                            Text("اختر اهتماماتك الآن")
                                .font(.system(size: 13, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            Capsule().fill(SabqTheme.primaryEnd)
                        )
                    }
                    .buttonStyle(.plain)
                }
            } else {
                FlowLayout(spacing: 8) {
                    ForEach(interests) { interest in
                        Text(interest.name ?? interest.slug ?? "—")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(SabqTheme.primaryEnd)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(SabqTheme.primaryEnd.opacity(0.12))
                            )
                    }
                }

                Text("\(interests.count) تصنيف نختار لك منه أخباراً يومية")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
        )
    }

    private var valueGrid: some View {
        let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return LazyVGrid(columns: columns, spacing: 12) {
            featureTile(title: "موجز يومي", subtitle: "أهم ما يهمك في دقائق", icon: "doc.text.magnifyingglass", tint: SabqTheme.teal)
            featureTile(title: "اقتراحات ذكية", subtitle: "توصيات من سبق AI", icon: "sparkles", tint: SabqTheme.coral)
            featureTile(title: "محفوظاتك", subtitle: "اقرأها من أي جهاز", icon: "bookmark.fill", tint: SabqTheme.primaryEnd)
            featureTile(title: "إحصاءات قراءتك", subtitle: "مقالاتك ووقتك", icon: "chart.bar.fill", tint: SabqTheme.gold)
        }
    }

    private func featureTile(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            ZStack {
                Circle().fill(tint.opacity(0.13)).frame(width: 34, height: 34)
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
            }
            Text(title)
                .font(.system(size: 14, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)
            Text(subtitle)
                .font(.system(size: 11))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(2)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.16), lineWidth: 0.5)
        )
    }

    // MARK: - Guest landing

    private var guestLanding: some View {
        VStack(alignment: .leading, spacing: 18) {
            guestHero
            valueGrid
            guestInterestsPreview
            guestBenefits
            guestActions
        }
    }

    private var guestHero: some View {
        VStack(alignment: .leading, spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.12))
                    .frame(width: 74, height: 74)
                Image(systemName: "sparkles.rectangle.stack.fill")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .symbolRenderingMode(.hierarchical)
            }

            VStack(alignment: .leading, spacing: 8) {
                Text("موجزك في سبق")
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                Text("صفحة شخصية تبدأ من اهتماماتك: تختار ما يهمك، وسبق ترتّب لك موجزاً يومياً، توصيات، وإحصاءات قراءة واضحة.")
                    .font(.system(size: 14))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                        .fill(LinearGradient(
                            colors: [SabqTheme.primaryEnd.opacity(0.08), SabqTheme.sky.opacity(0.04)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
        )
    }

    private var guestInterestsPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Image(systemName: "person.text.rectangle.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("ابدأ باختيار ما يهمك")
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 74), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(["محليات", "اقتصاد", "رياضة", "تقنية", "رأي", "لحظة بلحظة", "العالم", "صحة"], id: \.self) { item in
                    Text(item)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .frame(maxWidth: .infinity)
                        .background(
                            Capsule(style: .continuous)
                                .fill(SabqTheme.primaryEnd.opacity(0.08))
                        )
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
        )
    }

    private var guestBenefits: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("بعد التسجيل تحصل على")
                .font(.system(size: 15, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)

            benefitRow("موجز صباحي أو مسائي مبني على اهتماماتك", icon: "sun.max.fill")
            benefitRow("اقتراحات أخبار أدق كلما قرأت أكثر", icon: "wand.and.stars")
            benefitRow("حفظ المقالات والعودة لها من أي جهاز", icon: "bookmark.fill")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.primaryEnd.opacity(0.05))
        )
    }

    private func benefitRow(_ text: String, icon: String) -> some View {
        HStack(alignment: .top, spacing: 9) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(width: 18)
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var guestActions: some View {
        VStack(spacing: 10) {
            Button {
                loginInitialMode = true
                showLogin = true
            } label: {
                Text("أنشئ حسابك")
                    .font(.system(size: 16, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)

            Button {
                loginInitialMode = false
                showLogin = true
            } label: {
                Text("لديك حساب؟ تسجيل الدخول")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Interests picker sheet

/// Modal sheet that lets a logged-in user toggle their category interests on
/// and off. Persists via `AuthStore.updateInterests(_:)` on save.
struct InterestsPickerSheet: View {
    let allCategories: [APICategory]
    let selectedIds: Set<String>

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore
    @State private var selection: Set<String> = []
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("اختر التصنيفات التي تهمك. سيظهر في موجزك اليومي ما يخصها بشكل أكبر.")
                        .font(.system(size: 14))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineSpacing(5)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 10)], alignment: .leading, spacing: 10) {
                        ForEach(allCategories) { category in
                            interestChip(category: category)
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 18)
                .padding(.bottom, 32)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .navigationTitle("اهتماماتك")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView().tint(SabqTheme.primaryEnd)
                        } else {
                            Text("حفظ")
                                .font(.system(size: 14, weight: .heavy))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }
                    }
                    .disabled(isSaving)
                }
            }
            .onAppear { selection = selectedIds }
        }
    }

    private func interestChip(category: APICategory) -> some View {
        let id = category.id
        let isOn = selection.contains(id)
        return Button {
            SabqHaptics.light()
            if isOn { selection.remove(id) } else { selection.insert(id) }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 13, weight: .semibold))
                Text(category.name.isEmpty ? (category.slug ?? "—") : category.name)
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
            }
            .foregroundStyle(isOn ? .white : SabqTheme.ink)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity)
            .background(
                Capsule().fill(isOn ? SabqTheme.primaryEnd : SabqTheme.paleFill)
            )
            .overlay(
                Capsule().stroke(isOn ? Color.clear : SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }

    private func save() async {
        isSaving = true
        await authStore.updateInterests(categoryIds: Array(selection))
        isSaving = false
        dismiss()
    }
}
