#!/usr/bin/env node

import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const VOLTPLAN_API_URL = process.env.VOLTPLAN_API_URL || 'http://localhost:3000';
const PORT = parseInt(process.env.PORT || '3001', 10);

function createServer(): McpServer {
  const server = new McpServer({
    name: 'wiring-diagram-mcp',
    version: '0.1.0',
  });

  server.registerTool(
    'generate_wiring_diagram',
    {
      title: 'Generate Wiring Diagram',
      description:
        'Generate an electrical wiring diagram for campers, boats, or off-grid setups. ' +
        'Returns a complete schematic with batteries, chargers, protection components, and loads. ' +
        'Protection components (shunt, main switch, low-voltage cutoff) are auto-generated when both batteries and loads are provided.',
      inputSchema: z.object({
        systemName: z.string().describe('Name of the electrical system (e.g. "My Camper Van")'),
        batteries: z
          .array(
            z.object({
              name: z.string().describe('Battery name (e.g. "LiFePO4 100Ah")'),
              voltage: z.number().describe('Nominal voltage (e.g. 12)'),
              capacityAh: z.number().describe('Capacity in amp-hours'),
              energyWh: z.number().describe('Energy in watt-hours'),
            })
          )
          .optional()
          .describe('Batteries in the system'),
        loads: z
          .array(
            z.object({
              name: z.string().describe('Load name (e.g. "LED Lights")'),
              power: z.number().describe('Power consumption in watts'),
              voltage: z.number().describe('Operating voltage'),
              current: z.number().describe('Current draw in amps'),
            })
          )
          .optional()
          .describe('Electrical loads / consumers'),
        chargers: z
          .array(
            z.object({
              name: z.string().describe('Charger name (e.g. "MPPT Solar Charger")'),
              inputVoltage: z.number().describe('Input voltage'),
              outputVoltage: z.number().describe('Output voltage'),
              power: z.number().describe('Power rating in watts'),
              sourceType: z
                .enum(['shore', 'solar', 'wind', 'generator'])
                .optional()
                .describe('Type of power source feeding this charger'),
            })
          )
          .optional()
          .describe('Chargers with their power sources'),
        format: z
          .enum(['svg', 'png'])
          .default('png')
          .describe('Output format: svg for text-based SVG, png for base64-encoded image'),
      }),
    },
    async (args) => {
      const { format, ...body } = args;
      const wantsPng = format === 'png';

      const response = await fetch(`${VOLTPLAN_API_URL}/api/diagram/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: wantsPng ? 'image/png' : 'image/svg+xml',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Diagram generation failed (${response.status}): ${errorText}`,
            },
          ],
        };
      }

      if (wantsPng) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const base64 = buffer.toString('base64');
        return {
          content: [
            {
              type: 'image' as const,
              data: base64,
              mimeType: 'image/png' as const,
            },
          ],
        };
      }

      const svg = await response.text();
      return {
        content: [
          {
            type: 'text' as const,
            text: svg,
          },
        ],
      };
    }
  );

  server.registerTool(
    'list_component_types',
    {
      title: 'List Component Types',
      description:
        'List all available component types and example configurations for building wiring diagrams. ' +
        'Use this to understand what parameters are needed before calling generate_wiring_diagram.',
    },
    async () => {
      const reference = {
        componentTypes: {
          battery: {
            description: 'Energy storage (e.g. LiFePO4, AGM, Gel)',
            example: {
              name: 'LiFePO4 100Ah',
              voltage: 12,
              capacityAh: 100,
              energyWh: 1280,
            },
            commonVoltages: [12, 24, 48],
          },
          load: {
            description: 'Electrical consumer (lights, fridge, pumps, USB chargers, etc.)',
            example: {
              name: 'LED Ceiling Lights',
              power: 20,
              voltage: 12,
              current: 1.7,
            },
            commonLoads: [
              { name: 'LED Lights', power: 20 },
              { name: 'Compressor Fridge', power: 60 },
              { name: 'Water Pump', power: 40 },
              { name: 'USB Charger', power: 30 },
              { name: 'Diesel Heater', power: 30 },
              { name: 'Roof Vent Fan', power: 15 },
            ],
          },
          charger: {
            description: 'Charges batteries from a power source',
            sourceTypes: {
              solar: {
                description: 'MPPT or PWM solar charge controller',
                example: {
                  name: 'MPPT Solar Charger',
                  inputVoltage: 48,
                  outputVoltage: 12,
                  power: 200,
                  sourceType: 'solar',
                },
              },
              shore: {
                description: 'AC-to-DC charger from shore/mains power',
                example: {
                  name: 'Shore Power Charger',
                  inputVoltage: 230,
                  outputVoltage: 12,
                  power: 500,
                  sourceType: 'shore',
                },
              },
              generator: {
                description: 'Charger powered by a generator',
                example: {
                  name: 'Generator Charger',
                  inputVoltage: 230,
                  outputVoltage: 12,
                  power: 1000,
                  sourceType: 'generator',
                },
              },
              wind: {
                description: 'Wind turbine charge controller',
                example: {
                  name: 'Wind Charger',
                  inputVoltage: 24,
                  outputVoltage: 12,
                  power: 400,
                  sourceType: 'wind',
                },
              },
            },
          },
        },
        autoGenerated: {
          protectionComponents:
            'When both batteries and loads are provided, protection components are automatically added: ' +
            'shunt (current monitoring), main switch (disconnect), and low-voltage cutoff (battery protection).',
          powerSources:
            'Each charger automatically gets a matching power source entry in the diagram.',
          fuses:
            'Fuse sizes and wire gauges are automatically calculated based on component power ratings.',
        },
        tips: [
          'Start simple: 1 battery + 2-3 loads already produces a useful diagram.',
          'Current (amps) for loads is calculated as power / voltage, but you can override it.',
          'Multiple batteries of the same voltage are wired in parallel automatically.',
          'The diagram shows positive (red) and negative (black) wiring with proper fusing.',
        ],
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(reference, null, 2),
          },
        ],
      };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

app.post('/mcp', async (req: Request, res: Response) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/mcp', async (req: Request, res: Response) => {
  res.status(405).json({ error: 'Method not allowed. Use POST for stateless MCP requests.' });
});

app.delete('/mcp', async (req: Request, res: Response) => {
  res.status(405).json({ error: 'Method not allowed. Stateless server does not support session termination.' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Wiring Diagram MCP server running on http://0.0.0.0:${PORT}/mcp`);
  console.log(`VoltPlan API: ${VOLTPLAN_API_URL}`);
});
