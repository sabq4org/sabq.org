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

private let adminInboxCorner: CGFloat = SabqRadius.medium

private func adminInboxDate(_ date: Date) -> String {
    "\(SabqFormatters.arabicDate.string(from: date)) · \(SabqFormatters.riyadhTime.string(from: date))"
}

/// Status colours resolved to the design system's status roles.
private extension AdminContactMessageStatus {
    var themeTint: Color {
        switch self {
        case .pending: return SabqTheme.warning
        case .read: return SabqTheme.primary
        case .replied: return SabqTheme.success
        }
    }
}

private extension AdminOpinionTicketStatus {
    var themeTint: Color {
        switch self {
        case .open: return SabqTheme.warning
        case .answered: return SabqTheme.success
        case .closed: return SabqTheme.textSecondary
        }
    }
}

/// Small radius-8 status tag: coloured text on a quiet fill.
private struct AdminInboxStatusPill: View {
    let title: String
    let icon: String
    let tint: Color

    var body: some View {
        Label(title, systemImage: icon)
            .labelStyle(.titleAndIcon)
            .font(SabqType.tag.font)
            .foregroundStyle(tint)
            .padding(.horizontal, SabqLayout.space8)
            .padding(.vertical, SabqLayout.space4)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
            )
    }
}

private struct AdminInboxFilterChip: View {
    let title: String
    var tint: Color = SabqTheme.textPrimary

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "line.3.horizontal.decrease")
            Text(title)
            Image(systemName: "chevron.down")
                .font(SabqFonts.app(size: 12, weight: .semibold))
        }
        .font(SabqType.metaEmphasis.font)
        .foregroundStyle(tint)
        .padding(.horizontal, SabqLayout.space12)
        .frame(minHeight: SabqLayout.touchTarget)
        .background(Capsule().fill(SabqTheme.surfaceMuted))
    }
}

/// Quiet block: muted fill, radius 12, no border or shadow.
private struct AdminInboxCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: adminInboxCorner, style: .continuous)
                    .fill(SabqTheme.surfaceMuted)
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
        ZStack(alignment: .topLeading) {
            TextEditor(text: $text)
                .font(SabqType.excerpt.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .scrollContentBackground(.hidden)
                .frame(minHeight: minHeight)
                .padding(SabqLayout.space8)

            if text.isEmpty {
                Text(placeholder)
                    .font(SabqType.excerpt.font)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal, SabqLayout.space12)
                    .padding(.vertical, SabqLayout.space16)
                    .allowsHitTesting(false)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 1)
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
        VStack(spacing: SabqLayout.space8) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 28, weight: .light))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text(title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(subtitle)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: compact ? 140 : 220)
        .padding(SabqLayout.space24)
        .adminInboxCard()
    }
}

private struct AdminInboxErrorState: View {
    let text: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "exclamationmark.triangle")
                .font(SabqFonts.app(size: 28, weight: .light))
                .foregroundStyle(SabqTheme.textSecondary)
                .accessibilityHidden(true)
            Text(text)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
            Button("إعادة المحاولة", action: retry)
                .font(SabqType.button.font)
                .foregroundStyle(SabqTheme.primary)
                .frame(minHeight: SabqLayout.touchTarget)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .padding(SabqLayout.space24)
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
            HStack(spacing: SabqLayout.space8) {
                if isSaving { ProgressView().tint(SabqTheme.onAction) }
                Image(systemName: "paperplane")
                Text(isSaving ? "جارٍ الإرسال…" : title)
            }
            .font(SabqType.button.font)
            .foregroundStyle(disabled && !isSaving ? SabqTheme.disabledInk : SabqTheme.onAction)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(disabled && !isSaving ? SabqTheme.disabledFill : SabqTheme.actionFill)
            )
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

/// Plain "load more" control under an unboxed list.
private struct AdminInboxLoadMoreLabel: View {
    let isLoading: Bool

    var body: some View {
        HStack(spacing: SabqLayout.space8) {
            if isLoading { ProgressView().controlSize(.small) }
            Text(isLoading ? "جارٍ الجلب…" : "جلب المزيد")
        }
        .font(SabqType.button.font)
        .foregroundStyle(SabqTheme.primary)
        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 1)
        )
    }
}

