/**
 * Renders a diagram through VoltPlan's `/api/diagram/generate`.
 *
 * PNG requests ask for `?format=json`, which answers the PNG for the model and
 * text-only hosts plus a light SVG for the MCP App viewer (icons referenced
 * from VoltPlan instead of inlined) in one render. A VoltPlan that predates
 * the JSON mode ignores the parameter and answers the PNG alone; the viewer
 * then shows that PNG.
 */

import type { DiagramRequest } from './diagramInput.js';
import { stripEmbeddedImages } from './diagramInput.js';
import { VOLTPLAN_API_URL } from './catalog.js';

export interface RenderedDiagram {
  /** Base64 PNG for the model and hosts without MCP Apps. */
  png?: string;
  /** SVG for the viewer, icons referenced by URL. */
  viewerSvg?: string;
  /** SVG markup without icons, returned as text when the caller asked for SVG. */
  svgText?: string;
}

export async function fetchDiagram(
  request: DiagramRequest,
  format: 'png' | 'svg',
  fetchImpl: typeof fetch = fetch
): Promise<{ result: RenderedDiagram } | { error: string }> {
  const url = `${VOLTPLAN_API_URL}/api/diagram/generate${format === 'png' ? '?format=json' : ''}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: format === 'png' ? 'image/png' : 'image/svg+xml' },
      body: JSON.stringify(request),
    });
  } catch (err) {
    return { error: `Diagram generation failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!response.ok) {
    return { error: `Diagram generation failed (${response.status}): ${await response.text()}` };
  }

  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await response.json()) as { svg?: unknown; png?: unknown };
    return {
      result: {
        ...(typeof body.png === 'string' && body.png ? { png: body.png } : {}),
        ...(typeof body.svg === 'string' && body.svg ? { viewerSvg: body.svg } : {}),
      },
    };
  }
  if (type.includes('image/png')) {
    return { result: { png: Buffer.from(await response.arrayBuffer()).toString('base64') } };
  }
  // SVG requested, or VoltPlan could not rasterize and fell back to SVG.
  return { result: { svgText: stripEmbeddedImages(await response.text()) } };
}
