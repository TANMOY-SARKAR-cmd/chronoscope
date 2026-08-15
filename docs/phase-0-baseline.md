# ChronoMesh Phase 0 Baseline Record

**Captured:** 15 August 2026  
**Baseline checkpoint:** `02c59941`

## Product baseline

ChronoMesh currently opens at `/` as a dense, vertically stacked technical dashboard. Its single page contains synchronization, upstream authorities, peer rooms, historical analytics, fusion observability, source mesh, world-time zones, source exploration, contributor controls, and security context. The current public secondary routes are `/leaderboard` and `/source-review`; the latter keeps its existing role-aware server enforcement.

The desktop and mobile baseline was captured before presentation extraction. The current design preserves the dark ChronoMesh visual language, exact `#a3e635` accent, and monospace numeric treatment, but requires significant scrolling before a first-time visitor can understand the primary corrected-time value and next action. Phase 1 will improve that information architecture without changing underlying measurements.

## Corrected-time response and ownership map

| Consumer | Current input path | Frozen responsibility |
| --- | --- | --- |
| Clock display | Local `estimate` plus median authority health inputs in `Home.tsx` | Renders corrected UTC from the existing combined offset and displays combined uncertainty. |
| Local synchronizer | Browser burst requests to `/api/timesync`; `calculateProbe`; `estimateTimeSync` | Computes the NTP four-timestamp sample, retained low-delay sample set, offset, delay, jitter, uncertainty, and confidence. |
| Authority health | `chronomesh.upstreamHealth` tRPC query | Supplies the existing Cloudflare, Google, NIST, and NTP Pool comparison data. |
| Anonymous rooms | WebSocket room transport and existing client state | Uses anonymous five-character rooms and transient peer projections. |
| Fusion observability | `chronomesh.fusionObservability` tRPC query | Supplies aggregate-only quality, coverage, risk, review, and attestation summaries. |
| Global mesh | `chronomesh.globalMesh` tRPC query | Supplies verified, privacy-safe source-mesh aggregates and fusion-quality state. |

### CorrectedTimeCrown presentation input snapshot

The existing dashboard does not receive a standalone corrected-time API object. It derives the following presentation-only input in `Home.tsx`; Phase 1 must preserve these source relationships while moving the rendering into `CorrectedTimeCrown`.

| Crown input field | Current source and derivation | Fallback / privacy boundary |
| --- | --- | --- |
| `correctedUtcMs` | `clockEpoch`, which is updated from the high-resolution browser clock plus `correctedOffset`; `correctedOffset` is the local `estimate.offsetMs` plus the median offset in `upstreamHealth.readings`. | A local in-memory presentation value; no peer or source identifier is included. |
| `uncertaintyMs` | `totalUncertainty`, the local `estimate.uncertaintyMs` plus median authority uncertainty. | May be non-finite before a successful local burst; presentation must state that no current estimate is available. |
| `ageMs` / `freshnessState` | Derived locally from sync activity and the timestamp of the last successful local estimate; Phase 1 may add only this local presentation timestamp. | `loading`, `live`, `stale`, and `error` are presentation states, not new measurement states. |
| `lastKnownGoodUtcMs` | The last locally rendered corrected UTC value after a successful estimate. | Used only during stale/error display and never described as current. |
| `caveatText` | `CORRECTED_TIME_CAVEAT` from `shared/chronomeshEditorial.ts`. | States uncertainty and rejects an absolute-accuracy claim. |
| `cohortSummary` | Optional aggregate-only counts/rates from existing global-mesh or observability summaries. | Never names a source, contributor, host, peer, or reviewer. |

## Phase 0 validation baseline

| Gate | Baseline result |
| --- | --- |
| Unit tests | 20 files and 61 tests passed. |
| TypeScript | `pnpm check` passed with zero errors. |
| Production build | `pnpm build` passed; HTML shell is 1.40 kB, main JS is 282.60 kB (67.34 kB gzip), charts 407.22 kB, React vendor 420.37 kB, data client 84.79 kB, realtime 61.91 kB. |
| Desktop render | Current full dashboard renders at 1280×720. |
| Mobile render | Current full dashboard renders at 375×812 and establishes the pre-shell responsive reference. |

## Phase 0 exit conditions

The semantic-freeze checklist in [`semantic-freeze.md`](./semantic-freeze.md) is the source of record for Phase 1 pull requests. The editorial contract in `shared/chronomeshEditorial.ts` is the only presentation copy source for the crown, freshness, coverage, and safe-next-action language.