/// Small text menu trigger for changing an item's status.
private struct AdminInboxStatusMenuLabel: View {
    var body: some View {
        Text("تغيير الحالة")
            .font(SabqType.metaEmphasis.font)
            .foregroundStyle(SabqTheme.primary)
            .padding(.horizontal, SabqLayout.space12)
            .frame(minHeight: SabqLayout.touchTarget)
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: 1)
                    .frame(height: 32)
            )
            .contentShape(Rectangle())
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
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                header
                filter
                content
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.vertical, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space40)
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
        VStack(alignment: .leading, spacing: SabqLayout.space4) {
            Text("رسائل التواصل")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Text(vm.isLoading ? "جارٍ التحميل…" : "\(vm.total) رسالة")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)
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
                tint: vm.selectedStatus?.themeTint ?? SabqTheme.textPrimary
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        if vm.isLoading && vm.messages.isEmpty {
            VStack(spacing: SabqLayout.space16) {
                ForEach(0..<5, id: \.self) { _ in SkeletonBox(height: 88, radius: SabqRadius.small) }
            }
        } else if let error = vm.error, vm.messages.isEmpty {
            AdminInboxErrorState(text: error) { Task { await vm.load(search: search) } }
        } else if vm.messages.isEmpty {
            AdminInboxEmptyState(icon: "tray", title: "لا توجد رسائل", subtitle: "ستظهر هنا رسائل نموذج التواصل الواردة.")
        } else {
            LazyVStack(spacing: 0) {
                ForEach(vm.messages) { message in
                    if message.id != vm.messages.first?.id {
                        Divider().overlay(SabqTheme.separator)
                    }
                    NavigationLink(value: AdminContactMessageRoute(id: message.id)) {
                        AdminContactMessageRow(message: message)
                    }
                    .buttonStyle(.plain)
                }
                if vm.canLoadMore {
                    Button { Task { await vm.loadMore(search: search) } } label: {
                        AdminInboxLoadMoreLabel(isLoading: vm.isLoadingMore)
                    }
                    .buttonStyle(.plain)
                    .disabled(vm.isLoadingMore)
                    .padding(.top, SabqLayout.space8)
                }
            }
        }
    }
}

