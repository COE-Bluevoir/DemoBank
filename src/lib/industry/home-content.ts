import type { IndustryId } from "@/lib/industry/types";

/**
 * Homepage copy for industries other than banking.
 *
 * Banking's front door (`src/app/page.tsx`) is bespoke and stays that way —
 * it's the reference implementation and the one this accelerator actually
 * demos end to end. This content exists so insurance and telecom read as
 * real organisations' sites rather than a bare configuration-demo page,
 * without pretending either journey is meant to be run live.
 */

export type HomeIconKey =
  | "Building2"
  | "ShieldCheck"
  | "Landmark"
  | "PhoneCall"
  | "ClipboardCheck"
  | "FileCheck"
  | "Home"
  | "Wifi"
  | "Router"
  | "Signal";

export interface IndustryHomeAction {
  icon: HomeIconKey;
  label: string;
  detail: string;
  href: string;
}

export interface IndustryHomeContent {
  heroHeadline: string;
  heroSubhead: string;
  heroStats: readonly { value: string; label: string }[];
  quickActions: readonly IndustryHomeAction[];
  signIn: {
    title: string;
    subtitle: string;
    idLabel: string;
    newCustomerLabel: string;
    disclaimer: string;
  };
  trustPoints: readonly {
    icon: HomeIconKey;
    title: string;
    text: string;
  }[];
  productsHeading: string;
  productsSubhead: string;
  ctaHeading: string;
  ctaText: string;
  ctaButtonLabel: string;
}

export const INDUSTRY_HOME_CONTENT: Partial<Record<IndustryId, IndustryHomeContent>> = {
  insurance: {
    heroHeadline: "Cover that's there when you need it most.",
    heroSubhead:
      "Property and business liability insurance — applied for online, with your proposal tracked at every step.",
    heroStats: [
      { value: "1.8M", label: "policies covered" },
      { value: "97%", label: "claims settled" },
      { value: "24/7", label: "claims support" },
    ],
    quickActions: [
      {
        icon: "Building2",
        label: "Get covered",
        detail: "Property & liability",
        href: "/onboarding/start",
      },
      {
        icon: "Home",
        label: "Compare policies",
        detail: "Find the right cover",
        href: "#products",
      },
      {
        icon: "ClipboardCheck",
        label: "File a claim",
        detail: "Submit documents",
        href: "#support",
      },
      {
        icon: "FileCheck",
        label: "Policy documents",
        detail: "View and download",
        href: "#support",
      },
      {
        icon: "ShieldCheck",
        label: "Renewals",
        detail: "Renew a policy",
        href: "#support",
      },
      {
        icon: "PhoneCall",
        label: "Report an incident",
        detail: "24/7 helpline",
        href: "#support",
      },
    ],
    signIn: {
      title: "Log in to manage your policy",
      subtitle: "Access your policies, claims and documents.",
      idLabel: "Policy number",
      newCustomerLabel: "New to Meridian? Get covered",
      disclaimer:
        "Never share your login details. Meridian will never ask for them by phone or email.",
    },
    trustPoints: [
      {
        icon: "ShieldCheck",
        title: "Your claims are protected",
        text: "A regulated insurer with a published claims settlement ratio and clear policy wording.",
      },
      {
        icon: "Landmark",
        title: "Regulated and supervised",
        text: "Licensed to underwrite commercial property risk under the prevailing insurance regulatory framework.",
      },
      {
        icon: "PhoneCall",
        title: "Support when you need it",
        text: "Report a claim 24 hours a day, or track your proposal online without calling at all.",
      },
    ],
    productsHeading: "Business insurance products",
    productsSubhead:
      "The same guided, document-backed proposal opens any of these — pick the one that fits your business.",
    ctaHeading: "Insuring premises for your business?",
    ctaText:
      "Commercial property cover is applied for online with your incorporation and risk documents. Most proposals are completed in one sitting.",
    ctaButtonLabel: "Start a business proposal",
  },
  telecom: {
    heroHeadline: "Connectivity your business can plan around.",
    heroSubhead:
      "Dedicated internet for business sites — ordered online, with provisioning tracked at every step.",
    heroStats: [
      { value: "12K", label: "sites connected" },
      { value: "99.9%", label: "uptime SLA" },
      { value: "24/7", label: "network support" },
    ],
    quickActions: [
      {
        icon: "Wifi",
        label: "Order connectivity",
        detail: "Dedicated internet",
        href: "/onboarding/start",
      },
      {
        icon: "Signal",
        label: "Check serviceability",
        detail: "By site address",
        href: "#products",
      },
      {
        icon: "Router",
        label: "Track an order",
        detail: "Provisioning status",
        href: "#support",
      },
      {
        icon: "FileCheck",
        label: "Manage billing",
        detail: "Invoices & payments",
        href: "#support",
      },
      {
        icon: "Building2",
        label: "Site support",
        detail: "Installation help",
        href: "#support",
      },
      {
        icon: "PhoneCall",
        label: "Report an outage",
        detail: "24/7 network desk",
        href: "#support",
      },
    ],
    signIn: {
      title: "Log in to your account",
      subtitle: "Access your services, billing and support tickets.",
      idLabel: "Account number",
      newCustomerLabel: "New to Vantage? Order connectivity",
      disclaimer:
        "Never share your login details. Vantage Connect will never ask for them by phone or email.",
    },
    trustPoints: [
      {
        icon: "ShieldCheck",
        title: "Your data is protected",
        text: "Business-grade network security and data-handling practices across every connected site.",
      },
      {
        icon: "Landmark",
        title: "Licensed operator",
        text: "Operating under the prevailing telecommunications licensing framework.",
      },
      {
        icon: "PhoneCall",
        title: "Support when you need it",
        text: "Reach network support 24 hours a day, or track your order online without calling at all.",
      },
    ],
    productsHeading: "Business connectivity plans",
    productsSubhead:
      "The same guided, document-backed order opens any of these — pick the tier that fits your site.",
    ctaHeading: "Connecting a new business site?",
    ctaText:
      "Business connectivity is ordered online with your incorporation and site documents. Most orders are completed in one sitting.",
    ctaButtonLabel: "Start a connectivity order",
  },
};
