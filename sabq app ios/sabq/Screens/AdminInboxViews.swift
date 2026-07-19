import SwiftUI
import Combine

// MARK: - Routes

/// These routes live below the existing platform-admin dashboard. The entry
/// remains role-gated in Settings, while the server remains the authority for
/// every request.
struct AdminContactMessagesRoute: Hashable {}
struct AdminOpinionTicketsRoute: Hashable {}
struct AdminContactMessageRoute: Hashable { let id: String }
struct AdminOpinionTicketRoute: Hashable { let id: String }

// MARK: - Shared presentation

private let adminInboxCorner: CGFloat = 14

private func adminInboxDate(_ date: Date) -> String {
    "\(SabqFormatters.arabicDate.string(from: date)) · \(SabqFormatters.riyadhTime.string(from: date))"
}

/// Soft tinted chip — light fill + colored text so statuses stay distinguishable.
private struct AdminInboxStatusPill: View {
    let title: String
    let icon: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: icon)
            .font(SabqFonts.app(size: 11, weight: .semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Capsule().fill(tint.opacity(0.10)))
            .overlay(Capsule().stroke(tint.opacity(0.22), lineWidth: 0.5))
    }
}

private struct AdminInboxFilterChip: View {
    let title: String
    var tint: Color = AdminInboxPalette.action

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "line.3.horizontal.decrease")
            Text(title)
            Image(systemName: "chevron.down")
                .font(SabqFonts.app(size: 9, weight: .semibold))
        }
        .font(SabqFonts.app(size: 13, weight: .medium))
        .foregroundStyle(tint)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Capsule().fill(tint.opacity(0.08)))
        .overlay(Capsule().stroke(tint.opacity(0.20), lineWidth: 0.5))
    }
}

/// Surface + hairline border only — no shadow, no accent stripe.
private struct AdminInboxCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: adminInboxCorner, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: adminInboxCorner, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: 0.5)
            )
    }
}

private extension View {
    func adminInboxCard() -> some View {
        modifier(AdminInboxCardModifier())
    }
}

private struct AdminInboxReplyEditor: View {
    @Binding var text: String
    let placeholder: String
    var minHeight: CGFloat = 130

    var body: some View {
        ZStack(alignment: .topTrailing) {
            TextEditor(text: $text)
                .font(SabqFonts.app(size: 15))
                .foregroundStyle(SabqTheme.ink)
                .scrollContentBackground(.hidden)
                .frame(minHeight: minHeight)
                .padding(8)

            if text.isEmpty {
                Text(placeholder)
                    .font(SabqFonts.app(size: 14))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 17)
                    .allowsHitTesting(false)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(SabqTheme.paleFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 0.5)
        )
        .accessibilityLabel(placeholder)
    }
}

private struct AdminInboxEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String
    var compact = false

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 28, weight: .ultraLight))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text(title)
                .font(SabqFonts.app(size: 15, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
            Text(subtitle)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 140 : 220)
        .padding(24)
        .adminInboxCard()
    }
}

private struct AdminInboxErrorState: View {
    let text: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(SabqFonts.app(size: 28, weight: .ultraLight))
                .foregroundStyle(SabqTheme.secondaryInk)
            Text(text)
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
            Button("إعادة المحاولة", action: retry)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .padding(24)
        .adminInboxCard()
    }
}

private struct AdminInboxSendButton: View {
    let title: String
    let isSaving: Bool
    let disabled: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if isSaving { ProgressView().tint(.white) }
                Image(systemName: "paperplane")
                Text(isSaving ? "جارٍ الإرسال…" : title)
            }
            .font(SabqFonts.app(size: 14, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 46)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(AdminInboxPalette.primaryButton.opacity(disabled ? 0.45 : 1))
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

// MARK: - Contact inbox list

@MainActor
private final class AdminContactMessagesViewModel: ObservableObject {
    @Published private(set) var messages: [AdminContactMessage] = []
    @Published private(set) var total = 0
    @Published var selectedStatus: AdminContactMessageStatus?
    @Published var isLoading = true
    @Published var isLoadingMore = false
    @Published var error: String?

    private var page = 1
    private let service: AdminInboxServicing

    init(service: AdminInboxServicing = LiveAdminInboxService()) {
        self.service = service
    }

    var canLoadMore: Bool { messages.count < total }

    func load(search: String = "") async {
        isLoading = true
        error = nil
        page = 1
        do {
            let result = try await service.fetchContactMessages(page: 1, status: selectedStatus, search: search)
            messages = result.messages
            total = result.total
        } catch {
            self.error = "تعذّر تحميل رسائل التواصل"
        }
        isLoading = false
    }

    func loadMore(search: String) async {
        guard canLoadMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let nextPage = page + 1
            let result = try await service.fetchContactMessages(page: nextPage, status: selectedStatus, search: search)
            let known = Set(messages.map(\.id))
            messages.append(contentsOf: result.messages.filter { !known.contains($0.id) })
            total = result.total
            page = nextPage
        } catch {
            self.error = "تعذّر جلب المزيد من الرسائل"
        }
    }
}