private struct AdminContactMessageRow: View {
    let message: AdminContactMessage

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .center, spacing: SabqLayout.space8) {
                AdminInboxStatusPill(title: message.status.label, icon: message.status.icon, tint: message.status.themeTint)
                Spacer(minLength: 0)
                Text(adminInboxDate(message.createdAt))
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .lineLimit(1)
            }
            Text(message.subject)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(2)
            Text(message.message)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: SabqLayout.space8) {
                Text(message.name)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(SabqFonts.app(size: 12))
            }
            .sabqText(SabqType.meta)
            .foregroundStyle(SabqTheme.textTertiary)
            .lineLimit(1)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
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
                    VStack(spacing: SabqLayout.space8) { ForEach(0..<4, id: \.self) { _ in SkeletonBox(height: 100, radius: adminInboxCorner) } }
                } else if let detail = vm.detail {
                    detailContent(detail)
                } else {
                    AdminInboxErrorState(text: vm.error ?? "الرسالة غير متاحة") { Task { await vm.load() } }
                }
            }
            .padding(SabqLayout.pageMargin)
            .padding(.bottom, SabqLayout.space32)
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
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                HStack(alignment: .center) {
                    AdminInboxStatusPill(title: message.status.label, icon: message.status.icon, tint: message.status.themeTint)
                    Spacer()
                    Menu {
                        ForEach(AdminContactMessageStatus.allCases) { status in
                            Button(status.label) { Task { await vm.updateStatus(status) } }
                        }
                    } label: {
                        AdminInboxStatusMenuLabel()
                    }
                    .disabled(vm.isSaving)
                }
                Text(message.subject)
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    metaRow(icon: "person", text: message.name)
                    metaRow(icon: "envelope", text: message.email)
                    if !message.phone.isEmpty {
                        metaRow(icon: "phone", text: message.phone)
                    }
                    metaRow(icon: "calendar", text: adminInboxDate(message.createdAt))
                }
                Divider().overlay(SabqTheme.separator)
                Text(message.message)
                    .sabqText(SabqType.articleBody)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if !detail.replies.isEmpty || message.replyText != nil {
                VStack(alignment: .leading, spacing: SabqLayout.space12) {
                    Text("سجل الردود")
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    ForEach(detail.replies) { reply in
                        VStack(alignment: .leading, spacing: SabqLayout.space8) {
                            HStack {
                                Text(reply.responderName ?? "الإدارة")
                                    .sabqText(SabqType.metaEmphasis)
                                    .foregroundStyle(SabqTheme.textSecondary)
                                Spacer()
                                Text(adminInboxDate(reply.createdAt))
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(SabqTheme.textTertiary)
                            }
                            Text(reply.replyText)
                                .sabqText(SabqType.excerpt)
                                .foregroundStyle(SabqTheme.textPrimary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(SabqLayout.space12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .adminInboxCard()
                    }
                    if detail.replies.isEmpty, let reply = message.replyText {
                        Text(reply)
                            .sabqText(SabqType.excerpt)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(SabqLayout.space12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .adminInboxCard()
                    }
                }
            }

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text("إرسال رد بالبريد")
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("سيصل الرد إلى البريد المسجّل أعلاه ويُحفظ في سجل المحادثة.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
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
        }
    }

    private func metaRow(icon: String, text: String) -> some View {
        Label(text, systemImage: icon)
            .font(SabqType.meta.font)
            .foregroundStyle(SabqTheme.textSecondary)
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
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text("استفسارات كتّاب الرأي")
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Text(vm.isLoading ? "جارٍ التحميل…" : "\(vm.total) استفسار")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
                Menu {
                    Button("كل الاستفسارات") { vm.selectedStatus = nil }
                    Divider()
                    ForEach(AdminOpinionTicketStatus.allCases) { status in Button(status.label) { vm.selectedStatus = status } }
                } label: {
                    AdminInboxFilterChip(
                title: vm.selectedStatus?.label ?? "كل الحالات",
                tint: vm.selectedStatus?.themeTint ?? SabqTheme.textPrimary
            )
                }
                ticketContent
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.vertical, SabqLayout.space8)
            .padding(.bottom, SabqLayout.space40)
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
            VStack(spacing: SabqLayout.space16) { ForEach(0..<5, id: \.self) { _ in SkeletonBox(height: 88, radius: SabqRadius.small) } }
        } else if let error = vm.error, vm.tickets.isEmpty {
            AdminInboxErrorState(text: error) { Task { await vm.load(search: search) } }
        } else if vm.tickets.isEmpty {
            AdminInboxEmptyState(icon: "text.bubble", title: "لا توجد استفسارات", subtitle: "ستظهر هنا مراسلات كتّاب الرأي مع هيئة التحرير.")
        } else {
            LazyVStack(spacing: 0) {
                ForEach(vm.tickets) { ticket in
                    if ticket.id != vm.tickets.first?.id {
                        Divider().overlay(SabqTheme.separator)
                    }
                    NavigationLink(value: AdminOpinionTicketRoute(id: ticket.id)) { AdminOpinionTicketRow(ticket: ticket) }
                        .buttonStyle(.plain)
                }
                if vm.canLoadMore {
                    Button { Task { await vm.loadMore(search: search) } } label: {
                        AdminInboxLoadMoreLabel(isLoading: vm.isLoadingMore)
                    }
                    .buttonStyle(.plain)
                    .disabled(vm.isLoadingMore)
                    .padding(.top, SabqLayout.space8)
                }
            }
        }
    }
}

