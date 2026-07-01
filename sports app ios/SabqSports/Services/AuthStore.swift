import SwiftUI
import AuthenticationServices
import Security
import UserNotifications

// إدارة جلسة العضو (تسجيل دخول Apple → Bearer عبر /api/v1/auth/apple). الرمز
// يُحفظ في Keychain ويُضبط على APIClient لكل الطلبات المحميّة (المتابعة/التنبيهات).
// @Observable + @MainActor: تُحقن في البيئة وتُحدّث الواجهة تلقائيًّا.
@MainActor
@Observable
final class SpAuthStore {
    static let shared = SpAuthStore()

    private(set) var member: SpMember?
    private(set) var token: String?
    var isLoading = false
    var errorMessage: String?

    // متابعات المستخدم + تفضيلات التنبيهات (تُحمَّل بعد الدخول).
    private(set) var followedKeys: Set<String> = []
    private(set) var follows: [SpFollow] = []
    private(set) var alertPrefs = SpAlertPrefs()

    // رمز جهاز APNs (يصل من AppDelegate) — يُرفع للخادم عند توفّر الجلسة.
    private(set) var pushToken: String?

    var isLoggedIn: Bool { token != nil }

    func isFollowing(kind: String, refId: String) -> Bool {
        followedKeys.contains("\(kind):\(refId)")
    }

    private let tokenKey = "sabqsports.session.token"
    private let memberKey = "sabqsports.session.member"
    private var appleCoordinator: SpAppleSignInCoordinator?

    private init() {}

    /// استرجاع الجلسة المحفوظة عند الإقلاع.
    func restore() async {
        if let t = SpKeychain.load(tokenKey) {
            token = t
            await APIClient.shared.setAuthToken(t)
        }
        if let data = UserDefaults.standard.data(forKey: memberKey),
           let stored = try? JSONDecoder().decode(SpStoredMember.self, from: data) {
            member = SpMember(id: stored.id, name: stored.name, email: stored.email, avatar: stored.avatar)
        }
        if isLoggedIn { await loadUserData() }
    }

    // MARK: - المتابعة + التفضيلات

    // MARK: - إشعارات APNs

    /// يطلب إذن الإشعارات (مرّة) ويسجّل للإشعارات البعيدة → يصل الرمز لـAppDelegate.
    func enablePushNotifications() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// يُستدعى من AppDelegate عند وصول رمز الجهاز.
    func setPushToken(_ hex: String) {
        pushToken = hex
        Task { await uploadPushToken() }
    }

    /// يربط رمز الجهاز بالعضو على الخادم (يحتاج جلسة + member.id).
    func uploadPushToken() async {
        guard isLoggedIn, let token = pushToken, let uid = member?.id, !uid.isEmpty else { return }
        try? await APIClient.shared.registerDevice(deviceToken: token, userId: uid)
    }

    func loadUserData() async {
        guard isLoggedIn else { return }
        // تحديث ملف العضو (صورة/اسم) — الكاش المحلي قد يكون أقدم.
        if let m = try? await APIClient.shared.fetchMemberProfile(), !m.id.isEmpty {
            member = m
            if let data = try? JSONEncoder().encode(SpStoredMember(id: m.id, name: m.name, email: m.email, avatar: m.avatar)) {
                UserDefaults.standard.set(data, forKey: memberKey)
            }
        }
        if let f = try? await APIClient.shared.fetchFollows() {
            follows = f
            followedKeys = Set(f.map { $0.key })
        }
        if let p = try? await APIClient.shared.fetchAlertPrefs() {
            alertPrefs = p
        }
        // الإشعارات: نطلب الإذن ونسجّل الجهاز (الرمز يصل عبر AppDelegate ثم يُرفع)
        // فور تسجيل الدخول — لا شاشات تعريفية لتأجيله بعدها.
        await enablePushNotifications()
        // مزامنة متابعات المباريات المحلّية كي تصلها الإشعارات اللحظية.
        SpMatchFollows.shared.syncAllToServer()
        await uploadPushToken()
    }

