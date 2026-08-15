# ChronoMesh iOS Companion

The iOS companion is a **best-effort evidence client**, not an always-on NTP daemon. Apple controls background execution and may defer or omit `BGAppRefreshTask` and `BGProcessingTask` runs. The app must communicate that limitation plainly, expose the time of the last accepted attestation, and allow the user to disable the feature or revoke the agent enrollment from ChronoMesh.

The companion should generate an Ed25519 key in the Keychain/Secure Enclave where supported; it should never export the private key. It should request an attestation challenge immediately before a bounded UDP NTP measurement, sign the canonical payload described in `shared/agentTrust.ts`, submit it over TLS, and erase the challenge after use. It must not enumerate networks or scan host ranges.

`CommunityAttestationScheduler.swift` is a scheduling skeleton. Production work still needs a Swift NTP client, Keychain implementation, certificate handling, privacy labels, entitlement review, and background-task identifiers registered in the app’s Info.plist.
