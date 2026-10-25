import XCTest
@testable import SabqDeskKit

final class DecodingTests: XCTestCase {
    private let decoder = StaffJSON.makeDecoder()

    func testMeDecodesCapabilities() throws {
        let me = try decoder.decode(StaffMe.self, from: Fixtures.me.data)
        XCTAssertEqual(me.id, "user-uuid")
        XCTAssertEqual(me.displayName, "ماجد العتيبي")
        XCTAssertEqual(me.twoFactorEnabled, true)
        XCTAssertEqual(me.roles, ["editor"])
        XCTAssertEqual(me.roleDisplayLabel, "محرر")
        XCTAssertTrue(me.capabilities.canTickets)
        XCTAssertEqual(me.capabilities.canSocial, .init(view: true, publish: true, schedule: false, reject: true))
    }

    func testRoleArabicLabelMappingAndFallback() {
        let expected: [(String, String)] = [
            ("system_admin", "مدير النظام"),
            ("system.admin", "مدير النظام"),
            ("superadmin", "المدير العام"),
            ("super_admin", "المدير العام"),
            ("admin", "مسؤول"),
            ("editor_in_chief", "رئيس التحرير"),
            ("chief_editor", "رئيس التحرير"),
            ("managing_editor", "مدير تحرير"),
            ("editorial_manager", "مدير تحرير"),
            ("senior_editor", "محرر أول"),
            ("editor", "محرر"),
            ("content_manager", "مدير محتوى"),
            ("reporter", "مراسل"),
            ("correspondent", "مراسل"),
            ("journalist", "صحفي"),
            ("opinion_author", "كاتب مقال رأي"),
            ("angle_writer", "كاتب زاوية"),
            ("columnist", "كاتب عمود"),
            ("article_writer", "كاتب مقال"),
            ("article_author", "كاتب مقال"),
            ("writer", "كاتب"),
            ("author", "كاتب"),
            ("content_creator", "صانع محتوى"),
            ("comments_moderator", "مشرف تعليقات"),
            ("moderator", "مشرف"),
            ("media_manager", "مدير وسائط"),
            ("publisher", "ناشر"),
            ("photographer", "مصور"),
            ("contributor", "مساهم"),
            ("reviewer", "مراجع"),
            ("analyst", "محلل"),
            ("advertiser", "معلن"),
            ("hr", "موارد بشرية"),
            ("reader", "قارئ"),
            ("guest", "ضيف"),
        ]
        for (raw, label) in expected {
            XCTAssertEqual(StaffRoleLabel.arabicLabel(for: raw), label, "failed for \(raw)")
        }

        // Case-insensitivity and hyphen/whitespace normalization
        XCTAssertEqual(StaffRoleLabel.arabicLabel(for: " SYSTEM_ADMIN "), "مدير النظام")
        XCTAssertEqual(StaffRoleLabel.arabicLabel(for: "opinion-author"), "كاتب مقال رأي")

        // Unknown role falls back to the raw key
        XCTAssertEqual(StaffRoleLabel.arabicLabel(for: "custom_role_xyz"), "custom_role_xyz")

        // Multiple roles deduplicate identical Arabic labels (e.g. reporter + correspondent -> مراسل)
        XCTAssertEqual(StaffRoleLabel.displayList(for: ["editor", "reporter", "correspondent"]), "محرر، مراسل")
        XCTAssertEqual(StaffRoleLabel.displayList(for: ["system_admin"]), "مدير النظام")
        XCTAssertNil(StaffRoleLabel.displayList(for: ["  ", ""]))

        // StaffMe.roleDisplayLabel falls back to `role` then "—"
        let meWithRoleOnly = StaffMe(id: "u1", role: "system_admin", roles: nil, capabilities: .none)
        XCTAssertEqual(meWithRoleOnly.roleDisplayLabel, "مدير النظام")
        let meUnknown = StaffMe(id: "u2", role: "special_ops", roles: [], capabilities: .none)
        XCTAssertEqual(meUnknown.roleDisplayLabel, "special_ops")
        let meEmpty = StaffMe(id: "u3", role: nil, roles: nil, capabilities: .none)
        XCTAssertEqual(meEmpty.roleDisplayLabel, "—")
    }

    func testInboxPageDecodesBothKindsAndDateForms() throws {
        let page = try decoder.decode(StaffInboxPage.self, from: Fixtures.inbox.data)
        XCTAssertEqual(page.items.count, 2)
        XCTAssertTrue(page.hasMore)
        XCTAssertEqual(page.nextCursor, "eyJ0IjoiMjAyNi0xMC0yNFQxNDowMDowMC4wMDBaIn0")

        let social = page.items[0]
        XCTAssertEqual(social.kind, .social)
        XCTAssertEqual(social.sender.kind, .agency)
        XCTAssertEqual(social.article?.id, "art-uuid")
        XCTAssertTrue(social.hasUnread)
        XCTAssertEqual(social.statusTitle, "بانتظار القرار")
        XCTAssertEqual(social.updatedAt, StaffJSON.parseDate("2026-10-24T15:00:00Z"))

        let ticket = page.items[1]
        XCTAssertEqual(ticket.kind, .ticket)
        XCTAssertNil(ticket.article)
        XCTAssertEqual(ticket.createdAt, StaffJSON.parseDate("2026-10-24T10:00:00.000Z"))
        XCTAssertNotEqual(ticket.listID, social.listID)
    }

