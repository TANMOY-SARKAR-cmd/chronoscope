import { Activity, BookOpen, Database, Globe2, Network, Radio, ServerCog, UserRound } from "lucide-react";
import { Link } from "wouter";

export const CHRONOMESH_SECTIONS = ["sync", "peers", "observability", "mesh", "sources", "contribute"] as const;
export type ChronoMeshSection = (typeof CHRONOMESH_SECTIONS)[number];

const sectionMeta: Record<ChronoMeshSection, { label: string; description: string; icon: typeof Activity }> = {
  sync: { label: "Synchronize", description: "Local uncertainty", icon: Activity },
  peers: { label: "Peers", description: "Anonymous room", icon: Radio },
  observability: { label: "Observability", description: "Aggregate history", icon: Globe2 },
  mesh: { label: "Source mesh", description: "Trusted consensus", icon: Network },
  sources: { label: "Sources", description: "Authorities & tools", icon: ServerCog },
  contribute: { label: "Contribute", description: "Verified evidence", icon: UserRound },
};

export function isChronoMeshSection(value: string | undefined): value is ChronoMeshSection { return !!value && CHRONOMESH_SECTIONS.includes(value as ChronoMeshSection); }

export function ChronoMeshSectionNav({ activeSection }: { activeSection?: ChronoMeshSection }) {
  return <nav aria-label="ChronoMesh sections" className="mb-5 overflow-x-auto border border-[#a3e635]/15 bg-[#0c0d0c]/95 p-2"><div className="flex min-w-max gap-1">{CHRONOMESH_SECTIONS.map(section => { const meta = sectionMeta[section]; const Icon = meta.icon; const isActive = activeSection === section; return <Link key={section} href={`/${section}`} aria-current={isActive ? "page" : undefined} className={`group flex items-center gap-2 border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635] ${isActive ? "border-[#a3e635]/60 bg-[#a3e635]/10 text-[#a3e635]" : "border-transparent text-[#a1a1aa] hover:border-[#a3e635]/25 hover:text-[#e4e4e7]"}`}><Icon className="h-3.5 w-3.5" /><span><span className="block numeric text-[10px] tracking-[.12em]">{meta.label.toUpperCase()}</span><span className="block text-[10px] text-[#71717a]">{meta.description}</span></span></Link>; })}<Link href="/methodology" className="flex items-center gap-2 px-3 text-[10px] text-[#71717a] hover:text-[#a3e635] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635]"><BookOpen className="h-3.5 w-3.5" />METHOD</Link><Link href="/" className="ml-auto flex items-center gap-2 px-3 text-[10px] text-[#71717a] hover:text-[#a3e635] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a3e635]"><Database className="h-3.5 w-3.5" />OVERVIEW</Link></div></nav>;
}
