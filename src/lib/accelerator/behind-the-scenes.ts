/**
 * Script for the "behind the scenes" system-interaction diagram.
 *
 * Deliberately a fixed, curated sequence rather than a live replay of a real
 * case's event log — that was the explicit ask: something safe to show
 * leadership that doesn't depend on a real case (or live Pega) behaving
 * during the moment it's on screen. Every node, edge and protocol name here
 * matches the real integration documented in the architecture diagram
 * (Connect MCP / Connect Agent, DX API v2 OAuth client-credentials, the
 * extraction/screening agents) — nothing here is invented for effect.
 */

export type NodeId =
  | "customer"
  | "appUi"
  | "pegaCase"
  | "extractionAgent"
  | "screeningAgent"
  | "mcpServer"
  | "agentServer";

export interface DiagramNode {
  id: NodeId;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  zone: "app" | "pega" | "customer";
}

export const NODES: readonly DiagramNode[] = [
  { id: "customer", label: "Customer", sublabel: "browser", x: 50, y: 6, zone: "customer" },
  { id: "appUi", label: "Onboarding UI", sublabel: "This app · Next.js", x: 22, y: 26, zone: "app" },
  { id: "pegaCase", label: "Pega Case", sublabel: "CustomerOnboardingUnified", x: 78, y: 26, zone: "pega" },
  { id: "extractionAgent", label: "Document Extraction Agent", sublabel: "GenAI, reads uploads", x: 78, y: 52, zone: "pega" },
  { id: "screeningAgent", label: "Screening / Risk Agent", sublabel: "sanctions, PEP, fraud", x: 78, y: 78, zone: "pega" },
  { id: "mcpServer", label: "MCP server", sublabel: "This app · /api/mcp", x: 22, y: 52, zone: "app" },
  { id: "agentServer", label: "Agent server", sublabel: "This app · /api/agent", x: 22, y: 78, zone: "app" },
];

export type ProtocolKind = "https" | "rest" | "internal" | "mcp" | "a2a";

export const PROTOCOL_LABEL: Record<ProtocolKind, string> = {
  https: "HTTPS",
  rest: "REST · DX API v2 · OAuth2 client-credentials",
  internal: "Pega case orchestration",
  mcp: "MCP · JSON-RPC 2.0 · OAuth bearer",
  a2a: "A2A · message/send · OAuth bearer",
};

export interface DiagramStep {
  id: string;
  title: string;
  caption: string;
  from: NodeId;
  to: NodeId;
  protocol: ProtocolKind;
  /** Which side actually initiates this hop — drives the arrowhead/pulse direction. */
  direction: "forward" | "reverse";
}

export const STEPS: readonly DiagramStep[] = [
  {
    id: "submit",
    title: "1. Customer submits the application",
    caption:
      "The customer uploads documents and submits through this app's onboarding UI — nothing about the case exists in Pega yet.",
    from: "customer",
    to: "appUi",
    protocol: "https",
    direction: "forward",
  },
  {
    id: "create-case",
    title: "2. This app creates the case in Pega",
    caption:
      "The app calls Pega's DX API v2 directly — POST /cases, then PATCH on each flow action — authenticated with OAuth2 client-credentials Pega itself issued. Pega owns everything from here: stage progression, which agent runs when, and what the case can resolve as.",
    from: "appUi",
    to: "pegaCase",
    protocol: "rest",
    direction: "forward",
  },
  {
    id: "invoke-extraction",
    title: "3. Pega's case flow hands off to the Document Extraction Agent",
    caption:
      "At the Verify Identity stage, the case flow invokes the Document Extraction Agent, which reads the uploaded files directly.",
    from: "pegaCase",
    to: "extractionAgent",
    protocol: "internal",
    direction: "forward",
  },
  {
    id: "extraction-result",
    title: "4. The agent writes its result back onto the case",
    caption:
      "Extracted fields, confidence scores and any discrepancy found are written back as case data — the same shape a reviewer would expect from a real agent's report, not just a pass/fail flag.",
    from: "extractionAgent",
    to: "pegaCase",
    protocol: "internal",
    direction: "reverse",
  },
  {
    id: "invoke-screening",
    title: "5. Pega's case flow hands off to the Screening / Risk Agent",
    caption:
      "At the Perform Screening stage, the case flow invokes the Screening/Risk Agent to run sanctions, PEP, duplicate-customer and fraud checks.",
    from: "pegaCase",
    to: "screeningAgent",
    protocol: "internal",
    direction: "forward",
  },
  {
    id: "screening-result",
    title: "6. The agent writes its result back, and the case resolves",
    caption:
      "Screening outcomes are written back the same way, and the case resolves on what both agents actually found — deterministic once written, and auditable.",
    from: "screeningAgent",
    to: "pegaCase",
    protocol: "internal",
    direction: "reverse",
  },
  {
    id: "connect-mcp",
    title: "7. Separately — Pega's Connect MCP rule calls this app's tool server",
    caption:
      "Independent of any one case: a Connect MCP rule in Pega can call this app's MCP server for the same tool services Pega already had (extraction, screening, fulfilment), now over a standard protocol instead of a bespoke REST contract.",
    from: "pegaCase",
    to: "mcpServer",
    protocol: "mcp",
    direction: "forward",
  },
  {
    id: "connect-agent",
    title: "8. Separately — Pega's Connect Agent rule calls this app's assistant",
    caption:
      "A Connect Agent rule can call this app's A2A endpoint, fronting the same grounded assistant the website's own chat widget uses — answers scoped to the industry pack's own data, never a free-standing model guess.",
    from: "pegaCase",
    to: "agentServer",
    protocol: "a2a",
    direction: "forward",
  },
];
