import SwiftUI
import PassKit
import UIKit

// "بطاقتي الصحفية" screen. Shows a preview of the press card, an
// "Add to Apple Wallet" button (PKAddPassButton), and a short
// explainer. The status query gates the screen: unauthorized users
// see a clear "contact admin" message instead of an empty Add button.
struct PressCardActivationView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss

    @State private var status: APIClient.APIPressPassStatus?
    @State private var isCheckingStatus = true
    @State private var isIssuing = false
    @State private var errorMessage: String?
    @State private var pendingPass: PKPass?
    @State private var showAddSheet = false

    // No local role mapping — the activation-screen preview reads the
    // role label straight from /api/v1/wallet/press/status, which
    // computes it via the same map PressPassBuilder uses to print
    // the actual .pkpass. That keeps the preview and the printed
    // card from drifting (the previous local switch said "مدير"
    // for system_admin while the printed card said "مدير النظام").

    private var userName: String {
        let f = authStore.currentUser?.firstName ?? ""
        let l = authStore.currentUser?.lastName ?? ""
        let combined = [f, l].filter { !$0.isEmpty }.joined(separator: " ")
        return combined.isEmpty ? (authStore.currentUser?.email ?? "حامل البطاقة") : combined
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if isCheckingStatus {
                    ProgressView()
                        .padding(.top, 40)
                } else if let status, status.authorized {
                    authorizedBody(status: status)
                } else {
                    unauthorizedBody
                }
            }
            .padding(16)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .navigationTitle("بطاقتي الصحفية")
        .navigationBarTitleDisplayMode(.inline)
        .task { await refreshStatus() }
        .alert("لم نتمكّن من إضافة البطاقة", isPresented: .constant(errorMessage != nil), actions: {
            Button("حسناً", role: .cancel) { errorMessage = nil }
        }, message: {
            Text(errorMessage ?? "")
        })
        .sheet(isPresented: $showAddSheet, onDismiss: { pendingPass = nil }) {
            if let pendingPass {
                PKAddPassesRepresentable(pass: pendingPass) { added in
                    showAddSheet = false
                    if added {
                        Task { await refreshStatus() }
                    }
                }
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    // MARK: - Authorized

    @ViewBuilder
    private func authorizedBody(status: APIClient.APIPressPassStatus) -> some View {
        PressCardView(
            userName: userName,
            roleAr: status.roleLabel ?? "عضو سبق",
            jobTitle: status.jobTitle,
            department: nil,
            pressIdNumber: status.serialNumber,
            validUntil: nil,
            profileImageUrl: authStore.currentUser?.avatar
        )

        VStack(spacing: 10) {
            Text(status.hasPass
                 ? "بطاقتك مُصدرة بالفعل. اضغط الزر لإعادة إضافتها إذا حذفتها من Apple Wallet."
                 : "أضف بطاقتك إلى Apple Wallet للوصول إليها بنقرة واحدة من قفل الشاشة.")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)

            addToWalletButton

            if isIssuing {
                ProgressView().padding(.top, 2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
        )

        helpSection
    }

    private var addToWalletButton: some View {
        // Apple's outlined Wallet button — lighter visual weight than
        // the solid black variant we shipped first, which the user felt
        // dominated the screen. .blackOutline renders transparent fill
        // with a thin border + Apple's own Wallet glyph, which is what
        // matches sabq's minimalist look. Height clamped to 38pt so it
        // sits as a button, not a banner.
        AddPassButtonRepresentable(style: PKAddPassButtonStyle.blackOutline, isEnabled: !isIssuing) {
            Task { await issuePass() }
        }
        .frame(height: 38)
        .frame(maxWidth: 260)
    }

    // MARK: - Unauthorized

    private var unauthorizedBody: some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.shield.fill")
                .font(SabqFonts.app(size: 42))
                .foregroundStyle(SabqTheme.secondaryInk)
            Text("غير مصرّح لك بإصدار بطاقة صحفية")
                .font(SabqFonts.app(size: 16, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            Text("البطاقة متاحة للمراسلين وكتّاب الرأي والمحرّرين. إذا اعتقدت أن هذا خطأ، تواصل مع إدارة سبق.")
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)
        }
        .padding(24)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
        )
    }

    // MARK: - Help

    private var helpSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("كيف تعمل البطاقة؟")
                .font(SabqFonts.app(size: 13, weight: .heavy))
                .foregroundStyle(SabqTheme.ink)
            bullet("تُحفظ في تطبيق Wallet على iPhone و Apple Watch")
            bullet("تُحدَّث تلقائياً عند تجديد صلاحيتها من قبل سبق")
            bullet("اعرضها على شاشة القفل بالنقر على زر الجانب مرتين")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(.ultraThinMaterial)
        )
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Circle().fill(SabqTheme.secondaryInk).frame(width: 4, height: 4)
            Text(text)
                .font(SabqFonts.app(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
    }

    // MARK: - Networking

    private func refreshStatus() async {
        isCheckingStatus = true
        defer { isCheckingStatus = false }
        do {
            status = try await APIClient.shared.fetchPressPassStatus()
        } catch {
            // Treat any failure as "couldn't check" — show the
            // unauthorized state so the user gets a clear message.
            status = APIClient.APIPressPassStatus(
                success: false, authorized: false, hasPass: false,
                serialNumber: nil, issuedAt: nil,
                roleLabel: nil, jobTitle: nil
            )
        }
    }

    private func issuePass() async {
        guard !isIssuing else { return }
        isIssuing = true
        defer { isIssuing = false }
        do {
            let data = try await APIClient.shared.downloadPressPass()
            let pkpass = try PKPass(data: data)
            await MainActor.run {
                pendingPass = pkpass
                showAddSheet = true
            }
        } catch let APIError.apiMessage(msg) {
            errorMessage = msg
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - UIKit Bridges

// PKAddPassesViewController as a SwiftUI sheet. We do NOT inline this
// inside a Button because PKAddPassesViewController needs a presenter,
// and the cleanest in SwiftUI is to drive it via .sheet.
struct PKAddPassesRepresentable: UIViewControllerRepresentable {
    let pass: PKPass
    let onFinish: (Bool) -> Void

    func makeUIViewController(context: Context) -> UIViewController {
        if let vc = PKAddPassesViewController(pass: pass) {
            vc.delegate = context.coordinator
            return vc
        }
        // Fallback: empty controller that immediately calls back so the
        // sheet dismisses gracefully on simulators where PassKit is
        // unsupported.
        let fallback = UIViewController()
        DispatchQueue.main.async { onFinish(false) }
        return fallback
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, PKAddPassesViewControllerDelegate {
        let onFinish: (Bool) -> Void
        init(onFinish: @escaping (Bool) -> Void) { self.onFinish = onFinish }
        func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
            onFinish(true)
        }
    }
}

// PKAddPassButton with a tap-action. Wraps the system button rather
// than imitating it so the visual matches Apple's HIG exactly.
struct AddPassButtonRepresentable: UIViewRepresentable {
    let style: PKAddPassButtonStyle
    let isEnabled: Bool
    let action: () -> Void

    func makeUIView(context: Context) -> PKAddPassButton {
        let button = PKAddPassButton(addPassButtonStyle: style)
        button.addTarget(context.coordinator, action: #selector(Coordinator.tap), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: PKAddPassButton, context: Context) {
        uiView.isEnabled = isEnabled
        context.coordinator.action = action
    }

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func tap() { action() }
    }
}
