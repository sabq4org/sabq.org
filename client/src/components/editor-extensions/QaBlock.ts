import { Node, mergeAttributes } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    qaBlock: {
      /** إدراج بلوك سؤال/جواب بعد الكتلة الحالية مع وضع المؤشر داخل السؤال */
      insertQaBlock: () => ReturnType;
    };
  }
}

/**
 * بلوك «سؤال وجواب» للحوارات الصحفية.
 *
 * البنية المخزّنة (classes فقط — نسخة SSR تحذف style وdata-attributes):
 * <div class="qa-block">
 *   <div class="qa-q"><span class="qa-mark">س</span><div class="qa-q-text">…</div></div>
 *   <div class="qa-a"><p>…</p></div>
 * </div>
 */
export const QaQuestion = Node.create({
  name: "qaQuestion",
  content: "inline*",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div.qa-q", contentElement: ".qa-q-text" }];
  },

  renderHTML() {
    return [
      "div",
      { class: "qa-q" },
      ["span", { class: "qa-mark", "aria-hidden": "true" }, "س"],
      ["div", { class: "qa-q-text" }, 0],
    ];
  },
});

export const QaAnswer = Node.create({
  name: "qaAnswer",
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div.qa-a" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "qa-a" }), 0];
  },
});

export const QaBlock = Node.create({
  name: "qaBlock",
  group: "block",
  content: "qaQuestion qaAnswer",
  defining: true,
  isolating: true,
  // أولوية أعلى من StarterKit حتى تُنفَّذ اختصارات Enter/Backspace هنا قبل splitBlock
  priority: 1000,

  parseHTML() {
    return [{ tag: "div.qa-block" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "qa-block" }), 0];
  },

  addCommands() {
    return {
      insertQaBlock:
        () =>
        ({ state, chain }) => {
          const { $to } = state.selection;
          const pos = $to.depth > 0 ? $to.after(1) : state.selection.to;
          return chain()
            .insertContentAt(pos, {
              type: this.name,
              content: [
                { type: "qaQuestion" },
                { type: "qaAnswer", content: [{ type: "paragraph" }] },
              ],
            })
            // pos+2 = داخل نص السؤال مباشرة
            .setTextSelection(pos + 2)
            .focus()
            .run();
        },
    };
  },

  addKeyboardShortcuts() {
    const findDepth = (name: string): number => {
      const { $from } = this.editor.state.selection;
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === name) return d;
      }
      return 0;
    };

    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;

        // داخل السؤال → انتقل إلى أول فقرة في الجواب
        const qDepth = findDepth(QaQuestion.name);
        if (qDepth) {
          const target = $from.after(qDepth) + 2;
          return this.editor.chain().focus().setTextSelection(target).run();
        }

        // فقرة فارغة أخيرة داخل الجواب → احذفها واخرج بفقرة جديدة بعد البلوك
        const aDepth = findDepth(QaAnswer.name);
        if (aDepth && empty) {
          const answer = $from.node(aDepth);
          const isLastPara = $from.index(aDepth) === answer.childCount - 1;
          const paraEmpty =
            $from.parent.type.name === "paragraph" && $from.parent.content.size === 0;
          if (isLastPara && paraEmpty && answer.childCount > 1) {
            const paraSize = $from.parent.nodeSize;
            return this.editor.commands.command(({ tr, state: s, dispatch }) => {
              const paraFrom = $from.before($from.depth);
              tr.delete(paraFrom, paraFrom + paraSize);
              const insertAt = $from.after(aDepth - 1) - paraSize;
              tr.insert(insertAt, s.schema.nodes.paragraph.create());
              if (dispatch) {
                tr.setSelection(TextSelection.create(tr.doc, insertAt + 1));
                dispatch(tr.scrollIntoView());
              }
              return true;
            });
          }
        }

        return false;
      },

      // Backspace في بداية سؤال والبلوك كله فارغ → احذف البلوك بالكامل
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection;
        if (!empty || $from.parentOffset !== 0) return false;
        const qDepth = findDepth(QaQuestion.name);
        if (!qDepth) return false;
        const block = $from.node(qDepth - 1);
        if (block.type.name !== this.name) return false;
        if (block.textContent.trim().length > 0) return false;
        const from = $from.before(qDepth - 1);
        return this.editor
          .chain()
          .deleteRange({ from, to: from + block.nodeSize })
          .focus()
          .run();
      },
    };
  },
});

export const qaExtensions = [QaBlock, QaQuestion, QaAnswer];
