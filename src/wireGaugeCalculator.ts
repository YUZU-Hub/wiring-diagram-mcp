// Wire Gauge / Cable Cross-Section & Resistance Calculator
// Copper conductors, 0.75 mm² (18 AWG) to 240 mm² (300 MCM)

export interface WireGaugeEntry {
  awg: number;
  mm2: number;
  maxAmps: number;
  resistivityOhmPerKm: number; // Ohm per km for copper at 20°C
}

export const WIRE_GAUGE_TABLE: WireGaugeEntry[] = [
  { awg: 18, mm2: 0.75, maxAmps: 7, resistivityOhmPerKm: 23.2 },
  { awg: 16, mm2: 1.0, maxAmps: 10, resistivityOhmPerKm: 17.8 },
  { awg: 14, mm2: 1.5, maxAmps: 15, resistivityOhmPerKm: 11.9 },
  { awg: 13, mm2: 2.5, maxAmps: 20, resistivityOhmPerKm: 7.14 },
  { awg: 12, mm2: 4.0, maxAmps: 25, resistivityOhmPerKm: 4.46 },
  { awg: 10, mm2: 6.0, maxAmps: 35, resistivityOhmPerKm: 2.98 },
  { awg: 8, mm2: 10.0, maxAmps: 50, resistivityOhmPerKm: 1.78 },
  { awg: 6, mm2: 16.0, maxAmps: 65, resistivityOhmPerKm: 1.12 },
  { awg: 4, mm2: 25.0, maxAmps: 85, resistivityOhmPerKm: 0.714 },
  { awg: 2, mm2: 35.0, maxAmps: 110, resistivityOhmPerKm: 0.510 },
  { awg: 1, mm2: 50.0, maxAmps: 135, resistivityOhmPerKm: 0.357 },
  { awg: 0, mm2: 70.0, maxAmps: 170, resistivityOhmPerKm: 0.255 },
  { awg: -1, mm2: 95.0, maxAmps: 200, resistivityOhmPerKm: 0.188 },  // 1/0
  { awg: -2, mm2: 120.0, maxAmps: 235, resistivityOhmPerKm: 0.149 }, // 2/0
  { awg: -3, mm2: 150.0, maxAmps: 285, resistivityOhmPerKm: 0.119 }, // 3/0
  { awg: -4, mm2: 185.0, maxAmps: 330, resistivityOhmPerKm: 0.097 }, // 4/0
  { awg: -5, mm2: 240.0, maxAmps: 400, resistivityOhmPerKm: 0.074 }, // 300 MCM
];

export const STANDARD_FUSE_SIZES = [1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100, 125, 150, 175, 200, 250, 300, 400];

export function formatAwg(awg: number): string {
  if (awg >= 0) return `${awg} AWG`;
  if (awg === -1) return '1/0 AWG';
  if (awg === -2) return '2/0 AWG';
  if (awg === -3) return '3/0 AWG';
  if (awg === -4) return '4/0 AWG';
  if (awg === -5) return '300 MCM';
  return `${Math.abs(awg)}/0 AWG`;
}

export function temperatureCorrectionFactor(tempC: number): number {
  return 1 + 0.00393 * (tempC - 20);
}

export interface CalculationInput {
  voltage: number;
  current: number;
  cableLengthM: number;
  maxVoltageDropPercent: number;
  temperatureCelsius: number;
  isRoundTrip: boolean;
}

export interface CalculationResult {
  recommendedGauge: { awg: string; mm2: number; maxAmps: number };
  minimumGaugeForAmpacity: { awg: string; mm2: number; maxAmps: number } | null;
  voltageDrop: { volts: number; percent: number };
  totalResistanceOhm: number;
  powerLossWatts: number;
  fuse: { size: number; type: string; description: string };
  status: string;
  statusMessage: string;
}

