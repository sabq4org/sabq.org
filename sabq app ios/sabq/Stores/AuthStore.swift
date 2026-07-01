import SwiftUI

@Observable
final class AuthStore {
    private(set) var currentUser: APIUser?
    private(set) var isLoggedIn = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var successMessage: String?
    private(set) var registrationPending = false
    /// True when the last login attempt hit a `pending` account — drives
    /// the "إعادة إرسال رمز التفعيل" affordance on the login sheet so
    /// users with an unverified email don't reach a dead end.
    private(set) var pendingActivationUserId: String?
    private(set) var pendingActivationEmail: String?
    private(set) var isResendingActivation = false
    /// True when the most-recent auth response surfaced
    /// `isProfileComplete = false` — drives the "أكمل بياناتك" banner in
    /// Settings. Kept separate from `currentUser.isProfileComplete` because
    /// the legacy `/members/profile` payload doesn't ship the column, so a
    /// later profile refresh used to overwrite the OAuth login signal with
    /// `nil` and the banner vanished. Manually cleared once the user
    /// finishes editing their profile or picks at least one interest.
    var needsProfileCompletion: Bool = false

    private var loginAttempts = 0
    private var lastLoginAttempt: Date?
    private var lastAuthenticatedAt: Date?
    private static let maxLoginAttempts = 5
    private static let loginLockoutDuration: TimeInterval = 120 // 2 minutes
    private static let sessionTimeoutDuration: TimeInterval = 30 * 24 * 3600 // 30 days

    // لا آثار جانبية في init: قيمة @State الابتدائية تُنشأ مع كل إعادة تقييم
    // لجسم sabqApp (تبديل مظهر/عودة من الخلفية) وتُهمل النسخ الزائدة — كان
    // فحص الجلسة ينطلق من كل نسخة مهملة. ContentView.task يستدعي checkAuth.

    func checkAuth() async {
        guard await APIClient.shared.hasSession else { return }

        // Session timeout check
        if let lastAuth = UserDefaults.standard.object(forKey: "sabq_last_auth_date") as? Date,
           Date().timeIntervalSince(lastAuth) > Self.sessionTimeoutDuration {
            await MainActor.run {
                currentUser = nil
                isLoggedIn = false
            }
            await APIClient.shared.markLoggedOut()
            return
        }

        await fetchFullProfile()
        // Returning session — re-register the APNs token so a stale token
        // gets refreshed lastActiveAt-wise and a new token (if iOS rotated)
        // is linked to the user.
        if isLoggedIn, let token = NotificationsStore.shared.deviceToken {
            await NotificationsStore.shared.registerWithBackend(token: token)
        }
    }

    private var isLoginLockedOut: Bool {
        guard loginAttempts >= Self.maxLoginAttempts,
              let lastAttempt = lastLoginAttempt else { return false }
        return Date().timeIntervalSince(lastAttempt) < Self.loginLockoutDuration
    }

