// Electrical calculators for off-grid / camper / boat system design

// ── Power Budget / Energy Audit ────────────────────────────────────────

export interface LoadEntry {
  name: string;
  powerWatts: number;
  hoursPerDay: number;
  quantity: number;
}

export interface PowerBudgetResult {
  loads: { name: string; quantity: number; powerWatts: number; hoursPerDay: number; dailyWh: number }[];
  totalDailyWh: number;
  totalDailyAh: number;
  peakWatts: number;
  peakAmps: number;
  averageWatts: number;
}

export function calculatePowerBudget(loads: LoadEntry[], systemVoltage: number): PowerBudgetResult {
  const detailed = loads.map((l) => ({
    name: l.name,
    quantity: l.quantity,
    powerWatts: l.powerWatts,
    hoursPerDay: l.hoursPerDay,
    dailyWh: l.powerWatts * l.quantity * l.hoursPerDay,
  }));

  const totalDailyWh = detailed.reduce((sum, l) => sum + l.dailyWh, 0);
  const peakWatts = detailed.reduce((sum, l) => sum + l.powerWatts * l.quantity, 0);

  return {
    loads: detailed,
    totalDailyWh: Math.round(totalDailyWh * 10) / 10,
    totalDailyAh: Math.round((totalDailyWh / systemVoltage) * 10) / 10,
    peakWatts: Math.round(peakWatts * 10) / 10,
    peakAmps: Math.round((peakWatts / systemVoltage) * 10) / 10,
    averageWatts: Math.round((totalDailyWh / 24) * 10) / 10,
  };
}

// ── Battery Bank Sizing ────────────────────────────────────────────────

export interface BatterySizingInput {
  dailyConsumptionWh: number;
  daysOfAutonomy: number;
  depthOfDischargePercent: number; // e.g. 80 for LiFePO4, 50 for AGM
  systemVoltage: number;
  singleBatteryAh: number; // capacity of one battery
  singleBatteryVoltage: number; // voltage of one battery
}

export interface BatterySizingResult {
  requiredCapacityWh: number;
  requiredCapacityAh: number;
  recommendedBatteries: number;
  totalCapacityAh: number;
  totalCapacityWh: number;
  usableCapacityWh: number;
  configuration: string;
}

export function calculateBatteryBank(input: BatterySizingInput): BatterySizingResult {
  const { dailyConsumptionWh, daysOfAutonomy, depthOfDischargePercent, systemVoltage, singleBatteryAh, singleBatteryVoltage } = input;
  const dodFraction = depthOfDischargePercent / 100;

  // Total energy needed including DoD reserve
  const requiredCapacityWh = (dailyConsumptionWh * daysOfAutonomy) / dodFraction;
  const requiredCapacityAh = requiredCapacityWh / systemVoltage;

  // How many batteries in series to reach system voltage
  const seriesCount = Math.ceil(systemVoltage / singleBatteryVoltage);
  // Ah per parallel string = singleBatteryAh
  const parallelCount = Math.ceil(requiredCapacityAh / singleBatteryAh);
  const totalBatteries = seriesCount * parallelCount;

  const totalCapacityAh = parallelCount * singleBatteryAh;
  const actualVoltage = seriesCount * singleBatteryVoltage;
  const totalCapacityWh = totalCapacityAh * actualVoltage;

  let configuration: string;
  if (seriesCount === 1 && parallelCount === 1) {
    configuration = '1 battery (standalone)';
  } else if (seriesCount === 1) {
    configuration = `${parallelCount} batteries in parallel (${parallelCount}P)`;
  } else if (parallelCount === 1) {
    configuration = `${seriesCount} batteries in series (${seriesCount}S)`;
  } else {
    configuration = `${seriesCount} in series, ${parallelCount} in parallel (${seriesCount}S${parallelCount}P) — ${totalBatteries} batteries total`;
  }

  return {
    requiredCapacityWh: Math.round(requiredCapacityWh),
    requiredCapacityAh: Math.round(requiredCapacityAh * 10) / 10,
    recommendedBatteries: totalBatteries,
    totalCapacityAh: Math.round(totalCapacityAh * 10) / 10,
    totalCapacityWh: Math.round(totalCapacityWh),
    usableCapacityWh: Math.round(totalCapacityWh * dodFraction),
    configuration,
  };
}

// ── Solar Panel Sizing ─────────────────────────────────────────────────

export interface SolarSizingInput {
  dailyConsumptionWh: number;
  peakSunHours: number; // average daily peak sun hours for the location
  systemEfficiency: number; // overall system efficiency (default 0.85: MPPT losses, wiring, temperature)
}

