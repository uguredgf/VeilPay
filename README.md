# VeilPay

VeilPay is a privacy-preserving payroll product prototype for Midnight Network. It demonstrates employer batch upload, one-time employee claims, Lace wallet discovery, and compliance workflows.

## Current status

| Area | Status |
|---|---|
| React employer, employee, and compliance portals | Working |
| Express API and SQLite persistence | Working |
| Lace DApp connector integration | Working; connection is kept only in application memory |
| Payroll and withdrawal demo | Working in explicitly labelled simulation mode |
| Compact sources | Architecture drafts; not compiled or deployable |
| Real Midnight transactions and proofs | Not implemented |
| Production authentication and authorization | Not implemented; backend binds to localhost by default |

Simulation produces IDs beginning with `sim_`. They are not blockchain transaction hashes. The UI and health endpoint expose the active execution mode.

## Quick start

Requirements: Node.js 20 or newer, npm, and Lace if wallet connection will be demonstrated.

```bash
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`; the backend runs at `http://127.0.0.1:3001`. Copy `backend/.env.example` to `backend/.env` to override defaults. Keep `MIDNIGHT_EXECUTION_MODE=simulation` for the current demo.

Use [docs/demo-payroll.csv](docs/demo-payroll.csv) to exercise the employer flow.

## Verification

```bash
npm test
npm run build
```

The root build intentionally covers the backend and frontend only. `npm run build --workspace veilpay-contracts` fails with a clear message until the official Compact compiler, generated bindings, proving material, and deployment configuration are wired.

## Security boundary

This repository is an accelerator/demo MVP, not a production payroll processor. It does not yet include organization authentication, role authorization, a secrets delivery service, a real asset custody model, production key management, a legal compliance review, or audited Compact contracts. Do not process real salary data or funds with this build.

## Documentation

- [Night Sky program research](docs/NIGHT_SKY_PROGRAM_RESEARCH.md)
- [Application answer bank](docs/NIGHT_SKY_APPLICATION.md)
- [Project audit and iteration plan](docs/PROJECT_AUDIT.md)
- [Pitch deck outline](docs/PITCH_DECK_OUTLINE.md)
- [Target architecture](docs/ARCHITECTURE.md)
- [Target privacy model](docs/PRIVACY_MODEL.md)

## License

MIT
