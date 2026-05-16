import SwiftUI

@Observable
final class AuthStore {
    private(set) var currentUser: APIUser?
    private(set) var isLoggedIn = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var successMessage: String?
    private(set) var unreadNotifications = 0
    private(set) var registrationPending = false

    private var loginAttempts = 0
    private var lastLoginAttempt: Date?
    private var lastAuthenticatedAt: Date?
    private static let maxLoginAttempts = 5
    private static let loginLockoutDuration: TimeInterval = 120 // 2 minutes
    private static let sessionTimeoutDuration: TimeInterval = 30 * 24 * 3600 // 30 days

    init() {
        Task { await checkAuth() }
    }

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
        if isLoggedIn, let token = await NotificationsStore.shared.deviceToken {
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
            }
            await fetchFullProfile()
            // Request push permission + register the device token. Permission
            // is asked once per install — if the user previously granted or
            // denied, the system surfaces no prompt and the call completes
            // immediately. Editorial pushes route through this token.
            await registerPushTokenAfterAuth()
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription
        } catch {
            errorMessage = "حدث خطأ في تسجيل الدخول"
        }
        isLoading = false
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
        do {
            try await APIClient.shared.deleteAccount(password: password)
            currentUser = nil
            isLoggedIn = false
            unreadNotifications = 0
            successMessage = "تم حذف الحساب بنجاح"
        } catch {
            errorMessage = error.localizedDescription
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
            successMessage = "تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني"
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
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
        unreadNotifications = 0
        successMessage = nil
        errorMessage = nil
    }

    @MainActor
    func clearMessages() {
        errorMessage = nil
        successMessage = nil
        registrationPending = false
    }

    @MainActor
    func markAllNotificationsReadLocally() {
        unreadNotifications = 0
    }

    private func fetchFullProfile() async {
        do {
            let user = try await APIClient.shared.fetchCurrentUser()
            await MainActor.run {
                currentUser = user
                isLoggedIn = true
            }
            await refreshUnreadCount()
        } catch {
            if await MainActor.run(body: { currentUser }) == nil {
                await APIClient.shared.markLoggedOut()
                await MainActor.run {
                    isLoggedIn = false
                    currentUser = nil
                }
            }
        }
    }

    func refreshUnreadCount() async {
        guard isLoggedIn else { return }
        let count = (try? await APIClient.shared.fetchUnreadCount()) ?? 0
        await MainActor.run { unreadNotifications = count }
    }
}
