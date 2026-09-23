import Foundation
import SwiftUI

// عميل البث الحي (SSE) لسبق — نفس مسار VARA: اتصال واحد على
// `GET /api/sports/live-stream` يستقبل موجز المباريات الجارية (~2ث).
// الشاشات تراقب `stamps["w:<id>"]` أو `wcVersion` وتجلب التفاصيل فورًا.
// الاستطلاع الدوري يبقى شبكة أمان عند انقطاع البث.
@MainActor
@Observable
final class SabqLiveStream {
    static let shared = SabqLiveStream()

    /// ختم لكل مباراة حية. المباراة التي تغادر الموجز (انتهت) تُثبَّت على -1.
    private(set) var stamps: [String: Int] = [:]
    private(set) var sportsVersion = 0
    private(set) var wcVersion = 0
    private(set) var connected = false
    private(set) var subscriberCount = 0

    private var task: Task<Void, Never>?
    private var isAppActive: Bool
    private let session: URLSession
    private var sessionID: UInt = 0
    private var activeSessionID: UInt?

    init(isAppActive: Bool = true, session: URLSession = .shared) {
        self.isAppActive = isAppActive
        self.session = session
    }

    /// Keep the stream alive while at least one visible sports surface needs it.
    /// Each acquire must be paired with release by the owning view/task.
    func acquire() {
        subscriberCount += 1
        startIfNeeded()
    }

    /// Release one visible consumer. Extra releases are ignored so a cancelled
    /// SwiftUI task cannot drive the shared reference count below zero.
    func release() {
        guard subscriberCount > 0 else { return }
        subscriberCount -= 1
        if subscriberCount == 0 {
            cancelCurrentSession()
        }
    }

    /// Scene lifecycle gate. Background/inactive scenes cancel the request;
    /// returning to active starts one fresh session if a consumer remains.
    func setAppActive(_ active: Bool) {
        isAppActive = active
        if active {
            startIfNeeded()
        } else {
            cancelCurrentSession()
        }
    }

    private func startIfNeeded() {
        guard isAppActive, subscriberCount > 0, activeSessionID == nil else { return }
        sessionID &+= 1
        let id = sessionID
        activeSessionID = id
        task = Task { await run(sessionID: id) }
    }

    private func cancelCurrentSession() {
        // Invalidate before cancelling so an old URLSession continuation cannot
        // publish `connected = false` after a newer session has started.
        activeSessionID = nil
        task?.cancel()
        task = nil
        connected = false
    }

    private func isCurrent(_ id: UInt) -> Bool {
        activeSessionID == id && isAppActive && subscriberCount > 0
    }

    private func run(sessionID id: UInt) async {
        var backoff: TimeInterval = 1
        while !Task.isCancelled, isCurrent(id) {
            var retryAfter: TimeInterval?
            do {
                guard let url = URL(string: URLConstants.publicAPI + "/sports/live-stream") else { break }
                var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
                req.timeoutInterval = 3600
                req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                let (bytes, response) = try await session.bytes(for: req)
                guard let http = response as? HTTPURLResponse else {
                    throw URLError(.badServerResponse)
                }
                guard http.statusCode == 200 else {
                    throw StreamHTTPError(
                        retryAfter: Self.retryAfterSeconds(http.value(forHTTPHeaderField: "Retry-After"))
                    )
                }
                guard isCurrent(id) else { return }
                connected = true
                backoff = 1
                for try await line in bytes.lines {
                    guard !Task.isCancelled, isCurrent(id) else { return }
                    guard line.hasPrefix("data:") else { continue }
                    apply(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
                }
            } catch let error as StreamHTTPError {
                retryAfter = error.retryAfter
            } catch is CancellationError {
                break
            } catch {
                // انقطاع — إعادة اتصال بتراجع.
            }
            guard !Task.isCancelled, isCurrent(id) else { break }
            connected = false
            let delay = Self.retryDelaySeconds(
                base: backoff,
                retryAfter: retryAfter,
                randomUnit: Double.random(in: 0..<1)
            )
            do {
                try await Task.sleep(nanoseconds: Self.nanoseconds(for: delay))
            } catch {
                break
            }
            backoff = min(backoff * 2, 15)
        }

        if activeSessionID == id {
            activeSessionID = nil
            task = nil
            connected = false
            // A normal stream termination should recover while the consumer is
            // still visible. Explicit cancellation already cleared the session.
            startIfNeeded()
        }
    }

    nonisolated static func retryAfterSeconds(_ value: String?, now: Date = Date()) -> TimeInterval? {
        guard let raw = value?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }
        if let seconds = TimeInterval(raw), seconds.isFinite {
            return min(max(0, seconds), 86_400)
        }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        guard let date = formatter.date(from: raw) else { return nil }
        return min(max(0, date.timeIntervalSince(now)), 86_400)
    }

    nonisolated static func retryDelaySeconds(
        base: TimeInterval,
        retryAfter: TimeInterval?,
        randomUnit: Double
    ) -> TimeInterval {
        let unit = min(max(randomUnit, 0), 1)
        let safeBase = base.isFinite ? max(0, base) : 0
        let serverMinimum = retryAfter?.isFinite == true ? max(0, retryAfter!) : 0
        // Retry-After is a floor, not the complete schedule. A bounded spread
        // keeps clients from reconnecting in one synchronized second while
        // still honoring the server's requested quiet period.
        return max(safeBase, serverMinimum) + unit * min(safeBase, 5)
    }

    private static func nanoseconds(for seconds: TimeInterval) -> UInt64 {
        let clamped = min(max(seconds.isFinite ? seconds : 0, 0), 86_400)
        return UInt64((clamped * 1_000_000_000).rounded())
    }

    private func apply(_ json: String) {
        guard let data = json.data(using: .utf8),
              let digest = try? JSONDecoder().decode(SabqLiveDigest.self, from: data) else { return }

        var fresh: [String: Int] = [:]
        for item in digest.items { fresh[item.k] = item.hashValue }
        for (k, v) in stamps where fresh[k] == nil && v != -1 { fresh[k] = -1 }

        let previous = stamps
        let sportsChanged = subset(fresh, "s:") != subset(previous, "s:")
        let wcChanged = subset(fresh, "w:") != subset(previous, "w:")
        stamps = fresh
        if sportsChanged { sportsVersion &+= 1 }
        if wcChanged { wcVersion &+= 1 }
    }

    private func subset(_ dict: [String: Int], _ prefix: String) -> [String: Int] {
        dict.filter { $0.key.hasPrefix(prefix) }
    }
}

private struct StreamHTTPError: Error {
    let retryAfter: TimeInterval?
}

nonisolated struct SabqLiveDigestItem: Decodable, Hashable {
    let k: String
    let gh: Int
    let ga: Int
    let st: String
    let el: Int?
    let ex: Int?
    let liv: Bool
    let fin: Bool
    let cs: Double?
}

nonisolated struct SabqLiveDigest: Decodable {
    let v: Int
    let items: [SabqLiveDigestItem]
}
