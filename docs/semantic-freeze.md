# ChronoMesh Semantic Freeze

**Status:** Phase 0 baseline  
**Scope:** Presentation extraction and route restructuring only

## Purpose

This document freezes ChronoMesh’s measurement, fusion, privacy, and public-data semantics before the product-shell refactor. A Phase 1 change may move existing components, improve readability, add route state, or render the shared crown. It must not alter a frozen behavior without a separately approved, evidence-backed measurement change.

## Frozen contracts

| Area | Frozen implementation contract | Authoritative location |
| --- | --- | --- |
| Four-timestamp sample | Delay is `max(0, (T4 − T1) − (T3 − T2))`; offset is `((T2 − T1) + (T3 − T4)) / 2`. | `shared/timeMath.ts` → `calculateProbe` |
| Local estimate | Valid samples are delay-sorted; the lowest-delay quartile retains at least three samples; medians produce offset and delay; uncertainty is `max(0.005, delay / 2 + jitter)`. | `shared/timeMath.ts` → `estimateTimeSync` |
| Corrected presentation input | Corrected offset remains the local estimate plus the median authority offset; total uncertainty remains local uncertainty plus authority uncertainty. | `client/src/pages/Home.tsx` |
| Authorities | Only Cloudflare, Google, NIST, and NTP Pool appear in the upstream authority comparison. | Existing authority health contracts and `Home.tsx` |
| Anonymous rooms | Room codes are exactly five A–Z/0–9 characters; peers remain anonymous; peer IP addresses and private descriptions are never public. | `shared/timeMath.ts`, room transport, peer projections |
| Fusion | Bounded active cohorts, quality exclusions, one source per group, diversity factors, uncertainty expansion, and neutral handling of missing metadata remain unchanged. | `shared/globalMesh.ts` |
| Observability | Public analytics remain aggregate-only, preserve 6h/24h/7d/30d/90d ranges, distinguish raw from persisted roll-up coverage, and retain caveats. | `shared/fusionObservability.ts` |
| Public source data | No hostname, contributor identity, reviewer evidence, signed attestation, or private metadata appears in public observability output. | `shared/fusionObservability.ts` and source projections |

## Permitted Phase 1 changes

Phase 1 may introduce route components, the shared product shell, `CorrectedTimeCrown`, URL-backed selection state, loading/error/coverage presentation, accessible navigation, locally dismissible education, and visual responsive improvements. It may add presentation metadata only when the underlying result is unchanged.

## Forbidden Phase 1 changes

Phase 1 must not change measurement formulas, sample selection, uncertainty calculations, authority set, source eligibility, probe cohort limits, fusion weights, diversity penalties, data retention, public privacy projection, tRPC keys/inputs, or role permissions.

## CI merge checklist

| Check | Green requirement |
| --- | --- |
| Measurement math | Existing deterministic four-timestamp and lowest-delay tests pass. |
| Fusion and observability | Existing range, coverage, roll-up, caveat, and aggregate-only projection tests pass. |
| Routes and queries | Existing query inputs, cache/refetch behavior, and protected-route boundaries remain unchanged unless a separately approved phase explicitly changes them. |
| Public privacy | Tests and review confirm public DOM/API output has no IP address, hostname, peer identifier, installation identifier, signature, reviewer evidence, or private tag/description. |
| Quality gates | `pnpm test`, `pnpm check`, and `pnpm build` pass. |

> **Merge rule:** No Phase 1 pull request may merge unless this checklist is green in CI and its description links to `docs/semantic-freeze.md`.
