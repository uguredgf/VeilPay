# VeilPay project audit and iteration plan

Audit date: 14 July 2026

## Fixed in this pass

- Removed the unused frontend mock dataset.
- Replaced four-byte claim-key randomness with 24 cryptographically random bytes.
- Added strict monetary parsing, two-decimal precision, header checks, row limits, address normalization and text limits for payroll CSV files.
- Added database-backed withdrawal locks and conditional state updates to prevent concurrent duplicate withdrawals.
- Removed the endpoint that re-exposed all decrypted claim keys after execution.
- Redacted claim hashes, nullifiers and encrypted payloads from batch-detail responses.
- Replaced persisted fake wallet connection state with an in-memory shared wallet session.
- Escaped generated CSV cells to reduce spreadsheet formula injection risk.
- Bound the backend to `127.0.0.1` by default and added production secret validation.
- Made simulated transaction identifiers start with `sim_` so they cannot be confused with chain hashes.
- Added backend utility tests and corrected root build/test scripts.
- Removed false contract build success; Compact builds now stop with an explicit toolchain requirement.
- Rewrote application documentation to remove invented traction, team, legal and market claims.

## Remaining release blockers

| Priority | Blocker | Completion gate |
|---|---|---|
| P0 | Compact drafts are not valid, compiled, tested or deployed artifacts | Current official toolchain compiles; generated bindings are committed; contract tests pass |
| P0 | Backend has no real Midnight transaction/proof integration | Preprod deposit and withdrawal are visible in an explorer and reproducible from a clean setup |
| P0 | No organization authentication or role authorization | Wallet-signature login, tenant isolation, RBAC and authorization tests cover every sensitive route |
| P0 | No production asset/custody model | Supported asset, funding, signing, fee and failure-recovery design is reviewed |
| P0 | No external security or privacy review | Threat model, contract audit, API penetration test and key-management review completed |
| P1 | Money is stored as SQLite `REAL` | Migrate to integer minor units or token base units with overflow tests |
| P1 | Claim credentials are delivered by downloadable CSV | Integrate an authenticated, expiring secrets-delivery channel with revocation and rotation |
| P1 | Compliance logic is a local rules demo | Define jurisdictions, policy versioning, ASP data source, appeals and evidence retention |
| P1 | No backups, migrations framework or observability | Automated backups/restores, versioned migrations, metrics, tracing and alerting tested |
| P1 | No browser E2E or API integration suite | Employer-to-employee-to-compliance flow passes in CI against an isolated database |
| P2 | No verified customer discovery or pilot | Document real interviews and secure a design partner or pilot intent |
| P2 | No public deployment pipeline | Reproducible staging deployment, secret management and rollback procedure |

## Repeat-until-clean loop

1. Make the root `npm test` and `npm run build` green from a clean install.
2. Add one failing test for the highest-risk unresolved behavior.
3. Implement the smallest production-shaped fix and rerun unit, integration and E2E suites.
4. Run dependency audit, secret scan, static analysis and API authorization tests.
5. Deploy to an isolated staging/preprod environment and execute the complete payroll flow.
6. Review logs, privacy disclosures and failure recovery; create issues for every discrepancy.
7. Repeat until there are no P0/P1 findings, then obtain independent security and legal review.

“No findings” from automated tests is not production approval. Real-money payroll requires independent contract/security review, jurisdiction-specific legal analysis and an operational incident-response plan.
