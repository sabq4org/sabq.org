import Foundation

/// Preset rejection reasons approved for the desk (2026-10-24).
public enum SocialRejectionPreset: String, CaseIterable, Sendable, Identifiable {
    case policy
    case inaccurate
    case duplicate
    case rephrase

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .policy: return "لا يناسب سياسة الحساب"
        case .inaccurate: return "معلومة غير دقيقة"
        case .duplicate: return "مكرر"
        case .rephrase: return "يحتاج إعادة صياغة"
        }
    }

    /// The text sent as `reason`: the preset title, plus the editor's note
    /// when there is one. Capped at the server's 1000 characters.
    public static func composeReason(preset: SocialRejectionPreset?, note: String) -> String? {
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = [preset?.title, trimmedNote.isEmpty ? nil : trimmedNote].compactMap { $0 }
        guard !parts.isEmpty else { return nil }
        return String(parts.joined(separator: " — ").prefix(1000))
    }
}

extension StaffTicketStatus {
    public var title: String {
        switch self {
        case .open: return "مفتوحة"
        case .answered: return "تم الرد"
        case .closed: return "مغلقة"
        }
    }
}

extension StaffSocialStatus {
    public var title: String {
        switch self {
        case .draft: return "بانتظار القرار"
        case .scheduled: return "مجدولة"
        case .processing: return "قيد النشر"
        case .published: return "منشورة"
        case .failed: return "فشل النشر"
        case .canceled: return "مرفوضة"
        case .unknown: return "غير معروفة"
        }
    }
}

extension StaffSenderKind {
    public var title: String {
        switch self {
        case .writer: return "كاتب رأي"
        case .reporter: return "مراسل"
        case .agency: return "وكالة"
        case .unknown: return "مساهم"
        }
    }
}

extension StaffInboxItem {
    public var statusTitle: String {
        switch kind {
        case .ticket: return StaffTicketStatus(rawValue: status)?.title ?? status
        case .social: return StaffSocialStatus(rawValue: status)?.title ?? status
        }
    }
}
