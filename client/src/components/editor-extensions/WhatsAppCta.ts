import { Node, mergeAttributes } from "@tiptap/core";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "@shared/whatsappCta";

export interface WhatsAppCtaOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    whatsappCta: {
      setWhatsAppCta: (options: {
        phone: string;
        phrase: string;
        message?: string;
      }) => ReturnType;
    };
  }
}

export const WhatsAppCta = Node.create<WhatsAppCtaOptions>({
  name: "whatsappCta",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      phone: { default: null },
      phrase: { default: "تواصل عبر واتساب" },
      message: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-whatsapp-cta]",
        getAttrs: (dom) => {
          if (typeof dom === "string") return {};
          const el = dom as HTMLElement;
          return {
            phone: el.getAttribute("data-phone"),
            phrase: el.getAttribute("data-phrase") || "تواصل عبر واتساب",
            message: el.getAttribute("data-message") || null,
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const phone = String(HTMLAttributes.phone || "");
    const phrase = String(HTMLAttributes.phrase || "تواصل عبر واتساب");
    const message =
      typeof HTMLAttributes.message === "string" && HTMLAttributes.message.trim()
        ? HTMLAttributes.message.trim()
        : undefined;
    const href = buildWhatsAppUrl(phone, message) || "#";
    const digits = normalizeWhatsAppPhone(phone) || phone;

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, {
        "data-whatsapp-cta": "",
        "data-phone": digits,
        "data-phrase": phrase,
        ...(message ? { "data-message": message } : {}),
        class: "whatsapp-cta-card",
      }),
      [
        "a",
        {
          href,
          class: "whatsapp-cta-link",
          target: "_blank",
          rel: "noopener noreferrer",
          "aria-label": phrase,
        },
        ["span", { class: "whatsapp-cta-glyph", "aria-hidden": "true" }],
        ["span", { class: "whatsapp-cta-text" }, phrase],
      ],
    ];
  },

  addCommands() {
    return {
      setWhatsAppCta:
        (options) =>
        ({ commands }) => {
          const digits = normalizeWhatsAppPhone(options.phone);
          if (!digits) return false;
          const phrase = (options.phrase || "تواصل عبر واتساب").trim().slice(0, 120);
          if (!phrase) return false;
          const message = options.message?.trim().slice(0, 500) || undefined;

          return commands.insertContent({
            type: this.name,
            attrs: {
              phone: digits,
              phrase,
              message: message ?? null,
            },
          });
        },
    };
  },
});
