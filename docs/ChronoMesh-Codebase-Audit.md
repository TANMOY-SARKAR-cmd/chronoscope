# ChronoMesh Codebase Audit and Fusion Analytics Review

**Audit date:** 15 August 2026  
**Scope:** React/Vite client, Express/tRPC server, Drizzle schema and migrations, global source mesh, community agent materials, transport, test suite, dependency baseline, and fused-data observability.  
**Method:** Static review, production build, TypeScript validation, automated tests, dependency audit, bounded database measurements, live aggregate API inspection, and desktop/mobile interface review.

> **Overall assessment:** ChronoMesh has a strong privacy-first domain model and good defensive coverage for NTP validation, source ownership, attestation replay, and fusion guardrails. Its most urgent work is dependency remediation and performance hardening; its most important product opportunity is turning the fusion process into a transparent, aggregate-only reliability and network-independence observability product.

## 1. Validation Baseline

| Check | Result | Evidence | Interpretation |
|---|---:|---|---|
| Production build | Passed | 2,392 modules transformed | Build is reproducible, but the main JavaScript bundle is large. |
| TypeScript | Passed | `pnpm check` | No static type errors after this release. |
| Automated tests | Passed | 55 tests across 19 files | Broad unit and persistence coverage; browser E2E coverage remains limited. |
| Dependency audit | Fails threshold | Critical and high transitive/direct advisories found | Must be remediated before describing the deployment as hardened. |
| Live observability API | Passed | 24h aggregate returned 11 observed/11 active sources and 136 samples | API returns aggregates only; no source identifiers were exposed. |
| Desktop/mobile review | Passed | Fusion Observability panel reviewed at 1280px and 390px | Hierarchy is readable; the full dashboard remains information-dense. |

## 2. Confirmed Error and Risk Register

### P0 — Resolve before production hardening claims

| ID | Finding | Evidence | Impact | Fix |
|---|---|---|---|---|
| SEC-01 | **Vulnerable `fast-xml-parser` transitive dependency** | Audit reports v5.2.5 through AWS SDK paths; patched releases are >=5.3.6. | XML entity handling weaknesses may expose server-side paths that use the dependency to denial-of-service or parsing issues. | Upgrade the AWS SDK family/lockfile to a graph resolving `fast-xml-parser` >=5.3.6; add a CI dependency-audit gate and lockfile assertion. |
| SEC-02 | **`@trpc/server` is below the audited patched range** | Installed v11.6.0; audit reports patched version >=11.8.0 for the identified advisory. | The reported prototype-pollution advisory affects the dependency tree even if the experimental caller is not used today. | Upgrade the complete `@trpc/*` family together to >=11.8.0, rerun contract tests, and pin compatible versions. |

### P1 — Prioritize in the next engineering cycle

| ID | Finding | Evidence | Impact | Fix |
|---|---|---|---|---|
| PERF-01 | **Client bundle exceeds the build warning threshold** | Main JS: 1,303.60 kB minified / 356.24 kB gzip; Vite warning at 500 kB. | Slower first visit, especially for lower-bandwidth community operators. | Route-split `/leaderboard` and `/source-review`; lazy-load Recharts/agent dashboards; inspect bundle analyzer output before manual chunks. |
| OPS-01 | **Package-manager configuration is not honored by the current pnpm version** | Build/test/check print that `pnpm.patchedDependencies` and `pnpm.overrides` fields are ignored. | Intended dependency pinning/patches may silently not apply, including security remediation. | Migrate configuration to the supported pnpm workspace/config format; add `pnpm install --frozen-lockfile` to CI and assert expected resolved versions. |
| DATA-01 | **Analytics windows are bounded by row caps, not pagination** | Source and snapshot helpers cap reads (for example 20,000 snapshots), which is deliberate for safety. | Longer windows can become partially representative without a persisted roll-up or coverage ratio. | Persist hourly/daily source aggregates; return `coverageLimited` and retained-vs-eligible sample counts in every analytics response. |
| REL-01 | **Mesh refresh is request-driven and cache-local** | Global mesh aggregation is bounded/cached but not a dedicated always-on worker. | Freshness can vary by active traffic and instance; some source states may be stale when the dashboard is idle. | Keep request-driven mode as the free baseline; make self-hosted community agents publish signed attestations, and offer a separately deployable scheduler for operators who want continuous sampling. |
| SEC-03 | **Local community-agent key material is a user-managed secret** | Reference agent stores PKCS#8 private-key material in local configuration. | A compromised device can submit signed but fraudulent reports until the installation is revoked. | Document OS keychain/secret-store adapters, add a `--revoke` helper, rotate credentials on enrollment renewal, and flag impossible attestation cadence/location changes server-side. |

### P2 — Maintainability and product-quality improvements

| ID | Finding | Evidence | Impact | Fix |
|---|---|---|---|---|
| QUAL-01 | **The dashboard is a long, dense operations surface** | Desktop review shows many similarly framed panels; mobile is improved but still sequentially heavy. | Users may miss the primary clock answer or interpret supporting metrics as equivalent. | Keep the corrected UTC readout as the visual crown; group source health, peer comparison, contributor tools, and audit material behind clear sectional navigation or progressive disclosure. |
| QUAL-02 | **Aggregate dashboards correctly avoid data claims but need explicit completeness labels** | Fusion Observability presents caveats for unknown correlation risk and missing ASN/region metadata. | A technically correct chart can still be misread as an accuracy benchmark. | Show “observed coverage” and “metadata coverage” beside every aggregate; retain the “not an accuracy claim” state for unknown/low coverage. |
| TEST-01 | **Unit/persistence coverage is strong; full workflow coverage is incomplete** | 55 tests include trust, fusion, persistence, and route guards; no browser flow regression suite is present. | UI wiring, auth redirects, range changes, and reviewer actions can regress across releases. | Add Playwright-style authenticated workflow tests for source enrollment, application submission, reviewer decision, range selection, and privacy-redaction assertions. |

