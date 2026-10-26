import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buySearchUrl,
  editorPrefillLink,
  fetchBomRows,
  pickBomRow,
  resetBomCache,
  type BomRow,
} from './links.js';

const rows: BomRow[] = [
  { id: 'cable35us', kind: 'cable', country: 'us', gauge_mm2: 35, color: 'red' },
  { id: 'cable35red', kind: 'cable', country: 'universal', gauge_mm2: 35, color: 'red' },
  { id: 'cable35black', kind: 'cable', country: 'universal', gauge_mm2: 35, color: 'black' },
  { id: 'anl125us', kind: 'fuse', country: 'us', amp: 125, fuse_type: 'ANL' },
  { id: 'anl125', kind: 'fuse', country: 'universal', amp: 125, fuse_type: 'ANL' },
  { id: 'anl150', kind: 'fuse', country: 'universal', amp: 150, fuse_type: 'ANL' },
  { id: 'blade', kind: 'fuse', country: 'universal', amp: 0, fuse_type: 'Blade (ATC/ATO)' },
];

describe('pickBomRow', () => {
  it('prefers the universal row of a slot over a country row', () => {
    expect(pickBomRow(rows, { kind: 'cable', gaugeMm2: 35, color: 'red' })?.id).toBe('cable35red');
    expect(pickBomRow(rows, { kind: 'fuse', amp: 125, fuseType: 'ANL' })?.id).toBe('anl125');
  });

  it('matches cable colour and fuse rating exactly', () => {
    expect(pickBomRow(rows, { kind: 'cable', gaugeMm2: 35, color: 'black' })?.id).toBe('cable35black');
    expect(pickBomRow(rows, { kind: 'cable', gaugeMm2: 50, color: 'red' })).toBeUndefined();
    expect(pickBomRow(rows, { kind: 'fuse', amp: 200, fuseType: 'ANL' })).toBeUndefined();
    expect(pickBomRow(rows, { kind: 'fuse', amp: 150, fuseType: 'Class T' })).toBeUndefined();
  });

  it('maps any blade rating onto the blade assortment row', () => {
    expect(pickBomRow(rows, { kind: 'fuse', amp: 15, fuseType: 'Blade (ATC/ATO)' })?.id).toBe('blade');
  });
});

describe('fetchBomRows', () => {
  afterEach(() => resetBomCache());

  it('returns no rows when VoltPlan is unreachable, so callers fall back to search', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await fetchBomRows(failing as unknown as typeof fetch)).toEqual([]);
  });

  it('caches a successful fetch', async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: rows }) });
    await fetchBomRows(ok as unknown as typeof fetch);
    expect(await fetchBomRows(ok as unknown as typeof fetch)).toHaveLength(rows.length);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});

describe('buy links', () => {
  it('attribute every search link to the MCP surface', () => {
    const url = new URL(buySearchUrl('200W monocrystalline solar panel', 'solar_panel'));
    expect(url.pathname).toBe('/api/go');
    expect(url.searchParams.get('source')).toBe('mcp');
    expect(url.searchParams.get('q')).toBe('200W monocrystalline solar panel');
  });
});

describe('editorPrefillLink', () => {
  it('places the first battery, a panel for the first solar charger and the first load, and names the rest', () => {
    const { url, placed, notPlaced } = editorPrefillLink({
      batteries: [{ name: 'LiFePO4 200Ah', voltage: 12.8, capacityAh: 200 }],
      chargers: [
        { name: 'Shore Charger', power: 500, sourceType: 'shore' },
        { name: 'MPPT 30A', power: 400, sourceType: 'solar' },
      ],
      loads: [
        { name: 'Fridge', power: 60, voltage: 12 },
        { name: 'Lights', power: 20, voltage: 12 },
      ],
    });
    const params = new URL(url).searchParams;
    expect(new URL(url).pathname).toBe('/wireframe/new');
    expect(params.get('battery_name')).toBe('LiFePO4 200Ah');
    expect(params.get('battery_ah')).toBe('200');
    expect(params.get('battery_voltage')).toBe('12.8');
    expect(params.get('solar_name')).toBe('Solar panel 400 W');
    expect(params.get('solar_watt')).toBe('400');
    expect(params.get('load_name')).toBe('Fridge');
    expect(params.get('load_watt')).toBe('60');
    expect(params.get('utm_source')).toBe('mcp');
    expect(placed).toEqual(['LiFePO4 200Ah', 'Solar panel 400 W', 'Fridge']);
    expect(notPlaced).toEqual(['Shore Charger', 'MPPT 30A', 'Lights']);
  });

  it('opens an empty editor when the system has no components', () => {
    const { url, placed } = editorPrefillLink({ batteries: [], chargers: [], loads: [] });
    expect([...new URL(url).searchParams.keys()].filter((k) => !k.startsWith('utm_'))).toEqual([]);
    expect(placed).toEqual([]);
  });
});
