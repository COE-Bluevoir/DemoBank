import { randomUUID } from "node:crypto";

import { requirePegaConfig } from "@/lib/config/env";
import { PegaIntegrationError } from "@/lib/pega/errors";
import { PegaHttpClient } from "@/lib/pega/http-client";
import { dxCaseResponseSchema } from "@/lib/pega/dx-schemas";

/**
 * Proves Pega's own case-view contract rejects a malformed submission —
 * live, against a real case, not asserted. This is a different claim than
 * the hallucination demo's "grounded read": that one shows Pega has the
 * right fact, this one shows Pega structurally enforces its own data
 * contract regardless of what a caller sends.
 *
 * The invalid shape here is a real, previously-confirmed failure, not a
 * contrived one: earlier this build had a genuine bug where
 * `syncCustomerOnboardingName` sent `Applicant` with nested `FirstName`/
 * `LastName` sub-fields, and Pega's `pyUpdateCaseDetails` view — a
 * single-reference Combobox bound only to `ApplicantName` — rejected the
 * entire PATCH with `Error_Invalid_Inputs_content` (see
 * docs/pega-demo-mode-flag-handoff.md section 7). That was a real
 * integration bug caught by Pega's own validation, not a bug this demo had
 * to invent.
 *
 * Creates a small throwaway case each run — the same DX API operation the
 * real onboarding flow performs constantly in this environment already.
 */

export interface WorkflowGovernanceResult {
  caseId: string;
  rejected: {
    attemptedContent: Record<string, unknown>;
    statusCode: number;
    pegaError: string;
  };
  accepted: {
    attemptedContent: Record<string, unknown>;
    statusCode: number;
  };
}

/**
 * PegaHttpClient's technicalDetail is "{method} {path} returned HTTP
 * {status}. {rawPegaBody}" — this app's own diagnostic wrapper around
 * Pega's actual response. This demo is specifically about what Pega itself
 * said, so both halves get pulled apart: the real upstream status, and
 * Pega's own error body without this app's prefix in front of it.
 */
function parseUpstreamStatus(technicalDetail: string | undefined): number | undefined {
  const match = technicalDetail?.match(/returned HTTP (\d+)/);
  return match ? Number(match[1]) : undefined;
}

function pegaResponseBody(technicalDetail: string | undefined): string {
  const match = technicalDetail?.match(/returned HTTP \d+\.\s*([\s\S]*)$/);
  return match?.[1]?.trim() || technicalDetail || "No response body.";
}

async function getActionEtag(
  client: PegaHttpClient,
  caseId: string,
  actionId: string,
): Promise<string | undefined> {
  const { eTag } = await client.requestWithMeta({
    method: "GET",
    query: { viewType: "form" },
    path: `/cases/${encodeURIComponent(caseId)}/actions/${encodeURIComponent(actionId)}`,
    schema: dxCaseResponseSchema,
  });

  return eTag;
}

export async function runWorkflowGovernanceDemo(): Promise<WorkflowGovernanceResult> {
  const config = requirePegaConfig();
  const client = new PegaHttpClient(config);
  const correlationId = `corr-governance-${randomUUID()}`;

  const { data: created } = await client.requestWithMeta({
    method: "POST",
    path: "/cases",
    schema: dxCaseResponseSchema,
    correlationId,
    // A retried create must never open a second throwaway case.
    idempotencyKey: correlationId,
    query: { viewType: "none" },
    body: {
      caseTypeID: config.caseTypeId,
      content: { ProductIntent: "Everyday Plus Account" },
    },
  });
  const caseId = created.data.caseInfo.ID;

  const invalidContent = {
    Applicant: {
      ApplicantName: "Governance Demo Customer",
      FirstName: "Governance Demo",
      LastName: "Customer",
    },
  };

  let rejected: WorkflowGovernanceResult["rejected"];

  try {
    const eTag = await getActionEtag(client, caseId, "pyUpdateCaseDetails");
    await client.requestWithMeta({
      method: "PATCH",
      path: `/cases/${encodeURIComponent(caseId)}/actions/pyUpdateCaseDetails`,
      schema: dxCaseResponseSchema,
      correlationId,
      eTag,
      body: { content: invalidContent },
    });

    // If Pega ever accepts this, that's a real finding worth surfacing —
    // not a reason to fake a rejection instead.
    rejected = {
      attemptedContent: invalidContent,
      statusCode: 200,
      pegaError: "Pega accepted this submission — no rejection occurred.",
    };
  } catch (error) {
    if (!(error instanceof PegaIntegrationError)) {
      throw error;
    }

    rejected = {
      attemptedContent: invalidContent,
      // `error.statusCode` is this app's own customer-facing convention
      // (422 for any validation failure) — not what Pega actually
      // returned. This demo is specifically about Pega's real response, so
      // the raw status embedded in technicalDetail ("...returned HTTP
      // 400...") is what belongs here, not the mapped one.
      statusCode: parseUpstreamStatus(error.technicalDetail) ?? error.statusCode,
      pegaError: pegaResponseBody(error.technicalDetail),
    };
  }

  const validContent = {
    Applicant: { ApplicantName: "Governance Demo Customer" },
  };
  const eTag = await getActionEtag(client, caseId, "pyUpdateCaseDetails");

  await client.requestWithMeta({
    method: "PATCH",
    path: `/cases/${encodeURIComponent(caseId)}/actions/pyUpdateCaseDetails`,
    schema: dxCaseResponseSchema,
    correlationId,
    eTag,
    body: { content: validContent },
  });

  return {
    caseId,
    rejected,
    accepted: { attemptedContent: validContent, statusCode: 200 },
  };
}
