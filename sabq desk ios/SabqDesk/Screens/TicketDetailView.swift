import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit

/// A contributor's message as a chat: writer bubbles in white, desk replies in
/// soft blue, day separators, «ردًا على» quotes and quick replies above the composer.
struct TicketDetailView: View {
    @Environment(AppModel.self) private var app
    let ticketID: String
    /// A quick reply picked on the list card, put in the composer unsent.
    var initialDraft: String = ""
    /// Reports the ticket's latest status back to the list row.
    let onChange: (String?) -> Void

    @State private var detail: StaffTicketDetail?
    @State private var loadError: String?
    @State private var actionError: String?
    @State private var draft = ""
    @State private var replyingTo: StaffTicketMessage?
    @State private var isSending = false
    @State private var isUpdatingStatus = false
    @State private var confirmClose = false
    @State private var quickReplies = QuickReplyStore().replies
    @FocusState private var composerFocused: Bool

    var body: some View {
        Group {
            if let detail {
                thread(detail)
            } else if let loadError {
                DeskMessageView(title: "تعذر فتح الرسالة", message: loadError) {
                    Button("إعادة المحاولة") { Task { await load() } }
                        .buttonStyle(DeskSecondaryButtonStyle())
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(DeskTheme.background)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let ticket = detail?.ticket {
                ToolbarItem(placement: .principal) { titleView(ticket) }
                ToolbarItem(placement: .primaryAction) { statusMenu(ticket) }
            }
        }
        .confirmationDialog("إغلاق الرسالة؟", isPresented: $confirmClose, titleVisibility: .visible) {
            Button("إغلاق", role: .destructive) { Task { await setStatus(.closed) } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("لن يتمكن أحد من الرد بعد الإغلاق حتى تُعاد فتحها.")
        }
        .task { await load() }
        .onAppear {
            quickReplies = QuickReplyStore().replies
            if draft.isEmpty, !initialDraft.isEmpty { draft = initialDraft }
        }
    }

    private func titleView(_ ticket: StaffTicket) -> some View {
        HStack(spacing: DeskLayout.space8) {
            SenderAvatar(name: ticket.writerName, kind: ticket.sender?.kind ?? .unknown,
                         imageURL: ticket.sender?.avatarUrl, size: 32)
                .overlay(Circle().strokeBorder(DeskTheme.separator, lineWidth: 1))
            Text(ticket.writerName)
                .deskText(DeskRowType.headerName)
                .foregroundStyle(DeskTheme.textPrimary)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }

    private func thread(_ detail: StaffTicketDetail) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: DeskLayout.space8) {
                    subjectHeader(detail.ticket)
                    if let context = detail.writerContext {
                        WriterContextLine(context: context)
                            .padding(.bottom, DeskLayout.space8)
                    }
                    ForEach(Array(detail.messages.enumerated()), id: \.element.id) { index, message in
                        // The subject line already carries the opening date.
                        let previous = index == 0 ? detail.ticket.createdAt : detail.messages[index - 1].createdAt
                        if RiyadhTime.dayKey(previous) != RiyadhTime.dayKey(message.createdAt) {
                            DaySeparator(date: message.createdAt)
                        }
                        ChatBubble(message: message,
                                   writerName: detail.ticket.writerName,
                                   quoted: message.parentMessageId.flatMap { id in detail.messages.first { $0.id == id } },
                                   canReply: detail.ticket.status != .closed) {
                            replyingTo = message
                            composerFocused = true
                        }
                        .id(message.id)
                    }
                }
                .padding(.horizontal, DeskLayout.pageMargin)
                .padding(.vertical, DeskLayout.space12)
            }
            .refreshable { await load() }
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

    /// The subject as the page title, then one line: who, when, and the status.
    private func subjectHeader(_ ticket: StaffTicket) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(ticket.title)
                .deskText(DeskTextRole(size: 21, weight: .bold, style: .title3, lineSpacing: 2))
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            HStack(spacing: 6) {
                SenderKindLabel(kind: ticket.sender?.kind ?? .unknown)
                Text(verbatim: "· \(RiyadhTime.displayString(ticket.createdAt))")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
                    .lineLimit(1)
                StatusChip(title: ticket.status.title, tone: ticket.status.tone,
                           systemImage: ticket.status == .closed ? "lock.fill" : nil)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 4)
        .padding(.bottom, DeskLayout.space16)
    }

    @ViewBuilder
    private func composer(_ ticket: StaffTicket) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            if let actionError { ErrorLine(message: actionError) }
            if ticket.status == .closed {
                HStack(spacing: DeskLayout.space8) {
                    Image(systemName: "lock.fill")
                        .imageScale(.small)
                        .foregroundStyle(DeskTheme.textTertiary)
                        .accessibilityHidden(true)
                    Text("الرسالة مغلقة، لا يمكن الرد")
                        .deskText(DeskType.excerpt)
                        .foregroundStyle(DeskTheme.textSecondary)
                    Spacer()
                    Button("إعادة فتح") { Task { await setStatus(.open) } }
                        .deskText(DeskType.button)
                        .foregroundStyle(DeskInk.link)
                        .padding(.horizontal, 18)
                        .frame(minHeight: 40)
                        .background(DeskInk.chip, in: Capsule())
                        .buttonStyle(.plain)
                        .disabled(isUpdatingStatus)
                }
                .padding(.vertical, 4)
            } else {
                if !quickReplies.isEmpty, draft.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: DeskLayout.space8) {
                            ForEach(quickReplies, id: \.self) { reply in
                                Button(reply) { draft = reply; composerFocused = true }
                                    .deskText(DeskType.meta)
                                    .foregroundStyle(DeskInk.link)
                                    .padding(.horizontal, DeskLayout.space12)
                                    .frame(minHeight: 34)
                                    .background(DeskInk.bubble, in: Capsule())
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                }
                if let replyingTo {
                    HStack(spacing: DeskLayout.space8) {
                        Rectangle().fill(DeskInk.action).frame(width: 3)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("ردًا على \(senderName(replyingTo, writerName: ticket.writerName))")
                                .deskText(DeskType.tag)
                                .foregroundStyle(DeskInk.link)
                            Text(replyingTo.message)
                                .deskText(DeskType.meta)
                                .foregroundStyle(DeskTheme.textSecondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Button { self.replyingTo = nil } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(DeskTheme.textTertiary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("إلغاء الاقتباس")
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                HStack(alignment: .bottom, spacing: DeskLayout.space8) {
                    TextField("اكتب ردك", text: $draft, axis: .vertical)
                        .lineLimit(1...6)
                        .deskText(DeskType.excerpt)
                        .focused($composerFocused)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(DeskTheme.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .shadow(color: DeskTheme.shadow, radius: 4, y: 1)
                    Button {
                        Task { await send() }
                    } label: {
                        Group {
                            if isSending { ProgressView().tint(Color.white) } else { Image(systemName: "arrow.up") }
                        }
                        .font(.system(size: 17, weight: .bold))
                        .frame(width: 44, height: 44)
                        .background(canSend ? DeskInk.action : DeskTheme.disabledFill, in: Circle())
                        .foregroundStyle(canSend ? Color.white : DeskTheme.disabledInk)
                    }
                    .disabled(!canSend)
                    .accessibilityLabel("إرسال الرد")
                }
            }
        }
        .padding(.horizontal, DeskLayout.pageMargin)
        .padding(.vertical, DeskLayout.space8)
        .background(DeskTheme.background.shadow(.drop(color: .black.opacity(0.04), radius: 6, y: -2)))
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

    private func senderName(_ message: StaffTicketMessage, writerName: String) -> String {
        message.senderName ?? (message.senderRole == .admin ? "المكتب" : writerName)
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
            let result = try await app.client.replyToTicket(id: ticketID, message: draft,
                                                            parentMessageID: replyingTo?.id)
            draft = ""
            replyingTo = nil
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

/// One white row above a writer's chat: last published, next scheduled, so the
/// desk can answer «لماذا لم يُنشر مقالي؟» without leaving the thread.
private struct WriterContextLine: View {
    let context: StaffWriterOpinionContext

    var body: some View {
        let scheduled = context.nextScheduledAt != nil
        HStack(spacing: DeskLayout.space12) {
            Image(systemName: "calendar")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(scheduled ? DeskTheme.success : DeskTheme.warning)
                .frame(width: 32, height: 32)
                .background(scheduled ? DeskTheme.success.opacity(0.12) : DeskTheme.warning.opacity(0.12),
                            in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(context.headline)
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textPrimary)
                Text(context.detail)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .deskRowCard(padding: 12)
        .accessibilityElement(children: .combine)
    }
}

/// «اليوم · الأحد 25 أكتوبر» between days.
private struct DaySeparator: View {
    let date: Date

    var body: some View {
        Text(RiyadhTime.dayTitle(date))
            .deskText(DeskType.tag)
            .foregroundStyle(DeskTheme.textSecondary)
            .padding(.horizontal, DeskLayout.space12)
            .padding(.vertical, 4)
            .background(DeskInk.chip, in: Capsule())
            .frame(maxWidth: .infinity)
            .padding(.vertical, DeskLayout.space8)
            .accessibilityAddTraits(.isHeader)
    }
}

/// Writer on the reading side (right in RTL) in white; the desk on the other
/// side in soft blue with dark text (no dark fills). Long-press or swipe the menu to quote.
private struct ChatBubble: View {
    let message: StaffTicketMessage
    let writerName: String
    let quoted: StaffTicketMessage?
    let canReply: Bool
    let onReply: () -> Void

    private var isDesk: Bool { message.senderRole == .admin }
    private var name: String { message.senderName ?? (isDesk ? "المكتب" : writerName) }

    var body: some View {
        VStack(alignment: isDesk ? .trailing : .leading, spacing: 3) {
            VStack(alignment: .leading, spacing: 6) {
                if let quoted {
                    HStack(spacing: 6) {
                        Rectangle()
                            .fill(DeskInk.action)
                            .frame(width: 3)
                        Text(quoted.message)
                            .deskText(DeskType.meta)
                            .lineLimit(2)
                            .foregroundStyle(DeskTheme.textSecondary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                Text(message.message)
                    .deskText(DeskType.body)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                UnevenRoundedRectangle(topLeadingRadius: 22,
                                       bottomLeadingRadius: isDesk ? 22 : 6,
                                       bottomTrailingRadius: isDesk ? 6 : 22,
                                       topTrailingRadius: 22,
                                       style: .continuous)
                    .fill(isDesk ? DeskInk.bubble : DeskTheme.surface)
                    .shadow(color: isDesk ? .clear : DeskTheme.shadow, radius: 6, y: 2))
            .contextMenu {
                if canReply {
                    Button { onReply() } label: { Label("رد على هذه الرسالة", systemImage: "arrowshape.turn.up.left") }
                }
                Button { UIPasteboard.general.string = message.message } label: { Label("نسخ", systemImage: "doc.on.doc") }
            }
            HStack(spacing: 6) {
                Text(name)
                    .deskText(DeskType.timestamp)
                    .foregroundStyle(DeskTheme.textSecondary)
                LTRText(text: RiyadhTime.timeString(message.createdAt))
            }
        }
        .frame(maxWidth: .infinity, alignment: isDesk ? .trailing : .leading)
        .padding(isDesk ? Edge.Set.leading : Edge.Set.trailing, 48)
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: "رد على هذه الرسالة") { if canReply { onReply() } }
    }
}
