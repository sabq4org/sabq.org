import Foundation

/// رموز اتصال دول آسيا + الخليج الشائعة لمتابعي كأس آسيا.
struct AcDialCountry: Identifiable, Hashable {
    let id: String
    let flag: String
    let dial: String
    let nameAr: String
    let nameEn: String
    let nationalLength: ClosedRange<Int>
    let placeholder: String

    var name: String {
        let code = AcLocalization.shared.language.code
        if code == "ar" || code == "fa" || code == "ur" { return nameAr }
        return nameEn
    }

    static let all: [AcDialCountry] = [
        .init(id: "SA", flag: "🇸🇦", dial: "966", nameAr: "السعودية", nameEn: "Saudi Arabia", nationalLength: 9...9, placeholder: "5XXXXXXXX"),
        .init(id: "QA", flag: "🇶🇦", dial: "974", nameAr: "قطر", nameEn: "Qatar", nationalLength: 8...8, placeholder: "3XXXXXXX"),
        .init(id: "AE", flag: "🇦🇪", dial: "971", nameAr: "الإمارات", nameEn: "UAE", nationalLength: 9...9, placeholder: "5XXXXXXXX"),
        .init(id: "KW", flag: "🇰🇼", dial: "965", nameAr: "الكويت", nameEn: "Kuwait", nationalLength: 8...8, placeholder: "5XXXXXXX"),
        .init(id: "BH", flag: "🇧🇭", dial: "973", nameAr: "البحرين", nameEn: "Bahrain", nationalLength: 8...8, placeholder: "3XXXXXXX"),
        .init(id: "OM", flag: "🇴🇲", dial: "968", nameAr: "عُمان", nameEn: "Oman", nationalLength: 8...8, placeholder: "9XXXXXXX"),
        .init(id: "JO", flag: "🇯🇴", dial: "962", nameAr: "الأردن", nameEn: "Jordan", nationalLength: 9...9, placeholder: "7XXXXXXXX"),
        .init(id: "IQ", flag: "🇮🇶", dial: "964", nameAr: "العراق", nameEn: "Iraq", nationalLength: 10...10, placeholder: "7XXXXXXXXX"),
        .init(id: "IR", flag: "🇮🇷", dial: "98", nameAr: "إيران", nameEn: "Iran", nationalLength: 10...10, placeholder: "9XXXXXXXXX"),
        .init(id: "EG", flag: "🇪🇬", dial: "20", nameAr: "مصر", nameEn: "Egypt", nationalLength: 10...10, placeholder: "1XXXXXXXXX"),
        .init(id: "TR", flag: "🇹🇷", dial: "90", nameAr: "تركيا", nameEn: "Turkey", nationalLength: 10...10, placeholder: "5XXXXXXXXX"),
        .init(id: "JP", flag: "🇯🇵", dial: "81", nameAr: "اليابان", nameEn: "Japan", nationalLength: 10...11, placeholder: "90XXXXXXXX"),
        .init(id: "KR", flag: "🇰🇷", dial: "82", nameAr: "كوريا الجنوبية", nameEn: "South Korea", nationalLength: 9...11, placeholder: "10XXXXXXXX"),
        .init(id: "CN", flag: "🇨🇳", dial: "86", nameAr: "الصين", nameEn: "China", nationalLength: 11...11, placeholder: "1XXXXXXXXXX"),
        .init(id: "HK", flag: "🇭🇰", dial: "852", nameAr: "هونغ كونغ", nameEn: "Hong Kong", nationalLength: 8...8, placeholder: "5XXXXXXX"),
        .init(id: "TW", flag: "🇹🇼", dial: "886", nameAr: "تايوان", nameEn: "Taiwan", nationalLength: 9...9, placeholder: "9XXXXXXXX"),
        .init(id: "AU", flag: "🇦🇺", dial: "61", nameAr: "أستراليا", nameEn: "Australia", nationalLength: 9...9, placeholder: "4XXXXXXXX"),
        .init(id: "NZ", flag: "🇳🇿", dial: "64", nameAr: "نيوزيلندا", nameEn: "New Zealand", nationalLength: 8...10, placeholder: "2XXXXXXX"),
        .init(id: "ID", flag: "🇮🇩", dial: "62", nameAr: "إندونيسيا", nameEn: "Indonesia", nationalLength: 9...12, placeholder: "8XXXXXXXX"),
        .init(id: "MY", flag: "🇲🇾", dial: "60", nameAr: "ماليزيا", nameEn: "Malaysia", nationalLength: 9...10, placeholder: "1XXXXXXXX"),
        .init(id: "SG", flag: "🇸🇬", dial: "65", nameAr: "سنغافورة", nameEn: "Singapore", nationalLength: 8...8, placeholder: "8XXXXXXX"),
        .init(id: "TH", flag: "🇹🇭", dial: "66", nameAr: "تايلاند", nameEn: "Thailand", nationalLength: 9...9, placeholder: "8XXXXXXXX"),
        .init(id: "VN", flag: "🇻🇳", dial: "84", nameAr: "فيتنام", nameEn: "Vietnam", nationalLength: 9...10, placeholder: "9XXXXXXXX"),
        .init(id: "PH", flag: "🇵🇭", dial: "63", nameAr: "الفلبين", nameEn: "Philippines", nationalLength: 10...10, placeholder: "9XXXXXXXXX"),
        .init(id: "IN", flag: "🇮🇳", dial: "91", nameAr: "الهند", nameEn: "India", nationalLength: 10...10, placeholder: "9XXXXXXXXX"),
        .init(id: "PK", flag: "🇵🇰", dial: "92", nameAr: "باكستان", nameEn: "Pakistan", nationalLength: 10...10, placeholder: "3XXXXXXXXX"),
        .init(id: "BD", flag: "🇧🇩", dial: "880", nameAr: "بنغلاديش", nameEn: "Bangladesh", nationalLength: 10...10, placeholder: "1XXXXXXXXX"),
        .init(id: "UZ", flag: "🇺🇿", dial: "998", nameAr: "أوزبكستان", nameEn: "Uzbekistan", nationalLength: 9...9, placeholder: "9XXXXXXXX"),
        .init(id: "KZ", flag: "🇰🇿", dial: "7", nameAr: "كازاخستان", nameEn: "Kazakhstan", nationalLength: 10...10, placeholder: "7XXXXXXXXX"),
        .init(id: "KG", flag: "🇰🇬", dial: "996", nameAr: "قيرغيزستان", nameEn: "Kyrgyzstan", nationalLength: 9...9, placeholder: "7XXXXXXXX"),
        .init(id: "TJ", flag: "🇹🇯", dial: "992", nameAr: "طاجيكستان", nameEn: "Tajikistan", nationalLength: 9...9, placeholder: "9XXXXXXXX"),
        .init(id: "TM", flag: "🇹🇲", dial: "993", nameAr: "تركمانستان", nameEn: "Turkmenistan", nationalLength: 8...8, placeholder: "6XXXXXXX"),
        .init(id: "AF", flag: "🇦🇫", dial: "93", nameAr: "أفغانستان", nameEn: "Afghanistan", nationalLength: 9...9, placeholder: "7XXXXXXXX"),
        .init(id: "LK", flag: "🇱🇰", dial: "94", nameAr: "سريلانكا", nameEn: "Sri Lanka", nationalLength: 9...9, placeholder: "7XXXXXXXX"),
        .init(id: "NP", flag: "🇳🇵", dial: "977", nameAr: "نيبال", nameEn: "Nepal", nationalLength: 10...10, placeholder: "98XXXXXXXX"),
        .init(id: "MM", flag: "🇲🇲", dial: "95", nameAr: "ميانمار", nameEn: "Myanmar", nationalLength: 8...10, placeholder: "9XXXXXXX"),
        .init(id: "KH", flag: "🇰🇭", dial: "855", nameAr: "كمبوديا", nameEn: "Cambodia", nationalLength: 8...9, placeholder: "1XXXXXXX"),
        .init(id: "LA", flag: "🇱🇦", dial: "856", nameAr: "لاوس", nameEn: "Laos", nationalLength: 8...10, placeholder: "20XXXXXXX"),
        .init(id: "PS", flag: "🇵🇸", dial: "970", nameAr: "فلسطين", nameEn: "Palestine", nationalLength: 9...9, placeholder: "5XXXXXXXX"),
        .init(id: "LB", flag: "🇱🇧", dial: "961", nameAr: "لبنان", nameEn: "Lebanon", nationalLength: 7...8, placeholder: "3XXXXXX"),
        .init(id: "SY", flag: "🇸🇾", dial: "963", nameAr: "سوريا", nameEn: "Syria", nationalLength: 9...9, placeholder: "9XXXXXXXX"),
        .init(id: "YE", flag: "🇾🇪", dial: "967", nameAr: "اليمن", nameEn: "Yemen", nationalLength: 9...9, placeholder: "7XXXXXXXX"),
        .init(id: "US", flag: "🇺🇸", dial: "1", nameAr: "الولايات المتحدة", nameEn: "United States", nationalLength: 10...10, placeholder: "201XXXXXXX"),
        .init(id: "GB", flag: "🇬🇧", dial: "44", nameAr: "بريطانيا", nameEn: "United Kingdom", nationalLength: 10...10, placeholder: "7XXXXXXXXX"),
    ]

    static let saudi = all[0]
}
