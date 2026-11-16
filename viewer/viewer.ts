/**
 * MCP App view of `generate_wiring_diagram`: the diagram as a zoomable,
 * pannable SVG in the chat, with buttons to open it in the VoltPlan editor and
 * to load its shopping list (`build_bom`) in place. Hosts without MCP Apps
 * never load this; they show the tool's PNG and text instead.
 */

import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BomResult } from '../src/catalog.js';
import { VIEWER_META_KEY, type ViewerData } from '../src/viewerData.js';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const titleEl = byId('title');
const viewport = byId('viewport');
const stage = byId('stage');
const statusEl = byId('status');
const hintEl = byId('hint');
const zoomInBtn = byId<HTMLButtonElement>('zoom-in');
const zoomOutBtn = byId<HTMLButtonElement>('zoom-out');
const zoomFitBtn = byId<HTMLButtonElement>('zoom-fit');
const fullscreenBtn = byId<HTMLButtonElement>('fullscreen');
const editorBtn = byId<HTMLButtonElement>('editor-btn');
const bomBtn = byId<HTMLButtonElement>('bom-btn');
const linkFallback = byId('link-fallback');
const bomEl = byId('bom');

const app = new App({ name: 'VoltPlan Wiring Diagram', version: '1.0.0' });

// ── Pan and zoom ───────────────────────────────────────────────────────

const MAX_SCALE = 8;
const INLINE_MIN_HEIGHT = 280;
const INLINE_MAX_HEIGHT = 560;

const view = { width: 0, height: 0, scale: 1, x: 0, y: 0, fitScale: 1, userZoomed: false };
let fullscreen = false;

function applyTransform(): void {
  stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
}

/** Inline, the viewport takes the diagram's aspect ratio within bounds; full screen it fills the frame. */
function sizeViewport(): void {
  if (fullscreen || view.width === 0) {
    viewport.style.height = '';
    return;
  }
  const wanted = (viewport.clientWidth * view.height) / view.width;
  viewport.style.height = `${Math.round(Math.min(INLINE_MAX_HEIGHT, Math.max(INLINE_MIN_HEIGHT, wanted)))}px`;
}

function fit(): void {
  if (view.width === 0) return;
  const { clientWidth: vw, clientHeight: vh } = viewport;
  view.fitScale = Math.min(vw / view.width, vh / view.height);
  view.scale = view.fitScale;
  view.x = (vw - view.width * view.scale) / 2;
  view.y = (vh - view.height * view.scale) / 2;
  view.userZoomed = false;
  applyTransform();
}

/** Zoom by `factor`, keeping the viewport point (cx, cy) under the cursor. */
function zoomAt(factor: number, cx: number, cy: number): void {
  const next = Math.min(MAX_SCALE, Math.max(view.fitScale * 0.5, view.scale * factor));
  const ratio = next / view.scale;
  view.x = cx - (cx - view.x) * ratio;
  view.y = cy - (cy - view.y) * ratio;
  view.scale = next;
  view.userZoomed = true;
  applyTransform();
}

const zoomAtCenter = (factor: number) => zoomAt(factor, viewport.clientWidth / 2, viewport.clientHeight / 2);

zoomInBtn.addEventListener('click', () => zoomAtCenter(1.4));
zoomOutBtn.addEventListener('click', () => zoomAtCenter(1 / 1.4));
zoomFitBtn.addEventListener('click', fit);

