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

// MARK: - شريط الزوايا في الواجهة الرئيسية
//
// قائمة رأسية بنفس بنية قسم «الرأي» وبهوية سبق: بطاقة سماوية فاتحة،
// عنوان الموضوع ثم اسم كاتب الزاوية بأزرق سبق والتاريخ النسبي بجانبه.
// بلا صور إطلاقًا بقرار المالك. يختفي كليًا عند غياب البيانات.

struct MuqtarabHomeStrip: View {
    private let store = MuqtarabHomeStore.shared

    /// المواضيع القابلة للعرض فقط (زاوية معلومة) — حتى لا يكسر موضوع
    /// ناقص البيانات ترتيب الفواصل بين الصفوف.
    private var visibleTopics: [MuqTopic] {
        Array(store.topics.filter { $0.angle?.slug != nil }.prefix(3))
    }

    var body: some View {
        ZStack {
            Color.clear.frame(width: 0, height: 0)
            if !visibleTopics.isEmpty {
                content
            }
        }
        .task { await store.loadIfNeeded() }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center) {
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(SabqTheme.brandSky)
                        .frame(width: 4, height: 22)
                    Text("مُقترب")
                        .font(SabqFonts.app(size: 20, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }

                Spacer(minLength: 0)

                NavigationLink(value: MuqtarabRoute()) {
                    HStack(spacing: 6) {
                        Text("كل الزوايا")
                            .font(SabqFonts.app(size: 14, weight: .semibold))
                        Image(systemName: "arrow.left")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(SabqTheme.brandBlue)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 4)

            ForEach(Array(visibleTopics.enumerated()), id: \.element.id) { index, topic in
                if index > 0 {
                    Rectangle()
                        .fill(SabqTheme.sectionSeparator)
                        .frame(height: 0.8)
                        .padding(.horizontal, 16)
                }
                NavigationLink(value: MuqtarabTopicRoute(
                    angleSlug: topic.angle?.slug ?? "",
                    topicSlug: topic.slug,
                    title: topic.title
                )) {
                    row(topic)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.bottom, 8)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(SabqTheme.sectionCard)
        )
    }

    private func row(_ topic: MuqTopic) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(topic.title)
                .font(SabqFonts.app(size: 16, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 6) {
                Text(topic.writer?.name ?? topic.angle?.name ?? "مُقترب")
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.brandBlue)
                    .lineLimit(1)
                if let relative = muqRelativeDate(topic.publishedAt) {
                    Text("•")
                        .font(SabqFonts.app(size: 10, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    Text(relative)
                        .font(SabqFonts.app(size: 13, weight: .regular))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .lineLimit(1)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }
}

/// تاريخ نسبي عربي («قبل ٥ ساعات»، «أمس») من نص ISO — نفس تسامح
/// `muqFormatDate` مع الكسور العشرية للثواني.
private func muqRelativeDate(_ iso: String?) -> String? {
    guard let iso, !iso.isEmpty else { return nil }
    let frac = ISO8601DateFormatter()
    frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    guard let date = frac.date(from: iso) ?? plain.date(from: iso) else { return nil }
    return SabqFormatters.relativeArabic.localizedString(for: date, relativeTo: Date())
}
