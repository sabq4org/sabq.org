import SwiftUI

/// شريط «نشرة سَبْق» الصوتية — مشترك بين رئيسية الهاتف (`HomeFeedView`) وعمود
/// الأخبار على العرض العريض (`HomeSidebarView`، Duo مفتوحًا وiPad). نُقل كما
/// هو من HomeFeedView: تشغيل/إيقاف عبر المشغّل المشترك، والفصل النشط،
/// والوقت، وترددات BulletinWaveform أثناء الاستماع.
struct AudioBulletinBar: View {
    let bulletin: APIAudioBulletin
    @State private var audioPlayer = SabqAudioPlayer.shared

    var body: some View {
        let key = "audio-bulletin:\(bulletin.id)"
        let isCurrent = audioPlayer.currentKey == key
        let isPlaying = audioPlayer.isPlaying(key: key)
        let elapsed = isCurrent ? audioPlayer.currentTime : 0
        let total = max(1, bulletin.durationSec)
        let duration = (isCurrent && audioPlayer.currentDuration > 0) ? audioPlayer.currentDuration : total
        let progress = min(1.0, max(0.0, elapsed / duration))
        let activeSubtitle: String = {
            if (isPlaying || elapsed > 0), let active = bulletin.activeChapter(at: elapsed) {
                return active.chapter.label
            }
            return bulletin.title
        }()
        let minutes = max(1, Int((bulletin.durationSec / 60.0).rounded()))
        let durationLabel: String = {
            if isPlaying || elapsed > 0 {
                return "\(formatBulletinClock(elapsed)) / \(formatBulletinClock(duration))"
            }
            return minutes == 1 ? "دقيقة" : (minutes == 2 ? "دقيقتان" : "\(minutes) د")
        }()

        return Button {
            guard let url = URL(string: bulletin.audioUrl) else { return }
            SabqHaptics.medium()
            audioPlayer.toggle(
                SabqAudioPlayer.Item(
                    key: key,
                    url: url,
                    title: bulletin.title,
                    subtitle: "نشرة سَبْق الصوتية",
                    artworkURL: nil,
                    delivery: .stream
                )
            )
        } label: {
            VStack(spacing: isCurrent ? 6 : 0) {
                HStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(SabqTheme.primary)
                            .frame(width: 30, height: 30)
                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(SabqTheme.onAction)
                    }

                    HStack(spacing: 6) {
                        Text("نشرة سَبْق")
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.primary)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(SabqTheme.surface)
                            )

                        Text(activeSubtitle)
                            .font(SabqType.metaEmphasis.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    Text(durationLabel)
                        .font(SabqType.tag.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .monospacedDigit()
                        .environment(\.layoutDirection, .leftToRight)
                }

                if isCurrent {
                    // ترددات تتحرك أثناء الاستماع وتسكن عند الإيقاف، وتبيّن التقدم
                    BulletinWaveform(progress: progress, isPlaying: isPlaying)
                        .transition(.opacity)
                }
            }
            .animation(.easeOut(duration: 0.25), value: isCurrent)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .sabqSkyCardSurface()
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isPlaying ? "إيقاف نشرة سبق الصوتية: \(activeSubtitle)" : "تشغيل نشرة سبق الصوتية: \(bulletin.title)")
    }

    private func formatBulletinClock(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded(.down)))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}
