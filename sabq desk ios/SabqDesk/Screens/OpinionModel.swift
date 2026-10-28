import Foundation
import Observation
import SabqDeskKit

/// «جهّز وجدول» (automatic preparation) is a later phase. While false the
/// button stays disabled with «التجهيز الآلي قريبًا» under it; when true it
/// calls `POST /opinion/:id/prepare` (which still answers 501 today).
enum OpinionFeatureFlags {
    static let autoPrepEnabled = false
}

/// Loads the «الرأي» week board and keeps the deep-linked article in view.
@Observable
final class OpinionModel {
    private(set) var board: StaffOpinionBoard?
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    /// A deep-linked article that is not on this week's board (shown on top).
    private(set) var linked: StaffOpinionItem?

    private let client: StaffAPIClient
    private let onError: (Error) -> Bool

    init(client: StaffAPIClient, onError: @escaping (Error) -> Bool) {
        self.client = client
        self.onError = onError
    }

    var hasLoaded: Bool { board != nil }

    func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            board = try await client.opinionBoard()
            errorMessage = nil
            if let linked, board?.item(articleID: linked.article?.id ?? "") != nil {
                self.linked = nil
            }
        } catch {
            if !onError(error) {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    /// Makes sure `articleID` can be shown: on the board, or fetched alone.
    func ensureVisible(articleID: String) async {
        if board?.item(articleID: articleID) != nil { return }
        do {
            linked = try await client.opinionItem(id: articleID).item
        } catch {
            if !onError(error) {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    func clearLinked() {
        linked = nil
    }
}
