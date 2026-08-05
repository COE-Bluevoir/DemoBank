/**
 * Applicant name handling across the orchestration boundary.
 *
 * The website captures a first and last name separately, because that is what
 * the customer expects to fill in and what downstream systems normally key on.
 * The verified Pega case type stores a single `ApplicantName` string, so the
 * two must be composed on the way out and recovered on the way back.
 */

export interface NameParts {
  firstName: string;
  lastName: string;
}

/** Join the captured parts into the single string Pega stores. */
export function formatFullName(parts: NameParts): string {
  return [parts.firstName, parts.lastName]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

/**
 * Recover first and last name from a single stored string.
 *
 * Pega hands back only `ApplicantName`, so a round trip is inherently lossy:
 * the first whitespace-separated token is treated as the first name and the
 * remainder as the last name. A single-token name yields an empty last name
 * rather than guessing.
 */
export function splitFullName(fullName: string): NameParts {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { firstName: "", lastName: "" };
  }

  const [firstName, ...rest] = tokens;

  return { firstName, lastName: rest.join(" ") };
}
