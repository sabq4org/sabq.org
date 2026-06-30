import Foundation

// نماذج مصادقة الموبايل — مشتركة مع تطبيق سبق الرياضي (/api/v1/auth/apple).

private struct GcFlexKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(_ s: String) { stringValue = s; intValue = nil }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

struct GcMember: Decodable, Hashable {
    let id: String
    let name: String?
    let email: String?
    let avatar: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: GcFlexKey.self)
        id = (try? c.decode(String.self, forKey: GcFlexKey("id")))
            ?? (try? c.decode(String.self, forKey: GcFlexKey("userId")))
            ?? ""
        let first = try? c.decode(String.self, forKey: GcFlexKey("firstName"))
        let last = try? c.decode(String.self, forKey: GcFlexKey("lastName"))
        name = (try? c.decode(String.self, forKey: GcFlexKey("name")))
            ?? [first, last].compactMap { $0 }.joined(separator: " ").nilIfEmpty
        email = try? c.decode(String.self, forKey: GcFlexKey("email"))
        avatar = try? c.decode(String.self, forKey: GcFlexKey("profileImageUrl"))
    }
}

struct GcLoginResponse: Decodable {
    let token: String?
    let member: GcMember?
    let message: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: GcFlexKey.self)
        token = (try? c.decode(String.self, forKey: GcFlexKey("token")))
            ?? (try? c.decode(String.self, forKey: GcFlexKey("access_token")))
        member = (try? c.decode(GcMember.self, forKey: GcFlexKey("user")))
            ?? (try? c.decode(GcMember.self, forKey: GcFlexKey("member")))
        message = try? c.decode(String.self, forKey: GcFlexKey("message"))
    }
}

struct GcDeviceInfo: Encodable {
    let platform: String
    let osVersion: String
    let appVersion: String
    let deviceName: String?
    let deviceId: String?
}

struct GcAppleAuthRequest: Encodable {
    let identityToken: String
    let fullName: AppleFullName?
    let email: String?
    let deviceInfo: GcDeviceInfo?
    struct AppleFullName: Encodable { let firstName: String?; let lastName: String? }
}

struct GcPredictionSubmitBody: Encodable {
    let fixtureId: Int
    let predHome: Int
    let predAway: Int
}

struct GcPredictionSubmitResponse: Decodable {
    let prediction: GcSubmittedPrediction
}

struct GcSubmittedPrediction: Decodable {
    let predHome: Int
    let predAway: Int
    let status: String
}

struct GcLongSubmitBody: Encodable {
    let kind: String
    let teamId: Int?
    let playerName: String?
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}

extension APIClient {
    static func deviceInfo() -> GcDeviceInfo {
        let b = Bundle.main
        let v = (b.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "?"
        let build = (b.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
        return GcDeviceInfo(
            platform: "ios",
            osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
            appVersion: "\(v) (\(build))",
            deviceName: "iPhone",
            deviceId: nil
        )
    }

    func loginWithApple(
        identityToken: String,
        firstName: String?,
        lastName: String?,
        email: String?
    ) async throws -> GcLoginResponse {
        let fullName: GcAppleAuthRequest.AppleFullName? =
            (firstName != nil || lastName != nil)
            ? .init(firstName: firstName, lastName: lastName)
            : nil
        let body = GcAppleAuthRequest(
            identityToken: identityToken,
            fullName: fullName,
            email: email,
            deviceInfo: Self.deviceInfo()
        )
        return try await post(GcLoginResponse.self, path: "/auth/apple", body: body, apiRoot: URLConstants.mobileAPI)
    }

    func submitGcPrediction(fixtureId: Int, predHome: Int, predAway: Int) async throws -> GcSubmittedPrediction {
        let body = GcPredictionSubmitBody(fixtureId: fixtureId, predHome: predHome, predAway: predAway)
        let resp = try await post(
            GcPredictionSubmitResponse.self,
            path: "/gulf-cup/predictions",
            body: body,
            apiRoot: URLConstants.mobileAPI
        )
        return resp.prediction
    }

    func submitGcLongPrediction(kind: String, teamId: Int?) async throws {
        struct Ok: Decodable { let ok: Bool? }
        let body = GcLongSubmitBody(kind: kind, teamId: teamId, playerName: nil)
        _ = try await post(Ok.self, path: "/gulf-cup/predictions/long", body: body, apiRoot: URLConstants.mobileAPI)
    }
}
