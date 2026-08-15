# ChronoMesh Community Agent

The **ChronoMesh Community Agent** is a free, open-source reference client for a source operator who wants to provide signed, privacy-minimized health evidence for an NTP source they control. It is deliberately **not** a scanner, an internet-wide crawler, or an accuracy certification tool. It contacts only the hostname that the operator configures and only submits evidence that the server challenges it to produce.

| Platform | Delivery | Background behaviour |
|---|---|---|
| Linux | Node.js agent + systemd timer | Fixed, operator-controlled cadence |
| Windows | Node.js agent + Task Scheduler | Fixed, operator-controlled cadence |
| iOS | Native companion reference | Foreground and OS-scheduled best effort only |

## Trust and privacy model

Generate the Ed25519 keypair **on the device**, retain the private key locally, and paste only its public key into ChronoMesh while signed in. The dashboard returns an enrollment credential once; store it in the local configuration with restrictive filesystem permissions. ChronoMesh stores only a hash of that credential, never the credential itself. A successful report consumes one random challenge, and the server stores a derived evidence hash and quality band rather than raw measurement payloads.

The public dashboard exposes only an opt-in source label and compact freshness/quality state. It never publishes the agent public key, enrollment credential, private operator label, host name of a non-opt-in source, or an IP address.

## Quick start for Linux and Windows

Install Node.js 20 or later, copy this directory, and create a local `config.json` from `config.example.json`. In the dashboard, use **Community Agent / Signed Health Evidence** to enroll the generated public key and capture the one-time credential.

```json
{
  "apiBaseUrl": "https://YOUR-CHRONOMESH-DEPLOYMENT.example",
  "installationId": "agent_...",
  "enrollmentCredential": "ONE_TIME_CREDENTIAL_FROM_DASHBOARD",
  "sourceId": "gsrc_...",
  "sourceHost": "ntp.example.org",
  "privateKeyPkcs8Base64": "BASE64_ED25519_PKCS8_KEY",
  "agentVersion": "0.1.0"
}
```

Generate a keypair locally:

```bash
npm run keygen
```

Run one bounded check:

```bash
npm run attest
```

The reference client has a fixed **3-second UDP timeout** and does not retry indefinitely. Set a conservative cadence, such as 15–60 minutes. Do not configure it to probe other people’s hosts.

## Service installation

On Linux, install the supplied `systemd` unit and timer after replacing the file paths and user. On Windows, run `windows/install-scheduled-task.ps1` with the Node, agent, and private-config paths; it enforces a minimum 15-minute cadence. The agent does not require a paid hosted service; it runs on a volunteer’s own device. The ChronoMesh web application may still be unavailable when its own deployment is asleep or offline, in which case the agent fails closed and waits for its next scheduled run.

## iOS companion

iOS does not permit a third-party app to operate a permanent, exact-cadence background network daemon. The companion design therefore uses foreground measurements and `BGAppRefreshTask`/`BGProcessingTask` when the OS grants time. It must show the user the last successful attestation, never claim continuous monitoring, and allow immediate credential revocation from the dashboard. See `ios/README.md` and `ios/CommunityAttestationScheduler.swift`.

## Open-source release checklist

This directory is licensed under **MIT**. Do not include a service credential, operator host, IP address, or private key in the repository. Before distributing binary releases, add reproducible release artifacts with checksums and a CI job that verifies canonical signing.
