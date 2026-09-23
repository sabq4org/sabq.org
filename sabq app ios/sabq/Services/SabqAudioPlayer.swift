import AVFoundation
import MediaPlayer
import SwiftUI
import UIKit

/// مشغّل صوتي واحد مشترك لكل الأسطح (ملخص الخبر، مقال الرأي، النشرات الصوتية).
///
/// قبل تدقيق iOS 27 (F03) كان لكل شاشة `AVPlayer` خاص بها، بلا Now Playing
/// ولا أوامر شاشة القفل، ومفتاح `audio` في UIBackgroundModes لم يكن يصل إلى
/// الحزمة أصلًا — فكان الصوت يتوقف عند القفل ولا تظهر أزرار التحكم. هذا الكائن:
/// - يملك `AVPlayer` واحدًا ويعرض حالة التشغيل للواجهات عبر `@Observable`.
/// - يغذّي `MPNowPlayingInfoCenter` (العنوان، «سبق»، المدة، الموضع، الصورة).
/// - يستقبل أوامر `MPRemoteCommandCenter` (تشغيل/إيقاف/±15 ثانية/إيقاف نهائي).
/// - يعالج المقاطعات (مكالمة)، وفصل السماعة، ونهاية المقطع.
///
/// سياسة جلسة الصوت: التفعيل عند أول تشغيل فقط (لا عند الإقلاع — خطأ CarPlay
/// المسجّل 2026-05-19)، والإبقاء عليها **أثناء الإيقاف المؤقت** كي تبقى أزرار
/// القفل، وتسليمها بـ`notifyOthersOnDeactivation` عند الإيقاف النهائي أو نهاية
/// المقطع أو مغادرة الشاشة كي يستأنف CarPlay/Spotify ما كان يعمل.
@MainActor
@Observable
final class SabqAudioPlayer {
    static let shared = SabqAudioPlayer()

    /// طريقة جلب المقطع.
    nonisolated enum Delivery: Sendable {
        /// بث مباشر عبر AVPlayer (النشرات الصوتية — ملفات كبيرة ثابتة).
        case stream
        /// تنزيل كامل أولًا ثم تشغيل ملف محلي — للملخص الصوتي: الخادم يرسل
        /// المقطع كاملًا برأس `X-TTS-Provider` الذي يلزم لإسناد «الصوت عبر HUMAIN».
        case download
    }

    /// ما يُعرض على شاشة القفل ومركز التحكم.
    nonisolated struct Item: Equatable, Sendable {
        /// معرّف مستقر للمحتوى (مثل `article:<slug>`) — تقارنه كل شاشة بمحتواها.
        let key: String
        let url: URL
        let title: String
        let subtitle: String?
        let artworkURL: URL?
        var delivery: Delivery = .stream
    }

    private(set) var currentKey: String?
    private(set) var isPlaying = false
    /// مزوّد المقطع الحالي (`humain` / `elevenlabs` / `google`) من رأس الاستجابة —
    /// يُعرف فقط في وضع التنزيل.
    private(set) var provider: String?
    /// المفتاح الذي يجري تنزيله الآن (قبل بدء التشغيل).
    private(set) var preparingKey: String?
    private var prepareTask: Task<Void, Never>?
    private var localFileURL: URL?

    private var player: AVPlayer?
    private var currentItem: Item?
    private var artwork: MPMediaItemArtwork?
    private var artworkTask: Task<Void, Never>?
    private var timeObserver: Any?
    private var statusObservation: NSKeyValueObservation?
    private var endObserver: NSObjectProtocol?
    private var commandsInstalled = false
    private var interruptedWhilePlaying = false

    private init() {
        observeAudioSession()
    }

    // MARK: - واجهة الشاشات

    /// يشمل مرحلة التنزيل كي يعكس الزر «إيقاف» فور النقر.
    func isPlaying(key: String) -> Bool {
        currentKey == key && (isPlaying || preparingKey == key)
    }

    /// مزوّد مقطع هذا المحتوى تحديدًا (nil لغيره أو قبل معرفته).
    func provider(for key: String) -> String? {
        currentKey == key ? provider : nil
    }

    /// زر «استماع/إيقاف» في الشاشات: يبدّل إن كان المحتوى نفسه، وإلا يبدأ الجديد.
    func toggle(_ item: Item) {
        if currentKey == item.key, preparingKey == item.key {
            stop()
            return
        }
        if currentKey == item.key, player != nil {
            if isPlaying { pause() } else { resume() }
            return
        }
        play(item)
    }