    @MainActor
    func login(email: String, password: String) async {
        if isLoginLockedOut {
            let remaining = Int(Self.loginLockoutDuration - Date().timeIntervalSince(lastLoginAttempt!))
            errorMessage = "محاولات كثيرة. حاول مرة أخرى بعد \(remaining) ثانية"
            return
        }

        isLoading = true
        errorMessage = nil
        successMessage = nil
        pendingActivationUserId = nil
        pendingActivationEmail = nil
        loginAttempts += 1
        lastLoginAttempt = Date()
        do {
            let response = try await APIClient.shared.login(email: email, password: password)
            loginAttempts = 0
            if let token = response.token {
                await APIClient.shared.setAuthToken(token)
            }
            await APIClient.shared.markAuthenticated()
            UserDefaults.standard.set(Date(), forKey: "sabq_last_auth_date")
            if let loginUser = response.user {
                currentUser = loginUser
                isLoggedIn = true
                SabqAnalytics.setUserId(loginUser.id)
                SabqAnalytics.login(method: "email")
            }
            await fetchFullProfile()
            // Request push permission + register the device token. Permission
            // is asked once per install — if the user previously granted or
            // denied, the system surfaces no prompt and the call completes
            // immediately. Editorial pushes route through this token.
            await registerPushTokenAfterAuth()
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription
            // Account exists but is still pending email verification.
            // Remember the userId + email so the login sheet can show
            // the "resend activation" affordance and the action knows
            // which account to target.
            if case let .accountPendingActivation(_, userId) = apiError {
                pendingActivationUserId = userId
                pendingActivationEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        } catch {
            errorMessage = "حدث خطأ في تسجيل الدخول"
        }
        isLoading = false
    }

    /// Re-send the activation email for the account whose login attempt
    /// surfaced `requiresActivation: true`. Uses the saved userId when
    /// available; falls back to the email the user typed into the
    /// login form so admins or shared devices still get a useful
    /// outcome.
    @MainActor
    func resendActivation() async {
        guard pendingActivationUserId != nil || pendingActivationEmail != nil else { return }
        isResendingActivation = true
        errorMessage = nil
        successMessage = nil
        defer { isResendingActivation = false }
        do {
            let response = try await APIClient.shared.resendActivation(
                userId: pendingActivationUserId,
                email: pendingActivationEmail
            )
            if response.success {
                successMessage = response.message ?? "تم إرسال رمز التفعيل إلى بريدك الإلكتروني"
            } else {
                errorMessage = response.message ?? "تعذر إعادة إرسال رمز التفعيل"
            }
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription
        } catch {
            errorMessage = "تعذر إعادة إرسال رمز التفعيل"
        }
    }

    /// Called after every successful auth (login, register, checkAuth) to
    /// link the current APNs device token to this account. Asks for
    /// permission on first run; relies on the system delegate to deliver
    /// the token to NotificationsStore which then PUTs it to backend.
    @MainActor
    private func registerPushTokenAfterAuth() async {
        _ = await NotificationsStore.shared.requestPermission()
        if let token = NotificationsStore.shared.deviceToken {
            await NotificationsStore.shared.registerWithBackend(token: token)
        }
    }

    /// Sign in with Google. Caller passes the ID token obtained from the
    /// GoogleSignIn-iOS SDK (`GIDSignIn.sharedInstance.signIn`).
    @MainActor
    func loginWithGoogle(idToken: String) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        pendingActivationUserId = nil
        pendingActivationEmail = nil
        do {
            let response = try await APIClient.shared.loginWithGoogle(idToken: idToken)
            if let token = response.token {
                await APIClient.shared.setAuthToken(token)
            }
            await APIClient.shared.markAuthenticated()
            UserDefaults.standard.set(Date(), forKey: "sabq_last_auth_date")
            if let loginUser = response.user {
                currentUser = loginUser
                isLoggedIn = true
                needsProfileCompletion = loginUser.isProfileComplete == false
                SabqAnalytics.setUserId(loginUser.id)
                SabqAnalytics.login(method: "google")
            }
            await fetchFullProfile()
            await registerPushTokenAfterAuth()
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription
        } catch {
            errorMessage = "تعذر تسجيل الدخول عبر Google"
        }
        isLoading = false
    }

