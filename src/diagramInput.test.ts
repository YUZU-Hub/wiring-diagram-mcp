import { describe, expect, it } from 'vitest';
import { normalizeDiagramInput, stripEmbeddedImages } from './diagramInput.js';

describe('normalizeDiagramInput', () => {
  it('fills the field that follows from the others', () => {
    const result = normalizeDiagramInput({
      systemName: 'Van',
      batteries: [
        { name: 'A', voltage: 12.8, capacityAh: 100 },
        { name: 'B', voltage: 12.8, energyWh: 2560 },
      ],
      loads: [
        { name: 'Fridge', power: 60 },
        { name: 'Pump', current: 5, voltage: 12 },
      ],
      chargers: [{ name: 'MPPT', inputVoltage: 40, power: 400, sourceType: 'solar' }],
    });
    if ('error' in result) throw new Error(result.error);
    const { batteries, loads, chargers } = result.request;
    expect(batteries[0]).toMatchObject({ capacityAh: 100, energyWh: 1280 });
    expect(batteries[1]).toMatchObject({ capacityAh: 200, energyWh: 2560 });
    // A load without a voltage runs at the bank voltage.
    expect(loads[0]).toEqual({ name: 'Fridge', power: 60, voltage: 12.8, current: 4.69 });
    expect(loads[1]).toEqual({ name: 'Pump', power: 60, voltage: 12, current: 5 });
    expect(chargers[0].outputVoltage).toBe(12.8);
  });

  it('defaults to 12 V without a battery', () => {
    const result = normalizeDiagramInput({ systemName: 'Lights', loads: [{ name: 'LED', power: 24 }] });
    if ('error' in result) throw new Error(result.error);
    expect(result.request.loads[0]).toMatchObject({ voltage: 12, current: 2 });
  });

  it('names every component that lacks the numbers it needs', () => {
    const result = normalizeDiagramInput({
      systemName: 'Van',
      batteries: [{ name: 'Mystery', voltage: 12 }],
      loads: [{ name: 'Heater' }],
    });
    expect('error' in result && result.error).toBe(
      'batteries[0] ("Mystery"): give capacityAh or energyWh.\nloads[0] ("Heater"): give power (watts) or current (amps).'
    );
  });
});

describe('stripEmbeddedImages', () => {
  it('drops inlined icons and keeps the schematic', () => {
    const svg =
      '<svg><rect x="1"/><image x="2" href="data:image/png;base64,AAAA"/>' +
      '<text>Fridge</text><image href="data:image/svg+xml;base64,BBBB"></image><line x1="0"/></svg>';
    expect(stripEmbeddedImages(svg)).toBe('<svg><rect x="1"/><text>Fridge</text><line x1="0"/></svg>');
  });
});
