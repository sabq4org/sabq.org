import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sabqTable: {
      /** تبديل مظهر الجدول بين «قياسي» و«بطاقة تعريفية» */
      toggleTableCardStyle: () => ReturnType;
    };
  }
}

/**
 * جدول سبق: جدول TipTap القياسي مع class ثابتة (sabq-table) يضبطها CSS الموقع،
 * ومظهر اختياري «بطاقة» (sabq-table--card) لجداول عمودين مثل «المسارات الخمسة».
 * الاعتماد على classes حصراً — نسخة SSR تحذف style وdata-attributes.
 */
export const SabqTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      cardStyle: {
        default: false,
        parseHTML: (element) => element.classList.contains("sabq-table--card"),
        renderHTML: (attributes) => ({
          class: attributes.cardStyle ? "sabq-table sabq-table--card" : "sabq-table",
        }),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      toggleTableCardStyle:
        () =>
        ({ editor, commands }) => {
          if (!editor.isActive("table")) return false;
          const current = editor.getAttributes("table").cardStyle === true;
          return commands.updateAttributes("table", { cardStyle: !current });
        },
    };
  },
});

export const tableExtensions = [
  SabqTable.configure({ resizable: false }),
  TableRow,
  TableHeader,
  TableCell,
];
