import Foundation
import Testing
@testable import sabq

/// يرصد عدد الرفعات الجارية فعلًا وأقصاه.
@MainActor
private final class UploadProbe {
    var active = 0
    var peak = 0
    var attempts: [UUID: Int] = [:]
}

@MainActor
private func waitUntil(timeout: Double = 5, _ condition: () -> Bool) async {
    let deadline = Date().addingTimeInterval(timeout)
    while !condition() && Date() < deadline {
        try? await Task.sleep(nanoseconds: 2_000_000)
    }
}

@MainActor
struct AlbumUploadQueueTests {
    @Test func batchNeverExceedsLimitAndKeepsSelectionOrder() async {
        let uploader = AlbumUploader(limit: 3)
        let probe = UploadProbe()
        let ids = uploader.add(count: 7, cap: 10)
        // الأولى أبطأ؛ تكتمل غيرها قبلها لكن الروابط تعود بترتيب الاختيار.
        let delays: [UInt64] = [60, 10, 40, 5, 30, 20, 1]
        uploader.perform = { id in
            let index = ids.firstIndex(of: id)!
            probe.active += 1
            probe.peak = max(probe.peak, probe.active)
            try? await Task.sleep(nanoseconds: delays[index] * 1_000_000)
            probe.active -= 1
            return .uploaded(url: "url-\(index)")
        }
        uploader.start()
        #expect(uploader.queue.activeCount == 3)
        await waitUntil { uploader.queue.uploadingCount == 0 }
        #expect(uploader.queue.uploadedURLs == ids.indices.map { "url-\($0)" })
        #expect(probe.peak == 3)
    }

    @Test func retryDuringActiveBatchSharesTheSameCap() async {
        let uploader = AlbumUploader(limit: 3)
        let probe = UploadProbe()
        let ids = uploader.add(count: 6, cap: 10)
        var release = false
        uploader.perform = { id in
            probe.attempts[id, default: 0] += 1
            probe.active += 1
            probe.peak = max(probe.peak, probe.active)
            defer { probe.active -= 1 }
            // الأولى تفشل فورًا في المحاولة الأولى؛ البقية تبقى جارية حتى نسمح لها.
            if id == ids[0] && probe.attempts[id] == 1 { return .failed("تعذر رفع الصورة") }
            while !release { try? await Task.sleep(nanoseconds: 2_000_000) }
            return .uploaded(url: "url-\(ids.firstIndex(of: id)!)")
        }
        uploader.start()
        await waitUntil { uploader.queue.failedCount == 1 && uploader.queue.activeCount == 3 }
        #expect(uploader.queue.activeCount == 3)

        // إعادة المحاولة والدفعة ما زالت جارية: تنتظر دورها ولا تفتح رفعًا رابعًا.
        uploader.retry(ids[0])
        #expect(uploader.queue.slots[0].phase == .waiting)
        #expect(uploader.queue.activeCount == 3)
        try? await Task.sleep(nanoseconds: 30_000_000)
        #expect(probe.peak == 3)

        release = true
        await waitUntil { uploader.queue.uploadingCount == 0 }
        #expect(probe.peak == 3)
        #expect(probe.attempts[ids[0]] == 2)
        #expect(uploader.queue.failedCount == 0)
        #expect(uploader.queue.uploadedURLs == ids.indices.map { "url-\($0)" })
    }

    @Test func queueKeepsSelectionOrderRegardlessOfCompletionOrder() {
        var queue = AlbumUploadQueue()
        let ids = queue.enqueue(count: 3, limit: 10)
        #expect(queue.uploadingCount == 3)
        let started = queue.nextToStart(limit: 3)
        #expect(started == ids)
        queue.apply(ids[2], .uploaded(url: "c"))
        queue.apply(ids[0], .uploaded(url: "a"))
        queue.apply(ids[1], .uploaded(url: "b"))
        #expect(queue.uploadedURLs == ["a", "b", "c"])
        #expect(queue.uploadingCount == 0)
    }

    @Test func nextToStartRespectsActiveCount() {
        var queue = AlbumUploadQueue()
        let ids = queue.enqueue(count: 5, limit: 10)
        let first = queue.nextToStart(limit: 3)
        let none = queue.nextToStart(limit: 3)
        #expect(first == Array(ids.prefix(3)))
        #expect(none.isEmpty)
        queue.apply(ids[1], .uploaded(url: "b"))
        let next = queue.nextToStart(limit: 3)
        #expect(next == [ids[3]])
        #expect(queue.activeCount == 3)
    }

    @Test func failedSlotStaysVisibleUntilRetriedOrRemoved() {
        var queue = AlbumUploadQueue()
        let ids = queue.enqueue(count: 3, limit: 10)
        _ = queue.nextToStart(limit: 3)
        queue.apply(ids[0], .uploaded(url: "a"))
        queue.apply(ids[1], .failed("تعذر قراءة الصورة من المكتبة"))
        queue.apply(ids[2], .uploaded(url: "c"))
        #expect(queue.failedCount == 1)
        #expect(queue.slots.count == 3)
        #expect(queue.uploadedURLs == ["a", "c"])

        // إعادة المحاولة تعيدها إلى مكانها الأصلي لا إلى آخر القائمة.
        let retried = queue.requestUpload(ids[1])
        #expect(retried)
        #expect(queue.failedCount == 0)
        let restarted = queue.nextToStart(limit: 3)
        #expect(restarted == [ids[1]])
        queue.apply(ids[1], .uploaded(url: "b"))
        #expect(queue.uploadedURLs == ["a", "b", "c"])
        let reuploadedDone = queue.requestUpload(ids[0])
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
