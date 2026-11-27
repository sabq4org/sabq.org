import SwiftUI
import UIKit

// MARK: - Models (/api/v1/contributor/home)
//
// نظائر shared/writerNextStep.ts وWriterAnnouncementDto وWriterSlotChangeState.

nonisolated struct WriterNextStepModel: Decodable, Equatable {
    let kind: String
    let tone: String
    let title: String
    let body: String?
    let action: String
    let actionLabel: String?
    let articleId: String?
    let announcementId: String?
}

nonisolated struct WriterAnnouncementFile: Decodable, Equatable {
    let id: String
    let title: String
}

nonisolated struct WriterAnnouncementModel: Decodable, Identifiable, Equatable {
    let id: String
    let kind: String
    let title: String
    let body: String?
    let linkUrl: String?
    let file: WriterAnnouncementFile?
    let pollOptions: [String]
    let pollCounts: [Int]?
    let myVote: Int?
    let acted: Bool
    let seen: Bool
    let expiresAt: String

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        id = try c.decode(String.self, forKey: FlexKey("id"))
        kind = (try? c.decode(String.self, forKey: FlexKey("kind"))) ?? "note"
        title = (try? c.decode(String.self, forKey: FlexKey("title"))) ?? ""
        body = try? c.decode(String.self, forKey: FlexKey("body"))
        linkUrl = try? c.decode(String.self, forKey: FlexKey("linkUrl"))
        file = try? c.decode(WriterAnnouncementFile.self, forKey: FlexKey("file"))
        pollOptions = (try? c.decode([String].self, forKey: FlexKey("pollOptions"))) ?? []
        pollCounts = try? c.decode([Int].self, forKey: FlexKey("pollCounts"))
        myVote = try? c.decode(Int.self, forKey: FlexKey("myVote"))
        acted = (try? c.decode(Bool.self, forKey: FlexKey("acted"))) ?? false
        seen = (try? c.decode(Bool.self, forKey: FlexKey("seen"))) ?? false
        expiresAt = (try? c.decode(String.self, forKey: FlexKey("expiresAt"))) ?? ""
    }
}

nonisolated struct WriterSlotRound: Decodable, Equatable {
    let id: String
    let closesAt: String?
    let note: String?
}

nonisolated struct WriterSlotCurrent: Decodable, Equatable {
    let weekday: Int
    let publishTime: String
}

nonisolated struct WriterSlotChangeState: Decodable, Equatable {
    let round: WriterSlotRound?
    let current: WriterSlotCurrent?
    let canChange: Bool
    let dayLoads: [Int]?
    let cap: Int

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        round = try? c.decode(WriterSlotRound.self, forKey: FlexKey("round"))
        current = try? c.decode(WriterSlotCurrent.self, forKey: FlexKey("current"))
        canChange = (try? c.decode(Bool.self, forKey: FlexKey("canChange"))) ?? false
        dayLoads = try? c.decode([Int].self, forKey: FlexKey("dayLoads"))
        cap = (try? c.decode(Int.self, forKey: FlexKey("cap"))) ?? 20
    }
}

nonisolated struct WriterHomeModel: Decodable {
    let nextStep: WriterNextStepModel?
    let announcements: [WriterAnnouncementModel]
    let slotChange: WriterSlotChangeState?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        nextStep = try? c.decode(WriterNextStepModel.self, forKey: FlexKey("nextStep"))
        announcements = (try? c.decode([WriterAnnouncementModel].self, forKey: FlexKey("announcements"))) ?? []
        slotChange = try? c.decode(WriterSlotChangeState.self, forKey: FlexKey("slotChange"))
    }
}

nonisolated struct WriterFileLink: Decodable {
    let url: String
}

nonisolated struct WriterSocialProposalStatus: Decodable {
    let eligible: Bool
    let reason: String?
    let remainingMs: Double
    let existingText: String?
    let existingStatus: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        eligible = (try? c.decode(Bool.self, forKey: FlexKey("eligible"))) ?? false
        reason = try? c.decode(String.self, forKey: FlexKey("reason"))
        remainingMs = (try? c.decode(Double.self, forKey: FlexKey("remainingMs"))) ?? 0
        if let proposal = try? c.nestedContainer(keyedBy: FlexKey.self, forKey: FlexKey("existingProposal")) {
            existingText = try? proposal.decode(String.self, forKey: FlexKey("text"))
            existingStatus = try? proposal.decode(String.self, forKey: FlexKey("status"))
        } else {
            existingText = nil
            existingStatus = nil
        }
    }
}