viewport.addEventListener(
  'wheel',
  (event) => {
    // Inline, a plain wheel scrolls the chat; Ctrl/⌘ (and trackpad pinch, which
    // arrives as Ctrl + wheel) zooms. Full screen there is nothing to scroll.
    if (!fullscreen && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
  },
  { passive: false },
);

viewport.addEventListener('dblclick', (event) => {
  const rect = viewport.getBoundingClientRect();
  zoomAt(2, event.clientX - rect.left, event.clientY - rect.top);
});

// One pointer pans, two pinch-zoom around their midpoint.
const pointers = new Map<number, { x: number; y: number }>();

viewport.addEventListener('pointerdown', (event) => {
  viewport.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewport.classList.add('dragging');
});

viewport.addEventListener('pointermove', (event) => {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const current = { x: event.clientX, y: event.clientY };
  if (pointers.size === 1) {
    view.x += current.x - previous.x;
    view.y += current.y - previous.y;
    view.userZoomed = true;
    applyTransform();
  } else if (pointers.size === 2) {
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(current.x - other.x, current.y - other.y);
      const rect = viewport.getBoundingClientRect();
      if (before > 0) zoomAt(after / before, (current.x + other.x) / 2 - rect.left, (current.y + other.y) / 2 - rect.top);
    }
  }
  pointers.set(event.pointerId, current);
});

const endPointer = (event: PointerEvent) => {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) viewport.classList.remove('dragging');
};
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);

new ResizeObserver(() => {
  sizeViewport();
  if (!view.userZoomed) fit();
}).observe(viewport);

// ── Diagram ────────────────────────────────────────────────────────────

function showStatus(text: string | null): void {
  statusEl.hidden = text === null;
  statusEl.textContent = text ?? '';
}

function setContent(element: Element, width: number, height: number): void {
  stage.replaceChildren(element);
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  view.width = width;
  view.height = height;
  showStatus(null);
  sizeViewport();
  fit();
}

/** The SVG comes from VoltPlan's renderer; drop anything executable before inlining it anyway. */
function sanitize(svg: SVGSVGElement): void {
  svg.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...node.attributes]) {
      const value = attr.value.trim().toLowerCase();
      if (attr.name.toLowerCase().startsWith('on') || value.startsWith('javascript:')) node.removeAttribute(attr.name);
    }
  }
}

function showSvg(markup: string): boolean {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!(svg instanceof SVGSVGElement) || doc.querySelector('parsererror')) return false;
  sanitize(svg);
  const box = svg.viewBox.baseVal;
  const width = box?.width || Number.parseFloat(svg.getAttribute('width') ?? '') || 800;
  const height = box?.height || Number.parseFloat(svg.getAttribute('height') ?? '') || 600;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  setContent(document.importNode(svg, true), width, height);
  return true;
}

function showImage(src: string): void {
  const img = new Image();
  img.alt = 'Wiring diagram';
  img.draggable = false;
  img.onload = () => setContent(img, img.naturalWidth, img.naturalHeight);
  img.onerror = () => showStatus('The diagram image could not be displayed.');
  img.src = src;
}

function viewerData(result: CallToolResult): ViewerData | undefined {
  const data = result._meta?.[VIEWER_META_KEY];
  return data && typeof data === 'object' ? (data as ViewerData) : undefined;
}

const textOf = (result: CallToolResult) =>
  result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

let editorUrl: string | undefined;
let clean = false;

function renderDiagram(result: CallToolResult): void {
  if (result.isError) {
    showStatus(textOf(result) || 'The diagram could not be generated.');
    return;
  }
  const data = viewerData(result);
  if (data?.kind === 'diagram') {
    titleEl.textContent = data.systemName;
    editorUrl = data.editorUrl;
    clean = data.clean;
    editorBtn.hidden = false;
    bomBtn.textContent = clean ? 'Parts list' : 'Shopping list';
    if (data.svg && showSvg(data.svg)) return;
  }
  // Older VoltPlan answers or `format: svg`: fall back to what the model got.
  const image = result.content.find((block) => block.type === 'image');
  if (image?.type === 'image') {
    showImage(`data:${image.mimeType};base64,${image.data}`);
    return;
  }
  const svgText = result.content.find((block) => block.type === 'text' && block.text.trimStart().startsWith('<svg'));
  if (svgText?.type === 'text' && showSvg(svgText.text)) return;
  showStatus('No diagram in this result.');
}

// ── Links ──────────────────────────────────────────────────────────────

