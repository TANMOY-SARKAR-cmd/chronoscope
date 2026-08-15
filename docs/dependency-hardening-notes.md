# Dependency Hardening Notes

ChronoMesh now keeps dependency overrides in the workspace-level `pnpm-workspace.yaml` and resolves them with the project-local `pnpm@10.18.0`. This follows pnpm’s documented workspace configuration and override model.[1]

The verified override path pins `fast-xml-parser` to `5.10.1`; the application’s tRPC packages resolve at `11.18.0`. The workspace configuration is checked with `pnpm exec pnpm config get overrides` so the installed package manager, rather than an older globally installed CLI, is the source of truth.

## Reference

[1]: https://pnpm.io/settings#overrides
