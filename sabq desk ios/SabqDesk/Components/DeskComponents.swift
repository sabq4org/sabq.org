import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// Full-screen state: an icon, a title, an explanation and actions.
struct DeskMessageView<Actions: View>: View {
    let systemImage: String
    let title: String
    let message: String
    @ViewBuilder var actions: () -> Actions

    var body: some View {
        VStack(spacing: DeskLayout.space16) {
            Spacer()
            Image(systemName: systemImage)
                .font(.system(size: 40, weight: .regular))
                .foregroundStyle(DeskTheme.primary)
                .accessibilityHidden(true)
            Text(title)
                .deskText(DeskType.sectionHeading)
                .foregroundStyle(DeskTheme.textPrimary)
                .multilineTextAlignment(.center)
            Text(message)
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTheme.textSecondary)
                .multilineTextAlignment(.center)
            actions()
                .padding(.top, DeskLayout.space8)
            Spacer()
        }
        .padding(.horizontal, DeskLayout.space24)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DeskTheme.background)
    }
}

/// Small status label: tinted text on a muted capsule, no heavy chrome.
struct StatusPill: View {
    let title: String
    var tint: Color = DeskTheme.textSecondary

    var body: some View {
        Text(title)
            .deskText(DeskType.tag)
            .foregroundStyle(tint)
            .padding(.horizontal, DeskLayout.space8)
            .padding(.vertical, 2)
            .background(tint.opacity(0.12), in: Capsule())
    }
}

/// Inline error line shown above a form or action bar.
struct ErrorLine: View {
    let message: String

    var body: some View {
        Label(message, systemImage: "exclamationmark.circle")
            .deskText(DeskType.meta)
            .foregroundStyle(DeskTheme.danger)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
    }
}

/// Timestamps and counts read left-to-right inside RTL text.
struct LTRText: View {
    let text: String
    var role: DeskTextRole = DeskType.timestamp
    var color: Color = DeskTheme.textTertiary

    var body: some View {
        Text(verbatim: "\u{2066}\(text)\u{2069}")
            .deskText(role)
            .foregroundStyle(color)
            .monospacedDigit()
    }
}

extension StaffTicketStatus {
    var tint: Color {
        switch self {
        case .open: return DeskTheme.warning
        case .answered: return DeskTheme.success
        case .closed: return DeskTheme.textTertiary
        }
    }
}

extension StaffSocialStatus {
    var tint: Color {
        switch self {
        case .draft: return DeskTheme.warning
        case .scheduled, .processing: return DeskTheme.primary
        case .published: return DeskTheme.success
        case .failed: return DeskTheme.danger
        case .canceled, .unknown: return DeskTheme.textTertiary
        }
    }
}

extension StaffInboxItem {
    var statusTint: Color {
        switch kind {
        case .ticket: return StaffTicketStatus(rawValue: status)?.tint ?? DeskTheme.textTertiary
        case .social: return StaffSocialStatus(rawValue: status)?.tint ?? DeskTheme.textTertiary
        }
    }
}
