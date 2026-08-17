import { randomUUID } from "node:crypto";

import { getAgentLedger } from "@/lib/agents/ledger";
import { reviewDocuments, reviewScreening } from "@/lib/agents/specialists";
import {
  extractDocuments,
  isCleanOutcome,
  needsCustomerChoice,
  runChecks,
} from "@/lib/orchestration/checks";
import type { AgentDecisionRecord } from "@/lib/agents/contracts";
import { getIndustryPack } from "@/lib/industry/registry";
import { formatFullName } from "@/lib/onboarding/applicant-name";
import { CASE_PROGRESS_STEPS, CUSTOMER_SAFE_STATUS } from "@/lib/onboarding/constants";
import {
  applicantSchema,
  consentSchema,
} from "@/lib/onboarding/schemas";
import type {
  AssistantMessage,
  CreateOnboardingCaseRequest,
  CreateOnboardingCaseResponse,
  DemoExecutionEvent,
  DocumentUploadResponse,
  OnboardingCaseView,
  OnboardingOrchestrationAdapter,
  OnboardingStatus,
  ProgressState,
  SubmitCaseActionRequest,
  UploadedDocument,
} from "@/lib/onboarding/types";
import {
  type NonPegaCase,
  getNonPegaCaseStore,
} from "@/lib/orchestration/case-store";
import { evaluatePolicy, mayActivate } from "@/lib/orchestration/policy";
import { getToolInvoker } from "@/lib/agents/tools";

/**
 * Non-Pega orchestration.
 *
 * A complete alternative to the governed workflow, implemented outside Pega.
 * It owns case state, lifecycle, policy evaluation, exception handling,
 * human-review gating, tool execution and activation. Pega is never called.
 *
 * This exists to be compared against `pega` mode honestly: both implement the
 * same adapter interface and the same customer journey, so the difference the
 * demo shows is the orchestration approach, not the feature set.
 */

const PROGRESS_INDEX: Record<OnboardingStatus, number> = {
  STARTED: 0,
  INFORMATION_REQUIRED: 0,
  DOCUMENTS_REQUIRED: 1,
  VERIFYING_DOCUMENTS: 2,
  ADDRESS_CONFIRMATION_REQUIRED: 2,
  SCREENING_IN_PROGRESS: 2,
  ROUTINE_REVIEW: 3,
  CREATING_CUSTOMER: 4,
  COMPLETED: 4,
  UNABLE_TO_CONTINUE: 3,
};

function nowIso(): string {
  return new Date().toISOString();
}

function recordEvent(
  record: NonPegaCase,
  event: Omit<DemoExecutionEvent, "id" | "timestamp" | "caseId" | "correlationId">,
): void {
  record.events.push({
    ...event,
    id: `${record.caseId}-evt-${record.events.length + 1}`,
    timestamp: nowIso(),
    caseId: record.caseId,
    correlationId: record.correlationId,
  });
}

function setStatus(record: NonPegaCase, status: OnboardingStatus): void {
  if (record.status === status) {
    return;
  }

  record.status = status;
  record.version += 1;
  record.lastUpdatedAt = nowIso();
}

function buildProgress(status: OnboardingStatus) {
  const currentIndex = PROGRESS_INDEX[status];

  return {
    currentStep: currentIndex,
    steps: CASE_PROGRESS_STEPS.map((step, index) => {
      let state: ProgressState = "not-started";

      if (status === "UNABLE_TO_CONTINUE" && index === currentIndex) {
        state = "attention";
      } else if (index < currentIndex) {
        state = "completed";
      } else if (index === currentIndex) {
        state = status === "COMPLETED" ? "completed" : "current";
      }

      return { id: step.id, label: step.label, state };
    }),
  };
}

/** Customer-safe next action. Internal step names never reach the browser. */
const ACTION_LABEL: Record<OnboardingStatus, string | undefined> = {
  STARTED: "Begin application",
  INFORMATION_REQUIRED: "Save and continue",
  DOCUMENTS_REQUIRED: "Upload documents",
  ADDRESS_CONFIRMATION_REQUIRED: "Confirm address",
  VERIFYING_DOCUMENTS: undefined,
  SCREENING_IN_PROGRESS: undefined,
  ROUTINE_REVIEW: "Check status",
  CREATING_CUSTOMER: undefined,
  COMPLETED: undefined,
  UNABLE_TO_CONTINUE: undefined,
};

