import SwiftUI

// MARK: - «فريق سبق الذكي» — نقل TeamBand من صفحة عقل سبق (SabqAI.tsx، e1dc9c7/3930101)
//
// المصدر `/api/public/ai-team` (عام، كاش 5 دقائق). قاعدة «لا أرقام وهمية»:
// عدّاد الشهر يُخفى عندما يكون صفرًا، والقسم كله يختفي بلا أعضاء.

nonisolated struct APIAITeamMember: Decodable, Identifiable {
    let slug: String
    let nameAr: String
    let titleAr: String
    let departmentAr: String
    let avatarUrl: String?

    var id: String { slug }

    /// الصور نسبية على الويب (`/ai-team/rased.jpg`) — نُكمّلها بأصل الموقع.
    var absoluteAvatarURL: URL? {
        guard let raw = avatarUrl?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else { return nil }
        if raw.hasPrefix("http") { return URL(string: raw) }
        return URL(string: URLConstants.webOrigin + (raw.hasPrefix("/") ? raw : "/" + raw))
    }
}

nonisolated struct APIAITeamCounters: Decodable {
    let monthOps: Int
    let teamCount: Int
}

nonisolated struct APIAITeam: Decodable {
    let generatedAt: String?
    let team: [APIAITeamMember]
    let counters: APIAITeamCounters?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        generatedAt = try? c.decodeIfPresent(String.self, forKey: .generatedAt)
        team = (try? c.decodeIfPresent([APIAITeamMember].self, forKey: .team)) ?? []
        counters = try? c.decodeIfPresent(APIAITeamCounters.self, forKey: .counters)
    }

    private enum CodingKeys: String, CodingKey { case generatedAt, team, counters }

    /// «لا أرقام وهمية»: بلا أعضاء لا يُعرض القسم.
    var isRenderable: Bool { !team.isEmpty }
}

extension APIClient {
    func fetchAITeam() async throws -> APIAITeam {
        try await get(APIAITeam.self, path: "/public/ai-team", apiRoot: URLConstants.publicAPI)
    }
}

/// ألوان الشريط الكحلي كما في الويب.
private enum AITeamPalette {
    static let band = Color(red: 0x0E / 255, green: 0x22 / 255, blue: 0x33 / 255)
    static let card = Color(red: 0x12 / 255, green: 0x29 / 255, blue: 0x3B / 255)
    static let border = Color(red: 0x1E / 255, green: 0x34 / 255, blue: 0x48 / 255)
    static let accent = Color(red: 0x4C / 255, green: 0xBC / 255, blue: 0xFD / 255)
    static let muted = Color(red: 0x8C / 255, green: 0xA3 / 255, blue: 0xB5 / 255)
    static let avatar = Color(red: 0x0E / 255, green: 0x76 / 255, blue: 0xB8 / 255)
    static let role = Color(red: 0xDC / 255, green: 0xF1 / 255, blue: 0xFE / 255).opacity(0.8)
}

struct AITeamView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var payload: APIAITeam?
    @State private var isLoading = true
    @State private var loadError: String?

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                if let payload, payload.isRenderable {
                    band(payload)
                } else if isLoading {
                    SkeletonBox(height: 320, radius: 20)
                        .padding(16)
                } else {
                    EmptyStateView(
                        icon: "person.3",
                        tint: SabqTheme.primaryEnd,
                        title: "الفريق غير متاح حاليًا",
                        subtitle: loadError ?? "لم نتمكن من جلب بيانات الفريق الآن. حاول مرة أخرى بعد قليل.",
                        action: { Task { await load() } },
                        actionTitle: "إعادة المحاولة"
                    )
                }
            }
            .padding(.bottom, 120)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("فريق سبق الذكي")
        .navigationBarTitleDisplayMode(.inline)
        .sabqRTL()
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            payload = try await APIClient.shared.fetchAITeam()
            loadError = nil
        } catch {
            loadError = ReaderErrorMessage.message(for: error, fallback: "تعذر جلب بيانات الفريق")
        }
    }

    private func band(_ p: APIAITeam) -> some View {
        VStack(spacing: 18) {
            VStack(spacing: 8) {
                Text("داخل عقل سبق")
                    .font(SabqFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(AITeamPalette.accent)
                    .textCase(nil)
                Text("فريق سبق الذكي")
                    .font(SabqFonts.app(size: 24, weight: .heavy))
                    .foregroundStyle(.white)
                Text("أول غرفة أخبار سعودية تعرّفك بزملائها الرقميين بأسمائهم وأدوارهم — يعملون على مدار الساعة، ولا يُنشر لهم حرف قبل اعتماد محرر بشري.")
                    .font(SabqFonts.app(size: 13, weight: .regular))
                    .foregroundStyle(AITeamPalette.muted)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(p.team) { m in memberCard(m) }
            }

            counters(p)

            Text("🛡 الإنسان يعتمد كل شيء — سياسة سبق للذكاء الاصطناعي")
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Capsule(style: .continuous).fill(Color.white.opacity(0.08)))
                .overlay(Capsule(style: .continuous).stroke(AITeamPalette.border, lineWidth: 1))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 28)
        .frame(maxWidth: .infinity)
        .background(AITeamPalette.band)
    }

    private func memberCard(_ m: APIAITeamMember) -> some View {
        HStack(spacing: 10) {
            ZStack {
                Circle().fill(AITeamPalette.avatar)
                if let url = m.absoluteAvatarURL {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        initial(m.nameAr)
                    }
                    .clipShape(Circle())
                } else {
                    initial(m.nameAr)
                }
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(m.nameAr)
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                Text(m.titleAr)
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(AITeamPalette.role)
                    .lineLimit(1)
                Text(m.departmentAr)
                    .font(SabqFonts.app(size: 10, weight: .regular))
                    .foregroundStyle(AITeamPalette.accent)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(AITeamPalette.card)
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(AITeamPalette.border, lineWidth: 1))
        )
        .accessibilityElement(children: .combine)
    }

    private func initial(_ name: String) -> some View {
        Text(String(name.prefix(1)))
            .font(SabqFonts.app(size: 16, weight: .bold))
            .foregroundStyle(.white)
    }

    private func counters(_ p: APIAITeam) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if let ops = p.counters?.monthOps, ops > 0 {
                counter(value: EconomyFormat.trimNum(Double(ops), 0), label: "عملًا هذا الشهر")
            }
            counter(value: EconomyFormat.trimNum(Double(p.counters?.teamCount ?? p.team.count), 0), label: "زميلًا رقميًا")
            counter(value: "100%", label: "تحت إشراف بشري")
        }
        .frame(maxWidth: .infinity)
    }

    private func counter(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(SabqFonts.app(size: 22, weight: .heavy))
                .foregroundStyle(AITeamPalette.accent)
                .monospacedDigit()
            Text(label)
                .font(SabqFonts.app(size: 11, weight: .regular))
                .foregroundStyle(AITeamPalette.muted)
        }
        .frame(maxWidth: .infinity)
    }
}
