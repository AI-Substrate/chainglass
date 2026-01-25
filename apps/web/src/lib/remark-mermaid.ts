/**
 * Remark plugin to transform mermaid code blocks
 *
 * This plugin runs BEFORE rehype-shiki, so mermaid blocks are transformed
 * into a div element that Shiki won't process.
 *
 * The div element is then rendered by the MermaidRenderer component
 * via react-markdown's components prop.
 *
 * We use 'div' as the element name with a data-mermaid attribute because:
 * 1. Custom element names might not pass through remark-rehype correctly
 * 2. div is a standard HTML element that react-markdown will render
 * 3. We use data-mermaid-code to pass the diagram code
 */

import type { Code, Root } from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * Remark plugin that transforms ```mermaid code blocks into div elements.
 *
 * This prevents @shikijs/rehype from processing mermaid blocks,
 * allowing them to be handled by MermaidRenderer instead.
 */
export function remarkMermaid() {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code, index, parent) => {
      if (node.lang === 'mermaid' && parent && typeof index === 'number') {
        // Transform to a paragraph containing a div element
        // This structure survives remark-rehype transformation
        const mermaidNode = {
          type: 'paragraph' as const,
          data: {
            hName: 'div',
            hProperties: {
              'data-mermaid': 'true',
              'data-mermaid-code': node.value,
            },
          },
          children: [],
        };

        // Replace the code node with our div node
        (parent.children as unknown[])[index] = mermaidNode;
      }
    });
  };
}
