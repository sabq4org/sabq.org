import Foundation
import os

/// نصوص الأخطاء الموجّهة للقارئ — نقل `ReaderError.kt` من أندرويد (#1573).
///
/// القاعدة: لا يصل إلى القارئ نص استثناء ولا جسم استجابة ولا رمز حالة خام
/// («خطأ في الخادم (500)»). التشخيص يُسجَّل في السجل بنوع الخطأ فقط.
nonisolated enum ReaderErrorMessage {
    static let timeout = "استغرق الاتصال وقتًا أطول من المعتاد. حاول مرة أخرى."
    static let offline = "تعذّر الاتصال بالإنترنت. تحقّق من الشبكة وحاول مرة أخرى."
    static let connection = "تعذّر إكمال الاتصال. تحقّق من الشبكة وحاول مرة أخرى."
    static let unauthorized = "يرجى تسجيل الدخول ثم المحاولة مرة أخرى."
    static let forbidden = "هذا المحتوى غير متاح لحسابك."
    static let notFound = "المحتوى المطلوب غير متاح حاليًا."
    static let rateLimited = "يرجى الانتظار قليلًا ثم المحاولة مرة أخرى."
    static let serverError = "الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل."
    static let parse = "تعذّر عرض المحتوى حاليًا. حاول مرة أخرى لاحقًا."
    static let generic = "تعذّر تحميل المحتوى. حاول مرة أخرى."

    private static let logger = Logger(subsystem: "org.sabq.app", category: "reader")

    /// النص المناسب لنوع الفشل، أو `fallback` عندما لا يُعرف النوع.
    static func message(for error: Error, fallback: String = generic) -> String {
        let text = classify(error, fallback: fallback)
        // تشخيص بلا محتوى: النوع ورمز الحالة فقط.
        logger.warning("\(diagnostic(error), privacy: .public)")
        return text
    }

    static func classify(_ error: Error, fallback: String) -> String {
        if error is CancellationError { return fallback }

        if let api = error as? APIError {
            switch api {
            case .unauthorized: return unauthorized
            case .forbidden: return forbidden
            case .notFound: return notFound
            case .rateLimited: return rateLimited
            case .serverError: return serverError
            case .decodingError: return parse
            case .noResponse: return connection
            case .invalidURL: return fallback
            // رسالة الخادم مقصودة للقارئ (تحقق/حدود إرسال) — تبقى كما هي.
            case .apiMessage(let msg), .accountPendingActivation(let msg, _):
                return msg.isEmpty ? fallback : msg
            }
        }

        if let url = error as? URLError {
            switch url.code {
            case .timedOut:
                return timeout
            case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost,
                 .cannotConnectToHost, .dnsLookupFailed, .internationalRoamingOff,
                 .dataNotAllowed:
                return offline
            case .cancelled:
                return fallback
            default:
                return connection
            }
        }

        if error is DecodingError { return parse }

        let ns = error as NSError
        if ns.domain == NSURLErrorDomain || ns.domain == NSPOSIXErrorDomain {
            return connection
        }
        return fallback
    }

    private static func diagnostic(_ error: Error) -> String {
        if let api = error as? APIError {
            if case .serverError(let code) = api { return "APIError.serverError HTTP \(code)" }
            return "APIError.\(String(describing: api).split(separator: "(").first ?? "")"
        }
        if let url = error as? URLError { return "URLError \(url.code.rawValue)" }
        let ns = error as NSError
        return "\(ns.domain) \(ns.code)"
    }
}


/// نصوص فشل التسجيل بحسب الحالة — نقل `registrationUpload.ts` (#1530): لا رمز
/// خام، وضمان «بياناتك ما زالت في النموذج» في كل حالة لا نستطيع فيها إثبات
/// أن الطلب حُفظ (انقطاع/5xx/استجابة غير مفهومة).
nonisolated enum RegistrationErrorMessage {
    static let connection = "تعذر تأكيد إرسال الطلب بسبب انقطاع الاتصال. بياناتك ما زالت في النموذج؛ تحقق من اتصالك وحاول بعد قليل."
    static let tooLarge = "حجم المرفقات كبير. اختر ملفات أصغر ثم أعد تقديم الطلب."
    static let tooMany = "تم تجاوز عدد المحاولات. انتظر قليلاً ثم حاول مجدداً."
    static let forbidden = "تعذر إتمام التحقق من الطلب. حاول مجدداً بعد قليل."
    static let unconfirmed = "تعذر تأكيد استلام الطلب. بياناتك ما زالت في النموذج؛ حاول بعد قليل."

    static func message(for error: Error) -> String {
        if let api = error as? APIError {
            switch api {
            // رسالة الخادم (مثل «البريد مستخدم») تبقى كما هي.
            case .apiMessage(let m), .accountPendingActivation(let m, _):
                return m.isEmpty ? unconfirmed : m
            case .rateLimited: return tooMany
            case .forbidden: return forbidden
            case .serverError(let code):
                if code == 413 { return tooLarge }
                if code == 429 { return tooMany }
                if code == 403 { return forbidden }
                if code >= 500 || code == 408 { return connection }
                return unconfirmed
            // استجابة HTML/مشوّهة ليست دليلًا على الحفظ.
            case .decodingError, .noResponse: return connection
            default: return unconfirmed
            }
        }
        if let url = error as? URLError {
            return url.code == .cancelled ? unconfirmed : connection
        }
        return unconfirmed
    }
}