export interface SolarSizingResult {
  requiredSolarWatts: number;
  adjustedForEfficiency: number;
  dailyYieldWh: number;
  recommendedPanelConfigs: { panelWatts: number; count: number; totalWatts: number }[];
}

export function calculateSolarSize(input: SolarSizingInput): SolarSizingResult {
  const { dailyConsumptionWh, peakSunHours, systemEfficiency } = input;

  // Required panel wattage: Wh needed / sun hours / efficiency
  const rawWatts = dailyConsumptionWh / peakSunHours;
  const adjustedWatts = rawWatts / systemEfficiency;

  // Common panel sizes
  const panelSizes = [100, 160, 200, 300, 400];
  const configs = panelSizes.map((size) => {
    const count = Math.ceil(adjustedWatts / size);
    return { panelWatts: size, count, totalWatts: count * size };
  });

  return {
    requiredSolarWatts: Math.round(rawWatts),
    adjustedForEfficiency: Math.round(adjustedWatts),
    dailyYieldWh: Math.round(adjustedWatts * peakSunHours * systemEfficiency),
    recommendedPanelConfigs: configs,
  };
}

// ── Charging Time Calculator ───────────────────────────────────────────

export interface ChargingTimeInput {
  batteryCapacityAh: number;
  batteryVoltage: number;
  currentStateOfChargePercent: number; // e.g. 20
  targetStateOfChargePercent: number;  // e.g. 100
  chargePowerWatts: number;            // charger output power
  chargeCurrentAmps?: number;          // alternative: direct current input
}

export interface ChargingTimeResult {
  energyNeededWh: number;
  bulkPhaseHours: number;
  absorptionPhaseHours: number;
  totalHours: number;
  effectiveChargeCurrentAmps: number;
}

export function calculateChargingTime(input: ChargingTimeInput): ChargingTimeResult {
  const { batteryCapacityAh, batteryVoltage, currentStateOfChargePercent, targetStateOfChargePercent, chargePowerWatts, chargeCurrentAmps } = input;

  const ahNeeded = batteryCapacityAh * ((targetStateOfChargePercent - currentStateOfChargePercent) / 100);
  const energyNeededWh = ahNeeded * batteryVoltage;

  // Effective charge current (limited by charger output)
  const maxCurrentFromPower = chargePowerWatts / batteryVoltage;
  const effectiveCurrent = chargeCurrentAmps
    ? Math.min(chargeCurrentAmps, maxCurrentFromPower)
    : maxCurrentFromPower;

  // Bulk phase: constant current up to ~80% SoC
  // Absorption phase: tapering current from 80% to target (roughly 20% extra time)
  const bulkCeiling = Math.min(80, targetStateOfChargePercent);
  const bulkAh = Math.max(0, batteryCapacityAh * ((bulkCeiling - currentStateOfChargePercent) / 100));
  const absorptionAh = Math.max(0, ahNeeded - bulkAh);

  const bulkPhaseHours = effectiveCurrent > 0 ? bulkAh / effectiveCurrent : 0;
  // Absorption phase takes roughly 2x longer per Ah due to tapering current
  const absorptionPhaseHours = effectiveCurrent > 0 ? (absorptionAh / effectiveCurrent) * 2 : 0;

  return {
    energyNeededWh: Math.round(energyNeededWh),
    bulkPhaseHours: Math.round(bulkPhaseHours * 100) / 100,
    absorptionPhaseHours: Math.round(absorptionPhaseHours * 100) / 100,
    totalHours: Math.round((bulkPhaseHours + absorptionPhaseHours) * 100) / 100,
    effectiveChargeCurrentAmps: Math.round(effectiveCurrent * 10) / 10,
  };
}

// ── Inverter Sizing ────────────────────────────────────────────────────

export interface AcLoadEntry {
  name: string;
  continuousWatts: number;
  surgeWatts?: number; // startup surge, typically 2-3x for motors
  quantity: number;
}

export interface InverterSizingResult {
  totalContinuousWatts: number;
  totalSurgeWatts: number;
  recommendedContinuousWatts: number;
  recommendedSurgeWatts: number;
  recommendedInverterSize: number;
  dcCurrentAtSystemVoltage: number;
  loads: { name: string; quantity: number; continuousWatts: number; surgeWatts: number }[];
}

