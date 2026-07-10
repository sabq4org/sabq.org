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

private func adminInboxDate(_ date: Date) -> String {
    "\(SabqFormatters.arabicDate.string(from: date)) · \(SabqFormatters.riyadhTime.string(from: date))"
}

private struct AdminInboxStatusPill: View {
    let title: String
    let icon: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: icon)
            .font(SabqFonts.app(size: 11, weight: .bold))
            .foregroundStyle(tint)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Capsule().fill(tint.opacity(0.12)))
    }
}

private struct AdminInboxCardModifier: ViewModifier {
    var accent: Color?

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .fill(SabqTheme.surface)
                    .shadow(color: SabqTheme.shadow, radius: 7, y: 3)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.8), lineWidth: 0.7)
            )
            .overlay(alignment: .leading) {
                if let accent {
                    Capsule()
                        .fill(accent)
                        .frame(width: 3.5)
                        .padding(.vertical, 13)
                        .padding(.leading, 1)
                }
            }
    }
}

private extension View {
    func adminInboxCard(accent: Color? = nil) -> some View {
        modifier(AdminInboxCardModifier(accent: accent))
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
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 17)
                    .allowsHitTesting(false)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(SabqTheme.background)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.65), lineWidth: 0.5)
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
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 36, weight: .light))
                .foregroundStyle(SabqTheme.secondaryInk.opacity(0.55))
            Text(title)
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            Text(subtitle)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 150 : 250)
        .padding(24)
        .adminInboxCard()
    }
}

