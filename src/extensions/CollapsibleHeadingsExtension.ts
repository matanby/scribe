import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface CollapsibleHeadingsOptions {
  levels: number[];
}

export const CollapsibleHeadingsKey = new PluginKey('collapsibleHeadings');

interface CollapsiblePluginState {
  // Collapsed headings are tracked by document position, remapped through every
  // transaction. Keying by position *text* (as this once did) meant that typing anywhere
  // above a collapsed heading changed its key and silently expanded the section.
  collapsed: number[];
}

function nextCollapsed(collapsed: number[], pos: number): number[] {
  return collapsed.includes(pos)
    ? collapsed.filter(p => p !== pos)
    : [...collapsed, pos];
}

export const CollapsibleHeadingsExtension = Extension.create<CollapsibleHeadingsOptions>({
  name: 'collapsibleHeadings',

  addOptions() {
    return {
      levels: [1, 2, 3]
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CollapsiblePluginState>({
        key: CollapsibleHeadingsKey,
        state: {
          init() {
            return { collapsed: [] };
          },
          apply(tr, prevState) {
            let collapsed = prevState.collapsed;

            if (tr.docChanged) {
              // Follow the headings as the document shifts around them, and drop any
              // whose heading was deleted.
              collapsed = collapsed
                .map(pos => {
                  const mapped = tr.mapping.mapResult(pos, 1);
                  return mapped.deleted ? -1 : mapped.pos;
                })
                .filter(pos => pos >= 0 && tr.doc.nodeAt(pos)?.type.name === 'heading');
            }

            const meta = tr.getMeta(CollapsibleHeadingsKey);
            if (meta && typeof meta === 'object' && typeof meta.togglePos === 'number') {
              collapsed = nextCollapsed(collapsed, meta.togglePos);
            }

            return collapsed === prevState.collapsed ? prevState : { collapsed };
          }
        },
        props: {
          decorations(state) {
            const pluginState = CollapsibleHeadingsKey.getState(state);
            const collapsed: number[] = pluginState?.collapsed || [];
            const decorations: Decoration[] = [];
            const doc = state.doc;

            // Find all headings
            const headings: Array<{ pos: number; end: number; level: number; isCollapsed: boolean }> = [];
            doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                headings.push({
                  pos,
                  end: pos + node.nodeSize,
                  level: node.attrs.level || 1,
                  isCollapsed: collapsed.includes(pos)
                });
              }
            });

            // For each heading, add gutter chevron widget and collapse subsequent nodes if collapsed
            headings.forEach((heading, idx) => {
              // 1. Add gutter widget decoration at heading position
              const isCollapsed = heading.isCollapsed;
              const widget = Decoration.widget(
                heading.pos + 1,
                (view) => {
                  const span = document.createElement('span');
                  span.className = `heading-collapse-gutter ${isCollapsed ? 'is-collapsed' : ''}`;
                  span.title = isCollapsed ? 'Expand section' : 'Collapse section';
                  span.contentEditable = 'false';
                  
                  span.innerHTML = `
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="heading-chevron" style="transform: rotate(${isCollapsed ? '-90deg' : '0deg'}); transition: transform 0.15s ease;">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  `;

                  span.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const tr = view.state.tr.setMeta(CollapsibleHeadingsKey, { togglePos: heading.pos });
                    view.dispatch(tr);
                  });

                  return span;
                },
                { side: -1 }
              );
              decorations.push(widget);

              // 2. If collapsed, add collapsed indicator badge widget at end of heading text
              if (isCollapsed) {
                const badgeWidget = Decoration.widget(
                  heading.end - 1,
                  (view) => {
                    const badge = document.createElement('span');
                    badge.className = 'collapsed-indicator-pill';
                    badge.contentEditable = 'false';
                    badge.title = 'Click to expand section';
                    badge.innerHTML = `<span>•••</span>`;
                    badge.addEventListener('mousedown', (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const tr = view.state.tr.setMeta(CollapsibleHeadingsKey, { togglePos: heading.pos });
                      view.dispatch(tr);
                    });
                    return badge;
                  },
                  { side: 1 }
                );
                decorations.push(badgeWidget);

                // 3. Find end pos of this section (until next heading of level <= current heading level)
                let sectionEndPos = doc.content.size;
                for (let j = idx + 1; j < headings.length; j++) {
                  if (headings[j].level <= heading.level) {
                    sectionEndPos = headings[j].pos;
                    break;
                  }
                }

                // Decorate all top-level nodes in [heading.end, sectionEndPos] with hidden class
                let curPos = heading.end;
                while (curPos < sectionEndPos) {
                  const node = doc.nodeAt(curPos);
                  if (!node) break;
                  decorations.push(
                    Decoration.node(curPos, curPos + node.nodeSize, {
                      class: 'collapsed-heading-hidden'
                    })
                  );
                  curPos += node.nodeSize;
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          }
        }
      })
    ];
  }
});
