import Foundation
import Testing
@testable import sabq

@Suite
struct CalendarDecodingTests {
    private let event = #"{"id":"event-1","title":"يوم العلم","type":"NATIONAL","dateStart":"2027-03-11T00:00:00.000Z","importance":4}"#

    @Test func upcomingArrayPreservesEventFields() throws {
        let response = try decode("[\(event)]")
        #expect(response.events.count == 1)
        let item = try #require(response.events.first)
        #expect(item.id == "event-1")
        #expect(item.title == "يوم العلم")
        #expect(item.type == "NATIONAL")
        #expect(item.dateStart == "2027-03-11T00:00:00.000Z")
        #expect(item.importance == 4)
    }

    @Test func listEnvelopePreservesEventsAndIgnoresPagination() throws {
        let response = try decode("{\"events\":[\(event)],\"total\":1,\"page\":1}")
        #expect(response.events.map(\.id) == ["event-1"])
    }

    @Test(arguments: ["[]", #"{"events":[],"total":0}"#])
    func emptyResponsesAreSuccessful(_ json: String) throws {
        #expect(try decode(json).events.isEmpty)
    }

    @Test(arguments: ["null", "{}", #"{"events":null}"#, #"{"events":{}}"#,
                      #"{"error":"unavailable"}"#, "[null]", "[1]", #"{"events":[1]}"#, "false"])
    func invalidResponsesRemainErrors(_ json: String) {
        #expect(throws: (any Error).self) { try decode(json) }
    }

    private func decode(_ json: String) throws -> APICalendarEventsResponse {
        try JSONDecoder().decode(APICalendarEventsResponse.self, from: Data(json.utf8))
    }
}
