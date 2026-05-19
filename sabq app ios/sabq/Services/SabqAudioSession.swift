import AVFoundation

// Tiny façade around AVAudioSession activation. The session category
// is configured once at app launch (sabqApp.init) with
// .playback + .spokenAudio + .longFormAudio so summaries and audio
// newsletters override the silent switch and integrate cleanly with
// CarPlay's "Now Playing".
//
// Activation is the part that interrupts other apps' audio, so we
// delay it until a play() is genuinely about to happen, and reverse
// it (with notifyOthersOnDeactivation) when audio stops so CarPlay /
// Spotify / Podcasts / etc. can resume where they left off.
enum SabqAudioSession {
    static func activate() {
        do {
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[SabqAudioSession] activate failed: \(error)")
        }
    }

    static func deactivate() {
        do {
            try AVAudioSession.sharedInstance().setActive(
                false,
                options: [.notifyOthersOnDeactivation]
            )
        } catch {
            // Common when there's nothing to deactivate from; swallow.
        }
    }
}
