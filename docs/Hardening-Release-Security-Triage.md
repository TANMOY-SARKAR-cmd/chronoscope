# ChronoMesh Hardening Release — Security Triage

**Scope date:** 15 August 2026  
**Command:** `pnpm audit --prod`

## Purpose and Scope

This release addressed the two urgent dependency paths identified in the preceding codebase audit: the tRPC family and the transitive AWS XML parser path. It also repaired the pnpm workspace configuration so that security overrides and the existing Wouter patch are applied by the package manager.

The audit command still reports **73 production dependency advisories**: **9 low**, **47 moderate**, and **17 high**. Those remaining findings are not represented as resolved by this release. They must be reviewed and remediated in a separately scoped dependency-upgrade pass, with application compatibility validation for each affected transitive path.

## Verified Remediations

| Dependency path | Verified installed version | Hardening result |
| --- | ---: | --- |
| `@trpc/client`, `@trpc/react-query`, `@trpc/server` | `11.18.0` | The requested tRPC family upgrade is installed consistently. |
| AWS SDK transitive `fast-xml-parser` | `5.10.1` | The workspace override is active across the AWS XML builder path. |
| Workspace configuration | pnpm `10.18.0` | Overrides and the Wouter patch are declared in `pnpm-workspace.yaml`, where pnpm honors them. |

## Follow-up Boundary

The remaining advisories were deliberately not mass-upgraded in this release because a blanket transitive dependency update can introduce client rendering, data-processing, or server-runtime regressions that require their own review. This is a **triage boundary, not a risk acceptance statement**.

Before treating the dependency tree as fully remediated, the next maintenance pass should group the remaining production advisories by direct dependency, update each supported upstream package, re-run the production audit, and repeat ChronoMesh's test, type-check, build, and desktop/mobile validation gates.