    func toggleFollow(kind: String, refId: String, refName: String, refLogo: String?) async {
        guard isLoggedIn else { return }
        let key = "\(kind):\(refId)"
        let wasFollowing = followedKeys.contains(key)
        if wasFollowing { followedKeys.remove(key) } else { followedKeys.insert(key) }  // تفاؤليًّا
        do {
            if wasFollowing {
                try await APIClient.shared.removeFollow(kind: kind, refId: refId)
                follows.removeAll { $0.key == key }
            } else {
                try await APIClient.shared.addFollow(kind: kind, refId: refId, refName: refName, refLogo: refLogo)
            }
        } catch {
            // تراجُع عند الفشل
            if wasFollowing { followedKeys.insert(key) } else { followedKeys.remove(key) }
        }
    }

    func setAlertPrefs(_ prefs: SpAlertPrefs) async {
        let old = alertPrefs
        alertPrefs = prefs  // تفاؤليًّا
        do {
            alertPrefs = try await APIClient.shared.updateAlertPrefs(prefs)
        } catch {
            alertPrefs = old
        }
    }

    // MARK: - تسجيل دخول Apple

    func startAppleSignIn() {
        errorMessage = nil
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let coordinator = SpAppleSignInCoordinator(
            onSuccess: { [weak self] credential in
                Task { @MainActor in self?.handleApple(credential) }
            },
            onFailure: { [weak self] error in
                Task { @MainActor in self?.handleAppleFailure(error) }
            },
            onFinish: { [weak self] in
                Task { @MainActor in self?.appleCoordinator = nil }
            }
        )
        appleCoordinator = coordinator

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = coordinator
        controller.presentationContextProvider = coordinator
        controller.performRequests()
    }

    private func handleApple(_ credential: ASAuthorizationAppleIDCredential) {
        guard let data = credential.identityToken,
              let identityToken = String(data: data, encoding: .utf8) else {
            errorMessage = "تعذّر قراءة بيانات Apple"
            return
        }
        // Apple يشارك الاسم/البريد في أول تفويض فقط؛ لاحقًا يطابق الخادم بـsub.
        let firstName = credential.fullName?.givenName
        let lastName = credential.fullName?.familyName
        let email = credential.email
        Task { await exchange(identityToken: identityToken, firstName: firstName, lastName: lastName, email: email) }
    }

    private func handleAppleFailure(_ error: Error) {
        if let asError = error as? ASAuthorizationError, asError.code == .canceled { return }
        errorMessage = "تعذّر تسجيل الدخول عبر Apple"
    }

    private func exchange(identityToken: String, firstName: String?, lastName: String?, email: String?) async {
        isLoading = true
        errorMessage = nil
        do {
            let resp = try await APIClient.shared.loginWithApple(
                identityToken: identityToken, firstName: firstName, lastName: lastName, email: email
            )
            try await applySession(resp)
        } catch {
            errorMessage = friendly(error)
        }
        isLoading = false
    }

    // MARK: - دخول بحساب سبق (بريد/جوال + كلمة المرور)

    func loginWithCredentials(identifier: String, password: String) async {
        let id = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, !password.isEmpty else {
            errorMessage = "أدخل البريد/الجوال وكلمة المرور"
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let resp = try await APIClient.shared.loginWithIdentifier(id, password: password)
            try await applySession(resp)
        } catch {
            errorMessage = friendly(error)
        }
        isLoading = false
    }

