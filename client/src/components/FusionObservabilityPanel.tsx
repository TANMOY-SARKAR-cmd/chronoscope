import { Activity, Network, Radio, ShieldCheck, TriangleAlert } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type FusionRange = "6h" | "24h" | "7d" | "30d" | "90d";
type FusionData = {
  range: FusionRange;
  generatedAtMs: number;
  windowStartMs: number;
  coverage: { mode: "raw" | "persisted_rollup"; availableBucketCount: number; expectedBucketCount: number; coveragePct: number | null; observedFromMs: number | null; partial: boolean };
  summary: {
    activeSourceCount: number;
    observedSourceCount: number;
    sampleCount: number;
    reachableRatePct: number | null;
    medianDelayMs: number | null;
    medianUncertaintyMs: number | null;
    medianAbsoluteOffsetMs: number | null;
    freshAttestedSourceCount: number;
    reviewCounts: { pending: number; needs_attestation: number; approved: number; rejected: number; withdrawn: number };
    independenceMetadataCoveragePct: number | null;
    largestObservedGroupSharePct: number | null;
    correlationRisk: "unknown" | "elevated" | "moderate" | "low";
    caveats: string[];
  };
  timeline: Array<{ bucketStartMs: number; sampleCount: number; reachableRatePct: number | null; medianDelayMs: number | null; medianUncertaintyMs: number | null; medianAbsoluteOffsetMs: number | null; observedSourceCount: number }>;
};

function number(value: number | null, digits = 1) { return value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits); }
function riskClass(value: FusionData["summary"]["correlationRisk"]) { return value === "low" ? "border-[#a3e635]/40 bg-[#a3e635]/10 text-[#a3e635]" : value === "moderate" ? "border-amber-300/40 bg-amber-300/10 text-amber-200" : value === "elevated" ? "border-red-400/40 bg-red-400/10 text-red-200" : "border-[#52525b] bg-white/5 text-[#a1a1aa]"; }

