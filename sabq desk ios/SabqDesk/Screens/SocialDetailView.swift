import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// One tweet proposal: who sent it, the tweet as X will show it, its state,
/// and the decisions the member may take.
struct SocialDetailView: View {
    @Environment(AppModel.self) private var app
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
    /// The linked article, opened inside the app.
    @State private var webPage: DeskWebPage?

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
        .fullScreenCover(item: $webPage) { page in
            SafariView(url: page.url).ignoresSafeArea()
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
                statusCard(post)
                sender(detail)
                TweetBody(preview: detail.preview, showsCount: post.status.isActionable,
                          muted: post.status == .canceled)
                if let article = detail.article, !repeatsTweet(article, preview: detail.preview) {
                    articleRow(article)
                }
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
            SenderAvatar(name: name, kind: kind, imageURL: detail.sender?.avatarUrl, size: 44)
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
            if let url = DeskAvatarURL.https(article.url) { webPage = DeskWebPage(url: url) }
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
        .disabled(DeskAvatarURL.https(article.url) == nil)
        .accessibilityHint("يفتح الخبر داخل التطبيق")
    }

    private func repeatsTweet(_ article: StaffArticleRef, preview: StaffSocialPreview) -> Bool {
        guard let title = article.title, !title.isEmpty else { return false }
        return DeskPreviewText.repeats(title, in: preview.text ?? preview.composedText)
    }

    /// Where the post stands, first on the page: the decision and its reason.
    @ViewBuilder
    private func statusCard(_ post: StaffSocialPost) -> some View {
        let decidedAt = RiyadhTime.displayString(post.updatedAt ?? post.createdAt)
        switch post.status {
        case .scheduled:
            if let at = post.scheduledAt {
                StatusCard(systemImage: "calendar", tone: .info, title: "مجدولة للنشر",
                           meta: (["\(RiyadhTime.displayString(at)) بتوقيت الرياض"]
                                  + [RiyadhTime.countdown(to: at)].compactMap { $0 }).joined(separator: " · "))
            }
        case .published:
            StatusCard(systemImage: "checkmark", tone: .success, title: "نُشرت على X",
                       meta: post.publishedAt.map(RiyadhTime.displayString),
                       link: post.externalPostUrl.flatMap(URL.init(string:)).map { ("افتح التغريدة على X", $0) })
        case .canceled:
            switch DeskRejectionNote(canceledBySelf: post.canceledBySelf ?? detail?.canceledBySelf, reason: post.lastError) {
            case .reason(let reason):
                StatusCard(systemImage: "xmark", tone: .danger, title: "رُفض هذا المقترح", meta: decidedAt,
                           detailLabel: "السبب", detail: reason)
            case .noReason:
                StatusCard(systemImage: "xmark", tone: .neutral, title: "رُفض دون تسجيل سبب",
                           meta: "من لوحة التحرير · \(decidedAt)")
            case .withdrawn:
                StatusCard(systemImage: "arrow.uturn.backward", tone: .neutral,
                           title: DeskRejectionNote.withdrawn.text, meta: decidedAt)
            }
        case .failed:
            StatusCard(systemImage: "exclamationmark", tone: .danger, title: "فشلت محاولة النشر", meta: decidedAt,
                       detailLabel: "الخطأ", detail: post.lastError)
        case .processing:
            StatusCard(systemImage: "paperplane", tone: .info, title: "قيد النشر الآن…", meta: nil)
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

    private func reject(_ reason: String) async {
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

/// The post's state at the top of the page: a tinted card with a round
/// symbol, the state and when, then the reason or error under a hairline.
private struct StatusCard: View {
    let systemImage: String
    let tone: DeskTone
    let title: String
    let meta: String?
    var detailLabel: String?
    var detail: String?
    var link: (title: String, url: URL)?

    private var ink: Color { tone == .neutral ? DeskTheme.textTertiary : tone.ink }

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            HStack(spacing: DeskLayout.space12) {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(ink)
                    .frame(width: 36, height: 36)
                    .background(DeskTheme.surface, in: Circle())
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .deskText(DeskTextRole(size: 17, weight: .bold, style: .headline, lineSpacing: 0))
                        .foregroundStyle(tone == .neutral ? DeskTheme.textPrimary : ink)
                    if let meta, !meta.isEmpty {
                        Text(meta)
                            .deskText(DeskType.meta)
                            .foregroundStyle(DeskTheme.textSecondary)
                    }
                }
                Spacer(minLength: 0)
            }
            if let detail, !detail.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    if let detailLabel {
                        Text(detailLabel)
                            .deskText(DeskType.tag)
                            .foregroundStyle(ink)
                    }
                    Text(detail)
                        .deskText(DeskType.rowTitle)
                        .foregroundStyle(DeskTheme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                        .textSelection(.enabled)
                }
                .padding(.top, DeskLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { Rectangle().fill(ink.opacity(0.2)).frame(height: 1) }
            }
            if let link {
                Link(link.title, destination: link.url)
                    .deskText(DeskType.metaEmphasis)
                    .foregroundStyle(DeskInk.link)
            }
        }
        .padding(DeskLayout.cardInset)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tone == .neutral ? DeskInk.chip : tone.fill,
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// The tweet as X will show it: text with links in link blue, media, and
/// the weighted count while the post can still go out.
private struct TweetBody: View {
    let preview: StaffSocialPreview
    var showsCount = true
    /// A rejected post: a step lighter than a live one.
    var muted = false

    private var linkedText: AttributedString {
        let text = preview.composedText
        var result = AttributedString(text)
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return result
        }
        for match in detector.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
            guard let range = Range(match.range, in: text), let run = Range(range, in: result) else { continue }
            result[run].foregroundColor = DeskInk.link
        }
        return result
    }

    private var images: [URL] {
        let urls = (preview.mediaKind == "image" ? preview.mediaUrls ?? [] : []) + [preview.imageUrl].compactMap { $0 }
        var seen = Set<String>()
        return urls.filter { seen.insert($0).inserted }.compactMap(URL.init(string:)).prefix(4).map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            Text(linkedText)
                .font(DeskFonts.app(size: 17, weight: .regular))
                .lineSpacing(6)
                .foregroundStyle(muted ? DeskTheme.textSecondary : DeskTheme.textPrimary)
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
            if showsCount {
                HStack {
                    Spacer()
                    LTRText(text: "\(preview.weightedLength) / \(preview.maxLength)",
                            role: DeskType.meta,
                            color: preview.valid ? DeskTheme.textSecondary : DeskTheme.danger)
                }
            }
        }
    }
}

