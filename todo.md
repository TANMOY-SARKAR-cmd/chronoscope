# ChronoMesh TODO

- [x] Define shared NTP four-timestamp measurement contracts and uncertainty formulas.
- [x] Add persisted measurement, room, and server-health data models with migration SQL.
- [x] Build the server-side upstream NTP authority health monitor for Cloudflare, Google, NIST, and NTP pool.
- [x] Add a timestamp endpoint, anonymous five-character room validation, and persisted measurement reporting API.
- [x] Configure realtime room report delivery using WebSocket transport with fallback-safe connection behavior; the platform Data API is external-data retrieval only and is not a room pub/sub service.
- [x] Implement the client multi-sample burst sync, lowest-delay filtering, median offset, uncertainty, and stability score calculations.
- [x] Build the dark cyberpunk ChronoMesh dashboard with the exact #a3e635 accent and monospace numerical display.
- [x] Build the high-resolution corrected UTC clock with uncertainty shown on every time and offset value.
- [x] Build the Sync Engine with a Recharts jitter chart, raw sample table, and T1–T4 formula walkthrough.
- [x] Build the upstream authority health panel for Cloudflare, Google, NIST, and NTP pool.
- [x] Build anonymous live peer rooms with exact five-character codes, relative offsets, confidence colors, and leaderboard.
- [x] Build the honest precision panel covering timer-resolution context, uncertainty, and physical limits.
- [x] Compute and display combined uncertainty for every derived relative peer offset.
- [x] Audit clock and timestamp renderings so each timing value has an explicit per-value uncertainty label.
- [x] Add explicit uncertainty labels to raw delay/RTT, leaderboard jitter, and the primary corrected UTC timestamp.
- [x] Add Vitest coverage for measurement math, room validation, and leaderboard stability scoring.
- [x] Run type checks, test suite, and visual responsive verification; resolve any errors.
- [ ] Save the completed release checkpoint and provide the version for review.
