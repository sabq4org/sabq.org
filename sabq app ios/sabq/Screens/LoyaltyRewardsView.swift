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
            VStack(spacing: 18) {
                balanceCard
                if let success = successMessage {
                    successBanner(success)
                }
                if let err = redeemError {
                    errorBanner(err)
                }
                if isLoading && rewards.isEmpty {
                    ProgressView().padding(.top, 40)
                } else if let loadError {
                    Text(loadError)
                        .font(SabqFonts.app(size: 14))
                        .foregroundStyle(SabqTheme.coral)
                        .padding()
                } else if rewards.isEmpty {
                    emptyState
                } else {
                    LazyVStack(spacing: 12) {
                        ForEach(rewards) { reward in
                            rewardCard(reward)
                        }
                    }
                }
            }
            .padding(16)
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
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 14))
                Text("رصيدك من النقاط")
                    .font(SabqFonts.app(size: 13, weight: .semibold))
            }
            .foregroundStyle(.white.opacity(0.85))
            Text("\(balance)")
                .font(SabqFonts.app(size: 42, weight: .black))
                .foregroundStyle(.white)
            Text("نقطة")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .background(
            LinearGradient(
                colors: [SabqTheme.primaryEnd, SabqTheme.primaryStart],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .shadow(color: SabqTheme.primaryEnd.opacity(0.30), radius: 18, x: 0, y: 8)
    }

    // MARK: Reward card

    private func rewardCard(_ reward: LoyaltyReward) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                if let urlStr = reward.imageUrl, let url = URL(string: urlStr) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        rewardPlaceholder
                    }
                    .frame(width: 80, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                } else {
                    rewardPlaceholder
                        .frame(width: 80, height: 80)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 4) {
                    if let partner = reward.partnerName, !partner.isEmpty {
                        Text(partner.uppercased())
                            .font(SabqFonts.app(size: 10, weight: .heavy))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    Text(reward.nameAr)
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                        .lineLimit(2)
                    if let desc = reward.description, !desc.isEmpty {
                        Text(desc)
                            .font(SabqFonts.app(size: 12))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    Image(systemName: "sparkles").font(SabqFonts.app(size: 11, weight: .heavy))
                    Text("\(reward.pointsCost) نقطة")
                        .font(SabqFonts.app(size: 13, weight: .heavy))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(SabqTheme.primaryEnd.opacity(0.10), in: Capsule())

                if let stock = reward.remainingStock, stock < 20 {
                    Text("متبقي \(stock)")
                        .font(SabqFonts.app(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.coral)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(SabqTheme.coral.opacity(0.10), in: Capsule())
                }

                Spacer(minLength: 0)

                redeemButton(reward)
            }
        }
        .padding(14)
        .background(SabqTheme.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }

    private func redeemButton(_ reward: LoyaltyReward) -> some View {
        Button {
            confirming = reward
        } label: {
            HStack(spacing: 6) {
                if redeeming == reward.id {
                    ProgressView().tint(.white).controlSize(.mini)
                } else {
                    Image(systemName: reward.canRedeem ? "gift.fill" : "lock.fill")
                        .font(SabqFonts.app(size: 11, weight: .heavy))
                }
                Text(buttonLabel(for: reward))
                    .font(SabqFonts.app(size: 13, weight: .bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(
                reward.canRedeem
                    ? SabqTheme.brandGradient
                    : LinearGradient(colors: [SabqTheme.tertiaryInk, SabqTheme.secondaryInk], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: Capsule()
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

    private var rewardPlaceholder: some View {
        LinearGradient(
            colors: [SabqTheme.primaryEnd.opacity(0.20), SabqTheme.primaryStart.opacity(0.05)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        .overlay {
            Image(systemName: "gift.fill")
                .font(SabqFonts.app(size: 26, weight: .light))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.5))
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.10))
                    .frame(width: 96, height: 96)
                Image(systemName: "gift.fill")
                    .font(SabqFonts.app(size: 38, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 10, weight: .heavy))
                Text("قريباً")
                    .font(SabqFonts.app(size: 11, weight: .black))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(SabqTheme.primaryEnd, in: Capsule())
            Text("سيتم إتاحة المكافآت قريباً")
                .font(SabqFonts.app(size: 17, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text("نقاطك محفوظة ✨ نعمل على إطلاق متجر المكافآت قريباً — تابع تفاعلك واستمر في كسب النقاط.")
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 24)
        }
        .padding(.vertical, 36)
        .frame(maxWidth: .infinity)
    }

    private func successBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle.fill")
                .font(SabqFonts.app(size: 14))
            Text(message)
                .font(SabqFonts.app(size: 13, weight: .medium))
        }
        .foregroundStyle(SabqTheme.leaf)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.leaf.opacity(0.10), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(SabqFonts.app(size: 14))
            Text(message)
                .font(SabqFonts.app(size: 13, weight: .medium))
        }
        .foregroundStyle(SabqTheme.coral)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(SabqTheme.coral.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
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