/** Opens through the host; when it declines, show the URL so it can be copied. */
async function openExternal(url: string): Promise<void> {
  linkFallback.hidden = true;
  try {
    const { isError } = await app.openLink({ url });
    if (!isError) return;
  } catch {
    // Host without ui/open-link support.
  }
  linkFallback.textContent = `Open this link in your browser: ${url}`;
  linkFallback.hidden = false;
}

editorBtn.addEventListener('click', () => {
  if (editorUrl) void openExternal(editorUrl);
});

// ── Shopping list ──────────────────────────────────────────────────────

let toolArguments: Record<string, unknown> | undefined;
let bomLoaded = false;

function cell(text: string, className?: string): HTMLTableCellElement {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
}

function renderBom(bom: BomResult): void {
  bomEl.replaceChildren();
  for (const section of bom.sections) {
    const heading = document.createElement('h3');
    heading.textContent = section.title;
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const label of clean ? ['Part', 'Spec', 'Qty'] : ['Part', 'Spec', 'Qty', '']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.append(th);
    }
    const body = table.createTBody();
    for (const item of section.items) {
      const row = body.insertRow();
      const name = cell(item.name);
      if (item.product) {
        const product = document.createElement('div');
        product.className = 'product';
        product.textContent = item.product.name;
        name.append(product);
      }
      row.append(name, cell(item.spec ?? '', 'spec'), cell(item.quantity ?? '', 'qty'));
      if (!clean) {
        const links = document.createElement('td');
        for (const link of item.links) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = link.label ?? 'Buy';
          button.addEventListener('click', () => void openExternal(link.url));
          links.append(button);
        }
        row.append(links);
      }
    }
    bomEl.append(heading, table);
  }
  if (bom.notes?.length) {
    const notes = document.createElement('ul');
    notes.className = 'notes';
    for (const note of bom.notes) {
      const li = document.createElement('li');
      li.textContent = note;
      notes.append(li);
    }
    bomEl.append(notes);
  }
}

bomBtn.addEventListener('click', async () => {
  if (bomLoaded) {
    bomEl.hidden = !bomEl.hidden;
    return;
  }
  if (!toolArguments) return;
  bomBtn.disabled = true;
  bomEl.hidden = false;
  bomEl.textContent = 'Building the list…';
  try {
    const { format: _format, ...system } = toolArguments;
    const result = await app.callServerTool({ name: 'build_bom', arguments: system });
    const data = viewerData(result);
    if (!result.isError && data?.kind === 'bom') {
      renderBom(data.bom);
      bomLoaded = true;
    } else {
      const pre = document.createElement('pre');
      pre.textContent = textOf(result) || 'The list could not be built.';
      bomEl.replaceChildren(pre);
    }
  } catch (error) {
    bomEl.textContent = `The list could not be built: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    bomBtn.disabled = false;
  }
});

// ── Host ───────────────────────────────────────────────────────────────

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.availableDisplayModes) fullscreenBtn.hidden = !ctx.availableDisplayModes.includes('fullscreen');
  if (ctx.displayMode) {
    fullscreen = ctx.displayMode === 'fullscreen';
    document.body.classList.toggle('fullscreen', fullscreen);
    fullscreenBtn.setAttribute('aria-pressed', String(fullscreen));
    hintEl.textContent = fullscreen ? 'Drag to move · Scroll or pinch to zoom' : 'Drag to move · Ctrl + scroll or pinch to zoom';
    sizeViewport();
  }
}

fullscreenBtn.addEventListener('click', async () => {
  try {
    const { mode } = await app.requestDisplayMode({ mode: fullscreen ? 'inline' : 'fullscreen' });
    applyHostContext({ displayMode: mode });
  } catch {
    fullscreenBtn.hidden = true;
  }
});

app.ontoolinput = ({ arguments: args }) => {
  toolArguments = args;
  bomBtn.hidden = !args;
};
app.ontoolresult = renderDiagram;
app.ontoolcancelled = () => showStatus('The diagram was cancelled.');
app.onhostcontextchanged = applyHostContext;
app.onerror = (error) => console.error(error);

await app.connect();
const context = app.getHostContext();
if (context) applyHostContext(context);
