# Off-grid cabin

A four-season cabin running on solar with a generator backup. 24V system to keep DC currents reasonable for the inverter.

## Loads

| Load | Power | Hours/day |
|---|---|---|
| Compressor fridge + small freezer | 80 W | 24 |
| LED interior lighting | 40 W | 6 |
| Laptop / Starlink | 60 W | 6 |
| Pressure water pump | 100 W | 1 |
| Induction cooktop (via inverter) | 1,500 W | 1 |
| TV / entertainment | 80 W | 4 |

## Prompt

> *"Design a 24V off-grid cabin system. Loads: fridge+freezer 80W 24/7, LED lights 40W for 6h, laptop and Starlink 60W for 6h, water pump 100W for 1h, induction cooktop at 1500W for 1h via inverter, TV 80W for 4h. Three days of autonomy, 80% DoD, using 200 Ah / 24V LiFePO4 batteries. Solar for year-round use in Northern Europe. Size the inverter for the cooktop with 25% headroom."*

## Tools Claude calls

1. `calculate_power_budget`
2. `calculate_battery_bank`
3. `calculate_solar_size`
4. `calculate_inverter_size`
5. `calculate_wire_gauge` (battery → inverter)

## Expected numbers

```
Daily energy:    4,440 Wh/day   (185 Ah/day @ 24V)
Peak load:       1,860 W        (77.5 A — cooktop dominates)

Required bank:  16,650 Wh / 693.75 Ah  (3 days × 80% DoD)
Recommended:     4 × 200 Ah / 24 V LiFePO4 in parallel (4P)
Total / usable:  800 Ah / 19,200 Wh → 15,360 Wh usable

Solar (Northern Europe, 2 PSH winter):
  Required:    2,220 W raw / 2,612 W adjusted
  Recommended: 7 × 400 W panels = 2,800 W
  (size for the worst month you intend to use the system)

Inverter:
  Continuous: 1,500 W → recommended 2,000 W (with 25% headroom)
  DC current at 24V (90% eff): 92.6 A
  → use calculate_wire_gauge for battery-to-inverter run

Battery → inverter, 1.5 m one-way at 92.6 A, 24V:
  Recommended: 35 mm² (2 AWG) — 110 A ampacity, 0.59% drop
  Fuse: 125 A ANL bolt-down
```

## Notes

- 24V keeps inverter DC current under 100A — a 12V system at the same load would need 185A and a much heavier cable.
- For year-round use in cloudy climates, plan a generator or fuel-cell backup; solar alone is undersized for December.