nonisolated struct WriterOKResponse: Decodable {}

enum WriterWeekdays {
    static let names = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
    static func name(_ i: Int) -> String { names.indices.contains(i) ? names[i] : "" }
}

/// نافذة اقتراح منشور X: 72 ساعة من النشر (SOCIAL_POST_OPINION_WINDOW_MS).
func writerSocialWindowOpen(_ publishedAt: String?, now: Date = Date()) -> Bool {
    guard let publishedAt else { return false }
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = parser.date(from: publishedAt) ?? ISO8601DateFormatter().date(from: publishedAt) else { return false }
    let elapsed = now.timeIntervalSince(date)
    return elapsed >= 0 && elapsed < 72 * 60 * 60
}

// MARK: - «خطوتك التالية»

struct WriterNextStepCard: View {
    let step: WriterNextStepModel
    let onAction: () -> Void

    private var toneColor: Color {
        switch step.tone {
        case "warning": return SabqTheme.warning
        case "success": return SabqTheme.success
        default: return SabqTheme.primary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("خطوتك التالية")
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(toneColor)
            Text(step.title)
                .sabqText(SabqType.rowTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            if let body = step.body, !body.isEmpty {
                Text(body)
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let label = step.actionLabel, step.action != "none" {
                Button(action: onAction) {
                    Text(label)
                        .sabqText(SabqType.button)
                        .foregroundStyle(SabqTheme.onAction)
                        .padding(.horizontal, SabqLayout.space24)
                        .frame(minHeight: 44)
                        .background(Capsule().fill(SabqTheme.actionFill))
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, SabqLayout.space4)
            }
        }
        .padding(SabqLayout.space16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(LinearGradient(
                    colors: [Color(red: 0xE2 / 255, green: 0xF2 / 255, blue: 0xFD / 255),
                             Color(red: 0xEE / 255, green: 0xF1 / 255, blue: 0xFE / 255)],
                    startPoint: .topTrailing,
                    endPoint: .bottomLeading
                ))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(Color.white, lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
    }
}

// MARK: - الإعلانات المهمة

struct WriterAnnouncementsGroup: View {
    let items: [WriterAnnouncementModel]
    let onOpen: (WriterAnnouncementModel) -> Void
    let onVote: (WriterAnnouncementModel, Int) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            Text("إعلانات مهمة")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
            VStack(spacing: 0) {
                ForEach(items) { item in
                    if item.id != items.first?.id {
                        Divider().overlay(SabqTheme.separator)
                    }
                    row(item)
                }
            }
            .padding(.horizontal, SabqLayout.space16)
            .sabqBlockSurface()
        }
    }

    private func icon(for kind: String) -> String {
        switch kind {
        case "file": return "doc.text"
        case "form": return "list.bullet.clipboard"
        case "poll": return "chart.bar"
        case "link": return "link"
        default: return "megaphone"
        }
    }

    @ViewBuilder
    private func row(_ item: WriterAnnouncementModel) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(alignment: .center, spacing: SabqLayout.space12) {
                Image(systemName: icon(for: item.kind))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 36, height: 36)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(SabqTheme.surfaceMuted))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .lineLimit(2)
                    if let body = item.body, !body.isEmpty {
                        Text(body)
                            .sabqText(SabqType.meta)
                            .foregroundStyle(SabqTheme.textSecondary)
                            .lineLimit(3)
                    }
                }
                Spacer(minLength: SabqLayout.space8)
                if item.kind != "poll" && item.kind != "note" {
                    Button {
                        onOpen(item)
                    } label: {
                        Text(item.kind == "file" ? "فتح" : "افتح")
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(SabqTheme.primary)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .buttonStyle(.plain)
                }
            }
            if item.kind == "poll" {
                pollOptions(item)
            }
        }
        .padding(.vertical, SabqLayout.space12)
    }

    @ViewBuilder
    private func pollOptions(_ item: WriterAnnouncementModel) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            ForEach(Array(item.pollOptions.enumerated()), id: \.offset) { index, option in
                let selected = item.myVote == index
                Button {
                    onVote(item, index)
                } label: {
                    HStack {
                        Text(option)
                            .sabqText(SabqType.metaEmphasis)
                            .foregroundStyle(selected ? SabqTheme.onAction : SabqTheme.textPrimary)
                        Spacer(minLength: SabqLayout.space8)
                        if let counts = item.pollCounts, counts.indices.contains(index) {
                            Text("\(counts[index])")
                                .sabqText(SabqType.metaEmphasis)
                                .foregroundStyle(selected ? SabqTheme.onAction : SabqTheme.textSecondary)
                                .monospacedDigit()
                        }
                    }
                    .padding(.horizontal, SabqLayout.space16)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(selected ? SabqTheme.actionFill : SabqTheme.surfaceMuted))
                    .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selected ? [.isSelected] : [])
            }
        }
    }
}

