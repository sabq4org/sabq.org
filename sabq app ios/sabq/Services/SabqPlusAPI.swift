import Foundation

// «سبق بلس» — نداءات المعاينة الداخلية /api/v1/plus/*.
// كل المسارات خلف بوابة مسؤول النظام في الخادم (غير المسؤول يستلم 404
// كي لا يُكشف السطح) — التطبيق بدوره لا يُظهر المدخل إلا لـ isPlatformAdmin.
// تنزيل بطاقة الـ Wallet الثنائية يعيش داخل APIClient.swift نفسه لأنه
// يحتاج session/buildURL الخاصة (file-private).

extension APIClient {
    func fetchPlusSummary() async throws -> PlusSummary {
        try await get(PlusSummary.self, path: "/plus/summary", ignoreCache: true)
    }

    func fetchPlusCatalog() async throws -> PlusCatalog {
        try await get(PlusCatalog.self, path: "/plus/catalog", ignoreCache: true)
    }

    func redeemPlusReward(id: String) async throws -> PlusRedeemResponse {
        try await post(PlusRedeemResponse.self, path: "/plus/redeem/\(id)", body: ["termsAccepted": true])
    }

    func fetchPlusRedemptions() async throws -> [PlusRedemption] {
        try await get(PlusRedemptionsResponse.self, path: "/plus/redemptions", ignoreCache: true).redemptions
    }

    func removePlusRedemption(id: String) async throws {
        try await deleteRaw(path: "/plus/redemptions/\(id)")
    }
}
