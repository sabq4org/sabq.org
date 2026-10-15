import { Node, mergeAttributes } from "@tiptap/core";
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from "@shared/whatsappCta";

export interface WhatsAppCtaOptions {
  HTMLAttributes: Record<string, unknown>;
}

export type WhatsAppCtaInsertOptions = {
  phone: string;
  phrase: string;
  message?: string;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    whatsappCta: {
      /** إدراج عند موضع المؤشر */
      setWhatsAppCta: (options: WhatsAppCtaInsertOptions) => ReturnType;
      /** يحذف أي زر واتساب سابق ويضعه في نهاية النص داخل المحرر */
      setWhatsAppCtaAtEnd: (options: WhatsAppCtaInsertOptions) => ReturnType;
      /** يحذف كل كتل واتساب من المحتوى */
      clearWhatsAppCta: () => ReturnType;
    };
  }
}

function buildAttrs(options: WhatsAppCtaInsertOptions) {
  const digits = normalizeWhatsAppPhone(options.phone);
  if (!digits) return null;
  const phrase = (options.phrase || "تواصل عبر واتساب").trim().slice(0, 120);
  if (!phrase) return null;
  const message = options.message?.trim().slice(0, 500) || undefined;
  return {
    phone: digits,
    phrase,
    message: message ?? null,
  };
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
          const attrs = buildAttrs(options);
          if (!attrs) return false;
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },

      setWhatsAppCtaAtEnd:
        (options) =>
        ({ state, tr, dispatch }) => {
          const attrs = buildAttrs(options);
          if (!attrs) return false;
          const type = state.schema.nodes[this.name];
          if (!type) return false;

          const ranges: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === this.name) {
              ranges.push({ from: pos, to: pos + node.nodeSize });
            }
          });
          for (let i = ranges.length - 1; i >= 0; i--) {
            tr.delete(ranges[i].from, ranges[i].to);
          }

          const node = type.create(attrs);
          const end = tr.doc.content.size;
          tr.insert(end, node);
          if (dispatch) dispatch(tr.scrollIntoView());
          return true;
        },

      clearWhatsAppCta:
        () =>
        ({ state, tr, dispatch }) => {
          const ranges: Array<{ from: number; to: number }> = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === this.name) {
              ranges.push({ from: pos, to: pos + node.nodeSize });
            }
          });
          if (ranges.length === 0) return true;
          for (let i = ranges.length - 1; i >= 0; i--) {
            tr.delete(ranges[i].from, ranges[i].to);
          }
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});
