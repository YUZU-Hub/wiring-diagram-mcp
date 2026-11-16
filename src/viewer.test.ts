import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { createServer } from './index.js';
import { bomViewerMeta } from './viewer.js';
import type { BomResult } from './catalog.js';

async function connect() {
  const server = createServer();
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe('MCP App viewer', () => {
  it('serves the HTML a host loads for generate_wiring_diagram, with only VoltPlan allowed for images', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const uri = (tools.find((t) => t.name === 'generate_wiring_diagram')?._meta?.ui as { resourceUri?: string })?.resourceUri;
    expect(uri).toMatch(/^ui:\/\//);

    const { contents } = await client.readResource({ uri: uri! });
    expect(contents).toHaveLength(1);
    const [content] = contents as Array<{ mimeType?: string; text?: string; _meta?: { ui?: { csp?: unknown } } }>;
    expect(content.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(content.text).toMatch(/^<!DOCTYPE html>/);
    // The bundle is inlined; nothing is left to fetch from a dev server or CDN.
    expect(content.text).not.toMatch(/__VIEWER_(CSS|JS)__|<script[^>]+src=/);
    expect(content._meta?.ui?.csp).toEqual({ resourceDomains: ['https://voltplan.app'] });
    await client.close();
  });
});

describe('bomViewerMeta', () => {
  const BOM: BomResult = {
    systemName: 'Van',
    sections: [{
      title: 'Components',
      items: [{
        id: 'battery-0',
        name: 'LiFePO4 100Ah',
        product: { id: 'pq', name: 'Power Queen 100Ah', url: 'https://voltplan.app/components/pq' },
        links: [{ label: null, url: 'https://voltplan.app/api/go?c=pq&source=mcp' }],
      }],
    }],
    notes: ['Check the specs.', 'Open https://voltplan.app/wireframe/new to edit.'],
  };

  it('drops every link and URL for /mcp-clean', () => {
    const text = JSON.stringify(bomViewerMeta(BOM, true));
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).toContain('Power Queen 100Ah');
    expect(text).toContain('Check the specs.');
  });

  it('keeps buy links and tags product pages like the text output', () => {
    const { bom } = bomViewerMeta(BOM, false).voltplan as { bom: BomResult };
    expect(bom.sections[0].items[0].links[0].url).toBe('https://voltplan.app/api/go?c=pq&source=mcp');
    expect(bom.sections[0].items[0].product?.url).toContain('utm_source=mcp');
  });
});
