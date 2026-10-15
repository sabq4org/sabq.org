import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ResizableImageNodeView } from "./ResizableImageNodeView";

export interface ResizableImageOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resizableImage: {
      /**
       * إدراج صورة قابلة للتحجيم وتغيير الموضع والتفاف النص
       */
      setImage: (options: {
        src: string;
        alt?: string;
        title?: string;
        width?: string;
        align?: "right" | "left" | "center";
        caption?: string;
      }) => ReturnType;
      /**
       * تحديث خصائص الصورة المحددة
       */
      updateImageAttributes: (options: {
        width?: string;
        align?: "right" | "left" | "center";
        caption?: string;
        alt?: string;
        title?: string;
      }) => ReturnType;
    };
  }
}

/**
 * امتداد صورة سبق التفاعلي:
 * - تحكّم بابعاد الصورة بالسحب المباشر بالماوس/اللمس (Resize handles)
 * - خيارات المحاذاة مع التفاف النص (Float Right / Float Left / Center)
 * - دعم الأوصاف البديلة (Alt) والتعليقات التوضيحية (Caption)
 * - تخزين متوافق عبر classes و style و data-attributes
 */
export const ResizableImage = Node.create<ResizableImageOptions>({
  name: "image",

  group: "block",

  atom: true,

  draggable: true,

  selectable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src"),
        renderHTML: (attributes) => ({
          src: attributes.src,
        }),
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("alt") || "",
        renderHTML: (attributes) => ({
          alt: attributes.alt || "",
        }),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("title"),
        renderHTML: (attributes) => {
          if (!attributes.title) return {};
          return { title: attributes.title };
        },
      },
      width: {
        default: "100%",
        parseHTML: (element) => {
          return (
            element.getAttribute("data-width") ||
            element.style.width ||
            element.getAttribute("width") ||
            "100%"
          );
        },
        renderHTML: (attributes) => {
          const width = attributes.width || "100%";
          return {
            "data-width": width,
          };
        },
      },
      align: {
        default: "center",
        parseHTML: (element) => {
          const dataAlign = element.getAttribute("data-align");
          if (dataAlign === "right" || dataAlign === "left" || dataAlign === "center") {
            return dataAlign;
          }
          if (
            element.classList.contains("sabq-image--right") ||
            element.style.float === "right" ||
            element.getAttribute("align") === "right"
          ) {
            return "right";
          }
          if (
            element.classList.contains("sabq-image--left") ||
            element.style.float === "left" ||
            element.getAttribute("align") === "left"
          ) {
            return "left";
          }
          if (
            element.classList.contains("sabq-image--center") ||
            element.getAttribute("align") === "center"
          ) {
            return "center";
          }
          return "center";
        },
        renderHTML: (attributes) => {
          const align = attributes.align || "center";
          return {
            "data-align": align,
          };
        },
      },
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-caption") || null,
        renderHTML: (attributes) => {
          if (!attributes.caption) return {};
          return { "data-caption": attributes.caption };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }) {
    const align = node.attrs.align || "center";
    const width = node.attrs.width || "100%";
    const alt = node.attrs.alt || "";
    const title = node.attrs.title || undefined;
    const caption = node.attrs.caption || undefined;

    let alignClass = "sabq-image--center";
    let floatStyle = "";
    let marginStyle = "";

    if (align === "right") {
      alignClass = "sabq-image--right";
      floatStyle = "float: right;";
      marginStyle = "margin: 0.5rem 0 1rem 1.5rem;";
    } else if (align === "left") {
      alignClass = "sabq-image--left";
      floatStyle = "float: left;";
      marginStyle = "margin: 0.5rem 1.5rem 1rem 0;";
    } else {
      alignClass = "sabq-image--center";
      floatStyle = "float: none;";
      marginStyle = "margin: 1.5rem auto;";
    }

    const widthStyle = `width: ${width};`;
    const styleAttr = `${widthStyle} ${floatStyle} ${marginStyle} max-width: 100%; height: auto;`.trim();

    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        src: node.attrs.src,
        alt,
        title,
        "data-align": align,
        "data-width": width,
        "data-caption": caption,
        class: `sabq-article-image ${alignClass}`,
        style: styleAttr,
      }),
    ];
  },

  addCommands() {
    return {
      setImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              src: options.src,
              alt: options.alt || "",
              title: options.title || "",
              width: options.width || "100%",
              align: options.align || "center",
              caption: options.caption || "",
            },
          });
        },
      updateImageAttributes:
        (options) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, options);
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView);
  },
});