/// The publish log, always visible: one white group, a dot per attempt
/// (green when it went out, amber when it did not), newest first.
private struct AttemptsList: View {
    let attempts: [StaffSocialAttempt]

    private static func succeeded(_ attempt: StaffSocialAttempt) -> Bool {
        ["succeeded", "success", "published", "ok"].contains(attempt.outcome ?? "")
    }

    private static func failed(_ attempt: StaffSocialAttempt) -> Bool {
        ["failed", "error"].contains(attempt.outcome ?? "") || attempt.errorCode != nil || attempt.errorMessage != nil
    }

    private static func outcomeText(_ attempt: StaffSocialAttempt) -> String {
        if succeeded(attempt) { return "نُشرت" }
        if failed(attempt) { return "تعذرت" }
        return attempt.outcome ?? attempt.phase ?? "—"
    }

    var body: some View {
        let ordered = attempts.sorted { $0.createdAt > $1.createdAt }
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            Text("سجل النشر")
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textSecondary)
                .padding(.horizontal, 4)
            VStack(spacing: 0) {
                ForEach(Array(ordered.enumerated()), id: \.element.id) { index, attempt in
                    HStack(alignment: .firstTextBaseline, spacing: DeskLayout.space12) {
                        Circle()
                            .fill(Self.succeeded(attempt) ? DeskTheme.success
                                  : Self.failed(attempt) ? DeskTheme.warning : DeskTheme.textTertiary)
                            .frame(width: 10, height: 10)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("المحاولة \(ordered.count - index) · \(Self.outcomeText(attempt))")
                                .deskText(DeskType.rowTitle)
                                .foregroundStyle(DeskTheme.textPrimary)
                            if let message = attempt.errorMessage ?? attempt.errorCode, !message.isEmpty {
                                Text(message)
                                    .deskText(DeskType.meta)
                                    .foregroundStyle(DeskTheme.textTertiary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .textSelection(.enabled)
                            }
                        }
                        Spacer(minLength: 0)
                        Text(verbatim: RiyadhTime.shortString(attempt.createdAt))
                            .deskText(DeskType.timestamp)
                            .foregroundStyle(DeskTheme.textTertiary)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .overlay(alignment: .bottom) {
                        if index < ordered.count - 1 {
                            Rectangle().fill(DeskInk.hairline).frame(height: 1)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .background(DeskCardBackground(radius: 22))
        }
    }
}
