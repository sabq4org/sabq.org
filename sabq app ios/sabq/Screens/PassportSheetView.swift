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
                VStack(spacing: 0) {
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
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space16)
                .padding(.bottom, SabqLayout.space32)
            }
            .background(SabqTheme.background)
            .navigationTitle("جواز المحتوى")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let url = passportURL {
                        HStack(spacing: SabqLayout.space4) {
                            Button {
                                isQRPresented = true
                            } label: {
                                Image(systemName: "qrcode")
                                    .font(SabqFonts.app(size: 18))
                                    .foregroundStyle(SabqTheme.textPrimary)
                            }
                            .accessibilityLabel("رمز QR")
                            ShareLink(item: url) {
                                Image(systemName: "square.and.arrow.up")
                                    .font(SabqFonts.app(size: 18))
                                    .foregroundStyle(SabqTheme.textPrimary)
                            }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(SabqFonts.app(size: 18))
                            .foregroundStyle(SabqTheme.textPrimary)
                    }
                    .accessibilityLabel("إغلاق")
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
        VStack(spacing: SabqLayout.space16) {
            SkeletonBox(height: 100, radius: SabqTheme.tileRadius)
            SkeletonBox(height: 160, radius: SabqTheme.tileRadius)
            SkeletonBox(height: 200, radius: SabqTheme.tileRadius)
        }
    }

    private func errorState(_ message: String) -> some View {
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: "exclamationmark.shield")
                .font(SabqFonts.app(size: 48, weight: .ultraLight))
                .foregroundStyle(SabqTheme.textTertiary)
                .accessibilityHidden(true)
            Text("تعذّر تحميل جواز المحتوى")
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
            Text(message)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                Task { await load() }
            } label: {
                Text("إعادة المحاولة")
                    .sabqText(SabqType.button)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(SabqTheme.actionFill,
                                in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, SabqLayout.space4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space40)
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
        VStack(spacing: SabqLayout.space12) {
            Image(systemName: tierIcon)
                .font(SabqFonts.app(size: 40, weight: .light))
                .foregroundStyle(tierColor)
                .frame(height: 56)
                .accessibilityHidden(true)

            VStack(spacing: SabqLayout.space8) {
                Text(badge.label.ar)
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.center)

                if let score = badge.credibilityScore {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "shield.checkered")
                            .sabqText(SabqType.tag)
                        Text("درجة المصداقية: \(formatScore(score))")
                            .sabqText(SabqType.metaEmphasis)
                            .monospacedDigit()
                    }
                    .foregroundStyle(tierColor)
                }

                if let verifiedAt, !verifiedAt.isEmpty {
                    Text("تم التحقّق في \(formatDate(verifiedAt))")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, SabqLayout.space24)
        .padding(.horizontal, SabqLayout.space16)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
        .padding(.bottom, SabqLayout.space8)
    }

    private var tierColor: Color {
        switch badge.tier {
        case "human_edited": return SabqTheme.success
        case "ai_assisted": return SabqTheme.primary
        case "ai_drafted_human_reviewed": return SabqTheme.warning
        default: return SabqTheme.primary
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
        VStack(alignment: .leading, spacing: SabqLayout.space16) {
            header

            totalBlock

            VStack(spacing: SabqLayout.space12) {
                row(
                    title: "النص",
                    accent: SabqTheme.primary,
                    icon: "sparkles",
                    pct: footprint.percentages.body,
                    primary: bodyTierLabel,
                    secondary: bodyMetadata,
                    helper: "النسبة تعكس مقدار مساهمة الذكاء الاصطناعي في صياغة النص."
                )
                row(
                    title: "الصورة",
                    accent: SabqTheme.primary,
                    icon: "photo",
                    pct: footprint.percentages.cover,
                    primary: footprint.cover.isAiGenerated ? "صورة مولّدة بالذكاء الاصطناعي" : "صورة من تصوير بشري",
                    secondary: coverMetadata,
                    helper: "تعكس النسبة ما إذا كانت الصورة الرئيسية مولّدة بالذكاء الاصطناعي."
                )
                row(
                    title: "SEO",
                    accent: SabqTheme.primary,
                    icon: "magnifyingglass",
                    pct: footprint.percentages.seo,
                    primary: footprint.seo.status ?? (footprint.percentages.seo == 0 ? "تحرير يدوي" : "—"),
                    secondary: seoMetadata,
                    helper: "النسبة تعكس مقدار اعتماد البيانات الوصفية على الذكاء الاصطناعي."
                )
            }
        }
        .padding(.top, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { PassportSectionRule() }
    }

    private var header: some View {
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "wand.and.stars")
                .font(SabqFonts.app(size: 18))
                .foregroundStyle(SabqTheme.primary)
                .accessibilityHidden(true)
            Text("بصمة الذكاء الاصطناعي")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
        }
    }

    private var totalBlock: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .firstTextBaseline) {
                Text("النسبة الإجمالية")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textSecondary)
                Spacer(minLength: 0)
                Text("\(footprint.percentages.total)%")
                    .sabqText(SabqType.leadTitle)
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.warning)
            }
            PassportSplitBar(aiPct: footprint.percentages.total)
            if !footprint.explanation.ar.isEmpty {
                Text(footprint.explanation.ar)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
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
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .top, spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 18))
                    .foregroundStyle(accent)
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(title)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text(primary)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    if let secondary, !secondary.isEmpty {
                        Text(secondary)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .lineLimit(2)
                    }
                }

                Spacer(minLength: 0)

                Text("\(pct)%")
                    .sabqText(SabqType.rowTitle)
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.warning)
            }

            PassportSplitBar(aiPct: pct)

            Text(helper)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textTertiary)
                .lineSpacing(2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
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
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                Text("المسؤولون عن المحتوى")
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)

                VStack(spacing: SabqLayout.space12) {
                    ForEach(rows.indices, id: \.self) { i in
                        personRow(label: rows[i].label, person: rows[i].person)
                        if i < rows.count - 1 {
                            Rectangle().fill(SabqTheme.separator).frame(height: 1)
                        }
                    }
                }
            }
            .padding(.top, SabqLayout.space24)
            .padding(.bottom, SabqLayout.space8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .top) { PassportSectionRule() }
        }
    }

    private func personRow(label: String, person: APIPassport.Person) -> some View {
        HStack(spacing: SabqLayout.space12) {
            avatar(person: person)
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                Text(person.displayName.isEmpty ? "—" : person.displayName)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .lineLimit(1)
                Text(label)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
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
            Circle().fill(SabqTheme.surfaceMuted)
            Text(initials(of: person.displayName))
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textSecondary)
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
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Text("المصدر")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: SabqLayout.space8) {
                Image(systemName: channelIcon)
                    .sabqText(SabqType.button)
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: SabqLayout.space4) {
                    Text(channelLabel)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                    if let raw = source.rawSource, !raw.isEmpty {
                        Text(raw)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textTertiary)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 0)
            }

            if isPublisherNews, let publisher {
                Rectangle().fill(SabqTheme.separator).frame(height: 1)
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "newspaper.fill")
                        .sabqText(SabqType.button)
                        .foregroundStyle(SabqTheme.primary)
                        .frame(width: 28)
                    Text(publisher.agencyName)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Spacer(minLength: 0)
                }
            }

            if let urlStr = source.sourceUrl, let url = URL(string: urlStr) {
                Link(destination: url) {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "arrow.up.right.square")
                            .sabqText(SabqType.tag)
                        Text("فتح المصدر الأصلي")
                            .sabqText(SabqType.metaEmphasis)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    .frame(minHeight: SabqLayout.touchTarget)
                }
            }
        }
        .padding(.top, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { PassportSectionRule() }
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

    private let columns: [GridItem] = SabqGrid.adaptive(spacing: 10)

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "photo.stack")
                    .font(SabqFonts.app(size: 18))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text("صور مولّدة بالذكاء الاصطناعي")
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Text("\(images.count)")
                    .sabqText(SabqType.metaEmphasis)
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.textTertiary)
            }

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(images) { img in
                    imageCell(img)
                }
            }
        }
        .padding(.top, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { PassportSectionRule() }
    }

    private func imageCell(_ img: APIPassport.AIImageGeneration) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            let urlStr = img.thumbnailUrl ?? img.imageUrl
            if let url = urlStr.flatMap(URL.init(string:)) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    placeholder
                }
                .aspectRatio(1, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
            } else {
                placeholder.aspectRatio(1, contentMode: .fit)
            }

            if let prompt = img.prompt, !prompt.isEmpty {
                Text(prompt)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .lineLimit(2)
            } else if !isStaff {
                HStack(spacing: SabqLayout.space4) {
                    Image(systemName: "lock.fill").sabqText(SabqType.meta)
                    Text("الـ prompt للموظّفين فقط").italic()
                        .sabqText(SabqType.meta)
                }
                .foregroundStyle(SabqTheme.textTertiary)
            }

            Text(img.model)
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textSecondary)
                .padding(.horizontal, SabqLayout.space8)
                .padding(.vertical, SabqLayout.space4)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
        }
    }

    private var placeholder: some View {
        SabqImagePlaceholder()
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous))
    }
}

