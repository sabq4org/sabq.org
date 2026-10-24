import XCTest
@testable import SabqDeskKit

final class DeskInputTests: XCTestCase {
    func testArabicIndicDigitsBecomeASCII() {
        XCTAssertEqual(DeskInput.asciiDigits("١٢٣٤٥٦٧٨٩٠"), "1234567890")
    }

    func testEasternArabicIndicDigitsBecomeASCII() {
        XCTAssertEqual(DeskInput.asciiDigits("۱۲۳۴۵۶۷۸۹۰"), "1234567890")
    }

    func testNonDigitsArePreservedByAsciiDigits() {
        XCTAssertEqual(DeskInput.asciiDigits("abc-١٢ x"), "abc-12 x")
    }

    func testOtpCodeKeepsOnlyASCIIDigits() {
        XCTAssertEqual(DeskInput.otpCode("١٢٣٤٥٦"), "123456")
        XCTAssertEqual(DeskInput.otpCode("۱۲۳ ۴۵۶"), "123456")
        XCTAssertEqual(DeskInput.otpCode("12-3a4 56"), "123456")
        XCTAssertEqual(DeskInput.otpCode("١٢3۴٥6"), "123456")
    }

    func testOtpCodeDropsNonDecimalNumerics() {
        // `Character.isNumber` accepts these, the server does not.
        XCTAssertEqual(DeskInput.otpCode("½Ⅻ①123"), "123")
    }

    func testBackupCodeNormalizesDigitsCaseAndWhitespace() {
        XCTAssertEqual(DeskInput.backupCode("  abcd-١٢٣٤\n"), "ABCD-1234")
        XCTAssertEqual(DeskInput.backupCode("ABCD-1234"), "ABCD-1234")
    }

    func testLoginIdentifierNormalizesPhoneButNotEmail() {
        XCTAssertEqual(DeskInput.loginIdentifier(" ٠٥٠٠٠٠٠٠٠٠ "), "0500000000")
        XCTAssertEqual(DeskInput.loginIdentifier("+٩٦٦٥٠٠٠٠٠٠٠٠"), "+966500000000")
        XCTAssertEqual(DeskInput.loginIdentifier(" Editor@Sabq.org "), "Editor@Sabq.org")
    }
}
