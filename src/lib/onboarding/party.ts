/**
 * Who is being onboarded.
 *
 * The accelerator onboards a business: an organisation, plus the person
 * authorised to act for it. Both are needed throughout — screening runs
 * against the representative, entity verification against the organisation,
 * and evidence has to be matched to whichever of the two it describes.
 *
 * A site address is separate from the registered address on purpose. An
 * insurer covers a specific premises and a telecom installs at a specific
 * site, and in the sample evidence those differ from the registered office.
 * Collapsing them would erase the very mismatch the journeys exist to detect.
 */

export type PartyType = "ORGANISATION" | "INDIVIDUAL";

export interface PostalAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  /** Free-text locality hint. Present on Indian evidence, absent elsewhere. */
  landmark?: string;
}

export interface OrganisationView {
  legalName: string;
  /** The name the business trades under, when it differs from the legal name. */
  tradeName?: string;
  /** Corporate identity number, or the local equivalent. */
  registrationNumber: string;
  /** Tax registration — GSTIN in the sample evidence. */
  taxId?: string;
  panNumber?: string;
  incorporationDate?: string;
  registeredAddress: PostalAddress;
}

export interface RepresentativeView {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  mobile: string;
  email: string;
  /** Their role in the organisation, e.g. "Chief Operating Officer". */
  designation: string;
  /** Government identifier from their identity evidence. */
  identificationNumber?: string;
}

/**
 * Everything the customer supplies about themselves.
 *
 * `siteAddress` is where the product or service applies. It is optional
 * because a bank account has no premises, while a policy and a fibre
 * installation both do.
 */
export interface PartyDetails {
  partyType: PartyType;
  organisation: OrganisationView;
  representative: RepresentativeView;
  siteAddress?: PostalAddress;
}

/** Render an address the way the evidence prints it, for comparison. */
export function formatAddress(address: PostalAddress | undefined): string {
  if (!address) {
    return "";
  }

  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ");
}

/**
 * Compare two addresses the way a reviewer would.
 *
 * Evidence never matches an application character for character — case,
 * punctuation and abbreviations differ — so equality is measured on the parts
 * that identify a place. The postal code carries the most signal: two Bengaluru
 * addresses with different postcodes are different premises, however similar
 * the street lines read.
 */
export function addressesAgree(
  submitted: PostalAddress | undefined,
  evidence: PostalAddress | undefined,
): boolean {
  if (!submitted || !evidence) {
    return false;
  }

  const normalise = (value: string | undefined) =>
    (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

  return (
    normalise(submitted.postalCode) === normalise(evidence.postalCode) &&
    normalise(submitted.city) === normalise(evidence.city)
  );
}
