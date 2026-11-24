import { InputRule, combineTransactionSteps, getChangedRanges } from '@tiptap/core';
import Code from '@tiptap/extension-code';
import Link from '@tiptap/extension-link';
import Typography from '@tiptap/extension-typography';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Mark, Node as PMNode } from '@tiptap/pm/model';

/** Text typed right after inline code at the end of a line is plain text, not more code. */
export const InlineCode = Code.extend({ inclusive: false });

const URL_TEXT = /^https?:\/\/\S+$/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"’”]+$/;

/**
 * Typing right after a link no longer extends it. A link whose text is its own URL
 * still follows edits to that URL: deleting or typing characters at its end updates
 * the address, so the text and the link can't drift apart.
 */
function urlLinksFollowText(type: any) {
  return new Plugin({
    key: new PluginKey('urlLinksFollowText'),
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some(tr => tr.docChanged) || transactions.some(tr => tr.getMeta('preventAutolink'))) return null;
      const tr = newState.tr;
      const changes = getChangedRanges(combineTransactionSteps(oldState.doc, [...transactions]));
      const seen = new Set<number>();
      changes.forEach(({ newRange }) => {
        newState.doc.nodesBetween(newRange.from, Math.min(newRange.to, newState.doc.content.size), (node, pos) => {
          if (!node.isTextblock) return true;
          if (seen.has(pos)) return false;
          seen.add(pos);
          fixBlock(node, pos + 1);
          return false;
        });
      });

      function fixBlock(block: PMNode, start: number) {
        // Contiguous runs of the same link mark.
        const runs: { from: number; to: number; mark: Mark; text: string }[] = [];
        block.forEach((child, offset) => {
          const mark = child.marks.find(item => item.type === type);
          const last = runs[runs.length - 1];
          if (mark && child.isText && last && last.to === start + offset && last.mark.eq(mark)) { last.to += child.nodeSize; last.text += child.text; }
          else if (mark && child.isText) runs.push({ from: start + offset, to: start + offset + child.nodeSize, mark, text: child.text || '' });
        });
        for (const run of runs) {
          const href = String(run.mark.attrs.href || '');
          if (!URL_TEXT.test(run.text) || !(href === run.text || href.startsWith(run.text) || run.text.startsWith(href))) continue;
          // Pull in characters typed straight after the URL, leaving trailing punctuation out.
          const after = newState.doc.resolve(run.to);
          const next = after.nodeAfter;
          let extra = '';
          if (next?.isText && !next.marks.some(item => item.type === type)) extra = (/^\S+/.exec(next.text || '')?.[0] || '').replace(TRAILING_PUNCTUATION, '');
          const text = run.text + extra;
          if (text === href && !extra) continue;
          tr.removeMark(run.from, run.to + extra.length, type);
          tr.addMark(run.from, run.to + extra.length, type.create({ ...run.mark.attrs, href: text }));
        }
      }

      return tr.docChanged ? tr : null;
    }
  });
}

export const NoteLink = Link.extend({
  inclusive() { return false; },
  addProseMirrorPlugins() {
    return [...(this.parent?.() || []), urlLinksFollowText(this.type)];
  }
});

const HEBREW_BEFORE = /[֐-׿]$/;

/** True when the text before the caret has an unclosed $…$ formula. */
function insideMath(text: string) {
  return ((text.match(/(^|[^\\])\$/g) || []).length % 2) === 1;
}

/**
 * Smart typography that stays out of the way: no ×, « or » substitutions (they mangle
 * sizes, code and operators), nothing inside $math$, and straight quotes after a Hebrew
 * letter, where they are geresh and gershayim (צה"ל, ג'ירפה) rather than quotation marks.
 */
export const SmartTypography = Typography.extend({
  addInputRules() {
    return (this.parent?.() || []).map((rule: InputRule) => {
      const isQuote = /["']/.test(String((rule.find as RegExp).source));
      return new InputRule({
        find: rule.find,
        handler: props => {
          // The text before the character just typed (it is not in the document yet).
          const $end = props.state.doc.resolve(props.range.to);
          const before = $end.parent.textBetween(0, $end.parentOffset, undefined, '￼');
          if (insideMath(before)) return null;
          if (isQuote && HEBREW_BEFORE.test(before)) return null;
          return rule.handler(props);
        }
      });
    });
  }
}).configure({ multiplication: false, laquo: false, raquo: false });
