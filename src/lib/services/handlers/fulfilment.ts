import { z } from "zod";

import { BRAND } from "@/lib/onboarding/constants";
import type {
  createCustomerRequestSchema,
  createCustomerResultSchema,
  generateCommunicationRequestSchema,
  generateCommunicationResultSchema,
} from "@/lib/services/contracts";
import { deterministicInt } from "@/lib/services/deterministic";

/**
 * Fulfilment tools: customer/account creation and customer communication.
 *
 * `create-customer` is the one tool with a real-world side effect, so callers
 * must always send an idempotency key. Combined with the idempotency store, a
 * retried creation returns the original identifiers instead of opening a
 * second account.
 */

type CreateCustomerRequest = z.infer<typeof createCustomerRequestSchema>;
type CreateCustomerResult = z.infer<typeof createCustomerResultSchema>;
type GenerateCommunicationRequest = z.infer<
  typeof generateCommunicationRequestSchema
>;
type GenerateCommunicationResult = z.infer<
  typeof generateCommunicationResultSchema
>;

export function createCustomer(
  request: CreateCustomerRequest,
): CreateCustomerResult {
  const seed = `${request.caseId}:${request.applicant.email}`;

  return {
    customerId: `CUST-${100000 + deterministicInt(`cust:${seed}`, 899999)}`,
    accountId: `ACC-${200000 + deterministicInt(`acct:${seed}`, 799999)}`,
    productCode: request.productCode,
    openedAt: new Date().toISOString(),
    completionMethod: "AUTOMATED",
  };
}

/**
 * Approved customer communication templates.
 *
 * Templates are fixed fragments with substituted values only. No screening
 * outcome, reviewer note or provider reference can reach a customer message,
 * because none of that data is an input to this function.
 */
const TEMPLATES: Record<
  GenerateCommunicationRequest["templateId"],
  (input: GenerateCommunicationRequest) => { subject: string; body: string }
> = {
  WELCOME_ACCOUNT_OPENED: (input) => ({
    subject: `Your ${input.productName} is open`,
    body: [
      `Dear ${input.customerFirstName},`,
      "",
      `Welcome to ${BRAND.bankName}. Your ${input.productName} is now open and ready to use.`,
      "",
      input.customerId ? `Customer reference: ${input.customerId}` : undefined,
      input.accountId ? `Account reference: ${input.accountId}` : undefined,
      "",
      "You can now sign in to digital banking to set up your payments and card.",
      "",
      `The ${BRAND.bankName} team`,
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
  }),
  APPLICATION_SAVED: (input) => ({
    subject: `Your ${input.productName} application has been saved`,
    body: [
      `Dear ${input.customerFirstName},`,
      "",
      `We have saved your application for a ${input.productName}. We could not complete one of the steps at this time, and no action is required from you right now.`,
      "",
      "We will contact you as soon as your application moves forward.",
      "",
      `The ${BRAND.bankName} team`,
    ].join("\n"),
  }),
};

export function generateCommunication(
  request: GenerateCommunicationRequest,
): GenerateCommunicationResult {
  const { subject, body } = TEMPLATES[request.templateId](request);

  return {
    templateId: request.templateId,
    subject,
    body,
    channel: "EMAIL",
  };
}
