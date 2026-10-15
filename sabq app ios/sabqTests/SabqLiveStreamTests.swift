import Foundation
import Testing
@testable import sabq

struct SabqLiveStreamTests {

    @Test func retryAfterDeltaIsParsedAndRespected() {
        #expect(SabqLiveStream.retryAfterSeconds("7", now: Date(timeIntervalSince1970: 0)) == 7)

        let delay = SabqLiveStream.retryDelaySeconds(
            base: 1,
            retryAfter: 7,
            randomUnit: 0
        )
        #expect(delay >= 7)
        #expect(SabqLiveStream.retryDelaySeconds(base: 1, retryAfter: 7, randomUnit: 1) == 8)
    }

    @Test func retryAfterHTTPDateIsParsed() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-09-19T10:00:00Z"))
        let retryAt = "Sat, 19 Sep 2026 10:00:05 GMT"
        #expect(SabqLiveStream.retryAfterSeconds(retryAt, now: now) == 5)
    }

    @Test func jitterStaysWithinExpectedWindowWhenNoServerDelay() {
        #expect(SabqLiveStream.retryDelaySeconds(base: 4, retryAfter: nil, randomUnit: 0) == 4)
        #expect(SabqLiveStream.retryDelaySeconds(base: 4, retryAfter: nil, randomUnit: 1) == 8)
    }

    @Test @MainActor func referenceCountStopsAtZeroAndIgnoresExtraRelease() {
        let stream = SabqLiveStream(isAppActive: false)
        stream.acquire()
        stream.acquire()
        #expect(stream.subscriberCount == 2)

        stream.release()
        #expect(stream.subscriberCount == 1)
        stream.release()
        stream.release()
        #expect(stream.subscriberCount == 0)
        #expect(!stream.connected)
    }

    @Test @MainActor func activeStreamCancelsTransportWhenDemandIsReleased() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SabqLiveStreamURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let stream = SabqLiveStream(session: session)
        defer { stream.setAppActive(false) }

        SabqLiveStreamURLProtocol.reset()
        stream.acquire()
        for _ in 0..<20 where !stream.connected {
            try await Task.sleep(for: .milliseconds(25))
        }
        #expect(stream.connected)
        #expect(SabqLiveStreamURLProtocol.startCount == 1)

        stream.release()
        #expect(stream.subscriberCount == 0)
        #expect(!stream.connected)
        for _ in 0..<20 where SabqLiveStreamURLProtocol.stopCount == 0 {
            try await Task.sleep(for: .milliseconds(25))
        }
        #expect(SabqLiveStreamURLProtocol.stopCount >= 1)

        stream.acquire()
        for _ in 0..<20 where SabqLiveStreamURLProtocol.startCount < 2 {
            try await Task.sleep(for: .milliseconds(25))
        }
        #expect(SabqLiveStreamURLProtocol.startCount == 2)
        stream.release()
    }

    @Test func syntheticDigestDecodesExpectedLiveKeys() throws {
        let data = #"{"v":1,"items":[{"k":"s:42","gh":1,"ga":0,"st":"2H","el":63,"ex":null,"liv":true,"fin":false,"cs":null}]}"#.data(using: .utf8)!
        let digest = try JSONDecoder().decode(SabqLiveDigest.self, from: data)
        #expect(digest.items.count == 1)
        #expect(digest.items[0].k == "s:42")
        #expect(digest.items[0].liv)
    }
}

private final class SabqLiveStreamURLProtocol: URLProtocol {
    private static let lock = NSLock()
    private static var starts = 0
    private static var stops = 0

    static var startCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return starts
    }

    static var stopCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return stops
    }

    static func reset() {
        lock.lock()
        starts = 0
        stops = 0
        lock.unlock()
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.starts += 1
        Self.lock.unlock()

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: ["Content-Type": "text/event-stream"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        let payload = "data: {\"v\":1,\"items\":[]}\n\n".data(using: .utf8)!
        client?.urlProtocol(self, didLoad: payload)
        // Keep the response open until URLSession cancels it, like a real SSE
        // connection. `stopLoading` is invoked by task cancellation.
    }

    override func stopLoading() {
        Self.lock.lock()
        Self.stops += 1
        Self.lock.unlock()
    }
}
