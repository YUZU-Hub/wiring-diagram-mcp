import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from './index.js';
import { resetBomCache } from './links.js';

// Valid arguments for every tool, so each one returns its full success output.
const TOOL_ARGS: Record<string, Record<string, unknown>> = {
  generate_wiring_diagram: {
    systemName: 'Camper',
    batteries: [{ name: 'LiFePO4 100Ah', voltage: 12.8, capacityAh: 100 }],
    loads: [{ name: 'Fridge', power: 60 }],
    chargers: [{ name: 'MPPT', inputVoltage: 48, power: 400, sourceType: 'solar' }],
  },
  list_component_types: {},
  calculate_wire_gauge: { voltage: 12, current: 40, cableLengthM: 2 },
  calculate_power_budget: { systemVoltage: 12, loads: [{ name: 'Fridge', powerWatts: 60, hoursPerDay: 24 }] },
  calculate_battery_bank: { dailyConsumptionWh: 1200, systemVoltage: 12, singleBatteryAh: 100, singleBatteryVoltage: 12.8 },
  calculate_solar_size: { dailyConsumptionWh: 1200, peakSunHours: 4 },
  calculate_charging_time: { batteryCapacityAh: 200, batteryVoltage: 12, currentStateOfChargePercent: 20, chargePowerWatts: 400 },
  calculate_inverter_size: { systemVoltage: 12, loads: [{ name: 'Kettle', continuousWatts: 1500 }] },
  calculate_battery_config: { targetVoltage: 24, targetCapacityAh: 200, singleBatteryVoltage: 12.8, singleBatteryAh: 100 },
};

// Diagram API answers with a tiny PNG; the curated-parts catalogue has no rows,
// so buy links fall back to search links; telemetry is swallowed.
function fakeFetch(url: string | URL | Request): Promise<Response> {
  const href = String(url);
  if (href.includes('/api/diagram/generate')) {
    return Promise.resolve(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 }));
  }
  if (href.includes('/api/collections/')) {
    return Promise.resolve(Response.json({ items: [] }));
  }
  return Promise.resolve(new Response('{}', { status: 200 }));
}

/** Every tool description plus the text of every tool's output, as one string. */
async function allToolText(clean: boolean): Promise<string> {
  const server = createServer({ clean });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(Object.keys(TOOL_ARGS).sort());

  const parts = tools.map((t) => t.description ?? '');
  for (const tool of tools) {
    const result = await client.callTool({ name: tool.name, arguments: TOOL_ARGS[tool.name] });
    expect(result.isError, tool.name).toBeFalsy();
    for (const item of result.content as Array<{ type: string; text?: string }>) {
      if (item.type === 'text') parts.push(item.text ?? '');
    }
  }
  await client.close();
  return parts.join('\n');
}

describe('promotional output', () => {
  beforeEach(() => {
    resetBomCache();
    vi.stubGlobal('fetch', vi.fn(fakeFetch));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('the clean server carries no buy links or pointers to other VoltPlan pages', async () => {
    const text = await allToolText(true);
    expect(text).not.toContain('/api/go');
    expect(text).not.toMatch(/\[VoltPlan [^\]]+\]/);
    expect(text).not.toMatch(/shopping list|Component Catalog|Show the user/i);
    // The editor link is the diagram's own editable copy, not a promotion.
    expect(text).toContain('/wireframe/new');
  });

  it('the default server keeps its buy links and VoltPlan links', async () => {
    const text = await allToolText(false);
    expect(text).toContain('/api/go');
    expect(text).toMatch(/\[VoltPlan Diagram Maker\]/);
  });
});
