import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesSource = readFileSync(resolve("server/routes.ts"), "utf8");
const whatsappAgentSource = readFileSync(resolve("server/routes/whatsappAgent.ts"), "utf8");
const whatsappServiceSource = readFileSync(resolve("server/services/whatsapp.ts"), "utf8");
const twilioSource = readFileSync(resolve("server/twilio.ts"), "utf8");

describe("production log privacy", () => {
  it("does not log authentication identities or RBAC snapshots", () => {
    expect(routesSource).not.toContain("[ADMIN USERS API]");
    expect(routesSource).not.toContain("[ARTICLES DEBUG]");
    expect(routesSource).not.toContain("Login attempt for:");
    expect(routesSource).not.toContain("purged all content cache");
  });

  it("does not log WhatsApp webhook payloads, tokens, recipients, or provider IDs", () => {
    const forbiddenSnippets = [
      "COMPLETE req.body",
      "Token extracted: ${token}",
      "Expected: ${whatsappToken.phoneNumber}",
      "Cleaned text: \"${cleanText}\"",
      "${dedupKey.substring",
      "Downloading media ${i + 1}/${numMedia}: ${mediaUrl}",
      "uploaded to: ${gcsPath}",
      "Message ${MessageSid}",
      "Error Message: ${ErrorMessage",
      "Message: ${message.substring",
    ];

    for (const snippet of forbiddenSnippets) {
      expect(whatsappAgentSource, snippet).not.toContain(snippet);
    }
  });

  it("keeps WhatsApp and SMS provider logs metadata-only", () => {
    const forbiddenWhatsAppSnippets = [
      "Body preview:",
      "accountSidPrefix",
      "fullNumber:",
      "message.errorMessage",
      "error.moreInfo",
      "- SID: ${result.sid}",
      "- To: whatsapp:${toNumber}",
      "- From: whatsapp:${whatsappNumber}",
    ];

    for (const snippet of forbiddenWhatsAppSnippets) {
      expect(whatsappServiceSource, snippet).not.toContain(snippet);
    }

    expect(twilioSource).not.toContain("message: error.message");
    expect(twilioSource).not.toContain("moreInfo: error.moreInfo");
    expect(twilioSource).not.toContain("verification.sid");
  });
});
