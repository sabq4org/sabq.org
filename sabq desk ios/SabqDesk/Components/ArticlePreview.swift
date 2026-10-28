import SabqDeskDesign
import SabqDeskKit
import SafariServices
import SwiftUI

/// The published page inside the app (Safari view, reader cookies kept apart
/// from the desk session). Used for «استعراض المقال» after publishing.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let configuration = SFSafariViewController.Configuration()
        configuration.barCollapsingEnabled = true
        let controller = SFSafariViewController(url: url, configuration: configuration)
        controller.preferredControlTintColor = UIColor(DeskInk.link)
        controller.dismissButtonStyle = .close
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// Identifiable wrapper so a URL can drive `.fullScreenCover(item:)`.
struct DeskWebPage: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// «استعراض المقال»: before publishing, the text as readers will see it
/// (title, image, body) read in the app; after publishing, a button opens
/// the live page on sabq.org.
struct OpinionPreviewSheet: View {
    @Environment(AppModel.self) private var app
    @Environment(\.dismiss) private var dismiss

    let articleID: String
    let writerName: String
    /// Shown while the text loads.
    let fallbackTitle: String
    /// A published article opens straight on its live page; closing it
    /// leaves the text here.
    var opensLivePage = false

    @State private var content: StaffOpinionContent?
    @State private var errorText: String?
    @State private var livePage: DeskWebPage?
    @State private var didOpenLivePage = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DeskLayout.space16) {
                    statusBanner
                    if let content {
                        article(content)
                    } else if let errorText {
                        ErrorLine(message: errorText)
                        Button("أعد المحاولة") { Task { await load() } }
                            .buttonStyle(DeskPrimaryButtonStyle())
                    } else {
                        Text(fallbackTitle)
                            .deskText(DeskType.sectionHeading)
                            .foregroundStyle(DeskTheme.textPrimary)
                        HStack { Spacer(); ProgressView(); Spacer() }
                            .padding(.vertical, DeskLayout.space32)
                    }
                }
                .padding(.horizontal, DeskLayout.pageMargin + 4)
                .padding(.top, DeskLayout.space8)
                .padding(.bottom, 120)
            }
            .background(DeskTheme.background)
            .safeAreaInset(edge: .bottom) {
                if let url = content?.publicPageURL {
                    Button {
                        livePage = DeskWebPage(url: url)
                    } label: {
                        Label("افتح الصفحة المنشورة على سبق", systemImage: "safari")
                    }
                    .buttonStyle(DeskPrimaryButtonStyle())
                    .padding(.horizontal, DeskLayout.pageMargin + 4)
                    .padding(.vertical, DeskLayout.space12)
                    .background(.bar)
                }
            }
            .navigationTitle("استعراض المقال")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() } }
            }
            .task { await load() }
            .refreshable { await load() }
        }
        .fullScreenCover(item: $livePage) { page in
            SafariView(url: page.url).ignoresSafeArea()
        }
    }

    // MARK: Parts

    @ViewBuilder
    private var statusBanner: some View {
        if let content {
            let published = content.publicPageURL != nil
            Label(published ? "منشور على سبق · هذا نصه كما يقرؤه القراء"
                            : (content.status == "scheduled" ? "مجدول · لم يُنشر بعد، هكذا سيظهر"
                                                             : "مسودة · لم تُنشر بعد، هكذا ستظهر"),
                  systemImage: published ? "checkmark.seal.fill" : "eye")
                .deskText(DeskType.metaEmphasis)
                .foregroundStyle(published ? DeskTone.success.ink : DeskInk.link)
                .padding(.horizontal, DeskLayout.space12)
                .padding(.vertical, DeskLayout.space8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(published ? DeskTone.success.fill : DeskInk.soft,
                            in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private func article(_ content: StaffOpinionContent) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            HStack(spacing: DeskLayout.space8) {
                if let category = content.category, !category.name.isEmpty {
                    Text(category.name)
                        .deskText(DeskType.tag)
                        .foregroundStyle(DeskInk.link)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(DeskInk.soft, in: Capsule())
                }
                Text(writerName)
                    .deskText(DeskType.meta)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .lineLimit(1)
            }
            Text(content.title)
                .deskText(DeskType.pageTitle)
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if let subtitle = content.subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .deskText(DeskType.excerpt)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let raw = content.imageUrl, let url = DeskAvatarURL.https(raw) {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image.resizable().scaledToFill()
                    } else {
                        DeskTheme.surfaceMuted
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 210)
                .clipShape(RoundedRectangle(cornerRadius: DeskRadius.large, style: .continuous))
                .overlay(alignment: .bottomLeading) {
                    if content.isAiGeneratedImage == true {
                        Text("صورة مولّدة بالذكاء الاصطناعي")
                            .deskText(DeskType.timestamp)
                            .foregroundStyle(Color.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.black.opacity(0.45), in: Capsule())
                            .padding(10)
                    }
                }
                .accessibilityLabel("صورة المقال")
            }
            VStack(alignment: .leading, spacing: 14) {
                let blocks = content.blocks
                if blocks.isEmpty {
                    Text("لا نص في المقال بعد.")
                        .deskText(DeskType.body)
                        .foregroundStyle(DeskTheme.textTertiary)
                }
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    blockView(block)
                }
            }
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(DeskCardBackground(radius: DeskRadius.large))
            .textSelection(.enabled)
        }
    }

    @ViewBuilder
    private func blockView(_ block: StaffArticleBlock) -> some View {
        switch block.kind {
        case .heading:
            Text(block.text)
                .deskText(DeskType.sectionHeading)
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
        case .quote:
            HStack(alignment: .top, spacing: DeskLayout.space12) {
                RoundedRectangle(cornerRadius: 2).fill(DeskInk.action).frame(width: 3)
                Text(block.text)
                    .deskText(DeskType.body)
                    .foregroundStyle(DeskTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .listItem:
            HStack(alignment: .firstTextBaseline, spacing: DeskLayout.space8) {
                Text(verbatim: "•").foregroundStyle(DeskInk.link)
                Text(block.text)
                    .deskText(DeskType.body)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        case .paragraph:
            Text(block.text)
                .deskText(DeskType.body)
                .foregroundStyle(DeskTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func load() async {
        errorText = nil
        do {
            let loaded = try await app.client.opinionContent(id: articleID)
            content = loaded
            if opensLivePage, !didOpenLivePage, let url = loaded.publicPageURL {
                didOpenLivePage = true
                livePage = DeskWebPage(url: url)
            }
        } catch {
            if !app.handle(error) {
                errorText = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}
