import SwiftUI

/// "متجر المكافآت" — list of redeemable rewards the member can spend
/// their points on. Each card shows the cost, the user's affordability
/// state, remaining stock (when limited), and a redeem button. Confirm
/// dialog stops accidental taps from burning points.
struct LoyaltyRewardsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var balance = 0
    @State private var rewards: [LoyaltyReward] = []
    @State private var isLoading = false
    @State private var loadError: String?
    @State private var redeeming: String?
    @State private var confirming: LoyaltyReward?
    @State private var successMessage: String?
    @State private var redeemError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: SabqLayout.space16) {
                balanceCard
                if let success = successMessage {
                    successBanner(success)
                }
                if let err = redeemError {
                    errorBanner(err)
                }
                if isLoading && rewards.isEmpty {
                    ProgressView().padding(.top, SabqLayout.space40)
                } else if let loadError {
                    Text(loadError)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.danger)
                        .multilineTextAlignment(.center)
                        .padding(SabqLayout.space16)
                } else if rewards.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(Array(rewards.enumerated()), id: \.element.id) { index, reward in
                            if index > 0 {
                                Rectangle().fill(SabqTheme.separator).frame(height: 1)
                            }
                            rewardCard(reward)
                        }
                    }
                }
            }
            .padding(SabqLayout.pageMargin)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("متجر المكافآت")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sabqRTL()
        .alert(item: $confirming) { reward in
            Alert(
                title: Text("تأكيد الاستبدال"),
                message: Text("هل تريد استبدال \"\(reward.nameAr)\" مقابل \(reward.pointsCost) نقطة؟"),
                primaryButton: .default(Text("استبدل"), action: { Task { await redeem(reward) } }),
                secondaryButton: .cancel(Text("إلغاء"))
            )
        }
    }

    // MARK: Balance hero

    private var balanceCard: some View {
        VStack(spacing: SabqLayout.space4) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "sparkles")
                    .font(SabqType.meta.font)
                    .accessibilityHidden(true)
                Text("رصيدك من النقاط")
                    .font(SabqType.metaEmphasis.font)
            }
            .foregroundStyle(SabqTheme.textSecondary)
            Text("\(balance)")
                .font(SabqFonts.headline(size: 40))
                .foregroundStyle(SabqTheme.textPrimary)
                .environment(\.layoutDirection, .leftToRight)
            Text("نقطة")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // MARK: Reward card

    private func rewardCard(_ reward: LoyaltyReward) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(alignment: .top, spacing: SabqLayout.space12) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    if let partner = reward.partnerName, !partner.isEmpty {
                        Text(partner.uppercased())
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textTertiary)
                    }
                    Text(reward.nameAr)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(2)
                    if let desc = reward.description, !desc.isEmpty {
                        Text(desc)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                CachedAsyncImage(url: reward.imageUrl.flatMap(URL.init(string:)), contentMode: .fill) {
                    SabqImagePlaceholder()
                }
                .frame(width: 80, height: 80)
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
                .accessibilityHidden(true)
            }

            HStack(spacing: SabqLayout.space8) {
                Text("\(reward.pointsCost) نقطة")
                    .font(SabqType.metaEmphasis.font)
                    .foregroundStyle(SabqTheme.primary)

                if let stock = reward.remainingStock, stock < 20 {
                    Text("متبقي \(stock)")
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.danger)
                }

                Spacer(minLength: 0)

                redeemButton(reward)
            }
        }
        .padding(.vertical, SabqLayout.space16)
    }

    private func redeemButton(_ reward: LoyaltyReward) -> some View {
        Button {
            confirming = reward
        } label: {
            HStack(spacing: SabqLayout.space8) {
                if redeeming == reward.id {
                    ProgressView().tint(SabqTheme.onAction).controlSize(.mini)
                } else {
                    Image(systemName: reward.canRedeem ? "gift.fill" : "lock.fill")
                        .font(SabqType.tag.font)
                }
                Text(buttonLabel(for: reward))
                    .font(SabqType.button.font)
            }
            .foregroundStyle(reward.canRedeem ? SabqTheme.onAction : SabqTheme.disabledInk)
            .padding(.horizontal, SabqLayout.space16)
            .frame(minHeight: SabqLayout.touchTarget)
            .background(
                reward.canRedeem ? SabqTheme.actionFill : SabqTheme.disabledFill,
                in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
            )
        }
        .buttonStyle(.plain)
        .disabled(!reward.canRedeem || redeeming != nil)
    }

    private func buttonLabel(for r: LoyaltyReward) -> String {
        if redeeming == r.id { return "..." }
        if r.canRedeem { return "استبدل" }
        if r.reasonBlocked == "MAX_PER_USER" { return "وصلت الحد" }
        return "تحتاج \(r.pointsShort)+"
    }

    private var emptyState: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "gift")
                .font(SabqFonts.app(size: 26, weight: .regular))
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(width: 56, height: 56)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium))
                .accessibilityHidden(true)
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "sparkles")
                    .font(SabqType.tag.font)
                Text("قريباً")
                    .font(SabqType.tag.font)
            }
            .foregroundStyle(SabqTheme.onAction)
            .padding(.horizontal, SabqLayout.space12)
            .padding(.vertical, SabqLayout.space4)
            .background(SabqTheme.actionFill, in: Capsule())
            Text("سيتم إتاحة المكافآت قريباً")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text("نقاطك محفوظة ✨ نعمل على إطلاق متجر المكافآت قريباً — تابع تفاعلك واستمر في كسب النقاط.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, SabqLayout.space24)
        }
        .padding(.vertical, SabqLayout.space32)
        .frame(maxWidth: .infinity)
    }

    private func successBanner(_ message: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "checkmark.circle.fill")
                .font(SabqType.excerpt.font)
                .accessibilityHidden(true)
            Text(message)
                .sabqText(SabqType.meta)
        }
        .foregroundStyle(SabqTheme.success)
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(SabqType.excerpt.font)
                .accessibilityHidden(true)
            Text(message)
                .sabqText(SabqType.meta)
        }
        .foregroundStyle(SabqTheme.danger)
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    // MARK: Networking

    @MainActor
    private func load() async {
        isLoading = true
        loadError = nil
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.fetchLoyaltyRewards()
            balance = response.balance
            rewards = response.rewards
        } catch let apiError as APIError {
            loadError = apiError.errorDescription
        } catch {
            loadError = "تعذر تحميل المكافآت"
        }
    }

    @MainActor
    private func redeem(_ reward: LoyaltyReward) async {
        redeeming = reward.id
        redeemError = nil
        defer { redeeming = nil }
        do {
            let response = try await APIClient.shared.redeemLoyaltyReward(id: reward.id)
            if response.success {
                successMessage = response.message ?? "تم استبدال المكافأة بنجاح ✨"
                if let newBalance = response.remainingBalance {
                    balance = newBalance
                }
                // Drop the row optimistically if it had limited stock
                // or per-user cap so the UI reflects the new state.
                await load()
                SabqHaptics.success()
            } else {
                redeemError = response.message ?? "تعذر الاستبدال"
            }
        } catch let apiError as APIError {
            redeemError = apiError.errorDescription
        } catch {
            redeemError = "تعذر الاستبدال. حاول لاحقاً."
        }
    }
}

// `LoyaltyReward` is already Identifiable via the `id: String` field
// declared on the struct in LoyaltyModels.swift.
