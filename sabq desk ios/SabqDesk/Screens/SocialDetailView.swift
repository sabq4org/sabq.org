import SabqDeskDesign
import SabqDeskKit
import SwiftUI

struct SocialDetailView: View {
    @Environment(AppModel.self) private var app
    @Environment(\.openURL) private var openURL
    let postID: String
    /// Reports the post's latest status back to the inbox row.
    let onChange: (String?) -> Void

    @State private var detail: StaffSocialDetail?
    @State private var loadError: String?
    @State private var actionError: String?
    @State private var busyAction: BusyAction?
    @State private var confirmPublish = false
    @State private var showSchedule = false
    @State private var showReject = false
    @State private var notice: String?

    private enum BusyAction { case publish, schedule, reject }

    var body: some View {
        Group {
            if let detail {
                content(detail)
            } else if let loadError {
                DeskMessageView(systemImage: "exclamationmark.triangle", title: "تعذر فتح المقترح", message: loadError) {
                    Button("إعادة المحاولة") { Task { await load() } }
                        .buttonStyle(DeskSecondaryButtonStyle())
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("مقترح نشر")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .confirmationDialog("نشر التغريدة الآن على حساب سبق؟", isPresented: $confirmPublish, titleVisibility: .visible) {
            Button("انشر الآن") { Task { await publish() } }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("ستظهر التغريدة فوراً على X ولا يمكن التراجع من التطبيق.")
        }
        .sheet(isPresented: $showSchedule) {
            ScheduleSheet(initial: detail?.post.scheduledAt) { date in
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
        let actions = app.capabilities.socialActions(for: detail.post.status)
        return ScrollView {
            VStack(alignment: .leading, spacing: DeskLayout.space16) {
                meta(detail)
                TweetPreview(preview: detail.preview)
                if let article = detail.article {
                    articleRow(article)
                }
                statusBlock(detail.post)
                if !detail.attempts.isEmpty {
                    AttemptsList(attempts: detail.attempts)
                }
            }
            .padding(DeskLayout.pageMargin)
        }
        .refreshable { await load() }
        .safeAreaInset(edge: .bottom) {
            if !actions.isEmpty || actionError != nil || notice != nil {
                actionBar(actions, preview: detail.preview)
            }
        }
    }

    private func meta(_ detail: StaffSocialDetail) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space4) {
            Text("من")
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textTertiary)
            HStack(spacing: DeskLayout.space8) {
                Text(detail.sender?.name ?? detail.agency?.name ?? detail.author?.name ?? "—")
                    .deskText(DeskType.rowTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                if let kind = detail.sender?.kind {
                    StatusPill(title: kind.title)
                }
                Spacer()
                LTRText(text: RiyadhTime.displayString(detail.post.createdAt))
            }
        }
    }

    private func articleRow(_ article: StaffArticleRef) -> some View {
        Button {
            if let raw = article.url, let url = URL(string: raw) { openURL(url) }
        } label: {
            HStack(spacing: DeskLayout.space8) {
                Image(systemName: "doc.text")
                    .foregroundStyle(DeskTheme.textTertiary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("الخبر المرتبط")
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textTertiary)
                    Text(article.title ?? article.url ?? "")
                        .deskText(DeskType.excerpt)
                        .foregroundStyle(DeskTheme.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
        .disabled(article.url == nil)
    }

    @ViewBuilder
    private func statusBlock(_ post: StaffSocialPost) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            HStack(spacing: DeskLayout.space8) {
                Text("الحالة")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textTertiary)
                StatusPill(title: post.status.title, tint: post.status.tint)
            }
            if post.status == .scheduled, let at = post.scheduledAt {
                Text("مجدولة: \(RiyadhTime.displayString(at)) بتوقيت الرياض")
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
            }
            if post.status == .published {
                if let at = post.publishedAt {
                    Text("نُشرت: \(RiyadhTime.displayString(at))")
                        .deskText(DeskType.excerpt)
                        .foregroundStyle(DeskTheme.textSecondary)
                }
                if let raw = post.externalPostUrl, let url = URL(string: raw) {
                    Link("فتح التغريدة على X", destination: url)
                        .deskText(DeskType.metaEmphasis)
                }
            }
            if post.status == .failed, let error = post.lastError, !error.isEmpty {
                ErrorLine(message: error)
            }
        }
    }

    private func actionBar(_ actions: SocialActionSet, preview: StaffSocialPreview) -> some View {
        VStack(spacing: DeskLayout.space8) {
            if let notice {
                Label(notice, systemImage: "checkmark.circle")
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.success)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            if let actionError { ErrorLine(message: actionError) }
            if !preview.valid {
                ErrorLine(message: "النص أطول من حد X؛ لا يمكن نشره كما هو")
            }
            if actions.publish {
                Button { confirmPublish = true } label: { busyLabel("انشر الآن", busy: busyAction == .publish) }
                    .buttonStyle(DeskPrimaryButtonStyle())
                    .disabled(busyAction != nil || !preview.valid)
            }
            if actions.schedule || actions.reject {
                HStack(spacing: DeskLayout.space8) {
                    if actions.schedule {
                        Button { showSchedule = true } label: { busyLabel("جدولة", busy: busyAction == .schedule) }
                            .buttonStyle(DeskSecondaryButtonStyle())
                            .disabled(busyAction != nil || !preview.valid)
                    }
                    if actions.reject {
                        Button { showReject = true } label: { busyLabel("رفض", busy: busyAction == .reject) }
                            .buttonStyle(DeskSecondaryButtonStyle(destructive: true))
                            .disabled(busyAction != nil)
                    }
                }
            }
        }
        .padding(.horizontal, DeskLayout.pageMargin)
        .padding(.vertical, DeskLayout.space8)
        .background(.bar)
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

/// The tweet as X will show it: composed text, link, media, and the
/// weighted character count against the 280 limit.
private struct TweetPreview: View {
    let preview: StaffSocialPreview

    private var images: [URL] {
        let urls = (preview.mediaKind == "image" ? preview.mediaUrls ?? [] : []) + [preview.imageUrl].compactMap { $0 }
        var seen = Set<String>()
        return urls.filter { seen.insert($0).inserted }.compactMap(URL.init(string:)).prefix(4).map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            Text(preview.composedText)
                .deskText(DeskType.body)
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
                            .frame(width: images.count == 1 ? 300 : 200, height: 170)
                            .clipShape(RoundedRectangle(cornerRadius: DeskRadius.small))
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
                LTRText(text: "\(preview.weightedLength)/\(preview.maxLength)",
                        role: DeskType.meta,
                        color: preview.valid ? DeskTheme.textTertiary : DeskTheme.danger)
            }
        }
        .padding(DeskLayout.space16)
        .background(DeskTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: DeskRadius.medium))
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