private struct AdminOpinionTicketRow: View {
    let ticket: AdminOpinionTicket

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .center, spacing: SabqLayout.space8) {
                AdminInboxStatusPill(title: ticket.status.label, icon: ticket.status.icon, tint: ticket.status.themeTint)
                if ticket.hasUnread {
                    StatusChip(title: "جديد", tint: SabqTheme.danger)
                }
                Spacer()
                Text(adminInboxDate(ticket.lastMessageAt))
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .lineLimit(1)
            }
            Text(ticket.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            HStack(spacing: SabqLayout.space8) {
                Text(ticket.writerName ?? ticket.writerEmail ?? "كاتب الرأي")
                Spacer()
                Image(systemName: "chevron.forward")
                    .font(SabqFonts.app(size: 12))
            }
            .sabqText(SabqType.meta)
            .foregroundStyle(SabqTheme.textTertiary)
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
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
                    VStack(spacing: SabqLayout.space8) { ForEach(0..<4, id: \.self) { _ in SkeletonBox(height: 100, radius: adminInboxCorner) } }
                } else if let detail = vm.detail {
                    ticketDetail(detail)
                } else {
                    AdminInboxErrorState(text: vm.error ?? "الاستفسار غير متاح") { Task { await vm.load() } }
                }
            }
            .padding(SabqLayout.pageMargin)
            .padding(.bottom, SabqLayout.space32)
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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(alignment: .center) {
                    AdminInboxStatusPill(title: ticket.status.label, icon: ticket.status.icon, tint: ticket.status.themeTint)
                    Spacer()
                    Menu {
                        ForEach(AdminOpinionTicketStatus.allCases) { status in Button(status.label) { Task { await vm.updateStatus(status) } } }
                    } label: {
                        AdminInboxStatusMenuLabel()
                    }
                    .disabled(vm.isSaving)
                }
                Text(ticket.title)
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(ticket.writerName ?? ticket.writerEmail ?? "كاتب الرأي")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textSecondary)
                Text("فتح في \(adminInboxDate(ticket.createdAt))")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            ForEach(detail.messages) { message in
                let parent = message.parentMessageId.flatMap { parentId in detail.messages.first(where: { $0.id == parentId }) }
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    HStack {
                        Text(message.senderName ?? (message.isFromAdmin ? "الإدارة" : "الكاتب"))
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.textSecondary)
                        if message.isFromAdmin {
                            Text("· إدارة")
                                .sabqText(SabqType.meta)
                                .foregroundStyle(SabqTheme.textTertiary)
                        }
                        Spacer()
                        Text(adminInboxDate(message.createdAt))
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textTertiary)
                    }
                    if let parent {
                        Text("رد على: \(parent.message)")
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .lineLimit(2)
                            .padding(SabqLayout.space8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                    .fill(message.isFromAdmin ? SabqTheme.background : SabqTheme.surfaceMuted)
                            )
                    }
                    Text(message.message)
                        .sabqText(SabqType.excerpt)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if ticket.status != .closed {
                        Button { replyTo = message } label: {
                            Text("رد على هذه الرسالة")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(SabqTheme.primary)
                                .frame(minHeight: SabqLayout.touchTarget)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, message.isFromAdmin ? SabqLayout.space12 : 0)
                .padding(.vertical, SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: adminInboxCorner, style: .continuous)
                        .fill(message.isFromAdmin ? SabqTheme.surfaceMuted : Color.clear)
                )
                .overlay(alignment: .bottom) {
                    if !message.isFromAdmin {
                        Divider().overlay(SabqTheme.separator)
                    }
                }
            }

            if ticket.status == .closed {
                AdminInboxEmptyState(icon: "lock", title: "الاستفسار مغلق", subtitle: "أعد فتحه من قائمة الحالة لإضافة رد جديد.")
            } else {
                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text("إضافة رد")
                        .sabqText(SabqType.sectionHeading)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    if let replyTo {
                        HStack(spacing: SabqLayout.space8) {
                            Text("رد على: \(replyTo.senderName ?? "الرسالة")")
                                .lineLimit(1)
                            Spacer()
                            Button { self.replyTo = nil } label: {
                                Image(systemName: "xmark")
                                    .font(SabqFonts.app(size: 12, weight: .semibold))
                                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                                    .contentShape(Rectangle())
                            }
                        }
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .padding(.leading, SabqLayout.space12)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
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
                .padding(.top, SabqLayout.space8)
            }
        }
    }
}
