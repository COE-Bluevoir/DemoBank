/**
 * Script for the "behind the scenes" system-interaction diagram.
 *
 * A fixed, curated sequence rather than a live replay of a real case's event
 * log — safe to show leadership without depending on a real case (or live
 * Pega) behaving during the moment it's on screen.
 *
 * Protocol placement is deliberate and was corrected once already: Pega's
 * own orchestrator-agent / specialist-agent pattern, its out-of-the-box Data
 * Pages (how the Document Agent reads case attachments) and its REST
 * Connect rules (how the Screening Agent calls its — in this build, mocked
 * — screening tools) are Pega's native platform capability, not something
 * built for this app, and are labelled as such. MCP and A2A are labelled
 * only where this app genuinely built and exposed them: the two inbound
 * integration surfaces Pega's Connect MCP and Connect Agent rules call.
 * Nothing here claims a protocol where one doesn't actually apply — that
 * was the explicit bar this was written to survive.
 */

export type NodeId =
  | "customer"
  | "conversationalAgent"
  | "appAdapter"
  | "pegaCase"
  | "orchestratorAgent"
  | "documentAgent"
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
  { id: "conversationalAgent", label: "Conversational Agent", sublabel: "This app · outside Pega", x: 24, y: 22, zone: "app" },
  { id: "appAdapter", label: "Onboarding Adapter", sublabel: "This app · creates & submits the case", x: 24, y: 40, zone: "app" },
  { id: "mcpServer", label: "MCP server", sublabel: "This app · /api/mcp", x: 24, y: 64, zone: "app" },
  { id: "agentServer", label: "Agent server", sublabel: "This app · /api/agent", x: 24, y: 82, zone: "app" },
  { id: "pegaCase", label: "Pega Case", sublabel: "CustomerOnboardingUnified", x: 76, y: 22, zone: "pega" },
  { id: "orchestratorAgent", label: "Customer Onboarding Agent", sublabel: "Pega's orchestrator", x: 76, y: 40, zone: "pega" },
  { id: "documentAgent", label: "Document Agent", sublabel: "Pega specialist agent", x: 66, y: 64, zone: "pega" },
  { id: "screeningAgent", label: "Screening Agent", sublabel: "Pega specialist agent", x: 86, y: 64, zone: "pega" },
];

export type ProtocolKind = "chat" | "rest" | "delegation" | "dpage" | "connect-rest" | "mcp" | "a2a";

export const PROTOCOL_LABEL: Record<ProtocolKind, string> = {
  chat: "Conversation · this app's UI",
  rest: "REST · DX API v2 · OAuth2 client-credentials",
  delegation: "Pega agent-to-agent orchestration (native)",
  dpage: "Pega out-of-the-box Data Page (native)",
  "connect-rest": "Pega REST Connect rule (mocked screening services)",
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
}

export const STEPS: readonly DiagramStep[] = [
  {
    id: "guide",
    title: "1. The conversational agent guides product selection",
    caption:
      "The customer talks to this app's own conversational agent, which recommends a product and, once accepted, collects their details and documents. Nothing exists in Pega yet.",
    from: "customer",
    to: "conversationalAgent",
    protocol: "chat",
  },
  {
    id: "create-case",
    title: "2. This app creates the case in Pega",
    caption:
      "Once details and documents are ready, this app's onboarding adapter creates and submits the case through Pega's DX API v2 — REST, OAuth2 client-credentials. Creating a system-of-record case is a structured data operation, not an agent decision, so REST is the right protocol here.",
    from: "appAdapter",
    to: "pegaCase",
    protocol: "rest",
  },
  {
    id: "reach-orchestrator",
    title: "3. The case reaches Pega's Customer Onboarding Agent",
    caption:
      "Pega's own orchestrator agent for this journey picks up the case. Its job is pure coordination — decide which specialist agent to invoke next, wait for its result, decide what happens after. It performs no extraction or screening itself. This orchestrator/specialist-agent pattern is Pega's own platform capability, not something built for this app.",
    from: "pegaCase",
    to: "orchestratorAgent",
    protocol: "delegation",
  },
  {
    id: "invoke-document",
    title: "4. Orchestrator delegates to the Document Agent",
    caption:
      "An agent-to-agent hand-off, native to Pega: “extract and validate this application's documents.”",
    from: "orchestratorAgent",
    to: "documentAgent",
    protocol: "delegation",
  },
  {
    id: "document-result",
    title: "5. Document Agent reads the files and reports back",
    caption:
      "The Document Agent reads the case's attached files using Pega's own out-of-the-box Data Pages — native to Pega, not an external call — and returns extracted fields, a confidence score per field, and any discrepancy found back to the orchestrator.",
    from: "documentAgent",
    to: "orchestratorAgent",
    protocol: "dpage",
  },
  {
    id: "invoke-screening",
    title: "6. Orchestrator delegates to the Screening Agent",
    caption:
      "Documents validated — now “run this application's risk and compliance checks.”",
    from: "orchestratorAgent",
    to: "screeningAgent",
    protocol: "delegation",
  },
  {
    id: "screening-result",
    title: "7. Screening Agent runs its checks and reports back",
    caption:
      "Sanctions, PEP and duplicate-customer checks, each called through Pega's standard REST Connect rules — in this build, mocked services standing in for real screening providers — with the result returned to the orchestrator.",
    from: "screeningAgent",
    to: "orchestratorAgent",
    protocol: "connect-rest",
  },
  {
    id: "resolve",
    title: "8. The orchestrator resolves the case",
    caption:
      "With both specialist agents' results in hand, the case is updated and resolves according to Pega's own case rules — that decision belongs to Pega's case logic, not either agent.",
    from: "orchestratorAgent",
    to: "pegaCase",
    protocol: "delegation",
  },
  {
    id: "reflect",
    title: "9. This app reflects the outcome",
    caption:
      "The app polls the case over the same DX API and renders whatever Pega's case now says. It has no independent opinion about the outcome — only the system of record does.",
    from: "pegaCase",
    to: "appAdapter",
    protocol: "rest",
  },
  {
    id: "connect-mcp",
    title: "10. Separately — Pega's Connect MCP rule calls this app's tool server",
    caption:
      "Independent of any one case: a Connect MCP rule in Pega can call this app's MCP server for tool services (extraction, screening, fulfilment) over a standard protocol instead of a bespoke REST contract. This is real, custom-built integration on this app's side.",
    from: "pegaCase",
    to: "mcpServer",
    protocol: "mcp",
  },
  {
    id: "connect-agent",
    title: "11. Separately — Pega's Connect Agent rule calls this app's assistant",
    caption:
      "A Connect Agent rule can call this app's A2A endpoint, fronting the same grounded assistant the website's own chat widget uses — answers scoped to real case/product data, never a free-standing model guess. Also real, custom-built integration on this app's side.",
    from: "pegaCase",
    to: "agentServer",
    protocol: "a2a",
  },
];
