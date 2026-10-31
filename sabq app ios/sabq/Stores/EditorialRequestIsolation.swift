import Foundation

// عزل لوحات التحرير بين الحسابات وتجاهل الردود القديمة
// (مراجعة اللوحات 2026-10-31، البندان د وح):
// - الحساب الحالي وجيله في `EditorialAccountScope`، يحدّثه AuthStore.
// - كل طلب يأخذ تذكرة من `EditorialRequestGate` قبل await، ولا يُطبَّق ردّه
//   إلا إن بقيت التذكرة الأحدث لنفس الحساب ونفس الفترة/الفلتر.
// - ترقيم «المزيد» مربوط بالفلتر وجيله في `EditorialPageCursor`.
// - كاش «أدائي» مفتاحه الحساب + الفترة في `PerformanceSnapshotCache`.

// MARK: - الحساب الحالي

enum EditorialAccountScope {
    /// معرّف الحساب الذي تُعرض له اللوحات الآن (nil بلا دخول).
    private(set) static var currentId: String?
    /// يزيد مع كل تغيّر في الحساب — أي طلب بدأ قبله يُهمل ردّه.
    private(set) static var generation = 0

    /// يستدعيه AuthStore كلما تغيّر `currentUser`. الخروج أو التبديل من
    /// حساب معروف يمسح كاش الأداء كله؛ أول تعرّف بعد الإقلاع لا يمسحه.
    static func accountDidChange(from old: String?, to new: String?,
                                 defaults: UserDefaults = .standard) {
        guard old != new else { return }
        currentId = new
        generation += 1
        if old != nil {
            PerformanceSnapshotCache.clearAll(defaults: defaults)
        }
    }
}

// MARK: - «الأحدث يفوز»

struct EditorialRequestTicket<Key: Equatable>: Equatable {
    let key: Key
    let accountId: String?
    let accountGeneration: Int
    let sequence: Int
}

/// كل طلب جديد يُبطل ما قبله. الرد يُقبل فقط إن كانت تذكرته الأحدث، ولم
/// يتغيّر الحساب، والفترة/الفلتر الحالي هو نفسه الذي طُلب.
final class EditorialRequestGate<Key: Equatable> {
    private(set) var latestSequence = 0

    func begin(_ key: Key,
               accountId: String? = EditorialAccountScope.currentId,
               generation: Int = EditorialAccountScope.generation) -> EditorialRequestTicket<Key> {
        latestSequence += 1
        return EditorialRequestTicket(key: key, accountId: accountId,
                                      accountGeneration: generation, sequence: latestSequence)
    }

    func accepts(_ ticket: EditorialRequestTicket<Key>,
                 currentKey: Key,
                 accountId: String? = EditorialAccountScope.currentId,
                 generation: Int = EditorialAccountScope.generation) -> Bool {
        ticket.sequence == latestSequence
            && ticket.key == currentKey
            && ticket.accountId == accountId
            && ticket.accountGeneration == generation
    }
}

// MARK: - ترقيم مربوط بالفلتر

/// موضع الترقيم لفلتر واحد. أي إعادة تحميل للصفحة الأولى (تبديل الحالة أو
/// تحديث) تفتح «حقبة» جديدة، فصفحة قديمة عادت متأخرة لا تُلحق بالقائمة.
struct EditorialPageCursor<Filter: Equatable>: Equatable {
    struct Ticket: Equatable {
        let filter: Filter
        let epoch: Int
        let page: Int
    }

    private(set) var filter: Filter
    private(set) var epoch = 0
    private(set) var page = 1

    init(filter: Filter) { self.filter = filter }

    /// صفحة أولى جديدة (لنفس الفلتر أو لفلتر آخر).
    mutating func reset(to filter: Filter) -> Ticket {
        self.filter = filter
        epoch += 1
        page = 1
        return Ticket(filter: filter, epoch: epoch, page: 1)
    }

    func nextPageTicket() -> Ticket {
        Ticket(filter: filter, epoch: epoch, page: page + 1)
    }

    func accepts(_ ticket: Ticket) -> Bool {
        ticket.filter == filter && ticket.epoch == epoch
    }

    /// يثبّت الصفحة بعد قبول ردّها. يعيد false إن كانت التذكرة قديمة.
    mutating func commit(_ ticket: Ticket) -> Bool {
        guard accepts(ticket) else { return false }
        page = ticket.page
        return true
    }
}

// MARK: - كاش «أدائي»

enum PerformanceSnapshotCache {
    /// v2: مفتاح لكل حساب + فترة. v1 القديم كان بالفترة وحدها (مشترك بين الحسابات).
    static let cachePrefix = "perf-snapshot-v2-"
    static let legacyPrefix = "perf-snapshot-v1-"
    private static var legacyPurged = false

    static func entryName(accountId: String, period: String) -> String {
        cachePrefix + accountId + "-" + period
    }

    static func read(accountId: String, period: String,
                     defaults: UserDefaults = .standard) -> ContributorPerformance? {
        purgeLegacyIfNeeded(defaults: defaults)
        guard let raw = defaults.data(forKey: entryName(accountId: accountId, period: period)) else { return nil }
        return try? JSONDecoder().decode(ContributorPerformance.self, from: raw)
    }

    static func write(_ value: ContributorPerformance, accountId: String, period: String,
                      defaults: UserDefaults = .standard) {
        purgeLegacyIfNeeded(defaults: defaults)
        if let raw = try? JSONEncoder().encode(value) {
            defaults.set(raw, forKey: entryName(accountId: accountId, period: period))
        }
    }

    /// يمسح كل لقطات الأداء (كل الحسابات + الصيغة القديمة).
    static func clearAll(defaults: UserDefaults = .standard) {
        for name in defaults.dictionaryRepresentation().keys
        where name.hasPrefix(cachePrefix) || name.hasPrefix(legacyPrefix) {
            defaults.removeObject(forKey: name)
        }
    }

    /// يمسح لقطات v1 المشتركة مرة واحدة في كل تشغيل — لا تبقى بعد التحديث.
    static func purgeLegacyIfNeeded(defaults: UserDefaults = .standard) {
        guard !legacyPurged else { return }
        legacyPurged = true
        purgeLegacy(defaults: defaults)
    }

    static func purgeLegacy(defaults: UserDefaults) {
        for name in defaults.dictionaryRepresentation().keys where name.hasPrefix(legacyPrefix) {
            defaults.removeObject(forKey: name)
        }
    }
}

// MARK: - إبقاء المحتوى عند فشل التحديث

extension EditorialError {
    /// فشل عابر (شبكة/خادم): تبقى القائمة المعروضة مع تنبيه صغير. أما
    /// الدخول والتحقق بخطوتين والصلاحية فتستبدل المحتوى بشاشة السبب.
    var keepsVisibleContent: Bool {
        if case .message = self { return true }
        return false
    }
}
