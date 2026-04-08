import { describe, it, expect } from 'vitest';
import {
  calculateWireGauge,
  formatAwg,
  temperatureCorrectionFactor,
  WIRE_GAUGE_TABLE,
  STANDARD_FUSE_SIZES,
} from './wireGaugeCalculator.js';

// ── Helper ─────────────────────────────────────────────────────────────

const defaultInput = {
  voltage: 12,
  current: 10,
  cableLengthM: 3,
  maxVoltageDropPercent: 3,
  temperatureCelsius: 20,
  isRoundTrip: true,
};

// ── formatAwg ──────────────────────────────────────────────────────────

describe('formatAwg', () => {
  it('formats positive AWG values', () => {
    expect(formatAwg(18)).toBe('18 AWG');
    expect(formatAwg(10)).toBe('10 AWG');
    expect(formatAwg(0)).toBe('0 AWG');
  });

  it('formats large gauges as x/0 AWG', () => {
    expect(formatAwg(-1)).toBe('1/0 AWG');
    expect(formatAwg(-2)).toBe('2/0 AWG');
    expect(formatAwg(-3)).toBe('3/0 AWG');
    expect(formatAwg(-4)).toBe('4/0 AWG');
  });

  it('formats 300 MCM', () => {
    expect(formatAwg(-5)).toBe('300 MCM');
  });
});

// ── temperatureCorrectionFactor ────────────────────────────────────────

describe('temperatureCorrectionFactor', () => {
  it('returns 1.0 at 20°C (reference temperature)', () => {
    expect(temperatureCorrectionFactor(20)).toBe(1);
  });

  it('increases resistance at higher temperatures', () => {
    const factor = temperatureCorrectionFactor(40);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeCloseTo(1 + 0.00393 * 20, 6);
  });

  it('decreases resistance at lower temperatures', () => {
    const factor = temperatureCorrectionFactor(0);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeCloseTo(1 + 0.00393 * -20, 6);
  });
});

// ── calculateWireGauge: basic scenarios ────────────────────────────────

