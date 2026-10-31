import Foundation
import Testing
@testable import sabq

/// يقيس أقصى عدد مهام متزامنة داخل BoundedConcurrency.
private actor ConcurrencyProbe {
    private(set) var current = 0
    private(set) var peak = 0
    private(set) var completionOrder: [Int] = []

    func enter() { current += 1; peak = max(peak, current) }
    func leave(_ index: Int) { current -= 1; completionOrder.append(index) }
}

private struct FakeUploadFailure: Error {}

struct AlbumUploadQueueTests {
    @Test func boundedMapNeverExceedsLimitAndKeepsInputOrder() async {
        let probe = ConcurrencyProbe()
        // الأولى أبطأ؛ تكتمل الأخيرة قبلها لكن النتائج تعود بترتيب الإدخال.
        let delays: [UInt64] = [60, 10, 40, 5, 30, 20, 1]
        let results = await BoundedConcurrency.map(Array(delays.indices), limit: 3) { index in
            await probe.enter()
            try? await Task.sleep(nanoseconds: delays[index] * 1_000_000)
            await probe.leave(index)
            return "url-\(index)"
        }
        let urls = results.compactMap { result -> String? in try? result.get() }
        #expect(urls == delays.indices.map { "url-\($0)" })
        #expect(await probe.peak <= 3)
        #expect(await probe.peak >= 2)
        #expect(await probe.completionOrder != Array(delays.indices))
    }

    @Test func boundedMapReportsEveryFailureWithItsIndex() async {
        actor Seen { var items: [(Int, Bool)] = []; func add(_ i: Int, _ ok: Bool) { items.append((i, ok)) } }
        let seen = Seen()
        let results = await BoundedConcurrency.map([0, 1, 2, 3, 4], limit: 2, onResult: { index, result in
            await seen.add(index, (try? result.get()) != nil)
        }) { index -> Int in
            if index.isMultiple(of: 2) { throw FakeUploadFailure() }
            return index
        }
        #expect(results.count == 5)
        let succeeded = results.map { result -> Bool in (try? result.get()) != nil }
        #expect(succeeded == [false, true, false, true, false])
        let reported = await seen.items
        #expect(reported.count == 5)
        #expect(Set(reported.map(\.0)) == [0, 1, 2, 3, 4])
    }

    @Test func queueKeepsSelectionOrderRegardlessOfCompletionOrder() {
        var queue = AlbumUploadQueue()
        let ids = queue.enqueue(count: 3, limit: 10)
        #expect(queue.uploadingCount == 3)
        queue.apply(ids[2], .uploaded(url: "c"))
        queue.apply(ids[0], .uploaded(url: "a"))
        queue.apply(ids[1], .uploaded(url: "b"))
        #expect(queue.uploadedURLs == ["a", "b", "c"])
        #expect(queue.uploadingCount == 0)
    }

    @Test func failedSlotStaysVisibleUntilRetriedOrRemoved() {
        var queue = AlbumUploadQueue()
        let ids = queue.enqueue(count: 3, limit: 10)
        queue.apply(ids[0], .uploaded(url: "a"))
        queue.apply(ids[1], .failed("تعذر قراءة الصورة من المكتبة"))
        queue.apply(ids[2], .uploaded(url: "c"))
        #expect(queue.failedCount == 1)
        #expect(queue.slots.count == 3)
        #expect(queue.uploadedURLs == ["a", "c"])

        // إعادة المحاولة تعيدها إلى مكانها الأصلي لا إلى آخر القائمة.
        let retried = queue.markUploading(ids[1])
        #expect(retried)
        #expect(queue.failedCount == 0)
        queue.apply(ids[1], .uploaded(url: "b"))
        #expect(queue.uploadedURLs == ["a", "b", "c"])
        let reuploadedDone = queue.markUploading(ids[0])
        #expect(reuploadedDone == false)

        queue.remove(ids[0])
        #expect(queue.uploadedURLs == ["b", "c"])
    }

    @Test func enqueueRespectsTheAlbumLimit() {
        var queue = AlbumUploadQueue()
        let first = queue.enqueue(count: 8, limit: 10)
        let second = queue.enqueue(count: 5, limit: 10)
        let third = queue.enqueue(count: 1, limit: 10)
        #expect(first.count == 8)
        #expect(second.count == 2)
        #expect(third.isEmpty)
        #expect(queue.slots.count == 10)
    }
}
