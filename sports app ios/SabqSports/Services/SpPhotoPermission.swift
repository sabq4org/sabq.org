import Photos

/// يطلب إذن مكتبة الصور قبل فتح PhotosPicker — مطلوب لمراجعة App Store.
@MainActor
enum SpPhotoPermission {
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