// MARK: - SEO History (latest)

private struct PassportSEOHistoryCard: View {
    let entry: APIPassport.SEOHistoryEntry

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "magnifyingglass")
                    .font(SabqFonts.app(size: 18))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text("سجل تحسين الظهور (SEO)")
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Text("v\(entry.version)")
                    .sabqText(SabqType.tag)
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.textSecondary)
            }

            HStack(spacing: SabqLayout.space8) {
                Tag(entry.provider, tint: SabqTheme.textSecondary)
                Tag(entry.model, tint: SabqTheme.textSecondary)
                if entry.manualOverride == true {
                    Tag("تعديل يدوي", tint: SabqTheme.warning)
                }
            }

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                if let by = entry.generatedByName ?? entry.generatedBy {
                    Text("مُنشئ: \(by)")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Text(formatDate(entry.createdAt))
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
        }
        .padding(.top, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { PassportSectionRule() }
    }

    private struct Tag: View {
        let title: String
        let tint: Color
        init(_ title: String, tint: Color) { self.title = title; self.tint = tint }

        var body: some View {
            Text(title)
                .sabqText(SabqType.tag)
                .foregroundStyle(tint)
                .padding(.horizontal, SabqLayout.space8)
                .padding(.vertical, SabqLayout.space4)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
        }
    }
}