export function FusionObservabilityPanel({ data, isLoading, range, onRangeChange }: { data: FusionData | undefined; isLoading: boolean; range: FusionRange; onRangeChange: (range: FusionRange) => void }) {
  const summary = data?.summary;
  const chartData = (data?.timeline ?? []).map(point => ({ ...point, time: new Date(point.bucketStartMs).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit" }) }));
  return <section className="mb-5 overflow-hidden border border-cyan-300/20 bg-[#0a0f10] shadow-[inset_0_1px_0_rgba(103,232,249,.08)]">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-cyan-300/15 bg-cyan-300/[.035] px-4 py-4 lg:px-5"><div><div className="flex items-center gap-2 text-[10px] font-bold tracking-[.2em] text-cyan-200"><Activity className="h-3.5 w-3.5" />FUSION OBSERVABILITY / AGGREGATE-ONLY</div><p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#a1a1aa]">A bounded operational view of the source cohort used by the fusion system. It reports coverage and correlation risk without exposing hostnames, contributor identities, signed evidence, or private review data.</p></div><div className="flex flex-wrap rounded-none border border-cyan-300/20 p-1" role="group" aria-label="Fusion observability time window">{(["6h", "24h", "7d", "30d", "90d"] as FusionRange[]).map(option => <button key={option} type="button" aria-pressed={range === option} onClick={() => onRangeChange(option)} className={`numeric px-2.5 py-1 text-[10px] ${range === option ? "bg-cyan-200 text-black" : "text-[#a1a1aa] hover:bg-white/5"}`}>{option.toUpperCase()}</button>)}</div></div>
    <div className="grid gap-px bg-cyan-300/10 sm:grid-cols-2 lg:grid-cols-5">{([
      [Network, "WINDOW COVERAGE", summary ? `${summary.observedSourceCount}/${summary.activeSourceCount}` : "—", `${number(data?.coverage.coveragePct ?? null)}% ${data?.coverage.mode === "persisted_rollup" ? "persisted" : "raw"} coverage`],
      [Radio, "REACHABILITY", summary ? `${number(summary.reachableRatePct)}%` : "—", `${summary?.sampleCount ?? 0} retained probe samples`],
      [Activity, "MEDIAN DELAY", summary ? `${number(summary.medianDelayMs, 2)} ms` : "—", `uncertainty ${number(summary?.medianUncertaintyMs ?? null, 2)} ms`],
      [ShieldCheck, "FRESH ATTESTATIONS", summary ? String(summary.freshAttestedSourceCount) : "—", `${summary?.reviewCounts.needs_attestation ?? 0} review items await evidence`],
      [TriangleAlert, "CORRELATION RISK", summary?.correlationRisk.toUpperCase() ?? "UNKNOWN", summary ? `${number(summary.largestObservedGroupSharePct)}% largest cohort` : "awaiting samples"],
    ] as const).map(([Icon, label, value, detail]) => <div key={label} className="min-w-0 bg-[#0a0f10] px-4 py-3"><div className="flex items-center gap-1.5 text-[9px] tracking-[.14em] text-[#71717a]"><Icon className="h-3 w-3 text-cyan-200" />{label}</div><div className={`numeric mt-2 text-lg ${label === "CORRELATION RISK" ? "text-sm" : "text-[#f4f4f5]"}`}>{value}</div><div className="mt-1 text-[10px] text-[#71717a]">{detail}</div></div>)}</div>
    <div className="grid gap-4 p-4 lg:grid-cols-[1.45fr_.55fr]"><div className="h-[218px] border border-cyan-300/15 bg-black/20 p-3"><div className="mb-2 flex items-center justify-between"><span className="numeric text-[10px] tracking-widest text-cyan-100">COHORT REACHABILITY / UNCERTAINTY</span><span className="numeric text-[9px] text-[#71717a]">{isLoading ? "REFRESHING" : `${chartData.length} BUCKETS`}</span></div>{chartData.length ? <ResponsiveContainer width="100%" height="88%"><LineChart data={chartData}><CartesianGrid stroke="rgba(103,232,249,.10)" strokeDasharray="2 4" vertical={false} /><XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 9 }} axisLine={false} tickLine={false} minTickGap={28} /><YAxis yAxisId="percent" domain={[0, 100]} tick={{ fill: "#71717a", fontSize: 9 }} axisLine={false} tickLine={false} width={30} /><YAxis yAxisId="ms" orientation="right" tick={{ fill: "#71717a", fontSize: 9 }} axisLine={false} tickLine={false} width={40} /><Tooltip contentStyle={{ background: "#0a0f10", border: "1px solid rgba(103,232,249,.35)", fontFamily: "monospace", fontSize: 10 }} formatter={(value: number, label) => [label === "reachability" ? `${number(value)}%` : `${number(value, 2)} ms`, label]} /><Line yAxisId="percent" type="monotone" dataKey="reachableRatePct" name="reachability" stroke="#67e8f9" strokeWidth={2} dot={false} connectNulls /><Line yAxisId="ms" type="monotone" dataKey="medianUncertaintyMs" name="median uncertainty" stroke="#a3e635" strokeWidth={1.5} dot={false} connectNulls /></LineChart></ResponsiveContainer> : <div className="grid h-[88%] place-items-center border border-dashed border-cyan-300/15"><span className="numeric text-[10px] text-[#71717a]">NO AGGREGATE PROBE SAMPLES IN THIS WINDOW.</span></div>}</div>
      <aside className="border border-cyan-300/15 bg-black/20 p-3"><div className="numeric text-[10px] tracking-widest text-cyan-100">INDEPENDENCE READOUT</div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-[#a1a1aa]">Metadata coverage</span><span className="numeric text-sm text-[#f4f4f5]">{number(summary?.independenceMetadataCoveragePct ?? null)}%</span></div><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-[#a1a1aa]">Largest cohort</span><span className="numeric text-sm text-[#f4f4f5]">{number(summary?.largestObservedGroupSharePct ?? null)}%</span></div><div className={`numeric mt-3 inline-flex border px-2 py-1 text-[10px] ${riskClass(summary?.correlationRisk ?? "unknown")}`}>{(summary?.correlationRisk ?? "unknown").toUpperCase()} / NOT AN ACCURACY CLAIM</div><div className="mt-4 border-t border-cyan-300/10 pt-3"><div className="numeric text-[9px] tracking-widest text-[#71717a]">REVIEW FUNNEL</div><div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[#a1a1aa]"><span>PENDING <b className="numeric text-[#e4e4e7]">{summary?.reviewCounts.pending ?? 0}</b></span><span>NEEDS EVIDENCE <b className="numeric text-amber-200">{summary?.reviewCounts.needs_attestation ?? 0}</b></span><span>APPROVED <b className="numeric text-[#a3e635]">{summary?.reviewCounts.approved ?? 0}</b></span><span>REJECTED <b className="numeric text-[#a1a1aa]">{summary?.reviewCounts.rejected ?? 0}</b></span></div></div></aside></div>
    {(summary?.caveats ?? []).length > 0 && <div className="border-t border-cyan-300/10 bg-cyan-300/[.025] px-4 py-3"><div className="numeric text-[9px] tracking-widest text-cyan-100">INTERPRETATION LIMITS</div><ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-[#a1a1aa]">{summary?.caveats.map(caveat => <li key={caveat}>• {caveat}</li>)}</ul></div>}
  </section>;
}