    func testInboxDecodesScheduledAndPublishedTimesWithChips() throws {
        let page = try decoder.decode(StaffInboxPage.self, from: Fixtures.inboxScheduled.data)
        XCTAssertEqual(page.items.count, 2)

        let scheduled = page.items[0]
        XCTAssertEqual(scheduled.status, "scheduled")
        XCTAssertFalse(scheduled.hasUnread)
        XCTAssertEqual(scheduled.scheduledAt, StaffJSON.parseDate("2026-10-25T11:05:00Z"))
        XCTAssertNil(scheduled.publishedAt)
        XCTAssertEqual(scheduled.statusChipTitle, "مجدول · 14:05")

        let published = page.items[1]
        XCTAssertEqual(published.publishedAt, StaffJSON.parseDate("2026-10-25T09:00:03Z"))
        XCTAssertEqual(published.statusChipTitle, "منشورة · 12:00")

        // Older servers omit the fields: decoding still works and the chip falls back.
        let legacy = try decoder.decode(StaffInboxPage.self, from: Fixtures.inbox.data)
        XCTAssertNil(legacy.items[0].scheduledAt)
        XCTAssertNil(legacy.items[0].publishedAt)
        XCTAssertEqual(legacy.items[0].statusChipTitle, "بانتظار القرار")
    }

    func testUnknownSenderKindDoesNotBreakDecoding() throws {
        let json = Fixtures.inbox.replacingOccurrences(of: "\"kind\": \"agency\"", with: "\"kind\": \"newsroom\"")
        let page = try decoder.decode(StaffInboxPage.self, from: json.data)
        XCTAssertEqual(page.items[0].sender.kind, .unknown)
    }

