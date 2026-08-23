import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface CollapsibleHeadingsOptions {
  levels: number[];
}

export const CollapsibleHeadingsKey = new PluginKey('collapsibleHeadings');

interface CollapsiblePluginState {
  collapsedMap: Record<string, boolean>; // heading anchor key -> boolean
}

function getHeadingKey(doc: any, pos: number, node: any): string {
  const text = node.textContent.trim().slice(0, 40);
  return `${node.attrs.level}_${text}_${pos}`;
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
            return { collapsedMap: {} };
          },
          apply(tr, prevState) {
            const meta = tr.getMeta(CollapsibleHeadingsKey);
            if (meta && typeof meta === 'object' && meta.toggleKey) {
              const current = !!prevState.collapsedMap[meta.toggleKey];
              return {
                collapsedMap: {
                  ...prevState.collapsedMap,
                  [meta.toggleKey]: !current
                }
              };
            }
            if (tr.docChanged) {
              return prevState;
            }
            return prevState;
          }
        },
        props: {
          decorations(state) {
            const pluginState = CollapsibleHeadingsKey.getState(state);
            const collapsedMap = pluginState?.collapsedMap || {};
            const decorations: Decoration[] = [];
            const doc = state.doc;

            // Find all headings
            const headings: Array<{ pos: number; end: number; level: number; key: string; isCollapsed: boolean }> = [];
            doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                const level = node.attrs.level || 1;
                const key = getHeadingKey(doc, pos, node);
                headings.push({
                  pos,
                  end: pos + node.nodeSize,
                  level,
                  key,
                  isCollapsed: !!collapsedMap[key]
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
                    const tr = view.state.tr.setMeta(CollapsibleHeadingsKey, { toggleKey: heading.key });
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
                      const tr = view.state.tr.setMeta(CollapsibleHeadingsKey, { toggleKey: heading.key });
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
