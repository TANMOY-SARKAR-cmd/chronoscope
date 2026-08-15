# ChronoMesh

ChronoMesh is an uncertainty-first, privacy-preserving clock-comparison application for people who care about timekeeping. It measures a device clock through bounded four-timestamp exchanges, compares anonymous room observations, displays authority telemetry, and reports an aggregate global source mesh.

The project does **not** claim absolute time accuracy. Every corrected-time or offset interpretation must be read with its stated uncertainty. The browser application’s canonical explanation is the [Methodology page](https://chronosync-4hgqdc2d.manus.space/methodology).

| Area | What ChronoMesh provides | What it intentionally does not provide |
| --- | --- | --- |
| Local synchronization | A measured corrected-UTC estimate with uncertainty | A guarantee of absolute accuracy |
| Peer rooms | Anonymous comparison with consent-aware hardware context | Peer IP addresses or raw identity |
| Source mesh | Bounded, verified, opt-in aggregate source evidence | Internet-wide scanning or exposed unpublished hosts |
| Community agent | Device-held Ed25519 signed health evidence | A paid hosted-agent requirement or exported private keys |

## Run locally

Install dependencies with `pnpm install`, start development with `pnpm dev`, run the test suite with `pnpm test`, type-check with `pnpm check`, and create a production build with `pnpm build`.

## Documentation

The [Methodology page](https://chronosync-4hgqdc2d.manus.space/methodology) is the single source of truth for measurement, uncertainty, source consensus, signed evidence, aggregation, and privacy semantics. The repository records implementation and release evidence under `docs/`; those documents link to the methodology rather than creating alternate semantic definitions.

Community-agent operators should start with [`community-agent/README.md`](community-agent/README.md) and then follow [`docs/agent-key-lifecycle.md`](docs/agent-key-lifecycle.md) before enrolling, rotating, or revoking an installation.