    func testUnreadCounts() throws {
        let counts = try decoder.decode(StaffUnreadCounts.self, from: #"{"tickets":3,"social":2,"total":5}"#.data)
        XCTAssertEqual(counts, StaffUnreadCounts(tickets: 3, social: 2, total: 5))
    }

    func testTicketDetailDecodesThread() throws {
        let detail = try decoder.decode(StaffTicketDetail.self, from: Fixtures.ticketDetail.data)
        XCTAssertEqual(detail.ticket.status, .open)
        XCTAssertEqual(detail.ticket.writerName, "د. خالد العتيبي")
        XCTAssertEqual(detail.ticket.sender?.avatarUrl, "https://media.sabq.org/avatars/writer-uuid.jpg")
        XCTAssertEqual(detail.messages.map(\.senderRole), [.writer, .admin])
        XCTAssertEqual(detail.messages[1].parentMessageId, "msg-1")
    }

    func testSocialDetailDecodesPreviewAndAttempts() throws {
        let detail = try decoder.decode(StaffSocialDetail.self, from: Fixtures.socialDetail.data)
        XCTAssertEqual(detail.post.status, .draft)
        XCTAssertNil(detail.post.scheduledAt)
        XCTAssertEqual(detail.preview.maxLength, 280)
        XCTAssertTrue(detail.preview.valid)
        XCTAssertNil(detail.author)
        XCTAssertEqual(detail.agency?.name, "وكالة الأفق")
        XCTAssertEqual(detail.attempts.first?.httpStatus, 503)
        XCTAssertEqual(detail.attempts.first?.retryable, true)
    }

    func testUnknownSocialStatusIsTolerated() throws {
        let json = Fixtures.socialPost.replacingOccurrences(of: "\"status\": \"draft\"", with: "\"status\": \"archived\"")
        let post = try decoder.decode(StaffSocialPost.self, from: json.data)
        XCTAssertEqual(post.status, .unknown)
    }

    // MARK: - Desk v2 (sender photos, organization kind, admin screens)

    func testOlderMeDefaultsTheNewCapabilitiesToFalse() throws {
        let me = try decoder.decode(StaffMe.self, from: Fixtures.me.data)
        XCTAssertFalse(me.capabilities.canSystemHealth)
        XCTAssertFalse(me.capabilities.canAdminAlerts)
        XCTAssertFalse(me.capabilities.canSystemTab)
        XCTAssertNil(me.alertPrefs)
    }

    func testAdminMeDecodesSystemCapabilitiesAndPrefs() throws {
        let me = try decoder.decode(StaffMe.self, from: Fixtures.meAdmin.data)
        XCTAssertTrue(me.capabilities.canSystemHealth)
        XCTAssertTrue(me.capabilities.canAdminAlerts)
        XCTAssertTrue(me.capabilities.canOpenApp)
        XCTAssertEqual(me.alertPrefs, StaffAlertPrefs(aiAlerts: true, adminAlerts: false))
        XCTAssertEqual(me.profileImageUrl, "https://media.sabq.org/avatars/admin.jpg")
    }

    func testAlertPrefsDefaultToOnWhenKeysAreMissing() throws {
        XCTAssertEqual(try decoder.decode(StaffAlertPrefs.self, from: "{}".data), StaffAlertPrefs(aiAlerts: true, adminAlerts: true))
        XCTAssertEqual(try decoder.decode(StaffAlertPrefs.self, from: #"{"aiAlerts":false}"#.data),
                       StaffAlertPrefs(aiAlerts: false, adminAlerts: true))
    }

    func testInboxDecodesOrganizationSenderAvatarAndWithdrawal() throws {
        let page = try decoder.decode(StaffInboxPage.self, from: Fixtures.inboxV2.data)
        let item = try XCTUnwrap(page.items.first)
        XCTAssertEqual(item.sender.kind, .organization)
        XCTAssertEqual(item.sender.kind.title, "حساب المؤسسة")
        XCTAssertEqual(item.sender.avatarUrl, "https://media.sabq.org/avatars/u-1.jpg")
        XCTAssertEqual(item.canceledBySelf, true)
        XCTAssertEqual(item.rejectionNote, .withdrawn)
        XCTAssertEqual(item.listPreview, "نص التغريدة")
    }

    func testOlderPayloadsLeaveTheNewFieldsNil() throws {
        let page = try decoder.decode(StaffInboxPage.self, from: Fixtures.inbox.data)
        XCTAssertNil(page.items[0].sender.avatarUrl)
        XCTAssertNil(page.items[0].canceledBySelf)
        let detail = try decoder.decode(StaffSocialDetail.self, from: Fixtures.socialDetail.data)
        XCTAssertNil(detail.post.canceledBySelf)
        XCTAssertNil(detail.sender?.avatarUrl)
        XCTAssertFalse(detail.isWithdrawnBySender)
    }

    func testSystemHealthDecodesModelsBudgetsAndUnknownStatus() throws {
        let health = try decoder.decode(StaffSystemHealth.self, from: Fixtures.systemHealth.data)
        XCTAssertEqual(health.summary?.status, .partial)
        XCTAssertEqual(health.aiAlertsEnabled, true)
        let models = try XCTUnwrap(health.models)
        XCTAssertEqual(models.count, 3)
        XCTAssertEqual(models[0].effectiveStatus, .down)
        XCTAssertTrue(models[0].isQuotaExceeded)
        XCTAssertEqual(models[0].lastError?.code, "QUOTA_EXCEEDED")
        XCTAssertNil(models[1].lastError)
        XCTAssertEqual(models[1].requests24h, 2471)
        XCTAssertEqual(models[2].effectiveStatus, .unknown)
        XCTAssertNil(models[2].providerLabel)
        let budget = try XCTUnwrap(health.budgets?.first)
        XCTAssertEqual(budget.percent, 82)
        XCTAssertEqual(budget.fraction, 0.82, accuracy: 0.0001)
        XCTAssertEqual(RiyadhTime.timeString(try XCTUnwrap(health.lastCheckAt)), "18:13")
    }

    func testEmptySystemHealthStillDecodes() throws {
        let health = try decoder.decode(StaffSystemHealth.self, from: #"{"budgets":[]}"#.data)
        XCTAssertNil(health.summary)
        XCTAssertNil(health.models)
        XCTAssertEqual(health.budgets, [])
    }

    func testAdminAlertsDecodeActionsLinksAndUnknownKinds() throws {
        let alerts = try decoder.decode(StaffAdminAlerts.self, from: Fixtures.adminAlerts.data)
        XCTAssertEqual(alerts.urgentCount, 1)
        let items = try XCTUnwrap(alerts.items)
        XCTAssertEqual(items[0].kind, .socialFailed)
        XCTAssertTrue(items[0].isUrgent)
        XCTAssertEqual(items[0].retryPostID, "post-1")
        XCTAssertEqual(items[0].link, .social(id: "post-1"))
        XCTAssertEqual(items[1].action?.type, .openSystem)
        XCTAssertNil(items[1].retryPostID)
        XCTAssertEqual(items[1].link, .systemHealth)
        XCTAssertEqual(items[2].kind, .unknown)
        XCTAssertEqual(items[2].severity, .unknown)
        XCTAssertFalse(items[2].isUrgent)
        XCTAssertEqual(items[2].action?.type, .unknown)
        XCTAssertNil(items[2].occurredAt)
        XCTAssertNil(items[2].link)
    }

    func testUrgentCountFallsBackToItemsWithoutCounts() throws {
        let json = #"{"items":[{"id":"a","severity":"urgent","title":"x"},{"id":"b","severity":"info","title":"y"}]}"#
        XCTAssertEqual(try decoder.decode(StaffAdminAlerts.self, from: json.data).urgentCount, 1)
    }
}
