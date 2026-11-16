import { describe, expect, it, vi } from 'vitest';
import { fetchDiagram } from './diagramRender.js';
import type { DiagramRequest } from './diagramInput.js';

const REQUEST: DiagramRequest = {
  systemName: 'Van',
  batteries: [{ name: 'LiFePO4 100Ah', voltage: 12.8, capacityAh: 100, energyWh: 1280 }],
  loads: [{ name: 'Fridge', power: 60, voltage: 12.8, current: 4.69 }],
  chargers: [],
};

const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/><image href="data:image/png;base64,AAAA"/></svg>';

describe('fetchDiagram', () => {
  it('asks for the JSON mode and returns the PNG for the model and the SVG for the viewer', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ svg: '<svg/>', png: 'iVBOR' }));
    const outcome = await fetchDiagram(REQUEST, 'png', fetchImpl as typeof fetch);
    expect(outcome).toEqual({ result: { png: 'iVBOR', viewerSvg: '<svg/>' } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/diagram\/generate\?format=json$/);
    expect((init.headers as Record<string, string>).Accept).toBe('image/png');
  });

  it('keeps the viewer SVG when VoltPlan could not rasterize the PNG', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ svg: '<svg/>', png: null }));
    expect(await fetchDiagram(REQUEST, 'png', fetchImpl as typeof fetch)).toEqual({ result: { viewerSvg: '<svg/>' } });
  });

  it('accepts a bare PNG from a VoltPlan without the JSON mode', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetchImpl = vi.fn(async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }));
    expect(await fetchDiagram(REQUEST, 'png', fetchImpl as typeof fetch)).toEqual({
      result: { png: Buffer.from(bytes).toString('base64') },
    });
  });

  it('returns SVG as text without the inlined icons, also when a PNG request fell back to SVG', async () => {
    const fetchImpl = vi.fn(async () => new Response(ICON_SVG, { headers: { 'content-type': 'image/svg+xml' } }));
    const expected = { result: { svgText: '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>' } };
    expect(await fetchDiagram(REQUEST, 'svg', fetchImpl as typeof fetch)).toEqual(expected);
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain('format=json');
    expect(await fetchDiagram(REQUEST, 'png', fetchImpl as typeof fetch)).toEqual(expected);
  });

  it('reports the HTTP status and body of a failed render', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ error: 'Too many requests. Try again later.' }, { status: 429 }));
    const outcome = await fetchDiagram(REQUEST, 'png', fetchImpl as typeof fetch);
    expect('error' in outcome && outcome.error).toMatch(/\(429\).*Too many requests/);
  });
});
