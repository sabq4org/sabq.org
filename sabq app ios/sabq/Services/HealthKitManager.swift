import Foundation
import Combine
import HealthKit

final class HealthKitManager: ObservableObject {

    static let shared = HealthKitManager()

    private let store = HKHealthStore()

    @Published var todaySteps: Int?
    @Published var sleepHours: Int?
    @Published var sleepMinutes: Int?

    private var authorized = false

    private init() {}

    // MARK: - Public

    func fetchIfNeeded() {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        if authorized {
            fetch()
        } else {
            requestAuthorization()
        }
    }

    // MARK: - Authorization

    private func requestAuthorization() {
        guard
            let stepType  = HKQuantityType.quantityType(forIdentifier: .stepCount),
            let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        else { return }

        store.requestAuthorization(toShare: [], read: [stepType, sleepType]) { [weak self] ok, _ in
            guard let self, ok else { return }
            self.authorized = true
            self.fetch()
        }
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
