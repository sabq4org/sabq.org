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
        .padding(.horizontal, 14)
        .padding(.top, 8)
    }

    @ViewBuilder
    private func ActivationPill() -> some View {
        HStack(spacing: 10) {
            Image(systemName: "bolt.fill")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(.white)
            Text("الاتصال بطيء — تم التحويل لتصفح سبق Lite ⚡")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(.white)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(
            Capsule().fill(SabqTheme.primaryEnd)
                .shadow(color: .black.opacity(0.18), radius: 10, x: 0, y: 4)
        )
    }

    @ViewBuilder
    private func RecoveryCard() -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "wifi")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.primaryEnd)
                Text("الاتصال تحسّن — العودة للوضع الطبيعي؟")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
            }
            HStack(spacing: 8) {
                Button {
                    SabqHaptics.medium()
                    lite.acceptRecovery()
                } label: {
                    Text("عودة")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(Capsule().fill(SabqTheme.primaryEnd))
                }
                .buttonStyle(.plain)

                Button {
                    SabqHaptics.light()
                    lite.dismissRecovery()
                } label: {
                    Text("ابقَ في Lite")
                        .font(SabqFonts.app(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(
                            Capsule().stroke(SabqTheme.outline.opacity(0.6), lineWidth: 0.5)
                        )
                }
                .buttonStyle(.plain)
                Spacer(minLength: 0)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.12), radius: 14, x: 0, y: 5)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }
}
