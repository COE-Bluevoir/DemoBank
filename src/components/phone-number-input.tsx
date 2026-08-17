"use client";

import { useMemo } from "react";

import { SelectInput, TextInput } from "@/components/ui";
import {
  COUNTRY_CALLING_CODES,
  DEFAULT_CALLING_ISO,
} from "@/lib/onboarding/country-calling-codes";
import {
  formatInternationalMobile,
  parseInternationalMobile,
} from "@/lib/onboarding/phone-number";

export function PhoneNumberInput({
  id,
  name,
  value,
  disabled,
  onBlur,
  onChange,
}: {
  id?: string;
  name?: string;
  value: string;
  disabled?: boolean;
  onBlur?: () => void;
  onChange: (value: string) => void;
}) {
  const parsed = parseInternationalMobile(value);
  const selectedIso = COUNTRY_CALLING_CODES.some((entry) => entry.iso === parsed.iso)
    ? parsed.iso
    : DEFAULT_CALLING_ISO;
  const selected =
    COUNTRY_CALLING_CODES.find((entry) => entry.iso === selectedIso) ??
    COUNTRY_CALLING_CODES.find((entry) => entry.iso === DEFAULT_CALLING_ISO)!;

  const options = useMemo(
    () =>
      [...COUNTRY_CALLING_CODES].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [],
  );

  return (
    <div className="flex gap-2">
      <SelectInput
        aria-label="Country calling code"
        className="w-[11.5rem] shrink-0 px-3"
        disabled={disabled}
        value={selected.iso}
        onBlur={onBlur}
        onChange={(event) => {
          const next = COUNTRY_CALLING_CODES.find(
            (entry) => entry.iso === event.target.value,
          );
          if (!next) {
            return;
          }
          onChange(formatInternationalMobile(next.dial, parsed.national));
        }}
      >
        {options.map((entry) => (
          <option key={entry.iso} value={entry.iso}>
            {entry.name} (+{entry.dial})
          </option>
        ))}
      </SelectInput>
      <TextInput
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-label="Mobile number"
        disabled={disabled}
        value={parsed.national}
        placeholder="Mobile number"
        onBlur={onBlur}
        onChange={(event) => {
          const next = parseInternationalMobile(event.target.value);
          const dial = event.target.value.trim().startsWith("+")
            ? next.dial
            : selected.dial;
          const iso = event.target.value.trim().startsWith("+")
            ? next.iso
            : selected.iso;
          const country = COUNTRY_CALLING_CODES.find((entry) => entry.iso === iso);
          onChange(
            formatInternationalMobile(country?.dial ?? dial, next.national),
          );
        }}
      />
    </div>
  );
}
