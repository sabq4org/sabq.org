import { describe, expect, it } from "vitest";
import { prepareRegistrationImage, readRegistrationResponse, REGISTRATION_CONNECTION_ERROR } from "../../client/src/pages/opinion-author/registrationUpload";

describe("opinion registration response", () => {
  it("requires a saved application ID before reporting success", async () => {
    await expect(readRegistrationResponse(Response.json({ applicationId: "application-1", message: "تم الاستلام" }, { status: 201 })))
      .resolves.toEqual({ applicationId: "application-1", message: "تم الاستلام" });
  });

  it.each(["<html>Gateway timeout</html>", "", "null", "[]", '{"message":"OK"}', '{"applicationId":12}'])
    ("does not report success for an invalid response: %s", async (body) => {
      await expect(readRegistrationResponse(new Response(body))).rejects.toThrow("تعذر تأكيد استلام الطلب");
    });

  it.each([502, 504, 524])("turns an HTML %s response into Arabic guidance", async (status) => {
    await expect(readRegistrationResponse(new Response("<html>Timed out</html>", { status })))
      .rejects.toThrow(REGISTRATION_CONNECTION_ERROR);
  });

  it("preserves the server's validation message", async () => {
    await expect(readRegistrationResponse(Response.json({ message: "الترخيص المهني مطلوب" }, { status: 400 })))
      .rejects.toThrow("الترخيص المهني مطلوب");
  });

  it.each([[413, "حجم المرفقات كبير"], [429, "تم تجاوز عدد المحاولات"], [403, "تعذر إتمام التحقق"]])
    ("handles a non-JSON %s response", async (status, message) => {
      await expect(readRegistrationResponse(new Response("error", { status: Number(status) })))
        .rejects.toThrow(String(message));
    });
});

describe("registration attachments", () => {
  it("keeps PDF licenses byte-for-byte without browser image APIs", async () => {
    const file = new File([new Uint8Array(500_000)], "license.pdf", { type: "application/pdf" });
    await expect(prepareRegistrationImage(file, 2400)).resolves.toBe(file);
  });

  it("does not recompress small images", async () => {
    const file = new File(["small"], "photo.jpg", { type: "image/jpeg" });
    await expect(prepareRegistrationImage(file, 1200)).resolves.toBe(file);
  });
});