// MARK: - فرصة تغيير اليوم الأسبوعي

struct WriterSlotChangeSheet: View {
    let state: WriterSlotChangeState
    let onDone: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var weekday: Int
    @State private var time: Date
    @State private var accepted = false
    @State private var saving = false
    @State private var errorText: String?
    @State private var doneText: String?

    init(state: WriterSlotChangeState, onDone: @escaping () -> Void) {
        self.state = state
        self.onDone = onDone
        _weekday = State(initialValue: state.current?.weekday ?? 0)
        var comps = DateComponents()
        let parts = (state.current?.publishTime ?? "19:00").split(separator: ":").compactMap { Int($0) }
        comps.hour = parts.first ?? 19
        comps.minute = parts.count > 1 ? parts[1] : 0
        _time = State(initialValue: Calendar.current.date(from: comps) ?? Date())
    }

    private var timeString: String {
        let c = Calendar.current.dateComponents([.hour, .minute], from: time)
        let minute = (c.minute ?? 0) < 30 ? 0 : 30
        return String(format: "%02d:%02d", c.hour ?? 19, minute)
    }

    var body: some View {
        NavigationStack {
            Form {
                if let current = state.current {
                    Section {
                        Text("يومك الحالي: \(WriterWeekdays.name(current.weekday)) · \(current.publishTime)")
                            .sabqText(SabqType.excerpt)
                    }
                }
                Section("اليوم الجديد") {
                    Picker("اليوم", selection: $weekday) {
                        ForEach(0..<7, id: \.self) { day in
                            let load = state.dayLoads?.indices.contains(day) == true ? state.dayLoads![day] : nil
                            let full = (load ?? 0) >= state.cap
                            Text(full ? "\(WriterWeekdays.name(day)) (مكتمل)" : WriterWeekdays.name(day))
                                .tag(day)
                        }
                    }
                    DatePicker("الوقت (بتوقيت الرياض)", selection: $time, displayedComponents: .hourAndMinute)
                        .environment(\.locale, Locale(identifier: "en_GB"))
                    Text("يُقرَّب الوقت إلى نصف الساعة: \(timeString)")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Section {
                    Toggle(isOn: $accepted) {
                        Text("أفهم أن التغيير مرة واحدة في هذه الفرصة، ولا يُلغى، وقد تعدّله الإدارة عند الازدحام.")
                            .sabqText(SabqType.meta)
                    }
                }
                if let note = state.round?.note, !note.isEmpty {
                    Section("ملاحظة الإدارة") { Text(note).sabqText(SabqType.meta) }
                }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(SabqTheme.danger).sabqText(SabqType.meta) }
                }
                if let doneText {
                    Section { Text(doneText).foregroundStyle(SabqTheme.success).sabqText(SabqType.metaEmphasis) }
                }
            }
            .navigationTitle("تغيير يومك الأسبوعي")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(doneText == nil ? "إلغاء" : "تم") {
                        if doneText != nil { onDone() }
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if doneText == nil {
                        Button {
                            Task { await save() }
                        } label: {
                            if saving { ProgressView() } else { Text("حفظ") }
                        }
                        .disabled(!accepted || saving)
                    }
                }
            }
        }
        .sabqRTL()
    }

    private func save() async {
        struct Body: Encodable { let weekday: Int; let time: String; let acceptedTerms: Bool }
        saving = true
        errorText = nil
        defer { saving = false }
        do {
            _ = try await APIClient.shared.post(
                WriterOKResponse.self,
                path: "/contributor/slot-change",
                body: Body(weekday: weekday, time: timeString, acceptedTerms: true)
            )
            doneText = "تم. موعدك الجديد \(WriterWeekdays.name(weekday)) \(timeString)."
            SabqHaptics.success()
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر حفظ الموعد الجديد، حاول مرة أخرى."
        }
    }
}

