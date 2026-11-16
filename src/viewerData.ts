/**
 * What the diagram viewer (the MCP App UI of `generate_wiring_diagram`, see
 * viewer/) reads from a tool result's `_meta`. `_meta` reaches the view but
 * not the model, so the SVG and the structured shopping list stay out of the
 * model's context; the model gets the same result as text (and the PNG).
 * Shared by the server (src/) and the browser bundle (viewer/).
 */

import type { BomResult } from './catalog.js';

/** Key of the viewer data inside a tool result's `_meta`. */
export const VIEWER_META_KEY = 'voltplan';

export interface DiagramViewerData {
  kind: 'diagram';
  systemName: string;
  /** SVG with icons referenced from voltplan.app; absent when VoltPlan only sent a PNG. */
  svg?: string;
  editorUrl: string;
  /** Served from /mcp-clean: no buy links or product pages in the view. */
  clean: boolean;
}

export interface BomViewerData {
  kind: 'bom';
  /** Without links and product pages when served from /mcp-clean. */
  bom: BomResult;
}

export type ViewerData = DiagramViewerData | BomViewerData;
