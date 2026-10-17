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

struct AITeamView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var payload: APIAITeam?
    @State private var isLoading = true
    @State private var loadError: String?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                if let payload, payload.isRenderable {
                    band(payload)
                } else if isLoading {
                    SkeletonBox(height: 320, radius: SabqRadius.medium)
                        .padding(SabqLayout.pageMargin)
                } else {
                    EmptyStateView(
                        icon: "person.3",
                        tint: SabqTheme.textSecondary,
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
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text("داخل عقل سبق")
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.primary)
                    .textCase(nil)
                Text("فريق سبق الذكي")
                    .sabqText(SabqType.articleTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text("أول غرفة أخبار سعودية تعرّفك بزملائها الرقميين بأسمائهم وأدوارهم — يعملون على مدار الساعة، ولا يُنشر لهم حرف قبل اعتماد محرر بشري.")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            counters(p)

            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(p.team.enumerated()), id: \.element.id) { index, m in
                    if index > 0 {
                        Rectangle().fill(SabqTheme.separator).frame(height: 1)
                    }
                    memberRow(m)
                }
            }

            Text("🛡 الإنسان يعتمد كل شيء — سياسة سبق للذكاء الاصطناعي")
                .font(SabqType.metaEmphasis.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, SabqLayout.space16)
                .padding(.vertical, SabqLayout.space12)
                .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }
        .padding(.horizontal, SabqLayout.pageMargin)
        .padding(.vertical, SabqLayout.space24)
        .frame(maxWidth: .infinity)
    }

    private func memberRow(_ m: APIAITeamMember) -> some View {
        HStack(spacing: SabqLayout.space12) {
            ZStack {
                Circle().fill(SabqTheme.surfaceMuted)
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
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(m.nameAr)
                    .font(SabqType.rowTitle.font)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Text(m.titleAr)
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(1)
                Text(m.departmentAr)
                    .font(SabqType.tag.font)
                    .foregroundStyle(SabqTheme.primary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, SabqLayout.space12)
        .accessibilityElement(children: .combine)
    }

    private func initial(_ name: String) -> some View {
        Text(String(name.prefix(1)))
            .font(SabqType.button.font)
            .foregroundStyle(SabqTheme.textSecondary)
    }

    private func counters(_ p: APIAITeam) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space8) {
            if let ops = p.counters?.monthOps, ops > 0 {
                counter(value: EconomyFormat.trimNum(Double(ops), 0), label: "عملًا هذا الشهر")
            }
            counter(value: EconomyFormat.trimNum(Double(p.counters?.teamCount ?? p.team.count), 0), label: "زميلًا رقميًا")
            counter(value: "100%", label: "تحت إشراف بشري")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space16)
        .background(SabqTheme.surfaceMuted, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
    }

    private func counter(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(SabqType.leadTitle.font)
                .foregroundStyle(SabqTheme.textPrimary)
                .monospacedDigit()
                .environment(\.layoutDirection, .leftToRight)
            Text(label)
                .font(SabqType.meta.font)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}