    /// تثبيت الجلسة بعد أي مسار دخول (Apple/بريد): الرمز + العضو + Keychain + العميل.
    private func applySession(_ resp: SpLoginResponse) async throws {
        guard let t = resp.token, !t.isEmpty else {
            throw NSError(domain: "sabqsports", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: resp.message ?? "بيانات الدخول غير صحيحة"])
        }
        token = t
        member = resp.member
        SpKeychain.save(tokenKey, value: t)
        if let m = resp.member,
           let data = try? JSONEncoder().encode(SpStoredMember(id: m.id, name: m.name, email: m.email, avatar: m.avatar)) {
            UserDefaults.standard.set(data, forKey: memberKey)
        }
        await APIClient.shared.setAuthToken(t)
        await loadUserData()
    }

    private func friendly(_ error: Error) -> String {
        if let e = error as? APIError {
            switch e {
            case .unauthorized: return "البريد/الجوال أو كلمة المرور غير صحيحة"
            case .forbidden: return "هذا الحساب غير مفعّل أو محظور"
            case .rateLimited: return "محاولات كثيرة، حاول بعد قليل"
            default: return e.errorDescription ?? "تعذّر تسجيل الدخول"
            }
        }
        return error.localizedDescription
    }

    func signOut() {
        // إلغاء ربط رمز الدفع على الخادم أولًا كي لا تستمر تنبيهات العضو السابق لهذا الجهاز.
        if let push = pushToken {
            Task { try? await APIClient.shared.unregisterDevice(deviceToken: push) }
        }
        token = nil
        member = nil
        followedKeys = []
        follows = []
        alertPrefs = SpAlertPrefs()
        SpFavorites.shared.clear()
        SpMatchFollows.shared.clearAll()
        SpLiveActivityManager.shared.endAll()
        SpKeychain.delete(tokenKey)
        UserDefaults.standard.removeObject(forKey: memberKey)
        Task { await APIClient.shared.setAuthToken(nil) }
    }

    /// حذف الحساب نهائيًّا — يتطلّب كلمة المرور للتأكيد (Apple 5.1.1(v)). عند النجاح
    /// يُنهي الجلسة محلّيًّا. الخادم: DELETE /api/v1/members/account.
    func deleteAccount(password: String) async -> Bool {
        guard isLoggedIn else { return false }
        isLoading = true; errorMessage = nil
        defer { isLoading = false }
        do {
            let body = try JSONEncoder().encode(["password": password])
            _ = try await APIClient.shared.send(method: "DELETE", path: "/members/account",
                                                jsonBody: body, apiRoot: URLConstants.mobileAPI)
            signOut()
            return true
        } catch let e as APIError {
            switch e {
            case .unauthorized: errorMessage = "كلمة المرور غير صحيحة"
            case .server(_, let msg): errorMessage = msg ?? "تعذّر حذف الحساب"
            default: errorMessage = e.errorDescription ?? "تعذّر حذف الحساب"
            }
            return false
        } catch {
            errorMessage = "تعذّر حذف الحساب"
            return false
        }
    }
}

/// عضو مخزّن محليًّا (Codable) — SpMember يفكّ بمرونة فلا يُرمَّز.
struct SpStoredMember: Codable {
    let id: String
    let name: String?
    let email: String?
    let avatar: String?
}

// MARK: - الفريق المفضّل (تخصيص محلّي خفيف)

// «الفريق المفضّل» — تخصيص محلّي يعمل حتى دون تسجيل دخول (UserDefaults). مستقلّ
// عن نظام المتابعة (الذي يتطلّب جلسة + خادمًا): النجمة هنا فورية وبلا شبكة →
// أداء عالٍ وتجربة شخصية من أول تشغيل. «المفضّل» واحد يتصدّر الرئيسية، بينما
// المتابعة قد تشمل عدّة فِرق.
@MainActor
@Observable
final class SpFavorites {
    static let shared = SpFavorites()

    private(set) var team: SpFavTeam?

    private let key = "sabqsports.favorite.team"

    private init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let t = try? JSONDecoder().decode(SpFavTeam.self, from: data) {
            team = t
        }
    }

    func isFavorite(_ id: Int) -> Bool { team?.id == id }

    func toggle(id: Int, name: String, logo: String?) {
        if team?.id == id { clear() } else { set(id: id, name: name, logo: logo) }
    }

    func set(id: Int, name: String, logo: String?) {
        let t = SpFavTeam(id: id, name: name, logo: logo)
        team = t
        if let data = try? JSONEncoder().encode(t) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    func clear() {
        team = nil
        UserDefaults.standard.removeObject(forKey: key)
    }
}

nonisolated struct SpFavTeam: Codable, Identifiable, Hashable {
    let id: Int
    let name: String
    let logo: String?
}

// «متابعة المباريات» — متابعة مباريات بعينها (روشن أساسًا، وكأس العالم تجريبيًّا).
// تخصيص محلّي يعمل **بلا تسجيل دخول** (UserDefaults): نحفظ لقطة كاملة من المباراة
// (`SpFixture`) لعرضها فورًا في بطاقة «مبارياتي» بالرئيسية مع عدّاد تنازلي حيّ، ونجدّد
// حالتها/نتيجتها من الخادم عند فتح الرئيسية. الفائدة المزدوجة:
//   1) تتصدّر بطاقة «مبارياتي» الواجهة (أوّل بطاقة).
//   2) إشعارات محلّية تذكيرية (قبل ١٠ دقائق + لحظة الانطلاق) تُجدوَل/تُلغى تلقائيًّا.
@MainActor
@Observable
final class SpMatchFollows {
    static let shared = SpMatchFollows()

