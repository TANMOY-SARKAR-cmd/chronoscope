import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "chronomesh-first-run-guide-dismissed";

export function FirstRunGuide() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => setDismissed(localStorage.getItem(DISMISS_KEY) === "true"), []);
  if (dismissed) return null;
  return <aside aria-labelledby="first-run-guide-title" className="mb-5 border border-[#a3e635]/25 bg-[#a3e635]/[.045] p-4"><div className="flex items-start justify-between gap-4"><div><div id="first-run-guide-title" className="flex items-center gap-2 text-[10px] font-bold tracking-[.18em] text-[#a3e635]"><CheckCircle2 className="h-3.5 w-3.5" />FIRST RUN / THREE STEPS</div><ol className="mt-3 grid gap-2 text-xs leading-relaxed text-[#d4d4d8] md:grid-cols-3"><li><span className="numeric text-[#a3e635]">01</span> Run a synchronization burst to establish a measured local estimate.</li><li><span className="numeric text-[#a3e635]">02</span> Read the stated uncertainty before interpreting the corrected time.</li><li><span className="numeric text-[#a3e635]">03</span> Explore aggregate source health or join an anonymous peer room only if useful.</li></ol></div><button type="button" onClick={() => { localStorage.setItem(DISMISS_KEY, "true"); setDismissed(true); }} aria-label="Dismiss first-run guide" className="shrink-0 text-[#71717a] hover:text-[#a3e635] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635]"><X className="h-4 w-4" /></button></div></aside>;
}