// MARK: - مقترح منشور X

struct WriterSocialProposalSheet: View {
    let articleId: String
    let articleTitle: String

    @Environment(\.dismiss) private var dismiss
    @State private var status: WriterSocialProposalStatus?
    @State private var loading = true
    @State private var text = ""
    @State private var useTitle = true
    @State private var sending = false
    @State private var resultText: String?
    @State private var errorText: String?

    private var hoursLeft: Int { Int(((status?.remainingMs ?? 0) / 3_600_000).rounded(.down)) }

    var body: some View {
        NavigationStack {
            Form {
                if loading {
                    ProgressView().frame(maxWidth: .infinity)
                } else if let status, !status.eligible {
                    Section {
                        Text(status.reason ?? "انتهت نافذة اقتراح المنشور لهذا المقال.")
                            .sabqText(SabqType.excerpt)
                    }
                } else {
                    Section {
                        Picker("نص المنشور", selection: $useTitle) {
                            Text("عنوان المقال").tag(true)
                            Text("نص من عندي").tag(false)
                        }
                        .pickerStyle(.segmented)
                        if useTitle {
                            Text(articleTitle).sabqText(SabqType.excerpt)
                        } else {
                            TextEditor(text: $text)
                                .frame(minHeight: 120)
                                .sabqText(SabqType.excerpt)
                        }
                    } footer: {
                        Text("يُرفق رابط المقال وصورته تلقائيًا، ويراجع فريق سبق المقترح قبل نشره. باقي \(hoursLeft) ساعة.")
                    }
                    if let existing = status?.existingText, !existing.isEmpty {
                        Section("مقترحك السابق") { Text(existing).sabqText(SabqType.meta) }
                    }
                }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(SabqTheme.danger).sabqText(SabqType.meta) }
                }
                if let resultText {
                    Section { Text(resultText).foregroundStyle(SabqTheme.success).sabqText(SabqType.metaEmphasis) }
                }
            }
            .navigationTitle("اقتراح منشور X")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(resultText == nil ? "إلغاء" : "تم") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if resultText == nil, status?.eligible == true {
                        Button {
                            Task { await send() }
                        } label: {
                            if sending { ProgressView() } else { Text("إرسال") }
                        }
                        .disabled(sending || (!useTitle && text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                    }
                }
            }
            .task { await load() }
        }
        .sabqRTL()
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            let s = try await APIClient.shared.get(
                WriterSocialProposalStatus.self,
                path: "/contributor/articles/\(articleId)/social-proposal",
                ignoreCache: true
            )
            status = s
            if let existing = s.existingText, !existing.isEmpty, existing != articleTitle {
                useTitle = false
                text = existing
            }
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر التحقق من حالة النشر الاجتماعي."
        }
    }

    private func send() async {
        struct Body: Encodable { let text: String; let textSource: String }
        sending = true
        errorText = nil
        defer { sending = false }
        let body = useTitle
            ? Body(text: articleTitle, textSource: "title")
            : Body(text: text.trimmingCharacters(in: .whitespacesAndNewlines), textSource: "custom")
        do {
            _ = try await APIClient.shared.post(
                WriterOKResponse.self,
                path: "/contributor/articles/\(articleId)/social-proposal",
                body: body
            )
            resultText = "وصل مقترحك لفريق سبق، وسيصلك تنبيه حين يُنشر."
            SabqHaptics.success()
        } catch APIError.apiMessage(let message) {
            errorText = message
        } catch {
            errorText = "تعذر إرسال المقترح، حاول مرة أخرى."
        }
    }
}

/// «صوتي» يبقى في الويب (التسجيل والموافقة هناك)؛ التطبيق يفتحه في المتصفح.
struct WriterVoiceLinkRow: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            if let url = URL(string: "https://sabq.org/dashboard/opinion-author/voice") { openURL(url) }
        } label: {
            HStack(spacing: SabqLayout.space12) {
                Image(systemName: "waveform")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primary)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(SabqTheme.primary.opacity(0.1)))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("صوتي")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                    Text("سجّل صوتك لقراءة مقالاتك، يُفتح في الموقع")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.left.square")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.textTertiary)
                    .accessibilityHidden(true)
            }
            .padding(SabqLayout.space16)
            .frame(minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(SabqTheme.surface))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
