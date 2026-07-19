import SwiftUI

struct PassportSheetView: View {
    let slug: String

    @Environment(\.dismiss) private var dismiss
    @State private var passport: APIPassport?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var isQRPresented = false

    private var passportURL: URL? {
        URL(string: "https://sabq.org/article/\(slug)/passport")
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if isLoading {
                        loadingState
                    } else if let errorMessage {
                        errorState(errorMessage)
                    } else if let passport {
                        PassportTrustHeader(badge: passport.trustBadge,
                                            verifiedAt: passport.article.verifiedAt)
                        PassportAIFootprintCard(footprint: passport.aiFootprint,
                                                isStaff: passport.viewer.isStaff)
                        PassportPeopleCard(people: passport.people,
                                           publisher: passport.publisher)
                        PassportSourceCard(source: passport.source,
                                           publisher: passport.publisher,
                                           isPublisherNews: passport.article.isPublisherNews)
                        if !passport.aiImageGenerations.isEmpty {
                            PassportAIImagesCard(images: passport.aiImageGenerations,
                                                 isStaff: passport.viewer.isStaff)
                        }
                        if let seo = passport.seoHistoryLatest {
                            PassportSEOHistoryCard(entry: seo)
                        }
                        PassportTimelineCard(events: passport.timeline,
                                             isStaff: passport.viewer.isStaff)
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .navigationTitle("جواز المحتوى")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let url = passportURL {
                        HStack(spacing: 4) {
                            Button {
                                isQRPresented = true
                            } label: {
                                Image(systemName: "qrcode")
                                    .font(SabqFonts.app(size: 18, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                            }
                            ShareLink(item: url) {
                                Image(systemName: "square.and.arrow.up")
                                    .font(SabqFonts.app(size: 18, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                            }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .sheet(isPresented: $isQRPresented) {
                if let url = passportURL {
                    PassportQRSheet(url: url)
                }
            }
        }
        .sabqRTL()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .task { await load() }
    }

    private var loadingState: some View {
        VStack(spacing: 14) {
            SkeletonBox(height: 100, radius: SabqTheme.tileRadius)
            SkeletonBox(height: 160, radius: SabqTheme.tileRadius)
            SkeletonBox(height: 200, radius: SabqTheme.tileRadius)
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.shield")
                .font(SabqFonts.app(size: 48, weight: .ultraLight))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("تعذّر تحميل جواز المحتوى")
                .font(SabqFonts.app(size: 16, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Text(message)
                .font(SabqFonts.app(size: 13))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
            Button("إعادة المحاولة") {
                Task { await load() }
            }
            .buttonStyle(.borderedProminent)
            .tint(SabqTheme.primaryEnd)
            .padding(.top, 4)
        }
        .padding(.vertical, 40)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        do {
            passport = try await APIClient.shared.fetchPassport(slug: slug)
        } catch {
            errorMessage = "تحقّق من الاتصال ثم أعد المحاولة."
        }
        isLoading = false
    }
}

// MARK: - Trust Header

private struct PassportTrustHeader: View {
    let badge: APIPassport.TrustBadge
    let verifiedAt: String?

    var body: some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(tierColor.opacity(0.12))
                    .frame(width: 88, height: 88)
                Image(systemName: tierIcon)
                    .font(SabqFonts.app(size: 40, weight: .light))
                    .foregroundStyle(tierColor)
            }

            VStack(spacing: 6) {
                Text(badge.label.ar)
                    .font(SabqFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.center)

                if let score = badge.credibilityScore {
                    HStack(spacing: 6) {
                        Image(systemName: "shield.checkered")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                        Text("درجة المصداقية: \(formatScore(score))")
                            .font(SabqFonts.app(size: 13, weight: .semibold))
                            .monospacedDigit()
                    }
                    .foregroundStyle(tierColor)
                }

                if let verifiedAt, !verifiedAt.isEmpty {
                    Text("تم التحقّق في \(formatDate(verifiedAt))")
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 22)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tierColor.opacity(0.25), lineWidth: 1)
        )
    }

    private var tierColor: Color {
        switch badge.tier {
        case "human_edited": return Color(red: 0.16, green: 0.68, blue: 0.40)
        case "ai_assisted": return Color(red: 0.20, green: 0.50, blue: 0.92)
        case "ai_drafted_human_reviewed": return Color(red: 0.95, green: 0.60, blue: 0.10)
        default: return SabqTheme.primaryEnd
        }
    }

    private var tierIcon: String {
        switch badge.tier {
        case "human_edited": return "checkmark.shield.fill"
        case "ai_assisted": return "wand.and.stars"
        case "ai_drafted_human_reviewed": return "sparkles.rectangle.stack"
        default: return "shield.fill"
        }
    }

    private func formatScore(_ score: Double) -> String {
        let pct = score > 1 ? score : score * 100
        return "\(Int(pct.rounded()))%"
    }

    private func formatDate(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let date else { return iso }
        let out = DateFormatter()
        out.locale = Locale(identifier: "ar")
        out.dateStyle = .medium
        out.timeStyle = .short
        return out.string(from: date)
    }
}

// MARK: - AI Footprint
// Mirrors the web's "AI Footprint" card (ArticlePassportPage.tsx ~line 700):
// total bar at the top with explanation, then 3 detail rows (body / cover / seo),
// each with its accent colour, tier description, surface-specific metadata
// (edit count / model / provider), and its own SplitBar.

private struct PassportAIFootprintCard: View {
    let footprint: APIPassport.AIFootprint
    let isStaff: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header

            totalBlock

            VStack(spacing: 10) {
                row(
                    title: "النص",
                    accent: Color(red: 0.20, green: 0.50, blue: 0.92),
                    icon: "sparkles",
                    pct: footprint.percentages.body,
                    primary: bodyTierLabel,
                    secondary: bodyMetadata,
                    helper: "النسبة تعكس مقدار مساهمة الذكاء الاصطناعي في صياغة النص."
                )
                row(
                    title: "الصورة",
                    accent: Color(red: 0.62, green: 0.36, blue: 0.92),
                    icon: "photo",
                    pct: footprint.percentages.cover,
                    primary: footprint.cover.isAiGenerated ? "صورة مولّدة بالذكاء الاصطناعي" : "صورة من تصوير بشري",
                    secondary: coverMetadata,
                    helper: "تعكس النسبة ما إذا كانت الصورة الرئيسية مولّدة بالذكاء الاصطناعي."
                )
                row(
                    title: "SEO",
                    accent: Color(red: 0.16, green: 0.68, blue: 0.40),
                    icon: "magnifyingglass",
                    pct: footprint.percentages.seo,
                    primary: footprint.seo.status ?? (footprint.percentages.seo == 0 ? "تحرير يدوي" : "—"),
                    secondary: seoMetadata,
                    helper: "النسبة تعكس مقدار اعتماد البيانات الوصفية على الذكاء الاصطناعي."
                )
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "wand.and.stars")
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(Color(red: 0.20, green: 0.50, blue: 0.92))
            Text("بصمة الذكاء الاصطناعي")
                .font(SabqFonts.app(size: 15, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
            Spacer(minLength: 0)
        }
    }

    private var totalBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text("النسبة الإجمالية")
                    .font(SabqFonts.app(size: 13, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                Spacer(minLength: 0)
                Text("\(footprint.percentages.total)%")
                    .font(SabqFonts.app(size: 22, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(Color(red: 0.96, green: 0.62, blue: 0.04))
            }
            PassportSplitBar(aiPct: footprint.percentages.total)
            if !footprint.explanation.ar.isEmpty {
                Text(footprint.explanation.ar)
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.paleFill.opacity(0.5))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
    }

    private func row(
        title: String,
        accent: Color,
        icon: String,
        pct: Int,
        primary: String,
        secondary: String?,
        helper: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(accent.opacity(0.15))
                    Image(systemName: icon)
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(accent)
                }
                .frame(width: 36, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(SabqFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                    Text(primary)
                        .font(SabqFonts.app(size: 11, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                    if let secondary, !secondary.isEmpty {
                        Text(secondary)
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)

                Text("\(pct)%")
                    .font(SabqFonts.app(size: 14, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(Color(red: 0.96, green: 0.62, blue: 0.04))
            }

            PassportSplitBar(aiPct: pct)

            Text(helper)
                .font(SabqFonts.app(size: 10))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(accent.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(accent.opacity(0.25), lineWidth: 0.5)
        )
    }

    // MARK: tier + metadata helpers

    private var bodyTierLabel: String {
        switch footprint.body.tier {
        case "human": return "كتابة بشرية"
        case "assisted": return "بمساعدة الذكاء الاصطناعي"
        case "ai_drafted": return "مسودة بالذكاء الاصطناعي"
        default: return footprint.body.tier
        }
    }

    private var bodyMetadata: String? {
        let count = footprint.body.aiEditCount
        return count > 0 ? "\(count) تعديل بالذكاء الاصطناعي" : nil
    }

    private var coverMetadata: String? {
        guard footprint.cover.isAiGenerated else { return nil }
        var parts: [String] = []
        if let model = footprint.cover.model, !model.isEmpty { parts.append(model) }
        // Cover prompt is staff-only — show as a tinted italic line so the
        // editor can verify exactly which prompt produced the image.
        if isStaff, let prompt = footprint.cover.prompt, !prompt.isEmpty {
            parts.append("«\(prompt)»")
        }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private var seoMetadata: String? {
        var parts: [String] = []
        if let provider = footprint.seo.provider, !provider.isEmpty { parts.append(provider) }
        if let model = footprint.seo.model, !model.isEmpty { parts.append(model) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

// MARK: - People

private struct PassportPeopleCard: View {
    let people: APIPassport.People
    let publisher: APIPassport.Publisher?

    private var rows: [(label: String, person: APIPassport.Person)] {
        // Match the web passport (`ArticlePassportPage.tsx`): the public-facing
        // people list is built from submitter/reporter/reviewer/verifier/
        // publisherApprover. `people.author` (= `articles.authorId`, the staff
        // member who entered the article into the dashboard) is intentionally
        // omitted because it's an internal audit field, not a byline.
        var out: [(String, APIPassport.Person)] = []
        if let p = people.reporter { out.append(("مراسل", p)) }
        if let p = people.submitter, p.id != people.reporter?.id {
            out.append(("أرسل", p))
        }
        if let p = people.reviewer { out.append(("مُراجِع", p)) }
        if let p = people.verifier { out.append(("محقّق", p)) }
        if let p = people.publisherApprover { out.append(("اعتماد الوكالة", p)) }
        return out
    }

    var body: some View {
        if rows.isEmpty && publisher == nil {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 14) {
                Text("المسؤولون عن المحتوى")
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)

                VStack(spacing: 12) {
                    ForEach(rows.indices, id: \.self) { i in
                        personRow(label: rows[i].label, person: rows[i].person)
                        if i < rows.count - 1 {
                            Divider().foregroundStyle(SabqTheme.outline.opacity(0.5))
                        }
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
    }

    private func personRow(label: String, person: APIPassport.Person) -> some View {
        HStack(spacing: 12) {
            avatar(person: person)
            VStack(alignment: .leading, spacing: 2) {
                Text(person.displayName.isEmpty ? "—" : person.displayName)
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                    .lineLimit(1)
                Text(label)
                    .font(SabqFonts.app(size: 11, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            Spacer(minLength: 0)
        }
    }

    private func avatar(person: APIPassport.Person) -> some View {
        Group {
            if let url = person.profileImageUrl.flatMap(URL.init(string:)) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    initialsPlaceholder(person: person)
                }
                .frame(width: 36, height: 36)
                .clipShape(Circle())
            } else {
                initialsPlaceholder(person: person)
                    .frame(width: 36, height: 36)
                    .clipShape(Circle())
            }
        }
    }

    private func initialsPlaceholder(person: APIPassport.Person) -> some View {
        ZStack {
            Circle().fill(SabqTheme.paleFill)
            Text(initials(of: person.displayName))
                .font(SabqFonts.app(size: 13, weight: .bold))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
    }

    private func initials(of name: String) -> String {
        let parts = name.split(separator: " ")
        let firsts = parts.prefix(2).compactMap { $0.first }
        return String(firsts).uppercased()
    }
}

// MARK: - Source

private struct PassportSourceCard: View {
    let source: APIPassport.Source
    let publisher: APIPassport.Publisher?
    let isPublisherNews: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("المصدر")
                .font(SabqFonts.app(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            HStack(spacing: 10) {
                Image(systemName: channelIcon)
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 2) {
                    Text(channelLabel)
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    if let raw = source.rawSource, !raw.isEmpty {
                        Text(raw)
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
            }

            if isPublisherNews, let publisher {
                Divider().foregroundStyle(SabqTheme.outline.opacity(0.5))
                HStack(spacing: 10) {
                    Image(systemName: "newspaper.fill")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .frame(width: 28)
                    Text(publisher.agencyName)
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer(minLength: 0)
                }
            }

            if let urlStr = source.sourceUrl, let url = URL(string: urlStr) {
                Link(destination: url) {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.up.right.square")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                        Text("فتح المصدر الأصلي")
                            .font(SabqFonts.app(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private var channelLabel: String {
        switch source.channel {
        case "manual": return "تحرير يدوي"
        case "email": return "وارد عبر البريد الإلكتروني"
        case "whatsapp": return "وارد عبر واتساب"
        case "publisher": return "وكالة أنباء"
        case "external": return "مصدر خارجي"
        default: return source.channel
        }
    }

    private var channelIcon: String {
        switch source.channel {
        case "manual": return "pencil.line"
        case "email": return "envelope.fill"
        case "whatsapp": return "message.fill"
        case "publisher": return "newspaper.fill"
        case "external": return "arrow.up.right.square"
        default: return "doc.text"
        }
    }
}

// MARK: - AI Image Generations

private struct PassportAIImagesCard: View {
    let images: [APIPassport.AIImageGeneration]
    let isStaff: Bool

    private let columns: [GridItem] = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "photo.stack")
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(Color(red: 0.62, green: 0.36, blue: 0.92))
                Text("صور مولّدة بالذكاء الاصطناعي")
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
                Text("\(images.count)")
                    .font(SabqFonts.app(size: 13, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(images) { img in
                    imageCell(img)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private func imageCell(_ img: APIPassport.AIImageGeneration) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            let urlStr = img.thumbnailUrl ?? img.imageUrl
            if let url = urlStr.flatMap(URL.init(string:)) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    placeholder
                }
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous))
            } else {
                placeholder.aspectRatio(1, contentMode: .fit)
            }

            if let prompt = img.prompt, !prompt.isEmpty {
                Text(prompt)
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(2)
            } else if !isStaff {
                HStack(spacing: 4) {
                    Image(systemName: "lock.fill").font(SabqFonts.app(size: 9))
                    Text("الـ prompt للموظّفين فقط").italic()
                        .font(SabqFonts.app(size: 11))
                }
                .foregroundStyle(SabqTheme.tertiaryInk)
            }

            Text(img.model)
                .font(SabqFonts.app(size: 10, weight: .semibold))
                .foregroundStyle(SabqTheme.secondaryInk)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(
                    Capsule().fill(SabqTheme.paleFill)
                )
                .overlay(
                    Capsule().stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
                )
        }
    }

    private var placeholder: some View {
        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
            .fill(SabqTheme.paleFill)
            .overlay(
                Image(systemName: "photo")
                    .font(SabqFonts.app(size: 24, weight: .ultraLight))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            )
    }
}

// MARK: - SEO History (latest)

private struct PassportSEOHistoryCard: View {
    let entry: APIPassport.SEOHistoryEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(Color(red: 0.16, green: 0.68, blue: 0.40))
                Text("سجل تحسين الظهور (SEO)")
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
                Text("v\(entry.version)")
                    .font(SabqFonts.app(size: 12, weight: .heavy))
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.secondaryInk)
            }

            HStack(spacing: 6) {
                Tag(entry.provider, tint: Color(red: 0.16, green: 0.68, blue: 0.40))
                Tag(entry.model, tint: SabqTheme.secondaryInk)
                if entry.manualOverride == true {
                    Tag("تعديل يدوي", tint: Color(red: 0.96, green: 0.62, blue: 0.04))
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                if let by = entry.generatedByName ?? entry.generatedBy {
                    Text("مُنشئ: \(by)")
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }
                Text(formatDate(entry.createdAt))
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private struct Tag: View {
        let title: String
        let tint: Color
        init(_ title: String, tint: Color) { self.title = title; self.tint = tint }

        var body: some View {
            Text(title)
                .font(SabqFonts.app(size: 11, weight: .semibold))
                .foregroundStyle(tint)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Capsule().fill(tint.opacity(0.10)))
                .overlay(Capsule().stroke(tint.opacity(0.30), lineWidth: 0.5))
        }
    }
}

// MARK: - Timeline

private struct PassportTimelineCard: View {
    let events: [APIPassport.TimelineEvent]
    let isStaff: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                Text("سجل أحداث الخبر")
                    .font(SabqFonts.app(size: 14, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
            }

            if events.isEmpty {
                Text("لا توجد أحداث مسجّلة بعد.")
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(events.enumerated()), id: \.element.id) { idx, event in
                        timelineRow(event: event, isLast: idx == events.count - 1)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )
    }

    private func timelineRow(event: APIPassport.TimelineEvent, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 0) {
                Circle()
                    .fill(SabqTheme.primaryEnd)
                    .frame(width: 11, height: 11)
                    .overlay(
                        Circle().stroke(SabqTheme.background, lineWidth: 2)
                    )
                if !isLast {
                    Rectangle()
                        .fill(SabqTheme.outline.opacity(0.5))
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 14)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text(eventLabel(event.eventType))
                        .font(SabqFonts.app(size: 11, weight: .bold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .background(Capsule().fill(SabqTheme.primaryEnd.opacity(0.10)))

                    Text(sourceLabel(event.source))
                        .font(SabqFonts.app(size: 10, weight: .medium))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Capsule().stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5))

                    Spacer(minLength: 0)

                    Text(formatDate(event.createdAt))
                        .font(SabqFonts.app(size: 10))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }

                if let summary = event.summary, !summary.isEmpty {
                    Text(summary)
                        .font(SabqFonts.app(size: 12))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let actor = event.actor {
                    HStack(spacing: 6) {
                        ZStack {
                            Circle().fill(SabqTheme.paleFill)
                            Text(String(actor.displayName.prefix(1)))
                                .font(SabqFonts.app(size: 9, weight: .bold))
                                .foregroundStyle(SabqTheme.secondaryInk)
                        }
                        .frame(width: 20, height: 20)

                        Text(actor.displayName.isEmpty ? "—" : actor.displayName)
                            .font(SabqFonts.app(size: 11, weight: .medium))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                }

                if isStaff, let details = event.details, !details.isEmpty {
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 3) {
                            ForEach(details.keys.sorted(), id: \.self) { key in
                                Text("\(key): \(details[key]?.displayString ?? "—")")
                                    .font(SabqFonts.app(size: 10))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                    .lineLimit(3)
                            }
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(SabqTheme.paleFill.opacity(0.5))
                        )
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "lock.fill").font(SabqFonts.app(size: 9))
                            Text("تفاصيل التغيير (للموظّفين)")
                                .font(SabqFonts.app(size: 11))
                        }
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .padding(.bottom, isLast ? 0 : 14)
        }
    }

    private func eventLabel(_ type: String) -> String {
        switch type {
        case "created", "create": return "تم الإنشاء"
        case "submitted": return "تم الإرسال"
        case "approved", "approve": return "تم الاعتماد"
        case "rejected", "reject": return "تم الرفض"
        case "published", "publish": return "تم النشر"
        case "updated", "update": return "تم التحديث"
        case "verified", "verify": return "تم التحقق"
        case "unpublish": return "تم إلغاء النشر"
        default: return type
        }
    }

    private func sourceLabel(_ source: String) -> String {
        switch source {
        case "article_events": return "سجل الأحداث"
        case "audit_log": return "سجل التدقيق"
        case "synthetic": return "مُستنتج"
        default: return source
        }
    }
}

// MARK: - QR Sheet

private struct PassportQRSheet: View {
    let url: URL

    @Environment(\.dismiss) private var dismiss
    @State private var qrImage: UIImage?

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                Text("امسح الرمز لفتح جواز المحتوى")
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)

                ZStack {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(.white)
                        .frame(width: 240, height: 240)
                        .shadow(color: .black.opacity(0.08), radius: 14, x: 0, y: 6)

                    if let qrImage {
                        Image(uiImage: qrImage)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 200, height: 200)
                    } else {
                        ProgressView().tint(SabqTheme.primaryEnd)
                    }
                }

                Text(url.absoluteString)
                    .font(SabqFonts.app(size: 11))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .textSelection(.enabled)

                ShareLink(item: url) {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.up")
                        Text("مشاركة الرابط")
                    }
                    .font(SabqFonts.app(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Capsule().fill(SabqTheme.primaryEnd))
                }

                Spacer()
            }
            .padding(.top, 30)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(SabqTheme.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("تم") { dismiss() }
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
            }
        }
        .sabqRTL()
        .presentationDetents([.medium])
        .task {
            qrImage = PassportQRSheet.makeQR(from: url.absoluteString)
        }
    }

    /// Generate a high-DPI QR via CoreImage. `interpolation: .none` upstream
    /// keeps the modules crisp when scaled.
    static func makeQR(from string: String) -> UIImage? {
        let data = Data(string.utf8)
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(data, forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

// MARK: - Shared date formatter

private func formatDate(_ iso: String) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return iso }
    let out = DateFormatter()
    out.locale = Locale(identifier: "ar")
    out.dateStyle = .medium
    out.timeStyle = .short
    return out.string(from: date)
}
