# NorthStar Bank Onboarding POC

Independent fictional retail-banking website for the NorthStar Bank Everyday Plus account onboarding demonstration. The frontend is the experience layer only and communicates exclusively through a backend-for-frontend API with an adapter-based orchestration layer.

## Stack

- Next.js 16 with TypeScript
- React 19
- Tailwind CSS 4
- React Hook Form + Zod
- Pluggable orchestration adapters: deterministic mock and live Pega
- Vitest for unit tests
- Playwright for end-to-end demo tests

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:3000`

## Environment variables

See [.env.example](./.env.example) for the annotated list. Every variable is
validated at startup in `src/lib/config/env.ts`.

The app runs with no configuration at all in `mock-pega` mode. To connect live
Pega, set `ORCHESTRATION_MODE=pega` plus `PEGA_BASE_URL`, `PEGA_TOKEN_URL`,
`PEGA_CLIENT_ID` and `PEGA_CLIENT_SECRET`. If any are missing the app refuses
to start rather than silently falling back to the mock engine.

## Connecting Pega

[docs/pega-integration-guide.md](./docs/pega-integration-guide.md) is the full
connection specification: the endpoints Pega must expose, the case contract,
the status mapping table, the tool services Pega calls back into, and how it
retrieves uploaded document evidence.

Check readiness at any time:

```bash
curl localhost:3000/api/health            # configuration
curl "localhost:3000/api/health?deep=true" # also verifies Pega authentication
curl localhost:3000/api/services          # tool allowlist
```

## Running the Leadership Demo

1. Start the application.
2. Open `/demo/control`.
3. Enter the presenter passcode.
4. Reset the scenario if a prior run exists.
5. Select `ADDRESS_PEP_REVIEW`.
6. Open `/onboarding/start` in a second browser window.
7. Complete the customer journey through personal details, consent and demo documents.
8. Confirm the address mismatch using `81 Lake View Road`.
9. Return to `/demo/control` and clear the simulated review.
10. Switch back to the customer window and show onboarding completion.
11. Copy the case ID and correlation ID from the control page for the audit reveal.

## Routes

Customer-facing:

- `/`
- `/accounts/everyday-plus`
- `/onboarding/start`
- `/onboarding/[caseId]`
- `/onboarding/[caseId]/status`

Internal:

- `/demo/control` — presenter surface, passcode gated
- `/api/health` — configuration and Pega readiness
- `/api/services` and `/api/services/{tool}` — tool services Pega invokes
- `/api/internal/documents/{ref}` — evidence retrieval for the orchestration layer

## Tests

- Unit tests:

```bash
npm run test:unit
```

- End-to-end tests:

```bash
npm run test:e2e
```

- Capture screenshots:

```bash
npm run screenshots
```

## Project notes

- The normalised case model is under `src/lib/onboarding/types.ts`.
- The deterministic mock state engine is under `src/lib/onboarding/engine.ts`.
- Adapter selection is under `src/lib/onboarding/adapters.ts`.
- The live Pega client is under `src/lib/pega/` (config, token, transport,
  schemas, mapper, errors).
- Tool services Pega calls back into are under `src/lib/services/`.
- Persistence and document storage abstractions are under `src/lib/store/` and
  `src/lib/storage/`; both are interfaces with swappable implementations.
- Demo-control and runbook documentation is under `docs/`.
- Plugin recommendations for operational integrations are in `docs/plugin-recommendations.md`.
- All demo data is fictional and no real regulatory services are invoked.