    /// المباريات المتابَعة مرتّبة زمنيًّا (الأقرب انطلاقًا أولًا).
    private(set) var items: [SpFixture] = []

    private let key = "sabqsports.followed.matches"
    private let finishedAtKey = "sabqsports.followed.matches.finishedAt"
    private let finishedGrace: TimeInterval = 5 * 60
    private let refreshLead: TimeInterval = 3 * 3600
    private let refreshTail: TimeInterval = 24 * 3600
    private var finishedAtById: [String: TimeInterval] = [:]

    /// حلقة الاستطلاع الدوري الأمامية (تُلغى عند خلفية التطبيق).
    private var autoRefreshTask: Task<Void, Never>?

    /// هل توجد مباراة متابَعة جارية الآن — يحكم وتيرة الاستطلاع.
    var hasLiveFollowed: Bool { items.contains { $0.status.live } }

    /// ما يُعرض فعليًا في بطاقة «مبارياتي» بعد تطبيق قاعدة الإخفاء.
    var visibleItems: [SpFixture] {
        let now = Date()
        return items.filter { !shouldHideFinished($0, now: now) }
    }

    private init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let stored = try? JSONDecoder().decode([SpFixture].self, from: data) {
            items = stored.sorted { $0.timestamp < $1.timestamp }
        }
        if let data = UserDefaults.standard.data(forKey: finishedAtKey),
           let stored = try? JSONDecoder().decode([String: TimeInterval].self, from: data) {
            finishedAtById = stored
        }
        pruneExpiredFinishedMatches()
    }

    func isFollowing(_ id: Int) -> Bool { items.contains { $0.id == id } }

    func toggle(_ fixture: SpFixture) {
        if isFollowing(fixture.id) { remove(fixture.id) } else { add(fixture) }
    }

    func add(_ fixture: SpFixture) {
        guard !isFollowing(fixture.id) else { return }
        guard !shouldHideFinished(fixture, now: Date()) else { return }
        items.append(fixture)
        noteFinishedIfNeeded(fixture, now: Date())
        sortAndPersist()
        Task { await requestNotificationAuthIfNeeded() }
        scheduleReminders(for: fixture)
        syncFollow(fixture)
    }

    func remove(_ id: Int) {
        let removed = items.first { $0.id == id }
        items.removeAll { $0.id == id }
        finishedAtById.removeValue(forKey: String(id))
        sortAndPersist()
        cancelReminders(for: id)
        if let removed { syncUnfollow(removed.id) }
        else { syncUnfollow(id) }
    }

    func clearAll() {
        let ids = items.map(\.id)
        items = []
        finishedAtById = [:]
        stopAutoRefresh()
        UserDefaults.standard.removeObject(forKey: key)
        UserDefaults.standard.removeObject(forKey: finishedAtKey)
        for id in ids {
            cancelReminders(for: id)
        }
    }

    /// تحديث لقطة مباراة متابَعة بأحدث حالة/نتيجة (يُبقي المتابعة كما هي).
    func update(_ fixture: SpFixture) {
        guard let idx = items.firstIndex(where: { $0.id == fixture.id }) else { return }
        let now = Date()
        noteFinishedIfNeeded(fixture, now: now)
        if shouldHideFinished(fixture, now: now) {
            remove(fixture.id)
            return
        }
        items[idx] = fixture
        sortAndPersist()
        // أعد جدولة التذكير إن تغيّر موعد الانطلاق ولم تبدأ بعد.
        if !fixture.started { scheduleReminders(for: fixture) }
        else { cancelReminders(for: fixture.id) }
        // حدّث نشاط شاشة القفل إن كان قائمًا لهذه المباراة (no-op إن لم يوجد).
        SpLiveActivityManager.shared.update(with: fixture)
    }

    // MARK: - الاستطلاع الدوري المستقل (يُبقي «مبارياتي» + الويدجت متحدّثَين)
    //
    // المشكلة التي يعالجها: النشاط الحيّ والبطاقة كانا يتغذّيان فقط من شاشةٍ تستطلع
    // (مركز المباراة) أو من سحبٍ يدوي للرئيسية. فعلى أي شاشة أخرى يتجمّد الاثنان.
    // هذه الحلقة تستطلع المباريات المتابَعة الجارية دوريًّا ما دام التطبيق أمامياً،
    // فتُحدّث البطاقة وتغذّي النشاط الحيّ عبر `update()` بلا اعتماد على الشاشة المعروضة.

    /// يبدأ الاستطلاع الدوري (آمن للاستدعاء المتكرّر — لا يُنشئ أكثر من حلقة).
    func startAutoRefresh() {
        pruneExpiredFinishedMatches()
        guard autoRefreshTask == nil else { return }
        autoRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                self.pruneExpiredFinishedMatches()
                let shouldPoll = self.items.contains { f in
                    self.shouldRefresh(f, now: Date())
                }
                if shouldPoll { await self.refresh() }
                if Task.isCancelled { return }
                // وتيرة متكيّفة: أسرع أثناء المباراة/قربها، وأبطأ عندما لا شيء نشط.
                let interval: UInt64 = self.hasLiveFollowed ? 10_000_000_000 : 30_000_000_000
                try? await Task.sleep(nanoseconds: interval)
            }
        }
    }

    /// يوقف الاستطلاع الدوري (عند انتقال التطبيق للخلفية).
    func stopAutoRefresh() {
        autoRefreshTask?.cancel()
        autoRefreshTask = nil
    }

    /// يجدّد حالة/نتيجة المباريات الجارية أو القريبة من الانطلاق (±٣ ساعات) من الخادم.
    func refresh() async {
        let now = Date()
        pruneExpiredFinishedMatches(now: now)
        let targets = items.filter { shouldRefresh($0, now: now) }
        guard !targets.isEmpty else { return }
        await withTaskGroup(of: SpFixture?.self) { group in
            for f in targets {
                group.addTask { try? await APIClient.shared.fetchFollowedFixture(f, ignoreCache: true) }
            }
            for await fx in group { if let fx { update(fx) } }
        }
        pruneExpiredFinishedMatches()
    }

    private func sortAndPersist() {
        items.sort { $0.timestamp < $1.timestamp }
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
        if let data = try? JSONEncoder().encode(finishedAtById) {
            UserDefaults.standard.set(data, forKey: finishedAtKey)
        }
    }

    /// ينظّف المباريات المنتهية بعد 5 دقائق من رصد نهايتها، مع تقدير احتياطي عند
    /// فتح التطبيق بعد النهاية كي لا تبقى مباراة قديمة عالقة في «مبارياتي».
    func pruneExpiredFinishedMatches(now: Date = Date()) {
        var changed = false
        for f in items where f.status.finished {
            if noteFinishedIfNeeded(f, now: now) { changed = true }
        }

        let expired = items.filter { shouldHideFinished($0, now: now) }
        guard !expired.isEmpty else {
            if changed { sortAndPersist() }
            return
        }

        let expiredIds = Set(expired.map(\.id))
        items.removeAll { expiredIds.contains($0.id) }
        for id in expiredIds {
            finishedAtById.removeValue(forKey: String(id))
            cancelReminders(for: id)
            syncUnfollow(id)
        }
        sortAndPersist()
    }

    private func shouldRefresh(_ fixture: SpFixture, now: Date) -> Bool {
        if fixture.status.finished { return false }
        if fixture.status.live { return true }
        let kickoff = fixture.kickoff
        return now >= kickoff.addingTimeInterval(-refreshLead)
            && now <= kickoff.addingTimeInterval(refreshTail)
    }

    @discardableResult
    private func noteFinishedIfNeeded(_ fixture: SpFixture, now: Date) -> Bool {
        guard fixture.status.finished else {
            return finishedAtById.removeValue(forKey: String(fixture.id)) != nil
        }
        let id = String(fixture.id)
        guard finishedAtById[id] == nil else { return false }
        finishedAtById[id] = estimatedFinishedAt(for: fixture, observedAt: now).timeIntervalSince1970
        return true
    }

    private func shouldHideFinished(_ fixture: SpFixture, now: Date) -> Bool {
        guard fixture.status.finished else { return false }
        let observed = finishedAtById[String(fixture.id)]
            .map { Date(timeIntervalSince1970: $0) }
            ?? estimatedFinishedAt(for: fixture, observedAt: now)
        return now.timeIntervalSince(observed) >= finishedGrace
    }

    private func estimatedFinishedAt(for fixture: SpFixture, observedAt now: Date) -> Date {
        let elapsed = fixture.status.elapsed ?? 90
        let extra = fixture.status.extra ?? 0
        let estimated = fixture.kickoff.addingTimeInterval(TimeInterval(elapsed + extra + 20) * 60)
        return min(now, estimated)
    }

    // MARK: - المزامنة مع الخادم (للإشعارات اللحظية — تتطلّب تسجيل دخول)
    //
    // البطاقة والتذكيرات المحلّية تعمل بلا تسجيل دخول، لكن إشعارات الأهداف/النهاية
    // اللحظية تربط المباراة بحساب المستخدم وجهازه عبر `/api/v1/sports/follows`
    // (kind="match"). عند عدم تسجيل الدخول نتجاهل المزامنة بصمت (نكتفي بالمحلّي).

    private func syncFollow(_ f: SpFixture) {
        guard SpAuthStore.shared.isLoggedIn else { return }
        let refName = "\(f.home.name) ✕ \(f.away.name)"
        Task {
            try? await APIClient.shared.addFollow(
                kind: "match", refId: String(f.id), refName: refName, refLogo: f.home.logo)
        }
    }

    private func syncUnfollow(_ id: Int) {
        guard SpAuthStore.shared.isLoggedIn else { return }
        Task { try? await APIClient.shared.removeFollow(kind: "match", refId: String(id)) }
    }

    /// مزامنة كل المتابعات المحلّية للخادم — تُستدعى بعد تسجيل الدخول كي تصل
    /// الإشعارات للمباريات التي تابعها المستخدم قبل الدخول.
    func syncAllToServer() {
        guard SpAuthStore.shared.isLoggedIn else { return }
        let snapshot = items
        Task {
            for f in snapshot {
                let refName = "\(f.home.name) ✕ \(f.away.name)"
                try? await APIClient.shared.addFollow(
                    kind: "match", refId: String(f.id), refName: refName, refLogo: f.home.logo)
            }
        }
    }

    // MARK: - الإشعارات المحلّية (تذكير قبل ١٠ دقائق + لحظة الانطلاق)

    private func requestNotificationAuthIfNeeded() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
    }

    private func scheduleReminders(for fixture: SpFixture) {
        let center = UNUserNotificationCenter.current()
        cancelReminders(for: fixture.id)
        guard !fixture.started else { return }
        let title = "\(fixture.home.name) ✕ \(fixture.away.name)"

        // تذكير قبل ١٠ دقائق.
        let preDate = fixture.kickoff.addingTimeInterval(-10 * 60)
        if preDate > Date() {
            schedule(center, id: "match-\(fixture.id)-pre", at: preDate,
                     title: title, body: "تبدأ المباراة بعد ١٠ دقائق ⚽")
        }
        // تذكير لحظة الانطلاق.
        if fixture.kickoff > Date() {
            schedule(center, id: "match-\(fixture.id)-kick", at: fixture.kickoff,
                     title: title, body: "انطلقت المباراة الآن! 🔥")
        }
    }

    private func schedule(_ center: UNUserNotificationCenter, id: String, at date: Date,
                          title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }

    private func cancelReminders(for id: Int) {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["match-\(id)-pre", "match-\(id)-kick"])
    }
}

