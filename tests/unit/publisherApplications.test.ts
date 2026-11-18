import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/services/email", () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));

import {
  approvePublisherApplicationSchema,
  publisherApplicationRef,
  publisherApplicationSchema,
  publisherLogoProblem,
} from "@shared/publisherApplications";
import {
  buildAdminNoticeEmail,
  buildApprovedEmail,
  buildReceivedEmail,
  buildRejectedEmail,
} from "../../server/services/publisherApplicationEmails";
import type { PublisherApplication } from "@shared/schema";

const valid = {
  agencyName: "وكالة مدار للإعلام",
  contactPerson: "سارة العتيبي",
  email: " Contact@Madar.example ",
  phoneNumber: "+966 55 123 4567",
  loginFirstName: "سارة",
  loginLastName: "العتيبي",
  loginEmail: "Sara@Madar.example",
  consent: "true",
};

describe("publisherApplicationSchema", () => {
  it("accepts the required fields and normalises emails", () => {
    const r = publisherApplicationSchema.parse(valid);
    expect(r.email).toBe("contact@madar.example");
    expect(r.loginEmail).toBe("sara@madar.example");
    expect(r.agencyNameEn).toBeUndefined();
  });

  it("treats blank optional fields as missing", () => {
    const r = publisherApplicationSchema.parse({ ...valid, taxNumber: "  ", address: "" });
    expect(r.taxNumber).toBeUndefined();
    expect(r.address).toBeUndefined();
  });

  it("requires consent", () => {
    const r = publisherApplicationSchema.safeParse({ ...valid, consent: "false" });
    expect(r.success).toBe(false);
  });

  it("rejects a bad phone and a bad login email", () => {
    expect(publisherApplicationSchema.safeParse({ ...valid, phoneNumber: "abc" }).success).toBe(false);
    expect(publisherApplicationSchema.safeParse({ ...valid, loginEmail: "no-at" }).success).toBe(false);
  });
});

describe("publisherLogoProblem", () => {
  it("requires a logo", () => expect(publisherLogoProblem(null)).toMatch("مطلوب"));
  it("accepts png/jpeg/webp up to 10 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(publisherLogoProblem({ type, size: 10 * 1024 * 1024 })).toBeNull();
    }
  });
  it("rejects other types and bigger files", () => {
    expect(publisherLogoProblem({ type: "image/gif", size: 1000 })).toMatch("JPG");
    expect(publisherLogoProblem({ type: "application/pdf", size: 1000 })).toMatch("JPG");
    expect(publisherLogoProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch("10 ميجا");
  });
});

describe("approvePublisherApplicationSchema", () => {
  it("defaults to active, reviewed publishing, open window", () => {
    expect(approvePublisherApplicationSchema.parse({ publishingEndsAt: "" })).toEqual({ autoPublish: false, isActive: true });
  });
  it("rejects a malformed date", () => {
    expect(approvePublisherApplicationSchema.safeParse({ publishingEndsAt: "18/11/2027" }).success).toBe(false);
  });
});

const app = {
  id: "4f7a91c2-0000-0000-0000-000000000000",
  agencyName: `<script>alert(1)</script> مدار`,
  contactPerson: "سارة & فريقها",
  email: "contact@madar.example",
  phoneNumber: "+966551234567",
  loginFirstName: "سارة",
  loginEmail: "sara@madar.example",
} as PublisherApplication;

describe("publisher application emails", () => {
  it("escapes applicant text in every template", () => {
    for (const mail of [
      buildReceivedEmail(app),
      buildApprovedEmail(app, "abcd-efgh-ijkl"),
      buildRejectedEmail(app, "<b>x</b>"),
      buildAdminNoticeEmail(app),
    ]) {
      expect(mail.html).not.toContain("<script>");
      expect(mail.html).toContain("&lt;script&gt;");
    }
    expect(buildRejectedEmail(app, "<b>x</b>").html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("puts the credentials only in the approval email", () => {
    const approved = buildApprovedEmail(app, "abcd-efgh-ijkl");
    expect(approved.html).toContain("abcd-efgh-ijkl");
    expect(approved.html).toContain("sara@madar.example");
    expect(approved.text).toContain("abcd-efgh-ijkl");
    expect(buildAdminNoticeEmail(app).html).not.toContain("كلمة المرور المؤقتة");
  });

  it("shows the short reference in the receipt", () => {
    expect(publisherApplicationRef(app.id)).toBe("PUB-4F7A");
    expect(buildReceivedEmail(app).html).toContain("PUB-4F7A");
  });
});