// MARK: - Timeline

private struct PassportTimelineCard: View {
    let events: [APIPassport.TimelineEvent]
    let isStaff: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "clock.arrow.circlepath")
                    .font(SabqFonts.app(size: 18))
                    .foregroundStyle(SabqTheme.primary)
                    .accessibilityHidden(true)
                Text("سجل أحداث الخبر")
                    .sabqText(SabqType.sectionHeading)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
            }

            if events.isEmpty {
                Text("لا توجد أحداث مسجّلة بعد.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(events.enumerated()), id: \.element.id) { idx, event in
                        timelineRow(event: event, isLast: idx == events.count - 1)
                    }
                }
            }
        }
        .padding(.top, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { PassportSectionRule() }
    }

    private func timelineRow(event: APIPassport.TimelineEvent, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: SabqLayout.space12) {
            VStack(spacing: 0) {
                Circle()
                    .fill(SabqTheme.primary)
                    .frame(width: 12, height: 12)
                    .overlay(
                        Circle().stroke(SabqTheme.background, lineWidth: 2)
                    )
                if !isLast {
                    Rectangle()
                        .fill(SabqTheme.separator)
                        .frame(width: 1)
                        .frame(maxHeight: .infinity)
                }
            }
            .frame(width: 14)

            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    Text(eventLabel(event.eventType))
                        .sabqText(SabqType.tag)
                        .padding(.horizontal, SabqLayout.space8)
                        .padding(.vertical, SabqLayout.space4)
                        .foregroundStyle(SabqTheme.primary)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )

                    Text(sourceLabel(event.source))
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .padding(.horizontal, SabqLayout.space8)
                        .padding(.vertical, SabqLayout.space4)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .stroke(SabqTheme.outline, lineWidth: 1)
                        )

                    Spacer(minLength: 0)

                    Text(formatDate(event.createdAt))
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textTertiary)
                }

                if let summary = event.summary, !summary.isEmpty {
                    Text(summary)
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if let actor = event.actor {
                    HStack(spacing: SabqLayout.space8) {
                        ZStack {
                            Circle().fill(SabqTheme.surfaceMuted)
                            Text(String(actor.displayName.prefix(1)))
                                .sabqText(SabqType.tag)
                                .foregroundStyle(SabqTheme.textSecondary)
                        }
                        .frame(width: 24, height: 24)

                        Text(actor.displayName.isEmpty ? "—" : actor.displayName)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                    }
                }

                if isStaff, let details = event.details, !details.isEmpty {
                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: SabqLayout.space4) {
                            ForEach(details.keys.sorted(), id: \.self) { key in
                                Text("\(key): \(details[key]?.displayString ?? "—")")
                                    .sabqText(SabqType.meta)
                                    .foregroundStyle(SabqTheme.textSecondary)
                                    .lineLimit(3)
                            }
                        }
                        .padding(SabqLayout.space8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                .fill(SabqTheme.surfaceMuted)
                        )
                    } label: {
                        HStack(spacing: SabqLayout.space4) {
                            Image(systemName: "lock.fill").sabqText(SabqType.meta)
                            Text("تفاصيل التغيير (للموظّفين)")
                                .sabqText(SabqType.meta)
                        }
                        .foregroundStyle(SabqTheme.textTertiary)
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
            VStack(spacing: SabqLayout.space16) {
                Text("امسح الرمز لفتح جواز المحتوى")
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)

                ZStack {
                    // QR stays on white in both modes so scanners read it.
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(Color.white)
                        .frame(width: 240, height: 240)
                        .overlay(
                            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                                .stroke(SabqTheme.outline, lineWidth: 1)
                        )

                    if let qrImage {
                        Image(uiImage: qrImage)
                            .interpolation(.none)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 200, height: 200)
                    } else {
                        ProgressView().tint(SabqTheme.primary)
                    }
                }

                Text(url.absoluteString)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, SabqLayout.space24)
                    .textSelection(.enabled)

                ShareLink(item: url) {
                    HStack(spacing: SabqLayout.space8) {
                        Image(systemName: "square.and.arrow.up")
                        Text("مشاركة الرابط")
                    }
                    .sabqText(SabqType.button)
                    .foregroundStyle(SabqTheme.onAction)
                    .padding(.horizontal, SabqLayout.space24)
                    .frame(minHeight: SabqLayout.controlHeight)
                    .background(SabqTheme.actionFill,
                                in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                }

                Spacer()
            }
            .padding(.top, SabqLayout.space32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(SabqTheme.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("تم") { dismiss() }
                        .foregroundStyle(SabqTheme.primary)
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

// MARK: - Section rule

/// Thin separator above each unboxed passport section.
private struct PassportSectionRule: View {
    var body: some View {
        Rectangle()
            .fill(SabqTheme.separator)
            .frame(height: 1)
            .accessibilityHidden(true)
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
