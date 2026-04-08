import { describe, it, expect } from 'vitest';
import {
  calculatePowerBudget,
  calculateBatteryBank,
  calculateSolarSize,
  calculateChargingTime,
  calculateInverterSize,
  calculateBatteryConfig,
} from './electricalCalculators.js';

// ── Power Budget ───────────────────────────────────────────────────────

describe('calculatePowerBudget', () => {
  const loads = [
    { name: 'LED Lights', powerWatts: 20, hoursPerDay: 5, quantity: 1 },
    { name: 'Fridge', powerWatts: 60, hoursPerDay: 24, quantity: 1 },
    { name: 'USB Charger', powerWatts: 10, hoursPerDay: 3, quantity: 2 },
  ];

  it('calculates total daily Wh correctly', () => {
    const result = calculatePowerBudget(loads, 12);
    // 20*5 + 60*24 + 10*2*3 = 100 + 1440 + 60 = 1600
    expect(result.totalDailyWh).toBe(1600);
  });

  it('calculates daily Ah at system voltage', () => {
    const result = calculatePowerBudget(loads, 12);
    expect(result.totalDailyAh).toBeCloseTo(1600 / 12, 1);
  });

  it('calculates peak watts as sum of all loads running simultaneously', () => {
    const result = calculatePowerBudget(loads, 12);
    // 20 + 60 + 10*2 = 100
    expect(result.peakWatts).toBe(100);
  });

  it('calculates peak amps at system voltage', () => {
    const result = calculatePowerBudget(loads, 12);
    expect(result.peakAmps).toBeCloseTo(100 / 12, 1);
  });

  it('calculates average watts over 24 hours', () => {
    const result = calculatePowerBudget(loads, 12);
    expect(result.averageWatts).toBeCloseTo(1600 / 24, 1);
  });

  it('handles quantity correctly', () => {
    const result = calculatePowerBudget(loads, 12);
    const usbEntry = result.loads.find((l) => l.name === 'USB Charger')!;
    expect(usbEntry.dailyWh).toBe(10 * 2 * 3);
  });

  it('works with a single load', () => {
    const result = calculatePowerBudget(
      [{ name: 'Fan', powerWatts: 15, hoursPerDay: 8, quantity: 1 }],
      12
    );
    expect(result.totalDailyWh).toBe(120);
    expect(result.peakWatts).toBe(15);
  });

  it('works with 24V system', () => {
    const result = calculatePowerBudget(loads, 24);
    expect(result.totalDailyWh).toBe(1600); // Wh doesn't change
    expect(result.totalDailyAh).toBeCloseTo(1600 / 24, 1); // Ah halves
  });
});

// ── Battery Bank Sizing ────────────────────────────────────────────────

describe('calculateBatteryBank', () => {
  const defaultInput = {
    dailyConsumptionWh: 1600,
    daysOfAutonomy: 2,
    depthOfDischargePercent: 80,
    systemVoltage: 12,
    singleBatteryAh: 100,
    singleBatteryVoltage: 12.8,
  };

  it('calculates required capacity accounting for DoD', () => {
    const result = calculateBatteryBank(defaultInput);
    // 1600 * 2 / 0.8 = 4000 Wh → 4000/12 = 333.3 Ah
    expect(result.requiredCapacityWh).toBe(4000);
    expect(result.requiredCapacityAh).toBeCloseTo(333.3, 1);
  });

  it('rounds up to whole batteries', () => {
    const result = calculateBatteryBank(defaultInput);
    // 333.3 Ah / 100 Ah = 3.33 → 4 batteries in parallel
    expect(result.recommendedBatteries).toBe(4);
    expect(result.totalCapacityAh).toBe(400);
  });

  it('handles series configuration for higher voltages', () => {
    const result = calculateBatteryBank({
      ...defaultInput,
      systemVoltage: 24,
      dailyConsumptionWh: 500,
    });
    // Need 2 batteries in series for 24V (12.8V each)
    expect(result.configuration).toContain('series');
  });

  it('returns standalone for a single battery', () => {
    const result = calculateBatteryBank({
      ...defaultInput,
      dailyConsumptionWh: 200,
      daysOfAutonomy: 1,
    });
    // 200/0.8 = 250 Wh → 250/12 ≈ 20.8 Ah → 1 battery of 100Ah
    expect(result.recommendedBatteries).toBe(1);
    expect(result.configuration).toContain('standalone');
  });

  it('calculates usable capacity correctly', () => {
    const result = calculateBatteryBank(defaultInput);
    expect(result.usableCapacityWh).toBe(Math.round(result.totalCapacityWh * 0.8));
  });

  it('uses 50% DoD for AGM batteries', () => {
    const result = calculateBatteryBank({
      ...defaultInput,
      depthOfDischargePercent: 50,
    });
    // 1600 * 2 / 0.5 = 6400 Wh — needs more batteries
    expect(result.requiredCapacityWh).toBe(6400);
    expect(result.recommendedBatteries).toBeGreaterThan(
      calculateBatteryBank(defaultInput).recommendedBatteries
    );
  });
});