// MARK: - Keychain (تخزين آمن لرمز الجلسة)

enum SpKeychain {
    static func save(_ key: String, value: String) {
        let data = Data(value.utf8)
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        var attrs = base
        attrs[kSecValueData as String] = data
        SecItemAdd(attrs as CFDictionary, nil)
    }

    static func load(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - منسّق Apple Sign-In (جسر delegate الـUIKit إلى SwiftUI)

nonisolated final class SpAppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let onSuccess: (ASAuthorizationAppleIDCredential) -> Void
    private let onFailure: (Error) -> Void
    private let onFinish: () -> Void

    init(
        onSuccess: @escaping (ASAuthorizationAppleIDCredential) -> Void,
        onFailure: @escaping (Error) -> Void,
        onFinish: @escaping () -> Void
    ) {
        self.onSuccess = onSuccess
        self.onFailure = onFailure
        self.onFinish = onFinish
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { onFinish() }
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
            onSuccess(credential)
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        onFailure(error)
        onFinish()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // يُستدعى على الخيط الرئيسي من ASAuthorizationController.
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            return scene?.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}

// MARK: - AppDelegate (رمز APNs + عرض الإشعار في المقدّمة)

final class SpAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        SpAuthStore.shared.setPushToken(hex)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        #if DEBUG
        print("[Push] register failed: \(error.localizedDescription)")
        #endif
    }

    // إظهار الإشعار كبانر حتى والتطبيق مفتوح.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }
}
