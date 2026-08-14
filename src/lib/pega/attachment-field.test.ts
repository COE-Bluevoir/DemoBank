// @vitest-environment node
import { describe, expect, it } from "vitest";

import { attachmentFieldsFrom } from "@/lib/pega/adapter";

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

  it("returns an empty list when the action takes no attachment", () => {
    // Submitting an attachment to an action that does not accept one is worse
    // than submitting none, so absence must be distinguishable.
    expect(attachmentFieldsFrom({ resources: { fields: { Name: [] } } })).toEqual([]);
    expect(attachmentFieldsFrom(undefined)).toEqual([]);
    expect(attachmentFieldsFrom({})).toEqual([]);
  });
});
