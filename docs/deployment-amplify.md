# AWS Amplify Deployment Runbook

Deploying the NorthStar Bank onboarding website to AWS Amplify Hosting from
GitHub.

Everything in the repository is ready. This document is the click-through for
the AWS side, which is the only part not automated here.

**Source repository:** `COE-Bluevoir/DemoBank` (branch `main`)

---

## Why the AWS resources are required

The application keeps state that must survive between requests:

| State | Why it must be durable |
| --- | --- |
| Per-case Pega integration state | Carries the correlation ID, the customer's entered details, and whether consent was given. Losing it mid-journey makes the site re-ask for details or submit consent it never captured. |
| Uploaded documents | Pega fetches evidence from this application *after* the upload request has finished, from a possibly different instance. |
| Tool idempotency records | A retried `create-customer` call must return the original account, not open a second one. |

Amplify's SSR compute runs on Lambda: the filesystem is read-only apart from an
ephemeral `/tmp`, and nothing is shared between instances. So these live in
**DynamoDB** and **S3**. Set `STORAGE_DRIVER=aws` and the application uses them;
leave it unset locally and it uses the filesystem.

If `STORAGE_DRIVER=aws` is set without the table and bucket names, the
application **refuses to start** rather than silently losing customer data.

---

## Step 1 — Create the DynamoDB table

Console → DynamoDB → Create table.

| Setting | Value |
| --- | --- |
| Table name | `northstar-onboarding-state` |
| Partition key | `pk` (String) |
| Sort key | *none* |
| Capacity | On-demand |

Then enable TTL: Table → Additional settings → Time to Live → attribute `ttl`.

Records expire on their own — case state after 30 days, idempotency records
after 24 hours — so the table does not grow without bound.

## Step 2 — Create the S3 bucket

Console → S3 → Create bucket.

| Setting | Value |
| --- | --- |
| Bucket name | `northstar-onboarding-documents-<account-id>` |
| Block all public access | **On** (documents are customer identity evidence) |
| Encryption | SSE-S3 (or SSE-KMS) |
| Versioning | Optional |

Add a lifecycle rule to expire `documents/` after your retention period.

> The bucket must never be public. Documents are served only through
> `/api/internal/documents/{ref}`, which requires the service API key.

## Step 3 — Connect the repository

Console → AWS Amplify → Create new app → Deploy from GitHub.

1. Authorise AWS Amplify for the **COE-Bluevoir** organisation.
   An organisation owner may need to approve the GitHub App.
2. Select repository `COE-Bluevoir/DemoBank`, branch `main`.
3. Amplify detects Next.js and the committed `amplify.yml`. Confirm the
   platform is **Web Compute** (SSR), not static hosting.

## Step 4 — Environment variables

Amplify → App settings → Environment variables. Mark the secrets as such.

**Required**

| Variable | Value |
| --- | --- |
| `ORCHESTRATION_MODE` | `pega` |
| `STORAGE_DRIVER` | `aws` |
| `AWS_REGION` | e.g. `ap-south-1` |
| `DYNAMODB_TABLE_NAME` | `northstar-onboarding-state` |
| `S3_DOCUMENT_BUCKET` | your bucket name from step 2 |
| `PEGA_BASE_URL` | `https://<host>/prweb/api/application/v2` |
| `PEGA_TOKEN_URL` | `https://<host>/prweb/PRRestService/oauth2/v1/token` |
| `PEGA_CLIENT_ID` | **secret** |
| `PEGA_CLIENT_SECRET` | **secret** |
| `PEGA_CASE_TYPE_ID` | `ODHMNT-AgenticC-Work-CustomerOnboardingUnified` |
| `SERVICE_API_KEY` | **secret** — a strong random value Pega presents when calling back |

**Recommended**

| Variable | Value |
| --- | --- |
| `DEMO_CONTROL_ENABLED` | `false` — removes the presenter surface from a public deployment |
| `PEGA_TIMEOUT_MS` | `12000` |
| `PEGA_MAX_RETRIES` | `2` |

> No secret is committed to the repository. `.env.local` is git-ignored and
> `.env.example` contains only placeholders.

## Step 5 — Grant the compute role access

Amplify's SSR functions need permission to reach the table and bucket.

Console → Amplify → App settings → IAM roles → note the **compute role**
(create one if prompted), then attach this inline policy. Replace the region,
account ID and bucket name.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OnboardingStateTable",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:<region>:<account-id>:table/northstar-onboarding-state"
    },
    {
      "Sid": "OnboardingDocuments",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<bucket-name>/documents/*"
    }
  ]
}
```

This is least-privilege on purpose: no `Scan`, no `ListBucket`, and object
access scoped to the `documents/` prefix.

## Step 6 — Deploy

Trigger the first build. `amplify.yml` runs lint, typecheck and the unit tests
before building, so a broken commit fails the deployment rather than shipping.

## Step 7 — Verify

Replace `<app-url>` with the Amplify domain.

```bash
# Configuration and a real Pega token acquisition
curl "https://<app-url>/api/health?deep=true"

# Expect: "status":"ok", "orchestrationMode":"pega", "pega":{"reachable":true}

# Tool allowlist (requires the service API key once SERVICE_API_KEY is set)
curl -H "x-service-api-key: <key>" "https://<app-url>/api/services"
```

Then walk the customer journey: `/` → `/onboarding/start` → complete details →
accept consent → upload documents. Confirm in Pega that a case was created and
the attachments are present.

## Step 8 — Point Pega back at the deployment

Pega calls this application for tool services and to fetch document evidence.
Update the Pega-side configuration to:

- `https://<app-url>/api/services/{tool}`
- `https://<app-url>/api/internal/documents/{storageReference}`

Both require the `x-service-api-key` header with the `SERVICE_API_KEY` value.

See [pega-integration-guide.md](./pega-integration-guide.md) for the contracts.

---

## Operational notes

- **Rollback:** Amplify keeps previous builds; redeploy an earlier one from the
  console.
- **Demo control:** keep `DEMO_CONTROL_ENABLED=false` in any public
  environment. It exposes scenario switching and case reset.
- **Cost:** DynamoDB on-demand and S3 for a demo workload are negligible;
  Amplify SSR compute bills per request.
- **Secret rotation:** rotate `PEGA_CLIENT_SECRET` and `SERVICE_API_KEY` in the
  Amplify console; no redeploy of code is needed, only a restart of the build.
