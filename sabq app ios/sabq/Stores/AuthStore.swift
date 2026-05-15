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
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription
        } catch {
            errorMessage = "حدث خطأ في تسجيل الدخول"
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

            if response.emailSent == true {
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

    @MainActor
    func updateProfile(firstName: String, lastName: String, bio: String?, city: String?) async {
        isLoading = true
        errorMessage = nil
        do {
            let updated = try await APIClient.shared.updateProfile(
                firstName: firstName, lastName: lastName, bio: bio, city: city
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
            currentUser = updated
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
