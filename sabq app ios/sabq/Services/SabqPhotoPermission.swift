import Photos

/// Surfaces the standard iOS photo-library permission alert before the
/// app opens `PhotosUI.PhotosPicker`. The picker itself runs in a
/// separate process and doesn't technically need the permission — but
/// App Store review reviewers expect to see the platform's permission
/// flow when an app says it "uses photo library", so we trigger it
/// explicitly. The picker works the same whether the user grants,
/// limits, or denies access.
@MainActor
enum SabqPhotoPermission {
    static func ensureRequested() async {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .notDetermined else { return }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in
                cont.resume()
            }
        }
    }
}