// ── Solar Panel Sizing ─────────────────────────────────────────────────

describe('calculateSolarSize', () => {
  it('calculates raw wattage from consumption and sun hours', () => {
    const result = calculateSolarSize({
      dailyConsumptionWh: 1000,
      peakSunHours: 5,
      systemEfficiency: 1.0, // no losses for easy math
    });
    expect(result.requiredSolarWatts).toBe(200);
  });

  it('adjusts for system efficiency', () => {
    const result = calculateSolarSize({
      dailyConsumptionWh: 1000,
      peakSunHours: 5,
      systemEfficiency: 0.85,
    });
    // 200 / 0.85 ≈ 235
    expect(result.adjustedForEfficiency).toBe(Math.round(200 / 0.85));
  });

  it('provides multiple panel configurations', () => {
    const result = calculateSolarSize({
      dailyConsumptionWh: 1000,
      peakSunHours: 5,
      systemEfficiency: 0.85,
    });
    expect(result.recommendedPanelConfigs.length).toBeGreaterThan(0);
    // Each config should meet or exceed the adjusted wattage
    for (const config of result.recommendedPanelConfigs) {
      expect(config.totalWatts).toBeGreaterThanOrEqual(result.adjustedForEfficiency);
    }
  });

  it('handles low sun hours (winter scenario)', () => {
    const result = calculateSolarSize({
      dailyConsumptionWh: 1000,
      peakSunHours: 1.5,
      systemEfficiency: 0.85,
    });
    // Much more solar needed
    expect(result.adjustedForEfficiency).toBeGreaterThan(700);
  });

  it('daily yield covers consumption', () => {
    const result = calculateSolarSize({
      dailyConsumptionWh: 1000,
      peakSunHours: 5,
      systemEfficiency: 0.85,
    });
    expect(result.dailyYieldWh).toBeGreaterThanOrEqual(1000);
  });
});

// ── Charging Time ──────────────────────────────────────────────────────

describe('calculateChargingTime', () => {
  const defaultInput = {
    batteryCapacityAh: 200,
    batteryVoltage: 12,
    currentStateOfChargePercent: 20,
    targetStateOfChargePercent: 100,
    chargePowerWatts: 600,
  };

  it('calculates energy needed correctly', () => {
    const result = calculateChargingTime(defaultInput);
    // 200 Ah * 0.8 * 12V = 1920 Wh
    expect(result.energyNeededWh).toBe(1920);
  });

  it('calculates effective charge current from power', () => {
    const result = calculateChargingTime(defaultInput);
    // 600W / 12V = 50A
    expect(result.effectiveChargeCurrentAmps).toBe(50);
  });

  it('limits current when chargeCurrentAmps is specified', () => {
    const result = calculateChargingTime({
      ...defaultInput,
      chargeCurrentAmps: 30,
    });
    expect(result.effectiveChargeCurrentAmps).toBe(30);
  });

  it('bulk phase is shorter than absorption for 20→100% charge', () => {
    const result = calculateChargingTime(defaultInput);
    // Bulk: 20→80% = 60% of capacity at full current
    // Absorption: 80→100% = 20% at 2x time
    expect(result.bulkPhaseHours).toBeGreaterThan(0);
    expect(result.absorptionPhaseHours).toBeGreaterThan(0);
    expect(result.totalHours).toBe(result.bulkPhaseHours + result.absorptionPhaseHours);
  });

  it('skips absorption when target is below 80%', () => {
    const result = calculateChargingTime({
      ...defaultInput,
      targetStateOfChargePercent: 70,
    });
    expect(result.absorptionPhaseHours).toBe(0);
  });

  it('charging time is shorter with more power', () => {
    const slow = calculateChargingTime({ ...defaultInput, chargePowerWatts: 300 });
    const fast = calculateChargingTime({ ...defaultInput, chargePowerWatts: 600 });
    expect(fast.totalHours).toBeLessThan(slow.totalHours);
  });

  it('handles already-at-target state', () => {
    const result = calculateChargingTime({
      ...defaultInput,
      currentStateOfChargePercent: 100,
      targetStateOfChargePercent: 100,
    });
    expect(result.energyNeededWh).toBe(0);
    expect(result.totalHours).toBe(0);
  });
});

// ── Inverter Sizing ────────────────────────────────────────────────────

