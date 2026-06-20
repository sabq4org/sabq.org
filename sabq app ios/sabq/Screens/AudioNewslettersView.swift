import SwiftUI
import AVFoundation

struct AudioNewslettersRoute: Hashable {}

// Audio newsletters list with an inline mini-player. Source:
// GET /api/audio-newsletters. Tapping a row expands the row to an
// active-player state — no separate detail page needed for this surface.
struct AudioNewslettersView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var newsletters: [APIAudioNewsletter] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    @State private var playingID: String?
    @State private var player: AVPlayer?
    @State private var isPlaying = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                header

                if isLoading {
                    VStack(spacing: 12) {
                        SkeletonBox(height: 100, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 100, radius: SabqTheme.tileRadius)
                        SkeletonBox(height: 100, radius: SabqTheme.tileRadius)
                    }
                } else if let errorMessage {
                    EmptyStateView(
                        icon: "speaker.slash",
                        tint: SabqTheme.coral,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if newsletters.isEmpty {
                    EmptyStateView(
                        icon: "waveform",
                        tint: SabqTheme.tertiaryInk,
                        title: "لا توجد نشرات صوتية",
                        subtitle: "النشرات الصوتية ستظهر هنا فور توفّرها."
                    )
                } else {
                    ForEach(newsletters) { newsletter in
                        newsletterRow(newsletter)
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 18)
            .padding(.bottom, 60)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.right")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                }
            }
        }
        .task { await load() }
        .onDisappear { stop() }
    }

    private var header: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.coral.opacity(0.14))
                    .frame(width: 56, height: 56)
                Image(systemName: "waveform")
                    .font(SabqFonts.app(size: 24, weight: .light))
                    .foregroundStyle(SabqTheme.coral)
                    .symbolRenderingMode(.hierarchical)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("النشرات الصوتية")
                    .font(SabqFonts.app(size: 20, weight: .heavy))
                    .foregroundStyle(SabqTheme.ink)
                Text("أبرز ما يحدث، باختصار صوتي")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Spacer(minLength: 0)
        }
    }

    private func newsletterRow(_ n: APIAudioNewsletter) -> some View {
        let active = playingID == n.id && isPlaying
        return HStack(alignment: .top, spacing: 14) {
            cover(n)

            VStack(alignment: .leading, spacing: 6) {
                Text(n.title)
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if let desc = n.description, !desc.isEmpty {
                    Text(desc)
                        .font(SabqFonts.app(size: 11))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .lineLimit(2)
                }

                HStack(spacing: 8) {
                    if let d = n.duration {
                        HStack(spacing: 3) {
                            Image(systemName: "clock").font(SabqFonts.app(size: 9))
                            Text(formatDuration(d))
                                .font(SabqFonts.app(size: 10, weight: .semibold))
                                .monospacedDigit()
                        }
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                    if let listens = n.totalListens, listens > 0 {
                        HStack(spacing: 3) {
                            Image(systemName: "headphones").font(SabqFonts.app(size: 9))
                            Text("\(listens)")
                                .font(SabqFonts.app(size: 10, weight: .semibold))
                                .monospacedDigit()
                        }
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }

            Spacer(minLength: 0)

            Button {
                togglePlayback(n)
            } label: {
                ZStack {
                    Circle()
                        .fill(active ? SabqTheme.coral : SabqTheme.primaryEnd.opacity(0.14))
                        .frame(width: 44, height: 44)
                    Image(systemName: active ? "pause.fill" : "play.fill")
                        .font(SabqFonts.app(size: 17, weight: .heavy))
                        .foregroundStyle(active ? .white : SabqTheme.primaryEnd)
                        .offset(x: active ? 0 : 1)
                }
            }
            .buttonStyle(.plain)
            .disabled(n.audioUrl == nil)
            .opacity(n.audioUrl == nil ? 0.4 : 1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(active ? SabqTheme.coral.opacity(0.3) : SabqTheme.outline.opacity(0.4),
                        lineWidth: active ? 1 : 0.5)
        )
    }

    @ViewBuilder
    private func cover(_ n: APIAudioNewsletter) -> some View {
        if let urlString = n.coverImageUrl, let url = URL(string: urlString) {
            CachedAsyncImage(url: url, contentMode: .fill) {
                coverPlaceholder
            }
            .frame(width: 60, height: 60)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        } else {
            coverPlaceholder
                .frame(width: 60, height: 60)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
    }

    private var coverPlaceholder: some View {
        ZStack {
            LinearGradient(
                colors: [SabqTheme.coral.opacity(0.30), SabqTheme.primaryEnd.opacity(0.18)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            Image(systemName: "waveform")
                .font(SabqFonts.app(size: 22, weight: .light))
                .foregroundStyle(.white.opacity(0.7))
        }
    }

    private func togglePlayback(_ n: APIAudioNewsletter) {
        SabqHaptics.light()
        guard let urlString = n.audioUrl, let url = URL(string: urlString) else { return }
        if playingID == n.id && isPlaying {
            player?.pause()
            isPlaying = false
            SabqAudioSession.deactivate()
            return
        }
        // Switching to a new newsletter — replace player.
        player?.pause()
        SabqAudioSession.activate()
        let newPlayer = AVPlayer(url: url)
        player = newPlayer
        playingID = n.id
        newPlayer.play()
        isPlaying = true
    }

    private func stop() {
        player?.pause()
        player = nil
        isPlaying = false
        playingID = nil
        SabqAudioSession.deactivate()
    }

    private func formatDuration(_ seconds: Int) -> String {
        let m = seconds / 60
        let s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            newsletters = try await APIClient.shared.fetchAudioNewsletters()
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
            newsletters = []
        }
        isLoading = false
    }
}
