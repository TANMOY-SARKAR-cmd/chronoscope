export type ChronoMeshFreshnessState = "live" | "stale" | "error" | "loading";

export const CORRECTED_TIME_CAVEAT = "Corrected UTC is a measured estimate with stated uncertainty, not a claim of absolute accuracy.";
export const CORRECTED_TIME_NEXT_ACTION = "Run a synchronization burst to refresh this estimate.";

export const FRESHNESS_COPY: Record<ChronoMeshFreshnessState, { label: string; implication: string; nextAction: string }> = {
  live: { label: "Live estimate", implication: "This corrected-time estimate was refreshed recently.", nextAction: "Review the uncertainty before using the estimate for a precision decision." },
  stale: { label: "Last known estimate", implication: "This value is retained for context and may no longer represent current conditions.", nextAction: "Run a synchronization burst before relying on this estimate." },
  error: { label: "Refresh unavailable", implication: "ChronoMesh could not refresh the corrected-time estimate; the retained value is not current.", nextAction: "Check your connection and retry synchronization." },
  loading: { label: "Preparing estimate", implication: "ChronoMesh has not yet completed a current synchronization burst.", nextAction: CORRECTED_TIME_NEXT_ACTION },
};

export function coverageExplanation(coveragePct: number | null, metadataCoveragePct: number | null): { implication: string; nextAction: string } {
  if (coveragePct === null || coveragePct <= 0) {
    return { implication: "No coverage is available for this window, so ChronoMesh cannot characterize source health.", nextAction: "Choose a shorter window or return after fresh aggregate observations are available." };
  }
  if (metadataCoveragePct !== null && metadataCoveragePct <= 0) {
    return { implication: "Correlation risk is understated because ASN and coarse-region metadata coverage is 0%.", nextAction: "Treat diversity and correlation indicators as unknown until aggregate metadata coverage improves." };
  }
  if (coveragePct < 100) {
    return { implication: `Coverage is ${coveragePct.toFixed(1)}%, so missing buckets are not treated as source failures.`, nextAction: "Interpret the selected window as partial history and compare it with a shorter range." };
  }
  return { implication: "Coverage is complete for the selected aggregate window.", nextAction: "Review uncertainty and correlation-risk caveats before drawing conclusions." };
}
