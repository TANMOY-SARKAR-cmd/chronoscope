# Community Agent Key Lifecycle

The application’s [Methodology page](https://chronosync-4hgqdc2d.manus.space/methodology) is the canonical explanation of what a signed health attestation means. This guide is limited to the safe lifecycle of the community agent’s device-held signing key and enrollment credential.

## Lifecycle

| Stage | Operator action | ChronoMesh behavior | Safety boundary |
| --- | --- | --- | --- |
| Generate | Create an Ed25519 keypair on the operator device. | Accepts only the public key during authenticated enrollment. | Never transmit, commit, or log the private key. |
| Enroll | Associate the public key with one configured source while signed in. | Returns a one-time enrollment credential and retains only a derived credential hash. | Treat the credential as a secret with file permissions appropriate to the device. |
| Attest | Request a fresh challenge immediately before one bounded measurement, then sign the canonical payload locally. | Rejects expired, mismatched, or consumed challenges. | A challenge expires after 10 minutes and successful use prevents replay. |
| Operate | Run only against the operator-configured source host at a conservative cadence. | Stores a derived evidence hash and quality band rather than the raw measurement payload. | Do not scan ranges, enumerate networks, or retry indefinitely. |
| Revoke | Revoke the installation in the signed-in dashboard when a device, credential, or key may be compromised. | Marks the installation revoked; future challenge and attestation flow must not be used. | Revoke first, then remove the local credential and private key. |
| Replace | Generate a fresh keypair and create a new enrollment after revocation. | Treats the new installation as distinct evidence. | Do not reuse an exposed private key or credential. |

## Platform storage

Linux and Windows reference agents store their private configuration locally; operators should use restrictive filesystem permissions and keep the configuration out of backups, repositories, and shared folders. The iOS companion should create the key in Keychain or Secure Enclave where supported and must not export the private key.

> A community-agent attestation is recent signed operational evidence. It is not a certificate of permanent uptime or time accuracy, and it does not authorize probing of any host other than the operator-configured source.

## Incident response

If an enrollment credential or private key may have been exposed, revoke the installation in the dashboard immediately. Stop the local schedule, remove the credential from the device configuration, generate a new device-held key, and enroll a new installation only after the cause of the exposure is understood. Do not publish the previous public key fingerprint, credential, private key, source hostname, or operator-specific details in a public issue.
