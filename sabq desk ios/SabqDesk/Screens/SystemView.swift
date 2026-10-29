import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// The two screens of «النظام».
enum SystemSection: String, CaseIterable, Identifiable, Hashable {
    case alerts
    case health

    var id: String { rawValue }

    var title: String {
        switch self {
        case .alerts: return "التنبيهات"
        case .health: return "حالة النظام"
        }
    }
}

/// «النظام» (admins only): «تنبيهات الإدارة» and «حالة النظام» behind two
/// chips under the screen's header. A member with only one of the two
/// permissions sees no chips.
struct SystemView: View {
    @Environment(AppModel.self) private var app
    @Binding var section: SystemSection
    @State private var path: [DeskDeepLink] = []

    private var sections: [SystemSection] {
        var result: [SystemSection] = []
        if app.capabilities.canAdminAlerts { result.append(.alerts) }
        if app.capabilities.canSystemHealth { result.append(.health) }
        return result
    }

    private var shownSection: SystemSection {
        sections.contains(section) ? section : (sections.first ?? .health)
    }

    private var picker: SystemSectionPicker? {
        sections.count > 1 ? SystemSectionPicker(sections: sections, selection: $section, urgentCount: app.urgentAlerts) : nil
    }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                switch shownSection {
                case .alerts:
                    AdminAlertsView(openSystem: { section = .health }, open: { path = [$0] }, picker: picker)
                case .health:
                    SystemHealthView(picker: picker)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(DeskTheme.background)
            // Read by the back button of pushed screens; the bar itself is hidden here.
            .navigationTitle("النظام")
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: DeskDeepLink.self) { link in
                switch link {
                case .social(let id):
                    SocialDetailView(postID: id) { _ in }
                case .ticket(let id):
                    TicketDetailView(ticketID: id) { _ in }
                case .balances:
                    ModelBalancesView()
                case .balance(let provider):
                    ProviderBalanceDetailView(provider: provider)
                case .systemHealth, .alerts, .opinion, .notifications:
                    // .opinion / .notifications are routed by RootView.
                    EmptyView()
                }
            }
        }
        .onChange(of: path) { _, newPath in
            if newPath.isEmpty { Task { await app.refreshUnread() } }
        }
        // «أرصدة النماذج» links (push / banner) are consumed here; RootView
        // has already switched to this tab.
        .onChange(of: app.pendingLink, initial: true) { _, link in
            guard app.capabilities.canSystemHealth else { return }
            switch link {
            case .balances?:
                section = .health
                path = [.balances]
                app.pendingLink = nil
            case .balance(let provider)?:
                section = .health
                path = [.balances, .balance(provider: provider)]
                app.pendingLink = nil
            default:
                break
            }
        }
    }
}

/// The «التنبيهات / حالة النظام» chips, placed under each screen's header
/// like the chips of «المكتب» and «الرسائل».
struct SystemSectionPicker: View {
    let sections: [SystemSection]
    @Binding var selection: SystemSection
    let urgentCount: Int

    var body: some View {
        SectionChipBar(sections: sections, selection: $selection, title: \.title,
                       count: { $0 == .alerts ? urgentCount : 0 })
            // The screens pad their content; the bar pads itself.
            .padding(.horizontal, -(DeskLayout.pageMargin + 4))
    }
}

/// A group of rows on one white rounded surface with a soft shadow,
/// on the light grey-blue page (owner-approved look, 2026-10-28).
struct DeskOutlinedGroup: ViewModifier {
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous)
        content
            .background(DeskTheme.surface, in: shape)
            .shadow(color: DeskShadow.card.color, radius: DeskShadow.card.radius, y: DeskShadow.card.y)
    }
}

/// Section header above a group: 13 semibold #3E5063.
struct DeskSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .deskText(DeskType.metaEmphasis)
            .foregroundStyle(DeskTheme.textSecondary)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Compact action in an alert row (16 semibold): primary white on #1E9BE6,
/// secondary #0B6FA8 on #F1F5F9.
struct DeskPillButtonStyle: ButtonStyle {
    var primary = true
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .deskText(DeskType.button)
            .foregroundStyle(primary ? Color.white : DeskTheme.link)
            .padding(.horizontal, 18)
            .frame(minHeight: DeskLayout.touchTarget)
            .background(primary ? DeskTheme.buttonBlue : DeskTheme.chipGrey, in: Capsule())
            .opacity(configuration.isPressed ? 0.85 : (isEnabled ? 1 : 0.5))
    }
}

#if DEBUG
#Preview("النظام") {
    SystemView(section: .constant(.alerts))
        .deskPreviewEnvironment()
}
#endif