const ACTION_ID: Record<OnboardingStatus, string> = {
  STARTED: "BEGIN_APPLICATION",
  INFORMATION_REQUIRED: "SUBMIT_DETAILS",
  DOCUMENTS_REQUIRED: "UPLOAD_DOCUMENTS",
  ADDRESS_CONFIRMATION_REQUIRED: "CONFIRM_ADDRESS",
  VERIFYING_DOCUMENTS: "CHECK_STATUS",
  SCREENING_IN_PROGRESS: "CHECK_STATUS",
  ROUTINE_REVIEW: "CHECK_STATUS",
  CREATING_CUSTOMER: "CHECK_STATUS",
  COMPLETED: "CHECK_STATUS",
  UNABLE_TO_CONTINUE: "CHECK_STATUS",
};

function toView(record: NonPegaCase): OnboardingCaseView {
  const label = ACTION_LABEL[record.status];

  return {
    caseId: record.caseId,
    caseVersion: record.version,
    correlationId: record.correlationId,
    orchestrationMode: "non-pega",
    scenarioId: record.scenarioId,
    industryId: record.industryId,
    status: record.status,
    customerSafeStatus: CUSTOMER_SAFE_STATUS[record.status],
    currentAction: label
      ? { id: ACTION_ID[record.status], label, description: "" }
      : undefined,
    progress: buildProgress(record.status),
    pendingChoice: record.pendingChoice,
    applicant: record.applicant,
    documents: record.documents,
    assistantMessages: [],
    lastUpdatedAt: record.lastUpdatedAt,
    outcome: record.outcome,
    // Exception detail is internal; the customer sees a neutral status only.
    statusDetail:
      record.status === "ROUTINE_REVIEW"
        ? "One of our onboarding specialists needs to complete a routine review."
        : undefined,
    alert:
      record.status === "UNABLE_TO_CONTINUE"
        ? {
            title: "Application saved",
            message:
              "We could not complete one of the steps at this time. Your application has been saved, and no action is required from you right now.",
            tone: "warning",
          }
        : undefined,
  };
}

