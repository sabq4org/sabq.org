import SwiftUI

// MARK: - محادثة التحرير للكاتب (/api/v1/contributor/tickets)
//
// نظير «تواصل مع التحرير» في لوحة الكاتب على الويب (opinion_tickets).
// ردّ التحرير يصل إشعارًا يفتح المحادثة نفسها (sabq://writer/tickets/<id>).

nonisolated struct WriterTicketSummary: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let status: String
    let lastMessageAt: String?
    let hasUnread: Bool
    let excerpt: String?
}

nonisolated struct WriterTicketsResponse: Decodable {
    let unreadCount: Int
    let tickets: [WriterTicketSummary]
}

nonisolated struct WriterTicketMessage: Decodable, Identifiable {
    let id: String
    let mine: Bool
    let senderRole: String
    let senderName: String?
    let message: String
    let createdAt: String?
}

nonisolated struct WriterTicketDetail: Decodable {
    struct Ticket: Decodable { let id: String; let title: String; let status: String }
    let ticket: Ticket
    let messages: [WriterTicketMessage]
}

/// يفتح محادثة واحدة من إشعار أو من القائمة.
struct WriterTicketRoute: Hashable {
    let id: String
}

enum WriterTicketFormat {
    static func statusLabel(_ status: String) -> (String, Color) {
        switch status {
        case "answered": return ("تم الرد", SabqTheme.success)
        case "closed": return ("مغلقة", SabqTheme.textTertiary)
        default: return ("بانتظار الرد", SabqTheme.primary)
        }
    }

    static func time(_ iso: String?) -> String? {
        guard let iso else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return nil }
        let out = DateFormatter()
        out.locale = Locale(identifier: "ar@numbers=latn")
        out.calendar = Calendar(identifier: .gregorian)
        out.dateFormat = Calendar.current.isDateInToday(date) ? "HH:mm" : "d MMMM، HH:mm"
        return out.string(from: date)
    }
}

// MARK: - صف الدخول في لوحة الكاتب

struct WriterTicketsEntryRow: View {
    @State private var unread = 0

    var body: some View {
        NavigationLink {
            WriterTicketsListView().duoContentInsets()
        } label: {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "bubble.left.and.text.bubble.right")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SabqTheme.primary.opacity(0.1)))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("محادثة التحرير")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("اسأل فريق التحرير أو تابع ردودهم")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer(minLength: 0)
                if unread > 0 {
                    Text("\(unread)")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, 8)
                        .frame(minWidth: 24, minHeight: 24)
                        .background(Capsule().fill(SabqTheme.actionFill))
                        .accessibilityLabel("\(unread) ردود جديدة")
                }
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(SabqLayout.space16)
            .frame(minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(SabqTheme.surface))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .task { await refresh() }
    }

    private func refresh() async {
        if let r = try? await APIClient.shared.get(WriterTicketsResponse.self, path: "/contributor/tickets", ignoreCache: true) {
            unread = r.unreadCount
        }
    }
}

// MARK: - القائمة

struct WriterTicketsListView: View {
    @State private var tickets: [WriterTicketSummary] = []
    @State private var loading = true
    @State private var errorText: String?
    @State private var showCompose = false
    @State private var openTicket: WriterTicketRoute?