struct AdminContactMessagesView: View {
    @StateObject private var vm = AdminContactMessagesViewModel()
    @State private var search = ""

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header
                filter
                content
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .padding(.bottom, 40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("رسائل التواصل")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "ابحث بالاسم أو البريد أو الموضوع")
        .onSubmit(of: .search) { Task { await vm.load(search: search) } }
        .onChange(of: vm.selectedStatus) { _, _ in Task { await vm.load(search: search) } }
        .task { await vm.load(search: search) }
        .refreshable { await vm.load(search: search) }
        .navigationDestination(for: AdminContactMessageRoute.self) { route in
            AdminContactMessageDetailView(id: route.id)
        }
        .sabqScreen("AdminContactMessages")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("رسائل التواصل")
                .font(SabqFonts.app(size: 18, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
            Text(vm.isLoading ? "جارٍ التحميل…" : "\(vm.total) رسالة")
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
    }

    private var filter: some View {
        Menu {
            Button("كل الرسائل") { vm.selectedStatus = nil }
            Divider()
            ForEach(AdminContactMessageStatus.allCases) { status in
                Button(status.label) { vm.selectedStatus = status }
            }
        } label: {
            AdminInboxFilterChip(
                title: vm.selectedStatus?.label ?? "كل الحالات",
                tint: vm.selectedStatus?.tint ?? AdminInboxPalette.action
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading && vm.messages.isEmpty {
            VStack(spacing: 8) {
                ForEach(0..<5, id: \.self) { _ in SkeletonBox(height: 96, radius: adminInboxCorner) }
            }
        } else if let error = vm.error, vm.messages.isEmpty {
            AdminInboxErrorState(text: error) { Task { await vm.load(search: search) } }
        } else if vm.messages.isEmpty {
            AdminInboxEmptyState(icon: "tray", title: "لا توجد رسائل", subtitle: "ستظهر هنا رسائل نموذج التواصل الواردة.")
        } else {
            LazyVStack(spacing: 8) {
                ForEach(vm.messages) { message in
                    NavigationLink(value: AdminContactMessageRoute(id: message.id)) {
                        AdminContactMessageRow(message: message)
                    }
                    .buttonStyle(.plain)
                }
                if vm.canLoadMore {
                    Button { Task { await vm.loadMore(search: search) } } label: {
                        HStack(spacing: 8) {
                            if vm.isLoadingMore { ProgressView().controlSize(.small) }
                            Text(vm.isLoadingMore ? "جارٍ الجلب…" : "جلب المزيد")
                        }
                        .font(SabqFonts.app(size: 14, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .disabled(vm.isLoadingMore)
                }
            }
        }
    }
}

private struct AdminContactMessageRow: View {
    let message: AdminContactMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                AdminInboxStatusPill(title: message.status.label, icon: message.status.icon, tint: message.status.tint)
                Spacer(minLength: 0)
                Text(adminInboxDate(message.createdAt))
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(1)
            }
            Text(message.subject)
                .font(SabqFonts.app(size: 15, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(2)
            Text(message.message)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
                Text(message.name)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(SabqFonts.app(size: 11, weight: .medium))
            }
            .font(SabqFonts.app(size: 12))
            .foregroundStyle(SabqTheme.tertiaryInk)
            .lineLimit(1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .adminInboxCard()
    }
}

// MARK: - Contact message detail

@MainActor
final class AdminContactMessageDetailViewModel: ObservableObject {
    @Published var detail: AdminContactMessageDetailResponse?
    @Published var isLoading = true
    @Published var isSaving = false
    @Published var error: String?

    private let id: String
    private let service: AdminInboxServicing

    init(id: String, service: AdminInboxServicing = LiveAdminInboxService()) {
        self.id = id
        self.service = service
    }

    func load() async {
        isLoading = true
        error = nil
        do { detail = try await service.fetchContactMessage(id: id) }
        catch { self.error = "تعذّر تحميل الرسالة" }
        isLoading = false
    }

    func updateStatus(_ status: AdminContactMessageStatus) async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await service.updateContactMessage(id: id, status: status)
            await load()
        } catch { self.error = "تعذّر تحديث حالة الرسالة" }
    }

    func reply(_ text: String) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await service.replyToContactMessage(id: id, text: text)
            await load()
            return true
        } catch {
            self.error = "تعذّر إرسال الرد. تحقق من اتصال البريد وحاول مجدداً."
            return false
        }
    }
}

struct AdminContactMessageDetailView: View {
    @StateObject private var vm: AdminContactMessageDetailViewModel
    @State private var replyText = ""

    init(id: String) {
        _vm = StateObject(wrappedValue: AdminContactMessageDetailViewModel(id: id))
    }

    var body: some View {
        ScrollView(showsIndicators: false) {
            Group {
                if vm.isLoading && vm.detail == nil {
                    VStack(spacing: 8) { ForEach(0..<4, id: \.self) { _ in SkeletonBox(height: 100, radius: adminInboxCorner) } }
                } else if let detail = vm.detail {
                    detailContent(detail)
                } else {
                    AdminInboxErrorState(text: vm.error ?? "الرسالة غير متاحة") { Task { await vm.load() } }
                }
            }
            .padding(16)
            .padding(.bottom, 36)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("تفاصيل الرسالة")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .alert("تعذّر الإجراء", isPresented: Binding(get: { vm.error != nil && vm.detail != nil }, set: { if !$0 { vm.error = nil } })) {
            Button("حسناً", role: .cancel) { vm.error = nil }
        } message: { Text(vm.error ?? "") }
        .sabqScreen("AdminContactMessageDetail")
    }

    @ViewBuilder
    private func detailContent(_ detail: AdminContactMessageDetailResponse) -> some View {
        let message = detail.message
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    AdminInboxStatusPill(title: message.status.label, icon: message.status.icon, tint: message.status.tint)
                    Spacer()
                    Menu {
                        ForEach(AdminContactMessageStatus.allCases) { status in
                            Button(status.label) { Task { await vm.updateStatus(status) } }
                        }
                    } label: {
                        Text("تغيير الحالة")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(SabqTheme.paleFill))
                            .overlay(Capsule().stroke(SabqTheme.outline, lineWidth: 0.5))
                    }
                    .disabled(vm.isSaving)
                }
                Text(message.subject)
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                VStack(alignment: .leading, spacing: 6) {
                    metaRow(icon: "person", text: message.name)
                    metaRow(icon: "envelope", text: message.email)
                    if !message.phone.isEmpty {
                        metaRow(icon: "phone", text: message.phone)
                    }
                    metaRow(icon: "calendar", text: adminInboxDate(message.createdAt))
                }
                Divider().overlay(SabqTheme.outline)
                Text(message.message)
                    .font(SabqFonts.app(size: 15))
                    .foregroundStyle(SabqTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .adminInboxCard()

            if !detail.replies.isEmpty || message.replyText != nil {
                VStack(alignment: .leading, spacing: 10) {
                    Text("سجل الردود")
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    ForEach(detail.replies) { reply in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(reply.responderName ?? "الإدارة")
                                    .font(SabqFonts.app(size: 12, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                Spacer()
                                Text(adminInboxDate(reply.createdAt))
                                    .font(SabqFonts.app(size: 11))
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                            }
                            Text(reply.replyText)
                                .font(SabqFonts.app(size: 14))
                                .foregroundStyle(SabqTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(SabqTheme.paleFill)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(SabqTheme.outline, lineWidth: 0.5)
                        )
                    }
                    if detail.replies.isEmpty, let reply = message.replyText {
                        Text(reply)
                            .font(SabqFonts.app(size: 14))
                            .foregroundStyle(SabqTheme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(SabqTheme.paleFill)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(SabqTheme.outline, lineWidth: 0.5)
                            )
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("إرسال رد بالبريد")
                    .font(SabqFonts.app(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                Text("سيصل الرد إلى البريد المسجّل أعلاه ويُحفظ في سجل المحادثة.")
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                AdminInboxReplyEditor(text: $replyText, placeholder: "اكتب ردك هنا…", minHeight: 120)
                AdminInboxSendButton(
                    title: "إرسال الرد",
                    isSaving: vm.isSaving,
                    disabled: replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSaving
                ) {
                    Task {
                        if await vm.reply(replyText) {
                            replyText = ""
                            SabqHaptics.success()
                        } else { SabqHaptics.error() }
                    }
                }
            }
            .padding(14)
            .adminInboxCard()
        }
    }

    private func metaRow(icon: String, text: String) -> some View {
        Label(text, systemImage: icon)
            .font(SabqFonts.app(size: 12))
            .foregroundStyle(SabqTheme.secondaryInk)
    }
}

// MARK: - Opinion tickets list

@MainActor
private final class AdminOpinionTicketsViewModel: ObservableObject {
    @Published private(set) var tickets: [AdminOpinionTicket] = []
    @Published private(set) var total = 0
    @Published var selectedStatus: AdminOpinionTicketStatus?
    @Published var isLoading = true
    @Published var isLoadingMore = false
    @Published var error: String?

    private var page = 1
    private let service: AdminInboxServicing

    init(service: AdminInboxServicing = LiveAdminInboxService()) { self.service = service }
    var canLoadMore: Bool { tickets.count < total }

    func load(search: String = "") async {
        isLoading = true
        error = nil
        page = 1
        do {
            let result = try await service.fetchOpinionTickets(page: 1, status: selectedStatus, search: search)
            tickets = result.tickets
            total = result.total
        } catch { self.error = "تعذّر تحميل استفسارات الرأي" }
        isLoading = false
    }

    func loadMore(search: String) async {
        guard canLoadMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let nextPage = page + 1
            let result = try await service.fetchOpinionTickets(page: nextPage, status: selectedStatus, search: search)
            let known = Set(tickets.map(\.id))
            tickets.append(contentsOf: result.tickets.filter { !known.contains($0.id) })
            total = result.total
            page = nextPage
        } catch { self.error = "تعذّر جلب المزيد من الاستفسارات" }
    }
}

struct AdminOpinionTicketsView: View {
    @StateObject private var vm = AdminOpinionTicketsViewModel()
    @State private var search = ""

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("استفسارات كتّاب الرأي")
                        .font(SabqFonts.app(size: 18, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    Text(vm.isLoading ? "جارٍ التحميل…" : "\(vm.total) استفسار")
                        .font(SabqFonts.app(size: 13))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                Menu {
                    Button("كل الاستفسارات") { vm.selectedStatus = nil }
                    Divider()
                    ForEach(AdminOpinionTicketStatus.allCases) { status in Button(status.label) { vm.selectedStatus = status } }
                } label: {
                    AdminInboxFilterChip(
                title: vm.selectedStatus?.label ?? "كل الحالات",
                tint: vm.selectedStatus?.tint ?? AdminInboxPalette.action
            )
                }
                ticketContent
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .padding(.bottom, 40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("استفسارات الرأي")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, prompt: "ابحث بالعنوان أو الكاتب")
        .onSubmit(of: .search) { Task { await vm.load(search: search) } }
        .onChange(of: vm.selectedStatus) { _, _ in Task { await vm.load(search: search) } }
        .task { await vm.load(search: search) }
        .refreshable { await vm.load(search: search) }
        .navigationDestination(for: AdminOpinionTicketRoute.self) { route in
            AdminOpinionTicketDetailView(id: route.id)
        }
        .sabqScreen("AdminOpinionTickets")
    }

    @ViewBuilder
    private var ticketContent: some View {
        if vm.isLoading && vm.tickets.isEmpty {
            VStack(spacing: 8) { ForEach(0..<5, id: \.self) { _ in SkeletonBox(height: 96, radius: adminInboxCorner) } }
        } else if let error = vm.error, vm.tickets.isEmpty {
            AdminInboxErrorState(text: error) { Task { await vm.load(search: search) } }
        } else if vm.tickets.isEmpty {
            AdminInboxEmptyState(icon: "text.bubble", title: "لا توجد استفسارات", subtitle: "ستظهر هنا مراسلات كتّاب الرأي مع هيئة التحرير.")
        } else {
            LazyVStack(spacing: 8) {
                ForEach(vm.tickets) { ticket in
                    NavigationLink(value: AdminOpinionTicketRoute(id: ticket.id)) { AdminOpinionTicketRow(ticket: ticket) }
                        .buttonStyle(.plain)
                }
                if vm.canLoadMore {
                    Button { Task { await vm.loadMore(search: search) } } label: {
                        HStack(spacing: 8) {
                            if vm.isLoadingMore { ProgressView().controlSize(.small) }
                            Text(vm.isLoadingMore ? "جارٍ الجلب…" : "جلب المزيد")
                        }
                        .font(SabqFonts.app(size: 14, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                    .disabled(vm.isLoadingMore)
                }
            }
        }
    }
}

private struct AdminOpinionTicketRow: View {
    let ticket: AdminOpinionTicket

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                AdminInboxStatusPill(title: ticket.status.label, icon: ticket.status.icon, tint: ticket.status.tint)
                if ticket.hasUnread {
                    Text("جديد")
                        .font(SabqFonts.app(size: 10, weight: .semibold))
                        .foregroundStyle(AdminInboxPalette.danger)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(AdminInboxPalette.danger.opacity(0.10)))
                        .overlay(Capsule().stroke(AdminInboxPalette.danger.opacity(0.22), lineWidth: 0.5))
                }
                Spacer()
                Text(adminInboxDate(ticket.lastMessageAt))
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .lineLimit(1)
            }
            Text(ticket.title)
                .font(SabqFonts.app(size: 15, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
                Text(ticket.writerName ?? ticket.writerEmail ?? "كاتب الرأي")
                Spacer()
                Image(systemName: "chevron.forward")
                    .font(SabqFonts.app(size: 11, weight: .medium))
            }
            .font(SabqFonts.app(size: 12))
            .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .adminInboxCard()
    }
}

// MARK: - Opinion-ticket detail

@MainActor
final class AdminOpinionTicketDetailViewModel: ObservableObject {
    @Published var detail: AdminOpinionTicketDetailResponse?
    @Published var isLoading = true
    @Published var isSaving = false
    @Published var error: String?
    private let id: String
    private let service: AdminInboxServicing

    init(id: String, service: AdminInboxServicing = LiveAdminInboxService()) { self.id = id; self.service = service }

    func load() async {
        isLoading = true
        error = nil
        do { detail = try await service.fetchOpinionTicket(id: id) }
        catch { self.error = "تعذّر تحميل الاستفسار" }
        isLoading = false
    }

    func updateStatus(_ status: AdminOpinionTicketStatus) async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do { try await service.updateOpinionTicket(id: id, status: status); await load() }
        catch { self.error = "تعذّر تحديث حالة الاستفسار" }
    }

    func reply(_ text: String, parentMessageId: String?) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        do { try await service.replyToOpinionTicket(id: id, text: text, parentMessageId: parentMessageId); await load(); return true }
        catch { self.error = "تعذّر إرسال الرد"; return false }
    }
}

struct AdminOpinionTicketDetailView: View {
    @StateObject private var vm: AdminOpinionTicketDetailViewModel
    @State private var replyText = ""
    @State private var replyTo: AdminOpinionTicketMessage?

    init(id: String) { _vm = StateObject(wrappedValue: AdminOpinionTicketDetailViewModel(id: id)) }

    var body: some View {
        ScrollView(showsIndicators: false) {
            Group {
                if vm.isLoading && vm.detail == nil {
                    VStack(spacing: 8) { ForEach(0..<4, id: \.self) { _ in SkeletonBox(height: 100, radius: adminInboxCorner) } }
                } else if let detail = vm.detail {
                    ticketDetail(detail)
                } else {
                    AdminInboxErrorState(text: vm.error ?? "الاستفسار غير متاح") { Task { await vm.load() } }
                }
            }
            .padding(16)
            .padding(.bottom, 36)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("محادثة الرأي")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .alert("تعذّر الإجراء", isPresented: Binding(get: { vm.error != nil && vm.detail != nil }, set: { if !$0 { vm.error = nil } })) {
            Button("حسناً", role: .cancel) { vm.error = nil }
        } message: { Text(vm.error ?? "") }
        .sabqScreen("AdminOpinionTicketDetail")
    }

    @ViewBuilder
    private func ticketDetail(_ detail: AdminOpinionTicketDetailResponse) -> some View {
        let ticket = detail.ticket
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    AdminInboxStatusPill(title: ticket.status.label, icon: ticket.status.icon, tint: ticket.status.tint)
                    Spacer()
                    Menu {
                        ForEach(AdminOpinionTicketStatus.allCases) { status in Button(status.label) { Task { await vm.updateStatus(status) } } }
                    } label: {
                        Text("تغيير الحالة")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill(SabqTheme.paleFill))
                            .overlay(Capsule().stroke(SabqTheme.outline, lineWidth: 0.5))
                    }
                    .disabled(vm.isSaving)
                }
                Text(ticket.title)
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                Text(ticket.writerName ?? ticket.writerEmail ?? "كاتب الرأي")
                    .font(SabqFonts.app(size: 13))
                    .foregroundStyle(SabqTheme.secondaryInk)
                Text("فتح في \(adminInboxDate(ticket.createdAt))")
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .adminInboxCard()

            ForEach(detail.messages) { message in
                let parent = message.parentMessageId.flatMap { parentId in detail.messages.first(where: { $0.id == parentId }) }
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(message.senderName ?? (message.isFromAdmin ? "الإدارة" : "الكاتب"))
                            .font(SabqFonts.app(size: 12, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                        if message.isFromAdmin {
                            Text("· إدارة")
                                .font(SabqFonts.app(size: 11))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                        Spacer()
                        Text(adminInboxDate(message.createdAt))
                            .font(SabqFonts.app(size: 11))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    if let parent {
                        Text("رد على: \(parent.message)")
                            .font(SabqFonts.app(size: 11))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .lineLimit(2)
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .fill(SabqTheme.background)
                            )
                    }
                    Text(message.message)
                        .font(SabqFonts.app(size: 15))
                        .foregroundStyle(SabqTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if ticket.status != .closed {
                        Button { replyTo = message } label: {
                            Text("رد على هذه الرسالة")
                                .font(SabqFonts.app(size: 12, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: adminInboxCorner, style: .continuous)
                        .fill(message.isFromAdmin ? SabqTheme.paleFill : SabqTheme.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: adminInboxCorner, style: .continuous)
                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                )
            }

            if ticket.status == .closed {
                AdminInboxEmptyState(icon: "lock", title: "الاستفسار مغلق", subtitle: "أعد فتحه من قائمة الحالة لإضافة رد جديد.")
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("إضافة رد")
                        .font(SabqFonts.app(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    if let replyTo {
                        HStack(spacing: 8) {
                            Text("رد على: \(replyTo.senderName ?? "الرسالة")")
                                .lineLimit(1)
                            Spacer()
                            Button { self.replyTo = nil } label: {
                                Image(systemName: "xmark")
                                    .font(SabqFonts.app(size: 11, weight: .medium))
                            }
                        }
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .padding(8)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(SabqTheme.paleFill)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(SabqTheme.outline, lineWidth: 0.5)
                        )
                    }
                    AdminInboxReplyEditor(text: $replyText, placeholder: "اكتب ردك للكاتب هنا…", minHeight: 110)
                    AdminInboxSendButton(
                        title: "إرسال الرد",
                        isSaving: vm.isSaving,
                        disabled: replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSaving
                    ) {
                        Task {
                            if await vm.reply(replyText, parentMessageId: replyTo?.id) {
                                replyText = ""
                                replyTo = nil
                                SabqHaptics.success()
                            } else { SabqHaptics.error() }
                        }
                    }
                }
                .padding(14)
                .adminInboxCard()
            }
        }
    }
}
