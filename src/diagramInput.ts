/**
 * Input for `generate_wiring_diagram`: fields that follow from the others
 * are optional and filled in here, so a model does not fail validation for
 * leaving out e.g. a load's current when it gave watts and volts.
 */

export interface DiagramBatteryInput {
  name: string;
  voltage: number;
  capacityAh?: number;
  energyWh?: number;
}

export interface DiagramLoadInput {
  name: string;
  power?: number;
  current?: number;
  voltage?: number;
}

export interface DiagramChargerInput {
  name: string;
  inputVoltage: number;
  outputVoltage?: number;
  power: number;
  sourceType?: 'shore' | 'solar' | 'wind' | 'generator' | 'alternator';
}

export interface DiagramInput {
  systemName: string;
  batteries?: DiagramBatteryInput[];
  loads?: DiagramLoadInput[];
  chargers?: DiagramChargerInput[];
}

/** The body VoltPlan's `/api/diagram/generate` expects, every field set. */
export interface DiagramRequest {
  systemName: string;
  batteries: { name: string; voltage: number; capacityAh: number; energyWh: number }[];
  loads: { name: string; power: number; voltage: number; current: number }[];
  chargers: { name: string; inputVoltage: number; outputVoltage: number; power: number; sourceType?: DiagramChargerInput['sourceType'] }[];
}

const DEFAULT_SYSTEM_VOLTAGE = 12;

const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const positive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function normalizeDiagramInput(input: DiagramInput): { request: DiagramRequest } | { error: string } {
  const errors: string[] = [];

  const batteries = (input.batteries ?? []).flatMap((b, i) => {
    if (!positive(b.voltage)) {
      errors.push(`batteries[${i}] ("${b.name}"): voltage must be greater than 0.`);
      return [];
    }
    const capacityAh = positive(b.capacityAh) ? b.capacityAh : positive(b.energyWh) ? round(b.energyWh / b.voltage, 1) : undefined;
    const energyWh = positive(b.energyWh) ? b.energyWh : capacityAh !== undefined ? round(capacityAh * b.voltage, 0) : undefined;
    if (capacityAh === undefined || energyWh === undefined) {
      errors.push(`batteries[${i}] ("${b.name}"): give capacityAh or energyWh.`);
      return [];
    }
    return [{ name: b.name, voltage: b.voltage, capacityAh, energyWh }];
  });

  // Loads and chargers without a voltage run at the bank voltage.
  const systemVoltage = batteries[0]?.voltage ?? DEFAULT_SYSTEM_VOLTAGE;

  const loads = (input.loads ?? []).flatMap((l, i) => {
    const voltage = positive(l.voltage) ? l.voltage : systemVoltage;
    const power = positive(l.power) ? l.power : positive(l.current) ? round(l.current * voltage) : undefined;
    const current = positive(l.current) ? l.current : power !== undefined ? round(power / voltage) : undefined;
    if (power === undefined || current === undefined) {
      errors.push(`loads[${i}] ("${l.name}"): give power (watts) or current (amps).`);
      return [];
    }
    return [{ name: l.name, power, voltage, current }];
  });

  const chargers = (input.chargers ?? []).map((c) => ({
    name: c.name,
    inputVoltage: c.inputVoltage,
    outputVoltage: positive(c.outputVoltage) ? c.outputVoltage : systemVoltage,
    power: c.power,
    ...(c.sourceType ? { sourceType: c.sourceType } : {}),
  }));

  if (errors.length > 0) return { error: errors.join('\n') };
  return { request: { systemName: input.systemName, batteries, loads, chargers } };
}

/**
 * The renderer inlines every component icon as a base64 data URI, which makes
 * up ~95% of the SVG. Dropping the `<image>` elements keeps the schematic
 * (boxes, wires, labels) at a size a model's context can hold.
 */
export function stripEmbeddedImages(svg: string): string {
  return svg.replace(/<image\b[^>]*?(?:\/>|>[\s\S]*?<\/image>)/g, '');
}
