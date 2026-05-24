import Foundation
import Combine
import HealthKit

/// HealthKit access is opt-in via an invitation card inside the
/// "رحلتك المعرفية" block — the system prompt only fires after the
/// reader taps "تفعيل" (issue #72 follow-up, 2026-05-24). Until then we
/// never call `requestAuthorization`, so the prompt can't appear before
/// the user has even seen the home screen.
///
/// Apple's HealthKit only reports `.sharingDenied` for *write*
/// authorization. For read-only authorization there's no API to tell
/// "granted" from "denied" — both surface as `.notDetermined`. We work
/// around that by persisting a `hasOptedIn` flag the moment the user
/// confirms the system sheet (the request completion fires for both
/// allow + deny). Subsequent fetches honor that flag.
final class HealthKitManager: ObservableObject {

    static let shared = HealthKitManager()

    private let store = HKHealthStore()
    private let optedInKey = "sabq_health_opted_in_v1"

    @Published var todaySteps: Int?
    @Published var sleepHours: Int?
    @Published var sleepMinutes: Int?
    /// True after the user has dismissed the HealthKit prompt (allow OR
    /// deny). Drives the card's "invitation vs. metrics" state.
    @Published private(set) var hasOptedIn: Bool

    private init() {
        self.hasOptedIn = UserDefaults.standard.bool(forKey: "sabq_health_opted_in_v1")
    }

    // MARK: - Public

    /// Whether the device has HealthKit at all (iPad / Mac may not).
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Fetch today's metrics if the user has previously opted in. No
    /// prompt is shown here — `requestAccess` is the only path that
    /// surfaces the system sheet.
    func fetchIfNeeded() {
        guard isAvailable, hasOptedIn else { return }
        fetch()
    }

    /// User tapped "تفعيل" on the invitation card. Surfaces the system
    /// permission sheet once; flips `hasOptedIn` on completion regardless
    /// of the user's choice (Apple's read-auth API can't distinguish
    /// allow from deny). Subsequent fetches read whatever the user
    /// actually granted.
    @MainActor
    func requestAccess() async {
        guard isAvailable else { return }
        guard
            let stepType  = HKQuantityType.quantityType(forIdentifier: .stepCount),
            let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        else { return }

        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            store.requestAuthorization(toShare: [], read: [stepType, sleepType]) { _, _ in
                cont.resume()
            }
        }

        UserDefaults.standard.set(true, forKey: optedInKey)
        self.hasOptedIn = true
        fetch()
    }

    // MARK: - Fetch

    private func fetch() {
        fetchSteps()
        fetchSleep()
    }

    private func fetchSteps() {
        guard let type = HKQuantityType.quantityType(forIdentifier: .stepCount) else { return }
        let calendar   = Calendar.current
        let startOfDay = calendar.startOfDay(for: Date())
        let predicate  = HKQuery.predicateForSamples(withStart: startOfDay, end: Date())

        let query = HKStatisticsQuery(
            quantityType: type,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum
        ) { [weak self] _, result, _ in
            let steps = result?.sumQuantity()?.doubleValue(for: .count())
            DispatchQueue.main.async {
                self?.todaySteps = steps.map { Int($0) }
            }
        }
        store.execute(query)
    }

    private func fetchSleep() {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return }
        let calendar  = Calendar.current
        let yesterday = calendar.date(byAdding: .hour, value: -18, to: calendar.startOfDay(for: Date()))!
        let predicate = HKQuery.predicateForSamples(withStart: yesterday, end: Date())
        let sortDesc  = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)

        let query = HKSampleQuery(
            sampleType: type,
            predicate: predicate,
            limit: 50,
            sortDescriptors: [sortDesc]
        ) { [weak self] _, samples, _ in
            let asleepValues: Set<Int> = [
                HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                HKCategoryValueSleepAnalysis.asleepREM.rawValue,
            ]
            let totalSeconds = (samples as? [HKCategorySample])?
                .filter { asleepValues.contains($0.value) }
                .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                ?? 0

            let hours   = Int(totalSeconds) / 3600
            let minutes = (Int(totalSeconds) % 3600) / 60
            DispatchQueue.main.async {
                if totalSeconds > 0 {
                    self?.sleepHours   = hours
                    self?.sleepMinutes = minutes
                } else {
                    self?.sleepHours   = nil
                    self?.sleepMinutes = nil
                }
            }
        }
        store.execute(query)
    }
}
