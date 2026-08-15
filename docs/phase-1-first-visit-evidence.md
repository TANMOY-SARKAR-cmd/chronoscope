# Phase 1 First-Visit Evidence

**Scope:** Product-clarity shell, CorrectedTimeCrown, and focused primary routes.  
**Verification date:** 15 August 2026.

## Success Measure

> On a first visit, a person can identify **Corrected UTC**, its **stated uncertainty**, its **freshness**, and the safe next action (**Run synchronization**) without scrolling past the initial viewport.

This measure is intentionally about comprehension and safe action, not a claim that a browser clock has attained absolute precision.

## Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| One primary corrected-time value | Pass | `CorrectedTimeCrown` receives `clockEpoch` and is the sole dedicated corrected-time display on a primary view. |
| Uncertainty remains co-located with corrected time | Pass | The crown renders `± uncertainty` inline with its corrected UTC value and labels every summary metric with uncertainty. |
| Freshness and safe next step visible | Pass | The crown presents elapsed age, a freshness implication, and the `RUN SYNCHRONIZATION` action before the workflow content. |
| Desktop focused routes | Pass | `/sync`, `/peers`, `/observability`, `/mesh`, `/sources`, and `/contribute` were captured at 1280 × 720; each retained the crown and only its intended workflow. |
| Mobile crown visibility | Pass | `/sources` and `/contribute` were captured at 375 × 812. Branding, online state, corrected UTC, uncertainty, freshness, action, and metric cards remained visible without horizontal page overflow. The navigation uses horizontal scrolling rather than hiding destinations. |

## Guardrails

The automated `server/phase1Shell.test.ts` suite verifies the crown input, caveat, explicit lazy view modules, section routes, keyboard-visible navigation styles, and privacy-safe first-run language. Full validation for this phase recorded **23 test files / 69 tests**, a clean TypeScript check, and a successful production build.