    func play(_ item: Item) {
        teardownPlayer()
        prepareTask?.cancel()
        prepareTask = nil
        removeLocalFile()
        currentItem = item
        currentKey = item.key
        artwork = nil
        provider = nil
        SabqAudioSession.activate()
        installRemoteCommandsIfNeeded()
        switch item.delivery {
        case .stream:
            preparingKey = nil
            start(AVPlayer(url: item.url))
        case .download:
            preparingKey = item.key
            prepareTask = Task { @MainActor [weak self] in
                do {
                    let (data, response) = try await URLSession.shared.data(from: item.url)
                    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                        throw URLError(.badServerResponse)
                    }
                    let ext = Self.fileExtension(forContentType: http.value(forHTTPHeaderField: "Content-Type"))
                    let fileURL = FileManager.default.temporaryDirectory
                        .appendingPathComponent("sabq-summary-\(UUID().uuidString).\(ext)")
                    try data.write(to: fileURL, options: .atomic)
                    guard let self, !Task.isCancelled, self.currentKey == item.key else {
                        try? FileManager.default.removeItem(at: fileURL)
                        return
                    }
                    self.localFileURL = fileURL
                    self.provider = Self.providerName(from: http)
                    self.preparingKey = nil
                    self.start(AVPlayer(url: fileURL))
                } catch {
                    guard let self, self.currentKey == item.key else { return }
                    self.stop()
                }
            }
        }
        loadArtwork(item.artworkURL)
    }

    private func start(_ newPlayer: AVPlayer) {
        newPlayer.automaticallyWaitsToMinimizeStalling = true
        attach(newPlayer)
        newPlayer.play()
        isPlaying = true
        publishNowPlaying()
    }

    /// اسم المزوّد من رأس `X-TTS-Provider` بحروف صغيرة (`humain`…).
    nonisolated static func providerName(from response: HTTPURLResponse) -> String? {
        let raw = response.value(forHTTPHeaderField: "X-TTS-Provider")?
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        return raw.isEmpty ? nil : raw
    }

    /// امتداد الملف المؤقت من نوع المحتوى (HUMAIN يرسل WAV، والبدائل MP3).
    nonisolated static func fileExtension(forContentType type: String?) -> String {
        let t = (type ?? "").lowercased()
        if t.contains("wav") { return "wav" }
        if t.contains("mpeg") || t.contains("mp3") { return "mp3" }
        if t.contains("ogg") { return "ogg" }
        if t.contains("aac") || t.contains("mp4") || t.contains("m4a") { return "m4a" }
        return "mp3"
    }

    private func removeLocalFile() {
        if let localFileURL {
            try? FileManager.default.removeItem(at: localFileURL)
        }
        localFileURL = nil
    }

    func pause() {
        player?.pause()
        isPlaying = false
        publishNowPlaying()
    }

    func resume() {
        guard let player else { return }
        SabqAudioSession.activate()
        player.play()
        isPlaying = true
        publishNowPlaying()
    }

    /// إيقاف نهائي: يفرغ المشغّل ويمسح Now Playing ويسلّم الجلسة للآخرين.
    func stop() {
        prepareTask?.cancel()
        prepareTask = nil
        preparingKey = nil
        teardownPlayer()
        removeLocalFile()
        provider = nil
        currentItem = nil
        currentKey = nil
        artwork = nil
        artworkTask?.cancel()
        artworkTask = nil
        isPlaying = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        SabqAudioSession.deactivate()
    }

    /// تُستدعى من الشاشة عند مغادرتها: توقف فقط إن كان الصوت لمحتواها هي.
    func stopIfCurrent(key: String) {
        guard currentKey == key else { return }
        stop()
    }

    // MARK: - المشغّل

    private func attach(_ newPlayer: AVPlayer) {
        player = newPlayer

        // نهاية المقطع → إيقاف نهائي (كان الزر يبقى على «إيقاف» وجلسة الصوت
        // محتجزة فتبقى موسيقى المستخدم موقوفة بعد انتهاء الملخص).
        endObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: newPlayer.currentItem,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.stop() }
        }

        // مصدر الحقيقة لحالة التشغيل هو المشغّل نفسه (يتوقف عند انقطاع الشبكة
        // أو المقاطعة دون أن نمرّ بـpause()).
        statusObservation = newPlayer.observe(\.timeControlStatus, options: [.new]) { [weak self] p, _ in
            let status = p.timeControlStatus
            let playing = status == .playing
            Task { @MainActor [weak self] in
                guard let self, self.player === p else { return }
                if self.isPlaying != playing, status != .waitingToPlayAtSpecifiedRate {
                    self.isPlaying = playing
                    self.publishNowPlaying()
                }
            }
        }

        // موضع التشغيل لشاشة القفل كل ثانية.
        timeObserver = newPlayer.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 1, preferredTimescale: 10),
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.publishNowPlaying() }
        }
    }

    private func teardownPlayer() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        statusObservation?.invalidate()
        statusObservation = nil
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = nil
        player?.pause()
        player = nil
    }

    // MARK: - Now Playing

    private func publishNowPlaying() {
        guard let item = currentItem else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: item.title,
            MPMediaItemPropertyArtist: item.subtitle ?? "سبق",
            MPMediaItemPropertyAlbumTitle: "سبق",
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
            MPNowPlayingInfoPropertyIsLiveStream: false,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        if let player {
            let elapsed = player.currentTime().seconds
            if elapsed.isFinite, elapsed >= 0 {
                info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
            }
            // بث TTS بلا Content-Length يعطي مدة غير محددة — نتركها فتُعرض بلا شريط.
            if let duration = player.currentItem?.duration.seconds, duration.isFinite, duration > 0 {
                info[MPMediaItemPropertyPlaybackDuration] = duration
            }
        }
        if let artwork {
            info[MPMediaItemPropertyArtwork] = artwork
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private func loadArtwork(_ url: URL?) {
        artworkTask?.cancel()
        guard let url else { return }
        let key = currentKey
        artworkTask = Task { [weak self] in
            guard let (data, _) = try? await URLSession.shared.data(from: url),
                  let image = UIImage(data: data) else { return }
            guard !Task.isCancelled else { return }
            let art = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            await MainActor.run {
                guard let self, self.currentKey == key else { return }
                self.artwork = art
                self.publishNowPlaying()
            }
        }
    }

    // MARK: - أوامر شاشة القفل / السماعة / CarPlay

    private func installRemoteCommandsIfNeeded() {
        guard !commandsInstalled else { return }
        commandsInstalled = true
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.player != nil else { return .noActionableNowPlayingItem }
                self.resume()
                return .success
            }
        }
        center.pauseCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.player != nil else { return .noActionableNowPlayingItem }
                self.pause()
                return .success
            }
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.player != nil else { return .noActionableNowPlayingItem }
                if self.isPlaying { self.pause() } else { self.resume() }
                return .success
            }
        }
        center.stopCommand.addTarget { [weak self] _ in
            MainActor.assumeIsolated {
                self?.stop()
                return .success
            }
        }
        center.skipForwardCommand.preferredIntervals = [15]
        center.skipForwardCommand.addTarget { [weak self] event in
            let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 15
            return MainActor.assumeIsolated {
                guard let self else { return .noActionableNowPlayingItem }
                return self.skip(by: seconds)
            }
        }
        center.skipBackwardCommand.preferredIntervals = [15]
        center.skipBackwardCommand.addTarget { [weak self] event in
            let seconds = (event as? MPSkipIntervalCommandEvent)?.interval ?? 15
            return MainActor.assumeIsolated {
                guard let self else { return .noActionableNowPlayingItem }
                return self.skip(by: -seconds)
            }
        }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            let position = (event as? MPChangePlaybackPositionCommandEvent)?.positionTime ?? 0
            return MainActor.assumeIsolated {
                guard let self, let player = self.player else { return .noActionableNowPlayingItem }
                player.seek(to: CMTime(seconds: position, preferredTimescale: 600))
                self.publishNowPlaying()
                return .success
            }
        }
        // لا قائمة تشغيل — لا معنى للتالي/السابق.
        center.nextTrackCommand.isEnabled = false
        center.previousTrackCommand.isEnabled = false
    }

    private func skip(by seconds: Double) -> MPRemoteCommandHandlerStatus {
        guard let player else { return .noActionableNowPlayingItem }
        let current = player.currentTime().seconds
        guard current.isFinite else { return .commandFailed }
        let target = max(0, current + seconds)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600))
        publishNowPlaying()
        return .success
    }

    // MARK: - مقاطعات الجلسة وتغيّر المسار

    private func observeAudioSession() {
        let center = NotificationCenter.default
        center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            let optionsRaw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            MainActor.assumeIsolated {
                self?.handleInterruption(type: type, optionsRaw: optionsRaw)
            }
        }
        center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: raw) else { return }
            MainActor.assumeIsolated {
                self?.handleRouteChange(reason)
            }
        }
    }

    /// مكالمة واردة/سيري: نوقف مؤقتًا، ونستأنف فقط إن طلب النظام ذلك وكنّا نشغّل.
    private func handleInterruption(type: AVAudioSession.InterruptionType, optionsRaw: UInt) {
        switch type {
        case .began:
            interruptedWhilePlaying = isPlaying
            if isPlaying {
                player?.pause()
                isPlaying = false
                publishNowPlaying()
            }
        case .ended:
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
            if interruptedWhilePlaying, options.contains(.shouldResume) {
                resume()
            }
            interruptedWhilePlaying = false
        @unknown default:
            break
        }
    }

    /// فصل السماعة/AirPods أثناء التشغيل → إيقاف مؤقت (سلوك النظام المتوقّع؛
    /// وإلا انفجر الصوت من مكبّر الهاتف).
    private func handleRouteChange(_ reason: AVAudioSession.RouteChangeReason) {
        guard reason == .oldDeviceUnavailable, isPlaying else { return }
        pause()
    }
}
