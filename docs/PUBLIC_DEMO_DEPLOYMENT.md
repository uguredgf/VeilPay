# VeilPay Public Demo Deployment

## Recommended free path: Render

The repository is configured as one Render web service. Express serves both the
compiled React application and `/api`, so the demo uses one public HTTPS URL and
does not require cross-origin configuration.

1. Push this project to a GitHub repository. A public repository is simplest;
   a private repository also works after authorizing Render.
2. Create a free account at https://render.com and connect GitHub.
3. In the Render dashboard, choose **New > Blueprint**.
4. Select the repository and keep the default `render.yaml` path.
5. Apply the Blueprint. Render builds with `npm ci && npm run build`, then starts
   the service with `npm start`.
6. Wait for `/api/health` to report `status: healthy`, then open the generated
   `https://veilpay-demo-....onrender.com` URL.
7. Test all three roles using only the bundled demonstration CSV and synthetic
   wallet addresses. Put the final URL in the Night Sky application and deck.

## Free-tier boundaries

- The service runs in `MIDNIGHT_EXECUTION_MODE=simulation`. It does not submit
  real Midnight transactions or proofs.
- Render's free web service sleeps after 15 minutes without traffic. The first
  request after sleep can take about one minute.
- The free filesystem is ephemeral. The SQLite database resets after a restart,
  redeploy, or sleep cycle. This is acceptable for a disposable demo, not for a
  production payroll product.
- Do not upload real employee names, salary data, claim secrets, or production
  wallet information. Use `docs/demo-payroll.csv` only.
- Before a production launch, replace SQLite with a durable managed database,
  add authentication and role-based authorization, deploy compiled Compact
  contracts and proof infrastructure, and complete an independent security audit.

## Local production check

```powershell
$env:NODE_ENV='production'
$env:HOST='127.0.0.1'
$env:MIDNIGHT_EXECUTION_MODE='simulation'
$env:CLAIM_ENCRYPTION_SECRET='replace-this-with-a-long-random-local-test-secret'
npm run build
npm start
```

Open `http://127.0.0.1:3001` and verify `http://127.0.0.1:3001/api/health`.
