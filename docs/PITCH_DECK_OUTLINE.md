# VeilPay Night Sky Pitch Deck

The editable PowerPoint file is `docs/VeilPay_Night_Sky_Pitch_Deck.pptx`.

## 1. Title
VeilPay: Private payroll. Verifiable compliance.

## 2. Problem
Payroll is one of the most sensitive datasets inside a company, but existing blockchain payment rails expose too much operational and salary information. Employers need auditability and compliance, while employees need salary privacy.

## 3. Solution
Explain the private batch, one-time employee claim and selective audit workflow. Keep the `SIMULATION MVP` label visible.

## 4. Why Midnight
Explain the hybrid ledger, Compact/ZK circuits, selective disclosure and the NIGHT/DUST resource model. Keep the `TARGET ARCHITECTURE` label visible because real contracts and proofs are not deployed.

## 5. Lace Wallet Integration
Separate what works today from the on-chain completion path. The current MVP discovers installed Midnight wallets, requests permission, validates connection status and a compatible network, reads the shielded address, keeps the session in memory and supports copy/disconnect. Generated bindings, wallet authorization, proof generation, submission and receipt tracking remain future work.

## 6. Product Today
Contrast what works today with what is still required for on-chain execution:

- Employer uploads a payroll CSV.
- VeilPay validates the roster and creates a payroll batch.
- The demo simulates Midnight transaction execution.
- Employees verify one-time claim keys and withdraw to a connected wallet.
- Compliance reviewers inspect audit and allow/block list workflows.

## 7. Market
Initial users are crypto-native companies, DAOs, global contractors, and payroll providers that need privacy-preserving treasury operations and audit-friendly salary workflows.

## 8. Differentiation
Most payroll tools are private but not on-chain. Most on-chain payment tools are transparent by default. VeilPay is designed around private payroll commitments, selective disclosure, and compliance workflows from day one.

## 9. Business Model
Present a hybrid B2B model: recurring employer subscriptions, variable usage fees tied to payroll/proof workload, and enterprise integration and support services. Do not show exact prices until customer interviews validate them.

## 10. Traction
Use only verified build evidence:

- Working frontend portals for employer, employee, and compliance roles.
- SQLite-backed backend with payroll batch, claim, and audit flows.
- Lace wallet connection implemented.
- Eleven automated backend tests pass.
- The latest npm audit reports zero known vulnerabilities.
- No production users, on-chain volume, TVL or revenue are claimed.

## 11. Roadmap
- Compile Compact contracts into deployable artifacts.
- Deploy payroll contract to Midnight testnet.
- Replace simulation execution with real SDK-backed transactions.
- Add production-grade proof server integration.
- Pilot with a crypto-native team or DAO treasury workflow.

## 12. Team
Present Uğur as Founder and Full-Stack Developer, Musa Eren Topcu as Co-founder and Blockchain Lead, Yusuf Arslan as Frontend Developer, and Salih Töre as Backend Developer. Replace the four editable photo placeholders before submission.

## 13. Ask
Request Compact/proof mentorship, pilot introductions, and go-to-market and pre-seed readiness support.
