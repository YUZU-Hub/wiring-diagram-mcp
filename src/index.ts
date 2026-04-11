#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { calculateWireGauge } from './wireGaugeCalculator.js';
import {
  calculatePowerBudget,
  calculateBatteryBank,
  calculateSolarSize,
  calculateChargingTime,
  calculateInverterSize,
  calculateBatteryConfig,
} from './electricalCalculators.js';

const VOLTPLAN_API_URL = process.env.VOLTPLAN_API_URL || 'https://voltplan.app';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'wiring-diagram-mcp',
    version: '0.2.1',
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
              inputVoltage: z.number().describe('Input voltage. For shore/generator (AC) chargers use the regional mains voltage: 230 V in Europe, UK, Australia, most of Asia and Africa; 120 V in North America and Japan. For solar/wind use the panel or turbine output voltage. For alternator use the vehicle system voltage (typically 14 V).'),
              outputVoltage: z.number().describe('Output voltage'),
              power: z.number().describe('Power rating in watts'),
              sourceType: z
                .enum(['shore', 'solar', 'wind', 'generator', 'alternator'])
                .optional()
                .describe('Type of power source feeding this charger'),
            })
          )
          .optional()
          .describe('Chargers with their power sources'),
        format: z
          .enum(['svg', 'png'])
          .default('svg')
          .describe('Output format: svg (recommended, renders inline) or png (base64-encoded image, may not display in all clients)'),
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
                description: 'AC-to-DC charger from shore/mains power. Use the regional mains voltage as inputVoltage: 230 V in Europe/UK/Australia, 120 V in North America/Japan.',
                example: {
                  name: 'Shore Power Charger',
                  inputVoltage: 230,
                  outputVoltage: 12,
                  power: 500,
                  sourceType: 'shore',
                },
              },
              generator: {
                description: 'Charger powered by a generator. Use the regional mains voltage as inputVoltage: 230 V in Europe/UK/Australia, 120 V in North America/Japan.',
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
              alternator: {
                description: 'DC-to-DC charger from vehicle alternator',
                example: {
                  name: 'Alternator Charger',
                  inputVoltage: 14,
                  outputVoltage: 12,
                  power: 600,
                  sourceType: 'alternator',
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

  server.registerTool(
    'calculate_wire_gauge',
    {
      title: 'Cable Cross-Section & Resistance Calculator',
      description:
        'Calculate the recommended wire gauge / cable cross-section for a DC circuit. ' +
        'Considers both ampacity (current carrying capacity) and voltage drop to recommend the optimal cable size. ' +
        'Also returns total resistance, power loss, and a fuse recommendation. ' +
        'Supports copper conductors from 0.75 mm² (18 AWG) to 240 mm² (300 MCM).',
      inputSchema: z.object({
        voltage: z.number().describe('System voltage in volts (e.g. 12, 24, 48)'),
        current: z.number().optional().describe('Load current in amps. Provide either current or power.'),
        power: z.number().optional().describe('Load power in watts. Will be converted to current using the voltage. Provide either current or power.'),
        cableLengthM: z.number().describe('One-way cable length in meters'),
        maxVoltageDropPercent: z.number().default(3).describe('Maximum acceptable voltage drop in percent (default: 3%)'),
        temperatureCelsius: z.number().default(20).describe('Ambient temperature in °C (default: 20°C). Affects copper resistance.'),
        isRoundTrip: z.boolean().default(true).describe('Account for both positive and negative conductor (default: true). Set to false for chassis-ground returns.'),
      }),
    },
    async (args) => {
      const { voltage, current: currentArg, power, cableLengthM, maxVoltageDropPercent, temperatureCelsius, isRoundTrip } = args;

      if (!currentArg && !power) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Provide either "current" (amps) or "power" (watts).' }],
        };
      }

      const current = currentArg ?? (power! / voltage);

      if (current <= 0) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Current must be greater than 0.' }],
        };
      }

      if (cableLengthM <= 0) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: 'Cable length must be greater than 0.' }],
        };
      }

      const result = calculateWireGauge({
        voltage,
        current,
        cableLengthM,
        maxVoltageDropPercent,
        temperatureCelsius,
        isRoundTrip,
      });

      const inputSummary = power
        ? `${power} W @ ${voltage} V → ${Math.round(current * 100) / 100} A`
        : `${current} A @ ${voltage} V`;

      const lines: string[] = [
        `# Cable Cross-Section & Resistance Calculation Result`,
        ``,
        `## Input Parameters`,
        `- Load: ${inputSummary}`,
        `- Cable length: ${cableLengthM} m (${isRoundTrip ? 'round-trip, accounting for both positive and negative conductor' : 'one-way only, e.g. chassis-ground return'})`,
        `- Maximum allowed voltage drop: ${maxVoltageDropPercent}%`,
        `- Ambient temperature: ${temperatureCelsius}°C`,
        `- Wire material: Copper`,
        ``,
        `## Recommended Cable`,
        `The recommended cable cross-section is **${result.recommendedGauge.mm2} mm²** (${result.recommendedGauge.awg}).`,
        `This cable can safely carry up to ${result.recommendedGauge.maxAmps} A continuously.`,
        `The recommendation is based on the more restrictive of two criteria: ampacity (current carrying capacity) and voltage drop.`,
      ];

      if (result.minimumGaugeForAmpacity) {
        lines.push(
          `The minimum cable for ampacity alone would be ${result.minimumGaugeForAmpacity.mm2} mm² (${result.minimumGaugeForAmpacity.awg}), rated for ${result.minimumGaugeForAmpacity.maxAmps} A.`
        );
        if (result.recommendedGauge.mm2 > result.minimumGaugeForAmpacity.mm2) {
          lines.push(`A larger cable is recommended because the voltage drop constraint is more restrictive than the ampacity constraint for this cable length.`);
        }
      } else {
        lines.push(`Warning: The required current of ${Math.round(current * 100) / 100} A exceeds the ampacity of all standard single-conductor cable sizes. Consider using parallel cables or increasing system voltage.`);
      }

      lines.push(
        ``,
        `## Electrical Properties`,
        `- Total cable resistance: ${result.totalResistanceOhm} Ohm`,
        `- Voltage drop: ${result.voltageDrop.volts} V, which is ${result.voltageDrop.percent}% of the ${voltage} V system voltage`,
        `- Power dissipated as heat in the cable: ${result.powerLossWatts} W`,
        ``,
        `## Fuse Recommendation`,
        `Install a ${result.fuse.size} A fuse (${result.fuse.type}).`,
        `${result.fuse.description}`,
        `The fuse is sized at 125% of the continuous load current (${Math.round(current * 100) / 100} A) and rounded up to the next standard fuse size.`,
        `Always install the fuse as close to the battery positive terminal as possible (within 18 cm / 7 inches).`,
        ``,
        `## Overall Assessment`,
        `Status: **${result.status.toUpperCase()}**`,
        `${result.statusMessage}`,
      );

      const text = lines.join('\n');

      return {
        content: [{ type: 'text' as const, text }],
      };
    }
  );

  // ── Power Budget ────────────────────────────────────────────────────

  server.registerTool(
    'calculate_power_budget',
    {
      title: 'Power Budget / Energy Audit',
      description:
        'Calculate total daily energy consumption from a list of electrical loads. ' +
        'Each load specifies its power draw, how many hours per day it runs, and quantity. ' +
        'Returns total daily energy (Wh and Ah), peak power draw, and average power. ' +
        'This is typically the first step in sizing a battery bank and solar system.',
      inputSchema: z.object({
        systemVoltage: z.number().describe('System voltage in volts (e.g. 12, 24, 48)'),
        loads: z.array(z.object({
          name: z.string().describe('Name of the load (e.g. "LED Lights")'),
          powerWatts: z.number().describe('Power consumption of a single unit in watts'),
          hoursPerDay: z.number().describe('Average hours of use per day'),
          quantity: z.number().default(1).describe('Number of identical units (default: 1)'),
        })).describe('List of electrical loads to include in the budget'),
      }),
    },
    async (args) => {
      const result = calculatePowerBudget(args.loads, args.systemVoltage);

      const loadLines = result.loads.map(
        (l) => `- ${l.name}${l.quantity > 1 ? ` (x${l.quantity})` : ''}: ${l.powerWatts} W x ${l.hoursPerDay} h/day = ${l.dailyWh} Wh/day`
      );

      const text = [
        `# Power Budget / Energy Audit Result`,
        ``,
        `## System: ${args.systemVoltage} V DC`,
        ``,
        `## Load Breakdown`,
        ...loadLines,
        ``,
        `## Daily Totals`,
        `- Total daily energy consumption: **${result.totalDailyWh} Wh/day** (${result.totalDailyAh} Ah/day at ${args.systemVoltage} V)`,
        `- Average continuous power draw: ${result.averageWatts} W`,
        ``,
        `## Peak Load`,
        `- Peak power if all loads run simultaneously: **${result.peakWatts} W** (${result.peakAmps} A at ${args.systemVoltage} V)`,
        ``,
        `## Next Steps`,
        `Use the daily consumption of ${result.totalDailyWh} Wh as input for battery bank sizing (calculate_battery_bank) and solar panel sizing (calculate_solar_size).`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ── Battery Bank Sizing ────────────────────────────────────────────

  server.registerTool(
    'calculate_battery_bank',
    {
      title: 'Battery Bank Sizing Calculator',
      description:
        'Calculate the recommended battery bank size based on daily energy consumption. ' +
        'Accounts for days of autonomy (how many days without charging) and depth of discharge. ' +
        'Returns required capacity, number of batteries, and wiring configuration.',
      inputSchema: z.object({
        dailyConsumptionWh: z.number().describe('Daily energy consumption in watt-hours (from calculate_power_budget)'),
        daysOfAutonomy: z.number().default(2).describe('Days the system should run without any charging (default: 2)'),
        depthOfDischargePercent: z.number().default(80).describe('Usable percentage of battery capacity. LiFePO4: 80-90%, AGM: 50%, Gel: 50% (default: 80)'),
        systemVoltage: z.number().describe('Target system voltage in volts (e.g. 12, 24, 48)'),
        singleBatteryAh: z.number().describe('Capacity of a single battery in amp-hours (e.g. 100, 200)'),
        singleBatteryVoltage: z.number().describe('Voltage of a single battery (e.g. 12.8 for LiFePO4, 12 for lead-acid)'),
      }),
    },
    async (args) => {
      const result = calculateBatteryBank(args);

      const text = [
        `# Battery Bank Sizing Result`,
        ``,
        `## Requirements`,
        `- Daily consumption: ${args.dailyConsumptionWh} Wh`,
        `- Days of autonomy: ${args.daysOfAutonomy} (system runs ${args.daysOfAutonomy} day(s) without any charging)`,
        `- Depth of discharge: ${args.depthOfDischargePercent}% (only ${args.depthOfDischargePercent}% of total capacity is used to protect battery longevity)`,
        ``,
        `## Required Capacity`,
        `- Minimum total capacity needed: **${result.requiredCapacityAh} Ah** (${result.requiredCapacityWh} Wh) at ${args.systemVoltage} V`,
        `- This accounts for ${args.daysOfAutonomy} day(s) of autonomy and ${args.depthOfDischargePercent}% depth of discharge.`,
        ``,
        `## Recommended Battery Bank`,
        `- Configuration: **${result.configuration}**`,
        `- Number of batteries: **${result.recommendedBatteries}** (each ${args.singleBatteryAh} Ah / ${args.singleBatteryVoltage} V)`,
        `- Total capacity: ${result.totalCapacityAh} Ah (${result.totalCapacityWh} Wh)`,
        `- Usable capacity: ${result.usableCapacityWh} Wh (at ${args.depthOfDischargePercent}% DoD)`,
        `- This provides approximately ${Math.round((result.usableCapacityWh / args.dailyConsumptionWh) * 10) / 10} days of autonomy.`,
        ``,
        `## Next Steps`,
        `Use calculate_battery_config for detailed wiring instructions, or calculate_solar_size to size a solar array for this battery bank.`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ── Solar Panel Sizing ─────────────────────────────────────────────

  server.registerTool(
    'calculate_solar_size',
    {
      title: 'Solar Panel Sizing Calculator',
      description:
        'Calculate the required solar panel wattage to cover daily energy consumption. ' +
        'Accounts for peak sun hours at the location and system efficiency losses ' +
        '(MPPT conversion, wiring, temperature derating). ' +
        'Returns required wattage and common panel configurations.',
      inputSchema: z.object({
        dailyConsumptionWh: z.number().describe('Daily energy consumption in watt-hours (from calculate_power_budget)'),
        peakSunHours: z.number().describe('Average daily peak sun hours for the location. Examples: Northern Europe winter 1-2h, summer 4-6h. Southern US 5-6h. Equatorial regions 5-7h.'),
        systemEfficiency: z.number().default(0.85).describe('Overall system efficiency factor (default: 0.85). Accounts for MPPT losses, wiring losses, temperature derating, and panel soiling.'),
      }),
    },
    async (args) => {
      const result = calculateSolarSize(args);

      const configLines = result.recommendedPanelConfigs.map(
        (c) => `- ${c.count}x ${c.panelWatts} W panels = ${c.totalWatts} W total`
      );

      const text = [
        `# Solar Panel Sizing Result`,
        ``,
        `## Requirements`,
        `- Daily consumption to cover: ${args.dailyConsumptionWh} Wh`,
        `- Peak sun hours: ${args.peakSunHours} h/day`,
        `- System efficiency: ${Math.round(args.systemEfficiency * 100)}%`,
        ``,
        `## Required Solar Capacity`,
        `- Minimum solar wattage (ideal): ${result.requiredSolarWatts} W`,
        `- Adjusted for system losses: **${result.adjustedForEfficiency} W**`,
        `- Expected daily yield: ${result.dailyYieldWh} Wh/day`,
        ``,
        `## Common Panel Configurations`,
        ...configLines,
        ``,
        `## Notes`,
        `- Peak sun hours vary significantly by season and location. Size for the worst month you expect to use the system.`,
        `- Panels mounted flat on a roof typically get 10-20% less than optimally tilted panels.`,
        `- Partial shading can dramatically reduce output. Even small shadows on one cell can reduce the output of an entire panel.`,
        `- In cloudy or winter conditions, consider supplementing solar with shore power or an alternator charger.`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ── Charging Time ──────────────────────────────────────────────────

  server.registerTool(
    'calculate_charging_time',
    {
      title: 'Charging Time Calculator',
      description:
        'Estimate how long it takes to charge a battery bank from a given state of charge to a target level. ' +
        'Accounts for the bulk charging phase (constant current, up to ~80% SoC) and the slower absorption phase ' +
        '(tapering current, 80-100% SoC). Works for any charging source: solar, shore power, alternator.',
      inputSchema: z.object({
        batteryCapacityAh: z.number().describe('Total battery bank capacity in amp-hours'),
        batteryVoltage: z.number().describe('Battery bank voltage (e.g. 12, 24, 48)'),
        currentStateOfChargePercent: z.number().describe('Current state of charge in percent (e.g. 20 for 20%)'),
        targetStateOfChargePercent: z.number().default(100).describe('Target state of charge in percent (default: 100)'),
        chargePowerWatts: z.number().describe('Charger output power in watts'),
        chargeCurrentAmps: z.number().optional().describe('Maximum charge current in amps (if limited by the charger or battery BMS). If omitted, calculated from power and voltage.'),
      }),
    },
    async (args) => {
      const result = calculateChargingTime(args);

      const text = [
        `# Charging Time Estimate`,
        ``,
        `## Battery`,
        `- Capacity: ${args.batteryCapacityAh} Ah at ${args.batteryVoltage} V`,
        `- Charging from ${args.currentStateOfChargePercent}% to ${args.targetStateOfChargePercent}%`,
        `- Energy needed: ${result.energyNeededWh} Wh`,
        ``,
        `## Charger`,
        `- Charger power: ${args.chargePowerWatts} W`,
        `- Effective charge current: ${result.effectiveChargeCurrentAmps} A`,
        args.chargeCurrentAmps ? `- (Limited to ${args.chargeCurrentAmps} A by charger/BMS specification)` : '',
        ``,
        `## Time Estimate`,
        `- Bulk phase (constant current, up to 80% SoC): **${result.bulkPhaseHours} hours**`,
        `- Absorption phase (tapering current, 80-100% SoC): **${result.absorptionPhaseHours} hours**`,
        `- Total estimated charging time: **${result.totalHours} hours**`,
        ``,
        `## Notes`,
        `- The bulk phase charges at full current until approximately 80% state of charge.`,
        `- The absorption phase uses progressively less current as the battery approaches full charge, which is why it takes disproportionately longer.`,
        `- Actual charging time depends on battery chemistry, temperature, BMS settings, and charger characteristics.`,
        `- Solar charging times assume consistent sun; real-world times will be longer due to varying irradiance.`,
      ].filter(Boolean).join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ── Inverter Sizing ────────────────────────────────────────────────

  server.registerTool(
    'calculate_inverter_size',
    {
      title: 'Inverter Sizing Calculator',
      description:
        'Calculate the recommended inverter size for running AC loads from a DC battery system. ' +
        'Accounts for continuous power, startup surge power (motors typically surge 2-3x), ' +
        'and includes a 25% headroom for the continuous rating. ' +
        'Returns the recommended inverter wattage and the DC current draw at system voltage.',
      inputSchema: z.object({
        systemVoltage: z.number().describe('DC system voltage (e.g. 12, 24, 48)'),
        loads: z.array(z.object({
          name: z.string().describe('Name of the AC load (e.g. "Microwave", "Coffee Machine")'),
          continuousWatts: z.number().describe('Continuous power draw in watts'),
          surgeWatts: z.number().optional().describe('Startup surge power in watts (for motors, compressors). If omitted, assumed equal to continuous watts.'),
          quantity: z.number().default(1).describe('Number of identical units (default: 1)'),
        })).describe('List of AC loads that will run through the inverter'),
      }),
    },
    async (args) => {
      const result = calculateInverterSize(args.loads, args.systemVoltage);

      const loadLines = result.loads.map(
        (l) => `- ${l.name}${l.quantity > 1 ? ` (x${l.quantity})` : ''}: ${l.continuousWatts} W continuous${l.surgeWatts > l.continuousWatts ? `, ${l.surgeWatts} W surge` : ''}`
      );

      const text = [
        `# Inverter Sizing Result`,
        ``,
        `## AC Loads`,
        ...loadLines,
        ``,
        `## Power Requirements`,
        `- Total continuous power: ${result.totalContinuousWatts} W`,
        `- Total surge power: ${result.totalSurgeWatts} W`,
        `- Recommended continuous rating (with 25% headroom): ${result.recommendedContinuousWatts} W`,
        ``,
        `## Recommended Inverter`,
        `- Inverter size: **${result.recommendedInverterSize} W**`,
        `- Must handle at least ${result.totalSurgeWatts} W surge`,
        `- DC current draw at ${args.systemVoltage} V (at full rated load, ~90% efficiency): ${result.dcCurrentAtSystemVoltage} A`,
        result.dcCurrentAtSystemVoltage > 150 && args.systemVoltage <= 12
          ? `- **Note:** At ${result.dcCurrentAtSystemVoltage} A DC current, a 12V system requires very heavy cabling. Consider upgrading to a 24V or 48V system to halve or quarter the DC current draw.`
          : '',
        ``,
        `## Notes`,
        `- Choose a pure sine wave inverter for sensitive electronics (laptops, chargers, audio equipment).`,
        `- Modified sine wave inverters are cheaper but may cause humming in motors and are unsuitable for some devices.`,
        `- The DC current draw determines the cable size and fuse needed between battery and inverter — use calculate_wire_gauge to size these.`,
        `- Keep the cable between battery and inverter as short as possible (ideally under 1.5 m) due to the high DC current.`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  // ── Battery Configuration ──────────────────────────────────────────

  server.registerTool(
    'calculate_battery_config',
    {
      title: 'Battery Configuration Calculator',
      description:
        'Determine how to arrange batteries in series and/or parallel to achieve a target voltage and capacity. ' +
        'Returns the number of batteries needed, the wiring configuration (e.g. 2S3P), and step-by-step wiring instructions.',
      inputSchema: z.object({
        targetVoltage: z.number().describe('Desired system voltage (e.g. 12, 24, 48)'),
        targetCapacityAh: z.number().describe('Desired total capacity in amp-hours'),
        singleBatteryVoltage: z.number().describe('Nominal voltage of one battery (e.g. 12.8 for LiFePO4, 12 for lead-acid, 3.2 for LiFePO4 cells)'),
        singleBatteryAh: z.number().describe('Capacity of one battery in amp-hours'),
      }),
    },
    async (args) => {
      const result = calculateBatteryConfig(args);

      const text = [
        `# Battery Configuration Result`,
        ``,
        `## Target`,
        `- Target voltage: ${args.targetVoltage} V`,
        `- Target capacity: ${args.targetCapacityAh} Ah`,
        ``,
        `## Battery Arrangement`,
        `- Configuration: **${result.configuration}**`,
        `- Total batteries needed: **${result.totalBatteries}**`,
        `- Series: ${result.seriesCount} (to reach ${result.actualVoltage} V)`,
        `- Parallel: ${result.parallelCount} (to reach ${result.actualCapacityAh} Ah)`,
        ``,
        `## Resulting Specs`,
        `- Actual voltage: ${result.actualVoltage} V`,
        result.actualVoltage !== args.targetVoltage
          ? `- ${result.actualVoltage} V is the nominal voltage for ${result.seriesCount}S ${args.singleBatteryVoltage} V batteries, compatible with ${args.targetVoltage} V systems.`
          : '',
        `- Actual capacity: ${result.actualCapacityAh} Ah (${result.actualCapacityWh} Wh)`,
        ``,
        `## Wiring Instructions`,
        ...result.wiringInstructions.map((s) => `- ${s}`),
        ``,
        `## Safety`,
        `- Always use batteries of the same type, brand, age, and capacity in a bank.`,
        `- Never mix battery chemistries (e.g. LiFePO4 with AGM).`,
        `- For LiFePO4 batteries in parallel, ensure each battery has its own BMS.`,
        `- Check that the BMS of each battery supports the intended configuration.`,
      ].join('\n');

      return { content: [{ type: 'text' as const, text }] };
    }
  );

  return server;
}

async function startStdio() {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp() {
  const { default: express } = await import('express');
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );

  type Req = import('express').Request;
  type Res = import('express').Response;

  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const PORT = parseInt(process.env.PORT || '3001', 10);
  const app = express();
  app.use('/public', express.static(join(__dirname, '..', 'public')));
  app.use(express.json());

  // CORS for remote MCP clients
  app.use((_req: Req, res: Res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    next();
  });

  app.options('/mcp', (_req: Req, res: Res) => {
    res.status(204).end();
  });

  app.post('/mcp', async (req: Req, res: Res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get('/mcp', (_req: Req, res: Res) => {
    res.status(405).json({ error: 'Method not allowed. Use POST for stateless MCP requests.' });
  });

  app.delete('/mcp', (_req: Req, res: Res) => {
    res.status(405).json({
      error: 'Method not allowed. Stateless server does not support session termination.',
    });
  });

  app.get('/health', (_req: Req, res: Res) => {
    res.json({ status: 'ok', version: '0.2.1' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Wiring Diagram MCP server running on http://0.0.0.0:${PORT}/mcp`);
    console.log(`VoltPlan API: ${VOLTPLAN_API_URL}`);
  });
}

const mode = process.argv.includes('--http') ? 'http' : 'stdio';
if (mode === 'http') {
  startHttp();
} else {
  startStdio();
}
