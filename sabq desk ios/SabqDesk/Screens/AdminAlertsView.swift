import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// «تنبيهات الإدارة»: only what needs an admin's attention, urgent first,
/// with a one-tap retry for a failed tweet.
struct AdminAlertsView: View {
    @Environment(AppModel.self) private var app
    /// Switches «النظام» to «حالة النظام».
    let openSystem: () -> Void
    /// Pushes a social post or ticket on the tab's navigation stack.
    let open: (DeskDeepLink) -> Void
    var picker: SystemSectionPicker?

    @State private var alerts: [StaffAdminAlert] = []
    @State private var hasLoaded = false
    @State private var loadError: String?
    @State private var busyID: String?
    @State private var outcomes: [String: RetryOutcome] = [:]

    enum RetryOutcome: Equatable {
        case published
        case failed(String)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DeskLayout.space16) {
                DeskScreenHeader(title: "تنبيهات الإدارة", subtitle: "ما يحتاج انتباهك فقط، مرتّبًا حسب الأهمية")
                if let picker { picker }
                if let loadError {
                    ErrorLine(message: loadError)
                }
                if alerts.isEmpty {
                    if !hasLoaded {
                        HStack { Spacer(); ProgressView(); Spacer() }
                            .padding(.vertical, DeskLayout.space32)
                    } else if loadError == nil {
                        DeskEmptyState(title: "لا تنبيهات الآن", message: "سنخبرك فور حدوث ما يستحق")
                    }
                } else {
                    group("يحتاج قرارًا", alerts.filter(\.isUrgent))
                    group("للاطلاع", alerts.filter { !$0.isUrgent })
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            .padding(.top, DeskLayout.space8)
        }
        .contentMargins(.bottom, DeskLayout.tabBarClearance, for: .scrollContent)
        .background(DeskTheme.background)
        .refreshable { await load() }
        .task { await load() }
    }

    @ViewBuilder
    private func group(_ title: String, _ items: [StaffAdminAlert]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: DeskLayout.space8) {
                DeskSectionHeader(title: title)
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, alert in
                        row(alert)
                        if index < items.count - 1 {
                            Rectangle().fill(DeskTheme.hairline).frame(height: 1)
                        }
                    }
                }
                .modifier(DeskOutlinedGroup())
            }
            .padding(.top, DeskLayout.space8)
        }
    }

    private func row(_ alert: StaffAdminAlert) -> some View {
        HStack(alignment: .top, spacing: DeskLayout.space12) {
            DeskIconTile(systemImage: alert.systemImage, tone: alert.tone)
            VStack(alignment: .leading, spacing: DeskLayout.space4) {
                HStack(alignment: .firstTextBaseline, spacing: DeskLayout.space8) {
                    Text(alert.title)
                        .deskText(DeskType.rowTitle)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: DeskLayout.space4)
                    if let at = alert.occurredAt {
                        timeLabel(at)
                    }
                }
                if let body = alert.body, !body.isEmpty {
                    Text(body)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                        .lineLimit(3)
                }
                outcome(alert)
                actions(alert)
            }
        }
        .padding(DeskLayout.cardInset)
    }

    @ViewBuilder
    private func timeLabel(_ date: Date) -> some View {
        switch RiyadhTime.alertLabel(date) {
        case .clock(let time):
            LTRText(text: time, role: DeskType.timestamp, color: DeskTheme.textSecondary)
        case .phrase(let phrase):
            Text(verbatim: phrase)
                .deskText(DeskType.timestamp)
                .foregroundStyle(DeskTheme.textSecondary)
                .lineLimit(1)
                .fixedSize()
        }
    }

    @ViewBuilder
    private func outcome(_ alert: StaffAdminAlert) -> some View {
        switch outcomes[alert.id] {
        case .published?:
            Label("أُعيد النشر بنجاح", systemImage: "checkmark.circle")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskTheme.success)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .failed(let message)?:
            ErrorLine(message: message)
        case nil:
            EmptyView()
        }
    }

    @ViewBuilder
    private func actions(_ alert: StaffAdminAlert) -> some View {
        let retryID = app.capabilities.canSocial.publish && outcomes[alert.id] != .published ? alert.retryPostID : nil
        let details = detailsAction(alert)
        if retryID != nil || details != nil {
            HStack(spacing: DeskLayout.space8) {
                if let retryID {
                    Button {
                        Task { await retry(alert, postID: retryID) }
                    } label: {
                        HStack(spacing: DeskLayout.space8) {
                            if busyID == alert.id { ProgressView().tint(.white) }
                            Text("أعد المحاولة")
                        }
                    }
                    .buttonStyle(DeskPillButtonStyle(primary: true))
                    .disabled(busyID != nil)
                }
                if let details {
                    Button("التفاصيل", action: details)
                        .buttonStyle(DeskPillButtonStyle(primary: false))
                }
            }
            .padding(.top, DeskLayout.space4)
        }
    }

    /// «التفاصيل» opens the post / ticket, or «حالة النظام» for AI alerts.
    private func detailsAction(_ alert: StaffAdminAlert) -> (() -> Void)? {
        if alert.action?.type == .openSystem || alert.link == .systemHealth {
            return app.capabilities.canSystemHealth ? openSystem : nil
        }
        switch alert.link {
        case .social(let id)?:
            guard app.capabilities.canSocial.view else { return nil }
            return { open(.social(id: id)) }
        case .ticket(let id)?:
            guard app.capabilities.canTickets else { return nil }
            return { open(.ticket(id: id)) }
        case .systemHealth?, .alerts?, nil:
            return nil
        }
    }

    // MARK: - Data

    private func load() async {
        do {
            let result = try await app.client.adminAlerts()
            alerts = result.items ?? []
            app.setUrgentAlerts(result.urgentCount)
            loadError = nil
        } catch {
            guard !Task.isCancelled else { return }
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
        hasLoaded = true
    }

    /// Re-publishes through the existing staff endpoint (claims draft|failed|scheduled).
    private func retry(_ alert: StaffAdminAlert, postID: String) async {
        busyID = alert.id
        outcomes[alert.id] = nil
        defer { busyID = nil }
        do {
            _ = try await app.client.publishSocialPost(id: postID)
            outcomes[alert.id] = .published
            await app.refreshUnread()
        } catch {
            if !app.handle(error) {
                outcomes[alert.id] = .failed((error as? StaffAPIError)?.userMessage ?? error.localizedDescription)
            }
        }
    }
}

extension StaffAdminAlert {
    var systemImage: String {
        switch kind ?? .unknown {
        case .socialFailed: return "exclamationmark.bubble.fill"
        case .agencyBalanceLow: return "creditcard.fill"
        case .breakingExpiring: return "timer"
        case .breakingExpired: return "checkmark"
        case .aiIncident: return "cpu"
        case .aiBudget: return "dollarsign.circle.fill"
        case .unknown: return "bell.fill"
        }
    }

    var tone: DeskTone {
        switch kind ?? .unknown {
        case .socialFailed: return .danger
        case .agencyBalanceLow, .breakingExpiring: return .warning
        case .breakingExpired: return .success
        case .aiIncident, .aiBudget, .unknown: return isUrgent ? .danger : .warning
        }
    }
}
