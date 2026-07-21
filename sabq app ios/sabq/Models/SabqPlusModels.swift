import SwiftUI

// «سبق بلس» — نماذج المعاينة الداخلية (مسؤول النظام فقط).
// مرآة لاستجابات /api/v1/plus/* — المغلف { success, ... } مسطّح،
// والمفاتيح الزائدة (success) تُتجاهل تلقائياً في Decodable.

struct SabqPlusRoute: Hashable {}

struct PlusTierInfo: Codable, Equatable {
    let level: Int
    let nameAr: String
    let color: String
}

struct PlusNextTier: Codable, Equatable {
    let nameAr: String
    let minLifetimePoints: Int
}

struct PlusSummary: Codable, Equatable {
    let totalPoints: Int
    let lifetimePoints: Int
    let sarValue: Double
    let pointsPerSar: Int
    let monthPoints: Int
    let tier: PlusTierInfo
    let nextTier: PlusNextTier?
    let pointsToNext: Int
    let predictionMultiplier: Double
}

struct PlusReward: Codable, Identifiable, Equatable {
    let id: String
    let partnerName: String
    let offer: String
    let pointsCost: Int
    let sarValue: Double
    let category: String
    let brandColor: String
    let valueLabel: String
    let remainingStock: Int?
}

struct PlusCatalog: Codable, Equatable {
    let balance: Int
    let pointsPerSar: Int
    let rewards: [PlusReward]
}

struct PlusVoucher: Codable, Equatable, Identifiable {
    var id: String { redemptionId }
    let code: String
    let expiresAt: String
    let partnerName: String
    let offer: String
    let valueLabel: String
    let brandColor: String
    let pointsSpent: Int
    let redemptionId: String
}

struct PlusRedeemResponse: Codable {
    let success: Bool
    let message: String?
    let remainingBalance: Int?
    let voucher: PlusVoucher?
}

struct PlusRedemption: Codable, Identifiable, Equatable {
    let id: String
    let partnerName: String?
    let offer: String?
    let pointsSpent: Int
    let status: String
    let redeemedAt: String?
    let code: String?
    let voucherExpiresAt: String?
    let brandColor: String?
    let valueLabel: String?
}

struct PlusRedemptionsResponse: Codable {
    let success: Bool
    let redemptions: [PlusRedemption]
}

// ألوان الشركاء تصل كسلاسل hex من الخادم (مثل "#8C5A3B").
extension Color {
    init(plusHex hex: String) {
        var value: UInt64 = 0
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        Scanner(string: cleaned).scanHexInt64(&value)
        let r = Double((value >> 16) & 0xFF) / 255
        let g = Double((value >> 8) & 0xFF) / 255
        let b = Double(value & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
