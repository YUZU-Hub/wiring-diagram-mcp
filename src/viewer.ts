/**
 * The MCP Apps (`io.modelcontextprotocol/ui`, spec 2026-01-26) view of
 * `generate_wiring_diagram`: hosts that support MCP Apps (Claude, ChatGPT, VS
 * Code, ...) render the diagram as an interactive viewer in the chat; other
 * hosts ignore the tool's `_meta.ui` and show its PNG and text.
 *
 * The HTML is built from viewer/ by `npm run build:viewer` into
 * dist/viewer.html, which ships in the npm package and the Docker image.
 */

import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { BomResult } from './catalog.js';
import { pageUrl, VOLTPLAN_API_URL } from './catalog.js';
import { VIEWER_META_KEY, type BomViewerData, type DiagramViewerData } from './viewerData.js';

/** Hosts cache the resource by URI: bump the version on breaking HTML changes. */
export const VIEWER_URI = 'ui://wiring-diagram/diagram-viewer-v1.html';

// src/ under tsx, dist/ when compiled: both sit next to dist/.
const VIEWER_FILE = new URL('../dist/viewer.html', import.meta.url);

let html: string | undefined;

function viewerHtml(): string {
  if (html === undefined) {
    try {
      html = readFileSync(VIEWER_FILE, 'utf8');
    } catch {
      throw new Error(`${VIEWER_FILE.pathname} is missing; run \`npm run build:viewer\`.`);
    }
  }
  return html;
}

export function registerViewer(server: McpServer): void {
  registerAppResource(
    server,
    'Wiring diagram viewer',
    VIEWER_URI,
    {
      description: 'Interactive VoltPlan wiring diagram: zoom, pan, open in the editor, shopping list.',
      mimeType: RESOURCE_MIME_TYPE,
    },
    async () => ({
      contents: [
        {
          uri: VIEWER_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: viewerHtml(),
          _meta: {
            ui: {
              // The diagram SVG references its component icons on VoltPlan; nothing else is loaded.
              csp: { resourceDomains: [new URL(VOLTPLAN_API_URL).origin] },
              prefersBorder: false,
            },
          },
        },
      ],
    })
  );
}

export function diagramViewerMeta(data: Omit<DiagramViewerData, 'kind'>): Record<string, unknown> {
  return { [VIEWER_META_KEY]: { kind: 'diagram', ...data } satisfies DiagramViewerData };
}

/** The list for the viewer: from /mcp-clean without buy links and product pages, else product pages utm-tagged like the text output. */
export function bomViewerMeta(bom: BomResult, clean: boolean): Record<string, unknown> {
  const sections = bom.sections.map((section) => ({
    ...section,
    items: section.items.map(({ product, links, ...item }) => ({
      ...item,
      ...(product ? { product: clean ? { ...product, url: '' } : { ...product, url: pageUrl(product.url) } } : {}),
      links: clean ? [] : links,
    })),
  }));
  const notes = clean ? bom.notes?.filter((note) => !/https?:\/\//i.test(note)) : bom.notes;
  const data: BomViewerData = { kind: 'bom', bom: { ...bom, sections, ...(notes ? { notes } : {}) } };
  return { [VIEWER_META_KEY]: data };
}