    /// Sign in with Apple. Apple only shares `firstName` / `lastName` /
    /// `email` on the FIRST authorization for a given Apple ID — pass nil
    /// on subsequent attempts. The backend matches by Apple `sub` so the
    /// account is found even when the user info is missing.
    @MainActor
    func loginWithApple(
        identityToken: String,
        firstName: String?,
        lastName: String?,
        email: String?
    ) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        pendingActivationUserId = nil
        pendingActivationEmail = nil
        do {
            let response = try await APIClient.shared.loginWithApple(
                identityToken: identityToken,
                firstName: firstName,
                lastName: lastName,
                email: email
            )
            if let token = response.token {
                await APIClient.shared.setAuthToken(token)
            }
            await APIClient.shared.markAuthenticated()
            UserDefaults.standard.set(Date(), forKey: "sabq_last_auth_date")
            if let loginUser = response.user {
                currentUser = loginUser
                isLoggedIn = true
                needsProfileCompletion = loginUser.isProfileComplete == false
                SabqAnalytics.setUserId(loginUser.id)
                SabqAnalytics.login(method: "apple")
            }
            await fetchFullProfile()
            await registerPushTokenAfterAuth()
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription
        } catch {
            errorMessage = "تعذر تسجيل الدخول عبر Apple"
        }
        isLoading = false
    }

    @MainActor
    func register(name: String, email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        registrationPending = false
        do {
            let response = try await APIClient.shared.register(name: name, email: email, password: password)

            // Backend now (2026-05-16) auto-activates accounts created
            // via the mobile flow and returns a session token + user
            // alongside the registration confirmation. If both are
            // present, treat this as an instant login — the user goes
            // straight into the app instead of staring at a "check your
            // email" screen. Falls back to the old "registration pending"
            // path for older builds or future flows that opt out.
            if let token = response.token, let loginUser = response.user {
                await APIClient.shared.setAuthToken(token)
                await APIClient.shared.markAuthenticated()
                UserDefaults.standard.set(Date(), forKey: "sabq_last_auth_date")
                currentUser = loginUser
                isLoggedIn = true
                SabqAnalytics.setUserId(loginUser.id)
                SabqAnalytics.login(method: "register")
                successMessage = response.message ?? "تم إنشاء الحساب بنجاح"
                // Pull the full profile so role/interests populate ASAP.
                await fetchFullProfile()
                await registerPushTokenAfterAuth()
            } else if response.emailSent == true {
                registrationPending = true
                successMessage = response.message ?? "تم إنشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب"
            } else {
                successMessage = response.message ?? "تم إنشاء الحساب بنجاح"
                registrationPending = true
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// Push the user's selected interest category ids to the backend and
    /// refresh `currentUser` so the new `interests[]` array surfaces in the
    /// UI immediately. No-op for guests (the backend would 401).
    @MainActor
    func updateInterests(categoryIds: [String]) async {
        guard isLoggedIn else { return }
        do {
            try await APIClient.shared.updateMemberInterests(categoryIds: categoryIds)
            // Picking at least one interest is enough to clear the
            // "أكمل بياناتك" banner — the rest (city/bio/gender) is
            // nice-to-have, not required for personalization.
            if !categoryIds.isEmpty {
                needsProfileCompletion = false
            }
            await fetchFullProfile()
        } catch {
            errorMessage = "تعذر تحديث الاهتمامات"
        }
    }

    @MainActor
    func updateProfile(firstName: String, lastName: String, bio: String?, city: String?, gender: String?) async {
        isLoading = true
        errorMessage = nil
        do {
            let updated = try await APIClient.shared.updateProfile(
                firstName: firstName, lastName: lastName, bio: bio, city: city, gender: gender
            )
            currentUser = updated
            // Saving the profile edit form means the user filled in the
            // bits the OAuth provider didn't share — clear the banner.
            needsProfileCompletion = false
            successMessage = "تم تحديث الملف الشخصي"
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    func uploadAvatar(imageData: Data) async {
        isLoading = true
        errorMessage = nil
        do {
            let updated = try await APIClient.shared.uploadAvatar(imageData: imageData)
            // The avatar endpoint now returns the freshly-updated user row,
            // but on older deploys it may return an empty placeholder. Use
            // the returned user only if it has an id; otherwise pull the
            // full profile to refresh state. Either way the image URL is
            // reflected in `currentUser` after this call.
            if !updated.id.isEmpty,
               (updated.email != nil || updated.firstName != nil || updated.avatar != nil) {
                currentUser = updated
            } else {
                await fetchFullProfile()
            }
            successMessage = "تم تحديث الصورة الشخصية"
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    func changePassword(currentPassword: String, newPassword: String) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        do {
            try await APIClient.shared.changePassword(currentPassword: currentPassword, newPassword: newPassword)
            successMessage = "تم تغيير كلمة المرور بنجاح"
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    @MainActor
    func deleteAccount(password: String) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        // نفس تفكيك logout: ألغِ تسجيل جهاز الدفع قبل هدم الجلسة (بعدها يرفض
        // الخادم النداء بـ401) — كان الجهاز يبقى مستهدفًا بإشعارات حساب
        // محذوف، وأحداث GA4 اللاحقة تُنسب لمعرّفه. عند فشل الحذف (كلمة مرور
        // خاطئة مثلًا) نعيد التسجيل كي لا يخسر المستخدم إشعاراته.
        await NotificationsStore.shared.unregisterCurrentToken()
        do {
            try await APIClient.shared.deleteAccount(password: password)
            currentUser = nil
            isLoggedIn = false
            needsProfileCompletion = false
            SabqAnalytics.setUserId(nil)
            NotificationsStore.shared.unreadCount = 0
            successMessage = "تم حذف الحساب بنجاح"
        } catch {
            errorMessage = error.localizedDescription
            if let token = NotificationsStore.shared.deviceToken {
                await NotificationsStore.shared.registerWithBackend(token: token)
            }
        }
        isLoading = false
    }

    @MainActor
    func forgotPassword(email: String) async {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        do {
            try await APIClient.shared.forgotPassword(email: email)
            // Server sends a 6-digit code via email, not a link.
            // Wording fixed so the iOS sheet stops promising a "رابط".
            successMessage = "تم إرسال رمز التحقق إلى بريدك الإلكتروني"
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    /// Phase 2 of the iOS forgot-password flow — submits the 6-digit
    /// code the user just received by email along with the new
    /// password. Returns true on success so the sheet can swap to the
    /// "done" state.
    @MainActor
    func resetPasswordWithCode(email: String, code: String, newPassword: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        successMessage = nil
        defer { isLoading = false }
        do {
            try await APIClient.shared.resetPassword(email: email, code: code, newPassword: newPassword)
            successMessage = "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @MainActor
    func logout() async {
        // Stop targeting this device with editorial pushes before the
        // session is torn down — once the auth token clears, the
        // unregister endpoint would 401.
        await NotificationsStore.shared.unregisterCurrentToken()

        try? await APIClient.shared.logout()
        currentUser = nil
        isLoggedIn = false
        needsProfileCompletion = false
        SabqAnalytics.setUserId(nil)
        NotificationsStore.shared.unreadCount = 0
        successMessage = nil
        errorMessage = nil
    }

    @MainActor
    func clearMessages() {
        errorMessage = nil
        successMessage = nil
        registrationPending = false
        pendingActivationUserId = nil
        pendingActivationEmail = nil
    }

    /// Surface an error raised outside `login*` flows — used by the
    /// social auth buttons when the iOS SDK itself fails (user cancels
    /// rarely-typed paths, missing entitlement, etc.) BEFORE we ever
    /// reach the backend. Keeps `errorMessage` as the single source of
    /// truth for the login sheet.
    @MainActor
    func setExternalAuthError(_ message: String) {
        errorMessage = message
        successMessage = nil
        isLoading = false
    }

    private func fetchFullProfile() async {
        do {
            let user = try await APIClient.shared.fetchCurrentUser()
            await MainActor.run {
                currentUser = user
                isLoggedIn = true
                // Surface the "أكمل بياناتك" banner across cold starts
                // (foregrounding the app, killing + reopening, etc.) once
                // the backend `/members/profile` endpoint ships the column.
                // Until then this is a no-op — the OAuth login sets the
                // flag explicitly and nothing here will reset it.
                if user.isProfileComplete == false {
                    needsProfileCompletion = true
                }
                SabqAnalytics.setUserId(user.id)
            }
        } catch {
            // Only clear the session on an authoritative auth failure
            // (401/403 from the server). Previously ANY error — including
            // transient airplane-mode hiccups, server 500s, or DNS — wiped
            // the user, surprising the reader with an unexpected logout
            // every time the network blipped. Now transient errors leave
            // the cached currentUser in place and the next foreground
            // fetch tries again.
            let isAuthFailure: Bool = {
                if let apiError = error as? APIError {
                    switch apiError {
                    case .unauthorized, .forbidden: return true
                    default: return false
                    }
                }
                return false
            }()

            if isAuthFailure {
                await APIClient.shared.markLoggedOut()
                await MainActor.run {
                    isLoggedIn = false
                    currentUser = nil
                }
            } else if await MainActor.run(body: { currentUser }) == nil {
                // Cold start + transient error → no cached user to fall
                // back on. Leave `isLoggedIn = false` so the UI doesn't
                // pretend we have a session, but DON'T wipe the keychain
                // token — the next attempt will retry with the same auth.
                await MainActor.run { isLoggedIn = false }
            }
        }
    }

}
