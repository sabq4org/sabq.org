import Foundation

/// Normalises what an Arabic keyboard (or a pasted SMS) produces before it
/// reaches the server, which only understands ASCII digits.
public enum DeskInput {
    /// Maps every Unicode decimal digit (Arabic-Indic ٠-٩, Eastern ۰-۹,
    /// full-width, …) to its ASCII form and leaves other characters as is.
    public static func asciiDigits(_ text: String) -> String {
        var out = String.UnicodeScalarView()
        for scalar in text.unicodeScalars {
            if scalar.properties.numericType == .decimal,
               let value = scalar.properties.numericValue,
               let ascii = Unicode.Scalar(UInt8(48 + Int(value))) {
                out.append(ascii)
            } else {
                out.append(scalar)
            }
        }
        return String(out)
    }

    /// Authenticator code: decimal digits only, in ASCII.
    public static func otpCode(_ text: String) -> String {
        String(asciiDigits(text).unicodeScalars.filter { ("0"..."9").contains($0) }.map(Character.init))
    }

    /// Backup code (`ABCD-1234`): digits to ASCII, upper-cased, trimmed.
    public static func backupCode(_ text: String) -> String {
        asciiDigits(text).trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    /// Email stays as typed; a phone number gets ASCII digits.
    public static func loginIdentifier(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.contains("@") ? trimmed : asciiDigits(trimmed)
    }
}
