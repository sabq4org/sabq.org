import SwiftUI
import UIKit

/// Shared sharing & link-copy logic used by ArticleDetailView, OpinionDetailView,
/// ArticleLiteView and Muqtarab.
///
/// كل ورقة مشاركة في التطبيق تمرّ من هنا حتى تحصل على تثبيت الـ popover
/// (iPad وiPhone Duo مفتوحًا يقدّمانها كـ popover، وبلا مرساة ينهار التطبيق)
/// وعلى التقديم فوق أعلى متحكم معروض بدل الجذر (حتى لا تُرفض فوق ورقة مفتوحة).
@MainActor
enum SabqShareHelper {
    static func presentShareSheet(with url: URL, title: String? = nil, completion: ((Bool) -> Void)? = nil) {
        var items: [Any] = []
        if let title, !title.isEmpty { items.append(title) }
        items.append(url)
        let av = UIActivityViewController(activityItems: items, applicationActivities: nil)
        av.completionWithItemsHandler = { _, completed, _, _ in completion?(completed) }
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene }).first,
              let root = scene.windows.first?.rootViewController else { return }
        var presenter: UIViewController = root
        while let next = presenter.presentedViewController { presenter = next }
        // Handle iPad / iPhone Duo popover
        if let popover = av.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        presenter.present(av, animated: true)
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
