import {
  COUNTRY_CALLING_CODES,
  DEFAULT_CALLING_DIAL,
  DEFAULT_CALLING_ISO,
} from "@/lib/onboarding/country-calling-codes";

const DIALS_BY_LENGTH = [...COUNTRY_CALLING_CODES]
  .map((entry) => entry.dial)
  .sort((left, right) => right.length - left.length);

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatInternationalMobile(dial: string, national: string): string {
  const nationalDigits = digitsOnly(national);

  if (!nationalDigits) {
    return `+${dial}`;
  }

  return `+${dial} ${nationalDigits}`;
}

export function parseInternationalMobile(value: string): {
  iso: string;
  dial: string;
  national: string;
} {
  const trimmed = value.trim();
  const digits = digitsOnly(trimmed);

  if (trimmed.startsWith("+") || trimmed.startsWith("00")) {
    const matched = DIALS_BY_LENGTH.find((dial) => digits.startsWith(dial));
    if (matched) {
      const country =
        COUNTRY_CALLING_CODES.find(
          (entry) =>
            entry.dial === matched &&
            (matched !== "1" || entry.iso === "US") &&
            (matched !== "7" || entry.iso === "RU") &&
            (matched !== "44" || entry.iso === "GB"),
        ) ?? COUNTRY_CALLING_CODES.find((entry) => entry.dial === matched);

      return {
        iso: country?.iso ?? DEFAULT_CALLING_ISO,
        dial: matched,
        national: digits.slice(matched.length),
      };
    }
  }

  return {
    iso: DEFAULT_CALLING_ISO,
    dial: DEFAULT_CALLING_DIAL,
    national: digits.replace(/^0+/, ""),
  };
}
