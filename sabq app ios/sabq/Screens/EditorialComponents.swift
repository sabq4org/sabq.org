import SwiftUI

// عناصر مشتركة بين «أخباري» و«بانتظار قرارك» في تطبيق «سبق».

/// Routes for the editorial dashboard (registered in SabqNavigation).
struct MyNewsRoute: Hashable {}
struct SupervisorNewsRoute: Hashable {}
struct SupervisorNewsPreviewRoute: Hashable { let id: String }
struct EditRequestReviewRoute: Hashable { let id: String }

/// Chip with a count, like the web filters.
struct EditorialChip: View {
    let title: String
    let count: Int
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SabqLayout.space4) {
                Text(title).sabqText(SabqType.metaEmphasis)
                Text("\(count)")
                    .sabqText(SabqType.tag)
                    .monospacedDigit()
                    .opacity(0.8)
            }
            .foregroundStyle(selected ? SabqTheme.onAction : SabqTheme.textPrimary)
            .padding(.horizontal, SabqLayout.space12)
            .frame(minHeight: 36)
            .background(Capsule().fill(selected ? SabqTheme.actionFill : SabqTheme.surface))
            .overlay(Capsule().stroke(selected ? Color.clear : SabqTheme.separator, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// Full-width primary / secondary action.
struct EditorialActionButton: View {
    enum Style { case primary, secondary, danger }

    let title: String
    var style: Style = .primary
    var busy: Bool = false
    var enabled: Bool = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: SabqLayout.space8) {
                if busy { ProgressView().tint(style == .primary ? SabqTheme.onAction : SabqTheme.primary) }
                Text(title).sabqText(SabqType.button)
            }
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
            .background(Capsule().fill(background))
        }
        .buttonStyle(.plain)
        .disabled(!enabled || busy)
    }

    private var foreground: Color {
        guard enabled else { return SabqTheme.disabledInk }
        switch style {
        case .primary: return SabqTheme.onAction
        case .secondary: return SabqTheme.textPrimary
        case .danger: return SabqTheme.danger
        }
    }

    private var background: Color {
        guard enabled else { return SabqTheme.disabledFill }
        switch style {
        case .primary: return SabqTheme.actionFill
        case .secondary, .danger: return SabqTheme.chipFill
        }
    }
}

/// Loading, error and «فعّل المصادقة الثنائية» states.
struct EditorialStatusView: View {
    let error: EditorialError?
    let loading: Bool
    let retry: () -> Void

    var body: some View {
        VStack(spacing: SabqLayout.space12) {
            if loading {
                ProgressView().tint(SabqTheme.primary)
                Text("نجلب البيانات…")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
            } else if let error {
                Image(systemName: icon(for: error))
                    .font(SabqFonts.app(size: 30, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text(title(for: error))
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(error.errorDescription ?? "")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if case .twoFactorRequired = error, let url = URL(string: "https://sabq.org/settings/security") {
                    Link(destination: url) {
                        Text("افتح إعدادات الأمان على sabq.org")
                            .sabqText(SabqType.button)
                            .foregroundStyle(SabqTheme.onAction)
                            .padding(.horizontal, SabqLayout.space24)
                            .frame(minHeight: SabqLayout.controlHeight)
                            .background(Capsule().fill(SabqTheme.actionFill))
                    }
                    Text("فعّلها مرة واحدة، ثم عد إلى هنا واسحب للتحديث.")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.center)
                }
                EditorialActionButton(title: "حاول مجددًا", style: .secondary, action: retry)
                    .frame(maxWidth: 220)
                    .padding(.top, SabqLayout.space8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space40)
        .padding(.horizontal, SabqLayout.space24)
    }

    private func icon(for error: EditorialError) -> String {
        switch error {
        case .twoFactorRequired: return "lock.shield"
        case .forbidden: return "hand.raised"
        case .unauthorized: return "person.crop.circle.badge.exclamationmark"
        default: return "wifi.exclamationmark"
        }
    }

    private func title(for error: EditorialError) -> String {
        switch error {
        case .twoFactorRequired: return "فعّل المصادقة الثنائية"
        case .forbidden: return "غير متاح لحسابك"
        case .unauthorized: return "سجّل الدخول"
        default: return "تعذر التحميل"
        }
    }
}

/// Small rounded thumbnail with a quiet placeholder.
struct EditorialThumbnail: View {
    let url: URL?
    var size: CGFloat = 64

    var body: some View {
        CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: size * 3) {
            Rectangle().fill(SabqTheme.surfaceStrong)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
        .accessibilityHidden(true)
    }
}

extension View {
    /// One quiet white group with page padding.
    func editorialGroup() -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .padding(SabqLayout.cardInset)
            .sabqNewsSurface()
    }
}
