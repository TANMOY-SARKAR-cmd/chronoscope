import { Activity, CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CORRECTED_TIME_CAVEAT, FRESHNESS_COPY, type ChronoMeshFreshnessState } from "@shared/chronomeshEditorial";

type AlertState = "safe" | "indeterminate" | "alert";

export type CorrectedTimeCrownProps = {
  correctedUtcMs: number;
  uncertaintyMs: number | null;
  localOffsetMs: number | null;
  localUncertaintyMs: number | null;
  authorityOffsetMs: number | null;
  authorityUncertaintyMs: number | null;
  jitterMs: number | null;
  confidence: "high" | "medium" | "low" | null;
  alertState: AlertState;
  alertThresholdMs: number | null;
  freshnessState: ChronoMeshFreshnessState;
  updatedAtMs: number | null;
  cohortSummary: string | null;
  isSyncing: boolean;
  onRunSync: () => void;
};

function formatNumber(value: number, digits = 3) { return Number.isFinite(value) ? value.toFixed(digits) : "—"; }
function formatOffset(value: number | null) { return value === null || !Number.isFinite(value) ? "unavailable" : `${value >= 0 ? "+" : ""}${formatNumber(value)} ms`; }
function formatUncertainty(value: number | null) { return value === null || !Number.isFinite(value) ? "± unavailable" : `± ${formatNumber(Math.abs(value))} ms`; }
function renderPreciseUtc(epochMs: number) {
  const whole = Math.floor(epochMs);
  const date = new Date(whole);
  const base = date.toISOString().replace("T", " ").replace("Z", "");
  const micros = Math.floor(Math.max(0, epochMs - whole) * 1000).toString().padStart(3, "0");
  return `${base}${micros} UTC`;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="border border-[#a3e635]/15 bg-black/20 px-3 py-2.5"><div className="numeric text-[9px] tracking-[.16em] text-[#71717a]">{label}</div><div className="numeric mt-1 text-sm text-[#f4f4f5]">{value}</div><div className="numeric mt-1 text-[10px] text-[#a3e635]">{detail}</div></div>;
}

export function CorrectedTimeCrown(props: CorrectedTimeCrownProps) {
  const freshness = FRESHNESS_COPY[props.freshnessState];
  const alertTone = props.alertState === "alert" ? "border-red-400/60 from-[#291211] via-[#16100f]" : props.alertState === "indeterminate" ? "border-amber-300/55 from-[#261f0f] via-[#15140f]" : "neon-border from-[#151b0f] via-[#101110]";
  const ageText = props.updatedAtMs ? `${Math.max(0, Math.floor((Date.now() - props.updatedAtMs) / 1_000))}s ago` : "not yet measured";

  return <section aria-labelledby="corrected-time-heading" className={`scanline sticky top-[57px] z-10 mb-5 overflow-hidden border bg-gradient-to-br p-4 shadow-[0_12px_32px_rgba(0,0,0,.36)] lg:p-7 ${alertTone}`}>
    <div className="absolute right-0 top-0 h-28 w-1/2 bg-[radial-gradient(ellipse_at_top_right,rgba(163,230,53,.12),transparent_62%)]" />
    <div className="relative grid gap-5 lg:grid-cols-[1.25fr_.75fr] lg:items-end">
      <div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-[.2em] text-[#a3e635]"><Activity className="h-3.5 w-3.5" />CORRECTED UTC / MESH SOLUTION <span className="border border-current/35 px-1.5 py-0.5 text-[9px]">{freshness.label.toUpperCase()}</span></div>
        <h1 id="corrected-time-heading" className="numeric mt-3 break-all text-[clamp(1.45rem,4.2vw,4.75rem)] font-medium leading-none tracking-[-.055em] text-[#f4f4f5]">{props.freshnessState === "loading" && props.updatedAtMs === null ? "AWAITING FIRST ESTIMATE" : renderPreciseUtc(props.correctedUtcMs)} <span className="whitespace-nowrap text-[.3em] tracking-normal text-[#a3e635]">{formatUncertainty(props.uncertaintyMs)}</span></h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="numeric rounded border border-[#a3e635]/40 bg-[#a3e635]/10 px-2 py-1 text-[#a3e635]">{ageText}</span>{props.cohortSummary && <span className="numeric text-[#a1a1aa]">{props.cohortSummary}</span>} {props.alertState !== "safe" && <span className={props.alertState === "alert" ? "text-red-300" : "text-amber-300"}><TriangleAlert className="mr-1 inline h-3.5 w-3.5" />Threshold {props.alertThresholdMs === null ? "unavailable" : `${formatNumber(props.alertThresholdMs)} ms`} / {props.alertState.toUpperCase()}</span>}</div>
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[#a1a1aa]">{freshness.implication} {CORRECTED_TIME_CAVEAT}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3"><Button onClick={props.onRunSync} disabled={props.isSyncing} className="h-9 rounded-none bg-[#a3e635] px-4 font-mono text-xs font-bold text-black hover:bg-[#bef264]"><RefreshCw className={`mr-2 h-3.5 w-3.5 ${props.isSyncing ? "animate-spin" : ""}`} />{props.isSyncing ? "SYNCING 10/10" : "RUN SYNCHRONIZATION"}</Button><span className="text-xs text-[#a1a1aa]">{freshness.nextAction}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
        <Metric label="LOCAL OFFSET" value={formatOffset(props.localOffsetMs)} detail={formatUncertainty(props.localUncertaintyMs)} />
        <Metric label="AUTHORITY OFFSET" value={formatOffset(props.authorityOffsetMs)} detail={formatUncertainty(props.authorityUncertaintyMs)} />
        <Metric label="JITTER" value={props.jitterMs === null ? "calibrating" : `${formatNumber(props.jitterMs)} ms`} detail={props.jitterMs === null ? "± awaiting burst" : formatUncertainty(props.jitterMs)} />
        <Metric label="CONFIDENCE" value={(props.confidence ?? "low").toUpperCase()} detail={formatUncertainty(props.localUncertaintyMs)} />
      </div>
    </div>
  </section>;
}