export function calculateInverterSize(loads: AcLoadEntry[], systemVoltage: number): InverterSizingResult {
  const detailed = loads.map((l) => ({
    name: l.name,
    quantity: l.quantity,
    continuousWatts: l.continuousWatts * l.quantity,
    surgeWatts: (l.surgeWatts ?? l.continuousWatts) * l.quantity,
  }));

  const totalContinuous = detailed.reduce((s, l) => s + l.continuousWatts, 0);
  const totalSurge = detailed.reduce((s, l) => s + l.surgeWatts, 0);

  // 25% headroom for continuous rating
  const recommendedContinuous = totalContinuous * 1.25;
  const recommendedSurge = totalSurge;

  // Standard inverter sizes
  const inverterSizes = [300, 500, 600, 800, 1000, 1500, 2000, 3000, 5000, 8000, 10000];
  let recommendedSize = inverterSizes[inverterSizes.length - 1];
  for (const size of inverterSizes) {
    if (size >= recommendedContinuous) {
      recommendedSize = size;
      break;
    }
  }

  // Inverter efficiency ~90%
  const dcCurrent = recommendedSize / systemVoltage / 0.9;

  return {
    totalContinuousWatts: Math.round(totalContinuous),
    totalSurgeWatts: Math.round(totalSurge),
    recommendedContinuousWatts: Math.round(recommendedContinuous),
    recommendedSurgeWatts: Math.round(recommendedSurge),
    recommendedInverterSize: recommendedSize,
    dcCurrentAtSystemVoltage: Math.round(dcCurrent * 10) / 10,
    loads: detailed,
  };
}

// ── Battery Configuration ──────────────────────────────────────────────

export interface BatteryConfigInput {
  targetVoltage: number;
  targetCapacityAh: number;
  singleBatteryVoltage: number;
  singleBatteryAh: number;
}

export interface BatteryConfigResult {
  seriesCount: number;
  parallelCount: number;
  totalBatteries: number;
  actualVoltage: number;
  actualCapacityAh: number;
  actualCapacityWh: number;
  configuration: string;
  wiringInstructions: string[];
}

export function calculateBatteryConfig(input: BatteryConfigInput): BatteryConfigResult {
  const { targetVoltage, targetCapacityAh, singleBatteryVoltage, singleBatteryAh } = input;

  const seriesCount = Math.ceil(targetVoltage / singleBatteryVoltage);
  const parallelCount = Math.ceil(targetCapacityAh / singleBatteryAh);
  const totalBatteries = seriesCount * parallelCount;

  const actualVoltage = seriesCount * singleBatteryVoltage;
  const actualCapacityAh = parallelCount * singleBatteryAh;

  let configuration: string;
  if (seriesCount === 1 && parallelCount === 1) {
    configuration = '1 battery (standalone)';
  } else if (seriesCount === 1) {
    configuration = `${parallelCount}P (${parallelCount} batteries in parallel)`;
  } else if (parallelCount === 1) {
    configuration = `${seriesCount}S (${seriesCount} batteries in series)`;
  } else {
    configuration = `${seriesCount}S${parallelCount}P (${seriesCount} in series, ${parallelCount} in parallel)`;
  }

  const instructions: string[] = [];
  if (seriesCount > 1 && parallelCount > 1) {
    instructions.push(
      `Build ${parallelCount} identical strings, each consisting of ${seriesCount} batteries connected in series (positive of one to negative of the next).`,
      `Connect all ${parallelCount} strings in parallel by joining all string-positive terminals together and all string-negative terminals together.`,
      `Use equal-length cables for all parallel connections to ensure balanced current distribution.`,
      `Connect your system positive to one corner of the bank and system negative to the diagonally opposite corner (cross-diagonal wiring) for balanced current draw.`,
    );
  } else if (seriesCount > 1) {
    instructions.push(
      `Connect ${seriesCount} batteries in series: connect the positive terminal of each battery to the negative terminal of the next.`,
      `The system positive is the free positive terminal of the first battery. The system negative is the free negative terminal of the last battery.`,
    );
  } else if (parallelCount > 1) {
    instructions.push(
      `Connect ${parallelCount} batteries in parallel: join all positive terminals together and all negative terminals together.`,
      `Use equal-length cables for all connections to ensure balanced current distribution.`,
      `Connect your system positive to one end and system negative to the opposite end (cross-diagonal wiring) for balanced current draw.`,
    );
  } else {
    instructions.push('Single battery — connect system positive and negative directly to the battery terminals.');
  }

  instructions.push('Always install a fuse on the positive cable as close to the battery terminal as possible.');

  return {
    seriesCount,
    parallelCount,
    totalBatteries,
    actualVoltage,
    actualCapacityAh,
    actualCapacityWh: actualVoltage * actualCapacityAh,
    configuration,
    wiringInstructions: instructions,
  };
}
