// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  attachmentFieldsFrom,
  documentSlotPageInstructions,
  PEGA_EVIDENCE_FIELDS,
  resolvePegaAttachmentField,
} from "@/lib/pega/adapter";

/**
 * Different steps of the same case type write their attachments to different
 * properties, and a business banking step writes several documents to
 * several properties at once. Citing the wrong one is rejected as "invalid
 * attachment details", which reads like a malformed file rather than a wrong
 * field name — so the names are read from the action and pinned here.
 */

/** The shape Pega returns for one or more attachment controls, trimmed to essentials. */
function viewWithAttachments(markers: string[]) {
  return {
    resources: {
      views: {
        UploadDocument: [
          {
            children: markers.map((marker) => ({
              config: {
                allowMultiple: "true",
                label: "@FL .Ignored",
                value: marker,
              },
              type: "Attachment",
            })),
          },
        ],
      },
    },
  };
}

describe("attachment field discovery", () => {
  it("reads a single-attachment property", () => {
    expect(attachmentFieldsFrom(viewWithAttachments(["@ATTACHMENT .AttachDoc"]))).toEqual([
      "AttachDoc",
    ]);
  });

  it("strips the leading dot Pega rejects on submit", () => {
    const [field] = attachmentFieldsFrom(viewWithAttachments(["@ATTACHMENT .AttachDoc"]));

    expect(field.startsWith(".")).toBe(false);
  });

  it("reads every attachment property a step exposes, in order", () => {
    // A business banking step exposes one property per document rather than
    // one shared property, and the path includes a page-list index and a
    // nested property — both of which a naive identifier-only match would
    // truncate at the first non-identifier character.
    const markers = [
      "@ATTACHMENT .Document(1).DocumentFile",
      "@ATTACHMENT .Document(2).DocumentFile",
      "@ATTACHMENT .Document(3).DocumentFile",
    ];

    expect(attachmentFieldsFrom(viewWithAttachments(markers))).toEqual([
      "Document(1).DocumentFile",
      "Document(2).DocumentFile",
      "Document(3).DocumentFile",
    ]);
  });

  it("does not list the same attachment property twice", () => {
    expect(
      attachmentFieldsFrom(
        viewWithAttachments([
          "@ATTACHMENT .Document(1).DocumentFile",
          "@ATTACHMENT .Document(1).DocumentFile",
        ]),
      ),
    ).toEqual(["Document(1).DocumentFile"]);
  });

  it("reads Document page-list values that omit the @ATTACHMENT marker", () => {
    expect(
      attachmentFieldsFrom(
        viewWithAttachments([
          ".Document(1).DocumentFile",
          ".Document(5).DocumentFile",
        ]),
      ),
    ).toEqual(["Document(1).DocumentFile", "Document(5).DocumentFile"]);
  });

  it("reads named evidence attachment fields", () => {
    expect(
      attachmentFieldsFrom(
        viewWithAttachments([
          "@ATTACHMENT .CertificationOfIncorporation",
          "@ATTACHMENT .AuthorisedSignatoryIdentity",
          "@ATTACHMENT .BoardResolution",
          "@ATTACHMENT .TaxRegistrationCertificate",
          "@ATTACHMENT .BusinessAddressProof",
        ]),
      ),
    ).toEqual([
      "CertificationOfIncorporation",
      "AuthorisedSignatoryIdentity",
      "BoardResolution",
      "TaxRegistrationCertificate",
      "BusinessAddressProof",
    ]);
  });

  it("returns an empty list when the action takes no attachment", () => {
    expect(attachmentFieldsFrom({ resources: { fields: { Name: [] } } })).toEqual([]);
    expect(attachmentFieldsFrom(undefined)).toEqual([]);
    expect(attachmentFieldsFrom({})).toEqual([]);
  });
});

describe("resolvePegaAttachmentField", () => {
  const liveView = [
    "CertificationOfIncorporation",
    "AuthorisedSignatoryIdentity",
    "TaxRegistrationCertificate",
    "BusinessAddressProof",
  ];

  it("maps each pack document code onto a field that is on the view", () => {
    expect(
      resolvePegaAttachmentField("INCORPORATION_CERTIFICATE", liveView),
    ).toBe("CertificationOfIncorporation");
    expect(resolvePegaAttachmentField("REPRESENTATIVE_ID", liveView)).toBe(
      "AuthorisedSignatoryIdentity",
    );
    expect(resolvePegaAttachmentField("TAX_REGISTRATION", liveView)).toBe(
      "TaxRegistrationCertificate",
    );
    expect(resolvePegaAttachmentField("ADDRESS_PROOF", liveView)).toBe(
      "BusinessAddressProof",
    );
  });

  it("does not cite BoardResolution when CollectAddress does not expose it", () => {
    expect(resolvePegaAttachmentField("AUTHORIZATION_LETTER", liveView)).toBeUndefined();
  });

  it("uses the live view path when the field is nested", () => {
    expect(
      resolvePegaAttachmentField("INCORPORATION_CERTIFICATE", [
        "Document.CertificationOfIncorporation",
      ]),
    ).toBe("Document.CertificationOfIncorporation");
  });
});

describe("documentSlotPageInstructions", () => {
  it("maps each upload onto the named evidence field for its document code", () => {
    expect(
      documentSlotPageInstructions(Object.values(PEGA_EVIDENCE_FIELDS), [
        { attachmentId: "a", documentCode: "INCORPORATION_CERTIFICATE" },
        { attachmentId: "b", documentCode: "REPRESENTATIVE_ID" },
        { attachmentId: "c", documentCode: "AUTHORIZATION_LETTER" },
        { attachmentId: "d", documentCode: "TAX_REGISTRATION" },
        { attachmentId: "e", documentCode: "ADDRESS_PROOF" },
      ]),
    ).toEqual([
      {
        instruction: "REPLACE",
        target: ".CertificationOfIncorporation",
        content: { ID: "a" },
      },
      {
        instruction: "REPLACE",
        target: ".AuthorisedSignatoryIdentity",
        content: { ID: "b" },
      },
      {
        instruction: "REPLACE",
        target: ".BoardResolution",
        content: { ID: "c" },
      },
      {
        instruction: "REPLACE",
        target: ".TaxRegistrationCertificate",
        content: { ID: "d" },
      },
      {
        instruction: "REPLACE",
        target: ".BusinessAddressProof",
        content: { ID: "e" },
      },
    ]);
  });

  it("omits files whose field is not on the view", () => {
    expect(
      documentSlotPageInstructions(
        [
          "CertificationOfIncorporation",
          "AuthorisedSignatoryIdentity",
          "TaxRegistrationCertificate",
          "BusinessAddressProof",
        ],
        [
          { attachmentId: "a", documentCode: "INCORPORATION_CERTIFICATE" },
          { attachmentId: "c", documentCode: "AUTHORIZATION_LETTER" },
          { attachmentId: "e", documentCode: "ADDRESS_PROOF" },
        ],
      ),
    ).toEqual([
      {
        instruction: "REPLACE",
        target: ".CertificationOfIncorporation",
        content: { ID: "a" },
      },
      {
        instruction: "REPLACE",
        target: ".BusinessAddressProof",
        content: { ID: "e" },
      },
    ]);
  });
});
