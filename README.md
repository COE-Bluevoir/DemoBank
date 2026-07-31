# NorthStar Bank Onboarding POC

Independent fictional retail-banking website for the NorthStar Bank Everyday Plus account onboarding demonstration. The frontend is the experience layer only and communicates exclusively through a backend-for-frontend API with an adapter-based orchestration layer.

## Stack

- Next.js 16 with TypeScript
- React 19
- Tailwind CSS 4
- React Hook Form + Zod
- Deterministic mock orchestration adapter
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

See [.env.example](./.env.example).

- `ORCHESTRATION_MODE=mock-pega`
- `DEMO_SCENARIO=ADDRESS_PEP_REVIEW`
- `DEMO_CONTROL_ENABLED=true`
- `DEMO_CONTROL_PASSCODE=northstar-26`
- `PEGA_BASE_URL=`
- `PEGA_CLIENT_ID=`
- `PEGA_CLIENT_SECRET=`
- `PEGA_TOKEN_URL=`

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

- `/`
- `/accounts/everyday-plus`
- `/onboarding/start`
- `/onboarding/[caseId]`
- `/onboarding/[caseId]/status`
- `/demo/control`

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
- Demo-control and runbook documentation is under `docs/`.
- Plugin recommendations for operational integrations are in `docs/plugin-recommendations.md`.
- All demo data is fictional and no real regulatory services are invoked.