private struct AdminInboxErrorState: View {
    let text: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle")
                .font(SabqFonts.app(size: 34, weight: .light))
                .foregroundStyle(AdminInboxPalette.danger)
            Text(text)
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
            Button("إعادة المحاولة", action: retry)
                .font(SabqFonts.app(size: 14, weight: .bold))
                .foregroundStyle(AdminInboxPalette.action)
        }
        .frame(maxWidth: .infinity, minHeight: 250)
        .padding(24)
        .adminInboxCard()
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
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(AdminInboxPalette.success.opacity(0.12))
                    .frame(width: 46, height: 46)
                Image(systemName: "envelope.badge.fill")
                    .font(SabqFonts.app(size: 20, weight: .semibold))
                    .foregroundStyle(AdminInboxPalette.success)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text("رسائل التواصل")
                    .font(SabqFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text(vm.isLoading ? "جارٍ التحميل…" : "\(vm.total) رسالة")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            Spacer()
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
            HStack(spacing: 7) {
                Image(systemName: "line.3.horizontal.decrease.circle")
                Text(vm.selectedStatus?.label ?? "كل الحالات")
                Image(systemName: "chevron.down").font(SabqFonts.app(size: 10, weight: .bold))
            }
            .font(SabqFonts.app(size: 13, weight: .bold))
            .foregroundStyle(AdminInboxPalette.action)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(Capsule().fill(AdminInboxPalette.action.opacity(0.10)))
        }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading && vm.messages.isEmpty {
            VStack(spacing: 10) {
                ForEach(0..<5, id: \.self) { _ in SkeletonBox(height: 104, radius: SabqTheme.cardRadius) }
            }
        } else if let error = vm.error, vm.messages.isEmpty {
            AdminInboxErrorState(text: error) { Task { await vm.load(search: search) } }
        } else if vm.messages.isEmpty {
            AdminInboxEmptyState(icon: "tray", title: "لا توجد رسائل", subtitle: "ستظهر هنا رسائل نموذج التواصل الواردة.")
        } else {
            LazyVStack(spacing: 10) {
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
                        .font(SabqFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(AdminInboxPalette.action)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
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
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 8) {
                AdminInboxStatusPill(title: message.status.label, icon: message.status.icon, tint: message.status.tint)
                Spacer(minLength: 0)
                Text(adminInboxDate(message.createdAt))
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
            }
            Text(message.subject)
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(2)
            Text(message.message)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
                Image(systemName: "person.fill")
                Text(message.name)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
            }
            .font(SabqFonts.app(size: 12, weight: .medium))
            .foregroundStyle(SabqTheme.secondaryInk)
            .lineLimit(1)
            Text(message.email)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineLimit(1)
                .environment(\.layoutDirection, .leftToRight)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .adminInboxCard(accent: message.status.tint)
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
                    VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in SkeletonBox(height: 120, radius: SabqTheme.cardRadius) } }
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
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    AdminInboxStatusPill(title: message.status.label, icon: message.status.icon, tint: message.status.tint)
                    Spacer()
                    Menu {
                        ForEach(AdminContactMessageStatus.allCases) { status in
                            Button(status.label) { Task { await vm.updateStatus(status) } }
                        }
                    } label: {
                        Label("تغيير الحالة", systemImage: "ellipsis.circle")
                            .font(SabqFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(AdminInboxPalette.action)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(Capsule().fill(AdminInboxPalette.action.opacity(0.10)))
                    }
                    .disabled(vm.isSaving)
                }
                Text(message.subject)
                    .font(SabqFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                VStack(alignment: .leading, spacing: 5) {
                    Label(message.name, systemImage: "person.fill")
                    Label(message.email, systemImage: "envelope.fill")
                    Label(message.phone, systemImage: "phone.fill")
                    Label(adminInboxDate(message.createdAt), systemImage: "calendar")
                }
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                Divider()
                Text(message.message)
                    .font(SabqFonts.app(size: 15))
                    .foregroundStyle(SabqTheme.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .adminInboxCard(accent: message.status.tint)

            if !detail.replies.isEmpty || message.replyText != nil {
                VStack(alignment: .leading, spacing: 10) {
                    Text("سجل الردود")
                        .font(SabqFonts.app(size: 16, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    ForEach(detail.replies) { reply in
                        VStack(alignment: .leading, spacing: 7) {
                            HStack {
                                Label(reply.responderName ?? "الإدارة", systemImage: "shield.fill")
                                Spacer()
                                Text(adminInboxDate(reply.createdAt))
                            }
                            .font(SabqFonts.app(size: 11, weight: .bold))
                            .foregroundStyle(AdminInboxPalette.success)
                            Text(reply.replyText)
                                .font(SabqFonts.app(size: 14))
                                .foregroundStyle(SabqTheme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(13)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(AdminInboxPalette.success.opacity(0.10)))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(AdminInboxPalette.success.opacity(0.30), lineWidth: 0.6))
                    }
                    if detail.replies.isEmpty, let reply = message.replyText {
                        Text(reply)
                            .font(SabqFonts.app(size: 14))
                            .foregroundStyle(SabqTheme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(13)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(AdminInboxPalette.success.opacity(0.10)))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(AdminInboxPalette.success.opacity(0.30), lineWidth: 0.6))
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("إرسال رد بالبريد")
                    .font(SabqFonts.app(size: 16, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("سيصل الرد إلى البريد المسجّل أعلاه ويُحفظ في سجل المحادثة.")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                AdminInboxReplyEditor(text: $replyText, placeholder: "اكتب ردك هنا…", minHeight: 135)
                Button {
                    Task {
                        if await vm.reply(replyText) {
                            replyText = ""
                            SabqHaptics.success()
                        } else { SabqHaptics.error() }
                    }
                } label: {
                    HStack(spacing: 8) {
                        if vm.isSaving { ProgressView().tint(.white) }
                        Image(systemName: "paperplane.fill")
                        Text(vm.isSaving ? "جارٍ الإرسال…" : "إرسال الرد")
                    }
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: 50)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(AdminInboxPalette.primaryButton))
                }
                .buttonStyle(.plain)
                .disabled(replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSaving)
            }
            .padding(14)
            .adminInboxCard()
        }
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
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .top, spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(AdminInboxPalette.warning.opacity(0.12))
                            .frame(width: 46, height: 46)
                        Image(systemName: "text.bubble.fill")
                            .font(SabqFonts.app(size: 20, weight: .semibold))
                            .foregroundStyle(AdminInboxPalette.warning)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text("استفسارات كتّاب الرأي")
                            .font(SabqFonts.app(size: 20, weight: .heavy))
                            .foregroundStyle(SabqTheme.ink)
                        Text(vm.isLoading ? "جارٍ التحميل…" : "\(vm.total) استفسار")
                            .font(SabqFonts.app(size: 13, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    Spacer()
                }
                Menu {
                    Button("كل الاستفسارات") { vm.selectedStatus = nil }
                    Divider()
                    ForEach(AdminOpinionTicketStatus.allCases) { status in Button(status.label) { vm.selectedStatus = status } }
                } label: {
                    HStack(spacing: 7) {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                        Text(vm.selectedStatus?.label ?? "كل الحالات")
                        Image(systemName: "chevron.down").font(SabqFonts.app(size: 10, weight: .bold))
                    }
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(AdminInboxPalette.action)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Capsule().fill(AdminInboxPalette.action.opacity(0.10)))
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
            VStack(spacing: 10) { ForEach(0..<5, id: \.self) { _ in SkeletonBox(height: 104, radius: SabqTheme.cardRadius) } }
        } else if let error = vm.error, vm.tickets.isEmpty {
            AdminInboxErrorState(text: error) { Task { await vm.load(search: search) } }
        } else if vm.tickets.isEmpty {
            AdminInboxEmptyState(icon: "text.bubble", title: "لا توجد استفسارات", subtitle: "ستظهر هنا مراسلات كتّاب الرأي مع هيئة التحرير.")
        } else {
            LazyVStack(spacing: 10) {
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
                        .font(SabqFonts.app(size: 14, weight: .bold))
                        .foregroundStyle(AdminInboxPalette.action)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
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
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                AdminInboxStatusPill(title: ticket.status.label, icon: ticket.status.icon, tint: ticket.status.tint)
                if ticket.hasUnread {
                    Text("جديد")
                        .font(SabqFonts.app(size: 10, weight: .heavy))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7).padding(.vertical, 4)
                        .background(Capsule().fill(AdminInboxPalette.danger))
                }
                Spacer()
                Text(adminInboxDate(ticket.lastMessageAt))
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
            }
            Text(ticket.title)
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: 6) {
                Image(systemName: "person.fill")
                Text(ticket.writerName ?? ticket.writerEmail ?? "كاتب الرأي")
                Spacer()
                Image(systemName: "chevron.forward")
            }
            .font(SabqFonts.app(size: 12, weight: .medium))
            .foregroundStyle(SabqTheme.secondaryInk)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .adminInboxCard(accent: ticket.hasUnread ? AdminInboxPalette.danger : ticket.status.tint)
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
                    VStack(spacing: 12) { ForEach(0..<4, id: \.self) { _ in SkeletonBox(height: 120, radius: SabqTheme.cardRadius) } }
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
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top) {
                    AdminInboxStatusPill(title: ticket.status.label, icon: ticket.status.icon, tint: ticket.status.tint)
                    Spacer()
                    Menu {
                        ForEach(AdminOpinionTicketStatus.allCases) { status in Button(status.label) { Task { await vm.updateStatus(status) } } }
                    } label: {
                        Label("تغيير الحالة", systemImage: "ellipsis.circle")
                            .font(SabqFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(AdminInboxPalette.action)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 7)
                            .background(Capsule().fill(AdminInboxPalette.action.opacity(0.10)))
                    }
                    .disabled(vm.isSaving)
                }
                Text(ticket.title).font(SabqFonts.app(size: 20, weight: .heavy)).foregroundStyle(SabqTheme.ink)
                Label(ticket.writerName ?? ticket.writerEmail ?? "كاتب الرأي", systemImage: "person.fill")
                    .font(SabqFonts.app(size: 13, weight: .medium)).foregroundStyle(SabqTheme.secondaryInk)
                Text("فتح في \(adminInboxDate(ticket.createdAt))")
                    .font(SabqFonts.app(size: 11, weight: .medium)).foregroundStyle(SabqTheme.secondaryInk)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .adminInboxCard(accent: ticket.status.tint)

            ForEach(detail.messages) { message in
                let parent = message.parentMessageId.flatMap { parentId in detail.messages.first(where: { $0.id == parentId }) }
                let senderTint = message.isFromAdmin ? AdminInboxPalette.action : AdminInboxPalette.success
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label(message.senderName ?? (message.isFromAdmin ? "الإدارة" : "الكاتب"), systemImage: message.isFromAdmin ? "shield.fill" : "person.fill")
                            .font(SabqFonts.app(size: 12, weight: .bold))
                            .foregroundStyle(senderTint)
                        Spacer()
                        Text(adminInboxDate(message.createdAt))
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    if let parent {
                        Text("رد على: \(parent.message)")
                            .font(SabqFonts.app(size: 11))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineLimit(2)
                            .padding(9)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(SabqTheme.background))
                    }
                    Text(message.message)
                        .font(SabqFonts.app(size: 15))
                        .foregroundStyle(SabqTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if ticket.status != .closed {
                        Button { replyTo = message } label: {
                            Label("رد على هذه الرسالة", systemImage: "arrowshape.turn.up.left")
                                .font(SabqFonts.app(size: 12, weight: .bold))
                                .foregroundStyle(AdminInboxPalette.action)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).fill(senderTint.opacity(0.10)))
                .overlay(RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous).stroke(senderTint.opacity(0.32), lineWidth: 0.6))
            }

            if ticket.status == .closed {
                AdminInboxEmptyState(icon: "lock.fill", title: "الاستفسار مغلق", subtitle: "أعد فتحه من قائمة الحالة لإضافة رد جديد.")
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Text("إضافة رد")
                        .font(SabqFonts.app(size: 16, weight: .heavy))
                        .foregroundStyle(SabqTheme.ink)
                    if let replyTo {
                        HStack(spacing: 8) {
                            Image(systemName: "arrowshape.turn.up.left").foregroundStyle(AdminInboxPalette.action)
                            Text("رد على: \(replyTo.senderName ?? "الرسالة")").lineLimit(1)
                            Spacer()
                            Button { self.replyTo = nil } label: { Image(systemName: "xmark.circle.fill") }
                        }
                        .font(SabqFonts.app(size: 12, weight: .bold)).foregroundStyle(SabqTheme.secondaryInk)
                    }
                    AdminInboxReplyEditor(text: $replyText, placeholder: "اكتب ردك للكاتب هنا…", minHeight: 125)
                    Button {
                        Task {
                            if await vm.reply(replyText, parentMessageId: replyTo?.id) {
                                replyText = ""
                                replyTo = nil
                                SabqHaptics.success()
                            } else { SabqHaptics.error() }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if vm.isSaving { ProgressView().tint(.white) }
                            Image(systemName: "paperplane.fill")
                            Text(vm.isSaving ? "جارٍ الإرسال…" : "إرسال الرد")
                        }
                        .font(SabqFonts.app(size: 14, weight: .bold)).foregroundStyle(.white)
                        .frame(maxWidth: .infinity).frame(minHeight: 50)
                        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(AdminInboxPalette.primaryButton))
                    }
                    .buttonStyle(.plain)
                    .disabled(replyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || vm.isSaving)
                }
                .padding(14)
                .adminInboxCard()
            }
        }
    }
}
