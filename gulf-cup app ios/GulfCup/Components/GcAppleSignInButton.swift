import SwiftUI
import AuthenticationServices

/// زر Apple Sign-In — واجهة iOS 17+ (onRequest + onCompletion).
struct GcAppleSignInButton: View {
    @Environment(GcAuthStore.self) private var auth

    var body: some View {
        SignInWithAppleButton(.signIn, onRequest: { request in
            request.requestedScopes = [.fullName, .email]
        }, onCompletion: { result in
            auth.completeAppleSignIn(result)
        })
        .signInWithAppleButtonStyle(.black)
        .frame(height: 44)
        .clipShape(RoundedRectangle(cornerRadius: GcTheme.buttonRadius))
    }
}