export class NonPegaOrchestrationAdapter
  implements OnboardingOrchestrationAdapter
{
  async createCase(
    request: CreateOnboardingCaseRequest,
  ): Promise<CreateOnboardingCaseResponse> {
    const caseId = `NPG-${randomUUID().slice(0, 8).toUpperCase()}`;
    const correlationId = `corr-${randomUUID()}`;

    const record: NonPegaCase = {
      caseId,
      correlationId,
      industryId: request.industryId,
      scenarioId: request.scenarioId,
      status: "STARTED",
      version: 1,
      createdAt: nowIso(),
      lastUpdatedAt: nowIso(),
      documents: [],
      exceptions: [],
      requiresHumanReview: false,
      screeningResults: [],
      events: [],
    };

    recordEvent(record, {
      category: "CASE",
      displayName: "Case created",
      status: "SUCCEEDED",
      // "Outside Pega" rather than "ungoverned": this orchestration applies
      // its own policy, exceptions and review gate.
      summary: "Onboarding case opened on the AWS orchestration.",
    });

    await getNonPegaCaseStore().put(record);

    return {
      caseId,
      caseVersion: record.version,
      correlationId,
      status: "STARTED",
      nextUrl: `/onboarding/${caseId}`,
    };
  }

  async getCase(caseId: string): Promise<OnboardingCaseView> {
    return toView(await this.require(caseId));
  }

  async submitAction(
    caseId: string,
    request: SubmitCaseActionRequest,
  ): Promise<OnboardingCaseView> {
    const record = await this.require(caseId);

    switch (request.actionId) {
      case "BEGIN_APPLICATION":
        setStatus(record, "INFORMATION_REQUIRED");
        break;

      case "SUBMIT_DETAILS": {
        // Validated here because this orchestration is the authority: there is
        // no downstream system to reject bad input.
        record.applicant = applicantSchema.parse(request.data);
        recordEvent(record, {
          category: "CASE",
          displayName: "Details captured",
          status: "SUCCEEDED",
          summary: "Applicant details recorded.",
        });
        setStatus(record, "INFORMATION_REQUIRED");
        break;
      }

      case "ACCEPT_CONSENT": {
        record.consent = consentSchema.parse(request.data);
        recordEvent(record, {
          category: "HUMAN",
          displayName: "Consent captured",
          status: "SUCCEEDED",
          summary: "Customer accepted the consent statement.",
        });
        setStatus(record, "DOCUMENTS_REQUIRED");
        break;
      }

      case "USE_DEMO_DOCUMENTS": {
        // Every document the journey asks for, not one per evidence class:
        // the shortcut must satisfy the same gate a real customer does, or it
        // leaves the case stuck on a screen the presenter has already passed.
        for (const document of getIndustryPack(record.industryId)
          .documentProfile) {
          record.documents.push({
            documentId: `${record.caseId}-${document.code}`,
            documentCode: document.code,
            kind: document.kind,
            fileName: `Sample_${document.code}.pdf`,
            fileType: "application/pdf",
            fileSize: 1024,
            status: "UPLOADED",
            source: "demo",
            evidenceReference: `${record.caseId}-EV-${document.code}`,
          });
        }
        await this.runVerification(record);
        break;
      }

      case "CONTINUE_DOCUMENTS": {
        if (record.documents.length === 0) {
          throw new Error("Upload at least one document before continuing.");
        }
        await this.runVerification(record);
        break;
      }

      case "CONFIRM_ADDRESS":
      case "ACCEPT_ALTERNATIVE": {
        // The customer accepts what can actually be delivered. Recorded as
        // their decision, with what they were offered, because the order has
        // changed and the audit trail has to show who changed it.
        record.acceptedAlternative = true;
        recordEvent(record, {
          category: "HUMAN",
          displayName: "Alternative accepted",
          status: "SUCCEEDED",
          summary: "Customer accepted the service available at the site.",
          technicalDetails: record.pendingChoice?.evidence,
        });
        record.pendingChoice = undefined;
        await this.runVerification(record);
        break;
      }

      case "CLEAR_REVIEW": {
        // The human-review gate. Only clearing it lets the case proceed.
        record.reviewClearedAt = nowIso();
        record.reviewedBy = String(request.data?.reviewedBy ?? "operations");
        recordEvent(record, {
          category: "HUMAN",
          displayName: "Review cleared",
          status: "SUCCEEDED",
          summary: `Reviewer ${record.reviewedBy} cleared the case.`,
        });
        await this.runActivation(record);
        break;
      }

      case "CHECK_STATUS":
        break;

      default:
        break;
    }

    await getNonPegaCaseStore().put(record);
    return toView(record);
  }

  async uploadDocument(
    caseId: string,
    document: UploadedDocument,
  ): Promise<DocumentUploadResponse> {
    const record = await this.require(caseId);

    // Replace the document that answered the same requirement, not merely one
    // of the same class. Banking asks for four documents and three of them are
    // identity evidence; deduping by class would keep only the last.
    const slot = document.documentCode ?? document.kind;

    record.documents = record.documents.filter(
      (item) => (item.documentCode ?? item.kind) !== slot,
    );
    record.documents.push({
      documentId: `${caseId}-${slot}`,
      documentCode: document.documentCode,
      kind: document.kind,
      fileName: document.fileName,
      fileType: document.fileType,
      fileSize: document.fileSize,
      status: "UPLOADED",
      source: document.source,
      evidenceReference: document.storageReference ?? "",
      storageReference: document.storageReference,
    });

    await this.runVerification(record);
    await getNonPegaCaseStore().put(record);

    return {
      documentId: `${caseId}-${slot}`,
      fileName: document.fileName,
      status: "UPLOADED",
      evidenceReference: document.storageReference ?? "",
    };
  }

  async getMessages(): Promise<AssistantMessage[]> {
    return [];
  }

  async getEvents(caseId: string): Promise<DemoExecutionEvent[]> {
    return (await this.require(caseId)).events;
  }

  /**
   * Run verification once the required evidence is present.
   *
   * Agents read the documents and run the checks; the policy engine decides
   * what the results mean. That separation is what keeps the outcome
   * reproducible.
   */
  private async runVerification(record: NonPegaCase): Promise<void> {
    const pack = getIndustryPack(record.industryId);
    // Gate on the evidence the journey asks for, by document rather than by
    // class. The old two-entry list let a four-document journey proceed once
    // any identity and any address document had arrived, so the case advanced
    // while the page still showed unanswered slots.
    const required = pack.documentProfile.filter((item) => item.mandatory);
    const present = new Set(
      record.documents.map((item) => item.documentCode ?? item.kind),
    );

    if (required.some((item) => !present.has(item.code))) {
      setStatus(record, "DOCUMENTS_REQUIRED");
      return;
    }

    setStatus(record, "VERIFYING_DOCUMENTS");

    const agentRecords: AgentDecisionRecord[] = [];
    const context = {
      caseId: record.caseId,
      correlationId: record.correlationId,
      pack,
      invoker: getToolInvoker(),
      records: agentRecords,
    };

    const applicant = record.applicant;
    const identity = record.documents.find((item) => item.kind === "IDENTITY");
    const address = record.documents.find((item) => item.kind === "ADDRESS");

    const documentFinding = applicant
      ? await reviewDocuments(context, {
          fullName: formatFullName(applicant),
          address: {
            addressLine1: applicant.addressLine1,
            city: applicant.city,
            region: applicant.region,
            postalCode: applicant.postalCode,
            country: applicant.country,
          },
          identityStorageReference: identity?.storageReference ?? "sample",
          addressStorageReference: address?.storageReference ?? "sample",
        })
      : undefined;

    setStatus(record, "SCREENING_IN_PROGRESS");

    const screeningFinding = applicant
      ? await reviewScreening(context, {
          fullName: formatFullName(applicant),
          dateOfBirth: applicant.dateOfBirth,
          nationality: applicant.nationality,
          email: applicant.email,
          mobile: applicant.mobile,
          postalCode: applicant.postalCode,
        })
      : undefined;

    record.screeningResults = screeningFinding?.results ?? [];

    // The external checks this journey calls for. Extraction runs first so the
    // later checks compare the application against what the evidence actually
    // says, rather than against itself.
    const checkContext = {
      caseId: record.caseId,
      correlationId: record.correlationId,
    };

    extractDocuments(
      pack,
      checkContext,
      record.documents
        .map((item) => item.documentCode)
        .filter((code): code is string => Boolean(code)),
    );

    const findings = runChecks(pack, checkContext);

    for (const finding of findings) {
      recordEvent(record, {
        category: "TOOL",
        displayName: finding.check,
        status: isCleanOutcome(finding.outcome) ? "SUCCEEDED" : "WAITING",
        summary: finding.detail ?? finding.outcome,
        technicalDetails: {
          providerReference: finding.providerReference,
          reasonCode: finding.reasonCode,
          confidence: finding.confidence,
        },
      });
    }

    // Serviceability offering less than was ordered is a commercial change.
    // Only the customer can accept it, so the case stops here rather than
    // provisioning something they did not buy.
    const choice = needsCustomerChoice(findings);

    if (choice && record.acceptedAlternative !== true) {
      record.pendingChoice = {
        reason: choice.reasonCode ?? "ALTERNATIVE_OFFERED",
        evidence: choice.evidence ?? {},
      };
      recordEvent(record, {
        category: "RULE",
        displayName: "Customer choice required",
        status: "WAITING",
        summary: "The service available at the site differs from the order.",
      });
      setStatus(record, "ADDRESS_CONFIRMATION_REQUIRED");
      return;
    }

    // Every non-clean finding becomes an input to policy. The check layer does
    // not get to say what a REVIEW means — that is the engine's decision.
    record.screeningResults = [
      ...record.screeningResults,
      ...findings
        .filter((finding) => !isCleanOutcome(finding.outcome))
        .map((finding) => ({
          check: finding.check,
          outcome: finding.outcome,
          detail: finding.detail,
        })),
    ];

    for (const entry of agentRecords) {
      recordEvent(record, {
        category: "AGENT",
        displayName: entry.actor,
        status: entry.outcome === "failed" ? "FAILED" : "SUCCEEDED",
        summary: entry.outputSummary,
        technicalDetails: { toolsInvoked: entry.promptTemplateId },
      });
    }

    await getAgentLedger().append(agentRecords);

    const verdict = evaluatePolicy({
      hasApplicant: Boolean(applicant),
      hasConsent: Boolean(record.consent),
      // The policy engine reasons in evidence classes; the gate above reasons
      // in documents. Both views of the same set.
      documentKinds: record.documents.map((item) => item.kind),
      requiredDocumentKinds: required.map((item) => item.kind),
      documentDiscrepancies: (documentFinding?.discrepancies ?? []).map(
        (item) => ({
          field: item.field,
          severity: item.suggestedClassification,
          detail: `${item.applicationValue} vs ${item.documentValue}`,
        }),
      ),
      screeningResults: record.screeningResults,
    });

    record.exceptions = verdict.exceptions;
    record.requiresHumanReview = verdict.requiresHumanReview;

    recordEvent(record, {
      category: "RULE",
      displayName: "Policy evaluated",
      status: "SUCCEEDED",
      summary: verdict.reasonCodes.join(", "),
      technicalDetails: { exceptions: verdict.exceptions.length },
    });

    if (verdict.blocked) {
      setStatus(record, "UNABLE_TO_CONTINUE");
      return;
    }

    if (verdict.requiresHumanReview) {
      setStatus(record, "ROUTINE_REVIEW");
      return;
    }

    await this.runActivation(record);
  }

  /** Create the customer. The one irreversible step, gated by policy. */
  private async runActivation(record: NonPegaCase): Promise<void> {
    const verdict = evaluatePolicy({
      hasApplicant: Boolean(record.applicant),
      hasConsent: Boolean(record.consent),
      documentKinds: record.documents.map((item) => item.kind),
      requiredDocumentKinds: getIndustryPack(
        record.industryId,
      ).requiredDocuments.map((item) => item.kind),
      documentDiscrepancies: [],
      screeningResults: record.screeningResults,
    });

    if (!mayActivate(verdict, Boolean(record.reviewClearedAt))) {
      setStatus(
        record,
        verdict.blocked ? "UNABLE_TO_CONTINUE" : "ROUTINE_REVIEW",
      );
      return;
    }

    setStatus(record, "CREATING_CUSTOMER");

    const pack = getIndustryPack(record.industryId);
    const applicant = record.applicant;

    const result = await getToolInvoker().invoke<{
      customerId: string;
      accountId: string;
    }>({
      tool: "create-customer",
      // Activation must never run twice for the same case.
      idempotencyKey: `non-pega:${record.caseId}`,
      input: {
        caseId: record.caseId,
        productCode: "EVERYDAY_PLUS",
        applicant: {
          fullName: applicant ? formatFullName(applicant) : "Unknown",
          dateOfBirth: applicant?.dateOfBirth ?? "",
          email: applicant?.email ?? "",
          mobile: applicant?.mobile ?? "",
          address: {
            addressLine1: applicant?.addressLine1 ?? "",
            city: applicant?.city ?? "",
            region: applicant?.region ?? "",
            postalCode: applicant?.postalCode ?? "",
            country: applicant?.country ?? "",
          },
        },
      },
    });

    record.outcome = {
      customerReference: result.output.customerId,
      accountReference: result.output.accountId,
      productName: pack.brand.productName,
    };

    recordEvent(record, {
      category: "INTEGRATION",
      displayName: "Customer created",
      status: "SUCCEEDED",
      summary: `${pack.terminology.productNoun} ${pack.terminology.activationVerb}.`,
    });

    setStatus(record, "COMPLETED");
  }

  private async require(caseId: string): Promise<NonPegaCase> {
    const record = await getNonPegaCaseStore().get(caseId);

    if (!record) {
      throw new NonPegaCaseNotFoundError(caseId);
    }

    return record;
  }
}

export class NonPegaCaseNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(caseId: string) {
    super(`Case ${caseId} was not found.`);
    this.name = "NonPegaCaseNotFoundError";
  }
}