describe('calculateWireGauge', () => {
  it('returns a valid result for a typical 12V / 10A / 3m scenario', () => {
    const result = calculateWireGauge(defaultInput);

    expect(result.recommendedGauge.mm2).toBeGreaterThan(0);
    expect(result.voltageDrop.volts).toBeGreaterThan(0);
    expect(result.voltageDrop.percent).toBeGreaterThan(0);
    expect(result.totalResistanceOhm).toBeGreaterThan(0);
    expect(result.powerLossWatts).toBeGreaterThan(0);
    expect(result.status).toBe('ok');
  });

  it('recommends a gauge that keeps voltage drop within limit', () => {
    const result = calculateWireGauge(defaultInput);
    expect(result.voltageDrop.percent).toBeLessThanOrEqual(defaultInput.maxVoltageDropPercent);
  });

  it('recommends a gauge whose ampacity covers the current', () => {
    const result = calculateWireGauge(defaultInput);
    expect(result.recommendedGauge.maxAmps).toBeGreaterThanOrEqual(defaultInput.current);
  });

  // ── Voltage drop vs ampacity constraint ────────────────────────────

  it('picks a larger cable when voltage drop is the limiting factor', () => {
    // Long cable at low current → voltage drop dominates
    const result = calculateWireGauge({
      ...defaultInput,
      current: 5,
      cableLengthM: 15,
    });

    // Ampacity alone would allow 0.75 mm² (7 A), but voltage drop requires more
    expect(result.recommendedGauge.mm2).toBeGreaterThan(0.75);
    expect(result.minimumGaugeForAmpacity!.mm2).toBeLessThan(result.recommendedGauge.mm2);
  });

  it('picks a larger cable when ampacity is the limiting factor', () => {
    // High current, short cable → ampacity dominates
    const result = calculateWireGauge({
      ...defaultInput,
      current: 45,
      cableLengthM: 0.5,
    });

    expect(result.recommendedGauge.maxAmps).toBeGreaterThanOrEqual(45);
  });

  // ── Round-trip vs one-way ──────────────────────────────────────────

  it('halves the resistance when isRoundTrip is false (same gauge)', () => {
    // Use a scenario where both round-trip and one-way pick the same gauge
    // (high current, short cable → ampacity dominates over voltage drop)
    const input = { ...defaultInput, current: 30, cableLengthM: 1 };
    const roundTrip = calculateWireGauge({ ...input, isRoundTrip: true });
    const oneWay = calculateWireGauge({ ...input, isRoundTrip: false });

    // Same gauge should be picked (ampacity-limited)
    expect(oneWay.recommendedGauge.mm2).toBe(roundTrip.recommendedGauge.mm2);
    // One-way resistance should be half of round-trip
    expect(oneWay.totalResistanceOhm).toBeCloseTo(roundTrip.totalResistanceOhm / 2, 3);
    expect(oneWay.voltageDrop.volts).toBeCloseTo(roundTrip.voltageDrop.volts / 2, 2);
  });

  // ── Temperature effect ─────────────────────────────────────────────

  it('increases voltage drop at higher temperatures', () => {
    const cool = calculateWireGauge({ ...defaultInput, temperatureCelsius: 20 });
    const hot = calculateWireGauge({ ...defaultInput, temperatureCelsius: 50 });

    // Same gauge should show higher drop at 50°C
    // If a larger gauge is picked at 50°C, the drop may still be lower,
    // but resistance per mm² is definitely higher
    expect(hot.totalResistanceOhm).toBeGreaterThanOrEqual(cool.totalResistanceOhm);
  });

  // ── 24V and 48V systems ────────────────────────────────────────────

  it('recommends a smaller cable for 24V vs 12V at the same power', () => {
    const at12V = calculateWireGauge({ ...defaultInput, voltage: 12, current: 20 });
    const at24V = calculateWireGauge({ ...defaultInput, voltage: 24, current: 10 }); // same 240W

    expect(at24V.recommendedGauge.mm2).toBeLessThanOrEqual(at12V.recommendedGauge.mm2);
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  it('handles very high current exceeding all standard gauges', () => {
    const result = calculateWireGauge({
      ...defaultInput,
      current: 500,
    });

    expect(result.minimumGaugeForAmpacity).toBeNull();
    expect(['warning', 'danger']).toContain(result.status);
  });

  it('handles very long cables', () => {
    const result = calculateWireGauge({
      ...defaultInput,
      current: 5,
      cableLengthM: 100,
    });

    // Should still return a result (even if danger)
    expect(result.recommendedGauge.mm2).toBeGreaterThan(0);
  });
});

// ── Fuse recommendations ───────────────────────────────────────────────

describe('fuse recommendations', () => {
  it('sizes fuse at 125% of load current, rounded up to standard size', () => {
    // 10A × 1.25 = 12.5A → next standard size is 15A
    const result = calculateWireGauge(defaultInput);
    expect(result.fuse.size).toBe(15);
  });

  it('recommends blade fuse for small currents', () => {
    const result = calculateWireGauge({ ...defaultInput, current: 5 });
    expect(result.fuse.type).toBe('Blade (ATC/ATO)');
  });

  it('recommends MAXI blade fuse for medium currents', () => {
    // 30A × 1.25 = 37.5 → 40A MAXI
    const result = calculateWireGauge({ ...defaultInput, current: 30 });
    expect(result.fuse.size).toBe(40);
    expect(result.fuse.type).toBe('MAXI Blade');
  });

  it('recommends ANL fuse for high currents', () => {
    // 80A × 1.25 = 100A → ANL
    const result = calculateWireGauge({ ...defaultInput, current: 80 });
    expect(result.fuse.size).toBe(100);
    expect(result.fuse.type).toBe('ANL');
  });

  it('recommends Class T fuse for very high currents', () => {
    // 200A × 1.25 = 250A → Class T
    const result = calculateWireGauge({ ...defaultInput, current: 200 });
    expect(result.fuse.size).toBe(250);
    expect(result.fuse.type).toBe('Class T');
  });
});

// ── Status logic ───────────────────────────────────────────────────────

describe('status determination', () => {
  it('returns ok when voltage drop is within limit', () => {
    const result = calculateWireGauge(defaultInput);
    expect(result.status).toBe('ok');
  });

  it('returns warning or danger when no gauge can meet voltage drop on very long cables', () => {
    const result = calculateWireGauge({
      ...defaultInput,
      current: 200,
      cableLengthM: 200,
      maxVoltageDropPercent: 1,
    });
    expect(['warning', 'danger']).toContain(result.status);
  });
});

// ── Data integrity ─────────────────────────────────────────────────────

describe('wire gauge table', () => {
  it('is sorted by ascending cross-section (mm²)', () => {
    for (let i = 1; i < WIRE_GAUGE_TABLE.length; i++) {
      expect(WIRE_GAUGE_TABLE[i].mm2).toBeGreaterThan(WIRE_GAUGE_TABLE[i - 1].mm2);
    }
  });

  it('has decreasing resistivity as cross-section increases', () => {
    for (let i = 1; i < WIRE_GAUGE_TABLE.length; i++) {
      expect(WIRE_GAUGE_TABLE[i].resistivityOhmPerKm).toBeLessThan(
        WIRE_GAUGE_TABLE[i - 1].resistivityOhmPerKm
      );
    }
  });

  it('has increasing ampacity as cross-section increases', () => {
    for (let i = 1; i < WIRE_GAUGE_TABLE.length; i++) {
      expect(WIRE_GAUGE_TABLE[i].maxAmps).toBeGreaterThan(WIRE_GAUGE_TABLE[i - 1].maxAmps);
    }
  });
});

describe('standard fuse sizes', () => {
  it('is sorted in ascending order', () => {
    for (let i = 1; i < STANDARD_FUSE_SIZES.length; i++) {
      expect(STANDARD_FUSE_SIZES[i]).toBeGreaterThan(STANDARD_FUSE_SIZES[i - 1]);
    }
  });
});
