import Foundation
import Testing
@testable import sabq

struct RoshnModelsTests {

    @Test func cardsDecodeLegacyStringTeamContract() throws {
        let data = """
        {
          "yellow": [{
            "rank": 1,
            "id": 44624,
            "name": "عبد الرحمن الدخيل",
            "photo": "https://example.com/player.png",
            "team": "الحزم",
            "teamLogo": "https://example.com/team.png",
            "yellow": 12,
            "red": 0,
            "matches": 23
          }],
          "red": []
        }
        """.data(using: .utf8)!

        let cards = try JSONDecoder().decode(RsCards.self, from: data)
        #expect(cards.yellow.first?.team.name == "الحزم")
        #expect(cards.yellow.first?.team.logo == "https://example.com/team.png")
        #expect(cards.yellow.first?.yellow == 12)
    }

    @Test func assistsDecodeObjectTeamContract() throws {
        let data = """
        {
          "rank": 1,
          "id": 583,
          "name": "جواو فيليكس",
          "photo": "https://example.com/player.png",
          "team": {
            "id": 2939,
            "name": "النصر",
            "logo": "https://example.com/team.png",
            "winner": null
          },
          "goals": 20,
          "assists": 13
        }
        """.data(using: .utf8)!

        let leader = try JSONDecoder().decode(RsLeader.self, from: data)
        #expect(leader.team.id == 2939)
        #expect(leader.team.name == "النصر")
        #expect(leader.assists == 13)
    }

    @Test func roshnNumbersAlwaysUseLatinDigits() {
        let formatted = [
            RsFormat.latin(2026),
            RsFormat.seasonLabel(2026),
            RsFormat.latinDecimal(7.5),
            RsFormat.day(iso: "2026-08-13T21:00:00+03:00"),
        ].joined(separator: " ")

        #expect(formatted.contains("2026"))
        #expect(formatted.contains("7.5"))
        #expect(!formatted.contains(where: { "٠١٢٣٤٥٦٧٨٩".contains($0) }))
    }

    @Test @MainActor func roshnUniversalLinksOpenNativeDestinations() throws {
        let hubURL = try #require(URL(string: "https://sabq.org/roshn"))
        let teamURL = try #require(URL(string: "https://sabq.org/sports/team/2932"))
        let matchURL = try #require(URL(string: "sabq://roshn/match/1408543"))

        #expect(NotificationsStore.shared.parseSabqDeepLink(url: hubURL) == .roshn)
        #expect(NotificationsStore.shared.parseSabqDeepLink(url: teamURL) == .roshnTeam(id: 2932))
        #expect(NotificationsStore.shared.parseSabqDeepLink(url: matchURL) == .roshnMatch(id: 1_408_543))
    }
}
