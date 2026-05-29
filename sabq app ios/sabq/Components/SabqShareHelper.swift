import SwiftUI
import UIKit

/// Shared sharing & link-copy logic used by ArticleDetailView and OpinionDetailView.
@MainActor
enum SabqShareHelper {
    static func presentShareSheet(with url: URL) {
        let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first,
              let root = scene.windows.first?.rootViewController else { return }
        // Handle iPad popover
        if let popover = av.popoverPresentationController {
            popover.sourceView = root.view
            popover.sourceRect = CGRect(x: root.view.bounds.midX, y: root.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        root.present(av, animated: true)
    }

    static func copyToClipboard(_ url: URL) {
        UIPasteboard.general.string = url.absoluteString
    }

    static func resolveShortlink(articleId: String) async -> URL? {
        guard let shortlink = await NewsService.fetchShortlink(articleId: articleId),
              let url = URL(string: shortlink) else {
            return nil
        }
        return url
    }
}
