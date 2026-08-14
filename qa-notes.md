# ChronoMesh Visual QA Notes

## 2026-08-14 verification

- Desktop dashboard renders with the intended near-black grid, exact lime accent, instrumentation typography, live corrected clock, Recharts jitter trace, raw timing table, upstream authority panel, room interface, leaderboard, and precision disclosure.
- Mobile layout stacks all panels without clipping primary content; dense tables retain deliberate horizontal scroll instead of compressing scientific values beyond readability.
- The upstream health call completed during verification and showed results for Cloudflare, Google, NIST, and NTP pool.
- Remaining platform constraint: peer-mesh state is live only within a running application instance. Autoscale deployments can route different rooms to different instances, so production-global rooms require a managed shared pub/sub service or reserved single-instance hosting.
