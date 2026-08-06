# NorthStar Bank Onboarding POC

Independent fictional retail-banking website for the NorthStar Bank Everyday
Plus account onboarding demonstration. The frontend is the experience layer only
and communicates exclusively through a backend-for-frontend API with an
adapter-based orchestration layer.

## The switch

The customer chooses which system runs their application, on the start page,
before it opens — **Pega** or **AWS**. These are two complete, mutually
exclusive implementations of the same journey; neither borrows from the other,
which is what makes comparing them meaningful.

The choice binds to the case rather than to a shared setting: each
orchestration mints its own reference (`NPG-…` for AWS, Pega's own work ID for
Pega) and ownership is read back off it, so a switch flipped mid-journey cannot
divert an application to a system that never opened it.

| | Pega | AWS |
|---|---|---|
| Runs the workflow | Pega, entirely | AWS, entirely |
| Case state, policy, exceptions, review, activation | Pega | outside Pega |
| Pega called | yes | **never** |
| Status | **this side complete, waiting on Pega's own stages** | **complete end to end** |

The AWS path runs to an opened account with no dependency on Pega. The Pega
path opens a real case and Pega accepts details, consent and documents; its own
document and agent stages are still being configured, and when one fails the
customer sees a neutral message. No change here is needed when Pega is fixed.

See [docs/solution-overview.md](./docs/solution-overview.md).

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
