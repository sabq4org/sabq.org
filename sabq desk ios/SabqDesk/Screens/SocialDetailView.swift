import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// One tweet proposal: who sent it, the tweet as X will show it, its state,
/// and the decisions the member may take.
struct SocialDetailView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    let postID: String
    /// Other scheduled times, for the clash note in the schedule sheet.
    var scheduledTimes: [Date] = []
    /// Reports the post's latest status back to the lists.
    let onChange: (String?) -> Void

    @State private var detail: StaffSocialDetail?
    @State private var loadError: String?
    @State private var actionError: String?
    @State private var busyAction: BusyAction?
    @State private var confirmPublish = false
    @State private var confirmUnschedule = false
    @State private var showSchedule = false
    @State private var showReject = false
    @State private var notice: String?

    private enum BusyAction { case publish, schedule, reject, draft }

    var body: some View {
        Group {
            if let detail {
                content(detail)
            } else if let loadError {
                DeskMessageView(title: "تعذر فتح المقترح", message: loadError) {
                    Button("إعادة المحاولة") { Task { await load() } }
                        .buttonStyle(DeskSecondaryButtonStyle())
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(DeskTheme.background)
        .navigationTitle("مقترح تغريدة")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            if let status = detail?.post.status {
                ToolbarItem(placement: .primaryAction) {
                    StatusChip(title: status.title, tone: status.tone)
                }
            }
        }
        .task { await load() }
        .confirmationDialog("نشر التغريدة الآن على حساب سبق؟", isPresented: $confirmPublish, titleVisibility: .visible) {
            Button("انشر الآن") { Task { await publish() } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("ستظهر التغريدة فورًا على X ولا يمكن التراجع من التطبيق.")
        }
        .confirmationDialog("إلغاء الجدولة؟", isPresented: $confirmUnschedule, titleVisibility: .visible) {
            Button("ألغِ الجدولة", role: .destructive) { Task { await returnToDraft(success: "أُلغيت الجدولة وعادت التغريدة إلى «بانتظارك»") } }
            Button("تراجع", role: .cancel) {}
        } message: {
            Text("تعود التغريدة إلى «بانتظارك» دون موعد، ولن تُنشر حتى تقرر.")
        }
        .sheet(isPresented: $showSchedule) {
            ScheduleSheet(initial: detail?.post.scheduledAt, scheduledTimes: scheduledTimes) { date in
                Task { await schedule(date) }
            }
        }
        .sheet(isPresented: $showReject) {
            RejectSheet { reason in
                Task { await reject(reason) }
            }
        }
    }

    private func content(_ detail: StaffSocialDetail) -> some View {
        let post = detail.post
        let actions = app.capabilities.socialActions(for: post.status)
        let canUnschedule = post.status == .scheduled && app.capabilities.canSocial.schedule
        let canRestore = post.status == .canceled && app.capabilities.canSocial.reject
        return ScrollView {
            VStack(alignment: .leading, spacing: DeskLayout.space16) {
                sender(detail)
                TweetBody(preview: detail.preview)
                if let article = detail.article {
                    articleRow(article)
                }
                statusNote(post)
                if !detail.attempts.isEmpty {
                    AttemptsList(attempts: detail.attempts)
                }
            }
            .padding(.horizontal, DeskLayout.pageMargin + 4)
            .padding(.vertical, DeskLayout.space16)
        }
        .refreshable { await load() }
        .safeAreaInset(edge: .bottom) {
            if !actions.isEmpty || canUnschedule || canRestore || actionError != nil || notice != nil {
                actionBar(post: post, actions: actions, preview: detail.preview,
                          canUnschedule: canUnschedule, canRestore: canRestore)
            }
        }
    }

    private func sender(_ detail: StaffSocialDetail) -> some View {
        let name = detail.sender?.name ?? detail.agency?.name ?? detail.author?.name ?? "—"
        let kind = detail.sender?.kind ?? .unknown
        return HStack(spacing: DeskLayout.space12) {
            SenderAvatar(name: name, kind: kind, size: 44)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(name)
                        .deskText(DeskType.rowTitle)
                        .foregroundStyle(DeskTheme.textPrimary)
                    SenderKindTag(kind: kind)
                }
                Text("أرسلها \(RiyadhTime.ago(detail.post.createdAt)) · على حساب سبق في X")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func articleRow(_ article: StaffArticleRef) -> some View {
        Button {
            if let raw = article.url, let url = URL(string: raw) { openURL(url) }
        } label: {
            HStack(spacing: DeskLayout.space8) {
                Image(systemName: "doc.text")
                    .foregroundStyle(DeskTheme.textSecondary)
                    .accessibilityHidden(true)
                Text("الخبر المرتبط: «\(article.title ?? article.url ?? "")»")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskInk.link)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
        .disabled(article.url == nil)
    }

    /// One plain sentence about where the post stands.
    @ViewBuilder
    private func statusNote(_ post: StaffSocialPost) -> some View {
        switch post.status {
        case .scheduled:
            if let at = post.scheduledAt {
                InfoLine(systemImage: "calendar.badge.clock", tone: .info,
                         title: "مجدولة \(RiyadhTime.displayString(at)) بتوقيت الرياض",
                         detail: RiyadhTime.countdown(to: at))
            }
        case .published:
            VStack(alignment: .leading, spacing: DeskLayout.space8) {
                InfoLine(systemImage: "checkmark.circle.fill", tone: .success,
                         title: post.publishedAt.map { "نُشرت \(RiyadhTime.displayString($0))" } ?? "نُشرت",
                         detail: nil)
                if let raw = post.externalPostUrl, let url = URL(string: raw) {
                    Link("افتح التغريدة على X", destination: url)
                        .deskText(DeskType.metaEmphasis)
                        .foregroundStyle(DeskInk.link)
                }
            }
        case .canceled:
            InfoLine(systemImage: "xmark.circle.fill", tone: .danger,
                     title: "رُفض المقترح",
                     detail: post.lastError.map { "السبب: \($0)" } ?? "دون ذكر سبب")
        case .failed:
            InfoLine(systemImage: "exclamationmark.triangle.fill", tone: .danger,
                     title: "فشلت محاولة النشر",
                     detail: post.lastError)
        case .processing:
            InfoLine(systemImage: "paperplane", tone: .info, title: "قيد النشر الآن…", detail: nil)
        case .draft, .unknown:
            EmptyView()
        }
    }

    private func actionBar(post: StaffSocialPost, actions: SocialActionSet, preview: StaffSocialPreview,
                           canUnschedule: Bool, canRestore: Bool) -> some View {
        VStack(spacing: DeskLayout.space8) {
            if let notice {
                Label(notice, systemImage: "checkmark.circle")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.success)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let actionError { ErrorLine(message: actionError) }
            if !preview.valid, actions.publish || actions.schedule {
                ErrorLine(message: "النص أطول من حد X؛ لا يمكن نشره كما هو")
            }
            if actions.schedule {
                Button { showSchedule = true } label: {
                    busyLabel(post.status == .scheduled ? "غيّر الموعد" : "جدولة", busy: busyAction == .schedule)
                }
                .buttonStyle(DeskBigButtonStyle())
                .disabled(busyAction != nil || !preview.valid)
            }
            HStack(spacing: DeskLayout.space8) {
                if actions.publish {
                    Button { confirmPublish = true } label: { busyLabel("انشر الآن", busy: busyAction == .publish) }
                        .buttonStyle(DeskSecondaryButtonStyle())
                        .disabled(busyAction != nil || !preview.valid)
                }
                if canUnschedule {
                    Button { confirmUnschedule = true } label: { busyLabel("ألغِ الجدولة", busy: busyAction == .draft) }
                        .buttonStyle(DeskSecondaryButtonStyle(destructive: true))
                        .disabled(busyAction != nil)
                } else if actions.reject {
                    Button { showReject = true } label: { busyLabel("رفض…", busy: busyAction == .reject) }
                        .buttonStyle(DeskSecondaryButtonStyle(destructive: true))
                        .disabled(busyAction != nil)
                }
            }
            if canRestore {
                Button {
                    Task { await returnToDraft(success: "عاد المقترح إلى «بانتظارك»") }
                } label: { busyLabel("أعده إلى «بانتظارك»", busy: busyAction == .draft) }
                    .buttonStyle(DeskBigButtonStyle())
                    .disabled(busyAction != nil)
            }
        }
        .padding(.horizontal, DeskLayout.pageMargin + 4)
        .padding(.top, DeskLayout.space12)
        .padding(.bottom, DeskLayout.space8)
        .background(DeskTheme.background)
        .overlay(alignment: .top) { Rectangle().fill(DeskInk.hairline).frame(height: 1) }
    }

    private func busyLabel(_ title: String, busy: Bool) -> some View {
        HStack(spacing: DeskLayout.space8) {
            if busy { ProgressView() }
            Text(title)
        }
    }

    // MARK: - Actions

    private func load() async {
        do {
            let fresh = try await app.client.socialPost(id: postID)
            detail = fresh
            loadError = nil
            onChange(fresh.post.status.rawValue)
        } catch {
            if !app.handle(error) {
                loadError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    private func publish() async {
        await run(.publish, success: "نُشرت التغريدة") { try await app.client.publishSocialPost(id: postID) }
    }

    private func schedule(_ date: Date) async {
        await run(.schedule, success: "جُدولت التغريدة: \(RiyadhTime.displayString(date))") {
            try await app.client.scheduleSocialPost(id: postID, at: date)
        }
    }

    private func reject(_ reason: String?) async {
        await run(.reject, success: "رُفض المقترح وأُبلغ صاحبه") {
            try await app.client.rejectSocialPost(id: postID, reason: reason)
        }
    }

    private func returnToDraft(success: String) async {
        await run(.draft, success: success) { try await app.client.returnSocialPostToDraft(id: postID) }
    }

    private func run(_ action: BusyAction, success: String, _ call: () async throws -> StaffSocialPost) async {
        busyAction = action
        actionError = nil
        notice = nil
        defer { busyAction = nil }
        do {
            let post = try await call()
            apply(post)
            notice = success
            await app.refreshUnread()
        } catch {
            switch error as? StaffAPIError {
            case .conflict(_, let post?), .publishFailed(_, let post?):
                apply(post)
            default:
                break
            }
            if !app.handle(error) {
                actionError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    private func apply(_ post: StaffSocialPost) {
        detail?.post = post
        onChange(post.status.rawValue)
    }
}

/// Icon, a line, and an optional second line, tinted by tone. No card.
private struct InfoLine: View {
    let systemImage: String
    let tone: DeskTone
    let title: String
    let detail: String?

    var body: some View {
        HStack(alignment: .top, spacing: DeskLayout.space8) {
            Image(systemName: systemImage)
                .foregroundStyle(tone.ink)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskTheme.textPrimary)
                if let detail, !detail.isEmpty {
                    Text(detail)
                        .deskText(DeskType.meta)
                        .foregroundStyle(tone == .danger ? DeskTheme.danger : DeskTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The tweet as X will show it: text, media and the weighted count.
private struct TweetBody: View {
    let preview: StaffSocialPreview

    private var images: [URL] {
        let urls = (preview.mediaKind == "image" ? preview.mediaUrls ?? [] : []) + [preview.imageUrl].compactMap { $0 }
        var seen = Set<String>()
        return urls.filter { seen.insert($0).inserted }.compactMap(URL.init(string:)).prefix(4).map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            Text(preview.composedText)
                .font(DeskFonts.app(size: 17, weight: .regular))
                .lineSpacing(6)
                .foregroundStyle(DeskTheme.textPrimary)
                .textSelection(.enabled)
            if !images.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: DeskLayout.space8) {
                        ForEach(images, id: \.self) { url in
                            AsyncImage(url: url) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                DeskTheme.surfaceStrong
                            }
                            .frame(width: images.count == 1 ? 330 : 220, height: 180)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .accessibilityLabel("صورة مرفقة")
                        }
                    }
                }
            }
            if preview.mediaKind == "video" {
                Label("مقطع فيديو مرفق", systemImage: "play.rectangle")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
            HStack {
                Spacer()
                LTRText(text: "\(preview.weightedLength) / \(preview.maxLength)",
                        role: DeskType.meta,
                        color: preview.valid ? DeskTheme.textSecondary : DeskTheme.danger)
            }
        }
    }
}

private struct AttemptsList: View {
    let attempts: [StaffSocialAttempt]

    var body: some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: DeskLayout.space8) {
                ForEach(attempts) { attempt in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack {
                            Text([attempt.phase, attempt.outcome].compactMap { $0 }.joined(separator: " · "))
                                .deskText(DeskType.metaEmphasis)
                                .foregroundStyle(attempt.outcome == "failed" ? DeskTheme.danger : DeskTheme.textSecondary)
                            Spacer()
                            LTRText(text: RiyadhTime.shortString(attempt.createdAt))
                        }
                        if let message = attempt.errorMessage ?? attempt.errorCode {
                            Text(message)
                                .deskText(DeskType.meta)
                                .foregroundStyle(DeskTheme.textTertiary)
                        }
                    }
                }
            }
            .padding(.top, DeskLayout.space8)
        } label: {
            Text("سجل المحاولات (\(attempts.count))")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(DeskTheme.textSecondary)
        }
    }
}
