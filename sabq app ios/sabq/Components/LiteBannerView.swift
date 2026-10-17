import SwiftUI

/// Top-of-screen banner that surfaces sabq Lite auto-trigger events
/// (issue #81 Phase 3).
///
/// Two states, both driven off `LiteModeManager.banner`:
///   - `.autoActivated` — "الاتصال بطيء — تم التحويل لتصفح سبق Lite ⚡"
///     auto-dismisses after 4 seconds.
///   - `.recoveryOffered` — "الاتصال تحسّن — العودة للوضع الطبيعي؟"
///     with [عودة] [ابقَ في Lite]. If no action within 8 seconds the
///     conservative default is "stay" — banner self-dismisses, Lite
///     stays on.
///
/// Place at the TOP of the home/article view using `.overlay(alignment:
/// .top)` or a ZStack so it floats above the scroll content.
struct LiteBannerView: View {
    @Environment(LiteModeManager.self) private var lite

    var body: some View {
        Group {
            switch lite.banner {
            case .autoActivated:
                ActivationPill()
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(nanoseconds: 4 * 1_000_000_000)
                        lite.clearActivationBanner()
                    }
            case .recoveryOffered:
                RecoveryCard()
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        // "Stay in Lite" is the conservative default —
                        // matches the spec in #81.
                        try? await Task.sleep(nanoseconds: 8 * 1_000_000_000)
                        if lite.banner == .recoveryOffered {
                            lite.dismissRecovery()
                        }
                    }
            case .none:
                EmptyView()
            }
        }
        .animation(.easeOut(duration: 0.25), value: lite.banner)
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.top, SabqLayout.space8)
        // لا تعترض لمسات السحب للتحديث عندما لا يوجد شريط ظاهر
        .allowsHitTesting(lite.banner != .none)
    }

    @ViewBuilder
    private func ActivationPill() -> some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "bolt.fill")
                .font(SabqType.tag.font)
                .foregroundStyle(SabqTheme.onAction)
                .accessibilityHidden(true)
            Text("الاتصال بطيء — تم التحويل لتصفح سبق Lite ⚡")
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.onAction)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, SabqLayout.space16)
        .padding(.vertical, SabqLayout.space12)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.actionFill)
        )
    }

    @ViewBuilder
    private func RecoveryCard() -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "wifi")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text("الاتصال تحسّن — العودة للوضع الطبيعي؟")
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                Spacer(minLength: 0)
            }
            HStack(spacing: SabqLayout.space8) {
                Button {
                    SabqHaptics.medium()
                    lite.acceptRecovery()
                } label: {
                    Text("عودة")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, SabqLayout.space16)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .fill(SabqTheme.actionFill)
                        )
                }
                .buttonStyle(.plain)

                Button {
                    SabqHaptics.light()
                    lite.dismissRecovery()
                } label: {
                    Text("ابقَ في Lite")
                        .font(SabqType.metaEmphasis.font)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .padding(.horizontal, SabqLayout.space16)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .overlay(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .stroke(SabqTheme.outline, lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
            }
        }
        .padding(SabqLayout.space16)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 1)
        )
    }
}
