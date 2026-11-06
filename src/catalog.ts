/**
 * VoltPlan's product catalogue and shopping list (bill of materials), served
 * by `/api/components/match` and `/api/diagram/bom`. Both endpoints take
 * `source=mcp`, which VoltPlan writes into every buy link they return, so
 * those links are passed on unchanged. Product page links come back plain and
 * get the `utm_*` tags here.
 */

import type { DiagramRequest } from './diagramInput.js';
import { LINK_SOURCE, siteUrl } from './links.js';

export const VOLTPLAN_API_URL = process.env.VOLTPLAN_API_URL || 'https://voltplan.app';

const MATCH_TIMEOUT_MS = 5000;
// The shopping list runs the diagram's sizing code on VoltPlan's side.
const BOM_TIMEOUT_MS = 15000;

export const COMPONENT_CATEGORIES = [
  'battery',
  'solar_panel',
  'solar_charge_controller',
  'dc_dc_charger',
  'ac_charger',
  'inverter',
  'power_station',
  'battery_monitor',
  'appliance',
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

export interface ComponentMatchParams {
  category: ComponentCategory;
  systemVoltage?: number;
  powerWatts?: number;
  capacityAh?: number;
  capacityWh?: number;
  pureSine?: boolean;
  query?: string;
  limit?: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  brand?: string;
  displayName?: string;
  url: string;
  buyUrl: string;
  ratedWatts?: number;
  capacityWh?: number;
  capacityAh?: number;
  systemVoltage?: number;
  pureSine?: boolean;
  surgeWatts?: number;
  summary?: string;
  highlights?: { k: string; v: string }[];
  reviewAvg?: number;
  reviewCount?: number;
  priceEur?: number;
}

export interface ComponentMatchResult {
  category: string;
  items: CatalogProduct[];
  totalMatches: number;
  searchQuery: string;
  searchUrl: string;
}

export interface BomLink {
  label: string | null;
  url: string;
}

export interface BomItem {
  id: string;
  name: string;
  spec?: string;
  quantity?: string;
  product?: { id: string; name: string; url: string };
  links: BomLink[];
}

export interface BomSection {
  title: string;
  items: BomItem[];
}

export interface BomResult {
  systemName: string;
  sections: BomSection[];
  notes?: string[];
}

type Outcome<T> = { result: T } | { error: string };

/** `/api/components/match` with the tool's arguments mapped onto its query parameters. */
export function componentMatchUrl(params: ComponentMatchParams): string {
  const url = new URL(`${VOLTPLAN_API_URL}/api/components/match`);
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  };
  set('category', params.category);
  set('voltage', params.systemVoltage);
  set('watts', params.powerWatts);
  set('ah', params.capacityAh);
  set('wh', params.capacityWh);
  if (params.pureSine) set('sine', 1);
  set('q', params.query?.trim());
  set('limit', params.limit);
  set('source', LINK_SOURCE);
  return url.toString();
}

/** The API's `{ error }` message, else the raw body, prefixed with the HTTP status. */
async function apiError(what: string, response: Response): Promise<string> {
  const body = (await response.text().catch(() => '')).trim();
  let message = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed?.error === 'string') message = parsed.error;
  } catch {
    // not JSON; keep the raw text
  }
  return `${what} failed (${response.status})${message ? `: ${message}` : ''}`;
}

function networkError(what: string, err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') return `${what} failed: VoltPlan did not respond in time.`;
  return `${what} failed: ${err instanceof Error ? err.message : String(err)}`;
}

async function requestJson<T>(
  what: string,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  valid: (body: T) => boolean,
): Promise<Outcome<T>> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (err) {
    return { error: networkError(what, err) };
  }
  if (!response.ok) return { error: await apiError(what, response) };
  try {
    const body = (await response.json()) as T;
    if (body && valid(body)) return { result: body };
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return { error: networkError(what, err) };
  }
  return { error: `${what} failed: VoltPlan returned an unexpected response.` };
}

