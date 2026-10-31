import Foundation

/// قاموس واحد لحالات الخبر والمقال وطلب التعديل، منسوخ حرفيًا من
/// `shared/editorialStates.ts` (الويب والسيرفر). اختبار
/// `tests/unit/editorialStates.test.ts` يفشل إن اختلف أي نص هنا عن الويب.
nonisolated enum EditorialStates {
    // الشارة: كلمة واحدة لكل حالة.
    static let draft = "مسودة"
    static let pending = "أُرسل للمراجعة"
    static let needsChanges = "يحتاج تعديلك"
    static let approved = "اعتُمد، بانتظار الجدولة"
    static let scheduled = "مجدول"
    static let published = "منشور"
    static let notPublished = "لم يُنشر"
    static let archived = "مؤرشف"

    // شرائح التصفية، بترتيب الويب.
    static let filterAll = "الكل"
    static let filterNeedsChanges = "تحتاج تعديلك"
    static let filterPending = "قيد المراجعة"
    static let filterScheduled = "مجدولة"
    static let filterPublished = "منشورة"
    static let filterDraft = "مسودات"

    // أزرار الخطوة التالية.
    static let resubmit = "عدّل وأعد الإرسال"
    static let requestEdit = "طلب تعديل"
    static let cancelRequest = "ألغِ الطلب"
    static let reviewRequest = "راجع الطلب"
    static let openArticle = "فتح الخبر"

    // ملصق طلب التعديل.
    static let requestPending = "طلب تعديل قيد المراجعة"
    static let requestApproved = "اعتُمد طلب التعديل"
    static let requestRejected = "لم يُعتمد طلب التعديل"
    static let requestUrgent = "طلب تعديل عاجل"

    /// نفس ترتيب `editorialState` في الويب: الحالة النهائية قبل المراجعة.
    static func label(status: String?, reviewStatus: String?) -> String {
        switch status ?? "draft" {
        case "published": return published
        case "scheduled": return scheduled
        case "archived", "deleted": return archived
        case "rejected": return notPublished
        default: break
        }
        switch reviewStatus {
        case "rejected": return notPublished
        case "needs_changes": return needsChanges
        case "pending_review": return pending
        case "approved": return approved
        default: return status == "pending" ? pending : draft
        }
    }
}
