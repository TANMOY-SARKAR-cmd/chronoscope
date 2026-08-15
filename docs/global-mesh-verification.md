# Global Source Mesh Verification

The desktop dashboard was reviewed after the live mesh API completed its bounded refresh. The interface displayed a **healthy** conservative consensus from ten independent eligible source groups, a visible uncertainty envelope, eleven active catalog entries, and one exclusion. The public registry showed only labels explicitly available for display; it did not show source hostnames, contributor ownership details, or verification tokens.

The contribution panel showed the hostname-only registration flow, optional label-publication consent, and a private DNS TXT verification-token handoff. It also explains that the mesh does not perform internet-wide scans: curated and verified sources are selected through a quota-limited rotating cohort with backoff.

At a 390 px mobile viewport, the summary cards stack cleanly and remain readable. The source table deliberately retains horizontal scrolling so labels and provenance are not truncated; while an NTP cohort is refreshing, the panel gives an explicit loading state rather than presenting an invented consensus value.

The final desktop review confirmed that the public source table presents class, active-state, and region filters, while each row now displays only a compact rolling quality summary: successful probes over sampled probes and median uncertainty. The ready state showed a healthy consensus from nine independent eligible groups, two conservative exclusions, and eleven active catalog entries. No hostname, owner, or DNS verification value was present in the public registry.
