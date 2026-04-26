# Live-aboard · heavy loads, AC galley

A 45 ft trawler or large catamaran lived on year-round. AC induction galley, watermaker, and the works. 24V house bank, 3 kW inverter, frequent shore power.

## Loads

| Load | Power | Hours/day |
|---|---|---|
| Fridge + freezer | 100 W | 24 |
| LED + cabin lighting | 60 W | 5 |
| Watermaker | 800 W | 2 |
| Induction cooktop | 1,800 W | 1.5 |
| Microwave | 1,000 W (1,800 W surge) | 0.3 |
| Coffee machine | 1,200 W | 0.2 |
| Laptops / phones (via inverter) | 100 W | 6 |
| Water pump | 100 W | 0.5 |
| Diesel heater electronics | 30 W | 6 |
| TV / entertainment | 80 W | 3 |

## Prompt

> *"Live-aboard 24V system. Loads: fridge+freezer 100W 24/7, LED 60W 5h/day, watermaker 800W 2h, induction cooktop 1800W 1.5h, microwave 1000W (1800W surge) 20 min, coffee 1200W 12 min, laptops 100W 6h, water pump 100W 30 min, diesel heater 30W 6h, TV 80W 3h. 1.5 days of autonomy, 80% DoD, 200 Ah / 24V LiFePO4 batteries. Inverter to handle worst-case AC load (cooktop + microwave concurrent). Wire gauge for the inverter run, 1m, 24V."*

## Tools Claude calls

1. `calculate_power_budget`
2. `calculate_battery_bank`
3. `calculate_inverter_size`
4. `calculate_wire_gauge`
5. `calculate_charging_time` (with shore power)

## Expected numbers

```
Daily energy:    8,610 Wh/day   (358.75 Ah/day @ 24V)
Peak load:       5,270 W        (220 A — all-on, never realistic)
Realistic peak:  ~2,000 W       (cooktop + lights + always-on)

Required bank:  16,144 Wh / 672.7 Ah  (1.5 days × 80% DoD)
Recommended:     4 × 200 Ah / 24 V LiFePO4 in parallel (4P)
Total / usable:  800 Ah / 19,200 Wh → 15,360 Wh usable

Inverter (cooktop 1,800 + microwave 1,000 = 2,800 W continuous,
          microwave surge adds 800 W = 3,600 W surge):
  Recommended:  3,500 W continuous, ≥ 3,600 W surge
  → 5,000 W class inverter for headroom
  DC current at 24V (90% eff): 231 A
  
Battery → inverter, 1m round-trip at 231 A, 24V:
  Recommended: 120 mm² (2/0 AWG) — 235 A ampacity, 0.29% drop
  Fuse: 300 A Class T

Charging from 20% → 100% via 80A shore charger:
  Bulk 6 h + absorption 4 h ≈ 10 h
```

## Notes

- The MCP flags the inverter DC current explicitly — at 231A continuous, cable runs need to be short and oversized.
- A 48V system would halve this to 116A and dramatically reduce cabling cost. Worth considering at this scale.
- Real live-aboard usage rarely runs everything at once; the calculator assumes peak-coincident, which over-sizes intentionally.