export function fetchComponentMatches(
  params: ComponentMatchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<Outcome<ComponentMatchResult>> {
  return requestJson<ComponentMatchResult>(
    'Catalogue lookup',
    componentMatchUrl(params),
    { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(MATCH_TIMEOUT_MS) },
    fetchImpl,
    (body) => Array.isArray(body.items),
  );
}

export function fetchBom(request: DiagramRequest, fetchImpl: typeof fetch = fetch): Promise<Outcome<BomResult>> {
  return requestJson<BomResult>(
    'Bill of materials',
    `${VOLTPLAN_API_URL}/api/diagram/bom?source=${LINK_SOURCE}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(BOM_TIMEOUT_MS),
    },
    fetchImpl,
    (body) => Array.isArray(body.sections),
  );
}

// ── Formatting ─────────────────────────────────────────────────────────

/** A voltplan.app page from the API, re-pointed with the `utm_*` tags. */
function pageUrl(url: string): string {
  try {
    return siteUrl(new URL(url).pathname);
  } catch {
    return url;
  }
}

const URL_PATTERN = /https?:\/\//i;

function productSpecs(item: CatalogProduct): string {
  return [
    item.systemVoltage !== undefined ? `${item.systemVoltage} V` : '',
    item.capacityAh !== undefined ? `${item.capacityAh} Ah` : '',
    item.capacityWh !== undefined ? `${item.capacityWh} Wh` : '',
    item.ratedWatts !== undefined ? `${item.ratedWatts} W` : '',
    item.surgeWatts !== undefined ? `${item.surgeWatts} W surge` : '',
    item.pureSine === true ? 'pure sine' : item.pureSine === false ? 'not pure sine' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function productLines(item: CatalogProduct, index: number, clean: boolean): string[] {
  const specs = productSpecs(item);
  const highlights = (item.highlights ?? []).map((h) => `${h.k}: ${h.v}`).join(' · ');
  const lines = [`${index + 1}. **${item.displayName || item.name}**`];
  if (specs) lines.push(`   - Specs: ${specs}`);
  if (highlights) lines.push(`   - Highlights: ${highlights}`);
  if (item.summary && !(clean && URL_PATTERN.test(item.summary))) lines.push(`   - ${item.summary}`);
  if (item.reviewCount && item.reviewCount > 0 && item.reviewAvg !== undefined) {
    lines.push(`   - Rating: ${item.reviewAvg}/5 from ${item.reviewCount} review${item.reviewCount === 1 ? '' : 's'}`);
  }
  if (!clean) {
    if (item.priceEur !== undefined) lines.push(`   - Estimated price: about ${item.priceEur} EUR (an estimate; varies by store and country)`);
    lines.push(`   - [Product page](${pageUrl(item.url)}) · [Buy](${item.buyUrl})`);
  }
  return lines;
}

/** Markdown for `find_components`. `clean` leaves out every URL and the price. */
export function formatComponentMatches(result: ComponentMatchResult, { clean }: { clean: boolean }): string {
  const search = `[${result.searchQuery}](${result.searchUrl})`;
  if (result.items.length === 0) {
    return clean
      ? `No catalogue product matched this spec (category: ${result.category}).`
      : `No product in VoltPlan's catalogue matches this spec (category: ${result.category}). Search: ${search}`;
  }

  const lines = [
    `# Catalogue matches: ${result.category}`,
    ``,
    `Showing ${result.items.length} of ${result.totalMatches} matching product${result.totalMatches === 1 ? '' : 's'}, closest rating first. ` +
      `The catalogue is small and curated, so a match can deviate from the requested spec; check the specs below.`,
    ``,
    ...result.items.flatMap((item, i) => productLines(item, i, clean)),
  ];
  if (!clean) lines.push(``, `Not the right fit? Search: ${search}`);
  return lines.join('\n');
}

function bomItemLine(item: BomItem, clean: boolean): string {
  const parts = [`**${item.name}**`, item.spec, item.quantity].filter(Boolean);
  if (item.product) {
    parts.push(clean ? `product: ${item.product.name}` : `product: [${item.product.name}](${pageUrl(item.product.url)})`);
  }
  if (!clean && item.links.length > 0) {
    parts.push(item.links.map((link) => `[${link.label ?? 'Buy'}](${link.url})`).join(' · '));
  }
  return `- ${parts.join(' · ')}`;
}

/**
 * Markdown for `build_bom`. `clean` leaves out every URL (buy links, product
 * pages, the editor link) and the notes that carry one.
 */
export function formatBom(result: BomResult, { clean, editorUrl }: { clean: boolean; editorUrl?: string }): string {
  const lines = [clean ? `# Bill of materials: ${result.systemName}` : `# Shopping list: ${result.systemName}`];
  for (const section of result.sections) {
    if (section.items.length === 0) continue;
    lines.push(``, `## ${section.title}`, ...section.items.map((item) => bomItemLine(item, clean)));
  }
  if (result.sections.every((s) => s.items.length === 0)) {
    lines.push(``, `No parts were computed for this system.`);
  }

  const notes = (result.notes ?? []).filter((note) => !(clean && URL_PATTERN.test(note)));
  if (notes.length > 0) lines.push(``, `## Notes`, ...notes.map((note) => `- ${note}`));

  if (!clean && editorUrl) {
    lines.push(
      ``,
      `Open this system in the VoltPlan editor to keep an editable, saved shopping list: ${editorUrl}`,
    );
  }
  return lines.join('\n');
}
