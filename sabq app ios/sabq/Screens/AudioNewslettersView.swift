import SwiftUI
import AVFoundation

struct AudioNewslettersRoute: Hashable {}

// Audio newsletters list with an inline mini-player. Source:
// GET /api/audio-newsletters. Tapping a row expands the row to an
// active-player state — no separate detail page needed for this surface.
struct AudioNewslettersView: View {
    @State private var newsletters: [APIAudioNewsletter] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    /// التشغيل عبر المشغّل المشترك (Now Playing + شاشة القفل + الخلفية) — F03.
    private func audioKey(_ n: APIAudioNewsletter) -> String { "newsletter:\(n.id)" }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                header

                if isLoading {
                    VStack(spacing: SabqLayout.space16) {
                        SkeletonBox(height: 64, radius: SabqRadius.small)
                        SkeletonBox(height: 64, radius: SabqRadius.small)
                        SkeletonBox(height: 64, radius: SabqRadius.small)
                    }
                } else if let errorMessage {
                    EmptyStateView(
                        icon: "speaker.slash",
                        tint: SabqTheme.danger,
                        title: "تعذّر التحميل",
                        subtitle: errorMessage,
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                } else if newsletters.isEmpty {
                    EmptyStateView(
                        icon: "waveform",
                        tint: SabqTheme.textTertiary,
                        title: "لا توجد نشرات صوتية",
                        subtitle: "النشرات الصوتية ستظهر هنا فور توفّرها."
                    )
                } else {
                    // صفوف بفواصل رفيعة على الصفحة، بلا بطاقات.
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(newsletters.enumerated()), id: \.element.id) { index, newsletter in
                            if index > 0 { SidebarRowDivider() }
                            newsletterRow(newsletter)
                        }
                    }
                }
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space16)
            .padding(.bottom, SabqLayout.space40)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .navigationTitle("النشرات الصوتية")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .onDisappear { stopIfOurs() }
    }

    private var header: some View {
        SabqPageIntro("أبرز ما يحدث، باختصار صوتي")
    }

    private func newsletterRow(_ n: APIAudioNewsletter) -> some View {
        let active = SabqAudioPlayer.shared.isPlaying(key: audioKey(n))
        return HStack(alignment: .top, spacing: SabqLayout.space12) {
            cover(n)

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(n.title)
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)

                if let desc = n.description, !desc.isEmpty {
                    Text(desc)
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .lineLimit(2)
                }

                HStack(spacing: SabqLayout.space12) {
                    if let d = n.duration {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "clock").font(SabqType.tag.font)
                            Text(formatDuration(d))
                                .font(SabqType.meta.font)
                                .monospacedDigit()
                        }
                        .foregroundStyle(SabqTheme.textTertiary)
                    }
                    if let listens = n.totalListens, listens > 0 {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "headphones").font(SabqType.tag.font)
                            Text("\(listens)")
                                .font(SabqType.meta.font)
                                .monospacedDigit()
                        }
                        .foregroundStyle(SabqTheme.textTertiary)
                    }
                }
            }

            Spacer(minLength: 0)

            Button {
                togglePlayback(n)
            } label: {
                Image(systemName: active ? "pause.fill" : "play.fill")
                    .font(SabqFonts.app(size: 17, weight: .semibold))
                    .foregroundStyle(active ? SabqTheme.onAction : SabqTheme.primary)
                    .frame(width: SabqLayout.touchTarget, height: SabqLayout.touchTarget)
                    .background(Circle().fill(active ? SabqTheme.actionFill : SabqTheme.surfaceMuted))
            }
            .buttonStyle(.plain)
            .disabled(n.audioUrl == nil)
            .opacity(n.audioUrl == nil ? 0.4 : 1)
            .accessibilityLabel(active ? "إيقاف" : "تشغيل")
        }
        .padding(.vertical, SabqLayout.rowPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func cover(_ n: APIAudioNewsletter) -> some View {
        if let urlString = n.coverImageUrl, let url = URL(string: urlString) {
            CachedAsyncImage(url: url, contentMode: .fill) {
                SabqImagePlaceholder()
            }
            .frame(width: 64, height: 64)
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
        } else {
            SabqImagePlaceholder()
                .environment(\.sabqImageLoadFailed, true)
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
        }
    }

    private func togglePlayback(_ n: APIAudioNewsletter) {
        SabqHaptics.light()
        guard let urlString = n.audioUrl, let url = URL(string: urlString) else { return }
        // النشرة نفسها → تبديل تشغيل/إيقاف؛ نشرة أخرى → يستبدلها المشغّل.
        SabqAudioPlayer.shared.toggle(SabqAudioPlayer.Item(
            key: audioKey(n),
            url: url,
            title: n.title,
            subtitle: "النشرة الصوتية · سبق",
            artworkURL: n.coverImageUrl.flatMap { URL(string: $0) }
        ))
    }

    /// مغادرة الشاشة توقف نشرةً تشغّلها هي فقط — لا ملخص مقال يعمل في الخلفية.
    private func stopIfOurs() {
        guard SabqAudioPlayer.shared.currentKey?.hasPrefix("newsletter:") == true else { return }
        SabqAudioPlayer.shared.stop()
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
