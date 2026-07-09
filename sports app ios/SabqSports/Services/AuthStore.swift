import SwiftUI
import AuthenticationServices
import Security
@preconcurrency import UserNotifications

// إدارة جلسة العضو (تسجيل دخول Apple → Bearer عبر /api/v1/auth/apple). الرمز
// يُحفظ في Keychain ويُضبط على APIClient لكل الطلبات المحميّة (المتابعة/التنبيهات).
// @Observable + @MainActor: تُحقن في البيئة وتُحدّث الواجهة تلقائيًّا.
/// مصدر خطأ الدخول — لتوجيه الرسالة تحت الزر المناسب في ورقة الدخول.
enum SpAuthErrorSource { case none, credentials, apple, phone }

@MainActor
@Observable
final class SpAuthStore {
    static let shared = SpAuthStore()

    private(set) var member: SpMember?
    private(set) var token: String?
    var isLoading = false
    var errorMessage: String?
    /// مصدر آخر خطأ — ليعرض كلٌّ تحت زره الصحيح (خطأ العضوية تحت الزر الأخضر،
    /// وخطأ Apple تحت زر Apple) فلا يُظنّ أن خطأ الحقول يخصّ دخول Apple.
    var errorSource: SpAuthErrorSource = .none

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
            member = SpMember(
                id: stored.id,
                name: stored.name,
                email: stored.email,
                avatar: stored.avatar,
                phone: stored.phone,
                isProfileComplete: stored.isProfileComplete
            )
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
            persistMember(m)
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
        errorSource = .none
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
            errorMessage = L("تعذّر قراءة بيانات Apple")
            errorSource = .apple
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
        errorMessage = L("تعذّر تسجيل الدخول عبر Apple")
        errorSource = .apple
    }

    private func exchange(identityToken: String, firstName: String?, lastName: String?, email: String?) async {
        isLoading = true
        errorMessage = nil
        errorSource = .none
        do {
            let resp = try await APIClient.shared.loginWithApple(
                identityToken: identityToken, firstName: firstName, lastName: lastName, email: email
            )
            try await applySession(resp)
        } catch {
            errorMessage = friendly(error)
            errorSource = .apple
        }
        isLoading = false
    }

    // MARK: - دخول بحساب سبق (بريد/جوال + كلمة المرور)

    func loginWithCredentials(identifier: String, password: String) async {
        let id = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, !password.isEmpty else {
            errorMessage = L("أدخل البريد/الجوال وكلمة المرور")
            errorSource = .credentials
            return
        }
        isLoading = true
        errorMessage = nil
        errorSource = .none
        do {
            let resp = try await APIClient.shared.loginWithIdentifier(id, password: password)
            try await applySession(resp)
        } catch {
            errorMessage = friendly(error)
            errorSource = .credentials
        }
        isLoading = false
    }

    // MARK: - دخول/تسجيل بالجوال (Twilio Verify)

    /// إرسال رمز التحقّق للجوال. يرجع (نجاح، رسالة) للعرض في الواجهة.
    func sendPhoneCode(_ phone: String) async -> (ok: Bool, message: String) {
        isLoading = true; errorMessage = nil; errorSource = .none
        defer { isLoading = false }
        do {
            let resp = try await APIClient.shared.sendPhoneCode(phone)
            let msg = resp.message ?? (resp.success ? L("تم إرسال رمز التحقق") : L("تعذّر إرسال رمز التحقق"))
            if !resp.success { errorMessage = msg; errorSource = .phone }
            return (resp.success, msg)
        } catch {
            let msg = friendly(error)
            errorMessage = msg; errorSource = .phone
            return (false, msg)
        }
    }

    /// التحقّق من الرمز وتثبيت الجلسة عند النجاح.
    func verifyPhoneCode(_ phone: String, code: String) async -> Bool {
        isLoading = true; errorMessage = nil; errorSource = .phone
        defer { isLoading = false }
        do {
            let resp = try await APIClient.shared.verifyPhoneCode(phone, code: code)
            try await applySession(resp)
            return true
        } catch {
            errorMessage = friendly(error)
            errorSource = .phone
            return false
        }
    }

    /// تثبيت الجلسة بعد أي مسار دخول (Apple/بريد/جوال): الرمز + العضو + Keychain + العميل.
    private func applySession(_ resp: SpLoginResponse) async throws {
        guard let t = resp.token, !t.isEmpty else {
            throw NSError(domain: "sabqsports", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: resp.message ?? L("بيانات الدخول غير صحيحة")])
        }
        token = t
        if let m = resp.member { persistMember(m) }
        SpKeychain.save(tokenKey, value: t)
        await APIClient.shared.setAuthToken(t)
        await loadUserData()
    }

    /// رفع صورة شخصية — نفس `profileImageUrl` على حساب سبق (ويب + VARA).
    @discardableResult
    func uploadAvatar(imageData: Data) async -> Bool {
        guard isLoggedIn else { return false }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            if let updated = try await APIClient.shared.uploadMemberAvatar(imageData: imageData),
               !updated.id.isEmpty {
                persistMember(updated)
                return true
            }
            await loadUserData()
            return true
        } catch let e as APIError {
            switch e {
            case .server(_, let msg): errorMessage = msg ?? L("تعذّر رفع الصورة")
            default: errorMessage = e.errorDescription ?? L("تعذّر رفع الصورة")
            }
            return false
        } catch {
            errorMessage = L("تعذّر رفع الصورة")
            return false
        }
    }

    /// تحديث الاسم (مرة واحدة إن كان فارغًا) و/أو استبدال البريد الاصطناعي ببريد حقيقي.
    @discardableResult
    func updateProfile(firstName: String?, lastName: String?, email: String?) async -> Bool {
        guard isLoggedIn else { return false }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            var body = SpProfileUpdateRequest()
            let fn = firstName?.trimmingCharacters(in: .whitespacesAndNewlines)
            let ln = lastName?.trimmingCharacters(in: .whitespacesAndNewlines)
            if let fn, !fn.isEmpty { body.firstName = fn }
            if let ln, !ln.isEmpty { body.lastName = ln }
            let em = email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if let em, !em.isEmpty { body.email = em }

            guard body.firstName != nil || body.lastName != nil || body.email != nil else {
                errorMessage = L("لا توجد تغييرات للحفظ")
                return false
            }

            if let updated = try await APIClient.shared.updateMemberProfile(body), !updated.id.isEmpty {
                persistMember(updated)
                return true
            }
            // احتياط: أعد جلب الملف إن رجعت الاستجابة بلا user.
            await loadUserData()
            return errorMessage == nil
        } catch let e as APIError {
            switch e {
            case .server(_, let msg): errorMessage = msg ?? L("تعذّر حفظ الملف الشخصي")
            default: errorMessage = e.errorDescription ?? L("تعذّر حفظ الملف الشخصي")
            }
            return false
        } catch {
            errorMessage = L("تعذّر حفظ الملف الشخصي")
            return false
        }
    }

    private func persistMember(_ m: SpMember) {
        member = m
        let stored = SpStoredMember(
            id: m.id,
            name: m.name,
            email: m.email,
            avatar: m.avatar,
            phone: m.phone,
            isProfileComplete: m.isProfileComplete
        )
        if let data = try? JSONEncoder().encode(stored) {
            UserDefaults.standard.set(data, forKey: memberKey)
        }
    }

    private func friendly(_ error: Error) -> String {
        if let e = error as? APIError {
            switch e {
            case .unauthorized: return L("البريد/الجوال أو كلمة المرور غير صحيحة")
            case .forbidden: return L("هذا الحساب غير مفعّل أو محظور")
            case .rateLimited: return L("محاولات كثيرة، حاول بعد قليل")
            default: return e.errorDescription ?? L("تعذّر تسجيل الدخول")
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
        // نمسح فقط ما هو مرتبط بالحساب: المتابعات وتفضيلات التنبيهات المُحمَّلة من
        // الخادم بعد الدخول. أمّا التخصيص المحلّي (الفريق المفضّل + متابعة المباريات
        // + البطولات المفضّلة) فيعمل بلا تسجيل دخول ويجب أن يبقى بعد الخروج —
        // مسحه كان يُفقد المستخدم فريقه ومبارياته المتابَعة عند كل خروج.
        followedKeys = []
        follows = []
        alertPrefs = SpAlertPrefs()
        // تنبيهات الخادم تتوقّف أصلًا بإلغاء تسجيل رمز الدفع أعلاه؛ نُنهي الأنشطة
        // الحيّة فقط لأنها مرتبطة بدفع APNs للجلسة.
        SpLiveActivityManager.shared.endAll()
        SpKeychain.delete(tokenKey)
        UserDefaults.standard.removeObject(forKey: memberKey)
        Task { await APIClient.shared.setAuthToken(nil) }
    }

    /// حذف الحساب نهائيًّا (Apple 5.1.1(v)). أصحاب كلمة المرور: تُطلب للتأكيد؛
    /// حسابات Apple/الجوال (بلا كلمة مرور): تُمرَّر "" ويحذف الخادم بالجلسة. عند
    /// النجاح يُنهي الجلسة محلّيًّا. الخادم: DELETE /api/v1/members/account.
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
            case .unauthorized: errorMessage = L("كلمة المرور غير صحيحة")
            case .server(_, let msg): errorMessage = msg ?? L("تعذّر حذف الحساب")
            default: errorMessage = e.errorDescription ?? L("تعذّر حذف الحساب")
            }
            return false
        } catch {
            errorMessage = L("تعذّر حذف الحساب")
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
    let phone: String?
    let isProfileComplete: Bool?

    init(
        id: String,
        name: String?,
        email: String?,
        avatar: String?,
        phone: String? = nil,
        isProfileComplete: Bool? = nil
    ) {
        self.id = id
        self.name = name
        self.email = email
        self.avatar = avatar
        self.phone = phone
        self.isProfileComplete = isProfileComplete
    }
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

// MARK: - البطولات المفضّلة (تخصيص محلّي خفيف)

// مثل «الفريق المفضّل» لكن متعدد: يحفظ لقطة البطولة كاملة حتى يظهر بلك
// «بطولاتي» فورًا في تبويب البطولات، بلا تسجيل دخول وبلا انتظار شبكة.
@MainActor
@Observable
final class SpCompetitionFavorites {
    static let shared = SpCompetitionFavorites()

    private(set) var items: [SpCompetition] = []

    private let key = "sabqsports.favorite.competitions"

    private init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let stored = try? JSONDecoder().decode([SpCompetition].self, from: data) {
            items = stored
        }
    }

    func isFavorite(_ slug: String) -> Bool {
        items.contains { $0.slug == slug }
    }

    func toggle(_ competition: SpCompetition) {
        if isFavorite(competition.slug) {
            remove(competition.slug)
        } else {
            add(competition)
        }
    }

    func add(_ competition: SpCompetition) {
        guard !isFavorite(competition.slug) else { return }
        items.append(competition)
        persist()
    }

    func remove(_ slug: String) {
        items.removeAll { $0.slug == slug }
        persist()
    }

    func sync(with competitions: [SpCompetition]) {
        guard !items.isEmpty else { return }
        let bySlug = Dictionary(uniqueKeysWithValues: competitions.map { ($0.slug, $0) })
        var changed = false
        items = items.map { stored in
            if let fresh = bySlug[stored.slug], fresh != stored {
                changed = true
                return fresh
            }
            return stored
        }
        if changed { persist() }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
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
    private var didLoadStored = false

    /// حلقة الاستطلاع الدوري الأمامية (تُلغى عند خلفية التطبيق).
    private var autoRefreshTask: Task<Void, Never>?

    /// هل توجد مباراة متابَعة جارية الآن — يحكم وتيرة الاستطلاع.
    var hasLiveFollowed: Bool { items.contains { $0.status.live } }

    /// ما يُعرض فعليًا في بطاقة «مبارياتي» بعد تطبيق قاعدة الإخفاء.
    var visibleItems: [SpFixture] {
        let now = Date()
        return items.filter { !shouldHideFinished($0, now: now) }
    }

    private init() {}

    func loadStoredIfNeeded() {
        guard !didLoadStored else { return }
        didLoadStored = true
        if let data = UserDefaults.standard.data(forKey: key),
           let stored = try? JSONDecoder().decode([SpFixture].self, from: data) {
            items = stored.sorted { $0.timestamp < $1.timestamp }
        }
        if let data = UserDefaults.standard.data(forKey: finishedAtKey),
           let stored = try? JSONDecoder().decode([String: TimeInterval].self, from: data) {
            finishedAtById = stored
        }
        pruneExpiredFinishedMatches()
        purgeScheduledKickoffNotifications()
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
        Task { await SpWidgetBridge.sync(follows: visibleItems, favoriteId: SpFavorites.shared.team?.id) }
    }

    /// يحقن نسخ الجدول الأحدث داخل «مبارياتي» عند تحميل أي شاشة للمباريات.
    /// هذا يمنع أن تبقى البطاقة/Live Activity على لقطة ما قبل الانطلاق بينما
    /// نفس المباراة صارت مباشرة في الجدول العام.
    func updateFromFixtures(_ fixtures: [SpFixture]) {
        for fixture in fixtures where isFollowing(fixture.id) {
            update(fixture)
        }
    }

    // MARK: - الاستطلاع الدوري المستقل (يُبقي «مبارياتي» + الويدجت متحدّثَين)
    //
    // المشكلة التي يعالجها: النشاط الحيّ والبطاقة كانا يتغذّيان فقط من شاشةٍ تستطلع
    // (مركز المباراة) أو من سحبٍ يدوي للرئيسية. فعلى أي شاشة أخرى يتجمّد الاثنان.
    // هذه الحلقة تستطلع المباريات المتابَعة الجارية دوريًّا ما دام التطبيق أمامياً،
    // فتُحدّث البطاقة وتغذّي النشاط الحيّ عبر `update()` بلا اعتماد على الشاشة المعروضة.

    /// يبدأ الاستطلاع الدوري (آمن للاستدعاء المتكرّر — لا يُنشئ أكثر من حلقة).
    func startAutoRefresh() {
        loadStoredIfNeeded()
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
                let interval: UInt64 = self.hasLiveFollowed ? 5_000_000_000 : 30_000_000_000
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

        // تذكير قبل ١٠ دقائق فقط. لا إشعار محلّي عند الموعد المجدول — إشعار
        // «انطلقت المباراة» يصل من الخادم عند البداية الفعلية (تغيّر الحالة)،
        // والمحلّي كان يزدوج معه ويكذب حين تتأخر الصافرة (قرار المالك 2026-07-04).
        let preDate = fixture.kickoff.addingTimeInterval(-10 * 60)
        if preDate > Date() {
            schedule(center, id: "match-\(fixture.id)-pre", at: preDate,
                     title: title, body: L("تبدأ المباراة بعد ١٠ دقائق ⚽"))
        }
    }

    /// تنظيف إشعارات «الانطلاق بالموعد» المعلّقة من إصدارات سابقة — مرة عند الإقلاع.
    private func purgeScheduledKickoffNotifications() {
        UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
            let ids = requests.map(\.identifier)
                .filter { $0.hasPrefix("match-") && $0.hasSuffix("-kick") }
            guard !ids.isEmpty else { return }
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
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
