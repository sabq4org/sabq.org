import Foundation

/// Tidies a tweet proposal for the two-line list preview: drops a first line
/// that is only an `@handle` and a leading «فلان يكتب:» byline.
public enum DeskPreviewText {
    public static func clean(_ raw: String?) -> String {
        var text = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = text.components(separatedBy: .newlines)
        if lines.count > 1, let first = lines.first, isHandle(first.trimmingCharacters(in: .whitespaces)) {
            text = lines.dropFirst().joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // «سلمان الدوسري يكتب : …», «يكتب: …» (at most a short name before it).
        if let range = text.range(of: #"^[^\n:：]{0,60}?يكتب\s*[:：]"#, options: .regularExpression) {
            text = String(text[range.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return text
    }

    static func isHandle(_ line: String) -> Bool {
        guard line.hasPrefix("@"), line.count > 1 else { return false }
        return line.dropFirst().allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }
    }

    /// True when `title` adds nothing to `tweet`: one contains the other once
    /// quotes, punctuation and spacing are ignored, or at least 80% of the
    /// shorter one's words appear in the other.
    public static func repeats(_ title: String, in tweet: String) -> Bool {
        let a = comparable(title), b = comparable(tweet)
        guard !a.isEmpty, !b.isEmpty else { return false }
        if a.contains(b) || b.contains(a) { return true }
        let wordsA = Set(a.split(separator: " ")), wordsB = Set(b.split(separator: " "))
        let shorter = min(wordsA.count, wordsB.count)
        guard shorter >= 4 else { return false }
        return Double(wordsA.intersection(wordsB).count) / Double(shorter) >= 0.8
    }

    static func comparable(_ text: String) -> String {
        let kept = text.lowercased().unicodeScalars.map { scalar -> Character in
            CharacterSet.letters.contains(scalar) || CharacterSet.decimalDigits.contains(scalar)
                ? Character(scalar) : " "
        }
        return String(kept).split(separator: " ").joined(separator: " ")
    }
}

/// Remote avatars are shown only from https URLs.
public enum DeskAvatarURL {
    public static func https(_ raw: String?) -> URL? {
        guard let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty,
              let url = URL(string: trimmed), url.scheme?.lowercased() == "https",
              let host = url.host, !host.isEmpty else { return nil }
        return url
    }
}

/// The grey or red line under a rejected proposal.
public enum DeskRejectionNote: Sendable, Equatable {
    /// The sender withdrew it before publishing.
    case withdrawn
    /// An editor rejected it with this reason.
    case reason(String)
    /// Rejected from the web dashboard, no reason recorded.
    case noReason

    public init(canceledBySelf: Bool?, reason: String?) {
        let trimmed = reason?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if canceledBySelf == true {
            self = .withdrawn
        } else if !trimmed.isEmpty {
            self = .reason(trimmed)
        } else {
            self = .noReason
        }
    }

    public var text: String {
        switch self {
        case .withdrawn: return "سحبه صاحبه قبل النشر"
        case .reason(let reason): return "السبب: \(reason)"
        case .noReason: return "رُفض من لوحة التحرير · بلا سبب مسجّل"
        }
    }

    /// List rows: the reason on its own (under a «سبب الرفض» label), else a short fact.
    public var listText: String {
        switch self {
        case .withdrawn: return "سحبه صاحبه قبل النشر"
        case .reason(let reason): return reason
        case .noReason: return "بلا سبب مسجّل"
        }
    }

    /// Only a recorded reason is shown in red; the other two are neutral facts.
    public var isReason: Bool {
        if case .reason = self { return true }
        return false
    }
}

extension StaffInboxItem {
    public var rejectionNote: DeskRejectionNote {
        DeskRejectionNote(canceledBySelf: canceledBySelf, reason: lastError)
    }

    /// The tweet for the list row: the cleaned preview, else the title.
    public var listPreview: String {
        let cleaned = DeskPreviewText.clean(previewText)
        return cleaned.isEmpty ? title : cleaned
    }

    /// The linked article's title for the row, unless the tweet already says it.
    public var linkedArticleTitle: String? {
        guard let title = article?.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty,
              !DeskPreviewText.repeats(title, in: listPreview) else { return nil }
        return title
    }
}

/// Copy for the «حالة النظام» rows.
public enum DeskSystemCopy {
    /// «2471 طلبًا خلال 24 ساعة · بلا أخطاء» / «1 فشل من 3 طلبات خلال 24 ساعة».
    public static func usageLine(requests: Int?, failures: Int?) -> String? {
        guard let requests else { return nil }
        let failures = failures ?? 0
        if failures > 0 {
            return "\(failures) فشل من \(requestsPhrase(requests)) خلال 24 ساعة"
        }
        return "\(requestsPhrase(requests)) خلال 24 ساعة · بلا أخطاء"
    }

    /// `طلب واحد`, `طلبان`, `3 طلبات`, `11 طلبًا`, `100 طلب`.
    static func requestsPhrase(_ count: Int) -> String {
        switch count {
        case 0: return "0 طلب"
        case 1: return "طلب واحد"
        case 2: return "طلبان"
        case 3...10: return "\(count) طلبات"
        default:
            let lastTwo = count % 100
            return (lastTwo >= 11 && lastTwo <= 99) ? "\(count) طلبًا" : "\(count) طلب"
        }
    }

    /// «410 من 500 دولار».
    public static func budgetAmount(spent: Double?, limit: Double?) -> String? {
        guard let limit else { return nil }
        return "\(Int((spent ?? 0).rounded())) من \(Int(limit.rounded())) دولار"
    }

    /// «OpenAI · 82%» (ASCII percent sign only).
    public static func budgetTitle(label: String?, percent: Double?) -> String {
        let name = label ?? "الميزانية"
        guard let percent else { return name }
        return "\(name) · \(Int(percent.rounded()))%"
    }

    public static func statusTitle(_ status: StaffModelStatus, quotaExceeded: Bool) -> String {
        if quotaExceeded { return "نفدت الحصة" }
        switch status {
        case .up: return "يعمل"
        case .degraded: return "متدهور"
        case .down: return "متوقف"
        case .unknown: return "غير معروف"
        }
    }
}

/// A time label that is either a bare `HH:mm` (shown left-to-right) or an
/// Arabic phrase such as «قبل 6 د» / «أمس» / «11 أكتوبر» (natural RTL).
public enum DeskTimeLabel: Sendable, Equatable {
    case clock(String)
    case phrase(String)
}

extension RiyadhTime {
    /// Alerts: «قبل 6 د» within the hour, `HH:mm` later today, then «أمس» / the date.
    public static func alertLabel(_ date: Date, now: Date = Date()) -> DeskTimeLabel {
        if now.timeIntervalSince(date) < 3600 { return .phrase(ago(date, now: now)) }
        if calendar.isDate(date, inSameDayAs: now) { return .clock(timeString(date)) }
        return .phrase(ago(date, now: now))
    }
}