    var body: some View {
        List {
            if loading && tickets.isEmpty {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else if tickets.isEmpty {
                VStack(spacing: SabqLayout.space8) {
                    Image(systemName: "bubble.left.and.bubble.right")
                        .font(.system(size: 28))
                        .foregroundStyle(SabqTheme.textTertiary)
                    Text(errorText ?? "لا محادثات بعد. اكتب لفريق التحرير متى احتجت.")
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 40)
                .listRowBackground(Color.clear)
            } else {
                ForEach(tickets) { t in
                    NavigationLink(value: WriterTicketRoute(id: t.id)) {
                        row(t)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(SabqTheme.background)
        .navigationTitle("محادثة التحرير")
        .navigationBarTitleDisplayMode(.inline)
        // WriterTicketRoute مسجّل في SabqDestinations لكل التبويبات.
        .navigationDestination(item: $openTicket) { route in
            WriterTicketThreadView(ticketId: route.id)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showCompose = true
                } label: {
                    Label("رسالة جديدة", systemImage: "square.and.pencil")
                }
            }
        }
        .sheet(isPresented: $showCompose) {
            WriterNewTicketSheet { newId in
                openTicket = WriterTicketRoute(id: newId)
                Task { await load() }
            }
        }
        .refreshable { await load() }
        .task { await load() }
        .sabqRTL()
    }

    private func row(_ t: WriterTicketSummary) -> some View {
        let (label, tint) = WriterTicketFormat.statusLabel(t.status)
        return VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: SabqLayout.space8) {
                if t.hasUnread {
                    Circle().fill(SabqTheme.primary).frame(width: 8, height: 8)
                        .accessibilityLabel("ردّ جديد")
                }
                Text(t.title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(label)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(tint)
            }
            if let excerpt = t.excerpt, !excerpt.isEmpty {
                Text(excerpt)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
            }
            if let when = WriterTicketFormat.time(t.lastMessageAt) {
                Text(when)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let r = try await APIClient.shared.get(WriterTicketsResponse.self, path: "/contributor/tickets", ignoreCache: true)
            tickets = r.tickets
            errorText = nil
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر جلب المحادثات."
        }
    }
}

// MARK: - محادثة واحدة

struct WriterTicketThreadView: View {
    let ticketId: String

    @State private var detail: WriterTicketDetail?
    @State private var errorText: String?
    @State private var draft = ""
    @State private var sending = false

    private var isClosed: Bool { detail?.ticket.status == "closed" }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: SabqLayout.space12) {
                        if let detail {
                            ForEach(detail.messages) { m in
                                bubble(m).id(m.id)
                            }
                        } else if errorText == nil {
                            ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                        }
                        if let errorText {
                            Text(errorText)
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.danger)
                        }
                    }
                    .padding(SabqLayout.space16)
                }
                .onChange(of: detail?.messages.count ?? 0) { _, _ in
                    if let last = detail?.messages.last?.id {
                        withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                    }
                }
            }
            composer
        }
        .background(SabqTheme.background)
        .navigationTitle(detail?.ticket.title ?? "محادثة التحرير")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sabqRTL()
    }

    private func bubble(_ m: WriterTicketMessage) -> some View {
        HStack {
            if m.mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 4) {
                if !m.mine {
                    Text(m.senderName ?? "فريق التحرير")
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.primary)
                }
                Text(m.message)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                if let when = WriterTicketFormat.time(m.createdAt) {
                    Text(when)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
            .padding(SabqLayout.space12)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(m.mine ? Color(red: 0xEA / 255, green: 0xF7 / 255, blue: 1) : SabqTheme.surface)
            )
            if !m.mine { Spacer(minLength: 40) }
        }
        // رسائل الكاتب يسارًا (جهة الإرسال في RTL)، والتحرير يمينًا.
        .frame(maxWidth: .infinity, alignment: m.mine ? .trailing : .leading)
    }

    @ViewBuilder
    private var composer: some View {
        if isClosed {
            Text("أُغلقت هذه المحادثة. ابدأ رسالة جديدة إن احتجت.")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .frame(maxWidth: .infinity)
                .padding(SabqLayout.space16)
                .background(SabqTheme.surface)
        } else {
            HStack(alignment: .bottom, spacing: SabqLayout.space8) {
                TextField("اكتب ردك…", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .sabqText(SabqType.excerpt)
                    .padding(.horizontal, SabqLayout.space12)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(SabqTheme.surfaceMuted))
                Button {
                    Task { await send() }
                } label: {
                    Group {
                        if sending {
                            ProgressView().tint(SabqTheme.onAction)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.system(size: 16, weight: .bold))
                        }
                    }
                    .foregroundStyle(SabqTheme.onAction)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(SabqTheme.actionFill))
                }
                .buttonStyle(.plain)
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("إرسال")
            }
            .padding(SabqLayout.space12)
            .background(SabqTheme.surface)
        }
    }

    private func load() async {
        do {
            detail = try await APIClient.shared.get(WriterTicketDetail.self, path: "/contributor/tickets/\(ticketId)", ignoreCache: true)
            errorText = nil
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر فتح المحادثة."
        }
    }

    private func send() async {
        struct Body: Encodable { let message: String }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true
        defer { sending = false }
        do {
            _ = try await APIClient.shared.post(WriterOKResponse.self, path: "/contributor/tickets/\(ticketId)/messages", body: Body(message: text))
            draft = ""
            SabqHaptics.success()
            await load()
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر إرسال الرسالة، حاول مرة أخرى."
        }
    }
}

// MARK: - رسالة جديدة

struct WriterNewTicketSheet: View {
    let onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var message = ""
    @State private var sending = false
    @State private var errorText: String?

    private var valid: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines).count >= 3
            && !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("الموضوع", text: $title)
                    TextEditor(text: $message)
                        .frame(minHeight: 140)
                } footer: {
                    Text("تصل رسالتك لفريق إدارة كتّاب الرأي، ويصلك إشعار حين يردّون.")
                }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(SabqTheme.danger).sabqText(SabqType.meta) }
                }
            }
            .navigationTitle("رسالة للتحرير")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await send() }
                    } label: {
                        if sending { ProgressView() } else { Text("إرسال") }
                    }
                    .disabled(sending || !valid)
                }
            }
        }
        .sabqRTL()
    }

    private func send() async {
        struct Body: Encodable { let title: String; let message: String }
        struct Created: Decodable {
            struct T: Decodable { let id: String }
            let ticket: T
        }
        sending = true
        errorText = nil
        defer { sending = false }
        do {
            let created = try await APIClient.shared.post(
                Created.self,
                path: "/contributor/tickets",
                body: Body(
                    title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                    message: message.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            )
            SabqHaptics.success()
            dismiss()
            onCreated(created.ticket.id)
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر إرسال الرسالة، حاول مرة أخرى."
        }
    }
}