## 3. Implemented Fusion Observability

The new **Fusion Observability** panel intentionally reports the health of the *cohort*, not the identity or claimed correctness of an individual source. It adds range controls for 6h/24h/7d and reports:

| Metric | Meaning | Decision use | Privacy boundary |
|---|---|---|---|
| Window coverage | Observed active sources / active sources | Detect incomplete cohort visibility. | No source list or hostname. |
| Reachability | Reachable retained probes as a percentage | Detect network or source availability degradation. | Aggregate-only. |
| Median delay and uncertainty | Typical observed transport delay and uncertainty | Identify whether a time window is measurement-limited. | No raw sample export. |
| Fresh attestations | Sources with recent accepted signed evidence | Identify evidence freshness, not accuracy. | No contributor identity or signature. |
| Correlation risk | Cohort concentration based on coarse group/ASN/region metadata | Prevent false confidence from non-independent sources. | No ASN, region, or source mapping returned. |
| Review funnel | Application states by count | Operate the community source pipeline. | No private reviewer notes or applicant details. |

At the audit snapshot, the 24-hour aggregate had **11 observed of 11 active sources**, **136 retained samples**, **93.4% reachability**, **161.95 ms median delay**, and **80.97 ms median uncertainty**. Correlation risk was correctly reported as **unknown** because independence metadata coverage was zero; the UI includes explicit caveats rather than treating the figures as an accuracy claim.

## 4. Analytics Opportunities from Fused Data

### Next analytics to implement

| Priority | Analytics capability | Data already available | Output | Guardrail |
|---|---|---|---|---|
| High | **Coverage-limited roll-ups** | Probe snapshots, quality summaries | Hour/day cohorts, retained sample ratio, trend confidence | Never silently treat a capped query as full history. |
| High | **Source contribution diagnostics** | Fusion exclusions, delay, uncertainty, diversity metadata | Why sources were excluded: stale, high delay, insufficient diversity, failed quality gate | Show reason-code counts only publicly. |
| High | **Change-point and incident detection** | Time-bucket delay, offset, reachability | “Mesh event” windows with baseline deviation and recovery time | Do not label a source inaccurate without independent evidence. |
| Medium | **Independence score over time** | Coarse group/ASN/region metadata | Diversity coverage trend and concentration warning | Keep raw network metadata restricted. |
| Medium | **Attestation reliability trend** | Accepted/rejected/expired attestation states | Freshness distribution and overdue contributor evidence | Never expose signatures, installation IDs, or operator identity. |
| Medium | **Regional network-latency atlas** | Coarsened region and aggregate delay | Region-to-mesh delay bands | Publish only cohorts meeting a minimum k-anonymity threshold. |
| Later | **Measurement calibration study** | Four-timestamp estimates, uncertainty, multiple authorities | Compare estimator behavior by delay/uncertainty bands | Describe it as observed measurement behavior, not ground truth. |

### Derived analyses that should not be presented as accuracy claims

1. **Clock disagreement distribution:** The spread of accepted offsets can reveal a measurement event or source cohort disagreement. It cannot prove which source is correct.
2. **Transport-quality regimes:** Delay and uncertainty quantiles can identify when the network path, rather than the local device, limits confidence.
3. **Fusion sensitivity:** Re-running the estimator with reason-coded source exclusions can show whether the consensus is robust to cohort changes.
4. **Attestation coverage:** Fresh signed evidence increases operational accountability but does not independently verify stratum, location, or absolute time accuracy.

## 5. Product and Architecture Roadmap

| Horizon | Recommended work | Success measure |
|---|---|---|
| 0–2 weeks | Remediate dependency advisories; repair pnpm configuration; add bundle analysis; add analytics coverage labels. | Zero critical/high dependency advisories; build main bundle reduced; every chart shows coverage. |
| 2–6 weeks | Add persisted roll-ups, source-exclusion reason trends, browser workflow tests, and a self-hosted scheduler deployment guide. | 7/30-day analytics use stable roll-ups; end-to-end contributor/reviewer flows are tested. |
| 6–12 weeks | Add incident/change-point detection, k-anonymous regional cohorts, attestation reliability trend, and opt-in anonymized research exports. | Operators can identify a mesh event without exposing individual sources. |
| Later | Publish reproducible fusion methodology, signed agent release artifacts, and transparent governance for reviewer policy. | Community agents and reviewers can independently inspect process guarantees. |

## 6. Recommended Immediate Fix Order

1. Upgrade the AWS SDK graph so `fast-xml-parser` resolves to a patched version, then upgrade all tRPC packages together to >=11.8.0.
2. Migrate the ignored pnpm configuration and add CI checks for lockfile consistency, dependency audit severity, TypeScript, unit tests, and production build.
3. Add persisted analytics roll-ups and explicit coverage-limited indicators before advertising 30-day trends.
4. Split the heavy dashboard bundle and add authenticated browser workflow tests.
5. Add local-secret hardening and anomaly detection guidance to the community agent before broad distribution.

## 7. Audit Limitations

This review did not perform penetration testing, third-party source network scanning, load testing against production scale, or device-level iOS/Windows runtime tests. Dependency findings reflect the installed lockfile at audit time. Fused-data readings are operational aggregates and are deliberately **not** a claim of absolute time accuracy.
