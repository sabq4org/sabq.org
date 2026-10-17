import SwiftUI
import AVKit
import WebKit
import Combine

/// الفيديو البارز لخبر «قالب الفيديو» — نظير VideoPlayer.tsx في الويب.
///
/// قبل التشغيل: الصورة المصغرة (التي رفعها المحرر، ثم مصغرة يوتيوب، ثم صورة
/// الخبر) مع زر تشغيل واسم المنصة. بعد الضغط يُشغَّل داخل الصفحة:
/// - X/تويتر: عبر بروكسي الخادم `/api/video/stream/:tweetId` (MP4 يدعم Range)
///   بالمشغّل الأصلي، وعند فشله تُعرض التغريدة المضمّنة كما يفعل الويب.
/// - يوتيوب ودايلي موشن: مشغّل التضمين الرسمي داخل WKWebView.
/// - رابط مباشر: المشغّل الأصلي.
struct ArticleVideoHero: View {
    let videoURL: String
    let thumbnailURL: String?
    let fallbackImageURL: String?

    @State private var playing = false
    @State private var player: AVPlayer?
    @State private var streamFailed = false

    private var source: VideoSource { VideoSource(videoURL) }

    var body: some View {
        Group {
            if playing {
                playerView
            } else {
                poster
            }
        }
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .background(Color.black)
        .clipped()
        .onDisappear { player?.pause() }
    }

    // MARK: - Poster

    private var poster: some View {
        Button(action: start) {
            ZStack {
                if let url = posterURL {
                    CachedAsyncImage(url: url, contentMode: .fill) { Color.black }
                } else {
                    Color.black
                }
                Circle()
                    .fill(SabqTheme.primary)
                    .frame(width: 64, height: 64)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 26, weight: .bold))
                            .foregroundStyle(.white)
                            .offset(x: 2)
                    )
                    .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
            }
            .overlay(alignment: .bottom) {
                if let label = source.label {
                    // بداية السطر (اليمين في RTL) كما في الويب
                    Text(label)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(.white)
                        .padding(.horizontal, SabqLayout.space12)
                        .padding(.vertical, SabqLayout.space8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .top, endPoint: .bottom))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("تشغيل الفيديو")
    }

    private var posterURL: URL? {
        let candidates = [thumbnailURL, source.youTubeThumbnail, fallbackImageURL]
        return candidates.compactMap { $0 }.first { !$0.isEmpty }.flatMap(URL.init(string:))
    }

    // MARK: - Player

    @ViewBuilder
    private var playerView: some View {
        switch source {
        case .twitter(let id) where streamFailed:
            if let url = URL(string: "https://x.com/i/status/\(id)") {
                ScrollView { TwitterEmbedView(tweetURL: url).padding(SabqLayout.space8) }
                    .background(SabqTheme.background)
            }
        case .youtube, .dailymotion:
            if let embed = source.embedURL { InlineEmbedWebView(url: embed) }
        default:
            if let player { VideoPlayer(player: player) }
        }
    }

    private func start() {
        SabqHaptics.light()
        SabqAudioPlayer.shared.pause() // لا يتداخل الموجز الصوتي مع صوت الفيديو
        if let url = source.streamURL {
            let item = AVPlayerItem(url: url)
            let p = AVPlayer(playerItem: item)
            player = p
            observeFailure(item)
            p.play()
        }
        playing = true
    }

    /// فشل بروكسي X (تغريدة محذوفة أو بلا فيديو) → التغريدة المضمّنة.
    private func observeFailure(_ item: AVPlayerItem) {
        guard case .twitter = source else { return }
        Task { @MainActor in
            for await status in item.publisher(for: \.status).values where status == .failed {
                streamFailed = true
                player?.pause()
                break
            }
        }
    }
}

// MARK: - Source parsing (نفس منطق getVideoType في VideoPlayer.tsx)

enum VideoSource: Equatable {
    case twitter(id: String)
    case youtube(id: String)
    case dailymotion(id: String)
    case direct(URL)
    case unknown

    init(_ raw: String) {
        let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = s.lowercased()
        if lower.contains("youtube.com") || lower.contains("youtu.be") {
            self = Self.match(s, #"(?:youtube\.com/(?:shorts/|embed/|v/|watch\?(?:.*&)?v=)|youtu\.be/)([A-Za-z0-9_-]{11})"#)
                .map { .youtube(id: $0) } ?? .unknown
        } else if lower.contains("dailymotion.com") || lower.contains("dai.ly") {
            self = Self.match(s, #"(?:dailymotion\.com/(?:embed/)?video/|dai\.ly/)([A-Za-z0-9]+)"#)
                .map { .dailymotion(id: $0) } ?? .unknown
        } else if lower.contains("x.com") || lower.contains("twitter.com") {
            self = Self.match(s, #"(?:x\.com|twitter\.com)/(?:[A-Za-z0-9_]{1,15}|i)/status(?:es)?/(\d{5,25})"#)
                .map { .twitter(id: $0) } ?? .unknown
        } else if let url = URL(string: s), url.scheme?.hasPrefix("http") == true {
            self = .direct(url)
        } else {
            self = .unknown
        }
    }

    private static func match(_ s: String, _ pattern: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive),
              let m = re.firstMatch(in: s, range: NSRange(s.startIndex..., in: s)),
              m.numberOfRanges > 1, let r = Range(m.range(at: 1), in: s)
        else { return nil }
        return String(s[r])
    }

    /// رابط يشغّله AVPlayer مباشرة (X عبر بروكسي الخادم، أو الرابط المباشر).
    var streamURL: URL? {
        switch self {
        case .twitter(let id): return URL(string: "\(URLConstants.publicAPI)/video/stream/\(id)")
        case .direct(let url): return url
        default: return nil
        }
    }

    var embedURL: URL? {
        switch self {
        case .youtube(let id): return URL(string: "https://www.youtube.com/embed/\(id)?playsinline=1&autoplay=1&rel=0")
        case .dailymotion(let id): return URL(string: "https://www.dailymotion.com/embed/video/\(id)?autoplay=1")
        default: return nil
        }
    }

    var youTubeThumbnail: String? {
        if case .youtube(let id) = self { return "https://img.youtube.com/vi/\(id)/hqdefault.jpg" }
        return nil
    }

    var label: String? {
        switch self {
        case .twitter: return "منصة X (تويتر)"
        case .youtube: return "YouTube"
        case .dailymotion: return "Dailymotion"
        default: return nil
        }
    }
}

// MARK: - Inline embed

/// تضمين يوتيوب/دايلي موشن داخل الصفحة: تشغيل مضمّن تلقائي بلا ملء الشاشة القسري.
private struct InlineEmbedWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
