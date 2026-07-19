import SwiftUI

// MARK: - مخزن مُقترب المشترك
//
// مخزن حيّ على مستوى التطبيق يحتفظ بآخر مواضيع مُقترب المميّزة. نفس فلسفة
// `WorldCupHomeStore`: تبقى البيانات هنا فلا تختفي البطاقة عند التنقل
// (الدخول للملف الشخصي/لوحة التحكم والرجوع)، مع تحديث انتهازي.

@Observable
@MainActor
final class MuqtarabHomeStore {
    static let shared = MuqtarabHomeStore()
    private init() {}

    private(set) var topics: [MuqTopic] = []
    private var lastFetch: Date?
    private var fetching = false

    /// يجلب المواضيع عند الحاجة فقط: لا بيانات بعد، أو مرّ أكثر من 5 دقائق.
    func loadIfNeeded() async {
        if fetching { return }
        if !topics.isEmpty, let last = lastFetch, Date().timeIntervalSince(last) < 300 { return }
        fetching = true
        defer { fetching = false }
        if let result = try? await APIClient.shared.fetchMuqtarabFeaturedTopics(limit: 6) {
            topics = result
            lastFetch = Date()
        }
    }
}

// MARK: - شريط مُقترب في الواجهة الرئيسية
//
// عنوان + رابط «الكل» يقود لصفحة القسم، وشريط أفقي ببطاقات مواضيع مميّزة.
// يختفي كليًا عند غياب البيانات — صفر أثر على الواجهة.

struct MuqtarabHomeStrip: View {
    private let store = MuqtarabHomeStore.shared

    var body: some View {
        ZStack {
            Color.clear.frame(width: 0, height: 0)
            if !store.topics.isEmpty {
                content
            }
        }
        .task { await store.loadIfNeeded() }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 8) {
                HStack(spacing: 8) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 9, style: .continuous)
                            .fill(SabqTheme.sky.opacity(0.14))
                            .frame(width: 34, height: 34)
                        Image(systemName: "scope")
                            .font(SabqFonts.app(size: 16, weight: .semibold))
                            .foregroundStyle(SabqTheme.sky)
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text("مُقترب")
                            .font(SabqFonts.app(size: 16, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("زوايا تحليلية بأقلام الكتّاب")
                            .font(SabqFonts.app(size: 11, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                Spacer(minLength: 0)
                NavigationLink(value: MuqtarabRoute()) {
                    HStack(spacing: 4) {
                        Text("الكل")
                            .font(SabqFonts.app(size: 12, weight: .medium))
                        Image(systemName: "chevron.left")
                            .font(SabqFonts.app(size: 10, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.sky)
                }
                .buttonStyle(.plain)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(store.topics) { topic in
                        if let angleSlug = topic.angle?.slug {
                            NavigationLink(value: MuqtarabTopicRoute(
                                angleSlug: angleSlug,
                                topicSlug: topic.slug,
                                title: topic.title
                            )) {
                                card(topic)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    // أبعاد ثابتة لكل البطاقات حتى تتساوى تمامًا في الشريط الأفقي.
    private let cardWidth: CGFloat = 230
    private let imageHeight: CGFloat = 124
    private let textHeight: CGFloat = 98

    private func card(_ topic: MuqTopic) -> some View {
        let tint = muqColor(topic.angle?.colorHex)
        return VStack(alignment: .leading, spacing: 0) {
            ZStack {
                if let raw = topic.heroImageUrl, let url = URL(string: URLConstants.absolutize(raw)) {
                    CachedAsyncImage(url: url, contentMode: .fill, maxPixelSize: 700) {
                        tint.opacity(0.14)
                    }
                } else {
                    tint.opacity(0.14)
                    Image(systemName: muqSymbol(topic.angle?.icon))
                        .font(SabqFonts.app(size: 30, weight: .light))
                        .foregroundStyle(tint.opacity(0.7))
                }
            }
            .frame(width: cardWidth, height: imageHeight)
            .clipped()

            VStack(alignment: .leading, spacing: 6) {
                if let name = topic.angle?.name, !name.isEmpty {
                    Text(name)
                        .font(SabqFonts.app(size: 10, weight: .medium))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .foregroundStyle(tint)
                        .background(Capsule().fill(tint.opacity(0.12)))
                }
                Text(topic.title)
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(12)
            .frame(width: cardWidth, height: textHeight, alignment: .topLeading)
        }
        .frame(width: cardWidth, height: imageHeight + textHeight)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(tint.opacity(0.16), lineWidth: 0.5)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}
