import { Table, TableCell, TableHeader, TableRow, TableView } from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sabqTable: {
      /** تبديل مظهر الجدول بين «قياسي» و«بطاقة تعريفية» */
      toggleTableCardStyle: () => ReturnType;
      /** مسح عروض الأعمدة المسحوبة/الملصوقة ليعود الجدول بأعمدة تلقائية تملأ العرض */
      resetTableColumnWidths: () => ReturnType;
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

  /**
   * HTML المحفوظ: أعمدة بعرض محفوظ تُكتب نِسَبًا مئوية (col style="width: 32%")
   * لا بكسلات، ويُحذف عرض الجدول الثابت. هكذا يملأ الجدول عمود الخبر عند
   * القارئ بأي عرض (جوال/مكتب) دون أن يفيض. البكسلات تبقى في colwidth على
   * الخلايا ليقرأها المحرر عند إعادة الفتح (parseColwidth يفضّلها).
   */
  renderHTML(props) {
    const rendered = this.parent?.(props) as unknown as [string, Record<string, unknown>, unknown, unknown] | undefined;
    if (!rendered) return ["table", props.HTMLAttributes, ["tbody", 0]];
    const widths = tableColumnWidths(props.node);
    if (!widths) return rendered as never;
    const total = widths.reduce((sum, w) => sum + w, 0);
    const colgroup = [
      "colgroup",
      {},
      ...widths.map((w) => ["col", { style: `width: ${((w / total) * 100).toFixed(2)}%` }]),
    ];
    const { style: _pixelWidth, ...attrs } = rendered[1] ?? {};
    return [rendered[0], attrs, colgroup, rendered[3]] as never;
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
      resetTableColumnWidths:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth);
            if (node.type.name !== this.name) continue;
            const tableStart = $from.start(depth);
            let changed = false;
            node.descendants((child, pos) => {
              if (child.type.spec.tableRole === "cell" || child.type.spec.tableRole === "header_cell") {
                if (child.attrs.colwidth) {
                  tr.setNodeMarkup(tableStart + pos, undefined, { ...child.attrs, colwidth: null });
                  changed = true;
                }
                return false;
              }
              return true;
            });
            if (changed && dispatch) dispatch(tr);
            return changed;
          }
          return false;
        },
    };
  },
});

/**
 * TableView الأصلي يطبّق السمات مرة واحدة عند الإنشاء فقط، وupdate()
 * تحدّث الأعمدة دون السمات — فتبديل «مظهر بطاقة» كان يُحفظ صحيحًا
 * لكن معاينة المحرر تبقى على المظهر القديم حتى إعادة فتح المقال.
 */
/** عروض أعمدة الجدول بالبكسل من الصف الأول، أو null إن كان أي عمود بلا عرض */
function tableColumnWidths(node: ProseMirrorNode): number[] | null {
  const firstRow = node.firstChild;
  if (!firstRow) return null;
  const widths: number[] = [];
  let complete = true;
  firstRow.forEach((cell) => {
    const span = Number(cell.attrs.colspan) || 1;
    const colwidth = cell.attrs.colwidth as number[] | null;
    for (let i = 0; i < span; i++) {
      const w = colwidth?.[i];
      if (!w || w <= 0) complete = false;
      else widths.push(w);
    }
  });
  return complete && widths.length > 0 ? widths : null;
}

function tableClassName(node: ProseMirrorNode): string {
  return node.attrs.cardStyle === true ? "sabq-table sabq-table--card" : "sabq-table";
}

/**
 * والمُنشئ الأصلي لا يضع class الجدول أصلًا (يمرّر HTMLAttributes الإضافة فقط)،
 * فكان جدول المحرر بلا sabq-table ولا ينطبق عليه CSS الموقع (العرض الكامل،
 * الترويسة، مقبض السحب) — لذلك نضبطها عند الإنشاء وعند كل تحديث.
 */
class SabqTableView extends TableView {
  constructor(...args: ConstructorParameters<typeof TableView>) {
    super(...args);
    this.table.className = tableClassName(args[0]);
  }

  update(node: ProseMirrorNode): boolean {
    const handled = super.update(node);
    if (handled) {
      this.table.className = tableClassName(node);
    }
    return handled;
  }
}

/**
 * resizable: سحب حد العمود في المحرر يحفظ عرضه (colwidth بالبكسل). في العرض
 * يُعامل CSS هذه القيم كنِسَب فقط: الجدول يملأ عرض المحتوى دائمًا
 * (width: 100% !important في index.css) ويتوزع العرض على الأعمدة بنسبها.
 */
export const tableExtensions = [
  SabqTable.configure({ resizable: true, handleWidth: 6, cellMinWidth: 60, View: SabqTableView }),
  TableRow,
  TableHeader,
  TableCell,
];
