import Foundation

/// Every failure the app can show. Staff endpoints answer `{ code, message }`;
/// the shared member-auth endpoints answer `{ success: false, message }`, so
/// mapping falls back to the HTTP status when `code` is absent.
public enum StaffAPIError: Error, Sendable, Equatable {
    case unauthorized(message: String?)
    /// The account has no 2FA; the app shows a dedicated screen, not a toast.
    case twoFactorRequired(message: String?)
    case forbidden(message: String?)
    case notFound(message: String?)
    case validation(message: String?)
    case ticketClosed(message: String?)
    /// The post moved on (already publishing or published). Carries the
    /// server's current copy when it sent one so the screen can refresh.
    case conflict(message: String?, post: StaffSocialPost?)
    case rateLimited(message: String?)
    case publishFailed(message: String?, post: StaffSocialPost?)
    case server(status: Int, message: String?)
    case network(message: String)
    case decoding(message: String)

    public var serverMessage: String? {
        switch self {
        case .unauthorized(let m), .twoFactorRequired(let m), .forbidden(let m), .notFound(let m),
             .validation(let m), .ticketClosed(let m), .rateLimited(let m):
            return m
        case .conflict(let m, _), .publishFailed(let m, _), .server(_, let m):
            return m
        case .network, .decoding:
            return nil
        }
    }

    /// Arabic copy for the UI; prefers the server's own message when it sent one.
    public var userMessage: String {
        if let message = serverMessage?.trimmingCharacters(in: .whitespacesAndNewlines), !message.isEmpty {
            return message
        }
        switch self {
        case .unauthorized: return "انتهت الجلسة، سجّل الدخول من جديد"
        case .twoFactorRequired: return "يلزم تفعيل المصادقة الثنائية للوصول إلى تطبيق الديسك"
        case .forbidden: return "لا تملك صلاحية تنفيذ هذا الإجراء"
        case .notFound: return "العنصر غير موجود أو حُذف"
        case .validation: return "تحقق من البيانات المدخلة"
        case .ticketClosed: return "التذكرة مغلقة ولا تقبل ردوداً جديدة"
        case .conflict: return "تغيّرت حالة المنشور، حدّث الصفحة"
        case .rateLimited: return "محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة"
        case .publishFailed: return "تعذر النشر على X، أعد المحاولة لاحقاً"
        case .server: return "حدث خطأ في الخادم"
        case .network: return "تعذر الاتصال بالخادم، تحقق من الشبكة"
        case .decoding: return "استجابة غير متوقعة من الخادم"
        }
    }

    /// The session is gone and the app must return to the login screen.
    public var requiresSignIn: Bool {
        if case .unauthorized = self { return true }
        return false
    }

    private struct Body: Decodable {
        var code: String?
        var message: String?
        var post: StaffSocialPost?
    }

    public static func from(status: Int, data: Data, decoder: JSONDecoder = StaffJSON.makeDecoder()) -> StaffAPIError {
        let body = (try? decoder.decode(Body.self, from: data)) ?? Body()
        let message = body.message

        switch body.code {
        case "unauthorized": return .unauthorized(message: message)
        case "two_factor_required": return .twoFactorRequired(message: message)
        case "forbidden": return .forbidden(message: message)
        case "not_found": return .notFound(message: message)
        case "validation_error": return .validation(message: message)
        case "ticket_closed": return .ticketClosed(message: message)
        case "conflict": return .conflict(message: message, post: body.post)
        case "rate_limited": return .rateLimited(message: message)
        case "publish_failed": return .publishFailed(message: message, post: body.post)
        case "server_error": return .server(status: status, message: message)
        default: break
        }

        switch status {
        case 400: return .validation(message: message)
        case 401: return .unauthorized(message: message)
        case 403: return .forbidden(message: message)
        case 404: return .notFound(message: message)
        case 409: return .conflict(message: message, post: body.post)
        case 429: return .rateLimited(message: message)
        case 502: return .publishFailed(message: message, post: body.post)
        default: return .server(status: status, message: message)
        }
    }
}
