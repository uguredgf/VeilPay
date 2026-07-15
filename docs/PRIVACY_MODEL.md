# VeilPay privacy model

Status: current simulation privacy boundary plus target goals. This is not a security audit or legal opinion.

## Current guarantees

- Claim keys use 24 cryptographically random bytes and are stored by hash for lookup.
- Claim payloads stored in SQLite use authenticated AES-256-GCM encryption.
- Claim keys are returned to the employer after execution and are not exposed by a later list endpoint.
- Concurrent withdrawal attempts are serialized by a database-backed lock.
- Wallet connection state is not restored from unverified browser storage.
- Sensitive claim internals are omitted from batch-detail API responses.

## Current non-guarantees

- Salary amounts, employee names, departments and wallet addresses are present in SQLite.
- The backend operator can access plaintext data and encryption keys.
- Compliance “proofs” in simulation are random demo material, not zero-knowledge proofs.
- No route authentication, tenant isolation or role authorization exists.
- Downloaded claim-key CSV files can be copied, forwarded or retained indefinitely.
- No compiled or audited Compact contract enforces commitments, membership or nullifiers on-chain.
- Timing, batch totals and recipient activity are not protected by the local demo.

## Target privacy properties

These are acceptance criteria, not current claims:

| Goal | Required evidence |
|---|---|
| Individual salary confidentiality | Compiled circuit and tests show no amount in public outputs or events |
| Batch membership privacy | Valid membership proof without public employee-to-commitment linkage |
| Double-claim prevention | On-chain nullifier enforcement and replay tests |
| Selective compliance disclosure | Versioned policy circuit exposes only approved result fields |
| Tenant isolation | Authorization tests prove one organization cannot read another's data |
| Claim confidentiality | Authenticated, expiring delivery with rotation and revocation |
| Operational privacy | Documented logs, backups, metrics and incident handling exclude sensitive values |

## Threats to test

- Stolen claim credential and destination substitution.
- Concurrent and replayed withdrawals across multiple backend instances.
- Malicious employer uploads, oversized CSVs and spreadsheet injection.
- Database theft, environment-secret theft and backup leakage.
- Unauthorized compliance-list changes and audit-log tampering.
- Wallet network mismatch, stale connection state and malicious wallet providers.
- Contract reinitialization, unauthorized deposits, arithmetic overflow and invalid proofs.
- Correlation through timing, public totals, nullifiers and withdrawal recipients.

## Production gates

Before real salary data or funds are used, complete an independent contract audit, API penetration test, key-management review, data-protection impact assessment, jurisdiction-specific legal review and incident-response exercise. “Privacy-preserving” must be supported by deployed-code evidence, not only architecture documentation.
