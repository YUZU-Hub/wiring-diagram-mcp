/**
 * Links from tool output back to voltplan.app.
 *
 * Every link carries an attribution marker so VoltPlan can measure what the
 * MCP server sends its way:
 * - buy links go through `/api/go` with `source=mcp`, which VoltPlan records
 *   as `mcp_affiliate` (direct product page) or `mcp_amazon_search`;
 * - page links carry `utm_source=mcp`, which the cookieless analytics reads.
 *
 * Cable and fuse links point at VoltPlan's curated shopping-list rows
 * (`bom_products`, publicly readable) when one fits, so they can land on a
 * checked product page instead of a search; `/api/go?bom=` then swaps in the
 * visitor's own country.
 */

export const SITE_URL = 'https://voltplan.app';
export const LINK_SOURCE = 'mcp';

const PB_URL = (process.env.VOLTPLAN_PB_URL || 'https://base.voltplan.app').replace(/\/+$/, '');

type Params = Record<string, string | number | undefined>;

function withParams(url: URL, params: Params): string {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** A voltplan.app page, tagged for analytics. */
export function siteUrl(path: string, params: Params = {}): string {
  return withParams(new URL(path, SITE_URL), { ...params, utm_source: LINK_SOURCE, utm_medium: 'ai_assistant' });
}

/** Buy link that resolves to the visitor's own Amazon store via a search. */
export function buySearchUrl(query: string, componentType: string): string {
  return withParams(new URL('/api/go', SITE_URL), { q: query, source: LINK_SOURCE, component_type: componentType });
}

/** Buy link for one curated shopping-list row. */
export function bomBuyUrl(rowId: string): string {
  return withParams(new URL('/api/go', SITE_URL), { bom: rowId, source: LINK_SOURCE });
}

// ── Curated shopping-list rows ─────────────────────────────────────────

export interface BomRow {
  id: string;
  kind: string;
  country: string;
  gauge_mm2?: number;
  amp?: number;
  fuse_type?: string;
  color?: string;
}

export type BomSlot =
  | { kind: 'cable'; gaugeMm2: number; color: 'red' | 'black' }
  | { kind: 'fuse'; amp: number; fuseType: string };

// Blade fuses are curated as one assortment row (amp 0), not per rating.
const ASSORTMENT_FUSE_TYPES: Record<string, true> = { 'Blade (ATC/ATO)': true };

// `universal` rows are amazon.de products; /api/go swaps in the visitor's
// country sibling, so any row of the slot works as the entry point. Prefer the
// broadest one.
const COUNTRY_PREFERENCE = ['universal', 'us', 'uk', 'fr', 'it', 'es', 'au', 'de'];

function countryRank(country: string): number {
  const i = COUNTRY_PREFERENCE.indexOf(country);
  return i === -1 ? COUNTRY_PREFERENCE.length : i;
}

/** The curated row for one slot, or undefined when VoltPlan has none. */
export function pickBomRow(rows: readonly BomRow[], slot: BomSlot): BomRow | undefined {
  const matches = rows.filter((row) => {
    if (row.kind !== slot.kind) return false;
    if (slot.kind === 'cable') return row.gauge_mm2 === slot.gaugeMm2 && (row.color || '') === slot.color;
    if (row.fuse_type !== slot.fuseType) return false;
    return ASSORTMENT_FUSE_TYPES[slot.fuseType] === true || row.amp === slot.amp;
  });
  return matches.sort((a, b) => countryRank(a.country) - countryRank(b.country))[0];
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 2500;

let cache: { rows: BomRow[]; expires: number } | undefined;

/**
 * Active cable and fuse rows, cached per process. A failed fetch yields no
 * rows (the caller falls back to search links) and is retried after a minute.
 */
export async function fetchBomRows(fetchImpl: typeof fetch = fetch): Promise<BomRow[]> {
  if (cache && cache.expires > Date.now()) return cache.rows;
  const url = new URL(`${PB_URL}/api/collections/bom_products/records`);
  url.searchParams.set('perPage', '500');
  url.searchParams.set('fields', 'id,kind,country,gauge_mm2,amp,fuse_type,color');
  url.searchParams.set('filter', "(kind='cable'||kind='fuse')");
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = (await response.json()) as { items?: BomRow[] };
    const rows = Array.isArray(body.items) ? body.items : [];
    cache = { rows, expires: Date.now() + CACHE_TTL_MS };
    return rows;
  } catch {
    cache = { rows: [], expires: Date.now() + FAILURE_TTL_MS };
    return [];
  }
}

export function resetBomCache(): void {
  cache = undefined;
}

// ── Editor deep link ───────────────────────────────────────────────────

export interface PrefillSystem {
  batteries: { name: string; voltage: number; capacityAh: number }[];
  loads: { name: string; power: number; voltage: number }[];
  chargers: { name: string; power: number; sourceType?: string }[];
}

/**
 * `/wireframe/new` with the system's components already placed. The editor
 * reads one component per kind (`battery_*`, `solar_*`, `load_*`; see
 * VoltPlan `src/lib/editorDeepLink.ts`), so the link carries the first
 * battery, the first solar charger and the first load. `placed` lists what the
 * link covers, so the tool output can say what is left to add by hand.
 * `attributed: false` leaves out the `utm_*` analytics parameters.
 */
export function editorPrefillLink(
  system: PrefillSystem,
  attributed = true,
): { url: string; placed: string[]; notPlaced: string[] } {
  const params: Params = {};
  const placed: string[] = [];
  const notPlaced: string[] = [];

  const [battery, ...otherBatteries] = system.batteries;
  if (battery) {
    params.battery_name = battery.name;
    params.battery_ah = battery.capacityAh;
    params.battery_voltage = battery.voltage;
    placed.push(battery.name);
  }
  notPlaced.push(...otherBatteries.map((b) => b.name));

  // The editor's `solar_*` item is a solar panel; the charge controller that
  // the diagram draws behind it is added by hand.
  const solar = system.chargers.find((c) => c.sourceType === 'solar');
  if (solar) {
    const panel = `Solar panel ${solar.power} W`;
    params.solar_name = panel;
    params.solar_watt = solar.power;
    placed.push(panel);
  }
  notPlaced.push(...system.chargers.map((c) => c.name));

  const [load, ...otherLoads] = system.loads;
  if (load) {
    params.load_name = load.name;
    params.load_watt = load.power;
    params.load_voltage = load.voltage;
    placed.push(load.name);
  }
  notPlaced.push(...otherLoads.map((l) => l.name));

  const url = attributed ? siteUrl('/wireframe/new', params) : withParams(new URL('/wireframe/new', SITE_URL), params);
  return { url, placed, notPlaced };
}
