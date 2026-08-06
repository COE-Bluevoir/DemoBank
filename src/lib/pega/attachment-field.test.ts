// @vitest-environment node
import { describe, expect, it } from "vitest";

import { attachmentFieldFrom } from "@/lib/pega/adapter";

/**
 * The identity and address steps of the same case type write their attachment
 * to different properties. Citing the wrong one is rejected as "invalid
 * attachment details", which reads like a malformed file rather than a wrong
 * field name — so the name is read from the action and pinned here.
 */

/** The shape Pega returns for an attachment control, trimmed to essentials. */
function viewWithAttachment(marker: string) {
  return {
    resources: {
      views: {
        UploadDocument: [
          {
            children: [
              {
                config: {
                  allowMultiple: "true",
                  label: "@FL .Ignored",
                  value: marker,
                },
                type: "Attachment",
              },
            ],
          },
        ],
      },
    },
  };
}

describe("attachment field discovery", () => {
  it("reads the identity step's list property", () => {
    expect(attachmentFieldFrom(viewWithAttachment("@ATTACHMENT .UploadDocs"))).toBe(
      "UploadDocs",
    );
  });

  it("reads the address step's single-attachment property", () => {
    expect(attachmentFieldFrom(viewWithAttachment("@ATTACHMENT .AttachDoc"))).toBe(
      "AttachDoc",
    );
  });

  it("strips the leading dot Pega rejects on submit", () => {
    const field = attachmentFieldFrom(viewWithAttachment("@ATTACHMENT .AttachDoc"));

    expect(field?.startsWith(".")).toBe(false);
  });

  it("returns nothing when the action takes no attachment", () => {
    // Submitting an attachment to an action that does not accept one is worse
    // than submitting none, so absence must be distinguishable.
    expect(attachmentFieldFrom({ resources: { fields: { Name: [] } } })).toBeUndefined();
    expect(attachmentFieldFrom(undefined)).toBeUndefined();
    expect(attachmentFieldFrom({})).toBeUndefined();
  });
});