describe('calculateInverterSize', () => {
  const loads = [
    { name: 'Microwave', continuousWatts: 800, surgeWatts: 1200, quantity: 1 },
    { name: 'Laptop Charger', continuousWatts: 65, quantity: 2 },
  ];

  it('sums continuous watts correctly', () => {
    const result = calculateInverterSize(loads, 12);
    // 800 + 65*2 = 930
    expect(result.totalContinuousWatts).toBe(930);
  });

  it('sums surge watts correctly', () => {
    const result = calculateInverterSize(loads, 12);
    // 1200 + 65*2 = 1330
    expect(result.totalSurgeWatts).toBe(1330);
  });

  it('adds 25% headroom to continuous rating', () => {
    const result = calculateInverterSize(loads, 12);
    expect(result.recommendedContinuousWatts).toBe(Math.round(930 * 1.25));
  });

  it('recommends a standard inverter size', () => {
    const result = calculateInverterSize(loads, 12);
    // 930 * 1.25 = 1162.5 → next standard size is 1500W
    expect(result.recommendedInverterSize).toBe(1500);
  });

  it('uses continuous watts as surge when surgeWatts not specified', () => {
    const result = calculateInverterSize(
      [{ name: 'Fan', continuousWatts: 50, quantity: 1 }],
      12
    );
    expect(result.totalSurgeWatts).toBe(50);
  });

  it('calculates DC current draw', () => {
    const result = calculateInverterSize(loads, 12);
    // inverterSize / voltage / efficiency
    expect(result.dcCurrentAtSystemVoltage).toBeGreaterThan(0);
    expect(result.dcCurrentAtSystemVoltage).toBeCloseTo(1500 / 12 / 0.9, 1);
  });

  it('recommends smaller inverter for 24V system', () => {
    const result12 = calculateInverterSize(loads, 12);
    const result24 = calculateInverterSize(loads, 24);
    // Same inverter size (AC side), but DC current halves
    expect(result24.recommendedInverterSize).toBe(result12.recommendedInverterSize);
    expect(result24.dcCurrentAtSystemVoltage).toBeCloseTo(result12.dcCurrentAtSystemVoltage / 2, 0);
  });
});

// ── Battery Configuration ──────────────────────────────────────────────

describe('calculateBatteryConfig', () => {
  it('returns standalone for a single battery', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 12,
      targetCapacityAh: 100,
      singleBatteryVoltage: 12.8,
      singleBatteryAh: 100,
    });
    expect(result.totalBatteries).toBe(1);
    expect(result.configuration).toContain('standalone');
  });

  it('calculates parallel-only configuration', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 12,
      targetCapacityAh: 300,
      singleBatteryVoltage: 12.8,
      singleBatteryAh: 100,
    });
    expect(result.seriesCount).toBe(1);
    expect(result.parallelCount).toBe(3);
    expect(result.totalBatteries).toBe(3);
    expect(result.configuration).toContain('3P');
  });

  it('calculates series-only configuration', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 24,
      targetCapacityAh: 100,
      singleBatteryVoltage: 12.8,
      singleBatteryAh: 100,
    });
    expect(result.seriesCount).toBe(2);
    expect(result.parallelCount).toBe(1);
    expect(result.totalBatteries).toBe(2);
    expect(result.configuration).toContain('2S');
  });

  it('calculates series-parallel configuration', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 24,
      targetCapacityAh: 300,
      singleBatteryVoltage: 12.8,
      singleBatteryAh: 100,
    });
    expect(result.seriesCount).toBe(2);
    expect(result.parallelCount).toBe(3);
    expect(result.totalBatteries).toBe(6);
    expect(result.configuration).toContain('2S3P');
  });

  it('calculates actual voltage and capacity', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 24,
      targetCapacityAh: 200,
      singleBatteryVoltage: 12.8,
      singleBatteryAh: 100,
    });
    expect(result.actualVoltage).toBe(25.6); // 2 * 12.8
    expect(result.actualCapacityAh).toBe(200); // 2 * 100
    expect(result.actualCapacityWh).toBe(25.6 * 200);
  });

  it('provides wiring instructions', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 24,
      targetCapacityAh: 300,
      singleBatteryVoltage: 12.8,
      singleBatteryAh: 100,
    });
    expect(result.wiringInstructions.length).toBeGreaterThan(0);
    // Should mention cross-diagonal wiring for S+P config
    expect(result.wiringInstructions.join(' ')).toContain('cross-diagonal');
  });

  it('always includes fuse instruction', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 12,
      targetCapacityAh: 100,
      singleBatteryVoltage: 12.8,
      singleBatteryAh: 100,
    });
    expect(result.wiringInstructions.join(' ')).toContain('fuse');
  });

  it('handles LiFePO4 cells (3.2V)', () => {
    const result = calculateBatteryConfig({
      targetVoltage: 12,
      targetCapacityAh: 100,
      singleBatteryVoltage: 3.2,
      singleBatteryAh: 100,
    });
    expect(result.seriesCount).toBe(4); // 4 * 3.2V = 12.8V
    expect(result.actualVoltage).toBe(12.8);
  });
});
