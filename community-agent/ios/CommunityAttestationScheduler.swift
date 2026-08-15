import BackgroundTasks
import Foundation

/// Best-effort scheduling only: iOS decides when, or whether, a background task runs.
final class CommunityAttestationScheduler {
    static let refreshIdentifier = "org.chronomesh.agent.refresh"

    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.refreshIdentifier, using: nil) { task in
            self.handle(task: task as! BGAppRefreshTask)
        }
    }

    func scheduleNext() {
        let request = BGAppRefreshTaskRequest(identifier: Self.refreshIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    private func handle(task: BGAppRefreshTask) {
        scheduleNext()
        task.expirationHandler = { /* cancel bounded measurement work */ }
        Task {
            // 1. Obtain a one-time challenge using the locally stored enrollment credential.
            // 2. Run one bounded UDP NTP measurement against the operator-configured host.
            // 3. Sign the canonical payload with a device-held Ed25519 key and submit once.
            // 4. Finish without retry loops; the OS and the next scheduled task control cadence.
            task.setTaskCompleted(success: false)
        }
    }
}
