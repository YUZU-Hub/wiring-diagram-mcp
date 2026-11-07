import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  fetchBom,
  fetchComponentMatches,
  formatBom,
  formatComponentMatches,
  type BomResult,
  type ComponentMatchResult,
} from './catalog.js';
import type { DiagramRequest } from './diagramInput.js';

const BUY_URL = 'https://voltplan.app/api/go?c=abc123&source=mcp';
const SEARCH_URL = 'https://voltplan.app/api/go?q=200Ah%20LiFePO4%2012V%20battery&component_type=battery&source=mcp';

const matches: ComponentMatchResult = {
  category: 'battery',
  items: [
    {
      id: 'abc123',
      name: 'Core Mini 12.8V 200Ah LiFePO4 Battery',
      brand: 'Renogy',
      displayName: 'Renogy Core Mini 12.8V 200Ah LiFePO4 Battery',
      url: 'https://voltplan.app/components/renogy-core-mini-200ah',
      buyUrl: BUY_URL,
      capacityAh: 200,
      capacityWh: 2560,
      systemVoltage: 12,
      summary: 'Compact 200 Ah pack.',
      highlights: [{ k: 'Capacity', v: '200 Ah' }],
      reviewAvg: 4.5,
      reviewCount: 2,
      priceEur: 399,
    },
  ],
  totalMatches: 6,
  searchQuery: '200Ah LiFePO4 12V battery',
  searchUrl: SEARCH_URL,
};

const bom: BomResult = {
  systemName: 'Camper Van',
  sections: [
    {
      title: 'Components',
      items: [
        {
          id: 'battery-0',
          name: 'LiFePO4 100Ah',
          spec: '12 V · 100 Ah',
          quantity: '× 2',
          product: { id: 'pq100', name: 'Power Queen 12V 100Ah', url: 'https://voltplan.app/components/power-queen-100ah' },
          links: [{ label: null, url: 'https://voltplan.app/api/go?c=pq100&source=mcp' }],
        },
      ],
    },
    {
      title: 'Materials',
      items: [
        {
          id: 'cable-16',
          name: 'Battery cable',
          spec: '16 mm² (6 AWG)',
          quantity: '2 × 4 m',
          links: [
            { label: 'Red · 4 m', url: 'https://voltplan.app/api/go?bom=red16&source=mcp' },
            { label: 'Black · 4 m', url: 'https://voltplan.app/api/go?bom=black16&source=mcp' },
          ],
        },
      ],
    },
  ],
  notes: ['Cable lengths assume default runs; measure your own.'],
};

const request: DiagramRequest = {
  systemName: 'Camper Van',
  batteries: [{ name: 'LiFePO4 100Ah', voltage: 12.8, capacityAh: 100, energyWh: 1280 }],
  loads: [{ name: 'Fridge', power: 60, voltage: 12.8, current: 4.69 }],
  chargers: [],
};

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })) as unknown as typeof fetch & Mock;

describe('fetchComponentMatches', () => {
  it('maps the tool arguments onto the endpoint query and attributes to mcp', async () => {
    const fetchImpl = jsonFetch(matches);
    await fetchComponentMatches(
      { category: 'inverter', systemVoltage: 24, powerWatts: 2000, pureSine: true, query: ' Victron ', limit: 3 },
      fetchImpl,
    );
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/api/components/match');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      category: 'inverter',
      voltage: '24',
      watts: '2000',
      sine: '1',
      q: 'Victron',
      limit: '3',
      source: 'mcp',
    });
  });

  it('maps battery capacity and leaves out sine when pureSine is not set', async () => {
    const fetchImpl = jsonFetch(matches);
    await fetchComponentMatches({ category: 'battery', capacityAh: 200, capacityWh: 2560 }, fetchImpl);
    const params = new URL(String(fetchImpl.mock.calls[0][0])).searchParams;
    expect(params.get('ah')).toBe('200');
    expect(params.get('wh')).toBe('2560');
    expect(params.has('sine')).toBe(false);
  });

  it('surfaces the HTTP status and the API error message', async () => {
    const outcome = await fetchComponentMatches(
      { category: 'battery' },
      jsonFetch({ error: 'Too many requests. Try again later.' }, 429),
    );
    expect('error' in outcome && outcome.error).toMatch(/429/);
    expect('error' in outcome && outcome.error).toContain('Too many requests. Try again later.');
  });
});

describe('fetchBom', () => {
  it('posts the diagram body with source=mcp', async () => {
    const fetchImpl = jsonFetch(bom);
    const outcome = await fetchBom(request, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/diagram/bom');
    expect(new URL(url).searchParams.get('source')).toBe('mcp');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(request);
    expect(outcome).toEqual({ result: bom });
  });

  it('surfaces the HTTP status and the API error message', async () => {
    const outcome = await fetchBom(request, jsonFetch({ error: 'batteries[0].voltage must be a positive number' }, 400));
    expect('error' in outcome && outcome.error).toMatch(/400/);
    expect('error' in outcome && outcome.error).toContain('batteries[0].voltage must be a positive number');
  });
});

describe('formatComponentMatches', () => {
  it('emits no URLs when clean', () => {
    const text = formatComponentMatches(matches, { clean: true });
    expect(text).toContain('Renogy Core Mini');
    expect(text).not.toContain('http');
  });

  it('keeps buy links verbatim, tags product pages and ends with the search link', () => {
    const text = formatComponentMatches(matches, { clean: false });
    expect(text).toContain(`(${BUY_URL})`);
    const page = text.match(/\[Product page\]\(([^)]+)\)/)?.[1];
    expect(page).toBeDefined();
    const pageUrl = new URL(page!);
    expect(pageUrl.pathname).toBe('/components/renogy-core-mini-200ah');
    expect(pageUrl.searchParams.get('utm_source')).toBe('mcp');
    expect(text.trimEnd().endsWith(`(${SEARCH_URL})`)).toBe(true);
  });

  it('offers the search link when nothing matches', () => {
    const empty = { ...matches, items: [], totalMatches: 0 };
    expect(formatComponentMatches(empty, { clean: false })).toContain(SEARCH_URL);
    expect(formatComponentMatches(empty, { clean: true })).not.toContain('http');
  });
});

describe('formatBom', () => {
  const editorUrl = 'https://voltplan.app/wireframe/new?battery_name=LiFePO4&utm_source=mcp';

  it('emits no URLs when clean', () => {
    const text = formatBom(bom, { clean: true, editorUrl });
    expect(text).toContain('Battery cable');
    expect(text).toContain('Power Queen 12V 100Ah');
    expect(text).not.toContain('http');
  });

  it('keeps buy links verbatim, tags product pages and appends the editor link', () => {
    const text = formatBom(bom, { clean: false, editorUrl });
    expect(text).toContain('[Buy](https://voltplan.app/api/go?c=pq100&source=mcp)');
    expect(text).toContain('[Red · 4 m](https://voltplan.app/api/go?bom=red16&source=mcp)');
    const page = text.match(/\[Power Queen 12V 100Ah\]\(([^)]+)\)/)?.[1];
    expect(new URL(page!).searchParams.get('utm_source')).toBe('mcp');
    expect(text).toContain(editorUrl);
    expect(text).toContain('Cable lengths assume default runs');
  });
});
