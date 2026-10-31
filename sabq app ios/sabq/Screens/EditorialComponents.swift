import SwiftUI

// عناصر مشتركة بين «أخباري» و«بانتظار قرارك» في تطبيق «سبق».

/// Routes for the editorial dashboard (registered in SabqNavigation).
struct MyNewsRoute: Hashable {}
struct SupervisorNewsRoute: Hashable {
    /// شريحة البداية: «عليها طلب تعديل» من لوحة التحكم تفتح الطلبات مباشرة.
    var filter: EditorialNewsFilter = .all
}
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

// MARK: - الشارة الموحّدة وملصق طلب التعديل (نفس كلمات الويب)

/// شارة حالة الخبر أو المقال. النص من `EditorialStates`.
struct EditorialStatePill: View {
    enum Tone { case neutral, info, warning, scheduled, success, danger }

    let title: String
    let tone: Tone

    static func tone(for label: String) -> Tone {
        switch label {
        case EditorialStates.published: return .success
        case EditorialStates.scheduled, EditorialStates.approved: return .scheduled
        case EditorialStates.needsChanges: return .warning
        case EditorialStates.pending: return .info
        case EditorialStates.notPublished: return .danger
        default: return .neutral
        }
    }

    init(_ title: String, tone: Tone? = nil) {
        self.title = title
        self.tone = tone ?? Self.tone(for: title)
    }

    private var ink: Color {
        switch tone {
        case .neutral: return SabqTheme.textSecondary
        case .info: return SabqTheme.primary
        case .warning: return SabqTheme.warning
        case .scheduled: return SabqTheme.teal
        case .success: return SabqTheme.success
        case .danger: return SabqTheme.danger
        }
    }

    var body: some View {
        Text(title)
            .sabqText(SabqType.tag)
            .foregroundStyle(ink)
            .padding(.horizontal, SabqLayout.space8)
            .padding(.vertical, 3)
            .background(Capsule().fill(tone == .neutral ? SabqTheme.surfaceMuted : ink.opacity(0.12)))
            .lineLimit(1)
    }
}

/// ملصق طلب التعديل على صف الخبر: نقطة نابضة للمفتوح (حمراء إن كان عاجلًا)،
/// وعلامة صح للمُعتمد، وعلامة × لغير المُعتمد. نفس ملصق الويب.
struct EditRequestBadge: View {
    enum Outcome { case pending, approved, rejected }

    let outcome: Outcome
    let detail: String
    var urgent = false
    var count = 1
    /// نص بديل كامل، مثل شريحة «عليها طلب تعديل» في لوحة التحكم.
    var title: String? = nil

    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var ink: Color {
        switch outcome {
        case .pending: return urgent ? SabqTheme.danger : SabqTheme.warning
        case .approved: return SabqTheme.success
        case .rejected: return SabqTheme.danger
        }
    }

    private var text: String {
        let more = count > 1 ? " (\(count))" : ""
        if let title { return title + more }
        let base: String
        switch outcome {
        case .pending: base = urgent ? EditorialStates.requestUrgent : EditorialStates.requestPending
        case .approved: base = EditorialStates.requestApproved
        case .rejected: base = EditorialStates.requestRejected
        }
        return detail.isEmpty ? base + more : "\(base) · \(detail)\(more)"
    }

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            switch outcome {
            case .pending:
                Circle()
                    .fill(ink)
                    .frame(width: 8, height: 8)
                    .overlay(
                        Circle()
                            .stroke(ink.opacity(pulse ? 0 : 0.5), lineWidth: pulse ? 6 : 0)
                            .scaleEffect(pulse ? 1.8 : 1)
                    )
                    .onAppear {
                        guard !reduceMotion else { return }
                        withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { pulse = true }
                    }
            case .approved:
                Image(systemName: "checkmark").font(SabqFonts.app(size: 12, weight: .bold))
            case .rejected:
                Image(systemName: "xmark").font(SabqFonts.app(size: 12, weight: .bold))
            }
            Text(text)
                .sabqText(SabqType.metaEmphasis)
                .lineLimit(1)
        }
        .foregroundStyle(ink)
        .padding(.horizontal, SabqLayout.space12)
        .frame(minHeight: 32)
        .background(
            Capsule()
                .fill(ink.opacity(0.08))
                .overlay(Capsule().stroke(ink.opacity(0.35), lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
    }
}

/// حبة زر صغيرة في صفوف القوائم (طلب تعديل، فتح الخبر).
struct EditorialPillButtonLabel: View {
    let title: String
    var systemImage: String? = nil
    var emphasized = false

    var body: some View {
        HStack(spacing: SabqLayout.space4) {
            if let systemImage {
                Image(systemName: systemImage).font(SabqFonts.app(size: 13, weight: .semibold))
            }
            Text(title).sabqText(SabqType.metaEmphasis)
        }
        .foregroundStyle(emphasized ? SabqTheme.primary : SabqTheme.textPrimary)
        .padding(.horizontal, SabqLayout.space12)
        .frame(minHeight: 36)
        .background(Capsule().fill(emphasized ? SabqTheme.primary.opacity(0.1) : SabqTheme.chipFill))
    }
}
