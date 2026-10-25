import SabqDeskDesign
import SabqDeskKit
import SwiftUI

struct TicketDetailView: View {
    @Environment(AppModel.self) private var app
    let ticketID: String
    /// Reports the ticket's latest status back to the inbox row.
    let onChange: (String?) -> Void

    @State private var detail: StaffTicketDetail?
    @State private var loadError: String?
    @State private var actionError: String?
    @State private var draft = ""
    @State private var isSending = false
    @State private var isUpdatingStatus = false
    @State private var confirmClose = false
    @FocusState private var composerFocused: Bool

    var body: some View {
        Group {
            if let detail {
                thread(detail)
            } else if let loadError {
                DeskMessageView(systemImage: "exclamationmark.triangle", title: "تعذر فتح الاستفسار", message: loadError) {
                    Button("إعادة المحاولة") { Task { await load() } }
                        .buttonStyle(DeskSecondaryButtonStyle())
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("استفسار")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let ticket = detail?.ticket {
                ToolbarItem(placement: .primaryAction) { statusMenu(ticket) }
            }
        }
        .confirmationDialog("إغلاق الاستفسار؟", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("إغلاق", role: .destructive) { Task { await setStatus(.closed) } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("لن يتمكن أحد من الرد بعد الإغلاق حتى يُعاد فتحه.")
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func thread(_ detail: StaffTicketDetail) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space16) {
                    header(detail.ticket)
                    Divider().overlay(DeskTheme.separator)
                    ForEach(detail.messages) { message in
                        MessageRow(message: message, writerName: detail.ticket.writerName)
                            .id(message.id)
                    }
                }
                .padding(DeskLayout.pageMargin)
            }
            .contentMargins(.bottom, DeskLayout.space16, for: .scrollContent)
            .scrollDismissesKeyboard(.interactively)
            .onAppear {
                if let last = detail.messages.last?.id { proxy.scrollTo(last, anchor: .bottom) }
            }
            .onChange(of: detail.messages.count) { _, _ in
                guard let last = detail.messages.last?.id else { return }
                withAnimation { proxy.scrollTo(last, anchor: .bottom) }
            }
            .safeAreaInset(edge: .bottom) { composer(detail.ticket) }
        }
    }

    private func header(_ ticket: StaffTicket) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            Text(ticket.title)
                .deskText(DeskType.sectionHeading)
                .foregroundStyle(DeskTheme.textPrimary)
            HStack(spacing: DeskLayout.space8) {
                Text(ticket.writerName)
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textSecondary)
                StatusPill(title: ticket.status.title, tint: ticket.status.tint)
                Spacer()
                LTRText(text: RiyadhTime.displayString(ticket.createdAt))
            }
        }
    }

    @ViewBuilder
    private func composer(_ ticket: StaffTicket) -> some View {
        VStack(spacing: DeskLayout.space8) {
            if let actionError { ErrorLine(message: actionError) }
            if ticket.status == .closed {
                HStack {
                    Text("الاستفسار مغلق")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                    Spacer()
                    Button("إعادة فتح") { Task { await setStatus(.open) } }
                        .deskText(DeskType.metaEmphasis)
                        .disabled(isUpdatingStatus)
                }
            } else {
                HStack(alignment: .bottom, spacing: DeskLayout.space8) {
                    TextField("اكتب ردك", text: $draft, axis: .vertical)
                        .lineLimit(1...6)
                        .focused($composerFocused)
                        .modifier(DeskInputSurface())
                    Button {
                        Task { await send() }
                    } label: {
                        Group {
                            if isSending { ProgressView().tint(DeskTheme.onAction) } else { Image(systemName: "arrow.up") }
                        }
                        .frame(width: DeskLayout.controlHeight, height: DeskLayout.controlHeight)
                        .background(canSend ? DeskTheme.actionFill : DeskTheme.disabledFill, in: Circle())
                        .foregroundStyle(canSend ? DeskTheme.onAction : DeskTheme.disabledInk)
                    }
                    .disabled(!canSend)
                    .accessibilityLabel("إرسال الرد")
                }
            }
        }
        .padding(.horizontal, DeskLayout.pageMargin)
        .padding(.vertical, DeskLayout.space8)
        .background(.bar)
    }

    private func statusMenu(_ ticket: StaffTicket) -> some View {
        Menu {
            ForEach(StaffTicketStatus.allCases, id: \.self) { status in
                Button {
                    if status == .closed { confirmClose = true } else { Task { await setStatus(status) } }
                } label: {
                    if status == ticket.status { Label(status.title, systemImage: "checkmark") } else { Text(status.title) }
                }
                .disabled(status == ticket.status)
            }
        } label: {
            if isUpdatingStatus { ProgressView() } else { Label("الحالة", systemImage: "ellipsis.circle") }
        }
        .disabled(isUpdatingStatus)
    }

    private var canSend: Bool {
        !isSending && !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && draft.count <= 10_000
    }

    private func load() async {
        do {
            let fresh = try await app.client.ticket(id: ticketID)
            detail = fresh
            loadError = nil
            onChange(fresh.ticket.status.rawValue)
            await app.refreshUnread()
        } catch {
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    private func send() async {
        guard canSend else { return }
        isSending = true
        actionError = nil
        defer { isSending = false }
        do {
            let result = try await app.client.replyToTicket(id: ticketID, message: draft)
            draft = ""
            detail?.messages.append(result.message)
            if let status = result.ticketStatus {
                detail?.ticket.status = status
                onChange(status.rawValue)
            }
        } catch {
            if case .ticketClosed = error as? StaffAPIError { detail?.ticket.status = .closed }
            if !app.handle(error) {
                actionError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    private func setStatus(_ status: StaffTicketStatus) async {
        isUpdatingStatus = true
        actionError = nil
        defer { isUpdatingStatus = false }
        do {
            let ticket = try await app.client.setTicketStatus(id: ticketID, status: status)
            detail?.ticket.status = ticket.status
            onChange(ticket.status.rawValue)
        } catch {
            if !app.handle(error) {
                actionError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

/// Writer messages sit on the reading side (right in RTL), desk replies on
/// the other, each on a quiet tinted block rather than a heavy bubble.
private struct MessageRow: View {
    let message: StaffTicketMessage
    let writerName: String

    private var isDesk: Bool { message.senderRole == .admin }

    var body: some View {
        VStack(alignment: isDesk ? .trailing : .leading, spacing: DeskLayout.space4) {
            HStack(spacing: DeskLayout.space8) {
                Text(message.senderName ?? (isDesk ? "الديسك" : writerName))
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(isDesk ? DeskTheme.primary : DeskTheme.textSecondary)
                LTRText(text: RiyadhTime.shortString(message.createdAt))
            }
            Text(message.message)
                .deskText(DeskType.body)
                .foregroundStyle(DeskTheme.textPrimary)
                .textSelection(.enabled)
                .padding(DeskLayout.space12)
                .background(isDesk ? DeskTheme.surfaceMuted : DeskTheme.surface,
                            in: RoundedRectangle(cornerRadius: DeskRadius.medium))
                .overlay(RoundedRectangle(cornerRadius: DeskRadius.medium)
                    .stroke(isDesk ? Color.clear : DeskTheme.separator, lineWidth: 1))
        }
        .frame(maxWidth: .infinity, alignment: isDesk ? .trailing : .leading)
    }
}
