import Foundation
import SwiftUI

// On-device batching queue for loyalty events. Writes pending events to
// a JSON file in the app's Documents directory so they survive crashes
// and force-quits. Flushes every 30s on a timer, on
// applicationWillResignActive, and once when the queue grows past 50.
// All work serialized through the actor so callers can fire-and-forget
// from any context. Failures keep the batch on disk and retry on the
// next flush.
actor LoyaltyEventQueue {
    static let shared = LoyaltyEventQueue()

    private struct Persisted: Codable {
        var events: [LoyaltyEventPayload]
    }

    private let flushIntervalSeconds: TimeInterval = 30
    private let maxQueueBeforeFlush = 50

    private var pending: [LoyaltyEventPayload] = []
    private var flushTask: Task<Void, Never>?
    private var consecutiveFailures = 0

    nonisolated static var fileURL: URL {
        FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("sabq-loyalty-queue.json")
    }

    init() {
        // Read pending events synchronously so the queue is ready the
        // first time enqueue() is called. The disk path is static so
        // we can touch it from this nonisolated init without violating
        // Swift 6 actor isolation. A corrupt file produces an empty
        // queue rather than a crash.
        if let data = try? Data(contentsOf: Self.fileURL),
           let decoded = try? JSONDecoder().decode(Persisted.self, from: data) {
            pending = decoded.events
        }
    }

    // Public entry — call from anywhere (article view, like toggle, etc.).
    func enqueue(_ event: LoyaltyEventPayload) {
        pending.append(event)
        saveToDisk()
        startFlushLoopIfNeeded()
        if pending.count >= maxQueueBeforeFlush {
            Task { await flush() }
        }
    }

    // Convenience: most calls only need action+source+articleId.
    func enqueue(action: LoyaltyAction, articleId: String? = nil, duration: Int? = nil) {
        let source: String? = articleId.map { "article:\($0)" }
        enqueue(LoyaltyEventPayload(
            action: action, source: source, articleId: articleId, duration: duration
        ))
    }

    func flushNow() async {
        await flush()
    }

    // MARK: - Internals

    private func startFlushLoopIfNeeded() {
        guard flushTask == nil else { return }
        flushTask = Task { [weak self] in
            while !(Task.isCancelled) {
                try? await Task.sleep(nanoseconds: UInt64(30 * 1_000_000_000))
                await self?.flush()
            }
        }
    }

    private func flush() async {
        guard !pending.isEmpty else { return }
        // Slice the first 50 to keep request size bounded; the rest
        // stay in `pending` and ride the next flush.
        let batch = Array(pending.prefix(maxQueueBeforeFlush))

        do {
            _ = try await APIClient.shared.submitLoyaltyEvents(batch)
            // Success: drop the flushed slice + reset backoff.
            pending.removeFirst(min(batch.count, pending.count))
            saveToDisk()
            consecutiveFailures = 0
        } catch {
            consecutiveFailures += 1
            // Exponential backoff: 1s, 2s, 4s, 8s, … capped at 30s.
            let backoff = min(30, pow(2.0, Double(consecutiveFailures - 1)))
            try? await Task.sleep(nanoseconds: UInt64(backoff * 1_000_000_000))
        }
    }

    private func saveToDisk() {
        let snapshot = Persisted(events: pending)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: Self.fileURL, options: Data.WritingOptions.atomic)
    }
}