export function calculateWireGauge(input: CalculationInput): CalculationResult {
  const { voltage, current, cableLengthM, maxVoltageDropPercent, temperatureCelsius, isRoundTrip } = input;
  const lengthFactor = isRoundTrip ? 2 : 1;
  const tempFactor = temperatureCorrectionFactor(temperatureCelsius);

  // Find minimum gauge for ampacity
  let ampacityGauge: WireGaugeEntry | null = null;
  for (const gauge of WIRE_GAUGE_TABLE) {
    if (gauge.maxAmps >= current) {
      ampacityGauge = gauge;
      break;
    }
  }

  // Find minimum gauge for voltage drop
  let voltageDropGauge: WireGaugeEntry | null = null;
  if (current > 0 && cableLengthM > 0) {
    const maxDropVolts = voltage * (maxVoltageDropPercent / 100);
    const maxResistivityPerKm = (maxDropVolts / current) * 1000 / (cableLengthM * lengthFactor * tempFactor);
    for (const gauge of WIRE_GAUGE_TABLE) {
      if (gauge.resistivityOhmPerKm <= maxResistivityPerKm) {
        voltageDropGauge = gauge;
        break;
      }
    }
  }

  // Recommended = larger of the two
  let recommendedGauge: WireGaugeEntry;
  if (!ampacityGauge && !voltageDropGauge) {
    recommendedGauge = WIRE_GAUGE_TABLE[WIRE_GAUGE_TABLE.length - 1];
  } else if (!ampacityGauge) {
    recommendedGauge = voltageDropGauge || WIRE_GAUGE_TABLE[WIRE_GAUGE_TABLE.length - 1];
  } else if (!voltageDropGauge) {
    recommendedGauge = ampacityGauge;
  } else {
    recommendedGauge = ampacityGauge.mm2 >= voltageDropGauge.mm2 ? ampacityGauge : voltageDropGauge;
  }

  // Calculate actual voltage drop
  const totalResistanceOhm = (recommendedGauge.resistivityOhmPerKm / 1000) * cableLengthM * lengthFactor * tempFactor;
  const voltageDropVolts = current * totalResistanceOhm;
  const voltageDropPercent = voltage > 0 ? (voltageDropVolts / voltage) * 100 : 0;
  const powerLossWatts = current * current * totalResistanceOhm;

  // Fuse recommendation
  const requiredFuseRating = current * 1.25;
  let fuseSize = STANDARD_FUSE_SIZES[STANDARD_FUSE_SIZES.length - 1];
  for (const size of STANDARD_FUSE_SIZES) {
    if (size >= requiredFuseRating) {
      fuseSize = size;
      break;
    }
  }
  let fuseType: string;
  let fuseDescription: string;
  if (fuseSize <= 30) {
    fuseType = 'Blade (ATC/ATO)';
    fuseDescription = 'Standard automotive blade fuse. Place inline near the power source.';
  } else if (fuseSize <= 60) {
    fuseType = 'MAXI Blade';
    fuseDescription = 'Heavy-duty blade fuse for higher current circuits.';
  } else if (fuseSize <= 200) {
    fuseType = 'ANL';
    fuseDescription = 'High-current bolt-down fuse. Mount in a dedicated fuse holder near the battery.';
  } else if (fuseSize <= 400) {
    fuseType = 'Class T';
    fuseDescription = 'Fast-acting fuse for inverter and high-current battery protection.';
  } else {
    fuseType = 'NH / Industrial';
    fuseDescription = 'Industrial fuse for very high current applications.';
  }

  // Status
  let status: string;
  let statusMessage: string;
  if (!ampacityGauge) {
    if (voltageDropPercent <= maxVoltageDropPercent) {
      status = 'warning';
      statusMessage = 'Current exceeds standard single-cable ratings. Use parallel cables or verify with the cable manufacturer.';
    } else {
      status = 'danger';
      statusMessage = 'Current exceeds safe limits for standard wire gauges. Consider splitting into multiple circuits or increasing system voltage.';
    }
  } else if (voltageDropPercent <= maxVoltageDropPercent) {
    status = 'ok';
    statusMessage = 'Wire size meets all requirements.';
  } else if (voltageDropPercent <= maxVoltageDropPercent * 1.5) {
    status = 'warning';
    statusMessage = 'Voltage drop is above target. Consider a larger wire gauge.';
  } else {
    status = 'danger';
    statusMessage = 'Voltage drop is excessive. Use a larger wire gauge or reduce cable length.';
  }

  return {
    recommendedGauge: {
      awg: formatAwg(recommendedGauge.awg),
      mm2: recommendedGauge.mm2,
      maxAmps: recommendedGauge.maxAmps,
    },
    minimumGaugeForAmpacity: ampacityGauge
      ? { awg: formatAwg(ampacityGauge.awg), mm2: ampacityGauge.mm2, maxAmps: ampacityGauge.maxAmps }
      : null,
    voltageDrop: {
      volts: Math.round(voltageDropVolts * 1000) / 1000,
      percent: Math.round(voltageDropPercent * 100) / 100,
    },
    totalResistanceOhm: Math.round(totalResistanceOhm * 10000) / 10000,
    powerLossWatts: Math.round(powerLossWatts * 100) / 100,
    fuse: { size: fuseSize, type: fuseType, description: fuseDescription },
    status,
    statusMessage,
  };
}
