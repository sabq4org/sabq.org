import XCTest
import SwiftUI
import UIKit
@testable import sabq

final class AdminScheduleSnapshotTests: XCTestCase {
    @MainActor
    func testRenderOpinionScheduleCardsInArabic() async throws {
        let now = Date()
        let next = now.addingTimeInterval(3 * 24 * 60 * 60)
        let past = now.addingTimeInterval(-7 * 24 * 60 * 60)
        let scenarios: [(String, String, Date?, Bool)] = [
            ("writer-next-slot", "draft", nil, true),
            ("writer-overdue", "draft", past, true),
            ("writer-no-slot", "draft", nil, false),
            ("actual-scheduled", "scheduled", next, true),
        ]
        for (name, status, saved, hasSlot) in scenarios {
            var json: [String: Any] = [
                "id": name, "title": "مقال رأي تجريبي للتحقق من موعد النشر",
                "articleType": "opinion", "status": status, "authorId": "fixture-writer",
                "author": "كاتب تجريبي", "updatedAt": SabqFormatters.iso8601Basic.string(from: now),
                "views": 0,
            ]
            if let saved { json["scheduledAt"] = SabqFormatters.iso8601Basic.string(from: saved) }
            if hasSlot {
                json["writerWeeklySlot"] = [
                    "weekday": 6, "publishTime": "06:00",
                    "nextSlot": SabqFormatters.iso8601Basic.string(from: next),
                ]
            }
            let item = try JSONDecoder().decode(AdminNewsItem.self, from: JSONSerialization.data(withJSONObject: json))
            try await capture(
                AdminNewsRow(item: item, isPublishing: false, onPublish: {})
                    .padding(16)
                    .frame(width: 390)
                    .background(SabqTheme.background)
                    .environment(\.layoutDirection, .rightToLeft)
                    .environment(\.colorScheme, .light),
                name: name
            )
        }
    }

    @MainActor
    func testRenderEditableNextWriterSlot() async throws {
        let now = Date()
        let next = now.addingTimeInterval(3 * 86400)
        let json: [String: Any] = [
            "id": "editor-fixture", "title": "مقال رأي تجريبي", "status": "draft",
            "articleType": "opinion", "authorId": "fixture-writer",
            "scheduledAt": SabqFormatters.iso8601Basic.string(from: now.addingTimeInterval(-7 * 86400)),
            "writerWeeklySlot": ["weekday": 6, "publishTime": "06:00", "nextSlot": SabqFormatters.iso8601Basic.string(from: next)],
        ]
        let detail = try JSONDecoder().decode(AdminArticleDetail.self, from: JSONSerialization.data(withJSONObject: json))
        let vm = AdminEditorViewModel(articleId: "editor-fixture", service: FakeAdminService(detail: detail))
        await vm.load(includeCategories: false)
        vm.setStatus(.scheduled, now: now)
        XCTAssertEqual(vm.scheduledAt, detail.writerWeeklySlot?.nextSlot)
        try await capture(
            AdminPublishingOptions(vm: vm)
                .padding(20)
                .frame(width: 390)
                .background(SabqTheme.surface)
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.colorScheme, .light),
            name: "editor-overdue-to-next-slot"
        )
    }

    @MainActor
    private func capture<V: View>(_ content: V, name: String) async throws {
        let host = UIHostingController(rootView: content)
        host.safeAreaRegions = []
        let size = host.sizeThatFits(in: CGSize(width: 390, height: 2000))
        XCTAssertGreaterThan(size.height, 180)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(origin: .zero, size: size)
        window.rootViewController = host
        window.windowLevel = .alert + 1
        window.isHidden = false
        defer { window.isHidden = true }
        host.view.frame = CGRect(origin: .zero, size: size)
        host.view.layoutIfNeeded()
        try await Task.sleep(nanoseconds: 150_000_000)
        let image = UIGraphicsImageRenderer(size: size).image { _ in
            host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

}
