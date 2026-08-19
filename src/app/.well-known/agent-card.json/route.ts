import { NextResponse } from "next/server";

/**
 * A2A agent card for this app's assistant.
 *
 * Discovery document a Pega "Connect Agent" rule reads to find the RPC
 * endpoint — the same shape `lib/assistant/pega-provider.ts` already knows
 * how to parse when this app calls out to Pega's own agent card, just for
 * the reverse direction.
 *
 * Unauthenticated by design: an agent card is meant to be publicly
 * discoverable. The RPC endpoint it points to (`/api/agent`) still requires
 * the shared service API key.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;

  return NextResponse.json(
    {
      name: "NorthStar Bank Onboarding Assistant",
      description:
        "Answers questions about NorthStar Bank's business banking products and guides a visitor toward starting an application. Grounded in the actual product catalog and document requirements; never invents rates, eligibility or case state.",
      url: `${origin}/api/agent`,
      version: "1.0.0",
      protocolVersion: "0.2.0",
      preferredTransport: "JSONRPC",
      capabilities: { streaming: false, pushNotifications: false },
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      securitySchemes: {
        serviceApiKey: {
          type: "apiKey",
          in: "header",
          name: "x-service-api-key",
        },
      },
      security: [{ serviceApiKey: [] }],
      skills: [
        {
          id: "onboarding-guide",
          name: "Onboarding guide",
          description:
            "Answers what documents are needed, how long the process takes, how data is protected, and guides a visitor toward starting a business banking application.",
          tags: ["banking", "onboarding", "customer-support"],
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
