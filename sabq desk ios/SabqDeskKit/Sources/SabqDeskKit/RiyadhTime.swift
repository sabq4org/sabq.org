import Foundation

/// Scheduling is always expressed in Riyadh time regardless of the device's
/// zone, and sent with an explicit `+03:00` offset.
public enum RiyadhTime {
    public static let timeZone = TimeZone(identifier: "Asia/Riyadh") ?? TimeZone(secondsFromGMT: 3 * 3600)!

    /// Arabic labels with Latin digits so times read the same as on the web desk.
    public static let locale = Locale(identifier: "ar_SA@numbers=latn;calendar=gregorian")

    public static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.locale = locale
        return calendar
    }

    /// `2026-10-25T19:30:00+03:00`
    public static func isoString(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = timeZone
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }

    /// `الأحد 25 أكتوبر، 19:30`
    public static func displayString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.calendar = calendar
        formatter.dateFormat = "EEEE d MMMM، HH:mm"
        return formatter.string(from: date)
    }

    /// `14:05` — 24-hour clock in Riyadh time, Latin digits.
    public static func timeString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = timeZone
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    public static func shortString(_ date: Date, relativeTo now: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.calendar = calendar
        formatter.dateFormat = calendar.isDate(date, inSameDayAs: now) ? "HH:mm" : "d MMM"
        return formatter.string(from: date)
    }

    /// The earliest time the schedule sheet offers: the next whole five
    /// minutes at least `leadMinutes` ahead, so the request does not land in
    /// the past by the time the server validates it.
    public static func earliestSchedulableDate(now: Date = Date(), leadMinutes: Int = 5) -> Date {
        let calendar = calendar
        let ahead = now.addingTimeInterval(TimeInterval(leadMinutes * 60))
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: ahead)
        let truncated = calendar.date(from: parts) ?? ahead
        let minute = parts.minute ?? 0
        var result = calendar.date(byAdding: .minute, value: (5 - minute % 5) % 5, to: truncated) ?? truncated
        if result < ahead {
            result = calendar.date(byAdding: .minute, value: 5, to: result) ?? result
        }
        return result
    }

    public static func isSchedulable(_ date: Date, now: Date = Date()) -> Bool {
        date > now.addingTimeInterval(60)
    }
}
