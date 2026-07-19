import SwiftUI
#if canImport(UIKit)
import UIKit
#endif
import AuthenticationServices

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

/// Apple + Google sign-in buttons used inside `LoginSheet`. The buttons
/// drive `AuthStore.loginWithApple` / `loginWithGoogle` and surface any
/// SDK-side errors through `authStore.errorMessage`.
///
/// Both buttons are custom-built (not the system `SignInWithAppleButton`)
/// so the label/icon layout matches the Arabic RTL reading order — the
/// brand glyph sits at the end of the localized phrase, not before it.
///
/// Google Sign-In is gated on `canImport(GoogleSignIn)` so the project
/// keeps building before the Swift Package is added in Xcode.
struct SocialAuthButtons: View {
    @Environment(AuthStore.self) private var authStore
    let onSuccess: () -> Void

    /// Holds the Apple authorization controller delegate strongly while
    /// the request is in flight. Cleared on completion / cancel.
    @State private var appleCoordinator: AppleSignInCoordinator?

    var body: some View {
        VStack(spacing: 12) {
            appleButton
            googleButton
            dividerOr
        }
    }

    // MARK: - Apple

    private var appleButton: some View {
        Button(action: startAppleSignIn) {
            HStack(spacing: 10) {
                Text("تسجيل الدخول بـ Apple")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Image(systemName: "applelogo")
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                    .fill(Color.black)
            )
        }
        .buttonStyle(.plain)
        .disabled(authStore.isLoading)
    }

    private func startAppleSignIn() {
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let coordinator = AppleSignInCoordinator(
            onSuccess: { credential in
                handleAppleSuccess(credential)
            },
            onFailure: { error in
                handleAppleFailure(error)
            },
            onFinish: {
                Task { @MainActor in appleCoordinator = nil }
            }
        )
        appleCoordinator = coordinator

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = coordinator
        controller.presentationContextProvider = coordinator
        controller.performRequests()
    }

    private func handleAppleSuccess(_ credential: ASAuthorizationAppleIDCredential) {
        guard
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            Task { @MainActor in
                authStore.setExternalAuthError("تعذر قراءة بيانات Apple")
            }
            return
        }
        // Apple only shares fullName/email on the FIRST authorization.
        // On subsequent sign-ins these come back nil — the backend matches
        // by Apple sub.
        let firstName = credential.fullName?.givenName
        let lastName = credential.fullName?.familyName
        let email = credential.email
        Task { @MainActor in
            await authStore.loginWithApple(
                identityToken: identityToken,
                firstName: firstName,
                lastName: lastName,
                email: email
            )
            if authStore.isLoggedIn { onSuccess() }
        }
    }

    private func handleAppleFailure(_ error: Error) {
        // User-cancelled — silently dismiss.
        if let asError = error as? ASAuthorizationError, asError.code == .canceled {
            return
        }
        Task { @MainActor in
            authStore.setExternalAuthError("تعذر تسجيل الدخول عبر Apple")
        }
    }

    // MARK: - Google

    private var googleButton: some View {
        Button(action: startGoogleSignIn) {
            HStack(spacing: 10) {
                Text("المتابعة باستخدام Google")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                GoogleGLogo()
                    .frame(width: 20, height: 20)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
        .disabled(authStore.isLoading)
    }

    private func startGoogleSignIn() {
        #if canImport(GoogleSignIn)
        guard let presenter = Self.rootViewController() else {
            Task { @MainActor in
                authStore.setExternalAuthError("تعذر فتح نافذة Google")
            }
            return
        }

        GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
            if let error = error as NSError? {
                // -5 is the user-cancelled code — swallow it.
                if error.code == -5 { return }
                Task { @MainActor in
                    authStore.setExternalAuthError("تعذر تسجيل الدخول عبر Google")
                }
                return
            }
            guard let idToken = result?.user.idToken?.tokenString else {
                Task { @MainActor in
                    authStore.setExternalAuthError("لم نتلقَّ رمز Google")
                }
                return
            }
            Task { @MainActor in
                await authStore.loginWithGoogle(idToken: idToken)
                if authStore.isLoggedIn { onSuccess() }
            }
        }
        #else
        Task { @MainActor in
            authStore.setExternalAuthError("Google Sign-In SDK غير مضاف بعد")
        }
        #endif
    }

    @MainActor
    private static func rootViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let window = scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    // MARK: - Divider

    private var dividerOr: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.5))
                .frame(height: 1)
            Text("أو")
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Rectangle()
                .fill(SabqTheme.outline.opacity(0.5))
                .frame(height: 1)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Apple Sign-In Coordinator

/// Bridges Apple's UIKit-style delegate API into the SwiftUI button flow.
/// Held by `SocialAuthButtons` via `@State` so it survives the async
/// authorization round trip, and released on completion via `onFinish`.
final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
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
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        return scene?.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}

// MARK: - Google G Logo

/// Google "G" mark rendered with Canvas — four colored arcs forming an
/// almost-closed ring with a horizontal blue bar extending into the gap.
/// Approximates the official Google logo without shipping an asset.
struct GoogleGLogo: View {
    private let blue   = Color(red:  66/255, green: 133/255, blue: 244/255)
    private let red    = Color(red: 234/255, green:  67/255, blue:  53/255)
    private let yellow = Color(red: 251/255, green: 188/255, blue:   4/255)
    private let green  = Color(red:  52/255, green: 168/255, blue:  83/255)

    var body: some View {
        Canvas { context, size in
            let s = min(size.width, size.height)
            let lineW = s * 0.22
            let radius = (s - lineW) / 2
            let center = CGPoint(x: size.width / 2, y: size.height / 2)

            // Four arcs around the circle. Angles in degrees, 0° = right,
            // clockwise positive. The gap on the right (~-25° → 25°) is
            // where the horizontal bar lives.
            stroke(arc(center: center, radius: radius, from: -155, to: -90),
                   color: red, width: lineW, in: context)
            stroke(arc(center: center, radius: radius, from: -90, to: -25),
                   color: blue, width: lineW, in: context)
            stroke(arc(center: center, radius: radius, from: 25, to: 90),
                   color: green, width: lineW, in: context)
            stroke(arc(center: center, radius: radius, from: 90, to: 205),
                   color: yellow, width: lineW, in: context)

            // Horizontal blue bar from the right edge inward to the center.
            var bar = Path()
            bar.move(to: CGPoint(x: center.x, y: center.y))
            bar.addLine(to: CGPoint(x: center.x + radius + lineW / 2, y: center.y))
            context.stroke(bar, with: .color(blue),
                           style: StrokeStyle(lineWidth: lineW, lineCap: .butt))
        }
    }

    private func arc(center: CGPoint, radius: CGFloat, from start: CGFloat, to end: CGFloat) -> Path {
        var path = Path()
        path.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(start),
            endAngle: .degrees(end),
            clockwise: false
        )
        return path
    }

    private func stroke(_ path: Path, color: Color, width: CGFloat, in context: GraphicsContext) {
        context.stroke(path, with: .color(color),
                       style: StrokeStyle(lineWidth: width, lineCap: .butt))
    }
}
